#!/bin/sh
# Once, on the VPS, as root: makes the key GitHub Actions updates the shop with.
#   sh /opt/kyko/deploy/vps/setup-deploy-key.sh
# The key can do one thing only: run deploy.sh (a forced command in authorized_keys, no shell,
# no port forwarding), so it is no root login even if it leaks. It prints the two values to
# put in GitHub: Settings → Secrets and variables → Actions → New repository secret.
set -eu
KEY=/root/.ssh/kyko_deploy
DEPLOY=/opt/kyko/deploy/vps/deploy.sh
mkdir -p /root/.ssh
chmod 700 /root/.ssh
if [ ! -f "$KEY" ]; then
  ssh-keygen -q -t ed25519 -N "" -C "kyko-deploy (GitHub Actions)" -f "$KEY"
fi
chmod +x "$DEPLOY" /opt/kyko/deploy/vps/backup.sh
LINE="command=\"$DEPLOY\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $(cat "$KEY.pub")"
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
grep -qF "$(cut -d' ' -f2 "$KEY.pub")" /root/.ssh/authorized_keys || echo "$LINE" >> /root/.ssh/authorized_keys

HOST=$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || hostname -I | cut -d' ' -f1)
echo
echo "===== Secret VPS_HOST ====="
echo "$HOST"
echo
echo "===== Secret VPS_KNOWN_HOSTS ====="
for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub; do
  [ -f "$f" ] && echo "$HOST $(cut -d' ' -f1,2 "$f")"
done
echo
echo "===== Secret VPS_SSH_KEY (all lines, BEGIN to END) ====="
cat "$KEY"
echo
echo "Paste each into GitHub: Settings → Secrets and variables → Actions → New repository secret."
echo "Then delete this output from the screen; the key stays only in $KEY and in GitHub."
