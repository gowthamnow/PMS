import math
import uuid
from typing import Any, Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_active_user,
    get_db,
    get_project_member,
    require_admin,
    require_admin_or_pm,
)
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models.project import (
    Project,
    ProjectMember,
    ProjectPriority,
    ProjectRole,
    ProjectStatus,
)
from app.models.task import Task, TaskStatus
from app.models.time_entry import TimeEntry
from app.models.user import User, UserRole
from app.schemas.project import (
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectMemberUpdate,
    ProjectResponse,
    ProjectStatsResponse,
    ProjectUpdate,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get("")
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[ProjectStatus] = None,
    priority: Optional[ProjectPriority] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Project).options(
        selectinload(Project.members).selectinload(ProjectMember.user)
    )
    count_query = select(func.count(func.distinct(Project.id)))

    # If not admin, only show projects where current_user is a member
    if current_user.role != UserRole.ADMIN:
        query = query.join(Project.members).where(ProjectMember.user_id == current_user.id)
        count_query = count_query.join(Project.members).where(ProjectMember.user_id == current_user.id)

    if status:
        query = query.where(Project.status == status)
        count_query = count_query.where(Project.status == status)

    if priority:
        query = query.where(Project.priority == priority)
        count_query = count_query.where(Project.priority == priority)

    total_res = await db.execute(count_query)
    total = total_res.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Project.created_at.desc()).offset(offset).limit(page_size)
    items_res = await db.execute(query)
    items = items_res.scalars().unique().all()

    pages = math.ceil(total / page_size) if total > 0 else 0

    return {
        "items": [ProjectResponse.model_validate(p) for p in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    request: Request,
    project_in: ProjectCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    project_id = uuid.uuid4()
    project = Project(
        id=project_id,
        name=project_in.name,
        description=project_in.description,
        objectives=project_in.objectives,
        status=project_in.status,
        priority=project_in.priority,
        start_date=project_in.start_date,
        target_date=project_in.target_date,
        actual_end_date=project_in.actual_end_date,
        created_by=current_user.id,
    )
    db.add(project)

    # Automatically add creator as MANAGER member
    member = ProjectMember(
        id=uuid.uuid4(),
        project_id=project_id,
        user_id=current_user.id,
        role=ProjectRole.MANAGER,
    )
    db.add(member)

    await db.commit()

    # Re-fetch with relationships
    stmt = (
        select(Project)
        .options(selectinload(Project.members).selectinload(ProjectMember.user))
        .where(Project.id == project_id)
    )
    res = await db.execute(stmt)
    full_project = res.scalar_one()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="CREATE_PROJECT",
        resource_type="PROJECT",
        resource_id=str(project.id),
        changes={"name": project.name, "status": project.status.value},
        ip_address=client_ip,
    )

    return full_project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    member: ProjectMember = Depends(get_project_member),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Project)
        .options(selectinload(Project.members).selectinload(ProjectMember.user))
        .where(Project.id == project_id)
    )
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise NotFoundError("Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    project_in: ProjectUpdate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    member: ProjectMember = Depends(get_project_member),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.ADMIN and member.role != ProjectRole.MANAGER:
        raise ForbiddenError("Only project managers or admins can update project details")

    stmt = (
        select(Project)
        .options(selectinload(Project.members).selectinload(ProjectMember.user))
        .where(Project.id == project_id)
    )
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise NotFoundError("Project not found")

    changes: dict[str, Any] = {}
    for field, value in project_in.model_dump(exclude_unset=True).items():
        changes[field] = str(value)
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UPDATE_PROJECT",
        resource_type="PROJECT",
        resource_id=str(project.id),
        changes=changes,
        ip_address=client_ip,
    )

    return project


@router.delete("/{project_id}")
async def delete_project(
    project_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    member: ProjectMember = Depends(get_project_member),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.ADMIN and member.role != ProjectRole.MANAGER:
        raise ForbiddenError("Only project managers or admins can delete projects")

    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise NotFoundError("Project not found")

    await db.delete(project)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="DELETE_PROJECT",
        resource_type="PROJECT",
        resource_id=str(project_id),
        ip_address=client_ip,
    )

    return {"message": "Project deleted successfully"}


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
async def list_project_members(
    project_id: uuid.UUID,
    member: ProjectMember = Depends(get_project_member),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.project_id == project_id)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/{project_id}/members", response_model=ProjectMemberResponse)
async def add_project_member(
    project_id: uuid.UUID,
    member_in: ProjectMemberCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    member: ProjectMember = Depends(get_project_member),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.ADMIN and member.role != ProjectRole.MANAGER:
        raise ForbiddenError("Only project managers or admins can add members")

    # Check target user exists
    target_user_res = await db.execute(select(User).where(User.id == member_in.user_id))
    target_user = target_user_res.scalar_one_or_none()
    if not target_user:
        raise NotFoundError("Target user not found")

    # Check already member
    existing_res = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == member_in.user_id,
        )
    )
    if existing_res.scalar_one_or_none():
        raise ValidationError("User is already a member of this project")

    new_member = ProjectMember(
        id=uuid.uuid4(),
        project_id=project_id,
        user_id=member_in.user_id,
        role=member_in.role,
    )
    db.add(new_member)
    await db.commit()

    stmt = (
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.id == new_member.id)
    )
    res = await db.execute(stmt)
    full_member = res.scalar_one()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="ADD_PROJECT_MEMBER",
        resource_type="PROJECT",
        resource_id=str(project_id),
        changes={"user_id": str(member_in.user_id), "role": member_in.role.value},
        ip_address=client_ip,
    )

    return full_member


@router.put("/{project_id}/members/{user_id}", response_model=ProjectMemberResponse)
async def update_project_member_role(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    role_in: ProjectMemberUpdate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    member: ProjectMember = Depends(get_project_member),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.ADMIN and member.role != ProjectRole.MANAGER:
        raise ForbiddenError("Only project managers or admins can change member roles")

    stmt = (
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    res = await db.execute(stmt)
    target_member = res.scalar_one_or_none()
    if not target_member:
        raise NotFoundError("Project member not found")

    target_member.role = role_in.role
    await db.commit()
    await db.refresh(target_member)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UPDATE_MEMBER_ROLE",
        resource_type="PROJECT",
        resource_id=str(project_id),
        changes={"user_id": str(user_id), "role": role_in.role.value},
        ip_address=client_ip,
    )

    return target_member


@router.delete("/{project_id}/members/{user_id}")
async def remove_project_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    member: ProjectMember = Depends(get_project_member),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.ADMIN and member.role != ProjectRole.MANAGER:
        raise ForbiddenError("Only project managers or admins can remove members")

    stmt = select(ProjectMember).where(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    )
    res = await db.execute(stmt)
    target_member = res.scalar_one_or_none()
    if not target_member:
        raise NotFoundError("Project member not found")

    await db.delete(target_member)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="REMOVE_PROJECT_MEMBER",
        resource_type="PROJECT",
        resource_id=str(project_id),
        changes={"user_id": str(user_id)},
        ip_address=client_ip,
    )

    return {"message": "Project member removed successfully"}


@router.get("/{project_id}/stats", response_model=ProjectStatsResponse)
async def get_project_stats(
    project_id: uuid.UUID,
    member: ProjectMember = Depends(get_project_member),
    db: AsyncSession = Depends(get_db),
):
    # Total tasks & tasks by status
    status_stmt = (
        select(Task.status, func.count(Task.id))
        .where(Task.project_id == project_id)
        .group_by(Task.status)
    )
    status_res = await db.execute(status_stmt)
    tasks_by_status = {s.value: 0 for s in TaskStatus}
    total_tasks = 0
    completed_tasks = 0
    for st, count in status_res.all():
        tasks_by_status[st.value] = count
        total_tasks += count
        if st == TaskStatus.DONE:
            completed_tasks = count

    completion_percentage = (
        round((completed_tasks / total_tasks) * 100, 2) if total_tasks > 0 else 0.0
    )

    # Total hours logged
    time_stmt = select(func.coalesce(func.sum(TimeEntry.duration_hours), 0)).where(
        TimeEntry.project_id == project_id
    )
    time_res = await db.execute(time_stmt)
    total_hours_logged = float(time_res.scalar_one())

    return ProjectStatsResponse(
        project_id=project_id,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        completion_percentage=completion_percentage,
        tasks_by_status=tasks_by_status,
        total_hours_logged=total_hours_logged,
    )
