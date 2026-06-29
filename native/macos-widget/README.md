# FocusFrog Native macOS Widget

This folder contains a small SwiftUI host app plus a WidgetKit extension. The widget reads:

```text
http://127.0.0.1:27180/focusfrog-widget-summary
```

So the regular FocusFrog app/server must be running for live values.

## Build

Full Xcode is required. The Command Line Tools alone are not enough for WidgetKit packaging.

```bash
npm run package:mac-widget
```

Or open `FocusFrogNative.xcodeproj` in Xcode, select the `FocusFrogNative` scheme, set a signing team if Xcode asks, and build/run.

## Add The Widget

After the native app has been built and run once:

1. Open Notification Center or Control-click the Desktop.
2. Choose `Edit Widgets`.
3. Search for `FocusFrog`.
4. Add the small or medium widget.

If the widget says FocusFrog is offline, start the normal FocusFrog app first.
