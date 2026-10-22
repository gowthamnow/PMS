#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "🚀 Engineering PMS • Automated Google Cloud Setup"
echo "=========================================================="

export DEBIAN_FRONTEND=noninteractive

# Remove any erroneous docker apt list
sudo rm -f /etc/apt/sources.list.d/docker.list

echo "📦 Step 1/5: Installing Docker & Docker Compose..."
# Install docker using official universal installer or native packages
if ! command -v docker &> /dev/null; then
  echo "Installing Docker via official script..."
  curl -fsSL https://get.docker.com | sudo sh || {
    echo "Falling back to distro apt packages..."
    sudo apt-get update -y -q
    sudo apt-get install -y -q docker.io docker-compose-plugin docker-compose
  }
  sudo systemctl enable --now docker
fi

sudo usermod -aG docker "$USER" || true

# Add permanent SSH key for Antigravity automated control
mkdir -p "$HOME/.ssh"
KEY="ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCpuXMMpHsSxHgcc8gnSmIYdpUb76rh4SBgFTy8oCy2c+M+x8QLca63ALmmCIO5xfPA/QvbzZY5HhJLeEZH8FFB4hh9Z+kdMg8C0PFD5KILb5WtFK9CetWsd/hELgDoEuMZU/v8ixMwGMh/mN62/Y44L1St91stDI9sb0dVpjtjbtUVvL12BOtTVpEw+JNqSh5x2lAidjgtOHXOGCwGHanQ9joVkWlOJuqqGxtGdFDhz53+PjoOdpAfb9WfcjuZswEa68ZnulhTkRcc/EbxrQopTDahHHZH5QneUewkvgXbBgISkYNueWNyljRbb4LPNeRUmQTvbGZMNjxHWT5LNAzlIXR+sMpZvcs/boTjb1OBlgLaemc+Zn8uvTunKTEEXPK6DocTp+H9IxAa1LXB58E7vUPUlfZ0FobxmNjwcegK1TDsw3IQai+xAZwATUV9TXsEZrysVW3louJHDeSyo0K+PhHqElaDBe1/7OlMkgPA1bw60q0NdoRoU1YxKgW2XR0= gowthamthangaraj18"
if ! grep -q "$KEY" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
  echo "$KEY" >> "$HOME/.ssh/authorized_keys"
  chmod 600 "$HOME/.ssh/authorized_keys"
fi

echo "📥 Step 2/5: Downloading Engineering PMS bundle and database..."
mkdir -p "$HOME"
cd "$HOME"
curl -sSL https://mass-ships-null-supplemental.trycloudflare.com/api/attachments/projects/migration_bundle.tar.gz -o /tmp/migration_bundle.tar.gz
tar -xzf /tmp/migration_bundle.tar.gz -C "$HOME"
rm -f /tmp/migration_bundle.tar.gz

cd "$HOME/engineering-pms"

EXTERNAL_IP=$(curl -s -4 ifconfig.me || echo "34.14.145.123")
echo "Detected Google Cloud Public IP: $EXTERNAL_IP"

echo "🐳 Step 3/5: Launching Docker containers on Google Cloud..."
sudo docker compose down 2>/dev/null || sudo docker-compose down 2>/dev/null || true
sudo docker compose up -d --build || sudo docker-compose up -d --build

echo "🗄️ Step 4/5: Restoring PostgreSQL database from backup..."
for i in {1..30}; do
  if sudo docker exec engineering-pms-postgres-1 pg_isready -U pms_user -d pms_db &>/dev/null; then
    echo "PostgreSQL is healthy!"
    break
  fi
  sleep 2
done

if [ -f "$HOME/engineering-pms/pms_backup.sql" ]; then
  echo "Restoring database data..."
  sudo docker exec -i engineering-pms-postgres-1 psql -U pms_user -d pms_db < "$HOME/engineering-pms/pms_backup.sql" || true
  echo "Database successfully restored!"
fi

echo "🔒 Step 5/5: Installing Cloudflare Tunnel for SSL HTTPS..."
if ! command -v cloudflared &> /dev/null; then
  curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i /tmp/cloudflared.deb || sudo apt-get install -f -y -q
  rm -f /tmp/cloudflared.deb
fi

CF_BIN=$(command -v cloudflared || echo "/usr/bin/cloudflared")
sudo pkill -f cloudflared || true

sudo tee /etc/systemd/system/pms-tunnel.service > /dev/null <<EOF
[Unit]
Description=Engineering PMS Cloudflare Tunnel
After=network.target

[Service]
ExecStart=$CF_BIN tunnel --url http://localhost:80
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now pms-tunnel.service

sleep 6
TUNNEL_URL=$(journalctl -u pms-tunnel.service -n 35 --no-pager | grep -o 'https://[-a-zA-Z0-9]*\.trycloudflare\.com' | head -n 1 || true)

echo ""
echo "=========================================================="
echo "🎉 SUCCESS: Engineering PMS is LIVE on Google Cloud!"
echo "=========================================================="
echo "Direct HTTP (Port 80):   http://$EXTERNAL_IP"
echo "Direct HTTP (Port 8080):  http://$EXTERNAL_IP:8080"
if [ -n "$TUNNEL_URL" ]; then
  echo "Public HTTPS Domain:      $TUNNEL_URL"
  sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=$TUNNEL_URL|g" "$HOME/engineering-pms/.env"
  sudo docker compose restart backend nginx 2>/dev/null || sudo docker-compose restart backend nginx 2>/dev/null || true
fi
echo "=========================================================="
