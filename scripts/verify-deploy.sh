#!/usr/bin/env bash
set -euo pipefail

# Post-deploy health checks for hirelocalservices.com.au
# Usage: ./scripts/verify-deploy.sh

BASE_URL="${VERIFY_URL:-https://hirelocalservices.com.au}"
FAILED=0

check_url() {
  local url="$1"
  local expected_status="${2:-200}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [ "$status" = "$expected_status" ]; then
    echo "  OK   $url → $status"
  else
    echo "  FAIL $url → $status (expected $expected_status)"
    FAILED=1
  fi
}

echo "=== Post-Deploy Health Checks ==="
echo "Base URL: $BASE_URL"
echo ""

check_url "$BASE_URL/"
check_url "$BASE_URL/robots.txt"
check_url "$BASE_URL/api/health"
check_url "$BASE_URL/login"
check_url "$BASE_URL/signup"
check_url "$BASE_URL/search"

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "All checks passed."
else
  echo "WARNING: Some checks failed. Investigate immediately."
  exit 1
fi
