from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.core.exceptions import UnauthorizedError, ValidationError
from app.core.security import (
    create_access_token,
    get_password_hash,
    limiter,
    verify_password,
)
from app.models.user import User
from app.schemas.user import (
    Token,
    UserLogin,
    UserPasswordChange,
    UserResponse,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).where(
        or_(
            User.username == login_data.username,
            User.email == login_data.username,
        )
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise UnauthorizedError("Incorrect username or password")

    if not user.is_active:
        raise UnauthorizedError("User account is inactive")

    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "username": user.username}
    )

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=user.id,
        action="LOGIN",
        resource_type="USER",
        resource_id=str(user.id),
        ip_address=client_ip,
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post("/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="LOGOUT",
        resource_type="USER",
        resource_id=str(current_user.id),
        ip_address=client_ip,
    )
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user),
):
    return current_user


@router.post("/change-password")
async def change_password(
    request: Request,
    password_data: UserPasswordChange,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise ValidationError("Current password does not match")

    current_user.hashed_password = get_password_hash(password_data.new_password)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await log_audit(
        db=db,
        user_id=current_user.id,
        action="CHANGE_PASSWORD",
        resource_type="USER",
        resource_id=str(current_user.id),
        ip_address=client_ip,
    )

    return {"message": "Password changed successfully"}
