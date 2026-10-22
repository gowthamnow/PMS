# 📘 Engineering PMS - Developer Handover Guide

> **Document Version**: 2.0  
> **Date**: October 2026  
> **Target Audience**: Incoming Software / DevOps Engineers taking over development and maintenance of Engineering PMS.

---

## 1. Executive Summary & Purpose

**Engineering PMS** is a specialized, production-ready Project Management and Version Control System designed specifically for engineering teams handling hardware product development, firmware benches, and software stacks.

Unlike generic issue trackers, this system integrates:
1. **Dual-View Dashboards**: Engineer Action Hub vs Admin Operations & Broadcast Center.
2. **Strict Role-Based Scoping**: Non-admin engineers only see assigned projects; project creation is restricted to Admins.
3. **Inbuilt Gitea Git Hub**: Embedded Git repository browser, automatic webhook event ingestion, terminal push command generators, and one-click commit linkers.
4. **Cadence & Escalation System**: Automated morning kickoff and evening wrap-up reminders that escalate tasks with zero daily activity to Project Managers in CC.
5. **Hardware Schematic & Document Vault**: High-speed multipart uploads up to 25 MB with 2 GB project quotas.
6. **Hardware Design Aesthetic**: Modern high-density UI with Obsidian Navy Dark Mode, Warm Ivory Light Mode, and 3D elevation project cards.

---

## 2. Production Server & Infrastructure Coordinates

The live staging/production system is hosted on an **AWS EC2** instance:

| Parameter | Value |
| :--- | :--- |
| **Public IPv4** | `16.16.124.247` |
| **SSH User** | `ubuntu` |
| **SSH Key** | User private key (e.g. `Subasri.pem`) |
| **Operating System** | Ubuntu 24.04 LTS (Noble Numbat, x86_64) |
| **App Path on Server** | `/home/ubuntu/engineering-pms` |
| **Public Web App Port** | `8080` (HTTP) |
| **Internal Backend Port** | `8000` (FastAPI / Uvicorn) |
| **Internal Database Port** | `5432` (PostgreSQL 15) |
| **Internal Gitea Port** | `3000` (Gitea HTTP engine) |

### ⚠️ AWS Security Group Inbound Rule Note
- By default on AWS EC2, port `22` (SSH) is open.
- If you access the web interface via SSH Port Forwarding:
  ```bash
  ssh -i Subasri.pem -L 8080:localhost:8080 ubuntu@16.16.124.247
  ```
  Then open [http://localhost:8080](http://localhost:8080) on your local browser.
- **For Direct Team Access Without SSH Tunnel**:
  1. Open the **AWS EC2 Management Console**.
  2. Locate the instance (`16.16.124.247`) and click the associated **Security Group**.
  3. Go to **Inbound Rules** -> **Edit inbound rules**.
  4. Add a rule:
     - **Type**: `Custom TCP`
     - **Port range**: `8080`
     - **Source**: `0.0.0.0/0` (Anywhere IPv4)
  5. Save rules. The entire team can now navigate directly to `http://16.16.124.247:8080`.

---

## 3. Container Topology & Docker Compose Architecture

The application runs via `docker-compose.yml` with 5 orchestrated containers connected through an isolated bridge network (`pms_net`):

```
+-------------------------------------------------------------------------------+
|                                  DOCKER HOST                                  |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   |                          NGINX (Port 8080:80)                         |   |
|   |                                                                       |   |
|   |   /api/ -> backend:8000      /gitea/ -> gitea:3000      / -> frontend |   |
|   +-------------------+--------------------+----------------------+-------+   |
|                       |                    |                      |           |
|                       v                    v                      v           |
|            +--------------------+  +--------------+  +--------------------+   |
|            |   FASTAPI BACKEND  |  |  GITEA VCS   |  |    REACT FRONTEND  |   |
|            |    (Port 8000)     |  | (Port 3000)  |  |     (Nginx SPA)    |   |
|            +---------+----------+  +-------+------+  +--------------------+   |
|                      |                     |                                  |
|                      v                     v                                  |
|            +--------------------+  +--------------+                           |
|            |   POSTGRESQL 15    |  |  Gitea SQLite|                           |
|            |    (Port 5432)     |  |  Data Volume |                           |
|            +--------------------+  +--------------+                           |
+-------------------------------------------------------------------------------+
```

### Persistent Volumes:
- `pms_postgres_data`: Persistent relational database storage for users, projects, tasks, comments, and audit logs.
- `gitea_data`: Persistent Gitea git repositories, SSH keys, and internal database.
- `./attachments`: Host bind mount to `/app/attachments` inside the backend container for all user-uploaded PDFs, CAD schematics, and design archives.

---

## 4. Master Credentials Inventory

All services have been initialized with the following production credentials:

### 1. PMS Application Admin
- **Username**: `admin`
- **Email**: `admin@engineering.local`
- **Password**: `AdminEng2026#Secure`
- **Role**: `ADMIN`

### 2. Test Engineer Account
- **Username**: `engineer_1792431787`
- **Email**: `engineer_1792431787@smartmeter.local`
- **Password**: `Engineer2026#Secure`
- **Role**: `ENGINEER`

### 3. Gitea Root Administrator
- **Username**: `giteaadmin`
- **Password**: `GiteaAdmin2026#Secure`
- **Internal Webhook Secret**: `PmsWebhookSecret2026#Live`

### 4. PostgreSQL Database
- **Host**: `postgres` (internal) / `localhost:5432`
- **Database Name**: `pms_db`
- **Database User**: `pms_user`
- **Database Password**: `PmsSecureDb2026#`
- **Connection String**: `postgresql+asyncpg://pms_user:PmsSecureDb2026#@postgres:5432/pms_db`

---

## 5. Architectural Deep-Dive

### 5.1 Backend Architecture (FastAPI & SQLAlchemy Async)

Located in `backend/app/`:

1. **`main.py`**:
   - Application lifecycle (`@asynccontextmanager`) initializing tables on boot (`init_db()`).
   - CORS middleware configured for full client compatibility.
   - Global rate limiter via `slowapi`.
   - Router registration for all modules.

2. **`api/deps.py`**:
   - `get_db`: Yields asynchronous database session (`AsyncSession`).
   - `get_current_user`: Decodes JWT Bearer token, validates expiry, loads User model.
   - `require_admin`: Strictly verifies `current_user.role == UserRole.ADMIN` (used on project creation and user provisioning).
   - `get_project_member`: Validates that the active user belongs to the project referenced by `project_id`.

3. **`api/projects.py`**:
   - `POST /api/projects`: Enforces `require_admin` dependency. Rejects engineers with `403 Forbidden`.
   - Automatically injects creator as `ProjectRole.MANAGER`.
   - `GET /api/projects`: For `ADMIN`, returns all projects. For `ENGINEER`, joins `ProjectMember` and filters exclusively to projects where `ProjectMember.user_id == current_user.id`.

4. **`api/tasks.py`**:
   - **@Team Mentions**: Uses regex `r"@([a-zA-Z0-9_-]+)"` on task description and comments. Queries matching users and dispatches `NotificationType.COMMENT_MENTION`.
   - **Git Ref Linker**: `POST /api/tasks/{task_id}/git-ref` accepts `{commit_sha, branch, message}`. Appends entry to `task.git_refs` JSON array and creates an automated audit comment:
     `"Linked commit <sha> on branch <branch>: <msg>"`.
   - **Morning Kickoff Reminder**: `POST /api/tasks/trigger-morning-reminder` scans active engineers with pending tasks, constructs personalized emails, and dispatches in-app notifications.
   - **Evening Wrap-Up & Escalation**: `POST /api/tasks/trigger-evening-reminder` scans incomplete tasks, identifies project managers for CC escalation, and dispatches daily wrap-up emails.

5. **`api/reports.py`**:
   - `GET /api/reports/team-workload`: Accessible by `get_current_active_user` (so all engineers can view team capacity). Returns flattened user attributes (`user_id`, `full_name`, `username`, `email`) and task distribution metrics.

6. **`services/email_service.py`**:
   - Provides HTML & Plaintext responsive email templates for Morning Kickoff and Evening Wrap-Up with CC routing. Includes mock SMTP fallback for dev/testing.

---

### 5.2 Frontend Architecture (React 18 + Vite + TailwindCSS)

Located in `frontend/src/`:

1. **`pages/DashboardPage.tsx`**:
   - Inspects `user.role`:
     - If `ENGINEER`: Renders **Engineer Focus View**: Day Plan checklist, Priority Project spotlight card, Work hours today vs 8h target, Pending tasks analysis, Next assigned tasks queue.
     - If `ADMIN` or `PROJECT_MANAGER`: Renders **Admin Operations Hub**: Company KPIs, team capacity heatmaps, recent activity feeds, and 1-Click Broadcast buttons for morning kickoff, evening wrap-up, and stale task escalation.

2. **`pages/ProjectsPage.tsx`**:
   - Conditional UI rendering: Only shows `+ New Project` button if `user.role === 'ADMIN'`.
   - View switcher: Toggle between **3D Grid Cards** and **Data Table** view.
   - Seamlessly renders `ProjectCard3D.tsx`.

3. **`components/projects/ProjectCard3D.tsx`**:
   - Rendered with hardware circuit SVG vector overlays.
   - Status-aware gradient backgrounds with dynamic priority pills (CRITICAL, HIGH, MEDIUM, LOW).
   - Dynamic progress bar, dates, and active team avatar stack.
   - 3D hover elevation (`hover:-translate-y-1 hover:shadow-xl transition-all duration-300`).

4. **`components/ui/MentionTextarea.tsx`**:
   - Autocomplete textarea listening for `@` trigger.
   - Displays dropdown of project members with avatars and usernames.
   - Automatically completes `@<username>` on click or `Enter`.

5. **`pages/GiteaActivityPage.tsx`**:
   - 3-Tab workflow:
     1. **Inbuilt Gitea Web Hub**: Embedded iframe displaying the live repository browser directly inside PMS.
     2. **Terminal Push Command Generator**: Generates formatted push commands copying branch, commit message, and task number (`#<id>`) in one click.
     3. **Commit Feeds & Direct Linker**: Form to attach commit SHA, branch, and notes directly to a task without leaving the PMS.

6. **`pages/SettingsPage.tsx`**:
   - **Appearance & Themes**:
     - Mode toggle: Obsidian Navy Dark vs Warm Ivory Light.
     - Accent palettes: Amber Copper, Emerald PCB, Firmware Blue, Digital Violet, Telemetry Rose.
     - Project card style: 3D Elevation vs Flat Modern.
   - **Profile & Security**: Change display name, email, avatar preset, and password.

---

## 6. How to Run the Automated Test Suites

The `scripts/` directory contains complete end-to-end integration test suites:

### 1. Dual-View, RBAC, Git Linking & Reminders Suite
```bash
python scripts/test_dual_view.py
```
**Validates**:
- Admin login with `AdminEng2026#Secure`.
- Engineer login with `Engineer2026#Secure`.
- Non-admin project creation fails with `403 Forbidden`.
- Team workload report accessible to engineers (`200 OK`).
- Project scoping: Engineer only sees assigned projects.
- Git Ref linking attaches commit SHA and adds task comment (`200 OK`).
- Morning kickoff broadcast dispatches emails & notifications (`200 OK`).
- Evening wrap-up broadcast escalates tasks with manager CC (`200 OK`).

### 2. File Vault & System API Suite
```bash
python scripts/verify_live_e2e.py
```
**Validates**:
- 25 MB multipart schematic upload to attachment vault.
- Binary stream verification and file integrity download check.
- Gitea repository creation and clone/push/pull cycle.

---

## 7. How to Deploy Updates to the Production Server

### Updating Backend Code:
```bash
# 1. On your local machine, copy the updated files to the EC2 server:
scp -i Subasri.pem -r backend/ ubuntu@16.16.124.247:/home/ubuntu/engineering-pms/backend/

# 2. SSH into EC2:
ssh -i Subasri.pem ubuntu@16.16.124.247

# 3. Rebuild and restart the backend container:
cd /home/ubuntu/engineering-pms
sudo docker compose build backend
sudo docker compose up -d backend
```

### Updating Frontend Code:
```bash
# 1. On your local machine, build the production bundle:
cd frontend
npm run build

# 2. Package and copy dist to EC2:
tar -czf frontend_dist.tar.gz -C dist .
scp -i Subasri.pem frontend_dist.tar.gz ubuntu@16.16.124.247:/home/ubuntu/engineering-pms/

# 3. SSH into EC2 and update the frontend container:
ssh -i Subasri.pem ubuntu@16.16.124.247
cd /home/ubuntu/engineering-pms
rm -rf frontend/dist/*
tar -xzf frontend_dist.tar.gz -C frontend/dist/
sudo docker compose build frontend
sudo docker compose up -d frontend
```

---

## 8. Common Troubleshooting & FAQs

### Q: Why does an engineer get 403 when trying to create a project?
> **Answer**: By design. Only users with `ADMIN` role can create projects. Non-admin engineers are granted task management permissions on projects they are assigned to.

### Q: Why can't the engineer see a newly created project?
> **Answer**: The admin must add the engineer to the project's team. In the PMS UI, the admin opens the project, goes to the **Team** tab, and assigns the engineer. Once assigned, the project appears immediately on the engineer's Projects page.

### Q: How do I change the default admin password?
> **Answer**: Log in as `admin`, navigate to **Settings** -> **Security**, enter old password (`AdminEng2026#Secure`), and save the new password. Alternatively, update `FIRST_ADMIN_PASSWORD` in `.env` before initial DB initialization.

### Q: How do I backup the database and file vault?
> **Answer**: Run the automated backup script on EC2:
> ```bash
> cd /home/ubuntu/engineering-pms
> bash deploy/backup.sh
> ```
> Backups are saved with timestamps into `/home/ubuntu/engineering-pms/backups/`.

---

## 9. Recommended Roadmap for Incoming Developer

Here are the highest-impact enhancements recommended for future development sprints:

1. **Production SMTP Relay**:
   - Replace the local mock SMTP service in `backend/app/services/email_service.py` with Amazon SES or SendGrid credentials in `.env` for production email delivery to real employee inboxes.
2. **Interactive Gantt Chart & Milestone Timeline**:
   - Implement an interactive SVG/Canvas Gantt chart on `ProjectDetailPage.tsx` using the existing `TaskDependency` and `milestones` API endpoints.
3. **Real-Time WebSockets**:
   - Add WebSocket broadcasting for instant in-app alerts when tasks are moved on the Kanban board or when an engineer is mentioned with `@`.
4. **Hardware BOM (Bill of Materials) Tracker**:
   - Add a tab to Project Detail allowing engineers to attach component part numbers (MPNs), distributor URLs (DigiKey/Mouser), and inventory quantities.
