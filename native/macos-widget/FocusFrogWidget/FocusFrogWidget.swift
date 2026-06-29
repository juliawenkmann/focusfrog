import SwiftUI
import WidgetKit

private let focusFrogWidgetURL = URL(string: "http://127.0.0.1:27180/focusfrog-widget-summary")!

struct FocusFrogSummary: Decodable {
    let ok: Bool
    let label: String
    let generatedAt: String
    let activeSeconds: Double
    let workSeconds: Double
    let notWorkSeconds: Double
    let workPercent: Int
    let notWorkPercent: Int
    let workColor: String
    let notWorkColor: String
    let refreshAfterSeconds: Double

    static let placeholder = FocusFrogSummary(
        ok: true,
        label: "Today",
        generatedAt: ISO8601DateFormatter().string(from: Date()),
        activeSeconds: 4 * 3600 + 20 * 60,
        workSeconds: 3 * 3600 + 10 * 60,
        notWorkSeconds: 70 * 60,
        workPercent: 73,
        notWorkPercent: 27,
        workColor: "#059669",
        notWorkColor: "#db2777",
        refreshAfterSeconds: 300
    )

    static let unavailable = FocusFrogSummary(
        ok: false,
        label: "FocusFrog offline",
        generatedAt: ISO8601DateFormatter().string(from: Date()),
        activeSeconds: 0,
        workSeconds: 0,
        notWorkSeconds: 0,
        workPercent: 0,
        notWorkPercent: 0,
        workColor: "#059669",
        notWorkColor: "#db2777",
        refreshAfterSeconds: 300
    )
}

struct FocusFrogEntry: TimelineEntry {
    let date: Date
    let summary: FocusFrogSummary
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> FocusFrogEntry {
        FocusFrogEntry(date: Date(), summary: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (FocusFrogEntry) -> Void) {
        completion(FocusFrogEntry(date: Date(), summary: context.isPreview ? .placeholder : .unavailable))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FocusFrogEntry>) -> Void) {
        Task {
            let summary = await loadSummary()
            let entry = FocusFrogEntry(date: Date(), summary: summary)
            let nextUpdate = Date().addingTimeInterval(max(60, summary.refreshAfterSeconds))
            completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
        }
    }

    private func loadSummary() async -> FocusFrogSummary {
        do {
            let (data, response) = try await URLSession.shared.data(from: focusFrogWidgetURL)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                return .unavailable
            }
            let summary = try JSONDecoder().decode(FocusFrogSummary.self, from: data)
            return summary.ok ? summary : .unavailable
        } catch {
            return .unavailable
        }
    }
}

struct FocusFrogWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FocusFrogEntry

    private var summary: FocusFrogSummary {
        entry.summary
    }

    private var workRatio: Double {
        guard summary.activeSeconds > 0 else { return 0 }
        return min(1, max(0, summary.workSeconds / summary.activeSeconds))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 8 : 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("FocusFrog")
                        .font(.headline.weight(.bold))
                    Text(summary.label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("🐸")
                    .font(.title2)
            }

            if summary.ok && summary.activeSeconds > 0 {
                if family == .systemSmall {
                    smallLayout
                } else {
                    mediumLayout
                }
            } else {
                unavailableLayout
            }
        }
        .padding()
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [
                    Color(red: 0.96, green: 1.0, blue: 0.98),
                    Color(red: 1.0, green: 0.96, blue: 0.98)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private var smallLayout: some View {
        VStack(alignment: .leading, spacing: 10) {
            donut
                .frame(width: 72, height: 72)
            metricRow("Work", seconds: summary.workSeconds, color: workColor)
            metricRow("Not work", seconds: summary.notWorkSeconds, color: notWorkColor)
        }
    }

    private var mediumLayout: some View {
        HStack(spacing: 14) {
            donut
                .frame(width: 96, height: 96)
            VStack(alignment: .leading, spacing: 10) {
                metricRow("Work", seconds: summary.workSeconds, color: workColor, percent: summary.workPercent)
                metricRow("Not work", seconds: summary.notWorkSeconds, color: notWorkColor, percent: summary.notWorkPercent)
                metricRow("Total", seconds: summary.activeSeconds, color: Color.blue)
            }
        }
    }

    private var unavailableLayout: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Start FocusFrog")
                .font(.title3.weight(.bold))
            Text("The widget updates when the local FocusFrog server is running.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var donut: some View {
        ZStack {
            Circle()
                .stroke(notWorkColor.opacity(0.28), lineWidth: 14)
            Circle()
                .trim(from: 0, to: workRatio)
                .stroke(workColor, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 1) {
                Text(formatHours(summary.activeSeconds))
                    .font(.headline.weight(.bold))
                Text("total")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var workColor: Color {
        Color(hex: summary.workColor) ?? Color(red: 0.02, green: 0.59, blue: 0.41)
    }

    private var notWorkColor: Color {
        Color(hex: summary.notWorkColor) ?? Color(red: 0.86, green: 0.15, blue: 0.47)
    }

    private func metricRow(_ label: String, seconds: Double, color: Color, percent: Int? = nil) -> some View {
        HStack(spacing: 7) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.caption.weight(.semibold))
            Spacer(minLength: 4)
            Text(formatHours(seconds))
                .font(.caption.weight(.bold))
            if let percent {
                Text("\(percent)%")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func formatHours(_ seconds: Double) -> String {
        let totalMinutes = max(0, Int((seconds / 60).rounded()))
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60
        if hours == 0 {
            return "\(minutes)m"
        }
        return "\(hours)h \(String(format: "%02d", minutes))m"
    }
}

extension Color {
    init?(hex: String) {
        let value = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        guard value.count == 6, let integer = Int(value, radix: 16) else {
            return nil
        }
        let red = Double((integer >> 16) & 0xff) / 255.0
        let green = Double((integer >> 8) & 0xff) / 255.0
        let blue = Double(integer & 0xff) / 255.0
        self.init(red: red, green: green, blue: blue)
    }
}

@main
struct FocusFrogNativeWidget: Widget {
    let kind = "FocusFrogNativeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            FocusFrogWidgetView(entry: entry)
        }
        .configurationDisplayName("FocusFrog")
        .description("Shows today's work, non-work, and active time.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#Preview(as: .systemMedium) {
    FocusFrogNativeWidget()
} timeline: {
    FocusFrogEntry(date: Date(), summary: .placeholder)
}
