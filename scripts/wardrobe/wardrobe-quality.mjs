/**
 * Quality-first wardrobe rules for Melani:
 * material truth, category-aware polyester, baggy fit, hero silhouette discipline,
 * capsule gaps, fabric audit, tailor briefs.
 */

export const QUALITY_SCHEMA_NOTE = "stylePolicy + fabric scoring";

const NATURAL = new Set(["cotton", "wool", "linen", "silk", "cashmere", "leather", "suede", "hemp", "tencel", "lyocell", "modal", "viscose", "rayon", "alpaca", "merino"]);
const SYNTHETIC_POLY = new Set(["polyester", "poly", "pet", "recycled polyester", "rpet"]);
const STRETCH = new Set(["elastane", "spandex", "lycra"]);

export function defaultStylePolicy() {
  return {
    aesthetic: "minimal-quality",
    polyesterByCategory: {
      default: { maxPercent: 0 },
      jeans: { maxPercent: 0, allowElastanePercent: 3 },
      trousers: { maxPercent: 0, allowElastanePercent: 3 },
      sweatpants: { maxPercent: 55, preferBlend: true },
      shorts: { maxPercent: 40, preferBlend: true },
      tops: { maxPercent: 0 },
      sweaters: { maxPercent: 5 },
      hoodies: { maxPercent: 60, preferBlend: true },
      outerwear: { maxPercent: 40 },
      dresses: { maxPercent: 0 },
      shoes: { maxPercent: null },
      accessories: { maxPercent: null },
    },
    preferNaturalFibers: true,
    maxStatementPiecesPerLook: 1,
    preferNeutralPalette: true,
    qualityFloor: 70,
    fitPreference: {
      tops: "baggy",
      bottoms: "comfort",
      tightAllowed: false,
    },
    cities: ["los-angeles", "san-francisco", "new-york"],
    defaultCity: "los-angeles",
    maxDuplicatesPerSilhouette: 2,
    heroSilhouettes: [
      {
        key: "uniqlo-sweatpant-E479620",
        brand: "Uniqlo",
        name: "Sweatpants",
        productRef: "E479620",
        matchSource: "uniqlo-sweatpants|E479620",
        colorsOwned: ["gray", "grey", "black"],
        allowOneMore: "gray",
      },
    ],
  };
}

export function defaultSizeProfile() {
  return {
    topsLabel: null,
    bottomsLabel: null,
    shoesLabel: null,
    notes: "",
    measurements: {
      waistIn: null,
      hipIn: null,
      inseamIn: null,
      preferredRise: null,
    },
    updatedAt: null,
  };
}

export function defaultTailorDirectory() {
  return {
    "los-angeles": [],
    "san-francisco": [],
    "new-york": [],
  };
}

export function mergeStylePolicy(raw) {
  const base = defaultStylePolicy();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    polyesterByCategory: { ...base.polyesterByCategory, ...(raw.polyesterByCategory || {}) },
    fitPreference: { ...base.fitPreference, ...(raw.fitPreference || {}) },
    cities: Array.isArray(raw.cities) && raw.cities.length ? raw.cities.map(String) : base.cities,
    heroSilhouettes: Array.isArray(raw.heroSilhouettes) && raw.heroSilhouettes.length
      ? raw.heroSilhouettes
      : base.heroSilhouettes,
  };
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalizeFiberName(name) {
  const raw = String(name || "").toLowerCase().trim();
  if (!raw) return "";
  if (raw === "poly" || raw.includes("polyester")) return "polyester";
  if (raw.includes("elastane") || raw.includes("spandex") || raw.includes("lycra")) return "elastane";
  if (raw.includes("cotton")) return "cotton";
  if (raw.includes("wool") || raw.includes("merino")) return "wool";
  if (raw.includes("linen")) return "linen";
  if (raw.includes("silk")) return "silk";
  if (raw.includes("cashmere")) return "cashmere";
  if (raw.includes("leather")) return "leather";
  if (raw.includes("nylon")) return "nylon";
  if (raw.includes("acrylic")) return "acrylic";
  return raw;
}

/** Parse "98% cotton 2% elastane" or "100% cotton" or fiber objects. */
export function parseFabricText(input) {
  if (input && typeof input === "object" && Array.isArray(input.fibers)) {
    const fibers = input.fibers
      .map((fiber) => ({
        name: normalizeFiberName(fiber.name || fiber.fiber),
        percent: Number.isFinite(Number(fiber.percent)) ? Number(fiber.percent) : null,
      }))
      .filter((fiber) => fiber.name);
    return {
      fibers,
      notes: String(input.notes || "").slice(0, 240) || null,
      unknown: fibers.length === 0,
      source: "structured",
    };
  }

  const text = String(input || "").trim();
  if (!text) return { fibers: [], notes: null, unknown: true, source: "empty" };

  const fibers = [];
  const percentFirst = [...text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%\s*([a-z][a-z\s/-]{1,40})/gi)];
  for (const match of percentFirst) {
    fibers.push({ name: normalizeFiberName(match[2]), percent: Number(match[1]) });
  }
  if (!fibers.length) {
    const nameFirst = [...text.matchAll(/([a-z][a-z\s/-]{1,40}?)\s+(\d{1,3}(?:\.\d+)?)\s*%/gi)];
    for (const match of nameFirst) {
      fibers.push({ name: normalizeFiberName(match[1]), percent: Number(match[2]) });
    }
  }
  if (!fibers.length && /\b100\s*%?\s*(cotton|wool|linen|silk|leather)\b/i.test(text)) {
    const only = text.match(/\b(cotton|wool|linen|silk|leather)\b/i);
    if (only) fibers.push({ name: normalizeFiberName(only[1]), percent: 100 });
  }
  if (!fibers.length && /\bno\s+poly(ester)?\b/i.test(text)) {
    return { fibers: [{ name: "cotton", percent: null }], notes: text.slice(0, 240), unknown: true, source: "hint-no-poly" };
  }

  const cleaned = fibers
    .map((fiber) => ({ name: fiber.name, percent: Number.isFinite(fiber.percent) ? fiber.percent : null }))
    .filter((fiber) => fiber.name);

  return {
    fibers: cleaned,
    notes: text.slice(0, 240),
    unknown: cleaned.length === 0,
    source: "text",
  };
}

export function resolveFabricCategory(item = {}) {
  const text = `${item.name || ""} ${(item.tags || []).join(" ")} ${item.part || ""} ${item.brand || ""}`.toLowerCase();
  if (/\b(jean|denim|selvedge)\b/.test(text)) return "jeans";
  if (/\b(sweat\s*pants?|sweatpants?|joggers?)\b/.test(text)) return "sweatpants";
  if (/\bshorts?\b/.test(text)) return "shorts";
  if (/\b(hoodie|hooded)\b/.test(text)) return "hoodies";
  if (/\b(sweater|jumper|knit|cardigan)\b/.test(text)) return "sweaters";
  if (/\b(jacket|coat|puffer|parka|shell|blazer|outer)\b/.test(text) || item.part === "wholebody_up") return "outerwear";
  if (/\b(dress|gown)\b/.test(text) || item.part === "dresses") return "dresses";
  if (/\b(trouser|chino|slacks|pants?)\b/.test(text) || item.part === "lowerbody") return "trousers";
  if (item.part === "shoes" || /\b(shoe|sneaker|boot|loafer)\b/.test(text)) return "shoes";
  if (item.part === "accessories_up") return "accessories";
  if (item.part === "upperbody" || /\b(tee|t-shirt|shirt|top|tank)\b/.test(text)) return "tops";
  return "default";
}

function fiberShare(fibers, predicate) {
  const known = fibers.filter((fiber) => Number.isFinite(fiber.percent));
  if (!known.length) return null;
  const total = known.reduce((sum, fiber) => sum + fiber.percent, 0) || 100;
  const share = known.filter((fiber) => predicate(fiber.name)).reduce((sum, fiber) => sum + fiber.percent, 0);
  return (share / total) * 100;
}

export function getCategoryPolyRule(category, policy = defaultStylePolicy()) {
  const rules = policy.polyesterByCategory || defaultStylePolicy().polyesterByCategory;
  return rules[category] || rules.default || { maxPercent: 0 };
}

/**
 * Score material quality 0–100 under category-aware policy.
 * Hoodies: cotton-majority + some poly can beat stiff 100% cotton.
 */
export function scoreMaterialQuality(fabricInput, item = {}, policyInput) {
  const policy = mergeStylePolicy(policyInput);
  const fabric = parseFabricText(fabricInput || item.fabric || item.composition || "");
  const category = resolveFabricCategory(item);
  const rule = getCategoryPolyRule(category, policy);
  const fibers = fabric.fibers || [];

  if (fabric.unknown || !fibers.length) {
    return {
      score: 55,
      grade: "?",
      unknown: true,
      category,
      hasPolyester: false,
      polyesterPercent: null,
      naturalShare: null,
      elastanePercent: null,
      veto: false,
      flags: ["fabric-unknown"],
      reasons: ["Composition not logged — quality is incomplete, not assumed organic."],
    };
  }

  const poly = fiberShare(fibers, (name) => SYNTHETIC_POLY.has(name) || name === "polyester");
  const natural = fiberShare(fibers, (name) => NATURAL.has(name));
  const elastane = fiberShare(fibers, (name) => STRETCH.has(name)) || 0;
  const hasPolyester = (poly || 0) > 0.5;
  const maxPoly = rule.maxPercent;
  const flags = [];
  const reasons = [];
  let veto = false;
  let score = 72;

  if (natural != null) score += (natural / 100) * 22;
  if (hasPolyester && maxPoly === 0) {
    veto = true;
    score = Math.min(score, 28);
    flags.push("poly-banned-category");
    reasons.push(`${category} rule bans polyester; this piece has ~${Math.round(poly)}% poly.`);
  } else if (hasPolyester && maxPoly != null && poly > maxPoly) {
    veto = true;
    score = Math.min(score, 34);
    flags.push("poly-over-cap");
    reasons.push(`${category} allows up to ${maxPoly}% poly; this has ~${Math.round(poly)}%.`);
  } else if (hasPolyester && rule.preferBlend && category === "hoodies") {
    if (poly >= 8 && poly <= 55 && (natural == null || natural >= 40)) {
      score += 10;
      flags.push("hoodie-blend-preferred");
      reasons.push("Hoodie cotton/poly blend fits your soft-hand rule (100% cotton hoodies can feel off).");
    } else if (poly >= 90) {
      score -= 18;
      flags.push("cheap-poly-fleece");
      reasons.push("Mostly polyester fleece — allowed for hoodies but lower quality hand.");
    }
  } else if (hasPolyester && category === "sweatpants" && poly <= 55) {
    score += 4;
    reasons.push("Sweatpant blend is fine for comfort.");
  } else if (!hasPolyester && category === "hoodies" && natural >= 95) {
    score -= 6;
    flags.push("all-natural-hoodie");
    reasons.push("100% natural hoodie is not auto-preferred — blends often feel better.");
  }

  const elastaneCap = rule.allowElastanePercent ?? 5;
  if (elastane > elastaneCap + 0.5 && ["jeans", "trousers"].includes(category)) {
    score -= 8;
    flags.push("stretch-high");
    reasons.push(`Elastane ~${Math.round(elastane)}% is high for ${category} (cap ~${elastaneCap}%).`);
  } else if (elastane > 0 && elastane <= elastaneCap && category === "jeans") {
    reasons.push(`Small elastane (~${Math.round(elastane)}%) is OK for denim stretch.`);
  }

  if (!hasPolyester && natural >= 95 && ["jeans", "tops", "trousers", "dresses"].includes(category)) {
    score += 8;
    reasons.push("Natural-fiber composition matches quality bar for this category.");
  }

  score = Math.round(clamp(score));
  const grade = fabric.unknown ? "?" : score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  if (!reasons.length) reasons.push(`Material score ${score} for ${category}.`);

  return {
    score,
    grade,
    unknown: false,
    category,
    hasPolyester,
    polyesterPercent: poly == null ? null : Number(poly.toFixed(1)),
    naturalShare: natural == null ? null : Number(natural.toFixed(1)),
    elastanePercent: Number(elastane.toFixed(1)),
    veto,
    flags,
    reasons,
    fibers,
  };
}

export function detectFit(item = {}, textExtra = "") {
  const text = `${item.name || ""} ${(item.tags || []).join(" ")} ${item.fit || ""} ${textExtra}`.toLowerCase();
  if (item.fit) return String(item.fit).toLowerCase();
  if (/\b(oversized|baggy|loose|relaxed)\b/.test(text)) return "baggy";
  if (/\b(slim|skinny|tight|fitted|bodycon)\b/.test(text)) return "tight";
  if (/\b(regular|classic)\b/.test(text)) return "regular";
  return "unknown";
}

function heroMatches(hero, text) {
  if (hero.productRef && text.toLowerCase().includes(String(hero.productRef).toLowerCase())) return true;
  if (hero.brand && hero.name) {
    const brand = new RegExp(hero.brand, "i");
    const name = new RegExp(String(hero.name).replace(/\s+/g, "\\s*"), "i");
    if (brand.test(text) && name.test(text)) return true;
  }
  // Uniqlo sweatpants / E479620
  if (/\buniqlo\b/i.test(text) && /\b(sweat\s*pants?|sweatpants?|joggers?)\b/i.test(text)) return true;
  if (/\bE479620\b/i.test(text)) return true;
  return false;
}

export function matchHeroSilhouette(item, policy = defaultStylePolicy()) {
  const text = `${item.name || ""} ${item.brand || ""} ${item.productRef || ""} ${(item.tags || []).join(" ")}`;
  for (const hero of policy.heroSilhouettes || []) {
    if (heroMatches(hero, text)) return hero;
  }
  return null;
}

export function countHeroColors(library, hero) {
  const owned = [];
  for (const item of library || []) {
    if (!matchHeroSilhouette(item, { heroSilhouettes: [hero] })) continue;
    const colorText = `${item.name || ""} ${(item.tags || []).join(" ")} ${item.colorName || ""}`.toLowerCase();
    if (/\b(grey|gray)\b/.test(colorText)) owned.push("gray");
    else if (/\bblack\b/.test(colorText)) owned.push("black");
    else owned.push("other");
  }
  return owned;
}

/**
 * Purchase gate: material, fit, hero clone discipline, gap leverage.
 */
export function evaluatePurchaseQuality(library, baseResult, request = {}, policyInput) {
  const policy = mergeStylePolicy(policyInput);
  const candidate = {
    name: request.name || baseResult?.candidate?.name || "Candidate",
    part: request.part || "upperbody",
    tags: request.tags || [],
    brand: request.brand,
    productRef: request.productRef,
    fit: request.fit,
    fabric: request.fabric || request.composition || request.name,
  };
  const material = scoreMaterialQuality(candidate.fabric, candidate, policy);
  const fit = detectFit(candidate, String(request.name || ""));
  const reasons = [...(baseResult?.reasons || [])];
  let verdict = baseResult?.verdict || "consider";
  let score = Number(baseResult?.score || 50);
  const flags = [...material.flags];

  if (material.veto) {
    verdict = "reject-material";
    score = Math.min(score, 22);
    reasons.unshift(...material.reasons);
  } else {
    reasons.push(...material.reasons.filter((line) => !reasons.includes(line)));
    if (material.score >= 80) score = Math.min(100, score + 8);
    if (material.score < 50) score = Math.max(0, score - 12);
  }

  const kindish = resolveFabricCategory(candidate);
  if (!policy.fitPreference?.tightAllowed && fit === "tight" && ["tops", "dresses"].includes(kindish)) {
    verdict = "reject-material";
    score = Math.min(score, 20);
    flags.push("tight-blocked");
    reasons.unshift("Tight tops are off until you flip baggy-only off — body-honest fit rule.");
  }

  const hero = matchHeroSilhouette(candidate, policy);
  if (hero) {
    const colors = countHeroColors(library, hero);
    const grayCount = colors.filter((c) => c === "gray").length;
    const blackCount = colors.filter((c) => c === "black").length;
    const total = colors.length;
    const wantGray = /\b(grey|gray)\b/i.test(String(request.name || ""));
    if (total >= 2 && !(hero.allowOneMore === "gray" && wantGray && grayCount < 2)) {
      if (total >= 2 && !wantGray) {
        verdict = "skip-redundant";
        score = Math.min(score, 35);
        flags.push("hero-clone");
        reasons.unshift(
          `You already own this Uniqlo sweatpant hero silhouette (${colors.join(", ") || "multiple"}). Don't collect infinite pairs.`,
        );
      } else if (wantGray && grayCount >= 2) {
        verdict = "skip-redundant";
        score = Math.min(score, 30);
        reasons.unshift("You already have enough gray Uniqlo sweatpants for this silhouette.");
      }
    } else if (wantGray && grayCount === 1 && blackCount >= 1) {
      verdict = "consider";
      score = Math.min(score, 62);
      flags.push("hero-one-more-gray");
      reasons.unshift(
        "Second gray Uniqlo sweatpant is the only clone allowed — yes only if the current gray is always in laundry / worn raw.",
      );
    } else if (total === 0) {
      reasons.push("Hero comfort bottom — high leverage if you lack sweatpants.");
      score = Math.min(100, score + 12);
      if (verdict === "consider" || verdict === "low-leverage") verdict = "buy";
    }
  }

  if (kindish === "shorts") {
    const hasComfyShorts = (library || []).some((item) => resolveFabricCategory(item) === "shorts");
    if (!hasComfyShorts && !material.veto) {
      score = Math.min(100, score + 18);
      reasons.unshift("Comfort shorts are a Tier-A gap — you said you don't have anything comfortable.");
      if (["consider", "low-leverage"].includes(verdict)) verdict = "buy";
    }
  }

  if (kindish === "jeans" && /\bedikted\b/i.test(String(request.name || ""))) {
    const repairing = (library || []).filter((item) => {
      const op = request._ops?.[item.id] || {};
      return op.status === "repair" && resolveFabricCategory(item) === "jeans";
    });
    if (repairing.length) {
      verdict = "repair-first";
      score = Math.min(score, 40);
      reasons.unshift("Repair existing denim (tailor queue) before buying more Edikted clones.");
    }
  }

  if (score >= 76 && verdict === "consider") verdict = "buy";
  if (score >= 76 && verdict === "high-leverage") verdict = "buy";
  if (verdict === "high-leverage") verdict = "buy";
  if (verdict === "low-leverage" && !material.veto) verdict = "consider";

  return {
    material,
    fit,
    flags,
    verdict,
    score: Math.round(clamp(score)),
    reasons: [...new Set(reasons)],
  };
}

export function buildCapsuleGaps(library = [], state = {}, policyInput) {
  const policy = mergeStylePolicy(policyInput || state.stylePolicy);
  const profiles = library.map((item) => ({
    item,
    category: resolveFabricCategory(item),
    text: `${item.name || ""} ${(item.tags || []).join(" ")}`.toLowerCase(),
  }));
  const has = (pred) => profiles.some(pred);
  const gaps = [];

  const hasSweat = has((p) => p.category === "sweatpants");
  const hasShorts = has((p) => p.category === "shorts");
  const hasBaggyTop = has((p) => p.category === "tops" && detectFit(p.item) !== "tight");
  const hasHoodie = has((p) => p.category === "hoodies");
  const hasShoes = has((p) => p.item.part === "shoes" || p.category === "shoes");
  const hasOuter = has((p) => p.category === "outerwear");

  if (!hasShorts) {
    gaps.push({
      id: "comfy-shorts",
      tier: "A",
      priority: 100,
      title: "Comfort shorts",
      spec: "Relaxed comfort shorts with a soft hand; pairs with baggy tee; not micro fashion shorts. Poly blend OK if soft.",
      why: "You said you don't have anything comfortable for shorts.",
    });
  }

  if (!hasSweat) {
    gaps.push({
      id: "hero-sweatpant",
      tier: "A",
      priority: 95,
      title: "Hero sweatpants (Uniqlo-class)",
      spec: "Uniqlo E479620-class comfort sweatpant; gray or black; buy once silhouette.",
      why: "Comfort bottoms are your daily uniform.",
    });
  } else {
    const hero = policy.heroSilhouettes?.[0];
    if (hero) {
      const colors = countHeroColors(library, hero);
      const gray = colors.filter((c) => c === "gray").length;
      if (gray === 1 && colors.includes("black")) {
        gaps.push({
          id: "optional-second-gray-sweat",
          tier: "A",
          priority: 55,
          title: "Optional second gray Uniqlo sweatpant",
          spec: "Only if current gray is always laundry / your only comfy option. Not a third color.",
          why: "Clone discipline — max one extra gray for the hero silhouette.",
        });
      }
    }
  }

  if (!hasBaggyTop) {
    gaps.push({
      id: "baggy-tee",
      tier: "A",
      priority: 88,
      title: "Baggy everyday tee",
      spec: "Oversized/baggy cotton tee; neutrals; no tight fit until tightAllowed.",
      why: "Fit rule: baggy tops only for now.",
    });
  }

  if (!hasHoodie) {
    gaps.push({
      id: "soft-hoodie",
      tier: "A",
      priority: 90,
      title: "Soft hoodie",
      spec: "Cotton-majority + some poly OK for hand; minimal color; SF/NY weight when needed.",
      why: "Hoodies are your #1 category.",
    });
  }

  if (!hasShoes) {
    gaps.push({
      id: "daily-shoes",
      tier: "A",
      priority: 70,
      title: "Daily shoes",
      spec: "One clean daily sneaker already likely in closet — catalog it.",
      why: "Outfits need shoes to finish.",
    });
  }

  if (!hasOuter) {
    gaps.push({
      id: "city-outer",
      tier: "B",
      priority: 40,
      title: "City outer layer",
      spec: "SF/NYC layer; puffer OK (you own North Face 550 — log it).",
      why: "Multi-city packing.",
    });
  }

  const repairCount = Object.values(state.items || {}).filter((op) => op?.status === "repair").length;
  if (repairCount > 0) {
    gaps.push({
      id: "repair-queue",
      tier: "A",
      priority: 92,
      title: "Clear tailor / repair queue first",
      spec: `${repairCount} piece(s) marked repair — brief a trusted tailor before new denim.`,
      why: "Addicted pants failed on tailor damage; repair before replace.",
    });
  }

  gaps.sort((a, b) => b.priority - a.priority);
  const next = gaps.find((gap) => gap.tier === "A") || gaps[0] || null;
  return {
    generatedAt: new Date().toISOString(),
    gaps,
    nextPurchase: next,
    policyAesthetic: policy.aesthetic,
  };
}

export function buildFabricAudit(library = [], state = {}, policyInput) {
  const policy = mergeStylePolicy(policyInput || state.stylePolicy);
  const rows = library.map((item) => {
    const material = scoreMaterialQuality(item.fabric || item.composition, item, policy);
    return {
      id: item.id,
      name: item.name,
      grade: material.grade,
      score: material.score,
      category: material.category,
      unknown: material.unknown,
      hasPolyester: material.hasPolyester,
      veto: material.veto,
      reasons: material.reasons,
    };
  });
  const unknown = rows.filter((row) => row.unknown);
  const polyFlags = rows.filter((row) => row.veto || (row.hasPolyester && row.category === "jeans"));
  const naturalReady = rows.filter((row) => !row.unknown && row.score >= 70);
  return {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    unknownCount: unknown.length,
    polyVetoCount: polyFlags.length,
    qualityReadyCount: naturalReady.length,
    unknown: unknown.slice(0, 12),
    polyFlags: polyFlags.slice(0, 12),
    tip: unknown.length
      ? `Log fabric on your top ${Math.min(5, unknown.length)} worn pieces so quality ranking becomes real.`
      : "Fabric coverage looks solid for quality ranking.",
  };
}

export function buildTailorBrief(item, state = {}, sizeProfile = defaultSizeProfile()) {
  const op = state.items?.[item.id] || {};
  const size = item.size || sizeProfile.bottomsLabel || sizeProfile.topsLabel || "size not logged";
  const measurements = sizeProfile.measurements || {};
  const lines = [
    `TAILOR BRIEF — ${item.name || "Garment"}`,
    `Category: ${resolveFabricCategory(item)} · Color: ${item.color || "n/a"}`,
    `Label size on file: ${size}`,
    measurements.waistIn ? `Waist: ${measurements.waistIn} in` : null,
    measurements.hipIn ? `Hip: ${measurements.hipIn} in` : null,
    measurements.inseamIn ? `Inseam: ${measurements.inseamIn} in` : null,
    measurements.preferredRise ? `Rise: ${measurements.preferredRise}` : null,
    `Status: ${op.status || "clean"}`,
    item.qualityNotes || op.alterationNote || "Alteration: (describe hem / take-in / repair)",
    "Do not over-serge delicate denim. Preserve original grain. Confirm fit with wearer before final stitch.",
    "History note: prior tailor damage on other pants — prefer careful denim specialist.",
  ].filter(Boolean);
  return {
    itemId: item.id,
    name: item.name,
    brief: lines.join("\n"),
    sizeProfile,
  };
}

export function qualityGradeBadge(score, unknown) {
  if (unknown) return "?";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

export function minimalLookScore(items, policy = defaultStylePolicy()) {
  const statementWords = /\b(statement|sequin|metallic|neon|graphic|embellished|sparkle|bold)\b/i;
  let statement = 0;
  let neutrals = 0;
  for (const item of items) {
    const text = `${item.name || ""} ${(item.tags || []).join(" ")}`;
    if (statementWords.test(text) || item.traits?.statement) statement += 1;
    if (item.colorProfile?.neutral || item.traits?.colorProfile?.neutral) neutrals += 1;
  }
  const maxStatement = policy.maxStatementPiecesPerLook ?? 1;
  let score = 78;
  if (statement <= maxStatement) score += 14;
  else score -= (statement - maxStatement) * 22;
  if (policy.preferNeutralPalette && neutrals >= Math.ceil(items.length * 0.5)) score += 8;
  if (statement >= 3) score -= 20;
  return clamp(score);
}

export function qualityLookScore(items) {
  if (!items.length) return 50;
  const scores = items.map((item) => Number(item.traits?.materialQuality ?? item.materialQuality ?? 55));
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function fitLookPenalty(items, policy = defaultStylePolicy()) {
  if (policy.fitPreference?.tightAllowed) return 0;
  const tightTops = items.filter((item) => {
    const kind = item.kind || item.traits?.kind;
    const fit = item.traits?.fit || detectFit(item);
    return (kind === "top" || kind === "dress") && fit === "tight";
  });
  return tightTops.length ? 28 : 0;
}
