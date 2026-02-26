#!/usr/bin/env bash
set -euo pipefail

# Deploy HireLocalServices to AWS EC2
# Usage: ./scripts/deploy-aws.sh
#
# Prerequisites:
#   - SSH key at $PEM_PATH (default: ~/AndroidStudioProjects/hire-local-services/hirelocalservices.pem)
#   - Server has Node.js 20+, PM2, Nginx configured
#
# Strategy: git pull on server → npm ci → build → pm2 restart
# This ensures prod always matches a git commit.

SERVER="${DEPLOY_SERVER:-ubuntu@54.153.199.73}"
PEM_PATH="${PEM_PATH:-$HOME/AndroidStudioProjects/hire-local-services/hirelocalservices.pem}"
APP_DIR="/home/ubuntu/app"
SSH_CMD="ssh -i $PEM_PATH -o StrictHostKeyChecking=no $SERVER"

echo "=== HireLocalServices Deploy ==="
echo "Server: $SERVER"
echo "App dir: $APP_DIR"
echo ""

# 1. Ensure local changes are committed and pushed
LOCAL_CHANGES=$(git status --porcelain)
if [ -n "$LOCAL_CHANGES" ]; then
  echo "ERROR: Uncommitted local changes detected. Commit and push first."
  echo "$LOCAL_CHANGES"
  exit 1
fi

LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git ls-remote origin HEAD | cut -f1)
if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
  echo "ERROR: Local HEAD ($LOCAL_HEAD) differs from remote ($REMOTE_HEAD)."
  echo "Push your changes first: git push origin main"
  exit 1
fi

echo "Step 1/5: Git pull on server..."
$SSH_CMD "cd $APP_DIR && git fetch origin && git reset --hard origin/main"

echo "Step 2/5: Install dependencies (full, including devDeps for build)..."
$SSH_CMD "cd $APP_DIR && npm ci"

echo "Step 3/5: Build Next.js..."
$SSH_CMD "cd $APP_DIR && npm run build"

echo "Step 4/5: Restart PM2..."
$SSH_CMD "cd $APP_DIR && pm2 restart ecosystem.config.js --update-env"

echo "Step 5/5: Post-deploy health checks..."
sleep 5
bash "$(dirname "$0")/verify-deploy.sh"

echo ""
echo "=== Deploy complete ==="
echo "Deployed commit: $LOCAL_HEAD"
