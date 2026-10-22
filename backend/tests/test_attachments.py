from httpx import AsyncClient
import pytest

from app.models.project import Project
from app.models.task import Task

# Valid 1x1 PNG bytes
VALID_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.mark.asyncio
async def test_upload_valid_file(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_project: Project,
    sample_task: Task,
):
    response = await test_client.post(
        "/api/attachments",
        headers=admin_headers,
        files={"file": ("sample.png", VALID_PNG_BYTES, "image/png")},
        data={
            "project_id": str(sample_project.id),
            "task_id": str(sample_task.id),
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["filename"] == "sample.png"
    assert data["project_id"] == str(sample_project.id)
    assert data["task_id"] == str(sample_task.id)
    assert "id" in data


@pytest.mark.asyncio
async def test_upload_over_25mb(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_project: Project,
):
    # 26MB of dummy bytes to exceed the 25MB limit
    oversized_bytes = b"A" * (26 * 1024 * 1024)

    response = await test_client.post(
        "/api/attachments",
        headers=admin_headers,
        files={"file": ("large_file.bin", oversized_bytes, "application/octet-stream")},
        data={"project_id": str(sample_project.id)},
    )
    assert response.status_code == 413


@pytest.mark.asyncio
async def test_download_unauthorized(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    engineer_headers: dict[str, str],
    sample_project: Project,
):
    # Upload as admin
    upload_resp = await test_client.post(
        "/api/attachments",
        headers=admin_headers,
        files={"file": ("secret.png", VALID_PNG_BYTES, "image/png")},
        data={"project_id": str(sample_project.id)},
    )
    assert upload_resp.status_code == 201
    attachment_id = upload_resp.json()["id"]

    # Try downloading with engineer who is NOT in sample_project
    download_resp = await test_client.get(
        f"/api/attachments/{attachment_id}/download",
        headers=engineer_headers,
    )
    assert download_resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_attachment(
    test_client: AsyncClient,
    admin_headers: dict[str, str],
    sample_project: Project,
):
    # Upload first
    upload_resp = await test_client.post(
        "/api/attachments",
        headers=admin_headers,
        files={"file": ("to_delete.png", VALID_PNG_BYTES, "image/png")},
        data={"project_id": str(sample_project.id)},
    )
    assert upload_resp.status_code == 201
    attachment_id = upload_resp.json()["id"]

    # Delete attachment
    delete_resp = await test_client.delete(
        f"/api/attachments/{attachment_id}",
        headers=admin_headers,
    )
    assert delete_resp.status_code == 204

    # Verify attachment is gone
    get_resp = await test_client.get(
        f"/api/attachments/{attachment_id}/download",
        headers=admin_headers,
    )
    assert get_resp.status_code == 404
