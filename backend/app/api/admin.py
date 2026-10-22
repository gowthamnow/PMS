import os
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin
from app.config import settings
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogResponse
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/audit-log")
async def get_audit_log(
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    offset = (page - 1) * page_size
    total_result = await db.execute(select(func.count(AuditLog.id)))
    total = total_result.scalar() or 0
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    )
    items = result.scalars().all()
    pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": [AuditLogResponse.model_validate(i) for i in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


@router.get("/system-info")
async def get_system_info(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Storage usage
    storage_path = settings.ATTACHMENT_STORAGE_PATH
    total_size = 0
    if os.path.exists(storage_path):
        for dirpath, dirnames, filenames in os.walk(storage_path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                try:
                    total_size += os.path.getsize(fp)
                except OSError:
                    pass
    quota_bytes = settings.ATTACHMENT_QUOTA_GB * 1024**3

    # User count
    user_count = await db.execute(select(func.count(User.id)).where(User.is_active == True))
    active_users = user_count.scalar() or 0

    return {
        "version": settings.APP_VERSION,
        "storage_used_bytes": total_size,
        "storage_quota_bytes": quota_bytes,
        "storage_used_gb": round(total_size / 1024**3, 3),
        "storage_quota_gb": settings.ATTACHMENT_QUOTA_GB,
        "storage_percent": round(total_size / quota_bytes * 100, 1) if quota_bytes > 0 else 0.0,
        "active_users": active_users,
        "database": "connected",
    }
