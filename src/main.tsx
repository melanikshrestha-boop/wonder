import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BaseWidget } from "./melani/BaseWidget";
import { applyTheme, loadTheme } from "./theme";

// Paint theme before first React paint (avoids dark flash when light is saved)
applyTheme(loadTheme());

/** Base tracking widget — standalone surface for Dock / Home Screen / phone */
function isWidgetMode(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("widget") === "1" || q.get("widget") === "base") return true;
    // Hash fallback: #widget
    if (window.location.hash.replace(/^#/, "") === "widget") return true;
  } catch {
    /* ignore */
  }
  return false;
}

const root = createRoot(document.getElementById("root")!);
if (isWidgetMode()) {
  document.documentElement.dataset.wonderSurface = "widget";
  root.render(
    <StrictMode>
      <BaseWidget />
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// PWA: register shell SW only in production builds (dev HMR must stay free)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* optional */
    });
  });
}
