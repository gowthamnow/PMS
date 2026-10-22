from datetime import date, timedelta
from httpx import AsyncClient
import pytest

from app.models.project import Project


@pytest.mark.asyncio
async def test_milestones_crud(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_project: Project,
):
    # 1. Create milestone
    due = str(date.today() + timedelta(days=14))
    create_resp = await test_client.post(
        "/api/milestones",
        headers=admin_headers,
        json={
            "project_id": str(sample_project.id),
            "title": "Release v1.0",
            "description": "Initial system release",
            "due_date": due,
            "status": "PENDING",
        },
    )
    assert create_resp.status_code == 201
    m_data = create_resp.json()
    assert m_data["title"] == "Release v1.0"
    milestone_id = m_data["id"]

    # 2. List milestones
    list_resp = await test_client.get(
        f"/api/milestones?project_id={sample_project.id}",
        headers=admin_headers,
    )
    assert list_resp.status_code == 200
    milestones = list_resp.json()
    assert any(m["id"] == milestone_id for m in milestones)

    # 3. Get single milestone
    get_resp = await test_client.get(
        f"/api/milestones/{milestone_id}",
        headers=admin_headers,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == milestone_id

    # 4. Update milestone
    update_resp = await test_client.put(
        f"/api/milestones/{milestone_id}",
        headers=admin_headers,
        json={
            "status": "IN_PROGRESS",
            "description": "Updated release goals",
        },
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "IN_PROGRESS"

    # 5. Delete milestone
    delete_resp = await test_client.delete(
        f"/api/milestones/{milestone_id}",
        headers=admin_headers,
    )
    assert delete_resp.status_code == 200

    # Verify gone
    get_again = await test_client.get(
        f"/api/milestones/{milestone_id}",
        headers=admin_headers,
    )
    assert get_again.status_code == 404
