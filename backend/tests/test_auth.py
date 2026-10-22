import pytest
from httpx import AsyncClient

from app.models.user import User


@pytest.mark.asyncio
async def test_login_success(test_client: AsyncClient, admin_user: User):
    response = await test_client.post(
        "/api/auth/login",
        json={"username": admin_user.username, "password": "AdminPassword123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["username"] == admin_user.username


@pytest.mark.asyncio
async def test_login_wrong_password(test_client: AsyncClient, admin_user: User):
    response = await test_client.post(
        "/api/auth/login",
        json={"username": admin_user.username, "password": "WrongPassword123!"},
    )
    assert response.status_code == 401
    assert "detail" in response.json()


@pytest.mark.asyncio
async def test_get_me_authenticated(
    test_client: AsyncClient, admin_headers: dict[str, str], admin_user: User
):
    response = await test_client.get(
        "/api/auth/me",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(admin_user.id)
    assert data["username"] == admin_user.username


@pytest.mark.asyncio
async def test_get_me_unauthenticated(test_client: AsyncClient):
    response = await test_client.get("/api/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_change_password(
    test_client: AsyncClient, admin_headers: dict[str, str], admin_user: User
):
    response = await test_client.post(
        "/api/auth/change-password",
        headers=admin_headers,
        json={
            "old_password": "AdminPassword123!",
            "new_password": "NewAdminPassword123!",
        },
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Password changed successfully"

    # Verify login with new password works
    login_resp = await test_client.post(
        "/api/auth/login",
        json={"username": admin_user.username, "password": "NewAdminPassword123!"},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()
