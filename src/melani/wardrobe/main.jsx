import React, { Component } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./fitness-aligned.css";

class RootErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error: error?.message || String(error) };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", color: "#191919" }}>
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Wardrobe crashed</h1>
          <p style={{ margin: "0 0 16px", color: "#666" }}>{this.state.error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 16px",
              borderRadius: 999,
              border: 0,
              background: "#191919",
              color: "#f7f1e8",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Mark standalone SPA so CSS tokens apply (never when embedded in Wonder)
try {
  document.documentElement.classList.add("wardrobe-standalone", "theme-light");
} catch {
  /* ignore */
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML =
    "<p style='padding:24px;font-family:system-ui'>Wardrobe root missing.</p>";
} else {
  createRoot(rootEl).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>,
  );
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/wardrobe/sw.js", { scope: "/wardrobe/" }),
  );
}
