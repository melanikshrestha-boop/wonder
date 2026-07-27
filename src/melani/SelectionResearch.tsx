/**
 * Highlight any text in Wonder → floating chip:
 *   [ Research on Mel ]  [ Never mind ]
 *
 * No Safari/thyroid.org look-ups. Mel explains the system from your
 * selection (labs knowledge when it matches, otherwise plain research prompt).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { requestMelPrompt } from "./melActions";
import { buildResearchPrompt } from "./researchSelection";
import "./selection-research.css";

type Pop = {
  text: string;
  x: number;
  y: number;
};

function selectionInsideMain(sel: Selection | null): boolean {
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const node = sel.anchorNode;
  if (!node) return false;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return false;
  // Only on page content — not Mel chat, sidebar, or this chip
  if (el.closest(".mai-panel, .mai-root, .sidebar, .sr-pop, .more-menu, .search-modal")) {
    return false;
  }
  return Boolean(el.closest(".main-scroll, .notion-melani-body, .melani-shell, .fx-page, .ct, .lab-popup"));
}

function readSelection(): Pop | null {
  const sel = window.getSelection();
  if (!selectionInsideMain(sel)) return null;
  const text = (sel?.toString() || "").replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 280) return null;
  try {
    const range = sel!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    // Anchor chip above selection, keep on screen
    const x = Math.min(
      window.innerWidth - 16,
      Math.max(16, rect.left + rect.width / 2)
    );
    const y = Math.max(12, rect.top - 8);
    return { text, x, y };
  } catch {
    return null;
  }
}

export function SelectionResearch() {
  const [pop, setPop] = useState<Pop | null>(null);
  const lastTap = useRef<{ t: number; text: string }>({ t: 0, text: "" });
  const suppressUntil = useRef(0);

  const hide = useCallback(() => setPop(null), []);

  const showFromSelection = useCallback(() => {
    if (Date.now() < suppressUntil.current) return;
    const next = readSelection();
    if (next) setPop(next);
  }, []);

  useEffect(() => {
    const onUp = () => {
      // Let the browser finish the selection first
      window.setTimeout(showFromSelection, 10);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    // Double-click / double-tap with a selection → open chip
    const onDbl = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.(
        ".mai-panel, .mai-root, .sidebar, .sr-pop"
      );
      if (t) return;
      window.setTimeout(showFromSelection, 10);
    };

    // Touch: second tap soon after selecting same text
    const onTouchEnd = () => {
      window.setTimeout(() => {
        const next = readSelection();
        if (!next) return;
        const now = Date.now();
        const prev = lastTap.current;
        if (
          now - prev.t < 450 &&
          prev.text === next.text &&
          next.text.length >= 2
        ) {
          setPop(next);
        } else {
          lastTap.current = { t: now, text: next.text };
          // Single selection still shows chip after short delay (user asked highlight → popup)
          window.setTimeout(() => {
            const again = readSelection();
            if (again && again.text === next.text) setPop(again);
          }, 280);
        }
      }, 30);
    };

    const onScroll = () => hide();

    document.addEventListener("mouseup", onUp);
    document.addEventListener("keyup", onKey);
    document.addEventListener("dblclick", onDbl);
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keyup", onKey);
      document.removeEventListener("dblclick", onDbl);
      document.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [hide, showFromSelection]);

  function research() {
    if (!pop) return;
    const prompt = buildResearchPrompt(pop.text);
    suppressUntil.current = Date.now() + 800;
    hide();
    // Clear selection so Safari look-up dies
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      /* ignore */
    }
    requestMelPrompt(prompt);
  }

  function neverMind() {
    suppressUntil.current = Date.now() + 600;
    hide();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      /* ignore */
    }
  }

  if (!pop || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="sr-pop"
      role="dialog"
      aria-label="Research selection with Mel"
      style={{
        left: pop.x,
        top: pop.y,
      }}
    >
      <p className="sr-quote" title={pop.text}>
        “{pop.text.length > 72 ? `${pop.text.slice(0, 70)}…` : pop.text}”
      </p>
      <div className="sr-actions">
        <button type="button" className="sr-btn sr-research" onClick={research}>
          Research on Mel
        </button>
        <button type="button" className="sr-btn sr-dismiss" onClick={neverMind}>
          Never mind
        </button>
      </div>
    </div>,
    document.body
  );
}
