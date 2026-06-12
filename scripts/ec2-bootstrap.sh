#!/usr/bin/env bash
# One-time provisioning for the prototype EC2 box (Amazon Linux 2023, x86_64).
# Usage (from your local machine, Git Bash):
#   ssh -i cloud-arch.pem ec2-user@13.232.54.34 'bash -s' < scripts/ec2-bootstrap.sh
# Idempotent: safe to re-run.
set -euo pipefail

echo ">> Updating base packages"
sudo dnf -y -q update || true

echo ">> Installing git, docker, Node 22"
sudo dnf -y -q install git docker nodejs22 nodejs22-npm

echo ">> Enabling Docker"
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user   # takes effect on next login; deploy uses sudo docker

echo ">> Installing Docker Compose v2 plugin"
sudo mkdir -p /usr/local/lib/docker/cli-plugins
if [ ! -x /usr/local/lib/docker/cli-plugins/docker-compose ]; then
  sudo curl -fsSL \
    "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

echo ">> Installing pnpm globally (AL2023 nodejs22 does not bundle corepack)"
sudo npm i -g pnpm@10.34.3

echo ">> Installed versions:"
node -v
pnpm -v
git --version
sudo docker --version
sudo docker compose version

echo ">> Bootstrap complete."
