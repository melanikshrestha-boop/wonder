/**
 * Former Math Lab page — Mel-only now.
 * Engines (math, content, finance) run in Mel’s backend; no public lab UI.
 */
import { useEffect } from "react";
import { MEL_OPEN_SCIENCE_EVENT } from "./melActions";

export function isMathLabPage(pageId: string): boolean {
  return (
    pageId === "pg-math" ||
    pageId === "pg-math-lab" ||
    pageId === "pg-learn-math"
  );
}

export function MathLab() {
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent(MEL_OPEN_SCIENCE_EVENT));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div
      style={{
        padding: "48px 24px",
        maxWidth: 520,
        fontFamily: '"Source Serif 4", Georgia, serif',
        lineHeight: 1.35,
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          opacity: 0.5,
        }}
      >
        Mel
      </p>
      <h1 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 650 }}>
        Talk to Mel
      </h1>
      <p style={{ margin: "0 0 16px", opacity: 0.7 }}>
        Models for body, money, and YouTube run behind Mel. No lab chrome — just
        ask. Mel should already be open.
      </p>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent(MEL_OPEN_SCIENCE_EVENT))
        }
        style={{
          border: "1px solid rgba(26,28,34,0.15)",
          borderRadius: 999,
          padding: "8px 16px",
          background: "#2563eb",
          color: "#fff",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        Open Mel
      </button>
      <p style={{ margin: "24px 0 0", fontSize: 14, opacity: 0.55 }}>
        Try: <code>videos</code> · <code>runway</code> · <code>accelerate</code> ·{" "}
        <code>status</code>
      </p>
    </div>
  );
}
