#!/usr/bin/env bash
#
# Резервная копия БД Luna-Sklad: pg_dump -> шифрование (age) -> локальная
# папка -> Google Drive (rclone). Без расшифровки нигде не хранится ни на
# диске сервера, ни на Google Drive — дамп идёт из pg_dump сразу в age по
# пайпу, незашифрованная версия на диск не попадает вообще.
#
# Настройка: deploy/backup/.env (см. .env.example).
# Запуск: по cron, см. crontab.example. Руками — просто:
#   deploy/backup/backup.sh
#
# При любой ошибке — сообщение в Telegram супер-админу и ненулевой exit code
# (в cron это даёт и письмо от cron, если почта настроена, и алерт в бот).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет файла ${ENV_FILE} — скопируйте .env.example и заполните." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_DIR}/luna-${TIMESTAMP}.dump.age"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

notify_failure() {
  local step="$1"
  log "ОШИБКА на шаге: ${step}"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_ADMIN_CHAT_ID:-}" ]]; then
    local host_name text
    host_name="$(hostname)"
    text="🔴 Бэкап Luna-Sklad провалился (${TIMESTAMP})%0AШаг: ${step}%0AСервер: ${host_name}"
    curl -fsS --max-time 10 \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_ADMIN_CHAT_ID}" \
      -d "text=${text}" \
      -d "parse_mode=HTML" >/dev/null \
      || log "Не удалось отправить уведомление в Telegram (но сам бэкап мог упасть по другой причине)."
  fi
}

for var in DATABASE_URL AGE_RECIPIENT RCLONE_REMOTE RCLONE_FOLDER BACKUP_DIR; do
  if [[ -z "${!var:-}" ]]; then
    notify_failure "конфигурация: переменная ${var} не задана в .env"
    exit 1
  fi
done

mkdir -p "$BACKUP_DIR"

log "Старт бэкапа -> ${BACKUP_FILE}"

if ! pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" \
    | age -r "$AGE_RECIPIENT" -o "$BACKUP_FILE"; then
  rm -f "$BACKUP_FILE"
  notify_failure "pg_dump | age (создание зашифрованной копии)"
  exit 1
fi

if [[ ! -s "$BACKUP_FILE" ]]; then
  notify_failure "итоговый файл ${BACKUP_FILE} пустой или не создан"
  exit 1
fi
log "Локальная копия готова: $(du -h "$BACKUP_FILE" | cut -f1)"

log "Чистка локальных копий старше ${RETENTION_LOCAL_DAYS} дней"
find "$BACKUP_DIR" -maxdepth 1 -name 'luna-*.dump.age' -mtime "+${RETENTION_LOCAL_DAYS}" -delete

log "Загрузка в Google Drive: ${RCLONE_REMOTE}:${RCLONE_FOLDER}/daily/"
if ! rclone copy "$BACKUP_FILE" "${RCLONE_REMOTE}:${RCLONE_FOLDER}/daily/" --quiet; then
  notify_failure "rclone copy в daily/ — локальная копия осталась на сервере, проверьте rclone config"
  exit 1
fi

# Первая копия месяца (день месяца == 01, определяем по UTC-дате самого
# запуска, а не по имени файла) — отдельно складываем в monthly/ с более
# долгим сроком хранения.
if [[ "$(date -u +%d)" == "01" ]]; then
  log "Первое число месяца — копия также в monthly/"
  if ! rclone copy "$BACKUP_FILE" "${RCLONE_REMOTE}:${RCLONE_FOLDER}/monthly/" --quiet; then
    notify_failure "rclone copy в monthly/ (daily/ при этом загрузился успешно)"
    exit 1
  fi
fi

prune_remote() {
  local subfolder="$1" keep="$2"
  local path="${RCLONE_REMOTE}:${RCLONE_FOLDER}/${subfolder}"
  # Имена файлов luna-YYYYMMDDTHHMMSSZ.dump.age — сортировка по имени = по
  # времени. Оставляем последние $keep, остальные удаляем.
  local files
  files="$(rclone lsf "$path" 2>/dev/null | sort)"
  local total
  total="$(echo "$files" | grep -c . || true)"
  if (( total > keep )); then
    local to_delete=$((total - keep))
    echo "$files" | head -n "$to_delete" | while read -r old_file; do
      [[ -z "$old_file" ]] && continue
      log "Удаляю старую копию из ${subfolder}/: ${old_file}"
      rclone deletefile "${path}/${old_file}" --quiet || true
    done
  fi
}

log "Проверка retention на Google Drive (daily=${RETENTION_DRIVE_DAILY}, monthly=${RETENTION_DRIVE_MONTHLY})"
prune_remote "daily" "$RETENTION_DRIVE_DAILY"
prune_remote "monthly" "$RETENTION_DRIVE_MONTHLY"

log "Бэкап успешно завершён: ${BACKUP_FILE}"
