#!/usr/bin/env bash
# Wonder Keeper — keep the local OS alive forever.
#
# Why the site "stops working":
#   Vite (npm run dev) dies when a terminal closes, the Mac sleeps hard,
#   a crash kills node, or an old LaunchAgent pointed at a dead path.
# This agent health-checks :5173 and restarts the app. LaunchAgent KeepAlive
# restarts THIS script if it exits.
#
# Usage:
#   ./scripts/wonder-keeper.sh status
#   ./scripts/wonder-keeper.sh start        # one-shot ensure (no loop)
#   ./scripts/wonder-keeper.sh serve        # foreground forever (LaunchAgent)
#   ./scripts/wonder-keeper.sh stop
#   ./scripts/wonder-keeper.sh install      # install + load LaunchAgent
#   ./scripts/wonder-keeper.sh uninstall
#   ./scripts/wonder-keeper.sh open         # Safari → 127.0.0.1:5173
set -euo pipefail

LABEL="com.wonder.keeper"
PORT="${WONDER_PORT:-5173}"
HOST_CHECK="127.0.0.1"
HEALTH_URL="http://${HOST_CHECK}:${PORT}/"
# Prefer this clone; fall back if moved
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${HOME}/.wonder"
LOG_DIR="${STATE_DIR}/logs"
PID_FILE="${STATE_DIR}/vite.pid"
STATUS_FILE="${STATE_DIR}/status.json"
LOG_FILE="${LOG_DIR}/keeper.log"
VITE_LOG="${LOG_DIR}/vite.log"
PLIST_SRC="${ROOT}/scripts/wonder-keeper/com.wonder.keeper.plist"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

mkdir -p "${LOG_DIR}" "${STATE_DIR}"

log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[${ts}] $*" | tee -a "${LOG_FILE}"
}

write_status() {
  local ok="$1"
  local detail="${2:-}"
  local lan
  lan="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")"
  cat > "${STATUS_FILE}" <<EOF
{
  "ok": ${ok},
  "url": "${HEALTH_URL}",
  "lanUrl": "${lan:+http://${lan}:${PORT}/}",
  "widgetUrl": "http://${HOST_CHECK}:${PORT}/?widget=1",
  "root": "${ROOT}",
  "detail": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${detail}" 2>/dev/null || echo "\"${detail}\""),
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pid": $(cat "${PID_FILE}" 2>/dev/null || echo null)
}
EOF
}

is_healthy() {
  # Any HTTP response means the server is up (Vite serves index)
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 4 "${HEALTH_URL}" 2>/dev/null || echo "000")"
  [[ "${code}" =~ ^[23][0-9][0-9]$ ]]
}

port_pid() {
  # PID listening on PORT (node/vite)
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2; exit}'
}

ensure_node_path() {
  # LaunchAgents get a minimal PATH — Homebrew node must be visible
  export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"
  if ! command -v node >/dev/null 2>&1; then
    log "ERROR: node not found on PATH"
    write_status false "node not found"
    return 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    log "ERROR: npm not found on PATH"
    write_status false "npm not found"
    return 1
  fi
}

start_vite() {
  ensure_node_path || return 1
  if is_healthy; then
    local pid
    pid="$(port_pid || true)"
    if [[ -n "${pid}" ]]; then
      echo "${pid}" > "${PID_FILE}"
    fi
    write_status true "already healthy"
    return 0
  fi

  # Stale listener that does not answer health? Kill and restart.
  local stale
  stale="$(port_pid || true)"
  if [[ -n "${stale}" ]]; then
    log "Port ${PORT} held by pid ${stale} but health failed — restarting"
    kill "${stale}" 2>/dev/null || true
    sleep 1
    kill -9 "${stale}" 2>/dev/null || true
    sleep 0.5
  fi

  cd "${ROOT}"
  if [[ ! -d node_modules ]]; then
    log "node_modules missing — running npm install"
    npm install >>"${VITE_LOG}" 2>&1 || {
      write_status false "npm install failed"
      return 1
    }
  fi

  log "Starting Wonder Vite on :${PORT} (root=${ROOT})"
  # host 0.0.0.0 so phone on same Wi‑Fi can reach LAN IP
  nohup npm run dev -- --host 0.0.0.0 --port "${PORT}" >>"${VITE_LOG}" 2>&1 &
  local pid=$!
  echo "${pid}" > "${PID_FILE}"

  # Wait up to ~25s for healthy
  local i
  for i in $(seq 1 50); do
    if is_healthy; then
      log "Wonder is up (pid=${pid})"
      write_status true "started"
      return 0
    fi
    # If process died early, fail
    if ! kill -0 "${pid}" 2>/dev/null; then
      # Vite may re-parent; check port again
      if is_healthy; then
        write_status true "started (reparented)"
        return 0
      fi
      log "Vite process exited before healthy — see ${VITE_LOG}"
      write_status false "vite exited early"
      return 1
    fi
    sleep 0.5
  done

  if is_healthy; then
    write_status true "started (slow)"
    return 0
  fi
  log "Timed out waiting for ${HEALTH_URL}"
  write_status false "health timeout"
  return 1
}

stop_vite() {
  local pid
  pid="$(port_pid || true)"
  if [[ -z "${pid}" && -f "${PID_FILE}" ]]; then
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  fi
  if [[ -n "${pid}" ]]; then
    log "Stopping Wonder (pid=${pid})"
    # Kill process group if possible; fall back to pid
    kill "${pid}" 2>/dev/null || true
    sleep 0.8
    if kill -0 "${pid}" 2>/dev/null; then
      kill -9 "${pid}" 2>/dev/null || true
    fi
  fi
  # Catch orphaned vite/node on the port
  pid="$(port_pid || true)"
  if [[ -n "${pid}" ]]; then
    kill -9 "${pid}" 2>/dev/null || true
  fi
  rm -f "${PID_FILE}"
  write_status false "stopped"
}

cmd_status() {
  local healthy="no"
  if is_healthy; then healthy="yes"; fi
  local pid
  pid="$(port_pid || echo "-")"
  local lan
  lan="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "(no wifi)")"
  echo "Wonder Keeper"
  echo "  root:     ${ROOT}"
  echo "  healthy:  ${healthy}"
  echo "  port:     ${PORT}  pid=${pid}"
  echo "  local:    ${HEALTH_URL}"
  echo "  lan:      http://${lan}:${PORT}/"
  echo "  widget:   http://${HOST_CHECK}:${PORT}/?widget=1"
  echo "  status:   ${STATUS_FILE}"
  echo "  logs:     ${LOG_FILE}"
  if [[ -f "${PLIST_DST}" ]]; then
    echo "  agent:    installed (${LABEL})"
    launchctl print "gui/$(id -u)/${LABEL}" 2>/dev/null | head -5 || echo "  agent:    plist present (not loaded?)"
  else
    echo "  agent:    not installed — run: npm run wonder:install"
  fi
  if is_healthy; then write_status true "status"; else write_status false "down"; fi
}

cmd_serve() {
  # Forever loop for LaunchAgent: ensure up, sleep, recheck.
  # If we exit, LaunchAgent KeepAlive restarts us.
  log "Wonder Keeper serve started (root=${ROOT})"
  ensure_node_path || exit 1
  while true; do
    if ! is_healthy; then
      log "Health failed — ensuring Vite"
      start_vite || log "start_vite failed; will retry"
    else
      write_status true "heartbeat"
    fi
    sleep 20
  done
}

cmd_install() {
  ensure_node_path
  mkdir -p "${HOME}/Library/LaunchAgents"
  # Render plist with absolute paths for THIS machine
  cat > "${PLIST_DST}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT}/scripts/wonder-keeper.sh</string>
    <string>serve</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>WONDER_PORT</key>
    <string>${PORT}</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/launchd.err.log</string>
</dict>
</plist>
EOF
  # Also keep a copy in-repo for documentation (template may lag absolute paths)
  mkdir -p "${ROOT}/scripts/wonder-keeper"
  cp "${PLIST_DST}" "${PLIST_SRC}" 2>/dev/null || true

  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "${PLIST_DST}"
  launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl start "${LABEL}" 2>/dev/null || true

  # Immediate ensure so user doesn't wait for the first poll
  start_vite || true
  log "Installed LaunchAgent ${LABEL}"
  echo "Installed. Wonder will auto-start at login and restart if it dies."
  echo "Open: ${HEALTH_URL}"
  echo "Phone (same Wi‑Fi): http://$(ipconfig getifaddr en0 2>/dev/null || echo YOUR_LAN_IP):${PORT}/"
  cmd_status
}

cmd_uninstall() {
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  rm -f "${PLIST_DST}"
  log "Uninstalled LaunchAgent ${LABEL}"
  echo "LaunchAgent removed. Dev server left running if it was up."
  echo "To stop the server too: npm run wonder:stop"
}

cmd_open() {
  start_vite || true
  open -a Safari "${HEALTH_URL}" 2>/dev/null || open "${HEALTH_URL}"
}

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  local cmd="${1:-status}"
  case "${cmd}" in
    status) cmd_status ;;
    start) start_vite ;;
    stop) stop_vite ;;
    serve) cmd_serve ;;
    install) cmd_install ;;
    uninstall) cmd_uninstall ;;
    open) cmd_open ;;
    -h|--help|help) usage ;;
    *) echo "Unknown command: ${cmd}"; usage; exit 1 ;;
  esac
}

main "$@"
