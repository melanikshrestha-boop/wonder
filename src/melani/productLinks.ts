/**
 * Real product buy links for Melani hygiene routines.
 * Amazon URLs use short /dp/ASIN form (fewer “Continue shopping” walls).
 * Sephora preferred when Amazon blocks or has no clean page.
 */
export type ProductLink = {
  name: string;
  /** Primary shop URL (opens first) */
  url: string;
  store: "amazon" | "sephora" | "brand";
  /** Optional second store */
  altUrl?: string;
  altStore?: "amazon" | "sephora" | "brand";
  note?: string;
  /**
   * Typical US retail price (USD) for the usual size you’d buy.
   * Approximate — stores change sale prices; shown as “~$X” in the routine dropdown.
   */
  priceUsd?: number;
};

/** Format for UI: ~$19 */
export function formatProductPrice(priceUsd: number | undefined | null): string | null {
  if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  const n = Math.round(priceUsd);
  return `~$${n}`;
}

/**
 * Only use URLs that actually work on amazon.com (2025+).
 * Broken (do not use): /gp/aws/cart/add.html without AssociateTag → "Looking for Something?"
 * Working: /dp/ASIN product pages, /s?k= search, full OpenID sign-in, /gp/cart/view.html
 */
function amz(asin: string): string {
  // psc=1 selects the default offer so Add to Cart is ready on the product page
  return `https://www.amazon.com/dp/${asin}?th=1&psc=1`;
}

export function amazonSearchUrl(query: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(query.trim())}`;
}

/** Pull ASIN (product id) from an Amazon URL if present */
export function extractAsin(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:\/dp\/|\/gp\/product\/|\/product\/|\/ASIN\/)([A-Z0-9]{10})(?:[/?]|$)/i
  );
  return m ? m[1].toUpperCase() : null;
}

/** Product page URL for an ASIN (always a real page) */
export function amazonProductUrl(asin: string): string {
  return amz(asin);
}

/**
 * @deprecated Cart-add endpoint is often a 404 now. Kept as null so callers fall back to product pages.
 */
export function amazonCartAddUrl(_asins: string[]): string | null {
  return null;
}

export function amazonSingleCartUrl(asin: string): string | null {
  // Real working path: open product page (user taps Add to Cart on Amazon)
  return amazonProductUrl(asin);
}

/** Full OpenID sign-in (partial openid.return_to alone 404s) */
export const AMAZON_SIGNIN_URL =
  "https://www.amazon.com/ap/signin?" +
  [
    "openid.pape.max_auth_age=0",
    "openid.return_to=" +
      encodeURIComponent("https://www.amazon.com/?ref_=nav_signin"),
    "openid.identity=" +
      encodeURIComponent(
        "http://specs.openid.net/auth/2.0/identifier_select"
      ),
    "openid.assoc_handle=usflex",
    "openid.mode=checkid_setup",
    "openid.claimed_id=" +
      encodeURIComponent(
        "http://specs.openid.net/auth/2.0/identifier_select"
      ),
    "openid.ns=" + encodeURIComponent("http://specs.openid.net/auth/2.0"),
  ].join("&");

export const AMAZON_HOME_URL = "https://www.amazon.com/";
export const AMAZON_CART_VIEW_URL =
  "https://www.amazon.com/gp/cart/view.html?ref_=nav_cart";

const AMAZON_READY_KEY = "wonder-amazon-ready-v1";

/** "Ready" = you finished the login step in this browser (cookie session). */
export function isAmazonReady(): boolean {
  try {
    return localStorage.getItem(AMAZON_READY_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAmazonReady(ready: boolean) {
  try {
    localStorage.setItem(AMAZON_READY_KEY, ready ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function openAmazonLogin(): void {
  // Prefer real sign-in page; always a functioning Amazon URL
  window.open(AMAZON_SIGNIN_URL, "_blank", "noopener,noreferrer");
  setAmazonReady(true);
}

export function openAmazonCartView(): void {
  window.open(AMAZON_CART_VIEW_URL, "_blank", "noopener,noreferrer");
}

/** Only open URLs that are safe Amazon destinations (no dead cart endpoints). */
export function openAmazonUrl(url: string): void {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "amazon.com" && !host.endsWith(".amazon.com")) {
      // Non-Amazon (Sephora etc.) still ok via window.open for alt stores
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    // Block known dead paths
    if (u.pathname.includes("/gp/aws/cart/add")) {
      window.open(AMAZON_HOME_URL, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  } catch {
    window.open(AMAZON_HOME_URL, "_blank", "noopener,noreferrer");
  }
}

/**
 * Best shop URL for a restock title: product DP if we know ASIN, else Amazon search.
 * Never uses the broken multi-cart endpoint.
 */
export function amazonShopUrlForTitle(title: string): string {
  const link = resolveBuyLink(title);
  const asin =
    extractAsin(link.url) ||
    extractAsin(link.altUrl) ||
    null;
  if (asin) return amazonProductUrl(asin);
  if (link.store === "amazon" && link.url.includes("amazon.com")) {
    // Prefer search over broken paths
    if (link.url.includes("/s?") || link.url.includes("/dp/")) return link.url;
  }
  if (link.altStore === "amazon" && link.altUrl) {
    const a2 = extractAsin(link.altUrl);
    if (a2) return amazonProductUrl(a2);
    if (link.altUrl.includes("/s?") || link.altUrl.includes("/dp/"))
      return link.altUrl;
  }
  return amazonSearchUrl(title);
}

/**
 * Open product page(s) on Amazon so you can Add to Cart there.
 * Multiple items open with a short stagger (browsers block multi-popups otherwise).
 */
export function openAmazonProductsForTitles(
  titles: string[],
  opts?: { openCartAfter?: boolean }
): { opened: number; urls: string[] } {
  const urls = [
    ...new Set(titles.map((t) => amazonShopUrlForTitle(t)).filter(Boolean)),
  ];
  if (!urls.length) {
    openAmazonUrl(AMAZON_HOME_URL);
    return { opened: 0, urls: [] };
  }
  // First tab immediately (user gesture)
  openAmazonUrl(urls[0]);
  // Rest staggered so popup blocker doesn't kill them all
  urls.slice(1).forEach((url, i) => {
    window.setTimeout(() => openAmazonUrl(url), 450 * (i + 1));
  });
  if (opts?.openCartAfter) {
    window.setTimeout(
      () => openAmazonCartView(),
      450 * urls.length + 400
    );
  }
  return { opened: urls.length, urls };
}

/**
 * Keyed by exact step title in hygieneRoutines.ts
 * priceUsd = typical full-size US retail (Amazon / Sephora street) — approximate.
 */
export const PRODUCT_LINKS: Record<string, ProductLink> = {
  "La Roche-Posay Lipikar AP+ Gentle Foaming Cleansing Oil": {
    name: "La Roche-Posay Lipikar AP+ Gentle Foaming Cleansing Oil",
    store: "amazon",
    url: amz("B0C673PKK3"),
    altStore: "brand",
    altUrl:
      "https://www.laroche-posay.us/our-products/body-care/body-wash/lipikar-ap-gentle-foaming-cleansing-oil-3337875890238.html",
    priceUsd: 20,
  },
  "PanOxyl 10% Wash": {
    name: "PanOxyl 10% Benzoyl Peroxide Acne Foaming Wash",
    store: "amazon",
    url: amz("B081KL2QYJ"),
    priceUsd: 12,
  },
  "PanOxyl 10% Benzoyl Peroxide Acne Foaming Wash": {
    name: "PanOxyl 10% Benzoyl Peroxide Acne Foaming Wash",
    store: "amazon",
    url: amz("B081KL2QYJ"),
    priceUsd: 12,
  },
  "Soft Services Comfort Cleanse": {
    name: "Soft Services Comfort Cleanse",
    store: "sephora",
    url: "https://www.sephora.com/product/soft-services-comfort-cleanse-ultra-soothing-moisturizing-body-wash-P510357",
    altStore: "brand",
    altUrl: "https://softservices.com/products/comfort-cleanse",
    priceUsd: 38,
  },
  "Nécessaire The Body Serum": {
    name: "Nécessaire The Body Serum",
    store: "sephora",
    url: "https://www.sephora.com/product/necessaire-the-body-serum-with-hyaluronic-acid-P474847",
    altStore: "amazon",
    altUrl: amz("B087GZYVJR"),
    priceUsd: 50,
  },
  "La Roche-Posay Lipikar AP+M Triple Repair Body Cream": {
    name: "La Roche-Posay Lipikar AP+MAX Triple Repair Body Cream",
    store: "amazon",
    url: amz("B003QXZWYW"),
    altStore: "brand",
    altUrl:
      "https://www.laroche-posay.us/our-products/body-care/body-moisturizer/lipikar-ap-plus-triple-repair-moisturizing-cream-3337872413397.html",
    priceUsd: 20,
  },
  "Ingrown Hair Exfoliating Scrub": {
    name: "Soft Services Buffing Bar (ingrown / KP)",
    store: "sephora",
    url: "https://www.sephora.com/product/soft-services-buffing-bar-exfoliating-body-bar-for-kp-ingrown-hair-2-pack-P510346",
    altStore: "brand",
    altUrl: "https://softservices.com/products/buffing-bar",
    priceUsd: 28,
  },
  "L'Occitane Almond Shower Oil & Razor": {
    name: "L'Occitane Almond Shower Oil",
    store: "amazon",
    url: amz("B001G60EK8"),
    altStore: "brand",
    altUrl: "https://usa.loccitane.com/almond-shower-oil-16.9-fl-oz-P007819.htm",
    priceUsd: 28,
  },
  "The Ordinary Glycolic Acid 7% Exfoliating Solution": {
    name: "The Ordinary Glycolic Acid 7% Exfoliating Toner",
    store: "amazon",
    url: amz("B071914GGL"),
    altStore: "brand",
    altUrl:
      "https://theordinary.com/en-us/glycolic-acid-7-exfoliating-toner-100425.html",
    priceUsd: 9,
  },
  "La Roche-Posay Toleriane Hydrating Gentle Cleanser": {
    name: "La Roche-Posay Toleriane Hydrating Gentle Cleanser",
    store: "amazon",
    url: amz("B01N7T7JKJ"),
    altStore: "brand",
    altUrl:
      "https://www.laroche-posay.us/our-products/face/face-wash/toleriane-hydrating-gentle-facial-cleanser-tolerianehydratinggentlefacialcleanser.html",
    priceUsd: 15,
  },
  "Anua Rice 70 Glow Milky Toner": {
    name: "Anua Rice 70 Glow Milky Toner",
    store: "amazon",
    url: amz("B0D54F8XYK"),
    priceUsd: 18,
  },
  "Anua 10+ Azelaic Acid Serum": {
    name: "Anua Azelaic Acid 10 Serum",
    store: "amazon",
    url: amz("B0DG1DQ2S7"),
    priceUsd: 18,
  },
  // Restock list / display-name aliases → same product page
  "Anua Azelaic Acid 10 Serum": {
    name: "Anua Azelaic Acid 10 Serum",
    store: "amazon",
    url: amz("B0DG1DQ2S7"),
    priceUsd: 18,
  },
  "Anua Azelaic Acid 10 Hyaluron Redness Soothing Serum": {
    name: "Anua Azelaic Acid 10 Serum",
    store: "amazon",
    url: amz("B0DG1DQ2S7"),
    priceUsd: 18,
  },
  "Centella Ampoule": {
    name: "SKIN1004 Madagascar Centella Ampoule",
    store: "amazon",
    url: amz("B06Y15D1LH"),
    priceUsd: 15,
  },
  "Centella Brightening Serum": {
    name: "SKIN1004 Centella Tone Brightening Capsule Ampoule",
    store: "amazon",
    url: amz("B09TLFY4GP"),
    priceUsd: 18,
  },
  "Ole Henriksen Banana Bright+ Vitamin C Eye Crème": {
    name: "OLEHENRIKSEN Banana Bright+ Vitamin C Eye Crème",
    store: "sephora",
    url: "https://www.sephora.com/product/banana-bright-vitamin-c-eye-cre-me-P500613",
    priceUsd: 42,
  },
  "La Roche-Posay SPF 50": {
    name: "La Roche-Posay Anthelios Melt-In Milk SPF 60",
    store: "amazon",
    url: amz("B002CML1VG"),
    altStore: "brand",
    altUrl:
      "https://www.laroche-posay.us/our-products/sun/face-body-sunscreen/anthelios-melt-in-milk-sunscreen-spf-60-3337872410990.html",
    priceUsd: 30,
  },
  "Tatcha Lip Balm": {
    name: "Tatcha The Kissu Lip Mask",
    store: "sephora",
    url: "https://www.sephora.com/product/tatcha-the-kissu-lip-mask-P453225",
    altStore: "amazon",
    altUrl: amz("B08D3FXF64"),
    priceUsd: 32,
  },
  "Anua Oil Cleanser": {
    name: "Anua Heartleaf Pore Control Cleansing Oil",
    store: "amazon",
    url: amz("B0BN2PX8V3"),
    priceUsd: 16,
  },
  "Anua Heartleaf Pore Deep Cleanse": {
    name: "Anua Heartleaf Quercetinol Pore Deep Cleansing Foam",
    store: "amazon",
    url: amz("B0BVV8BNYJ"),
    priceUsd: 14,
  },
  "Anua Oil Cleanser & Heartleaf Pore Deep Cleanse": {
    name: "Anua Double Cleansing Duo",
    store: "amazon",
    url: amz("B0CMPSYW3M"),
    priceUsd: 28,
  },
  "Anua Niacinamide 10 + TXA 4 Serum": {
    name: "Anua Niacinamide 10 + TXA 4 Serum",
    store: "amazon",
    url: amz("B0CLLV2T1P"),
    priceUsd: 18,
  },
  "Tatcha Luminous Deep Hydration Firming Eye Serum": {
    name: "Tatcha Luminous Deep Hydration Firming Eye Serum",
    store: "amazon",
    url: amz("B019IG2IWE"),
    altStore: "brand",
    altUrl: "https://www.tatcha.com/products/luminous-deep-hydration-firming-eye-serum",
    priceUsd: 68,
  },
  "Tatcha Eye Serum": {
    name: "Tatcha Luminous Deep Hydration Firming Eye Serum",
    store: "amazon",
    url: amz("B019IG2IWE"),
    altStore: "brand",
    altUrl: "https://www.tatcha.com/products/luminous-deep-hydration-firming-eye-serum",
    priceUsd: 68,
  },
  "La Roche-Posay Toleriane Double Repair Face Moisturizer": {
    name: "La Roche-Posay Toleriane Double Repair Face Moisturizer",
    store: "amazon",
    url: amz("B01N9SPQHQ"),
    altStore: "brand",
    altUrl:
      "https://www.laroche-posay.us/our-products/face/face-moisturizer/toleriane-double-repair-face-moisturizer-3337875546041.html",
    priceUsd: 22,
  },
  "CeraVe Resurfacing Retinol Serum (Teal Bottle)": {
    name: "CeraVe Resurfacing Retinol Serum",
    store: "amazon",
    url: amz("B07VWSN95S"),
    priceUsd: 20,
  },
  "MediCube pore mask": {
    name: "medicube Zero Pore Pad 2.0",
    store: "amazon",
    url: amz("B09V7Z4TJG"),
    priceUsd: 20,
  },
  "Turmeric Mask or Collagen Mask": {
    name: "Turmeric face mask",
    store: "amazon",
    url: "https://www.amazon.com/s?k=turmeric+face+mask",
    note: "No brand set in guide — Amazon search.",
    priceUsd: 12,
  },
  "Turmeric Mask or MediCube Pink Mask": {
    name: "medicube / turmeric mask",
    store: "amazon",
    url: "https://www.amazon.com/s?k=medicube+pink+mask",
    priceUsd: 18,
  },
  "Lash/Brow Serum": {
    name: "Lash brow serum",
    store: "amazon",
    url: "https://www.amazon.com/s?k=lash+brow+growth+serum",
    note: "Brand not specified in guide.",
    priceUsd: 20,
  },
  "Fable & Mane MahaMane Smooth Scalp & Hair Oil": {
    name: "Fable & Mane MahaMane Smooth Scalp & Hair Oil",
    store: "sephora",
    url: "https://www.sephora.com/brand/fable-mane",
    altStore: "brand",
    altUrl: "https://fableandmane.com/",
    priceUsd: 38,
  },
  "The Ordinary Natural Moisturizing Factors + HA for Scalp": {
    name: "The Ordinary NMF + HA for Scalp",
    store: "amazon",
    url: amz("B09Y2BYG2H"),
    altStore: "brand",
    altUrl:
      "https://theordinary.com/en-us/natural-moisturizing-factors-ha-for-scalp-hair-scalp-treatment-100422.html",
    priceUsd: 12,
  },
  "Kérastase Spécifique Bain Divalent Balancing Shampoo": {
    name: "Kérastase Specifique Bain Divalent Shampoo",
    store: "amazon",
    url: amz("B09FTGJT22"),
    altStore: "brand",
    altUrl:
      "https://www.kerastase-usa.com/collections/specifique/bain-divalent-balancing-shampoo.html",
    priceUsd: 42,
  },
  "Redken Frizz Dismiss Conditioner": {
    name: "Redken Frizz Dismiss Conditioner",
    store: "amazon",
    url: amz("B00UJZRO50"),
    priceUsd: 28,
  },
  "Redken Acidic Bonding Concentrate Leave-In Treatment": {
    name: "Redken Acidic Bonding Concentrate Leave-In",
    store: "amazon",
    url: amz("B08P67N41H"),
    priceUsd: 32,
  },
  "Kérastase Genesis Serum Fortifiant": {
    name: "Kérastase Genesis Serum Fortifiant",
    store: "amazon",
    url: amz("B086TPQJTT"),
    altStore: "sephora",
    altUrl: "https://www.sephora.com/product/kerastase-genesis-scalp-serum-P454999",
    priceUsd: 55,
  },
  "Kérastase Elixir Ultime Hair Oil": {
    name: "Kérastase Elixir Ultime Hair Oil",
    store: "sephora",
    url: "https://www.sephora.com/product/kerastase-elixir-ultime-refillable-hydrating-hair-oil-P511702",
    altStore: "amazon",
    altUrl: amz("B0D2LV7DHF"),
    priceUsd: 55,
  },
  "Wide-Tooth Shower Comb": {
    name: "Wide-tooth shower comb",
    store: "amazon",
    url: "https://www.amazon.com/s?k=wide+tooth+shower+comb",
    priceUsd: 8,
  },
  "Microfibre towel": {
    name: "Microfiber hair towel",
    store: "amazon",
    url: "https://www.amazon.com/s?k=microfiber+hair+towel",
    priceUsd: 12,
  },
};

export function linkForProduct(title: string): ProductLink | null {
  return PRODUCT_LINKS[title] || null;
}

/** Always returns a shoppable link: known product map, or Amazon search for the name */
export function resolveBuyLink(title: string): ProductLink {
  const exact = PRODUCT_LINKS[title];
  if (exact) return exact;
  const low = title.trim().toLowerCase();
  if (!low) {
    return {
      name: title,
      store: "amazon",
      url: "https://www.amazon.com/",
    };
  }
  // Fuzzy: same name ignoring case, or known key contains typed text
  for (const [key, link] of Object.entries(PRODUCT_LINKS)) {
    if (key.toLowerCase() === low) return link;
    if (link.name.toLowerCase() === low) return link;
  }
  for (const [key, link] of Object.entries(PRODUCT_LINKS)) {
    if (key.toLowerCase().includes(low) || low.includes(key.toLowerCase())) {
      return link;
    }
    if (
      link.name.toLowerCase().includes(low) ||
      low.includes(link.name.toLowerCase())
    ) {
      return link;
    }
  }
  // New product — Amazon search finds the product page for that name
  const q = encodeURIComponent(title.trim());
  return {
    name: title.trim(),
    store: "amazon",
    url: `https://www.amazon.com/s?k=${q}`,
  };
}

/** Oral care stack (titles must match hygieneRoutines ORAL_CARE_SECTIONS) */
Object.assign(PRODUCT_LINKS, {
  "Waterpik Water Flosser": {
    name: "Waterpik Water Flosser",
    store: "brand" as const,
    url: "https://www.waterpik.com/products/dental-water-flosser/",
    note: "Brand product line — pick your model on Waterpik.",
  },
  "Oral-B Electric Toothbrush": {
    name: "Oral-B Electric Toothbrush",
    store: "amazon" as const,
    url: "https://amzn.to/4aTQBCd",
  },
  "Oral-B Soft Toothbrush Heads": {
    name: "Oral-B Soft Toothbrush Heads",
    store: "amazon" as const,
    url: "https://amzn.to/4di9EYy",
  },
  Mouthwash: {
    name: "Mouthwash",
    store: "amazon" as const,
    url: "https://amzn.to/4dcxRQh",
  },
  "Sensodyne Toothpaste": {
    name: "Sensodyne Toothpaste",
    store: "amazon" as const,
    url: "https://www.amazon.com/s?k=Sensodyne+toothpaste",
    note: "Leftover fluoride supply — not the long-term pick.",
  },
  "Fluoride-Free Toothpaste": {
    name: "Fluoride-Free Toothpaste",
    store: "amazon" as const,
    url: "https://amzn.to/44p7Ith",
  },
  "Dr. Tung's Smart Floss": {
    name: "Dr. Tung's Smart Floss",
    store: "amazon" as const,
    url: "https://amzn.to/3JDBUHt",
  },
  "Dr. Tung's Tongue Scraper": {
    name: "Dr. Tung's Tongue Scraper",
    store: "amazon" as const,
    url: "https://amzn.to/4be2UJB",
  },
  "SomnoDent Bruxism Device": {
    name: "SomnoDent Bruxism Device",
    store: "brand" as const,
    url: "https://somnomed.com",
    note: "Provider-fitted device — brand site for SomnoMed / SomnoDent.",
  },
});

/** Best Amazon ASIN for a product title (primary url or alt url) */
export function resolveAmazonAsin(title: string): string | null {
  const link = resolveBuyLink(title);
  return (
    extractAsin(link.url) ||
    extractAsin(link.altUrl) ||
    null
  );
}

/** Open a real product page (or search). Never the dead cart-add endpoint. */
export function openAmazonForProduct(title: string): void {
  openAmazonUrl(amazonShopUrlForTitle(title));
}

export function storeLabel(store: ProductLink["store"]): string {
  if (store === "amazon") return "Amazon";
  if (store === "sephora") return "Sephora";
  return "Brand site";
}
