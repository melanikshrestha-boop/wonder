/**
 * Style Shopper engine — ranks finds against Melani Style DNA + live closet.
 * No cloud required: deterministic scoring + curated catalog + brand shop links.
 */
import {
  brandsForLane,
  MELANI_STYLE,
  STYLE_BRANDS,
  type StyleLane,
} from "./styleProfile";

export type ClosetPiece = {
  id?: string;
  name?: string;
  part?: string;
  tags?: string[];
  brand?: string;
  role?: string;
  productRef?: string | null;
  retailPrice?: number | null;
  composition?: string | null;
  fabric?: { text?: string } | string | null;
};

export type ShopFind = {
  id: string;
  name: string;
  brand: string;
  lane: StyleLane;
  price: number | null;
  currency: "USD" | "EUR";
  /** Direct product or collection URL */
  url: string;
  why: string[];
  score: number; // 0–100 fit to Melani DNA
  fabricNote?: string;
  fitNote?: string;
  tags: string[];
  /** Gap this fill (if any) */
  fillsGap?: string;
  /** Pairs with which closet bottoms (plain English) */
  pairsWith?: string;
  /** True when product is known / claimed 100% cotton */
  cotton100?: boolean;
  /** Minimalist / understated everyday piece */
  minimalist?: boolean;
  source: "curated" | "brand-search" | "closet-gap" | "live-web";
};

export type ClosetInsight = {
  owned: number;
  want: number;
  byLane: Record<string, number>;
  brandsPresent: string[];
  gaps: string[];
  nextBuys: string[];
};

export type ShopperReply = {
  text: string;
  finds: ShopFind[];
  insight: ClosetInsight;
};

/** Google Shopping — hard filter language for 100% cotton tees */
export function liveCottonTeeSearchUrl(extra = ""): string {
  const base =
    '100% cotton t-shirt OR "cotton tee" OR "crew neck tee" -polyester -poly -blend -performance -moisture';
  const q = [base, extra, "minimalist OR blank OR crew", "women OR unisex"]
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}&hl=en&gl=us`;
}

/** Official / strong product picks aligned with her actual closet + wants */
const CURATED: Omit<ShopFind, "score" | "source">[] = [
  {
    id: "cur-stussy-ash",
    name: "Basic Stüssy Hoodie — Ash Heather",
    brand: "Stussy",
    lane: "hoodies",
    price: 130,
    currency: "USD",
    url: "https://www.stussy.com/collections/hoodies/products/1925000-basic-stussy-hoodie-ash-heather",
    why: [
      "Already in your DNA — Ash Heather gray you own / locked.",
      "Heavy cotton-blend fleece, relaxed fit.",
    ],
    fabricNote: "75% cotton blend fleece",
    fitNote: "Relaxed / baggy",
    tags: ["hoodie", "stussy", "ash-heather", "gray"],
  },
  {
    id: "cur-stussy-black",
    name: "Basic Stüssy Hoodie — Black",
    brand: "Stussy",
    lane: "hoodies",
    price: 130,
    currency: "USD",
    url: "https://www.stussy.com/collections/hoodies/products/1925000-basic-stussy-hoodie-black",
    why: [
      "Same cut as Ash Heather — black stack piece.",
      "Logo chest, heavy fleece, pairs with Edikted denim.",
    ],
    fabricNote: "Heavy cotton blend fleece",
    fitNote: "Relaxed",
    tags: ["hoodie", "stussy", "black"],
  },
  {
    id: "cur-edikted-nyc",
    name: "NYC Studded Low Rise Baggy Jeans — Blue Washed",
    brand: "Edikted",
    lane: "jeans",
    price: 58,
    currency: "USD",
    url: "https://edikted.com/collections/jeans/products/s25504_blue-washed",
    why: [
      "WANT only — different from your owned Petite Raelynn S15782 stack.",
      "Studded NYC graphic · baggy low-rise · 100% cotton.",
    ],
    fabricNote: "100% cotton rigid denim",
    fitNote: "Baggy · low rise",
    tags: ["jeans", "edikted", "baggy", "want", "nyc", "s25504"],
    fillsGap: "Statement studded denim (want)",
  },
  {
    id: "cur-edikted-raelynn-owned",
    name: "Petite Raelynn Baggy Jeans (you own this line)",
    brand: "Edikted",
    lane: "jeans",
    price: 48,
    currency: "USD",
    url: "https://edikted.com/collections/jeans/products/s15782_blue-washed",
    why: [
      "OWNED stack: blue washed · indigo raw washed · denim black · white.",
      "Do not re-buy S15782 colors you already have — expand only new washes.",
    ],
    fabricNote: "Cotton denim · baggy low-rise",
    fitNote: "Petite Raelynn baggy",
    tags: ["jeans", "edikted", "raelynn", "s15782", "owned"],
  },
  {
    id: "cur-edikted-baggy",
    name: "Edikted Baggy Jeans (browse new washes)",
    brand: "Edikted",
    lane: "jeans",
    price: null,
    currency: "USD",
    url: "https://edikted.com/collections/jeans",
    why: [
      "Your denim brand — stay baggy / low-rise (Raelynn DNA).",
      "Skip blue-washed / indigo / black S15782 you already own.",
    ],
    fitNote: "Baggy first",
    tags: ["jeans", "edikted", "baggy"],
  },
  {
    id: "cur-uniqlo-sweat-w",
    name: "Uniqlo Soft Fleece / Sweatpants — cotton comfort",
    brand: "Uniqlo",
    lane: "sweats",
    price: 40,
    currency: "USD",
    url: "https://www.uniqlo.com/us/en/search?q=sweatpants%20women",
    why: [
      "Your sweat brand — comfort is the whole point.",
      "Prefer cotton or soft fleece; skip scratchy poly shells.",
    ],
    fabricNote: "Prefer cotton / soft fleece",
    fitNote: "Wide-leg or open-hem when available",
    tags: ["sweats", "uniqlo", "cotton", "comfort"],
    fillsGap: "Extra Uniqlo sweat colorway",
  },
  {
    id: "cur-uniqlo-wide",
    name: "Uniqlo Wide / High-Rise Sweatpants",
    brand: "Uniqlo",
    lane: "sweats",
    price: null,
    currency: "USD",
    url: "https://www.uniqlo.com/us/en/search?q=wide%20sweatpants",
    why: [
      "Matches the gray / black / white Uniqlo stack you already run.",
      "Comfort + clean silhouette for LA ↔ SF days.",
    ],
    fabricNote: "Cotton blend soft sweat",
    tags: ["sweats", "uniqlo", "wide-leg"],
  },
  {
    id: "cur-scuffers",
    name: "Scuffers Hoodie — tonal logo",
    brand: "Scuffers",
    lane: "hoodies",
    price: 119,
    currency: "USD",
    url: "https://www.google.com/search?tbm=shop&q=Scuffers+hoodie",
    why: [
      "You already own blue + burgundy — stack more washed colorways.",
      "Tonal embroidered logo, oversized street cut.",
    ],
    fitNote: "Oversized",
    tags: ["hoodie", "scuffers"],
  },
  {
    id: "cur-essentials",
    name: "Fear of God Essentials Hoodie",
    brand: "Fear of God Essentials",
    lane: "hoodies",
    price: 90,
    currency: "USD",
    url: "https://www.google.com/search?tbm=shop&q=Fear+of+God+Essentials+hoodie",
    why: [
      "Neutral oversized base already in closet.",
      "Best as taupe / fog / black stack, not loud graphics.",
    ],
    tags: ["hoodie", "essentials", "fog"],
  },
  // —— Minimalist 100% cotton tees (decision-fatigue uniform) ——
  {
    id: "cur-tee-uniqlo-crew",
    name: "Uniqlo Crew Neck T-Shirt — 100% cotton blanks",
    brand: "Uniqlo",
    lane: "tees",
    price: 15,
    currency: "USD",
    url: "https://www.uniqlo.com/us/en/search?q=crew%20neck%20t-shirt%20100%25%20cotton",
    why: [
      "Billionaire-simple: one cut, every neutral — zero outfit stress.",
      "Confirm fabric line says 100% cotton before cart.",
      "Tucks or hangs clean over Edikted Petite Raelynn baggy jeans.",
    ],
    fabricNote: "100% cotton (verify colorway)",
    fitNote: "Regular / relaxed — size up for boxy",
    tags: ["tee", "uniqlo", "100-cotton", "minimalist", "black", "white", "gray"],
    fillsGap: "Everyday cotton tee stack",
    pairsWith: "Edikted baggy jeans (black · blue · indigo · white) + sneakers",
    cotton100: true,
    minimalist: true,
  },
  {
    id: "cur-tee-uniqlo-u",
    name: "Uniqlo U Crew Neck T-Shirt",
    brand: "Uniqlo",
    lane: "tees",
    price: 20,
    currency: "USD",
    url: "https://www.uniqlo.com/us/en/search?q=Uniqlo%20U%20crew%20neck%20t-shirt",
    why: [
      "Heavier blank than basic Uniqlo — still understated.",
      "Designer-collab cut without looking try-hard.",
    ],
    fabricNote: "Cotton jersey — prefer listed 100% cotton colors",
    fitNote: "Slightly roomier U cut",
    tags: ["tee", "uniqlo", "uniqlo-u", "minimalist", "cotton"],
    fillsGap: "Midweight cotton tee",
    pairsWith: "Baggy denim + Timberlands or Dunks",
    cotton100: true,
    minimalist: true,
  },
  {
    id: "cur-tee-stussy-basic",
    name: "Stussy Basic Tee — neutrals only",
    brand: "Stussy",
    lane: "tees",
    price: 40,
    currency: "USD",
    url: "https://www.stussy.com/collections/tees",
    why: [
      "You already own black Basic Tee — add white / ash only.",
      "Small chest logo is still understated with baggy jeans.",
    ],
    fabricNote: "Cotton jersey (check listing for 100% cotton)",
    fitNote: "Relaxed / street cut",
    tags: ["tee", "stussy", "basic", "minimalist", "cotton"],
    fillsGap: "Second Stussy tee color",
    pairsWith: "Edikted Raelynn black or blue washed",
    cotton100: true,
    minimalist: true,
  },
  {
    id: "cur-tee-everlane",
    name: "Everlane Organic Cotton Crew / Box-Cut Tee",
    brand: "Everlane",
    lane: "tees",
    price: 30,
    currency: "USD",
    url: "https://www.google.com/search?tbm=shop&q=Everlane+organic+cotton+crew+tee+100%25+cotton",
    why: [
      "Quiet-luxury blank — no logo noise.",
      "Organic cotton stack for travel / SF days.",
    ],
    fabricNote: "100% organic cotton",
    fitNote: "Crew or box-cut — size for relaxed",
    tags: ["tee", "everlane", "100-cotton", "minimalist", "organic"],
    fillsGap: "Premium cotton blank",
    pairsWith: "Indigo or white Edikted baggy",
    cotton100: true,
    minimalist: true,
  },
  {
    id: "cur-tee-cos",
    name: "COS Cotton T-Shirt — regular / relaxed",
    brand: "COS",
    lane: "tees",
    price: 35,
    currency: "USD",
    url: "https://www.google.com/search?tbm=shop&q=COS+cotton+t-shirt+100%25+cotton",
    why: [
      "Looks expensive with jeans without trying.",
      "Minimalist European cut — black/white/navy only.",
    ],
    fabricNote: "100% cotton (verify product page)",
    fitNote: "Regular or relaxed",
    tags: ["tee", "cos", "100-cotton", "minimalist"],
    fillsGap: "Elevated everyday tee",
    pairsWith: "Black baggy denim + clean sneakers",
    cotton100: true,
    minimalist: true,
  },
  {
    id: "cur-tee-arket",
    name: "Arket Heavy Cotton T-Shirt",
    brand: "Arket",
    lane: "tees",
    price: 40,
    currency: "USD",
    url: "https://www.google.com/search?tbm=shop&q=Arket+heavy+cotton+t-shirt+100%25+cotton",
    why: [
      "Thick cotton that hangs properly over baggy jeans.",
      "Scandi uniform — zero decision fatigue.",
    ],
    fabricNote: "Heavy 100% cotton jersey",
    fitNote: "Relaxed",
    tags: ["tee", "arket", "100-cotton", "heavy", "minimalist"],
    fillsGap: "Heavy cotton tee",
    pairsWith: "Edikted baggy + HOKA or NB 530",
    cotton100: true,
    minimalist: true,
  },
  {
    id: "cur-tee-buck-mason",
    name: "Buck Mason Slub Tee — 100% cotton",
    brand: "Buck Mason",
    lane: "tees",
    price: 48,
    currency: "USD",
    url: "https://www.google.com/search?tbm=shop&q=Buck+Mason+slub+tee+100%25+cotton",
    why: [
      "Soft slub hand — understated US workwear energy.",
      "Pairs with baggy denim like a uniform.",
    ],
    fabricNote: "100% cotton slub",
    fitNote: "Classic / slightly curved hem",
    tags: ["tee", "buck-mason", "100-cotton", "slub", "minimalist"],
    fillsGap: "Textured cotton blank",
    pairsWith: "Blue washed Raelynn + Samba or Dunk",
    cotton100: true,
    minimalist: true,
  },
  {
    id: "cur-tee-live-web",
    name: "Live web · 100% cotton minimalist tees",
    brand: "Web search",
    lane: "tees",
    price: null,
    currency: "USD",
    url: liveCottonTeeSearchUrl(""),
    why: [
      "Surfs Google Shopping for 100% cotton tees only.",
      "Add color + brand in the search box to refine.",
    ],
    fabricNote: "Filter: 100% cotton only",
    fitNote: "Prefer relaxed / boxy",
    tags: ["tee", "100-cotton", "minimalist", "live-web"],
    fillsGap: "Open-ended cotton tee hunt",
    pairsWith: "Any Edikted baggy jean in your stack",
    cotton100: true,
    minimalist: true,
  },
];

/** Brand + color live hunts for the uniform stack */
export function liveTeeBrandHunts(): ShopFind[] {
  const colors = [
    { id: "black", label: "black", extra: "black" },
    { id: "white", label: "white", extra: "white OR bone OR ivory" },
    { id: "gray", label: "heather gray", extra: "heather gray OR grey" },
    { id: "navy", label: "navy", extra: "navy" },
  ];
  return colors.map((c, i) => ({
    id: `live-tee-${c.id}`,
    name: `100% cotton tee · ${c.label}`,
    brand: "Live web",
    lane: "tees" as const,
    price: null,
    currency: "USD" as const,
    url: liveCottonTeeSearchUrl(c.extra),
    why: [
      `Web hunt: 100% cotton ${c.label} tees only (poly filtered out).`,
      `Neutral stack piece — pairs with baggy Edikted denim.`,
    ],
    fabricNote: "Must say 100% cotton on the product page",
    fitNote: "Relaxed / boxy preferred",
    tags: ["tee", "100-cotton", "minimalist", c.id, "live-web"],
    pairsWith: MELANI_STYLE.jeansPairing.formula,
    cotton100: true,
    minimalist: true,
    score: 78 - i,
    source: "live-web" as const,
  }));
}

function blob(item: ClosetPiece): string {
  const fabric =
    typeof item.fabric === "string"
      ? item.fabric
      : item.fabric?.text || item.composition || "";
  return `${item.name || ""} ${(item.tags || []).join(" ")} ${item.brand || ""} ${item.part || ""} ${fabric}`.toLowerCase();
}

export function familyOf(item: ClosetPiece): StyleLane {
  const b = blob(item);
  if (/\b(sneaker|boot|shoe)\b/.test(b) || item.part === "shoes") return "shoes";
  if (/\bdress/.test(b) || item.part === "dresses") return "dresses";
  if (/\b(jacket|puffer|coat)\b/.test(b) || item.part === "wholebody_up") return "jackets";
  if (/\b(sweatpant|sweats|jogger)\b/.test(b)) return "sweats";
  if (/\b(jean|denim)\b/.test(b) || item.part === "lowerbody") {
    if (/\bsweat/.test(b)) return "sweats";
    return "jeans";
  }
  if (/\b(hoodie|sweatshirt|crewneck)\b/.test(b)) return "hoodies";
  if (/\b(tee|t-shirt|tshirt)\b/.test(b)) return "tees";
  if (item.part === "upperbody") return "hoodies";
  return "other";
}

function isWant(item: ClosetPiece): boolean {
  return item.role === "wishlist" || (item.tags || []).some((t) => String(t).toLowerCase() === "want");
}

export function analyzeCloset(items: ClosetPiece[]): ClosetInsight {
  const owned = items.filter((i) => !isWant(i));
  const want = items.filter(isWant);
  const byLane: Record<string, number> = {};
  for (const i of owned) {
    const f = familyOf(i);
    byLane[f] = (byLane[f] || 0) + 1;
  }
  const brandsPresent = [
    ...new Set(
      owned
        .map((i) => (i.brand || "").trim())
        .filter(Boolean)
        .concat(
          owned.flatMap((i) =>
            STYLE_BRANDS.filter((b) =>
              blob(i).includes(b.brand.toLowerCase().split(" ")[0]!)
            ).map((b) => b.brand)
          )
        )
    ),
  ];

  const gaps: string[] = [];
  const teeCount = byLane.tees || 0;
  if (teeCount < 2) {
    gaps.push(
      teeCount === 0
        ? "Tee stack thin — need 100% cotton minimalist crews for the jeans uniform."
        : "Only one tee lane piece — add black/white/gray 100% cotton blanks."
    );
  }
  if ((byLane.sweats || 0) < 2) gaps.push("Build Uniqlo sweat depth (another color / cotton pair).");
  const ownedJeans = owned.filter((i) => familyOf(i) === "jeans");
  const hasRaelynn = ownedJeans.some((i) => /raelynn|s15782/i.test(blob(i)));
  if ((byLane.jeans || 0) < 2) {
    gaps.push("Thin denim stack — Edikted baggy is the lane.");
  } else if (hasRaelynn) {
    // healthy Edikted stack — no false "buy more blue" pressure
  }
  if ((byLane.hoodies || 0) < 3) gaps.push("Hoodie rotation thin — Stussy / Scuffers / Essentials.");
  if ((byLane.jackets || 0) < 1) gaps.push("No everyday jacket beyond outer layers.");
  if (!owned.some((i) => /uniqlo/i.test(blob(i)) && familyOf(i) === "sweats")) {
    gaps.push("Uniqlo sweats are your comfort baseline — keep restocking cotton soft pairs.");
  }

  const nextBuys: string[] = [];
  if (teeCount < 3) {
    nextBuys.push(
      "2–3× 100% cotton minimalist tees (black · white · heather) for baggy jeans days"
    );
  }
  if (want.some((i) => /nyc studded|s25504/i.test(blob(i)))) {
    nextBuys.push("Edikted NYC Studded baggy (Want) — not your owned Raelynn S15782");
  } else if (!hasRaelynn) {
    nextBuys.push("Edikted Petite Raelynn baggy (your denim DNA)");
  }
  nextBuys.push("Uniqlo cotton / soft fleece sweatpants — new color");
  if (!owned.some((i) => /stussy/i.test(blob(i)) && /black/i.test(blob(i)) && familyOf(i) === "hoodies")) {
    nextBuys.push("Stussy Basic Hoodie black (pair with Ash Heather)");
  }

  return {
    owned: owned.length,
    want: want.length,
    byLane,
    brandsPresent,
    gaps,
    nextBuys,
  };
}

function scoreFind(find: Omit<ShopFind, "score" | "source">, insight: ClosetInsight, query = ""): number {
  let s = 55;
  const brandHit = STYLE_BRANDS.find(
    (b) => b.brand.toLowerCase() === find.brand.toLowerCase()
  );
  if (brandHit) s += 18;
  if (find.lane === "sweats" && /uniqlo/i.test(find.brand)) s += 12;
  if (find.lane === "jeans" && /edikted/i.test(find.brand)) s += 12;
  if (find.lane === "hoodies" && /stussy|scuffers|essentials|cold culture/i.test(find.brand)) s += 10;
  if (find.lane === "tees" && /uniqlo|everlane|cos|arket|buck mason|stussy/i.test(find.brand)) s += 12;
  if (find.fabricNote && /cotton/i.test(find.fabricNote)) s += 8;
  if (find.cotton100) s += 14; // hard prefer 100% cotton
  if (find.minimalist) s += 8;
  if (find.fitNote && /baggy|relaxed|oversized|wide|boxy/i.test(find.fitNote)) s += 6;
  if (find.fillsGap && insight.gaps.some((g) => g.toLowerCase().includes(find.lane))) s += 8;
  if (find.fillsGap) s += 5;
  if (find.pairsWith && /jean|denim|raelynn/i.test(find.pairsWith)) s += 4;
  const q = query.toLowerCase();
  if (q) {
    if (find.name.toLowerCase().includes(q) || find.brand.toLowerCase().includes(q)) s += 10;
    if (find.tags.some((t) => q.includes(t) || t.includes(q))) s += 6;
    if (q.includes("cotton") && (find.cotton100 || (find.fabricNote && /cotton/i.test(find.fabricNote)))) s += 12;
    if (/100\s*%?\s*cotton|pure cotton/.test(q) && find.cotton100) s += 10;
    if (/minimal|understated|simple|uniform|billionaire|decision|quiet|blank/.test(q) && find.minimalist) s += 12;
    if (q.includes("comfort") && find.lane === "sweats") s += 10;
    if (q.includes("hoodie") && find.lane === "hoodies") s += 8;
    if ((q.includes("jean") || q.includes("denim")) && find.lane === "jeans") s += 8;
    if (q.includes("sweat") && find.lane === "sweats") s += 8;
    if (/\btee|t-shirt|tshirt\b/.test(q) && find.lane === "tees") s += 10;
    // poly is a hard no for her everyday tees
    if (/poly|performance|dri-?fit/.test(q) === false && find.fabricNote && /poly/i.test(find.fabricNote)) s -= 20;
  }
  // de-boost if closet already heavy in that brand+lane
  const laneCount = insight.byLane[find.lane] || 0;
  if (laneCount >= 5) s -= 6;
  // boost tees when closet is tee-poor
  if (find.lane === "tees" && (insight.byLane.tees || 0) < 3) s += 8;
  return Math.max(0, Math.min(100, s));
}

function brandSearchFinds(lane: StyleLane, query: string): ShopFind[] {
  return brandsForLane(lane).map((b, i) => {
    const q = query || lane;
    return {
      id: `search-${b.brand}-${lane}-${i}`,
      name: `${b.brand} — shop ${lane}`,
      brand: b.brand,
      lane,
      price: null,
      currency: "USD" as const,
      url: b.searchUrl(q),
      why: [b.why, `Opens ${b.brand} shopping for “${q}”.`],
      score: 70,
      tags: [lane, b.brand.toLowerCase(), "search"],
      source: "brand-search" as const,
    };
  });
}

export function rankFinds(
  items: ClosetPiece[],
  opts: {
    query?: string;
    lane?: StyleLane | "all";
    limit?: number;
    /** Hard filter: only 100% cotton tagged finds */
    cotton100Only?: boolean;
    /** Prefer minimalist / understated */
    minimalistOnly?: boolean;
  } = {}
): ShopFind[] {
  const insight = analyzeCloset(items);
  const q = (opts.query || "").trim();
  const limit = opts.limit ?? 12;
  const laneFilter = opts.lane && opts.lane !== "all" ? opts.lane : null;
  const wantsCotton =
    opts.cotton100Only || /100\s*%?\s*cotton|pure cotton|cotton only/i.test(q);
  const wantsMinimal =
    opts.minimalistOnly ||
    /minimal|understated|simple|uniform|billionaire|decision\s*fatigue|quiet luxury|blank/i.test(q);

  let pool: ShopFind[] = CURATED.map((c) => ({
    ...c,
    score: scoreFind(c, insight, q),
    source: (c.id === "cur-tee-live-web" ? "live-web" : "curated") as ShopFind["source"],
  }));

  // Inject brand-search rows when user is hunting a lane
  if (laneFilter) {
    pool = pool.concat(brandSearchFinds(laneFilter, q || laneFilter));
  } else if (/\b(hoodie|jean|sweat|tee|uniqlo|edikted|stussy|scuffers|everlane|cos|arket)\b/i.test(q)) {
    const lane: StyleLane = /\bjean|denim\b/i.test(q)
      ? "jeans"
      : /\bsweat\b/i.test(q)
        ? "sweats"
        : /\btee|t-shirt|tshirt\b/i.test(q) || wantsMinimal
          ? "tees"
          : "hoodies";
    pool = pool.concat(brandSearchFinds(lane, q));
  }

  // Live web color hunts when hunting cotton tees / minimalist tops
  if (
    laneFilter === "tees" ||
    wantsCotton ||
    wantsMinimal ||
    /\btee|t-shirt|tshirt|top\b/i.test(q)
  ) {
    pool = pool.concat(liveTeeBrandHunts());
    // Extra open search with their free-text
    if (q && !/what should i buy/i.test(q)) {
      pool.push({
        id: `live-custom-${q.slice(0, 24)}`,
        name: `Live web · ${q.slice(0, 48)}`,
        brand: "Live web",
        lane: "tees",
        price: null,
        currency: "USD",
        url: liveCottonTeeSearchUrl(q),
        why: [
          `Surfs Google Shopping for: ${q}`,
          "Only open listings that say 100% cotton on the product page.",
        ],
        fabricNote: "100% cotton required",
        fitNote: "Relaxed / boxy preferred",
        tags: ["tee", "100-cotton", "live-web", "custom"],
        pairsWith: MELANI_STYLE.jeansPairing.formula,
        cotton100: true,
        minimalist: wantsMinimal,
        score: 80,
        source: "live-web",
      });
    }
  }

  if (laneFilter) pool = pool.filter((f) => f.lane === laneFilter);
  if (wantsCotton) {
    pool = pool.filter(
      (f) =>
        f.cotton100 ||
        (f.fabricNote && /100\s*%?\s*cotton|organic cotton/i.test(f.fabricNote)) ||
        f.source === "live-web" ||
        f.source === "brand-search"
    );
  }
  if (wantsMinimal) {
    pool = pool.filter(
      (f) => f.minimalist || f.lane === "tees" || f.source === "live-web" || f.source === "brand-search"
    );
  }

  // Re-score search / live rows
  pool = pool.map((f) =>
    f.source === "brand-search" || f.source === "live-web"
      ? { ...f, score: scoreFind(f, insight, q) }
      : f
  );

  return pool
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Natural-language shopper — local rules, DNA-aware */
export function askShopper(text: string, items: ClosetPiece[]): ShopperReply {
  const insight = analyzeCloset(items);
  const q = text.trim();
  const low = q.toLowerCase() || "what should i buy";

  const wantsMinimal =
    /minimal|understated|simple|uniform|billionaire|decision\s*fatigue|quiet|blank tee|blank top/i.test(
      low
    );
  const wantsCotton = /100\s*%?\s*cotton|pure cotton|cotton only|cotton tee/i.test(low);

  let lane: StyleLane | "all" = "all";
  if (wantsMinimal || /\btee|t-shirt|tshirt|crew neck\b/.test(low)) lane = "tees";
  else if (/\b(hoodie|scuffers|essentials)\b/.test(low) && !/\btee\b/.test(low)) lane = "hoodies";
  else if (/\b(jean|denim|edikted)\b/.test(low)) lane = "jeans";
  else if (/\b(sweat|joggers?)\b/.test(low) && !/\btee\b/.test(low)) lane = "sweats";
  else if (/\bstussy\b/.test(low) && /\btee|t-shirt\b/.test(low)) lane = "tees";
  else if (/\buniqlo\b/.test(low) && /\btee|t-shirt|top\b/.test(low)) lane = "tees";
  else if (/\buniqlo\b/.test(low)) lane = "sweats";
  else if (/\bjacket|puffer\b/.test(low)) lane = "jackets";
  else if (/\bshoe|sneaker\b/.test(low)) lane = "shoes";
  else if (/\bstussy\b/.test(low)) lane = "hoodies";

  const finds = rankFinds(items, {
    query: q,
    lane,
    limit: wantsMinimal || wantsCotton || lane === "tees" ? 12 : 8,
    cotton100Only: wantsCotton || wantsMinimal || lane === "tees",
    minimalistOnly: wantsMinimal,
  });

  const lines: string[] = [];
  lines.push(MELANI_STYLE.oneLiner);

  if (wantsMinimal || wantsCotton || lane === "tees") {
    lines.push("");
    lines.push(`${MELANI_STYLE.philosophy.title} — ${MELANI_STYLE.philosophy.note}`);
    lines.push("");
    lines.push("Everyday tee rules:");
    lines.push(
      `· Fabric: ${MELANI_STYLE.fabric.tees.require} only. Avoid ${MELANI_STYLE.fabric.tees.avoid.join(", ")}.`
    );
    lines.push(`· Fit: ${MELANI_STYLE.fit.tees}`);
    lines.push(`· Jeans formula: ${MELANI_STYLE.jeansPairing.formula}`);
    lines.push(`· Colors that win: ${MELANI_STYLE.jeansPairing.colorsThatWin.join(" · ")}`);
    lines.push(`· Your denim: ${MELANI_STYLE.jeansPairing.denim}`);
  }

  if (/\bgap|missing|need|closet\b/.test(low) || !q) {
    lines.push("");
    lines.push(
      `Closet: ${insight.owned} owned · ${insight.want} want · ` +
        Object.entries(insight.byLane)
          .map(([k, v]) => `${k} ${v}`)
          .join(" · ")
    );
    if (insight.gaps.length) {
      lines.push("Gaps:");
      for (const g of insight.gaps.slice(0, 4)) lines.push(`· ${g}`);
    }
    lines.push("Next buys:");
    for (const n of insight.nextBuys.slice(0, 4)) lines.push(`· ${n}`);
  }

  if (/\bcotton|fabric\b/.test(low) && lane !== "tees" && !wantsMinimal) {
    lines.push("");
    lines.push(
      `Fabric rule: sweats → ${MELANI_STYLE.fabric.sweatpants.prefer.join(", ")}. ` +
        `Avoid ${MELANI_STYLE.fabric.sweatpants.avoid.join(", ")}.`
    );
    lines.push(MELANI_STYLE.fabric.sweatpants.note);
  }

  if (/\bbrand|style|dna|taste\b/.test(low)) {
    lines.push("");
    lines.push("Brand lanes:");
    for (const b of STYLE_BRANDS) {
      lines.push(`· ${b.brand} (${b.lanes.join("/")}) — ${b.why}`);
    }
  }

  if (lane !== "all") {
    lines.push("");
    lines.push(`Shopping lane: ${lane}. Ranked to your DNA + closet.`);
  }

  if (finds.length) {
    lines.push("");
    lines.push("Top picks (Live web cards open Google Shopping — cotton-filtered):");
    finds.slice(0, 6).forEach((f, i) => {
      const price = f.price != null ? `$${f.price}` : "see site";
      const cotton = f.cotton100 ? " · 100% cotton" : "";
      lines.push(`${i + 1}. ${f.name} · ${price} · fit ${f.score}${cotton}`);
      if (f.why[0]) lines.push(`   ${f.why[0]}`);
      if (f.pairsWith) lines.push(`   Pairs with: ${f.pairsWith}`);
    });
  }

  lines.push("");
  lines.push(
    "Open a card to shop. On Live web: only buy if the product page says 100% cotton. Save winners to Want."
  );

  return { text: lines.join("\n"), finds, insight };
}

export function formatMoney(find: ShopFind): string | null {
  if (find.price == null) return null;
  // Wardrobe always displays $ (never €)
  return `$${find.price}`;
}
