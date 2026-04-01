#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/deploy/.env.public"
IP_ENV_FILE="${ROOT_DIR}/deploy/.env.ip"
BASE_COMPOSE="${ROOT_DIR}/docker-compose.yml"
PUBLIC_COMPOSE="${ROOT_DIR}/docker-compose.public.yml"

usage() {
  cat <<'EOF'
Usage: deploy/manage.sh <dev-up|ip-up|public-up|restart|pull|logs|health|down>

Commands:
  dev-up      Start base stack (gateway on port 80, no TLS)
  ip-up       Start base stack in IP-only mode using deploy/.env.ip
  public-up   Start stack with TLS edge (Caddy) using deploy/.env.public
  restart     Recreate and restart current stack (base or public based on env file presence)
  pull        Pull latest images for external image services
  logs        Follow gateway/caddy/backend logs
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
  *)
    usage
    exit 1
    ;;
esac
