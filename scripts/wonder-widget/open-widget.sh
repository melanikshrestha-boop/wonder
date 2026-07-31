#!/usr/bin/env bash
# Open Wonder Base as an always-on-top desktop panel.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WIDGET_DIR="${ROOT}/scripts/wonder-widget"

# Prefer a local Electron if present; else reuse one already on this Mac
resolve_electron() {
  if [[ -n "${ELECTRON_PATH:-}" && -x "${ELECTRON_PATH}" ]]; then
    echo "${ELECTRON_PATH}"
    return
  fi
  local candidates=(
    "${ROOT}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
    "${HOME}/lens/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
    "${HOME}/lens-os/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
    "${HOME}/BetterPrimerePro/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -x "${c}" ]]; then
      echo "${c}"
      return
    fi
  done
  # Last resort: npx (downloads once)
  if command -v npx >/dev/null 2>&1; then
    echo "npx"
    return
  fi
  return 1
}

# Ensure Vite is up (Chrome-friendly URL)
bash "${ROOT}/scripts/wonder-keeper.sh" start >/dev/null 2>&1 || true

ELECTRON_BIN="$(resolve_electron)" || {
  echo "No Electron found. Install once:  cd ~/wonder && npm i -D electron"
  exit 1
}

# Close previous panel so we don't stack copies
pkill -f "scripts/wonder-widget" 2>/dev/null || true
pkill -f "wonder-base-widget" 2>/dev/null || true
# Electron app path match
pgrep -fl "Electron.*wonder-widget" | awk '{print $1}' | xargs kill 2>/dev/null || true
sleep 0.25

export WONDER_WIDGET_URL="${WONDER_WIDGET_URL:-http://127.0.0.1:5173/?widget=1}"
export WONDER_URL="${WONDER_URL:-http://127.0.0.1:5173/}"

if [[ "${ELECTRON_BIN}" == "npx" ]]; then
  cd "${WIDGET_DIR}"
  # Run electron against this folder (package.json main = main.cjs)
  npx --yes -p electron electron "${WIDGET_DIR}" &
else
  nohup "${ELECTRON_BIN}" "${WIDGET_DIR}" >/tmp/wonder-widget.log 2>&1 &
fi

# Full Wonder in Chrome (where it works for you)
open -a "Google Chrome" "http://127.0.0.1:5173/" 2>/dev/null || open "http://127.0.0.1:5173/"

echo "Wonder Base widget: always-on-top panel (right edge of screen)."
echo "Full Wonder:        http://127.0.0.1:5173/  (Chrome)"
echo "Close the small panel anytime — keeper keeps the server running."
