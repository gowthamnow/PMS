import csv
from datetime import date, datetime, timedelta, timezone
import io
import math
from typing import Any, Optional
import uuid

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_active_user,
    get_db,
    require_admin_or_pm,
)
from app.models.project import Project, ProjectMember
from app.models.task import Task, TaskStatus
from app.models.time_entry import TimeEntry
from app.models.user import User, UserRole
from app.schemas.reports import (
    OverdueTaskReportItem,
    ProjectProgressReport,
    TeamWorkloadReport,
    TimeLogPaginationReport,
    TimeLogReportItem,
)

router = APIRouter(prefix="/reports", tags=["Reports"])


def sanitize_csv_cell(val: Any) -> Any:
    """
    Escapes characters that could trigger Formula / CSV Injection (DDE) in spreadsheet software.
    """
    if isinstance(val, str) and val and val[0] in ('=', '+', '-', '@', '\t', '\r', '%'):
        return f"'{val}"
    return val


@router.get("/project-progress", response_model=list[ProjectProgressReport])
async def get_project_progress_report(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Project)
    if current_user.role != UserRole.ADMIN:
        if not current_user.workspace_id:
            return []
        query = query.where(Project.workspace_id == current_user.workspace_id)
        query = query.join(Project.members).where(ProjectMember.user_id == current_user.id)
    p_res = await db.execute(query)
    projects = p_res.scalars().all()

    report: list[ProjectProgressReport] = []
    for p in projects:
        task_stmt = select(Task.status, func.count(Task.id)).where(Task.project_id == p.id).group_by(Task.status)
        task_res = await db.execute(task_stmt)
        total = 0
        done = 0
        for st, count in task_res.all():
            total += count
            if st == TaskStatus.DONE:
                done = count

        pct = round((done / total) * 100, 2) if total > 0 else 0.0
        report.append(
            ProjectProgressReport(
                project_id=str(p.id),
                name=p.name,
                project_name=p.name,
                status=p.status.value,
                total_tasks=total,
                completed=done,
                completed_tasks=done,
                percentage=pct,
                progress_percentage=pct,
            )
        )
    return report


@router.get("/team-workload", response_model=list[TeamWorkloadReport])
async def get_team_workload_report(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    users_stmt = select(User).where(User.is_active == True)
    if current_user.role != UserRole.ADMIN:
        if not current_user.workspace_id:
            return []
        users_stmt = users_stmt.where(User.workspace_id == current_user.workspace_id)
    users_stmt = users_stmt.order_by(User.full_name)
    users_res = await db.execute(users_stmt)
    users = users_res.scalars().all()

    today = date.today()
    start_of_week = today - timedelta(days=today.weekday())

    report: list[TeamWorkloadReport] = []
    for u in users:
        task_stmt = (
            select(Task.status, func.count(Task.id))
            .where(Task.assignee_id == u.id)
            .group_by(Task.status)
        )
        task_res = await db.execute(task_stmt)
        tasks_by_status = {s.value: 0 for s in TaskStatus}
        total = 0
        for st, count in task_res.all():
            tasks_by_status[st.value] = count
            total += count

        # Hours logged this week
        hours_stmt = select(func.coalesce(func.sum(TimeEntry.duration_hours), 0)).where(
            TimeEntry.user_id == u.id,
            TimeEntry.work_date >= start_of_week,
        )
        hours_res = await db.execute(hours_stmt)
        hours_this_week = float(hours_res.scalar_one())

        report.append(
            TeamWorkloadReport(
                user_id=str(u.id),
                username=u.username,
                full_name=u.full_name,
                role=u.role.value,
                todo=tasks_by_status.get(TaskStatus.TODO.value, 0),
                in_progress=tasks_by_status.get(TaskStatus.IN_PROGRESS.value, 0),
                in_review=tasks_by_status.get(TaskStatus.IN_REVIEW.value, 0),
                blocked=tasks_by_status.get(TaskStatus.BLOCKED.value, 0),
                done=tasks_by_status.get(TaskStatus.DONE.value, 0),
                hours_this_week=hours_this_week,
                tasks_by_status=tasks_by_status,
                total_tasks=total,
            )
        )
    return report


@router.get("/time-log", response_model=TimeLogPaginationReport)
async def get_time_log_report(
    user_id: Optional[uuid.UUID] = None,
    project_id: Optional[uuid.UUID] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(TimeEntry)
        .options(
            selectinload(TimeEntry.project),
            selectinload(TimeEntry.task),
            selectinload(TimeEntry.user),
        )
    )
    count_query = select(func.count(TimeEntry.id))

    if current_user.role != UserRole.ADMIN:
        user_proj_subq = select(ProjectMember.project_id).where(ProjectMember.user_id == current_user.id)
        query = query.where(TimeEntry.project_id.in_(user_proj_subq))
        count_query = count_query.where(TimeEntry.project_id.in_(user_proj_subq))

    if user_id:
        query = query.where(TimeEntry.user_id == user_id)
        count_query = count_query.where(TimeEntry.user_id == user_id)
    if project_id:
        query = query.where(TimeEntry.project_id == project_id)
        count_query = count_query.where(TimeEntry.project_id == project_id)
    if start_date:
        query = query.where(TimeEntry.work_date >= start_date)
        count_query = count_query.where(TimeEntry.work_date >= start_date)
    if end_date:
        query = query.where(TimeEntry.work_date <= end_date)
        count_query = count_query.where(TimeEntry.work_date <= end_date)

    total_res = await db.execute(count_query)
    total = total_res.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(TimeEntry.work_date.desc(), TimeEntry.created_at.desc()).offset(offset).limit(page_size)
    res = await db.execute(query)
    entries = res.scalars().all()

    items = [
        TimeLogReportItem(
            id=str(e.id),
            project_id=str(e.project_id),
            project_name=e.project.name if e.project else "Unknown",
            task_id=str(e.task_id) if e.task_id else None,
            task_title=e.task.title if e.task else None,
            user_id=str(e.user_id),
            user_name=e.user.full_name if e.user else "Unknown",
            work_date=e.work_date,
            duration_hours=e.duration_hours,
            description=e.description,
        )
        for e in entries
    ]

    pages = math.ceil(total / page_size) if total > 0 else 0

    return TimeLogPaginationReport(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/overdue-tasks", response_model=list[OverdueTaskReportItem])
async def get_overdue_tasks_report(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    query = (
        select(Task)
        .options(
            selectinload(Task.project),
            selectinload(Task.assignee),
        )
        .where(
            Task.due_date < today,
            Task.status != TaskStatus.DONE,
        )
        .order_by(Task.due_date.asc())
    )

    if current_user.role != UserRole.ADMIN:
        user_proj_subq = select(ProjectMember.project_id).where(ProjectMember.user_id == current_user.id)
        query = query.where(Task.project_id.in_(user_proj_subq))

    res = await db.execute(query)
    tasks = res.scalars().all()

    return [
        OverdueTaskReportItem(
            id=str(t.id),
            project_id=str(t.project_id),
            project_name=t.project.name if t.project else "Unknown",
            task_number=t.task_number,
            title=t.title,
            status=t.status.value,
            priority=t.priority.value,
            due_date=t.due_date,
            assignee_id=str(t.assignee_id) if t.assignee_id else None,
            assignee_name=t.assignee.full_name if t.assignee else "Unassigned",
            days_overdue=(today - t.due_date).days if t.due_date else 0,
        )
        for t in tasks
    ]


async def _build_csv_export(
    export_type: str,
    current_user: User,
    db: AsyncSession,
):
    norm_type = (export_type or "time_log").lower().replace("-", "_")
    if norm_type in ("timelog", "time_entries"):
        norm_type = "time_log"
    elif norm_type in ("workload", "team"):
        norm_type = "team_workload"
    elif norm_type in ("progress", "project", "projects"):
        norm_type = "project_progress"

    output = io.StringIO()
    writer = csv.writer(output)

    if norm_type == "project_progress":
        progress_data = await get_project_progress_report(current_user=current_user, db=db)
        writer.writerow(["Project ID", "Project Name", "Status", "Total Tasks", "Completed Tasks", "Progress %"])
        for p in progress_data:
            writer.writerow([sanitize_csv_cell(c) for c in [p.project_id, p.name, p.status, p.total_tasks, p.completed_tasks, f"{p.percentage}%"]])
        filename = f"project_progress_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    if norm_type == "time_log":
        report_data = await get_time_log_report(current_user=current_user, db=db, page=1, page_size=10000)
        writer.writerow(["ID", "Project", "Task", "User", "Date", "Hours", "Description"])
        for item in report_data.items:
            writer.writerow([sanitize_csv_cell(c) for c in [
                item.id,
                item.project_name,
                item.task_title or "",
                item.user_name,
                str(item.work_date),
                str(item.duration_hours),
                item.description or "",
            ]])

    elif norm_type == "overdue":
        tasks = await get_overdue_tasks_report(current_user=current_user, db=db)
        writer.writerow([
            "ID", "Project", "Task Number", "Title", "Status", "Priority", "Due Date", "Days Overdue", "Assignee"
        ])
        for item in tasks:
            writer.writerow([sanitize_csv_cell(c) for c in [
                item.id,
                item.project_name,
                item.task_number,
                item.title,
                item.status,
                item.priority,
                str(item.due_date) if item.due_date else "",
                item.days_overdue,
                item.assignee_name or "Unassigned",
            ]])

    elif norm_type == "team_workload":
        workloads = await get_team_workload_report(current_user=current_user, db=db)
        writer.writerow([
            "User ID", "Username", "Full Name", "Role", "Total Tasks",
            "TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "Hours This Week"
        ])
        for item in workloads:
            writer.writerow([sanitize_csv_cell(c) for c in [
                item.user_id,
                item.username,
                item.full_name,
                item.role,
                item.total_tasks,
                item.todo,
                item.in_progress,
                item.in_review,
                item.blocked,
                item.done,
                item.hours_this_week,
            ]])

    csv_data = output.getvalue()
    output.close()

    def csv_generator():
        yield csv_data.encode("utf-8")

    return StreamingResponse(
        csv_generator(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={norm_type}_report_{date.today()}.csv"},
    )


@router.get("/export/csv")
async def export_csv(
    type: str = Query(default="time_log"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await _build_csv_export(type, current_user, db)


@router.get("/export/{report_type}")
async def export_report_by_path(
    report_type: str = Path(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await _build_csv_export(report_type, current_user, db)
