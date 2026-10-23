import uuid
from typing import Optional, List
from pydantic import BaseModel


class TaskSolveRequest(BaseModel):
    task_id: uuid.UUID
    auto_post_comment: bool = False
    custom_instruction: Optional[str] = None


class CodeFixItem(BaseModel):
    file_path: Optional[str] = None
    description: str
    code_snippet: str
    language: Optional[str] = "typescript"


class TaskSolveResponse(BaseModel):
    task_id: uuid.UUID
    task_title: str
    issue_type: str  # BUG, PERFORMANCE, FEATURE, SCHEMA, HARDWARE
    root_cause: str
    solution_summary: str
    action_plan: List[str]
    code_fixes: List[CodeFixItem]
    testing_steps: List[str]
    formatted_markdown: str
    comment_posted: bool = False
    comment_id: Optional[uuid.UUID] = None
    ai_provider: str = "Google Gemini"
    tokens_used: Optional[int] = None
    remaining_quota: Optional[int] = None


class ProjectCopilotRequest(BaseModel):
    project_id: Optional[uuid.UUID] = None
    problem_description: str
    category: Optional[str] = "GENERAL"  # HARDWARE, FIRMWARE, BUG, ARCHITECTURE, SCHEMATIC
    model: Optional[str] = "gemini-1.5-pro"


class ProjectCopilotResponse(BaseModel):
    project_id: uuid.UUID
    project_name: str
    query: str
    analysis: str
    recommended_solutions: List[str]
    circuit_or_code_advice: Optional[str] = None
    suggested_tasks: List[str]
    formatted_markdown: str
    ai_provider: str = "Google Gemini Advanced (gemini-1.5-pro)"
    tokens_used: Optional[int] = None
    remaining_quota: Optional[int] = None


class AIChatRequest(BaseModel):
    message: str
    project_id: Optional[uuid.UUID] = None
    model: Optional[str] = "gemini-1.5-pro"


class AIChatResponse(BaseModel):
    reply: str
    tokens_used: int
    remaining_quota: int
    ai_provider: str


class AIConfigResponse(BaseModel):
    has_api_key: bool
    provider: str
    model: str
    available_models: List[str] = ["gemini-1.5-pro", "gemini-2.0-flash", "gemini-1.5-flash"]
    features: List[str]
    member_daily_limit: int = 15
    member_max_tokens: int = 250
    user_remaining_quota: Optional[int] = None
    is_admin: bool = False


class AIConfigUpdateRequest(BaseModel):
    api_key: str
    model: Optional[str] = "gemini-1.5-pro"
