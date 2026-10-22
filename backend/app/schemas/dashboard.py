from typing import Any
from pydantic import BaseModel

from app.schemas.audit import AuditLogResponse
from app.schemas.task import TaskResponse


class UserWorkload(BaseModel):
    user_id: str
    username: str
    full_name: str
    task_count: int


class DashboardStatsResponse(BaseModel):
    total_projects: int
    active_projects: int
    tasks_by_status: dict[str, int]
    overdue_tasks: int
    upcoming_deadlines: list[TaskResponse]
    recent_activity: list[AuditLogResponse]
    workload_by_user: list[UserWorkload]
    hours_logged_this_week: float


class DashboardActivityResponse(BaseModel):
    activities: list[Any]
