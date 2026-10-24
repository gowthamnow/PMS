import logging
import os
from pathlib import Path
import re
import subprocess
import time
from typing import Any, Dict, List, Optional, Tuple
import httpx

from app.config import settings

logger = logging.getLogger("ai_tools")

# Root directory of the repository (anchored safely)
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class ToolSecurityError(Exception):
    """Raised when a tool call violates security or boundary policies."""
    pass


def resolve_safe_path(rel_path: str, base_dir: Optional[Path] = None) -> Path:
    """
    Ensures that a target path resides strictly inside the authorized repository base directory,
    neutralizing any directory traversal attempts (e.g. `../../etc/passwd`).
    """
    root = (base_dir or REPO_ROOT).resolve()
    clean_rel = rel_path.strip().lstrip("/\\")
    target = (root / clean_rel).resolve()

    try:
        target.relative_to(root)
    except ValueError:
        raise ToolSecurityError(f"Access Denied: Path '{rel_path}' escapes authorized workspace root '{root}'")

    # Block access to sensitive files
    blocked_patterns = [r"\.git/", r"gcp_pms_key", r"\.env", r"node_modules/"]
    target_posix = target.as_posix()
    for bp in blocked_patterns:
        if re.search(bp, target_posix, re.IGNORECASE) and not clean_rel.startswith(".git/"):
            if "key" in clean_rel.lower() or ".env" in clean_rel.lower():
                raise ToolSecurityError(f"Access Denied: File '{clean_rel}' is restricted by security policy")

    return target


class AIToolExecutionLayer:
    """
    Controlled tool execution interface for autonomous AI agents.
    All operations are strictly bounded to the workspace with allowlisted actions.
    """

    def __init__(self, workspace_dir: Optional[Path] = None, github_token: Optional[str] = None):
        self.workspace_dir = (workspace_dir or REPO_ROOT).resolve()
        self.github_token = github_token

    def inspect_repository(self, rel_path: str = "", max_depth: int = 3) -> Dict[str, Any]:
        """
        Inspects directory tree within the allowed workspace up to max_depth.
        """
        target_dir = resolve_safe_path(rel_path, self.workspace_dir)
        if not target_dir.exists() or not target_dir.is_dir():
            return {"error": f"Directory '{rel_path}' does not exist"}

        tree: List[Dict[str, Any]] = []
        skip_dirs = {".git", "node_modules", ".venv", "__pycache__", "dist", ".gemini"}

        def walk(current: Path, depth: int):
            if depth > max_depth:
                return
            try:
                for entry in sorted(current.iterdir(), key=lambda p: (not p.is_dir(), p.name)):
                    if entry.name in skip_dirs or entry.name.startswith("."):
                        continue
                    item = {
                        "name": entry.name,
                        "path": entry.relative_to(self.workspace_dir).as_posix(),
                        "is_dir": entry.is_dir(),
                    }
                    if not entry.is_dir():
                        item["size_bytes"] = entry.stat().st_size
                    tree.append(item)
                    if entry.is_dir():
                        walk(entry, depth + 1)
            except PermissionError:
                pass

        walk(target_dir, 1)
        return {"root": target_dir.relative_to(self.workspace_dir).as_posix(), "items_count": len(tree), "items": tree[:200]}

    def search_code(self, query: str, file_pattern: str = "*", max_matches: int = 25) -> List[Dict[str, Any]]:
        """
        Searches for text or symbols inside repository files.
        """
        if not query or len(query.strip()) < 2:
            return []

        matches = []
        skip_dirs = {".git", "node_modules", ".venv", "__pycache__", "dist", ".gemini"}

        for path in self.workspace_dir.rglob(file_pattern):
            if any(part in skip_dirs for part in path.parts):
                continue
            if not path.is_file():
                continue
            if path.stat().st_size > 1_000_000:  # Skip files > 1MB
                continue

            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
                if query.lower() in content.lower():
                    lines = content.splitlines()
                    for idx, line in enumerate(lines):
                        if query.lower() in line.lower():
                            matches.append({
                                "file_path": path.relative_to(self.workspace_dir).as_posix(),
                                "line_number": idx + 1,
                                "line_content": line.strip()[:180],
                            })
                            if len(matches) >= max_matches:
                                return matches
            except Exception:
                continue

        return matches

    def read_source_file(self, rel_path: str, start_line: int = 1, end_line: Optional[int] = None) -> Dict[str, Any]:
        """
        Reads source code file safely with optional line bounds.
        """
        target = resolve_safe_path(rel_path, self.workspace_dir)
        if not target.exists() or not target.is_file():
            return {"error": f"File '{rel_path}' not found"}

        try:
            content = target.read_text(encoding="utf-8", errors="replace")
            lines = content.splitlines()
            total_lines = len(lines)

            s = max(1, start_line)
            e = min(total_lines, end_line if end_line is not None else total_lines)
            selected_lines = lines[s - 1:e]

            return {
                "file_path": rel_path,
                "total_lines": total_lines,
                "start_line": s,
                "end_line": e,
                "content": "\n".join(selected_lines),
            }
        except Exception as exc:
            return {"error": f"Failed to read '{rel_path}': {str(exc)}"}

    def create_or_update_file(self, rel_path: str, content: str) -> Dict[str, Any]:
        """
        Creates or updates a file safely within the workspace boundary.
        """
        target = resolve_safe_path(rel_path, self.workspace_dir)
        target.parent.mkdir(parents=True, exist_ok=True)

        try:
            target.write_text(content, encoding="utf-8")
            return {
                "file_path": rel_path,
                "bytes_written": len(content.encode("utf-8")),
                "status": "SUCCESS",
            }
        except Exception as exc:
            return {"error": f"Failed to write '{rel_path}': {str(exc)}"}

    def inspect_git_diff(self) -> str:
        """
        Returns unified diff of all uncommitted working tree changes.
        """
        try:
            proc = subprocess.run(
                ["git", "diff", "HEAD"],
                cwd=self.workspace_dir,
                capture_output=True,
                text=True,
                timeout=15,
            )
            return proc.stdout.strip() or "No uncommitted modifications in workspace."
        except Exception as exc:
            return f"Git diff error: {str(exc)}"

    def get_git_status(self) -> Dict[str, Any]:
        """
        Returns structured git status of the workspace.
        """
        try:
            proc = subprocess.run(
                ["git", "status", "--porcelain", "-b"],
                cwd=self.workspace_dir,
                capture_output=True,
                text=True,
                timeout=10,
            )
            lines = proc.stdout.strip().splitlines()
            branch = lines[0] if lines else "unknown"
            modified = [l for l in lines[1:] if l.strip()]
            return {
                "branch_header": branch,
                "modified_files_count": len(modified),
                "modified_files": modified[:50],
            }
        except Exception as exc:
            return {"error": str(exc)}

    def run_approved_check(self, check_type: str) -> Dict[str, Any]:
        """
        Executes an approved, allowlisted build/test verification command.
        Strict allowlist prevents command injection.
        """
        ALLOWED_CHECKS = {
            "frontend_build": {
                "cmd": ["npm", "run", "build"],
                "cwd": self.workspace_dir / "frontend",
                "timeout": 90,
            },
            "frontend_typecheck": {
                "cmd": ["npx", "tsc", "--noEmit"],
                "cwd": self.workspace_dir / "frontend",
                "timeout": 60,
            },
            "backend_syntax": {
                "cmd": ["python", "-m", "py_compile", "backend/app/main.py"],
                "cwd": self.workspace_dir,
                "timeout": 30,
            },
            "backend_pytest": {
                "cmd": ["python", "-m", "pytest", "tests/"],
                "cwd": self.workspace_dir / "backend",
                "timeout": 90,
            },
        }

        if check_type not in ALLOWED_CHECKS:
            return {
                "is_success": False,
                "exit_code": 1,
                "output": f"Check type '{check_type}' is not in the authorized safety allowlist: {list(ALLOWED_CHECKS.keys())}",
            }

        cfg = ALLOWED_CHECKS[check_type]
        start_t = time.time()
        try:
            # On Windows shell=True needed for npm/npx
            is_win = os.name == "nt"
            proc = subprocess.run(
                cfg["cmd"],
                cwd=cfg["cwd"],
                capture_output=True,
                text=True,
                timeout=cfg["timeout"],
                shell=is_win,
            )
            duration = round(time.time() - start_t, 2)
            stdout = proc.stdout.strip()
            stderr = proc.stderr.strip()
            combined = (stdout + "\n" + stderr).strip()

            return {
                "check_type": check_type,
                "is_success": proc.returncode == 0,
                "exit_code": proc.returncode,
                "duration_seconds": duration,
                "output": combined[-3000:] if len(combined) > 3000 else combined,
            }
        except subprocess.TimeoutExpired:
            return {
                "check_type": check_type,
                "is_success": False,
                "exit_code": 124,
                "duration_seconds": cfg["timeout"],
                "output": f"Execution timed out after {cfg['timeout']}s",
            }
        except Exception as exc:
            return {
                "check_type": check_type,
                "is_success": False,
                "exit_code": 1,
                "output": f"Failed to execute check: {str(exc)}",
            }

    def create_task_branch(self, branch_name: str, base_branch: str = "main") -> Dict[str, Any]:
        """
        Creates a clean task branch (ai/task-...) off the base branch.
        """
        # Sanitize branch name
        clean_branch = re.sub(r"[^a-zA-Z0-9_\-\./]", "", branch_name).strip("/")
        if not clean_branch.startswith("ai/"):
            clean_branch = f"ai/{clean_branch}"

        try:
            # Checkout base
            subprocess.run(["git", "checkout", base_branch], cwd=self.workspace_dir, capture_output=True, timeout=15)
            # Create/checkout new branch
            proc = subprocess.run(
                ["git", "checkout", "-B", clean_branch],
                cwd=self.workspace_dir,
                capture_output=True,
                text=True,
                timeout=15,
            )
            return {
                "branch_name": clean_branch,
                "base_branch": base_branch,
                "is_success": proc.returncode == 0,
                "message": proc.stdout.strip() or proc.stderr.strip(),
            }
        except Exception as exc:
            return {"branch_name": clean_branch, "is_success": False, "error": str(exc)}

    def commit_changes(self, commit_message: str, author_name: str = "Gemini AI Engineer", author_email: str = "ai.engineer@pms.internal") -> Dict[str, Any]:
        """
        Stages modified files and creates a signed/authored git commit.
        """
        try:
            subprocess.run(["git", "add", "-A"], cwd=self.workspace_dir, capture_output=True, timeout=15)
            # Verify status
            s_proc = subprocess.run(["git", "status", "--porcelain"], cwd=self.workspace_dir, capture_output=True, text=True, timeout=10)
            if not s_proc.stdout.strip():
                return {"is_success": True, "message": "No file changes detected to commit"}

            env = os.environ.copy()
            env["GIT_AUTHOR_NAME"] = author_name
            env["GIT_AUTHOR_EMAIL"] = author_email
            env["GIT_COMMITTER_NAME"] = author_name
            env["GIT_COMMITTER_EMAIL"] = author_email

            c_proc = subprocess.run(
                ["git", "commit", "-m", commit_message],
                cwd=self.workspace_dir,
                env=env,
                capture_output=True,
                text=True,
                timeout=20,
            )
            # Get latest SHA
            h_proc = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.workspace_dir, capture_output=True, text=True, timeout=10)
            commit_sha = h_proc.stdout.strip()

            return {
                "is_success": c_proc.returncode == 0,
                "commit_sha": commit_sha,
                "message": c_proc.stdout.strip() or c_proc.stderr.strip(),
            }
        except Exception as exc:
            return {"is_success": False, "error": str(exc)}

    def push_task_branch(self, branch_name: str, remote: str = "origin") -> Dict[str, Any]:
        """
        Pushes the task branch to GitHub remote. Never pushes directly to main with force!
        """
        if branch_name in ("main", "master", "production"):
            return {"is_success": False, "error": "Safety Block: Autonomous AI cannot push directly to protected branch"}

        try:
            proc = subprocess.run(
                ["git", "push", remote, branch_name, "--set-upstream"],
                cwd=self.workspace_dir,
                capture_output=True,
                text=True,
                timeout=30,
            )
            return {
                "is_success": proc.returncode == 0,
                "branch_name": branch_name,
                "remote": remote,
                "message": proc.stdout.strip() or proc.stderr.strip(),
            }
        except Exception as exc:
            return {"is_success": False, "error": str(exc)}

    async def create_github_pull_request(
        self,
        repo: str,
        title: str,
        body: str,
        head_branch: str,
        base_branch: str = "main",
    ) -> Dict[str, Any]:
        """
        Opens a GitHub Pull Request via the official GitHub REST API if a token is configured.
        Otherwise records the task branch as ready for review.
        """
        token = self.github_token or getattr(settings, "GITHUB_TOKEN", None)
        if not token:
            logger.info("No GitHub token configured. Recording Pull Request as branch-ready.")
            return {
                "is_success": True,
                "pr_number": None,
                "pr_url": f"https://github.com/{repo}/compare/{base_branch}...{head_branch}?expand=1",
                "status": "BRANCH_READY_FOR_PR",
                "message": "Task branch pushed. Ready to open PR with 1-click URL.",
            }

        url = f"https://api.github.com/repos/{repo}/pulls"
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        payload = {
            "title": title,
            "body": body,
            "head": head_branch,
            "base": base_branch,
            "draft": False,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code in (200, 201):
                    data = res.json()
                    return {
                        "is_success": True,
                        "pr_number": data.get("number"),
                        "pr_url": data.get("html_url"),
                        "status": "OPEN",
                    }
                else:
                    return {
                        "is_success": False,
                        "status_code": res.status_code,
                        "error": res.text[:300],
                        "pr_url": f"https://github.com/{repo}/compare/{base_branch}...{head_branch}?expand=1",
                    }
        except Exception as exc:
            return {
                "is_success": False,
                "error": str(exc),
                "pr_url": f"https://github.com/{repo}/compare/{base_branch}...{head_branch}?expand=1",
            }
