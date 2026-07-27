/**
 * Melani Closet DNA — locked style truth for the Style Shopper.
 * Edit here when taste evolves; the engine reads only this + your closet.
 */

export type StyleLane =
  | "hoodies"
  | "tees"
  | "jeans"
  | "sweats"
  | "shoes"
  | "jackets"
  | "dresses"
  | "other";

export type BrandLane = {
  brand: string;
  lanes: StyleLane[];
  why: string;
  /** Official or best shop home */
  homeUrl: string;
  searchUrl: (q: string) => string;
};

/** Core brands Melani actually wears / covets */
export const STYLE_BRANDS: BrandLane[] = [
  {
    brand: "Edikted",
    lanes: ["jeans"],
    why:
      "Denim identity — Petite Raelynn baggy low-rise (owned: blue washed, indigo raw washed, denim black, white). NYC studded is Want.",
    homeUrl: "https://edikted.com/collections/jeans",
    searchUrl: (q) =>
      `https://edikted.com/search?q=${encodeURIComponent(q || "raelynn baggy jeans")}`,
  },
  {
    brand: "Uniqlo",
    lanes: ["sweats", "tees"],
    why: "Sweat comfort king + best blank 100% cotton crews for the jeans uniform.",
    homeUrl: "https://www.uniqlo.com/us/en/",
    searchUrl: (q) =>
      `https://www.uniqlo.com/us/en/search?q=${encodeURIComponent(q || "100% cotton crew neck t-shirt")}`,
  },
  {
    brand: "Stussy",
    lanes: ["hoodies", "tees"],
    why: "Hoodie staple (Ash Heather) + Basic Tee blacks/neutrals — clean logo, cotton first.",
    homeUrl: "https://www.stussy.com/",
    searchUrl: (q) =>
      `https://www.stussy.com/search?q=${encodeURIComponent(q || "basic tee")}`,
  },
  {
    brand: "Scuffers",
    lanes: ["hoodies"],
    why: "Hoodie brand love — tonal logo, washed colorways, street luxury.",
    homeUrl: "https://scuffers.com/",
    searchUrl: (q) =>
      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`Scuffers ${q || "hoodie"}`)}`,
  },
  {
    brand: "Fear of God Essentials",
    lanes: ["hoodies"],
    why: "Neutral oversized hoodie base — pairs with everything.",
    homeUrl: "https://fearofgod.com/collections/essentials",
    searchUrl: (q) =>
      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`Fear of God Essentials ${q || "hoodie"}`)}`,
  },
  {
    brand: "Cold Culture",
    lanes: ["hoodies"],
    why: "Color pop curved hoodies — blue hero already owned.",
    homeUrl: "https://coldculture.com/",
    searchUrl: (q) =>
      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`Cold Culture ${q || "hoodie"}`)}`,
  },
  {
    brand: "Anti Social Social Club",
    lanes: ["hoodies"],
    why: "Statement back graphics — resale / vibe pieces.",
    homeUrl: "https://www.antisocialsocialclub.com/",
    searchUrl: (q) =>
      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`Anti Social Social Club ${q || "hoodie"}`)}`,
  },
  // —— Minimalist tees (billionaire-simple: understated, cotton, jeans-ready) ——
  {
    brand: "Everlane",
    lanes: ["tees"],
    why: "Quiet luxury blanks — organic cotton, no logo scream, pairs with Edikted baggy.",
    homeUrl: "https://www.everlane.com/collections/womens-tees-and-tanks",
    searchUrl: (q) =>
      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`Everlane ${q || "organic cotton crew tee"} 100% cotton`)}`,
  },
  {
    brand: "COS",
    lanes: ["tees"],
    why: "Architectural minimal — clean cuts, cotton, looks expensive with jeans.",
    homeUrl: "https://www.cos.com/en-us/women/womenswear/t-shirts",
    searchUrl: (q) =>
      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`COS ${q || "cotton t-shirt"} 100% cotton`)}`,
  },
  {
    brand: "Arket",
    lanes: ["tees"],
    why: "Heavy cotton essentials — Scandinavian quiet, durable blanks.",
    homeUrl: "https://www.arket.com/en-us/women/clothing/t-shirts",
    searchUrl: (q) =>
      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`Arket ${q || "heavy cotton t-shirt"} 100% cotton`)}`,
  },
  {
    brand: "Buck Mason",
    lanes: ["tees"],
    why: "US slub cotton tees — soft hand, understated, billionaire-uniform energy.",
    homeUrl: "https://www.buckmason.com/collections/mens-tees",
    searchUrl: (q) =>
      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`Buck Mason ${q || "slub tee"} 100% cotton`)}`,
  },
];

export const MELANI_STYLE = {
  id: "melani-v2",
  title: "Melani Style DNA",
  oneLiner:
    "Edikted baggy denim · Uniqlo cotton · understated tops. Simple uniforms that save mental energy.",
  /** Quiet-luxury / decision-fatigue philosophy */
  philosophy: {
    title: "Simple uniform energy",
    note:
      "Billionaires wear simple, understated clothing to avoid decision fatigue, protect mental energy, and look work-focused. Your version: baggy Edikted jeans + 100% cotton minimalist tees + Uniqlo comfort.",
    rules: [
      "One silhouette, many neutrals — black, white, heather gray, navy, bone.",
      "No loud seasonal graphics on everyday tees (hoodies can flex).",
      "100% cotton tees only for the everyday stack — no poly performance shells.",
      "If it needs an outfit Instagram caption, skip it for the daily uniform.",
    ],
  },
  fit: {
    tops: "Baggy / oversized hoodies; boxy or relaxed tees — never tight fashion-crop.",
    tees: "Relaxed or boxy crew · midweight cotton · hits hip with baggy jeans.",
    bottomsJeans: "Baggy · low-rise · graphic OK (Edikted).",
    bottomsSweats: "Wide-leg or open-hem · soft · Uniqlo comfort first.",
  },
  fabric: {
    sweatpants: {
      prefer: ["cotton", "100% cotton", "cotton blend soft fleece"],
      avoid: ["scratchy poly shell", "shiny athletic poly"],
      note: "If it is not soft enough to live in all day, skip it.",
    },
    jeans: {
      prefer: ["cotton denim", "rigid or light stretch"],
      avoid: ["cheap plastic hand-feel"],
    },
    hoodies: {
      prefer: ["heavy fleece", "cotton blend fleece"],
      avoid: ["paper-thin blanks"],
    },
    tees: {
      prefer: ["100% cotton", "organic cotton", "heavy cotton jersey", "slub cotton"],
      avoid: ["polyester blend", "performance poly", "modal-only thin shells", "shiny poly"],
      require: "100% cotton",
      note: "Everyday tees must be 100% cotton. Check the care label / product fabric line before Want.",
    },
  },
  rules: [
    "Uniqlo owns sweats — comfort is non-negotiable; cotton preferred.",
    "Edikted owns jeans personality — baggy / washed / studded OK.",
    "Everyday tees: 100% cotton only · minimalist · pairs with baggy denim.",
    "Hoodie brands: Stussy, Scuffers, Essentials, Cold Culture, ASSC.",
    "Prefer product flats + real retail links when saving to Want.",
    "Do not push random fast-fashion that fights this DNA.",
    "Gaps first: if closet is missing tees or a second sweat color, surface that before random drops.",
  ],
  budgetHints: {
    jeans: { low: 45, high: 90, currency: "USD" },
    sweats: { low: 30, high: 60, currency: "USD" },
    hoodies: { low: 90, high: 160, currency: "USD" },
    tees: { low: 15, high: 55, currency: "USD" },
  },
  /** What a good tee must do with her jeans */
  jeansPairing: {
    denim: "Edikted Petite Raelynn baggy (black · blue washed · indigo · white)",
    formula: "Boxy/relaxed 100% cotton tee + baggy low-rise jeans + sneakers",
    colorsThatWin: ["black", "white", "heather gray", "navy", "bone", "washed black"],
  },
} as const;

export function brandsForLane(lane: StyleLane): BrandLane[] {
  return STYLE_BRANDS.filter((b) => b.lanes.includes(lane));
}
