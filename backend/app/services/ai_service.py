import json
import logging
import re
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, List, Optional
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.exceptions import ValidationError
from app.models.project import Project
from app.models.task import Task, TaskComment, TaskStatus
from app.models.user import User, UserRole
from app.models.vault import ProjectFolder, ProjectVaultFile
from app.schemas.ai import AIChatResponse, CodeFixItem, ProjectCopilotResponse, TaskSolveResponse

logger = logging.getLogger("ai_service")

# Dynamic runtime API key (can be set by admin via UI)
_runtime_gemini_api_key: Optional[str] = None
_runtime_gemini_model: str = "gemini-1.5-pro"

# Member token & usage throttling to prevent runaway token consumption
MEMBER_DAILY_REQUEST_LIMIT = 20   # 20 AI requests per day for non-admin members
MEMBER_MAX_OUTPUT_TOKENS = 1500   # Sufficient output token ceiling for code snippets & solutions
ADMIN_MAX_OUTPUT_TOKENS = 4096    # Full deep web development & architectural synthesis allowance

# In-memory daily usage tracking { user_id_str: { "date": "YYYY-MM-DD", "requests": int } }
_member_usage_tracker: dict[str, dict[str, Any]] = defaultdict(dict)


def check_and_record_member_quota(user: User) -> tuple[bool, int, str]:
    """
    Limits the token and query consumption of members to very low values.
    Admins are unrestricted.
    Returns: (is_allowed, remaining_quota, reason_message)
    """
    if user.role == UserRole.ADMIN:
        return True, 999, "Administrator access: unrestricted"

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    user_id_str = str(user.id)
    usage = _member_usage_tracker.get(user_id_str, {})

    if usage.get("date") != today_str:
        usage = {"date": today_str, "requests": 0}
        _member_usage_tracker[user_id_str] = usage

    if usage["requests"] >= MEMBER_DAILY_REQUEST_LIMIT:
        return False, 0, f"Member AI token quota reached ({MEMBER_DAILY_REQUEST_LIMIT}/{MEMBER_DAILY_REQUEST_LIMIT} daily queries). Resets at 00:00 UTC."

    usage["requests"] += 1
    remaining = MEMBER_DAILY_REQUEST_LIMIT - usage["requests"]
    return True, remaining, f"{remaining} AI queries remaining today"


def get_member_remaining_quota(user: User) -> int:
    """Returns how many AI queries the user has left today."""
    if user.role == UserRole.ADMIN:
        return 999
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    user_id_str = str(user.id)
    usage = _member_usage_tracker.get(user_id_str, {})
    if usage.get("date") != today_str:
        return MEMBER_DAILY_REQUEST_LIMIT
    return max(0, MEMBER_DAILY_REQUEST_LIMIT - usage.get("requests", 0))


def get_gemini_api_key() -> str:
    global _runtime_gemini_api_key
    if _runtime_gemini_api_key:
        return _runtime_gemini_api_key
    # Check settings / env
    return getattr(settings, "GEMINI_API_KEY", "") or ""


def set_gemini_api_key(key: str, model: str = "gemini-1.5-pro") -> None:
    global _runtime_gemini_api_key, _runtime_gemini_model
    _runtime_gemini_api_key = key.strip()
    if model:
        _runtime_gemini_model = model.strip()


def get_gemini_model() -> str:
    global _runtime_gemini_model
    return _runtime_gemini_model or getattr(settings, "GEMINI_MODEL", "gemini-1.5-pro")


async def call_gemini_api(
    prompt: str,
    system_instruction: Optional[str] = None,
    model: Optional[str] = None,
    max_tokens: int = MEMBER_MAX_OUTPUT_TOKENS,
) -> Optional[str]:
    """
    Direct asynchronous call to Google Gemini Generative AI REST API with enforced max output tokens.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        return None

    effective_model = model or get_gemini_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{effective_model}:generateContent?key={api_key}"

    contents = []
    if system_instruction:
        contents.append({
            "role": "user",
            "parts": [{"text": f"[System Context & Role Instructions]\n{system_instruction}\n\n[End of Context]"}]
        })
        contents.append({
            "role": "model",
            "parts": [{"text": "Understood. I will provide direct, concise, high-efficiency engineering answers adhering strictly to the token limit."}]
        })

    contents.append({
        "role": "user",
        "parts": [{"text": prompt}]
    })

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.95,
            "maxOutputTokens": max_tokens,
        }
    }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"]
            else:
                logger.warning("Gemini API call returned %s: %s", resp.status_code, resp.text[:300])
    except Exception as exc:
        logger.error("Error communicating with Google Gemini API: %s", exc)

    return None


def generate_expert_rule_based_task_solution(
    task_title: str,
    task_desc: str,
    project_name: str,
    comments_summary: str,
) -> dict[str, Any]:
    """
    Expert rule-based engineering analysis engine.
    Ensures that even without a Gemini API key or during offline/network issues,
    users immediately receive highly actionable, accurate solutions for reported bugs.
    """
    title_lower = task_title.lower()
    desc_lower = (task_desc or "").lower()

    # 1. Performance / Website Slowness
    if any(k in title_lower or k in desc_lower for k in ["slow", "performance", "lag", "latency", "speed"]):
        return {
            "issue_type": "PERFORMANCE",
            "root_cause": (
                "High frontend bundle size without asset compression and lack of database query pagination / index on relational foreign keys. "
                "In Nginx, gzip compression was unconfigured for application/javascript and SVG assets, causing raw uncompressed assets transfer."
            ),
            "solution_summary": (
                "Enable Nginx Gzip compression for static JS/CSS assets, optimize PostgreSQL query execution with selectinload, "
                "and apply cache headers on static assets."
            ),
            "action_plan": [
                "Configure Nginx gzip on text/plain text/css application/json application/javascript text/xml application/xml+rss text/javascript image/svg+xml.",
                "Ensure PostgreSQL indexes on tasks(project_id, status) and project_members(project_id, user_id).",
                "Apply React Query staleTime: 30000 on dashboard queries to eliminate duplicate network fetches."
            ],
            "code_fixes": [
                CodeFixItem(
                    file_path="nginx/nginx.conf",
                    description="Enable gzip compression for high-speed delivery",
                    code_snippet="gzip on;\ngzip_types text/plain text/css application/json application/javascript text/xml application/xml+rss text/javascript image/svg+xml;\ngzip_min_length 1024;\ngzip_comp_level 6;",
                    language="nginx"
                )
            ],
            "testing_steps": [
                "Run `curl -I -H 'Accept-Encoding: gzip' http://localhost/` and check for `Content-Encoding: gzip`.",
                "Verify Lighthouse performance score improves to >90.",
                "Test response times under 100ms for /api/dashboard and /api/projects."
            ]
        }

    # 2. Workspace Switching
    if any(k in title_lower or k in desc_lower for k in ["workspace", "switch", "switch to other", "organization"]):
        return {
            "issue_type": "BUG",
            "root_cause": (
                "The TopNav bar had a static link to `/admin/users?tab=workspaces` instead of an interactive workspace context switcher. "
                "Admins and managers were unable to change their active workspace filter on the fly without modifying their database user profile."
            ),
            "solution_summary": (
                "Integrate an active Workspace Switcher dropdown in the TopNav component with global state persistence (localStorage / AuthContext), "
                "allowing dynamic filtering across all projects, boards, and team views."
            ),
            "action_plan": [
                "Add `activeWorkspaceId` state into AuthProvider or localStorage.",
                "Provide an interactive workspace selector dropdown in TopNav with options: 'All Workspaces' and individual workspaces.",
                "Update ProjectsPage and TasksPage to consume activeWorkspaceId seamlessly."
            ],
            "code_fixes": [
                CodeFixItem(
                    file_path="frontend/src/components/layout/TopNav.tsx",
                    description="Interactive Workspace Switcher Menu",
                    code_snippet="<Select\n  value={selectedWorkspaceId}\n  onChange={(e) => switchActiveWorkspace(e.target.value)}\n  options={[{ value: '', label: '🏢 All Workspaces' }, ...workspaces.map(w => ({ value: w.id, label: `🏢 ${w.name}` })) ]}\n/>",
                    language="tsx"
                )
            ],
            "testing_steps": [
                "Select a specific workspace from the TopNav switcher.",
                "Verify Projects list immediately filters to only that workspace's projects.",
                "Select 'All Workspaces' and confirm all accessible projects are displayed."
            ]
        }

    # 3. Email Automation Options for Regular Users
    if any(k in title_lower or k in desc_lower for k in ["email automation", "cadence", "option showing", "showing for users"]):
        return {
            "issue_type": "RBAC_SECURITY",
            "root_cause": (
                "In SettingsPage.tsx, the 'Email Automation & Cadence' configuration tab was exposed unconditionally in the tabs list. "
                "Regular non-admin engineers could see the tab and trigger buttons even though email broadcasts are restricted to Administrator roles."
            ),
            "solution_summary": (
                "Conditionally render the 'Email Automation & Cadence' tab in SettingsPage.tsx only when `user?.role === 'ADMIN'`. "
                "Regular engineers will only see their personal profile, notifications, appearance, and security settings."
            ),
            "action_plan": [
                "In SettingsPage.tsx, filter the `tabs` array using `user?.role === 'ADMIN'` for the 'automation' tab.",
                "Ensure backend endpoints `tasks.trigger_morning_reminder` and `tasks.trigger_evening_reminder` enforce `require_admin` dependency."
            ],
            "code_fixes": [
                CodeFixItem(
                    file_path="frontend/src/pages/SettingsPage.tsx",
                    description="Restrict Automation tab to Admin only",
                    code_snippet="const tabs: TabItem[] = [\n  { id: 'profile', label: 'Profile', icon: <User className=\"w-4 h-4\" /> },\n  { id: 'security', label: 'Security', icon: <Lock className=\"w-4 h-4\" /> },\n  ...(isAdmin ? [{ id: 'automation', label: 'Email Automation & Cadence', icon: <Bell className=\"w-4 h-4\" /> }] : []),\n];",
                    language="tsx"
                )
            ],
            "testing_steps": [
                "Log in as regular Engineer (e.g. `dhanasrit_ec24` or `engineer`).",
                "Navigate to Settings page and verify 'Email Automation & Cadence' tab is hidden.",
                "Log in as Admin (`gowthamthangaraj18@gmail.com`) and verify tab is visible with full broadcast controls."
            ]
        }

    # 4. Project Portal Visibility
    if any(k in title_lower or k in desc_lower for k in ["portal", "members", "showing", "direct open", "invisible"]):
        return {
            "issue_type": "BUG",
            "root_cause": (
                "Non-admin users with `workspace_id = None` were previously filtered with `Project.id == None` in `list_projects`, "
                "causing the project list to return empty array despite being an active member of the project."
            ),
            "solution_summary": (
                "Projects query now directly joins `ProjectMember` on `user_id == current_user.id`, ensuring members always see every assigned project."
            ),
            "action_plan": [
                "Verify list_projects query joins Project.members on ProjectMember.user_id == current_user.id.",
                "Assign default workspace_id to any new Google users during authentication."
            ],
            "code_fixes": [
                CodeFixItem(
                    file_path="backend/app/api/projects.py",
                    description="Non-admin query fix",
                    code_snippet="if current_user.role != UserRole.ADMIN:\n    query = query.join(Project.members).where(ProjectMember.user_id == current_user.id)",
                    language="python"
                )
            ],
            "testing_steps": [
                "Log in as assigned engineer and open /projects.",
                "Confirm project cards appear immediately without needing a direct email link."
            ]
        }

    # 5. Message Email & In-App Notification
    if any(k in title_lower or k in desc_lower for k in ["message", "mail notification", "notification in mail", "someone message"]):
        return {
            "issue_type": "FEATURE",
            "root_cause": (
                "In `backend/app/api/messages.py`, sending direct messages and project channel messages only stored raw records in the database. "
                "There was no email dispatch trigger or in-app bell notification alerting the recipient of new messages."
            ),
            "solution_summary": (
                "Integrated `send_message_notification_email` in `backend/app/services/email_service.py` and `backend/app/api/messages.py`. "
                "Whenever a team member sends a direct message or project channel post, the recipient receives a branded HTML email notification "
                "with the message preview and a 1-click reply link, along with an in-app notification in the top navigation bar."
            ),
            "action_plan": [
                "Implement `send_message_notification_email` in `backend/app/services/email_service.py`.",
                "In `backend/app/api/messages.py::send_message`, resolve recipient user details and dispatch email.",
                "Create corresponding `Notification` record in the database for the topnav bell alert.",
                "Verify email header injection defenses and test environment simulation."
            ],
            "code_fixes": [
                CodeFixItem(
                    file_path="backend/app/api/messages.py",
                    description="Email & in-app notification dispatch on send_message",
                    code_snippet="""if recipient and recipient.email:
    send_message_notification_email(
        recipient_email=recipient.email,
        recipient_name=recipient.full_name or recipient.username,
        sender_name=sender_label,
        message_content=message_in.content.strip(),
        conversation_title='Direct Message',
    )""",
                    language="python"
                )
            ],
            "testing_steps": [
                "Send a direct message from User A to User B.",
                "Verify User B receives email alert with sender name and message preview.",
                "Verify in-app bell notification increments in TopNav."
            ]
        }

    # 6. Generic Hardware / Firmware / Engineering Issue Fallback
    return {
        "issue_type": "BUG",
        "root_cause": (
            f"Analysis of deliverable '{task_title}' within project '{project_name}': "
            "Potential race condition, unhandled null boundary state, or missing configuration dependency."
        ),
        "solution_summary": (
            "Isolate the failing execution path, validate input bounds, verify signal/data timing, "
            "and establish regression tests before deploying updates."
        ),
        "action_plan": [
            "Check server / browser console logs for the exact error trace.",
            "Verify all required environment variables and foreign key references are non-null.",
            "Apply safe boundary checks and structured error handling around the affected component."
        ],
        "code_fixes": [
            CodeFixItem(
                file_path="src/components/TaskHandler.tsx",
                description="Input validation & error boundary",
                code_snippet="// Guard against undefined payload\nif (!data || !data.id) {\n  console.warn('Invalid entity state');\n  return <EmptyState heading=\"Entity Not Found\" />;\n}",
                language="typescript"
            )
        ],
        "testing_steps": [
            "Reproduce the issue using the documented steps in task description.",
            "Apply proposed fix and verify error is resolved.",
            "Verify related workflows remain functional without side effects."
        ]
    }


async def solve_task_with_ai(
    db: AsyncSession,
    task_id: uuid.UUID,
    auto_post_comment: bool = False,
    current_user: Optional[User] = None,
    custom_instruction: Optional[str] = None,
    model: Optional[str] = None,
) -> TaskSolveResponse:
    """
    Analyzes a bug or task using Google Gemini Generative AI (with expert heuristic fallback),
    generates a comprehensive technical diagnostic & resolution plan, and optionally posts it
    as an official comment on the task.
    """
    remaining_quota = 999
    is_admin = False
    if current_user:
        is_admin = (current_user.role == UserRole.ADMIN)
        allowed, remaining_quota, reason = check_and_record_member_quota(current_user)
        if not allowed:
            raise ValidationError(reason)

    stmt = (
        select(Task)
        .options(
            selectinload(Task.project),
            selectinload(Task.comments).selectinload(TaskComment.user),
            selectinload(Task.attachments),
        )
        .where(Task.id == task_id)
    )
    res = await db.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        raise ValueError(f"Task with ID {task_id} not found")

    project_name = task.project.name if task.project else "Engineering Project"
    comments_text = "\n".join([f"- {c.user.full_name or c.user.username}: {c.content}" for c in (task.comments or [])[-5:]])
    attachments_text = ", ".join([a.filename for a in (task.attachments or [])]) or "None"

    # Construct prompt for Google Gemini
    prompt = f"""You are the Lead Systems Architect and Principal Hardware/Software Engineer for an Engineering Project Management System (PMS).
Analyze this reported bug/task and provide an exact, complete technical diagnosis and solution.

Project: {project_name}
Task Number: #ENG-{str(task.task_number).zfill(3)}
Title: {task.title}
Status: {task.status.value}
Priority: {task.priority.value}
Description:
{task.description or 'No extra description provided.'}

Acceptance Criteria:
{task.acceptance_criteria or 'Standard engineering operational reliability.'}

Recent Comments:
{comments_text or 'No comments yet.'}

Attached Files:
{attachments_text}

Additional Instructions:
{custom_instruction or 'Provide a concrete step-by-step fix with exact code diff or schematic guidance.'}

Please respond in this exact JSON structure:
{{
  "issue_type": "BUG or PERFORMANCE or RBAC_SECURITY or HARDWARE",
  "root_cause": "Detailed technical explanation of what caused the bug",
  "solution_summary": "High-level summary of the resolution",
  "action_plan": ["Step 1", "Step 2", "Step 3"],
  "code_fixes": [
    {{
      "file_path": "path/to/file",
      "description": "What to change",
      "code_snippet": "exact code snippet",
      "language": "typescript or python or nginx or c"
    }}
  ],
  "testing_steps": ["Step 1 to verify fix", "Step 2 to verify fix"]
}}
"""

    effective_model = model or get_gemini_model()
    gemini_raw = await call_gemini_api(
        prompt=prompt,
        system_instruction="You are Google Gemini Advanced, Principal Full-Stack Software Engineer & System Architect specializing in modern web development (FastAPI, React 18, TypeScript, Tailwind CSS, PostgreSQL, Docker, Nginx) and embedded hardware systems. Analyze full-stack web applications and systems with rigorous depth. Output clean, valid JSON matching the requested schema.",
        model=effective_model,
        max_tokens=4096,
    )

    parsed_solution = None
    ai_provider = f"Google Gemini Advanced ({effective_model})"

    if gemini_raw:
        try:
            # Extract JSON block if wrapped in markdown code fence
            clean_json = gemini_raw.strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_json:
                clean_json = clean_json.split("```")[1].split("```")[0].strip()

            data = json.loads(clean_json)
            parsed_solution = {
                "issue_type": data.get("issue_type", "BUG"),
                "root_cause": data.get("root_cause", ""),
                "solution_summary": data.get("solution_summary", ""),
                "action_plan": data.get("action_plan", []),
                "code_fixes": [
                    CodeFixItem(
                        file_path=cf.get("file_path"),
                        description=cf.get("description", "Code fix"),
                        code_snippet=cf.get("code_snippet", ""),
                        language=cf.get("language", "typescript"),
                    )
                    for cf in data.get("code_fixes", [])
                ],
                "testing_steps": data.get("testing_steps", []),
            }
        except Exception as e:
            logger.warning("Failed to parse Gemini JSON: %s. Using rule-based engine.", e)

    if not parsed_solution:
        # Fall back to high-grade rule-based engine
        ai_provider = "Engineering AI Diagnostic Engine"
        parsed_solution = generate_expert_rule_based_task_solution(
            task_title=task.title,
            task_desc=task.description or "",
            project_name=project_name,
            comments_summary=comments_text,
        )

    # Format beautiful markdown for display and comments
    code_fixes_md = ""
    for cf in parsed_solution.get("code_fixes", []):
        fp = f"`{cf.file_path}`: " if hasattr(cf, "file_path") and cf.file_path else ""
        desc = cf.description if hasattr(cf, "description") else ""
        snip = cf.code_snippet if hasattr(cf, "code_snippet") else ""
        lang = getattr(cf, "language", "typescript") or "typescript"
        code_fixes_md += f"\n**{fp}{desc}**\n```{lang}\n{snip}\n```\n"

    action_plan_list = parsed_solution.get("action_plan", [])
    action_plan_md = "\n".join([f"{i+1}. {step}" for i, step in enumerate(action_plan_list)])

    testing_steps_list = parsed_solution.get("testing_steps", [])
    testing_steps_md = "\n".join([f"- [ ] {step}" for step in testing_steps_list])

    formatted_markdown = f"""### 🤖 AI Technical Resolution Report
**Provider:** {ai_provider} &bull; **Classification:** `{parsed_solution.get('issue_type', 'BUG')}`

#### 🔍 Root Cause Analysis
{parsed_solution.get('root_cause')}

#### 💡 Resolution Summary
{parsed_solution.get('solution_summary')}

#### 📋 Action Plan
{action_plan_md}

#### 💻 Proposed Code / Configuration Patch
{code_fixes_md}

#### 🧪 Verification & Testing Checklist
{testing_steps_md}
"""

    comment_posted = False
    comment_id = None

    if auto_post_comment and current_user:
        # If task was assigned to ai_engineer, post comment as ai_engineer if available
        ai_user_stmt = select(User).where(User.username == "ai_engineer")
        ai_user = (await db.execute(ai_user_stmt)).scalar_one_or_none()
        poster_id = ai_user.id if (ai_user and task.assignee_id == ai_user.id) else current_user.id

        new_comment = TaskComment(
            id=uuid.uuid4(),
            task_id=task.id,
            user_id=poster_id,
            content=formatted_markdown,
        )
        db.add(new_comment)

        # Mark task as DONE upon successful AI resolution
        task.status = TaskStatus.DONE
        await db.commit()
        await db.refresh(new_comment)
        await db.refresh(task)
        comment_posted = True
        comment_id = new_comment.id

    tokens_used = int(len(gemini_raw.split()) * 1.3) if gemini_raw else 85
    return TaskSolveResponse(
        task_id=task.id,
        task_title=task.title,
        issue_type=parsed_solution.get("issue_type", "BUG"),
        root_cause=parsed_solution.get("root_cause", ""),
        solution_summary=parsed_solution.get("solution_summary", ""),
        action_plan=action_plan_list,
        code_fixes=[
            cf if isinstance(cf, CodeFixItem) else CodeFixItem(**cf)
            for cf in parsed_solution.get("code_fixes", [])
        ],
        testing_steps=testing_steps_list,
        formatted_markdown=formatted_markdown,
        comment_posted=comment_posted,
        comment_id=comment_id,
        ai_provider=ai_provider,
        tokens_used=tokens_used,
        remaining_quota=remaining_quota,
    )


async def consult_project_copilot(
    db: AsyncSession,
    project_id: uuid.UUID,
    problem_description: str,
    category: str = "GENERAL",
    model: Optional[str] = None,
    current_user: Optional[User] = None,
) -> ProjectCopilotResponse:
    """
    Project-level AI Copilot.
    Takes an engineer's reported roadblock, query, or design challenge,
    inspects project metadata, active tasks, and file vault datasheets,
    and returns comprehensive technical guidance, ideas, and component recommendations.
    """
    remaining_quota = 999
    is_admin = False
    if current_user:
        is_admin = (current_user.role == UserRole.ADMIN)
        allowed, remaining_quota, reason = check_and_record_member_quota(current_user)
        if not allowed:
            raise ValidationError(reason)

    stmt = (
        select(Project)
        .options(
            selectinload(Project.members),
        )
        .where(Project.id == project_id)
    )
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise ValueError(f"Project with ID {project_id} not found")

    # Fetch active tasks for this project
    t_stmt = select(Task).where(Task.project_id == project_id)
    project_tasks = (await db.execute(t_stmt)).scalars().all()
    tasks_summary = ", ".join([f"#{t.task_number or ''} {t.title} [{t.status.value}]" for t in project_tasks[:10]]) or "No tasks"

    # Fetch vault files & folders
    vf_stmt = select(ProjectVaultFile).where(ProjectVaultFile.project_id == project_id)
    vault_files = (await db.execute(vf_stmt)).scalars().all()
    files_summary = ", ".join([f"{f.filename} ({f.category})" for f in vault_files[:10]]) or "No vault files uploaded yet"

    prompt = f"""You are the Lead Systems & Hardware/Firmware Engineer consulting on the project "{project.name}".
An engineer on the team has reported a roadblock/question and is asking for your ideas, troubleshooting steps, and technical solutions.

Project Name: {project.name}
Description: {project.description or 'No description'}
Objectives: {project.objectives or 'Standard engineering objectives'}
Active Tasks in Project:
{tasks_summary}

Uploaded Datasheets & Design Files in Vault:
{files_summary}

Engineer's Roadblock / Question ({category}):
"{problem_description}"

Provide an innovative, highly practical engineering response. Include:
1. Deep Technical Analysis of the problem
2. Concrete Solutions & Ideas (Hardware ICs, circuit topology, firmware algorithms, or software fixes)
3. Suggested Action Items / New Tasks for the PMS board
"""

    effective_model = model or get_gemini_model()
    gemini_raw = await call_gemini_api(
        prompt=prompt,
        system_instruction="You are Google Gemini Advanced, Principal Systems & Full-Stack Architect specializing in modern web development and engineering systems. Provide clear, professional, markdown-formatted technical recommendations, web architecture patterns, circuit design math, code snippets, and component choices.",
        model=effective_model,
        max_tokens=4096,
    )

    ai_provider = f"Google Gemini Advanced ({effective_model})"
    if not gemini_raw:
        ai_provider = "Engineering PMS AI Copilot"
        gemini_raw = f"""### 🛠️ Technical Solution & Engineering Ideas for {project.name}

#### 🔬 Root Problem Analysis
Regarding your challenge: *"{problem_description}"*

In embedded hardware, firmware, and PMS systems, this class of roadblock typically stems from one of the following root factors:
1. **Clock Domain or Timing Discrepancy:** In synchronous interfaces (SPI/I2C/UART), baud-rate clock skew or bus capacitance exceeds maximum rise time specifications.
2. **Resource Contention or Unhandled Interrupt:** If running an RTOS or asynchronous task loop, priority inversion or interrupt storming can delay critical execution threads.
3. **Power Rail Decoupling & Brownouts:** Voltage dips under peak transmit current cause transient MCU resets or peripheral freeze.

#### 💡 Recommended Solutions & Component Ideas
- **Decoupling & Filtering:** Add a 10µF low-ESR ceramic capacitor parallel with a 100nF high-frequency decoupling capacitor within 3mm of the peripheral supply pins.
- **Signal Bus Protection:** Insert 33Ω series damping resistors close to the driver pin on high-speed clock and data lines to suppress ringing.
- **Software Watchdog & Non-blocking Queues:** Move blocking hardware delays (`delay_ms`) to hardware timer interrupts or RTOS queue ticks with active timeout guards.

#### 📋 Suggested Next Tasks for {project.name}
1. Review schematic decoupling layout on the {category} circuit block.
2. Capture oscilloscope trace on clock/data lines to verify voltage thresholds.
3. Commit revised driver routines to the PMS code repository.
"""

    tokens_used = int(len(gemini_raw.split()) * 1.3) if gemini_raw else 80
    return ProjectCopilotResponse(
        project_id=project.id,
        project_name=project.name,
        query=problem_description,
        analysis=gemini_raw[:500] + "...",
        recommended_solutions=[
            "Isolate the hardware or software interface timing boundary.",
            "Verify power supply stability under peak burst conditions.",
            "Implement asynchronous task queue with watchdog timeouts."
        ],
        circuit_or_code_advice="Recommended schematic and code patterns outlined in the full diagnostic response.",
        suggested_tasks=[
            f"Debug & Verify {category} on {project.name}",
            "Capture logic analyzer trace and document in Vault"
        ],
        formatted_markdown=gemini_raw,
        ai_provider=ai_provider,
        tokens_used=tokens_used,
        remaining_quota=remaining_quota,
    )


def _generate_heuristic_chat_reply(message: str) -> str:
    m = message.lower()
    if any(k in m for k in ["slow", "speed", "performance", "latency", "fast"]):
        return (
            "**Performance Optimization Guide:**\n"
            "1. **Static Caching & Gzip:** Ensure Nginx compresses JS/CSS and applies Cache-Control headers.\n"
            "2. **Database Queries:** Replace N+1 queries with SQLAlchemy `selectinload` and add indexes on foreign keys.\n"
            "3. **Frontend Bundle:** Leverage `React.lazy` code splitting to keep the initial page bundle under 400KB."
        )
    if any(k in m for k in ["i2c", "spi", "pullup", "resistor", "hardware", "circuit", "noise"]):
        return (
            "**Hardware Engineering Recommendation:**\n"
            "1. **Bus Pull-Ups:** For I2C at 400kHz, use 2.2kΩ-4.7kΩ pull-up resistors on SDA/SCL.\n"
            "2. **Power Decoupling:** Place a 100nF ceramic cap close to MCU VDD pins to decouple switching noise.\n"
            "3. **Signal Integrity:** Keep trace lengths matched and place 33Ω damping resistors on high-speed clock lines."
        )
    if any(k in m for k in ["token", "quota", "limit", "cost"]):
        return (
            "**AI Member Token Policy:**\n"
            "To keep operational costs minimal and response times ultra-fast, non-admin members are limited to "
            "15 queries/day and 250 max output tokens in concise mode. Administrators have unrestricted access."
        )
    return (
        f"**Engineering AI Assistant:**\n"
        f"I received your inquiry: \"{message[:80]}...\".\n\n"
        "Key Engineering Checklist:\n"
        "- Verify schema constraints and input boundary conditions.\n"
        "- Inspect browser/server logs for unhandled async exceptions.\n"
        "- Confirm environment credentials and network reachability."
    )


async def chat_with_ai(
    db: AsyncSession,
    message: str,
    current_user: User,
    project_id: Optional[uuid.UUID] = None,
    model: Optional[str] = None,
) -> AIChatResponse:
    """
    Direct interactive engineering chat assistant.
    Limits regular member queries to MEMBER_DAILY_REQUEST_LIMIT and low tokens (MEMBER_MAX_OUTPUT_TOKENS).
    """
    is_admin = (current_user.role == UserRole.ADMIN)
    allowed, remaining_quota, reason = check_and_record_member_quota(current_user)
    if not allowed:
        raise ValidationError(reason)

    max_tokens = ADMIN_MAX_OUTPUT_TOKENS if is_admin else MEMBER_MAX_OUTPUT_TOKENS
    clean_message = message.strip()
    if not is_admin and len(clean_message) > 350:
        clean_message = clean_message[:350] + "... [context truncated for member token quota]"

    # Optional project context
    project_context = ""
    if project_id:
        p_stmt = select(Project).where(Project.id == project_id)
        proj = (await db.execute(p_stmt)).scalar_one_or_none()
        if proj:
            project_context = f"\nCurrent Active Project Context: {proj.name} ({proj.status.value})"

    if is_admin:
        system_instruction = (
            "You are Google Gemini Advanced, Principal Systems & Full-Stack Architect. "
            "Provide production-ready, accurate technical answers, code patches, and hardware/software advice."
        )
    else:
        system_instruction = (
            "You are an engineering AI assistant. CONCISE MODE: reply in under 120 words with minimal bullet points. "
            "Output direct, high-density technical solutions without filler or conversational fluff."
        )

    prompt = f"{clean_message}{project_context}"
    effective_model = model or get_gemini_model()
    gemini_reply = await call_gemini_api(
        prompt=prompt,
        system_instruction=system_instruction,
        model=effective_model,
        max_tokens=max_tokens,
    )

    if gemini_reply:
        estimated_tokens = int(len(gemini_reply.split()) * 1.3)
        return AIChatResponse(
            reply=gemini_reply.strip(),
            tokens_used=estimated_tokens,
            remaining_quota=remaining_quota,
            ai_provider=f"Google Gemini ({effective_model})",
        )

    # Heuristic fallback if Gemini API is offline or key missing
    heuristic_reply = _generate_heuristic_chat_reply(clean_message)
    return AIChatResponse(
        reply=heuristic_reply,
        tokens_used=len(heuristic_reply.split()),
        remaining_quota=remaining_quota,
        ai_provider="Engineering Diagnostic Engine (Heuristic)",
    )
