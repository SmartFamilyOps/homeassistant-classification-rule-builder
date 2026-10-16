#!/usr/bin/with-contenv bashio
set -euo pipefail

if [[ -z "${SUPERVISOR_TOKEN:-}" ]]; then
  bashio::exit.nok "Home Assistant Supervisor token is unavailable."
fi

export HA_URL="http://supervisor/core"
export HA_WS_URL="ws://supervisor/core/api/websocket"
export HA_TOKEN="${SUPERVISOR_TOKEN}"
export CONFIG_ROOT="/config"
export BACKUP_LIMIT="$(bashio::config 'backup_limit')"
export PORT=8099

bashio::log.info "Starting SmartFamilyOps Classification Rule Builder."
exec node /app/src/server.mjs
