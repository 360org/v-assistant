#!/usr/bin/env bash
#
# V Assistant — live dev in a container, no Node/Rust on the host.
# Uses Colima as the Docker runtime (not Docker Desktop).
#
#   ./dev.sh up        start (boots Colima if needed) → http://localhost:1420
#   ./dev.sh down      stop and remove the dev container
#   ./dev.sh start     start the existing stopped container
#   ./dev.sh stop      stop without removing
#   ./dev.sh restart   restart the container
#   ./dev.sh logs      follow the dev server logs
#   ./dev.sh status    show Colima + container status
#   ./dev.sh shell     open a shell inside the dev container
#   ./dev.sh reset     rebuild from scratch (fresh node_modules)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.dev.yml"
PROJECT="v-assistant-dev"
URL="http://localhost:1420"

# --- Colima runtime ----------------------------------------------------------
ensure_colima() {
  if ! command -v colima >/dev/null 2>&1; then
    echo "Colima is not installed. Install it with:" >&2
    echo "  brew install colima docker docker-compose" >&2
    exit 1
  fi
  if ! colima status >/dev/null 2>&1; then
    echo "▸ Starting Colima…"
    colima start
  fi
  # Make sure the Docker CLI talks to Colima's daemon.
  docker context use colima >/dev/null 2>&1 || true
}

# Pick the available Compose command (plugin v2 preferred).
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"
  else
    echo "Docker Compose not found. Install with: brew install docker-compose" >&2
    exit 1
  fi
}

wait_ready() {
  echo "▸ Waiting for the dev server (first run installs deps, ~1 min)…"
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "$URL" 2>/dev/null; then
      echo "✓ Ready → $URL"
      return 0
    fi
    sleep 3
  done
  echo "⚠ Not up yet. Check logs:  ./dev.sh logs" >&2
  return 1
}

cmd="${1:-up}"
case "$cmd" in
  up)
    ensure_colima
    compose up -d
    wait_ready || true
    echo "  logs:  ./dev.sh logs   ·   stop:  ./dev.sh down"
    ;;
  down)
    ensure_colima
    compose down
    echo "✓ Stopped and removed. (node_modules volume kept — use 'reset' to clear.)"
    ;;
  start)
    ensure_colima
    compose start
    wait_ready || true
    ;;
  stop)
    ensure_colima
    compose stop
    echo "✓ Stopped (container kept; 'start' to resume)."
    ;;
  restart)
    ensure_colima
    compose restart
    wait_ready || true
    ;;
  logs)
    ensure_colima
    compose logs -f
    ;;
  status | ps)
    if command -v colima >/dev/null 2>&1; then colima status || true; fi
    echo
    ensure_colima
    compose ps
    ;;
  shell | sh)
    ensure_colima
    compose exec dev sh
    ;;
  reset | rebuild)
    ensure_colima
    echo "▸ Removing containers + node_modules volume…"
    compose down -v
    compose up -d
    wait_ready || true
    ;;
  *)
    sed -n '3,20p' "$ROOT/dev.sh"
    exit 1
    ;;
esac
