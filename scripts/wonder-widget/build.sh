#!/usr/bin/env bash
# Compile Wonder Base floating widget (always-on-top WKWebView).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${ROOT}/scripts/wonder-widget/bin"
SRC="${ROOT}/scripts/wonder-widget/WonderBaseWidget.swift"
APP_DIR="${OUT_DIR}/WonderBaseWidget.app"
CONTENTS="${APP_DIR}/Contents"
MACOS="${CONTENTS}/MacOS"
mkdir -p "${MACOS}"

swiftc -O -framework Cocoa -framework WebKit \
  -o "${MACOS}/WonderBaseWidget" \
  "${SRC}"

cat > "${CONTENTS}/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Wonder Base</string>
  <key>CFBundleDisplayName</key>
  <string>Wonder Base</string>
  <key>CFBundleIdentifier</key>
  <string>com.wonder.base-widget</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>WonderBaseWidget</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
PLIST

# Convenience bare binary too
cp "${MACOS}/WonderBaseWidget" "${OUT_DIR}/WonderBaseWidget"
echo "Built: ${APP_DIR}"
