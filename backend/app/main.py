import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from app.api import (
    admin,
    ai,
    ai_orchestrator,
    attachments,
    auth,
    backup,
    dashboard,
    messages,
    milestones,
    notifications,
    projects,
    reports,
    tasks,
    time_entries,
    users,
    vault,
    workspaces,
)
from app.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.security import get_password_hash, limiter
from app.database import AsyncSessionLocal, init_db
from app.models.user import User, UserRole

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("engineering_pms")


async def bootstrap_admin() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.role == UserRole.ADMIN))
        admin = result.scalars().first()
        if not admin:
            logger.warning(
                "No admin user found. Creating initial bootstrap admin user '%s' (%s).",
                settings.FIRST_ADMIN_USERNAME,
                settings.FIRST_ADMIN_EMAIL,
            )
            initial_admin = User(
                id=uuid.uuid4(),
                username=settings.FIRST_ADMIN_USERNAME,
                email=settings.FIRST_ADMIN_EMAIL,
                full_name="System Administrator",
                hashed_password=get_password_hash(settings.FIRST_ADMIN_PASSWORD),
                role=UserRole.ADMIN,
                is_active=True,
            )
            session.add(initial_admin)
            await session.commit()
            logger.info("Bootstrap admin user created successfully.")

        # Ensure Master Admin Gowtham Thangaraj (gowthamthangaraj18@gmail.com) exists with full ADMIN rights
        gowtham_res = await session.execute(select(User).where(User.email == "gowthamthangaraj18@gmail.com"))
        gowtham_user = gowtham_res.scalars().first()
        if not gowtham_user:
            logger.info("Creating SuperAdmin Gowtham Thangaraj (gowthamthangaraj18@gmail.com)...")
            gowtham_admin = User(
                id=uuid.uuid4(),
                username="gowtham",
                email="gowthamthangaraj18@gmail.com",
                full_name="Gowtham Thangaraj",
                hashed_password=get_password_hash("AdminEng2026#Secure"),
                role=UserRole.ADMIN,
                is_active=True,
            )
            session.add(gowtham_admin)
            await session.commit()
            logger.info("Gowtham Thangaraj SuperAdmin created successfully.")
        else:
            if gowtham_user.role != UserRole.ADMIN or not gowtham_user.is_active:
                gowtham_user.role = UserRole.ADMIN
                gowtham_user.is_active = True
                await session.commit()
                logger.info("Updated Gowtham Thangaraj to active SuperAdmin.")

        # Ensure Test Engineer (engineer / engineer@engineering.local) exists for role testing
        eng_res = await session.execute(select(User).where(User.username == "engineer"))
        eng_user = eng_res.scalars().first()
        if not eng_user:
            logger.info("Creating Test Engineer account (engineer@engineering.local)...")
            eng_user = User(
                id=uuid.uuid4(),
                username="engineer",
                email="engineer@engineering.local",
                full_name="Alex Rivera (Firmware Eng)",
                hashed_password=get_password_hash("Engineer2026#Secure"),
                role=UserRole.ENGINEER,
                is_active=True,
            )
            session.add(eng_user)
            await session.commit()
            await session.refresh(eng_user)
            logger.info("Test Engineer created successfully.")
        else:
            eng_user.hashed_password = get_password_hash("Engineer2026#Secure")
            eng_user.is_active = True
            await session.commit()

        # Assign engineer only to "ENERGY METER" project so they have restricted access
        from app.models.project import Project, ProjectMember, ProjectRole
        p_res = await session.execute(select(Project).where(Project.name.like("%ENERGY METER%")))
        eng_project = p_res.scalars().first()
        if eng_project and eng_user:
            mem_res = await session.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == eng_project.id,
                    ProjectMember.user_id == eng_user.id,
                )
            )
            if not mem_res.scalars().first():
                pm = ProjectMember(
                    id=uuid.uuid4(),
                    project_id=eng_project.id,
                    user_id=eng_user.id,
                    role=ProjectRole.MEMBER,
                )
                session.add(pm)
                await session.commit()
                logger.info("Assigned test engineer to '%s'", eng_project.name)


async def background_email_automation_worker():
    """
    Background worker loop executing scheduled reminders:
    - Checks every 60 seconds
    - 8:30 AM (UTC+5:30 / IST: 03:00 UTC) -> Morning kickoff reminder
    - 5:00 PM (UTC+5:30 / IST: 11:30 UTC) -> Evening wrap-up & PM escalation
    """
    logger.info("Engineering PMS Background Email Automation Worker initialized.")
    last_morning_date = None
    last_evening_date = None

    while True:
        try:
            await asyncio.sleep(60)
            now_utc = datetime.now(timezone.utc)
            today_str = now_utc.strftime("%Y-%m-%d")

            # Check for weekday (0 = Monday, 4 = Friday)
            if now_utc.weekday() < 5:
                # Morning: 03:00 UTC is 8:30 AM IST (or 08:30 UTC if server configured in UTC)
                # We trigger once per day when hour is 8 local or 3 UTC
                if (now_utc.hour == 3 and now_utc.minute >= 0) and last_morning_date != today_str:
                    logger.info("Automated Cadence: Triggering Morning Day Plan Broadcast...")
                    async with AsyncSessionLocal() as session:
                        admin_res = await session.execute(select(User).where(User.role == UserRole.ADMIN))
                        admin_user = admin_res.scalars().first()
                        if admin_user:
                            try:
                                await tasks.trigger_morning_reminder(current_user=admin_user, db=session)
                                last_morning_date = today_str
                                logger.info("Automated Morning Reminder broadcast complete.")
                            except Exception as e:
                                logger.warning("Morning reminder automated trigger failed: %s", e)

                # Evening: 11:30 UTC is 5:00 PM IST
                if (now_utc.hour == 11 and now_utc.minute >= 30) and last_evening_date != today_str:
                    logger.info("Automated Cadence: Triggering Evening Wrap-up & PM Escalation...")
                    async with AsyncSessionLocal() as session:
                        admin_res = await session.execute(select(User).where(User.role == UserRole.ADMIN))
                        admin_user = admin_res.scalars().first()
                        if admin_user:
                            try:
                                await tasks.trigger_evening_reminder(current_user=admin_user, db=session)
                                last_evening_date = today_str
                                logger.info("Automated Evening Wrap-up broadcast complete.")
                            except Exception as e:
                                logger.warning("Evening reminder automated trigger failed: %s", e)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.debug("Background automation loop error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Engineering PMS API...")
    try:
        await init_db()
        await bootstrap_admin()
    except Exception as exc:
        logger.error("Error during database initialization/bootstrapping: %s", exc)

    worker_task = asyncio.create_task(background_email_automation_worker())
    yield
    worker_task.cancel()
    logger.info("Shutting down Engineering PMS API...")


app = FastAPI(
    title="Engineering PMS API",
    description="Complete Engineering Project Management System REST API",
    version="1.0.0",
    lifespan=lifespan,
)

# SlowAPI rate limiting configuration
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Custom application exception handlers
register_exception_handlers(app)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response

# CORS configuration
raw_frontend_url = settings.FRONTEND_URL.strip() if settings.FRONTEND_URL else "http://localhost:3000"
if raw_frontend_url == "*":
    # Disallow credentials if wildcard origin is configured to prevent CSRF/Bypass
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    allowed_origins = [raw_frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include all API routers with /api prefix
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(milestones.router, prefix="/api")
app.include_router(time_entries.router, prefix="/api")
app.include_router(attachments.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(workspaces.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(ai_orchestrator.router, prefix="/api")
app.include_router(vault.router, prefix="/api")
app.include_router(backup.router, prefix="/api")
app.include_router(admin.router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
