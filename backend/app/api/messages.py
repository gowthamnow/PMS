import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models.message import Message
from app.models.project import Project, ProjectMember
from app.models.user import User, UserRole
from app.schemas.message import ConversationResponse, MessageCreate, MessageResponse

router = APIRouter(prefix="/messages", tags=["Messages"])


@router.get("", response_model=list[MessageResponse])
async def get_messages(
    recipient_id: Optional[uuid.UUID] = None,
    project_id: Optional[uuid.UUID] = None,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get messages for a conversation:
    - If project_id provided: fetches project channel messages.
    - If recipient_id provided: fetches direct messages between current_user and recipient_id.
    """
    if not recipient_id and not project_id:
        raise ValidationError("Either recipient_id or project_id must be provided.")

    if project_id:
        # Check membership unless admin
        if current_user.role != UserRole.ADMIN:
            mem_stmt = select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id,
            )
            mem = (await db.execute(mem_stmt)).scalar_one_or_none()
            if not mem:
                raise ForbiddenError("You are not a member of this project channel.")

        stmt = (
            select(Message)
            .options(selectinload(Message.sender), selectinload(Message.recipient))
            .where(Message.project_id == project_id)
            .order_by(Message.created_at.asc())
            .limit(limit)
        )
    else:
        stmt = (
            select(Message)
            .options(selectinload(Message.sender), selectinload(Message.recipient))
            .where(
                or_(
                    and_(Message.sender_id == current_user.id, Message.recipient_id == recipient_id),
                    and_(Message.sender_id == recipient_id, Message.recipient_id == current_user.id),
                )
            )
            .order_by(Message.created_at.asc())
            .limit(limit)
        )

    result = await db.execute(stmt)
    messages = result.scalars().all()

    # Mark unread direct messages sent to current_user as read
    if recipient_id:
        unread_stmt = (
            select(Message)
            .where(
                Message.sender_id == recipient_id,
                Message.recipient_id == current_user.id,
                Message.is_read == False,
            )
        )
        unreads = (await db.execute(unread_stmt)).scalars().all()
        for m in unreads:
            m.is_read = True
        if unreads:
            await db.commit()

    return messages


@router.post("", response_model=MessageResponse)
async def send_message(
    message_in: MessageCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a message either to a direct recipient or into a project channel.
    """
    if not message_in.recipient_id and not message_in.project_id:
        raise ValidationError("Must specify either recipient_id or project_id.")

    if message_in.project_id:
        if current_user.role != UserRole.ADMIN:
            mem_stmt = select(ProjectMember).where(
                ProjectMember.project_id == message_in.project_id,
                ProjectMember.user_id == current_user.id,
            )
            mem = (await db.execute(mem_stmt)).scalar_one_or_none()
            if not mem:
                raise ForbiddenError("Cannot message a project channel you do not belong to.")

    msg = Message(
        id=uuid.uuid4(),
        sender_id=current_user.id,
        recipient_id=message_in.recipient_id,
        project_id=message_in.project_id,
        content=message_in.content.strip(),
        attachment_url=message_in.attachment_url,
        is_read=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Reload relationships
    stmt = (
        select(Message)
        .options(selectinload(Message.sender), selectinload(Message.recipient))
        .where(Message.id == msg.id)
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return available conversations:
    1. Project channels accessible to current_user
    2. Direct message conversations with other active team members
    """
    conversations: list[ConversationResponse] = []

    # 1. Projects
    if current_user.role == UserRole.ADMIN:
        proj_stmt = select(Project).order_by(Project.name.asc())
    else:
        proj_stmt = (
            select(Project)
            .join(Project.members)
            .where(ProjectMember.user_id == current_user.id)
            .order_by(Project.name.asc())
        )
    projects = (await db.execute(proj_stmt)).scalars().all()

    for p in projects:
        # Get last message for this project
        last_msg_stmt = (
            select(Message)
            .where(Message.project_id == p.id)
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        last_msg = (await db.execute(last_msg_stmt)).scalar_one_or_none()

        conversations.append(
            ConversationResponse(
                id=f"project_{p.id}",
                type="channel",
                title=f"#{p.name}",
                subtitle=p.description or "Project channel",
                avatar_url=p.image_url,
                project_id=p.id,
                last_message=last_msg.content if last_msg else "No messages yet",
                last_message_at=last_msg.created_at if last_msg else p.created_at,
                unread_count=0,
            )
        )

    # 2. Team members for Direct Messages
    user_stmt = select(User).where(User.id != current_user.id, User.is_active == True).order_by(User.full_name.asc())
    users = (await db.execute(user_stmt)).scalars().all()

    for u in users:
        last_msg_stmt = (
            select(Message)
            .where(
                or_(
                    and_(Message.sender_id == current_user.id, Message.recipient_id == u.id),
                    and_(Message.sender_id == u.id, Message.recipient_id == current_user.id),
                )
            )
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        last_msg = (await db.execute(last_msg_stmt)).scalar_one_or_none()

        # Unread count
        unread_count_stmt = select(func.count(Message.id)).where(
            Message.sender_id == u.id,
            Message.recipient_id == current_user.id,
            Message.is_read == False,
        )
        unread_count = (await db.execute(unread_count_stmt)).scalar() or 0

        conversations.append(
            ConversationResponse(
                id=f"user_{u.id}",
                type="direct",
                title=u.full_name,
                subtitle=f"@{u.username} • {u.role.value}",
                avatar_url=u.avatar_url,
                recipient_id=u.id,
                last_message=last_msg.content if last_msg else "Start a direct conversation",
                last_message_at=last_msg.created_at if last_msg else u.created_at,
                unread_count=unread_count,
            )
        )

    return conversations
