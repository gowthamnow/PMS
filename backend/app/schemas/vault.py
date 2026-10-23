import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.schemas.user import UserResponse


class ProjectFolderCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "blue"
    icon: Optional[str] = "folder"


class ProjectFolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: Optional[str] = None
    color: str
    icon: str
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    file_count: Optional[int] = 0
    total_bytes: Optional[int] = 0


class ProjectVaultFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    folder_id: Optional[uuid.UUID] = None
    filename: str
    stored_filename: str
    file_size: int
    content_type: str
    category: str
    description: Optional[str] = None
    uploaded_by: Optional[uuid.UUID] = None
    uploader: Optional[UserResponse] = None
    created_at: datetime
    updated_at: datetime


class ProjectVaultStatsResponse(BaseModel):
    total_files: int
    total_bytes: int
    folders_count: int
    categories: dict[str, int]
