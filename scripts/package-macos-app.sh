#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="FocusFrog"
APP_DIR="$ROOT_DIR/dist/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
WEBUI_DIR="$RESOURCES_DIR/webui"
ICONSET_DIR="$ROOT_DIR/dist/$APP_NAME.iconset"
ICON_SRC="$ROOT_DIR/static/logo.png"
SERVER_SRC="$ROOT_DIR/scripts/focusfrog-server.mjs"
WEBUI_TMP="$(mktemp -d "${TMPDIR:-/tmp}/focusfrog-webui.XXXXXX")"

cleanup() {
  rm -rf "$WEBUI_TMP"
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This packager creates a macOS .app bundle and must run on macOS." >&2
  exit 1
fi

if [[ ! -f "$ICON_SRC" ]]; then
  echo "Icon source not found: $ICON_SRC" >&2
  exit 1
fi

if [[ ! -f "$SERVER_SRC" ]]; then
  echo "Launcher server not found: $SERVER_SRC" >&2
  exit 1
fi

echo "Building FocusFrog web UI..."
npm run build -- --dest "$WEBUI_TMP"

echo "Creating $APP_DIR..."
rm -rf "$APP_DIR" "$ICONSET_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$WEBUI_DIR" "$ICONSET_DIR"

cp -R "$WEBUI_TMP/." "$WEBUI_DIR/"
cp "$SERVER_SRC" "$RESOURCES_DIR/focusfrog-server.mjs"

sips -z 16 16 "$ICON_SRC" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$ICON_SRC" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$ICON_SRC" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$ICON_SRC" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$ICON_SRC" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$ICON_SRC" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$ICON_SRC" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$ICON_SRC" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$ICON_SRC" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$ICON_SRC" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null
if ! iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/FocusFrog.icns"; then
  echo "iconutil could not compile the iconset; falling back to direct ICNS conversion."
  sips -s format icns "$ICON_SRC" --out "$RESOURCES_DIR/FocusFrog.icns" >/dev/null
fi
rm -rf "$ICONSET_DIR"

cat > "$CONTENTS_DIR/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>FocusFrog</string>
  <key>CFBundleExecutable</key>
  <string>FocusFrog</string>
  <key>CFBundleIconFile</key>
  <string>FocusFrog</string>
  <key>CFBundleIdentifier</key>
  <string>dev.focusfrog.FocusFrog</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>FocusFrog</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

cat > "$MACOS_DIR/FocusFrog" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail

APP_CONTENTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCES_DIR="$APP_CONTENTS/Resources"
PORT="${FOCUSFROG_PORT:-27180}"
FOCUSFROG_URL="http://127.0.0.1:${PORT}/#/home"
HEALTH_URL="http://127.0.0.1:${PORT}/focusfrog-healthz"
LOG_DIR="${TMPDIR:-/tmp}"
SERVER_LOG="$LOG_DIR/focusfrog-server.log"
AW_LOG="$LOG_DIR/focusfrog-activitywatch.log"
LAUNCH_AGENT_LABEL="dev.focusfrog.server.${PORT}"
LAUNCH_AGENT_PLIST="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$HOME/miniconda3/bin:$PATH"

show_dialog() {
  /usr/bin/osascript -e "display dialog \"$1\" buttons {\"OK\"} default button \"OK\" with title \"FocusFrog\"" >/dev/null 2>&1 || true
}

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  value="${value//\"/&quot;}"
  value="${value//\'/&apos;}"
  printf '%s' "$value"
}

url_ready() {
  /usr/bin/curl -fsS --max-time 1 "$1" >/dev/null 2>&1
}

focusfrog_server_current() {
  local health app api_version has_vision_images current_dist
  health="$(/usr/bin/curl -fsS --max-time 1 "$HEALTH_URL" 2>/dev/null)" || return 1
  app="$(printf '%s' "$health" | /usr/bin/plutil -extract app raw -o - - 2>/dev/null)" || return 1
  api_version="$(printf '%s' "$health" | /usr/bin/plutil -extract apiVersion raw -o - - 2>/dev/null)" || return 1
  has_vision_images="$(printf '%s' "$health" | /usr/bin/plutil -extract capabilities.visionBoardImages raw -o - - 2>/dev/null)" || return 1
  current_dist="$(printf '%s' "$health" | /usr/bin/plutil -extract distDir raw -o - - 2>/dev/null)" || return 1
  [[ "$app" == "FocusFrog" && "$api_version" == "2" && "$has_vision_images" == "true" && "$current_dist" == "$RESOURCES_DIR/webui" ]]
}

activitywatch_target() {
  if [[ -n "${AW_API_TARGET:-}" ]] && url_ready "$AW_API_TARGET/api/0/info"; then
    echo "$AW_API_TARGET"
    return 0
  fi

  for target in "http://127.0.0.1:5600" "http://127.0.0.1:5666"; do
    if url_ready "$target/api/0/info"; then
      echo "$target"
      return 0
    fi
  done

  return 1
}

start_activitywatch() {
  if [[ -d "/Applications/ActivityWatch.app" ]]; then
    /usr/bin/open -gj -a "ActivityWatch" >/dev/null 2>&1 || true
  elif [[ -d "$HOME/Applications/ActivityWatch.app" ]]; then
    /usr/bin/open -gj "$HOME/Applications/ActivityWatch.app" >/dev/null 2>&1 || true
  elif command -v aw-qt >/dev/null 2>&1; then
    nohup aw-qt >>"$AW_LOG" 2>&1 &
  fi
}

AW_TARGET="$(activitywatch_target || true)"
if [[ -z "$AW_TARGET" ]]; then
  start_activitywatch
  for _ in {1..30}; do
    AW_TARGET="$(activitywatch_target || true)"
    [[ -n "$AW_TARGET" ]] && break
    sleep 1
  done
fi

if [[ -z "$AW_TARGET" ]]; then
  AW_TARGET="http://127.0.0.1:5600"
  show_dialog "I could not reach ActivityWatch yet. I will open FocusFrog, but time data may load only after ActivityWatch is running."
fi

if ! focusfrog_server_current; then
  if ! url_ready "$HEALTH_URL" && url_ready "http://127.0.0.1:${PORT}/"; then
    show_dialog "Another app is already using FocusFrog's local port ${PORT}. Close that app or set FOCUSFROG_PORT to a free port, then try again."
    exit 1
  fi

  if ! command -v node >/dev/null 2>&1; then
    show_dialog "FocusFrog needs Node.js to run this local app bundle. Node was not found on PATH."
    exit 1
  fi

  NODE_BIN="$(command -v node)"
  NODE_MAJOR="$("$NODE_BIN" -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  if [[ ! "$NODE_MAJOR" =~ ^[0-9]+$ ]] || (( NODE_MAJOR < 20 )); then
    show_dialog "FocusFrog needs Node.js 20 or newer to run this local app bundle."
    exit 1
  fi

  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$LAUNCH_AGENT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$(xml_escape "$LAUNCH_AGENT_LABEL")</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$NODE_BIN")</string>
    <string>$(xml_escape "$RESOURCES_DIR/focusfrog-server.mjs")</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AW_API_TARGET</key>
    <string>$(xml_escape "$AW_TARGET")</string>
    <key>FOCUSFROG_DIST</key>
    <string>$(xml_escape "$RESOURCES_DIR/webui")</string>
    <key>FOCUSFROG_PORT</key>
    <string>$(xml_escape "$PORT")</string>
    <key>PATH</key>
    <string>$(xml_escape "$PATH")</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$SERVER_LOG")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$SERVER_LOG")</string>
</dict>
</plist>
PLIST

  /bin/launchctl bootout "gui/$(id -u)" "$LAUNCH_AGENT_PLIST" >/dev/null 2>&1 || true
  /bin/launchctl bootstrap "gui/$(id -u)" "$LAUNCH_AGENT_PLIST" >>"$SERVER_LOG" 2>&1 || true
  /bin/launchctl kickstart -k "gui/$(id -u)/$LAUNCH_AGENT_LABEL" >>"$SERVER_LOG" 2>&1 || true

  for _ in {1..20}; do
    focusfrog_server_current && break
    sleep 0.25
  done
fi

if ! focusfrog_server_current; then
  show_dialog "FocusFrog could not start its local server. See $SERVER_LOG for details."
  exit 1
fi

/usr/bin/open "$FOCUSFROG_URL"
LAUNCHER

chmod +x "$MACOS_DIR/FocusFrog"
chmod +x "$RESOURCES_DIR/focusfrog-server.mjs"

echo "Created $APP_DIR"
