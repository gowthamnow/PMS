import uuid
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def log_audit(
    db: AsyncSession,
    user_id: Optional[uuid.UUID],
    action: str,
    resource_type: str,
    resource_id: str,
    changes: Optional[Any] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    entry = AuditLog(
        id=uuid.uuid4(),
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        changes=changes,
        ip_address=ip_address,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry
