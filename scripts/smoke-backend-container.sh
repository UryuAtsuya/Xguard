#!/usr/bin/env bash
set -euo pipefail

XGUARD_SMOKE_REPOSITORY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
XGUARD_SMOKE_IMAGE="${XGUARD_BACKEND_IMAGE:-xguard-backend:smoke}"
XGUARD_SMOKE_PORT="${XGUARD_BACKEND_SMOKE_PORT:-4010}"
XGUARD_SMOKE_CONTAINER="xguard-backend-smoke-$$"
XGUARD_SMOKE_VOLUME="xguard-backend-smoke-data-$$"
XGUARD_SMOKE_KEY="$(node -e 'process.stdout.write(Buffer.alloc(32, 7).toString("base64"))')"

if ! [[ "${XGUARD_SMOKE_PORT}" =~ ^[0-9]+$ ]] \
  || (( XGUARD_SMOKE_PORT < 1024 || XGUARD_SMOKE_PORT > 65535 )); then
  echo "invalid_backend_smoke_port" >&2
  exit 1
fi

cleanup_backend_smoke() {
  XGUARD_SMOKE_EXIT_CODE=$?
  if (( XGUARD_SMOKE_EXIT_CODE != 0 )); then
    docker logs "${XGUARD_SMOKE_CONTAINER}" 2>/dev/null || true
  fi
  docker rm --force "${XGUARD_SMOKE_CONTAINER}" >/dev/null 2>&1 || true
  docker volume rm "${XGUARD_SMOKE_VOLUME}" >/dev/null 2>&1 || true
  exit "${XGUARD_SMOKE_EXIT_CODE}"
}
trap cleanup_backend_smoke EXIT

docker build --tag "${XGUARD_SMOKE_IMAGE}" "${XGUARD_SMOKE_REPOSITORY_DIR}"
docker volume create "${XGUARD_SMOKE_VOLUME}" >/dev/null

docker run --detach \
  --name "${XGUARD_SMOKE_CONTAINER}" \
  --publish "127.0.0.1:${XGUARD_SMOKE_PORT}:4000" \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "source=${XGUARD_SMOKE_VOLUME},target=/app/data" \
  --env PORT=4000 \
  --env APP_VERSION=container-smoke \
  --env PRICING_CONFIRMED=true \
  --env COMPLIANCE_CONFIRMED=true \
  --env APP_BASE_URL=https://api.staging.example.com \
  --env CUSTOMER_APP_URL=https://app.staging.example.com \
  --env CUSTOMER_CORS_ORIGINS=https://app.staging.example.com \
  --env ADMIN_CORS_ORIGINS=https://admin.staging.example.com \
  --env ADMIN_AUTH_MODE=supabase \
  --env ADMIN_REDIRECT_URL=https://admin.staging.example.com/auth/callback \
  --env SUPABASE_URL=https://example.supabase.co \
  --env "SUPABASE_SERVICE_ROLE_KEY=${XGUARD_SMOKE_KEY}" \
  --env OAUTH_STATE_REPOSITORY=supabase \
  --env CONTENT_COMPLIANCE_EVENT_REPOSITORY=supabase \
  --env X_CLIENT_ID=container-smoke-client \
  --env "X_CLIENT_SECRET=${XGUARD_SMOKE_KEY}" \
  --env X_CALLBACK_URL=https://api.staging.example.com/api/x/oauth/callback \
  --env X_TOKEN_SECRET_STORE_DIR=/app/data/x-oauth-tokens \
  --env "X_TOKEN_ENCRYPTION_KEY=${XGUARD_SMOKE_KEY}" \
  "${XGUARD_SMOKE_IMAGE}" >/dev/null

XGUARD_SMOKE_READY=0
for _attempt in {1..30}; do
  if node -e "fetch('http://127.0.0.1:${XGUARD_SMOKE_PORT}/health').then(async (response) => { const body = await response.json(); if (!response.ok || body.ok !== true || body.xOAuthMode !== 'configured' || body.version !== 'container-smoke') process.exit(1); }).catch(() => process.exit(1));"; then
    XGUARD_SMOKE_READY=1
    break
  fi
  sleep 1
done

if (( XGUARD_SMOKE_READY != 1 )); then
  echo "backend_container_health_failed" >&2
  exit 1
fi

test "$(docker exec "${XGUARD_SMOKE_CONTAINER}" id -u)" = "10001"
docker exec "${XGUARD_SMOKE_CONTAINER}" test -w /app/data/x-oauth-tokens

echo "backend_container_smoke_verified"
