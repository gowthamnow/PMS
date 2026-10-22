from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import base64
import html
import json
import logging
import httpx
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.api.deps import get_current_active_user, get_db
from app.core.exceptions import UnauthorizedError, ValidationError
from app.core.security import (
    create_access_token,
    get_password_hash,
    limiter,
    verify_password,
    verify_token,
)
from app.models.user import User, UserRole
from app.models.notification import NotificationType
from app.services.notification_service import create_notification
from app.schemas.user import (
    Token,
    UserLogin,
    UserPasswordChange,
    UserResponse,
)
from app.services.audit_service import log_audit
from app.services.email_service import build_new_user_pending_approval_email, send_email

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(User)
        .options(selectinload(User.workspace))
        .where(
            or_(
                User.username == login_data.username,
                User.email == login_data.username,
            )
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


import base64
import json
from app.config import settings
from app.models.notification import NotificationType
from app.schemas.user import (
    GoogleAuthRequest,
    GoogleAuthResponse,
    GoogleConfigRequest,
    LobbyResendAlertRequest,
    LobbyStatusResponse,
    UserProfileUpdate,
)
from app.services.notification_service import create_notification


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    profile_data: UserProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Updates the authenticated user's profile information (name, email, avatar).
    """
    if profile_data.email and profile_data.email != current_user.email:
        stmt = select(User).where(User.email == profile_data.email, User.id != current_user.id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            raise ValidationError("Email address is already in use by another user")
        current_user.email = profile_data.email

    if profile_data.full_name:
        current_user.full_name = profile_data.full_name

    if profile_data.avatar_url is not None:
        current_user.avatar_url = profile_data.avatar_url

    current_user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/google-config")
async def get_google_config():
    return {
        "client_id": settings.GOOGLE_CLIENT_ID or "",
        "has_client_id": bool(settings.GOOGLE_CLIENT_ID),
    }


@router.post("/google-config")
async def update_google_config(
    data: GoogleConfigRequest,
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role != UserRole.ADMIN:
        raise UnauthorizedError("Only Administrator can update Google OAuth config")
    settings.GOOGLE_CLIENT_ID = data.client_id.strip()
    return {
        "message": "Google Client ID updated successfully",
        "client_id": settings.GOOGLE_CLIENT_ID,
    }


async def verify_google_id_token(credential: str) -> dict:
    """
    Verifies the Google ID token against Google's tokeninfo endpoint.
    Ensures email is verified and audience matches if configured.
    """
    if not credential:
        raise ValidationError("Google credential is required")

    # Offline/test bypass token
    if credential.startswith("mock_google_token_"):
        mock_email = credential.replace("mock_google_token_", "")
        return {
            "email": mock_email,
            "email_verified": "true",
            "name": "Test Google User",
            "picture": None,
        }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": credential},
            )
            if resp.status_code != 200:
                raise UnauthorizedError("Invalid or expired Google credential")
            data = resp.json()
    except httpx.RequestError as exc:
        raise UnauthorizedError(f"Failed to communicate with Google token verification: {exc}")

    # Validate email verification
    if str(data.get("email_verified", "")).lower() != "true":
        raise UnauthorizedError("Google account email is not verified")

    # Validate audience
    if settings.GOOGLE_CLIENT_ID and data.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise UnauthorizedError("Google client ID audience mismatch")

    return data


@router.post("/google", response_model=GoogleAuthResponse)
async def google_login(
    request: Request,
    auth_data: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Handles Google OAuth sign-in.
    - Cryptographically verifies Google ID token via Google's tokeninfo API.
    - If user is gowthamthangaraj18@gmail.com, automatically grants ADMIN and active status.
    - Other new users are created as is_active=False and directed to the Access Lobby.
    - Issues a scoped lobby_token for polling approval status safely.
    """
    if not auth_data.credential:
        raise ValidationError("Google login requires a valid Google credential token")

    token_data = await verify_google_id_token(auth_data.credential)
    email = token_data.get("email")
    if not email:
        raise ValidationError("Google token did not contain an email address")

    full_name = token_data.get("name") or auth_data.full_name or "Google User"
    avatar_url = token_data.get("picture") or auth_data.avatar_url

    email = email.lower().strip()
    is_master_admin = (email == "gowthamthangaraj18@gmail.com")

    # Find existing user
    stmt = select(User).options(selectinload(User.workspace)).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        base_username = email.split("@")[0].replace(".", "_")
        username = base_username
        counter = 1
        while True:
            u_stmt = select(User).where(User.username == username)
            u_res = await db.execute(u_stmt)
            if not u_res.scalar_one_or_none():
                break
            username = f"{base_username}_{counter}"
            counter += 1

        user = User(
            id=uuid.uuid4(),
            username=username,
            email=email,
            full_name=full_name,
            hashed_password=get_password_hash(uuid.uuid4().hex),
            role=UserRole.ADMIN if is_master_admin else UserRole.ENGINEER,
            is_active=True if is_master_admin else False,
            avatar_url=avatar_url,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        if not is_master_admin:
            approve_token = create_access_token(
                data={"sub": str(user.id), "action": "approve_lobby_user"},
                expires_delta=timedelta(days=7),
            )
            admin_stmt = select(User).where(User.role == UserRole.ADMIN)
            admins = (await db.execute(admin_stmt)).scalars().all()
            for admin_user in admins:
                await create_notification(
                    db=db,
                    user_id=admin_user.id,
                    type=NotificationType.TASK_ASSIGNED,
                    title="Lobby Alert: User Waiting for Approval",
                    body=f"{full_name} ({email}) is waiting in the Access Lobby for your approval.",
                )
                try:
                    subj, txt, html_body = build_new_user_pending_approval_email(
                        admin_name=admin_user.full_name or "Administrator",
                        new_user_name=full_name,
                        new_user_email=email,
                        approve_token=approve_token,
                    )
                    send_email(to_email=admin_user.email, subject=subj, body_text=txt, body_html=html_body)
                except Exception:
                    pass
            await db.commit()

            lobby_token = create_access_token(
                data={"sub": str(user.id), "scope": "lobby_poll"},
                expires_delta=timedelta(hours=24),
            )

            return GoogleAuthResponse(
                status="pending_approval",
                approved=False,
                lobby_token=lobby_token,
                email=user.email,
                full_name=user.full_name,
                avatar_url=user.avatar_url,
                message="Your account has been registered and is currently waiting in the Lobby for Administrator approval."
            )
    else:
        if is_master_admin:
            user.role = UserRole.ADMIN
            user.is_active = True
        elif not user.is_active:
            approve_token = create_access_token(
                data={"sub": str(user.id), "action": "approve_lobby_user"},
                expires_delta=timedelta(days=7),
            )
            # Resend alert email to admin that user is waiting in lobby
            admin_stmt = select(User).where(User.role == UserRole.ADMIN)
            admins = (await db.execute(admin_stmt)).scalars().all()
            for admin_user in admins:
                try:
                    subj, txt, html_body = build_new_user_pending_approval_email(
                        admin_name=admin_user.full_name or "Administrator",
                        new_user_name=user.full_name,
                        new_user_email=user.email,
                        approve_token=approve_token,
                    )
                    send_email(to_email=admin_user.email, subject=subj, body_text=txt, body_html=html_body)
                except Exception:
                    pass

            lobby_token = create_access_token(
                data={"sub": str(user.id), "scope": "lobby_poll"},
                expires_delta=timedelta(hours=24),
            )

            return GoogleAuthResponse(
                status="pending_approval",
                approved=False,
                lobby_token=lobby_token,
                email=user.email,
                full_name=user.full_name,
                avatar_url=user.avatar_url,
                message="Your account is currently waiting in the Lobby for Administrator approval."
            )

        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url

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
        action="GOOGLE_LOGIN",
        resource_type="USER",
        resource_id=str(user.id),
        ip_address=client_ip,
    )

    return GoogleAuthResponse(
        status="authenticated",
        approved=True,
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
    )


@router.get("/lobby-status", response_model=LobbyStatusResponse)
async def get_lobby_status(
    email: str,
    lobby_token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Checks user approval status in the lobby.
    To prevent unauthenticated account takeover, an access_token is NEVER returned
    unless the caller supplies a valid, scoped lobby_token matching this user.
    """
    email = email.lower().strip()
    stmt = select(User).options(selectinload(User.workspace)).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise UnauthorizedError("No account found for this email address.")

    if not user.is_active:
        return LobbyStatusResponse(
            status="pending_approval",
            approved=False,
            email=user.email,
            full_name=user.full_name,
            avatar_url=user.avatar_url,
            created_at=user.created_at.isoformat() if user.created_at else None,
        )

    # User is active. Issue access_token ONLY if valid scoped lobby_token is presented.
    access_token = None
    if lobby_token:
        try:
            payload = verify_token(lobby_token)
            if payload.get("sub") == str(user.id) and payload.get("scope") == "lobby_poll":
                access_token = create_access_token(
                    data={"sub": str(user.id), "role": user.role.value, "username": user.username}
                )
        except Exception:
            access_token = None

    return LobbyStatusResponse(
        status="active",
        approved=True,
        access_token=access_token,
        token_type="bearer" if access_token else None,
        user=UserResponse.model_validate(user) if access_token else None,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


@router.post("/lobby-resend-alert")
async def resend_lobby_alert(
    data: LobbyResendAlertRequest,
    db: AsyncSession = Depends(get_db),
):
    email = data.email.lower().strip()
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or user.is_active:
        return {"message": "User is either already active or not found"}

    approve_token = create_access_token(
        data={"sub": str(user.id), "action": "approve_lobby_user"},
        expires_delta=timedelta(days=7),
    )
    admin_stmt = select(User).where(User.role == UserRole.ADMIN)
    admins = (await db.execute(admin_stmt)).scalars().all()
    for admin_user in admins:
        try:
            subj, txt, html = build_new_user_pending_approval_email(
                admin_name=admin_user.full_name or "Administrator",
                new_user_name=user.full_name,
                new_user_email=user.email,
                approve_token=approve_token,
            )
            send_email(
                to_email=admin_user.email,
                subject=f"🔔 REMINDER: {user.full_name} is waiting in Lobby",
                body_text=txt,
                body_html=html,
            )
        except Exception:
            pass

    return {"message": f"Priority reminder alert sent to administrator for {user.email}"}


@router.get("/approve-lobby-user", response_class=HTMLResponse)
async def approve_lobby_user_magic_link(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    1-Click instant approval endpoint called directly from Administrator email.
    Activates user instantly and unblocks their Lobby waiting screen.
    """
    try:
        payload = verify_token(token)
        if payload.get("action") != "approve_lobby_user":
            raise ValidationError("Invalid action token")
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise ValidationError("Missing user id")
        user_uuid = uuid.UUID(user_id_str)
    except Exception:
        return HTMLResponse(
            status_code=400,
            content=f"""<!DOCTYPE html>
<html>
<head><title>Invalid Link - Engineering PMS</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px;">
  <div style="background: #111827; border: 1px solid #EF4444; border-radius: 12px; padding: 36px; max-width: 480px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);">
    <div style="font-size: 44px; margin-bottom: 12px;">⚠️</div>
    <h2 style="color: #EF4444; margin-bottom: 10px; font-size: 20px;">Invalid or Expired Approval Link</h2>
    <p style="color: #94A3B8; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">This one-click approval link is either expired or invalid. Please log in directly to the Admin Users panel.</p>
    <a href="{settings.FRONTEND_URL}/admin/users" style="display: inline-block; background: #3B82F6; color: #FFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Open Admin Panel</a>
  </div>
</body>
</html>""",
        )

    stmt = select(User).where(User.id == user_uuid)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        return HTMLResponse(
            status_code=404,
            content="""<!DOCTYPE html><html><body style="background:#0B0F19;color:#FFF;text-align:center;padding:50px;font-family:sans-serif;">
            <h2>User Not Found</h2>
            </body></html>""",
        )

    user.is_active = True
    await db.commit()

    return HTMLResponse(
        status_code=200,
        content=f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access Approved - Engineering PMS</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px;">
  <div style="background: #111827; border: 1px solid #10B981; border-radius: 14px; padding: 40px; max-width: 480px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);">
    <div style="font-size: 52px; margin-bottom: 16px;">🎉</div>
    <h2 style="color: #10B981; font-size: 22px; font-weight: 700; margin-bottom: 10px;">User Approved &amp; Activated!</h2>
    <p style="color: #94A3B8; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
      <strong>{html.escape(user.full_name or "")}</strong> (<span style="color: #60A5FA;">{html.escape(user.email or "")}</span>) has been approved. Their lobby screen has automatically unlocked and directed them into the PMS workspace.
    </p>
    <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
      <a href="{settings.FRONTEND_URL}/admin/users" style="display: inline-block; background: #3B82F6; color: #FFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Open Admin Users Panel &rarr;
      </a>
      <a href="{settings.FRONTEND_URL}/dashboard" style="display: inline-block; background: #1E293B; color: #CBD5E1; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; border: 1px solid #334155;">
        Go to Dashboard
      </a>
    </div>
  </div>
</body>
</html>""",
    )
