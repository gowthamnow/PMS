import logging
from typing import Any, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_active_user,
    get_db,
    get_project_member,
)
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.milestone import Milestone
from app.models.project import ProjectMember, ProjectRole
from app.models.user import User, UserRole
from app.schemas.milestone import (
    MilestoneCreate,
    MilestoneResponse,
    MilestoneUpdate,
)
from app.services.audit_service import log_audit

logger = logging.getLogger("milestones_api")

router = APIRouter(prefix="/milestones", tags=["Milestones"])


def _to_uuid(val: Any) -> uuid.UUID:
    if isinstance(val, uuid.UUID):
        return val
    return uuid.UUID(str(val))


@router.get("", response_model=list[MilestoneResponse])
async def list_milestones(
    project_id: str = Query(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        p_uuid = _to_uuid(project_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid project_id")

    if current_user.role != UserRole.ADMIN:
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == p_uuid,
            ProjectMember.user_id == current_user.id,
        )
        mem_res = await db.execute(mem_stmt)
        if not mem_res.scalar_one_or_none():
            raise ForbiddenError("Access denied: You are not a member of this project")

    stmt = (
        select(Milestone)
        .where(Milestone.project_id == p_uuid)
        .order_by(Milestone.due_date.asc().nulls_last())
    )
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("", response_model=MilestoneResponse, status_code=status.HTTP_201_CREATED)
async def create_milestone(
    milestone_in: MilestoneCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    member = await get_project_member(project_id=milestone_in.project_id, current_user=current_user, db=db)
    if current_user.role != UserRole.ADMIN and member.role != ProjectRole.MANAGER:
        raise ForbiddenError("Only project managers or admins can create milestones")

    milestone = Milestone(
        id=uuid.uuid4(),
        project_id=milestone_in.project_id,
        title=milestone_in.title,
        description=milestone_in.description,
        due_date=milestone_in.due_date,
        status=milestone_in.status,
    )
    db.add(milestone)
    await db.commit()
    await db.refresh(milestone)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="CREATE_MILESTONE",
        resource_type="MILESTONE",
        resource_id=str(milestone.id),
        changes={"title": milestone.title},
        ip_address=client_ip,
    )

    return milestone


@router.get("/{milestone_id}", response_model=MilestoneResponse)
async def get_milestone(
    milestone_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        m_uuid = _to_uuid(milestone_id)
    except (ValueError, TypeError):
        raise NotFoundError("Milestone not found")

    res = await db.execute(select(Milestone).where(Milestone.id == m_uuid))
    milestone = res.scalar_one_or_none()
    if not milestone:
        raise NotFoundError("Milestone not found")

    await get_project_member(project_id=milestone.project_id, current_user=current_user, db=db)
    return milestone


@router.put("/{milestone_id}", response_model=MilestoneResponse)
async def update_milestone(
    milestone_id: str,
    milestone_in: MilestoneUpdate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        m_uuid = _to_uuid(milestone_id)
    except (ValueError, TypeError):
        raise NotFoundError("Milestone not found")

    res = await db.execute(select(Milestone).where(Milestone.id == m_uuid))
    milestone = res.scalar_one_or_none()
    if not milestone:
        raise NotFoundError("Milestone not found")

    member = await get_project_member(project_id=milestone.project_id, current_user=current_user, db=db)
    if current_user.role != UserRole.ADMIN and member.role != ProjectRole.MANAGER:
        raise ForbiddenError("Only project managers or admins can update milestones")

    changes = {}
    for field, val in milestone_in.model_dump(exclude_unset=True).items():
        changes[field] = str(val)
        setattr(milestone, field, val)

    await db.commit()
    await db.refresh(milestone)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UPDATE_MILESTONE",
        resource_type="MILESTONE",
        resource_id=str(milestone.id),
        changes=changes,
        ip_address=client_ip,
    )

    return milestone


@router.delete("/{milestone_id}")
async def delete_milestone(
    milestone_id: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        m_uuid = _to_uuid(milestone_id)
    except (ValueError, TypeError):
        raise NotFoundError("Milestone not found")

    res = await db.execute(select(Milestone).where(Milestone.id == m_uuid))
    milestone = res.scalar_one_or_none()
    if not milestone:
        raise NotFoundError("Milestone not found")

    member = await get_project_member(project_id=milestone.project_id, current_user=current_user, db=db)
    if current_user.role != UserRole.ADMIN and member.role != ProjectRole.MANAGER:
        raise ForbiddenError("Only project managers or admins can delete milestones")

    await db.delete(milestone)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="DELETE_MILESTONE",
        resource_type="MILESTONE",
        resource_id=str(milestone_id),
        ip_address=client_ip,
    )

    return {"message": "Milestone deleted successfully"}
