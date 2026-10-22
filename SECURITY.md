# Security Policy

## Reporting Security Vulnerabilities

The Engineering Project Management System (PMS) development and security teams take the protection of engineering data, hardware designs, firmware repositories, and user credentials seriously. If you discover a vulnerability or potential security risk in this application, we appreciate your responsible disclosure.

### How to Report

Please do **NOT** file public GitHub issues, discussions, or pull requests for security vulnerabilities.

Instead, submit your findings securely to our engineering security lead:
- **Email**: `gowthamthangaraj18@gmail.com`
- **Subject**: `[SECURITY VULNERABILITY] <Component>: <Vulnerability Title>`
- **PGP Encryption**: If sending sensitive proofs or credentials, request our public PGP fingerprint via email prior to transmitting reproduction details.

### What to Include in Your Report

To help us triage and remediate the issue rapidly, please provide:
1. **Description**: Summary of the vulnerability, CWE classification, and perceived impact.
2. **Steps to Reproduce**: Detailed, step-by-step instructions or minimal non-destructive proof-of-concept.
3. **Affected Components**: Specific API endpoint (`/api/...`), frontend component, or configuration file.
4. **Environment**: Local environment version, Docker container version, or OS architecture.
5. **Remediation Suggestion**: Recommended code patch or architectural control if available.

---

## Response & Resolution SLAs

Our security incident response team follows strict Service Level Agreements (SLAs) based on CVSS v3.1 severity scores:

| Severity | Target First Response | Triage & Reproduction | Remediation SLA |
| :--- | :--- | :--- | :--- |
| **Critical** (CVSS 9.0–10.0) | < 24 hours | < 48 hours | 7 calendar days |
| **High** (CVSS 7.0–8.9) | < 24 hours | < 72 hours | 14 calendar days |
| **Medium** (CVSS 4.0–6.9) | < 48 hours | < 5 business days | 30 calendar days |
| **Low / Info** (CVSS 0.1–3.9) | < 5 business days | < 10 business days | Next scheduled release |

---

## Scope

### In-Scope Assets
- FastAPI Application Core (`backend/app/**`)
- Authentication & JWT Authorization mechanisms (`/api/auth/**`)
- Multi-Tenant Workspace & Project Access Control boundaries (`/api/workspaces/**`, `/api/projects/**`)
- Role-Based Access Controls (RBAC) & Object-Level Access (BOLA/IDOR)
- File upload/download & attachment storage services
- API rate limiting & reverse proxy configurations (`nginx/nginx.conf`)
- React SPA frontend client security (`frontend/src/**`)

### Out-of-Scope Findings
- Attacks against Cloudflare edge infrastructure or third-party DNS
- Volumetric Denial of Service (DoS/DDoS) attacks
- Social engineering, phishing, or physical physical attacks against operators
- Spamming or automated brute-force attacks against rate-limited login endpoints
- Vulnerabilities affecting outdated, unsupported third-party browser clients

---

## Safe Harbor Statement

We consider activities conducted in accordance with this policy to be authorized. We will not pursue legal action against researchers who:
- Make a good faith effort to avoid privacy violations, data destruction, and service degradation.
- Give the security team a reasonable timeframe to remediate vulnerabilities prior to public disclosure.
- Only interact with test accounts or resources under their direct control.
- Comply with all applicable data protection regulations.
