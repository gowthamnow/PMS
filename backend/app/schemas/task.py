import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.models.task import DependencyType, TaskPriority, TaskStatus
from app.schemas.user import UserResponse


class TaskCommentBase(BaseModel):
    content: str = Field(..., min_length=1)


class TaskCommentCreate(TaskCommentBase):
    pass


class TaskCommentUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class TaskCommentResponse(TaskCommentBase):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    is_edited: bool
    created_at: datetime
    updated_at: datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class TaskDependencyBase(BaseModel):
    depends_on_task_id: uuid.UUID
    dependency_type: DependencyType = DependencyType.BLOCKS


class TaskDependencyCreate(TaskDependencyBase):
    pass


class TaskDependencyResponse(TaskDependencyBase):
    id: uuid.UUID
    task_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    assignee_id: Optional[uuid.UUID] = None
    reviewer_id: Optional[uuid.UUID] = None
    parent_task_id: Optional[uuid.UUID] = None
    estimated_hours: Optional[Decimal] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None


class TaskCreate(TaskBase):
    project_id: uuid.UUID


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee_id: Optional[uuid.UUID] = None
    reviewer_id: Optional[uuid.UUID] = None
    parent_task_id: Optional[uuid.UUID] = None
    estimated_hours: Optional[Decimal] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskResponse(TaskBase):
    id: uuid.UUID
    project_id: uuid.UUID
    creator_id: uuid.UUID
    task_number: int
    git_refs: list[Any] = []
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    creator: Optional[UserResponse] = None
    assignee: Optional[UserResponse] = None
    reviewer: Optional[UserResponse] = None
    comments: list[TaskCommentResponse] = []
    dependencies: list[TaskDependencyResponse] = []

    model_config = ConfigDict(from_attributes=True)
