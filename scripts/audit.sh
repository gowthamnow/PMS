#!/bin/bash
echo "====== OS / KERNEL ======"
uname -a
cat /etc/os-release | head -5

echo ""
echo "====== CPU ======"
nproc
grep -m1 'model name' /proc/cpuinfo

echo ""
echo "====== MEMORY ======"
free -m

echo ""
echo "====== DISK ======"
df -h

echo ""
echo "====== DOCKER CONTAINERS ======"
docker ps -a 2>/dev/null || echo "Docker unavailable without sudo"
sudo docker ps -a 2>/dev/null

echo ""
echo "====== DOCKER IMAGES ======"
sudo docker images 2>/dev/null

echo ""
echo "====== DOCKER VOLUMES ======"
sudo docker volume ls 2>/dev/null

echo ""
echo "====== LISTENING PORTS ======"
sudo ss -tlpn

echo ""
echo "====== HOME DIR ======"
ls -la /home/ubuntu

echo ""
echo "====== /opt DIR ======"
ls -la /opt 2>/dev/null

echo ""
echo "====== RUNNING SERVICES ======"
sudo systemctl list-units --type=service --state=running 2>/dev/null | head -30

echo ""
echo "====== GITEA CHECK ======"
which gitea 2>/dev/null || echo "Gitea binary not in PATH"
sudo docker ps -a 2>/dev/null | grep -i gitea || echo "No Gitea container found"
ls /opt/gitea 2>/dev/null || echo "No /opt/gitea directory"

echo ""
echo "====== POSTGRES CHECK ======"
sudo docker ps -a 2>/dev/null | grep -i postgres
which psql 2>/dev/null || echo "psql not in PATH"

echo ""
echo "====== NGINX / CADDY / CLOUDFLARE ======"
sudo systemctl status nginx 2>/dev/null | head -4 || echo "nginx not found"
sudo systemctl status cloudflared 2>/dev/null | head -4 || echo "cloudflared not found"
sudo docker ps -a 2>/dev/null | grep -iE 'nginx|caddy|cloud'

echo ""
echo "====== EXISTING PMS/AGENT DIRS ======"
ls -la /home/ubuntu/ 2>/dev/null
find /home/ubuntu -maxdepth 3 -name "docker-compose*" 2>/dev/null
find /opt -maxdepth 3 -name "docker-compose*" 2>/dev/null
