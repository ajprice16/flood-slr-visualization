#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/deploy/.env.public"
IP_ENV_FILE="${ROOT_DIR}/deploy/.env.ip"
BASE_COMPOSE="${ROOT_DIR}/docker-compose.yml"
PUBLIC_COMPOSE="${ROOT_DIR}/docker-compose.public.yml"

usage() {
  cat <<'EOF'
Usage: deploy/manage.sh <dev-up|ip-up|public-up|restart|pull|logs|monitor|stats|health|down>

Commands:
  dev-up      Start base stack (gateway on port 80, no TLS)
  ip-up       Start base stack in IP-only mode using deploy/.env.ip
  public-up   Start stack with TLS edge (Caddy) using deploy/.env.public
  restart     Recreate and restart current stack (base or public based on env file presence)
  pull        Pull latest images for external image services
  logs        Follow gateway/caddy/backend logs
  monitor     Stream logs live with a periodic active-user stats banner (refreshes every 15s)
  stats       One-shot active users + health summary
  health      Check API health endpoint
  down        Stop and remove stack containers
EOF
}

compose_cmd() {
  if [[ "${1:-}" == "public" ]]; then
    if [[ ! -f "${ENV_FILE}" ]]; then
      echo "Missing ${ENV_FILE}. Copy deploy/.env.public.example and set SITE_HOSTNAME." >&2
      exit 1
    fi
    GATEWAY_PORT_BIND="${GATEWAY_PORT_BIND:-127.0.0.1:8080:80}" \
      docker compose --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${PUBLIC_COMPOSE}" "${@:2}"
  elif [[ "${1:-}" == "ip" ]]; then
    if [[ ! -f "${IP_ENV_FILE}" ]]; then
      echo "Missing ${IP_ENV_FILE}. Copy deploy/.env.ip.example and set PUBLIC_IP." >&2
      exit 1
    fi
    docker compose --env-file "${IP_ENV_FILE}" -f "${BASE_COMPOSE}" "${@:2}"
  else
    docker compose -f "${BASE_COMPOSE}" "${@:2}"
  fi
}

json_field() {
  local json="${1:-}"
  local key="${2:-}"
  JSON_INPUT="$json" python3 - "$key" <<'PY' 2>/dev/null || true
import json
import os
import sys

key = sys.argv[1]
text = os.environ.get("JSON_INPUT", "").strip()
if not text:
  sys.exit(0)
try:
  obj = json.loads(text)
except Exception:
  sys.exit(0)
val = obj.get(key)
if val is None:
  sys.exit(0)
print(val)
PY
}

cmd="${1:-}"
case "${cmd}" in
  dev-up)
    compose_cmd base up -d --build
    ;;
  ip-up)
    compose_cmd ip up -d --build
    ;;
  public-up)
    compose_cmd public up -d --build
    ;;
  restart)
    if [[ -f "${ENV_FILE}" ]]; then
      compose_cmd public up -d --build --force-recreate
    elif [[ -f "${IP_ENV_FILE}" ]]; then
      compose_cmd ip up -d --build --force-recreate
    else
      compose_cmd base up -d --build --force-recreate
    fi
    ;;
  pull)
    if [[ -f "${ENV_FILE}" ]]; then
      compose_cmd public pull
    elif [[ -f "${IP_ENV_FILE}" ]]; then
      compose_cmd ip pull
    else
      compose_cmd base pull
    fi
    ;;
  logs)
    if [[ -f "${ENV_FILE}" ]]; then
      compose_cmd public logs -f caddy gateway backend
    elif [[ -f "${IP_ENV_FILE}" ]]; then
      compose_cmd ip logs -f gateway backend frontend
    else
      compose_cmd base logs -f gateway backend frontend
    fi
    ;;
  health)
    for i in {1..10}; do
      if curl -fsS "http://localhost/api/health" | cat; then
        exit 0
      fi
      sleep 1
    done
    echo "Health check failed after retries" >&2
    exit 1
    ;;
  down)
    if [[ -f "${ENV_FILE}" ]]; then
      compose_cmd public down
    elif [[ -f "${IP_ENV_FILE}" ]]; then
      compose_cmd ip down
    else
      compose_cmd base down
    fi
    ;;
  monitor)
    printf '\033[1;36mMonitor started. Stats banner refreshes every 15s. Ctrl+C to stop.\033[0m\n'
    (
      warned_stats_missing=0
      while true; do
        raw=$(curl -fsS "http://localhost/api/stats" 2>/dev/null || true)
        health=$(curl -fsS "http://localhost/api/health" 2>/dev/null || true)
        active=$(json_field "${raw}" active_users_5m)
        tiles=$(json_field "${health}" tiles_indexed)
        if [[ -z "${active}" && ${warned_stats_missing} -eq 0 ]]; then
          printf '\033[1;33m[warn] /api/stats unavailable; active user count will show --\033[0m\n' >&2
          warned_stats_missing=1
        fi
        printf '\033[1;36m[%s] active_users(5m): %-4s  tiles_indexed: %s\033[0m\n' \
          "$(date '+%H:%M:%S')" "${active:--}" "${tiles:--}" >&2
        sleep 15
      done
    ) &
    STATS_PID=$!
    trap 'kill "${STATS_PID}" 2>/dev/null; exit 0' INT TERM
    if [[ -f "${ENV_FILE}" ]]; then
      compose_cmd public logs -f caddy gateway backend
    elif [[ -f "${IP_ENV_FILE}" ]]; then
      compose_cmd ip logs -f gateway backend frontend
    else
      compose_cmd base logs -f gateway backend frontend
    fi
    kill "${STATS_PID}" 2>/dev/null || true
    ;;
  stats)
    raw=$(curl -fsS "http://localhost/api/stats" 2>/dev/null || true)
    health=$(curl -fsS "http://localhost/api/health" 2>/dev/null || true)
    active=$(json_field "${raw}" active_users_5m)
    tiles=$(json_field "${health}" tiles_indexed)
    status=$(json_field "${health}" status)
    printf 'status:          %s\n' "${status:--}"
    printf 'tiles_indexed:   %s\n' "${tiles:--}"
    printf 'active_users_5m: %s\n' "${active:--}"
    ;;
  *)
    usage
    exit 1
    ;;
esac
