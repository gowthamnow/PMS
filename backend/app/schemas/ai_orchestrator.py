from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.models.ai_orchestrator import (
    AIAgentRole,
    AIAutonomyLevel,
    AIExecutionStatus,
    AIStepStatus,
)


class AIExecutionStepResponse(BaseModel):
    id: uuid.UUID
    execution_id: uuid.UUID
    step_index: int
    agent_role: AIAgentRole
    status: AIStepStatus
    title: str
    summary: Optional[str] = None
    output_data: Dict[str, Any] = Field(default_factory=dict)
    duration_seconds: float
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AIImplementationPlanResponse(BaseModel):
    id: uuid.UUID
    execution_id: uuid.UUID
    task_id: uuid.UUID
    problem_statement: str
    expected_outcome: str
    acceptance_criteria: List[str] = Field(default_factory=list)
    affected_files: List[str] = Field(default_factory=list)
    planned_steps: List[Dict[str, Any]] = Field(default_factory=list)
    risk_level: str
    risk_rationale: Optional[str] = None
    requires_human_approval: bool
    is_approved: bool
    approved_by_id: Optional[uuid.UUID] = None
    approved_at: Optional[datetime] = None
    feedback: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AIToolInvocationResponse(BaseModel):
    id: uuid.UUID
    execution_id: uuid.UUID
    agent_role: AIAgentRole
    tool_name: str
    input_payload: Dict[str, Any]
    output_summary: Optional[str] = None
    exit_code: int
    is_success: bool
    duration_ms: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AIExecutionCreateRequest(BaseModel):
    task_id: uuid.UUID
    autonomy_level: Optional[int] = AIAutonomyLevel.LEVEL_2_APPROVED_AUTOMATION
    model_override: Optional[str] = None
    custom_instructions: Optional[str] = None


class AIPlanApprovalRequest(BaseModel):
    is_approved: bool
    feedback: Optional[str] = None


class AITaskExecutionResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    task_title: Optional[str] = None
    task_number: Optional[int] = None
    project_id: uuid.UUID
    project_name: Optional[str] = None
    workspace_id: Optional[uuid.UUID] = None
    creator_id: uuid.UUID
    creator_name: Optional[str] = None

    status: AIExecutionStatus
    autonomy_level: int
    current_stage: str
    selected_model: str

    git_branch: Optional[str] = None
    git_base_branch: str
    git_head_commit: Optional[str] = None
    github_pr_number: Optional[int] = None
    github_pr_url: Optional[str] = None
    github_pr_status: str

    is_approved_by_human: bool
    approved_by_id: Optional[uuid.UUID] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    tokens_used: int
    estimated_cost_usd: float
    duration_seconds: float
    retry_count: int
    error_message: Optional[str] = None

    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    steps: List[AIExecutionStepResponse] = Field(default_factory=list)
    plan: Optional[AIImplementationPlanResponse] = None

    model_config = ConfigDict(from_attributes=True)


class AIControlCenterStatsResponse(BaseModel):
    total_executions: int
    active_count: int
    queued_count: int
    awaiting_approval_count: int
    completed_count: int
    failed_count: int
    total_tokens_used: int
    total_cost_usd: float
    provider_status: str
    active_model: str
    github_repo: str
    recent_executions: List[AITaskExecutionResponse] = Field(default_factory=list)


class AIEngineConfigResponse(BaseModel):
    provider: str
    default_model: str
    fast_model: str
    max_tokens_per_task: int
    max_budget_per_task_usd: float
    default_autonomy_level: int
    github_repo: str
    github_base_branch: str
    has_github_token: bool
    has_gemini_key: bool
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class AIEngineConfigUpdateRequest(BaseModel):
    provider: Optional[str] = None
    default_model: Optional[str] = None
    fast_model: Optional[str] = None
    max_tokens_per_task: Optional[int] = None
    max_budget_per_task_usd: Optional[float] = None
    default_autonomy_level: Optional[int] = None
    github_repo: Optional[str] = None
    github_base_branch: Optional[str] = None
    github_token: Optional[str] = None
    gemini_api_key: Optional[str] = None
