import os
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_active_user,
    get_db,
    get_project_member,
    require_admin_or_pm,
)
from app.config import settings
from app.core.exceptions import (
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.models.project import Project
from app.models.user import User, UserRole
from app.models.vault import ProjectFolder, ProjectVaultFile
from app.schemas.vault import (
    ProjectFolderCreate,
    ProjectFolderResponse,
    ProjectVaultFileResponse,
    ProjectVaultStatsResponse,
)
from app.services.audit_service import log_audit
from app.services.storage_service import (
    MAX_FILE_BYTES,
    delete_file,
    save_file,
    validate_file_content_type,
)

router = APIRouter(tags=["Project File Management Vault"])

DEFAULT_FOLDERS = [
    {
        "name": "Datasheets",
        "color": "blue",
        "icon": "datasheet",
        "description": "Component IC datasheets, pinout charts, and hardware reference manuals.",
    },
    {
        "name": "Design Files",
        "color": "purple",
        "icon": "design",
        "description": "PCB schematics, Altium/KiCad layouts, Gerber archives, CAD, and 3D STEP models.",
    },
    {
        "name": "Code & Firmware",
        "color": "emerald",
        "icon": "code",
        "description": "Firmware HEX/BIN builds, driver sources, embedded C/C++ archives, and test scripts.",
    },
    {
        "name": "Extra & Documents",
        "color": "amber",
        "icon": "extra",
        "description": "Lab test waveforms, oscillograms, QA checklists, photos, and general documentation.",
    },
]


async def ensure_default_folders(db: AsyncSession, project_id: uuid.UUID) -> None:
    """
    Automatically initializes the 4 core engineering folders if the project has none.
    """
    existing_res = await db.execute(select(func.count(ProjectFolder.id)).where(ProjectFolder.project_id == project_id))
    count = existing_res.scalar_one()
    if count == 0:
        for f_data in DEFAULT_FOLDERS:
            folder = ProjectFolder(
                id=uuid.uuid4(),
                project_id=project_id,
                name=f_data["name"],
                color=f_data["color"],
                icon=f_data["icon"],
                description=f_data["description"],
            )
            db.add(folder)
        await db.commit()


@router.get("/projects/{project_id}/folders", response_model=list[ProjectFolderResponse])
async def list_project_folders(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists all folders in a project's File Management Vault with live file counts and byte size.
    Auto-seeds default engineering folders ('Datasheets', 'Design Files', 'Code & Firmware', 'Extra') if empty.
    """
    await get_project_member(project_id=project_id, current_user=current_user, db=db)
    await ensure_default_folders(db=db, project_id=project_id)

    stmt = select(ProjectFolder).where(ProjectFolder.project_id == project_id).order_by(ProjectFolder.created_at.asc())
    folders = (await db.execute(stmt)).scalars().all()

    # Aggregate file stats per folder
    stats_stmt = (
        select(
            ProjectVaultFile.folder_id,
            func.count(ProjectVaultFile.id).label("file_count"),
            func.coalesce(func.sum(ProjectVaultFile.file_size), 0).label("total_bytes"),
        )
        .where(ProjectVaultFile.project_id == project_id)
        .group_by(ProjectVaultFile.folder_id)
    )
    stats_res = await db.execute(stats_stmt)
    stats_map = {row.folder_id: {"file_count": row.file_count, "total_bytes": row.total_bytes} for row in stats_res.all()}

    results = []
    for f in folders:
        f_stats = stats_map.get(f.id, {"file_count": 0, "total_bytes": 0})
        f_resp = ProjectFolderResponse.model_validate(f)
        f_resp.file_count = f_stats["file_count"]
        f_resp.total_bytes = f_stats["total_bytes"]
        results.append(f_resp)

    return results


@router.post("/projects/{project_id}/folders", response_model=ProjectFolderResponse, status_code=status.HTTP_201_CREATED)
async def create_project_folder(
    project_id: uuid.UUID,
    folder_in: ProjectFolderCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a new custom folder in the project's File Management Vault.
    """
    await get_project_member(project_id=project_id, current_user=current_user, db=db)

    # Check for duplicate folder name in project
    existing = await db.execute(
        select(ProjectFolder).where(
            ProjectFolder.project_id == project_id,
            ProjectFolder.name.ilike(folder_in.name.strip()),
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"Folder '{folder_in.name}' already exists in this project.")

    folder = ProjectFolder(
        id=uuid.uuid4(),
        project_id=project_id,
        name=folder_in.name.strip(),
        description=folder_in.description,
        color=folder_in.color or "blue",
        icon=folder_in.icon or "folder",
        created_by=current_user.id,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="CREATE_VAULT_FOLDER",
        resource_type="VAULT_FOLDER",
        resource_id=str(folder.id),
        changes={"name": folder.name, "project_id": str(project_id)},
        ip_address=client_ip,
    )

    f_resp = ProjectFolderResponse.model_validate(folder)
    f_resp.file_count = 0
    f_resp.total_bytes = 0
    return f_resp


@router.delete("/projects/{project_id}/folders/{folder_id}")
async def delete_project_folder(
    project_id: uuid.UUID,
    folder_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_admin_or_pm),
    db: AsyncSession = Depends(get_db),
):
    """
    Deletes a folder and all files contained within it.
    """
    folder_res = await db.execute(
        select(ProjectFolder).where(ProjectFolder.id == folder_id, ProjectFolder.project_id == project_id)
    )
    folder = folder_res.scalar_one_or_none()
    if not folder:
        raise NotFoundError("Folder not found")

    # Fetch files to delete physically
    files_res = await db.execute(select(ProjectVaultFile).where(ProjectVaultFile.folder_id == folder_id))
    files = files_res.scalars().all()
    for f in files:
        file_path = os.path.join(settings.ATTACHMENT_STORAGE_PATH, f.stored_filename)
        delete_file(file_path)

    await db.delete(folder)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="DELETE_VAULT_FOLDER",
        resource_type="VAULT_FOLDER",
        resource_id=str(folder_id),
        changes={"deleted_folder": folder.name},
        ip_address=client_ip,
    )

    return {"message": f"Folder '{folder.name}' and all its contents deleted successfully."}


@router.get("/projects/{project_id}/vault-files", response_model=list[ProjectVaultFileResponse])
async def list_vault_files(
    project_id: uuid.UUID,
    folder_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists files inside the project's File Management Vault.
    Can be filtered by specific folder, filename search, or category.
    """
    await get_project_member(project_id=project_id, current_user=current_user, db=db)

    query = (
        select(ProjectVaultFile)
        .options(selectinload(ProjectVaultFile.uploader))
        .where(ProjectVaultFile.project_id == project_id)
    )

    if folder_id:
        query = query.where(ProjectVaultFile.folder_id == folder_id)

    if category and category.upper() != "ALL":
        query = query.where(ProjectVaultFile.category == category.lower())

    if search:
        s_term = f"%{search}%"
        query = query.where(ProjectVaultFile.filename.ilike(s_term) | ProjectVaultFile.description.ilike(s_term))

    query = query.order_by(ProjectVaultFile.created_at.desc())
    res = await db.execute(query)
    files = res.scalars().all()
    return [ProjectVaultFileResponse.model_validate(f) for f in files]


@router.post("/projects/{project_id}/vault-files", response_model=ProjectVaultFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_vault_file(
    project_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    folder_id: Optional[uuid.UUID] = Form(None),
    category: Optional[str] = Form("extra"),
    description: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Uploads a file directly into a specific folder in the Project File Management Vault.
    Validates file integrity and stores it in the project vault directory.
    """
    await get_project_member(project_id=project_id, current_user=current_user, db=db)

    # Validate folder exists if specified
    if folder_id:
        f_res = await db.execute(select(ProjectFolder).where(ProjectFolder.id == folder_id, ProjectFolder.project_id == project_id))
        folder = f_res.scalar_one_or_none()
        if not folder:
            raise NotFoundError("Specified folder not found in this project.")

    content = await file.read()
    file_size = len(content)

    if file_size > MAX_FILE_BYTES:
        raise ValidationError(f"File size exceeds maximum allowed size ({settings.ATTACHMENT_MAX_FILE_SIZE_MB}MB)")

    clean_filename = os.path.basename(file.filename or "uploaded_file")
    ext = clean_filename.split(".")[-1].lower() if "." in clean_filename else ""

    # Use user-specified category if provided; only infer if omitted
    cat_val = category.lower() if category and category.lower() not in ("", "all") else ""
    if not cat_val:
        if "calc" in clean_filename.lower() or "report" in clean_filename.lower():
            cat_val = "extra"
        elif ext in ["pdf", "doc", "docx", "txt", "md"]:
            cat_val = "datasheet"
        elif ext in ["sch", "kicad_sch", "brd", "kicad_pcb", "step", "stp", "gerber", "gbr"]:
            cat_val = "design"
        elif ext in ["c", "h", "cpp", "hpp", "ino", "py", "rs", "hex", "bin", "elf"]:
            cat_val = "code"
        else:
            cat_val = "extra"

    # Store file on disk
    vault_dir = os.path.join(settings.ATTACHMENT_STORAGE_PATH, "vault", str(project_id))
    os.makedirs(vault_dir, exist_ok=True)
    stored_name = f"vault_{uuid.uuid4().hex}_{clean_filename}"
    rel_stored_name = os.path.join("vault", str(project_id), stored_name)
    full_path = os.path.join(settings.ATTACHMENT_STORAGE_PATH, rel_stored_name)

    with open(full_path, "wb") as f_out:
        f_out.write(content)

    vault_file = ProjectVaultFile(
        id=uuid.uuid4(),
        project_id=project_id,
        folder_id=folder_id,
        filename=clean_filename,
        stored_filename=rel_stored_name,
        file_size=file_size,
        content_type=file.content_type or "application/octet-stream",
        category=cat_val,
        description=description,
        uploaded_by=current_user.id,
    )
    db.add(vault_file)
    await db.commit()

    # Re-fetch with uploader loaded
    stmt = (
        select(ProjectVaultFile)
        .options(selectinload(ProjectVaultFile.uploader))
        .where(ProjectVaultFile.id == vault_file.id)
    )
    refreshed = (await db.execute(stmt)).scalar_one()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UPLOAD_VAULT_FILE",
        resource_type="VAULT_FILE",
        resource_id=str(vault_file.id),
        changes={"filename": clean_filename, "size": file_size, "category": cat_val},
        ip_address=client_ip,
    )

    return ProjectVaultFileResponse.model_validate(refreshed)


@router.get("/vault/files/{file_id}/download")
async def download_vault_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Downloads or streams a file from the project File Management Vault.
    """
    stmt = select(ProjectVaultFile).where(ProjectVaultFile.id == file_id)
    file_res = await db.execute(stmt)
    vault_file = file_res.scalar_one_or_none()
    if not vault_file:
        raise NotFoundError("Vault file not found")

    await get_project_member(project_id=vault_file.project_id, current_user=current_user, db=db)

    full_path = os.path.join(settings.ATTACHMENT_STORAGE_PATH, vault_file.stored_filename)
    if not os.path.exists(full_path):
        raise NotFoundError("Physical file asset is missing on server storage")

    return FileResponse(
        path=full_path,
        filename=vault_file.filename,
        media_type=vault_file.content_type,
    )


@router.delete("/vault/files/{file_id}")
async def delete_vault_file(
    file_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Deletes a file from the Project File Management Vault.
    """
    stmt = select(ProjectVaultFile).where(ProjectVaultFile.id == file_id)
    file_res = await db.execute(stmt)
    vault_file = file_res.scalar_one_or_none()
    if not vault_file:
        raise NotFoundError("Vault file not found")

    member = await get_project_member(project_id=vault_file.project_id, current_user=current_user, db=db)

    is_uploader = vault_file.uploaded_by == current_user.id
    is_admin = current_user.role == UserRole.ADMIN
    is_pm = member.role.value in ["MANAGER", "PROJECT_MANAGER"] if hasattr(member.role, "value") else str(member.role) in ["MANAGER", "PROJECT_MANAGER"]

    if not is_uploader and not is_admin and not is_pm:
        raise ForbiddenError("Only the uploader, project manager, or admin can delete this file")

    full_path = os.path.join(settings.ATTACHMENT_STORAGE_PATH, vault_file.stored_filename)
    delete_file(full_path)

    await db.delete(vault_file)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="DELETE_VAULT_FILE",
        resource_type="VAULT_FILE",
        resource_id=str(file_id),
        changes={"filename": vault_file.filename},
        ip_address=client_ip,
    )

    return {"message": f"File '{vault_file.filename}' deleted successfully."}


@router.get("/projects/{project_id}/vault-stats", response_model=ProjectVaultStatsResponse)
async def get_vault_stats(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns aggregate file statistics, storage usage, and categories breakdown.
    """
    await get_project_member(project_id=project_id, current_user=current_user, db=db)

    # Folders count
    f_res = await db.execute(select(func.count(ProjectFolder.id)).where(ProjectFolder.project_id == project_id))
    folders_count = f_res.scalar_one()

    # Files stats
    stats_res = await db.execute(
        select(
            func.count(ProjectVaultFile.id),
            func.coalesce(func.sum(ProjectVaultFile.file_size), 0),
        ).where(ProjectVaultFile.project_id == project_id)
    )
    total_files, total_bytes = stats_res.one()

    # Category breakdown
    cat_res = await db.execute(
        select(ProjectVaultFile.category, func.count(ProjectVaultFile.id))
        .where(ProjectVaultFile.project_id == project_id)
        .group_by(ProjectVaultFile.category)
    )
    categories = {row[0]: row[1] for row in cat_res.all()}

    return ProjectVaultStatsResponse(
        total_files=total_files,
        total_bytes=total_bytes,
        folders_count=folders_count,
        categories=categories,
    )
