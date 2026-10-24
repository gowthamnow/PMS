import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import Optional
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class AIExecutionStatus(str, PyEnum):
    QUEUED = "QUEUED"
    ANALYZING = "ANALYZING"
    PLAN_PENDING = "PLAN_PENDING"
    WAITING_FOR_APPROVAL = "WAITING_FOR_APPROVAL"
    IMPLEMENTING = "IMPLEMENTING"
    TESTING = "TESTING"
    REVIEW_READY = "REVIEW_READY"
    COMPLETED = "COMPLETED"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    REQUIRES_HUMAN = "REQUIRES_HUMAN"


class AIAutonomyLevel(int, PyEnum):
    LEVEL_0_ANALYSIS_ONLY = 0
    LEVEL_1_SUPERVISED = 1
    LEVEL_2_APPROVED_AUTOMATION = 2
    LEVEL_3_POLICY_CONTROLLED = 3


class AIAgentRole(str, PyEnum):
    TASK_ANALYST = "TASK_ANALYST"
    REPOSITORY_ANALYST = "REPOSITORY_ANALYST"
    PLANNING_AGENT = "PLANNING_AGENT"
    FRONTEND_CODING_AGENT = "FRONTEND_CODING_AGENT"
    BACKEND_CODING_AGENT = "BACKEND_CODING_AGENT"
    DATABASE_AGENT = "DATABASE_AGENT"
    TESTING_DEBUGGING_AGENT = "TESTING_DEBUGGING_AGENT"
    SECURITY_REVIEW_AGENT = "SECURITY_REVIEW_AGENT"
    GITHUB_INTEGRATION_AGENT = "GITHUB_INTEGRATION_AGENT"
    DEVOPS_DEPLOYMENT_AGENT = "DEVOPS_DEPLOYMENT_AGENT"


class AIStepStatus(str, PyEnum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class AITaskExecution(Base):
    """
    Tracks the full lifecycle of an autonomous AI execution job on a task.
    """
    __tablename__ = "ai_task_executions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    status = Column(Enum(AIExecutionStatus), default=AIExecutionStatus.QUEUED, nullable=False, index=True)
    autonomy_level = Column(Integer, default=AIAutonomyLevel.LEVEL_2_APPROVED_AUTOMATION, nullable=False)
    current_stage = Column(String(50), default="ANALYSIS", nullable=False)
    selected_model = Column(String(100), default="gemini-1.5-pro", nullable=False)

    # Git & GitHub Tracking
    git_branch = Column(String(255), nullable=True)
    git_base_branch = Column(String(100), default="main", nullable=False)
    git_head_commit = Column(String(40), nullable=True)
    github_pr_number = Column(Integer, nullable=True)
    github_pr_url = Column(String(500), nullable=True)
    github_pr_status = Column(String(50), default="NONE", nullable=False)

    # Approvals & Human Gates
    is_approved_by_human = Column(Boolean, default=False, nullable=False)
    approved_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)

    # Telemetry, Cost & Resources
    tokens_used = Column(Integer, default=0, nullable=False)
    estimated_cost_usd = Column(Numeric(8, 4), default=0.0, nullable=False)
    duration_seconds = Column(Float, default=0.0, nullable=False)
    retry_count = Column(Integer, default=0, nullable=False)
    error_message = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    task = relationship("Task")
    project = relationship("Project")
    workspace = relationship("Workspace")
    creator = relationship("User", foreign_keys=[creator_id])
    approved_by = relationship("User", foreign_keys=[approved_by_id])
    steps = relationship("AIExecutionStep", back_populates="execution", cascade="all, delete-orphan", order_by="AIExecutionStep.step_index")
    plan = relationship("AIImplementationPlan", back_populates="execution", uselist=False, cascade="all, delete-orphan")
    tool_invocations = relationship("AIToolInvocation", back_populates="execution", cascade="all, delete-orphan", order_by="AIToolInvocation.created_at")


class AIExecutionStep(Base):
    """
    Sub-stages and specialized agent executions within a task.
    """
    __tablename__ = "ai_execution_steps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id = Column(UUID(as_uuid=True), ForeignKey("ai_task_executions.id", ondelete="CASCADE"), nullable=False, index=True)
    step_index = Column(Integer, nullable=False)
    agent_role = Column(Enum(AIAgentRole), nullable=False)
    status = Column(Enum(AIStepStatus), default=AIStepStatus.PENDING, nullable=False)
    title = Column(String(255), nullable=False)
    summary = Column(Text, nullable=True)
    output_data = Column(JSON, default=dict, nullable=False)
    duration_seconds = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    execution = relationship("AITaskExecution", back_populates="steps")


class AIImplementationPlan(Base):
    """
    Structured, reviewable plan produced by PlanningAgent before code modification.
    """
    __tablename__ = "ai_implementation_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id = Column(UUID(as_uuid=True), ForeignKey("ai_task_executions.id", ondelete="CASCADE"), nullable=False, unique=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)

    problem_statement = Column(Text, nullable=False)
    expected_outcome = Column(Text, nullable=False)
    acceptance_criteria = Column(JSON, default=list, nullable=False)
    affected_files = Column(JSON, default=list, nullable=False)
    planned_steps = Column(JSON, default=list, nullable=False)
    risk_level = Column(String(50), default="LOW", nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    risk_rationale = Column(Text, nullable=True)

    requires_human_approval = Column(Boolean, default=False, nullable=False)
    is_approved = Column(Boolean, default=False, nullable=False)
    approved_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    feedback = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    execution = relationship("AITaskExecution", back_populates="plan")


class AIToolInvocation(Base):
    """
    Audit log of every safe tool call executed by an AI agent.
    """
    __tablename__ = "ai_tool_invocations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id = Column(UUID(as_uuid=True), ForeignKey("ai_task_executions.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_role = Column(Enum(AIAgentRole), nullable=False)
    tool_name = Column(String(100), nullable=False, index=True)
    input_payload = Column(JSON, default=dict, nullable=False)
    output_summary = Column(Text, nullable=True)
    exit_code = Column(Integer, default=0, nullable=False)
    is_success = Column(Boolean, default=True, nullable=False)
    duration_ms = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    execution = relationship("AITaskExecution", back_populates="tool_invocations")


class AIProjectMemory(Base):
    """
    Persistent architectural patterns and verified knowledge scoped to project & workspace.
    """
    __tablename__ = "ai_project_memory"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)

    category = Column(String(50), nullable=False)  # ARCHITECTURE, CONVENTION, TEST_COMMAND, KNOWN_ISSUE, DECISION
    key = Column(String(255), nullable=False, index=True)
    value = Column(Text, nullable=False)
    commit_ref = Column(String(40), nullable=True)
    is_verified = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)


class AIEngineConfig(Base):
    """
    System-wide AI Engine and Model Routing configuration.
    """
    __tablename__ = "ai_engine_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String(50), default="GOOGLE_GEMINI", nullable=False)
    default_model = Column(String(100), default="gemini-1.5-pro", nullable=False)
    fast_model = Column(String(100), default="gemini-1.5-flash", nullable=False)
    max_tokens_per_task = Column(Integer, default=32000, nullable=False)
    max_budget_per_task_usd = Column(Numeric(6, 2), default=5.00, nullable=False)
    default_autonomy_level = Column(Integer, default=AIAutonomyLevel.LEVEL_2_APPROVED_AUTOMATION, nullable=False)
    
    # GitHub Integration Settings
    github_repo = Column(String(255), default="gowthamnow/PMS", nullable=False)
    github_base_branch = Column(String(100), default="main", nullable=False)
    github_token_encrypted = Column(Text, nullable=True)
    github_webhook_secret = Column(String(255), nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
