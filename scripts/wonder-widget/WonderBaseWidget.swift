/**
 * Wonder Base Widget — tiny always-on-top Mac panel.
 * Loads http://127.0.0.1:5173/?widget=1 (same habit data as full Wonder).
 *
 * Build:  bash scripts/wonder-widget/build.sh
 * Run:    npm run wonder:widget
 */
import Cocoa
import WebKit

final class WidgetController: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
  private var window: NSWindow!
  private var webView: WKWebView!
  private let startURL = URL(string: "http://127.0.0.1:5173/?widget=1")!

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory) // dock-less floating tool

    let width: CGFloat = 380
    let height: CGFloat = 720
    let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
    // Park on the right edge so it stays out of the way
    let origin = NSPoint(
      x: screen.maxX - width - 16,
      y: screen.midY - height / 2
    )
    let frame = NSRect(origin: origin, size: NSSize(width: width, height: height))

    window = NSWindow(
      contentRect: frame,
      styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    window.title = "Wonder · Base"
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .visible
    window.isMovableByWindowBackground = true
    window.backgroundColor = NSColor(calibratedWhite: 0.02, alpha: 0.92)
    window.isOpaque = false
    window.hasShadow = true
    window.minSize = NSSize(width: 300, height: 420)
    // Stay above normal apps, join every Space, visible in fullscreen auxiliaries
    window.level = .floating
    window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    window.delegate = self

    let config = WKWebViewConfiguration()
    config.preferences.isElementFullscreenEnabled = false
    webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = self
    webView.setValue(false, forKey: "drawsBackground")
    webView.allowsBackForwardNavigationGestures = false
    window.contentView = webView

    loadWidget()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)

    // Hot reload if Vite was briefly down when we launched
    Timer.scheduledTimer(withTimeInterval: 8, repeats: true) { [weak self] _ in
      self?.pingAndReloadIfNeeded()
    }
  }

  private func loadWidget() {
    webView.load(URLRequest(url: startURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15))
  }

  private func pingAndReloadIfNeeded() {
    guard let url = URL(string: "http://127.0.0.1:5173/") else { return }
    let task = URLSession.shared.dataTask(with: url) { [weak self] _, response, error in
      let code = (response as? HTTPURLResponse)?.statusCode ?? 0
      if error != nil || code < 200 || code >= 400 {
        return
      }
      DispatchQueue.main.async {
        // If still showing error page / blank, soft reload
        self?.webView.evaluateJavaScript("document.body && document.body.innerText.length") { result, _ in
          let len = result as? Int ?? 0
          if len < 8 {
            self?.loadWidget()
          }
        }
      }
    }
    task.resume()
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    showOfflineHTML(error.localizedDescription)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    showOfflineHTML(error.localizedDescription)
  }

  private func showOfflineHTML(_ detail: String) {
    let html = """
    <!doctype html><html><head><meta charset="utf-8"/>
    <style>
      body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:Georgia,serif;background:#050505;color:#eee;text-align:center;padding:24px}
      p{opacity:.55;font-size:13px;max-width:28ch;line-height:1.4}
      h1{font-size:18px;font-weight:600;margin:0 0 8px}
      code{font-size:12px;opacity:.8}
    </style></head><body>
    <div>
      <h1>Wonder is offline</h1>
      <p>Start the keeper, then this panel reloads itself.</p>
      <p><code>npm run wonder:start</code></p>
      <p style="opacity:.35">\(detail.replacingOccurrences(of: "<", with: "&lt;"))</p>
    </div></body></html>
    """
    webView.loadHTMLString(html, baseURL: nil)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = WidgetController()
app.delegate = delegate
app.run()
