import uuid
from datetime import date
from pathlib import Path
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_orchestrator import (
    AIEngineConfig,
    AIExecutionStatus,
    AITaskExecution,
)
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services.ai_tools import (
    AIToolExecutionLayer,
    ToolSecurityError,
    resolve_safe_path,
)
from app.services.ai_model_router import (
    AIModelRouter,
    AIModelResponse,
)


# =====================================================================
# 1. TOOL LAYER & SECURITY TESTS
# =====================================================================

def test_resolve_safe_path_valid():
    """Verifies that legitimate in-repo paths resolve correctly within workspace boundaries."""
    repo_root = Path(__file__).resolve().parent.parent
    safe_path = resolve_safe_path("app/main.py", repo_root)
    assert safe_path.exists()
    assert str(safe_path).startswith(str(repo_root))


def test_resolve_safe_path_traversal_blocked():
    """Verifies that directory traversal attacks are blocked by strict validation."""
    repo_root = Path(__file__).resolve().parent.parent
    
    with pytest.raises(ToolSecurityError):
        resolve_safe_path("../../etc/passwd", repo_root)

    with pytest.raises(ToolSecurityError):
        resolve_safe_path("..\\..\\Windows\\System32\\cmd.exe", repo_root)

    with pytest.raises(ToolSecurityError):
        resolve_safe_path("/root/.ssh/id_rsa", repo_root)


def test_approved_commands_allowlist():
    """Verifies that only strictly allowlisted verification checks are permitted."""
    tools = AIToolExecutionLayer()
    
    # Arbitrary command must be rejected
    res_bad = tools.run_approved_check("arbitrary_bash_command")
    assert res_bad["is_success"] is False
    assert "not in the authorized safety allowlist" in res_bad["output"]

    res_rm = tools.run_approved_check("rm -rf /")
    assert res_rm["is_success"] is False
    assert "not in the authorized safety allowlist" in res_rm["output"]


# =====================================================================
# 2. MODEL ROUTER & FALLBACK TESTS
# =====================================================================

def test_model_router_selection():
    """Verifies dynamic model routing based on agent role and task priority."""
    router = AIModelRouter()
    
    # Complex planning should route to Gemini 1.5 Pro
    complex_model = router.select_model(agent_role="PLANNING_AGENT", task_priority="CRITICAL")
    assert "pro" in complex_model

    # Lightweight triage should route to Gemini 1.5 Flash
    fast_model = router.select_model(agent_role="DEVOPS_AGENT", task_priority="LOW")
    assert "flash" in fast_model


@pytest.mark.asyncio
async def test_model_router_fallback():
    """Verifies deterministic expert fallback data is valid and structured."""
    router = AIModelRouter(api_key="")
    resp = await router.execute_prompt("Analyze task specifications and requirements")
    assert resp.is_fallback is True
    assert resp.provider == "Engineering PMS Expert Diagnostic Engine"
    assert "problem_statement" in resp.structured_data
    assert "risk_level" in resp.structured_data
    assert resp.structured_data["risk_level"] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    assert len(resp.structured_data["planned_steps"]) >= 1
    assert resp.total_tokens > 0


# =====================================================================
# 3. API INTEGRATION TESTS
# =====================================================================

@pytest.mark.asyncio
async def test_create_and_get_ai_execution(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_task: Task,
):
    """Tests creating an AI execution via API and retrieving its full status."""
    # 1. Create execution
    create_resp = await test_client.post(
        "/api/ai/orchestrator/executions",
        headers=admin_headers,
        json={
            "task_id": str(sample_task.id),
            "autonomy_level": 2,
            "custom_instructions": "Verify all dependencies before committing",
        },
    )
    assert create_resp.status_code == 201
    created_data = create_resp.json()
    assert created_data["task_id"] == str(sample_task.id)
    assert created_data["status"] == "QUEUED"
    assert created_data["autonomy_level"] == 2
    execution_id = created_data["id"]

    # 2. Retrieve execution by ID
    get_resp = await test_client.get(
        f"/api/ai/orchestrator/executions/{execution_id}",
        headers=admin_headers,
    )
    assert get_resp.status_code == 200
    exec_data = get_resp.json()
    assert exec_data["id"] == execution_id
    assert exec_data["status"] == "QUEUED"

    # 3. Retrieve latest execution by task ID
    by_task_resp = await test_client.get(
        f"/api/ai/orchestrator/executions/task/{sample_task.id}",
        headers=admin_headers,
    )
    assert by_task_resp.status_code == 200
    by_task_data = by_task_resp.json()
    assert by_task_data is not None
    assert by_task_data["id"] == execution_id


@pytest.mark.asyncio
async def test_ai_execution_cancellation(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_task: Task,
):
    """Tests cancelling an active or queued AI execution."""
    create_resp = await test_client.post(
        "/api/ai/orchestrator/executions",
        headers=admin_headers,
        json={"task_id": str(sample_task.id), "autonomy_level": 1},
    )
    exec_id = create_resp.json()["id"]

    cancel_resp = await test_client.post(
        f"/api/ai/orchestrator/executions/{exec_id}/cancel",
        headers=admin_headers,
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "CANCELLED"


@pytest.mark.asyncio
async def test_control_center_stats_endpoint(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
):
    """Tests retrieving system telemetry, execution aggregates, and provider health."""
    resp = await test_client.get(
        "/api/ai/orchestrator/control-center",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total_executions" in data
    assert "active_count" in data
    assert "provider_status" in data
    assert "github_repo" in data


@pytest.mark.asyncio
async def test_ai_engine_config_security(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    engineer_headers: dict[str, str],
):
    """Verifies that config update is restricted to admins and public view hides tokens."""
    # Engineer can read public config
    get_resp = await test_client.get(
        "/api/ai/orchestrator/config",
        headers=engineer_headers,
    )
    assert get_resp.status_code == 200
    config_data = get_resp.json()
    assert "github_token" not in config_data
    assert "has_github_token" in config_data

    # Engineer cannot update config
    forbidden_resp = await test_client.put(
        "/api/ai/orchestrator/config",
        headers=engineer_headers,
        json={"default_model": "gemini-1.5-flash"},
    )
    assert forbidden_resp.status_code in [401, 403]

    # Admin can update config
    admin_resp = await test_client.put(
        "/api/ai/orchestrator/config",
        headers=admin_headers,
        json={
            "default_model": "gemini-1.5-pro",
            "fast_model": "gemini-1.5-flash",
            "github_repo": "gowthamnow/PMS",
            "default_autonomy_level": 2,
        },
    )
    assert admin_resp.status_code == 200
    assert admin_resp.json()["github_repo"] == "gowthamnow/PMS"
    assert admin_resp.json()["default_autonomy_level"] == 2
