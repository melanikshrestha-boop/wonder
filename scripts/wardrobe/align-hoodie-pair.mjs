/**
 * Hood-tip ruler alignment for dual-face hoodies (Scuffers math).
 *
 * Imaginary horizontal lines at hood tip (minY) and hem (maxY) must match
 * on front-cut and back-cut. Hover only swaps opacity — never size.
 *
 * Usage:
 *   node scripts/wardrobe/align-hoodie-pair.mjs <itemId>
 *   node scripts/wardrobe/align-hoodie-pair.mjs --all-acne
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_W = 1000;
const OUT_H = 1200;
const TARGET_H = 780;
const MAX_W = 820;
const root = process.cwd();
const importedDir = path.join(root, "data/imported");
const libraryFile = path.join(root, "data/library.json");

async function floodStudio(srcBytes) {
  const { data, info } = await sharp(srcBytes).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const out = Buffer.from(data);
  const visited = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  const samples = [[4, 4], [w - 5, 4], [4, h - 5], [w - 5, h - 5], [w >> 1, 4]];
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const [x, y] of samples) {
    const i = (y * w + x) * ch;
    sr += out[i];
    sg += out[i + 1];
    sb += out[i + 2];
  }
  sr /= samples.length;
  sg /= samples.length;
  sb /= samples.length;
  function isBg(x, y) {
    const i = (y * w + x) * ch;
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    return Math.hypot(r - sr, g - sg, b - sb) < 48 && Math.min(r, g, b) > 188;
  }
  let head = 0;
  let tail = 0;
  function push(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx] || !isBg(x, y)) return;
    visited[idx] = 1;
    qx[tail] = x;
    qy[tail] = y;
    tail += 1;
  }
  for (let x = 0; x < w; x += 1) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y);
    push(w - 1, y);
  }
  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    head += 1;
    out[(y * w + x) * ch + 3] = 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  return sharp(out, { raw: { width: w, height: h, channels: ch } }).png().toBuffer();
}

async function opaqueBBox(pngBytes, alpha = 18) {
  const { data, info } = await sharp(pngBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  let n = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > alpha) {
        n += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return n ? { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1, n } : null;
}

/**
 * Place front + back with identical hood-tip top and hem height (Scuffers law).
 */
export async function alignHoodiePair(frontSrc, backSrc, { light = false } = {}) {
  let fCut = await floodStudio(frontSrc);
  let bCut = await floodStudio(backSrc);
  fCut = await sharp(fCut).trim({ threshold: 8 }).png().toBuffer();
  bCut = await sharp(bCut).trim({ threshold: 8 }).png().toBuffer();
  fCut = await sharp(await floodStudio(fCut)).trim({ threshold: 6 }).png().toBuffer();
  bCut = await sharp(await floodStudio(bCut)).trim({ threshold: 6 }).png().toBuffer();

  const fb = await opaqueBBox(fCut);
  const bb = await opaqueBBox(bCut);
  if (!fb || !bb) throw new Error("empty after cutout");

  const fCrop = await sharp(fCut)
    .extract({ left: fb.minX, top: fb.minY, width: fb.w, height: fb.h })
    .png()
    .toBuffer();
  const bCrop = await sharp(bCut)
    .extract({ left: bb.minX, top: bb.minY, width: bb.w, height: bb.h })
    .png()
    .toBuffer();

  let fw = Math.round(fb.w * (TARGET_H / fb.h));
  let fh = TARGET_H;
  let bw = Math.round(bb.w * (TARGET_H / bb.h));
  let bh = TARGET_H;
  const maxW = Math.max(fw, bw);
  if (maxW > MAX_W) {
    const s = MAX_W / maxW;
    fw = Math.round(fw * s);
    fh = Math.round(fh * s);
    bw = Math.round(bw * s);
    bh = Math.round(bh * s);
  }
  const H = Math.min(fh, bh);
  fw = Math.round(fw * (H / fh));
  bw = Math.round(bw * (H / bh));
  fh = H;
  bh = H;

  const fFitted = await sharp(fCrop).resize(fw, fh, { fit: "fill", kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  const bFitted = await sharp(bCrop).resize(bw, bh, { fit: "fill", kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  const top = Math.round((OUT_H - H) / 2);

  async function place(fitted, w) {
    return sharp({
      create: { width: OUT_W, height: OUT_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: fitted, left: Math.round((OUT_W - w) / 2), top }])
      .png()
      .toBuffer();
  }

  return {
    front: await place(fFitted, fw),
    back: await place(bFitted, bw),
    meta: { fw, bw, H, top, light },
  };
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: align-hoodie-pair.mjs <itemId> | --all-acne");
    process.exit(1);
  }
  const library = JSON.parse(await readFile(libraryFile, "utf8"));
  const targets =
    arg === "--all-acne"
      ? library.filter((i) => /Acne Studios Fleece Logo Hoodie/i.test(i.name || ""))
      : library.filter((i) => i.id === arg);
  if (!targets.length) throw new Error("no items");
  const v = Date.now();
  for (const item of targets) {
    if (/Dusty White/i.test(item.name || "")) {
      console.log("skip light", item.id, "— use hole-fill path in hoodie agent");
      continue;
    }
    const frontSrc = await readFile(path.join(importedDir, `${item.id}-front.png`));
    const backSrc = await readFile(path.join(importedDir, `${item.id}-back.png`));
    const { front, back, meta } = await alignHoodiePair(frontSrc, backSrc);
    await writeFile(path.join(importedDir, `${item.id}-front-cut.png`), front);
    await writeFile(path.join(importedDir, `${item.id}-back-cut.png`), back);
    await writeFile(path.join(importedDir, `${item.id}-garment.png`), front);
    const idx = library.findIndex((x) => x.id === item.id);
    library[idx] = {
      ...library[idx],
      image: `/api/import/library/${item.id}-front-cut.png?v=${v}`,
      frontImage: `/api/import/library/${item.id}-front-cut.png?v=${v}`,
      thumbnail: `/api/import/library/${item.id}-front-cut.png?v=${v}`,
      backImage: `/api/import/library/${item.id}-back-cut.png?v=${v}`,
      garmentImage: `/api/import/library/${item.id}-garment.png?v=${v}`,
      subjectCutout: true,
      hoodAligned: true,
      sizeMatched: true,
      updatedAt: new Date().toISOString(),
    };
    console.log("OK", item.name, meta);
  }
  await writeFile(libraryFile, `${JSON.stringify(library, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("align-hoodie-pair.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
