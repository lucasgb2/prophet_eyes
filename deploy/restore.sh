#!/usr/bin/env bash
# Restaura um backup, SUBSTITUINDO o banco atual. Rode na raiz do projeto:
#   deploy/restore.sh backups/prophet-AAAAMMDD-HHMMSS.dump
set -euo pipefail
cd "$(dirname "$0")/.."

[ $# -eq 1 ] && [ -f "$1" ] || { echo "uso: deploy/restore.sh backups/prophet-....dump"; ls -1 backups/*.dump 2>/dev/null; exit 1; }
name=$(basename "$1")
[ -f "backups/$name" ] || { echo "o arquivo precisa estar na pasta backups/"; exit 1; }

echo "Isto APAGA o banco atual e coloca no lugar o conteúdo de $name."
read -rp "Digite restaurar para continuar: " answer
[ "$answer" = restaurar ] || { echo "cancelado"; exit 1; }

docker compose up -d db backup
echo "Guardando uma cópia do banco atual antes de trocar…"
docker compose exec -T backup bash /backup.sh now
[ -f "backups/$name" ] || { echo "$name foi podado pela rotação; copie-o de volta com outro nome e repita"; exit 1; }
docker compose stop web worker watchdog backup

sql() { docker compose exec -T db psql -v ON_ERROR_STOP=1 -U prophet -d "$1" -qc "$2"; }
sql postgres "DROP DATABASE IF EXISTS prophet_restore"
sql postgres "CREATE DATABASE prophet_restore"
sql prophet_restore "CREATE EXTENSION IF NOT EXISTS timescaledb"
sql prophet_restore "SELECT timescaledb_pre_restore()"
# restaura num banco novo: se falhar no meio, o atual continua intacto
docker compose run --rm -T --no-deps --entrypoint pg_restore backup --exit-on-error --no-owner -d prophet_restore "/backups/$name"
sql prophet_restore "SELECT timescaledb_post_restore()"

sql postgres "DROP DATABASE prophet WITH (FORCE)"
sql postgres "ALTER DATABASE prophet_restore RENAME TO prophet"
docker compose up -d
echo "Restaurado de $name."
