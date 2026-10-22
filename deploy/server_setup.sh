#!/bin/bash
set -e

echo "=========================================="
echo "Engineering PMS - Server Setup Script"
echo "=========================================="

PMS_DIR="/home/ubuntu/engineering-pms"

# 1. Install Docker & Docker Compose if not present
echo "[1/5] Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker and Docker Compose plugin..."
    export DEBIAN_FRONTEND=noninteractive
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl gnupg lsb-release

    # Install Docker using official install script
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sudo sh /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh

    # If /data has more disk space, use /data/docker as data-root to avoid filling root partition
    if [ -d "/data" ] && [ ! -f /etc/docker/daemon.json ]; then
        echo "Configuring Docker data-root to /data/docker..."
        sudo mkdir -p /data/docker
        cat << 'EOF' | sudo tee /etc/docker/daemon.json
{
  "data-root": "/data/docker",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "3"
  }
}
EOF
    fi

    sudo systemctl daemon-reload || true
    sudo systemctl enable docker
    sudo systemctl restart docker
    sudo usermod -aG docker ubuntu
    echo "✅ Docker installed successfully."
else
    echo "✅ Docker is already installed: $(docker --version)"
fi

# Ensure docker compose plugin is available
if ! docker compose version &> /dev/null; then
    echo "Installing docker-compose-plugin..."
    sudo apt-get update -y
    sudo apt-get install -y docker-compose-plugin docker-compose-v2
fi
echo "Docker compose version: $(docker compose version 2>/dev/null || sudo docker compose version)"

# 2. Create directory structure
echo "[2/5] Creating directory structure at $PMS_DIR..."
sudo mkdir -p $PMS_DIR/{deploy,attachments,backups}
sudo mkdir -p $PMS_DIR/deploy/nginx

# 3. Copy files from /tmp/pms_deploy if present
echo "[3/5] Syncing deployment files..."
if [ -d "/tmp/pms_deploy" ]; then
    echo "Copying files from /tmp/pms_deploy..."
    shopt -s dotglob
    sudo cp -rf /tmp/pms_deploy/* $PMS_DIR/
    sudo cp -rf /tmp/pms_deploy/* $PMS_DIR/deploy/
    shopt -u dotglob
fi

# 4. Set permissions
echo "[4/5] Setting file and directory permissions..."
sudo chmod +x $PMS_DIR/*.sh 2>/dev/null || true
sudo chmod +x $PMS_DIR/deploy/*.sh 2>/dev/null || true
sudo chmod 755 $PMS_DIR/attachments
sudo chmod -R 755 $PMS_DIR/nginx $PMS_DIR/deploy/nginx 2>/dev/null || true
sudo chown -R ubuntu:ubuntu $PMS_DIR

# 5. Summary
echo "[5/5] Verification and Summary..."
echo "--- Docker status ---"
sudo docker info | grep -E 'Server Version|Storage Driver|Docker Root Dir' || true
echo "--- PMS Directory Contents ---"
ls -la $PMS_DIR
ls -la $PMS_DIR/deploy
echo "=========================================="
echo "✅ Server setup completed successfully!"
echo "=========================================="
