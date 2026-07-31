/**
 * Wardrobe iframe in Wonder shell.
 * CRITICAL: half-screen working is not enough — full Chrome window / fullscreen
 * must also show content. Use flex-fill + absolute iframe + JS height backup.
 */
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./wardrobe-frame.css";

function fitIframe(el: HTMLIFrameElement | null) {
  if (!el) return;
  const parent = el.parentElement;
  // Prefer parent content box (flex-filled shell)
  if (parent) {
    const ph = parent.clientHeight;
    if (ph >= 200) {
      el.style.height = `${ph}px`;
      el.style.minHeight = `${ph}px`;
      return;
    }
  }
  const top = el.getBoundingClientRect().top;
  const available = Math.max(400, Math.floor(window.innerHeight - top - 4));
  el.style.height = `${available}px`;
  el.style.minHeight = `${available}px`;
}

class WardrobeErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error?.message || String(error) };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="wardrobe-frame-fallback" role="alert">
          <p>
            <strong>Wardrobe crashed.</strong> {this.state.error}
          </p>
          <a className="wardrobe-frame-fallback__btn" href="/wardrobe/">
            Open wardrobe full page
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WardrobeFrame() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [blankHint, setBlankHint] = useState(false);

  const runFit = useCallback(() => {
    fitIframe(iframeRef.current);
  }, []);

  useEffect(() => {
    runFit();
    const t1 = window.setTimeout(runFit, 50);
    const t2 = window.setTimeout(runFit, 250);
    const t3 = window.setTimeout(runFit, 800);
    // If still no paint signal after 2.5s, show open-full-page hint
    const tHint = window.setTimeout(() => {
      const el = iframeRef.current;
      if (!el) return;
      try {
        const doc = el.contentDocument;
        const text = doc?.body?.innerText || "";
        if (text.trim().length < 20) setBlankHint(true);
      } catch {
        // cross-origin should not happen (same origin /wardrobe/)
        setBlankHint(true);
      }
    }, 2500);

    window.addEventListener("resize", runFit);
    window.addEventListener("orientationchange", runFit);
    document.addEventListener("fullscreenchange", runFit);
    document.addEventListener("webkitfullscreenchange", runFit as EventListener);
    window.visualViewport?.addEventListener("resize", runFit);

    const ro =
      typeof ResizeObserver !== "undefined" && shellRef.current
        ? new ResizeObserver(() => runFit())
        : null;
    if (shellRef.current && ro) ro.observe(shellRef.current);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(tHint);
      window.removeEventListener("resize", runFit);
      window.removeEventListener("orientationchange", runFit);
      document.removeEventListener("fullscreenchange", runFit);
      document.removeEventListener("webkitfullscreenchange", runFit as EventListener);
      window.visualViewport?.removeEventListener("resize", runFit);
      ro?.disconnect();
    };
  }, [runFit]);

  return (
    <WardrobeErrorBoundary>
      <section
        ref={shellRef as React.RefObject<HTMLElement>}
        className="wardrobe-frame-shell"
        aria-label="Wardrobe"
      >
        {loadFailed || blankHint ? (
          <div className="wardrobe-frame-fallback" role="status">
            <p>
              {loadFailed
                ? "Wardrobe frame failed to load."
                : "Wardrobe is slow or empty in this panel."}
            </p>
            <a className="wardrobe-frame-fallback__btn" href="/wardrobe/">
              Open wardrobe full page
            </a>
            <button
              type="button"
              className="wardrobe-frame-fallback__btn wardrobe-frame-fallback__btn--ghost"
              onClick={() => {
                setLoadFailed(false);
                setBlankHint(false);
                const el = iframeRef.current;
                if (el) {
                  el.src = `/wardrobe/?t=${Date.now()}`;
                }
              }}
            >
              Retry here
            </button>
          </div>
        ) : null}
        <iframe
          ref={iframeRef}
          className="wardrobe-frame"
          src="/wardrobe/"
          title="Wardrobe"
          allow="clipboard-read; clipboard-write"
          onLoad={() => {
            setLoadFailed(false);
            runFit();
            // Recheck content after load
            window.setTimeout(() => {
              try {
                const text = iframeRef.current?.contentDocument?.body?.innerText || "";
                if (text.trim().length > 20) setBlankHint(false);
              } catch {
                /* ignore */
              }
            }, 400);
          }}
          onError={() => setLoadFailed(true)}
        />
      </section>
    </WardrobeErrorBoundary>
  );
}
