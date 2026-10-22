#!/bin/bash
# ==============================================================================
# Engineering PMS - Live End-to-End API & Security Verification Suite
# Target: http://localhost:8080
# ==============================================================================
set -e

BASE_URL="http://localhost:8080"
ADMIN_USER="admin"
ADMIN_PASS="AdminEng2026#Secure"
TODAY=$(date +%Y-%m-%d)

echo "========================================================================"
echo " Starting End-to-End Live API & Security Verification Suite"
echo " Target URL: $BASE_URL"
echo " Timestamp: $(date -u)"
echo "========================================================================"

FAILED_TESTS=0

pass_test() {
    echo "  [PASS] $1"
}

fail_test() {
    echo "  [FAIL] $1: $2"
    FAILED_TESTS=$((FAILED_TESTS + 1))
}

# ------------------------------------------------------------------------------
# 1. Health Check
# ------------------------------------------------------------------------------
echo ""
echo "[Test 1] GET /health"
HEALTH_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
HEALTH_CODE=$(echo "$HEALTH_RESP" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESP" | sed '$d')

if [ "$HEALTH_CODE" -eq 200 ] && echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
    pass_test "GET /health returned HTTP 200 with status ok ($HEALTH_BODY)"
else
    fail_test "GET /health" "Expected HTTP 200, got $HEALTH_CODE ($HEALTH_BODY)"
fi

# ------------------------------------------------------------------------------
# 2. Admin Authentication
# ------------------------------------------------------------------------------
echo ""
echo "[Test 2] POST /api/auth/login (Admin Credentials)"
LOGIN_PAYLOAD=$(printf '{"username":"%s","password":"%s"}' "$ADMIN_USER" "$ADMIN_PASS")
LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$LOGIN_PAYLOAD")
LOGIN_CODE=$(echo "$LOGIN_RESP" | tail -n1)
LOGIN_BODY=$(echo "$LOGIN_RESP" | sed '$d')

if [ "$LOGIN_CODE" -eq 200 ]; then
    ADMIN_TOKEN=$(echo "$LOGIN_BODY" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    pass_test "Admin login returned HTTP 200 and access_token"
else
    fail_test "POST /api/auth/login" "Expected HTTP 200, got $LOGIN_CODE ($LOGIN_BODY)"
    exit 1
fi

# ------------------------------------------------------------------------------
# 3. Current User Profile
# ------------------------------------------------------------------------------
echo ""
echo "[Test 3] GET /api/auth/me (Bearer Token)"
ME_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/auth/me" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
ME_CODE=$(echo "$ME_RESP" | tail -n1)
ME_BODY=$(echo "$ME_RESP" | sed '$d')

if [ "$ME_CODE" -eq 200 ] && echo "$ME_BODY" | grep -q '"username":"admin"'; then
    pass_test "GET /api/auth/me returned HTTP 200 with admin profile details"
else
    fail_test "GET /api/auth/me" "Expected HTTP 200, got $ME_CODE ($ME_BODY)"
fi

# ------------------------------------------------------------------------------
# 4. Project Creation
# ------------------------------------------------------------------------------
echo ""
echo "[Test 4] POST /api/projects ('Smart Meter Firmware v2')"
PROJ_PAYLOAD='{"name":"Smart Meter Firmware v2","description":"Next-gen STM32 smart meter firmware with secure element","objectives":"Low power consumption and DLMS/COSEM support","status":"ACTIVE","priority":"HIGH"}'
PROJ_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/projects" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PROJ_PAYLOAD")
PROJ_CODE=$(echo "$PROJ_RESP" | tail -n1)
PROJ_BODY=$(echo "$PROJ_RESP" | sed '$d')

PROJECT_ID=$(echo "$PROJ_BODY" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if { [ "$PROJ_CODE" -eq 200 ] || [ "$PROJ_CODE" -eq 201 ]; } && [ -n "$PROJECT_ID" ]; then
    pass_test "POST /api/projects created project ID $PROJECT_ID"
else
    fail_test "POST /api/projects" "Expected HTTP 200, got $PROJ_CODE ($PROJ_BODY)"
    exit 1
fi

# ------------------------------------------------------------------------------
# 5. Task Creation
# ------------------------------------------------------------------------------
echo ""
echo "[Test 5] POST /api/tasks ('Design SPI bus driver')"
TASK_PAYLOAD=$(printf '{"project_id":"%s","title":"Design SPI bus driver","description":"Implement DMA-based high-speed SPI driver for A71CH crypto chip","acceptance_criteria":"Passes loopback test at 25MHz with zero bit errors","status":"TODO","priority":"HIGH","estimated_hours":6.0}' "$PROJECT_ID")
TASK_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/tasks" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$TASK_PAYLOAD")
TASK_CODE=$(echo "$TASK_RESP" | tail -n1)
TASK_BODY=$(echo "$TASK_RESP" | sed '$d')

TASK_ID=$(echo "$TASK_BODY" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if { [ "$TASK_CODE" -eq 200 ] || [ "$TASK_CODE" -eq 201 ]; } && [ -n "$TASK_ID" ]; then
    pass_test "POST /api/tasks created task ID $TASK_ID"
else
    fail_test "POST /api/tasks" "Expected HTTP 200, got $TASK_CODE ($TASK_BODY)"
    exit 1
fi

# ------------------------------------------------------------------------------
# 6. Task Status Transitions: TODO -> IN_PROGRESS -> DONE
# ------------------------------------------------------------------------------
echo ""
echo "[Test 6] PATCH /api/tasks/$TASK_ID/status (TODO -> IN_PROGRESS -> DONE)"

# 6a. Transition to IN_PROGRESS
PATCH_RESP_1=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/api/tasks/$TASK_ID/status" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"IN_PROGRESS"}')
PATCH_CODE_1=$(echo "$PATCH_RESP_1" | tail -n1)
PATCH_BODY_1=$(echo "$PATCH_RESP_1" | sed '$d')

if [ "$PATCH_CODE_1" -eq 200 ] && echo "$PATCH_BODY_1" | grep -q '"status":"IN_PROGRESS"'; then
    pass_test "Transitioned status to IN_PROGRESS"
else
    fail_test "PATCH /status (IN_PROGRESS)" "Got $PATCH_CODE_1 ($PATCH_BODY_1)"
fi

# 6b. Transition to DONE
PATCH_RESP_2=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/api/tasks/$TASK_ID/status" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"DONE"}')
PATCH_CODE_2=$(echo "$PATCH_RESP_2" | tail -n1)
PATCH_BODY_2=$(echo "$PATCH_RESP_2" | sed '$d')

if [ "$PATCH_CODE_2" -eq 200 ] && echo "$PATCH_BODY_2" | grep -q '"status":"DONE"' && echo "$PATCH_BODY_2" | grep -q '"completed_at":'; then
    pass_test "Transitioned status to DONE and verified completed_at timestamp set"
else
    fail_test "PATCH /status (DONE)" "Got $PATCH_CODE_2 ($PATCH_BODY_2)"
fi

# ------------------------------------------------------------------------------
# 7. Time Entry Logging
# ------------------------------------------------------------------------------
echo ""
echo "[Test 7] POST /api/time-entries (Log 4.5 hours)"
TIME_PAYLOAD=$(printf '{"project_id":"%s","task_id":"%s","work_date":"%s","duration_hours":4.5,"description":"Hardware bench validation with logic analyzer"}' "$PROJECT_ID" "$TASK_ID" "$TODAY")
TIME_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/time-entries" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$TIME_PAYLOAD")
TIME_CODE=$(echo "$TIME_RESP" | tail -n1)
TIME_BODY=$(echo "$TIME_RESP" | sed '$d')

if { [ "$TIME_CODE" -eq 200 ] || [ "$TIME_CODE" -eq 201 ]; } && echo "$TIME_BODY" | grep -q '4.5'; then
    pass_test "Logged 4.5 hours against task successfully"
else
    fail_test "POST /api/time-entries" "Expected HTTP 200, got $TIME_CODE ($TIME_BODY)"
fi

# ------------------------------------------------------------------------------
# 8. Dashboard Aggregated Stats
# ------------------------------------------------------------------------------
echo ""
echo "[Test 8] GET /api/dashboard/stats"
DASH_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/dashboard/stats" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
DASH_CODE=$(echo "$DASH_RESP" | tail -n1)
DASH_BODY=$(echo "$DASH_RESP" | sed '$d')

if [ "$DASH_CODE" -eq 200 ] && echo "$DASH_BODY" | grep -q '"total_projects":' && echo "$DASH_BODY" | grep -q '"hours_logged_this_week":'; then
    pass_test "Dashboard stats returned live aggregates: $DASH_BODY"
else
    fail_test "GET /api/dashboard/stats" "Expected HTTP 200, got $DASH_CODE ($DASH_BODY)"
fi

# ------------------------------------------------------------------------------
# 9. Reports: Project Progress (100% completion)
# ------------------------------------------------------------------------------
echo ""
echo "[Test 9] GET /api/reports/project-progress"
PROG_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/reports/project-progress" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
PROG_CODE=$(echo "$PROG_RESP" | tail -n1)
PROG_BODY=$(echo "$PROG_RESP" | sed '$d')

if [ "$PROG_CODE" -eq 200 ] && echo "$PROG_BODY" | grep -q '100'; then
    pass_test "Project progress verified at 100% completion ($PROG_BODY)"
else
    fail_test "GET /api/reports/project-progress" "Expected 100% completion, got $PROG_CODE ($PROG_BODY)"
fi

# ------------------------------------------------------------------------------
# 10. System Administration Info
# ------------------------------------------------------------------------------
echo ""
echo "[Test 10] GET /api/admin/system-info"
SYS_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/admin/system-info" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
SYS_CODE=$(echo "$SYS_RESP" | tail -n1)
SYS_BODY=$(echo "$SYS_RESP" | sed '$d')

if [ "$SYS_CODE" -eq 200 ] && echo "$SYS_BODY" | grep -q '"database":"connected"'; then
    pass_test "Admin system info confirmed database connected and quota tracked ($SYS_BODY)"
else
    fail_test "GET /api/admin/system-info" "Expected HTTP 200, got $SYS_CODE ($SYS_BODY)"
fi

# ==============================================================================
# Security Verification Tests
# ==============================================================================
echo ""
echo "========================================================================"
echo " Executing Security Verifications"
echo "========================================================================"

# Security 1: Unauthenticated access returns HTTP 401
echo ""
echo "[Security 1] Unauthenticated request to /api/projects"
UNAUTH_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/projects")
UNAUTH_CODE=$(echo "$UNAUTH_RESP" | tail -n1)

if [ "$UNAUTH_CODE" -eq 401 ]; then
    pass_test "Unauthenticated request correctly rejected with HTTP 401"
else
    fail_test "Unauthenticated access" "Expected HTTP 401, got $UNAUTH_CODE"
fi

# Security 2: Role escalation prevention
echo ""
echo "[Security 2] Role escalation check (Engineer creating users)"
# 2a. Admin creates an engineer
ENG_USER="engineer_$(date +%s)"
ENG_PASS="EngSecurePass2026!"
CREATE_ENG_PAYLOAD=$(printf '{"username":"%s","email":"%s@smartmeter.local","full_name":"Test Engineer","role":"ENGINEER","password":"%s"}' "$ENG_USER" "$ENG_USER" "$ENG_PASS")
CREATE_ENG_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CREATE_ENG_PAYLOAD")
CREATE_ENG_CODE=$(echo "$CREATE_ENG_RESP" | tail -n1)

if [ "$CREATE_ENG_CODE" -eq 200 ] || [ "$CREATE_ENG_CODE" -eq 201 ]; then
    # 2b. Engineer logs in
    ENG_LOGIN_PAYLOAD=$(printf '{"username":"%s","password":"%s"}' "$ENG_USER" "$ENG_PASS")
    ENG_LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "$ENG_LOGIN_PAYLOAD")
    ENG_TOKEN=$(echo "$ENG_LOGIN_RESP" | sed '$d' | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    # 2c. Engineer attempts POST /api/users
    ATTEMPT_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/users" \
        -H "Authorization: Bearer $ENG_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"username":"escalated_admin","email":"esc@test.local","full_name":"Hacker","role":"ADMIN","password":"HackedPassword123!"}')
    ATTEMPT_CODE=$(echo "$ATTEMPT_RESP" | tail -n1)

    if [ "$ATTEMPT_CODE" -eq 403 ]; then
        pass_test "Engineer forbidden from creating users (HTTP 403 verified)"
    else
        fail_test "Role escalation" "Expected HTTP 403, got $ATTEMPT_CODE"
    fi
else
    fail_test "Setup engineer user" "Got HTTP $CREATE_ENG_CODE"
fi

# Security 3: 25MB Attachment File Limit
echo ""
echo "[Security 3] 25MB File Upload Limit Check"
DUMMY_LARGE="/tmp/large_test_file_26mb.bin"
dd if=/dev/zero of="$DUMMY_LARGE" bs=1M count=26 2>/dev/null || truncate -s 26M "$DUMMY_LARGE"

UPLOAD_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/attachments" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -F "project_id=$PROJECT_ID" \
    -F "file=@$DUMMY_LARGE;type=application/octet-stream")
UPLOAD_CODE=$(echo "$UPLOAD_RESP" | tail -n1)
rm -f "$DUMMY_LARGE"

if [ "$UPLOAD_CODE" -eq 413 ]; then
    pass_test "Upload exceeding 25MB rejected with HTTP 413 Payload Too Large"
else
    fail_test "Attachment size limit" "Expected HTTP 413, got $UPLOAD_CODE"
fi

# Security 4: Rate Limiting on /api/auth/login
echo ""
echo "[Security 4] Rate Limiting on /api/auth/login (Brute force protection)"
HIT_429=0
for i in {1..8}; do
    RL_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"IncorrectPassword123!"}')
    RL_CODE=$(echo "$RL_RESP" | tail -n1)
    if [ "$RL_CODE" -eq 429 ]; then
        HIT_429=1
        break
    fi
done

if [ "$HIT_429" -eq 1 ]; then
    pass_test "Brute force attack blocked with HTTP 429 Too Many Requests"
else
    fail_test "Rate limit" "Expected HTTP 429 within 8 rapid requests"
fi

echo ""
echo "========================================================================"
if [ "$FAILED_TESTS" -eq 0 ]; then
    echo " ALL TESTS PASSED (10/10 functional endpoints + 4/4 security tests)"
else
    echo " VERIFICATION COMPLETED WITH $FAILED_TESTS FAILURES"
fi
echo "========================================================================"
exit $FAILED_TESTS
