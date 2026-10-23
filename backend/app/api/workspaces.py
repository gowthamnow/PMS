import uuid
from typing import Any, List
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db, require_admin
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models.project import Project, ProjectMember
from app.models.user import User, UserRole
from app.models.workspace import Workspace
from app.schemas.user import UserResponse
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceMemberAssign,
    WorkspaceResponse,
    WorkspaceSwitchRequest,
    WorkspaceUpdate,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Workspace).order_by(Workspace.created_at.asc())

    # Regular users only see their assigned workspace
    if current_user.role != UserRole.ADMIN:
        if not current_user.workspace_id:
            return []
        query = query.where(Workspace.id == current_user.workspace_id)

    res = await db.execute(query)
    workspaces = res.scalars().all()

    response_list = []
    for ws in workspaces:
        # Get project count
        p_count_res = await db.execute(
            select(func.count(Project.id)).where(Project.workspace_id == ws.id)
        )
        p_count = p_count_res.scalar_one()

        # Get member count
        m_count_res = await db.execute(
            select(func.count(User.id)).where(User.workspace_id == ws.id)
        )
        m_count = m_count_res.scalar_one()

        item = WorkspaceResponse(
            id=ws.id,
            name=ws.name,
            description=ws.description,
            created_by=ws.created_by,
            created_at=ws.created_at,
            updated_at=ws.updated_at,
            project_count=p_count,
            member_count=m_count,
        )
        response_list.append(item)

    return response_list


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    request: Request,
    workspace_in: WorkspaceCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Check if name is taken
    existing = await db.execute(select(Workspace).where(Workspace.name == workspace_in.name.strip()))
    if existing.scalar_one_or_none():
        raise ValidationError("A workspace with this name already exists")

    new_ws = Workspace(
        id=uuid.uuid4(),
        name=workspace_in.name.strip(),
        description=workspace_in.description.strip() if workspace_in.description else None,
        created_by=current_user.id,
    )
    db.add(new_ws)
    await db.commit()
    await db.refresh(new_ws)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="CREATE_WORKSPACE",
        resource_type="WORKSPACE",
        resource_id=str(new_ws.id),
        changes={"name": new_ws.name},
        ip_address=client_ip,
    )

    return WorkspaceResponse(
        id=new_ws.id,
        name=new_ws.name,
        description=new_ws.description,
        created_by=new_ws.created_by,
        created_at=new_ws.created_at,
        updated_at=new_ws.updated_at,
        project_count=0,
        member_count=0,
    )


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.ADMIN and current_user.workspace_id != workspace_id:
        raise ForbiddenError("Access denied: You do not have access to this workspace")

    res = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = res.scalar_one_or_none()
    if not ws:
        raise NotFoundError("Workspace not found")

    p_count_res = await db.execute(
        select(func.count(Project.id)).where(Project.workspace_id == ws.id)
    )
    p_count = p_count_res.scalar_one()

    m_count_res = await db.execute(
        select(func.count(User.id)).where(User.workspace_id == ws.id)
    )
    m_count = m_count_res.scalar_one()

    return WorkspaceResponse(
        id=ws.id,
        name=ws.name,
        description=ws.description,
        created_by=ws.created_by,
        created_at=ws.created_at,
        updated_at=ws.updated_at,
        project_count=p_count,
        member_count=m_count,
    )


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: uuid.UUID,
    workspace_in: WorkspaceUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = res.scalar_one_or_none()
    if not ws:
        raise NotFoundError("Workspace not found")

    changes: dict[str, Any] = {}
    if workspace_in.name is not None and workspace_in.name.strip() != ws.name:
        existing = await db.execute(
            select(Workspace).where(
                Workspace.name == workspace_in.name.strip(), Workspace.id != workspace_id
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError("A workspace with this name already exists")
        ws.name = workspace_in.name.strip()
        changes["name"] = ws.name

    if workspace_in.description is not None:
        ws.description = workspace_in.description.strip() if workspace_in.description else None
        changes["description"] = ws.description

    await db.commit()
    await db.refresh(ws)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UPDATE_WORKSPACE",
        resource_type="WORKSPACE",
        resource_id=str(ws.id),
        changes=changes,
        ip_address=client_ip,
    )

    p_count_res = await db.execute(
        select(func.count(Project.id)).where(Project.workspace_id == ws.id)
    )
    p_count = p_count_res.scalar_one()

    m_count_res = await db.execute(
        select(func.count(User.id)).where(User.workspace_id == ws.id)
    )
    m_count = m_count_res.scalar_one()

    return WorkspaceResponse(
        id=ws.id,
        name=ws.name,
        description=ws.description,
        created_by=ws.created_by,
        created_at=ws.created_at,
        updated_at=ws.updated_at,
        project_count=p_count,
        member_count=m_count,
    )


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Ensure there is more than 1 workspace
    total_ws_res = await db.execute(select(func.count(Workspace.id)))
    total_ws = total_ws_res.scalar_one()
    if total_ws <= 1:
        raise ValidationError("Cannot delete the only remaining workspace")

    res = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = res.scalar_one_or_none()
    if not ws:
        raise NotFoundError("Workspace not found")

    # Find fallback workspace (first other workspace)
    fallback_res = await db.execute(
        select(Workspace).where(Workspace.id != workspace_id).order_by(Workspace.created_at.asc())
    )
    fallback_ws = fallback_res.scalars().first()

    if fallback_ws:
        # Move users to fallback workspace or set null
        users_res = await db.execute(select(User).where(User.workspace_id == workspace_id))
        for u in users_res.scalars().all():
            u.workspace_id = fallback_ws.id

    await db.delete(ws)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="DELETE_WORKSPACE",
        resource_type="WORKSPACE",
        resource_id=str(workspace_id),
        changes={"name": ws.name},
        ip_address=client_ip,
    )

    return {"message": "Workspace deleted successfully"}


@router.get("/{workspace_id}/members", response_model=List[UserResponse])
async def list_workspace_members(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.ADMIN and current_user.workspace_id != workspace_id:
        raise ForbiddenError("Access denied: You do not have access to this workspace")

    stmt = select(User).options(selectinload(User.workspace)).where(User.workspace_id == workspace_id)
    res = await db.execute(stmt)
    users = res.scalars().all()
    return [UserResponse.model_validate(u) for u in users]


@router.post("/{workspace_id}/assign-member")
async def assign_member(
    workspace_id: uuid.UUID,
    data: WorkspaceMemberAssign,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    ws_res = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = ws_res.scalar_one_or_none()
    if not ws:
        raise NotFoundError("Workspace not found")

    user_res = await db.execute(select(User).where(User.id == data.user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found")

    old_ws_id = user.workspace_id
    user.workspace_id = workspace_id

    # Ensure clean workspace confinement: if user was in a different workspace, remove them from projects in the old workspace
    if old_ws_id and old_ws_id != workspace_id:
        old_projs_res = await db.execute(select(Project.id).where(Project.workspace_id == old_ws_id))
        old_proj_ids = old_projs_res.scalars().all()
        if old_proj_ids:
            await db.execute(
                delete(ProjectMember).where(
                    ProjectMember.user_id == user.id,
                    ProjectMember.project_id.in_(old_proj_ids),
                )
            )

    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="ASSIGN_WORKSPACE_MEMBER",
        resource_type="USER",
        resource_id=str(user.id),
        changes={"previous_workspace": str(old_ws_id) if old_ws_id else None, "new_workspace": str(workspace_id)},
        ip_address=client_ip,
    )

    return {"message": f"Assigned {user.full_name} to workspace '{ws.name}' successfully"}


@router.post("/{workspace_id}/remove-member")
async def remove_member(
    workspace_id: uuid.UUID,
    data: WorkspaceMemberAssign,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user_res = await db.execute(select(User).where(User.id == data.user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found")

    if user.workspace_id == workspace_id:
        user.workspace_id = None

        # Cleanly remove from all projects in this workspace
        ws_projs_res = await db.execute(select(Project.id).where(Project.workspace_id == workspace_id))
        ws_proj_ids = ws_projs_res.scalars().all()
        if ws_proj_ids:
            await db.execute(
                delete(ProjectMember).where(
                    ProjectMember.user_id == user.id,
                    ProjectMember.project_id.in_(ws_proj_ids),
                )
            )

        await db.commit()

        client_ip = request.client.host if request.client else None
        await log_audit(
            db=db,
            user_id=current_user.id,
            action="REMOVE_WORKSPACE_MEMBER",
            resource_type="USER",
            resource_id=str(user.id),
            changes={"removed_from_workspace": str(workspace_id)},
            ip_address=client_ip,
        )

    return {"message": "Member removed from workspace successfully"}


@router.post("/switch", response_model=UserResponse)
async def switch_workspace(
    request: Request,
    switch_in: WorkspaceSwitchRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    target_ws_id = switch_in.workspace_id
    ws = None
    if target_ws_id is not None:
        ws_res = await db.execute(select(Workspace).where(Workspace.id == target_ws_id))
        ws = ws_res.scalar_one_or_none()
        if not ws:
            raise NotFoundError("Workspace not found")

        # Non-admins can only switch to their assigned workspace
        if current_user.role != UserRole.ADMIN:
            if current_user.workspace_id != target_ws_id:
                raise ForbiddenError("Access denied: You are not assigned to this workspace")

        current_user.workspace_id = target_ws_id
        ws_name = ws.name
    else:
        # Switching to All Workspaces / Global overview
        if current_user.role != UserRole.ADMIN:
            raise ForbiddenError("Only administrators can switch to all workspaces view")
        current_user.workspace_id = None
        ws = None
        ws_name = "All Workspaces (Admin)"

    await db.commit()

    refreshed_user = await db.execute(
        select(User).options(selectinload(User.workspace)).where(User.id == current_user.id)
    )
    user = refreshed_user.scalar_one()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="SWITCH_WORKSPACE",
        resource_type="USER",
        resource_id=str(user.id),
        changes={"active_workspace": str(target_ws_id) if target_ws_id else None, "workspace_name": ws_name},
        ip_address=client_ip,
    )

    resp = UserResponse.model_validate(user)
    resp.workspace_name = ws.name if ws else None
    return resp


@router.post("/{workspace_id}/switch", response_model=UserResponse)
async def switch_workspace_by_id(
    workspace_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await switch_workspace(
        request=request,
        switch_in=WorkspaceSwitchRequest(workspace_id=workspace_id),
        current_user=current_user,
        db=db,
    )
