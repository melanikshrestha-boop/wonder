import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ShellErrorBoundary } from "./ShellErrorBoundary";
import { BaseWidget } from "./melani/BaseWidget";
import { applyTheme, loadTheme } from "./theme";

// Paint theme before first React paint (avoids dark flash when light is saved)
applyTheme(loadTheme());

// Clear stuck locks from wardrobe product viewer / resize that can blank the canvas
try {
  document.body.classList.remove("viewer-open");
  document.documentElement.classList.remove("is-sidebar-resizing");
  document.body.style.removeProperty("overflow");
  document.documentElement.style.removeProperty("overflow");
} catch {
  /* ignore */
}

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
      <ShellErrorBoundary>
        <BaseWidget />
      </ShellErrorBoundary>
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <ShellErrorBoundary>
        <App />
      </ShellErrorBoundary>
    </StrictMode>
  );
  // Bridge Chrome localStorage ↔ floating widget via ~/.wonder/local
  void import("./melani/habitStore").then(async (h) => {
    await h.hydrateHabitsFromShared();
    try {
      h.saveHabits(h.loadHabits());
      h.saveChecks(h.loadChecks());
    } catch {
      /* ignore */
    }
  });
  // Data Guardian — hydrate health from disk + optional vault auto-seal
  void import("./melani/agents/dataGuardian").then(async (g) => {
    await g.hydrateFromDisk();
    g.mirrorAllToDisk();
  });
  void import("./melani/agents/dataVault").then((v) => {
    void v.maybeAutoSnapshot(45);
  });
}

// PWA: register shell SW only in production builds (dev HMR must stay free)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* optional */
    });
  });
}
