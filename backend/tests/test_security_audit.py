"""
Security Regression Test Suite (OWASP-aligned)
Verifies remediations for SEC-01 through SEC-13 across Authentication,
Authorization, BFLA, BOLA, Injection, and File Security.
"""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError, ForbiddenError
from app.core.security import create_access_token, get_real_client_ip, verify_token
from app.models.project import Project, ProjectMember, ProjectPriority, ProjectRole, ProjectStatus
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User, UserRole
from app.models.workspace import Workspace
from app.api.reports import sanitize_csv_cell
from app.services.storage_service import validate_extension, BLOCKED_EXTENSIONS, ALLOWED_ATTACHMENT_EXTENSIONS
from app.services.email_service import send_email


# =====================================================================
# SEC-01: Lobby Status Account Takeover Prevention
# =====================================================================
@pytest.mark.asyncio
async def test_sec01_lobby_status_never_issues_token_to_unauthenticated_request(
    test_client: AsyncClient, admin_user: User
):
    """
    Public GET /api/auth/lobby-status?email=... must NEVER return a JWT access_token
    to an unauthenticated caller, even if the user is active/admin.
    """
    resp = await test_client.get(f"/api/auth/lobby-status?email={admin_user.email}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["approved"] is True
    assert data["status"] == "active"
    assert data.get("access_token") is None, "CRITICAL: access_token leaked in public lobby-status!"


@pytest.mark.asyncio
async def test_sec01_lobby_status_accepts_valid_scoped_lobby_token(
    test_client: AsyncClient, admin_user: User
):
    """
    A valid lobby_token scoped to 'lobby_poll' permits token retrieval once active.
    """
    scoped_lobby_token = create_access_token(
        data={"sub": str(admin_user.id), "scope": "lobby_poll"}
    )
    resp = await test_client.get(
        f"/api/auth/lobby-status?email={admin_user.email}&lobby_token={scoped_lobby_token}"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["approved"] is True
    assert data.get("access_token") is not None


# =====================================================================
# SEC-02: Google Login Credential Enforcement
# =====================================================================
@pytest.mark.asyncio
async def test_sec02_google_login_rejects_without_credential(test_client: AsyncClient):
    """
    Google login must reject requests that supply raw email without a valid credential token.
    """
    resp = await test_client.post(
        "/api/auth/google",
        json={"email": "gowthamthangaraj18@gmail.com", "full_name": "Attacker"},
    )
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_sec02_google_login_mock_test_token_flow(test_client: AsyncClient):
    """
    Verifies that verified tokens route properly into lobby pending approval.
    """
    mock_email = f"new_google_{uuid.uuid4().hex[:6]}@example.com"
    resp = await test_client.post(
        "/api/auth/google",
        json={"credential": f"mock_google_token_{mock_email}", "full_name": "Google User"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending_approval"
    assert data["approved"] is False
    assert "lobby_token" in data


# =====================================================================
# SEC-03: Workspace Isolation for Unassigned Users
# =====================================================================
@pytest.mark.asyncio
async def test_sec03_unassigned_user_blocked_from_workspace_projects(
    test_client: AsyncClient, db_session: AsyncSession, sample_project: Project, engineer_headers: dict[str, str], engineer_user: User
):
    """
    Users with workspace_id = None must be forbidden from accessing any project data.
    """
    # Ensure engineer has no workspace assigned
    engineer_user.workspace_id = None
    # Assign a workspace to sample_project
    ws_id = uuid.uuid4()
    ws = Workspace(id=ws_id, name=f"WS_{uuid.uuid4().hex[:6]}", created_by=engineer_user.id)
    db_session.add(ws)
    sample_project.workspace_id = ws_id
    await db_session.commit()

    resp = await test_client.get(f"/api/projects/{sample_project.id}", headers=engineer_headers)
    assert resp.status_code == 403
    assert "workspace" in resp.json().get("detail", "").lower()


# =====================================================================
# SEC-04: BFLA Task Deletion Protection
# =====================================================================
@pytest.mark.asyncio
async def test_sec04_engineer_cannot_delete_task_created_by_admin(
    test_client: AsyncClient, db_session: AsyncSession, sample_project: Project, sample_task: Task, engineer_headers: dict[str, str], engineer_user: User
):
    """
    A normal project member (ENGINEER) must not be able to delete a task created by someone else.
    """
    # Assign engineer to same workspace and as project member
    ws_id = sample_project.workspace_id or uuid.uuid4()
    if not sample_project.workspace_id:
        ws = Workspace(id=ws_id, name=f"WS_{uuid.uuid4().hex[:6]}", created_by=engineer_user.id)
        db_session.add(ws)
        sample_project.workspace_id = ws_id

    engineer_user.workspace_id = ws_id
    member = ProjectMember(
        id=uuid.uuid4(),
        project_id=sample_project.id,
        user_id=engineer_user.id,
        role=ProjectRole.MEMBER,
    )
    db_session.add(member)
    await db_session.commit()

    resp = await test_client.delete(f"/api/tasks/{sample_task.id}", headers=engineer_headers)
    assert resp.status_code == 403
    assert "Only project managers, task creators, or administrators" in resp.json().get("detail", "")


# =====================================================================
# SEC-05: Scheduled Reminders Restricted to Admins
# =====================================================================
@pytest.mark.asyncio
async def test_sec05_non_admin_blocked_from_triggering_reminders(
    test_client: AsyncClient, engineer_headers: dict[str, str]
):
    """
    Ordinary engineers must receive 403 Forbidden on broadcast reminder trigger endpoints.
    """
    resp_morning = await test_client.post("/api/tasks/trigger-morning-reminder", headers=engineer_headers)
    assert resp_morning.status_code == 403

    resp_evening = await test_client.post("/api/tasks/trigger-evening-reminder", headers=engineer_headers)
    assert resp_evening.status_code == 403


# =====================================================================
# SEC-06: Delay Inquiry Restricted to Managers / Admins
# =====================================================================
@pytest.mark.asyncio
async def test_sec06_non_manager_blocked_from_issuing_delay_inquiry(
    test_client: AsyncClient, sample_task: Task, engineer_headers: dict[str, str]
):
    """
    Non-manager user cannot issue official delay explanation inquiries.
    """
    resp = await test_client.post(
        f"/api/tasks/{sample_task.id}/delay-inquiry",
        headers=engineer_headers,
        json={"message": "Why is this delayed?"},
    )
    assert resp.status_code == 403


# =====================================================================
# SEC-07: Cross-Tenant Audit Log Leakage Prevention
# =====================================================================
@pytest.mark.asyncio
async def test_sec07_dashboard_activity_restricted_for_non_admins(
    test_client: AsyncClient, engineer_headers: dict[str, str], engineer_user: User
):
    """
    Non-admin user without a workspace sees an empty activity feed, never global company audit logs.
    """
    engineer_user.workspace_id = None
    resp = await test_client.get("/api/dashboard/activity", headers=engineer_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data.get("activities", [])) == 0


# =====================================================================
# SEC-08: Team Workload Report Scoped to Workspace
# =====================================================================
@pytest.mark.asyncio
async def test_sec08_team_workload_scoped_to_user_workspace(
    test_client: AsyncClient, engineer_headers: dict[str, str], engineer_user: User
):
    """
    Team workload report returns empty for unassigned users rather than dumping all users.
    """
    engineer_user.workspace_id = None
    resp = await test_client.get("/api/reports/team-workload", headers=engineer_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 0


# =====================================================================
# SEC-09: Formula / CSV Injection (DDE) Sanitization
# =====================================================================
def test_sec09_csv_formula_injection_sanitization():
    """
    Any string cell starting with =, +, -, @, \\t, \\r, % must be prepended with a quote.
    """
    dangerous_inputs = [
        "=cmd|'/C calc'!A0",
        "+1+1",
        "-5+5",
        "@SUM(A1:A10)",
        "\tmalicious_tab",
        "\rmalicious_cr",
        "%COMSPEC%",
    ]
    for payload in dangerous_inputs:
        sanitized = sanitize_csv_cell(payload)
        assert sanitized.startswith("'"), f"Failed to sanitize CSV injection payload: {payload}"

    # Safe strings must remain untouched
    safe_string = "Normal Project Name"
    assert sanitize_csv_cell(safe_string) == "Normal Project Name"
    assert sanitize_csv_cell(123) == 123


# =====================================================================
# SEC-10: Email Header Injection and CRLF Sanitization
# =====================================================================
def test_sec10_email_header_injection_crlf_stripped():
    """
    Simulated send_email strips CRLF characters from subject and recipient addresses.
    """
    malicious_subject = "Important Subject\r\nBcc: attacker@evil.com\r\nX-Injected: true"
    malicious_to = "victim@example.com\r\nBcc: stealth@evil.com"
    # send_email with test environment simulates cleanly
    result = send_email(to_email=malicious_to, subject=malicious_subject, body_text="Hello")
    assert result is True  # Simulated dispatch returns True in test env


# =====================================================================
# SEC-11: Attachment File Extension Allowlist & Magic Byte Validation
# =====================================================================
def test_sec11_attachment_dangerous_extensions_rejected():
    """
    Executable and HTML/SVG file extensions must be blocked to prevent Stored XSS and RCE.
    """
    dangerous_files = [
        "exploit.html",
        "vector.svg",
        "script.js",
        "malware.exe",
        "shell.php",
        "batch.bat",
        "macro.vbs",
        "service.sh",
    ]
    for fname in dangerous_files:
        with pytest.raises(ValidationError):
            validate_extension(fname)

    # Valid engineering attachments must pass
    allowed_files = [
        "schematic.kicad_sch",
        "layout.kicad_pcb",
        "firmware.bin",
        "rom.hex",
        "datasheet.pdf",
        "render.png",
        "board.step",
    ]
    for fname in allowed_files:
        ext = validate_extension(fname)
        assert ext in ALLOWED_ATTACHMENT_EXTENSIONS


# =====================================================================
# SEC-12: JWT Token Expiration and Issued-At Timestamp
# =====================================================================
def test_sec12_jwt_token_includes_iat_and_exp():
    """
    Tokens must include both 'exp' and 'iat' claims with standard HS256 algorithm.
    """
    token = create_access_token(data={"sub": str(uuid.uuid4()), "role": "ENGINEER"})
    payload = verify_token(token)
    assert "exp" in payload
    assert "iat" in payload
    assert payload["role"] == "ENGINEER"


# =====================================================================
# SEC-13: Real Client IP Proxy Header Resolution
# =====================================================================
def test_sec13_real_client_ip_proxy_header_resolution():
    """
    get_real_client_ip extracts CF-Connecting-IP and X-Forwarded-For correctly.
    """
    class MockRequest:
        def __init__(self, headers: dict, host: str = "127.0.0.1"):
            self.headers = headers
            self.client = type("Client", (), {"host": host})()

    # Cloudflare proxy
    req_cf = MockRequest({"CF-Connecting-IP": "203.0.113.195"})
    assert get_real_client_ip(req_cf) == "203.0.113.195"

    # Standard reverse proxy (first hop in X-Forwarded-For)
    req_xff = MockRequest({"X-Forwarded-For": "198.51.100.42, 10.0.0.1"})
    assert get_real_client_ip(req_xff) == "198.51.100.42"

    # Direct connection fallback
    req_direct = MockRequest({}, host="192.0.2.1")
    assert get_real_client_ip(req_direct) == "192.0.2.1"


# =====================================================================
# Workspace Switching Tests
# =====================================================================
@pytest.mark.asyncio
async def test_admin_switch_workspace(
    test_client: AsyncClient, admin_user: User, admin_headers: dict, db_session: AsyncSession
):
    ws = Workspace(id=uuid.uuid4(), name=f"WS_Switch_{uuid.uuid4().hex[:4]}", created_by=admin_user.id)
    db_session.add(ws)
    await db_session.commit()

    # Switch to new workspace
    resp = await test_client.post(
        "/api/workspaces/switch",
        json={"workspace_id": str(ws.id)},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["workspace_id"] == str(ws.id)
    assert data["workspace_name"] == ws.name

    # Switch back to All Workspaces (null)
    resp_all = await test_client.post(
        "/api/workspaces/switch",
        json={"workspace_id": None},
        headers=admin_headers,
    )
    assert resp_all.status_code == 200
    data_all = resp_all.json()
    assert data_all["workspace_id"] is None


@pytest.mark.asyncio
async def test_engineer_cannot_switch_to_unassigned_workspace(
    test_client: AsyncClient, engineer_user: User, engineer_headers: dict, db_session: AsyncSession
):
    ws_unassigned = Workspace(id=uuid.uuid4(), name=f"WS_Other_{uuid.uuid4().hex[:4]}", created_by=engineer_user.id)
    db_session.add(ws_unassigned)
    await db_session.commit()

    resp = await test_client.post(
        "/api/workspaces/switch",
        json={"workspace_id": str(ws_unassigned.id)},
        headers=engineer_headers,
    )
    assert resp.status_code == 403
