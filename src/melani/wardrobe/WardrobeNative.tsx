/**
 * Native wardrobe — self-contained, localStorage-backed clothing gallery.
 * No iframe, no backend: works in dev, static build, and offline copies.
 * Add items with a photo, tag them, filter, and see the category split.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "./wardrobe-native.css";

type Item = {
  id: string;
  name: string;
  category: string;
  color: string;
  photo: string | null; // data URL
  addedAt: number;
};

const CATEGORIES = [
  "Tops",
  "Bottoms",
  "Dresses",
  "Outerwear",
  "Shoes",
  "Accessories",
  "Bags",
  "Other",
];

const CAT_COLOR: Record<string, string> = {
  Tops: "#1f6f8b",
  Bottoms: "#e8743b",
  Dresses: "#c94f7c",
  Outerwear: "#7d5ba6",
  Shoes: "#4b8f6b",
  Accessories: "#d1a13a",
  Bags: "#b5651d",
  Other: "#6b8e9e",
};

const KEY = "wonder-wardrobe-v1";

function load(): Item[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full — photos are the likely cause */
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Downscale an image file to keep localStorage small. */
function fileToThumb(file: File, max = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function WardrobeNative() {
  const [items, setItems] = useState<Item[]>(() => load());
  const [filter, setFilter] = useState<string>("all");
  const [draft, setDraft] = useState<{ name: string; category: string; color: string; photo: string | null }>({
    name: "",
    category: "Tops",
    color: "",
    photo: null,
  });
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    save(items);
  }, [items]);

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.category === filter)),
    [items, filter]
  );

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.category, (m.get(i.category) || 0) + 1);
    return CATEGORIES.map((c) => ({ cat: c, n: m.get(c) || 0 })).filter((x) => x.n > 0);
  }, [items]);

  async function onPickPhoto(file: File | null) {
    if (!file) return;
    try {
      const thumb = await fileToThumb(file);
      setDraft((d) => ({ ...d, photo: thumb }));
    } catch {
      /* ignore unreadable image */
    }
  }

  function addItem() {
    const name = draft.name.trim();
    if (!name && !draft.photo) return;
    const item: Item = {
      id: uid(),
      name: name || "Untitled",
      category: draft.category,
      color: draft.color.trim(),
      photo: draft.photo,
      addedAt: Date.now(),
    };
    setItems((prev) => [item, ...prev]);
    setDraft({ name: "", category: draft.category, color: "", photo: null });
    setAdding(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const total = items.length;
  const pieTotal = byCat.reduce((s, x) => s + x.n, 0) || 1;

  return (
    <div className="wn">
      <header className="wn-head">
        <div>
          <h1>Wardrobe</h1>
          <p className="wn-sub">
            {total} item{total === 1 ? "" : "s"}
          </p>
        </div>
        <button type="button" className="wn-btn wn-btn-primary" onClick={() => setAdding((v) => !v)}>
          {adding ? "Close" : "+ Add item"}
        </button>
      </header>

      {adding ? (
        <section className="wn-form">
          <div className="wn-form-photo">
            {draft.photo ? (
              <img src={draft.photo} alt="preview" />
            ) : (
              <button type="button" className="wn-photo-drop" onClick={() => fileRef.current?.click()}>
                Add photo
              </button>
            )}
            {draft.photo ? (
              <button type="button" className="wn-link" onClick={() => setDraft((d) => ({ ...d, photo: null }))}>
                Remove photo
              </button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onPickPhoto(e.target.files?.[0] || null)}
            />
          </div>
          <div className="wn-form-fields">
            <label>
              Name
              <input
                value={draft.name}
                placeholder="e.g. Black wool coat"
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label>
              Category
              <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Color
              <input
                value={draft.color}
                placeholder="e.g. Charcoal"
                onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
              />
            </label>
            <button type="button" className="wn-btn wn-btn-primary" onClick={addItem}>
              Save item
            </button>
          </div>
        </section>
      ) : null}

      {total > 0 ? (
        <section className="wn-overview">
          {/* Category donut */}
          <svg viewBox="0 0 160 160" width={140} height={140} className="wn-donut" role="img" aria-label="Category split">
            {(() => {
              const R = 60;
              const C = 2 * Math.PI * R;
              let off = 0;
              return byCat.map((x) => {
                const frac = x.n / pieTotal;
                const len = frac * C;
                const seg = (
                  <circle
                    key={x.cat}
                    cx={80}
                    cy={80}
                    r={R}
                    fill="none"
                    stroke={CAT_COLOR[x.cat] || "#888"}
                    strokeWidth={22}
                    strokeDasharray={`${len} ${C - len}`}
                    strokeDashoffset={-off}
                    transform="rotate(-90 80 80)"
                  >
                    <title>{`${x.cat}: ${x.n}`}</title>
                  </circle>
                );
                off += len;
                return seg;
              });
            })()}
            <text x={80} y={86} textAnchor="middle" className="wn-donut-num">
              {total}
            </text>
          </svg>
          <ul className="wn-legend">
            {byCat.map((x) => (
              <li key={x.cat}>
                <span className="wn-dot" style={{ background: CAT_COLOR[x.cat] || "#888" }} />
                <span className="wn-legend-name">{x.cat}</span>
                <span className="wn-legend-n">{x.n}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Category filter */}
      {total > 0 ? (
        <nav className="wn-filter" aria-label="Filter by category">
          <button
            type="button"
            className={filter === "all" ? "is-active" : ""}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          {byCat.map((x) => (
            <button
              key={x.cat}
              type="button"
              className={filter === x.cat ? "is-active" : ""}
              onClick={() => setFilter(x.cat)}
            >
              {x.cat}
            </button>
          ))}
        </nav>
      ) : null}

      {/* Gallery */}
      {total === 0 ? (
        <div className="wn-empty">
          <div className="wn-empty-icon">👗</div>
          <p>Your closet is empty.</p>
          <p className="wn-sub">Add a piece with a photo to start building your wardrobe.</p>
        </div>
      ) : (
        <div className="wn-grid">
          {shown.map((i) => (
            <figure key={i.id} className="wn-card">
              <div className="wn-card-photo" style={{ background: i.photo ? undefined : (CAT_COLOR[i.category] || "#333") + "33" }}>
                {i.photo ? (
                  <img src={i.photo} alt={i.name} loading="lazy" />
                ) : (
                  <span className="wn-card-ph">{i.category}</span>
                )}
                <button type="button" className="wn-card-x" onClick={() => removeItem(i.id)} aria-label="Remove">
                  ×
                </button>
              </div>
              <figcaption>
                <span className="wn-card-name" title={i.name}>
                  {i.name}
                </span>
                <span className="wn-card-meta">
                  <span className="wn-dot" style={{ background: CAT_COLOR[i.category] || "#888" }} />
                  {i.category}
                  {i.color ? ` · ${i.color}` : ""}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
