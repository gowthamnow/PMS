import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from app.config import settings

logger = logging.getLogger("email_service")


def send_email(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
    cc_emails: Optional[List[str]] = None,
) -> bool:
    """
    Sends an email using configured SMTP settings.
    Gracefully logs and continues if SMTP is not configured or fails.
    """
    if not settings.SMTP_HOST:
        logger.info(
            "SMTP_HOST not configured. Email simulated -> TO: %s, CC: %s, SUBJECT: %s",
            to_email,
            cc_emails or [],
            subject,
        )
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
        msg["To"] = to_email

        all_recipients = [to_email]
        if cc_emails:
            valid_ccs = [cc.strip() for cc in cc_emails if cc and cc.strip()]
            if valid_ccs:
                msg["Cc"] = ", ".join(valid_ccs)
                all_recipients.extend(valid_ccs)

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

        server.sendmail(settings.EMAILS_FROM_EMAIL, all_recipients, msg.as_string())
        server.quit()
        logger.info("Email delivered successfully to %s (CC: %s)", to_email, cc_emails)
        return True
    except Exception as exc:
        logger.warning("Failed to deliver email to %s: %s", to_email, exc)
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

    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1E293B; background-color: #FAFAF8; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="background-color: #D97706; padding: 16px 24px; color: #FFFFFF;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Daily Task Update Reminder</h2>
      <span style="font-size: 12px; opacity: 0.9;">Engineering Project Management System</span>
    </div>
    
    <div style="padding: 24px;">
      <p style="margin-top: 0;">Hello <strong>{assignee_name}</strong>,</p>
      
      <p style="color: #475569; font-size: 14px;">
        Your assigned task has been identified as <strong>pending</strong> without a recent progress update ({days_since_update} day(s) inactive).
      </p>

      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #D97706; border-radius: 4px; padding: 16px; margin: 20px 0; font-size: 13px;">
        <div style="margin-bottom: 6px;"><strong>Task:</strong> #ENG-{str(task_number).zfill(3)} - {task_title}</div>
        <div style="margin-bottom: 6px;"><strong>Project:</strong> {project_name}</div>
        <div style="margin-bottom: 6px;"><strong>Status:</strong> <span style="background: #FEF3C7; color: #92400E; padding: 2px 6px; border-radius: 4px; font-family: monospace;">{status}</span></div>
        <div style="margin-bottom: 6px;"><strong>Priority:</strong> {priority}</div>
        <div><strong>Due Date:</strong> {due_str}</div>
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
        <strong>Manager(s) in CC:</strong> {mgr_str}
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
    task_bullets_text = "\n".join([f" - {t}" for t in pending_tasks_titles[:5]]) or " - None currently"
    task_bullets_html = "".join([f"<li>{t}</li>" for t in pending_tasks_titles[:5]]) or "<li>None currently</li>"

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
      <p style="margin-top: 0;">Hello <strong>{user_name}</strong>,</p>
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

    task_lines_text = "\n".join([f" - #{t.get('number')} {t.get('title')} [{t.get('status')}]" for t in tasks])
    task_lines_html = "".join([f"<li><strong>#{t.get('number')} {t.get('title')}</strong> ({t.get('status')})</li>" for t in tasks])

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
      <p style="margin-top: 0;">Hello <strong>{assignee_name}</strong>,</p>
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
        <strong>Manager(s) in CC:</strong> {mgr_str}
      </div>
    </div>
  </div>
</body>
</html>
"""
    return subject, body_text, body_html
