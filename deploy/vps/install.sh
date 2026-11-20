#!/usr/bin/env bash
# Kyko Parfum on an Ubuntu server in one command (as root):
#
#   curl -fsSL https://raw.githubusercontent.com/alisher-15/kyko_parfums/main/deploy/vps/install.sh | bash
#
# It looks at the server first and changes nothing if ports 80/443 belong to another program.
# Then it adds swap (the site's build needs ~2 GB of memory), installs Docker, fetches the code
# to /opt/kyko, writes deploy/vps/.env with fresh secrets (asking only for the owner's email and
# password), builds and starts the shop with HTTPS, and sets up the nightly database backup.
# Running it again updates the code and changes nothing else. Without a domain the shop opens
# at https://<ip-with-dashes>.sslip.io; to move it to your domain once its A record points here:
#
#   curl -fsSL https://raw.githubusercontent.com/alisher-15/kyko_parfums/main/deploy/vps/install.sh | DOMAIN=kyko.kz bash
set -euo pipefail

# The whole script is read before it runs: with `curl … | bash` the script itself is stdin, and a
# command reading stdin (docker compose exec) would otherwise swallow the rest of it.
main() {

REPO=${KYKO_REPO:-https://github.com/alisher-15/kyko_parfums.git}
DIR=${KYKO_DIR:-/opt/kyko}
KIT=$DIR/deploy/vps
LOG=/var/log/kyko-install.log

say() { printf '\n\033[1;32m== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m!! %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || fail "Запустите под root (sudo -i)."
grep -q 'ID=ubuntu' /etc/os-release || fail "Нужна Ubuntu."

say "Сервер"
echo "Процессоров: $(nproc); память: $(free -h | awk '/^Mem:/ {print $2" всего, "$7" свободно"}')"
echo "Диск /: $(df -h / | awk 'NR==2 {print $4" свободно из "$2}')"
echo "Подкачка: $(swapon --show --noheadings | awk '{print $1" "$3}' | paste -sd, - || true)"

command -v ss >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -q iproute2 >/dev/null

# Who listens on a port: "" when nobody, "kyko" when it's this shop's own Caddy.
port_owner() {
  local who
  who=$(ss -tlnpH "( sport = :$1 )" | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | sort -u | paste -sd, -)
  if [ "$who" = docker-proxy ] && command -v docker >/dev/null; then
    who=$(docker ps --filter "publish=$1" --format '{{.Names}}' | paste -sd, -)
    case "$who" in kyko-caddy-*) who=kyko ;; esac
  fi
  echo "$who"
}
busy=""
for port in 80 443; do
  owner=$(port_owner "$port")
  echo "Порт $port: ${owner:-свободен}"
  [ -n "$owner" ] && [ "$owner" != kyko ] && busy="$busy $port ($owner)"
done
if [ -n "$busy" ]; then
  echo
  echo "Порты заняты другой программой:$busy"
  echo "Ничего не изменено. Сфотографируйте этот экран и пришлите — подключу магазин через неё."
  exit 0
fi

if [ -z "$(swapon --show --noheadings)" ]; then
  say "Подкачка 4 ГБ (для сборки сайта)"
  if fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile; then
    grep '^/swapfile ' /etc/fstab >/dev/null || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  else
    rm -f /swapfile
    echo "Подкачку включить не удалось, продолжаю без неё"
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  say "Установка Docker"
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io docker-compose-v2 git openssl
  systemctl enable --now docker
fi
command -v git >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -q git

if ufw status 2>/dev/null | grep "^Status: active" >/dev/null; then
  ufw allow 80/tcp >/dev/null; ufw allow 443 >/dev/null
fi

say "Код магазина"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only -q
else
  git clone -q "$REPO" "$DIR"
fi
git -C "$DIR" log -1 --format='%h %s' | cut -c1-100

cd "$KIT"
if [ ! -f .env ]; then
  say "Настройка"
  if [ -z "${DOMAIN:-}" ]; then
    ip=$(curl -fsS4 --max-time 10 https://api.ipify.org || curl -fsS4 --max-time 10 https://ifconfig.me) ||
      fail "Не удалось узнать внешний IP. Запустите с DOMAIN=ваш.домен"
    DOMAIN="${ip//./-}.sslip.io"
  fi
  echo "Адрес магазина: https://$DOMAIN"
  echo "Владелец магазина (вход в админку):"
  admin_email=${ADMIN_EMAIL:-}
  admin_password=${ADMIN_PASSWORD:-}
  [ -n "$admin_email" ] || read -r -p "  email: " admin_email </dev/tty
  while [ "${#admin_password}" -lt 8 ]; do
    read -r -s -p "  пароль (от 8 символов, не показывается): " admin_password </dev/tty; echo
  done
  umask 077
  sed -e "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" \
      -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$admin_email|" \
      .env.example > .env
  # The password goes in as is, whatever characters it has.
  awk -v p="$admin_password" '/^ADMIN_PASSWORD=/ {print "ADMIN_PASSWORD=" p; next} {print}' .env > .env.new
  mv .env.new .env
  unset admin_password
elif [ -n "${DOMAIN:-}" ]; then
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env
fi
DOMAIN=$(sed -n 's/^DOMAIN=//p' .env)

say "Сборка и запуск (10–15 минут, лог: $LOG)"
if ! docker compose up -d --build >"$LOG" 2>&1; then
  tail -n 30 "$LOG"
  fail "Сборка не удалась. Сфотографируйте экран и пришлите."
fi

say "Проверка"
health() {
  docker compose exec -T app python3 -c \
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:10000/api/health', timeout=5)" \
    >/dev/null 2>&1
}
for _ in $(seq 60); do health && break; sleep 5; done
health || { docker compose logs --tail 30 app; fail "Сайт не отвечает. Сфотографируйте экран и пришлите."; }
echo "Сайт и база: работают"
if curl -fsS --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" >/dev/null 2>&1; then
  echo "HTTPS: сертификат получен"
else
  echo "HTTPS: сертификата ещё нет (бывает до пары минут; если не появится — закрыты порты 80/443 у хостинга)"
fi

cron="15 3 * * * $KIT/backup.sh >> /var/log/kyko-backup.log 2>&1"
if command -v crontab >/dev/null && ! crontab -l 2>/dev/null | grep -F "$KIT/backup.sh" >/dev/null; then
  # No crontab yet is not an error (set -e would end the script there without a word).
  { crontab -l 2>/dev/null || true; echo "$cron"; } | crontab -
  echo "Копия базы: каждую ночь в 3:15, /var/backups/kyko"
fi

say "Готово: https://$DOMAIN  (админка: https://$DOMAIN/admin, вход: $(sed -n 's/^ADMIN_EMAIL=//p' .env))"
}

main "$@" </dev/null
