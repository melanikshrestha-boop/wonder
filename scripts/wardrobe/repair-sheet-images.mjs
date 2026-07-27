/**
 * Repair sheet-seeded wardrobe tiles:
 * - Stop using hole-punched SegFormer cutouts as gallery image
 * - Use clean product photos (source) with gentle studio cleanup
 * - Try to fetch a BACK view for 360 math viewer
 *
 * node scripts/wardrobe/repair-sheet-images.mjs
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const dataDir = path.resolve(root, process.env.WARDROBE_DATA_DIR || "data");
const importedDir = path.join(dataDir, "imported");
const libraryFile = path.join(dataDir, "library.json");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function searchImageUrls(query, limit = 6) {
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
      if (u && /^https?:\/\//i.test(u)) urls.push(u);
      if (urls.length >= limit) break;
    }
  } catch {
    /* ignore */
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
  if (buf.length < 3000) throw new Error("small");
  return sharp(buf).rotate().ensureAlpha().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

/**
 * Soft cleanup: only kill pure studio white corners — NEVER eat the product.
 * No SegFormer (that caused the holes).
 */
async function cleanStudioPhoto(pngBytes) {
  const img = sharp(pngBytes).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  const w = info.width;
  const h = info.height;
  // Only clear pixels that are very bright AND near image border band
  const border = Math.max(8, Math.round(Math.min(w, h) * 0.04));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * info.channels;
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const nearEdge = x < border || y < border || x >= w - border || y >= h - border;
      const pureWhite = min > 248 && max - min < 10;
      const softWhite = nearEdge && min > 235 && max - min < 18;
      if (pureWhite || softWhite) out[i + 3] = 0;
    }
  }
  // Composite onto warm gallery cream so holes never look like missing fabric
  const cleaned = await sharp(out, {
    raw: { width: w, height: h, channels: info.channels },
  })
    .png()
    .toBuffer();

  // Prefer solid cream background product card (readable tiles)
  const cream = { r: 245, g: 242, b: 235, alpha: 1 };
  return sharp(cleaned)
    .flatten({ background: cream })
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(importedDir, { recursive: true });
  const library = JSON.parse(await readFile(libraryFile, "utf8"));
  const next = [];

  for (const item of library) {
    console.log(`\n→ ${item.name}`);
    const id = item.id;
    let frontBytes = null;

    // Prefer original source download over hole-punched garment
    if (item.sourceImage) {
      const srcName = path.basename(new URL(item.sourceImage, "http://localhost").pathname);
      const srcPath = path.join(importedDir, srcName);
      if (await exists(srcPath)) {
        frontBytes = await sharp(await readFile(srcPath))
          .rotate()
          .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        console.log("  using source photo");
      }
    }

    if (!frontBytes && item.seedImageUrl) {
      try {
        frontBytes = await downloadImage(item.seedImageUrl);
        console.log("  re-downloaded seed URL");
      } catch (e) {
        console.log("  seed URL fail", e.message);
      }
    }

    if (!frontBytes) {
      // last resort: search again for clean product
      const urls = await searchImageUrls(`${item.name} product photo white background`, 5);
      for (const url of urls) {
        try {
          frontBytes = await downloadImage(url);
          console.log("  fresh search ok");
          break;
        } catch {
          /* next */
        }
      }
    }

    if (!frontBytes) {
      console.log("  KEEP old (no source)");
      next.push(item);
      continue;
    }

    const cleanFront = await cleanStudioPhoto(frontBytes);
    const frontName = `${id}-front.png`;
    await writeFile(path.join(importedDir, frontName), cleanFront);

    // Back view for 360 math
    let backBytes = null;
    const backQueries = [
      `${item.name} back view product`,
      `${item.name} rear product white background`,
    ];
    for (const q of backQueries) {
      const urls = await searchImageUrls(q, 5);
      for (const url of urls) {
        try {
          const raw = await downloadImage(url);
          backBytes = await cleanStudioPhoto(raw);
          console.log("  back view ok");
          break;
        } catch {
          /* next */
        }
      }
      if (backBytes) break;
    }

    // If no real back, synthesize mirror flip as provisional back (tagged)
    let backSynthetic = false;
    if (!backBytes) {
      backBytes = await sharp(cleanFront).flop().png().toBuffer();
      backSynthetic = true;
      console.log("  back = mirrored front (synthetic until real back)");
    }
    const backName = `${id}-back.png`;
    await writeFile(path.join(importedDir, backName), backBytes);

    const v = Date.now();
    next.push({
      ...item,
      image: `/api/import/library/${frontName}?v=${v}`,
      thumbnail: `/api/import/library/${frontName}?v=${v}`,
      frontImage: `/api/import/library/${frontName}?v=${v}`,
      backImage: `/api/import/library/${backName}?v=${v}`,
      backSynthetic,
      subjectCutout: false,
      displayMode: "product",
      updatedAt: new Date().toISOString(),
      repairVersion: 2,
    });
    console.log("  repaired");
  }

  await writeFile(libraryFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\nRepaired ${next.length} items → clean product tiles + front/back for 360`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
