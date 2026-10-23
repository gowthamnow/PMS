from datetime import datetime, timedelta, timezone
import html
import math
import re
import uuid
from typing import Any, Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_active_user,
    get_db,
    get_project_member,
    require_admin,
)
from app.config import settings
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models.notification import NotificationType
from app.models.project import Project, ProjectMember, ProjectRole
from app.models.task import (
    DependencyType,
    Task,
    TaskComment,
    TaskDependency,
    TaskPriority,
    TaskStatus,
)
from app.models.user import User, UserRole
from app.schemas.task import (
    TaskCommentCreate,
    TaskCommentResponse,
    TaskCommentUpdate,
    TaskCreate,
    TaskDependencyCreate,
    TaskDependencyResponse,
    TaskResponse,
    TaskStatusUpdate,
    TaskUpdate,
)
from app.services.audit_service import log_audit
from app.services.email_service import (
    build_evening_push_reminder_email,
    build_morning_login_reminder_email,
    build_project_team_pending_reminder_email,
    build_stale_task_email,
    send_email,
)
from app.services.notification_service import create_notification

router = APIRouter(prefix="/tasks", tags=["Tasks"])



async def check_task_access(
    task_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> Task:
    stmt = (
        select(Task)
        .options(
            selectinload(Task.creator),
            selectinload(Task.assignee),
            selectinload(Task.reviewer),
            selectinload(Task.comments).selectinload(TaskComment.user),
            selectinload(Task.dependencies),
        )
        .where(Task.id == task_id, Task.is_deleted == False)
    )
    res = await db.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        raise NotFoundError("Task not found")

    if user.role != UserRole.ADMIN:
        # Check membership in task's project
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == task.project_id,
            ProjectMember.user_id == user.id,
        )
        mem_res = await db.execute(mem_stmt)
        if not mem_res.scalar_one_or_none():
            raise ForbiddenError("Access denied: You are not a member of this project")

    return task


@router.get("")
async def list_tasks(
    project_id: Optional[uuid.UUID] = None,
    status: Optional[TaskStatus] = None,
    priority: Optional[TaskPriority] = None,
    assignee_id: Optional[uuid.UUID] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Task).options(
        selectinload(Task.creator),
        selectinload(Task.assignee),
        selectinload(Task.reviewer),
        selectinload(Task.comments).selectinload(TaskComment.user),
        selectinload(Task.dependencies),
    ).where(Task.is_deleted == False)
    count_query = select(func.count(Task.id)).where(Task.is_deleted == False)

    if project_id:
        # Check access to project
        await get_project_member(project_id=project_id, current_user=current_user, db=db)
        query = query.where(Task.project_id == project_id)
        count_query = count_query.where(Task.project_id == project_id)
    else:
        # Filter to user's projects if not admin, or to switched workspace if admin
        if current_user.role != UserRole.ADMIN:
            user_projects_subq = select(ProjectMember.project_id).where(
                ProjectMember.user_id == current_user.id
            )
            query = query.where(Task.project_id.in_(user_projects_subq))
            count_query = count_query.where(Task.project_id.in_(user_projects_subq))
        elif current_user.workspace_id:
            ws_projects_subq = select(Project.id).where(Project.workspace_id == current_user.workspace_id)
            query = query.where(Task.project_id.in_(ws_projects_subq))
            count_query = count_query.where(Task.project_id.in_(ws_projects_subq))

    if status:
        query = query.where(Task.status == status)
        count_query = count_query.where(Task.status == status)

    if priority:
        query = query.where(Task.priority == priority)
        count_query = count_query.where(Task.priority == priority)

    if assignee_id:
        query = query.where(Task.assignee_id == assignee_id)
        count_query = count_query.where(Task.assignee_id == assignee_id)

    total_res = await db.execute(count_query)
    total = total_res.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Task.task_number.asc()).offset(offset).limit(page_size)
    items_res = await db.execute(query)
    items = items_res.scalars().all()

    pages = math.ceil(total / page_size) if total > 0 else 0

    return {
        "items": [TaskResponse.model_validate(t) for t in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_in: TaskCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify user has access to project
    await get_project_member(project_id=task_in.project_id, current_user=current_user, db=db)

    # Next task number for this project
    num_stmt = select(func.coalesce(func.max(Task.task_number), 0)).where(
        Task.project_id == task_in.project_id
    )
    num_res = await db.execute(num_stmt)
    next_number = num_res.scalar_one() + 1

    task_id = uuid.uuid4()
    task = Task(
        id=task_id,
        project_id=task_in.project_id,
        parent_task_id=task_in.parent_task_id,
        title=task_in.title,
        description=task_in.description,
        acceptance_criteria=task_in.acceptance_criteria,
        status=task_in.status,
        priority=task_in.priority,
        assignee_id=task_in.assignee_id,
        creator_id=current_user.id,
        reviewer_id=task_in.reviewer_id,
        estimated_hours=task_in.estimated_hours,
        start_date=task_in.start_date,
        due_date=task_in.due_date,
        task_number=next_number,
        git_refs=[],
    )
    db.add(task)
    await db.commit()

    # Re-fetch task
    full_task = await check_task_access(task_id, current_user, db)

    # Notify assignee if assigned
    if task_in.assignee_id and task_in.assignee_id != current_user.id:
        await create_notification(
            db=db,
            user_id=task_in.assignee_id,
            type=NotificationType.TASK_ASSIGNED,
            title="Task Assigned",
            body=f"You have been assigned to task #{next_number}: {task.title}",
            related_task_id=task.id,
            related_project_id=task.project_id,
        )

    # Check for @mentions in task description
    if task_in.description:
        mentions = re.findall(r"@([a-zA-Z0-9_]+)", task_in.description)
        for username in set(mentions):
            u_res = await db.execute(select(User).where(User.username == username))
            mentioned_user = u_res.scalar_one_or_none()
            if mentioned_user and mentioned_user.id != current_user.id and mentioned_user.id != task_in.assignee_id:
                await create_notification(
                    db=db,
                    user_id=mentioned_user.id,
                    type=NotificationType.COMMENT_MENTION,
                    title="Mentioned in Task Description",
                    body=f"{current_user.username} mentioned you in task #{next_number}: {task.title}",
                    related_task_id=task.id,
                    related_project_id=task.project_id,
                )

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="CREATE_TASK",
        resource_type="TASK",
        resource_id=str(task.id),
        changes={"title": task.title, "task_number": next_number},
        ip_address=client_ip,
    )

    return full_task


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await check_task_access(task_id, current_user, db)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    task_in: TaskUpdate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    task = await check_task_access(task_id, current_user, db)
    old_assignee = task.assignee_id

    changes: dict[str, Any] = {}
    for field, value in task_in.model_dump(exclude_unset=True).items():
        changes[field] = str(value)
        setattr(task, field, value)

    # Handle completion timestamp
    if task_in.status == TaskStatus.DONE and not task.completed_at:
        task.completed_at = datetime.now(timezone.utc)
    elif task_in.status and task_in.status != TaskStatus.DONE:
        task.completed_at = None

    await db.commit()
    await db.refresh(task)

    # Notify new assignee if changed
    if task.assignee_id and task.assignee_id != old_assignee and task.assignee_id != current_user.id:
        await create_notification(
            db=db,
            user_id=task.assignee_id,
            type=NotificationType.TASK_ASSIGNED,
            title="Task Re-assigned",
            body=f"You have been assigned to task #{task.task_number}: {task.title}",
            related_task_id=task.id,
            related_project_id=task.project_id,
        )

    # Check for @mentions in updated description
    if task_in.description:
        mentions = re.findall(r"@([a-zA-Z0-9_]+)", task_in.description)
        for username in set(mentions):
            u_res = await db.execute(select(User).where(User.username == username))
            mentioned_user = u_res.scalar_one_or_none()
            if mentioned_user and mentioned_user.id != current_user.id and mentioned_user.id != task.assignee_id:
                await create_notification(
                    db=db,
                    user_id=mentioned_user.id,
                    type=NotificationType.COMMENT_MENTION,
                    title="Mentioned in Task",
                    body=f"{current_user.username} mentioned you in task #{task.task_number}: {task.title}",
                    related_task_id=task.id,
                    related_project_id=task.project_id,
                )

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UPDATE_TASK",
        resource_type="TASK",
        resource_id=str(task.id),
        changes=changes,
        ip_address=client_ip,
    )

    return await check_task_access(task_id, current_user, db)


@router.patch("/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: uuid.UUID,
    status_update: TaskStatusUpdate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    task = await check_task_access(task_id, current_user, db)
    old_status = task.status
    task.status = status_update.status

    if status_update.status == TaskStatus.DONE:
        task.completed_at = datetime.now(timezone.utc)
    else:
        task.completed_at = None

    await db.commit()
    await db.refresh(task)

    # Trigger notifications based on transitions
    if status_update.status == TaskStatus.BLOCKED and task.assignee_id:
        await create_notification(
            db=db,
            user_id=task.creator_id,
            type=NotificationType.TASK_BLOCKED,
            title="Task Blocked",
            body=f"Task #{task.task_number} '{task.title}' was marked as BLOCKED by {current_user.username}",
            related_task_id=task.id,
            related_project_id=task.project_id,
        )
    elif status_update.status == TaskStatus.IN_REVIEW and task.reviewer_id:
        await create_notification(
            db=db,
            user_id=task.reviewer_id,
            type=NotificationType.REVIEW_REQUESTED,
            title="Review Requested",
            body=f"Review requested for task #{task.task_number}: '{task.title}'",
            related_task_id=task.id,
            related_project_id=task.project_id,
        )

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="TRANSITION_TASK_STATUS",
        resource_type="TASK",
        resource_id=str(task.id),
        changes={"from": old_status.value, "to": status_update.status.value},
        ip_address=client_ip,
    )

    return await check_task_access(task_id, current_user, db)


@router.post("/{task_id}/git-ref", response_model=TaskResponse)
async def add_task_git_ref(
    task_id: uuid.UUID,
    data: dict,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually associates a Git push or commit reference with a task.
    """
    task = await check_task_access(task_id, current_user, db)

    current_refs = list(task.git_refs or [])
    sha = data.get("commit_sha", "").strip()
    branch = data.get("branch", "main").strip()
    msg = data.get("message", "").strip()
    url = data.get("url", "").strip()

    new_ref = {
        "id": str(uuid.uuid4()),
        "commit_sha": sha,
        "branch": branch,
        "message": msg,
        "url": url,
        "added_by": current_user.username,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    current_refs.append(new_ref)
    task.git_refs = current_refs

    # Automatically add a comment detailing the push
    sha_display = sha[:8] if sha else "Push"
    comment_content = f"🔗 **Git Reference Linked** by @{current_user.username}:\nCommit: `{sha_display}` (branch: `{branch}`)\n\n> {msg or 'No commit message specified'}"
    comment = TaskComment(
        id=uuid.uuid4(),
        task_id=task.id,
        user_id=current_user.id,
        content=comment_content,
    )
    db.add(comment)

    await db.commit()
    await db.refresh(task)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="ADD_TASK_GIT_REF",
        resource_type="TASK",
        resource_id=str(task.id),
        changes=new_ref,
        ip_address=client_ip,
    )

    return await check_task_access(task_id, current_user, db)


@router.delete("/{task_id}")
async def delete_task(
    task_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    task = await check_task_access(task_id, current_user, db)

    # Restrict deletion to Admin, Project Manager, or the Task Creator
    if current_user.role != UserRole.ADMIN:
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == task.project_id,
            ProjectMember.user_id == current_user.id,
        )
        mem_res = await db.execute(mem_stmt)
        mem = mem_res.scalar_one_or_none()
        is_manager = mem and mem.role == ProjectRole.MANAGER
        is_creator = task.creator_id == current_user.id
        if not (is_manager or is_creator):
            raise ForbiddenError("Only project managers, task creators, or administrators can delete tasks")

    task.is_deleted = True
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="DELETE_TASK",
        resource_type="TASK",
        resource_id=str(task_id),
        ip_address=client_ip,
    )

    return {"message": "Task deleted successfully"}


# Comments
@router.get("/{task_id}/comments", response_model=list[TaskCommentResponse])
async def list_task_comments(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await check_task_access(task_id, current_user, db)
    stmt = (
        select(TaskComment)
        .options(selectinload(TaskComment.user))
        .where(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.asc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/{task_id}/comments", response_model=TaskCommentResponse, status_code=status.HTTP_201_CREATED)
async def create_task_comment(
    task_id: uuid.UUID,
    comment_in: TaskCommentCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    task = await check_task_access(task_id, current_user, db)

    comment = TaskComment(
        id=uuid.uuid4(),
        task_id=task_id,
        user_id=current_user.id,
        content=comment_in.content,
    )
    db.add(comment)
    await db.commit()

    # Check for @mentions
    mentions = re.findall(r"@([a-zA-Z0-9_]+)", comment_in.content)
    for username in set(mentions):
        u_res = await db.execute(select(User).where(User.username == username))
        mentioned_user = u_res.scalar_one_or_none()
        if mentioned_user and mentioned_user.id != current_user.id:
            await create_notification(
                db=db,
                user_id=mentioned_user.id,
                type=NotificationType.COMMENT_MENTION,
                title="Mentioned in Comment",
                body=f"{current_user.username} mentioned you on task #{task.task_number}: {task.title}",
                related_task_id=task.id,
                related_project_id=task.project_id,
            )

    # Re-fetch comment
    stmt = (
        select(TaskComment)
        .options(selectinload(TaskComment.user))
        .where(TaskComment.id == comment.id)
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.put("/{task_id}/comments/{comment_id}", response_model=TaskCommentResponse)
async def update_task_comment(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    comment_in: TaskCommentUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await check_task_access(task_id, current_user, db)
    stmt = (
        select(TaskComment)
        .options(selectinload(TaskComment.user))
        .where(TaskComment.id == comment_id, TaskComment.task_id == task_id)
    )
    res = await db.execute(stmt)
    comment = res.scalar_one_or_none()
    if not comment:
        raise NotFoundError("Comment not found")

    if comment.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise ForbiddenError("Cannot edit another user's comment")

    comment.content = comment_in.content
    comment.is_edited = True
    await db.commit()
    await db.refresh(comment)
    return comment


@router.delete("/{task_id}/comments/{comment_id}")
async def delete_task_comment(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await check_task_access(task_id, current_user, db)
    stmt = select(TaskComment).where(TaskComment.id == comment_id, TaskComment.task_id == task_id)
    res = await db.execute(stmt)
    comment = res.scalar_one_or_none()
    if not comment:
        raise NotFoundError("Comment not found")

    if comment.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise ForbiddenError("Cannot delete another user's comment")

    await db.delete(comment)
    await db.commit()
    return {"message": "Comment deleted successfully"}


# Dependencies
@router.get("/{task_id}/dependencies", response_model=list[TaskDependencyResponse])
async def list_task_dependencies(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await check_task_access(task_id, current_user, db)
    stmt = select(TaskDependency).where(TaskDependency.task_id == task_id)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/{task_id}/dependencies", response_model=TaskDependencyResponse)
async def create_task_dependency(
    task_id: uuid.UUID,
    dep_in: TaskDependencyCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    task = await check_task_access(task_id, current_user, db)
    depends_on_task = await check_task_access(dep_in.depends_on_task_id, current_user, db)

    if task.id == depends_on_task.id:
        raise ValidationError("A task cannot depend on itself")

    # Check for duplicate
    dup_stmt = select(TaskDependency).where(
        TaskDependency.task_id == task_id,
        TaskDependency.depends_on_task_id == dep_in.depends_on_task_id,
    )
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise ValidationError("Dependency already exists")

    dependency = TaskDependency(
        id=uuid.uuid4(),
        task_id=task_id,
        depends_on_task_id=dep_in.depends_on_task_id,
        dependency_type=dep_in.dependency_type,
    )
    db.add(dependency)
    await db.commit()
    await db.refresh(dependency)
    return dependency


@router.delete("/{task_id}/dependencies/{dependency_id}")
async def delete_task_dependency(
    task_id: uuid.UUID,
    dependency_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await check_task_access(task_id, current_user, db)
    stmt = select(TaskDependency).where(
        TaskDependency.id == dependency_id, TaskDependency.task_id == task_id
    )
    res = await db.execute(stmt)
    dependency = res.scalar_one_or_none()
    if not dependency:
        raise NotFoundError("Dependency not found")

    await db.delete(dependency)
    await db.commit()
    return {"message": "Dependency removed successfully"}


# Stale Task Pending Reminder & Escalation Endpoint
@router.post("/check-stale-notifications")
async def check_stale_task_notifications(
    request: Request,
    hours_threshold: Optional[int] = Query(None, ge=1, le=720),
    force_all: bool = Query(False, description="If true, reminds all pending tasks regardless of update timestamp"),
    project_id: Optional[uuid.UUID] = Query(None, description="Optional project ID to filter reminders for a specific project"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Scans for pending engineering tasks (TODO, IN_PROGRESS, IN_REVIEW, BLOCKED).
    Dispatches reminder email simultaneously to ALL assigned engineers and project team members in TO,
    with Project Managers in CC, directing them to record daily progress and timesheets.
    """
    threshold_hours = hours_threshold if hours_threshold is not None else settings.STALE_TASK_HOURS_THRESHOLD
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=threshold_hours)

    # 1. Project-specific reminder (e.g. from Project Detail page "Send Pending Reminders")
    if project_id:
        proj_stmt = (
            select(Project)
            .options(selectinload(Project.members).selectinload(ProjectMember.user))
            .where(Project.id == project_id)
        )
        proj_res = await db.execute(proj_stmt)
        project = proj_res.scalar_one_or_none()
        if not project:
            raise NotFoundError("Project not found")

        tasks_stmt = (
            select(Task)
            .options(selectinload(Task.assignee))
            .where(Task.project_id == project_id, Task.status != TaskStatus.DONE)
        )
        if not force_all:
            tasks_stmt = tasks_stmt.where(or_(Task.updated_at == None, Task.updated_at <= cutoff_time))

        pending_tasks = (await db.execute(tasks_stmt)).scalars().all()

        if not pending_tasks:
            return {
                "status": "success",
                "message": "No pending or stale tasks in this project.",
                "reminders_sent": 0,
                "recipients": [],
                "cc_recipients": [],
            }

        # Collect TO recipients: all project members with role MEMBER, plus all assignees of pending tasks
        to_emails: list[str] = []
        to_names: list[str] = []
        to_user_ids: list[uuid.UUID] = []

        for m in project.members:
            if m.role == ProjectRole.MEMBER and m.user and m.user.email and m.user.is_active:
                if m.user.email not in to_emails:
                    to_emails.append(m.user.email)
                    to_names.append(m.user.full_name or m.user.username)
                    to_user_ids.append(m.user.id)

        for t in pending_tasks:
            if t.assignee and t.assignee.email and t.assignee.is_active:
                if t.assignee.email not in to_emails:
                    to_emails.append(t.assignee.email)
                    to_names.append(t.assignee.full_name or t.assignee.username)
                    to_user_ids.append(t.assignee.id)

        # Fallback if no members are marked as MEMBER: include all assignees or active members
        if not to_emails:
            for m in project.members:
                if m.user and m.user.email and m.user.is_active:
                    to_emails.append(m.user.email)
                    to_names.append(m.user.full_name or m.user.username)
                    to_user_ids.append(m.user.id)

        # Collect CC recipients: project managers
        cc_emails: list[str] = []
        manager_names: list[str] = []
        for m in project.members:
            if m.role == ProjectRole.MANAGER and m.user and m.user.email and m.user.is_active:
                if m.user.email not in cc_emails and m.user.email not in to_emails:
                    cc_emails.append(m.user.email)
                    manager_names.append(m.user.full_name or m.user.username)

        # Ensure current user (e.g. manager triggering this) is in CC if not in TO
        if current_user.email and current_user.email not in to_emails and current_user.email not in cc_emails:
            cc_emails.append(current_user.email)
            manager_names.append(current_user.full_name or current_user.username)

        task_summaries = [
            {
                "number": t.task_number,
                "title": t.title,
                "status": t.status.value,
                "priority": t.priority.value,
                "assignee_name": t.assignee.full_name or t.assignee.username if t.assignee else "Unassigned",
                "due_date": str(t.due_date) if t.due_date else "Not set",
            }
            for t in pending_tasks
        ]

        subject, body_text, body_html = build_project_team_pending_reminder_email(
            project_name=project.name,
            recipient_names=to_names,
            tasks=task_summaries,
            manager_names=manager_names,
            project_id=str(project.id),
        )

        email_sent = send_email(
            to_email=to_emails,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            cc_emails=cc_emails,
        )

        # In-app notifications
        for uid in to_user_ids:
            await create_notification(
                db=db,
                user_id=uid,
                type=NotificationType.TASK_OVERDUE,
                title=f"Pending Tasks Reminder: {project.name}",
                body=f"You have {len(pending_tasks)} pending task(s) requiring daily updates in project '{project.name}'.",
                related_project_id=project.id,
            )

        client_ip = request.client.host if request.client else None
        await log_audit(
            db=db,
            user_id=current_user.id,
            action="PROJECT_PENDING_REMINDER_SENT",
            resource_type="PROJECT",
            resource_id=str(project.id),
            changes={
                "project_name": project.name,
                "to_recipients": to_emails,
                "cc_recipients": cc_emails,
                "pending_tasks_count": len(pending_tasks),
                "email_dispatched": email_sent,
            },
            ip_address=client_ip,
        )

        return {
            "status": "success",
            "project_name": project.name,
            "reminders_sent": len(to_emails) if email_sent else 0,
            "pending_tasks_count": len(pending_tasks),
            "recipients": to_emails,
            "cc_recipients": cc_emails,
            "email_dispatched": email_sent,
        }

    # 2. Global reminder across all projects with pending tasks
    tasks_stmt = (
        select(Task)
        .options(
            selectinload(Task.assignee),
            selectinload(Task.project).selectinload(Project.members).selectinload(ProjectMember.user),
        )
        .where(Task.status != TaskStatus.DONE)
    )
    if not force_all:
        tasks_stmt = tasks_stmt.where(or_(Task.updated_at == None, Task.updated_at <= cutoff_time))

    stale_tasks = (await db.execute(tasks_stmt)).scalars().all()

    # Group pending tasks by project
    project_task_map: dict[uuid.UUID, list[Task]] = {}
    for t in stale_tasks:
        if t.project:
            project_task_map.setdefault(t.project_id, []).append(t)

    total_reminders = 0
    all_notified: list[str] = []
    all_ccs: list[str] = []

    for pid, p_tasks in project_task_map.items():
        proj = p_tasks[0].project
        to_emails = []
        to_names = []
        to_user_ids = []

        for m in proj.members:
            if m.role == ProjectRole.MEMBER and m.user and m.user.email and m.user.is_active:
                if m.user.email not in to_emails:
                    to_emails.append(m.user.email)
                    to_names.append(m.user.full_name or m.user.username)
                    to_user_ids.append(m.user.id)

        for t in p_tasks:
            if t.assignee and t.assignee.email and t.assignee.is_active:
                if t.assignee.email not in to_emails:
                    to_emails.append(t.assignee.email)
                    to_names.append(t.assignee.full_name or t.assignee.username)
                    to_user_ids.append(t.assignee.id)

        if not to_emails:
            continue

        cc_emails = []
        manager_names = []
        for m in proj.members:
            if m.role == ProjectRole.MANAGER and m.user and m.user.email and m.user.is_active:
                if m.user.email not in cc_emails and m.user.email not in to_emails:
                    cc_emails.append(m.user.email)
                    manager_names.append(m.user.full_name or m.user.username)

        task_summaries = [
            {
                "number": t.task_number,
                "title": t.title,
                "status": t.status.value,
                "priority": t.priority.value,
                "assignee_name": t.assignee.full_name or t.assignee.username if t.assignee else "Unassigned",
                "due_date": str(t.due_date) if t.due_date else "Not set",
            }
            for t in p_tasks
        ]

        subject, body_text, body_html = build_project_team_pending_reminder_email(
            project_name=proj.name,
            recipient_names=to_names,
            tasks=task_summaries,
            manager_names=manager_names,
            project_id=str(proj.id),
        )

        email_sent = send_email(
            to_email=to_emails,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            cc_emails=cc_emails,
        )

        for uid in to_user_ids:
            await create_notification(
                db=db,
                user_id=uid,
                type=NotificationType.TASK_OVERDUE,
                title=f"Pending Tasks Reminder: {proj.name}",
                body=f"You have {len(p_tasks)} pending task(s) requiring daily updates in project '{proj.name}'.",
                related_project_id=proj.id,
            )

        if email_sent:
            total_reminders += len(to_emails)
            all_notified.extend(to_emails)
            all_ccs.extend(cc_emails)

    return {
        "status": "success",
        "reminders_sent": total_reminders,
        "recipients": list(dict.fromkeys(all_notified)),
        "cc_recipients": list(dict.fromkeys(all_ccs)),
    }


@router.post("/trigger-morning-reminder")
async def trigger_morning_reminder(
    force_all: bool = Query(False, description="Send reminder even if user already logged in today"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Morning Reminder (8:30 AM - 9:30 AM):
    Identifies active engineers, reminds them to log into PMS, plan their day, and review priority tasks.
    """
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    users_stmt = select(User).where(User.is_active == True)
    if not force_all:
        users_stmt = users_stmt.where(
            or_(User.last_login == None, User.last_login < today_start)
        )
    users_res = await db.execute(users_stmt)
    users = users_res.scalars().all()

    reminders_sent = 0
    notified_users = []
    for u in users:
        # Get active tasks assigned to this user
        tasks_stmt = (
            select(Task)
            .where(
                Task.assignee_id == u.id,
                Task.status != TaskStatus.DONE,
            )
            .order_by(Task.priority.desc())
            .limit(5)
        )
        tasks_res = await db.execute(tasks_stmt)
        user_tasks = tasks_res.scalars().all()
        task_titles = [f"#{t.task_number} {t.title} ({t.priority.value})" for t in user_tasks]

        subj, txt, html = build_morning_login_reminder_email(
            user_name=u.full_name or u.username,
            tasks_count=len(user_tasks),
            pending_tasks_titles=task_titles,
        )
        email_sent = send_email(to_email=u.email, subject=subj, body_text=txt, body_html=html)

        await create_notification(
            db=db,
            user_id=u.id,
            type=NotificationType.TASK_ASSIGNED,
            title="Good Morning! Daily Focus Plan",
            body=f"You have {len(user_tasks)} pending tasks today. Open your Day Plan in PMS to start your session.",
        )
        reminders_sent += 1
        notified_users.append({
            "user_id": str(u.id),
            "username": u.username,
            "email": u.email,
            "tasks_count": len(user_tasks),
            "email_dispatched": email_sent,
        })

    return {
        "status": "success",
        "reminders_sent": reminders_sent,
        "users": notified_users,
    }


@router.post("/trigger-evening-reminder")
async def trigger_evening_reminder(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Evening Wrap-Up & Git Push Reminder (4:00 PM - 5:30 PM):
    Reminds engineers with active tasks to push their git commits and log daily bench updates/timesheets.
    At 5:30 PM, escalates any task with zero daily updates to the engineer with PM in CC.
    """
    tasks_stmt = (
        select(Task)
        .options(
            selectinload(Task.assignee),
            selectinload(Task.project).selectinload(Project.members).selectinload(ProjectMember.user),
        )
        .where(
            Task.status != TaskStatus.DONE,
            Task.assignee_id.isnot(None),
        )
    )
    tasks_res = await db.execute(tasks_stmt)
    active_tasks = tasks_res.scalars().all()

    # Group by assignee
    user_task_map: dict[uuid.UUID, list[Task]] = {}
    for t in active_tasks:
        if t.assignee:
            user_task_map.setdefault(t.assignee.id, []).append(t)

    reminders_sent = 0
    processed = []
    for uid, u_tasks in user_task_map.items():
        assignee = u_tasks[0].assignee
        # Collect managers across projects for CC
        manager_emails = set()
        manager_names = set()
        for t in u_tasks:
            if t.project:
                for m in t.project.members:
                    if m.role == ProjectRole.MANAGER and m.user_id != assignee.id and m.user:
                        manager_emails.add(m.user.email)
                        manager_names.add(m.user.full_name)

        task_summaries = [
            {"number": t.task_number, "title": t.title, "status": t.status.value}
            for t in u_tasks
        ]

        subj, txt, html = build_evening_push_reminder_email(
            assignee_name=assignee.full_name or assignee.username,
            tasks=task_summaries,
            manager_names=list(manager_names),
        )
        email_sent = send_email(
            to_email=assignee.email,
            subject=subj,
            body_text=txt,
            body_html=html,
            cc_emails=list(manager_emails),
        )

        await create_notification(
            db=db,
            user_id=assignee.id,
            type=NotificationType.TASK_OVERDUE,
            title="Evening Wrap-up: Push Git & Update Tasks",
            body=f"Please push your commits (e.g. #task) and post today's bench comments on your {len(u_tasks)} active task(s).",
        )
        reminders_sent += 1
        processed.append({
            "assignee": assignee.username,
            "email": assignee.email,
            "tasks_count": len(u_tasks),
            "manager_ccs": list(manager_emails),
            "email_dispatched": email_sent,
        })

    return {
        "status": "success",
        "reminders_sent": reminders_sent,
        "assignees": processed,
    }



from pydantic import BaseModel
from app.services.email_service import build_delay_inquiry_email


class DelayInquiryRequest(BaseModel):
    message: Optional[str] = None
    urgency: Optional[str] = "HIGH"


@router.post("/{task_id}/delay-inquiry")
async def send_delay_inquiry(
    task_id: uuid.UUID,
    inquiry_data: DelayInquiryRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Dispatches an official delay explanation inquiry to the assigned engineer.
    Also logs an audit comment on the task and triggers an in-app notification.
    """
    stmt = (
        select(Task)
        .options(
            selectinload(Task.assignee),
            selectinload(Task.project).selectinload(Project.members).selectinload(ProjectMember.user),
        )
        .where(Task.id == task_id)
    )
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise NotFoundError("Task not found")

    if not task.assignee:
        raise ValidationError("Cannot send delay inquiry for an unassigned task.")

    # Restrict delay inquiry to Admin or Project Manager of this project
    if current_user.role != UserRole.ADMIN:
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == task.project_id,
            ProjectMember.user_id == current_user.id,
        )
        mem_res = await db.execute(mem_stmt)
        mem = mem_res.scalar_one_or_none()
        if not mem or mem.role != ProjectRole.MANAGER:
            raise ForbiddenError("Only project managers or administrators can issue delay inquiries")

        if current_user.workspace_id and task.project and task.project.workspace_id and current_user.workspace_id != task.project.workspace_id:
            raise ForbiddenError("Access denied: Project does not belong to your assigned workspace")

    # Collect project managers for CC
    manager_emails = set()
    manager_names = set()
    if task.project:
        for m in task.project.members:
            if m.role == ProjectRole.MANAGER and m.user and m.user_id != task.assignee.id:
                manager_emails.add(m.user.email)
                manager_names.add(m.user.full_name)

    if current_user.email != task.assignee.email:
        manager_emails.add(current_user.email)
        manager_names.add(current_user.full_name)

    due_str = task.due_date.strftime("%Y-%m-%d") if task.due_date else "Not set"
    subj, txt, html = build_delay_inquiry_email(
        assignee_name=task.assignee.full_name or task.assignee.username,
        task_number=task.task_number,
        task_title=task.title,
        project_name=task.project.name if task.project else "Engineering Project",
        status=task.status.value,
        priority=task.priority.value,
        due_date=due_str,
        task_id=str(task.id),
        sender_name=current_user.full_name,
        custom_inquiry=inquiry_data.message,
        manager_names=list(manager_names),
    )

    email_sent = send_email(
        to_email=task.assignee.email,
        subject=subj,
        body_text=txt,
        body_html=html,
        cc_emails=list(manager_emails),
    )

    inquiry_note = inquiry_data.message or "Please report reason for schedule delay and current technical roadblocks."
    comment = TaskComment(
        id=uuid.uuid4(),
        task_id=task.id,
        user_id=current_user.id,
        content=f"⚠️ **[MANAGEMENT DELAY INQUIRY dispatched by {current_user.full_name}]**\n\n{inquiry_note}",
    )
    db.add(comment)

    await create_notification(
        db=db,
        user_id=task.assignee.id,
        type=NotificationType.TASK_OVERDUE,
        title=f"Delay Inquiry on #ENG-{str(task.task_number).zfill(3)}",
        body=f"{current_user.full_name} has requested an immediate explanation for the delay on task: {task.title}",
    )

    await db.commit()

    return {
        "status": "success",
        "message": f"Delay inquiry dispatched to {task.assignee.full_name} ({task.assignee.email}) with managers in CC.",
        "email_dispatched": email_sent,
        "recipient": task.assignee.email,
        "ccs": list(manager_emails),
    }
