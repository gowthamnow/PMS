import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID,
    type: NotificationType,
    title: str,
    body: str,
    related_task_id: Optional[uuid.UUID] = None,
    related_project_id: Optional[uuid.UUID] = None,
) -> Notification:
    notification = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        is_read=False,
        related_task_id=related_task_id,
        related_project_id=related_project_id,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification
