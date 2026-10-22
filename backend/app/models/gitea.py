import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class GiteaRepo(Base):
    __tablename__ = "gitea_repos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    repo_full_name = Column(String(255), unique=True, nullable=False, index=True)
    repo_url = Column(String(500), nullable=False)
    gitea_repo_id = Column(Integer, nullable=True)
    default_branch = Column(String(100), default="main", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    webhook_secret = Column(String(255), nullable=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("Project")
    events = relationship("GiteaEvent", back_populates="repo", cascade="all, delete-orphan")


class GiteaEvent(Base):
    __tablename__ = "gitea_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id = Column(UUID(as_uuid=True), ForeignKey("gitea_repos.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    event_id = Column(String(255), unique=True, nullable=False, index=True)
    payload = Column(JSON, nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    repo = relationship("GiteaRepo", back_populates="events")
