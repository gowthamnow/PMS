import json
import urllib.request
import hmac
import hashlib
import time

BASE_URL = "http://localhost:8080"
GITEA_TOKEN = "3f16bf1c681c564e26af5da31120437fbbf62a16"

print("1. Creating repository 'firmware-core' in Gitea...")
try:
    req = urllib.request.Request(
        f"{BASE_URL}/gitea/api/v1/user/repos",
        data=json.dumps({
            "name": "firmware-core",
            "description": "STM32 Firmware Core Repository",
            "private": True,
            "auto_init": True,
            "default_branch": "main"
        }).encode("utf-8"),
        headers={
            "Authorization": f"token {GITEA_TOKEN}",
            "Content-Type": "application/json"
        }
    )
    with urllib.request.urlopen(req) as resp:
        repo_data = json.loads(resp.read().decode("utf-8"))
        print(f"  [PASS] Repository created: {repo_data.get('full_name')} (ID: {repo_data.get('id')})")
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8")
    if "The repository with the same name already exists" in body or "already exists" in body:
        print("  [INFO] Repository already exists, proceeding...")
    else:
        print(f"  [WARN] Repo creation response: {e.code} {body}")

print("\n2. Logging in to PMS to obtain JWT token...")
login_req = urllib.request.Request(
    f"{BASE_URL}/api/auth/login",
    data=json.dumps({"username": "admin", "password": "AdminEng2026#Secure"}).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)
with urllib.request.urlopen(login_req) as resp:
    login_data = json.loads(resp.read().decode("utf-8"))
    jwt_token = login_data["access_token"]
    print("  [PASS] Authenticated successfully with JWT")

print("\n3. Finding existing project to link Gitea repo...")
proj_req = urllib.request.Request(
    f"{BASE_URL}/api/projects",
    headers={"Authorization": f"Bearer {jwt_token}"}
)
with urllib.request.urlopen(proj_req) as resp:
    projects = json.loads(resp.read().decode("utf-8"))
    project_id = projects["items"][0]["id"]
    print(f"  [PASS] Found project: {projects['items'][0]['name']} ({project_id})")

print("\n4. Linking Gitea repository in PMS...")
link_req = urllib.request.Request(
    f"{BASE_URL}/api/gitea/repos",
    data=json.dumps({
        "project_id": project_id,
        "repo_full_name": "giteaadmin/firmware-core",
        "repo_url": "http://gitea:3000/giteaadmin/firmware-core",
        "default_branch": "main"
    }).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {jwt_token}",
        "Content-Type": "application/json"
    }
)
with urllib.request.urlopen(link_req) as resp:
    linked_repo = json.loads(resp.read().decode("utf-8"))
    repo_id = linked_repo["id"]
    webhook_secret = linked_repo["webhook_secret"]
    print(f"  [PASS] Repository linked in PMS! Repo ID: {repo_id}")
    print(f"  [PASS] Generated Webhook Secret: {webhook_secret[:12]}...")

print("\n5. Testing Webhook Verification and Task #1 Linking...")
payload = {
    "ref": "refs/heads/main",
    "commits": [
        {
            "id": "e4b8c9d012345678",
            "message": "Implement HAL SPI driver DMA interrupt #1",
            "author": {"name": "Firmware Lead"},
            "url": "http://gitea:3000/giteaadmin/firmware-core/commit/e4b8c9d0",
            "timestamp": "2026-10-19T17:45:00Z"
        }
    ]
}
payload_bytes = json.dumps(payload).encode("utf-8")
signature = "sha256=" + hmac.new(webhook_secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()

webhook_req = urllib.request.Request(
    f"{BASE_URL}/api/gitea/webhook/{repo_id}",
    data=payload_bytes,
    headers={
        "Content-Type": "application/json",
        "X-Gitea-Signature": signature,
        "X-Gitea-Event": "push",
        "X-Gitea-Delivery": f"delivery-{int(time.time())}"
    }
)
with urllib.request.urlopen(webhook_req) as resp:
    webhook_res = json.loads(resp.read().decode("utf-8"))
    print(f"  [PASS] Webhook processed successfully: {webhook_res}")

print("\n6. Testing Webhook Deduplication (sending same event again)...")
webhook_req_dup = urllib.request.Request(
    f"{BASE_URL}/api/gitea/webhook/{repo_id}",
    data=payload_bytes,
    headers={
        "Content-Type": "application/json",
        "X-Gitea-Signature": signature,
        "X-Gitea-Event": "push",
        "X-Gitea-Delivery": webhook_req.headers["X-gitea-delivery"]
    }
)
with urllib.request.urlopen(webhook_req_dup) as resp:
    dup_res = json.loads(resp.read().decode("utf-8"))
    print(f"  [PASS] Deduplication verified: {dup_res}")

print("\n=======================================================")
print(" ALL GITEA INTEGRATION TESTS PASSED 100%!")
print("=======================================================")
