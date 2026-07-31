/**
 * Live wishlist taste analysis — brands, categories, materials, price signals.
 * Pure client-side so every import/re-render updates Melani's read of her wants.
 */

const MATERIAL_WORDS = [
  ["cotton", /\bcotton\b/i],
  ["fleece", /\bfleece\b/i],
  ["denim", /\b(denim|jean)\b/i],
  ["leather", /\bleather\b/i],
  ["wool", /\bwool\b/i],
  ["cashmere", /\bcashmere\b/i],
  ["nylon", /\bnylon\b/i],
  ["polyester", /\bpoly(ester)?\b/i],
  ["suede", /\bsuede\b/i],
  ["silk", /\bsilk\b/i],
  ["linen", /\blinen\b/i],
];

const KNOWN_BRANDS = [
  "Acne Studios",
  "Fear of God",
  "Essentials",
  "Stussy",
  "Scuffers",
  "Nike",
  "Adidas",
  "New Balance",
  "HOKA",
  "Uniqlo",
  "Edikted",
  "Cold Culture",
  "Anti Social Social Club",
  "Timberland",
  "Dr. Martens",
];

function brandOf(item) {
  const b = String(item.brand || "").trim();
  if (b) return b;
  const name = String(item.name || "");
  for (const k of KNOWN_BRANDS) {
    if (new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(name)) return k;
  }
  const bits = name.split(/\s+/).filter(Boolean);
  return bits.slice(0, 2).join(" ") || "Unknown";
}

function categoryOf(item) {
  const blob = `${item.name || ""} ${(item.tags || []).join(" ")} ${item.part || ""}`.toLowerCase();
  if (/hoodie|crewneck|sweatshirt|fleece logo/.test(blob)) return "Hoodies";
  if (/\btee\b|t-shirt|tshirt/.test(blob)) return "Tees";
  if (/jean|denim/.test(blob)) return "Jeans";
  if (/sweat|jogger/.test(blob)) return "Sweats";
  if (/shoe|sneaker|dunk|samba|boot|blazer mid|jordan|hoka|killshot/.test(blob) || item.part === "shoes") {
    return "Shoes";
  }
  if (/jacket|puffer|coat|blazer/.test(blob) || item.part === "wholebody_up") return "Outerwear";
  if (/dress/.test(blob) || item.part === "dresses") return "Dresses";
  if (item.part === "lowerbody") return "Bottoms";
  if (item.part === "upperbody") return "Tops";
  return "Other";
}

function materialsOf(item) {
  const blob = [
    item.name,
    item.fabric,
    item.composition,
    item.retailNote,
    item.qualityNotes,
    ...(item.tags || []),
  ]
    .filter(Boolean)
    .join(" ");
  const hits = [];
  for (const [label, re] of MATERIAL_WORDS) {
    if (re.test(blob)) hits.push(label);
  }
  return hits;
}

function isWantItem(item) {
  return (
    item?.role === "wishlist"
    || (item?.tags || []).some((t) => String(t).toLowerCase() === "want")
  );
}

function rankMap(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * @param {Array<Record<string, unknown>>} items full wardrobe list or want-only
 */
export function analyzeWishlist(items = []) {
  const want = items.filter(isWantItem);
  const brands = new Map();
  const categories = new Map();
  const materials = new Map();
  let priceSum = 0;
  let priceN = 0;
  let minP = Infinity;
  let maxP = 0;

  for (const item of want) {
    const brand = brandOf(item);
    brands.set(brand, (brands.get(brand) || 0) + 1);
    const cat = categoryOf(item);
    categories.set(cat, (categories.get(cat) || 0) + 1);
    for (const m of materialsOf(item)) {
      materials.set(m, (materials.get(m) || 0) + 1);
    }
    const p = Number(item.retailPrice ?? item.price);
    if (Number.isFinite(p) && p > 0) {
      priceSum += p;
      priceN += 1;
      minP = Math.min(minP, p);
      maxP = Math.max(maxP, p);
    }
  }

  const brandRank = rankMap(brands);
  const catRank = rankMap(categories);
  const matRank = rankMap(materials);
  const topBrand = brandRank[0]?.[0] || null;
  const topCat = catRank[0]?.[0] || null;
  const signals = [];

  if (
    topCat === "Hoodies"
    || (categories.get("Hoodies") || 0) >= Math.max(2, want.length * 0.3)
  ) {
    signals.push("Hoodie lover");
  }
  if ((categories.get("Shoes") || 0) >= 2) signals.push("Sneaker stack building");
  if (topBrand) signals.push(`${topBrand} leads the wishlist`);
  if (matRank[0]) {
    signals.push(`${matRank[0][0]} is the fabric you keep saving`);
  }
  if (priceN && priceSum / priceN >= 200) signals.push("Premium price band");
  else if (priceN && priceSum / priceN < 100) signals.push("Value-first price band");

  // One-line lede for UI (plain, no marketing fluff)
  const brandBit = topBrand
    ? `${topBrand} ×${brandRank[0][1]}`
    : "no brand lock yet";
  const catBit = topCat
    ? `${topCat.toLowerCase()} lead`
    : "mixed categories";
  const matBit = matRank[0] ? matRank[0][0] : "fabric TBD";
  const priceBit = priceN ? `avg $${Math.round(priceSum / priceN)}` : "prices open";
  const lede = want.length
    ? `${want.length} wants · ${brandBit} · ${catBit} · ${matBit} · ${priceBit}`
    : "Wishlist empty — paste a product link to start the read.";

  return {
    count: want.length,
    brands: brandRank.map(([name, count]) => ({ name, count })),
    categories: catRank.map(([name, count]) => ({ name, count })),
    materials: matRank.map(([name, count]) => ({ name, count })),
    price: priceN
      ? { avg: Math.round(priceSum / priceN), min: minP, max: maxP, n: priceN }
      : null,
    topBrand,
    topCategory: topCat,
    signals,
    lede,
    generatedAt: new Date().toISOString(),
  };
}
