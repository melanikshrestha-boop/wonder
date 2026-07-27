/**
 * Style inspo engine — drop images or connect Pinterest boards/pins.
 * Palettes feed /api/wardrobe/recommend so daily looks lean into her inspo.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const INSPO_DIR = "inspo";
const INSPO_FILE = "inspo-library.json";

function defaultLibrary() {
  return {
    version: 1,
    boards: [],
    items: [],
    updatedAt: null,
  };
}

async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

function hexFromRgb(r, g, b) {
  const to = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Fashion-aware palette: center-weighted sampling so faces/backgrounds
 * don't drown out garment colors (denim, hoodie greys, blacks).
 */
export async function extractPalette(imageBuffer, { maxColors = 6 } = {}) {
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .resize(80, 100, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const buckets = new Map();

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * info.channels;
      const a = info.channels === 4 ? data[i + 3] : 255;
      if (a < 40) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = (r + g + b) / 3;
      // skip pure plate whites / crushed blacks
      if (lum > 248 || lum < 8) continue;
      // center weight (garment usually mid-frame on Pinterest fits)
      const dx = (x - cx) / (w * 0.55);
      const dy = (y - cy) / (h * 0.55);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const weight = dist < 1 ? 1.35 - dist * 0.55 : 0.35;
      // slight boost for mid-luminance clothing tones
      const midBoost = lum > 35 && lum < 210 ? 1.15 : 0.85;
      const qr = Math.round(r / 20) * 20;
      const qg = Math.round(g / 20) * 20;
      const qb = Math.round(b / 20) * 20;
      const key = `${qr},${qg},${qb}`;
      const cur = buckets.get(key) || { r: qr, g: qg, b: qb, n: 0 };
      cur.n += weight * midBoost;
      buckets.set(key, cur);
    }
  }

  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n);
  if (!ranked.length) {
    return {
      colors: [{ hex: "#777777", weight: 1, h: 0, s: 0, l: 0.47 }],
      neutrals: 1,
      statement: 0,
      fashion: { denim: 0, black: 0, grey: 0, earth: 0 },
    };
  }

  // Merge near-duplicates
  const merged = [];
  for (const c of ranked) {
    const near = merged.find((m) => Math.abs(m.r - c.r) + Math.abs(m.g - c.g) + Math.abs(m.b - c.b) < 48);
    if (near) near.n += c.n;
    else merged.push({ ...c });
  }
  merged.sort((a, b) => b.n - a.n);

  const top = merged.slice(0, maxColors);
  const total = top.reduce((s, c) => s + c.n, 0) || 1;
  const colors = top.map((c) => {
    const hsl = rgbToHsl(c.r, c.g, c.b);
    return {
      hex: hexFromRgb(c.r, c.g, c.b),
      weight: Number((c.n / total).toFixed(3)),
      h: Math.round(hsl.h),
      s: Number(Math.max(0, Math.min(1, hsl.s)).toFixed(3)),
      l: Number(Math.max(0, Math.min(1, hsl.l)).toFixed(3)),
    };
  });

  const neutrals = colors.filter((c) => c.s < 0.18 || c.l < 0.12 || c.l > 0.88).length / colors.length;
  const statement = colors.filter((c) => c.s >= 0.35 && c.l > 0.18 && c.l < 0.82).length / colors.length;
  // Fashion signal tags for scoring
  const fashion = {
    denim: Number(colors.filter((c) => c.h > 195 && c.h < 250 && c.s > 0.12 && c.s < 0.55 && c.l > 0.15 && c.l < 0.55).reduce((s, c) => s + c.weight, 0).toFixed(3)),
    black: Number(colors.filter((c) => c.l < 0.18).reduce((s, c) => s + c.weight, 0).toFixed(3)),
    grey: Number(colors.filter((c) => c.s < 0.12 && c.l >= 0.25 && c.l <= 0.75).reduce((s, c) => s + c.weight, 0).toFixed(3)),
    earth: Number(colors.filter((c) => c.h > 15 && c.h < 55 && c.s > 0.15 && c.l < 0.55).reduce((s, c) => s + c.weight, 0).toFixed(3)),
  };

  return {
    colors,
    neutrals: Number(neutrals.toFixed(3)),
    statement: Number(statement.toFixed(3)),
    fashion,
  };
}

export function createInspoEngine(options = {}) {
  const root = options.root || process.cwd();
  const dataDir = path.resolve(root, options.dataDir || process.env.WARDROBE_DATA_DIR || "data");
  const inspoDir = path.join(dataDir, INSPO_DIR);
  const libraryFile = path.join(dataDir, INSPO_FILE);

  async function ensure() {
    await mkdir(inspoDir, { recursive: true });
  }

  async function loadLibrary() {
    await ensure();
    try {
      const value = JSON.parse(await readFile(libraryFile, "utf8"));
      return {
        ...defaultLibrary(),
        ...value,
        boards: Array.isArray(value.boards) ? value.boards : [],
        items: Array.isArray(value.items) ? value.items : [],
      };
    } catch (error) {
      if (error.code === "ENOENT") return defaultLibrary();
      throw error;
    }
  }

  async function saveLibrary(library) {
    await ensure();
    library.updatedAt = new Date().toISOString();
    await atomicJson(libraryFile, library);
    return library;
  }

  function publicItem(item) {
    return {
      id: item.id,
      title: item.title || "Inspo",
      source: item.source || "upload",
      sourceUrl: item.sourceUrl || null,
      boardId: item.boardId || null,
      active: item.active !== false,
      palette: item.palette || null,
      createdAt: item.createdAt,
      imageUrl: `/api/wardrobe/inspo/${item.id}/image`,
    };
  }

  async function listInspo() {
    const library = await loadLibrary();
    return {
      items: library.items.map(publicItem),
      boards: library.boards,
      activeCount: library.items.filter((i) => i.active !== false).length,
    };
  }

  async function addImage({ buffer, title, source = "upload", sourceUrl = null, boardId = null, mime = "image/jpeg" }) {
    if (!buffer?.length) throw Object.assign(new Error("Missing image bytes"), { status: 400 });
    if (buffer.length > 12 * 1024 * 1024) throw Object.assign(new Error("Inspo image too large (max 12MB)"), { status: 413 });

    await ensure();
    const id = `inspo-${randomUUID().slice(0, 12)}`;
    // Normalize to webp for compact local store
    const processed = await sharp(buffer).rotate().resize(900, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const filename = `${id}.webp`;
    const filePath = path.join(inspoDir, filename);
    await writeFile(filePath, processed);

    const palette = await extractPalette(processed);
    const library = await loadLibrary();
    const item = {
      id,
      title: String(title || "Inspo").slice(0, 120),
      source,
      sourceUrl: sourceUrl ? String(sourceUrl).slice(0, 500) : null,
      boardId: boardId || null,
      active: true,
      filename,
      mime: "image/webp",
      palette,
      createdAt: new Date().toISOString(),
      byteSize: processed.length,
      hash: createHash("sha1").update(processed).digest("hex").slice(0, 16),
    };

    // Dedup by hash
    const dup = library.items.find((row) => row.hash === item.hash);
    if (dup) {
      await unlink(filePath).catch(() => undefined);
      return { item: publicItem(dup), duplicate: true };
    }

    library.items = [item, ...library.items].slice(0, 80);
    await saveLibrary(library);
    return { item: publicItem(item), duplicate: false };
  }

  async function setActive(id, active) {
    const library = await loadLibrary();
    const item = library.items.find((row) => row.id === id);
    if (!item) throw Object.assign(new Error("Inspo not found"), { status: 404 });
    item.active = Boolean(active);
    await saveLibrary(library);
    return publicItem(item);
  }

  async function removeInspo(id) {
    const library = await loadLibrary();
    const idx = library.items.findIndex((row) => row.id === id);
    if (idx < 0) throw Object.assign(new Error("Inspo not found"), { status: 404 });
    const [removed] = library.items.splice(idx, 1);
    if (removed.filename) {
      await unlink(path.join(inspoDir, removed.filename)).catch(() => undefined);
    }
    await saveLibrary(library);
    return { ok: true, id };
  }

  async function readImage(id) {
    const library = await loadLibrary();
    const item = library.items.find((row) => row.id === id);
    if (!item?.filename) throw Object.assign(new Error("Inspo image not found"), { status: 404 });
    const filePath = path.join(inspoDir, item.filename);
    const bytes = await readFile(filePath);
    return { bytes, mime: item.mime || "image/webp", item };
  }

  async function activePalettes() {
    const library = await loadLibrary();
    return library.items
      .filter((row) => row.active !== false && row.palette?.colors?.length)
      .map((row) => ({
        id: row.id,
        title: row.title,
        source: row.source,
        palette: row.palette,
      }));
  }

  /**
   * Score a look (item profiles with color hex) against active inspo palettes.
   * Returns 0–100 + short reason fragments.
   */
  function scoreAgainstInspo(lookItems, palettes) {
    if (!palettes?.length) return { score: 72, reasons: [], matched: [] };
    const itemColors = lookItems
      .map((item) => {
        const hex = item.color || item.colorProfile?.hex;
        // prefer hsl from profile (hue may be 0-360 as .hue)
        const cp = item.colorProfile || {};
        if (typeof cp.hue === "number" || typeof cp.h === "number") {
          return {
            hex: hex || "#777777",
            h: Number(cp.h ?? cp.hue) || 0,
            s: Number(cp.s ?? cp.saturation) || 0,
            l: Number(cp.l ?? cp.lightness) || 0.5,
            name: item.name,
            kind: item.kind,
            isJeans: Boolean(item.traits?.isJeans),
            isHoodie: Boolean(item.traits?.isHoodie),
            isSweats: Boolean(item.traits?.isSweats),
          };
        }
        if (!hex) return null;
        const m = String(hex).replace("#", "");
        if (m.length !== 6) return null;
        const r = parseInt(m.slice(0, 2), 16);
        const g = parseInt(m.slice(2, 4), 16);
        const b = parseInt(m.slice(4, 6), 16);
        const hsl = rgbToHsl(r, g, b);
        return {
          hex,
          h: hsl.h,
          s: hsl.s,
          l: hsl.l,
          name: item.name,
          kind: item.kind,
          isJeans: Boolean(item.traits?.isJeans),
          isHoodie: Boolean(item.traits?.isHoodie),
          isSweats: Boolean(item.traits?.isSweats),
        };
      })
      .filter(Boolean);

    if (!itemColors.length) return { score: 60, reasons: [], matched: [] };

    // Aggregate fashion signals across all active inspo
    let denimSignal = 0;
    let blackSignal = 0;
    let greySignal = 0;
    let n = 0;
    for (const inspo of palettes) {
      const f = inspo.palette?.fashion;
      if (!f) continue;
      denimSignal += Number(f.denim || 0);
      blackSignal += Number(f.black || 0);
      greySignal += Number(f.grey || 0);
      n += 1;
    }
    if (n) {
      denimSignal /= n;
      blackSignal /= n;
      greySignal /= n;
    }

    let best = 0;
    const matched = [];
    for (const inspo of palettes) {
      const colors = inspo.palette?.colors || [];
      if (!colors.length) continue;
      let pairSum = 0;
      let pairs = 0;
      for (const piece of itemColors) {
        // Top/bottom weigh more than shoes for outfit vibe
        const kindW = piece.kind === "shoes" ? 0.65 : piece.kind === "jacket" ? 0.75 : 1;
        let pieceBest = 0;
        for (const c of colors) {
          const hd = hueDist(piece.h, c.h);
          const sd = Math.abs(piece.s - c.s);
          const ld = Math.abs(piece.l - c.l);
          const pieceNeutral = piece.s < 0.18 || piece.l < 0.12 || piece.l > 0.88;
          const inspoNeutral = c.s < 0.18 || c.l < 0.12 || c.l > 0.88;
          let local = 0;
          if (pieceNeutral && inspoNeutral) local = 94 - ld * 35;
          else if (hd <= 22) local = 96 - hd * 0.5 - sd * 18 - ld * 12;
          else if (hd <= 40) local = 82 - hd * 0.4 - sd * 15;
          else if (hd >= 140 && hd <= 220) local = 72 - sd * 12;
          else local = 38 - Math.min(28, hd * 0.1);
          pieceBest = Math.max(pieceBest, local * (0.5 + 0.5 * (c.weight || 0.2)));
        }
        // Fashion-structure bonuses from inspo board signals
        if (piece.isJeans && denimSignal > 0.08) pieceBest = Math.min(100, pieceBest + 12);
        if ((piece.isHoodie || piece.isSweats) && (greySignal > 0.12 || blackSignal > 0.15)) {
          pieceBest = Math.min(100, pieceBest + 8);
        }
        if (piece.l < 0.2 && blackSignal > 0.18) pieceBest = Math.min(100, pieceBest + 6);
        pairSum += pieceBest * kindW;
        pairs += kindW;
      }
      const score = pairs ? pairSum / pairs : 0;
      if (score > best) {
        best = score;
        matched.length = 0;
        matched.push(inspo.title || inspo.id);
      } else if (score > best - 5) {
        matched.push(inspo.title || inspo.id);
      }
    }

    const score = Math.round(Math.max(0, Math.min(100, best)));
    const reasons = [];
    // Principle language — not "inspo score 32"
    if (score >= 84) {
      reasons.push(
        `Same color language as your saved inspo${matched[0] ? ` (${matched[0]})` : ""} — neutrals, contrast, and garment tones track the board.`,
      );
    } else if (score >= 72) {
      reasons.push("Palette sits next to your inspo without copying it — wearable, not forced.");
    } else if (score >= 58) {
      reasons.push("Loose inspo overlap — closet combo is fine, but not the board’s hero vibe.");
    } else if (palettes.length) {
      reasons.push("Inspo is active, but this stack drifts from the colors you keep saving.");
    }
    if (denimSignal > 0.1 && itemColors.some((p) => p.isJeans)) {
      reasons.push("Board leans denim — baggy jeans lock that pattern in.");
    }

    return { score, reasons, matched: [...new Set(matched)].slice(0, 3) };
  }

  return {
    listInspo,
    addImage,
    setActive,
    removeInspo,
    readImage,
    activePalettes,
    scoreAgainstInspo,
    loadLibrary,
    saveLibrary,
    inspoDir,
  };
}

/** Decode data URL or raw base64 into a Buffer */
export function decodeImagePayload(input = {}) {
  if (input.buffer && Buffer.isBuffer(input.buffer)) return { buffer: input.buffer, mime: input.mime || "image/jpeg" };
  const raw = String(input.dataUrl || input.image || input.base64 || "");
  const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) return { buffer: Buffer.from(match[2], "base64"), mime: match[1] };
  if (raw && /^[A-Za-z0-9+/=\s]+$/.test(raw.slice(0, 80))) {
    return { buffer: Buffer.from(raw.replace(/\s/g, ""), "base64"), mime: input.mime || "image/jpeg" };
  }
  return null;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 WonderInspo/1.0";

/** Known Pinterest chrome / brand placeholders — never save as inspo */
const BRANDING_HASH_FRAGMENTS = [
  "d53b014d86a6b6761bf649a0ed813c2b", // pink gradient board placeholder
];

function upgradePinimgUrl(url) {
  return String(url || "")
    .replace(/\/\d+x\//, "/736x/")
    .replace(/\/236x\//, "/736x/")
    .replace(/\/474x\//, "/736x/");
}

function isBrandingUrl(url) {
  const u = String(url || "");
  return BRANDING_HASH_FRAGMENTS.some((h) => u.includes(h));
}

async function downloadImage(url) {
  if (isBrandingUrl(url)) return null;
  const finalUrl = upgradePinimgUrl(url);
  const response = await fetch(finalUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      Referer: "https://www.pinterest.com/",
    },
    redirect: "follow",
  });
  if (!response.ok) return null;
  const mime = response.headers.get("content-type") || "image/jpeg";
  if (!mime.startsWith("image/")) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  // Real outfit pins are usually larger; reject chrome/icons
  if (buffer.length < 14_000) return null;
  try {
    const { data, info } = await sharp(buffer).resize(24, 24, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let neon = 0;
    let flat = 0;
    let n = 0;
    const samples = [];
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = info.channels === 4 ? data[i + 3] : 255;
      if (a < 40) continue;
      n += 1;
      samples.push([r, g, b]);
      if (r > 200 && b > 140 && g < 100) neon += 1;
    }
    if (n > 0 && neon / n > 0.45) return null;
    // Reject near-solid flat colors (UI tiles)
    if (samples.length > 10) {
      const mean = samples.reduce((acc, s) => [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]], [0, 0, 0]).map((v) => v / samples.length);
      const varSum = samples.reduce((acc, s) => acc + (s[0] - mean[0]) ** 2 + (s[1] - mean[1]) ** 2 + (s[2] - mean[2]) ** 2, 0) / samples.length;
      if (varSum < 180) flat = 1;
    }
    if (flat) return null;
  } catch {
    return null;
  }
  return { buffer, mime, url: finalUrl };
}

/**
 * Real pin scrape: oEmbed thumbnail (works without login) + upgrade to 736x.
 */
async function fetchPinViaOEmbed(pinUrl, pinId) {
  const oembedUrl = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(pinUrl)}`;
  const res = await fetch(oembedUrl, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.thumbnail_url) return null;
  const img = await downloadImage(data.thumbnail_url);
  if (!img) return null;
  return {
    title: String(data.title || `Pin ${pinId}`).replace(/\s*[|\-·].*Pinterest.*$/i, "").trim() || `Pin ${pinId}`,
    images: [{ ...img, title: data.title || `Pin ${pinId}` }],
  };
}

/**
 * Board / pin page scrape via headless Chromium.
 * Waits for pin grid, scrolls for lazy load, upgrades to 736x, quality-filters downloads.
 */
async function scrapePinterestImages(pageUrl, { maxImages = 18, requirePathIncludes = null } = {}) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw Object.assign(
      new Error("Pinterest board import needs Playwright. Run: npm i -D playwright && npx playwright install chromium"),
      { status: 500 },
    );
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1400, height: 2000 },
      locale: "en-US",
    });
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(2500);

    // Pinterest often redirects logged-out scrapers to /ideas/ — refuse that junk feed
    const landed = page.url();
    if (requirePathIncludes) {
      const ok = landed.includes(requirePathIncludes) || landed.includes(encodeURI(requirePathIncludes));
      if (!ok || /\/ideas\/?/i.test(landed) || /explore the best of pinterest/i.test(await page.title())) {
        return {
          title: "",
          images: [],
          pinLinkCount: 0,
          blocked: true,
          landedUrl: landed,
        };
      }
    }

    // Wait until pin images appear (not just branding)
    try {
      await page.waitForFunction(
        () => {
          const imgs = [...document.querySelectorAll("img")].filter((img) =>
            (img.currentSrc || img.src || "").includes("pinimg.com") && (img.naturalWidth || 0) > 80);
          return imgs.length >= 3;
        },
        { timeout: 20_000 },
      );
    } catch {
      // continue — may still have some images
    }
    await page.waitForTimeout(1500);

    // Scroll grid to hydrate more pins
    for (let i = 0; i < 8; i += 1) {
      await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.9)));
      await page.waitForTimeout(750);
    }
    await page.waitForTimeout(1200);

    const scraped = await page.evaluate(() => {
      const candidates = [];
      for (const img of document.querySelectorAll("img")) {
        const src = img.currentSrc || img.src || "";
        const srcset = img.srcset || "";
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        const collect = (u, scoreBoost = 0) => {
          if (!u || !u.includes("pinimg.com")) return;
          candidates.push({
            url: u,
            w,
            h,
            area: w * h,
            scoreBoost,
          });
        };
        collect(src, 0);
        for (const part of srcset.split(",")) {
          const bits = part.trim().split(/\s+/);
          const u = bits[0];
          const desc = bits[1] || "";
          const sw = desc.endsWith("w") ? Number(desc.slice(0, -1)) : 0;
          collect(u, sw >= 400 ? 2 : 0);
        }
      }
      // pin anchors often hold data
      for (const a of document.querySelectorAll('a[href*="/pin/"]')) {
        const img = a.querySelector("img");
        if (img) {
          const src = img.currentSrc || img.src || "";
          if (src.includes("pinimg.com")) {
            candidates.push({
              url: src,
              w: img.naturalWidth || 0,
              h: img.naturalHeight || 0,
              area: (img.naturalWidth || 0) * (img.naturalHeight || 0),
              scoreBoost: 3,
            });
          }
        }
      }
      const h1 = document.querySelector("h1")?.textContent?.trim() || "";
      return {
        title: h1 || document.title || "",
        candidates,
        pinLinkCount: document.querySelectorAll('a[href*="/pin/"]').length,
      };
    });

    await context.close().catch(() => undefined);

    // Dedupe by content hash in URL path; prefer larger
    const byId = new Map();
    for (const row of scraped.candidates) {
      if (isBrandingUrl(row.url)) continue;
      const upgraded = upgradePinimgUrl(row.url);
      const idMatch = upgraded.match(/\/([a-f0-9]{16,})\.(?:jpg|jpeg|png|webp)/i)
        || upgraded.match(/\/([a-f0-9]{10,})\//i);
      const key = idMatch?.[1] || upgraded;
      const sizeScore = /originals\//.test(upgraded) ? 40 : /736x\//.test(upgraded) ? 30 : /474x\//.test(upgraded) ? 15 : 5;
      const score = sizeScore + (row.scoreBoost || 0) + Math.min(20, (row.area || 0) / 50_000);
      const prev = byId.get(key);
      if (!prev || score > prev.score) byId.set(key, { url: upgraded, score });
    }

    const ordered = [...byId.values()]
      .sort((a, b) => b.score - a.score)
      .map((row) => row.url)
      .slice(0, Math.max(maxImages * 2, 24));

    const images = [];
    const boardTitle = String(scraped.title || "")
      .replace(/\s*[|\-·].*Pinterest.*$/i, "")
      .replace(/^Explore the best of Pinterest$/i, "")
      .trim() || "Pinterest board";

    for (const imageUrl of ordered) {
      const img = await downloadImage(imageUrl);
      if (!img) continue;
      // Extra quality gate: skip ultra-wide banner slivers
      try {
        const meta = await sharp(img.buffer).metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;
        if (w < 180 || h < 180) continue;
        if (w > 0 && h > 0 && (w / h > 2.4 || h / w > 3.2)) continue; // banners / odd crops
        if ((meta.size || img.buffer.length) < 14_000) continue;
      } catch {
        continue;
      }
      images.push({ ...img, title: boardTitle });
      if (images.length >= maxImages) break;
    }

    return {
      title: boardTitle,
      images,
      pinLinkCount: scraped.pinLinkCount || 0,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/**
 * Fetch Pinterest inspo that actually works:
 * - One or many /pin/… links → oEmbed (reliable, no login)
 * - Board links → Chromium, but Pinterest often redirects logged-out scrapers to /ideas/
 *   We detect that redirect and fail honestly (no Halloween junk as "success").
 * - Multi-URL paste: split on whitespace/newlines and import each pin
 */
export async function fetchPinterestInspo(urlString) {
  const raw = String(urlString || "").trim();
  if (!raw) throw Object.assign(new Error("Paste a Pinterest pin URL (or several), or drop screenshots."), { status: 400 });

  // Multi-pin paste: extract every pin URL / pin.it link
  const urlCandidates = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => /pinterest\.|pin\.it/i.test(s));

  const pinUrls = [];
  for (const candidate of urlCandidates.length ? urlCandidates : [raw]) {
    let parsed;
    try {
      parsed = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`);
    } catch {
      continue;
    }
    const host = parsed.hostname.replace(/^www\./, "");
    if (!/(^|\.)pinterest\./.test(host) && host !== "pin.it") continue;

    let finalUrl = parsed.toString();
    if (host === "pin.it") {
      try {
        const head = await fetch(finalUrl, { redirect: "follow", headers: { "User-Agent": UA } });
        finalUrl = head.url || finalUrl;
      } catch {
        /* keep short url */
      }
    }
    // Normalize slug pins → numeric when possible later via oEmbed
    if (/\/pin\//i.test(finalUrl) || host === "pin.it") {
      pinUrls.push(finalUrl);
    }
  }

  // —— Multiple / single pins: oEmbed path (the one that actually works) ——
  if (pinUrls.length >= 1 && !looksLikeBoardOnly(raw, pinUrls)) {
    const images = [];
    const titles = [];
    for (const pinUrl of pinUrls.slice(0, 24)) {
      const pinMatch = pinUrl.match(/\/pin\/(\d+)/);
      const pinId = pinMatch?.[1] || "pin";
      const oembed = await fetchPinViaOEmbed(pinUrl, pinId);
      if (oembed?.images?.length) {
        images.push(...oembed.images.map((img) => ({ ...img, title: oembed.title })));
        titles.push(oembed.title);
        continue;
      }
      // Chromium only if we stay on /pin/ (not redirected)
      try {
        const scraped = await scrapePinterestImages(pinUrl, { maxImages: 2, requirePathIncludes: "/pin/" });
        for (const img of scraped.images) images.push(img);
        if (scraped.title) titles.push(scraped.title);
      } catch {
        /* try next pin */
      }
    }
    if (!images.length) {
      throw Object.assign(
        new Error("Could not pull those pin photos. Use open pin links (pinterest.com/pin/…), or drop screenshots."),
        { status: 502 },
      );
    }
    return {
      kind: pinUrls.length > 1 ? "pins" : "pin",
      title: titles[0] || "Pinterest pins",
      sourceUrl: pinUrls[0],
      boardId: null,
      images,
    };
  }

  // —— Board path ——
  let boardUrl = urlCandidates[0] || raw;
  try {
    const u = new URL(boardUrl.startsWith("http") ? boardUrl : `https://${boardUrl}`);
    boardUrl = u.toString();
  } catch {
    throw Object.assign(new Error("That Pinterest link is not a valid URL"), { status: 400 });
  }

  const boardMatch = boardUrl.match(/pinterest\.[^/]+\/([^/?#]+)\/([^/?#]+)/i);
  if (boardMatch) {
    const user = boardMatch[1];
    const board = boardMatch[2];
    if (["pin", "ideas", "search", "today", "settings"].includes(user.toLowerCase())) {
      throw Object.assign(new Error("That is not a board URL. Paste pin links (…/pin/123…) or a /you/board-name/ link."), {
        status: 400,
      });
    }

    // Chromium board scrape — detect login wall / ideas redirect
    const scraped = await scrapePinterestImages(boardUrl, {
      maxImages: 18,
      requirePathIncludes: `/${user}/${board}`,
    });

    if (!scraped.images.length) {
      throw Object.assign(
        new Error(
          "Pinterest blocked board access (redirects scrapers to Explore). Fix that works: open pins you like → paste several pin links here, or drop fit screenshots. Board URL alone often cannot be read without login.",
        ),
        { status: 502 },
      );
    }
    return {
      kind: "board",
      title: scraped.title && !/explore the best/i.test(scraped.title) ? scraped.title : `${user}/${board}`,
      sourceUrl: boardUrl,
      boardId: `pinterest:${user}/${board}`,
      images: scraped.images,
    };
  }

  throw Object.assign(
    new Error("Paste pin URLs like https://www.pinterest.com/pin/123456/ (you can paste many), or drop screenshots."),
    { status: 400 },
  );
}

function looksLikeBoardOnly(raw, pinUrls) {
  // If user pasted a board URL and no pin URLs were extracted, treat as board
  if (/\/pin\//i.test(raw)) return false;
  if (pinUrls.some((u) => /\/pin\//i.test(u))) return false;
  return /pinterest\.[^/]+\/[^/]+\/[^/]+/i.test(raw);
}
