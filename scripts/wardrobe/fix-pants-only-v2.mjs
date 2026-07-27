import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const importedDir = path.resolve("data/imported");
const libraryFile = path.resolve("data/library.json");
const runId = Date.now();
const OUT_W = 1000;
const OUT_H = 1200;
const TARGET_H = 1040;

function isSkin(r, g, b) {
  if (r < 55 || g < 25 || b < 15) return false;
  if (r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 12 && r - b > 15) return true;
  if (r > 165 && g > 100 && b > 75 && r >= g && r - b > 28 && r - g < 70) return true;
  if (r > 125 && g > 80 && b > 55 && r > g && g >= b - 5 && r - b > 28 && r - g < 55) return true;
  return false;
}

function isBg(r, g, b, a) {
  if (a < 15) return true;
  const L = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (min > 242 && max - min < 14) || (L > 232 && max - min < 22);
}

async function process(raw, top, bot, side) {
  const m = await sharp(raw).metadata();
  const left = Math.round(m.width * side);
  const t = Math.round(m.height * top);
  const width = Math.round(m.width * (1 - 2 * side));
  const height = Math.round(m.height * (1 - top - bot));
  const { data, info } = await sharp(raw)
    .extract({ left, top: t, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const out = Buffer.from(data);
  const visited = new Uint8Array(w * h);
  const q = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    const i = idx * ch;
    if (!(isBg(out[i], out[i + 1], out[i + 2], out[i + 3]) || isSkin(out[i], out[i + 1], out[i + 2]))) return;
    visited[idx] = 1;
    out[i + 3] = 0;
    q.push(idx);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const idx = q[qi];
    const x = idx % w;
    const y = (idx / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  for (let i = 0; i < out.length; i += ch) {
    if (out[i + 3] < 15) continue;
    if (isSkin(out[i], out[i + 1], out[i + 2]) || isBg(out[i], out[i + 1], out[i + 2], out[i + 3])) {
      out[i + 3] = 0;
    }
  }
  for (let pass = 0; pass < 6; pass++) {
    const copy = Buffer.from(out);
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = (y * w + x) * ch;
        if (copy[i + 3] > 40) continue;
        let n = 0;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const j = ((y + dy) * w + (x + dx)) * ch;
            if (copy[j + 3] > 80) {
              n += 1;
              sr += copy[j];
              sg += copy[j + 1];
              sb += copy[j + 2];
            }
          }
        }
        if (n >= 14) {
          out[i] = Math.round(sr / n);
          out[i + 1] = Math.round(sg / n);
          out[i + 2] = Math.round(sb / n);
          out[i + 3] = 255;
        }
      }
    }
  }
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (out[i + 3] < 40) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      n += 1;
    }
  }
  if (!n) throw new Error("empty");
  const bh = maxY - minY + 1;
  maxY -= Math.round(bh * 0.03);
  const pad = 3;
  let product = await sharp(out, { raw: { width: w, height: h, channels: ch } })
    .extract({
      left: Math.max(0, minX - pad),
      top: Math.max(0, minY - pad),
      width: Math.min(w - Math.max(0, minX - pad), maxX - minX + 1 + pad * 2),
      height: Math.min(h - Math.max(0, minY - pad), Math.max(30, maxY - minY + 1 + pad * 2)),
    })
    .png()
    .toBuffer();

  const meta = await sharp(product).metadata();
  let tw = Math.round(meta.width * (TARGET_H / meta.height));
  let th = TARGET_H;
  if (tw > OUT_W - 40) {
    tw = OUT_W - 40;
    th = Math.round(meta.height * (tw / meta.width));
  }
  let fitted = await sharp(product)
    .resize(tw, th, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const fr = await sharp(fitted).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sil = Buffer.alloc(fr.info.width * fr.info.height * 4);
  for (let i = 0, p = 0; i < fr.data.length; i += fr.info.channels, p += 4) {
    sil[p] = 22;
    sil[p + 1] = 20;
    sil[p + 2] = 18;
    sil[p + 3] = fr.data[i + 3] > 40 ? 70 : 0;
  }
  const shadow = await sharp(sil, {
    raw: { width: fr.info.width, height: fr.info.height, channels: 4 },
  })
    .blur(12)
    .png()
    .toBuffer();
  const padS = 20;
  fitted = await sharp({
    create: {
      width: fr.info.width + padS * 2,
      height: fr.info.height + padS * 2 + 10,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadow, left: padS + 2, top: padS + 7 },
      { input: fitted, left: padS, top: padS },
    ])
    .png()
    .toBuffer();
  fitted = await sharp(fitted)
    .resize(OUT_W, OUT_H, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const fm = await sharp(fitted).metadata();
  return sharp({
    create: {
      width: OUT_W,
      height: OUT_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: fitted,
        left: Math.round((OUT_W - fm.width) / 2),
        top: Math.round((OUT_H - fm.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

const JOBS = [
  {
    id: "sheet-707885c83b0b",
    file: "/tmp/edikted-gallery/s15782_blue-washed_1.jpg",
    top: 0.02,
    bot: 0.14,
    side: 0.18,
  },
  {
    id: "sheet-51aff0bd5d31",
    file: "/tmp/edikted-gallery/s15782_indigo-blue-raw-washed_1.jpg",
    top: 0.02,
    bot: 0.14,
    side: 0.2,
  },
  {
    id: "sheet-78ca43589987",
    file: "/tmp/edikted-gallery/s15782_denim-black_1.jpg",
    top: 0.02,
    bot: 0.14,
    side: 0.2,
  },
  {
    id: "sheet-f9ba89f0d5dd",
    file: "/tmp/edikted-gallery/s25504_blue-washed_3.jpg",
    top: 0.02,
    bot: 0.12,
    side: 0.18,
  },
];

const lib = JSON.parse(await readFile(libraryFile, "utf8"));
const results = [];

for (const j of JOBS) {
  const raw = await readFile(j.file);
  const variants = [
    [j.top, j.bot, j.side],
    [0.04, 0.15, 0.2],
    [0.06, 0.16, 0.22],
  ];
  let best = null;
  for (const [top, bot, side] of variants) {
    try {
      const tile = await process(raw, top, bot, side);
      const { data, info } = await sharp(tile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let skin = 0;
      let opaque = 0;
      let topSkin = 0;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * info.channels;
          if (data[i + 3] < 40) continue;
          opaque += 1;
          if (isSkin(data[i], data[i + 1], data[i + 2])) {
            skin += 1;
            if (y < info.height * 0.2) topSkin += 1;
          }
        }
      }
      const score = opaque - skin * 400 - topSkin * 300;
      if (!best || score > best.score) best = { tile, score, skin, opaque, top, bot, side };
    } catch {
      /* try next */
    }
  }
  if (!best) {
    results.push({ id: j.id, err: "fail" });
    continue;
  }
  await writeFile(path.join(importedDir, `${j.id}-front-cut.png`), best.tile);
  await writeFile(path.join(importedDir, `${j.id}-garment.png`), best.tile);
  const img = `/api/import/library/${j.id}-front-cut.png?v=${runId}`;
  const idx = lib.findIndex((i) => i.id === j.id);
  lib[idx] = {
    ...lib[idx],
    image: img,
    thumbnail: img,
    frontImage: img,
    qualityNotes: `PANTS ONLY · no face/body/feet · skin=${best.skin}`,
    analysisVersion: (lib[idx].analysisVersion || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  await sharp(best.tile)
    .flatten({ background: "#f4f0e8" })
    .resize(300)
    .jpeg({ quality: 93 })
    .toFile(`/tmp/v2-${j.id.slice(-4)}.jpg`);
  results.push({ id: j.id, skin: best.skin, opaque: best.opaque, crop: [best.top, best.bot, best.side] });
}

// Uniqlo flats
const UQ = [
  {
    id: "sheet-d7a6dcaf9a84",
    url: "https://image.uniqlo.com/UQ/ST3/WesternCommon/imagesgoods/476108/sub/goods_476108_sub14.jpg",
  },
  {
    id: "sheet-b70db31162d3",
    url: "https://image.uniqlo.com/UQ/ST3/WesternCommon/imagesgoods/471809/item/goods_09_471809.jpg",
  },
];
for (const u of UQ) {
  const res = await fetch(u.url, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.uniqlo.com/" },
  });
  const raw = Buffer.from(await res.arrayBuffer());
  const tile = await process(raw, 0, 0, 0.02);
  await writeFile(path.join(importedDir, `${u.id}-front-cut.png`), tile);
  await writeFile(path.join(importedDir, `${u.id}-garment.png`), tile);
  const img = `/api/import/library/${u.id}-front-cut.png?v=${runId}`;
  const idx = lib.findIndex((i) => i.id === u.id);
  lib[idx] = {
    ...lib[idx],
    image: img,
    thumbnail: img,
    frontImage: img,
    seedImageUrl: u.url,
    qualityNotes: "PANTS ONLY Uniqlo product flat",
    analysisVersion: (lib[idx].analysisVersion || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  await sharp(tile)
    .flatten({ background: "#f4f0e8" })
    .resize(300)
    .jpeg({ quality: 93 })
    .toFile(`/tmp/v2-${u.id.slice(-4)}.jpg`);
  results.push({ id: u.id, uniqlo: true });
}

await writeFile(libraryFile, `${JSON.stringify(lib, null, 2)}\n`);

const comps = [];
let x = 10;
for (const j of [...JOBS, ...UQ]) {
  const f = `/tmp/v2-${j.id.slice(-4)}.jpg`;
  try {
    await sharp(f).metadata();
    comps.push({ input: f, left: x, top: 20 });
    x += 300;
  } catch {
    /* skip */
  }
}
await sharp({
  create: { width: Math.max(100, x), height: 380, channels: 3, background: "#f4f0e8" },
})
  .composite(comps)
  .jpeg({ quality: 93 })
  .toFile("/tmp/v2-all.jpg");

console.log(JSON.stringify({ runId, results }, null, 2));
