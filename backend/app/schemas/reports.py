from datetime import date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class ProjectProgressReport(BaseModel):
    project_id: str
    name: str
    project_name: str
    status: str
    total_tasks: int
    completed: int
    completed_tasks: int
    percentage: float
    progress_percentage: float


class TeamWorkloadReport(BaseModel):
    user_id: str
    username: str
    full_name: str
    role: str
    todo: int = 0
    in_progress: int = 0
    in_review: int = 0
    blocked: int = 0
    done: int = 0
    hours_this_week: float = 0.0
    tasks_by_status: dict[str, int] = {}
    total_tasks: int = 0


class TimeLogReportItem(BaseModel):
    id: str
    project_id: str
    project_name: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    user_id: str
    user_name: str
    work_date: date
    duration_hours: Decimal
    description: Optional[str] = None


class TimeLogPaginationReport(BaseModel):
    items: list[TimeLogReportItem]
    total: int
    page: int
    page_size: int
    pages: int


class OverdueTaskReportItem(BaseModel):
    id: str
    project_id: str
    project_name: str
    task_number: int
    title: str
    status: str
    priority: str
    due_date: Optional[date] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    days_overdue: int
