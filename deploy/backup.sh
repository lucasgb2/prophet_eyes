#!/usr/bin/env bash
# Backup diário do banco. Roda no serviço `backup` do Compose.
#   backup.sh        laço: faz uma cópia sempre que a mais recente tiver mais de 24 h
#   backup.sh now    faz uma cópia agora e sai
set -uo pipefail

DIR=${BACKUP_DIR:-/backups}
KEEP=${BACKUP_KEEP:-14}
[[ $KEEP =~ ^[1-9][0-9]*$ ]] || KEEP=14
umask 077

log() { echo "$(date -u +%FT%TZ) backup: $*"; }

# Marca no banco que deu certo, para o vigia perceber quando os backups param
beat() {
  psql -qc "CREATE TABLE IF NOT EXISTS heartbeats (name TEXT PRIMARY KEY, ok_at TIMESTAMPTZ, detail TEXT, alerted_at TIMESTAMPTZ);
            INSERT INTO heartbeats(name,ok_at,detail) VALUES ('backup',now(),'$1')
            ON CONFLICT (name) DO UPDATE SET ok_at=now(), detail=EXCLUDED.detail" >/dev/null 2>&1 || true
}

dump() {
  local file="$DIR/prophet-$(date -u +%Y%m%d-%H%M%S).dump" part
  part="$file.partial"
  rm -f "$DIR"/*.partial
  # só ganha o nome final se o pg_dump terminar bem e o arquivo puder ser lido de volta
  if ! pg_dump --format=custom --file="$part" || ! pg_restore --list "$part" >/dev/null; then
    rm -f "$part"; log "FALHOU"; return 1
  fi
  mv "$part" "$file"
  chown "$(stat -c %u:%g "$DIR")" "$file" 2>/dev/null || true   # quem é dono da pasta consegue copiar o arquivo
  log "ok $(basename "$file") ($(du -h "$file" | cut -f1))"
  # poda por quantidade, nunca por idade: se os backups falharem, os antigos continuam lá
  ls -1 "$DIR"/prophet-*.dump | sort -r | tail -n +$((KEEP + 1)) | xargs -r rm -f
  beat "$(basename "$file")"
}

recent() { [ -n "$(find "$DIR" -maxdepth 1 -name 'prophet-*.dump' -mmin -1440 | head -1)" ]; }

until pg_isready -q; do sleep 5; done
if [ "${1:-}" = now ]; then dump; exit; fi
while true; do
  recent || dump
  sleep 600
done
