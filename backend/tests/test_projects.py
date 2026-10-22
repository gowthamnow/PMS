import pytest
from httpx import AsyncClient

from app.models.project import Project
from app.models.user import User


@pytest.mark.asyncio
async def test_create_project_as_admin(
    test_client: AsyncClient, admin_headers: dict[str, str]
):
    response = await test_client.post(
        "/api/projects",
        headers=admin_headers,
        json={
            "name": "New Autonomous PMS Project",
            "description": "Building next-gen engineering tools",
            "status": "PLANNING",
            "priority": "HIGH",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "New Autonomous PMS Project"
    assert "id" in data
    assert len(data["members"]) >= 1


@pytest.mark.asyncio
async def test_create_project_as_engineer(
    test_client: AsyncClient, engineer_headers: dict[str, str]
):
    response = await test_client.post(
        "/api/projects",
        headers=engineer_headers,
        json={
            "name": "Engineer Attempted Project",
            "status": "PLANNING",
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_projects_scoped(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    engineer_headers: dict[str, str],
    sample_project: Project,
):
    # Admin sees all projects including sample_project
    admin_res = await test_client.get(
        "/api/projects",
        headers=admin_headers,
    )
    assert admin_res.status_code == 200
    admin_data = admin_res.json()
    assert admin_data["total"] >= 1
    assert any(p["id"] == str(sample_project.id) for p in admin_data["items"])

    # Engineer is not member of sample_project, should see 0 items
    eng_res = await test_client.get(
        "/api/projects",
        headers=engineer_headers,
    )
    assert eng_res.status_code == 200
    eng_data = eng_res.json()
    assert not any(p["id"] == str(sample_project.id) for p in eng_data["items"])


@pytest.mark.asyncio
async def test_get_project_detail(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_project: Project,
):
    # Get project details
    detail_res = await test_client.get(
        f"/api/projects/{sample_project.id}",
        headers=admin_headers,
    )
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["id"] == str(sample_project.id)
    assert detail_data["name"] == sample_project.name

    # Get project stats
    stats_res = await test_client.get(
        f"/api/projects/{sample_project.id}/stats",
        headers=admin_headers,
    )
    assert stats_res.status_code == 200
    stats_data = stats_res.json()
    assert stats_data["project_id"] == str(sample_project.id)
    assert "total_tasks" in stats_data
    assert "completed_tasks" in stats_data
    assert "tasks_by_status" in stats_data


@pytest.mark.asyncio
async def test_add_member(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_project: Project,
    engineer_user: User,
):
    response = await test_client.post(
        f"/api/projects/{sample_project.id}/members",
        headers=admin_headers,
        json={
            "user_id": str(engineer_user.id),
            "role": "MEMBER",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["project_id"] == str(sample_project.id)
    assert data["user_id"] == str(engineer_user.id)
    assert data["role"] == "MEMBER"
