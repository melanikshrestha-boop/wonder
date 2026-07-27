/**
 * Seed multi-angle Zappos/Nike product frames for wardrobe shoes.
 * Writes Left→Front→Right→Back spinFrames (true 360) like HOKA Bondi 9.
 *
 * node scripts/wardrobe/seed-shoe-spin-frames.mjs
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const dataDir = path.resolve(root, process.env.WARDROBE_DATA_DIR || "data");
const importedDir = path.join(dataDir, "imported");
const libraryFile = path.join(dataDir, "library.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Spin orbit order: degrees match Garment360 sampleFrames */
const SPIN_ORDER = [
  { key: "Left", deg: 0 },
  { key: "Front", deg: 90 },
  { key: "Right", deg: 180 },
  { key: "Back", deg: 270 },
];

/**
 * Known multi-view product sources.
 * Zappos: labeled Left/Front/Right/Back views.
 * Nike: first 4 gallery product shots (lateral → angled → heel-ish order varies; we map in order).
 */
const SHOES = [
  {
    id: "sheet-bceeba0f5238",
    name: "New Balance 530 White Navy",
    source: "zappos",
    productPath:
      "/p/new-balance-classics-530-nb-103-white-silver-metallic/product/9975364/color/1119297",
    brand: "New Balance",
    tags: ["newbalance", "530", "running", "sneakers", "own"],
    color: "#f5f5f2",
  },
  {
    id: "sheet-358cc3b0e12f",
    name: "Timberland Boot Brown",
    source: "zappos",
    productPath: "/p/timberland-6-premium-boot-medium-red-nubuck/product/9068382/color/78518",
    brand: "Timberland",
    tags: ["timberland", "boots", "own"],
    color: "#8b5a2b",
  },
  {
    id: "sheet-deae1822a81e",
    name: "Dr. Martens Boots",
    source: "zappos",
    // Bex Smooth has full Left/Front/Right/Back studio set (classic 1460 page often only Pair)
    productPath:
      "/p/dr-martens-1460-bex-smooth-leather-lace-up-boots-black-smooth/product/9959580/color/103",
    brand: "Dr. Martens",
    tags: ["drmartens", "boots", "own"],
    color: "#1a1a1a",
  },
  {
    id: "sheet-fe50cf3321a9",
    name: "HOKA Bondi 9 Vanilla Birch",
    source: "zappos",
    productPath: "/p/hoka-bondi-9-vanilla-birch/product/9984296/color/1112488",
    brand: "HOKA",
    tags: ["hoka", "bondi-9", "running", "sneakers", "own", "vanilla-birch"],
    color: "#f5f0e6",
    // already seeded; re-run is idempotent refresh
  },
  {
    id: "sheet-651437e4ded5",
    name: "Nike Air Force 1 White",
    source: "nike",
    productUrl: "https://www.nike.com/t/air-force-1-07-mens-shoes-jBrhbr/CW2288-111",
    brand: "Nike",
    tags: ["nike", "air-force-1", "sneakers", "want"],
    color: "#f5f5f5",
  },
  {
    id: "sheet-fe5f023bb8be",
    name: "Nike Blazer White Black Swoosh",
    source: "nike",
    productUrl: "https://www.nike.com/t/blazer-mid-77-vintage-mens-shoes-nw30B2/BQ6806-100",
    brand: "Nike",
    tags: ["nike", "blazer", "sneakers", "own"],
    color: "#f5f5f5",
  },
  {
    id: "sheet-5a1e01037422",
    name: "Nike Dunk Low Retro Black",
    source: "nike",
    productUrl: "https://www.nike.com/t/dunk-low-retro-mens-shoes-P4DaDIKC/DD1391-100",
    brand: "Nike",
    tags: ["nike", "dunk", "sneakers", "own"],
    color: "#1a1a1a",
  },
  {
    id: "sheet-7962a968e834",
    name: "Adidas Samba OG",
    source: "zappos",
    // Adult multi-angle set not always on Zappos; kids Samba still has full Left/Front/Right/Back product studio set.
    // Prefer adult if page has 4+ views; script falls back gracefully.
    productPath:
      "/p/adidas-kids-samba-indoor-toddler-little-kid-big-kid-white-none-none/product/9960598/color/1081892",
    brand: "Adidas",
    tags: ["adidas", "samba", "sneakers", "own"],
    color: "#f5f5f5",
  },
  {
    id: "sheet-aa3c17e6c31d",
    name: "Adidas Spezial Blue",
    source: "zappos",
    productPath:
      "/p/adidas-handball-spezial-messi-shoes-black-silver-metallic-pure-ruby/product/10046544/color/1129805",
    brand: "Adidas",
    tags: ["adidas", "spezial", "sneakers", "own"],
    color: "#1e3a5f",
    // Note: Messi collab colorway — if wrong, still multi-angle product cards; user can reseed later.
    skipIfNoLeft: false,
  },
  {
    id: "sheet-1d146887daba",
    name: "Nike Air Jordan Dark Blue Black Swoosh",
    source: "footlocker",
    // AJ1 Mid black/royal multi-angle set (Footlocker Scene7)
    footlockerCode: "54724140",
    brand: "Nike",
    tags: ["nike", "jordan", "sneakers", "own"],
    color: "#1e3a5f",
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

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/json" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "image/*", Referer: "https://www.zappos.com/" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 3000) throw new Error("small image");
  return sharp(buf)
    .rotate()
    .ensureAlpha()
    .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

/** Cream product card — soft white studio → cream, no hole cutouts */
async function toProductCard(pngBytes) {
  const { data, info } = await sharp(pngBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += info.channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    if (min > 248 && max - min < 10) out[i + 3] = 0;
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

function extractZapposViews(html) {
  const views = {};
  const patterns = [
    /alt="([^"]*?View)"[^>]*?src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/g,
    /src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"[^>]*?alt="([^"]*?View)"/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html))) {
      let alt, src;
      if (m[1].startsWith("http")) {
        src = m[1];
        alt = m[2];
      } else {
        alt = m[1];
        src = m[2];
      }
      const key = alt.replace(/\s*View\s*/i, "").trim();
      if (!key || !src) continue;
      const id = src.match(/\/I\/([^./]+)/)?.[1];
      if (!id) continue;
      views[key] = `https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`;
    }
  }
  return views;
}

function extractNikeGallery(html) {
  const urls = [
    ...html.matchAll(/https:\/\/static\.nike\.com\/a\/images\/t_PDP_[^"\s\\]+/g),
    ...html.matchAll(/https:\/\/static\.nike\.com\/a\/images\/t_default\/[^"\s\\]+/g),
  ].map((m) => m[0].replace(/\\u002F/g, "/").replace(/\\\//g, "/").split("?")[0]);

  const seen = new Set();
  const out = [];
  for (let u of urls) {
    if (!/\.(png|jpe?g|webp)$/i.test(u)) continue;
    // skip layer composites with weird transform stacks when possible
    if (u.includes("fl_layer_apply") && u.includes("e_bgremove")) continue;
    const idMatch = u.match(/\/([a-f0-9-]{8,})\/[^/]+$/i);
    const key = idMatch ? idMatch[1] : u;
    if (seen.has(key)) continue;
    seen.add(key);
    u = u
      .replace(/t_PDP_\d+_v\d+/g, "t_PDP_1728_v1")
      .replace(/t_default/g, "t_PDP_1728_v1");
    // normalize: prefer plain f_auto eco path without layer apply junk
    if (u.includes("fl_layer_apply")) {
      const mid = u.match(/\/([a-f0-9-]{8,})\/([^/]+\.png)$/i);
      if (mid) {
        u = `https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/${mid[1]}/${mid[2]}`;
      }
    }
    out.push(u);
    if (out.length >= 10) break;
  }
  return out;
}

async function resolveAngleUrls(shoe) {
  if (shoe.source === "zappos") {
    const html = await fetchText(`https://www.zappos.com${shoe.productPath}`);
    const views = extractZapposViews(html);
    console.log(`  zappos views: ${Object.keys(views).join(", ") || "(none)"}`);
    const map = {};
    for (const { key } of SPIN_ORDER) {
      if (views[key]) map[key] = views[key];
    }
    // Need at least Left + Right or Front + Back for a spin
    if (Object.keys(map).length < 2) {
      // pair alone isn't enough for orbit — try all available labeled
      for (const [k, v] of Object.entries(views)) {
        if (["Left", "Front", "Right", "Back"].includes(k)) map[k] = v;
      }
    }
    return map;
  }

  if (shoe.source === "nike") {
    let gallery = [];
    try {
      const html = await fetchText(shoe.productUrl);
      gallery = extractNikeGallery(html);
      console.log(`  nike gallery: ${gallery.length} shots`);
    } catch (e) {
      console.log(`  nike page fail: ${e.message}`);
    }
    if (gallery.length < 2 && shoe.fallbackUrls?.length) {
      gallery = shoe.fallbackUrls;
    }
    // Map first 4 product shots → Left, Front, Right, Back (Nike order is usually lateral-first)
    const map = {};
    SPIN_ORDER.forEach(({ key }, i) => {
      if (gallery[i]) map[key] = gallery[i];
    });
    return map;
  }

  if (shoe.source === "footlocker" && shoe.footlockerCode) {
    const code = shoe.footlockerCode;
    const map = {};
    SPIN_ORDER.forEach(({ key }, i) => {
      map[key] = `https://images.footlocker.com/is/image/EBFL2/${code}_a${i + 1}?wid=1400&hei=1400&fmt=png-alpha`;
    });
    console.log(`  footlocker set ${code} a1–a4`);
    return map;
  }

  return {};
}

async function writeSpinSet(id, angleMap) {
  const v = Date.now();
  const spinFrames = [];
  const views = {};
  let heroUrl = null;

  for (const { key, deg } of SPIN_ORDER) {
    const remote = angleMap[key];
    if (!remote) continue;
    console.log(`  DL ${key} ${remote.slice(0, 70)}`);
    try {
      const raw = await downloadImage(remote);
      const card = await toProductCard(raw);
      const base = `${id}-${key.toLowerCase()}`;
      const spinName = `${id}-spin${deg}-cut.png`;
      await writeFile(path.join(importedDir, `${base}.png`), raw);
      await writeFile(path.join(importedDir, `${base}-cut.png`), card);
      await writeFile(path.join(importedDir, spinName), card);
      views[key.toLowerCase()] = `/api/import/library/${base}.png?v=${v}`;
      spinFrames.push({
        deg,
        url: `/api/import/library/${spinName}?v=${v}`,
        label: key,
      });
      if (key === "Left" || !heroUrl) {
        heroUrl = `/api/import/library/${base}-cut.png?v=${v}`;
      }
    } catch (e) {
      console.log(`  fail ${key}: ${e.message}`);
    }
  }

  // Also save pair/top/bottom if present (zappos extras already in angleMap only for spin keys)
  return { spinFrames, views, heroUrl, v };
}

async function main() {
  await mkdir(importedDir, { recursive: true });
  const lib = JSON.parse(await readFile(libraryFile, "utf8"));
  const byId = new Map(lib.map((i) => [i.id, i]));

  for (const shoe of SHOES) {
    console.log(`\n== ${shoe.name} (${shoe.id}) ==`);
    let angleMap;
    try {
      angleMap = await resolveAngleUrls(shoe);
    } catch (e) {
      console.log(`  resolve fail: ${e.message}`);
      continue;
    }
    if (Object.keys(angleMap).length < 2) {
      console.log(`  skip — need ≥2 angles, got ${Object.keys(angleMap).join(",") || "none"}`);
      continue;
    }

    const { spinFrames, views, heroUrl } = await writeSpinSet(shoe.id, angleMap);
    if (spinFrames.length < 2) {
      console.log(`  skip — download produced ${spinFrames.length} frames`);
      continue;
    }

    const existing = byId.get(shoe.id) || {
      id: shoe.id,
      part: "shoes",
      schemaVersion: 4,
      createdAt: new Date().toISOString(),
    };

    const left = spinFrames.find((f) => f.deg === 0);
    const right = spinFrames.find((f) => f.deg === 180);
    const front = spinFrames.find((f) => f.deg === 90);

    const updated = {
      ...existing,
      name: shoe.name,
      part: "shoes",
      brand: shoe.brand,
      tags: shoe.tags,
      color: shoe.color || existing.color,
      role: existing.role || (shoe.tags.includes("want") ? "wishlist" : "daily"),
      image: heroUrl || left?.url || existing.image,
      thumbnail: heroUrl || left?.url || existing.thumbnail,
      frontImage: heroUrl || left?.url || front?.url || existing.frontImage,
      backImage: right?.url || existing.backImage,
      backSynthetic: false,
      subjectCutout: true,
      displayMode: "cutout",
      spinFrames,
      views: { ...(existing.views || {}), ...views },
      hasTrue360: true,
      seedSource: shoe.source === "zappos" ? `zappos${shoe.productPath || ""}` : shoe.productUrl,
      qualityNotes: `Multi-angle product set · drag 360 inline · ${spinFrames.map((f) => f.label).join(" → ")}`,
      repairVersion: Math.max(existing.repairVersion || 0, 12),
      updatedAt: new Date().toISOString(),
    };

    byId.set(shoe.id, updated);
    const idx = lib.findIndex((i) => i.id === shoe.id);
    if (idx >= 0) lib[idx] = updated;
    else lib.push(updated);

    console.log(
      `  ✓ ${shoe.name} 360: ${spinFrames.map((f) => f.label).join(" → ")} (${spinFrames.length} frames)`
    );
  }

  await writeFile(libraryFile, JSON.stringify(lib, null, 2) + "\n");
  console.log(`\nSaved ${libraryFile} (${lib.length} items)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
