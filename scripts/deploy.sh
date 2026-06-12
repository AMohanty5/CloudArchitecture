#!/usr/bin/env bash
# Push the local working tree to the prototype EC2 box and (re)start the stack.
# Run from your local machine in Git Bash, from anywhere in the repo:
#   ./scripts/deploy.sh
#
# Override host/key via env if they ever change:
#   EC2_HOST=ec2-user@1.2.3.4 EC2_KEY=./cloud-arch.pem ./scripts/deploy.sh
set -euo pipefail

HOST="${EC2_HOST:-ec2-user@13.232.54.34}"
KEY="${EC2_KEY:-cloud-arch.pem}"
REMOTE_DIR="/home/ec2-user/app"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ssh on Windows/Git Bash refuses keys with loose perms — tighten the MSYS bits.
chmod 600 "$KEY" 2>/dev/null || true
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"

echo ">> Syncing $REPO_ROOT -> $HOST:$REMOTE_DIR"
$SSH "$HOST" "mkdir -p $REMOTE_DIR"
tar czf - \
  --exclude='./.git' \
  --exclude='./node_modules' --exclude='*/node_modules' --exclude='**/node_modules' \
  --exclude='./.turbo' --exclude='*/.turbo' \
  --exclude='*/dist' --exclude='*/build' \
  --exclude='*.pem' --exclude='*.key' \
  --exclude='./.env' --exclude='*.local.db' \
  -C "$REPO_ROOT" . | $SSH "$HOST" "tar xzf - -C $REMOTE_DIR"

echo ">> Installing deps, building, and (re)starting on the box"
$SSH "$HOST" "bash -s" <<REMOTE
set -euo pipefail
cd $REMOTE_DIR

pnpm install --frozen-lockfile
pnpm build

echo ">> Bringing up Postgres + Redis"
sudo docker compose up -d postgres redis

echo ">> Installing/refreshing systemd units"
sudo cp deploy/cac-core.service /etc/systemd/system/cac-core.service
sudo cp deploy/cac-web.service /etc/systemd/system/cac-web.service
sudo systemctl daemon-reload
sudo systemctl enable cac-core cac-web >/dev/null 2>&1 || true
sudo systemctl restart cac-core
sudo systemctl restart cac-web

sleep 2
echo ">> service status:"
sudo systemctl --no-pager is-active cac-core cac-web || true
REMOTE

echo ">> Deploy complete."
echo "   Health check (after opening port 3001 in the SG, or over an SSH tunnel):"
echo "     curl http://13.232.54.34:3001/health"
