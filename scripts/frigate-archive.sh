#!/usr/bin/env bash
set -euo pipefail
SSD_ROOT="/mnt/frigate-ssd"
HD_MOUNT="/mnt/hdexterno"
LOCK="/var/lock/frigate-storage.lock"
KEEP_SSD_DAYS="${KEEP_SSD_DAYS:-2}"
BWLIMIT="${BWLIMIT:-0}"
MAX_DAYS_PER_RUN="${MAX_DAYS_PER_RUN:-30}"
DRY_RUN="${DRY_RUN:-0}"
log(){ echo "$(date '+%F %T') [archive] $*"; }
exec 200>"$LOCK"
flock -n 200 || { log "Lock held, skipping"; exit 0; }
detect_media_src() {
  command -v docker >/dev/null 2>&1 || return 1
  local cid="$(docker ps -q --filter name=frigate 2>/dev/null | head -n1 || true)"
  [ -z "$cid" ] && return 1
  docker inspect "$cid" --format '{{range .Mounts}}{{if eq .Destination "/media/frigate"}}{{.Source}}{{end}}{{end}}' 2>/dev/null
}
MEDIA_SRC="$(detect_media_src || true)"
[ -z "$MEDIA_SRC" ] && MEDIA_SRC="$SSD_ROOT/frigate"
SRC_REC="$MEDIA_SRC/recordings"
REL=""; [[ "$MEDIA_SRC" == "$SSD_ROOT"* ]] && REL="${MEDIA_SRC#$SSD_ROOT}"
DEST_BASE="$HD_MOUNT$REL"
DEST_REC="$DEST_BASE/recordings"
mountpoint -q "$HD_MOUNT" || exit 0
mkdir -p "$DEST_REC" "$DEST_BASE"
touch "$DEST_BASE/.OK_TO_DELETE" 2>/dev/null || true
offset=$((KEEP_SSD_DAYS-1))
keep_from="$(date -d "-$offset day" +%F)"
mapfile -t days < <(find "$SRC_REC" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort)
for day in "${days[@]}"; do
  [[ "$day" < "$keep_from" ]] || continue
  if [ "$DRY_RUN" != "1" ]; then
    rsync -a --chown=1000:1000 "$SRC_REC/$day/" "$DEST_REC/$day/" && rm -rf "$SRC_REC/$day"
  fi
done
