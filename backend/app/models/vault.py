import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ProjectFolder(Base):
    """
    Virtual & physical folders within a Project's File Management Vault.
    Common categories: 'datasheet', 'design files', 'code', 'extra', or custom.
    """
    __tablename__ = "project_folders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(30), default="blue", nullable=False)  # amber, blue, emerald, purple, slate
    icon = Column(String(50), default="folder", nullable=False)  # datasheet, design, code, extra, folder
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    project = relationship("Project")
    creator = relationship("User", foreign_keys=[created_by])
    files = relationship("ProjectVaultFile", back_populates="folder", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_project_folder_name"),
    )


class ProjectVaultFile(Base):
    """
    Individual file asset stored in a Project Vault folder.
    Supports datasheets, CAD schematics, source code, Gerber files, firmware hex/bin.
    """
    __tablename__ = "project_vault_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    folder_id = Column(UUID(as_uuid=True), ForeignKey("project_folders.id", ondelete="CASCADE"), nullable=True, index=True)
    filename = Column(String(255), nullable=False)
    stored_filename = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    content_type = Column(String(100), nullable=False)
    category = Column(String(50), default="extra", nullable=False)  # datasheet, design, code, extra
    description = Column(Text, nullable=True)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    project = relationship("Project")
    folder = relationship("ProjectFolder", back_populates="files")
    uploader = relationship("User", foreign_keys=[uploaded_by])
