from datetime import date, timedelta
from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db
from app.models.audit import AuditLog
from app.models.project import Project, ProjectMember, ProjectStatus
from app.models.task import Task, TaskComment, TaskStatus
from app.models.time_entry import TimeEntry
from app.models.user import User, UserRole
from app.schemas.audit import AuditLogResponse
from app.schemas.dashboard import (
    DashboardActivityResponse,
    DashboardStatsResponse,
    UserWorkload,
)
from app.schemas.task import TaskResponse

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    next_week = today + timedelta(days=7)
    start_of_week = today - timedelta(days=today.weekday())

    is_admin = current_user.role == UserRole.ADMIN

    # Base project query
    proj_query = select(Project.id)
    if not is_admin:
        proj_query = proj_query.join(Project.members).where(ProjectMember.user_id == current_user.id)
    elif current_user.workspace_id:
        proj_query = proj_query.where(Project.workspace_id == current_user.workspace_id)
    user_project_ids = (await db.execute(proj_query)).scalars().all()

    # Total projects & active projects
    if is_admin:
        if current_user.workspace_id:
            total_p_stmt = select(func.count(Project.id)).where(Project.workspace_id == current_user.workspace_id)
            active_p_stmt = select(func.count(Project.id)).where(
                Project.workspace_id == current_user.workspace_id, Project.status == ProjectStatus.ACTIVE
            )
        else:
            total_p_stmt = select(func.count(Project.id))
            active_p_stmt = select(func.count(Project.id)).where(Project.status == ProjectStatus.ACTIVE)
    else:
        total_p_stmt = select(func.count(Project.id)).where(Project.id.in_(user_project_ids))
        active_p_stmt = select(func.count(Project.id)).where(
            Project.id.in_(user_project_ids), Project.status == ProjectStatus.ACTIVE
        )

    total_projects = (await db.execute(total_p_stmt)).scalar_one()
    active_projects = (await db.execute(active_p_stmt)).scalar_one()

    # Tasks by status
    task_status_stmt = select(Task.status, func.count(Task.id)).where(Task.is_deleted == False)
    if not is_admin:
        task_status_stmt = task_status_stmt.where(Task.project_id.in_(user_project_ids))
    elif current_user.workspace_id:
        task_status_stmt = task_status_stmt.join(Project, Project.id == Task.project_id).where(
            Project.workspace_id == current_user.workspace_id
        )
    task_status_stmt = task_status_stmt.group_by(Task.status)
    task_status_res = await db.execute(task_status_stmt)

    tasks_by_status = {s.value: 0 for s in TaskStatus}
    for st, count in task_status_res.all():
        tasks_by_status[st.value] = count

    # Overdue tasks
    overdue_stmt = select(func.count(Task.id)).where(
        Task.is_deleted == False,
        Task.due_date < today,
        Task.status != TaskStatus.DONE,
    )
    if not is_admin:
        overdue_stmt = overdue_stmt.where(Task.project_id.in_(user_project_ids))
    elif current_user.workspace_id:
        overdue_stmt = overdue_stmt.join(Project, Project.id == Task.project_id).where(
            Project.workspace_id == current_user.workspace_id
        )
    overdue_tasks = (await db.execute(overdue_stmt)).scalar_one()

    # Upcoming deadlines (due in next 7 days)
    upcoming_stmt = (
        select(Task)
        .options(
            selectinload(Task.creator),
            selectinload(Task.assignee),
            selectinload(Task.reviewer),
            selectinload(Task.comments).selectinload(TaskComment.user),
            selectinload(Task.dependencies),
        )
        .where(
            Task.is_deleted == False,
            Task.due_date >= today,
            Task.due_date <= next_week,
            Task.status != TaskStatus.DONE,
        )
    )
    if not is_admin:
        upcoming_stmt = upcoming_stmt.where(Task.project_id.in_(user_project_ids))
    elif current_user.workspace_id:
        upcoming_stmt = upcoming_stmt.join(Project, Project.id == Task.project_id).where(
            Project.workspace_id == current_user.workspace_id
        )
    upcoming_stmt = upcoming_stmt.order_by(Task.due_date.asc()).limit(10)
    upcoming_res = await db.execute(upcoming_stmt)
    upcoming_deadlines = [TaskResponse.model_validate(t) for t in upcoming_res.scalars().all()]

    # Recent activity (last 20 audit log entries)
    audit_stmt = (
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .order_by(AuditLog.created_at.desc())
        .limit(20)
    )
    if not is_admin:
        if current_user.workspace_id:
            audit_stmt = audit_stmt.join(AuditLog.user).where(User.workspace_id == current_user.workspace_id)
        else:
            audit_stmt = audit_stmt.where(AuditLog.id == None)
    elif current_user.workspace_id:
        audit_stmt = audit_stmt.join(AuditLog.user).where(User.workspace_id == current_user.workspace_id)
    audit_res = await db.execute(audit_stmt)
    recent_activity = [AuditLogResponse.model_validate(a) for a in audit_res.scalars().all()]

    # Workload by user
    workload_stmt = (
        select(User.id, User.username, User.full_name, func.count(Task.id))
        .join(Task, Task.assignee_id == User.id)
        .where(
            User.is_active == True,
            Task.is_deleted == False,
            Task.status != TaskStatus.DONE,
        )
    )
    if not is_admin:
        workload_stmt = workload_stmt.where(Task.project_id.in_(user_project_ids))
    workload_stmt = workload_stmt.group_by(User.id, User.username, User.full_name)
    workload_res = await db.execute(workload_stmt)
    workload_by_user = [
        UserWorkload(
            user_id=str(uid),
            username=uname,
            full_name=fname,
            task_count=cnt,
        )
        for uid, uname, fname, cnt in workload_res.all()
    ]

    # Hours logged this week
    hours_stmt = select(func.coalesce(func.sum(TimeEntry.duration_hours), 0)).where(
        TimeEntry.work_date >= start_of_week
    )
    if not is_admin:
        hours_stmt = hours_stmt.where(TimeEntry.project_id.in_(user_project_ids))
    hours_res = await db.execute(hours_stmt)
    hours_logged_this_week = float(hours_res.scalar_one())

    return DashboardStatsResponse(
        total_projects=total_projects,
        active_projects=active_projects,
        tasks_by_status=tasks_by_status,
        overdue_tasks=overdue_tasks,
        upcoming_deadlines=upcoming_deadlines,
        recent_activity=recent_activity,
        workload_by_user=workload_by_user,
        hours_logged_this_week=hours_logged_this_week,
    )


@router.get("/activity", response_model=DashboardActivityResponse)
async def get_dashboard_activity(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .order_by(AuditLog.created_at.desc())
        .limit(50)
    )
    if current_user.role != UserRole.ADMIN:
        if current_user.workspace_id:
            stmt = stmt.join(AuditLog.user).where(User.workspace_id == current_user.workspace_id)
        else:
            stmt = stmt.where(AuditLog.id == None)
    res = await db.execute(stmt)
    logs = res.scalars().all()
    activities: list[dict[str, Any]] = [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "username": log.user.username if log.user else "System",
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "changes": log.changes,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
    return DashboardActivityResponse(activities=activities)
