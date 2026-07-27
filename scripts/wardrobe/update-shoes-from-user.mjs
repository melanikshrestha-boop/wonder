/**
 * Shoe inventory truth from Melani:
 * - AF1 white → WANT (not owned)
 * - Blazer white + BLACK swoosh → OWN (fix image)
 * - New Balance (user photo) → OWN
 * - HOKA white/gold (user photo) → OWN
 * - Air Jordan dark blue + black swoosh → OWN
 *
 * node scripts/wardrobe/update-shoes-from-user.mjs
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const dataDir = path.resolve(root, process.env.WARDROBE_DATA_DIR || "data");
const importedDir = path.join(dataDir, "imported");
const libraryFile = path.join(dataDir, "library.json");

const ASSETS =
  "/Users/melanishrestha/.grok/sessions/%2FUsers%2Fmelanishrestha/019f9fbe-0038-7ec0-a07b-dc34409b45dc/assets";

const USER_NB = path.join(ASSETS, "image-4f80dcbf-1aea-4195-9a95-aba92dd7ac3d.png");
const USER_HOKA = path.join(ASSETS, "image-ceca75c0-80e6-4f4a-b3e1-bdf4298e2202.png");
// Image 2 is the blazer style she likes (we'll still fetch black-swoosh variant if possible)
const USER_BLAZER_REF = path.join(ASSETS, "image-0e697266-dd9d-4bc3-b3d0-e7a2a94f8205.png");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function searchImageUrls(query, limit = 8) {
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
      if (u && /^https?:\/\//i.test(u) && !/vecteezy|shutterstock|dreamstime/i.test(u)) {
        urls.push(u);
      }
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

/** Cream product card — no aggressive cutout holes */
async function toProductCard(pngBytes) {
  const { data, info } = await sharp(pngBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += info.channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    // only pure white studio → transparent then cream
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

async function fromUserFile(filePath) {
  const raw = await sharp(await readFile(filePath))
    .rotate()
    .ensureAlpha()
    .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return toProductCard(raw);
}

async function fetchBest(queries) {
  for (const q of queries) {
    console.log("  search", q);
    const urls = await searchImageUrls(q, 8);
    for (const url of urls.slice(0, 5)) {
      try {
        const raw = await downloadImage(url);
        const card = await toProductCard(raw);
        console.log("  ok", url.slice(0, 60));
        return { bytes: card, url };
      } catch (e) {
        console.log("  fail", e.message);
      }
    }
  }
  return null;
}

function idFor(name) {
  return `sheet-${createHash("sha1").update(name).digest("hex").slice(0, 12)}`;
}

async function writePair(id, frontBytes, backBytes) {
  const v = Date.now();
  const frontName = `${id}-front.png`;
  const backName = `${id}-back.png`;
  await writeFile(path.join(importedDir, frontName), frontBytes);
  await writeFile(
    path.join(importedDir, backName),
    backBytes || (await sharp(frontBytes).flop().png().toBuffer())
  );
  return {
    image: `/api/import/library/${frontName}?v=${v}`,
    thumbnail: `/api/import/library/${frontName}?v=${v}`,
    frontImage: `/api/import/library/${frontName}?v=${v}`,
    backImage: `/api/import/library/${backName}?v=${v}`,
    backSynthetic: !backBytes,
  };
}

function baseRecord(name, part, tags, color, role, images, extra = {}) {
  const now = new Date().toISOString();
  return {
    id: idFor(name),
    name,
    part,
    tags,
    color,
    role,
    fit: "unknown",
    ...images,
    subjectCutout: false,
    displayMode: "product",
    schemaVersion: 4,
    createdAt: now,
    updatedAt: now,
    seedSource: "user-truth-shoes",
    ...extra,
  };
}

async function main() {
  await mkdir(importedDir, { recursive: true });
  let library = JSON.parse(await readFile(libraryFile, "utf8"));

  // 1) AF1 white → WANT (she does not own)
  {
    const i = library.findIndex((x) => /air force 1/i.test(x.name));
    if (i >= 0) {
      library[i] = {
        ...library[i],
        name: "Nike Air Force 1 White",
        role: "wishlist",
        tags: [...new Set([...(library[i].tags || []).filter((t) => t !== "own"), "want", "wishlist", "nike", "af1"])],
        qualityNotes: "WANT — not owned yet",
        updatedAt: new Date().toISOString(),
      };
      console.log("AF1 → want");
    }
  }

  // 2) Blazer white + BLACK swoosh (own)
  {
    const i = library.findIndex((x) => /blazer/i.test(x.name));
    console.log("\n→ Blazer white black swoosh");
    let front = await fetchBest([
      "Nike Blazer Mid 77 white black swoosh product white background",
      "Nike Blazer Mid white shoe black nike check product",
      "Nike Blazer Mid 77 Vintage white black swoosh side profile product",
    ]);
    // fallback: user ref image (may have white swoosh — still better than nothing)
    if (!front && (await exists(USER_BLAZER_REF))) {
      front = { bytes: await fromUserFile(USER_BLAZER_REF), url: "user-ref" };
    }
    if (front) {
      const id = i >= 0 ? library[i].id : idFor("Nike Blazer White Black Swoosh");
      const imgs = await writePair(id, front.bytes, null);
      const rec = {
        ...(i >= 0 ? library[i] : {}),
        ...baseRecord(
          "Nike Blazer White Black Swoosh",
          "shoes",
          ["nike", "blazer", "sneakers", "own", "black-swoosh"],
          "#f5f5f2",
          "daily",
          imgs,
          {
            id,
            qualityNotes: "White upper · black Nike swoosh (owned)",
            seedImageUrl: front.url,
          }
        ),
      };
      if (i >= 0) library[i] = rec;
      else library.push(rec);
      console.log("  blazer updated");
    }
  }

  // 3) New Balance from USER photo (own) — image 3
  {
    console.log("\n→ New Balance (user photo)");
    if (!(await exists(USER_NB))) throw new Error("NB user image missing");
    const front = await fromUserFile(USER_NB);
    const id = idFor("New Balance Running White Navy");
    // remove any old NB
    library = library.filter((x) => !/new balance/i.test(x.name));
    const imgs = await writePair(id, front, null);
    library.push(
      baseRecord(
        "New Balance Running White Navy",
        "shoes",
        ["newbalance", "running", "sneakers", "own", "530-style"],
        "#f5f5f2",
        "daily",
        imgs,
        {
          id,
          qualityNotes: "Owned running shoe — photo from Melani",
          seedSource: "user-upload",
        }
      )
    );
    console.log("  NB added from your image");
  }

  // 4) HOKA from USER photo (own) — image 4
  {
    console.log("\n→ HOKA (user photo)");
    if (!(await exists(USER_HOKA))) throw new Error("HOKA user image missing");
    const front = await fromUserFile(USER_HOKA);
    const id = idFor("HOKA Running White Gold");
    library = library.filter((x) => !/hoka/i.test(x.name));
    const imgs = await writePair(id, front, null);
    library.push(
      baseRecord(
        "HOKA Running White Gold",
        "shoes",
        ["hoka", "running", "sneakers", "own"],
        "#f5f5f2",
        "daily",
        imgs,
        {
          id,
          qualityNotes: "Owned HOKA — white upper gold logo blue sole accent",
          seedSource: "user-upload",
        }
      )
    );
    console.log("  HOKA added from your image");
  }

  // 5) Air Jordan — dark blue / black swoosh (own)
  {
    console.log("\n→ Air Jordan dark blue black swoosh");
    // Don't replace Dunk unless it's wrongly labeled — add separate Jordan
    library = library.filter((x) => !/air jordan|jordan 1|jordan mid/i.test(x.name));
    const front = await fetchBest([
      "Nike Air Jordan 1 dark blue black swoosh product white background",
      "Air Jordan mid navy black nike check product side",
      "Jordan 1 low midnight navy black swoosh product",
      "Air Jordan dark navy black swoosh sneaker product photo",
    ]);
    if (front) {
      const id = idFor("Nike Air Jordan Dark Blue Black Swoosh");
      const imgs = await writePair(id, front.bytes, null);
      library.push(
        baseRecord(
          "Nike Air Jordan Dark Blue Black Swoosh",
          "shoes",
          ["nike", "jordan", "sneakers", "own", "dark-blue", "black-swoosh"],
          "#1a2744",
          "daily",
          imgs,
          {
            id,
            qualityNotes: "Owned — dark blue body, black Nike swoosh",
            seedImageUrl: front.url,
          }
        )
      );
      console.log("  Jordan added");
    } else {
      console.log("  Jordan search failed — add photo later");
    }
  }

  // Dunk stays as own (black/white) unless she said otherwise
  {
    const i = library.findIndex((x) => /dunk/i.test(x.name));
    if (i >= 0) {
      library[i] = {
        ...library[i],
        role: "daily",
        tags: [...new Set([...(library[i].tags || []), "own", "dunk"])],
      };
    }
  }

  await writeFile(libraryFile, `${JSON.stringify(library, null, 2)}\n`);
  console.log("\nShoes summary:");
  for (const x of library.filter((i) => i.part === "shoes")) {
    console.log(`  [${x.role || "daily"}] ${x.name}`);
  }
  console.log(`Total library: ${library.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
