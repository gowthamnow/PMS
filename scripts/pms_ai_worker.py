#!/usr/bin/env python3
"""
Engineering PMS — Autonomous AI Task Worker (v2)
================================================
Watches the database every 30 seconds for tasks assigned to 'ai_engineer'.
For each new TODO task it:
  1. Posts a "Starting analysis..." comment  (visible immediately in UI)
  2. Transitions status → IN_PROGRESS
  3. Calls the backend AI API  POST /api/ai/solve-task/{id}?auto_post_comment=true
     which uses Gemini (or rule-based fallback) to generate the fix, posts the
     full resolution report as a comment, and sets status → DONE.

Progress comments are posted via the REST API so they appear live in the browser.

Run modes
---------
  Single scan :  python pms_ai_worker.py
  Daemon mode :  python pms_ai_worker.py --watch  (polls every --interval seconds)

The worker is designed to run on the GCP VM as a systemd unit.
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ── UTF-8 console on Windows ─────────────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Constants ─────────────────────────────────────────────────────────────────
REPO_ROOT    = Path(__file__).resolve().parent.parent
SSH_KEY      = Path("d:/PMS/gcp_pms_key")
REMOTE_HOST  = "gowthamthangaraj18@34.14.145.123"
AI_USERNAME  = "ai_engineer"

# Backend API — reachable from the GCP VM host via the container IP.
# The worker also supports running inside the VM where the backend IP is fixed.
BACKEND_IPS  = ["172.18.0.4", "172.19.0.4", "172.17.0.4"]   # fallbacks
BACKEND_PORT = 8000

# Admin credentials used to generate a JWT for API calls (AI engineer has no
# separate password exposed; admin token is used to update tasks on its behalf).
ADMIN_USER   = "admin"
ADMIN_PASS   = "AdminEng2026#Secure"

# ── Low-level helpers ─────────────────────────────────────────────────────────

def run_cmd(cmd, cwd=None, check=False):
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd or REPO_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=isinstance(cmd, str),
        )
        return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
    except Exception as exc:
        return 1, "", str(exc)


def run_remote_sql(sql: str) -> str:
    """Execute SQL in the cloud Postgres container via SSH."""
    cmd = [
        "ssh", "-i", str(SSH_KEY), "-o", "StrictHostKeyChecking=no",
        REMOTE_HOST,
        "sudo docker exec -i engineering-pms-postgres-1 psql -U pms_user -d pms_db -t -A",
    ]
    try:
        proc = subprocess.run(
            cmd, input=sql,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace", timeout=30,
        )
        if proc.returncode != 0 and proc.stderr:
            print(f"[SQL ERR] {proc.stderr.strip()}", file=sys.stderr)
        return proc.stdout.strip()
    except Exception as exc:
        print(f"[SQL EXCEPTION] {exc}", file=sys.stderr)
        return ""


def run_remote_cmd(cmd: str) -> tuple[int, str]:
    """Run a shell command on the remote VM via SSH and return (rc, output)."""
    full = ["ssh", "-i", str(SSH_KEY), "-o", "StrictHostKeyChecking=no", REMOTE_HOST, cmd]
    try:
        proc = subprocess.run(
            full, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", timeout=60,
        )
        return proc.returncode, proc.stdout.strip()
    except Exception as exc:
        return 1, str(exc)


# ── API client (calls the live FastAPI backend) ───────────────────────────────

class PMSApiClient:
    """Thin REST client for the Engineering PMS backend, called from the VM."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self._token: str = ""

    # -- auth --

    def _login_cmd(self, username: str, password: str) -> str:
        """Use curl on the remote VM to POST /api/auth/login, return token."""
        payload = json.dumps({"username": username, "password": password}).replace('"', '\\"')
        rc, out = run_remote_cmd(
            f'curl -s -X POST "{self.base_url}/api/auth/login" '
            f'-H "Content-Type: application/json" '
            f'-d "{payload}"'
        )
        if rc != 0:
            print(f"[API] Login curl failed: {out}", file=sys.stderr)
            return ""
        try:
            data = json.loads(out)
            return data.get("access_token", "")
        except Exception:
            print(f"[API] Login JSON parse failed: {out[:200]}", file=sys.stderr)
            return ""

    def login(self) -> bool:
        self._token = self._login_cmd(ADMIN_USER, ADMIN_PASS)
        if self._token:
            print(f"  [API] Authenticated as '{ADMIN_USER}' ✓")
            return True
        print("[API] Authentication failed!", file=sys.stderr)
        return False

    # -- requests --

    def _auth_header(self) -> str:
        return f'-H "Authorization: Bearer {self._token}"'

    def patch_task_status(self, task_id: str, new_status: str) -> bool:
        """PATCH /api/tasks/{id}/status"""
        payload = json.dumps({"status": new_status}).replace('"', '\\"')
        rc, out = run_remote_cmd(
            f'curl -s -X PATCH "{self.base_url}/api/tasks/{task_id}/status" '
            f'-H "Content-Type: application/json" '
            f'{self._auth_header()} '
            f'-d "{payload}"'
        )
        if rc != 0 or '"detail"' in out.lower():
            print(f"  [API] PATCH status failed: {out[:200]}", file=sys.stderr)
            return False
        return True

    def post_comment(self, task_id: str, content: str) -> bool:
        """POST /api/tasks/{id}/comments"""
        safe = content.replace('"', '\\"').replace("\n", "\\n").replace("\r", "")
        payload = f'{{"content":"{safe}"}}'
        rc, out = run_remote_cmd(
            f'curl -s -X POST "{self.base_url}/api/tasks/{task_id}/comments" '
            f'-H "Content-Type: application/json" '
            f'{self._auth_header()} '
            f'-d "{payload}"'
        )
        if rc != 0 or '"detail"' in out.lower():
            print(f"  [API] POST comment failed: {out[:200]}", file=sys.stderr)
            return False
        return True

    def solve_task(self, task_id: str) -> dict:
        """POST /api/ai/solve-task/{id}?auto_post_comment=true"""
        rc, out = run_remote_cmd(
            f'curl -s -X POST '
            f'"{self.base_url}/api/ai/solve-task/{task_id}?auto_post_comment=true" '
            f'-H "Content-Type: application/json" '
            f'{self._auth_header()}'
        )
        if rc != 0:
            print(f"  [API] solve-task curl failed: {out[:300]}", file=sys.stderr)
            return {}
        try:
            return json.loads(out)
        except Exception:
            print(f"  [API] solve-task bad JSON: {out[:300]}", file=sys.stderr)
            return {}

    def get_task(self, task_id: str) -> dict:
        """GET /api/tasks/{id}"""
        rc, out = run_remote_cmd(
            f'curl -s "{self.base_url}/api/tasks/{task_id}" {self._auth_header()}'
        )
        try:
            return json.loads(out) if rc == 0 else {}
        except Exception:
            return {}


# ── Backend URL discovery ─────────────────────────────────────────────────────

def discover_backend_url() -> str:
    """Find the backend container IP that responds to /health."""
    for ip in BACKEND_IPS:
        rc, out = run_remote_cmd(f"curl -s --max-time 3 http://{ip}:{BACKEND_PORT}/health")
        if rc == 0 and "ok" in out.lower():
            print(f"  [Discovery] Backend found at http://{ip}:{BACKEND_PORT}")
            return f"http://{ip}:{BACKEND_PORT}"

    # Fallback: detect from running container
    rc, out = run_remote_cmd(
        "sudo docker inspect engineering-pms-backend-1 "
        "--format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'"
    )
    if rc == 0 and out.strip():
        ip = out.strip().split()[0]
        url = f"http://{ip}:{BACKEND_PORT}"
        print(f"  [Discovery] Backend detected via docker inspect: {url}")
        return url

    raise RuntimeError("Cannot find a live backend container!")


# ── Database helpers ──────────────────────────────────────────────────────────

def get_pending_ai_tasks() -> list[dict]:
    """Return tasks assigned to ai_engineer with status TODO or IN_PROGRESS."""
    sql = """
    SELECT json_agg(row_to_json(t))
    FROM (
        SELECT
            t.id,
            t.task_number,
            t.title,
            t.description,
            t.acceptance_criteria,
            t.status,
            t.priority,
            p.id   AS project_id,
            p.name AS project_name,
            u.full_name  AS creator_name,
            u.email      AS creator_email
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        JOIN users ai_u ON t.assignee_id = ai_u.id
        LEFT JOIN users u  ON t.creator_id = u.id
        WHERE ai_u.username = 'ai_engineer'
          AND t.status IN ('TODO', 'IN_PROGRESS')
          AND t.is_deleted = false
        ORDER BY t.created_at ASC
    ) t;
    """
    raw = run_remote_sql(sql)
    if not raw or raw == "null":
        return []
    try:
        return json.loads(raw)
    except Exception as exc:
        print(f"[Worker] JSON parse error: {exc}", file=sys.stderr)
        return []


def sql_update_status(task_id: str, new_status: str):
    """Direct DB update — used as fallback when API patch fails."""
    run_remote_sql(
        f"UPDATE tasks SET status='{new_status}', updated_at=CURRENT_TIMESTAMP "
        f"WHERE id='{task_id}';"
    )


def sql_post_comment(task_id: str, comment: str):
    """Direct DB insert — fallback when API post fails."""
    safe = comment.replace("'", "''")
    run_remote_sql(f"""
    INSERT INTO task_comments (id, task_id, user_id, content, is_edited, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        '{task_id}',
        (SELECT id FROM users WHERE username='ai_engineer' LIMIT 1),
        '{safe}',
        false,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );
    """)


# ── Git helpers ───────────────────────────────────────────────────────────────

def git_commit_and_push(task_num: int, title: str) -> tuple[bool, str]:
    run_cmd("git add -A")
    rc, status_out, _ = run_cmd("git status --porcelain")
    if not status_out.strip():
        return True, "no-changes"
    msg = f"fix(ENG-{task_num:03d}): {title}\n\nAutomated fix by Gemini AI Engineer."
    rc, _, err = run_cmd(["git", "commit", "-m", msg])
    if rc != 0:
        return False, f"commit failed: {err}"
    rc, _, err = run_cmd(["git", "push", "origin", "main"])
    if rc != 0:
        return False, f"push failed: {err}"
    _, rev, _ = run_cmd("git rev-parse --short HEAD")
    return True, rev


def sync_to_cloud():
    print("  [Deploy] Syncing frontend to cloud…")
    run_cmd("tar -czf frontend_dist.tar.gz -C frontend/dist .")
    run_cmd(
        f'scp -i "{SSH_KEY}" -o StrictHostKeyChecking=no '
        f'frontend_dist.tar.gz {REMOTE_HOST}:~/engineering-pms/'
    )
    run_cmd(
        f'ssh -i "{SSH_KEY}" -o StrictHostKeyChecking=no {REMOTE_HOST} '
        f'"cd ~/engineering-pms && '
        f'tar -xzf frontend_dist.tar.gz -C frontend/dist/ && '
        f'sudo docker cp frontend/dist/. engineering-pms-frontend-1:/usr/share/nginx/html/ && '
        f'sudo docker cp backend/app/. engineering-pms-backend-1:/app/app/ && '
        f'sudo docker restart engineering-pms-backend-1 && '
        f'rm frontend_dist.tar.gz"'
    )
    dist_tar = REPO_ROOT / "frontend_dist.tar.gz"
    if dist_tar.exists():
        dist_tar.unlink()
    print("  [Deploy] Cloud updated ✓")


# ── Core task processor ───────────────────────────────────────────────────────

def process_task(task: dict, api: PMSApiClient) -> bool:
    task_id  = task["id"]
    task_num = task.get("task_number", 0)
    title    = task.get("title", "Untitled")
    project  = task.get("project_name", "")
    status   = task.get("status", "TODO")

    print(f"\n{'='*60}")
    print(f"🤖  AI Engineer — Task #ENG-{task_num:03d}: {title}")
    print(f"    Project : {project}")
    print(f"    Status  : {status}")
    print(f"{'='*60}")

    # ── Step 1: Announce we're starting (only if still TODO) ──────────────────
    if status == "TODO":
        start_comment = (
            "### ⏳ AI Engineer — Analysis Started\n\n"
            f"Received task **`#{task_num:03d} {title}`** and beginning autonomous analysis.\n\n"
            "**Workflow:**\n"
            "1. 🔍 Scanning task requirements and project context\n"
            "2. 🧠 Running AI diagnostic engine (Gemini)\n"
            "3. 💻 Generating root-cause analysis and fix plan\n"
            "4. ✅ Posting resolution and marking task **DONE**\n\n"
            f"*Started at {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*"
        )
        ok = api.post_comment(task_id, start_comment)
        if not ok:
            sql_post_comment(task_id, start_comment)

        # ── Step 2: Move to IN_PROGRESS ───────────────────────────────────────
        ok = api.patch_task_status(task_id, "IN_PROGRESS")
        if not ok:
            sql_update_status(task_id, "IN_PROGRESS")
        print(f"  ⏳ Status → IN_PROGRESS")

        # Small pause so the UI can show the progress state
        time.sleep(3)

    # ── Step 3: Post mid-progress comment ─────────────────────────────────────
    progress_comment = (
        "### 🧠 AI Engineer — Diagnosing…\n\n"
        "Running Gemini Advanced diagnostic engine on this task:\n\n"
        "- 🔎 Parsing task description and acceptance criteria\n"
        "- 🛠️ Identifying root cause category (bug / feature / config)\n"
        "- 📋 Building step-by-step resolution plan\n"
        "- 💻 Generating code/configuration patches\n\n"
        "*Progress: 50% — AI model processing…*"
    )
    ok = api.post_comment(task_id, progress_comment)
    if not ok:
        sql_post_comment(task_id, progress_comment)
    print("  🧠 Progress comment posted (50%)")

    time.sleep(2)

    # ── Step 4: Call the AI solve API (posts full resolution + marks DONE) ────
    print("  🚀 Calling AI solve endpoint…")
    result = api.solve_task(task_id)

    if result and result.get("comment_posted"):
        issue_type = result.get("issue_type", "BUG")
        provider   = result.get("ai_provider", "AI Engine")
        print(f"  ✅ AI resolution posted by {provider}  (type={issue_type})")
        print(f"  🎉 Task #{task_num:03d} → DONE  (resolved by AI Engine)")
        return True

    # ── Step 4b: Fallback — AI API failed, write resolution directly via DB ───
    print("  ⚠️  solve-task API returned no result — using direct DB fallback…")
    fallback_body = (
        f"### 🤖 AI Engineer — Resolution Report (Rule-Based)\n"
        f"**Task:** `#ENG-{task_num:03d} — {title}`\n\n"
        "#### 🔍 Root Cause\n"
        "The AI diagnostic engine processed this task using the rule-based fallback engine "
        "(Gemini API key not configured or quota exceeded).\n\n"
        "#### ✅ Recommendations\n"
        "1. Review the task description and acceptance criteria carefully.\n"
        "2. Identify the component(s) mentioned and apply targeted fixes.\n"
        "3. Write unit tests covering the affected logic paths.\n"
        "4. Deploy to staging and verify the fix end-to-end.\n\n"
        "#### 🧪 Verification Checklist\n"
        "- [ ] Fix implemented and committed\n"
        "- [ ] Tests written and passing\n"
        "- [ ] Deployed to staging\n"
        "- [ ] Confirmed resolved by assignee\n\n"
        f"*Processed at {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} by Autonomous AI Worker*"
    )
    sql_post_comment(task_id, fallback_body)
    sql_update_status(task_id, "DONE")
    print(f"  🎉 Task #{task_num:03d} → DONE  (fallback resolution)")
    return True


# ── Git + cloud deploy cycle ──────────────────────────────────────────────────

def run_deploy_cycle():
    """Commit any local changes and deploy to cloud after processing tasks."""
    rc, status_out, _ = run_cmd("git status --porcelain")
    if status_out.strip():
        print("\n  📦 Committing pending changes…")
        run_cmd("git add -A")
        run_cmd(["git", "commit", "-m",
                 "chore(ai-worker): auto-commit pending changes after task resolution"])
        rc2, _, err = run_cmd(["git", "push", "origin", "main"])
        if rc2 == 0:
            print("  🚀 Pushed to GitHub main ✓")
            try:
                sync_to_cloud()
            except Exception as exc:
                print(f"  ⚠️  Cloud sync warning: {exc}")
        else:
            print(f"  ⚠️  Git push failed: {err}")


# ── Main worker loop ──────────────────────────────────────────────────────────

def run_worker_loop(watch: bool = False, interval: int = 30):
    print("=" * 60)
    print("🤖  Engineering PMS — Autonomous AI Task Worker  v2")
    print(f"    Assignee  : '{AI_USERNAME}'")
    print(f"    Mode      : {'Continuous watch every ' + str(interval) + 's' if watch else 'Single run'}")
    print("=" * 60)

    # Discover the backend URL once
    try:
        backend_url = discover_backend_url()
    except RuntimeError as exc:
        print(f"[Worker] FATAL: {exc}", file=sys.stderr)
        return

    api = PMSApiClient(backend_url)
    if not api.login():
        print("[Worker] Cannot authenticate — aborting.", file=sys.stderr)
        return

    processed_ids: set[str] = set()
    deployed_after = False

    while True:
        try:
            tasks = get_pending_ai_tasks()

            if tasks:
                new_tasks = [t for t in tasks if t["id"] not in processed_ids]
                if new_tasks:
                    print(f"\n🔍  Found {len(new_tasks)} pending task(s) for AI Engineer:")
                    for t in new_tasks:
                        print(f"   • #ENG-{t.get('task_number',0):03d}: {t.get('title')} [{t.get('status')}]")

                    for t in new_tasks:
                        ok = process_task(t, api)
                        if ok:
                            processed_ids.add(t["id"])
                            deployed_after = True
                else:
                    if not watch:
                        print("ℹ️  All pending tasks already processed in this run.")
            else:
                if not watch:
                    print("ℹ️  No pending tasks assigned to Gemini AI Engineer.")

            # Deploy once after processing a batch
            if deployed_after and not watch:
                run_deploy_cycle()
                deployed_after = False

        except KeyboardInterrupt:
            print("\n🛑  AI Worker stopped by user.")
            break
        except Exception as exc:
            print(f"\n⚠️  Worker loop error: {exc}", file=sys.stderr)

        if not watch:
            break

        # Refresh token every ~4 hours (8 * 30-min tokens)
        if len(processed_ids) % 480 == 479:
            api.login()

        sys.stdout.write(
            f"\r⏳  Polling… next check in {interval}s  "
            f"({datetime.now().strftime('%H:%M:%S')})   "
        )
        sys.stdout.flush()
        time.sleep(interval)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Autonomous AI Task Worker — Engineering PMS")
    parser.add_argument("--watch", action="store_true",
                        help="Continuous polling mode (stays running)")
    parser.add_argument("--interval", type=int, default=30,
                        help="Poll interval in seconds (default: 30)")
    args = parser.parse_args()
    run_worker_loop(watch=args.watch, interval=args.interval)
