import math
import os
import uuid
import logging
from typing import Any, Optional
from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status
from app.config import settings
from sqlalchemy import func, select, or_
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
from app.models.notification import NotificationType
from app.models.task import Task, TaskStatus
from app.models.time_entry import TimeEntry
from app.models.user import User, UserRole
from app.models.workspace import Workspace
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
from app.services.notification_service import create_notification
from app.services.email_service import build_project_startup_email, send_email

logger = logging.getLogger("projects")

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get("")
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[ProjectStatus] = None,
    priority: Optional[ProjectPriority] = None,
    search: Optional[str] = None,
    workspace_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Project).options(
        selectinload(Project.members).selectinload(ProjectMember.user),
        selectinload(Project.workspace),
    )
    count_query = select(func.count(func.distinct(Project.id)))

    # If not admin, show all projects where current_user is an assigned member
    if current_user.role != UserRole.ADMIN:
        query = query.join(Project.members).where(ProjectMember.user_id == current_user.id)
        count_query = count_query.join(Project.members).where(ProjectMember.user_id == current_user.id)
        if workspace_id and not hasattr(workspace_id, "default"):
            query = query.where(Project.workspace_id == workspace_id)
            count_query = count_query.where(Project.workspace_id == workspace_id)
    else:
        if workspace_id and not hasattr(workspace_id, "default"):
            query = query.where(Project.workspace_id == workspace_id)
            count_query = count_query.where(Project.workspace_id == workspace_id)
        elif current_user.workspace_id:
            query = query.where(Project.workspace_id == current_user.workspace_id)
            count_query = count_query.where(Project.workspace_id == current_user.workspace_id)

    if status and not hasattr(status, "default"):
        query = query.where(Project.status == status)
        count_query = count_query.where(Project.status == status)

    if priority and not hasattr(priority, "default"):
        query = query.where(Project.priority == priority)
        count_query = count_query.where(Project.priority == priority)

    if search and not hasattr(search, "default"):
        s_term = f"%{search}%"
        search_cond = Project.name.ilike(s_term) | Project.description.ilike(s_term)
        query = query.where(search_cond)
        count_query = count_query.where(search_cond)

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
    target_ws_id = project_in.workspace_id
    if not target_ws_id:
        if current_user.workspace_id:
            target_ws_id = current_user.workspace_id
        else:
            ws_res = await db.execute(select(Workspace).order_by(Workspace.created_at.asc()).limit(1))
            first_ws = ws_res.scalars().first()
            if first_ws:
                target_ws_id = first_ws.id

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
        workspace_id=target_ws_id,
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
        .options(
            selectinload(Project.members).selectinload(ProjectMember.user),
            selectinload(Project.workspace),
        )
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
        changes={"name": project.name, "status": project.status.value, "workspace_id": str(target_ws_id) if target_ws_id else None},
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
        .options(
            selectinload(Project.members).selectinload(ProjectMember.user),
            selectinload(Project.workspace),
        )
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
        .options(
            selectinload(Project.members).selectinload(ProjectMember.user),
            selectinload(Project.workspace),
        )
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
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.ADMIN:
        raise ForbiddenError("Only administrators can delete projects")

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

    # Fetch project details
    proj_stmt = (
        select(Project)
        .options(selectinload(Project.workspace))
        .where(Project.id == project_id)
    )
    proj_res = await db.execute(proj_stmt)
    project = proj_res.scalar_one_or_none()
    if not project:
        raise NotFoundError("Project not found")

    # Ensure project and target user belong to the same workspace!
    if project.workspace_id and target_user.workspace_id and project.workspace_id != target_user.workspace_id:
        raise ForbiddenError("Cannot add member: User belongs to another workspace. Team members can only access their assigned workspace.")

    # If target user does not have an assigned workspace, link them to the project's workspace
    if not target_user.workspace_id and project.workspace_id:
        target_user.workspace_id = project.workspace_id
        db.add(target_user)

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

    if project:
        # Create in-app notification
        await create_notification(
            db=db,
            user_id=target_user.id,
            type=NotificationType.PROJECT_UPDATED,
            title=f"🚀 Project Startup: Added to {project.name}",
            body=f"You have been assigned to '{project.name}' as {member_in.role.value} by {current_user.full_name}.",
            related_project_id=project_id,
        )
        await db.commit()

        # Send Project Startup Email to member
        if target_user.email:
            try:
                role_val = member_in.role.value if hasattr(member_in.role, "value") else str(member_in.role)
                assigned_by = f"{current_user.full_name} ({current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)})"
                priority_val = project.priority.value if hasattr(project.priority, "value") else str(project.priority)
                status_val = project.status.value if hasattr(project.status, "value") else str(project.status)
                start_val = project.start_date.isoformat() if project.start_date else None
                target_val = project.target_date.isoformat() if project.target_date else None
                workspace_val = project.workspace.name if project.workspace else None

                subj, txt, html = build_project_startup_email(
                    member_name=target_user.full_name or target_user.username,
                    member_email=target_user.email,
                    project_name=project.name,
                    project_role=role_val,
                    assigned_by_name=assigned_by,
                    project_id=str(project_id),
                    description=project.description,
                    objectives=project.objectives,
                    priority=priority_val,
                    status=status_val,
                    start_date=start_val,
                    target_date=target_val,
                    workspace_name=workspace_val,
                )
                send_email(
                    to_email=target_user.email,
                    subject=subj,
                    body_text=txt,
                    body_html=html,
                )
                logger.info(f"Project startup email sent to {target_user.email} for project {project.name}")
            except Exception as e:
                logger.error(f"Failed to dispatch project startup email to {target_user.email}: {e}")

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


@router.post("/{project_id}/image")
async def upload_project_image(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin_or_pm),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a cover photo or schematic banner for a project.
    """
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise ValidationError("Only JPEG, PNG, WEBP, or GIF image files are allowed for project covers.")

    res = await db.execute(select(Project).where(Project.id == project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise NotFoundError("Project not found")

    if current_user.role != UserRole.ADMIN:
        if current_user.workspace_id and project.workspace_id and current_user.workspace_id != project.workspace_id:
            raise ForbiddenError("Access denied: Project does not belong to your assigned workspace")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise ValidationError("Project image size must not exceed 10MB.")

    # Validate image magic bytes
    is_valid_image = False
    if content.startswith(b"\xff\xd8\xff"):  # JPEG
        is_valid_image = True
    elif content.startswith(b"\x89PNG\r\n\x1a\n"):  # PNG
        is_valid_image = True
    elif content.startswith(b"GIF87a") or content.startswith(b"GIF89a"):  # GIF
        is_valid_image = True
    elif content.startswith(b"RIFF") and len(content) > 12 and content[8:12] == b"WEBP":  # WEBP
        is_valid_image = True

    if not is_valid_image:
        raise ValidationError("Uploaded file is not a valid image file")

    project_img_dir = os.path.join(settings.ATTACHMENT_STORAGE_PATH, "projects")
    os.makedirs(project_img_dir, exist_ok=True)

    ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "jpg"
    if ext not in ["jpg", "jpeg", "png", "webp", "gif"]:
        ext = "jpg"
    filename = f"project_{project.id}.{ext}"
    filepath = os.path.join(project_img_dir, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    image_url = f"/api/attachments/projects/{filename}"
    project.image_url = image_url
    await db.commit()
    await db.refresh(project)

    return {
        "status": "success",
        "image_url": image_url,
        "message": "Project image updated successfully",
    }
