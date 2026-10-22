import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserResponse


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    action: str
    resource_type: str
    resource_id: str
    changes: Optional[Any] = None
    ip_address: Optional[str] = None
    created_at: datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)
