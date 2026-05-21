#!/bin/bash
# Backup WAHA sessions volume
BACKUP_DIR="/home/openclaw/backups/waha"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/waha_sessions_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

# Create backup from volume
sudo docker run --rm -v waha_sessions:/data -v "$BACKUP_DIR":/backup alpine tar czf "/backup/waha_sessions_$TIMESTAMP.tar.gz" -C /data .

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/waha_sessions_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm

echo "Backup created: $BACKUP_FILE"
