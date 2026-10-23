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


class AIConfigResponse(BaseModel):
    has_api_key: bool
    provider: str
    model: str
    available_models: List[str] = ["gemini-1.5-pro", "gemini-2.0-flash", "gemini-1.5-flash"]
    features: List[str]


class AIConfigUpdateRequest(BaseModel):
    api_key: str
    model: Optional[str] = "gemini-1.5-pro"
