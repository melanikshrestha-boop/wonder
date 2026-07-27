/**
 * Fix wrong / garbage wardrobe tiles:
 * - No models / random guys in frame
 * - Bottoms = garment only (pants/sweatpants cutout)
 * - Clean product photography style (front flat, no watermark dumps)
 * - Front + back for 360 drag
 *
 * node scripts/wardrobe/fix-product-tiles.mjs
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { segmentFashionImage } from "./local-fashion-segmentation.mjs";

const root = process.cwd();
const dataDir = path.resolve(root, process.env.WARDROBE_DATA_DIR || "data");
const importedDir = path.join(dataDir, "imported");
const libraryFile = path.join(dataDir, "library.json");

/** Targeted replacements with strict search queries */
const FIXES = [
  {
    match: /uniqlo black sweat/i,
    name: "Uniqlo Black Sweatpants",
    part: "lowerbody",
    tags: ["uniqlo", "sweatpants", "black", "hero", "own", "wide-leg", "high-rise"],
    color: "#111111",
    frontQueries: [
      "Uniqlo sweatpants black flat lay product only white background no model",
      "Uniqlo soft fleece sweat pants black product photo isolated",
      "black wide leg sweatpants product shot white background no person",
    ],
    backQueries: [
      "black sweatpants back view product white background no model",
      "black fleece sweatpants rear product isolated",
    ],
    requireLowerOnly: true,
    silhouette: "wide-open-hem",
  },
  {
    match: /uniqlo gray sweat|uniqlo grey sweat/i,
    name: "Uniqlo Gray Sweatpants",
    part: "lowerbody",
    tags: ["uniqlo", "sweatpants", "gray", "hero", "own", "wide-leg", "high-rise", "open-hem"],
    color: "#9a9a9a",
    frontQueries: [
      "Uniqlo sweatpants gray wide leg high rise open hem product white background no model",
      "grey wide leg sweatpants product photo flat no cuffs white background",
      "Uniqlo gray sweat pants product only isolated no person",
    ],
    backQueries: [
      "gray wide leg sweatpants back product white background no model",
      "grey sweatpants rear view product isolated",
    ],
    requireLowerOnly: true,
    silhouette: "wide-open-hem",
  },
  {
    match: /edikted blue jeans$/i,
    name: "Edikted Blue Jeans",
    part: "lowerbody",
    tags: ["jeans", "edikted", "blue", "own"],
    color: "#4a6fa5",
    frontQueries: [
      "medium wash blue jeans front product white background no model no watermark",
      "blue denim jeans product photography isolated studio front view",
      "classic blue jeans hanging product shot white background",
    ],
    backQueries: [
      "blue jeans back pockets product white background no model",
      "denim jeans rear product isolated white",
    ],
    requireLowerOnly: true,
    rejectFolded: true,
  },
  {
    match: /edikted dark blue/i,
    name: "Edikted Dark Blue Jeans",
    part: "lowerbody",
    tags: ["jeans", "edikted", "dark-blue", "own"],
    color: "#1e3a5f",
    frontQueries: [
      "dark wash blue jeans front product white background no model",
      "indigo denim jeans product studio isolated front",
      "dark blue jeans product photography white seamless",
    ],
    backQueries: [
      "dark blue jeans back product white background no model",
      "indigo jeans rear view product isolated",
    ],
    requireLowerOnly: true,
  },
  {
    match: /edikted black jeans/i,
    name: "Edikted Black Jeans",
    part: "lowerbody",
    tags: ["jeans", "edikted", "black", "own"],
    color: "#111111",
    frontQueries: [
      "black jeans front product white background no model",
      "black denim jeans product studio isolated",
    ],
    backQueries: ["black jeans back product white background no model"],
    requireLowerOnly: true,
  },
  {
    match: /edikted white jeans/i,
    name: "Edikted White Jeans",
    part: "lowerbody",
    tags: ["jeans", "edikted", "white", "own"],
    color: "#f5f5f2",
    frontQueries: [
      "white jeans front product white background no model",
      "white denim jeans product studio isolated front",
    ],
    backQueries: ["white jeans back product white background no model"],
    requireLowerOnly: true,
  },
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function searchImageUrls(query, limit = 10) {
  const urls = [];
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(`https://duckduckgo.com/?q=${q}&iax=images&ia=images`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const html = await res.text();
    const vqd = html.match(/vqd=["']([^"']+)["']/)?.[1];
    if (!vqd) return urls;
    const api = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${q}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`;
    const imgRes = await fetch(api, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://duckduckgo.com/",
      },
    });
    if (!imgRes.ok) return urls;
    const data = await imgRes.json();
    for (const r of data.results || []) {
      const u = r.image || r.thumbnail;
      const title = String(r.title || "");
      // hard reject stock watermark / model spam hosts in URL or title
      if (/vecteezy|shutterstock|dreamstime|getty|alamy|watermark/i.test(u + title)) continue;
      if (/model|height|size:m|wearing/i.test(title) && /person|model|man|woman/i.test(title)) continue;
      if (u && /^https?:\/\//i.test(u)) urls.push(u);
      if (urls.length >= limit) break;
    }
  } catch (e) {
    console.warn("  search err", e.message);
  }
  return [...new Set(urls)];
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "image/*",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4000) throw new Error("small");
  return sharp(buf).rotate().ensureAlpha().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

/** Detect if image is likely a full person / model shot (reject). */
async function looksLikeModelShot(pngBytes) {
  try {
    const segmented = await segmentFashionImage(pngBytes, {
      root,
      modelRoot: path.join(dataDir, "models"),
      name: "check",
    });
    const labels = (segmented.labels || []).map(String);
    const hasFace = labels.some((l) => /face|hair|skin|person|neck/i.test(l));
    const hasUpper = segmented.items?.some((i) => i.metadata?.part === "upperbody" || i.metadata?.part === "wholebody_up");
    const hasLower = segmented.items?.some((i) => i.metadata?.part === "lowerbody" || i.metadata?.part === "shoes");
    // Model catalog: face/skin OR both upper+lower on one body
    if (hasFace) return { model: true, reason: "face/skin", segmented };
    if (hasUpper && hasLower && segmented.items.length >= 2) {
      return { model: true, reason: "full outfit on body", segmented };
    }
    return { model: false, segmented };
  } catch (e) {
    return { model: false, segmented: null, err: e.message };
  }
}

/**
 * Extract ONLY lowerbody (pants/sweatpants) as transparent PNG cutout.
 * Falls back to cream product card if mask weak.
 */
async function extractLowerOnly(pngBytes, segmented) {
  let item = null;
  if (segmented?.items?.length) {
    item =
      segmented.items.find((i) => i.metadata?.part === "lowerbody") ||
      segmented.items.find((i) => /pants|skirt|jeans/i.test(JSON.stringify(i.metadata || {}))) ||
      null;
  }
  if (item?.garmentBytes?.length > 3000) {
    // garmentBytes often already transparent cutout — good
    const meta = await sharp(item.garmentBytes).metadata();
    // reject tiny scraps
    if ((meta.width || 0) > 80 && (meta.height || 0) > 120) {
      // put on cream so gallery tiles match clean product cards
      return sharp(item.garmentBytes)
        .ensureAlpha()
        .flatten({ background: { r: 245, g: 242, b: 235, alpha: 1 } })
        .png()
        .toBuffer();
    }
  }
  // Soft white punch only (no eating product center)
  return softCreamCard(pngBytes);
}

async function softCreamCard(pngBytes) {
  const { data, info } = await sharp(pngBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += info.channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    if (min > 245 && max - min < 12) out[i + 3] = 0;
  }
  const cut = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
  return sharp(cut)
    .flatten({ background: { r: 245, g: 242, b: 235, alpha: 1 } })
    .png()
    .toBuffer();
}

async function scoreCandidate(pngBytes, fix) {
  const check = await looksLikeModelShot(pngBytes);
  if (check.model) return { score: -1, reason: check.reason, check };
  const meta = await sharp(pngBytes).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  let score = Math.min(w, h);
  // Prefer portrait product (full length bottoms)
  if (fix.requireLowerOnly && h / w > 1.15) score *= 1.4;
  if (fix.rejectFolded && h / w < 0.9) score *= 0.5; // folded flat often wider
  // Prefer high pixel count
  score *= Math.log10(w * h + 10);
  return { score, reason: "ok", check };
}

async function pickBest(queries, fix) {
  let best = null;
  let bestScore = 0;
  for (const q of queries) {
    console.log(`  q: ${q}`);
    const urls = await searchImageUrls(q, 10);
    console.log(`  urls: ${urls.length}`);
    for (const url of urls.slice(0, 7)) {
      try {
        const raw = await downloadImage(url);
        const scored = await scoreCandidate(raw, fix);
        console.log(`    ${scored.score < 0 ? "REJECT" : "ok"} ${scored.reason} score=${scored.score.toFixed?.(0) ?? scored.score} ${url.slice(0, 55)}`);
        if (scored.score > bestScore) {
          let outBytes;
          if (fix.requireLowerOnly && scored.check?.segmented) {
            outBytes = await extractLowerOnly(raw, scored.check.segmented);
          } else if (fix.requireLowerOnly) {
            const again = await looksLikeModelShot(raw);
            outBytes = await extractLowerOnly(raw, again.segmented);
          } else {
            outBytes = await softCreamCard(raw);
          }
          bestScore = scored.score;
          best = { bytes: outBytes, url, raw };
        }
      } catch (e) {
        console.log(`    fail ${e.message}`);
      }
    }
    if (bestScore > 5000) break;
  }
  return best;
}

async function main() {
  await mkdir(importedDir, { recursive: true });
  const library = JSON.parse(await readFile(libraryFile, "utf8"));
  let changed = 0;

  for (const fix of FIXES) {
    const idx = library.findIndex((item) => fix.match.test(item.name || ""));
    if (idx < 0) {
      console.log(`MISS item for ${fix.name}`);
      continue;
    }
    const item = library[idx];
    console.log(`\n→ FIX ${item.name} (${item.id})`);

    const front = await pickBest(fix.frontQueries, fix);
    if (!front) {
      console.log("  no front candidate");
      continue;
    }
    const back = (await pickBest(fix.backQueries, fix)) || {
      bytes: await sharp(front.bytes).flop().png().toBuffer(),
      synthetic: true,
    };

    const v = Date.now();
    const frontName = `${item.id}-front.png`;
    const backName = `${item.id}-back.png`;
    await writeFile(path.join(importedDir, frontName), front.bytes);
    await writeFile(path.join(importedDir, backName), back.bytes);

    library[idx] = {
      ...item,
      name: fix.name,
      part: fix.part,
      tags: fix.tags,
      color: fix.color,
      image: `/api/import/library/${frontName}?v=${v}`,
      thumbnail: `/api/import/library/${frontName}?v=${v}`,
      frontImage: `/api/import/library/${frontName}?v=${v}`,
      backImage: `/api/import/library/${backName}?v=${v}`,
      backSynthetic: Boolean(back.synthetic),
      subjectCutout: false,
      displayMode: "product",
      qualityNotes:
        fix.silhouette === "wide-open-hem"
          ? "High-rise, wide open hem (not cuffed)"
          : item.qualityNotes || null,
      updatedAt: new Date().toISOString(),
      repairVersion: 3,
      seedImageUrl: front.url,
    };
    changed += 1;
    console.log("  SAVED clean product front/back");
  }

  await writeFile(libraryFile, `${JSON.stringify(library, null, 2)}\n`);
  console.log(`\nFixed ${changed} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
