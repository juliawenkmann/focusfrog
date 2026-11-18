#!/usr/bin/env bash
# Builds "FocusFrog Calendar.app", the background app that reads the Mac's calendars and
# hands their entries to FocusFrog's local server for Time blocking.
#
#   scripts/build-macos-calendar.sh [output-dir]
#
# The app embeds the SHA-256 of its source so installers can skip reinstalling an
# unchanged helper.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/native/calendar/FocusFrogCalendar.swift"
OUT_DIR="${1:-$ROOT_DIR/dist}"
APP="$OUT_DIR/FocusFrog Calendar.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The FocusFrog calendar helper can only be built on macOS." >&2
  exit 1
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -swift-version 5 -framework Cocoa -framework EventKit \
  "$SRC" -o "$APP/Contents/MacOS/FocusFrogCalendar"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>FocusFrog Calendar</string>
  <key>CFBundleExecutable</key>
  <string>FocusFrogCalendar</string>
  <key>CFBundleIdentifier</key>
  <string>dev.focusfrog.calendar</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>FocusFrog Calendar</string>
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
  <key>NSCalendarsUsageDescription</key>
  <string>FocusFrog shows your calendar entries in Time blocking, so you can plan around them. It only reads them, and they stay on this Mac.</string>
  <key>NSCalendarsFullAccessUsageDescription</key>
  <string>FocusFrog shows your calendar entries in Time blocking, so you can plan around them. It only reads them, and they stay on this Mac.</string>
</dict>
</plist>
PLIST

shasum -a 256 "$SRC" | cut -d' ' -f1 > "$APP/Contents/Resources/source.sha256"
if [[ -f "$ROOT_DIR/static/logo.png" ]]; then
  ICONSET="$(mktemp -d "${TMPDIR:-/tmp}/focusfrog-calendar-icon.XXXXXX")/Calendar.iconset"
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

# An identifier-based requirement lets macOS keep the Calendars grant across rebuilds
# (the default ad-hoc requirement is tied to the exact binary).
codesign --force --sign - --identifier dev.focusfrog.calendar \
  -r='designated => identifier "dev.focusfrog.calendar"' "$APP"
echo "Built $APP"
