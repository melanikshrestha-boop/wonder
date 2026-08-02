/**
 * Wardrobe iframe in Wonder shell.
 *
 * Fill the page body only (absolute inside main) — never viewport-fixed —
 * so leaving Wardrobe cannot leave a ghost layer over Hygiene / Fitness.
 *
 * NEVER let the iframe load main Wonder (/?page=…). Nested Wonder = double topbar.
 * Escape → soft parent navigate (no full reload) + snap frame back to /wardrobe/.
 */
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MEL_NAVIGATE_EVENT } from "../melActions";
import "./wardrobe-frame.css";

const WARDROBE_SRC = "/wardrobe/";

function isWardrobePath(pathname: string) {
  return pathname === "/wardrobe" || pathname === "/wardrobe/" || pathname.startsWith("/wardrobe/");
}

function isBlankLocation(win: Window): boolean {
  try {
    const href = String(win.location?.href || "");
    const path = String(win.location?.pathname || "");
    return (
      !href
      || href === "about:blank"
      || href.startsWith("about:")
      || path === ""
      || path === "blank"
    );
  } catch {
    return true;
  }
}

/**
 * If the iframe left /wardrobe/ (old exit link → /?page=…), promote that page
 * to the parent shell without a full document reload, then reset the frame.
 */
function recoverEscapedIframe(el: HTMLIFrameElement | null): boolean {
  if (!el) return false;
  try {
    const win = el.contentWindow;
    if (!win) return false;
    if (isBlankLocation(win)) return false;

    const { pathname, search } = win.location;
    if (isWardrobePath(pathname)) return false;

    // Only treat main Wonder root as a nested escape
    if (pathname === "/" || pathname === "/index.html") {
      const page = new URLSearchParams(search).get("page");
      if (page) {
        window.dispatchEvent(
          new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: page } }),
        );
      }
      // Snap frame home so a return to Wardrobe is clean (parent may unmount us)
      if (!el.src.includes("/wardrobe")) {
        el.src = WARDROBE_SRC;
      } else {
        try {
          win.location.replace(WARDROBE_SRC);
        } catch {
          el.src = `${WARDROBE_SRC}?t=${Date.now()}`;
        }
      }
      return true;
    }

    // Any other non-wardrobe path inside the frame — snap back, never hard-reload parent
    el.src = `${WARDROBE_SRC}?t=${Date.now()}`;
    return true;
  } catch {
    /* cross-origin: leave alone; next onLoad may recover */
    return false;
  }
}

function fitIframe(el: HTMLIFrameElement | null) {
  if (!el) return;
  const parent = el.parentElement;
  if (!parent) return;

  // Absolute shell fills parent — size iframe to parent only (no viewport math)
  const pr = parent.getBoundingClientRect();
  const ph = Math.max(parent.clientHeight, Math.floor(pr.height), 120);
  const pw = Math.max(parent.clientWidth, Math.floor(pr.width), 120);
  el.style.width = `${pw}px`;
  el.style.height = `${ph}px`;
  el.style.minHeight = `${ph}px`;
  el.style.maxHeight = `${ph}px`;
}

class WardrobeErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error?.message || String(error) };
  }

  componentDidCatch() {
    /* boundary only — parent shell stays alive */
  }

  render() {
    if (this.state.error) {
      return (
        <div className="wardrobe-frame-fallback" role="alert">
          <p>
            <strong>Wardrobe crashed.</strong> {this.state.error}
          </p>
          <button
            type="button"
            className="wardrobe-frame-fallback__btn"
            onClick={() => {
              this.setState({ error: null });
              window.dispatchEvent(
                new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: "pg-fashion-os" } }),
              );
            }}
          >
            Reload Wardrobe
          </button>
          <button
            type="button"
            className="wardrobe-frame-fallback__btn wardrobe-frame-fallback__btn--ghost"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: "pg-hygiene" } }),
              );
            }}
          >
            Exit to Hygiene
          </button>
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
  const recoveringRef = useRef(false);

  const runFit = useCallback(() => {
    fitIframe(iframeRef.current);
  }, []);

  useEffect(() => {
    runFit();
    const t1 = window.setTimeout(runFit, 50);
    const t2 = window.setTimeout(runFit, 200);
    const t3 = window.setTimeout(runFit, 600);

    const tHint = window.setTimeout(() => {
      const el = iframeRef.current;
      if (!el || recoveringRef.current) return;
      try {
        if (isBlankLocation(el.contentWindow!)) return;
        if (recoverEscapedIframe(el)) return;
        const text = el.contentDocument?.body?.innerText || "";
        if (text.trim().length < 20) setBlankHint(true);
      } catch {
        /* same-origin expected */
      }
    }, 3000);

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
      // Unmount cleanup: drop any iframe document so it cannot paint over next page
      try {
        const el = iframeRef.current;
        if (el) {
          el.src = "about:blank";
        }
      } catch {
        /* ignore */
      }
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
            <button
              type="button"
              className="wardrobe-frame-fallback__btn"
              onClick={() => {
                setLoadFailed(false);
                setBlankHint(false);
                recoveringRef.current = false;
                const el = iframeRef.current;
                if (el) el.src = `${WARDROBE_SRC}?t=${Date.now()}`;
              }}
            >
              Retry
            </button>
            <button
              type="button"
              className="wardrobe-frame-fallback__btn wardrobe-frame-fallback__btn--ghost"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: "pg-hygiene" } }),
                );
              }}
            >
              Exit to Hygiene
            </button>
          </div>
        ) : null}
        <iframe
          ref={iframeRef}
          className="wardrobe-frame"
          src={WARDROBE_SRC}
          title="Wardrobe closet"
          allow="clipboard-read; clipboard-write"
          onLoad={() => {
            if (recoveringRef.current) {
              recoveringRef.current = false;
            }
            if (recoverEscapedIframe(iframeRef.current)) {
              recoveringRef.current = true;
              setLoadFailed(false);
              return;
            }
            setLoadFailed(false);
            runFit();
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
