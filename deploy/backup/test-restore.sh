#!/usr/bin/env bash
#
# Проверка бэкапа восстановлением "по-настоящему", а не просто "файл есть".
# Расшифровывает указанную (или последнюю локальную) копию в одноразовую
# базу, сравнивает количество строк в каждой таблице с живой БД и сразу
# удаляет одноразовую базу. Ничего в проде не трогает.
#
# Правило, под которое это написано: бэкап, который никогда не
# восстанавливали — это не бэкап.
#
# Использование:
#   deploy/backup/test-restore.sh [файл.dump.age]
# Без аргумента — берёт самую свежую локальную копию из BACKUP_DIR.
#
# Удобно повесить на отдельный cron (раз в неделю/месяц) — см.
# crontab.example. При расхождении шлёт тот же Telegram-алерт, что и
# backup.sh при падении самого бэкапа.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет файла ${ENV_FILE} — скопируйте .env.example и заполните." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

notify_failure() {
  local reason="$1"
  log "ПРОВЕРКА БЭКАПА ПРОВАЛЕНА: ${reason}"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_ADMIN_CHAT_ID:-}" ]]; then
    local host_name text
    host_name="$(hostname)"
    text="🔴 Тестовое восстановление бэкапа Luna-Sklad провалено%0A${reason}%0AСервер: ${host_name}"
    curl -fsS --max-time 10 \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_ADMIN_CHAT_ID}" \
      -d "text=${text}" >/dev/null || true
  fi
}

SOURCE="${1:-}"
if [[ -z "$SOURCE" ]]; then
  SOURCE="$(find "$BACKUP_DIR" -maxdepth 1 -name 'luna-*.dump.age' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -n1 | cut -d' ' -f2-)"
  if [[ -z "$SOURCE" ]]; then
    notify_failure "нет ни одной локальной копии в ${BACKUP_DIR} для проверки"
    exit 1
  fi
  log "Беру самую свежую локальную копию: ${SOURCE}"
fi

if [[ ! -f "$SOURCE" ]]; then
  notify_failure "файл ${SOURCE} не найден"
  exit 1
fi

TEST_DB="luna_test_restore_$(date -u +%Y%m%d%H%M%S)"
DUMP_FILE="$(mktemp)"

cleanup() {
  rm -f "$DUMP_FILE"
  unset AGE_PRIVATE_KEY 2>/dev/null || true
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# Страховка: любая непроверенная команда, упавшая из-за `set -e`, тоже
# должна дойти до Telegram, а не просто тихо остановить скрипт.
trap 'notify_failure "неожиданная ошибка (строка $LINENO)"' ERR

echo
echo "Вставьте приватный ключ age (строка AGE-SECRET-KEY-1...) и нажмите Enter."
read -rs -p "Приватный ключ: " AGE_PRIVATE_KEY
echo

if [[ -z "$AGE_PRIVATE_KEY" ]]; then
  echo "Пустой ключ — остановка." >&2
  exit 1
fi

log "Расшифровываю ${SOURCE}"
if ! printf '%s\n' "$AGE_PRIVATE_KEY" | age -d -i /dev/stdin -o "$DUMP_FILE" "$SOURCE"; then
  unset AGE_PRIVATE_KEY
  notify_failure "не удалось расшифровать ${SOURCE} — неверный ключ или повреждённый файл"
  exit 1
fi
unset AGE_PRIVATE_KEY

log "Восстанавливаю в одноразовую базу ${TEST_DB}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${TEST_DB};" >/dev/null
TEST_URL="$(echo "$DATABASE_URL" | sed -E "s#(/)[^/?]+(\?.*)?\$#\\1${TEST_DB}\\2#")"

if ! pg_restore --no-owner --no-acl -d "$TEST_URL" "$DUMP_FILE" 2>&1; then
  notify_failure "pg_restore в ${TEST_DB} завершился с ошибкой"
  exit 1
fi

log "Сравниваю количество строк по таблицам: живая БД vs восстановленная копия"

TABLE_LIST_SQL="SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
TABLES="$(psql "$DATABASE_URL" -t -A -c "$TABLE_LIST_SQL")"

if [[ -z "$TABLES" ]]; then
  notify_failure "в живой БД не нашлось ни одной таблицы в схеме public — что-то не так с DATABASE_URL"
  exit 1
fi

MISMATCH=0
printf '%-30s %12s %12s %s\n' "ТАБЛИЦА" "ЖИВАЯ БД" "ВОССТАНОВЛЕНО" "СТАТУС"
while IFS= read -r table; do
  [[ -z "$table" ]] && continue
  live_count="$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM \"${table}\";" 2>/dev/null || echo "ERR")"
  restored_count="$(psql "$TEST_URL" -t -A -c "SELECT COUNT(*) FROM \"${table}\";" 2>/dev/null || echo "ERR")"
  if [[ "$live_count" == "$restored_count" && "$live_count" != "ERR" ]]; then
    status="OK"
  else
    status="РАСХОЖДЕНИЕ"
    MISMATCH=1
  fi
  printf '%-30s %12s %12s %s\n' "$table" "$live_count" "$restored_count" "$status"
done <<< "$TABLES"

if [[ "$MISMATCH" -eq 1 ]]; then
  notify_failure "количество строк в восстановленной копии не совпадает с живой БД (см. лог) — источник: ${SOURCE}"
  exit 1
fi

log "Проверка пройдена: восстановление из ${SOURCE} даёт те же данные, что и живая БД."
