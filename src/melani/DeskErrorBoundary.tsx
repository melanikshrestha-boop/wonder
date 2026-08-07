/**
 * Isolates one Melani desk crash so Bookshelf/Finances/etc. cannot blank the whole shell.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  desk: string;
  children: ReactNode;
};

type State = { error: string | null };

export class DeskErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Wonder desk crash · ${this.props.desk}]`, error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="wonder-desk-error"
          style={{
            padding: "24px 18px",
            fontFamily: '"Source Serif 4", Georgia, ui-serif, serif',
            color: "#1a1c22",
            background: "#f7f7fa",
            minHeight: "40vh",
            boxSizing: "border-box",
          }}
        >
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#8a837a",
            }}
          >
            {this.props.desk}
          </p>
          <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 600 }}>
            This desk crashed
          </h2>
          <p
            style={{
              margin: "0 0 16px",
              maxWidth: 480,
              lineHeight: 1.4,
              color: "#5c564e",
              fontSize: 14,
            }}
          >
            {this.state.error}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              appearance: "none",
              minHeight: 36,
              padding: "0 16px",
              border: 0,
              borderRadius: 999,
              background: "#191612",
              color: "#f7f1e8",
              font: "inherit",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginRight: 10,
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              appearance: "none",
              minHeight: 36,
              padding: "0 16px",
              border: 0,
              borderRadius: 999,
              background: "transparent",
              color: "#5c564e",
              font: "inherit",
              fontSize: 14,
              fontWeight: 500,
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
