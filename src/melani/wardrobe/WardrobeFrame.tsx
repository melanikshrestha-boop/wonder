/**
 * Wardrobe in Wonder shell via iframe (style isolation).
 * Height is measured from the live viewport so Chrome fullscreen
 * never collapses to a blank white slab (half-screen worked; full did not).
 */
import { useEffect, useRef } from "react";
import "./wardrobe-frame.css";

function fitIframe(el: HTMLIFrameElement | null) {
  if (!el) return;
  // Distance from iframe top to bottom of visible window (works in F11 / green button full screen)
  const top = el.getBoundingClientRect().top;
  const available = Math.max(480, Math.floor(window.innerHeight - top - 4));
  el.style.height = `${available}px`;
  el.style.minHeight = `${Math.min(available, 560)}px`;
}

export function WardrobeFrame() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const el = iframeRef.current;
    const run = () => fitIframe(el);
    run();
    // After layout settles (sidebar / topbar)
    const t1 = window.setTimeout(run, 50);
    const t2 = window.setTimeout(run, 300);
    window.addEventListener("resize", run);
    window.addEventListener("orientationchange", run);
    document.addEventListener("fullscreenchange", run);
    document.addEventListener("webkitfullscreenchange", run as EventListener);
    // Visual viewport changes when browser chrome shows/hides
    window.visualViewport?.addEventListener("resize", run);
    window.visualViewport?.addEventListener("scroll", run);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", run);
      window.removeEventListener("orientationchange", run);
      document.removeEventListener("fullscreenchange", run);
      document.removeEventListener("webkitfullscreenchange", run as EventListener);
      window.visualViewport?.removeEventListener("resize", run);
      window.visualViewport?.removeEventListener("scroll", run);
    };
  }, []);

  return (
    <section className="wardrobe-frame-shell" aria-label="Wardrobe">
      <iframe
        ref={iframeRef}
        className="wardrobe-frame"
        src="/wardrobe/"
        title="Wardrobe"
        allow="clipboard-read; clipboard-write"
      />
    </section>
  );
}
