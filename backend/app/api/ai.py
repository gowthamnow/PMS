import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, require_admin
from app.models.user import User
from app.schemas.ai import (
    AIConfigResponse,
    AIConfigUpdateRequest,
    ProjectCopilotRequest,
    ProjectCopilotResponse,
    TaskSolveRequest,
    TaskSolveResponse,
)
from app.services.ai_service import (
    consult_project_copilot,
    get_gemini_api_key,
    get_gemini_model,
    set_gemini_api_key,
    solve_task_with_ai,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/ai", tags=["AI & Automation"])


@router.post("/solve-task/{task_id}", response_model=TaskSolveResponse)
async def solve_task_endpoint(
    task_id: uuid.UUID,
    request: Request,
    auto_post_comment: bool = Query(False, description="Automatically post AI solution as comment on task"),
    custom_instruction: Optional[str] = Query(None, description="Custom prompt / focus for AI"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Triggers AI to analyze and solve a reported bug or task.
    Returns root-cause analysis, exact code diffs, and verification steps.
    Optionally posts the complete solution directly to the task's discussion comments.
    """
    solution = await solve_task_with_ai(
        db=db,
        task_id=task_id,
        auto_post_comment=auto_post_comment,
        current_user=current_user,
        custom_instruction=custom_instruction,
    )

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="AI_SOLVE_TASK",
        resource_type="TASK",
        resource_id=str(task_id),
        changes={"issue_type": solution.issue_type, "comment_posted": auto_post_comment},
        ip_address=client_ip,
    )

    return solution


@router.post("/project-copilot/{project_id}", response_model=ProjectCopilotResponse)
async def project_copilot_endpoint(
    project_id: uuid.UUID,
    copilot_in: ProjectCopilotRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Project-level AI Copilot.
    Consults project schematics, datasheets, and active tasks to diagnose roadblocks
    and propose component ideas, firmware routines, and resolution plans.
    """
    response = await consult_project_copilot(
        db=db,
        project_id=project_id,
        problem_description=copilot_in.problem_description,
        category=copilot_in.category or "GENERAL",
    )

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="AI_PROJECT_COPILOT",
        resource_type="PROJECT",
        resource_id=str(project_id),
        changes={"query_category": copilot_in.category},
        ip_address=client_ip,
    )

    return response


@router.get("/config", response_model=AIConfigResponse)
async def get_ai_config(
    current_user: User = Depends(get_current_active_user),
):
    """
    Returns the current status of Google Gemini AI integration.
    """
    api_key = get_gemini_api_key()
    return AIConfigResponse(
        has_api_key=bool(api_key),
        provider="Google Gemini (Cloud Generative AI)",
        model=get_gemini_model(),
        features=[
            "Task Bug Auto-Resolver & Patch Synthesis",
            "Project Copilot & Engineering Idea Engine",
            "Datasheet & Schematic Analysis",
            "1-Click Technical Comment Auto-Posting",
        ],
    )


@router.post("/config")
async def update_ai_config(
    data: AIConfigUpdateRequest,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Allows Admin to configure the Google Gemini API Key and model at runtime.
    """
    set_gemini_api_key(data.api_key, data.model or "gemini-1.5-flash")

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UPDATE_AI_CONFIG",
        resource_type="SYSTEM",
        resource_id="gemini_ai",
        changes={"model": data.model or "gemini-1.5-flash"},
        ip_address=client_ip,
    )

    return {
        "message": "Google Gemini API configuration updated successfully",
        "has_api_key": bool(data.api_key),
        "model": get_gemini_model(),
    }
