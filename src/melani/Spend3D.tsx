/**
 * Interactive 3D spend chart — drag to rotate. Each bar is a real 3D box
 * (CSS transforms) whose height is that category's spend. Built from the
 * live ledger, so the bars are your actual numbers.
 */
import { useMemo, useRef, useState } from "react";
import { money, type FinanceTx } from "./financeStore";
import { isTransferLike } from "./financeTransfers";
import "./spend-3d.css";

const COLORS = [
  "#1f6f8b", "#e8743b", "#4b8f6b", "#b5651d", "#7d5ba6",
  "#c94f7c", "#3a7d99", "#d1a13a", "#5c8d5c", "#a0522d",
];

export function Spend3D({ txs }: { txs: FinanceTx[] }) {
  const [rot, setRot] = useState({ x: 22, y: -28 });
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);

  const bars = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txs) {
      if (t.kind !== "expense" || isTransferLike(t)) continue;
      map.set(t.category || "Other", (map.get(t.category || "Other") || 0) + t.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [txs]);

  const max = Math.max(1, ...bars.map((b) => b.value));

  function onDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, rx: rot.x, ry: rot.y };
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setRot({
      x: Math.max(-10, Math.min(80, drag.current.rx - dy * 0.4)),
      y: drag.current.ry + dx * 0.4,
    });
  }
  function onUp() {
    drag.current = null;
  }

  if (!bars.length) return null;

  const MAX_H = 200; // px tall for the biggest bar

  return (
    <div className="s3d">
      <div
        className="s3d-stage"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className="s3d-scene"
          style={{ transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}
        >
          <div className="s3d-floor" />
          {bars.map((b, i) => {
            const h = Math.max(6, (b.value / max) * MAX_H);
            const x = (i - (bars.length - 1) / 2) * 74;
            const color = COLORS[i % COLORS.length];
            return (
              <div
                key={b.name}
                className="s3d-bar"
                style={{ transform: `translateX(${x}px) translateY(${-h / 2}px)`, height: `${h}px` }}
              >
                <span className="s3d-face s3d-front" style={{ background: color, height: `${h}px` }} />
                <span className="s3d-face s3d-back" style={{ background: color, height: `${h}px` }} />
                <span className="s3d-face s3d-left" style={{ background: shade(color, -18), height: `${h}px` }} />
                <span className="s3d-face s3d-right" style={{ background: shade(color, -18), height: `${h}px` }} />
                <span className="s3d-face s3d-top" style={{ background: shade(color, 22) }} />
                <span className="s3d-cap" style={{ transform: `translateY(${-h / 2 - 20}px) rotateX(${-rot.x}deg) rotateY(${-rot.y}deg)` }}>
                  {money(b.value)}
                </span>
                <span className="s3d-label" style={{ transform: `translateY(26px) rotateX(${-rot.x}deg) rotateY(${-rot.y}deg)` }}>
                  {b.name.split(/[\s/]/)[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="s3d-hint">Drag to rotate</p>
    </div>
  );
}

/** Lighten/darken a hex color for the 3D faces. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}
