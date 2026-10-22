from collections.abc import AsyncGenerator
from datetime import date, datetime, timezone
import os
import sqlite3
import uuid

from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.config import settings
from app.core.security import create_access_token, get_password_hash
from app.database import Base, get_db
from app.main import app
from app.models.gitea import GiteaRepo
from app.models.project import (
    Project,
    ProjectMember,
    ProjectPriority,
    ProjectRole,
    ProjectStatus,
)
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User, UserRole

# Register SQLite UUID adapter
sqlite3.register_adapter(uuid.UUID, lambda u: str(u))

# Use SQLite for tests
TEST_DB_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")

test_engine = create_async_engine(
    TEST_DB_URL,
    echo=False,
    future=True,
    connect_args={"check_same_thread": False} if "sqlite" in TEST_DB_URL else {},
    poolclass=StaticPool if "sqlite" in TEST_DB_URL else None,
)

TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_db():
    try:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        yield
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    except Exception:
        yield


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def test_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def sync_client(db_session: AsyncSession):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    admin = User(
        id=uuid.uuid4(),
        username=f"admin_{uuid.uuid4().hex[:6]}",
        email=f"admin_{uuid.uuid4().hex[:6]}@example.com",
        full_name="Admin User",
        hashed_password=get_password_hash("AdminPassword123!"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    try:
        await db_session.commit()
        await db_session.refresh(admin)
    except Exception:
        pass
    return admin


@pytest_asyncio.fixture
async def engineer_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        username=f"engineer_{uuid.uuid4().hex[:6]}",
        email=f"engineer_{uuid.uuid4().hex[:6]}@example.com",
        full_name="Engineer User",
        hashed_password=get_password_hash("EngineerPass123!"),
        role=UserRole.ENGINEER,
        is_active=True,
    )
    db_session.add(user)
    try:
        await db_session.commit()
        await db_session.refresh(user)
    except Exception:
        pass
    return user


@pytest.fixture
def admin_token(admin_user: User) -> str:
    return create_access_token(
        data={"sub": str(admin_user.id), "role": admin_user.role.value, "username": admin_user.username}
    )


@pytest.fixture
def engineer_token(engineer_user: User) -> str:
    return create_access_token(
        data={"sub": str(engineer_user.id), "role": engineer_user.role.value, "username": engineer_user.username}
    )


@pytest.fixture
def admin_headers(admin_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def engineer_headers(engineer_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {engineer_token}"}


@pytest_asyncio.fixture
async def sample_project(db_session: AsyncSession, admin_user: User) -> Project:
    proj_id = uuid.uuid4()
    project = Project(
        id=proj_id,
        name="Test Project",
        description="A project for automated testing",
        status=ProjectStatus.ACTIVE,
        priority=ProjectPriority.HIGH,
        created_by=admin_user.id,
    )
    member = ProjectMember(
        id=uuid.uuid4(),
        project_id=proj_id,
        user_id=admin_user.id,
        role=ProjectRole.MANAGER,
    )
    db_session.add(project)
    db_session.add(member)
    try:
        await db_session.commit()
        await db_session.refresh(project)
    except Exception:
        pass
    return project


@pytest_asyncio.fixture
async def sample_task(db_session: AsyncSession, sample_project: Project, admin_user: User) -> Task:
    task = Task(
        id=uuid.uuid4(),
        project_id=sample_project.id,
        title="Test Task #1",
        description="Testing task operations",
        status=TaskStatus.TODO,
        priority=TaskPriority.MEDIUM,
        creator_id=admin_user.id,
        assignee_id=admin_user.id,
        task_number=1,
        git_refs=[],
    )
    db_session.add(task)
    try:
        await db_session.commit()
        await db_session.refresh(task)
    except Exception:
        pass
    return task


@pytest_asyncio.fixture
async def sample_gitea_repo(db_session: AsyncSession, sample_project: Project) -> GiteaRepo:
    repo = GiteaRepo(
        id=uuid.uuid4(),
        project_id=sample_project.id,
        repo_full_name="testorg/testrepo",
        repo_url="http://gitea/testorg/testrepo",
        default_branch="main",
        webhook_secret="testsecret12345",
        is_active=True,
    )
    db_session.add(repo)
    try:
        await db_session.commit()
        await db_session.refresh(repo)
    except Exception:
        pass
    return repo
