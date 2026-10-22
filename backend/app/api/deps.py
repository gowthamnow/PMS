import uuid
from typing import Optional
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import verify_token
from app.database import get_db
from app.models.project import Project, ProjectMember, ProjectRole
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise UnauthorizedError("Authentication token is missing")
    try:
        payload = verify_token(token)
        user_id_str: Optional[str] = payload.get("sub")
        if not user_id_str:
            raise UnauthorizedError("Invalid token payload")
        user_id = uuid.UUID(user_id_str)
    except Exception:
        raise UnauthorizedError("Could not validate credentials")

    result = await db.execute(
        select(User).options(selectinload(User.workspace)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedError("User does not exist")
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise ForbiddenError("User account is inactive")
    return current_user


async def require_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if current_user.role != UserRole.ADMIN:
        raise ForbiddenError("Administrator access required")
    return current_user


async def require_admin_or_pm(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if current_user.role not in (UserRole.ADMIN, UserRole.PROJECT_MANAGER):
        raise ForbiddenError("Admin or Project Manager access required")
    return current_user


async def get_project_member(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectMember:
    # First verify the project exists
    proj_res = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_res.scalar_one_or_none()
    if not project:
        raise NotFoundError("Project not found")

    # If non-admin user, check if project belongs to their workspace
    if current_user.role != UserRole.ADMIN:
        if not current_user.workspace_id:
            raise ForbiddenError("Access denied: You are not assigned to any workspace")
        if project.workspace_id and project.workspace_id != current_user.workspace_id:
            raise ForbiddenError("Access denied: Project does not belong to your assigned workspace")

    if current_user.role == UserRole.ADMIN:
        # Admins have full manager access to any existing project
        return ProjectMember(
            id=uuid.uuid4(),
            project_id=project_id,
            user_id=current_user.id,
            role=ProjectRole.MANAGER,
            user=current_user,
        )

    stmt = select(ProjectMember).where(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    member = result.scalar_one_or_none()
    if not member:
        raise ForbiddenError("Access denied: You are not a member of this project")
    return member
