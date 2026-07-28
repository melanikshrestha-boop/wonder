/**
 * Taste knowledge base — encode *why* outfits work, not numeric style scores.
 *
 * Philosophy (system truth):
 *   Good style is an emergent property of proportion, color harmony, texture,
 *   tailoring, and appropriateness — not price, brand, or trend.
 *   Prioritize natural fibers, comfort, freedom of movement, and longevity
 *   over hype or logos. Recommend intentional looks that are never overdressed.
 *   Favor timeless combinations over trendy ones.
 *
 * Items get objective attributes. The engine reasons from those facts.
 */

import { detectFit, parseFabricText, resolveFabricCategory } from "./wardrobe-quality.mjs";

export const TASTE_PHILOSOPHY = [
  "Good style is an emergent property of proportion, color harmony, texture, tailoring, and appropriateness — not price, brand, or trend.",
  "Prioritize natural fibers, comfort, freedom of movement, and longevity over hype or logos.",
  "Recommend outfits that make the wearer look intentional without appearing overdressed. Favor timeless combinations over trendy ones.",
];

/** Color knowledge: descriptors, not scores. */
export const COLOR_KB = {
  white: { families: ["neutral"], traits: ["high-contrast", "clean", "bright", "crisp"] },
  cream: { families: ["warm-neutral"], traits: ["soft", "luxurious", "warm", "muted"] },
  ivory: { families: ["warm-neutral"], traits: ["soft", "warm", "clean"] },
  beige: { families: ["warm-neutral", "earth"], traits: ["soft", "muted", "warm"] },
  camel: { families: ["warm-neutral", "earth"], traits: ["warm", "luxurious", "muted"] },
  brown: { families: ["earth"], traits: ["warm", "earthy", "grounded"] },
  wheat: { families: ["earth"], traits: ["warm", "earthy", "workwear"] },
  olive: { families: ["earth"], traits: ["earthy", "muted", "military"] },
  charcoal: { families: ["dark-neutral"], traits: ["muted", "dark", "minimal"] },
  black: { families: ["dark-neutral"], traits: ["high-contrast", "minimal", "sharp"] },
  gray: { families: ["neutral"], traits: ["muted", "soft", "minimal"] },
  grey: { families: ["neutral"], traits: ["muted", "soft", "minimal"] },
  heather: { families: ["neutral"], traits: ["muted", "soft", "textured"] },
  navy: { families: ["cool-neutral"], traits: ["cool", "classic", "muted"] },
  blue: { families: ["cool"], traits: ["casual", "denim-friendly"] },
  indigo: { families: ["cool", "denim"], traits: ["casual", "timeless", "textured"] },
  lightblue: { families: ["cool"], traits: ["soft", "casual"] },
  burgundy: { families: ["warm"], traits: ["rich", "muted"] },
  red: { families: ["warm"], traits: ["high-contrast", "statement"] },
  green: { families: ["earth"], traits: ["earthy", "casual"] },
};

/** Aesthetic / vibe tags that inspo and pieces can share. */
export const VIBE_TAGS = [
  "minimal",
  "scandinavian",
  "japanese",
  "relaxed",
  "quiet-luxury",
  "streetwear",
  "athleisure",
  "monochrome",
  "natural",
  "earth-tones",
  "soft-tailoring",
  "1990s",
  "clean",
  "technical",
  "workwear",
  "baggy",
  "uniform",
  "west-coast",
  "casual",
];

const JERSEY = /\b(jersey|kit|football|soccer|futkulture|brasil|brazil desert|premium kit)\b/i;
const HOODIE = /\b(hoodie|hooded|fleece hoodie|crewneck sweatshirt)\b/i;
const TEE = /\b(tee|t-shirt|tshirt|basic tee)\b/i;
const JEANS = /\b(jean|jeans|denim|raelynn|roman)\b/i;
const SWEATS = /\b(sweatpant|sweatpants|sweats|joggers?)\b/i;
const BOOT = /\b(boot|boots|timberland|martens|doc)\b/i;
const SNEAKER = /\b(sneaker|dunk|blazer|samba|spezial|jordan|force|hoka|balance|530|bondi)\b/i;
const HEAVY = /\b(fleece|heavy|heavyweight|puffer|wool|denim|leather|suede)\b/i;
const LIGHT = /\b(mesh|linen|lightweight|air|thin)\b/i;
const SHINE = /\b(satin|silk|metallic|gloss|patent|nylon shell)\b/i;
const MATTE = /\b(matte|cotton|fleece|suede|wool|canvas|french terry)\b/i;
const WIDE = /\b(wide|baggy|relaxed|oversized|boxy|open hem|curved)\b/i;
const LOW_RISE = /\b(low rise|low-rise|petite roman)\b/i;
const CROPPED = /\b(crop|cropped)\b/i;
const STRUCTURED = /\b(blazer|tailored|structured|puffer)\b/i;

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function blobOf(item) {
  return `${item.name || ""} ${item.brand || ""} ${(item.tags || []).join(" ")} ${item.part || ""}`.toLowerCase();
}

function cleanHex(value, fallback = "#777777") {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
}

function hexToRgb(hex) {
  const h = cleanHex(hex).slice(1);
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (!delta) return { h: 0, s: 0, l: lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue =
    max === R
      ? ((G - B) / delta) % 6
      : max === G
        ? (B - R) / delta + 2
        : (R - G) / delta + 4;
  hue = ((hue * 60) + 360) % 360;
  return { h: hue, s: saturation, l: lightness };
}

/**
 * Map hex + name into a color knowledge entry (descriptors, not scores).
 */
export function describeColor(hex, nameHint = "") {
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  const name = String(nameHint || "").toLowerCase();
  let key = "gray";
  if (l > 0.9 && s < 0.12) key = name.includes("cream") || name.includes("ivory") || name.includes("vanilla") || name.includes("birch") || name.includes("wheat") ? "cream" : "white";
  else if (l < 0.12) key = "black";
  else if (s < 0.12 && l < 0.35) key = "charcoal";
  else if (s < 0.14) key = l > 0.55 ? "gray" : "charcoal";
  else if (h >= 15 && h < 50 && l > 0.35 && l < 0.75) key = name.includes("wheat") || name.includes("timber") ? "wheat" : "brown";
  else if (h >= 50 && h < 90 && s < 0.45) key = "olive";
  else if (h >= 200 && h < 250 && l < 0.35) key = "navy";
  else if (h >= 190 && h < 250) key = l > 0.55 ? "lightblue" : "blue";
  else if (h >= 250 && h < 290) key = "blue";
  else if (h >= 330 || h < 15) key = l < 0.4 ? "burgundy" : "red";
  else if (h >= 90 && h < 160) key = "green";
  else if (name.includes("indigo") || name.includes("denim") || name.includes("raelynn") || name.includes("washed")) key = "indigo";
  else if (name.includes("heather") || name.includes("ash")) key = "heather";
  else if (name.includes("burgundy")) key = "burgundy";
  else if (name.includes("cream") || name.includes("vanilla")) key = "cream";

  // name overrides for known product language
  if (/\bwhite\b/.test(name) && l > 0.75) key = name.includes("jean") || name.includes("cream") ? "cream" : "white";
  if (/\bblack\b/.test(name) && l < 0.25) key = "black";
  if (/\bnavy\b/.test(name)) key = "navy";
  if (/\bindigo\b|\bdenim\b|\bwashed\b/.test(name) && h >= 180 && h < 260) key = "indigo";
  if (/\bwheat\b|\btimberland\b/.test(name)) key = "wheat";
  if (/\bheather|ash heather|light heather\b/.test(name)) key = "heather";
  if (/\bburgundy\b/.test(name)) key = "burgundy";
  if (/\bgray|grey\b/.test(name) && s < 0.2) key = "gray";

  const entry = COLOR_KB[key] || COLOR_KB.gray;
  return {
    key,
    hex: cleanHex(hex),
    h,
    s,
    l,
    families: [...entry.families],
    traits: [...entry.traits],
    neutral: s < 0.16 || l < 0.13 || l > 0.88 || entry.families.includes("neutral") || entry.families.includes("warm-neutral") || entry.families.includes("dark-neutral") || entry.families.includes("cool-neutral"),
  };
}

function inferFabricFacts(item, category) {
  const parsed = parseFabricText(item.fabric || item.composition || "");
  const fibers = parsed.fibers || [];
  const primary = fibers[0]?.name || null;
  const blob = blobOf(item);
  let fabric = primary;
  if (!fabric) {
    if (JEANS.test(blob) || category === "jeans") fabric = "denim-cotton";
    else if (HOODIE.test(blob) || category === "hoodies") fabric = "cotton-poly-fleece";
    else if (SWEATS.test(blob) || category === "sweatpants") fabric = "cotton-poly-fleece";
    else if (TEE.test(blob)) fabric = "cotton";
    else if (BOOT.test(blob)) fabric = "leather";
    else if (SNEAKER.test(blob)) fabric = "leather-synthetic";
    else if (/\bpuffer\b/i.test(blob)) fabric = "nylon-down";
    else fabric = "unknown";
  }

  let weight = "medium";
  if (HEAVY.test(blob) || fabric.includes("denim") || fabric.includes("leather") || fabric.includes("fleece") || fabric.includes("wool")) weight = "heavy";
  if (LIGHT.test(blob) || fabric.includes("mesh") || fabric.includes("linen")) weight = "light";
  if (TEE.test(blob) && !HOODIE.test(blob)) weight = "light";
  if (SNEAKER.test(blob)) weight = "medium";
  if (BOOT.test(blob)) weight = "heavy";

  let texture = "matte";
  if (SHINE.test(blob)) texture = "sheen";
  else if (MATTE.test(blob) || fabric.includes("cotton") || fabric.includes("fleece") || fabric.includes("suede") || fabric.includes("denim")) texture = "matte";
  else if (fabric.includes("leather") && !/\bsuede\b/i.test(blob)) texture = "smooth";
  else if (/\bmesh|knit|terry\b/i.test(blob)) texture = "knit";

  let drape = "structured";
  if (SWEATS.test(blob) || HOODIE.test(blob) || fabric.includes("fleece")) drape = "soft";
  if (JEANS.test(blob) || fabric.includes("denim") || fabric.includes("leather")) drape = "stiff";
  if (TEE.test(blob)) drape = "soft";
  if (/\bpuffer\b/i.test(blob)) drape = "structured";

  let sheen = texture === "sheen" ? "high" : texture === "smooth" ? "low" : "none";

  let stretch = "low";
  if (fibers.some((f) => f.name === "elastane" || f.name === "spandex")) stretch = "medium";
  if (SWEATS.test(blob) || HOODIE.test(blob)) stretch = "medium";
  if (/\bstretch\b/i.test(blob)) stretch = "high";

  const naturalShare = fibers.length
    ? fibers.filter((f) => ["cotton", "wool", "linen", "silk", "leather", "suede", "cashmere", "hemp", "tencel", "lyocell", "modal", "viscose", "rayon", "merino"].includes(f.name))
      .reduce((s, f) => s + (Number(f.percent) || 0), 0)
    : fabric.includes("cotton") || fabric.includes("denim") || fabric.includes("leather") || fabric.includes("wool")
      ? 70
      : 0;

  return {
    fabric,
    fibers,
    weight,
    texture,
    drape,
    sheen,
    stretch,
    naturalShare,
    breathability: fabric.includes("cotton") || fabric.includes("linen") || fabric.includes("mesh") ? "good" : fabric.includes("fleece") ? "medium" : "unknown",
    movement: stretch === "high" || SWEATS.test(blob) || HOODIE.test(blob) ? "unrestricted" : stretch === "medium" ? "easy" : "structured",
  };
}

function inferSilhouette(item, category, fit) {
  const blob = blobOf(item);
  const kind = item.part === "shoes" || category === "shoes"
    ? "shoes"
    : item.part === "lowerbody" || category === "jeans" || category === "sweatpants"
      ? "bottom"
      : item.part === "wholebody_up" || category === "outerwear"
        ? "outer"
        : "top";

  let fitLabel = fit && fit !== "unknown" ? fit : WIDE.test(blob) ? "relaxed" : "regular";
  if (HOODIE.test(blob) || /\bboxy\b/i.test(blob)) fitLabel = fitLabel === "tight" ? "tight" : "oversized";
  if (JEANS.test(blob) && WIDE.test(blob)) fitLabel = "baggy";
  if (SWEATS.test(blob) && WIDE.test(blob)) fitLabel = "wide";

  const silhouette = {
    fit: fitLabel,
    length: CROPPED.test(blob) ? "cropped" : kind === "top" && HOODIE.test(blob) ? "hip" : kind === "bottom" ? "full" : "regular",
    waist: kind === "bottom" ? (LOW_RISE.test(blob) ? "low" : "mid") : null,
    leg: kind === "bottom" ? (WIDE.test(blob) || SWEATS.test(blob) || JEANS.test(blob) ? "wide" : "straight") : null,
    shoulder: kind === "top" && (HOODIE.test(blob) || fitLabel === "oversized" || fitLabel === "baggy" || fitLabel === "boxy") ? "dropped" : kind === "top" ? "set-in" : null,
    volume: "medium",
    structure: STRUCTURED.test(blob) ? "structured" : HOODIE.test(blob) || SWEATS.test(blob) || TEE.test(blob) ? "soft" : "medium",
  };

  if (silhouette.fit === "oversized" || silhouette.fit === "baggy" || silhouette.fit === "wide" || silhouette.fit === "boxy") {
    silhouette.volume = "high";
  }
  if (silhouette.fit === "tight" || silhouette.fit === "slim") silhouette.volume = "low";
  if (kind === "shoes") {
    silhouette.volume = BOOT.test(blob) ? "high" : "low";
    silhouette.structure = "structured";
    silhouette.fit = "clean";
  }
  return silhouette;
}

function inferVibes(item, color, fabricFacts, silhouette) {
  const blob = blobOf(item);
  const vibes = new Set();
  if (color.neutral || color.families.includes("dark-neutral") || color.families.includes("warm-neutral")) {
    vibes.add("minimal");
    vibes.add("clean");
  }
  if (color.families.includes("earth") || color.key === "wheat" || color.key === "olive" || color.key === "cream") {
    vibes.add("earth-tones");
    vibes.add("natural");
  }
  if (silhouette.volume === "high" || silhouette.fit === "baggy" || silhouette.fit === "oversized" || silhouette.fit === "wide") {
    vibes.add("relaxed");
    vibes.add("baggy");
  }
  if (HOODIE.test(blob) || SWEATS.test(blob) || SNEAKER.test(blob)) vibes.add("streetwear");
  if (HOODIE.test(blob) && color.neutral) vibes.add("quiet-luxury");
  if (SWEATS.test(blob) || /\bhoka|bondi\b/i.test(blob)) vibes.add("athleisure");
  if (JEANS.test(blob) && silhouette.volume === "high") {
    vibes.add("1990s");
    vibes.add("west-coast");
  }
  if (BOOT.test(blob) || /\btimberland|workwear\b/i.test(blob)) vibes.add("workwear");
  if (fabricFacts.naturalShare >= 80 && color.neutral) vibes.add("quiet-luxury");
  if (JERSEY.test(blob)) {
    vibes.add("streetwear");
    vibes.delete("quiet-luxury");
    vibes.delete("minimal");
  }
  if (color.families.includes("dark-neutral") && color.families.includes("neutral") === false && fabricFacts.texture === "matte") {
    vibes.add("monochrome");
  }
  if ([color.key].some((k) => ["black", "gray", "charcoal", "white", "cream", "heather"].includes(k))) {
    vibes.add("monochrome");
  }
  vibes.add("casual");
  if (HOODIE.test(blob) && JEANS.test(blobOf({ name: "" }))) {
    /* no-op — pair level */
  }
  // Brand DNA → uniform
  if (/\b(stussy|scuffers|essentials|fear of god|cold culture|edikted|uniqlo)\b/i.test(blob) && !JERSEY.test(blob)) {
    vibes.add("uniform");
    vibes.add("west-coast");
  }
  return [...vibes];
}

function inferComfort(fabricFacts, silhouette, item) {
  const blob = blobOf(item);
  return {
    fabric: fabricFacts.fabric,
    breathability: fabricFacts.breathability,
    stretch: fabricFacts.stretch,
    weight: fabricFacts.weight,
    movement: fabricFacts.movement,
    temperature: fabricFacts.weight === "heavy" ? "warm" : fabricFacts.weight === "light" ? "cool" : "balanced",
    scratchiness: fabricFacts.fabric.includes("wool") && !/\bmerino\b/i.test(blob) ? "possible" : "none",
    requiresLayering: fabricFacts.weight === "light" && item.part === "upperbody",
    unrestricted: fabricFacts.movement === "unrestricted" || silhouette.volume === "high",
  };
}

function inferTailoring(item, silhouette) {
  const blob = blobOf(item);
  const notes = item.tailoring || item.alterations || {};
  return {
    perfect: Boolean(notes.perfect),
    hemmed: Boolean(notes.hemmed),
    waistAltered: Boolean(notes.waistAltered),
    tooLong: Boolean(notes.tooLong) || /\btoo long|needs hem\b/i.test(blob),
    needsTailoring: Boolean(notes.needsTailoring) || Boolean(notes.tooLong),
    rise: silhouette.waist,
    fit: silhouette.fit,
  };
}

/**
 * Build full taste knowledge for one wardrobe item (objective attributes).
 */
export function buildTasteKnowledge(item = {}, policyFit = null) {
  const category = resolveFabricCategory(item);
  const fit = policyFit || detectFit(item);
  const color = describeColor(item.color || item.secondaryColor || "#777777", `${item.name || ""} ${item.brand || ""}`);
  const fabricFacts = inferFabricFacts(item, category);
  const silhouette = inferSilhouette(item, category, fit);
  const vibes = inferVibes(item, color, fabricFacts, silhouette);
  const comfort = inferComfort(fabricFacts, silhouette, item);
  const tailoring = inferTailoring(item, silhouette);
  const blob = blobOf(item);

  const isBoot = BOOT.test(blob);
  const isSneaker =
    item.part === "shoes" || category === "shoes"
      ? !isBoot && (SNEAKER.test(blob) || !isBoot)
      : SNEAKER.test(blob);
  const role = {
    isJersey: JERSEY.test(blob),
    isHoodie: HOODIE.test(blob) || category === "hoodies",
    isTee: TEE.test(blob) && !HOODIE.test(blob) && !JERSEY.test(blob),
    isJeans: JEANS.test(blob) || category === "jeans",
    isSweats: SWEATS.test(blob) || category === "sweatpants",
    isBoot,
    // default non-boot footwear to sneaker language (clean casual base)
    isSneaker: item.part === "shoes" || category === "shoes" ? !isBoot : isSneaker,
    isStatement: JERSEY.test(blob) || /\b(graphic|statement|sequin|neon|embellished)\b/i.test(blob),
  };

  return {
    color,
    fabric: fabricFacts,
    silhouette,
    vibes,
    comfort,
    tailoring,
    role,
    category,
  };
}

function volumeLabel(item) {
  return item.taste?.silhouette?.volume || "medium";
}

function isBlueFamily(item) {
  return ["blue", "indigo", "lightblue", "navy"].includes(item?.taste?.color?.key);
}

function isBlueDenim(item) {
  return isBlueFamily(item) && Boolean(item?.taste?.role?.isJeans);
}

function colorPairReason(a, b) {
  if (!a?.taste?.color || !b?.taste?.color) return null;
  const ca = a.taste.color;
  const cb = b.taste.color;
  const sharedFamily = ca.families.find((f) => cb.families.includes(f));
  const bothWarm =
    (ca.families.includes("warm-neutral") || ca.families.includes("earth") || ca.traits.includes("warm")) &&
    (cb.families.includes("warm-neutral") || cb.families.includes("earth") || cb.traits.includes("warm"));
  const bothMuted = ca.traits.includes("muted") && cb.traits.includes("muted");
  const bothNeutral = ca.neutral && cb.neutral;
  const highContrast =
    (ca.traits.includes("high-contrast") || ca.key === "white" || ca.key === "black") &&
    (cb.traits.includes("high-contrast") || cb.key === "white" || cb.key === "black") &&
    ca.key !== cb.key;
  const lowSep =
    Math.abs(ca.l - cb.l) < 0.12 &&
    Math.abs(ca.h - cb.h) < 40 &&
    !bothNeutral &&
    ca.key !== "black" &&
    cb.key !== "black";

  if (bothWarm && bothMuted) {
    return {
      kind: "color",
      good: true,
      text: `${cap(ca.key)} + ${cap(cb.key)} works because both are warm and muted — low-contrast harmony, not a color fight.`,
    };
  }
  if (highContrast || (ca.key === "white" && cb.key === "black") || (ca.key === "black" && cb.key === "white") || (ca.key === "white" && cb.key === "charcoal") || (ca.key === "charcoal" && cb.key === "white")) {
    return {
      kind: "color",
      good: true,
      text: `${cap(ca.key)} + ${cap(cb.key)} is high contrast: minimal, crisp, intentional.`,
    };
  }
  if (bothNeutral) {
    return {
      kind: "color",
      good: true,
      text: `Neutral stack (${ca.key} + ${cb.key}) — quiet, reusable, decision-fatigue proof.`,
    };
  }
  if (sharedFamily) {
    return {
      kind: "color",
      good: true,
      text: `${cap(ca.key)} and ${cap(cb.key)} share a ${sharedFamily.replace(/-/g, " ")} family, so they read as one palette.`,
    };
  }
  if (lowSep && ca.texture !== cb.texture) {
    return {
      kind: "color",
      good: true,
      text: `${cap(ca.key)} + ${cap(cb.key)} sit close in value — texture has to carry the separation.`,
    };
  }
  if (lowSep) {
    return {
      kind: "color",
      good: false,
      text: `${cap(ca.key)} + ${cap(cb.key)} has low separation. Without texture contrast it can look muddy.`,
    };
  }
  if (ca.key === "black" && cb.key === "navy") {
    return {
      kind: "color",
      good: false,
      text: "Black + navy is low separation — needs clear texture differences or it muddies.",
    };
  }
  return null;
}

function texturePairReason(a, b) {
  const ta = a.taste?.fabric;
  const tb = b.taste?.fabric;
  if (!ta || !tb) return null;
  if (ta.texture !== tb.texture || ta.weight !== tb.weight || ta.drape !== tb.drape) {
    const sameColorFamily =
      a.taste.color?.neutral && b.taste.color?.neutral && Math.abs(a.taste.color.l - b.taste.color.l) < 0.2;
    if (sameColorFamily) {
      return {
        kind: "texture",
        good: true,
        text: `Same-family neutrals, different hand (${ta.texture}/${ta.weight} vs ${tb.texture}/${tb.weight}) — that's how monochrome looks rich instead of pajama.`,
      };
    }
    return {
      kind: "texture",
      good: true,
      text: `Texture contrast: ${ta.fabric} (${ta.texture}, ${ta.weight}) against ${tb.fabric} (${tb.texture}, ${tb.weight}).`,
    };
  }
  if (ta.texture === tb.texture && ta.weight === tb.weight && ta.fabric.includes("poly") && tb.fabric.includes("poly")) {
    return {
      kind: "texture",
      good: false,
      text: "Matching poly-on-poly with the same weight reads as loungewear, not an outfit.",
    };
  }
  if (ta.texture === tb.texture && ta.drape === "soft" && tb.drape === "soft" && ta.weight === tb.weight) {
    return {
      kind: "texture",
      good: false,
      text: "Same soft texture top and bottom collapses into one blob — need weight or structure contrast.",
    };
  }
  return null;
}

function silhouetteReason(top, bottom, shoes) {
  const reasons = [];
  if (!top || !bottom) return reasons;
  const tv = volumeLabel(top);
  const bv = volumeLabel(bottom);
  const tFit = top.taste?.silhouette?.fit;
  const bFit = bottom.taste?.silhouette?.fit;
  const bLeg = bottom.taste?.silhouette?.leg;

  if (tv === "high" && bv === "high") {
    reasons.push({
      kind: "silhouette",
      good: false,
      weight: 18,
      text: `Wide/oversized top + wide bottom is double volume. It can work if the top is cleaner/shorter, but right now both pieces push bulk — balance with a cleaner shoe or crop the visual weight.`,
    });
  }
  if ((tFit === "oversized" || tFit === "baggy" || tFit === "boxy") && (bLeg === "wide" || bFit === "baggy" || bFit === "wide")) {
    // still allow DNA hoodie+baggy jeans as intentional uniform with note
    if (top.taste?.role?.isHoodie && bottom.taste?.role?.isJeans) {
      reasons.push({
        kind: "silhouette",
        good: true,
        weight: 14,
        text: "Oversized hoodie + wide denim is a deliberate volume stack — west-coast uniform. Keep footwear clean so the silhouette doesn't swamp.",
      });
    }
  }
  if (tv === "high" && bv !== "high") {
    reasons.push({
      kind: "silhouette",
      good: true,
      weight: 12,
      text: "Volume on top, calmer bottom — proportion reads intentional.",
    });
  }
  if (tv !== "high" && bv === "high") {
    reasons.push({
      kind: "silhouette",
      good: true,
      weight: 14,
      text: "Relaxed wide bottom under a quieter top — classic proportion (mass below, control above).",
    });
  }
  if (top.taste?.role?.isTee && bottom.taste?.role?.isJeans) {
    reasons.push({
      kind: "silhouette",
      good: true,
      weight: 12,
      text: "Quiet tee + baggy denim — low decision fatigue, high readability.",
    });
  }
  if (shoes?.taste?.role?.isBoot && (bottom.taste?.role?.isJeans || bv === "high")) {
    reasons.push({
      kind: "silhouette",
      good: true,
      weight: 8,
      text: "Boots + wide bottom add structure at the base — workwear edge without formalizing the look.",
    });
  } else if (shoes?.taste?.role?.isSneaker && bv === "high") {
    reasons.push({
      kind: "silhouette",
      good: true,
      weight: 6,
      text: "Clean sneakers under wide legs finish the silhouette without adding dressiness.",
    });
  }
  return reasons;
}

function hardRules(top, bottom, shoes, mode) {
  const reasons = [];
  const strict = mode === "everyday" || mode === "build" || mode === "stream";
  if (top?.taste?.role?.isJersey && bottom?.taste?.role?.isSweats) {
    reasons.push({
      kind: "rule",
      good: false,
      weight: 55,
      text: "Football kit + sweatpants is not an outfit formula — it reads costume lounge, not intentional everyday.",
    });
  }
  if (strict && top?.taste?.role?.isJersey) {
    reasons.push({
      kind: "rule",
      good: false,
      weight: 36,
      text: "Jersey energy is content/out. Everyday uniform wants hoodie or basic tee with denim.",
    });
  }
  if (strict && top?.taste?.role?.isJersey && !bottom?.taste?.role?.isJeans) {
    reasons.push({
      kind: "rule",
      good: false,
      weight: 18,
      text: "Kit without denim looks unfinished for day wear.",
    });
  }
  const statements = [top, bottom].filter((i) => i?.taste?.role?.isStatement).length;
  if (strict && statements >= 2) {
    reasons.push({
      kind: "rule",
      good: false,
      weight: 20,
      text: "Two statement pieces fight for focus — one focal point only.",
    });
  }

  // Blue is a useful base, not a complete outfit recipe. A blue hoodie over
  // blue denim needs a deliberate tonal match; adding a blue-accent sneaker
  // turns the whole look into three near-but-not-equal blues. That is the
  // exact "random closet dump" failure the daily editor must keep out.
  if (top && bottom && isBlueFamily(top) && isBlueDenim(bottom) && !top.taste?.role?.isJeans) {
    reasons.push({
      kind: "color-rule",
      good: false,
      weight: 42,
      text: "Blue top + blue denim is too close without being a deliberate matching set. Break the column with cream, grey, black, burgundy, or an earth tone.",
    });
  }
  if (top && bottom && shoes && isBlueFamily(top) && isBlueDenim(bottom) && isBlueFamily(shoes)) {
    reasons.push({
      kind: "color-rule",
      good: false,
      weight: 64,
      text: "Three competing blues (top, denim, and sneaker accent) fight instead of forming a palette. Keep the shoe neutral or make one blue piece the only focal point.",
    });
  }
  return reasons;
}

function dnaFormula(top, bottom, shoes) {
  const reasons = [];
  if (top?.taste?.role?.isHoodie && bottom?.taste?.role?.isJeans) {
    reasons.push({
      kind: "formula",
      good: true,
      weight: 20,
      text: "Hoodie + baggy denim — the core Melani uniform (relaxed, intentional, not overdressed).",
    });
  }
  if (top?.taste?.role?.isTee && bottom?.taste?.role?.isJeans) {
    reasons.push({
      kind: "formula",
      good: true,
      weight: 18,
      text: "Basic tee + baggy jeans — timeless, proportion-first, zero hype required.",
    });
  }
  if (top?.taste?.role?.isHoodie && bottom?.taste?.role?.isSweats && !top?.taste?.role?.isJersey) {
    reasons.push({
      kind: "formula",
      good: true,
      weight: 8,
      text: "Hoodie + wide sweats is lounge-valid — softer than denim, keep textures from matching into pajamas.",
    });
  }
  if (shoes?.taste?.role?.isBoot) {
    reasons.push({
      kind: "formula",
      good: true,
      weight: 5,
      text: "Boots anchor the base — structured, intentional, not athleisure-default.",
    });
  } else if (shoes?.taste?.role?.isSneaker) {
    reasons.push({
      kind: "formula",
      good: true,
      weight: 5,
      text: "Clean sneakers keep the look casual without dressing it up.",
    });
  }
  return reasons;
}

function vibeOverlap(items, inspoVibes = []) {
  if (!inspoVibes?.length) return null;
  const itemVibes = new Set(items.flatMap((i) => i.taste?.vibes || []));
  const hits = inspoVibes.filter((v) => itemVibes.has(v));
  if (!hits.length) {
    return {
      kind: "vibe",
      good: false,
      weight: 6,
      text: `Active inspo leans ${inspoVibes.slice(0, 4).join(", ")} — this closet stack barely overlaps those aesthetics.`,
    };
  }
  return {
    kind: "vibe",
    good: true,
    weight: 10 + Math.min(12, hits.length * 3),
    text: `Matches your inspo aesthetics: ${hits.slice(0, 5).join(", ")}. Same vocabulary as the boards you save — not a random closet dump.`,
  };
}

function comfortReason(items) {
  const tops = items.filter((i) => i.kind === "top" || i.kind === "bottom");
  const unrestricted = tops.filter((i) => i.taste?.comfort?.unrestricted).length;
  if (unrestricted >= 2) {
    return {
      kind: "comfort",
      good: true,
      weight: 6,
      text: "Movement is unrestricted (relaxed fit + soft hand) — comfort is a property, not a number.",
    };
  }
  return null;
}

function fabricQualityReason(items) {
  const reasons = [];
  for (const item of items) {
    if (item.traits?.materialVeto) {
      reasons.push({
        kind: "fabric",
        good: false,
        weight: 24,
        text: `${item.name}: fails fabric policy (e.g. poly where natural is required). Longevity and hand feel matter more than the brand stamp.`,
      });
    }
  }
  const naturalPieces = items.filter((i) => (i.taste?.fabric?.naturalShare || 0) >= 70);
  if (naturalPieces.length >= 2) {
    reasons.push({
      kind: "fabric",
      good: true,
      weight: 8,
      text: "Natural-fiber majority — drapes better, ages better, reads quieter than synthetic shine.",
    });
  }
  return reasons;
}

function cap(s) {
  const t = String(s || "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * Reason about an outfit from knowledge — not score soup.
 * Returns ranking signal + human principles for the UI.
 *
 * @param {Array} items profiled items with .taste from buildTasteKnowledge
 * @param {{ mode?: string, inspoVibes?: string[] }} context
 */
export function reasonOutfit(items = [], context = {}) {
  const mode = String(context.mode || "everyday").toLowerCase();
  const top = items.find((i) => i.kind === "top");
  const bottom = items.find((i) => i.kind === "bottom");
  const shoes = items.find((i) => i.kind === "shoes");
  const dress = items.find((i) => i.kind === "dress");

  /** @type {Array<{kind:string,good:boolean,weight?:number,text:string}>} */
  const principles = [];

  principles.push(...hardRules(top, bottom, shoes, mode));
  principles.push(...dnaFormula(top, bottom, shoes));
  principles.push(...silhouetteReason(top, bottom, shoes));

  if (top && bottom) {
    const cr = colorPairReason(top, bottom);
    if (cr) principles.push({ ...cr, weight: cr.good ? 12 : 14 });
    const tr = texturePairReason(top, bottom);
    if (tr) principles.push({ ...tr, weight: tr.good ? 12 : 16 });
  }
  if (bottom && shoes) {
    const cr = colorPairReason(bottom, shoes);
    if (cr) principles.push({ ...cr, weight: cr.good ? 6 : 8 });
  }
  if (top && shoes) {
    const cr = colorPairReason(top, shoes);
    if (cr && cr.good) principles.push({ ...cr, weight: 4 });
  }

  const vibe = vibeOverlap(items, context.inspoVibes || []);
  if (vibe) principles.push(vibe);

  const comfort = comfortReason(items);
  if (comfort) principles.push(comfort);

  principles.push(...fabricQualityReason(items));

  if (dress) {
    principles.push({
      kind: "formula",
      good: true,
      weight: 10,
      text: "One-piece base — less to coordinate, proportion is mostly solved by the dress cut.",
    });
  }

  // Intentional without overdressed
  const formalCount = items.filter((i) => i.traits?.formal).length;
  if (formalCount === 0 && (top?.taste?.role?.isHoodie || top?.taste?.role?.isTee) && bottom) {
    principles.push({
      kind: "philosophy",
      good: true,
      weight: 6,
      text: "Intentional without overdressed — casual structure, no costume formality.",
    });
  }

  // Rank from principle weights (internal only — UI leads with text)
  let rank = 58;
  for (const p of principles) {
    const w = Number(p.weight) || 8;
    rank += p.good ? w : -w;
  }
  // Crush trash combos
  if (principles.some((p) => !p.good && p.kind === "rule" && /kit \+ sweat|Football kit/i.test(p.text))) {
    rank = Math.min(rank, 32);
  }
  // Everyday: jersey should never outrank quiet uniform stacks
  if ((mode === "everyday" || mode === "build" || mode === "stream") && top?.taste?.role?.isJersey) {
    rank = Math.min(rank, 54);
  }
  rank = Math.round(clamp(rank, 0, 100));

  // Order: failures first if bad look or jersey demotion, else strongest goods
  const goods = principles.filter((p) => p.good);
  const bads = principles.filter((p) => !p.good);
  const leadWithProblems =
    rank < 58 || bads.some((p) => p.kind === "rule") || top?.taste?.role?.isJersey;
  const ordered = leadWithProblems ? [...bads, ...goods] : [...goods, ...bads];
  const reasons = [];
  for (const p of ordered) {
    if (p.text && !reasons.includes(p.text)) reasons.push(p.text);
  }
  // Always ground in philosophy when strong
  if (rank >= 78 && reasons.length < 4) {
    reasons.push("Proportion, color harmony, and texture are doing the work — not logos or trend.");
  }
  if (!reasons.length) {
    reasons.push("Complete base outfit; log more fabric/fit facts to deepen taste reasoning.");
  }

  // Summary line for UI eyebrow
  const summary = reasons[0] || "Outfit from closet facts.";

  // Vibe union for inspo matching downstream
  const vibes = [...new Set(items.flatMap((i) => i.taste?.vibes || []))];

  return {
    rank,
    summary,
    reasons: reasons.slice(0, 8),
    principles: ordered.slice(0, 12),
    vibes,
    philosophy: TASTE_PHILOSOPHY,
    // explicit: we do not export comfort:9 style scores
    knowledgeDriven: true,
  };
}

/**
 * Extract vibe tags from free text (inspo titles, pin descriptions).
 */
export function extractVibesFromText(text = "") {
  const t = String(text).toLowerCase();
  const hits = [];
  const map = {
    minimal: /\bminimal|clean lines|simple\b/,
    scandinavian: /\bscandi|scandinavian\b/,
    japanese: /\bjapanese|japan|muji|auralee|comoli\b/,
    relaxed: /\brelaxed|easy|lounge|chill\b/,
    "quiet-luxury": /\bquiet luxury|stealth wealth|old money|luxe minimal\b/,
    streetwear: /\bstreetwear|street wear|hype|graphic\b/,
    athleisure: /\bathleisure|activewear|gym to\b/,
    monochrome: /\bmonochrome|all black|tonal\b/,
    natural: /\bnatural|organic|linen\b/,
    "earth-tones": /\bearth tone|earthy|olive|camel|beige\b/,
    "soft-tailoring": /\bsoft tailor|unstructured blazer\b/,
    "1990s": /\b90s|1990|baggy jean|raver\b/,
    clean: /\bclean|crisp\b/,
    technical: /\btechnical|gorp|shell\b/,
    workwear: /\bworkwear|carhartt|timberland|chore\b/,
    baggy: /\bbaggy|oversized|wide leg\b/,
    uniform: /\buniform|daily drive|uniform energy\b/,
    "west-coast": /\bwest coast|la style|california\b/,
    casual: /\bcasual|everyday\b/,
  };
  for (const [vibe, re] of Object.entries(map)) {
    if (re.test(t)) hits.push(vibe);
  }
  return hits;
}

/**
 * Infer vibes from inspo palette colors (warm muted, mono, high contrast…).
 */
export function extractVibesFromPalette(palette = {}) {
  const colors = palette.colors || palette || [];
  const hexes = (Array.isArray(colors) ? colors : [])
    .map((c) => (typeof c === "string" ? c : c?.hex || c?.color))
    .filter(Boolean);
  if (!hexes.length) return [];
  const described = hexes.map((h) => describeColor(h));
  const vibes = new Set();
  if (described.every((d) => d.neutral)) vibes.add("minimal");
  if (described.every((d) => d.neutral)) vibes.add("monochrome");
  if (described.some((d) => d.families.includes("earth") || d.families.includes("warm-neutral"))) {
    vibes.add("earth-tones");
    vibes.add("natural");
  }
  const lights = described.filter((d) => d.l > 0.75).length;
  const darks = described.filter((d) => d.l < 0.25).length;
  if (lights && darks) vibes.add("clean");
  if (described.some((d) => d.traits.includes("muted"))) vibes.add("quiet-luxury");
  vibes.add("casual");
  return [...vibes];
}
