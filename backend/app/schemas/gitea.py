import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class GiteaRepoCreate(BaseModel):
    project_id: uuid.UUID
    repo_full_name: str = Field(..., min_length=3, max_length=255)
    repo_url: str = Field(..., min_length=5, max_length=500)
    default_branch: str = "main"


class GiteaRepoResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    repo_full_name: str
    repo_url: str
    gitea_repo_id: Optional[int] = None
    default_branch: str
    is_active: bool
    webhook_secret: str
    last_synced_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GiteaEventResponse(BaseModel):
    id: uuid.UUID
    repo_id: uuid.UUID
    event_type: str
    event_id: str
    payload: Any
    processed_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GiteaCommitResponse(BaseModel):
    sha: str
    message: str
    author_name: str
    author_email: str
    committed_at: Optional[str] = None
    url: Optional[str] = None


class GiteaBranchResponse(BaseModel):
    name: str
    commit_sha: Optional[str] = None


class GiteaPullRequestResponse(BaseModel):
    id: int
    number: int
    title: str
    body: Optional[str] = None
    state: str
    head_branch: str
    base_branch: str
    user: Optional[str] = None
    created_at: Optional[str] = None
