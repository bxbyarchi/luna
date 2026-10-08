#!/usr/bin/env bash
#
# Устанавливает Nginx + Certbot и общие настройки (gzip, security-заголовки).
# Запускать один раз после setup-server.sh, от root/sudo.
#
# Сайты под конкретные домены добавляются ОТДЕЛЬНО через add-site.sh —
# этот скрипт только ставит сам Nginx и общие сниппеты.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запускать от root (или через sudo)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo -e "\n\033[1;34m==>\033[0m $*"; }

log "Устанавливаю Nginx и Certbot"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx

log "Общие сниппеты (security-заголовки, gzip)"
mkdir -p /etc/nginx/snippets
cp "${SCRIPT_DIR}/snippets/security-headers.conf" /etc/nginx/snippets/security-headers.conf
cp "${SCRIPT_DIR}/snippets/gzip.conf" /etc/nginx/snippets/gzip.conf

# Дефолтный nginx.conf от Ubuntu уже объявляет "gzip on;" (плюс закомменти-
# рованные gzip_vary/gzip_types и т.д.) прямо в http-блоке — если просто
# добавить свой include со вторым "gzip on;", nginx откажется стартовать
# ("gzip directive is duplicate"). Поэтому заменяем штатный блок целиком на
# include нашего сниппета (идемпотентно: если блок уже заменён, этот sed
# просто ничего не найдёт и не тронет файл).
if grep -q '^\tgzip on;$' /etc/nginx/nginx.conf; then
  sed -i '/^\tgzip on;$/,/gzip_types/c\
\tinclude snippets/gzip.conf;' /etc/nginx/nginx.conf
fi

# Убираем стандартную заглушку ("Welcome to nginx") — незачем отдавать её
# по IP сервера или случайным доменам, указывающим сюда по ошибке.
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

log "Готово. Дальше: deploy/nginx/add-site.sh <домен> <порт> [email]"
