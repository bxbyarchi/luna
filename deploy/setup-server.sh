#!/usr/bin/env bash
#
# Первоначальная настройка свежего VPS (Ubuntu 24.04) под Luna-Sklad.
#
# Запускать ОДИН раз, от root (или через sudo), сразу после первого входа на
# новый сервер:
#
#   ssh root@<ip-сервера>
#   curl -fsSL -o setup-server.sh https://raw.githubusercontent.com/bxbyarchi/luna/main/deploy/setup-server.sh
#   bash setup-server.sh
#
# Скрипт идемпотентен — повторный запуск не ломает уже настроенное (каждый
# шаг сам проверяет, нужно ли что-то делать), но смысла гонять его повторно
# обычно нет.
#
# После завершения — ОБЯЗАТЕЛЬНО: открыть новый терминал и зайти как
# deploy-пользователь (ssh deploy@<ip>), убедиться что вход работает, и
# только после этого закрывать текущую root-сессию. Иначе при ошибке в
# SSH-настройках можно остаться без доступа к серверу.

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запускать от root (или через sudo)." >&2
  exit 1
fi

log() { echo -e "\n\033[1;34m==>\033[0m $*"; }

# ---------------------------------------------------------------------------
log "Обновление пакетов"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# ---------------------------------------------------------------------------
log "Пользователь для деплоя: ${DEPLOY_USER}"
if id "$DEPLOY_USER" &>/dev/null; then
  echo "Пользователь ${DEPLOY_USER} уже существует — пропускаю создание."
else
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  echo "Создан пользователь ${DEPLOY_USER} (sudo, без пароля для входа — только по ключу)."
fi

DEPLOY_HOME="/home/${DEPLOY_USER}"
mkdir -p "${DEPLOY_HOME}/.ssh"
chmod 700 "${DEPLOY_HOME}/.ssh"

if [[ -f /root/.ssh/authorized_keys && ! -f "${DEPLOY_HOME}/.ssh/authorized_keys" ]]; then
  log "Копирую ваш SSH-ключ из root в ${DEPLOY_USER}"
  cp /root/.ssh/authorized_keys "${DEPLOY_HOME}/.ssh/authorized_keys"
elif [[ ! -f "${DEPLOY_HOME}/.ssh/authorized_keys" ]]; then
  echo
  echo "!!! В /root/.ssh/authorized_keys ключа не нашлось."
  echo "!!! Вставьте свой публичный SSH-ключ (содержимое id_ed25519.pub/id_rsa.pub) и нажмите Ctrl+D:"
  cat > "${DEPLOY_HOME}/.ssh/authorized_keys"
fi
chmod 600 "${DEPLOY_HOME}/.ssh/authorized_keys"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_HOME}/.ssh"

if [[ ! -s "${DEPLOY_HOME}/.ssh/authorized_keys" ]]; then
  echo "Файл authorized_keys пустой — без ключа вы потеряете доступ после отключения пароля/root-входа." >&2
  echo "Остановка. Добавьте ключ в ${DEPLOY_HOME}/.ssh/authorized_keys и запустите скрипт заново." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
log "SSH: только по ключу, без root и без паролей"
SSHD_DROPIN=/etc/ssh/sshd_config.d/99-luna-hardening.conf
cat > "$SSHD_DROPIN" <<'EOF'
# Добавлено setup-server.sh — вход только по SSH-ключу.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sshd -t
systemctl reload ssh

# ---------------------------------------------------------------------------
log "fail2ban (бан за перебор SSH-паролей/ключей)"
apt-get install -y -qq fail2ban
systemctl enable --now fail2ban

# ---------------------------------------------------------------------------
log "unattended-upgrades (автоматические security-обновления)"
apt-get install -y -qq unattended-upgrades apt-listchanges
dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now unattended-upgrades

# ---------------------------------------------------------------------------
log "Swap ${SWAP_SIZE_GB}GB"
if swapon --show | grep -q /swapfile; then
  echo "Swap уже настроен — пропускаю."
else
  fallocate -l "${SWAP_SIZE_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # На ярмарке сервер не пустой — не уходим в агрессивный своп раньше времени.
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-luna-swappiness.conf
fi

# ---------------------------------------------------------------------------
log "Docker + Compose plugin"
if command -v docker &>/dev/null; then
  echo "Docker уже установлен — пропускаю."
else
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$DEPLOY_USER"
systemctl enable --now docker

# ---------------------------------------------------------------------------
log "ufw: только 22 (SSH), 80, 443"
apt-get install -y -qq ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

cat <<'EOF'

!!! ВАЖНО про Docker и ufw !!!
Docker управляет iptables напрямую и для ОПУБЛИКОВАННЫХ портов контейнеров (секция
`ports:` в docker-compose.yml) обходит правила ufw — т.е. если контейнер
опубликует порт на 0.0.0.0, ufw его НЕ заблокирует, даже если в ufw такого
правила нет.

Поэтому:
  - Postgres в docker-compose.yml НЕ должен иметь секции `ports:` вообще
    (сейчас и не имеет — проверено).
  - Приложение публикуется только на 127.0.0.1:3000 (тоже уже так), а не на
    0.0.0.0 — иначе Docker откроет его наружу мимо ufw.
  - Если в будущем добавляете новый сервис в compose — всегда указывайте
    127.0.0.1:<port>:<port>, никогда просто <port>:<port>.

EOF

log "Готово."
echo "Проверьте вход как ${DEPLOY_USER} в НОВОМ терминале, не закрывая этот:"
echo "  ssh ${DEPLOY_USER}@<ip-сервера>"
echo
echo "Дальше: deploy/nginx/install-nginx.sh, затем deploy/nginx/add-site.sh"
