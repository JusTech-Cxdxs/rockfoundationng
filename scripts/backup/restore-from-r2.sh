#!/usr/bin/env bash
# Restores a backup made by backup-to-r2.sh into a NEW, empty database: the
# restore drill (docs/RUNBOOKS.md §3) and, on a bad day, the way back.
#
#   scripts/backup/restore-from-r2.sh daily/2026-11-23.dump.enc
#
# Needs: RESTORE_DATABASE_URL (the new database; never the live one),
#   BACKUP_ENCRYPTION_KEY, and R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /
#   R2_SECRET_ACCESS_KEY / R2_BUCKET — or BACKUP_LOCAL_DIR for a local copy.
# Refuses a database that already has tables, and the live database itself
# (when BACKUP_DATABASE_URL is set and is the same). Prints counts, never data.
set -euo pipefail
KEY="${1:?Which backup? e.g. daily/2026-11-23.dump.enc}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is not set (a new, empty database)}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is not set}"
if [ -n "${BACKUP_DATABASE_URL:-}" ] && [ "$BACKUP_DATABASE_URL" = "$RESTORE_DATABASE_URL" ]; then echo "Refused: that is the live database. Restore into a new one." >&2; exit 2; fi
TABLES="$(psql "$RESTORE_DATABASE_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$TABLES" != "0" ]; then echo "Refused: the target database already has $TABLES tables. Restore into a new, empty one." >&2; exit 2; fi
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
if [ -n "${BACKUP_LOCAL_DIR:-}" ]; then
  cp "$BACKUP_LOCAL_DIR/$KEY" "$WORK/db.dump.enc"; cp "$BACKUP_LOCAL_DIR/$KEY.sha256" "$WORK/db.dump.enc.sha256"
else
  : "${R2_ACCOUNT_ID:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}" "${R2_BUCKET:?}"
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
  S3=(aws s3api --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com")
  "${S3[@]}" get-object --bucket "$R2_BUCKET" --key "$KEY" "$WORK/db.dump.enc" >/dev/null
  "${S3[@]}" get-object --bucket "$R2_BUCKET" --key "$KEY.sha256" "$WORK/db.dump.enc.sha256" >/dev/null
fi
if [ "$(sha256sum "$WORK/db.dump.enc" | cut -d' ' -f1)" != "$(cat "$WORK/db.dump.enc.sha256")" ]; then echo "The backup file does not match its checksum: not restored." >&2; exit 3; fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in "$WORK/db.dump.enc" -out "$WORK/db.dump"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_DATABASE_URL" "$WORK/db.dump"
echo "Restored $KEY: $(psql "$RESTORE_DATABASE_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'") tables; $(psql "$RESTORE_DATABASE_URL" -tAc 'select count(*) from job_cards') job cards, $(psql "$RESTORE_DATABASE_URL" -tAc 'select count(*) from customers') customers, $(psql "$RESTORE_DATABASE_URL" -tAc 'select count(*) from audit_logs') audit entries."
