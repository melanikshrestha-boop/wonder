/**
 * Daily Cloth Generator — outfit of the day from Melani's real closet.
 * Drop inspo images or paste a Pinterest pin/board URL; backend palette-matches looks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { getFreshSavedWeather, weatherWardrobeContext } from "../weather/weatherCore";
import "./daily-generator.css";

const DAILY_KEY = "wonder-daily-outfit-v1";
const PINTEREST_BOARD_KEY = "wonder-wardrobe-pinterest-board-v1";
const MODES = [
  { id: "build", label: "Comfort", note: "soft · unrestricted" },
  { id: "everyday", label: "Everyday", note: "clean · effortless" },
  { id: "out", label: "Going out", note: "stronger silhouette" },
  { id: "content", label: "Content", note: "camera-aware" },
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
  return "Piece";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

/**
 * @param {{ items: Array<Record<string, unknown>>, onOpenItem?: (id: string) => void }} props
 */
export function DailyGenerator({ items = [], onOpenItem }) {
  const date = todayKey();
  const fileRef = useRef(null);
  const [mode, setMode] = useState("build");
  const [looks, setLooks] = useState([]);
  const [lookIndex, setLookIndex] = useState(0);
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

  const closetReady = Array.isArray(items) && items.length > 0;

  const refreshInspo = useCallback(async () => {
    try {
      const res = await fetch("/api/wardrobe/inspo", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setInspoItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      /* inspo optional on first paint */
    }
  }, []);

  const loadLooks = useCallback(async ({ force = false } = {}) => {
    if (!closetReady) {
      setLoading(false);
      setLooks([]);
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
          mode,
          count: 8,
          temperatureF: liveWeather?.temperatureF ?? 68,
          rain: Boolean(liveWeather?.rain),
          weatherLocation: liveWeather?.location,
          weatherCondition: liveWeather?.condition,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not generate today's outfit.");
      const nextLooks = Array.isArray(payload.looks) ? payload.looks : [];
      setLooks(nextLooks);
      setWarnings(Array.isArray(payload.warnings) ? payload.warnings.map(String) : []);
      if (payload.inspo?.items) setInspoItems(payload.inspo.items);

      const saved = readDailyState();
      let index = 0;
      let worn = false;
      if (!force && saved?.date === date && Number.isFinite(Number(saved.lookIndex))) {
        index = Math.min(Math.max(0, Number(saved.lookIndex)), Math.max(0, nextLooks.length - 1));
        worn = Boolean(saved.worn);
      } else if (nextLooks.length) {
        const spin = force ? (Number(saved?.shuffleCount || 0) + 1) : 0;
        index = (daySeed(date) + spin) % nextLooks.length;
        writeDailyState({
          date,
          lookIndex: index,
          lookId: nextLooks[index]?.id || null,
          worn: false,
          shuffleCount: force ? spin : (saved?.date === date ? Number(saved?.shuffleCount || 0) : 0),
          generatedAt: payload.generatedAt || new Date().toISOString(),
        });
        setLookIndex(index);
        setWornToday(false);
        return;
      }
      setLookIndex(index);
      setWornToday(worn);
      writeDailyState({
        date,
        lookIndex: index,
        lookId: nextLooks[index]?.id || null,
        worn,
        shuffleCount: saved?.date === date ? Number(saved?.shuffleCount || 0) : 0,
        generatedAt: payload.generatedAt || new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cloth generator failed.");
      setLooks([]);
    } finally {
      setLoading(false);
    }
  }, [closetReady, date, mode]);

  useEffect(() => {
    refreshInspo();
  }, [refreshInspo]);

  useEffect(() => {
    loadLooks();
  }, [loadLooks]);

  const look = looks[lookIndex] || null;
  const activeInspo = useMemo(() => inspoItems.filter((i) => i.active !== false), [inspoItems]);

  const pieces = useMemo(() => {
    if (!look?.items?.length) return [];
    const rank = (item) => {
      const k = String(item.kind || item.part || "");
      if (k === "top" || k === "upperbody") return 0;
      if (k === "bottom" || k === "lowerbody") return 1;
      if (k === "shoes") return 2;
      if (k === "jacket" || k === "wholebody_up") return 3;
      return 4;
    };
    return [...look.items].sort((a, b) => rank(a) - rank(b));
  }, [look]);

  const persistIndex = (nextIndex) => {
    setLookIndex(nextIndex);
    const saved = readDailyState() || {};
    writeDailyState({
      ...saved,
      date,
      lookIndex: nextIndex,
      lookId: looks[nextIndex]?.id || null,
      worn: Boolean(saved.worn && saved.date === date),
    });
  };

  const nextLook = () => {
    if (!looks.length) return;
    persistIndex((lookIndex + 1) % looks.length);
    setStatusNote("");
    setWornToday(false);
  };

  const prevLook = () => {
    if (!looks.length) return;
    persistIndex((lookIndex - 1 + looks.length) % looks.length);
    setStatusNote("");
    setWornToday(false);
  };

  const reshuffle = () => {
    setStatusNote("");
    setWornToday(false);
    loadLooks({ force: true });
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
          index: lookIndex + 1,
          actor: "mel",
          idempotencyKey: `daily-wear:${date}:${look.id || lookIndex}`,
          reason: "Daily cloth generator",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not log wear.");
      setWornToday(true);
      setStatusNote(payload.repeated ? "Already logged for today." : "Logged — wear count updated.");
      const saved = readDailyState() || {};
      writeDailyState({ ...saved, date, lookIndex, lookId: look.id, worn: true });
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
        body: JSON.stringify({ index: lookIndex + 1, value, actor: "mel" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not save feedback.");
      }
      setStatusNote(value === "like" ? "Liked — generator will lean this way." : "Noted — will rank this lower.");
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
      setStatusNote(added ? `Added ${added} inspo ${added === 1 ? "image" : "images"} — regenerating looks…` : "Those inspo images were already saved.");
      await loadLooks({ force: true });
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
    setStatusNote("Importing the public pins and reading their palettes…");
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
        /* the live import still works when storage is unavailable */
      }
      await refreshInspo();
      setStatusNote(
        data.kind === "board"
          ? `Got ${data.imported} real outfit photos from “${data.title || "board"}”. Regenerating looks…`
          : `Got ${data.imported} pin photo${data.imported === 1 ? "" : "s"}. Regenerating looks…`,
      );
      await loadLooks({ force: true });
      setStatusNote(`Live · ${data.imported} inspo photos driving today’s ranking. Hit Reshuffle if you want a new lock.`);
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
      await loadLooks({ force: true });
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
      await loadLooks({ force: true });
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
      <section className="daily-gen" aria-label="Smart outfit generator">
        <header className="daily-gen__head">
          <p className="daily-gen__eyebrow">Smart outfit generator</p>
          <h2 className="daily-gen__title">Import pieces to unlock today&apos;s look</h2>
        </header>
        <p className="daily-gen__empty">
          The generator builds real outfits from your closet — top + bottom + shoes. Add Owned pieces first.
        </p>
      </section>
    );
  }

  return (
    <section className="daily-gen" aria-label="Smart outfit generator">
      <header className="daily-gen__head">
        <div className="daily-gen__head-text">
          <p className="daily-gen__eyebrow">Smart outfit generator · {prettyDate(date)}</p>
          <h2 className="daily-gen__title">
            Today&apos;s comfort-first edit
            {look?.vibes?.length ? (
              <span className="daily-gen__inspo-badge" title="Outfit vibe tags from knowledge base">
                {look.vibes.slice(0, 3).join(" · ")}
              </span>
            ) : look ? (
              <span className="daily-gen__score" title="Internal rank only — read Why for taste">
                {look.score}
              </span>
            ) : null}
            {activeInspo.length ? (
              <span className="daily-gen__inspo-badge" title="Active inspo images">
                {activeInspo.length} inspo
              </span>
            ) : null}
            {weatherContext ? (
              <span className="daily-gen__weather-badge">
                {Math.round(weatherContext.temperatureF)}° · {weatherContext.condition}
              </span>
            ) : null}
          </h2>
          <p className="daily-gen__sub">
            Built from your real closet, current weather, comfort rules, fit balance, and the Pinterest references you choose.
          </p>
        </div>
        <div className="daily-gen__actions-top">
          <button type="button" className="daily-gen__btn ghost" onClick={() => setShowInspo((current) => !current)}>
            {activeInspo.length ? `Pinterest · ${activeInspo.length}` : "Pinterest & inspo"}
          </button>
          <button type="button" className="daily-gen__btn primary" onClick={reshuffle} disabled={loading || busy || inspoBusy}>
            New lineup
          </button>
        </div>
      </header>

      <div className="daily-gen__modes" aria-label="Outfit purpose">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={mode === option.id ? "is-active" : ""}
            aria-pressed={mode === option.id}
            onClick={() => {
              setMode(option.id);
              setStatusNote("");
              setWornToday(false);
            }}
          >
            <strong>{option.label}</strong>
            <span>{option.note}</span>
          </button>
        ))}
      </div>

      {/* Inspo rail — drop zone + Pinterest + filmstrip */}
      {showInspo ? <div
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
            <p className="daily-gen__inspo-hint">
              Drop outfit screenshots or paste a public Pinterest profile, board, or pin.
            </p>
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
            placeholder="https://www.pinterest.com/pin/123…  (paste several pin links)"
            value={pinterestUrl}
            onChange={(e) => setPinterestUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                connectPinterest();
              }
            }}
            disabled={inspoBusy}
            aria-label="Pinterest pin URLs"
          />
          <button type="button" className="daily-gen__btn primary" onClick={connectPinterest} disabled={inspoBusy}>
            {inspoBusy ? "Pulling…" : "Import pins"}
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
          <p className="daily-gen__inspo-empty">
            No inspo yet — drop a fit photo or connect a public Pinterest board so today&apos;s generator has a color target.
          </p>
        )}
      </div> : null}

      {loading ? (
        <p className="daily-gen__status">Generating today&apos;s look…</p>
      ) : error ? (
        <p className="daily-gen__status daily-gen__status--error">{error}</p>
      ) : !look ? (
        <p className="daily-gen__status">
          {warnings[0] || "Need at least one clean top and bottom to build an outfit."}
        </p>
      ) : (
        <>
          <div className="daily-gen__stage" role="list">
            {pieces.map((piece) => {
              const src = pieceImage(piece);
              return (
                <button
                  key={piece.id}
                  type="button"
                  className="daily-gen__piece"
                  role="listitem"
                  onClick={() => onOpenItem?.(piece.id)}
                  aria-label={`Open ${piece.name || kindLabel(piece)}`}
                >
                  <span className="daily-gen__piece-media" aria-hidden="true">
                    {src ? (
                      <OptimizedImage
                        className="daily-gen__img"
                        src={src}
                        alt=""
                        sizes="160px"
                        breakpoints={[120, 180, 240, 320]}
                      />
                    ) : (
                      <span className="daily-gen__img-fallback" style={{ background: piece.color || "#ccc" }} />
                    )}
                  </span>
                  <span className="daily-gen__piece-meta">
                    <span className="daily-gen__piece-kind">{kindLabel(piece)}</span>
                    <span className="daily-gen__piece-name">{piece.name || "Piece"}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {look.inspoMatch?.length ? (
            <p className="daily-gen__inspo-match">
              Matched inspo: {look.inspoMatch.join(" · ")}
            </p>
          ) : null}

          {(look.summary || look.reasons?.[0]) ? (
            <div className="daily-gen__why-block">
              <p className="daily-gen__why">
                <span className="daily-gen__why-label">Why</span>
                {look.summary || look.reasons[0]}
              </p>
              {look.reasons?.length > 1 ? (
                <ul className="daily-gen__why-list">
                  {look.reasons.slice(1, 4).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="daily-gen__toolbar">
            <div className="daily-gen__pager">
              <button type="button" className="daily-gen__btn ghost" onClick={prevLook} disabled={looks.length < 2}>
                ← Prev
              </button>
              <span className="daily-gen__pager-label">
                Look {lookIndex + 1} / {looks.length}
              </span>
              <button type="button" className="daily-gen__btn ghost" onClick={nextLook} disabled={looks.length < 2}>
                Next →
              </button>
            </div>
            <div className="daily-gen__commit">
              <button type="button" className="daily-gen__btn ghost" onClick={() => likeThis("dislike")} disabled={busy}>
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
          {warnings.length ? (
            <p className="daily-gen__status daily-gen__status--warn">{warnings.filter((w) => !w.startsWith("Scoring with")).join(" ")}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
