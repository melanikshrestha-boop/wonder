/**
 * Seed Wardrobe from Melani's Dream Purchases sheet (Own list + Uniqlo heroes).
 * Downloads product-style photos, cutouts via local clothes segmentation
 * (product only, no background), writes library.json + imported assets.
 *
 * Usage: node scripts/wardrobe/seed-dream-purchases.mjs
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { segmentFashionImage } from "./local-fashion-segmentation.mjs";
import { createVisualDescriptor } from "./wardrobe-intelligence.mjs";

const root = process.cwd();
const dataDir = path.resolve(root, process.env.WARDROBE_DATA_DIR || "data");
const importedDir = path.join(dataDir, "imported");
const libraryFile = path.join(dataDir, "library.json");
const cacheDir = path.join(dataDir, "seed-cache");

/** Sheet Own items (+ Uniqlo sweatpants heroes from wardrobe plan). */
const PRODUCTS = [
  // Shoes
  { name: "Nike Air Force 1 White", part: "shoes", tags: ["nike", "af1", "sneakers", "own"], color: "#f5f5f2", queries: ["Nike Air Force 1 white product shot white background", "Nike AF1 low white studio"] },
  { name: "Adidas Samba OG", part: "shoes", tags: ["adidas", "samba", "sneakers", "own"], color: "#f5f5f2", queries: ["Adidas Samba OG white black product white background", "Samba OG B75806 product"] },
  { name: "Nike Blazer White", part: "shoes", tags: ["nike", "blazer", "sneakers", "own"], color: "#f5f5f2", queries: ["Nike Blazer Mid white product white background", "Nike Blazer white studio product"] },
  { name: "Timberland Boot Brown", part: "shoes", tags: ["timberland", "boots", "own"], color: "#76523d", queries: ["Timberland 6 inch yellow boot product white background", "Timberland classic wheat boot product"] },
  { name: "Nike Dunk Low Retro Black", part: "shoes", tags: ["nike", "dunk", "sneakers", "own"], color: "#111111", queries: ["Nike Dunk Low black white product white background", "Nike Dunk Low panda product"] },
  { name: "Dr. Martens Boots", part: "shoes", tags: ["drmartens", "boots", "own"], color: "#111111", queries: ["Dr Martens 1460 black smooth product white background", "Doc Martens black boots product"] },
  { name: "Adidas Spezial Blue", part: "shoes", tags: ["adidas", "spezial", "sneakers", "own"], color: "#3d6f9e", queries: ["Adidas Handball Spezial blue product white background", "Adidas Spezial navy product"] },
  // Hoodies
  { name: "Cold Culture Blue Hoodie", part: "upperbody", tags: ["hoodie", "coldculture", "blue", "own"], color: "#3d6f9e", queries: ["blue oversized hoodie product white background", "blue heavyweight hoodie flat lay white"] },
  { name: "Scuffers Blue Hoodie", part: "upperbody", tags: ["hoodie", "scuffers", "blue", "own"], color: "#24344f", queries: ["navy blue hoodie product white background", "dark blue streetwear hoodie product"] },
  { name: "Antisocial Hoodie", part: "upperbody", tags: ["hoodie", "antisocial", "own"], color: "#111111", queries: ["black antisocial social club hoodie product white background", "black graphic hoodie product white"] },
  { name: "Scuffers Burgundy With Love Hoodie", part: "upperbody", tags: ["hoodie", "scuffers", "burgundy", "own"], color: "#6b2d3c", queries: ["burgundy hoodie product white background", "maroon oversized hoodie product"] },
  { name: "Essentials Hoodie", part: "upperbody", tags: ["hoodie", "essentials", "fog", "own"], color: "#c5b79a", queries: ["Fear of God Essentials hoodie taupe product white background", "Essentials FOG hoodie beige product"] },
  { name: "Stussy Hoodie", part: "upperbody", tags: ["hoodie", "stussy", "own"], color: "#111111", queries: ["Stussy basic hoodie black product white background", "Stussy logo hoodie product"] },
  // Jeans
  { name: "Edikted Black Jeans", part: "lowerbody", tags: ["jeans", "edikted", "black", "own"], color: "#111111", queries: ["black denim jeans product white background", "black skinny jeans product studio"] },
  { name: "Edikted Dark Blue Jeans", part: "lowerbody", tags: ["jeans", "edikted", "blue", "own"], color: "#1e3a5f", queries: ["dark wash blue jeans product white background", "indigo denim jeans product studio"] },
  { name: "Edikted White Jeans", part: "lowerbody", tags: ["jeans", "edikted", "white", "own"], color: "#f5f5f2", queries: ["white denim jeans product white background", "white jeans product studio"] },
  { name: "Edikted Blue Jeans", part: "lowerbody", tags: ["jeans", "edikted", "blue", "own"], color: "#3d6f9e", queries: ["medium blue jeans product white background", "blue denim jeans product studio"] },
  // Jacket
  { name: "North Face Black Puffer 550", part: "wholebody_up", tags: ["jacket", "northface", "puffer", "own"], color: "#111111", queries: ["The North Face 1996 Retro Nuptse black product white background", "North Face black puffer jacket product"] },
  // Heroes
  { name: "Uniqlo Gray Sweatpants", part: "lowerbody", tags: ["uniqlo", "sweatpants", "gray", "hero", "own"], color: "#777777", productRef: "E479620", queries: ["Uniqlo sweatpants gray product white background", "Uniqlo soft sweatpants grey product"] },
  { name: "Uniqlo Black Sweatpants", part: "lowerbody", tags: ["uniqlo", "sweatpants", "black", "hero", "own"], color: "#111111", productRef: "E479620", queries: ["Uniqlo sweatpants black product white background", "Uniqlo black sweat pants product"] },
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadLibrary() {
  if (!(await exists(libraryFile))) return [];
  try {
    const raw = JSON.parse(await readFile(libraryFile, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** Best-effort image discovery via DuckDuckGo image JSON (no key). */
async function searchImageUrls(query, limit = 6) {
  const urls = [];
  try {
    // DDG image search via lite HTML is brittle; use Wikidata-free commons search + DDG i.js
    const q = encodeURIComponent(query);
    const res = await fetch(`https://duckduckgo.com/?q=${q}&iax=images&ia=images`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    const html = await res.text();
    const vqd = html.match(/vqd=["']([^"']+)["']/)?.[1];
    if (vqd) {
      const api = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${q}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`;
      const imgRes = await fetch(api, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://duckduckgo.com/",
          Accept: "application/json",
        },
      });
      if (imgRes.ok) {
        const data = await imgRes.json();
        const results = Array.isArray(data.results) ? data.results : [];
        for (const r of results) {
          const u = r.image || r.thumbnail;
          if (u && /^https?:\/\//i.test(u) && !/svg$/i.test(u)) urls.push(u);
          if (urls.length >= limit) break;
        }
      }
    }
  } catch (e) {
    console.warn("  search failed:", e.message);
  }

  // Wikimedia fallback
  if (urls.length < 2) {
    try {
      const wikiQ = encodeURIComponent(query.split(" ").slice(0, 4).join(" "));
      const wiki = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${wikiQ}&gsrlimit=5&prop=imageinfo&iiprop=url&format=json&origin=*`,
      );
      if (wiki.ok) {
        const data = await wiki.json();
        const pages = data.query?.pages || {};
        for (const p of Object.values(pages)) {
          const u = p.imageinfo?.[0]?.url;
          if (u) urls.push(u);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [...new Set(urls)].slice(0, limit);
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error("too small");
  // normalize to png rgb
  return sharp(buf).rotate().ensureAlpha().png().toBuffer();
}

/** Remove near-white / near-gray studio background when segmentation misses. */
async function punchWhiteBackground(pngBytes) {
  const { data, info } = await sharp(pngBytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += info.channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // bright low-sat = studio bg
    if (min > 210 && max - min < 28) out[i + 3] = 0;
    else if (min > 235) out[i + 3] = 0;
  }
  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

async function cutoutProduct(pngBytes, product) {
  try {
    const segmented = await segmentFashionImage(pngBytes, {
      root,
      modelRoot: path.join(dataDir, "models"),
      name: product.name,
    });
    if (segmented.items?.length) {
      // Prefer matching part, else largest garment
      const preferred =
        segmented.items.find((item) => item.metadata?.part === product.part) ||
        segmented.items[0];
      if (preferred?.garmentBytes?.length > 2000) {
        return {
          bytes: preferred.garmentBytes,
          metadata: preferred.metadata || {},
          method: "segformer",
        };
      }
    }
  } catch (e) {
    console.warn("  segformer:", e.message);
  }
  // Fallback: punch white studio bg
  const punched = await punchWhiteBackground(pngBytes);
  // trim transparent
  const trimmed = await sharp(punched).trim({ threshold: 8 }).png().toBuffer();
  return {
    bytes: trimmed,
    metadata: {
      name: product.name,
      part: product.part,
      color: product.color,
      tags: product.tags,
    },
    method: "white-punch",
  };
}

function scoreImage(bytes, product) {
  // Prefer taller product-ish aspect for apparel, square-ish for shoes
  return sharp(bytes)
    .metadata()
    .then((m) => {
      const w = m.width || 1;
      const h = m.height || 1;
      const ratio = h / w;
      let score = Math.min(w, h); // larger better
      if (product.part === "shoes" && ratio > 0.6 && ratio < 1.4) score *= 1.3;
      if (product.part !== "shoes" && ratio > 1.0) score *= 1.2;
      if (w < 200 || h < 200) score *= 0.2;
      return score;
    });
}

async function processProduct(product, existing) {
  if (existing.some((r) => r.name?.toLowerCase() === product.name.toLowerCase())) {
    console.log(`SKIP (exists): ${product.name}`);
    return null;
  }

  console.log(`\n→ ${product.name}`);
  let best = null;
  let bestScore = 0;

  for (const query of product.queries) {
    console.log(`  search: ${query}`);
    const urls = await searchImageUrls(query, 8);
    console.log(`  candidates: ${urls.length}`);
    for (const url of urls.slice(0, 5)) {
      try {
        const raw = await downloadImage(url);
        const cut = await cutoutProduct(raw, product);
        const sc = await scoreImage(cut.bytes, product);
        console.log(`    ok ${cut.method} score=${Math.round(sc)} ${url.slice(0, 60)}…`);
        if (sc > bestScore) {
          bestScore = sc;
          best = { ...cut, sourceUrl: url, sourceBytes: raw };
        }
      } catch (e) {
        console.log(`    fail: ${e.message}`);
      }
    }
    if (bestScore > 400) break; // good enough
  }

  if (!best) {
    console.warn(`  NO IMAGE for ${product.name}`);
    return null;
  }

  const id = `sheet-${createHash("sha1").update(product.name).digest("hex").slice(0, 12)}`;
  const garmentName = `${id}-garment.png`;
  const sourceName = `${id}-source.png`;
  // ensure reasonable size
  const garmentBytes = await sharp(best.bytes)
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  await writeFile(path.join(importedDir, garmentName), garmentBytes);
  await writeFile(path.join(importedDir, sourceName), best.sourceBytes);

  const meta = {
    name: product.name,
    part: product.part,
    color: product.color || best.metadata?.color || "#888888",
    secondaryColor: best.metadata?.secondaryColor || null,
    palette: best.metadata?.palette || [product.color].filter(Boolean),
    tags: [...new Set([...(product.tags || []), ...(best.metadata?.tags || [])])],
  };
  const intelligence = await createVisualDescriptor(garmentBytes, meta);
  const now = new Date().toISOString();
  const record = {
    id,
    ...meta,
    brand: product.tags?.[0] || null,
    productRef: product.productRef || null,
    role: "daily",
    fit: product.part === "upperbody" ? "baggy" : "unknown",
    intelligence,
    image: `/api/import/library/${garmentName}`,
    thumbnail: `/api/import/library/${garmentName}`,
    sourceImage: `/api/import/library/${sourceName}`,
    subjectCutout: true,
    analysisVersion: 2,
    schemaVersion: 4,
    createdAt: now,
    updatedAt: now,
    seedSource: "dream-purchases-sheet",
    seedMethod: best.method,
    seedImageUrl: best.sourceUrl,
  };
  console.log(`  SAVED ${id} via ${best.method}`);
  return record;
}

async function main() {
  await mkdir(importedDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  let library = await loadLibrary();
  const added = [];
  for (const product of PRODUCTS) {
    try {
      const rec = await processProduct(product, library);
      if (rec) {
        library = [...library.filter((r) => r.id !== rec.id), rec];
        added.push(rec.name);
        await writeFile(libraryFile, `${JSON.stringify(library, null, 2)}\n`);
      }
    } catch (e) {
      console.error(`FAIL ${product.name}:`, e);
    }
  }
  console.log(`\nDone. Added ${added.length}/${PRODUCTS.length}`);
  console.log(added.join("\n") || "(none)");
  console.log(`library: ${libraryFile} (${library.length} items)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
