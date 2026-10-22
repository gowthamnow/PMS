from httpx import AsyncClient
import pytest

from app.models.project import Project
from app.models.task import Task


@pytest.mark.asyncio
async def test_reports_endpoints(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_project: Project,
    sample_task: Task,
):
    # 1. Project progress
    prog_resp = await test_client.get(
        "/api/reports/project-progress",
        headers=admin_headers,
    )
    assert prog_resp.status_code == 200
    prog_data = prog_resp.json()
    assert isinstance(prog_data, list)
    assert any(p["project_id"] == str(sample_project.id) for p in prog_data)

    # 2. Team workload
    workload_resp = await test_client.get(
        "/api/reports/team-workload",
        headers=admin_headers,
    )
    assert workload_resp.status_code == 200
    workload_data = workload_resp.json()
    assert isinstance(workload_data, list)
    assert len(workload_data) >= 1
    first_worker = workload_data[0]
    assert "user_id" in first_worker
    assert "todo" in first_worker
    assert "hours_this_week" in first_worker

    # 3. Time log
    timelog_resp = await test_client.get(
        "/api/reports/time-log?page=1&page_size=10",
        headers=admin_headers,
    )
    assert timelog_resp.status_code == 200
    timelog_data = timelog_resp.json()
    assert "items" in timelog_data
    assert "total" in timelog_data
    assert "page" in timelog_data

    # 4. Overdue tasks
    overdue_resp = await test_client.get(
        "/api/reports/overdue-tasks",
        headers=admin_headers,
    )
    assert overdue_resp.status_code == 200
    assert isinstance(overdue_resp.json(), list)

    # 5. Export CSV
    csv_resp = await test_client.get(
        "/api/reports/export/csv?type=team_workload",
        headers=admin_headers,
    )
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers.get("content-type", "")
    assert b"User ID,Username" in csv_resp.content
