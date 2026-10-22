#!/bin/bash
set -e

PMS_DIR="/home/ubuntu/engineering-pms"

echo "[1/6] Creating directories..."
mkdir -p $PMS_DIR/{attachments,backups}
chmod 755 $PMS_DIR/attachments

echo "[2/6] Checking .env file..."
if [ ! -f $PMS_DIR/deploy/.env ]; then
  echo "ERROR: Missing $PMS_DIR/deploy/.env - copy from .env.template and fill values"
  exit 1
fi

echo "[3/6] Pulling/building images..."
cd $PMS_DIR/deploy
sudo docker compose pull postgres gitea nginx
sudo docker compose build --no-cache backend frontend

echo "[4/6] Starting database first..."
sudo docker compose up -d postgres
echo "Waiting for PostgreSQL to be ready..."
sleep 10

echo "[5/6] Starting all services..."
sudo docker compose up -d

echo "[6/6] Verifying deployment..."
sleep 15
curl -sf http://localhost:8080/health && echo "✅ Health check passed" || echo "❌ Health check failed"
sudo docker compose ps

echo "Done. PMS available at http://16.16.124.247:8080"
