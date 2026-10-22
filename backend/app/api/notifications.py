import math
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.core.exceptions import NotFoundError
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import (
    NotificationResponse,
    NotificationUnreadCountResponse,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
async def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_read: Optional[bool] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Notification).where(Notification.user_id == current_user.id)
    count_query = select(func.count(Notification.id)).where(Notification.user_id == current_user.id)

    if is_read is not None:
        query = query.where(Notification.is_read == is_read)
        count_query = count_query.where(Notification.is_read == is_read)

    total_res = await db.execute(count_query)
    total = total_res.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Notification.created_at.desc()).offset(offset).limit(page_size)
    items_res = await db.execute(query)
    items = items_res.scalars().all()

    pages = math.ceil(total / page_size) if total > 0 else 0

    return {
        "items": [NotificationResponse.model_validate(n) for n in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


@router.get("/unread-count", response_model=NotificationUnreadCountResponse)
async def get_unread_count(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(func.count(Notification.id)).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    )
    res = await db.execute(stmt)
    count = res.scalar_one()
    return NotificationUnreadCountResponse(unread_count=count)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Notification).where(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    )
    res = await db.execute(stmt)
    notification = res.scalar_one_or_none()
    if not notification:
        raise NotFoundError("Notification not found")

    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification


@router.patch("/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
        .values(is_read=True)
    )
    await db.execute(stmt)
    await db.commit()
    return {"message": "All notifications marked as read"}
