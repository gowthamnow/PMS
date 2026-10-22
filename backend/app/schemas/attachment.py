import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserResponse


class TaskAttachmentResponse(BaseModel):
    id: uuid.UUID
    task_id: Optional[uuid.UUID] = None
    project_id: uuid.UUID
    user_id: uuid.UUID
    filename: str
    file_size: int
    content_type: str
    created_at: datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class AttachmentQuotaResponse(BaseModel):
    total_used_bytes: int
    total_quota_bytes: int
    used_percentage: float
    remaining_bytes: int
