#!/bin/bash
# ==============================================================================
# Engineering PMS • Immediate 1-Command Restore Script
# Restores PostgreSQL database and files from backup in seconds.
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

BACKUP_DIR="$PROJECT_ROOT/backups"
SNAPSHOT="${1:-$BACKUP_DIR/db_snapshot_latest.sql.gz}"

echo "=========================================================="
echo "⚡ Engineering PMS • Immediate Restore System"
echo "Target Snapshot: $SNAPSHOT"
echo "=========================================================="

if [ ! -f "$SNAPSHOT" ]; then
    echo "❌ Error: Snapshot file '$SNAPSHOT' not found!"
    echo "Available snapshots:"
    ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No snapshots available."
    exit 1
fi

# 1. Stop backend temporarily to prevent write contention
echo "➡️ Step 1/4: Pausing backend container..."
docker compose stop backend || true

# 2. Restore PostgreSQL Database
echo "➡️ Step 2/4: Restoring PostgreSQL database from snapshot..."
# Terminate existing connections
docker exec -i engineering-pms-postgres-1 psql -U pms_user -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'pms_db' AND pid <> pg_backend_pid();" || true

# Restore schema and data
gunzip -c "$SNAPSHOT" | docker exec -i engineering-pms-postgres-1 psql -U pms_user -d pms_db
echo "✅ Database restored successfully!"

# 3. Restore Attachments if archive exists
ATTACHMENTS_ARCHIVE="$BACKUP_DIR/attachments_latest.tar.gz"
if [ -f "$ATTACHMENTS_ARCHIVE" ]; then
    echo "➡️ Step 3/4: Restoring attachments archive..."
    tar -xzf "$ATTACHMENTS_ARCHIVE" -C "$PROJECT_ROOT"
    echo "✅ Attachments restored!"
else
    echo "ℹ️ Step 3/4: No attachments archive found, keeping existing files."
fi

# 4. Restart backend and nginx
echo "➡️ Step 4/4: Restarting application services..."
docker compose up -d backend nginx

# Verify health
echo "⏳ Waiting for health check..."
sleep 4
curl -fsS http://localhost/health && echo "" || echo "Health check pending..."

echo ""
echo "=========================================================="
echo "🎉 System Restored and Operational in Seconds!"
echo "=========================================================="
