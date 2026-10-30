import asyncio
from datetime import datetime, timezone
import logging
from typing import List, Optional
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db, require_admin
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.database import AsyncSessionLocal
from app.models.ai_orchestrator import (
    AIEngineConfig,
    AIExecutionStatus,
    AIExecutionStep,
    AIImplementationPlan,
    AITaskExecution,
    AIToolInvocation,
)
from app.models.project import Project, ProjectMember
from app.models.task import Task
from app.models.user import User, UserRole
from app.schemas.ai_orchestrator import (
    AIControlCenterStatsResponse,
    AIEngineConfigResponse,
    AIEngineConfigUpdateRequest,
    AIExecutionCreateRequest,
    AIExecutionStepResponse,
    AIImplementationPlanResponse,
    AIPlanApprovalRequest,
    AITaskExecutionResponse,
    AIToolInvocationResponse,
)
from app.services.ai_orchestrator import AIOrchestrator
from app.services.audit_service import log_audit

logger = logging.getLogger("ai_orchestrator_api")
router = APIRouter(prefix="/ai/orchestrator", tags=["AI Orchestrator Engine"])


async def run_orchestrator_background(execution_id: uuid.UUID):
    """Executes the orchestrator lifecycle asynchronously in a dedicated database session."""
    async with AsyncSessionLocal() as db:
        try:
            orchestrator = AIOrchestrator(db, execution_id)
            initialized = await orchestrator.initialize()
            if initialized:
                await orchestrator.execute_lifecycle()
        except Exception as exc:
            logger.error(f"Background execution {execution_id} error: {exc}", exc_info=True)


@router.post("/executions", response_model=AITaskExecutionResponse, status_code=status.HTTP_201_CREATED)
async def create_execution(
    req: AIExecutionCreateRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Queues a new autonomous AI execution for an engineering task.
    Validates task existence, workspace ownership, and permissions.
    """
    # 1. Fetch task
    t_stmt = select(Task).where(Task.id == req.task_id, Task.is_deleted == False)
    t_res = await db.execute(t_stmt)
    task = t_res.scalar_one_or_none()
    if not task:
        raise NotFoundError("Task not found")

    # 2. Check access permissions
    if current_user.role != UserRole.ADMIN:
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == task.project_id,
            ProjectMember.user_id == current_user.id,
        )
        mem = (await db.execute(mem_stmt)).scalar_one_or_none()
        if not mem:
            raise ForbiddenError("Access Denied: You are not a member of this task's project")

    # 3. Fetch project & workspace
    p_stmt = select(Project).where(Project.id == task.project_id)
    project = (await db.execute(p_stmt)).scalar_one()

    # 4. Create execution record
    exec_id = uuid.uuid4()
    execution = AITaskExecution(
        id=exec_id,
        task_id=task.id,
        project_id=project.id,
        workspace_id=project.workspace_id,
        creator_id=current_user.id,
        status=AIExecutionStatus.QUEUED,
        autonomy_level=req.autonomy_level or 2,
        current_stage="QUEUED",
        selected_model=req.model_override or "gemini-1.5-pro",
        git_base_branch="main",
        created_at=datetime.now(timezone.utc),
    )
    db.add(execution)
    await db.commit()

    # 5. Audit log
    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="AI_EXECUTION_QUEUED",
        resource_type="AI_TASK_EXECUTION",
        resource_id=str(exec_id),
        changes={"task_id": str(task.id), "task_number": task.task_number, "autonomy_level": execution.autonomy_level},
        ip_address=client_ip,
    )

    # 6. Trigger orchestrator in background
    background_tasks.add_task(run_orchestrator_background, exec_id)

    # Return refreshed response
    return await get_execution_by_id(exec_id, current_user, db)



@router.get("/executions/task/{task_id}", response_model=Optional[AITaskExecutionResponse])
async def get_latest_task_execution(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves the latest AI execution for a specific task if one exists."""
    stmt = (
        select(AITaskExecution.id)
        .where(AITaskExecution.task_id == task_id)
        .order_by(AITaskExecution.created_at.desc())
        .limit(1)
    )
    exec_id = (await db.execute(stmt)).scalar_one_or_none()
    if not exec_id:
        return None
    return await get_execution_by_id(exec_id, current_user, db)


@router.get("/executions/{execution_id}", response_model=AITaskExecutionResponse)
async def get_execution_endpoint(
    execution_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves full execution details, current stage, plan, and progress."""
    return await get_execution_by_id(execution_id, current_user, db)


async def get_execution_by_id(execution_id: uuid.UUID, current_user: User, db: AsyncSession) -> AITaskExecutionResponse:
    stmt = (
        select(AITaskExecution)
        .options(
            selectinload(AITaskExecution.task),
            selectinload(AITaskExecution.project),
            selectinload(AITaskExecution.creator),
            selectinload(AITaskExecution.steps),
            selectinload(AITaskExecution.plan),
        )
        .where(AITaskExecution.id == execution_id)
    )
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise NotFoundError("Execution not found")

    # Check permission
    if current_user.role != UserRole.ADMIN and current_user.workspace_id and item.workspace_id:
        if current_user.workspace_id != item.workspace_id:
            raise ForbiddenError("Access denied: Execution belongs to a different workspace")

    return AITaskExecutionResponse(
        id=item.id,
        task_id=item.task_id,
        task_title=item.task.title if item.task else None,
        task_number=item.task.task_number if item.task else None,
        project_id=item.project_id,
        project_name=item.project.name if item.project else None,
        workspace_id=item.workspace_id,
        creator_id=item.creator_id,
        creator_name=item.creator.full_name or item.creator.username if item.creator else None,
        status=item.status,
        autonomy_level=item.autonomy_level,
        current_stage=item.current_stage,
        selected_model=item.selected_model,
        git_branch=item.git_branch,
        git_base_branch=item.git_base_branch,
        git_head_commit=item.git_head_commit,
        github_pr_number=item.github_pr_number,
        github_pr_url=item.github_pr_url,
        github_pr_status=item.github_pr_status,
        is_approved_by_human=item.is_approved_by_human,
        approved_by_id=item.approved_by_id,
        approved_at=item.approved_at,
        rejection_reason=item.rejection_reason,
        tokens_used=item.tokens_used,
        estimated_cost_usd=float(item.estimated_cost_usd or 0.0),
        duration_seconds=item.duration_seconds,
        retry_count=item.retry_count,
        error_message=item.error_message,
        created_at=item.created_at,
        updated_at=item.updated_at,
        completed_at=item.completed_at,
        steps=[AIExecutionStepResponse.model_validate(s) for s in (item.steps or [])],
        plan=AIImplementationPlanResponse.model_validate(item.plan) if item.plan else None,
    )


@router.post("/executions/{execution_id}/approve-plan", response_model=AITaskExecutionResponse)
async def approve_plan(
    execution_id: uuid.UUID,
    approval: AIPlanApprovalRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Human-in-the-loop approval gate.
    Approves or rejects an AI implementation plan.
    """
    stmt = (
        select(AITaskExecution)
        .options(selectinload(AITaskExecution.plan))
        .where(AITaskExecution.id == execution_id)
    )
    execution = (await db.execute(stmt)).scalar_one_or_none()
    if not execution:
        raise NotFoundError("Execution not found")

    if not execution.plan:
        raise ValidationError("No plan has been formulated yet for this execution")

    plan = execution.plan
    if approval.is_approved:
        plan.is_approved = True
        plan.approved_by_id = current_user.id
        plan.approved_at = datetime.now(timezone.utc)
        plan.feedback = approval.feedback
        execution.is_approved_by_human = True
        execution.approved_by_id = current_user.id
        execution.approved_at = datetime.now(timezone.utc)
        execution.status = AIExecutionStatus.IMPLEMENTING
        await db.commit()

        # Resume execution in background
        background_tasks.add_task(run_orchestrator_background, execution.id)
    else:
        plan.is_approved = False
        plan.feedback = approval.feedback
        execution.status = AIExecutionStatus.REQUIRES_HUMAN
        execution.rejection_reason = approval.feedback or "Plan rejected by user"
        await db.commit()

    return await get_execution_by_id(execution_id, current_user, db)


@router.post("/executions/{execution_id}/cancel", response_model=AITaskExecutionResponse)
async def cancel_execution(
    execution_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancels an active or pending AI execution job."""
    stmt = select(AITaskExecution).where(AITaskExecution.id == execution_id)
    execution = (await db.execute(stmt)).scalar_one_or_none()
    if not execution:
        raise NotFoundError("Execution not found")

    execution.status = AIExecutionStatus.CANCELLED
    execution.completed_at = datetime.now(timezone.utc)
    execution.error_message = f"Cancelled by {current_user.username}"
    await db.commit()

    return await get_execution_by_id(execution_id, current_user, db)


@router.post("/executions/{execution_id}/retry", response_model=AITaskExecutionResponse)
async def retry_execution(
    execution_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Retries a failed or blocked execution."""
    stmt = select(AITaskExecution).where(AITaskExecution.id == execution_id)
    execution = (await db.execute(stmt)).scalar_one_or_none()
    if not execution:
        raise NotFoundError("Execution not found")

    execution.status = AIExecutionStatus.QUEUED
    execution.retry_count += 1
    execution.error_message = None
    execution.completed_at = None
    execution.created_at = datetime.now(timezone.utc)
    execution.duration_seconds = 0.0
    await db.commit()

    background_tasks.add_task(run_orchestrator_background, execution.id)
    return await get_execution_by_id(execution_id, current_user, db)


@router.get("/control-center", response_model=AIControlCenterStatsResponse)
async def get_control_center_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns aggregated stats for the AI Control Center:
    Active jobs, queue status, approvals, costs, and recent executions.
    """
    base_q = select(AITaskExecution)
    if current_user.role != UserRole.ADMIN and current_user.workspace_id:
        base_q = base_q.where(AITaskExecution.workspace_id == current_user.workspace_id)

    all_res = await db.execute(base_q.order_by(AITaskExecution.created_at.desc()).limit(15))
    recent = all_res.scalars().all()

    # Counts
    active_statuses = [AIExecutionStatus.ANALYZING, AIExecutionStatus.IMPLEMENTING, AIExecutionStatus.TESTING]
    total_count = (await db.execute(select(func.count(AITaskExecution.id)))).scalar_one()
    active_count = (await db.execute(select(func.count(AITaskExecution.id)).where(AITaskExecution.status.in_(active_statuses)))).scalar_one()
    queued_count = (await db.execute(select(func.count(AITaskExecution.id)).where(AITaskExecution.status == AIExecutionStatus.QUEUED))).scalar_one()
    awaiting_count = (await db.execute(select(func.count(AITaskExecution.id)).where(AITaskExecution.status == AIExecutionStatus.WAITING_FOR_APPROVAL))).scalar_one()
    completed_count = (await db.execute(select(func.count(AITaskExecution.id)).where(AITaskExecution.status == AIExecutionStatus.COMPLETED))).scalar_one()
    failed_count = (await db.execute(select(func.count(AITaskExecution.id)).where(AITaskExecution.status.in_([AIExecutionStatus.FAILED, AIExecutionStatus.BLOCKED])))).scalar_one()

    # Telemetry
    total_tokens = (await db.execute(select(func.coalesce(func.sum(AITaskExecution.tokens_used), 0)))).scalar_one()
    total_cost = float((await db.execute(select(func.coalesce(func.sum(AITaskExecution.estimated_cost_usd), 0.0)))).scalar_one())

    # Config
    cfg_stmt = select(AIEngineConfig).where(AIEngineConfig.is_active == True)
    cfg = (await db.execute(cfg_stmt)).scalar_one_or_none()

    # Build response list with tasks loaded
    recent_responses = []
    for r in recent:
        resp = await get_execution_by_id(r.id, current_user, db)
        recent_responses.append(resp)

    return AIControlCenterStatsResponse(
        total_executions=total_count,
        active_count=active_count,
        queued_count=queued_count,
        awaiting_approval_count=awaiting_count,
        completed_count=completed_count,
        failed_count=failed_count,
        total_tokens_used=total_tokens,
        total_cost_usd=round(total_cost, 4),
        provider_status="Google Cloud Gemini Active" if cfg and cfg.is_active else "PMS Diagnostic Engine Active",
        active_model=cfg.default_model if cfg else "gemini-1.5-pro",
        github_repo=cfg.github_repo if cfg else "gowthamnow/PMS",
        recent_executions=recent_responses,
    )


@router.get("/config", response_model=AIEngineConfigResponse)
async def get_ai_config(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the current public AI engine configuration."""
    cfg_stmt = select(AIEngineConfig).where(AIEngineConfig.is_active == True)
    cfg = (await db.execute(cfg_stmt)).scalar_one_or_none()
    if not cfg:
        # Create default config row
        cfg = AIEngineConfig(
            id=uuid.uuid4(),
            provider="GOOGLE_GEMINI",
            default_model="gemini-1.5-pro",
            fast_model="gemini-1.5-flash",
            max_tokens_per_task=32000,
            max_budget_per_task_usd=5.00,
            default_autonomy_level=2,
            github_repo="gowthamnow/PMS",
            github_base_branch="main",
            is_active=True,
        )
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)

    return AIEngineConfigResponse(
        provider=cfg.provider,
        default_model=cfg.default_model,
        fast_model=cfg.fast_model,
        max_tokens_per_task=cfg.max_tokens_per_task,
        max_budget_per_task_usd=float(cfg.max_budget_per_task_usd),
        default_autonomy_level=cfg.default_autonomy_level,
        github_repo=cfg.github_repo,
        github_base_branch=cfg.github_base_branch,
        has_github_token=bool(cfg.github_token_encrypted),
        has_gemini_key=True,
        is_active=cfg.is_active,
    )


@router.put("/config", response_model=AIEngineConfigResponse)
async def update_ai_config(
    req: AIEngineConfigUpdateRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only update for AI Engine and GitHub Integration settings."""
    cfg_stmt = select(AIEngineConfig).where(AIEngineConfig.is_active == True)
    cfg = (await db.execute(cfg_stmt)).scalar_one_or_none()
    if not cfg:
        cfg = AIEngineConfig(id=uuid.uuid4(), is_active=True)
        db.add(cfg)

    if req.provider is not None:
        cfg.provider = req.provider
    if req.default_model is not None:
        cfg.default_model = req.default_model
    if req.fast_model is not None:
        cfg.fast_model = req.fast_model
    if req.max_tokens_per_task is not None:
        cfg.max_tokens_per_task = req.max_tokens_per_task
    if req.max_budget_per_task_usd is not None:
        cfg.max_budget_per_task_usd = req.max_budget_per_task_usd
    if req.default_autonomy_level is not None:
        cfg.default_autonomy_level = req.default_autonomy_level
    if req.github_repo is not None:
        cfg.github_repo = req.github_repo
    if req.github_base_branch is not None:
        cfg.github_base_branch = req.github_base_branch
    if req.github_token is not None:
        cfg.github_token_encrypted = req.github_token.strip()

    cfg.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(cfg)

    return AIEngineConfigResponse(
        provider=cfg.provider,
        default_model=cfg.default_model,
        fast_model=cfg.fast_model,
        max_tokens_per_task=cfg.max_tokens_per_task,
        max_budget_per_task_usd=float(cfg.max_budget_per_task_usd),
        default_autonomy_level=cfg.default_autonomy_level,
        github_repo=cfg.github_repo,
        github_base_branch=cfg.github_base_branch,
        has_github_token=bool(cfg.github_token_encrypted),
        has_gemini_key=True,
        is_active=cfg.is_active,
    )
