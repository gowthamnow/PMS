from datetime import date
import pytest
from httpx import AsyncClient

from app.models.project import Project
from app.models.task import Task


@pytest.mark.asyncio
async def test_create_task(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_project: Project,
):
    response = await test_client.post(
        "/api/tasks",
        headers=admin_headers,
        json={
            "project_id": str(sample_project.id),
            "title": "Design Database Schema",
            "description": "Establish relationships and models",
            "status": "TODO",
            "priority": "HIGH",
            "estimated_hours": 8.0,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Design Database Schema"
    assert data["task_number"] >= 1
    assert data["status"] == "TODO"


@pytest.mark.asyncio
async def test_update_task_status(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_task: Task,
):
    response = await test_client.patch(
        f"/api/tasks/{sample_task.id}/status",
        headers=admin_headers,
        json={"status": "DONE"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "DONE"
    assert data["completed_at"] is not None


@pytest.mark.asyncio
async def test_engineer_cannot_access_other_project(
    test_client: AsyncClient,
    engineer_headers: dict[str, str],
    sample_task: Task,
):
    response = await test_client.get(
        f"/api/tasks/{sample_task.id}",
        headers=engineer_headers,
    )
    # Engineer is not a member of sample_project
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_add_comment(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_task: Task,
):
    response = await test_client.post(
        f"/api/tasks/{sample_task.id}/comments",
        headers=admin_headers,
        json={"content": "Here is an update on progress for this task."},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["content"] == "Here is an update on progress for this task."
    assert "id" in data


@pytest.mark.asyncio
async def test_log_time(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_project: Project,
    sample_task: Task,
):
    response = await test_client.post(
        "/api/time-entries",
        headers=admin_headers,
        json={
            "project_id": str(sample_project.id),
            "task_id": str(sample_task.id),
            "work_date": str(date.today()),
            "duration_hours": 4.5,
            "description": "Implemented core feature modules",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert float(data["duration_hours"]) == 4.5
    assert data["project_id"] == str(sample_project.id)
