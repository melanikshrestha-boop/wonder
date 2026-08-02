/**
 * Daily Cloth Generator — one outfit, two vibes only:
 *   Comfy (build) · Going out (jeans, not sweats)
 * Flat-lay: torso → pants → shoes. Name popup hugs the piece.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { getFreshSavedWeather, weatherWardrobeContext } from "../weather/weatherCore";
import "./daily-generator.css";

const DAILY_KEY = "wonder-daily-outfit-v3";
const PINTEREST_BOARD_KEY = "wonder-wardrobe-pinterest-board-v1";
/** Internal ranking pool — UI only ever shows one pick. */
const POOL_SIZE = 8;
/** Only two purposes — maps to wardrobe-intelligence modes. */
const PURPOSES = [
  { id: "build", label: "Comfy" },
  { id: "out", label: "Going out" },
];

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(key) {
  try {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  } catch {
    return key;
  }
}

function readDailyState() {
  try {
    const raw = JSON.parse(localStorage.getItem(DAILY_KEY) || "null");
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

function writeDailyState(state) {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function daySeed(dateKey) {
  let h = 0;
  for (let i = 0; i < dateKey.length; i += 1) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  return h;
}

function pieceImage(item) {
  return item?.image || item?.thumbnail || item?.frontImage || null;
}

function kindLabel(item) {
  const k = String(item?.kind || item?.part || "").toLowerCase();
  if (k === "top" || k === "upperbody") return "Top";
  if (k === "bottom" || k === "lowerbody") return "Bottom";
  if (k === "shoes") return "Shoes";
  if (k === "jacket" || k === "wholebody_up") return "Jacket";
  if (k === "dress" || k === "dresses") return "Dress";
  if (k === "accessory" || k === "accessories_up") return "Accessory";
  return "Piece";
}

/** True for footwear — even when kind is wrong (e.g. "jacket" on Nike Blazer). */
function isFootwear(item) {
  const k = String(item?.kind || item?.part || "").toLowerCase();
  const name = String(item?.name || "").toLowerCase();
  const tags = (item?.tags || []).map((t) => String(t).toLowerCase());
  const blob = `${k} ${name} ${tags.join(" ")}`;

  if (k === "shoes" || k === "shoe") return true;
  if (tags.includes("sneakers") || tags.includes("shoes") || tags.includes("sneaker")) return true;
  if (
    /\b(sneaker|sneakers|shoe|shoes|boot|boots|sandal|sandals|loafer|loafers|mule|mules|slide|slides|jordan|dunk|samba|spezial|gazelle|killshot|air force|af1|mexico\s*66|onitsuka|yeezy|hoka|bondi|new balance|asics|vans|converse|timberland)\b/.test(
      blob,
    )
  ) {
    return true;
  }
  // Nike Blazer Mid is a sneaker — never outerwear
  if (/\bblazer\b/.test(name) && !/\b(jacket|coat|suit|blazer jacket)\b/.test(name)) return true;
  if (/\b(mid\s*'?\s*77|bq6806)\b/.test(blob)) return true;
  return false;
}

/**
 * Body-order slots: outer · top · bottom · shoes · acc*
 * Shoes ALWAYS win over jacket keywords (Nike Blazer).
 */
function flatlaySlot(item, accIndex = 0) {
  const k = String(item?.kind || item?.part || "").toLowerCase();
  const name = String(item?.name || "").toLowerCase();
  const tags = (item?.tags || []).map((t) => String(t).toLowerCase());
  const blob = `${k} ${name} ${tags.join(" ")}`;

  if (isFootwear(item)) return "shoes";

  if (
    k === "bottom"
    || k === "lowerbody"
    || /\b(jean|jeans|pant|pants|sweatpant|trouser|short|shorts|skirt)\b/.test(blob)
  ) {
    return "bottom";
  }

  // Real outer only — never bare "blazer", never footwear
  if (
    k === "jacket"
    || k === "wholebody_up"
    || /\b(jacket|coat|parka|puffer|windbreaker|hoodie|zip-?up|fleece)\b/.test(blob)
  ) {
    return "outer";
  }

  if (k === "dress" || k === "dresses") return "top";
  if (k === "top" || k === "upperbody" || /\b(tee|t-shirt|shirt|crewneck|jersey|tank)\b/.test(blob)) {
    return "top";
  }

  if (accIndex === 0) return "acc";
  if (accIndex === 1) return "acc2";
  return "acc3";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function FlatlayPiece({ piece, slot, onOpenItem }) {
  const src = pieceImage(piece);
  const label = piece.name || "Piece";
  return (
    <button
      type="button"
      className={`daily-gen__flatlay-piece is-${slot}`}
      data-slot={slot}
      role="listitem"
      onClick={() => onOpenItem?.(piece.id)}
      aria-label={`${kindLabel(piece)}: ${label}`}
    >
      {/* Name popup only on hover/focus — never a permanent label in the stack */}
      <span className="daily-gen__flatlay-meta" aria-hidden="true">
        <span className="daily-gen__flatlay-name">{label}</span>
      </span>
      <span className="daily-gen__flatlay-media">
        {src ? (
          <OptimizedImage
            className="daily-gen__flatlay-img"
            src={src}
            alt=""
            sizes="(max-width: 640px) 48vw, 280px"
            breakpoints={[160, 240, 320, 420, 560]}
          />
        ) : (
          <span className="daily-gen__img-fallback" style={{ background: piece.color || "#ccc" }} />
        )}
      </span>
    </button>
  );
}

/**
 * @param {{ items: Array<Record<string, unknown>>, onOpenItem?: (id: string) => void }} props
 */
export function DailyGenerator({ items = [], onOpenItem }) {
  const date = todayKey();
  const fileRef = useRef(null);
  const [pool, setPool] = useState([]);
  const [pickIndex, setPickIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [wornToday, setWornToday] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [inspoItems, setInspoItems] = useState([]);
  const [inspoBusy, setInspoBusy] = useState(false);
  const [pinterestUrl, setPinterestUrl] = useState(() => {
    try {
      return localStorage.getItem(PINTEREST_BOARD_KEY) || "";
    } catch {
      return "";
    }
  });
  const [showInspo, setShowInspo] = useState(false);
  const [weatherContext, setWeatherContext] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [purpose, setPurpose] = useState(() => {
    const saved = readDailyState();
    if (saved?.date === todayKey() && (saved.purpose === "build" || saved.purpose === "out")) {
      return saved.purpose;
    }
    return "build";
  });

  const closetReady = Array.isArray(items) && items.length > 0;

  const refreshInspo = useCallback(async () => {
    try {
      const res = await fetch("/api/wardrobe/inspo", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setInspoItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      /* optional */
    }
  }, []);

  const loadToday = useCallback(async ({ advance = false } = {}) => {
    if (!closetReady) {
      setLoading(false);
      setPool([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const snapshot = await getFreshSavedWeather();
      const liveWeather = snapshot ? weatherWardrobeContext(snapshot) : null;
      if (liveWeather) setWeatherContext(liveWeather);

      const response = await fetch("/api/wardrobe/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: purpose, // build = Comfy · out = Going out (jeans)
          count: POOL_SIZE,
          temperatureF: liveWeather?.temperatureF ?? 68,
          rain: Boolean(liveWeather?.rain),
          weatherLocation: liveWeather?.location,
          weatherCondition: liveWeather?.condition,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not generate today's outfit.");

      const nextPool = Array.isArray(payload.looks) ? payload.looks : [];
      setPool(nextPool);
      // Never surface climate essays ("hoodies off the board") — only real failures
      const rawWarn = Array.isArray(payload.warnings) ? payload.warnings.map(String) : [];
      setWarnings(
        rawWarn.filter(
          (w) =>
            !w.startsWith("Scoring with")
            && !/hoodies and heavy layers|off the board|Rain is in the context/i.test(w),
        ),
      );
      if (payload.inspo?.items) setInspoItems(payload.inspo.items);

      const saved = readDailyState();
      const sameDay = saved?.date === date && saved?.purpose === purpose;
      let index = 0;
      let worn = false;

      if (advance && nextPool.length) {
        const prev = sameDay ? Number(saved?.pickIndex || 0) : 0;
        index = (prev + 1) % nextPool.length;
        worn = false;
      } else if (sameDay && Number.isFinite(Number(saved?.pickIndex))) {
        index = Math.min(Math.max(0, Number(saved.pickIndex)), Math.max(0, nextPool.length - 1));
        if (saved.lookId) {
          const found = nextPool.findIndex((l) => l.id === saved.lookId);
          if (found >= 0) index = found;
        }
        worn = Boolean(saved.worn);
      } else if (nextPool.length) {
        index = daySeed(`${date}:${purpose}`) % nextPool.length;
        worn = false;
      }

      setPickIndex(index);
      setWornToday(worn);
      writeDailyState({
        date,
        purpose,
        pickIndex: index,
        lookId: nextPool[index]?.id || null,
        worn,
        generatedAt: payload.generatedAt || new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cloth generator failed.");
      setPool([]);
    } finally {
      setLoading(false);
    }
  }, [closetReady, date, purpose]);

  useEffect(() => {
    refreshInspo();
  }, [refreshInspo]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const look = pool[pickIndex] || null;
  const activeInspo = useMemo(() => inspoItems.filter((i) => i.active !== false), [inspoItems]);

  const pieces = useMemo(() => {
    if (!look?.items?.length) return [];
    let accI = 0;
    return look.items.map((item) => {
      let slot = flatlaySlot(item, accI);
      // Hard veto: footwear never lands in torso
      if (isFootwear(item)) slot = "shoes";
      if (slot === "acc" || slot === "acc2" || slot === "acc3") {
        slot = accI === 0 ? "acc" : accI === 1 ? "acc2" : "acc3";
        accI += 1;
      }
      return { ...item, flatlaySlot: slot };
    });
  }, [look]);

  // Explicit body groups — never rely on accidental CSS order for shoes
  const body = useMemo(() => {
    const outer = pieces.find((p) => p.flatlaySlot === "outer") || null;
    const top = pieces.find((p) => p.flatlaySlot === "top") || null;
    const bottom = pieces.find((p) => p.flatlaySlot === "bottom") || null;
    const shoes = pieces.find((p) => p.flatlaySlot === "shoes") || null;
    const accs = pieces.filter((p) => ["acc", "acc2", "acc3"].includes(p.flatlaySlot));
    return {
      outer,
      top,
      bottom,
      shoes,
      accs,
      layered: Boolean(outer && top),
      hasTorso: Boolean(outer || top),
    };
  }, [pieces]);

  const skipThis = async () => {
    if (busy || loading) return;
    setStatusNote("");
    setWornToday(false);
    // Advance to next ranked look for today — still only one on screen
    if (pool.length > 1) {
      const next = (pickIndex + 1) % pool.length;
      setPickIndex(next);
      writeDailyState({
        date,
        purpose,
        pickIndex: next,
        lookId: pool[next]?.id || null,
        worn: false,
        generatedAt: new Date().toISOString(),
      });
      setStatusNote("Next pick for today.");
    } else {
      await loadToday({ advance: true });
      setStatusNote("New pick for today.");
    }
  };

  const wearThis = async () => {
    if (!look || busy) return;
    setBusy(true);
    setStatusNote("");
    try {
      const response = await fetch("/api/wardrobe/outfit/wear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index: pickIndex + 1,
          actor: "mel",
          idempotencyKey: `daily-wear:${date}:${look.id || pickIndex}`,
          reason: "Daily cloth generator",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not log wear.");
      setWornToday(true);
      setStatusNote(payload.repeated ? "Already logged for today." : "Logged — wear count updated.");
      const saved = readDailyState() || {};
      writeDailyState({ ...saved, date, purpose, pickIndex, lookId: look.id, worn: true });
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : "Could not log wear.");
    } finally {
      setBusy(false);
    }
  };

  const likeThis = async (value) => {
    if (!look || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/wardrobe/outfit/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: pickIndex + 1, value, actor: "mel" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not save feedback.");
      }
      if (value === "dislike") {
        setStatusNote("Noted — next pick.");
        setBusy(false);
        await skipThis();
        return;
      }
      setStatusNote("Liked — generator will lean this way.");
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : "Could not save feedback.");
    } finally {
      setBusy(false);
    }
  };

  const uploadInspoFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) {
      setStatusNote("Drop image files (jpg/png/webp).");
      return;
    }
    setInspoBusy(true);
    setStatusNote("");
    try {
      let added = 0;
      for (const file of files.slice(0, 12)) {
        const dataUrl = await fileToDataUrl(file);
        const res = await fetch("/api/wardrobe/inspo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataUrl,
            title: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Dropped inspo",
            source: "upload",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not save inspo.");
        if (!data.duplicate) added += 1;
      }
      await refreshInspo();
      setStatusNote(added ? `Added ${added} inspo — refreshing today's look…` : "Those inspo images were already saved.");
      await loadToday({ advance: true });
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : "Inspo upload failed.");
    } finally {
      setInspoBusy(false);
    }
  };

  const connectPinterest = async () => {
    const url = pinterestUrl.trim();
    if (!url) {
      setStatusNote("Paste a Pinterest pin or public board URL.");
      return;
    }
    setInspoBusy(true);
    setStatusNote("Importing pins…");
    try {
      const res = await fetch("/api/wardrobe/inspo/pinterest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Pinterest import failed.");
      if (!data.imported) throw new Error("No real pin photos imported — board may be private or empty.");
      try {
        localStorage.setItem(PINTEREST_BOARD_KEY, url);
      } catch {
        /* ok */
      }
      await refreshInspo();
      await loadToday({ advance: true });
      setStatusNote(`Live · ${data.imported} inspo photos driving today's look.`);
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : "Pinterest import failed.");
    } finally {
      setInspoBusy(false);
    }
  };

  const toggleInspo = async (id, active) => {
    setInspoBusy(true);
    try {
      const res = await fetch(`/api/wardrobe/inspo/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not update inspo.");
      }
      await refreshInspo();
      await loadToday({ advance: true });
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : "Could not update inspo.");
    } finally {
      setInspoBusy(false);
    }
  };

  const deleteInspo = async (id) => {
    setInspoBusy(true);
    try {
      const res = await fetch(`/api/wardrobe/inspo/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not remove inspo.");
      }
      await refreshInspo();
      await loadToday({ advance: true });
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : "Could not remove inspo.");
    } finally {
      setInspoBusy(false);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    uploadInspoFiles(event.dataTransfer?.files);
  };

  if (!closetReady) {
    return (
      <section className="daily-gen" aria-label="Today's outfit">
        <header className="daily-gen__head">
          <p className="daily-gen__eyebrow">Today</p>
          <h2 className="daily-gen__title">Import pieces to unlock today&apos;s look</h2>
        </header>
        <p className="daily-gen__empty">
          One outfit a day from your closet — top, bottoms, shoes on paper. Add Owned pieces first.
        </p>
      </section>
    );
  }

  return (
    <section className="daily-gen" aria-label="Today's outfit">
      <header className="daily-gen__head">
        <div className="daily-gen__head-text">
          <p className="daily-gen__eyebrow">Today · {prettyDate(date)}</p>
          <h2 className="daily-gen__title">
            Wear this
            {weatherContext ? (
              <span className="daily-gen__weather-badge" title={weatherContext.location || ""}>
                {weatherContext.location ? `${weatherContext.location.split(",")[0]} · ` : ""}
                {Math.round(weatherContext.temperatureF)}° · {weatherContext.condition}
              </span>
            ) : null}
          </h2>
        </div>
        <div className="daily-gen__actions-top">
          <button type="button" className="daily-gen__btn ghost" onClick={() => setShowInspo((c) => !c)}>
            {activeInspo.length ? `Inspo · ${activeInspo.length}` : "Inspo"}
          </button>
        </div>
      </header>

      {/* Only two vibes — Comfy vs Going out (jeans) */}
      <div className="daily-gen__purposes" role="tablist" aria-label="Outfit vibe">
        {PURPOSES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={purpose === option.id}
            className={`daily-gen__purpose${purpose === option.id ? " is-active" : ""}`}
            onClick={() => {
              if (purpose === option.id) return;
              setPurpose(option.id);
              setStatusNote("");
              setWornToday(false);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {showInspo ? (
        <div
          className={`daily-gen__inspo${dragOver ? " is-drag" : ""}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="daily-gen__inspo-head">
            <div>
              <p className="daily-gen__inspo-label">Style inspo</p>
              <p className="daily-gen__inspo-hint">Drop outfit screenshots or paste a public Pinterest board or pin.</p>
            </div>
            <div className="daily-gen__inspo-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  uploadInspoFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="daily-gen__btn ghost"
                disabled={inspoBusy}
                onClick={() => fileRef.current?.click()}
              >
                Drop / upload
              </button>
            </div>
          </div>

          <div className="daily-gen__pinterest">
            <input
              className="daily-gen__pinterest-input"
              type="url"
              inputMode="url"
              placeholder="https://www.pinterest.com/…"
              value={pinterestUrl}
              onChange={(e) => setPinterestUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  connectPinterest();
                }
              }}
              disabled={inspoBusy}
              aria-label="Pinterest URL"
            />
            <button type="button" className="daily-gen__btn primary" onClick={connectPinterest} disabled={inspoBusy}>
              {inspoBusy ? "Pulling…" : "Import"}
            </button>
          </div>

          {inspoItems.length ? (
            <ul className="daily-gen__inspo-strip" aria-label="Saved inspo">
              {inspoItems.map((item) => (
                <li key={item.id} className={`daily-gen__inspo-card${item.active === false ? " is-off" : ""}`}>
                  <button
                    type="button"
                    className="daily-gen__inspo-thumb"
                    onClick={() => toggleInspo(item.id, item.active === false)}
                    title={item.active === false ? "Tap to activate" : "Tap to pause"}
                  >
                    <img src={item.imageUrl} alt="" loading="lazy" />
                    {item.source === "pinterest" ? <span className="daily-gen__inspo-src">Pin</span> : null}
                  </button>
                  {item.palette?.colors?.length ? (
                    <span className="daily-gen__swatches" aria-hidden="true">
                      {item.palette.colors.slice(0, 4).map((c) => (
                        <i key={c.hex} style={{ background: c.hex }} />
                      ))}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="daily-gen__inspo-x"
                    aria-label={`Remove ${item.title}`}
                    onClick={() => deleteInspo(item.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="daily-gen__inspo-empty">No inspo yet — optional color target for today&apos;s pick.</p>
          )}
        </div>
      ) : null}

      {loading ? (
        <p className="daily-gen__status">Locking today&apos;s look…</p>
      ) : error ? (
        <p className="daily-gen__status daily-gen__status--error">{error}</p>
      ) : !look ? (
        <p className="daily-gen__status">
          {warnings[0] || "Need at least one clean top and bottom to build an outfit."}
        </p>
      ) : (
        <>
          {/*
            Flat-lay law:
            1) Torso — outer (hoodie) and/or top (tee), layered when both
            2) Bottoms
            3) Shoes
            Never put footwear in the torso stack.
          */}
          <div
            className={[
              "daily-gen__flatlay",
              body.outer ? "has-outer" : "",
              body.top ? "has-top" : "",
              body.bottom ? "has-bottom" : "",
              body.shoes ? "has-shoes" : "",
              body.layered ? "is-layered-torso" : "",
              body.accs.length ? `has-acc-${Math.min(3, body.accs.length)}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="list"
            aria-label="Today's outfit flat lay"
          >
            <div className="daily-gen__flatlay-board">
              {body.hasTorso ? (
                <div className="daily-gen__flatlay-torso" aria-label="Top">
                  {body.outer ? (
                    <FlatlayPiece piece={body.outer} slot="outer" onOpenItem={onOpenItem} />
                  ) : null}
                  {body.top ? <FlatlayPiece piece={body.top} slot="top" onOpenItem={onOpenItem} /> : null}
                </div>
              ) : null}

              {body.bottom ? (
                <FlatlayPiece piece={body.bottom} slot="bottom" onOpenItem={onOpenItem} />
              ) : null}

              {body.shoes ? (
                <FlatlayPiece piece={body.shoes} slot="shoes" onOpenItem={onOpenItem} />
              ) : null}

              {body.accs.map((piece) => (
                <FlatlayPiece
                  key={piece.id}
                  piece={piece}
                  slot={piece.flatlaySlot || "acc"}
                  onOpenItem={onOpenItem}
                />
              ))}
            </div>
          </div>

          <div className="daily-gen__toolbar">
            <div className="daily-gen__commit">
              <button type="button" className="daily-gen__btn ghost" onClick={() => likeThis("dislike")} disabled={busy || loading}>
                Not this
              </button>
              <button type="button" className="daily-gen__btn ghost" onClick={() => likeThis("like")} disabled={busy}>
                Like
              </button>
              <button
                type="button"
                className={`daily-gen__btn primary${wornToday ? " is-done" : ""}`}
                onClick={wearThis}
                disabled={busy || wornToday}
              >
                {wornToday ? "Wearing today" : busy ? "Logging…" : "Wear this"}
              </button>
            </div>
          </div>

          {statusNote ? <p className="daily-gen__status">{statusNote}</p> : null}
          {/* Only blocking warnings (missing pieces) — never climate essays */}
          {warnings.length && !look ? (
            <p className="daily-gen__status daily-gen__status--warn">{warnings.join(" ")}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
