from collections.abc import AsyncGenerator
import uuid
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    # Import all models so that Base.metadata has all table definitions
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Ensure columns exist on existing databases
        await conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;"
            )
        )

        # Check if any workspace exists
        res = await conn.execute(text("SELECT id FROM workspaces LIMIT 1;"))
        ws_row = res.fetchone()
        if not ws_row:
            default_id = uuid.uuid4()
            await conn.execute(
                text(
                    "INSERT INTO workspaces (id, name, description, created_at, updated_at) "
                    "VALUES (:id, 'Main Engineering Workspace', 'Primary workspace for engineering projects and teams', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);"
                ),
                {"id": default_id},
            )
            # Backfill existing projects and users
            await conn.execute(
                text("UPDATE projects SET workspace_id = :ws_id WHERE workspace_id IS NULL;"),
                {"ws_id": default_id},
            )
            await conn.execute(
                text("UPDATE users SET workspace_id = :ws_id WHERE workspace_id IS NULL AND role != 'ADMIN';"),
                {"ws_id": default_id},
            )
        else:
            default_id = ws_row[0]
            # Backfill any newly added projects without workspace
            await conn.execute(
                text("UPDATE projects SET workspace_id = :ws_id WHERE workspace_id IS NULL;"),
                {"ws_id": default_id},
            )

        # Initialize default vault folders for projects if needed
        proj_res = await conn.execute(text("SELECT id FROM projects;"))
        for (p_id,) in proj_res.fetchall():
            cnt = (await conn.execute(text(f"SELECT COUNT(*) FROM project_folders WHERE project_id = '{p_id}';"))).scalar_one()
            if cnt == 0:
                for f_name, f_col, f_ico, f_desc in [
                    ("Datasheets", "blue", "datasheet", "Component IC datasheets, pinout charts, and hardware reference manuals."),
                    ("Design Files", "purple", "design", "PCB schematics, Altium/KiCad layouts, Gerber archives, CAD, and 3D STEP models."),
                    ("Code & Firmware", "emerald", "code", "Firmware HEX/BIN builds, driver sources, embedded C/C++ archives, and test scripts."),
                    ("Extra & Documents", "amber", "extra", "Lab test waveforms, oscillograms, QA checklists, photos, and general documentation."),
                ]:
                    fid = uuid.uuid4()
                    await conn.execute(
                        text(
                            "INSERT INTO project_folders (id, project_id, name, color, icon, description, created_at, updated_at) "
                            "VALUES (:id, :pid, :name, :color, :icon, :desc, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);"
                        ),
                        {"id": fid, "pid": p_id, "name": f_name, "color": f_col, "icon": f_ico, "desc": f_desc},
                    )
