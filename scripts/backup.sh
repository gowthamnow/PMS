#!/bin/bash
# ==============================================================================
# Engineering PMS • Automated Git & Database Instant Backup
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

BACKUP_DIR="$PROJECT_ROOT/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
SNAPSHOT_FILE="$BACKUP_DIR/db_snapshot_${TIMESTAMP}.sql.gz"
LATEST_SNAPSHOT="$BACKUP_DIR/db_snapshot_latest.sql.gz"
ATTACHMENTS_ARCHIVE="$BACKUP_DIR/attachments_latest.tar.gz"

echo "=========================================================="
echo "📦 Engineering PMS • Instant Backup: $TIMESTAMP"
echo "=========================================================="

# 1. Backup PostgreSQL Database
echo "➡️ Step 1/3: Dumping PostgreSQL database..."
if docker ps | grep -q "engineering-pms-postgres-1"; then
    docker exec engineering-pms-postgres-1 pg_dump -U pms_user pms_db | gzip > "$SNAPSHOT_FILE"
    cp -f "$SNAPSHOT_FILE" "$LATEST_SNAPSHOT"
    echo "✅ Database dumped to: $SNAPSHOT_FILE ($(du -h "$SNAPSHOT_FILE" | cut -f1))"
else
    echo "⚠️ Warning: Postgres container not running, skipping database dump."
fi

# 2. Backup User Uploads / Attachments & Vault
echo "➡️ Step 2/3: Archiving attachments and vault storage..."
if [ -d "$PROJECT_ROOT/attachments" ]; then
    tar -czf "$ATTACHMENTS_ARCHIVE" -C "$PROJECT_ROOT" attachments/
    echo "✅ Attachments archived to: $ATTACHMENTS_ARCHIVE ($(du -h "$ATTACHMENTS_ARCHIVE" | cut -f1))"
fi

# 3. Git Checkpoint
echo "➡️ Step 3/3: Creating Git restore checkpoint..."
git add -A || true
COMMIT_MSG="backup: automated checkpoint ${TIMESTAMP}"
git commit -m "$COMMIT_MSG" || echo "Git worktree clean, nothing to commit."

echo ""
echo "=========================================================="
echo "🎉 Instant Backup Finished Successfully!"
echo "Restore Command:"
echo "  sudo ./scripts/restore.sh $SNAPSHOT_FILE"
echo "=========================================================="
