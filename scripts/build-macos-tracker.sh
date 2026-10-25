#!/usr/bin/env bash
# Builds "FocusFrog Tracker.app", the background app that records the active window
# and idle time for FocusFrog (replacing ActivityWatch's watchers).
#
#   scripts/build-macos-tracker.sh [output-dir]
#
# The app embeds the SHA-256 of its source so installers can skip reinstalling an
# unchanged tracker.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/native/tracker/FocusFrogTracker.swift"
OUT_DIR="${1:-$ROOT_DIR/dist}"
APP="$OUT_DIR/FocusFrog Tracker.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The FocusFrog tracker can only be built on macOS." >&2
  exit 1
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -swift-version 5 -framework Cocoa -framework ScriptingBridge \
  "$SRC" -o "$APP/Contents/MacOS/FocusFrogTracker"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>FocusFrog Tracker</string>
  <key>CFBundleExecutable</key>
  <string>FocusFrogTracker</string>
  <key>CFBundleIdentifier</key>
  <string>dev.focusfrog.tracker</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>FocusFrog Tracker</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSAppleEventsUsageDescription</key>
  <string>FocusFrog reads the current tab's title and address in your browser so your browsing time is sorted into the right category.</string>
</dict>
</plist>
PLIST

shasum -a 256 "$SRC" | cut -d' ' -f1 > "$APP/Contents/Resources/source.sha256"
if [[ -f "$ROOT_DIR/static/logo.png" ]]; then
  ICONSET="$(mktemp -d "${TMPDIR:-/tmp}/focusfrog-tracker-icon.XXXXXX")/Tracker.iconset"
  mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$ROOT_DIR/static/logo.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    sips -z "$((size * 2))" "$((size * 2))" "$ROOT_DIR/static/logo.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
  done
  if iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns" 2>/dev/null; then
    /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "$APP/Contents/Info.plist"
  fi
  rm -rf "$(dirname "$ICONSET")"
fi

# An identifier-based requirement lets macOS keep the Accessibility/Automation grants
# across rebuilds (the default ad-hoc requirement is tied to the exact binary).
codesign --force --sign - --identifier dev.focusfrog.tracker \
  -r='designated => identifier "dev.focusfrog.tracker"' "$APP"
echo "Built $APP"
