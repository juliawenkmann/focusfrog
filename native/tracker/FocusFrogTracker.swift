// FocusFrog Tracker: records the active app and window (plus the current tab's URL in
// Chrome-based browsers and Safari) and whether you are at the keyboard, and sends
// ActivityWatch-style heartbeats to the local FocusFrog server.
//
// Window tracking is adapted from aw-watcher-window's macos.swift and idle tracking
// from aw-watcher-afk (ActivityWatch, MPL-2.0), keeping their heartbeat rules so the
// recorded events look exactly like the ones ActivityWatch produced.
import Cocoa
import ScriptingBridge

// MARK: - Browser scripting (from aw-watcher-window)

@objc protocol ChromeTab {
  @objc optional var URL: String { get }
  @objc optional var title: String { get }
}

@objc protocol ChromeWindow {
  @objc optional var activeTab: ChromeTab { get }
  @objc optional var mode: String { get }
}

extension SBObject: ChromeWindow, ChromeTab {}

@objc protocol ChromeProtocol {
  @objc optional func windows() -> [ChromeWindow]
}

extension SBApplication: ChromeProtocol {}

@objc public protocol SafariTab {
  @objc optional var URL: String { get }
  @objc optional var name: String { get }
}

@objc public protocol SafariWindow {
  @objc optional var currentTab: SafariTab { get }
}
extension SBObject: SafariWindow {}

@objc public protocol SafariApplication {
  @objc optional func windows() -> [SafariWindow]
}
extension SBApplication: SafariApplication {}

// MARK: - Logging

let logFormatter: DateFormatter = {
  let formatter = DateFormatter()
  formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
  return formatter
}()

func log(_ message: String) {
  print("\(logFormatter.string(from: Date())) [focusfrog-tracker] \(message)")
  fflush(stdout)
}

// MARK: - Settings

// Optional overrides in ~/Library/Application Support/FocusFrog/tracker-config.json, so
// tuning does not need a rebuild (a rebuild resets the macOS permissions).
struct TrackerConfig: Codable {
  var afkTimeoutSeconds: Double?
  // ActivityWatch recorded the browser's window title; true records the tab title instead.
  var preferTabTitles: Bool?

  static func load() -> TrackerConfig {
    let url = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/FocusFrog/tracker-config.json")
    guard let data = try? Data(contentsOf: url),
      let config = try? JSONDecoder().decode(TrackerConfig.self, from: data)
    else { return TrackerConfig() }
    log("Using settings from \(url.path)")
    return config
  }
}

let config = TrackerConfig.load()

// MARK: - Heartbeats

struct WindowData: Codable, Equatable {
  var app: String
  var title: String
  var url: String?
}

struct AfkData: Codable, Equatable {
  var status: String
}

struct Heartbeat<Payload: Codable>: Codable {
  var timestamp: Date
  var duration: Double
  var data: Payload
}

struct BucketRequest: Codable {
  var client: String
  var type: String
  var hostname: String
}

struct ServerInfo: Codable {
  var hostname: String
}

let isoFormatter: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter
}()

let encoder: JSONEncoder = {
  let encoder = JSONEncoder()
  encoder.dateEncodingStrategy = .custom { date, encoder in
    var container = encoder.singleValueContainer()
    try container.encode(isoFormatter.string(from: date))
  }
  return encoder
}()

// Sends requests one at a time, in order, off the main thread.
final class Server {
  let base: URL
  private let queue = DispatchQueue(label: "dev.focusfrog.tracker.requests")

  init(base: URL) {
    self.base = base
  }

  @discardableResult
  func requestSync(_ path: String, method: String = "GET", body: Data? = nil) -> (Int, Data?) {
    var request = URLRequest(url: URL(string: path, relativeTo: base)!)
    request.httpMethod = method
    request.timeoutInterval = 5
    if let body = body {
      request.httpBody = body
      request.addValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    let semaphore = DispatchSemaphore(value: 0)
    var result: (Int, Data?) = (0, nil)
    URLSession.shared.dataTask(with: request) { data, response, _ in
      result = ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
      semaphore.signal()
    }.resume()
    semaphore.wait()
    return result
  }

  func enqueue(_ path: String, body: Data) {
    queue.async {
      let (status, _) = self.requestSync(path, method: "POST", body: body)
      if !(200...299).contains(status) {
        log("Request to \(path) failed with status \(status)")
      }
    }
  }

  func heartbeat<Payload: Codable>(bucket: String, _ heartbeat: Heartbeat<Payload>, pulsetime: Double) {
    let encodedBucket = bucket.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? bucket
    guard let body = try? encoder.encode(heartbeat) else { return }
    enqueue("/api/0/buckets/\(encodedBucket)/heartbeat?pulsetime=\(pulsetime)", body: body)
  }

  func createBucket(_ bucket: String, client: String, type: String, hostname: String) {
    let encodedBucket = bucket.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? bucket
    guard let body = try? encoder.encode(BucketRequest(client: client, type: type, hostname: hostname)) else {
      return
    }
    queue.async {
      self.requestSync("/api/0/buckets/\(encodedBucket)", method: "POST", body: body)
    }
  }
}

// MARK: - Idle tracking (aw-watcher-afk: timeout 180 s, poll 5 s)

final class AfkTracker {
  let server: Server
  let bucket: String
  let timeout = config.afkTimeoutSeconds ?? 180.0
  let pollTime = 5.0
  var afk = false
  var timer: Timer?

  init(server: Server, bucket: String) {
    self.server = server
    self.bucket = bucket
  }

  func secondsSinceLastInput() -> Double {
    return CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: CGEventType(rawValue: ~0)!)
  }

  func ping(_ isAfk: Bool, timestamp: Date, duration: Double = 0) {
    let heartbeat = Heartbeat(timestamp: timestamp, duration: duration, data: AfkData(status: isAfk ? "afk" : "not-afk"))
    server.heartbeat(bucket: bucket, heartbeat, pulsetime: timeout + pollTime)
  }

  func poll() {
    let now = Date()
    let idle = secondsSinceLastInput()
    let lastInput = now.addingTimeInterval(-idle)
    let oneMs = 0.001
    if afk && idle < timeout {
      log("No longer AFK")
      ping(afk, timestamp: lastInput)
      afk = false
      ping(afk, timestamp: lastInput.addingTimeInterval(oneMs))
    } else if !afk && idle >= timeout {
      log("Became AFK")
      ping(afk, timestamp: lastInput)
      afk = true
      ping(afk, timestamp: lastInput.addingTimeInterval(oneMs), duration: idle)
    } else if afk {
      ping(afk, timestamp: lastInput.addingTimeInterval(oneMs), duration: idle)
    } else {
      ping(afk, timestamp: lastInput)
    }
  }

  func start() {
    poll()
    timer = Timer.scheduledTimer(withTimeInterval: pollTime, repeats: true) { [weak self] _ in self?.poll() }
  }
}

// MARK: - Window tracking (aw-watcher-window's macos.swift)

final class WindowTracker {
  let server: Server
  let bucket: String
  var observer: AXObserver?
  var oldWindow: AXUIElement?
  var pollingTimer: Timer?
  var fallbackTimer: Timer?
  var trustTimer: Timer?
  var lastSent: (timestamp: Date, data: WindowData)?

  let chromeBrowsers = ["Google Chrome", "Google Chrome Canary", "Chromium", "Brave Browser", "Arc"]

  init(server: Server, bucket: String) {
    self.server = server
    self.bucket = bucket
  }

  func start() {
    let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as NSString
    if AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary) {
      startObserving()
      return
    }
    // Until Accessibility is allowed, record app names (and browser tabs) by polling,
    // then switch to window-level tracking as soon as access is granted.
    log("Accessibility access not granted yet; recording app names only")
    fallbackTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
      self?.recordFrontmost(axWindow: nil)
    }
    trustTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] timer in
      guard let self = self, AXIsProcessTrusted() else { return }
      timer.invalidate()
      self.fallbackTimer?.invalidate()
      log("Accessibility access granted; recording window titles")
      self.startObserving()
    }
  }

  func startObserving() {
    NSWorkspace.shared.notificationCenter.addObserver(
      self,
      selector: #selector(focusedAppChanged),
      name: NSWorkspace.didActivateApplicationNotification,
      object: nil
    )
    focusedAppChanged()
    pollingTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
      self?.pollActiveWindow()
    }
  }

  func send(_ data: WindowData, at timestamp: Date) {
    let sinceLast = lastSent.map { timestamp.timeIntervalSince($0.timestamp) } ?? -1
    // Window resizes fire many notifications; keep at least ~1 s between heartbeats.
    if sinceLast != -1 && sinceLast <= 0.5 { return }
    if let previous = lastSent, previous.data != data {
      // Extend the previous window's event up to the moment of the switch.
      server.heartbeat(
        bucket: bucket,
        Heartbeat(timestamp: timestamp.addingTimeInterval(-0.001), duration: 0, data: previous.data),
        pulsetime: sinceLast + 1
      )
    }
    server.heartbeat(bucket: bucket, Heartbeat(timestamp: timestamp, duration: 0, data: data), pulsetime: max(sinceLast, 0) + 1)
    lastSent = (timestamp, data)
  }

  func recordFrontmost(axWindow: AXUIElement?) {
    guard let frontmost = NSWorkspace.shared.frontmostApplication else { return }
    let now = Date()
    var windowTitle: AnyObject?
    if let axWindow = axWindow {
      AXUIElementCopyAttributeValue(axWindow, kAXTitleAttribute as CFString, &windowTitle)
    }
    let appName = frontmost.localizedName ?? frontmost.bundleIdentifier ?? ""
    var data = WindowData(app: appName, title: windowTitle as? String ?? "", url: nil)

    if chromeBrowsers.contains(appName), let bundleId = frontmost.bundleIdentifier,
      let chrome = SBApplication(bundleIdentifier: bundleId) as ChromeProtocol?,
      let window = chrome.windows?().first, let tab = window.activeTab
    {
      if window.mode == "incognito" {
        data = WindowData(app: "", title: "", url: nil)
      } else {
        data.url = tab.URL
        if let tabTitle = tab.title, !tabTitle.isEmpty, data.title.isEmpty || config.preferTabTitles == true {
          data.title = tabTitle
        }
      }
    } else if appName == "Safari", let bundleId = frontmost.bundleIdentifier,
      let safari = SBApplication(bundleIdentifier: bundleId) as SafariApplication?,
      let window = safari.windows?().first, let tab = window.currentTab
    {
      data.url = tab.URL
      if let tabTitle = tab.name, !tabTitle.isEmpty, data.title.isEmpty || config.preferTabTitles == true {
        data.title = tabTitle
      }
    }
    send(data, at: now)
  }

  func pollActiveWindow() {
    guard let frontmost = NSWorkspace.shared.frontmostApplication else { return }
    let app = AXUIElementCreateApplication(frontmost.processIdentifier)
    var focusedWindow: AnyObject?
    AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &focusedWindow)
    if let focusedWindow = focusedWindow {
      focusedWindowChanged(window: focusedWindow as! AXUIElement)
    } else {
      recordFrontmost(axWindow: nil)
    }
  }

  func focusedWindowChanged(window: AXUIElement) {
    if let observer = observer {
      if let oldWindow = oldWindow {
        AXObserverRemoveNotification(observer, oldWindow, kAXTitleChangedNotification as CFString)
      }
      let selfPointer = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
      AXObserverAddNotification(observer, window, kAXTitleChangedNotification as CFString, selfPointer)
    }
    recordFrontmost(axWindow: window)
    oldWindow = window
  }

  @objc func focusedAppChanged() {
    if let observer = observer {
      CFRunLoopRemoveSource(RunLoop.current.getCFRunLoop(), AXObserverGetRunLoopSource(observer), .defaultMode)
    }
    observer = nil
    oldWindow = nil
    guard let frontmost = NSWorkspace.shared.frontmostApplication else { return }
    let pid = frontmost.processIdentifier
    let app = AXUIElementCreateApplication(pid)

    var newObserver: AXObserver?
    AXObserverCreate(pid, { _, element, notification, userData in
      guard let userData = userData else { return }
      let tracker = Unmanaged<WindowTracker>.fromOpaque(userData).takeUnretainedValue()
      if notification == kAXFocusedWindowChangedNotification as CFString {
        tracker.focusedWindowChanged(window: element)
      } else {
        tracker.recordFrontmost(axWindow: element)
      }
    }, &newObserver)

    guard let created = newObserver else {
      recordFrontmost(axWindow: nil)
      return
    }
    observer = created
    let selfPointer = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
    AXObserverAddNotification(created, app, kAXFocusedWindowChangedNotification as CFString, selfPointer)
    CFRunLoopAddSource(RunLoop.current.getCFRunLoop(), AXObserverGetRunLoopSource(created), .defaultMode)

    var focusedWindow: AnyObject?
    AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &focusedWindow)
    if let focusedWindow = focusedWindow {
      focusedWindowChanged(window: focusedWindow as! AXUIElement)
    } else {
      recordFrontmost(axWindow: nil)
    }
  }
}

// MARK: - Startup

let serverURL = URL(string: CommandLine.arguments.dropFirst().first
  ?? ProcessInfo.processInfo.environment["FOCUSFROG_URL"]
  ?? "http://127.0.0.1:27180")!
let server = Server(base: serverURL)
var windowTracker: WindowTracker?
var afkTracker: AfkTracker?

// Uses the server's hostname so bucket ids stay the same as ActivityWatch's.
func connect() {
  DispatchQueue.global().async {
    let (status, data) = server.requestSync("/api/0/info")
    guard status == 200, let data = data, let info = try? JSONDecoder().decode(ServerInfo.self, from: data) else {
      log("FocusFrog server not reachable at \(serverURL.absoluteString); retrying in 5 s")
      DispatchQueue.main.asyncAfter(deadline: .now() + 5) { connect() }
      return
    }
    DispatchQueue.main.async {
      let windowBucket = "aw-watcher-window_\(info.hostname)"
      let afkBucket = "aw-watcher-afk_\(info.hostname)"
      server.createBucket(windowBucket, client: "aw-watcher-window", type: "currentwindow", hostname: info.hostname)
      server.createBucket(afkBucket, client: "aw-watcher-afk", type: "afkstatus", hostname: info.hostname)
      log("Recording to \(serverURL.absoluteString) as \(info.hostname)")
      windowTracker = WindowTracker(server: server, bucket: windowBucket)
      windowTracker?.start()
      afkTracker = AfkTracker(server: server, bucket: afkBucket)
      afkTracker?.start()
    }
  }
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
connect()
application.run()
