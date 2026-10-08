#!/usr/bin/env bash
#
# Восстанавливает зашифрованную копию в указанную базу данных.
#
# Приватный ключ age НИКОГДА не просят сохранить в файл на диске — скрипт
# читает его через `read` (не попадает ни в файл, ни в bash-историю) и
# передаёт в `age -i /dev/stdin` по пайпу. На диске сервера приватный ключ
# не появляется ни на секунду.
#
# Использование:
#   deploy/backup/restore.sh <файл.dump.age | daily/имя-файла> <имя-целевой-БД>
#
# Если первый аргумент не существует как локальный файл — скрипт скачает
# его с Google Drive по этому же относительному пути внутри RCLONE_FOLDER
# (например: daily/luna-20260101T030000Z.dump.age).
#
# Целевая база данных ПЕРЕСОЗДАЁТСЯ (DROP + CREATE) — если указали боевую
# базу, вы её сотрёте. Для реального восстановления прода называйте целевую
# базу НЕ так же, как боевая, переключайте приложение на новое имя вручную
# после проверки. Для автоматической проверки бэкапов — см. test-restore.sh,
# он сам создаёт одноразовую базу и сам её удаляет.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет файла ${ENV_FILE} — скопируйте .env.example и заполните." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

SOURCE="${1:-}"
TARGET_DB="${2:-}"

if [[ -z "$SOURCE" || -z "$TARGET_DB" ]]; then
  echo "Использование: $0 <файл.dump.age | относительный путь на Drive> <имя-целевой-БД>" >&2
  exit 1
fi

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

LOCAL_FILE="$SOURCE"
if [[ ! -f "$LOCAL_FILE" ]]; then
  log "Файл не найден локально — скачиваю с Google Drive: ${RCLONE_REMOTE}:${RCLONE_FOLDER}/${SOURCE}"
  TMP_DOWNLOAD="$(mktemp -d)"
  trap 'rm -rf "$TMP_DOWNLOAD"' EXIT
  rclone copyto "${RCLONE_REMOTE}:${RCLONE_FOLDER}/${SOURCE}" "${TMP_DOWNLOAD}/$(basename "$SOURCE")"
  LOCAL_FILE="${TMP_DOWNLOAD}/$(basename "$SOURCE")"
fi

echo
echo "Вставьте приватный ключ age (строка AGE-SECRET-KEY-1...) и нажмите Enter."
echo "Ключ не сохраняется в файл и не попадает в историю команд."
read -rs -p "Приватный ключ: " AGE_PRIVATE_KEY
echo

if [[ -z "$AGE_PRIVATE_KEY" ]]; then
  echo "Пустой ключ — остановка." >&2
  exit 1
fi

DUMP_FILE="$(mktemp)"
# Расшифрованный дамп временно попадает на диск (pg_restore не умеет читать
# custom-format из пайпа произвольного размера надёжно) — только сам дамп,
# не ключ. Удаляется сразу после restore, при ошибке — тоже (trap).
cleanup() { rm -f "$DUMP_FILE"; }
trap cleanup EXIT

log "Расшифровываю ${LOCAL_FILE}"
printf '%s\n' "$AGE_PRIVATE_KEY" | age -d -i /dev/stdin -o "$DUMP_FILE" "$LOCAL_FILE"
unset AGE_PRIVATE_KEY

log "Пересоздаю базу ${TARGET_DB}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${TARGET_DB};" -c "CREATE DATABASE ${TARGET_DB};" \
  || { echo "Не удалось пересоздать БД через текущий DATABASE_URL — проверьте права пользователя на CREATE/DROP DATABASE." >&2; exit 1; }

# Собираем connection string для целевой БД из DATABASE_URL, заменяя имя БД.
TARGET_URL="$(echo "$DATABASE_URL" | sed -E "s#(/)[^/?]+(\?.*)?\$#\\1${TARGET_DB}\\2#")"

log "Восстанавливаю в ${TARGET_DB}"
pg_restore --no-owner --no-acl -d "$TARGET_URL" "$DUMP_FILE"

log "Готово. База ${TARGET_DB} восстановлена из ${SOURCE}."
