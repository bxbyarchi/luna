#!/usr/bin/env bash
#
# Добавляет reverse-proxy сайт на этом сервере для одного домена и
# выпускает Let's Encrypt сертификат. Используется и для luna, и для любых
# будущих 2 приложений на этом же сервере — просто другой домен/порт.
#
# Запускать от root/sudo, ПОСЛЕ install-nginx.sh и после того, как DNS
# домена уже указывает на IP этого сервера (certbot проверяет домен через
# HTTP, пока DNS не настроен — выпустить сертификат не получится).
#
# Использование:
#   deploy/nginx/add-site.sh <домен> <порт> [email-для-certbot]
#
# Пример (для Luna-Sklad, порт 3000 — как в docker-compose.yml):
#   deploy/nginx/add-site.sh luna.example.com 3000 you@example.com
#
# Для второго/третьего приложения на этом же сервере — тот же скрипт,
# другой домен и порт:
#   deploy/nginx/add-site.sh crm.example.com 3001 you@example.com

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запускать от root (или через sudo)." >&2
  exit 1
fi

DOMAIN="${1:-}"
PORT="${2:-}"
EMAIL="${3:-}"

if [[ -z "$DOMAIN" || -z "$PORT" ]]; then
  echo "Использование: $0 <домен> <порт> [email-для-certbot]" >&2
  exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "Порт должен быть числом, получено: ${PORT}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_CONF="/etc/nginx/sites-available/${DOMAIN}.conf"

log() { echo -e "\n\033[1;34m==>\033[0m $*"; }

log "Генерирую конфиг для ${DOMAIN} -> 127.0.0.1:${PORT}"
sed -e "s/__DOMAIN__/${DOMAIN}/g" -e "s/__PORT__/${PORT}/g" \
  "${SCRIPT_DIR}/templates/app.conf.template" > "$SITE_CONF"

ln -sf "$SITE_CONF" "/etc/nginx/sites-enabled/${DOMAIN}.conf"

nginx -t
systemctl reload nginx
echo "Сайт ${DOMAIN} включён на HTTP. Проверьте: curl -H 'Host: ${DOMAIN}' http://127.0.0.1/"

log "Let's Encrypt сертификат для ${DOMAIN}"
echo "Убедитесь, что DNS-запись ${DOMAIN} уже указывает на этот сервер — иначе certbot не пройдёт проверку."
read -r -p "DNS настроен и указывает сюда? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Пропускаю certbot. Сайт работает по HTTP на :80 — запустите этот скрипт ещё раз (или просто certbot --nginx -d ${DOMAIN}) когда DNS будет готов."
  exit 0
fi

CERTBOT_ARGS=(--nginx -d "$DOMAIN" --redirect --non-interactive --agree-tos)
if [[ -n "$EMAIL" ]]; then
  CERTBOT_ARGS+=(--email "$EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

certbot "${CERTBOT_ARGS[@]}"

nginx -t
systemctl reload nginx

log "Готово. ${DOMAIN} доступен по HTTPS, HTTP редиректит на HTTPS."
echo "Автопродление сертификата уже настроено пакетом certbot (systemd-таймер certbot.timer) — отдельно ничего настраивать не нужно."
echo "Проверить вручную: certbot renew --dry-run"
