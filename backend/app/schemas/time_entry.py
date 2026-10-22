import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserResponse


class TimeEntryBase(BaseModel):
    work_date: date
    duration_hours: Decimal = Field(..., gt=0, le=24, decimal_places=2)
    description: Optional[str] = None


class TimeEntryCreate(TimeEntryBase):
    project_id: Optional[uuid.UUID] = None
    task_id: Optional[uuid.UUID] = None


class TimeEntryUpdate(BaseModel):
    work_date: Optional[date] = None
    duration_hours: Optional[Decimal] = Field(None, gt=0, le=24, decimal_places=2)
    description: Optional[str] = None


class TimeEntryResponse(TimeEntryBase):
    id: uuid.UUID
    project_id: uuid.UUID
    task_id: Optional[uuid.UUID] = None
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)
