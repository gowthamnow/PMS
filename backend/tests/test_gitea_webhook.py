import hashlib
import hmac
import json
import uuid
from httpx import AsyncClient
import pytest

from app.models.gitea import GiteaRepo
from app.models.task import Task


@pytest.mark.asyncio
async def test_webhook_valid_signature(
    test_client: AsyncClient, sample_gitea_repo: GiteaRepo
):
    payload = {"message": "Webhook test payload"}
    body = json.dumps(payload).encode("utf-8")
    sig = "sha256=" + hmac.new(
        sample_gitea_repo.webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()

    response = await test_client.post(
        f"/api/gitea/webhook/{sample_gitea_repo.id}",
        content=body,
        headers={
            "X-Gitea-Signature": sig,
            "X-Gitea-Event": "push",
            "X-Gitea-Delivery": str(uuid.uuid4()),
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "processed"


@pytest.mark.asyncio
async def test_webhook_invalid_signature(
    test_client: AsyncClient, sample_gitea_repo: GiteaRepo
):
    payload = {"message": "Webhook bad signature"}
    body = json.dumps(payload).encode("utf-8")

    response = await test_client.post(
        f"/api/gitea/webhook/{sample_gitea_repo.id}",
        content=body,
        headers={
            "X-Gitea-Signature": "sha256=invalid_signature_hex_value",
            "X-Gitea-Event": "push",
            "X-Gitea-Delivery": str(uuid.uuid4()),
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 401
    assert "Invalid webhook signature" in response.json()["detail"]


@pytest.mark.asyncio
async def test_webhook_dedup(
    test_client: AsyncClient, sample_gitea_repo: GiteaRepo
):
    payload = {"message": "Dedup test"}
    body = json.dumps(payload).encode("utf-8")
    sig = "sha256=" + hmac.new(
        sample_gitea_repo.webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    event_id = f"delivery-{uuid.uuid4()}"

    headers = {
        "X-Gitea-Signature": sig,
        "X-Gitea-Event": "push",
        "X-Gitea-Delivery": event_id,
        "Content-Type": "application/json",
    }

    # First delivery
    first_resp = await test_client.post(
        f"/api/gitea/webhook/{sample_gitea_repo.id}",
        content=body,
        headers=headers,
    )
    assert first_resp.status_code == 200
    assert first_resp.json()["status"] == "processed"

    # Second delivery with identical event_id
    second_resp = await test_client.post(
        f"/api/gitea/webhook/{sample_gitea_repo.id}",
        content=body,
        headers=headers,
    )
    assert second_resp.status_code == 200
    assert second_resp.json()["status"] == "already_processed"


@pytest.mark.asyncio
async def test_webhook_task_ref_linking(
    test_client: AsyncClient,
    sample_gitea_repo: GiteaRepo,
    sample_task: Task,
    admin_headers: dict[str, str],
):
    # Commit referencing sample_task.task_number (which is 1)
    payload = {
        "commits": [
            {
                "id": "c0ffee1234567890",
                "message": f"Fix critical issue #1 in authentication pipeline",
                "author": {"name": "Test Committer"},
                "url": "http://gitea/commits/c0ffee12",
                "timestamp": "2026-10-19T10:00:00Z",
            }
        ]
    }
    body = json.dumps(payload).encode("utf-8")
    sig = "sha256=" + hmac.new(
        sample_gitea_repo.webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()

    response = await test_client.post(
        f"/api/gitea/webhook/{sample_gitea_repo.id}",
        content=body,
        headers={
            "X-Gitea-Signature": sig,
            "X-Gitea-Event": "push",
            "X-Gitea-Delivery": str(uuid.uuid4()),
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processed"
    assert data["task_refs_updated"] >= 1

    # Verify task git_refs updated
    task_resp = await test_client.get(
        f"/api/tasks/{sample_task.id}",
        headers=admin_headers,
    )
    assert task_resp.status_code == 200
    task_data = task_resp.json()
    assert len(task_data["git_refs"]) >= 1
    assert any(ref.get("ref") == "c0ffee12" for ref in task_data["git_refs"])
