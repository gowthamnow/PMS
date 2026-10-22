import os
import uuid
from pathlib import Path
import aiofiles
import aiofiles.os
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import StorageQuotaError, ValidationError
from app.models.task import TaskAttachment

QUOTA_BYTES = settings.ATTACHMENT_QUOTA_GB * 1024 * 1024 * 1024
MAX_FILE_BYTES = settings.ATTACHMENT_MAX_FILE_SIZE_MB * 1024 * 1024


async def get_total_used_bytes(db: AsyncSession) -> int:
    result = await db.execute(select(func.coalesce(func.sum(TaskAttachment.file_size), 0)))
    return int(result.scalar_one())


async def check_quota(db: AsyncSession, new_file_size: int) -> None:
    if new_file_size > MAX_FILE_BYTES:
        raise StorageQuotaError(
            f"File size exceeds maximum allowed size of {settings.ATTACHMENT_MAX_FILE_SIZE_MB}MB"
        )
    current_used = await get_total_used_bytes(db)
    if current_used + new_file_size > QUOTA_BYTES:
        raise StorageQuotaError(
            f"Storage quota exceeded: Cannot upload file. Used: {current_used} bytes, Max: {QUOTA_BYTES} bytes"
        )


def validate_file_content_type(header_bytes: bytes, declared_content_type: str) -> None:
    if not header_bytes or not declared_content_type:
        return

    detected_mime = None
    try:
        import magic
        mime = magic.Magic(mime=True)
        detected_mime = mime.from_buffer(header_bytes)
    except Exception:
        # Fallback signature checks using magic bytes
        if header_bytes.startswith(b"%PDF"):
            detected_mime = "application/pdf"
        elif header_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            detected_mime = "image/png"
        elif header_bytes.startswith(b"\xff\xd8\xff"):
            detected_mime = "image/jpeg"
        elif header_bytes.startswith(b"GIF87a") or header_bytes.startswith(b"GIF89a"):
            detected_mime = "image/gif"
        elif header_bytes.startswith(b"PK\x03\x04"):
            detected_mime = "application/zip"
        elif header_bytes.startswith(b"RIFF") and header_bytes[8:12] == b"WEBP":
            detected_mime = "image/webp"

    if detected_mime and declared_content_type:
        cat_detected = detected_mime.split("/")[0]
        cat_declared = declared_content_type.split("/")[0]
        if (
            cat_detected != cat_declared
            and declared_content_type != "application/octet-stream"
            and detected_mime != declared_content_type
        ):
            raise ValidationError(
                f"File content type mismatch: declared '{declared_content_type}' but detected '{detected_mime}'"
            )


ALLOWED_ATTACHMENT_EXTENSIONS = {
    "pdf", "png", "jpg", "jpeg", "webp", "gif", "zip", "tar", "gz",
    "csv", "txt", "docx", "xlsx", "pptx", "bin", "hex",
    "kicad_sch", "kicad_pcb", "gerber", "gbr", "step", "stp", "stl", "json", "md"
}

BLOCKED_EXTENSIONS = {
    "html", "htm", "svg", "exe", "bat", "cmd", "sh", "ps1", "vbs",
    "js", "py", "php", "jsp", "jar", "war", "dll", "so", "msi", "scr", "com", "pif"
}


def validate_extension(filename: str) -> str:
    ext = Path(filename).suffix.lstrip(".").lower()
    if not ext:
        raise ValidationError("Attachment must have a valid file extension")
    if ext in BLOCKED_EXTENSIONS or ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        raise ValidationError(f"File extension '.{ext}' is not permitted for upload")
    return "".join(c for c in ext if c.isalnum() or c == "_") or "bin"


async def save_file(
    content: bytes,
    project_id: uuid.UUID,
    original_filename: str,
) -> tuple[str, str]:
    safe_ext = validate_extension(original_filename)
    stored_filename = f"{uuid.uuid4()}.{safe_ext}"

    project_dir = os.path.join(settings.ATTACHMENT_STORAGE_PATH, str(project_id))
    os.makedirs(project_dir, exist_ok=True)

    full_path = os.path.join(project_dir, stored_filename)
    async with aiofiles.open(full_path, "wb") as f:
        await f.write(content)

    rel_path = f"{project_id}/{stored_filename}".replace("\\", "/")
    return rel_path, stored_filename


async def delete_file(stored_filename: str) -> None:
    normalized = os.path.normpath(stored_filename)
    if ".." in normalized or normalized.startswith("/") or normalized.startswith("\\"):
        raise ValidationError("Invalid file path")

    full_path = os.path.join(settings.ATTACHMENT_STORAGE_PATH, normalized)
    if await aiofiles.os.path.exists(full_path):
        await aiofiles.os.remove(full_path)
