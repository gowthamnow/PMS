import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class NotificationType(str, PyEnum):
    TASK_ASSIGNED = "TASK_ASSIGNED"
    COMMENT_MENTION = "COMMENT_MENTION"
    DEADLINE_APPROACHING = "DEADLINE_APPROACHING"
    TASK_OVERDUE = "TASK_OVERDUE"
    REVIEW_REQUESTED = "REVIEW_REQUESTED"
    PR_LINKED = "PR_LINKED"
    TASK_BLOCKED = "TASK_BLOCKED"
    PROJECT_UPDATED = "PROJECT_UPDATED"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(Enum(NotificationType), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    related_task_id = Column(UUID(as_uuid=True), nullable=True)
    related_project_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User")
