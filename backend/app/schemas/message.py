import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.user import UserResponse


class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    recipient_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    attachment_url: Optional[str] = None


class MessageResponse(BaseModel):
    id: uuid.UUID
    sender_id: uuid.UUID
    recipient_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    content: str
    attachment_url: Optional[str] = None
    is_read: bool
    created_at: datetime
    sender: Optional[UserResponse] = None
    recipient: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class ConversationResponse(BaseModel):
    id: str  # e.g., 'user_<id>' or 'project_<id>'
    type: str  # 'direct' or 'channel'
    title: str
    subtitle: Optional[str] = None
    avatar_url: Optional[str] = None
    recipient_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
