/**
 * Native Wardrobe desk inside Wonder — same App as /wardrobe/, no iframe.
 * Kills double topbars, nested Wonder, fixed-shell ghosts, and page-switch glitches.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { App as WardrobeApp } from "./App.jsx";
import { MEL_NAVIGATE_EVENT } from "../melActions";
import "./styles.css";
import "./fitness-aligned.css";

class WardrobeErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error?.message || String(error) };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* keep Wonder shell alive */
  }

  render() {
    if (this.state.error) {
      return (
        <div className="wardrobe-embed-fallback" role="alert">
          <p>
            <strong>Wardrobe hit an error.</strong> {this.state.error}
          </p>
          <button
            type="button"
            className="wardrobe-embed-fallback__btn"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
          <button
            type="button"
            className="wardrobe-embed-fallback__btn wardrobe-embed-fallback__btn--ghost"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: "pg-hygiene" } }),
              );
            }}
          >
            Leave to Hygiene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WardrobeEmbed() {
  return (
    <WardrobeErrorBoundary>
      <div className="wardrobe-embed" data-wardrobe-native="1">
        <WardrobeApp embedded />
      </div>
    </WardrobeErrorBoundary>
  );
}
