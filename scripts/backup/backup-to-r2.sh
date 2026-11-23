#!/usr/bin/env bash
# Nightly backup of the PostgreSQL database to Cloudflare R2 (docs/DEPLOY.md, "Backups").
#
#   pg_dump (custom format, compressed) → encrypted with AES-256 (openssl, PBKDF2)
#   → uploaded to the R2 bucket as  daily/YYYY-MM-DD.dump.enc  (and, on the 1st
#   of the month, also  monthly/YYYY-MM.dump.enc) → copies past their keep-by
#   date removed: 30 days for daily copies, 365 for monthly ones.
#
# Needs (names only; the values live in the GitHub repository's secrets):
#   BACKUP_DATABASE_URL     the database's direct connection (not the pooler)
#   BACKUP_ENCRYPTION_KEY   a long passphrase, kept by the Owner offline too
#   R2_ACCOUNT_ID  R2_ACCESS_KEY_ID  R2_SECRET_ACCESS_KEY  R2_BUCKET
# Optional: BACKUP_DAILY_DAYS (30), BACKUP_MONTHLY_DAYS (365),
#   BACKUP_LOCAL_DIR: write to this folder instead of R2 (the local drill).
# Prints sizes and names, never a secret or a row of data.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is not set}"
if [ "${#BACKUP_ENCRYPTION_KEY}" -lt 24 ]; then echo "BACKUP_ENCRYPTION_KEY is too short (24 characters or more)." >&2; exit 2; fi
DAILY_DAYS="${BACKUP_DAILY_DAYS:-30}"
MONTHLY_DAYS="${BACKUP_MONTHLY_DAYS:-365}"
DAY="$(TZ=Africa/Lagos date +%F)"
MONTH="$(TZ=Africa/Lagos date +%Y-%m)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Dumping the database (custom format)…"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --dbname="$BACKUP_DATABASE_URL" --file="$WORK/db.dump"
echo "Dump: $(du -h "$WORK/db.dump" | cut -f1)"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_ENCRYPTION_KEY -in "$WORK/db.dump" -out "$WORK/db.dump.enc"
sha256sum "$WORK/db.dump.enc" | cut -d' ' -f1 > "$WORK/db.dump.enc.sha256"
rm -f "$WORK/db.dump"

DAILY_KEY="daily/$DAY.dump.enc"
MONTHLY_KEY="monthly/$MONTH.dump.enc"
FIRST_OF_MONTH=false; [ "$(TZ=Africa/Lagos date +%d)" = "01" ] && FIRST_OF_MONTH=true

if [ -n "${BACKUP_LOCAL_DIR:-}" ]; then
  mkdir -p "$BACKUP_LOCAL_DIR/daily" "$BACKUP_LOCAL_DIR/monthly"
  cp "$WORK/db.dump.enc" "$BACKUP_LOCAL_DIR/$DAILY_KEY"; cp "$WORK/db.dump.enc.sha256" "$BACKUP_LOCAL_DIR/$DAILY_KEY.sha256"
  if $FIRST_OF_MONTH; then cp "$WORK/db.dump.enc" "$BACKUP_LOCAL_DIR/$MONTHLY_KEY"; cp "$WORK/db.dump.enc.sha256" "$BACKUP_LOCAL_DIR/$MONTHLY_KEY.sha256"; fi
  find "$BACKUP_LOCAL_DIR/daily" -type f -mtime +"$DAILY_DAYS" -delete
  find "$BACKUP_LOCAL_DIR/monthly" -type f -mtime +"$MONTHLY_DAYS" -delete
  echo "Written locally: $DAILY_KEY ($(du -h "$BACKUP_LOCAL_DIR/$DAILY_KEY" | cut -f1))"
  exit 0
fi

: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}" "${R2_BUCKET:?R2_BUCKET is not set}"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
S3=(aws s3api --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com")
put() { "${S3[@]}" put-object --bucket "$R2_BUCKET" --key "$1" --body "$2" --checksum-algorithm SHA256 >/dev/null; }
put "$DAILY_KEY" "$WORK/db.dump.enc"; put "$DAILY_KEY.sha256" "$WORK/db.dump.enc.sha256"
if $FIRST_OF_MONTH; then put "$MONTHLY_KEY" "$WORK/db.dump.enc"; put "$MONTHLY_KEY.sha256" "$WORK/db.dump.enc.sha256"; fi
echo "Uploaded $DAILY_KEY$($FIRST_OF_MONTH && echo " and $MONTHLY_KEY")."

# Keep-by dates: anything older is removed (an R2 lifecycle rule on the bucket does the same as a second line).
prune() {
  local prefix="$1" days="$2" cutoff
  cutoff="$(date -u -d "-$days days" +%s)"
  "${S3[@]}" list-objects-v2 --bucket "$R2_BUCKET" --prefix "$prefix" --query 'Contents[].[Key,LastModified]' --output text 2>/dev/null | while read -r key modified; do
    [ -z "$key" ] || [ "$key" = "None" ] && continue
    if [ "$(date -u -d "$modified" +%s)" -lt "$cutoff" ]; then "${S3[@]}" delete-object --bucket "$R2_BUCKET" --key "$key" >/dev/null && echo "Removed $key (older than $days days)."; fi
  done
}
prune daily/ "$DAILY_DAYS"
prune monthly/ "$MONTHLY_DAYS"
