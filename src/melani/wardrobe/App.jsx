import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { WardrobeImportFlow } from "./import-flow.jsx";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { StyleShopper } from "./StyleShopper.jsx";
import { DailyGenerator } from "./DailyGenerator.jsx";

const STORAGE_KEY = "open-wardrobe-edits-v1";
const DELETED_STORAGE_KEY = "open-wardrobe-deleted-v1";
const SHOP_WANTS_KEY = "wonder-style-shopper-wants-v1";
const PINTEREST_BOARD_KEY = "wonder-wardrobe-pinterest-board-v1";
const RESALE_FIX_KEY = "wonder-wardrobe-resale-correction-2026-07-27";
/** Gallery density: 0 = most columns (zoom out), 4 = fewest (zoom in) */
const DENSITY_KEY = "wonder-wardrobe-density-v1";
const DENSITY_MIN = 0;
const DENSITY_MAX = 4;
const DENSITY_MINMAX = [108, 128, 152, 188, 240];

function isOriginalResalePiece(item) {
  return /anti social social club.*hoodie|fear of god essentials.*hoodie/i.test(
    String(item?.name || ""),
  );
}

function isWantItem(item) {
  return item?.role === "wishlist"
    || (item?.tags || []).some((tag) => String(tag).toLowerCase() === "want");
}

function isForSaleItem(item) {
  return Boolean(item?.forSale) && !isWantItem(item);
}

function readShopWants() {
  try {
    const rows = JSON.parse(localStorage.getItem(SHOP_WANTS_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function shopWantToItem(row) {
  const lane = String(row.lane || row.tags?.[0] || "").toLowerCase();
  const part =
    lane === "jeans" || lane === "sweats"
      ? "lowerbody"
      : lane === "shoes"
        ? "shoes"
        : "upperbody";
  return {
    id: String(row.id || `shop-want-${Date.now()}`).startsWith("shop-want-")
      ? String(row.id)
      : `shop-want-${row.id}`,
    name: row.name || "Saved find",
    brand: row.brand || "",
    part,
    role: "wishlist",
    tags: [...new Set([...(row.tags || []), "want", "wishlist"])],
    productRef: row.productRef || row.url || "",
    retailPrice: row.price ?? null,
    retailCurrency: row.currency || "USD",
    image: row.image || null,
    thumbnail: row.image || null,
    savedAt: row.savedAt || new Date().toISOString(),
    source: "style-shopper",
  };
}

function productUrlForItem(item) {
  const candidate = String(item?.productRef || item?.url || "").trim();
  if (/^https?:\/\//i.test(candidate)) return candidate;
  const seedSource = String(item?.seedSource || "").trim();
  if (/^https?:\/\//i.test(seedSource)) return seedSource;
  if (/handball spezial/i.test(item?.name || "") && /bd7632/i.test(candidate)) {
    return "https://www.adidas.com/us/handball-spezial-shoes/BD7632.html";
  }
  const terms = [item?.brand, item?.name].filter(Boolean);
  const dedupedTerms = terms.filter((term, index) => {
    if (index === 0) return true;
    return !String(term).toLowerCase().startsWith(`${String(terms[0]).toLowerCase()} `);
  });
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
    dedupedTerms.join(" "),
  )}`;
}

function pinterestSearchForItem(item) {
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(
    [item?.name, "outfit"].filter(Boolean).join(" "),
  )}`;
}

/**
 * Closet nav — top-level sections Melani asked for.
 * Tops → Hoodies / Tees · Bottoms → Jeans / Sweats · then Shoes, Dresses, Jackets, All.
 */
const NAV = [
  {
    id: "tops",
    label: "Tops",
    singular: "Top",
    sub: [
      { id: "hoodies", label: "Hoodies" },
      { id: "tees", label: "Tees" },
    ],
  },
  {
    id: "bottoms",
    label: "Bottoms",
    singular: "Bottom",
    sub: [
      { id: "jeans", label: "Jeans" },
      { id: "sweats", label: "Sweats" },
    ],
  },
  { id: "shoes", label: "Shoes", singular: "Shoes" },
  { id: "dresses", label: "Dresses", singular: "Dress" },
  { id: "jackets", label: "Jackets", singular: "Jacket" },
  { id: "all", label: "All" },
];

const NAV_MAP = Object.fromEntries(NAV.map((n) => [n.id, n]));

/** Schema `part` values still used in the editor / API */
const PART_OPTIONS = [
  { id: "upperbody", label: "Top (hoodie / tee)" },
  { id: "lowerbody", label: "Bottom (jeans / sweats)" },
  { id: "shoes", label: "Shoes" },
  { id: "dresses", label: "Dress" },
  { id: "wholebody_up", label: "Jacket" },
  { id: "accessories_up", label: "Accessory" },
];

const TYPE_MAP = {
  upperbody: { id: "upperbody", label: "Tops", singular: "Top" },
  lowerbody: { id: "lowerbody", label: "Bottoms", singular: "Bottom" },
  shoes: { id: "shoes", label: "Shoes", singular: "Shoes" },
  dresses: { id: "dresses", label: "Dresses", singular: "Dress" },
  wholebody_up: { id: "wholebody_up", label: "Jackets", singular: "Jacket" },
  accessories_up: { id: "accessories_up", label: "Accessories", singular: "Accessory" },
  ...Object.fromEntries(NAV.map((n) => [n.id, n])),
  hoodies: { id: "hoodies", label: "Hoodies", singular: "Hoodie" },
  tees: { id: "tees", label: "Tees", singular: "Tee" },
  jeans: { id: "jeans", label: "Jeans", singular: "Jeans" },
  sweats: { id: "sweats", label: "Sweats", singular: "Sweats" },
};

/**
 * Smart front/back hover: only tops that actually have a distinct back design
 * (hoodie print, graphic tee logo, jersey back). Never bottoms / shoes / jackets.
 */
function itemHasBackDesign(item, front, back) {
  if (!back || !front) return false;
  if (pathKey(back) === pathKey(front)) return false;
  const family = itemFamily(item);
  // Never for shoes / plain bottoms / jackets / dresses — unless the piece
  // carries a real back graphic (e.g. NYC NEW YORK print on jeans).
  if (family === "shoes" || family === "jackets" || family === "dresses") {
    return false;
  }
  if (family === "jeans" || family === "sweats") {
    // Only when we explicitly stored a back design (graphic / print)
    return Boolean(item.hasBackDesign) || (item.tags || []).includes("back-print");
  }
  // Hoodies always eligible when back asset exists
  if (family === "hoodies") return true;
  // Tees / other tops: eligible when we stored a real back (logo/print side)
  if (family === "tees" || family === "other") return true;
  return false;
}

/** Fine-grained family: hoodies | tees | jeans | sweats | shoes | dresses | jackets | other */
function itemFamily(item) {
  const tags = (item.tags || []).map((t) => String(t).toLowerCase());
  const name = String(item.name || "").toLowerCase();
  const part = String(item.part || "").toLowerCase();
  const blob = `${name} ${tags.join(" ")} ${part}`;

  if (part === "shoes" || /\b(sneaker|sneakers|boot|boots|shoe|shoes)\b/.test(blob)) {
    return "shoes";
  }
  if (part === "dresses" || /\bdress(es)?\b/.test(blob)) {
    return "dresses";
  }
  if (
    part === "wholebody_up"
    || /\b(jacket|puffer|coat|parka|blazer|windbreaker)\b/.test(blob)
  ) {
    return "jackets";
  }

  // Bottoms
  const isBottom =
    part === "lowerbody"
    || /\b(jean|jeans|denim|sweatpant|sweatpants|joggers?|trouser|trousers|pant|pants|bottom)\b/.test(blob);
  if (isBottom) {
    if (/\b(sweatpant|sweatpants|sweats|jogger|joggers)\b/.test(blob)) return "sweats";
    if (/\b(jean|jeans|denim)\b/.test(blob)) return "jeans";
    // default bottoms → jeans bucket (denim-first closet)
    return "jeans";
  }

  // Tops
  const isTop =
    part === "upperbody"
    || /\b(hoodie|hooded|crewneck|sweatshirt|tee|t-shirt|tshirt|shirt|top|sweater|knit)\b/.test(blob);
  if (isTop) {
    if (/\b(hoodie|hooded|crewneck|sweatshirt|pullover)\b/.test(blob)) return "hoodies";
    if (/\b(tee|t-shirt|tshirt)\b/.test(blob)) return "tees";
    // untagged tops land in tees until classified
    return "tees";
  }

  return "other";
}

/** Top-level section for nav: tops | bottoms | shoes | dresses | jackets | other */
function itemSection(item) {
  const family = itemFamily(item);
  if (family === "hoodies" || family === "tees") return "tops";
  if (family === "jeans" || family === "sweats") return "bottoms";
  return family;
}

const SECTION_ORDER = ["tops", "bottoms", "shoes", "dresses", "jackets"];
const FAMILY_ORDER = {
  tops: ["hoodies", "tees"],
  bottoms: ["jeans", "sweats"],
};
const FAMILY_LABEL = {
  hoodies: "Hoodies",
  tees: "Tees",
  jeans: "Jeans",
  sweats: "Sweats",
  shoes: "Shoes",
  dresses: "Dresses",
  jackets: "Jackets",
  other: "Other",
};


function readEdits() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Merge a localStorage edit onto a library item.
 * Never let null/empty edit fields wipe library composition, size, or price.
 */
function mergeLibraryEdit(item, edit) {
  if (!edit) return item;
  const editIsCurrent = (edit.analysisVersion || 0) >= (item.analysisVersion || 0);
  if (!editIsCurrent) return item;
  const merged = { ...item, ...edit };
  // Prefer real library/product data when edit left materials blank
  if (!merged.composition) {
    merged.composition = item.composition || item.fabric?.text || null;
  }
  if (!merged.fabric) {
    merged.fabric = item.fabric || (item.composition ? { text: item.composition } : null);
  }
  if (merged.size == null || merged.size === "") {
    merged.size = item.size ?? null;
  }
  if (!merged.sizeLabel) {
    merged.sizeLabel = item.sizeLabel || null;
  }
  if (merged.retailPrice == null && item.retailPrice != null) {
    merged.retailPrice = item.retailPrice;
  }
  if (!merged.brand) {
    merged.brand = item.brand || null;
  }
  return merged;
}

function persistEdit(item) {
  const edits = readEdits();
  edits[item.id] = {
    name: item.name || "",
    part: item.part,
    color: item.color || null,
    secondaryColor: item.secondaryColor || null,
    tags: item.tags || [],
    forSale: Boolean(item.forSale),
    askingPrice: item.askingPrice || "",
    condition: item.condition || "Excellent",
    analysisVersion: item.analysisVersion || 0,
    composition: item.composition || item.fabric?.text || null,
    fabric: item.fabric || (item.composition ? { text: item.composition } : null),
    fit: item.fit || "unknown",
    size: item.size || null,
    sizeLabel: item.sizeLabel || null,
    brand: item.brand || null,
    qualityNotes: item.qualityNotes || null,
    productRef: item.productRef || null,
    retailPrice: item.retailPrice ?? null,
    retailCurrency: item.retailCurrency || "USD",
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
}

function removePersistedEdit(id) {
  const edits = readEdits();
  delete edits[id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
}

function readDeletedItems() {
  try {
    const value = JSON.parse(localStorage.getItem(DELETED_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function persistDeletedItem(id) {
  const deleted = readDeletedItems();
  deleted.add(id);
  localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify([...deleted]));
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function colorDistance(first, second) {
  return Math.sqrt(
    ((first.red - second.red) ** 2)
    + ((first.green - second.green) ** 2)
    + ((first.blue - second.blue) ** 2),
  );
}

function extractPalette(image) {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map();

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 72) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const key = `${Math.round(red / 28)}-${Math.round(green / 28)}-${Math.round(blue / 28)}`;
    const current = buckets.get(key) || { red: 0, green: 0, blue: 0, count: 0 };
    current.red += red;
    current.green += green;
    current.blue += blue;
    current.count += 1;
    buckets.set(key, current);
  }

  const ranked = [...buckets.values()]
    .map((bucket) => ({
      red: Math.round(bucket.red / bucket.count),
      green: Math.round(bucket.green / bucket.count),
      blue: Math.round(bucket.blue / bucket.count),
      count: bucket.count,
    }))
    .sort((a, b) => b.count - a.count);

  const selected = [];
  for (const color of ranked) {
    if (selected.every((existing) => colorDistance(existing, color) > 38)) selected.push(color);
    if (selected.length === 5) break;
  }

  return selected.map((color) => rgbToHex(color.red, color.green, color.blue));
}

function buildSamplingCanvas(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0);
  return canvas;
}

function sampleImageColor(image, canvas, event) {
  const bounds = image.getBoundingClientRect();
  const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  const offsetX = (bounds.width - renderedWidth) / 2;
  const offsetY = (bounds.height - renderedHeight) / 2;
  const imageX = Math.floor((event.clientX - bounds.left - offsetX) / scale);
  const imageY = Math.floor((event.clientY - bounds.top - offsetY) / scale);

  if (imageX < 0 || imageY < 0 || imageX >= canvas.width || imageY >= canvas.height) return null;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  for (let radius = 0; radius <= 18; radius += 2) {
    const startX = Math.max(0, imageX - radius);
    const startY = Math.max(0, imageY - radius);
    const width = Math.min(canvas.width - startX, (radius * 2) + 1);
    const height = Math.min(canvas.height - startY, (radius * 2) + 1);
    const data = context.getImageData(startX, startY, width, height).data;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] > 96) return rgbToHex(data[index], data[index + 1], data[index + 2]);
    }
  }

  return null;
}

function formatRetailPrice(amount, currency = "USD") {
  if (amount == null || amount === "") return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  // Melani sign is always $ — never show € in the wardrobe
  void currency;
  return n % 1 ? `$${n.toFixed(2)}` : `$${n}`;
}

/** Parse "$48" / "48" / "48.00" → number or null */
function parseMoneyInput(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pathKey(url) {
  if (!url || typeof url !== "string") return "";
  return url.split(/[?#]/, 1)[0];
}

function GalleryItem({
  item,
  selected,
  onOpen,
  hideWantBadge = false,
  sellMode = false,
  onAskingPriceChange,
}) {
  const type = TYPE_MAP[item.part]?.singular || "wardrobe item";
  const front = item.frontImage || item.image || item.thumbnail;
  const back = item.backImage || null;
  // Back hover when a real back design exists (hoodies, graphic tees, NYC jeans, etc.)
  const hasBack = itemHasBackDesign(item, front, back);
  const retail = formatRetailPrice(item.retailPrice, item.retailCurrency || "USD");
  const askFormatted = formatRetailPrice(item.askingPrice, item.retailCurrency || "USD");
  const sizes = "(max-width: 520px) calc(50vw - 16px), (max-width: 860px) calc(33vw - 18px), 180px";
  const breakpoints = [120, 180, 240, 320, 480];
  // On the Want page, "Want" badges are redundant — you're already in Want
  const showWantBadge =
    !hideWantBadge
    && (item.role === "wishlist" || (item.tags || []).includes("want"));
  // Sell mode: retail X'd out in grey · editable ask next to it
  const [askDraft, setAskDraft] = useState(
    item.askingPrice != null && item.askingPrice !== ""
      ? String(item.askingPrice)
      : "",
  );
  useEffect(() => {
    setAskDraft(
      item.askingPrice != null && item.askingPrice !== ""
        ? String(item.askingPrice)
        : "",
    );
  }, [item.id, item.askingPrice]);

  const commitAsk = () => {
    if (!onAskingPriceChange) return;
    const parsed = parseMoneyInput(askDraft);
    // keep draft as typed number string or empty
    const next = parsed == null ? "" : String(parsed);
    setAskDraft(next);
    if (String(item.askingPrice ?? "") !== next) {
      onAskingPriceChange(item.id, next);
    }
  };

  return (
    <button
      className={[
        "gallery-item",
        selected ? "selected" : "",
        item.part === "shoes" ? "is-shoe" : "",
        hasBack ? "has-back" : "",
        sellMode ? "is-sell" : "",
      ].filter(Boolean).join(" ")}
      type="button"
      onClick={() => onOpen(item.id)}
      aria-label={`Open ${item.name || type}${retail ? ` · retail ${retail}` : ""}${askFormatted ? ` · ask ${askFormatted}` : ""}${hasBack ? " · hover for back" : ""}`}
      aria-pressed={selected}
      data-part={item.part || ""}
      data-testid={`wardrobe-item-${item.id}`}
    >
      {/* Stacked front/back — hover or keyboard focus reveals the back (logo/print side) */}
      <span className="gallery-item-media" aria-hidden="true">
        {front ? (
          <OptimizedImage
            className="gallery-img gallery-img-front"
            src={front}
            alt=""
            sizes={sizes}
            breakpoints={breakpoints}
          />
        ) : (
          <span className="gallery-item-lettermark">
            <span>{item.brand || "Saved"}</span>
            <small>Product link ready</small>
          </span>
        )}
        {hasBack ? (
          <OptimizedImage
            className="gallery-img gallery-img-back"
            src={back}
            alt=""
            sizes={sizes}
            breakpoints={breakpoints}
            loading="lazy"
          />
        ) : null}

      </span>
      <span className="gallery-item-meta">
        <span className="gallery-item-name" style={{ color: "#2c2a27", WebkitTextFillColor: "#2c2a27" }}>
          {item.name || type}
        </span>
        {sellMode ? (
          <span className="gallery-item-price-row sell-price-row">
            {retail ? (
              <span className="gallery-item-retail-was" title="Retail / original">
                {retail}
              </span>
            ) : null}
            <span
              className="gallery-item-ask-wrap"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <span className="gallery-item-ask-prefix" aria-hidden="true">$</span>
              <input
                className="gallery-item-ask-input"
                type="text"
                inputMode="decimal"
                value={askDraft}
                placeholder={item.retailPrice != null ? String(item.retailPrice) : "0"}
                aria-label={`Your sell price for ${item.name || type}`}
                onChange={(event) => setAskDraft(event.target.value.replace(/[^0-9.]/g, ""))}
                onBlur={commitAsk}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  // don't let parent button steal keys
                  event.stopPropagation();
                }}
              />
            </span>
          </span>
        ) : retail ? (
          <span
            className="gallery-item-retail"
            style={{ color: "#141210", WebkitTextFillColor: "#141210", opacity: 1 }}
          >
            {retail}
          </span>
        ) : null}
      </span>
      {showWantBadge ? (
        <span className="gallery-item-badge">Want</span>
      ) : null}
    </button>
  );
}

function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const nextTag = input.trim().replace(/^#/, "");
    if (!nextTag || tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) return;
    onChange([...tags, nextTag]);
    setInput("");
  };

  return (
    <div className="tag-editor">
      <div className="editable-tags">
        {tags.map((tag) => (
          <span className="editable-tag" key={tag}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((existing) => existing !== tag))} aria-label={`Remove ${tag}`}>
              <X size={12} weight="regular" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="tag-input-row">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a detail"
          aria-label="Add detail tag"
        />
        <button type="button" onClick={addTag} disabled={!input.trim()} aria-label="Add detail">
          <Plus size={15} weight="regular" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ColorControl({ label, field, value, palette, onChange, sampling, setSampling, optional = false, onClear, onAdd }) {
  if (optional && !value) {
    return (
      <div className="color-slot empty-color-slot">
        <div className="color-slot-heading">
          <span>{label}</span>
          <small>Optional</small>
        </div>
        <p>No distinct secondary color detected.</p>
        <button className="add-secondary-button" type="button" onClick={onAdd}>Add secondary color</button>
      </div>
    );
  }

  return (
    <div className="color-slot">
      <div className="color-slot-heading">
        <span>{label}</span>
        {optional && <button type="button" onClick={onClear}>Remove</button>}
      </div>
      <label className="selected-color-control">
        <input
          type="color"
          value={value || "#9a9286"}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Choose ${label.toLowerCase()}`}
        />
        <span className="selected-color-copy">
          <small>Selected</small>
          <strong>{value || "Custom"}</strong>
        </span>
      </label>
      <div className="suggestion-heading">
        <span>Image suggestions</span>
        <small>Click to apply</small>
      </div>
      <div className="palette" aria-label={`${label} suggestions from image`}>
        {palette.map((color) => (
          <button
            type="button"
            key={color}
            className={value?.toLowerCase() === color.toLowerCase() ? "active" : ""}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Use ${color} as ${label.toLowerCase()}`}
            title={color}
          />
        ))}
      </div>
      <button
        className={`sample-button${sampling === field ? " active" : ""}`}
        type="button"
        onClick={() => setSampling((current) => current === field ? null : field)}
      >
        {sampling === field ? "Cancel picking" : `Pick ${label.toLowerCase()} from image`}
      </button>
    </div>
  );
}

function ItemEditor({ draft, setDraft, palette, sampling, setSampling, sampleStatus }) {
  const suggestedSecondary = palette.find((color) => color.toLowerCase() !== draft.color?.toLowerCase()) || "#9a9286";

  return (
    <div className="item-editor">
      <label className="field">
        <span>Name</span>
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder={TYPE_MAP[draft.part]?.singular || "Wardrobe item"}
        />
      </label>

      <label className="field">
        <span>Category</span>
        <select value={draft.part} onChange={(event) => setDraft((current) => ({ ...current, part: event.target.value }))}>
          {PART_OPTIONS.map((type) => (
            <option value={type.id} key={type.id}>{type.label}</option>
          ))}
        </select>
      </label>

      <fieldset className="color-field">
        <legend>Colors</legend>
        <div className="colors-editor">
          <ColorControl
            label="Primary color"
            field="primary"
            value={draft.color}
            palette={palette}
            onChange={(color) => setDraft((current) => ({ ...current, color }))}
            sampling={sampling}
            setSampling={setSampling}
          />
          <ColorControl
            label="Secondary color"
            field="secondary"
            value={draft.secondaryColor}
            palette={palette}
            onChange={(secondaryColor) => setDraft((current) => ({ ...current, secondaryColor }))}
            sampling={sampling}
            setSampling={setSampling}
            optional
            onClear={() => setDraft((current) => ({ ...current, secondaryColor: null }))}
            onAdd={() => setDraft((current) => ({ ...current, secondaryColor: suggestedSecondary }))}
          />
        </div>
        <p className="color-help" aria-live="polite">{sampling ? `Click anywhere on the garment to sample the ${sampling} color.` : sampleStatus || "Primary colors come from the image. A secondary is suggested only when a distinct color has meaningful coverage."}</p>
      </fieldset>

      <div className="field details-field">
        <span>Details</span>
        <TagEditor tags={draft.tags} onChange={(tags) => setDraft((current) => ({ ...current, tags }))} />
      </div>

      <label className="field">
        <span>Fabric / composition</span>
        <input
          value={draft.composition || ""}
          onChange={(event) => setDraft((current) => ({ ...current, composition: event.target.value }))}
          placeholder="98% cotton 2% elastane · or 55% cotton 45% polyester hoodie"
        />
      </label>
      <div className="field-row quality-fields">
        <label className="field">
          <span>Fit</span>
          <select value={draft.fit || "unknown"} onChange={(event) => setDraft((current) => ({ ...current, fit: event.target.value }))}>
            <option value="unknown">Unknown</option>
            <option value="baggy">Baggy / oversized</option>
            <option value="relaxed">Relaxed</option>
            <option value="regular">Regular</option>
            <option value="slim">Slim</option>
            <option value="tight">Tight</option>
          </select>
        </label>
        <label className="field">
          <span>Size</span>
          <input value={draft.size || ""} onChange={(event) => setDraft((current) => ({ ...current, size: event.target.value }))} placeholder="M / 28 / etc" />
        </label>
        <label className="field">
          <span>Brand</span>
          <input value={draft.brand || ""} onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))} placeholder="Uniqlo" />
        </label>
      </div>
      <label className="field">
        <span>Quality notes</span>
        <input
          value={draft.qualityNotes || ""}
          onChange={(event) => setDraft((current) => ({ ...current, qualityNotes: event.target.value }))}
          placeholder="best sweatpants · tailor ripped last hem"
        />
      </label>
      <label className="field">
        <span>Product link</span>
        <input
          value={draft.productRef || ""}
          onChange={(event) => setDraft((current) => ({ ...current, productRef: event.target.value }))}
          placeholder="https://…"
          inputMode="url"
        />
      </label>
      {draft.productRef ? (
        <a
          className="product-ref-link"
          href={draft.productRef}
          target="_blank"
          rel="noreferrer"
        >
          Open product page ↗
        </a>
      ) : null}

      <div className="field-row quality-fields">
        <label className="field">
          <span>Retail price</span>
          <input
            inputMode="decimal"
            value={draft.retailPrice ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, retailPrice: event.target.value }))}
            placeholder="115"
          />
        </label>
        <label className="field">
          <span>Currency</span>
          <select
            value={draft.retailCurrency || "USD"}
            onChange={(event) => setDraft((current) => ({ ...current, retailCurrency: event.target.value }))}
          >
            <option value="USD">USD $</option>
            <option value="EUR">EUR €</option>
          </select>
        </label>
      </div>

      <fieldset className="resale-field">
        <legend>Resale</legend>
        <label className="resale-toggle"><input type="checkbox" checked={Boolean(draft.forSale)} onChange={(event) => setDraft((current) => ({ ...current, forSale: event.target.checked }))} /><span>Move this piece to my resale rack</span></label>
        {draft.forSale && <div className="resale-fields"><label><span>Your ask</span><input inputMode="decimal" value={draft.askingPrice || ""} onChange={(event) => setDraft((current) => ({ ...current, askingPrice: event.target.value }))} placeholder="$" /></label><label><span>Condition</span><select value={draft.condition || "Excellent"} onChange={(event) => setDraft((current) => ({ ...current, condition: event.target.value }))}><option>New with tags</option><option>Like new</option><option>Excellent</option><option>Good</option><option>Fair</option></select></label></div>}
      </fieldset>
    </div>
  );
}

/**
 * Clean product popup only — photo + name + price.
 * No form fields, no side sheet, no “details editor” page.
 * On Sell: retail strikethrough + editable ask.
 */
function ItemViewer({ item, onClose, onDelete, sellMode = false, onAskingPriceChange }) {
  const closeButtonRef = useRef(null);
  const type = TYPE_MAP[item.part]?.singular || "Wardrobe item";
  const front = item.frontImage || item.image || item.thumbnail;
  const back = item.backImage || null;
  // Popup: same smart rule — back only when a real back design exists
  const hasBack = itemHasBackDesign(item, front, back);
  const retail = formatRetailPrice(item.retailPrice, item.retailCurrency || "USD");
  const name = item.name || type;
  const productUrl = productUrlForItem(item);
  const pinterestUrl = pinterestSearchForItem(item);
  const family = itemFamily(item);
  const tags = (item.tags || [])
    .filter((tag) => !["own", "daily", "wishlist", "want"].includes(String(tag).toLowerCase()))
    .slice(0, 4);
  const statusText = item.forSale || sellMode
    ? "For sale"
    : isWantItem(item)
      ? "Wishlist"
      : "In closet";
  const materials =
    item.composition ||
    (typeof item.fabric === "string"
      ? item.fabric
      : item.fabric?.text) ||
    null;
  const sizeText =
    item.sizeLabel ||
    (item.size != null && String(item.size).trim() !== ""
      ? String(item.size)
      : null);
  const [askDraft, setAskDraft] = useState(
    item.askingPrice != null && item.askingPrice !== ""
      ? String(item.askingPrice)
      : "",
  );
  useEffect(() => {
    setAskDraft(
      item.askingPrice != null && item.askingPrice !== ""
        ? String(item.askingPrice)
        : "",
    );
  }, [item.id, item.askingPrice]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.classList.add("viewer-open");
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("viewer-open");
    };
  }, [onClose]);

  return (
    <div
      className="viewer-overlay viewer-overlay-popup"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="product-popup"
        data-family={family}
        role="dialog"
        aria-modal="true"
        aria-label={name}
      >
        <button
          className="product-popup-close"
          type="button"
          onClick={onClose}
          aria-label="Close"
          ref={closeButtonRef}
        >
          <X size={22} weight="light" aria-hidden="true" />
        </button>

        <div className={`product-popup-stage${hasBack ? " has-back" : ""}`}>
          <OptimizedImage
            className="product-popup-img product-popup-front"
            src={front}
            alt=""
            sizes="(max-width: 520px) 80vw, 360px"
            breakpoints={[240, 320, 480, 640]}
            priority
          />
          {hasBack ? (
            <OptimizedImage
              className="product-popup-img product-popup-back"
              src={back}
              alt=""
              sizes="(max-width: 520px) 80vw, 360px"
              breakpoints={[240, 320, 480, 640]}
            />
          ) : null}

        </div>

        <div className="product-popup-meta">
          <div className="product-popup-kicker">
            <span>{statusText}</span>
            <span>{TYPE_MAP[item.part]?.label || type}</span>
          </div>
          {item.brand ? <p className="product-popup-brand">{item.brand}</p> : null}
          <h2 className="product-popup-name">{name}</h2>
          {sellMode || item.forSale ? (
            <div className="product-popup-price-row sell-price-row">
              {retail ? (
                <span className="product-popup-retail-was" title="Retail / original">
                  {retail}
                </span>
              ) : null}
              <label className="product-popup-ask-wrap">
                <span className="product-popup-ask-prefix">$</span>
                <input
                  className="product-popup-ask-input"
                  type="text"
                  inputMode="decimal"
                  value={askDraft}
                  placeholder={item.retailPrice != null ? String(item.retailPrice) : "0"}
                  aria-label="Your sell price"
                  onChange={(event) => setAskDraft(event.target.value.replace(/[^0-9.]/g, ""))}
                  onBlur={() => {
                    if (!onAskingPriceChange) return;
                    const parsed = parseMoneyInput(askDraft);
                    const next = parsed == null ? "" : String(parsed);
                    setAskDraft(next);
                    if (String(item.askingPrice ?? "") !== next) {
                      onAskingPriceChange(item.id, next);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
              </label>
            </div>
          ) : retail ? (
            <p className="product-popup-price">{retail}</p>
          ) : null}
          <div className="product-popup-chips" aria-label="Item details">
            {sizeText ? <span>Size {sizeText}</span> : null}
            {materials ? <span>{materials}</span> : null}
            {tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="product-popup-actions">
            <a
              className="product-popup-link"
              href={productUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open product
            </a>
            <a
              className="product-popup-link secondary"
              href={pinterestUrl}
              target="_blank"
              rel="noreferrer"
            >
              Outfit ideas
            </a>
          </div>
        </div>

        <div className="product-popup-foot">
          <button
            type="button"
            className="product-popup-delete"
            onClick={() => onDelete(item.id)}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}


export function App() {
  const [items, setItems] = useState([]);
  /** Main nav: tops | bottoms | shoes | dresses | jackets | all */
  const [activeNav, setActiveNav] = useState("all");
  /** Sub: hoodies | tees | jeans | sweats | null (= whole section) */
  const [activeSub, setActiveSub] = useState(null);
  const [collection, setCollection] = useState("looks");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pinterestBoard, setPinterestBoard] = useState(() => {
    try {
      return localStorage.getItem(PINTEREST_BOARD_KEY) || "";
    } catch {
      return "";
    }
  });
  const [pinterestBoardInput, setPinterestBoardInput] = useState(() => {
    try {
      return localStorage.getItem(PINTEREST_BOARD_KEY) || "";
    } catch {
      return "";
    }
  });
  const [pinterestStatus, setPinterestStatus] = useState("");
  const [pinterestBusy, setPinterestBusy] = useState(false);
  const [density, setDensity] = useState(() => {
    try {
      const n = Number(localStorage.getItem(DENSITY_KEY));
      if (Number.isFinite(n)) return Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, Math.round(n)));
    } catch {
      /* ignore */
    }
    return 1;
  });

  const bumpDensity = (delta) => {
    setDensity((current) => {
      const next = Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, current + delta));
      try {
        localStorage.setItem(DENSITY_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/import/wardrobe", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the wardrobe.");
        return response.json();
      })
      .then((loadedItems) => {
        const edits = readEdits();
        const deleted = readDeletedItems();
        const visibleItems = loadedItems.filter((item) => !deleted.has(item.id));
        let libraryItems = visibleItems.map((item) => mergeLibraryEdit(item, edits[item.id]));
        try {
          if (!localStorage.getItem(RESALE_FIX_KEY)) {
            libraryItems = libraryItems.map((item) => {
              const shouldSell = isOriginalResalePiece(item);
              if (Boolean(item.forSale) === shouldSell) return item;
              const corrected = { ...item, forSale: shouldSell };
              persistEdit(corrected);
              fetch(`/api/wardrobe/items/${encodeURIComponent(item.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ forSale: shouldSell }),
              }).catch(() => {});
              return corrected;
            });
            localStorage.setItem(RESALE_FIX_KEY, "done");
          }
        } catch {
          /* the corrected library file still supplies the right default */
        }
        const queuedWants = readShopWants()
          .map(shopWantToItem)
          .filter((queued) => (
            !deleted.has(queued.id)
            && !libraryItems.some(
              (item) => item.id === queued.id
                || (queued.productRef && item.productRef === queued.productRef),
            )
          ));
        setItems([...libraryItems, ...queuedWants]);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const selectedItem = items.find((item) => item.id === selectedId) || null;

  const activeNavMeta = NAV_MAP[activeNav];
  const subOptions = activeNavMeta?.sub || null;

  const visibleItems = useMemo(() => {
    const collectionItems =
      collection === "resale"
        ? items.filter(isForSaleItem)
        : collection === "want"
          ? items.filter(isWantItem)
          : collection === "shop"
            ? items // shopper reads full closet (owned + want)
            : items.filter((item) => !isWantItem(item)); // Closet + Looks = owned only

    let filtered = collectionItems;
    if (activeNav !== "all") {
      filtered = filtered.filter((item) => itemSection(item) === activeNav);
      if (activeSub) {
        filtered = filtered.filter((item) => itemFamily(item) === activeSub);
      }
    }

    const sectionRank = (item) => {
      const sec = itemSection(item);
      const si = SECTION_ORDER.indexOf(sec);
      const families = FAMILY_ORDER[sec];
      const fi = families ? families.indexOf(itemFamily(item)) : 0;
      return (si < 0 ? 90 : si) * 10 + (fi < 0 ? 5 : fi);
    };

    return [...filtered].sort((a, b) => {
      const rankDiff = sectionRank(a) - sectionRank(b);
      if (rankDiff) return rankDiff;
      return (a.name || "").localeCompare(b.name || "") || a.id.localeCompare(b.id);
    });
  }, [activeNav, activeSub, collection, items]);

  /**
   * Gallery bands:
   * - All → Tops (Hoodies, Tees), Bottoms (Jeans, Sweats), Shoes, Dresses, Jackets
   * - Tops → Hoodies + Tees (or one if sub selected)
   * - Bottoms → Jeans + Sweats
   * - Shoes / Dresses / Jackets → single band
   */
  const gallerySections = useMemo(() => {
    const byFamily = (family) =>
      visibleItems.filter((item) => itemFamily(item) === family);

    const band = (id, label, list) =>
      list.length ? { id, label, items: list } : null;

    if (activeNav === "all") {
      const sections = [];
      for (const sec of SECTION_ORDER) {
        if (FAMILY_ORDER[sec]) {
          for (const fam of FAMILY_ORDER[sec]) {
            const itemsIn = byFamily(fam);
            const parent = NAV_MAP[sec]?.label || sec;
            const child = FAMILY_LABEL[fam] || fam;
            // e.g. "Tops · Hoodies"
            const s = band(`${sec}-${fam}`, `${parent} · ${child}`, itemsIn);
            if (s) sections.push(s);
          }
        } else {
          const s = band(sec, FAMILY_LABEL[sec] || NAV_MAP[sec]?.label || sec, byFamily(sec));
          if (s) sections.push(s);
        }
      }
      const other = byFamily("other");
      if (other.length) sections.push({ id: "other", label: "Other", items: other });
      return sections;
    }

    if (activeNav === "tops" || activeNav === "bottoms") {
      const families = activeSub
        ? [activeSub]
        : FAMILY_ORDER[activeNav] || [];
      return families
        .map((fam) => band(fam, FAMILY_LABEL[fam] || fam, byFamily(fam)))
        .filter(Boolean);
    }

    // shoes / dresses / jackets
    return visibleItems.length
      ? [{ id: activeNav, label: NAV_MAP[activeNav]?.label || "Pieces", items: visibleItems }]
      : [];
  }, [activeNav, activeSub, visibleItems]);

  const chooseNav = (navId) => {
    setActiveNav(navId);
    setActiveSub(null);
    setSelectedId(null);
  };

  const chooseSub = (subId) => {
    // Tap active sub again → show whole parent section
    setActiveSub((prev) => (prev === subId ? null : subId));
    setSelectedId(null);
  };

  const saveItem = async (updatedItem) => {
    setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item));
    persistEdit(updatedItem);
    try {
      const response = await fetch(`/api/wardrobe/items/${encodeURIComponent(updatedItem.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedItem),
      });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(saved.error || "Could not save this wardrobe item.");
      setItems((current) => current.map((item) => item.id === saved.id ? saved : item));
      persistEdit(saved);
    } catch (requestError) {
      setError(requestError.message || "Could not save this wardrobe item.");
    }
  };

  /** Sell tab: set your ask; retail stays as the grey X'd out list price */
  const updateAskingPrice = useCallback((id, askingPrice) => {
    setItems((current) => {
      const next = current.map((item) => {
        if (item.id !== id) return item;
        const updated = {
          ...item,
          askingPrice,
          // typing an ask puts it on the resale rack
          forSale: true,
        };
        persistEdit(updated);
        // best-effort server save (don't block UI)
        fetch(`/api/wardrobe/items/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            askingPrice: updated.askingPrice,
            forSale: true,
          }),
        }).catch(() => {});
        return updated;
      });
      return next;
    });
  }, []);

  const deleteItem = async (id) => {
    const piece = items.find((item) => item.id === id);
    const label = piece?.name?.trim() || "this piece";
    // Soft-hide only — never silent permanent wipe without an explicit yes
    if (!window.confirm(`Remove “${label}” from your wardrobe?\n\nYou can restore it from the deleted list later.`)) {
      return;
    }
    // Keep file on disk; only hide in the UI via deleted-id list (local soft delete).
    // Hard API delete only if they confirm a second time for imports.
    setItems((current) => current.filter((item) => item.id !== id));
    removePersistedEdit(id);
    persistDeletedItem(id);
    setSelectedId(null);
  };

  const restoreDeleted = () => {
    try {
      localStorage.removeItem(DELETED_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setLoading(true);
    setError("");
    fetch("/api/import/wardrobe", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not reload the wardrobe.");
        return response.json();
      })
      .then((loadedItems) => {
        const edits = readEdits();
        setItems(loadedItems.map((item) => mergeLibraryEdit(item, edits[item.id])));
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  };

  const reprocessItem = async (id) => {
    const response = await fetch(`/api/import/wardrobe/${id}/reprocess`, { method: "POST" });
    const updated = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(updated.error || "Could not create a smart cutout.");
    removePersistedEdit(id);
    setItems((current) => current.map((item) => item.id === id ? updated : item));
    return updated;
  };

  const addImportedItem = useCallback((newItem) => {
    setItems((current) => current.some((item) => item.id === newItem.id) ? current : [...current, newItem]);
    // Link imports land on wishlist — jump there so Melani sees the new piece
    if (newItem?.role === "wishlist" || (newItem?.tags || []).includes("want")) {
      setCollection("want");
      setSelectedId(newItem.id);
    }
  }, []);

  const attachImportedModeledImage = useCallback((jobId, modeledImage) => {
    const id = `import-${jobId}`;
    setItems((current) => current.map((item) => item.id === id ? { ...item, modeledImage } : item));
  }, []);

  const connectPinterestBoard = async () => {
    const url = pinterestBoardInput.trim();
    if (!/^https?:\/\/(?:www\.)?pinterest\.[^/]+\//i.test(url)) {
      setPinterestStatus("Paste a Pinterest profile, board, or pin URL.");
      return;
    }
    setPinterestBusy(true);
    setPinterestStatus("Connecting your board and reading the outfit pins…");
    try {
      const response = await fetch("/api/wardrobe/inspo/pinterest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Pinterest connection failed.");
      if (!payload.imported) throw new Error("No public outfit pins were found on that link.");
      localStorage.setItem(PINTEREST_BOARD_KEY, url);
      setPinterestBoard(url);
      setPinterestStatus(
        `Connected · ${payload.imported} pin${payload.imported === 1 ? "" : "s"} now influence Daily Looks.`,
      );
    } catch (requestError) {
      setPinterestStatus(requestError instanceof Error ? requestError.message : "Pinterest connection failed.");
    } finally {
      setPinterestBusy(false);
    }
  };

  const ownedCount = items.filter((item) => !isWantItem(item)).length;
  const wantCount = items.filter(isWantItem).length;
  const saleCount = items.filter(isForSaleItem).length;

  return (
    <div className={`app-shell${selectedItem ? " has-selection" : ""}`}>
      <main className="gallery-pane">
        <header className="gallery-header">
          {/* One clean toolbar row: collections · filters · density · counts */}
          <div className="gallery-toolbar">
            <nav className="collection-nav" aria-label="Wardrobe collections">
              {[
                ["looks", "Daily looks"],
                ["wardrobe", "My closet"],
                ["want", "Wishlist"],
                ["resale", "For sale"],
                ["shop", "Shop"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={collection === id ? "active" : ""}
                  onClick={() => {
                    setCollection(id);
                    setSelectedId(null);
                  }}
                >
                  {label}
                  {id === "resale" ? ` ${saleCount}` : ""}
                  {id === "want" ? ` ${wantCount}` : ""}
                </button>
              ))}
            </nav>
            {!["shop", "looks"].includes(collection) ? (
              <nav className="category-nav" aria-label="Filter wardrobe by section">
                {NAV.map((nav) => (
                  <button
                    key={nav.id}
                    type="button"
                    className={activeNav === nav.id ? "active" : ""}
                    onClick={() => chooseNav(nav.id)}
                    aria-pressed={activeNav === nav.id}
                  >
                    {nav.label}
                  </button>
                ))}
              </nav>
            ) : null}
            <div className="gallery-toolbar-end">
              <div className="gallery-density" role="group" aria-label="Zoom gallery density">
                <button
                  type="button"
                  className="gallery-density__btn"
                  onClick={() => bumpDensity(1)}
                  disabled={density >= DENSITY_MAX}
                  aria-label="Zoom in (fewer columns)"
                  title="Zoom in"
                >
                  −
                </button>
                <button
                  type="button"
                  className="gallery-density__btn"
                  onClick={() => bumpDensity(-1)}
                  disabled={density <= DENSITY_MIN}
                  aria-label="Zoom out (more columns)"
                  title="Zoom out"
                >
                  +
                </button>
              </div>
              <p className="wardrobe-kpis" aria-label="Wardrobe summary">
                <span><strong>{ownedCount}</strong> closet</span>
                <span><strong>{wantCount}</strong> wish</span>
                <span><strong>{saleCount}</strong> sale</span>
              </p>
            </div>
          </div>
          {!["shop", "looks"].includes(collection) && subOptions ? (
            <nav className="subcategory-nav" aria-label={`${activeNavMeta.label} types`}>
              <button
                type="button"
                className={!activeSub ? "active" : ""}
                onClick={() => {
                  setActiveSub(null);
                  setSelectedId(null);
                }}
                aria-pressed={!activeSub}
              >
                All {activeNavMeta.label}
              </button>
              {subOptions.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  className={activeSub === sub.id ? "active" : ""}
                  onClick={() => chooseSub(sub.id)}
                  aria-pressed={activeSub === sub.id}
                >
                  {sub.label}
                </button>
              ))}
            </nav>
          ) : null}
        </header>

        {collection === "shop" ? (
          <StyleShopper
            items={items}
            onSaveWant={(find) => {
              const row = {
                id: `shop-want-${find.id}`,
                name: find.name,
                brand: find.brand,
                lane: find.lane,
                url: find.url,
                price: find.price,
                currency: find.currency,
                tags: [...(find.tags || []), "want"],
                productRef: find.url,
                savedAt: new Date().toISOString(),
              };
              try {
                const previous = readShopWants();
                localStorage.setItem(
                  SHOP_WANTS_KEY,
                  JSON.stringify([row, ...previous.filter((item) => item.id !== row.id)].slice(0, 40))
                );
              } catch { /* ignore */ }
              const saved = shopWantToItem(row);
              setItems((current) => [
                ...current.filter((item) => item.id !== saved.id),
                saved,
              ]);
            }}
          />
        ) : collection === "looks" ? (
          !loading ? (
            <DailyGenerator
              items={items.filter((item) => !isWantItem(item))}
              onOpenItem={setSelectedId}
            />
          ) : (
            <p className="status">Loading your outfit engine</p>
          )
        ) : (
          <>
            {error && <p className="status error">{error}</p>}
            {!error && loading && <p className="status">Loading…</p>}
            {!error && !loading && !items.length && (
              <div className="status empty wardrobe-empty-block">
                <p>Add a photo.</p>
                {readDeletedItems().size > 0 ? (
                  <button type="button" className="restore-deleted-button" onClick={restoreDeleted}>
                    Restore removed pieces ({readDeletedItems().size})
                  </button>
                ) : null}
              </div>
            )}
            {!error && !loading && items.length > 0 && !visibleItems.length && (
              <p className="status empty">
                {collection === "resale"
                  ? "Nothing is marked for sale. Open a closet piece and move it to the resale rack."
                  : collection === "want"
                    ? "No wishlist pieces yet. Save exact product links from Shop assistant."
                    : "No pieces in this view."}
              </p>
            )}

            {!!items.length && gallerySections.map((section) => (
              <section
                key={section.id}
                className="gallery-section"
                aria-label={section.label}
              >
                <h2 className="gallery-section-title">
                  {section.label}
                  <span className="gallery-section-count">{section.items.length}</span>
                </h2>
                <div
                  className="gallery-grid"
                  style={{
                    "--gallery-min": `${DENSITY_MINMAX[density] || 128}px`,
                  }}
                >
                  {section.items.map((item) => {
                    const card = (
                      <GalleryItem
                        item={item}
                        selected={selectedId === item.id}
                        onOpen={setSelectedId}
                        hideWantBadge={collection === "want"}
                        sellMode={collection === "resale"}
                        onAskingPriceChange={updateAskingPrice}
                      />
                    );
                    if (collection !== "want") return <div key={item.id} className="gallery-card-shell">{card}</div>;
                    return (
                      <article key={item.id} className="wishlist-card-shell">
                        {card}
                        <div className="wishlist-card-actions">
                          <a href={productUrlForItem(item)} target="_blank" rel="noreferrer">Shop exact item ↗</a>
                          <a href={pinterestSearchForItem(item)} target="_blank" rel="noreferrer">Style on Pinterest ↗</a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </main>

      {selectedItem && (
        <ItemViewer
          item={selectedItem}
          onClose={() => setSelectedId(null)}
          onDelete={deleteItem}
          sellMode={collection === "resale" || Boolean(selectedItem.forSale)}
          onAskingPriceChange={updateAskingPrice}
        />
      )}
      <WardrobeImportFlow onGarmentApproved={addImportedItem} onModeledApproved={attachImportedModeledImage} />
    </div>
  );
}
