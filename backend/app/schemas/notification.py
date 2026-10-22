import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.models.notification import NotificationType


class NotificationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    type: NotificationType
    title: str
    body: str
    is_read: bool
    related_task_id: Optional[uuid.UUID] = None
    related_project_id: Optional[uuid.UUID] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationUnreadCountResponse(BaseModel):
    unread_count: int
