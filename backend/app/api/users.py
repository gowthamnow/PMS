import math
import uuid
from typing import Any, Optional
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, require_admin
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.schemas.user import (
    UserCreate,
    UserResetPassword,
    UserResponse,
    UserUpdate,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Optional[UserRole] = None,
    search: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(User)
    count_query = select(func.count(User.id))

    if role:
        query = query.where(User.role == role)
        count_query = count_query.where(User.role == role)

    if search:
        search_term = f"%{search}%"
        condition = User.username.ilike(search_term) | User.email.ilike(search_term) | User.full_name.ilike(search_term)
        query = query.where(condition)
        count_query = count_query.where(condition)

    total_res = await db.execute(count_query)
    total = total_res.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(User.created_at.desc()).offset(offset).limit(page_size)
    items_res = await db.execute(query)
    items = items_res.scalars().all()

    pages = math.ceil(total / page_size) if total > 0 else 0

    return {
        "items": [UserResponse.model_validate(u) for u in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


@router.post("", response_model=UserResponse)
async def create_user(
    request: Request,
    user_in: UserCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Check uniqueness
    existing_res = await db.execute(
        select(User).where((User.username == user_in.username) | (User.email == user_in.email))
    )
    if existing_res.scalar_one_or_none():
        raise ValidationError("User with this username or email already exists")

    new_user = User(
        id=uuid.uuid4(),
        username=user_in.username,
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="CREATE_USER",
        resource_type="USER",
        resource_id=str(new_user.id),
        changes={"username": new_user.username, "role": new_user.role.value},
        ip_address=client_ip,
    )

    return new_user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_detail(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found")
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    user_in: UserUpdate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found")

    is_admin = current_user.role == UserRole.ADMIN
    is_self = current_user.id == user_id

    if not is_admin and not is_self:
        raise ForbiddenError("Cannot modify another user's profile")

    changes: dict[str, Any] = {}
    if user_in.full_name is not None:
        changes["full_name"] = user_in.full_name
        user.full_name = user_in.full_name

    if user_in.email is not None:
        # Check uniqueness if changed
        if user_in.email != user.email:
            check_res = await db.execute(select(User).where(User.email == user_in.email))
            if check_res.scalar_one_or_none():
                raise ValidationError("Email is already taken")
            changes["email"] = user_in.email
            user.email = user_in.email

    # Role and is_active can only be changed by admin
    if user_in.role is not None:
        if not is_admin:
            raise ForbiddenError("Only admins can modify user role")
        changes["role"] = user_in.role.value
        user.role = user_in.role

    if user_in.is_active is not None:
        if not is_admin:
            raise ForbiddenError("Only admins can modify active status")
        changes["is_active"] = user_in.is_active
        user.is_active = user_in.is_active

    await db.commit()
    await db.refresh(user)

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="UPDATE_USER",
        resource_type="USER",
        resource_id=str(user.id),
        changes=changes,
        ip_address=client_ip,
    )

    return user


@router.delete("/{user_id}")
async def deactivate_user(
    user_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found")

    if user.id == current_user.id:
        raise ValidationError("Cannot deactivate your own account")

    user.is_active = False
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="DEACTIVATE_USER",
        resource_type="USER",
        resource_id=str(user.id),
        ip_address=client_ip,
    )

    return {"message": "User deactivated successfully"}


@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: uuid.UUID,
    reset_data: UserResetPassword,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found")

    user.hashed_password = get_password_hash(reset_data.new_password)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="RESET_PASSWORD",
        resource_type="USER",
        resource_id=str(user.id),
        ip_address=client_ip,
    )

    return {"message": "User password reset successfully"}
