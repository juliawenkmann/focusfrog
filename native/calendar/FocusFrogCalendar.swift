// FocusFrog Calendar: reads the calendars of this Mac (everything the Calendar app shows:
// iCloud, Google, Exchange, subscriptions, ...) and hands their entries to FocusFrog's local
// server, which shows them read-only in Time blocking. It never writes to a calendar, and the
// entries stay on this Mac: the server keeps them in memory only.
//
// A separate app from the tracker: macOS ties the Calendars permission to this app, so the
// tracker (and its Accessibility permission) is never touched by it.
//
//   FocusFrogCalendar [server-url]   keeps the server up to date (run by a LaunchAgent)
//   FocusFrogCalendar --once [url]   reads once, sends, prints a summary, quits
import Cocoa
import EventKit

func log(_ message: String) {
  FileHandle.standardError.write("[FocusFrog Calendar] \(message)\n".data(using: .utf8)!)
}

struct CalendarInfo: Codable, Equatable {
  let id: String
  let title: String
  let color: String
  let source: String
}

struct Entry: Codable {
  let id: String
  let calendarId: String
  let title: String
  let location: String
  // A timed entry: its start and end as ISO times. An all-day one: its first day and the day
  // after its last, as local dates.
  let start: String
  let end: String
  let allDay: Bool
  // False for entries marked "free": todos may still be placed over them.
  let busy: Bool
}

struct Snapshot: Codable {
  let status: String
  let updatedAt: String
  let from: String
  let to: String
  let calendars: [CalendarInfo]
  let events: [Entry]
}

// As far back and ahead as the Time blocking strip scrolls (src/util/dayStrip.ts).
let daysBack = 731
let daysAhead = 731
let refreshSeconds: TimeInterval = 5 * 60
let retrySeconds: TimeInterval = 30

let isoTime: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  return formatter
}()

let localDay: DateFormatter = {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.calendar = Calendar(identifier: .gregorian)
  formatter.timeZone = TimeZone.current
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter
}()

func hexColor(_ color: CGColor?) -> String {
  guard let color = color, let rgb = NSColor(cgColor: color)?.usingColorSpace(.sRGB) else {
    return "#64748b"
  }
  let channel = { (value: CGFloat) in Int((max(0, min(1, value)) * 255).rounded()) }
  return String(
    format: "#%02x%02x%02x", channel(rgb.redComponent), channel(rgb.greenComponent),
    channel(rgb.blueComponent))
}

func hasAccess() -> Bool {
  let status = EKEventStore.authorizationStatus(for: .event)
  if #available(macOS 14.0, *) { return status == .fullAccess }
  return status == .authorized
}

func accessUndecided() -> Bool {
  EKEventStore.authorizationStatus(for: .event) == .notDetermined
}

func declinedByMe(_ event: EKEvent) -> Bool {
  event.attendees?.contains { $0.isCurrentUser && $0.participantStatus == .declined } ?? false
}

func read(_ store: EKEventStore) -> Snapshot {
  let calendar = Calendar.current
  let today = calendar.startOfDay(for: Date())
  let from = calendar.date(byAdding: .day, value: -daysBack, to: today)!
  let to = calendar.date(byAdding: .day, value: daysAhead + 1, to: today)!
  let calendars = store.calendars(for: .event)
  var seen = Set<String>()
  var entries: [Entry] = []

  // EventKit answers at most four years per question; a year at a time keeps each answer small.
  var chunkStart = from
  while chunkStart < to {
    let chunkEnd = min(calendar.date(byAdding: .day, value: 366, to: chunkStart)!, to)
    let predicate = store.predicateForEvents(withStart: chunkStart, end: chunkEnd, calendars: calendars)
    for event in store.events(matching: predicate) {
      guard let start = event.startDate, let end = event.endDate, let owner = event.calendar else {
        continue
      }
      if event.status == .canceled || declinedByMe(event) { continue }
      // Each time a repeating entry happens has the same item id; its start tells them apart.
      let id = "\(event.calendarItemIdentifier)@\(Int(start.timeIntervalSince1970))"
      if !seen.insert(id).inserted { continue }
      let startText: String
      let endText: String
      if event.isAllDay {
        let firstDay = calendar.startOfDay(for: start)
        let lastDay = calendar.startOfDay(for: max(start, end.addingTimeInterval(-1)))
        startText = localDay.string(from: firstDay)
        endText = localDay.string(from: calendar.date(byAdding: .day, value: 1, to: lastDay)!)
      } else {
        startText = isoTime.string(from: start)
        endText = isoTime.string(from: max(start, end))
      }
      entries.append(
        Entry(
          id: id,
          calendarId: owner.calendarIdentifier,
          title: event.title ?? "",
          location: event.location ?? "",
          start: startText,
          end: endText,
          allDay: event.isAllDay,
          busy: event.availability != .free))
    }
    chunkStart = chunkEnd
  }

  return Snapshot(
    status: "granted",
    updatedAt: isoTime.string(from: Date()),
    from: localDay.string(from: from),
    to: localDay.string(from: calendar.date(byAdding: .day, value: daysAhead, to: today)!),
    calendars: calendars.map {
      CalendarInfo(
        id: $0.calendarIdentifier, title: $0.title, color: hexColor($0.cgColor),
        source: $0.source?.title ?? "")
    }.sorted { ($0.source, $0.title) < ($1.source, $1.title) },
    events: entries)
}

func noAccessSnapshot() -> Snapshot {
  let now = isoTime.string(from: Date())
  return Snapshot(
    status: accessUndecided() ? "waiting" : "denied", updatedAt: now, from: "", to: "",
    calendars: [], events: [])
}

// Sends the snapshot; calls back whether the server took it.
func send(_ snapshot: Snapshot, to server: URL, done: @escaping (Bool) -> Void) {
  var request = URLRequest(url: server.appendingPathComponent("focusfrog-calendar"))
  request.httpMethod = "POST"
  request.setValue("application/json", forHTTPHeaderField: "Content-Type")
  request.timeoutInterval = 20
  do {
    request.httpBody = try JSONEncoder().encode(snapshot)
  } catch {
    log("Could not encode the calendar entries: \(error)")
    done(false)
    return
  }
  URLSession.shared.dataTask(with: request) { _, response, error in
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if status < 200 || status >= 300 {
      log("FocusFrog server did not take the entries (\(error?.localizedDescription ?? "HTTP \(status)"))")
    }
    done(status >= 200 && status < 300)
  }.resume()
}

final class CalendarFeed {
  let server: URL
  var store = EKEventStore()
  var storeHasAccess = false
  var timer: Timer?
  var pending: DispatchWorkItem?

  init(server: URL) {
    self.server = server
  }

  func start() {
    NotificationCenter.default.addObserver(
      self, selector: #selector(storeChanged), name: .EKEventStoreChanged, object: nil)
    askForAccess { [weak self] in self?.refresh() }
  }

  func askForAccess(then: @escaping () -> Void) {
    guard accessUndecided() else {
      then()
      return
    }
    // A background app: bring the question to the front so it is not missed.
    NSApplication.shared.activate(ignoringOtherApps: true)
    let answered: (Bool, Error?) -> Void = { granted, error in
      if let error = error { log("Calendar access request failed: \(error.localizedDescription)") }
      log(granted ? "Calendar access granted" : "Calendar access not granted")
      DispatchQueue.main.async(execute: then)
    }
    if #available(macOS 14.0, *) {
      store.requestFullAccessToEvents(completion: answered)
    } else {
      store.requestAccess(to: .event, completion: answered)
    }
  }

  @objc func storeChanged() {
    // A sync brings many changes at once: read once they have settled.
    pending?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.refresh() }
    pending = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: work)
  }

  func refresh() {
    let snapshot: Snapshot
    if hasAccess() {
      // Access given later (in System Settings) needs a fresh store to see the calendars.
      if !storeHasAccess {
        store = EKEventStore()
        storeHasAccess = true
      }
      snapshot = read(store)
    } else {
      storeHasAccess = false
      snapshot = noAccessSnapshot()
    }
    send(snapshot, to: server) { [weak self] ok in
      DispatchQueue.main.async { self?.schedule(after: ok ? refreshSeconds : retrySeconds) }
    }
  }

  func schedule(after seconds: TimeInterval) {
    timer?.invalidate()
    timer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
      self?.refresh()
    }
  }
}

let arguments = Array(CommandLine.arguments.dropFirst())
let once = arguments.contains("--once")
let serverURL = URL(
  string: arguments.first { !$0.hasPrefix("--") }
    ?? ProcessInfo.processInfo.environment["FOCUSFROG_URL"]
    ?? "http://127.0.0.1:27180")!

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
let feed = CalendarFeed(server: serverURL)

if once {
  feed.askForAccess {
    let snapshot = hasAccess() ? read(EKEventStore()) : noAccessSnapshot()
    print(
      "status=\(snapshot.status) calendars=\(snapshot.calendars.count) entries=\(snapshot.events.count) from=\(snapshot.from) to=\(snapshot.to)"
    )
    send(snapshot, to: serverURL) { ok in
      print(ok ? "sent to \(serverURL.absoluteString)" : "not sent")
      exit(ok ? 0 : 1)
    }
  }
} else {
  feed.start()
}
application.run()
