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
mkdir -p "$RESOURCES_DIR/tracking"
cp "$ROOT_DIR"/scripts/tracking/*.mjs "$RESOURCES_DIR/tracking/"
rm -f "$RESOURCES_DIR"/tracking/*.test.mjs
bash "$ROOT_DIR/scripts/build-macos-tracker.sh" "$RESOURCES_DIR"

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
TRACKER_LOG="$LOG_DIR/focusfrog-tracker.log"
SUPPORT_DIR="$HOME/Library/Application Support/FocusFrog"
TRACKING_DIR="$SUPPORT_DIR/tracking"
LAUNCH_AGENT_LABEL="dev.focusfrog.server.${PORT}"
LAUNCH_AGENT_PLIST="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"
# The tracker lives outside the app bundle: macOS ties its Accessibility permission
# to the exact binary, so it is only replaced when its source actually changed.
BUNDLED_TRACKER="$RESOURCES_DIR/FocusFrog Tracker.app"
TRACKER_APP="$SUPPORT_DIR/FocusFrog Tracker.app"
TRACKER_LABEL="dev.focusfrog.tracker"
TRACKER_PLIST="$HOME/Library/LaunchAgents/${TRACKER_LABEL}.plist"
AW_DATA_DIR="$HOME/Library/Application Support/activitywatch/aw-server"

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
  local health app api_version native current_dist
  health="$(/usr/bin/curl -fsS --max-time 1 "$HEALTH_URL" 2>/dev/null)" || return 1
  app="$(printf '%s' "$health" | /usr/bin/plutil -extract app raw -o - - 2>/dev/null)" || return 1
  api_version="$(printf '%s' "$health" | /usr/bin/plutil -extract apiVersion raw -o - - 2>/dev/null)" || return 1
  native="$(printf '%s' "$health" | /usr/bin/plutil -extract capabilities.nativeTracking raw -o - - 2>/dev/null)" || return 1
  current_dist="$(printf '%s' "$health" | /usr/bin/plutil -extract distDir raw -o - - 2>/dev/null)" || return 1
  [[ "$app" == "FocusFrog" && "$api_version" == "3" && "$native" == "true" && "$current_dist" == "$RESOURCES_DIR/webui" ]]
}

load_agent() {
  /bin/launchctl bootout "gui/$(id -u)" "$1" >/dev/null 2>&1 || true
  /bin/launchctl bootstrap "gui/$(id -u)" "$1" >>"$SERVER_LOG" 2>&1 || true
  /bin/launchctl kickstart -k "gui/$(id -u)/$2" >>"$SERVER_LOG" 2>&1 || true
}

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

mkdir -p "$SUPPORT_DIR" "$HOME/Library/LaunchAgents"

# First run after switching from ActivityWatch: bring its history along once.
if [[ ! -f "$TRACKING_DIR/buckets.json" && -f "$AW_DATA_DIR/peewee-sqlite.v2.db" ]]; then
  "$NODE_BIN" "$RESOURCES_DIR/tracking/import-activitywatch.mjs" \
    --dest "$TRACKING_DIR" --aw-dir "$AW_DATA_DIR" >>"$SERVER_LOG" 2>&1 \
    || show_dialog "FocusFrog could not import your ActivityWatch history. See $SERVER_LOG for details."
fi

if ! focusfrog_server_current; then
  if ! url_ready "$HEALTH_URL" && url_ready "http://127.0.0.1:${PORT}/"; then
    show_dialog "Another app is already using FocusFrog's local port ${PORT}. Close that app or set FOCUSFROG_PORT to a free port, then try again."
    exit 1
  fi

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
    <key>FOCUSFROG_TRACKING</key>
    <string>native</string>
    <key>FOCUSFROG_TRACKING_DIR</key>
    <string>$(xml_escape "$TRACKING_DIR")</string>
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
  <true/>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$SERVER_LOG")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$SERVER_LOG")</string>
</dict>
</plist>
PLIST

  load_agent "$LAUNCH_AGENT_PLIST" "$LAUNCH_AGENT_LABEL"
  for _ in {1..40}; do
    focusfrog_server_current && break
    sleep 0.25
  done
fi

if ! focusfrog_server_current; then
  show_dialog "FocusFrog could not start its local server. See $SERVER_LOG for details."
  exit 1
fi

if [[ -d "$BUNDLED_TRACKER" ]]; then
  TRACKER_CHANGED=0
  if [[ ! -d "$TRACKER_APP" ]] || ! /usr/bin/cmp -s \
    "$BUNDLED_TRACKER/Contents/Resources/source.sha256" "$TRACKER_APP/Contents/Resources/source.sha256"; then
    rm -rf "$TRACKER_APP"
    /usr/bin/ditto "$BUNDLED_TRACKER" "$TRACKER_APP"
    TRACKER_CHANGED=1
  fi

  TRACKER_BIN="$TRACKER_APP/Contents/MacOS/FocusFrogTracker"
  cat > "$TRACKER_PLIST.new" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$(xml_escape "$TRACKER_LABEL")</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$TRACKER_BIN")</string>
    <string>http://127.0.0.1:$(xml_escape "$PORT")</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$TRACKER_LOG")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$TRACKER_LOG")</string>
</dict>
</plist>
PLIST
  if (( TRACKER_CHANGED )) || ! /usr/bin/cmp -s "$TRACKER_PLIST.new" "$TRACKER_PLIST" \
    || ! /bin/launchctl print "gui/$(id -u)/$TRACKER_LABEL" >/dev/null 2>&1; then
    mv "$TRACKER_PLIST.new" "$TRACKER_PLIST"
    load_agent "$TRACKER_PLIST" "$TRACKER_LABEL"
  else
    rm -f "$TRACKER_PLIST.new"
  fi
fi

/usr/bin/open "$FOCUSFROG_URL"
LAUNCHER

chmod +x "$MACOS_DIR/FocusFrog"
chmod +x "$RESOURCES_DIR/focusfrog-server.mjs"

echo "Created $APP_DIR"
