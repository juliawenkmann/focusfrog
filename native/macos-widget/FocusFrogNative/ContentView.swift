import SwiftUI

struct ContentView: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color(red: 0.86, green: 0.96, blue: 0.91))
                    Text("🐸")
                        .font(.system(size: 38))
                }
                .frame(width: 62, height: 62)

                VStack(alignment: .leading, spacing: 2) {
                    Text("FocusFrog")
                        .font(.largeTitle.weight(.bold))
                    Text("Native macOS widget")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
            }

            Text("Keep the regular FocusFrog app running so the widget can read today's work and non-work summary from the local server.")
                .font(.body)
                .foregroundStyle(.secondary)

            HStack {
                Button("Open FocusFrog") {
                    openURL(URL(string: "http://127.0.0.1:27180/#/home")!)
                }
                .buttonStyle(.borderedProminent)

                Button("Open Widget Data") {
                    openURL(URL(string: "http://127.0.0.1:27180/focusfrog-widget-summary")!)
                }
            }

            Divider()

            Text("After building and running this app, add the widget from macOS: Notification Center or Desktop > Edit Widgets > FocusFrog.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(28)
        .frame(minWidth: 520, minHeight: 300)
    }
}

#Preview {
    ContentView()
}
