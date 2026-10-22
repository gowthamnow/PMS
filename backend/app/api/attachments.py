import os
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Form, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_active_user,
    get_db,
    get_project_member,
    require_admin,
)
from app.config import settings
from app.core.exceptions import (
    ForbiddenError,
    NotFoundError,
    StorageQuotaError,
    ValidationError,
)
from app.models.project import ProjectRole
from app.models.task import Task, TaskAttachment
from app.models.user import User, UserRole
from app.schemas.attachment import (
    AttachmentQuotaResponse,
    TaskAttachmentResponse,
)
from app.services.audit_service import log_audit
from app.services.storage_service import (
    MAX_FILE_BYTES,
    QUOTA_BYTES,
    check_quota,
    delete_file,
    get_total_used_bytes,
    save_file,
    validate_file_content_type,
)

router = APIRouter(prefix="/attachments", tags=["Attachments"])


@router.get("", response_model=list[TaskAttachmentResponse])
async def list_attachments(
    project_id: Optional[uuid.UUID] = None,
    task_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists attachments for a project or task.
    """
    query = select(TaskAttachment).options(selectinload(TaskAttachment.user))

    if project_id:
        await get_project_member(project_id=project_id, current_user=current_user, db=db)
        query = query.where(TaskAttachment.project_id == project_id)

    if task_id:
        query = query.where(TaskAttachment.task_id == task_id)

    if not project_id and not task_id:
        if current_user.role != UserRole.ADMIN:
            user_proj_subq = select(ProjectMember.project_id).where(ProjectMember.user_id == current_user.id)
            query = query.where(TaskAttachment.project_id.in_(user_proj_subq))

    query = query.order_by(TaskAttachment.created_at.desc())
    res = await db.execute(query)
    return res.scalars().all()


@router.post("", response_model=TaskAttachmentResponse, status_code=status.HTTP_201_CREATED)
@router.post("/upload", response_model=TaskAttachmentResponse, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    request: Request,
    file: UploadFile,
    project_id: Optional[uuid.UUID] = Form(None),
    task_id: Optional[uuid.UUID] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not project_id and not task_id:
        raise ValidationError("Either project_id or task_id must be provided")

    if task_id:
        task_res = await db.execute(select(Task).where(Task.id == task_id))
        task = task_res.scalar_one_or_none()
        if not task:
            raise NotFoundError("Task not found")
        if project_id and task.project_id != project_id:
            raise ValidationError("Task does not belong to specified project")
        project_id = task.project_id

    await get_project_member(project_id=project_id, current_user=current_user, db=db)


    content = await file.read()
    file_size = len(content)

    if file_size > MAX_FILE_BYTES:
        raise StorageQuotaError(
            f"File size exceeds maximum allowed size of {settings.ATTACHMENT_MAX_FILE_SIZE_MB}MB"
        )

    await check_quota(db, file_size)

    header_bytes = content[:512]
    validate_file_content_type(header_bytes, file.content_type or "")

    original_name = file.filename or "attachment.bin"
    stored_path, stored_filename = await save_file(
        content=content,
        project_id=project_id,
        original_filename=original_name,
    )

    attachment = TaskAttachment(
        id=uuid.uuid4(),
        project_id=project_id,
        task_id=task_id,
        user_id=current_user.id,
        filename=original_name,
        stored_filename=stored_path,
        file_size=file_size,
        content_type=file.content_type or "application/octet-stream",
    )
    db.add(attachment)
    await db.commit()

    stmt = (
        select(TaskAttachment)
        .options(selectinload(TaskAttachment.user))
        .where(TaskAttachment.id == attachment.id)
    )
    res = await db.execute(stmt)
    full_attachment = res.scalar_one()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UPLOAD_ATTACHMENT",
        resource_type="ATTACHMENT",
        resource_id=str(attachment.id),
        changes={"filename": original_name, "file_size": file_size},
        ip_address=client_ip,
    )

    return full_attachment


@router.get("/quota", response_model=AttachmentQuotaResponse)
async def get_storage_quota(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total_used = await get_total_used_bytes(db)
    percentage = round((total_used / QUOTA_BYTES) * 100, 2) if QUOTA_BYTES > 0 else 0.0
    remaining = max(0, QUOTA_BYTES - total_used)

    return AttachmentQuotaResponse(
        total_used_bytes=total_used,
        total_quota_bytes=QUOTA_BYTES,
        used_percentage=percentage,
        remaining_bytes=remaining,
    )


@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TaskAttachment).where(TaskAttachment.id == attachment_id)
    res = await db.execute(stmt)
    attachment = res.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Attachment not found")

    await get_project_member(project_id=attachment.project_id, current_user=current_user, db=db)

    # Secure path construction
    normalized_rel = os.path.normpath(attachment.stored_filename)
    if ".." in normalized_rel or normalized_rel.startswith("/") or normalized_rel.startswith("\\"):
        raise ForbiddenError("Path traversal violation")

    full_path = os.path.join(settings.ATTACHMENT_STORAGE_PATH, normalized_rel)
    if not os.path.exists(full_path):
        raise NotFoundError("File not found on storage")

    return FileResponse(
        path=full_path,
        filename=attachment.filename,
        media_type=attachment.content_type,
    )


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TaskAttachment).where(TaskAttachment.id == attachment_id)
    res = await db.execute(stmt)
    attachment = res.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Attachment not found")

    member = await get_project_member(project_id=attachment.project_id, current_user=current_user, db=db)
    is_uploader = attachment.user_id == current_user.id
    is_manager = member.role == ProjectRole.MANAGER or current_user.role == UserRole.ADMIN

    if not is_uploader and not is_manager:
        raise ForbiddenError("Cannot delete another user's attachment")

    await delete_file(attachment.stored_filename)
    await db.delete(attachment)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="DELETE_ATTACHMENT",
        resource_type="ATTACHMENT",
        resource_id=str(attachment_id),
        changes={"filename": attachment.filename},
        ip_address=client_ip,
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
