from datetime import datetime, timezone
import hashlib
import hmac
import json
import logging
import re
import secrets
from typing import Any, Optional
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import (
    get_current_active_user,
    get_db,
    require_admin_or_pm,
)
from app.config import settings
from app.models.gitea import GiteaEvent, GiteaRepo
from app.models.project import ProjectMember, ProjectRole
from app.models.task import Task
from app.models.user import User, UserRole
from app.schemas.gitea import (
    GiteaBranchResponse,
    GiteaCommitResponse,
    GiteaPullRequestResponse,
    GiteaRepoCreate,
    GiteaRepoResponse,
)
from app.services.audit_service import log_audit
from app.services.gitea_service import GiteaClient, gitea_client

logger = logging.getLogger("gitea_api")

router = APIRouter(prefix="/api/gitea", tags=["gitea"])


def _to_uuid(val: Any) -> uuid.UUID:
    if isinstance(val, uuid.UUID):
        return val
    return uuid.UUID(str(val))


@router.get("/repos", response_model=list[GiteaRepoResponse])
async def list_repos(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        p_uuid = _to_uuid(project_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid project_id")

    if current_user.role != UserRole.ADMIN:
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == p_uuid,
            ProjectMember.user_id == current_user.id,
        )
        mem = await db.execute(mem_stmt)
        if not mem.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a project member")

    stmt = select(GiteaRepo).where(GiteaRepo.project_id == p_uuid)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/repos", response_model=GiteaRepoResponse, status_code=status.HTTP_201_CREATED)
async def link_repo(
    data: GiteaRepoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_pm),
):
    if current_user.role != UserRole.ADMIN:
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == data.project_id,
            ProjectMember.user_id == current_user.id,
        )
        mem_res = await db.execute(mem_stmt)
        mem = mem_res.scalar_one_or_none()
        if not mem or mem.role != ProjectRole.MANAGER:
            raise HTTPException(status_code=403, detail="Only project managers or admins can link repositories")

    # Check if already linked
    existing = await db.execute(select(GiteaRepo).where(GiteaRepo.repo_full_name == data.repo_full_name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Repository already linked")

    webhook_secret = secrets.token_hex(32)
    repo = GiteaRepo(
        id=uuid.uuid4(),
        project_id=data.project_id,
        repo_full_name=data.repo_full_name,
        repo_url=data.repo_url,
        default_branch=data.default_branch or "main",
        webhook_secret=webhook_secret,
        is_active=True,
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)

    # Optionally auto-create webhook on Gitea via GiteaClient
    try:
        parts = data.repo_full_name.split("/")
        if len(parts) == 2:
            owner, repo_name = parts
            client = GiteaClient()
            webhook_url = f"{settings.GITEA_BASE_URL.replace(':3001', ':8000')}/api/gitea/webhook/{repo.id}"
            await client.create_webhook(owner, repo_name, webhook_url, webhook_secret)
    except Exception as exc:
        logger.warning(f"Failed to auto-create webhook on Gitea: {exc}")

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="LINK_GITEA_REPO",
        resource_type="GITEA_REPO",
        resource_id=str(repo.id),
        changes={"repo_full_name": repo.repo_full_name},
        ip_address=client_ip,
    )

    return repo


@router.delete("/repos/{repo_id}")
async def unlink_repo(
    repo_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_pm),
):
    try:
        r_uuid = _to_uuid(repo_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Repository not found")

    repo = await db.get(GiteaRepo, r_uuid)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if current_user.role != UserRole.ADMIN:
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == repo.project_id,
            ProjectMember.user_id == current_user.id,
        )
        mem_res = await db.execute(mem_stmt)
        mem = mem_res.scalar_one_or_none()
        if not mem or mem.role != ProjectRole.MANAGER:
            raise HTTPException(status_code=403, detail="Only project managers or admins can unlink repositories")

    await db.delete(repo)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UNLINK_GITEA_REPO",
        resource_type="GITEA_REPO",
        resource_id=str(repo_id),
        changes={"repo_full_name": repo.repo_full_name},
        ip_address=client_ip,
    )

    return {"message": "Repository unlinked successfully"}


@router.get("/repos/{repo_id}/commits")
async def get_commits(
    repo_id: str,
    page: int = 1,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        r_uuid = _to_uuid(repo_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Repository not found")

    repo = await db.get(GiteaRepo, r_uuid)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if current_user.role != UserRole.ADMIN:
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == repo.project_id,
            ProjectMember.user_id == current_user.id,
        )
        mem = await db.execute(mem_stmt)
        if not mem.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a project member")

    parts = repo.repo_full_name.split("/")
    if len(parts) != 2:
        return []
    owner, repo_name = parts
    client = GiteaClient()
    return await client.get_commits(owner, repo_name, page=page, limit=limit)


@router.get("/repos/{repo_id}/branches")
async def get_branches(
    repo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        r_uuid = _to_uuid(repo_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Repository not found")

    repo = await db.get(GiteaRepo, r_uuid)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if current_user.role != UserRole.ADMIN:
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == repo.project_id,
            ProjectMember.user_id == current_user.id,
        )
        mem = await db.execute(mem_stmt)
        if not mem.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a project member")

    parts = repo.repo_full_name.split("/")
    if len(parts) != 2:
        return []
    owner, repo_name = parts
    client = GiteaClient()
    return await client.get_branches(owner, repo_name)


@router.get("/repos/{repo_id}/pull-requests")
async def get_pull_requests(
    repo_id: str,
    state: str = "open",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        r_uuid = _to_uuid(repo_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Repository not found")

    repo = await db.get(GiteaRepo, r_uuid)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if current_user.role != UserRole.ADMIN:
        mem_stmt = select(ProjectMember).where(
            ProjectMember.project_id == repo.project_id,
            ProjectMember.user_id == current_user.id,
        )
        mem = await db.execute(mem_stmt)
        if not mem.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a project member")

    parts = repo.repo_full_name.split("/")
    if len(parts) != 2:
        return []
    owner, repo_name = parts
    client = GiteaClient()
    return await client.get_pull_requests(owner, repo_name, state=state)


@router.post("/webhook/{repo_id}", include_in_schema=False)
async def receive_webhook(
    repo_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_gitea_signature: Optional[str] = Header(None, alias="X-Gitea-Signature"),
):
    body = await request.body()

    # 1. Fetch repo from DB
    try:
        repo_uuid = _to_uuid(repo_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Repository not found")

    repo = await db.get(GiteaRepo, repo_uuid)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # 2. Verify HMAC-SHA256 signature
    sig = (
        x_gitea_signature
        or request.headers.get("X-Gitea-Signature")
        or request.headers.get("x-gitea-signature")
        or ""
    )
    if repo.webhook_secret:
        raw_hex = hmac.new(repo.webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        expected = "sha256=" + raw_hex
        if not (hmac.compare_digest(expected, sig) or hmac.compare_digest(raw_hex, sig)):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    # 3. Parse payload
    try:
        payload = json.loads(body.decode("utf-8")) if body else {}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # 4. Get event_id for deduplication
    event_id = request.headers.get("X-Gitea-Delivery") or payload.get("sha") or str(uuid.uuid4())

    # 5. Check dedup
    existing = await db.execute(select(GiteaEvent).where(GiteaEvent.event_id == event_id))
    if existing.scalar_one_or_none():
        return {"status": "already_processed"}

    # 6. Determine event type
    event_type = request.headers.get("X-Gitea-Event", "unknown")

    # 7. Extract task references from commit messages / PR title (#TASK-NNN or #NNN)
    task_refs = []
    pattern = re.compile(r"(?:#task-|#)(\d+)", re.IGNORECASE)
    if event_type == "push" and "commits" in payload:
        for commit in payload.get("commits", []):
            msg = commit.get("message", "")
            for match in pattern.finditer(msg):
                task_refs.append({
                    "task_num": int(match.group(1)),
                    "type": "commit",
                    "ref": str(commit.get("id", ""))[:8],
                    "message": str(commit.get("message", ""))[:200],
                    "author": commit.get("author", {}).get("name", "")
                    if isinstance(commit.get("author"), dict)
                    else "",
                    "url": commit.get("url", ""),
                    "timestamp": commit.get("timestamp", ""),
                })
    elif event_type == "pull_request" and "pull_request" in payload:
        pr = payload["pull_request"]
        for text in [pr.get("title", ""), pr.get("body", "") or ""]:
            for match in pattern.finditer(text):
                author = (
                    pr.get("user", {}).get("login", "")
                    if isinstance(pr.get("user"), dict)
                    else str(pr.get("user", ""))
                )
                task_refs.append({
                    "task_num": int(match.group(1)),
                    "type": "pr",
                    "ref": f"#{pr.get('number', '')}",
                    "message": str(pr.get("title", ""))[:200],
                    "author": author,
                    "url": pr.get("html_url", ""),
                    "timestamp": pr.get("updated_at", ""),
                })

    # 8. Update tasks with git refs
    for ref in task_refs:
        task_stmt = select(Task).where(
            Task.project_id == repo.project_id,
            Task.task_number == ref["task_num"],
        )
        task_res = await db.execute(task_stmt)
        task_obj = task_res.scalar_one_or_none()
        if task_obj:
            existing_refs = list(task_obj.git_refs or [])
            new_ref = {k: v for k, v in ref.items() if k != "task_num"}
            existing_refs.append(new_ref)
            task_obj.git_refs = existing_refs
            flag_modified(task_obj, "git_refs")

    # 9. Save GiteaEvent
    git_event = GiteaEvent(
        id=uuid.uuid4(),
        repo_id=repo.id,
        event_type=event_type,
        event_id=event_id,
        payload=payload,
        processed_at=datetime.now(timezone.utc),
    )
    db.add(git_event)
    await db.commit()

    return {"status": "processed", "task_refs_updated": len(task_refs)}
