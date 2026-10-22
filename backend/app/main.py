from contextlib import asynccontextmanager
import logging
import uuid
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from app.api import (
    admin,
    attachments,
    auth,
    dashboard,
    gitea,
    milestones,
    notifications,
    projects,
    reports,
    tasks,
    time_entries,
    users,
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
                "No admin user found. Creating initial bootstrap admin user '%s' (%s). "
                "PLEASE CHANGE THE DEFAULT PASSWORD IN PRODUCTION!",
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Engineering PMS API...")
    try:
        await init_db()
        await bootstrap_admin()
    except Exception as exc:
        logger.error("Error during database initialization/bootstrapping: %s", exc)
    yield
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

# CORS configuration
allowed_origins = [settings.FRONTEND_URL]
if settings.FRONTEND_URL != "*":
    allowed_origins.extend(["http://localhost:3000", "http://127.0.0.1:3000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if "*" not in allowed_origins else ["*"],
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
if getattr(gitea.router, "prefix", "").startswith("/api"):
    app.include_router(gitea.router)
else:
    app.include_router(gitea.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(admin.router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
