#!/bin/bash
BACKUP_DIR="/home/ubuntu/engineering-pms/backups"
DATE=$(date +%Y%m%d_%H%M%S)
cd /home/ubuntu/engineering-pms/deploy
sudo docker compose exec -T postgres pg_dump -U pms_user pms_db | gzip > $BACKUP_DIR/pms_db_$DATE.sql.gz
find $BACKUP_DIR -name '*.sql.gz' -mtime +30 -delete
echo "Backup saved: pms_db_$DATE.sql.gz"
