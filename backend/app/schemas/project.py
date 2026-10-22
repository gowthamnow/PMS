import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.project import ProjectPriority, ProjectRole, ProjectStatus
from app.schemas.user import UserResponse


class ProjectMemberBase(BaseModel):
    user_id: uuid.UUID
    role: ProjectRole = ProjectRole.MEMBER

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v):
        if isinstance(v, str):
            v_upper = v.upper()
            if v_upper in ("ENGINEER", "MEMBER"):
                return ProjectRole.MEMBER
            if v_upper in ("PROJECT_MANAGER", "MANAGER"):
                return ProjectRole.MANAGER
            if v_upper in ("REVIEWER", "VIEWER"):
                return ProjectRole.VIEWER
        return v


class ProjectMemberCreate(ProjectMemberBase):
    pass


class ProjectMemberUpdate(BaseModel):
    role: ProjectRole

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v):
        if isinstance(v, str):
            v_upper = v.upper()
            if v_upper in ("ENGINEER", "MEMBER"):
                return ProjectRole.MEMBER
            if v_upper in ("PROJECT_MANAGER", "MANAGER"):
                return ProjectRole.MANAGER
            if v_upper in ("REVIEWER", "VIEWER"):
                return ProjectRole.VIEWER
        return v


class ProjectMemberResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    role: ProjectRole
    joined_at: datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    objectives: Optional[str] = None
    status: ProjectStatus = ProjectStatus.PLANNING
    priority: ProjectPriority = ProjectPriority.MEDIUM
    start_date: Optional[date] = None
    target_date: Optional[date] = None
    actual_end_date: Optional[date] = None
    image_url: Optional[str] = None
    workspace_id: Optional[uuid.UUID] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    objectives: Optional[str] = None
    status: Optional[ProjectStatus] = None
    priority: Optional[ProjectPriority] = None
    start_date: Optional[date] = None
    target_date: Optional[date] = None
    actual_end_date: Optional[date] = None
    image_url: Optional[str] = None
    workspace_id: Optional[uuid.UUID] = None


class ProjectResponse(ProjectBase):
    id: uuid.UUID
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    workspace_name: Optional[str] = None
    members: list[ProjectMemberResponse] = []

    model_config = ConfigDict(from_attributes=True)


class ProjectStatsResponse(BaseModel):
    project_id: uuid.UUID
    total_tasks: int
    completed_tasks: int
    completion_percentage: float
    tasks_by_status: dict[str, int]
    total_hours_logged: float

    model_config = ConfigDict(from_attributes=True)
