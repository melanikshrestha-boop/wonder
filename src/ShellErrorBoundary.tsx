/**
 * Root shell guard — never leave Melani on a pure blank white page.
 * Catches React render crashes and offers one-click recovery.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: string | null };

export class ShellErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Wonder shell crash]", error, info?.componentStack);
  }

  recover = () => {
    try {
      // Clear stuck body locks from wardrobe / overlays
      document.body.classList.remove("viewer-open");
      document.documentElement.classList.remove("is-sidebar-resizing");
      document.body.style.removeProperty("overflow");
      document.documentElement.style.removeProperty("overflow");
    } catch {
      /* ignore */
    }
    this.setState({ error: null });
    // Soft reload keeps URL (e.g. ?page=pg-hygiene)
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100%",
            margin: 0,
            padding: "48px 28px",
            boxSizing: "border-box",
            fontFamily: '"Source Serif 4", Georgia, ui-serif, serif',
            background: "#f7f7fa",
            color: "#1a1c22",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#8a837a",
            }}
          >
            Wonder
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 580 }}>
            Something broke the shell
          </h1>
          <p style={{ margin: "0 0 20px", maxWidth: 420, lineHeight: 1.45, color: "#5c564e" }}>
            {this.state.error}
          </p>
          <button
            type="button"
            onClick={this.recover}
            style={{
              appearance: "none",
              minHeight: 40,
              padding: "0 18px",
              border: 0,
              borderRadius: 999,
              background: "#191612",
              color: "#f7f1e8",
              font: "inherit",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload Wonder
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
