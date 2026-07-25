/**
 * Candlestick chart, drawn on canvas.
 *
 * Canvas rather than SVG because a 390-bar session redrawn on every simulated
 * minute would mean thousands of DOM nodes churning; canvas redraws the whole
 * scene in one pass and stays smooth at 60x speed.
 *
 * Includes VWAP and a moving average because those are the two lines an
 * intraday trader actually reads, plus a volume histogram below the price
 * panel and a crosshair with an OHLC readout.
 */
import { useEffect, useRef, useState } from "react";
import { sma, vwap, type Candle } from "./marketEngine";

export type ChartOverlays = {
  vwap: boolean;
  ma: boolean;
  maPeriod: number;
};

const UP = "#26a69a";
const DOWN = "#ef5350";
const GRID = "rgba(255,255,255,0.055)";
const AXIS_TEXT = "rgba(255,255,255,0.42)";
const VWAP_COLOR = "#f5b942";
const MA_COLOR = "#6ea8ff";

export function CandleChart({
  candles,
  overlays,
  height = 380,
  markers = [],
}: {
  candles: Candle[];
  overlays: ChartOverlays;
  height?: number;
  /** Entry/exit arrows drawn on the price panel. */
  markers?: { t: number; price: number; side: "buy" | "sell" }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; index: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || candles.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = wrap.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padLeft = 8;
    const padRight = 62;
    const padTop = 10;
    const volH = Math.round(height * 0.18);
    const priceH = height - volH - padTop - 22;

    const plotW = width - padLeft - padRight;
    const lo = Math.min(...candles.map((c) => c.low));
    const hi = Math.max(...candles.map((c) => c.high));
    const range = Math.max(0.01, hi - lo);
    // A little headroom so wicks never touch the frame.
    const yLo = lo - range * 0.04;
    const yHi = hi + range * 0.04;

    const x = (i: number) => padLeft + (i / Math.max(1, candles.length - 1)) * plotW;
    const y = (p: number) => padTop + (1 - (p - yLo) / (yHi - yLo)) * priceH;

    // Horizontal grid and the price axis on the right.
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "middle";
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const p = yLo + ((yHi - yLo) * i) / ticks;
      const py = y(p);
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(padLeft + plotW, py);
      ctx.stroke();
      ctx.fillStyle = AXIS_TEXT;
      ctx.textAlign = "left";
      ctx.fillText(p.toFixed(2), padLeft + plotW + 7, py);
    }

    // Candle body width, with a floor so a full session stays visible.
    const step = plotW / Math.max(1, candles.length);
    const bodyW = Math.max(1, Math.min(9, step * 0.68));

    const maxVol = Math.max(...candles.map((c) => c.volume), 1);
    const volTop = padTop + priceH + 14;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const up = c.close >= c.open;
      const color = up ? UP : DOWN;
      const cx = x(i);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, y(c.high));
      ctx.lineTo(cx, y(c.low));
      ctx.stroke();

      // Body — a doji still needs a visible line.
      const yo = y(c.open);
      const yc = y(c.close);
      const top = Math.min(yo, yc);
      const bodyH = Math.max(1, Math.abs(yc - yo));
      ctx.fillStyle = color;
      ctx.fillRect(cx - bodyW / 2, top, bodyW, bodyH);

      // Volume
      const vh = (c.volume / maxVol) * (volH - 4);
      ctx.globalAlpha = 0.45;
      ctx.fillRect(cx - bodyW / 2, volTop + (volH - 4) - vh, bodyW, vh);
      ctx.globalAlpha = 1;
    }

    const line = (values: (number | null)[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v == null) continue;
        const px = x(i);
        const py = y(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    if (overlays.vwap) line(vwap(candles), VWAP_COLOR);
    if (overlays.ma) line(sma(candles, overlays.maPeriod), MA_COLOR);

    // Fill markers
    for (const marker of markers) {
      if (marker.t >= candles.length) continue;
      const mx = x(marker.t);
      const my = y(marker.price);
      ctx.fillStyle = marker.side === "buy" ? UP : DOWN;
      ctx.beginPath();
      if (marker.side === "buy") {
        ctx.moveTo(mx, my + 9);
        ctx.lineTo(mx - 4.5, my + 17);
        ctx.lineTo(mx + 4.5, my + 17);
      } else {
        ctx.moveTo(mx, my - 9);
        ctx.lineTo(mx - 4.5, my - 17);
        ctx.lineTo(mx + 4.5, my - 17);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Last-price tag on the axis
    const last = candles[candles.length - 1];
    const lastY = y(last.close);
    const lastUp = last.close >= last.open;
    ctx.fillStyle = lastUp ? UP : DOWN;
    ctx.fillRect(padLeft + plotW + 2, lastY - 8, padRight - 6, 16);
    ctx.fillStyle = "#04070c";
    ctx.textAlign = "left";
    ctx.font = "bold 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(last.close.toFixed(2), padLeft + plotW + 7, lastY);

    // Crosshair
    if (hover) {
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hover.x, padTop);
      ctx.lineTo(hover.x, padTop + priceH);
      ctx.moveTo(padLeft, hover.y);
      ctx.lineTo(padLeft + plotW, hover.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [candles, overlays, height, hover, markers]);

  const hovered = hover ? candles[hover.index] : null;

  return (
    <div className="tr-chart" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const plotW = rect.width - 8 - 62;
          const index = Math.round(((px - 8) / Math.max(1, plotW)) * (candles.length - 1));
          setHover({
            x: px,
            y: e.clientY - rect.top,
            index: Math.min(candles.length - 1, Math.max(0, index)),
          });
        }}
        onMouseLeave={() => setHover(null)}
      />
      {hovered && (
        <div className="tr-chart-readout">
          <span>O <b>{hovered.open.toFixed(2)}</b></span>
          <span>H <b>{hovered.high.toFixed(2)}</b></span>
          <span>L <b>{hovered.low.toFixed(2)}</b></span>
          <span>C <b className={hovered.close >= hovered.open ? "up" : "down"}>{hovered.close.toFixed(2)}</b></span>
          <span>V <b>{hovered.volume.toLocaleString()}</b></span>
        </div>
      )}
    </div>
  );
}
