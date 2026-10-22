import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class TaskStatus(str, PyEnum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    IN_REVIEW = "IN_REVIEW"
    BLOCKED = "BLOCKED"
    DONE = "DONE"


class TaskPriority(str, PyEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class DependencyType(str, PyEnum):
    BLOCKS = "BLOCKS"
    BLOCKED_BY = "BLOCKED_BY"
    RELATES_TO = "RELATES_TO"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    acceptance_criteria = Column(Text, nullable=True)
    status = Column(Enum(TaskStatus), nullable=False, default=TaskStatus.TODO, index=True)
    priority = Column(Enum(TaskPriority), nullable=False, default=TaskPriority.MEDIUM)
    assignee_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reviewer_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    estimated_hours = Column(Numeric(6, 2), nullable=True)
    start_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    task_number = Column(Integer, nullable=False, index=True)
    git_refs = Column(JSON, default=list, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)

    project = relationship("Project")
    creator = relationship("User", foreign_keys=[creator_id])
    assignee = relationship("User", foreign_keys=[assignee_id])
    reviewer = relationship("User", foreign_keys=[reviewer_id])
    parent_task = relationship("Task", remote_side=[id], foreign_keys=[parent_task_id])
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")
    attachments = relationship("TaskAttachment", back_populates="task", cascade="all, delete-orphan")
    dependencies = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.task_id",
        back_populates="task",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("project_id", "task_number", name="uq_project_task_number"),
    )


class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    is_edited = Column(Boolean, default=False, nullable=False)

    task = relationship("Task", back_populates="comments")
    user = relationship("User")


class TaskAttachment(Base):
    __tablename__ = "task_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    stored_filename = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    content_type = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    task = relationship("Task", back_populates="attachments")
    project = relationship("Project")
    user = relationship("User")


class TaskDependency(Base):
    __tablename__ = "task_dependencies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    depends_on_task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    dependency_type = Column(Enum(DependencyType), nullable=False, default=DependencyType.BLOCKS)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    task = relationship("Task", foreign_keys=[task_id], back_populates="dependencies")
    depends_on_task = relationship("Task", foreign_keys=[depends_on_task_id])

    __table_args__ = (
        UniqueConstraint("task_id", "depends_on_task_id", name="uq_task_dependency"),
    )
