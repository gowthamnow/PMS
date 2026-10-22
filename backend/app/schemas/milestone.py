import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

from app.models.milestone import MilestoneStatus


class MilestoneBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    due_date: Optional[date] = None
    status: MilestoneStatus = MilestoneStatus.PENDING


class MilestoneCreate(MilestoneBase):
    project_id: uuid.UUID


class MilestoneUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    due_date: Optional[date] = None
    status: Optional[MilestoneStatus] = None


class MilestoneResponse(MilestoneBase):
    id: uuid.UUID
    project_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
