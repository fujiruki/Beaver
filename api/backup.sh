#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="$DIR/database.sqlite"
BACKUP_DIR="$DIR/backups"
LOG="$DIR/backup.log"

mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d_%H%M)
DEST="$BACKUP_DIR/database_${TS}.sqlite"

if cp "$DB" "$DEST"; then
    SIZE=$(stat -c%s "$DEST" 2>/dev/null || wc -c < "$DEST")
    echo "[$(date '+%a %b %e %H:%M:%S %Z %Y')] backup OK: $(basename "$DEST") (size=$SIZE)" >> "$LOG"
else
    echo "[$(date '+%a %b %e %H:%M:%S %Z %Y')] backup FAILED" >> "$LOG"
fi

# 30日ローテーション（自動生成分のみが対象。手動退避したファイル名(_pre_xxx等)は対象外）
find "$BACKUP_DIR" -maxdepth 1 -name 'database_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_[0-9][0-9][0-9][0-9].sqlite' -mtime +30 -delete
