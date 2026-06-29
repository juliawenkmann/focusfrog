#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT_DIR/native/macos-widget/FocusFrogNative.xcodeproj"
SCHEME="FocusFrogNative"
DERIVED_DATA="$ROOT_DIR/dist/focusfrog-native-widget-build"
BUILT_APP="$DERIVED_DATA/Build/Products/Release/FocusFrogNative.app"
OUT_APP="$ROOT_DIR/dist/FocusFrogNative.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The native macOS widget can only be built on macOS." >&2
  exit 1
fi

if ! xcodebuild -version >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Full Xcode is required to build the native FocusFrog WidgetKit app.

The Command Line Tools are not enough for WidgetKit packaging. Install Xcode
from the App Store, then select it with:

  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

After that, rerun:

  npm run package:mac-widget
EOF
  exit 1
fi

echo "Building FocusFrog native WidgetKit app..."
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -derivedDataPath "$DERIVED_DATA" \
  build

if [[ ! -d "$BUILT_APP" ]]; then
  echo "Build finished but expected app was not created: $BUILT_APP" >&2
  exit 1
fi

rm -rf "$OUT_APP"
cp -R "$BUILT_APP" "$OUT_APP"

cat <<EOF
Created:
  $OUT_APP

Run the normal FocusFrog app first so http://127.0.0.1:27180 is live.
Then open FocusFrogNative.app once and add the widget from:
  Notification Center or Desktop > Edit Widgets > FocusFrog
EOF
