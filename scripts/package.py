import os
import shutil
import subprocess

base_dir = r"C:\Users\SUBASRI\.gemini\antigravity\scratch\engineering-pms"
staging_dir = os.path.join(base_dir, "staging")

if os.path.exists(staging_dir):
    shutil.rmtree(staging_dir)

os.makedirs(os.path.join(staging_dir, "frontend"), exist_ok=True)
os.makedirs(os.path.join(staging_dir, "backend"), exist_ok=True)

# Copy frontend prebuilt assets
shutil.copytree(os.path.join(base_dir, "frontend", "dist"), os.path.join(staging_dir, "frontend", "dist"))
shutil.copy2(os.path.join(base_dir, "frontend", "Dockerfile"), os.path.join(staging_dir, "frontend", "Dockerfile"))
shutil.copy2(os.path.join(base_dir, "frontend", "nginx.conf"), os.path.join(staging_dir, "frontend", "nginx.conf"))

# Copy backend
def ignore_patterns(path, names):
    return [n for n in names if n in ('__pycache__', '.pytest_cache', '.venv', 'venv')]

shutil.copytree(os.path.join(base_dir, "backend"), os.path.join(staging_dir, "backend"), ignore=ignore_patterns, dirs_exist_ok=True)

print(f"Staged cleanly to {staging_dir}")

# Create tarball for fast single-file SCP
tar_path = os.path.join(base_dir, "pms_app.tar.gz")
if os.path.exists(tar_path):
    os.remove(tar_path)

shutil.make_archive(os.path.join(base_dir, "pms_app"), 'gztar', staging_dir)
print(f"Archive created at {tar_path}, size: {os.path.getsize(tar_path)/1024:.1f} KB")
