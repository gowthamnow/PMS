#!/usr/bin/env python3
"""
Engineering PMS - Automated Live End-to-End API & Security Verification Suite
Target: http://localhost:8080 (or specified via PMS_BASE_URL env)
Uses ONLY Python standard library (no third-party dependencies required).
"""

from datetime import date
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = os.getenv("PMS_BASE_URL", "http://localhost:8080").rstrip("/")
ADMIN_USER = os.getenv("FIRST_ADMIN_USERNAME", "admin")
ADMIN_PASS = os.getenv("FIRST_ADMIN_PASSWORD", "AdminEng2026#Secure")


class TestRunner:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.passed = 0
        self.failed = 0
        self.results = []

    def request(
        self,
        method: str,
        path: str,
        data: dict = None,
        headers: dict = None,
        raw_body: bytes = None,
        content_type: str = "application/json",
    ):
        url = f"{self.base_url}{path}"
        req_headers = {}
        if headers:
            req_headers.update(headers)

        body_bytes = None
        if raw_body is not None:
            body_bytes = raw_body
            if "Content-Type" not in req_headers:
                req_headers["Content-Type"] = content_type
        elif data is not None:
            body_bytes = json.dumps(data).encode("utf-8")
            if "Content-Type" not in req_headers:
                req_headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=body_bytes, headers=req_headers, method=method)

        status_code = None
        response_body = ""
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                status_code = resp.status
                response_body = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            status_code = e.code
            response_body = e.read().decode("utf-8", errors="replace")
        except Exception as e:
            status_code = 0
            response_body = str(e)

        parsed_json = None
        try:
            parsed_json = json.loads(response_body)
        except Exception:
            pass

        return status_code, parsed_json, response_body

    def record(self, name: str, success: bool, status_code: int, detail: str):
        outcome = "PASS" if success else "FAIL"
        if success:
            self.passed += 1
            print(f"  [{outcome}] {name} (HTTP {status_code}): {detail}")
        else:
            self.failed += 1
            print(f"  [{outcome}] {name} (HTTP {status_code}): {detail}")
        self.results.append({
            "test": name,
            "status": outcome,
            "http_code": status_code,
            "detail": detail,
        })


def run_all_tests():
    print("=" * 72)
    print(f" Engineering PMS Live Verification Suite")
    print(f" Target: {BASE_URL}")
    print("=" * 72)

    runner = TestRunner(BASE_URL)

    # 1. GET /health
    print("\n[1] Testing GET /health...")
    code, data, raw = runner.request("GET", "/health")
    ok = code == 200 and data and data.get("status") == "ok"
    runner.record("GET /health", ok, code, f"Status={data.get('status') if data else 'None'}, Version={data.get('version') if data else 'None'}")

    # 2. POST /api/auth/login
    print("\n[2] Testing POST /api/auth/login...")
    code, data, raw = runner.request("POST", "/api/auth/login", data={"username": ADMIN_USER, "password": ADMIN_PASS})
    admin_token = data.get("access_token") if data else None
    ok = code == 200 and bool(admin_token)
    runner.record("POST /api/auth/login", ok, code, f"Obtained access_token: {admin_token[:20]}..." if admin_token else f"Failed: {raw}")

    if not admin_token:
        print("\nERROR: Cannot proceed without admin authentication.")
        return runner

    auth_header = {"Authorization": f"Bearer {admin_token}"}

    # 3. GET /api/auth/me
    print("\n[3] Testing GET /api/auth/me...")
    code, data, raw = runner.request("GET", "/api/auth/me", headers=auth_header)
    ok = code == 200 and data and data.get("username") == ADMIN_USER
    runner.record("GET /api/auth/me", ok, code, f"User={data.get('username') if data else 'None'}, Role={data.get('role') if data else 'None'}")

    # 4. POST /api/projects
    print("\n[4] Testing POST /api/projects ('Smart Meter Firmware v2')...")
    code, data, raw = runner.request(
        "POST",
        "/api/projects",
        headers=auth_header,
        data={
            "name": "Smart Meter Firmware v2",
            "description": "Next-gen embedded firmware with DLMS/COSEM support",
            "objectives": "Hardware SPI driver, low power mode, secure element",
            "status": "ACTIVE",
            "priority": "HIGH",
        },
    )
    project_id = data.get("id") if data else None
    ok = code == 200 and bool(project_id)
    runner.record("POST /api/projects", ok, code, f"Created Project ID={project_id}")

    if not project_id:
        print("\nERROR: Cannot proceed without active project.")
        return runner

    # 5. POST /api/tasks
    print("\n[5] Testing POST /api/tasks ('Design SPI bus driver')...")
    code, data, raw = runner.request(
        "POST",
        "/api/tasks",
        headers=auth_header,
        data={
            "project_id": project_id,
            "title": "Design SPI bus driver",
            "description": "Implement DMA-based high-speed SPI driver",
            "acceptance_criteria": "Pass loopback benchmark at 25MHz with 0% packet loss",
            "status": "TODO",
            "priority": "HIGH",
            "estimated_hours": 6.0,
        },
    )
    task_id = data.get("id") if data else None
    task_number = data.get("task_number") if data else None
    ok = code == 200 and bool(task_id)
    runner.record("POST /api/tasks", ok, code, f"Created Task #{task_number} (ID={task_id})")

    # 6. PATCH /api/tasks/{id}/status (TODO -> IN_PROGRESS -> DONE)
    print("\n[6] Testing PATCH /api/tasks/{id}/status transitions...")
    code_in_prog, data_in_prog, _ = runner.request(
        "PATCH",
        f"/api/tasks/{task_id}/status",
        headers=auth_header,
        data={"status": "IN_PROGRESS"},
    )
    ok_in_prog = code_in_prog == 200 and data_in_prog and data_in_prog.get("status") == "IN_PROGRESS"
    runner.record("PATCH /api/tasks/status (IN_PROGRESS)", ok_in_prog, code_in_prog, f"Status={data_in_prog.get('status') if data_in_prog else 'None'}")

    code_done, data_done, _ = runner.request(
        "PATCH",
        f"/api/tasks/{task_id}/status",
        headers=auth_header,
        data={"status": "DONE"},
    )
    ok_done = code_done == 200 and data_done and data_done.get("status") == "DONE" and bool(data_done.get("completed_at"))
    runner.record("PATCH /api/tasks/status (DONE)", ok_done, code_done, f"Status=DONE, completed_at={data_done.get('completed_at') if data_done else 'None'}")

    # 7. POST /api/time-entries
    print("\n[7] Testing POST /api/time-entries (4.5 hours)...")
    today_str = str(date.today())
    code, data, raw = runner.request(
        "POST",
        "/api/time-entries",
        headers=auth_header,
        data={
            "project_id": project_id,
            "task_id": task_id,
            "work_date": today_str,
            "duration_hours": 4.5,
            "description": "Hardware bench verification and logic analyzer capture",
        },
    )
    ok = code == 200 and data and float(data.get("duration_hours", 0)) == 4.5
    runner.record("POST /api/time-entries", ok, code, f"Logged hours: {data.get('duration_hours') if data else 'None'}")

    # 8. GET /api/dashboard/stats
    print("\n[8] Testing GET /api/dashboard/stats...")
    code, data, raw = runner.request("GET", "/api/dashboard/stats", headers=auth_header)
    ok = (
        code == 200
        and data
        and data.get("total_projects", 0) >= 1
        and data.get("tasks_by_status", {}).get("DONE", 0) >= 1
        and data.get("hours_logged_this_week", 0) >= 4.5
    )
    runner.record(
        "GET /api/dashboard/stats",
        ok,
        code,
        f"Projects={data.get('total_projects') if data else '?'}, DoneTasks={data.get('tasks_by_status', {}).get('DONE') if data else '?'}, Hours={data.get('hours_logged_this_week') if data else '?'}",
    )

    # 9. GET /api/reports/project-progress
    print("\n[9] Testing GET /api/reports/project-progress...")
    code, data, raw = runner.request("GET", "/api/reports/project-progress", headers=auth_header)
    match_proj = next((p for p in data if p.get("project_id") == project_id), None) if isinstance(data, list) else None
    ok = code == 200 and match_proj and match_proj.get("progress_percentage") == 100.0
    runner.record(
        "GET /api/reports/project-progress",
        ok,
        code,
        f"Project '{match_proj.get('project_name') if match_proj else '?'}' Progress={match_proj.get('progress_percentage') if match_proj else '?'}%",
    )

    # 10. GET /api/admin/system-info
    print("\n[10] Testing GET /api/admin/system-info...")
    code, data, raw = runner.request("GET", "/api/admin/system-info", headers=auth_header)
    ok = code == 200 and data and data.get("database") == "connected" and "storage_quota_bytes" in data
    runner.record(
        "GET /api/admin/system-info",
        ok,
        code,
        f"DB={data.get('database') if data else '?'}, StorageUsed={data.get('storage_used_bytes') if data else '?'}B / {data.get('storage_quota_gb') if data else '?'}GB",
    )

    # --------------------------------------------------------------------------
    # Security Tests
    # --------------------------------------------------------------------------
    print("\n" + "=" * 72)
    print(" Executing Security Verifications")
    print("=" * 72)

    # Security 1: Unauthenticated access returns HTTP 401
    print("\n[Sec 1] Unauthenticated request to /api/projects...")
    code, _, _ = runner.request("GET", "/api/projects")
    ok = code == 401
    runner.record("Security: Unauthenticated rejection", ok, code, "Correctly rejected with HTTP 401")

    # Security 2: Role escalation prevention
    print("\n[Sec 2] Role escalation prevention (Engineer -> Admin endpoint)...")
    eng_username = f"eng_{int(time.time())}"
    eng_pass = "EngSecurePass2026!"
    code_create, data_create, _ = runner.request(
        "POST",
        "/api/users",
        headers=auth_header,
        data={
            "username": eng_username,
            "email": f"{eng_username}@smartmeter.local",
            "full_name": "Test Engineer",
            "role": "ENGINEER",
            "password": eng_pass,
        },
    )
    if code_create == 200:
        _, data_eng_login, _ = runner.request("POST", "/api/auth/login", data={"username": eng_username, "password": eng_pass})
        eng_token = data_eng_login.get("access_token") if data_eng_login else None
        if eng_token:
            code_hack, _, _ = runner.request(
                "POST",
                "/api/users",
                headers={"Authorization": f"Bearer {eng_token}"},
                data={
                    "username": "hacker_admin",
                    "email": "hacker@test.local",
                    "full_name": "Hacker",
                    "role": "ADMIN",
                    "password": "HackerPassword123!",
                },
            )
            ok = code_hack == 403
            runner.record("Security: Role escalation blocked", ok, code_hack, "Engineer blocked from creating users (HTTP 403)")
        else:
            runner.record("Security: Role escalation", False, 0, "Engineer login failed")
    else:
        runner.record("Security: Role escalation", False, code_create, "Failed to create test engineer")

    # Security 3: 25MB attachment limit returns HTTP 413
    print("\n[Sec 3] Attachment 25MB Limit Check...")
    boundary = "----WebKitFormBoundaryPMSVerification2026"
    large_payload_size = 26 * 1024 * 1024 + 1024  # 26MB+
    # Construct multipart request with large file
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="project_id"\r\n\r\n'
        f"{project_id}\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="oversized_dump.bin"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode("utf-8")
    tail = f"\r\n--{boundary}--\r\n".encode("utf-8")
    oversized_data = head + (b"X" * large_payload_size) + tail

    code, _, _ = runner.request(
        "POST",
        "/api/attachments",
        headers={
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        raw_body=oversized_data,
    )
    ok = code == 413
    runner.record("Security: File size limit (25MB)", ok, code, "Upload > 25MB rejected with HTTP 413 Payload Too Large")

    # Security 4: Rate Limiting on /api/auth/login
    print("\n[Sec 4] Rate Limiting on /api/auth/login...")
    hit_429 = False
    for i in range(8):
        c, _, _ = runner.request("POST", "/api/auth/login", data={"username": ADMIN_USER, "password": "WrongPasswordAttempt!"})
        if c == 429:
            hit_429 = True
            break
    runner.record("Security: Rate limiting (5/min)", hit_429, 429 if hit_429 else c, "Brute force attack throttled with HTTP 429 Too Many Requests" if hit_429 else "Did not receive HTTP 429")

    print("\n" + "=" * 72)
    print(f" Summary: {runner.passed} Passed, {runner.failed} Failed (Total: {len(runner.results)})")
    print("=" * 72)
    return runner


if __name__ == "__main__":
    runner = run_all_tests()
    sys.exit(0 if runner.failed == 0 else 1)
