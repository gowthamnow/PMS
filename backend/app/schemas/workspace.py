from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel, Field


class WorkspaceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None


class WorkspaceResponse(WorkspaceBase):
    id: uuid.UUID
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    project_count: int = 0
    member_count: int = 0

    class Config:
        from_attributes = True


class WorkspaceMemberAssign(BaseModel):
    user_id: uuid.UUID


class WorkspaceSwitchRequest(BaseModel):
    workspace_id: Optional[uuid.UUID] = None
