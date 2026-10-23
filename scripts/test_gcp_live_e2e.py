import requests

BASE_URL = 'http://localhost'

login_res = requests.post(f'{BASE_URL}/api/auth/login', json={'username': 'admin', 'password': 'AdminEng2026#Secure'})
if login_res.status_code != 200:
    print('Login failed:', login_res.status_code, login_res.text)
    exit(1)

token = login_res.json()['access_token']
headers = {'Authorization': f'Bearer {token}'}
print('✅ Admin Login successful!')

ai_cfg = requests.get(f'{BASE_URL}/api/ai/config', headers=headers)
print('✅ AI Config Status:', ai_cfg.status_code, ai_cfg.json())

proj_res = requests.get(f'{BASE_URL}/api/projects/', headers=headers)
proj_data = proj_res.json()
projects = proj_data if isinstance(proj_data, list) else proj_data.get('items', [])
print(f'✅ Fetched {len(projects)} projects')

for p in projects:
    print(f"  Project: '{p.get('name')}' (id={p.get('id')})")

pms_proj = next((p for p in projects if p.get('name', '').strip() == 'PMS'), None)
if pms_proj:
    pms_id = pms_proj['id']
    print(f'✅ Found PMS Project ID: {pms_id}')
    
    folders_res = requests.get(f'{BASE_URL}/api/projects/{pms_id}/folders', headers=headers)
    folder_names = [f['name'] for f in folders_res.json()]
    print(f'✅ Vault Folders ({folders_res.status_code}): {folder_names}')

    tasks_res = requests.get(f'{BASE_URL}/api/tasks/?project_id={pms_id}', headers=headers)
    tasks_data = tasks_res.json()
    tasks = tasks_data if isinstance(tasks_data, list) else tasks_data.get('items', [])
    print(f'✅ PMS Tasks count: {len(tasks)}')
    for t in tasks:
        print(f"  - [{t.get('task_code')}] {t.get('title')}")
        
    for t in tasks:
        title = t.get('title')
        print(f"\n🤖 Running AI Auto-Resolver on Task: {title}...")
        solve_res = requests.post(
            f"{BASE_URL}/api/ai/solve-task/{t['id']}?auto_post_comment=true",
            headers=headers
        )
        print(f"  Status: {solve_res.status_code}")
        if solve_res.status_code == 200:
            sol = solve_res.json()
            print("  Model used:", sol.get('model_used'))
            print("  Confidence:", sol.get('confidence_score'))
            print("  Root Cause:", sol.get('root_cause')[:90], "...")
            print("  Action steps:", len(sol.get('action_plan', [])))
            print("  Patches proposed:", len(sol.get('code_patches', [])))
            print("  Comment auto-posted:", sol.get('comment_posted'))
        else:
            print("  Error:", solve_res.text)

    # Test File Vault Upload & Listing
    print(f"\n📁 Testing File Vault Upload into 'Datasheets' folder...")
    import io
    ds_folder = next((f for f in folders_res.json() if f.get('name') == 'Datasheets'), None)
    if ds_folder:
        test_file = io.BytesIO(b"STM32F407 Microcontroller Hardware Specification & Pinout")
        up_res = requests.post(
            f"{BASE_URL}/api/projects/{pms_id}/vault-files",
            headers=headers,
            files={'file': ('stm32f407_datasheet.txt', test_file, 'text/plain')},
            data={'folder_id': ds_folder['id'], 'category': 'Datasheets', 'description': 'Main Controller Pinout'}
        )
        print("  Upload Status:", up_res.status_code)
        if up_res.status_code == 201:
            up_data = up_res.json()
            print(f"  Uploaded file: {up_data.get('filename')} (ID: {up_data.get('id')})")
        
        # Verify folder listing
        flist_res = requests.get(f"{BASE_URL}/api/projects/{pms_id}/vault-files?folder_id={ds_folder['id']}", headers=headers)
        if flist_res.status_code == 200:
            print(f"  Files in Datasheets folder: {[f.get('filename') for f in flist_res.json()]}")

    # Test Project Copilot
    print(f"\n🧠 Testing AI Project Copilot on PMS...")
    copilot_res = requests.post(
        f"{BASE_URL}/api/ai/project-copilot/{pms_id}",
        json={'problem_description': 'How do we optimize database queries and handle vault attachments securely?'},
        headers=headers
    )
    print(f"  Copilot Status: {copilot_res.status_code}")
    if copilot_res.status_code == 200:
        c_data = copilot_res.json()
        print("  Copilot Analysis:", c_data.get('analysis', '')[:100], "...")
        print("  Recommended Solutions:", len(c_data.get('recommended_solutions', [])))
        print("  Suggested Tasks:", len(c_data.get('suggested_tasks', [])))
    else:
        print("  Copilot Error:", copilot_res.text)

backup_status = requests.get(f'{BASE_URL}/api/backup/status', headers=headers)
print('\n📦 Backup Status API:', backup_status.status_code, backup_status.text[:200])

# Test Instant Backup
print('\n💾 Triggering instant PostgreSQL snapshot...')
snap_res = requests.post(f'{BASE_URL}/api/backup/create', headers=headers)
print('  Snapshot response:', snap_res.status_code, snap_res.json())
