from datetime import date
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
)
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models.project import ProjectMember, ProjectRole
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.user import User, UserRole
from app.schemas.time_entry import (
    TimeEntryCreate,
    TimeEntryResponse,
    TimeEntryUpdate,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/time-entries", tags=["Time Entries"])


@router.get("")
async def list_time_entries(
    project_id: Optional[uuid.UUID] = None,
    task_id: Optional[uuid.UUID] = None,
    user_id: Optional[uuid.UUID] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    eff_start_date = start_date or from_date
    eff_end_date = end_date or to_date
    query = select(TimeEntry).options(selectinload(TimeEntry.user))
    count_query = select(func.count(TimeEntry.id))


    if project_id:
        await get_project_member(project_id=project_id, current_user=current_user, db=db)
        query = query.where(TimeEntry.project_id == project_id)
        count_query = count_query.where(TimeEntry.project_id == project_id)
    else:
        if current_user.role != UserRole.ADMIN:
            user_projects_subq = select(ProjectMember.project_id).where(
                ProjectMember.user_id == current_user.id
            )
            query = query.where(TimeEntry.project_id.in_(user_projects_subq))
            count_query = count_query.where(TimeEntry.project_id.in_(user_projects_subq))

    if task_id:
        query = query.where(TimeEntry.task_id == task_id)
        count_query = count_query.where(TimeEntry.task_id == task_id)

    if user_id:
        query = query.where(TimeEntry.user_id == user_id)
        count_query = count_query.where(TimeEntry.user_id == user_id)

    if eff_start_date:
        query = query.where(TimeEntry.work_date >= eff_start_date)
        count_query = count_query.where(TimeEntry.work_date >= eff_start_date)

    if eff_end_date:
        query = query.where(TimeEntry.work_date <= eff_end_date)
        count_query = count_query.where(TimeEntry.work_date <= eff_end_date)


    total_res = await db.execute(count_query)
    total = total_res.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(TimeEntry.work_date.desc(), TimeEntry.created_at.desc()).offset(offset).limit(page_size)
    items_res = await db.execute(query)
    items = items_res.scalars().all()

    pages = math.ceil(total / page_size) if total > 0 else 0

    return {
        "items": [TimeEntryResponse.model_validate(te) for te in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


@router.post("", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_time_entry(
    entry_in: TimeEntryCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    target_project_id = entry_in.project_id

    if entry_in.task_id:
        task_res = await db.execute(select(Task).where(Task.id == entry_in.task_id))
        task = task_res.scalar_one_or_none()
        if not task:
            raise NotFoundError("Task not found")
        if target_project_id and task.project_id != target_project_id:
            raise ValidationError("Task does not belong to the specified project")
        target_project_id = task.project_id

    if not target_project_id:
        raise ValidationError("Either project_id or task_id must be provided")

    await get_project_member(project_id=target_project_id, current_user=current_user, db=db)

    entry_id = uuid.uuid4()
    entry = TimeEntry(
        id=entry_id,
        project_id=target_project_id,
        task_id=entry_in.task_id,
        user_id=current_user.id,
        work_date=entry_in.work_date,
        duration_hours=entry_in.duration_hours,
        description=entry_in.description,
    )

    db.add(entry)
    await db.commit()

    stmt = select(TimeEntry).options(selectinload(TimeEntry.user)).where(TimeEntry.id == entry_id)
    res = await db.execute(stmt)
    full_entry = res.scalar_one()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="LOG_TIME",
        resource_type="TIME_ENTRY",
        resource_id=str(entry.id),
        changes={"duration_hours": str(entry.duration_hours), "work_date": str(entry.work_date)},
        ip_address=client_ip,
    )

    return full_entry


@router.get("/{entry_id}", response_model=TimeEntryResponse)
async def get_time_entry(
    entry_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TimeEntry).options(selectinload(TimeEntry.user)).where(TimeEntry.id == entry_id)
    res = await db.execute(stmt)
    entry = res.scalar_one_or_none()
    if not entry:
        raise NotFoundError("Time entry not found")

    await get_project_member(project_id=entry.project_id, current_user=current_user, db=db)
    return entry


@router.put("/{entry_id}", response_model=TimeEntryResponse)
async def update_time_entry(
    entry_id: uuid.UUID,
    entry_in: TimeEntryUpdate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TimeEntry).options(selectinload(TimeEntry.user)).where(TimeEntry.id == entry_id)
    res = await db.execute(stmt)
    entry = res.scalar_one_or_none()
    if not entry:
        raise NotFoundError("Time entry not found")

    member = await get_project_member(project_id=entry.project_id, current_user=current_user, db=db)
    is_owner = entry.user_id == current_user.id
    is_manager = member.role == ProjectRole.MANAGER or current_user.role == UserRole.ADMIN

    if not is_owner and not is_manager:
        raise ForbiddenError("Cannot modify another user's time entry")

    changes: dict[str, Any] = {}
    for field, value in entry_in.model_dump(exclude_unset=True).items():
        changes[field] = str(value)
        setattr(entry, field, value)

    await db.commit()
    await db.refresh(entry)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UPDATE_TIME_ENTRY",
        resource_type="TIME_ENTRY",
        resource_id=str(entry.id),
        changes=changes,
        ip_address=client_ip,
    )

    return entry


@router.delete("/{entry_id}")
async def delete_time_entry(
    entry_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TimeEntry).where(TimeEntry.id == entry_id)
    res = await db.execute(stmt)
    entry = res.scalar_one_or_none()
    if not entry:
        raise NotFoundError("Time entry not found")

    member = await get_project_member(project_id=entry.project_id, current_user=current_user, db=db)
    is_owner = entry.user_id == current_user.id
    is_manager = member.role == ProjectRole.MANAGER or current_user.role == UserRole.ADMIN

    if not is_owner and not is_manager:
        raise ForbiddenError("Cannot delete another user's time entry")

    await db.delete(entry)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="DELETE_TIME_ENTRY",
        resource_type="TIME_ENTRY",
        resource_id=str(entry_id),
        ip_address=client_ip,
    )

    return {"message": "Time entry deleted successfully"}
