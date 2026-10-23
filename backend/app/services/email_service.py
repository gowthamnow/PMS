import html
import logging
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional, Tuple, Union

from app.config import settings

logger = logging.getLogger("email_service")


def send_email(
    to_email: Union[str, List[str]],
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
    cc_emails: Optional[List[str]] = None,
) -> bool:
    """
    Sends an email using configured SMTP settings.
    Supports single or multiple recipients in `to_email` (list or comma-separated string)
    along with CC recipients in `cc_emails`.
    Gracefully logs and continues if SMTP is not configured or fails.
    """
    try:
        # Sanitize subject and email addresses against CRLF header injection
        safe_subject = re.sub(r"[\r\n]+", " ", subject).strip()
        if isinstance(to_email, str):
            to_list = [re.sub(r"[\r\n]+", "", e).strip() for e in to_email.split(",") if e.strip()]
        elif isinstance(to_email, (list, tuple)):
            to_list = [re.sub(r"[\r\n]+", "", str(e)).strip() for e in to_email if e and str(e).strip()]
        else:
            to_list = [re.sub(r"[\r\n]+", "", str(to_email)).strip()]

        if not to_list:
            logger.warning("send_email called without any valid recipients in to_email: %s", to_email)
            return False

        # Prevent sending real emails during automated test runs
        import os
        if os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get("TESTING") == "true":
            logger.info("Test environment detected: Skipping SMTP dispatch -> TO: %s, SUBJECT: %s", to_list, safe_subject)
            return True

        if not settings.SMTP_HOST:
            logger.info(
                "SMTP_HOST not configured. Email simulated -> TO: %s, CC: %s, SUBJECT: %s",
                to_list,
                cc_emails or [],
                safe_subject,
            )
            return False

        msg = MIMEMultipart("alternative")
        msg["Subject"] = safe_subject
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"

        # Filter out dummy/mock domains to prevent mail delivery subsystem bounces
        dummy_domains = ("@example.com", "@test.com", "@test.local", "@engineering.local")
        filtered_to_list = [e for e in to_list if not any(e.lower().endswith(dom) for dom in dummy_domains)]
        if not filtered_to_list:
            logger.info("Skipping SMTP dispatch to dummy/test domains: %s", to_list)
            return True

        to_list = filtered_to_list
        msg["To"] = ", ".join(to_list)

        all_recipients = list(to_list)
        if cc_emails:
            valid_ccs = [
                re.sub(r"[\r\n]+", "", str(cc)).strip()
                for cc in cc_emails
                if cc and str(cc).strip() and not any(str(cc).lower().endswith(dom) for dom in dummy_domains)
            ]
            if valid_ccs:
                msg["Cc"] = ", ".join(valid_ccs)
                all_recipients.extend(valid_ccs)

        # Deduplicate recipients while preserving order
        unique_recipients: List[str] = []
        seen = set()
        for r in all_recipients:
            r_lower = r.lower()
            if r_lower not in seen:
                seen.add(r_lower)
                unique_recipients.append(r)

        msg.attach(MIMEText(body_text, "plain"))
        if body_html:
            msg.attach(MIMEText(body_html, "html"))

        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            if settings.SMTP_TLS:
                server.starttls()

        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

        server.sendmail(settings.EMAILS_FROM_EMAIL, unique_recipients, msg.as_string())
        server.quit()
        logger.info("Email delivered successfully to TO: %s (CC: %s)", to_list, cc_emails)
        return True
    except Exception as exc:
        logger.warning("Failed to deliver email to %s (CC: %s): %s", to_email, cc_emails, exc)
        return False


def build_stale_task_email(
    assignee_name: str,
    task_number: int,
    task_title: str,
    project_name: str,
    status: str,
    priority: str,
    due_date: Optional[str],
    task_id: str,
    manager_names: List[str],
    days_since_update: int = 1,
) -> tuple[str, str, str]:
    """
    Generates subject, text body, and HTML body for a stale/pending task reminder.
    """
    subject = f"[Action Required] Pending Task: #ENG-{str(task_number).zfill(3)} {task_title} - {project_name}"

    mgr_str = ", ".join(manager_names) if manager_names else "Project Management"
    due_str = due_date if due_date else "Not set"

    body_text = f"""Hello {assignee_name},

This is an automated notification from the Engineering Project Management System.

TASK PENDING - DAILY UPDATE REQUIRED
======================================================
Task ID:       #ENG-{str(task_number).zfill(3)}
Title:         {task_title}
Project:       {project_name}
Status:        {status}
Priority:      {priority}
Due Date:      {due_str}
Days Inactive: {days_since_update} day(s) without updates
======================================================

ACTION REQUIRED TODAY:
Please log in to the Engineering PMS web application immediately to update your progress:
1. Record today's work notes or technical roadblocks in the task comments.
2. Log time spent in the timesheet.
3. Transition the status (e.g. In Progress, In Review, Blocked, or Done).

Keeping all progress notes updated on the web ensures the engineering team, hardware leads, and project managers can identify roadblocks early.

Link: {settings.FRONTEND_URL}/tasks/{task_id}

Project Manager(s) in CC: {mgr_str}

Regards,
Engineering Project Management System
"""

    safe_assignee = html.escape(str(assignee_name or ""))
    safe_title = html.escape(str(task_title or ""))
    safe_project = html.escape(str(project_name or ""))
    safe_status = html.escape(str(status or ""))
    safe_priority = html.escape(str(priority or ""))
    safe_due = html.escape(str(due_str or ""))
    safe_mgr = html.escape(str(mgr_str or ""))

    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1E293B; background-color: #FAFAF8; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="background-color: #D97706; padding: 16px 24px; color: #FFFFFF;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Daily Task Update Reminder</h2>
      <span style="font-size: 12px; opacity: 0.9;">Engineering Project Management System</span>
    </div>
    
    <div style="padding: 24px;">
      <p style="margin-top: 0;">Hello <strong>{safe_assignee}</strong>,</p>
      
      <p style="color: #475569; font-size: 14px;">
        Your assigned task has been identified as <strong>pending</strong> without a recent progress update ({days_since_update} day(s) inactive).
      </p>

      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #D97706; border-radius: 4px; padding: 16px; margin: 20px 0; font-size: 13px;">
        <div style="margin-bottom: 6px;"><strong>Task:</strong> #ENG-{str(task_number).zfill(3)} - {safe_title}</div>
        <div style="margin-bottom: 6px;"><strong>Project:</strong> {safe_project}</div>
        <div style="margin-bottom: 6px;"><strong>Status:</strong> <span style="background: #FEF3C7; color: #92400E; padding: 2px 6px; border-radius: 4px; font-family: monospace;">{safe_status}</span></div>
        <div style="margin-bottom: 6px;"><strong>Priority:</strong> {safe_priority}</div>
        <div><strong>Due Date:</strong> {safe_due}</div>
      </div>

      <h4 style="color: #0F172A; margin-bottom: 8px; font-size: 14px;">Action Required Today:</h4>
      <ul style="color: #475569; font-size: 13px; padding-left: 20px; margin-top: 0;">
        <li>Document technical progress, schematic checks, or firmware test notes in comments.</li>
        <li>Log completed engineering hours in the timesheet.</li>
        <li>Update task status to reflect current state.</li>
      </ul>

      <div style="margin-top: 24px; text-align: center;">
        <a href="{settings.FRONTEND_URL}/tasks/{task_id}" style="display: inline-block; background: #D97706; color: #FFFFFF; font-size: 13px; font-weight: 600; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
          Open Task in Web App
        </a>
      </div>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #64748B;">
        <strong>Manager(s) in CC:</strong> {safe_mgr}
      </div>
    </div>
  </div>
</body>
</html>
"""

    return subject, body_text, body_html


def build_morning_login_reminder_email(
    user_name: str,
    tasks_count: int,
    pending_tasks_titles: List[str],
) -> tuple[str, str, str]:
    """
    Generates morning prompt (8:30-9:30 AM) to log into PMS, plan day, and start work.
    """
    subject = f"[Good Morning] Engineering Day Plan & Priorities - PMS"
    safe_user_name = html.escape(str(user_name or ""))
    task_bullets_text = "\n".join([f" - {t}" for t in pending_tasks_titles[:5]]) or " - None currently"
    task_bullets_html = "".join([f"<li>{html.escape(str(t))}</li>" for t in pending_tasks_titles[:5]]) or "<li>None currently</li>"

    body_text = f"""Hello {user_name},

Good morning! It's time to begin today's engineering session.

Please log in to the Engineering PMS:
{settings.FRONTEND_URL}

Morning Checklist:
1. Review your Day Plan and assigned priority tasks ({tasks_count} active).
2. Set your today's bench focus and goals.
3. Check for any blockers or manager comments.

Assigned Tasks Requiring Attention Today:
{task_bullets_text}

Have a productive day!
Engineering Project Management System
"""

    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1E293B; background-color: #FAFAF8; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="background-color: #0F172A; padding: 18px 24px; color: #FFFFFF;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Good Morning! Time to Plan Your Day</h2>
      <span style="font-size: 12px; color: #94A3B8;">Engineering PMS Daily Kickoff</span>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0;">Hello <strong>{safe_user_name}</strong>,</p>
      <p style="color: #475569; font-size: 14px;">
        Please log into the Engineering PMS to initialize your Day Plan, inspect priority tasks, and set your engineering goals for today.
      </p>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 16px; margin: 18px 0;">
        <h4 style="margin: 0 0 10px 0; color: #0F172A; font-size: 13px;">Your Priority Focus Today ({tasks_count} active tasks):</h4>
        <ul style="color: #475569; font-size: 13px; margin: 0; padding-left: 20px;">
          {task_bullets_html}
        </ul>
      </div>
      <div style="text-align: center; margin: 24px 0 16px 0;">
        <a href="{settings.FRONTEND_URL}" style="display: inline-block; background: #D97706; color: #FFFFFF; font-size: 13px; font-weight: 600; padding: 10px 24px; border-radius: 6px; text-decoration: none;">
          Launch Engineering PMS Dashboard
        </a>
      </div>
    </div>
  </div>
</body>
</html>
"""
    return subject, body_text, body_html


def build_evening_push_reminder_email(
    assignee_name: str,
    tasks: List[dict],
    manager_names: List[str],
) -> tuple[str, str, str]:
    """
    Generates evening prompt (4:00-5:30 PM) to push git code and update daily bench progress.
    """
    subject = f"[Action Required] Evening Progress & Git Push Update Reminder"
    mgr_str = ", ".join(manager_names) if manager_names else "Project Management"
    safe_assignee = html.escape(str(assignee_name or ""))
    safe_mgr = html.escape(str(mgr_str or ""))

    task_lines_text = "\n".join([f" - #{t.get('number')} {t.get('title')} [{t.get('status')}]" for t in tasks])
    task_lines_html = "".join([f"<li><strong>#{html.escape(str(t.get('number', '')))} {html.escape(str(t.get('title', '')))}</strong> ({html.escape(str(t.get('status', '')))})</li>" for t in tasks])

    body_text = f"""Hello {assignee_name},

It is end-of-day wrap up time (4:00 PM - 5:30 PM).

Please log into the Engineering PMS and complete your daily checkout:
1. PUSH YOUR CODE: Ensure all code, firmware commits, or schematic revisions are committed and pushed to Git:
   git commit -m "#<task_number> update: ..." && git push
2. BENCH PROGRESS: Add a short comment summarizing today's findings or roadblocks.
3. TIMESHEET: Log your hours worked today.

Active Tasks Under Your Name:
{task_lines_text}

Link: {settings.FRONTEND_URL}
Manager(s) in CC: {mgr_str}

Regards,
Engineering Project Management System
"""

    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1E293B; background-color: #FAFAF8; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="background-color: #B45309; padding: 18px 24px; color: #FFFFFF;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Daily Checkout: Push Code &amp; Update Tasks</h2>
      <span style="font-size: 12px; color: #FEF3C7;">4:00 PM – 5:30 PM Engineering Progress Wrap-Up</span>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0;">Hello <strong>{safe_assignee}</strong>,</p>
      <p style="color: #475569; font-size: 14px;">
        Before concluding your day, please ensure all engineering progress is committed, pushed, and documented in the web app:
      </p>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #B45309; border-radius: 4px; padding: 16px; margin: 18px 0;">
        <h4 style="margin: 0 0 10px 0; color: #0F172A; font-size: 13px;">Pending Active Tasks:</h4>
        <ul style="color: #475569; font-size: 13px; margin: 0; padding-left: 20px;">
          {task_lines_html}
        </ul>
      </div>
      <h4 style="color: #0F172A; margin-bottom: 8px; font-size: 14px;">End of Day Checklist:</h4>
      <ol style="color: #475569; font-size: 13px; padding-left: 20px; margin-top: 0;">
        <li><strong>Push to Git:</strong> Run <code>git commit -m "#&lt;task&gt; &lt;msg&gt;" &amp;&amp; git push</code></li>
        <li><strong>Bench Notes:</strong> Post a comment in PMS explaining what passed/failed or current roadblocks.</li>
        <li><strong>Log Time:</strong> Record today's work hours in the timesheet.</li>
      </ol>
      <div style="text-align: center; margin: 24px 0 16px 0;">
        <a href="{settings.FRONTEND_URL}" style="display: inline-block; background: #B45309; color: #FFFFFF; font-size: 13px; font-weight: 600; padding: 10px 24px; border-radius: 6px; text-decoration: none;">
          Open PMS &amp; Update Tasks
        </a>
      </div>
      <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #64748B;">
        <strong>Manager(s) in CC:</strong> {safe_mgr}
      </div>
    </div>
  </div>
</body>
</html>
"""
    return subject, body_text, body_html


def build_delay_inquiry_email(
    assignee_name: str,
    task_number: int,
    task_title: str,
    project_name: str,
    status: str,
    priority: str,
    due_date: Optional[str],
    task_id: str,
    sender_name: str,
    custom_inquiry: Optional[str] = None,
    manager_names: Optional[List[str]] = None,
) -> tuple[str, str, str]:
    """
    Generates subject, text body, and HTML body for an Admin inquiry into why a task is delayed.
    """
    subject = f"[DELAY EXPLANATION REQUIRED] Task #ENG-{str(task_number).zfill(3)}: {task_title} ({project_name})"
    mgr_str = ", ".join(manager_names) if manager_names else "Project Management"
    due_str = due_date if due_date else "Not set"
    inquiry_message = custom_inquiry.strip() if custom_inquiry and custom_inquiry.strip() else "Please explain the current technical roadblocks or reasons for the milestone delay."

    body_text = f"""Hello {assignee_name},

This is an official inquiry initiated by {sender_name} regarding task schedule delays.

TASK DELAY NOTICE
======================================================
Task ID:       #ENG-{str(task_number).zfill(3)}
Title:         {task_title}
Project:       {project_name}
Status:        {status}
Priority:      {priority}
Target Date:   {due_str}
======================================================

INQUIRY FROM MANAGEMENT:
"{inquiry_message}"

ACTION REQUIRED IMMEDIATELY:
1. Log into Engineering PMS: {settings.FRONTEND_URL}/tasks/{task_id}
2. Post a comment detailing:
   - What hardware, firmware, or software roadblocks occurred.
   - Revised estimated completion date.
   - Any dependencies or approvals needed.
3. Update task status accordingly.

Project Manager(s) in CC: {mgr_str}

Regards,
{sender_name} via Engineering PMS
"""

    safe_assignee = html.escape(str(assignee_name or ""))
    safe_sender = html.escape(str(sender_name or ""))
    safe_title = html.escape(str(task_title or ""))
    safe_project = html.escape(str(project_name or ""))
    safe_status = html.escape(str(status or ""))
    safe_priority = html.escape(str(priority or ""))
    safe_due = html.escape(str(due_str or ""))
    safe_inquiry = html.escape(str(inquiry_message or ""))
    safe_mgr = html.escape(str(mgr_str or ""))

    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1E293B; background-color: #FAFAF8; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
    <div style="background-color: #DC2626; padding: 18px 24px; color: #FFFFFF;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 700;">Action Required: Task Delay Inquiry</h2>
      <span style="font-size: 12px; color: #FEE2E2;">Initiated by {safe_sender} &bull; Engineering PMS</span>
    </div>

    <div style="padding: 24px;">
      <p style="margin-top: 0;">Hello <strong>{safe_assignee}</strong>,</p>

      <p style="color: #475569; font-size: 14px;">
        An escalation inquiry has been dispatched concerning your deliverable below:
      </p>

      <div style="background: #FEF2F2; border: 1px solid #FECACA; border-left: 4px solid #DC2626; border-radius: 4px; padding: 16px; margin: 18px 0; font-size: 13px;">
        <div style="margin-bottom: 6px;"><strong>Task:</strong> #ENG-{str(task_number).zfill(3)} - {safe_title}</div>
        <div style="margin-bottom: 6px;"><strong>Project:</strong> {safe_project}</div>
        <div style="margin-bottom: 6px;"><strong>Status:</strong> <span style="background: #FEE2E2; color: #991B1B; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: bold;">{safe_status}</span></div>
        <div style="margin-bottom: 6px;"><strong>Priority:</strong> {safe_priority}</div>
        <div><strong>Due Date:</strong> {safe_due}</div>
      </div>

      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 16px; margin: 18px 0;">
        <h4 style="margin: 0 0 8px 0; color: #0F172A; font-size: 13px;">Inquiry Note from {safe_sender}:</h4>
        <blockquote style="margin: 0; padding-left: 12px; border-left: 3px solid #CBD5E1; color: #334155; font-style: italic; font-size: 13px;">
          "{safe_inquiry}"
        </blockquote>
      </div>

      <h4 style="color: #0F172A; margin-bottom: 8px; font-size: 14px;">Required Response:</h4>
      <p style="color: #475569; font-size: 13px; margin-top: 0;">
        Please log into the web application and document the root cause for the delay in the task comments, along with your updated completion timeline.
      </p>

      <div style="margin-top: 24px; text-align: center;">
        <a href="{settings.FRONTEND_URL}/tasks/{task_id}" style="display: inline-block; background: #DC2626; color: #FFFFFF; font-size: 13px; font-weight: 600; padding: 10px 24px; border-radius: 6px; text-decoration: none;">
          Respond to Delay Inquiry in Web App
        </a>
      </div>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #64748B;">
        <strong>Manager(s) in CC:</strong> {safe_mgr}
      </div>
    </div>
  </div>
</body>
</html>
"""
    return subject, body_text, body_html


def build_new_user_pending_approval_email(
    admin_name: str,
    new_user_name: str,
    new_user_email: str,
    approve_token: Optional[str] = None,
) -> Tuple[str, str, str]:
    subject = f"🚨 Lobby Alert: {new_user_name} is waiting in Lobby for PMS access"
    approve_url = (
        f"{settings.FRONTEND_URL}/api/auth/approve-lobby-user?token={approve_token}"
        if approve_token
        else f"{settings.FRONTEND_URL}/admin/users"
    )
    admin_users_url = f"{settings.FRONTEND_URL}/admin/users"
    body_text = f"""Hello {admin_name},

A user is currently waiting in the Engineering PMS Access Lobby for your approval:

Name: {new_user_name}
Email: {new_user_email}
Status: Waiting in Access Lobby

⚡ Click here to 1-Click Approve & Activate this user:
{approve_url}

Or manage users directly in the Admin Users panel:
{admin_users_url}

Once you click approve, their lobby screen will immediately unlock in real-time and take them into the workspace.

Best regards,
Engineering PMS System
"""
    safe_admin_name = html.escape(str(admin_name or ""))
    safe_new_name = html.escape(str(new_user_name or ""))
    safe_new_email = html.escape(str(new_user_email or ""))

    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0F172A; padding: 28px; color: #334155;">
  <div style="max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 1px solid #E2E8F0;">
    <div style="background: #1E293B; padding: 22px 28px; border-bottom: 3px solid #10B981; display: flex; align-items: center;">
      <h2 style="color: #F8FAFC; margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -0.02em;">
        🚨 Engineering PMS &bull; Access Request Lobby
      </h2>
    </div>
    <div style="padding: 28px;">
      <p style="color: #0F172A; font-size: 15px; margin-top: 0;">Hello <strong>{safe_admin_name}</strong>,</p>
      <p style="color: #475569; font-size: 13.5px; line-height: 1.5;">
        A team member signed in via Google and is <strong>currently waiting in the Access Lobby</strong> for your authorization:
      </p>
      
      <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-left: 5px solid #D97706; padding: 16px 20px; margin: 20px 0; border-radius: 6px;">
        <p style="margin: 4px 0; font-size: 13.5px; color: #1E293B;"><strong>Name:</strong> {safe_new_name}</p>
        <p style="margin: 4px 0; font-size: 13.5px; color: #1E293B;"><strong>Google Email:</strong> <a href="mailto:{safe_new_email}" style="color: #2563EB;">{safe_new_email}</a></p>
        <p style="margin: 4px 0; font-size: 13.5px; color: #D97706; font-weight: 600;"><strong>Status:</strong> ⏳ Live Waiting in Lobby</p>
      </div>

      <p style="color: #64748B; font-size: 12.5px; line-height: 1.5;">
        Their browser is actively checking your authorization in real-time. The moment you activate them, their workspace will unlock immediately.
      </p>

      <div style="margin-top: 28px; text-align: center;">
        <a href="{approve_url}" style="display: inline-block; background: #059669; color: #FFFFFF; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.4);">
          ⚡ 1-Click Approve &amp; Activate User Now &rarr;
        </a>
        <div style="margin-top: 14px;">
          <a href="{admin_users_url}" style="color: #64748B; font-size: 12px; text-decoration: underline;">
            Or review in Admin Users Panel
          </a>
        </div>
      </div>
    </div>
    <div style="background: #F8FAFC; padding: 14px 28px; border-top: 1px solid #E2E8F0; text-align: center;">
      <span style="font-size: 11px; color: #94A3B8;">Engineering PMS &bull; Hardware & Firmware Workspace Security</span>
    </div>
  </div>
</body>
</html>"""
    return subject, body_text, body_html


def build_project_team_pending_reminder_email(
    project_name: str,
    recipient_names: List[str],
    tasks: List[dict],
    manager_names: List[str],
    project_id: str,
) -> tuple[str, str, str]:
    """
    Generates subject, text body, and HTML body for a project-wide pending tasks reminder
    sent simultaneously to multiple team members/engineers with managers in CC.
    """
    subject = f"[Action Required] Pending Engineering Tasks Reminder: {project_name}"

    recipients_str = ", ".join(recipient_names) if recipient_names else "Engineering Team"
    mgr_str = ", ".join(manager_names) if manager_names else "Project Management"
    safe_project = html.escape(str(project_name or ""))
    safe_recipients = html.escape(str(recipients_str or ""))
    safe_mgr = html.escape(str(mgr_str or ""))

    task_rows_text = []
    task_rows_html = []

    for t in tasks:
        num = t.get("number", "—")
        title = t.get("title", "Untitled")
        status = t.get("status", "PENDING")
        priority = t.get("priority", "MEDIUM")
        assignee = t.get("assignee_name", "Unassigned")
        due = t.get("due_date", "Not set")

        safe_num = html.escape(str(num))
        safe_title = html.escape(str(title))
        safe_status = html.escape(str(status))
        safe_priority = html.escape(str(priority))
        safe_assignee = html.escape(str(assignee))
        safe_due = html.escape(str(due))

        task_rows_text.append(f" - #ENG-{str(num).zfill(3)}: {title} | Assignee: {assignee} | Status: {status} | Priority: {priority} | Due: {due}")

        status_color = "#92400E" if status in ["TODO", "IN_PROGRESS"] else "#1E40AF"
        status_bg = "#FEF3C7" if status in ["TODO", "IN_PROGRESS"] else "#DBEAFE"

        task_rows_html.append(f"""
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 10px; font-weight: bold; font-family: monospace; color: #D97706;">#ENG-{safe_num.zfill(3)}</td>
          <td style="padding: 10px; font-weight: 500; color: #1E293B;">{safe_title}</td>
          <td style="padding: 10px; color: #475569;">{safe_assignee}</td>
          <td style="padding: 10px;"><span style="background: {status_bg}; color: {status_color}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">{safe_status}</span></td>
          <td style="padding: 10px; font-size: 12px; color: #64748B;">{safe_due}</td>
        </tr>""")

    tasks_text = "\n".join(task_rows_text)
    tasks_html = "".join(task_rows_html)

    body_text = f"""Hello {recipients_str},

This is an automated notification from the Engineering Project Management System for project '{project_name}'.

The following engineering task(s) are currently PENDING and require daily technical updates:
======================================================
{tasks_text}
======================================================

ACTION REQUIRED TODAY:
Please log in to Engineering PMS immediately to record your bench progress:
1. Document test results, schematic revisions, or roadblocks in task comments.
2. Push your daily Git commits: git commit -m "#<task_number> update: ..." && git push
3. Record today's work hours in the timesheet.
4. Update the task status to reflect its latest state.

Direct Project Link: {settings.FRONTEND_URL}/projects/{project_id}

Project Manager(s) in CC: {mgr_str}

Regards,
Engineering Project Management System
"""

    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1E293B; background-color: #FAFAF8; padding: 24px;">
  <div style="max-width: 680px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="background-color: #D97706; padding: 18px 24px; color: #FFFFFF;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Pending Tasks Team Reminder</h2>
      <span style="font-size: 12px; opacity: 0.9;">Project: {safe_project}</span>
    </div>
    
    <div style="padding: 24px;">
      <p style="margin-top: 0;">Hello <strong>{safe_recipients}</strong>,</p>
      
      <p style="color: #475569; font-size: 14px;">
        The following engineering task(s) in project <strong>{safe_project}</strong> are currently pending progress updates. Please review and ensure today's technical notes, commits, and hours are documented in PMS.
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; text-align: left;">
        <thead>
          <tr style="background: #F1F5F9; border-bottom: 2px solid #CBD5E1; color: #475569; font-size: 11px; text-transform: uppercase;">
            <th style="padding: 8px 10px;">ID</th>
            <th style="padding: 8px 10px;">Task Title</th>
            <th style="padding: 8px 10px;">Assignee</th>
            <th style="padding: 8px 10px;">Status</th>
            <th style="padding: 8px 10px;">Due Date</th>
          </tr>
        </thead>
        <tbody>
          {tasks_html}
        </tbody>
      </table>

      <h4 style="color: #0F172A; margin-bottom: 8px; font-size: 14px;">Action Required Today:</h4>
      <ul style="color: #475569; font-size: 13px; padding-left: 20px; margin-top: 0;">
        <li>Document technical progress, schematic checks, or firmware test notes in comments.</li>
        <li>Commit and push code/schematics referencing the task number.</li>
        <li>Log completed engineering hours in the timesheet.</li>
        <li>Update task status to reflect current state.</li>
      </ul>

      <div style="margin-top: 24px; text-align: center;">
        <a href="{settings.FRONTEND_URL}/projects/{project_id}" style="display: inline-block; background-color: #D97706; color: #FFFFFF; font-size: 13px; font-weight: 600; padding: 10px 20px; text-decoration: none; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
          Open Project in PMS
        </a>
      </div>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #64748B;">
        <strong>Project Manager(s) in CC:</strong> {safe_mgr}
      </div>
    </div>
  </div>
</body>
</html>
"""
    return subject, body_text, body_html


def build_project_startup_email(
    member_name: str,
    member_email: str,
    project_name: str,
    project_role: str,
    assigned_by_name: str,
    project_id: str,
    description: Optional[str] = None,
    objectives: Optional[str] = None,
    priority: Optional[str] = "MEDIUM",
    status: Optional[str] = "PLANNING",
    start_date: Optional[str] = None,
    target_date: Optional[str] = None,
    workspace_name: Optional[str] = None,
) -> Tuple[str, str, str]:
    """
    Generates subject, text body, and HTML body for a Project Startup / Onboarding Email
    sent immediately when a member is assigned to a project.
    """
    subject = f"🚀 Welcome to {project_name} • Project Kickoff & Workspace Access"

    project_url = f"{settings.FRONTEND_URL}/projects/{project_id}"
    board_url = f"{settings.FRONTEND_URL}/projects/{project_id}/board"

    priority_val = (priority or "MEDIUM").upper()
    status_val = (status or "ACTIVE").upper()
    start_str = start_date if start_date else "Immediate / Ongoing"
    target_str = target_date if target_date else "To be determined"
    workspace_str = workspace_name if workspace_name else "Default Engineering Workspace"
    desc_str = description.strip() if description else "No formal description provided yet."
    obj_str = objectives.strip() if objectives else None

    # Priority styling badge
    p_colors = {
        "CRITICAL": ("#991B1B", "#FEE2E2", "#DC2626"),
        "HIGH": ("#92400E", "#FEF3C7", "#D97706"),
        "MEDIUM": ("#1E40AF", "#DBEAFE", "#2563EB"),
        "LOW": ("#374151", "#F3F4F6", "#6B7280"),
    }
    p_text_col, p_bg_col, p_border_col = p_colors.get(priority_val, ("#1E40AF", "#DBEAFE", "#2563EB"))

    body_text = f"""Hello {member_name},

You have been officially assigned to the project "{project_name}" in the Engineering Project Management System!

PROJECT STARTUP & ONBOARDING
======================================================
Project Name:  {project_name}
Your Role:     {project_role}
Assigned By:   {assigned_by_name}
Workspace:     {workspace_str}
Status:        {status_val}
Priority:      {priority_val}
Start Date:    {start_str}
Target Date:   {target_str}
======================================================

PROJECT BRIEF:
{desc_str}
"""
    if obj_str:
        body_text += f"""
KEY OBJECTIVES:
{obj_str}
"""

    body_text += f"""
GETTING STARTED TODAY:
1. Access your project workspace:
   {project_url}
2. Review the Kanban task board:
   {board_url}
3. Coordinate with your team using @mentions and the Messages page.
4. Record all schematic, firmware, and test updates directly in PMS.

Best regards,
Engineering Project Management System
Hardware & Firmware Workspace
"""

    objectives_html = ""
    if obj_str:
        safe_obj_str = html.escape(str(obj_str))
        objectives_html = f"""
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #3B82F6; padding: 14px 18px; margin: 18px 0; border-radius: 6px;">
        <h4 style="margin: 0 0 6px 0; font-size: 13px; color: #1E293B; text-transform: uppercase; letter-spacing: 0.05em;">Key Objectives</h4>
        <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5; white-space: pre-line;">{safe_obj_str}</p>
      </div>
        """

    safe_member = html.escape(str(member_name or ""))
    safe_project = html.escape(str(project_name or ""))
    safe_role = html.escape(str(project_role or ""))
    safe_assigned_by = html.escape(str(assigned_by_name or ""))
    safe_workspace = html.escape(str(workspace_str or ""))
    safe_priority = html.escape(str(priority_val or ""))
    safe_status = html.escape(str(status_val or ""))
    safe_start = html.escape(str(start_str or ""))
    safe_target = html.escape(str(target_str or ""))
    safe_desc = html.escape(str(desc_str or ""))

    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0B0F19; padding: 28px; color: #334155;">
  <div style="max-width: 620px; margin: 0 auto; background: #FFFFFF; border-radius: 14px; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.35); border: 1px solid #E2E8F0;">
    <!-- Header -->
    <div style="background: #111827; padding: 24px 30px; border-bottom: 3px solid #3B82F6;">
      <span style="display: inline-block; background: rgba(59, 130, 246, 0.2); color: #60A5FA; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(59, 130, 246, 0.4)">
        🚀 Project Startup &bull; Onboarding
      </span>
      <h2 style="color: #F8FAFC; margin: 12px 0 0 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em;">
        Welcome to {safe_project}
      </h2>
    </div>

    <!-- Body -->
    <div style="padding: 30px;">
      <p style="color: #0F172A; font-size: 15px; margin-top: 0;">Hello <strong>{safe_member}</strong>,</p>
      <p style="color: #475569; font-size: 13.5px; line-height: 1.55; margin-bottom: 22px;">
        You have been officially added as a member of the <strong>{safe_project}</strong> engineering team on Engineering PMS. Your workspace, task access, and repositories are now provisioned.
      </p>

      <!-- Project Metadata Grid Card -->
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 18px 20px; margin-bottom: 22px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748B; width: 38%;">Assigned Role:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #1E293B;">
              <span style="background: #E0E7FF; color: #3730A3; padding: 3px 10px; border-radius: 4px; font-size: 11.5px; font-weight: 700; text-transform: uppercase;">
                {safe_role}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Assigned By:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0F172A;">{safe_assigned_by}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Workspace:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0F172A;">{safe_workspace}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Priority:</td>
            <td style="padding: 6px 0;">
              <span style="background: {p_bg_col}; color: {p_text_col}; border: 1px solid {p_border_col}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">
                {safe_priority}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Status:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #10B981;">{safe_status}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Start / Target Date:</td>
            <td style="padding: 6px 0; color: #475569; font-size: 12.5px;">{safe_start} &rarr; <strong>{safe_target}</strong></td>
          </tr>
        </table>
      </div>

      <!-- Description Box -->
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 6px 0; font-size: 13px; color: #1E293B; text-transform: uppercase; letter-spacing: 0.05em;">Project Brief</h4>
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; padding: 14px 18px; border-radius: 8px; font-size: 13px; color: #334155; line-height: 1.55;">
          {safe_desc}
        </div>
      </div>

      {objectives_html}

      <!-- Call to Action Buttons -->
      <div style="margin: 28px 0; text-align: center;">
        <a href="{project_url}" style="display: inline-block; background: #2563EB; color: #FFFFFF; font-size: 14px; font-weight: 700; padding: 13px 30px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35); margin-right: 10px;">
          Open Project Workspace &rarr;
        </a>
        <a href="{board_url}" style="display: inline-block; background: #1E293B; color: #E2E8F0; font-size: 13px; font-weight: 600; padding: 13px 22px; border-radius: 8px; text-decoration: none; border: 1px solid #334155;">
          View Kanban Board
        </a>
      </div>

      <!-- Quick Startup Guide -->
      <div style="border-top: 1px solid #E2E8F0; padding-top: 20px; margin-top: 24px;">
        <h4 style="margin: 0 0 10px 0; font-size: 12.5px; color: #0F172A; text-transform: uppercase; letter-spacing: 0.05em;">Quick Startup Checklist:</h4>
        <ul style="color: #64748B; font-size: 12.5px; line-height: 1.6; margin: 0; padding-left: 20px;">
          <li>Review assigned tasks and technical milestones on the board.</li>
          <li>Mention teammates with <code style="background: #F1F5F9; padding: 2px 5px; border-radius: 4px; color: #2563EB;">@username</code> in task comments.</li>
          <li>Document all daily schematic, firmware, or testing progress.</li>
          <li>Log engineering hours in the Timesheet module.</li>
        </ul>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #F8FAFC; padding: 14px 28px; border-top: 1px solid #E2E8F0; text-align: center;">
      <span style="font-size: 11px; color: #94A3B8;">Engineering PMS &bull; Hardware & Firmware Workspace Security</span>
    </div>
  </div>
</body>
</html>"""

    return subject, body_text, body_html
