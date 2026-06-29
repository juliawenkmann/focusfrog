#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="FocusFrog"
SOURCE_APP="${1:-$ROOT_DIR/dist/$APP_NAME.app}"
TARGET_APP="$HOME/Applications/$APP_NAME.app"
APP_URL="file://$TARGET_APP/"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer only works on macOS." >&2
  exit 1
fi

if [[ ! -d "$SOURCE_APP" ]]; then
  echo "App bundle not found: $SOURCE_APP" >&2
  echo "Run npm run package:mac first." >&2
  exit 1
fi

mkdir -p "$HOME/Applications"
/usr/bin/ditto "$SOURCE_APP" "$TARGET_APP"
/usr/bin/xattr -dr com.apple.quarantine "$TARGET_APP" >/dev/null 2>&1 || true
/usr/bin/touch "$TARGET_APP"

LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -f "$TARGET_APP" >/dev/null 2>&1 || true
fi

if /usr/bin/defaults read com.apple.dock persistent-apps 2>/dev/null | /usr/bin/grep -q "$TARGET_APP"; then
  echo "$APP_NAME is already in the Dock."
else
  /usr/bin/defaults write com.apple.dock persistent-apps -array-add "
<dict>
  <key>tile-data</key>
  <dict>
    <key>file-data</key>
    <dict>
      <key>_CFURLString</key>
      <string>$APP_URL</string>
      <key>_CFURLStringType</key>
      <integer>15</integer>
    </dict>
    <key>file-label</key>
    <string>$APP_NAME</string>
  </dict>
  <key>tile-type</key>
  <string>file-tile</string>
</dict>"
  /usr/bin/killall Dock >/dev/null 2>&1 || true
  echo "Added $APP_NAME to the Dock."
fi

echo "Installed $TARGET_APP"
