import urllib.request, urllib.parse, json

BASE_URL = 'http://localhost:8080/api'

def request_json(method, endpoint, data=None, token=None):
    url = f'{BASE_URL}{endpoint}'
    body = json.dumps(data).encode('utf-8') if data is not None else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode('utf-8')
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode('utf-8')
        try:
            return e.code, json.loads(content)
        except:
            return e.code, content

print('=== 1. Admin Authentication ===')
status, admin_login = request_json('POST', '/auth/login', {'username': 'admin', 'password': 'AdminEng2026#Secure'})
print(f'Admin Login Status: {status}')
assert status == 200, f'Admin login failed: {admin_login}'
admin_token = admin_login['access_token']

print('\n=== 2. Ensure Test Engineer Account Exists ===')
status, users = request_json('GET', '/users', token=admin_token)
user_list = users if isinstance(users, list) else users.get('items', [])
eng_user = next((u for u in user_list if u.get('role') == 'ENGINEER'), None)

if not eng_user:
    eng_payload = {
        'username': 'johndoe',
        'email': 'engineer@engineering.local',
        'full_name': 'John Doe',
        'password': 'Engineer2026#Secure',
        'role': 'ENGINEER'
    }
    status, eng_user = request_json('POST', '/users', eng_payload, token=admin_token)
    print(f'Created new engineer: {status}')
    eng_username = 'johndoe'
    eng_pass = 'Engineer2026#Secure'
    eng_id = eng_user['id']
else:
    eng_id = eng_user['id']
    eng_username = eng_user['username']
    eng_pass = 'Engineer2026#Secure'
    status, reset_res = request_json('POST', f'/users/{eng_id}/reset-password', {'new_password': eng_pass}, token=admin_token)
    print(f'Reset engineer ({eng_username}) password: {status}')

print(f'Engineer account ready: {eng_username} (ID: {eng_id})')

print('\n=== 3. Test Engineer Login & Dual-View Permissions ===')
status, eng_login = request_json('POST', '/auth/login', {'username': eng_username, 'password': eng_pass})
print(f'Engineer Login: {status}')
assert status == 200, f'Engineer login failed: {eng_login}'
eng_token = eng_login['access_token']

print('\n=== 4. Test RBAC: Non-Admin Project Creation MUST Fail (403) ===')
status, proj_attempt = request_json('POST', '/projects', {'name': 'Unauthorized Project', 'description': 'test'}, token=eng_token)
print(f'Engineer POST /projects: {status} (Expected 403 Forbidden)')
assert status == 403, f'Expected 403, got {status}'

print('\n=== 5. Test Teams/Workload: Engineer CAN view team workload (200) ===')
status, workload = request_json('GET', '/reports/team-workload', token=eng_token)
print(f'Engineer GET /reports/team-workload: {status}, returned {len(workload)} team members')
assert status == 200, f'Expected 200, got {status}'

print('\n=== 6. Assign Engineer to Project & Test Project Scoping ===')
status, admin_projects = request_json('GET', '/projects', token=admin_token)
proj_list = admin_projects if isinstance(admin_projects, list) else admin_projects.get('items', [])
assert len(proj_list) > 0, 'No projects exist'
target_proj = proj_list[0]
target_proj_id = target_proj['id']

# Add engineer to target project if not already a member
status, add_member_res = request_json('POST', f'/projects/{target_proj_id}/members', {
    'user_id': eng_id,
    'role': 'MEMBER'
}, token=admin_token)
print(f'Assign engineer to project {target_proj["name"]}: status {status}')

# Verify engineer sees this project
status, eng_projects = request_json('GET', '/projects', token=eng_token)
eng_proj_list = eng_projects if isinstance(eng_projects, list) else eng_projects.get('items', [])
print(f'Engineer projects count: {len(eng_proj_list)} (Assigned projects only)')
assert any(p['id'] == target_proj_id for p in eng_proj_list), 'Engineer should see assigned project'

print('\n=== 7. Test Task Git Push Linking (POST /api/tasks/{task_id}/git-ref) ===')
status, tasks = request_json('GET', f'/tasks?project_id={target_proj_id}', token=admin_token)
task_list = tasks if isinstance(tasks, list) else tasks.get('items', [])
assert len(task_list) > 0, 'No tasks in project'
test_task = task_list[0]
task_id = test_task['id']
task_num = test_task.get('task_number', '1')

status, git_link_res = request_json('POST', f'/tasks/{task_id}/git-ref', {
    'commit_sha': '8f1e0331b8b2f8',
    'branch': 'main',
    'message': 'Fix SPI bus timing and update hardware registers'
}, token=eng_token)
print(f'Link Git Ref to Task #{task_num} by Engineer: {status}, refs count: {len(git_link_res.get("git_refs", []))}')
assert status == 200, f'Git link failed: {git_link_res}'

print('\n=== 8. Test Morning Kickoff Reminder Broadcast ===')
status, morning_res = request_json('POST', '/tasks/trigger-morning-reminder', {}, token=admin_token)
print(f'POST /tasks/trigger-morning-reminder: {status}, result: {morning_res}')
assert status == 200, f'Morning reminder failed: {morning_res}'

print('\n=== 9. Test Evening Push & Wrap-Up Reminder Broadcast ===')
status, evening_res = request_json('POST', '/tasks/trigger-evening-reminder', {}, token=admin_token)
print(f'POST /tasks/trigger-evening-reminder: {status}, result: {evening_res}')
assert status == 200, f'Evening reminder failed: {evening_res}'

print('\n=== 10. Test Engineer Notifications Stream ===')
status, notifs = request_json('GET', '/notifications', token=eng_token)
notif_list = notifs if isinstance(notifs, list) else notifs.get('items', [])
print(f'GET /notifications for engineer: {status}, count: {len(notif_list)}')
assert status == 200, f'Fetch notifications failed: {notifs}'

print('\n=============================================================')
print('  ALL DUAL-VIEW, RBAC, GIT LINKING & REMINDER TESTS PASSED!  ')
print('=============================================================')
