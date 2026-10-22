# Engineering PMS - Operational Security Hardening Checklist (SECURITY_TODO.md)

This document tracks operational and infrastructure-level security hardening actions required for production deployment beyond application-level source code remediations.

---

## 1. Cloud & AWS Infrastructure Hardening

- [ ] **AWS EC2 Security Group Lockdown**
  - **Status**: Action Required
  - **Action**: Restrict inbound SSH (port 22) exclusively to authorized admin/bastion IPs or corporate VPN CIDR. Inbound port 80/443 must accept Cloudflare IP ranges only.
  - **Recommended Command**:
    ```bash
    aws ec2 authorize-security-group-ingress --group-id <sg-id> --protocol tcp --port 22 --cidr <ADMIN_IP>/32
    ```

- [ ] **AWS Systems Manager (SSM) Session Manager**
  - **Status**: Recommended
  - **Action**: Eliminate open SSH port 22 entirely by attaching the `AmazonSSMManagedInstanceCore` IAM policy to the EC2 instance role and managing remote access via AWS SSM Session Manager.

- [ ] **Enforce AWS IMDSv2 (Mitigate SSRF Risks)**
  - **Status**: Action Required
  - **Action**: Require token-based metadata service (IMDSv2) with hop-limit 1 to prevent SSRF vulnerabilities from retrieving EC2 instance credentials.
  - **Command**:
    ```bash
    aws ec2 modify-instance-metadata-options \
      --instance-id <INSTANCE_ID> \
      --http-tokens required \
      --http-put-response-hop-limit 1 \
      --http-endpoint enabled
    ```

- [ ] **S3 Backup Storage Encryption (If Enabled)**
  - **Status**: Recommended
  - **Action**: Ensure backup S3 buckets have default SSE-KMS encryption enabled, versioning enabled, and Public Access Block active.

---

## 2. Cloudflare & Edge Security

- [ ] **Deploy Permanent Named Cloudflare Tunnel**
  - **Status**: In Progress
  - **Action**: Transition from ephemeral `mass-ships-null-supplemental.trycloudflare.com` quick tunnel to a permanent named tunnel configured via `cloudflared tunnel create engineering-pms`.
  - **Benefit**: Retains a stable domain, prevents tunnel hijacking on server restarts, and allows routing policies.

- [ ] **Cloudflare Zero Trust Access Policies**
  - **Status**: Highly Recommended
  - **Action**: Create an Access Application protecting `/admin/*` and `/api/admin/*` requiring SSO / OTP authentication before traffic touches the origin server.

- [ ] **WAF & Rate Limiting Rules at the Edge**
  - **Status**: Recommended
  - **Action**: Configure Cloudflare Rate Limiting rules on `POST /api/auth/login` (max 10 requests / 5 minutes per client IP).

---

## 3. Database Security & Backup Resilience

- [ ] **Least-Privilege Database Role**
  - **Status**: Verified in `docker-compose.yml`
  - **Notes**: Postgres 15 runs inside Docker without publishing port 5432 to the host network interface. The application connects over the internal `pms_net` Docker bridge.

- [ ] **Encrypted Automated Backups & Restoration Verification**
  - **Status**: Action Required
  - **Action**: Update `backup.sh` to pipe `pg_dump` into GPG encryption before saving to disk or offsite storage:
    ```bash
    pg_dump -U pms_user pms_db | gpg --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" > backup_$(date +%F).sql.gpg
    ```
  - **Test**: Conduct a monthly automated restore test into a temporary test database to verify recovery Point-in-Time Objectives (RPO/RTO).

---

## 4. Secret & Credential Lifecycle

- [ ] **Rotate Production Environment Secrets**
  - **Status**: Action Required
  - **Items to rotate in production `.env`**:
    - `SECRET_KEY`: Generate a cryptographically secure 64-character secret using `python -c "import secrets; print(secrets.token_hex(32))"`.
    - `PMS_DB_PASSWORD`: Set a strong randomized alphanumeric database password.
    - `FIRST_ADMIN_PASSWORD`: Ensure default password `AdminSecurePassword123!` is changed immediately on first login.

- [ ] **Automated Secret Scanning in CI**
  - **Status**: Implemented
  - **Notes**: `.github/workflows/security.yml` runs Gitleaks on all commits and PRs to detect accidentally committed tokens.

---

## 5. Continuous SAST, DAST & Dependency Hygiene

- [ ] **Automated Dependency Updates (Dependabot / Renovate)**
  - **Status**: Implemented via `.github/dependabot.yml`
  - **Notes**: Automatically scans Python (pip) and Node.js (npm) packages weekly and opens automated security patch PRs.

- [ ] **Periodic SAST Scanning**
  - **Status**: Implemented in GitHub Actions CI
  - **Tools**: Bandit (Python SAST), Pip-Audit (CVE detection), Semgrep (OWASP Top 10 rules), Trivy (container filesystem scanning).
