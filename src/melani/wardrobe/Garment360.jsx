/**
 * Product 360° turntable.
 *
 * If `spinFrames` is provided (ordered angles with image URLs from a real
 * multi-view product set like Zappos Left/Front/Right/Back), we map drag angle
 * to the nearest frames and crossfade — a true multi-photo 360.
 *
 * Otherwise fall back to dual-face front/back CSS rotateY.
 *
 * `variant="inline"` — gallery tile mode: no slider, no chrome, drag to poke around.
 * `variant="viewer"` — detail modal (optional slider).
 */
import { useEffect, useMemo, useRef, useState } from "react";

function normalizeFrames(spinFrames) {
  if (!Array.isArray(spinFrames) || spinFrames.length < 2) return null;
  const frames = spinFrames
    .map((f) => ({
      deg: Number(f.deg),
      url: f.url || f.src,
      label: f.label || "",
    }))
    .filter((f) => Number.isFinite(f.deg) && f.url)
    .sort((a, b) => a.deg - b.deg);
  return frames.length >= 2 ? frames : null;
}

/** Pick two frames to blend for continuous spin */
function sampleFrames(frames, angle) {
  const a = ((angle % 360) + 360) % 360;
  // Duplicate first at 360 for wrap
  const ring = [...frames, { ...frames[0], deg: frames[0].deg + 360 }];
  // find segment containing a
  for (let j = 0; j < ring.length - 1; j++) {
    const d0 = ring[j].deg;
    let d1 = ring[j + 1].deg;
    let aa = a;
    if (d1 < d0) d1 += 360;
    // handle wrap when a is near 0 and last frame is 270
    if (aa < d0 && j === ring.length - 2) aa += 360;
    if (aa >= d0 && aa <= d1) {
      const t = d1 === d0 ? 0 : (aa - d0) / (d1 - d0);
      return { a: ring[j], b: ring[j + 1], t: Math.max(0, Math.min(1, t)) };
    }
  }
  // fallback nearest
  let best = frames[0];
  let bestD = 999;
  for (const f of frames) {
    const d = Math.min(Math.abs(f.deg - a), 360 - Math.abs(f.deg - a));
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return { a: best, b: best, t: 0 };
}

export function Garment360({
  frontSrc,
  backSrc,
  spinFrames,
  label = "360°",
  autoSpin = false,
  syntheticBack = false,
  /** "inline" = gallery tile (no slider/chrome). "viewer" = detail modal. */
  variant = "viewer",
  className = "",
  onInteract,
}) {
  const frames = useMemo(() => normalizeFrames(spinFrames), [spinFrames]);
  const multi = Boolean(frames);
  const inline = variant === "inline";

  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const angleRef = useRef(0);
  const autoRef = useRef(null);
  const movedRef = useRef(false);

  const front = frontSrc;
  const back = backSrc || frontSrc;

  useEffect(() => {
    angleRef.current = angle;
  }, [angle]);

  useEffect(() => {
    if (!autoSpin || dragging) return;
    autoRef.current = window.setInterval(() => {
      setAngle((a) => (a + 0.9) % 360);
    }, 32);
    return () => {
      if (autoRef.current) window.clearInterval(autoRef.current);
    };
  }, [autoSpin, dragging]);

  // Preload multi frames
  useEffect(() => {
    if (!frames) return;
    for (const f of frames) {
      const img = new Image();
      img.src = f.url;
    }
  }, [frames]);

  function onPointerDown(e) {
    setDragging(true);
    movedRef.current = false;
    dragRef.current = { x: e.clientX, startAngle: angleRef.current };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // stop gallery card click / scroll while spinning
    e.stopPropagation();
    onInteract?.("start");
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    if (Math.abs(dx) > 3) movedRef.current = true;
    const next = (((dragRef.current.startAngle - dx * 0.55) % 360) + 360) % 360;
    setAngle(next);
    e.stopPropagation();
  }

  function onPointerUp(e) {
    setDragging(false);
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    e.stopPropagation();
    onInteract?.(movedRef.current ? "spin" : "tap");
  }

  const blend = multi ? sampleFrames(frames, angle) : null;

  return (
    <div
      className={`g360 g360-seamless g360-${variant}${className ? ` ${className}` : ""}`}
      data-dragging={dragging ? "1" : "0"}
    >
      {!inline && (
        <div className="g360-head">
          <span className="g360-label">
            {label}
            {multi ? ` · ${frames.length} angles` : ""}
          </span>
          <span className="g360-angle">{Math.round(angle)}°</span>
        </div>
      )}

      <div
        className={`g360-stage${dragging ? " is-drag" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label="Drag to spin product 360"
      >
        {multi && blend ? (
          <div className="g360-multi">
            <img
              className="g360-multi-img"
              src={blend.a.url}
              alt=""
              draggable={false}
              style={{ opacity: 1 - blend.t }}
            />
            <img
              className="g360-multi-img g360-multi-img-top"
              src={blend.b.url}
              alt=""
              draggable={false}
              style={{ opacity: blend.t }}
            />
          </div>
        ) : (
          <div className="g360-perspective">
            <div className="g360-pivot" style={{ transform: `rotateY(${angle}deg)` }}>
              <div className="g360-face g360-face-front">
                <img src={front} alt="" draggable={false} />
              </div>
              <div className="g360-face g360-face-back">
                <img src={back} alt="" draggable={false} />
              </div>
            </div>
          </div>
        )}
        {inline && multi && (
          <span className="g360-inline-hint" aria-hidden="true">
            drag
          </span>
        )}
      </div>

      {/* User asked: no slider — keep spin drag-only. Viewer can still show degree if wanted. */}
      {!inline && multi && (
        <p className="g360-hint">
          Drag to spin · {frames.map((f) => f.label).filter(Boolean).join(" → ") || "orbit"}
        </p>
      )}
      {!inline && !multi && (
        <p className="g360-hint">
          Drag to spin
          {syntheticBack ? " · 2-face (mirrored back)" : " · front + back"}
        </p>
      )}
    </div>
  );
}
