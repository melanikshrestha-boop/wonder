/**
 * Natural-language food parser.
 *
 * Turns the way you actually talk —
 *   "2 eggs, a cup of white rice and 6oz grilled chicken"
 * into structured, gram-accurate items you can log without touching a form.
 *
 * Runs entirely offline against foodDb. No API, no latency, no failure mode
 * where the tracker is useless because a server is down.
 */
import {
  addMacros,
  defaultPortion,
  emptyMacros,
  FOODS,
  macrosFor,
  searchFoods,
  type Food,
  type Macros,
} from "./foodDb";

export type ParsedItem = {
  /** The original phrase this came from, so the UI can show what it read. */
  raw: string;
  food: Food | null;
  name: string;
  grams: number;
  qty: number;
  unit: string;
  /** Portion only — "2 large", "1 cup", "150 g". The food name is shown beside it. */
  qtyLabel: string;
  macros: Macros;
  confidence: "high" | "medium" | "low";
  note?: string;
};

export type ParseResult = {
  items: ParsedItem[];
  totals: Macros;
  /** Phrases we could not resolve to a food — surfaced, never silently dropped. */
  unmatched: string[];
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  dozen: 12, fifteen: 15, twenty: 20,
  half: 0.5, quarter: 0.25, couple: 2, few: 3, several: 3,
};

const FRACTIONS: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3,
};

/** Absolute mass units → grams per 1 unit. */
const MASS_UNITS: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gm: 1, gs: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};

/** Volume units → millilitres; converted at ~1 g/ml unless the food knows better. */
const VOLUME_UNITS: Record<string, number> = {
  ml: 1, milliliter: 1, millilitre: 1, milliliters: 1, millilitres: 1,
  l: 1000, liter: 1000, litre: 1000, liters: 1000, litres: 1000,
  floz: 29.5735, "fl oz": 29.5735,
};

/**
 * Words that name a household portion. These are matched against each food's
 * own portion table first (a "cup" of rice ≠ a "cup" of spinach), and only
 * fall back to a generic weight if the food has no such portion.
 */
const PORTION_WORDS = new Set([
  "cup", "cups", "tbsp", "tablespoon", "tablespoons", "tsp", "teaspoon",
  "teaspoons", "slice", "slices", "piece", "pieces", "scoop", "scoops",
  "handful", "handfuls", "bowl", "bowls", "can", "cans", "bottle", "bottles",
  "glass", "glasses", "bar", "bars", "packet", "packets", "serving",
  "servings", "container", "containers", "small", "medium", "med", "large",
  "jumbo", "pat", "pats", "square", "squares", "fillet", "fillets", "breast",
  "breasts", "thigh", "thighs", "patty", "patties", "wing", "wings", "roll",
  "rolls", "egg", "eggs", "date", "dates", "spear", "spears", "floret",
  "florets", "ear", "ears", "head", "heads", "almond", "almonds", "grape",
  "grapes", "cherry", "cookie", "cookies", "donut", "donuts", "pancake",
  "pancakes", "waffle", "waffles", "burger", "burgers", "bagel", "bagels",
  "tortilla", "tortillas", "sandwich", "sandwiches", "steak", "steaks",
  "block", "blocks", "grande", "tall", "mug", "mugs", "shot", "shots",
  "pint", "pints", "brownie", "brownies", "cake", "cakes", "omelette",
  "omelet", "burrito", "burritos", "plate", "plates", "bag", "bags", "half",
  "box", "boxes", "pack", "packs", "sleeve", "sleeves", "stick", "sticks",
]);

/** Singular form for portion lookups: "slices" → "slice". */
function singular(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 2 && word.endsWith("es") && /(ch|sh|s|x|z)es$/.test(word)) {
    return word.slice(0, -2);
  }
  if (word.length > 2 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/** Filler that carries no nutritional meaning. */
const STOP_WORDS = new Set([
  "of", "the", "some", "with", "my", "for", "and", "plus", "a", "an",
  "about", "approx", "approximately", "roughly", "around", "maybe", "like",
  "had", "have", "ate", "eating", "drank", "drink", "just", "then", "also",
  "today", "breakfast", "lunch", "dinner", "snack", "i", "it", "was",
  "ive", "i've", "im", "i'm", "really", "bad", "good", "write", "down",
  "logged", "log", "please", "which", "is", "small", "version", "normal",
  "usual", "usually",
]);

/**
 * Strip chat fluff so Mel hears the meal, not the commentary.
 * "which is really bad" / "write it down" / "just like the small version"
 */
function stripFoodCommentary(text: string): string {
  return text
    .replace(/\bwhich is (really |so |pretty )?(bad|good|gross|fine|ok|okay)\b.*$/gi, " ")
    .replace(/\b(that('s| is) )?(really |so )?(bad|gross|unhealthy)\b/gi, " ")
    .replace(/\bjust like the small version\b/gi, " ")
    .replace(/\b(write|put|note) (it|that) down\b/gi, " ")
    .replace(/\b(please\s+)?(log|track|save) (it|that|this)\b/gi, " ")
    .replace(/\bi (also )?had\b/gi, " and ")
    .replace(/\bi (also )?ate\b/gi, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Preparation adjectives. Stripped only as a fallback — several real food
 * names contain them ("Chicken breast, cooked"), so we always try the full
 * phrase first.
 */
const PREP_WORDS = new Set([
  "grilled", "baked", "roasted", "fried", "steamed", "boiled", "raw",
  "cooked", "fresh", "frozen", "canned", "chopped", "diced", "sliced",
  "shredded", "crushed", "ground", "whole", "plain", "organic", "lean",
  "skinless", "boneless", "hot", "cold", "warm", "leftover", "homemade",
]);

function normalize(text: string): string {
  let out = text.toLowerCase();
  for (const [glyph, value] of Object.entries(FRACTIONS)) {
    out = out.replace(new RegExp(glyph, "g"), ` ${value} `);
  }
  // "1/2" → 0.5, "1 1/2" → 1.5
  out = out.replace(/(\d+)\s+(\d+)\/(\d+)/g, (_m, w, n, d) =>
    String(Number(w) + Number(n) / Number(d))
  );
  out = out.replace(/(\d+)\/(\d+)/g, (_m, n, d) => String(Number(n) / Number(d)));
  // Glue units to numbers apart: "6oz" → "6 oz", "150g" → "150 g"
  out = out.replace(/(\d)\s*(g|kg|oz|lb|lbs|ml|l)\b/g, "$1 $2 ");
  out = out.replace(/\bfl\s*oz\b/g, "floz");
  // Keep , ; / + — splitPhrases needs them to find the item boundaries.
  return out.replace(/[^\w\s.,;/+-]/g, " ").replace(/\s+/g, " ").trim();
}

/** Split a sentence into one phrase per food. */
function splitPhrases(text: string): string[] {
  return text
    .split(/\s*(?:,|;|\band\b|\bplus\b|\bwith\b|\+|\n|\/)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Levenshtein distance, capped — used only for single-token typo rescue. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  const cur = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** Best food for a phrase: exact/alias, then token overlap, then typo rescue. */
function matchFood(phrase: string): { food: Food; strong: boolean } | null {
  const clean = phrase.trim();
  if (!clean) return null;

  const direct = searchFoods(clean, 1);
  if (direct.length) {
    const term = clean.toLowerCase();
    const strong =
      direct[0].name.toLowerCase() === term ||
      direct[0].aliases.includes(term) ||
      term.length >= 4;
    return { food: direct[0], strong };
  }

  // Token overlap — "grilled chicken breast" → "Chicken breast, cooked"
  const tokens = clean.split(" ").filter((t) => t && !STOP_WORDS.has(t));
  const meaningful = tokens.filter((t) => !PREP_WORDS.has(t));
  const probe = meaningful.length ? meaningful : tokens;
  if (probe.length) {
    let best: { food: Food; score: number } | null = null;
    for (const food of FOODS) {
      const hay = `${food.name} ${food.aliases.join(" ")}`.toLowerCase();
      let score = 0;
      for (const token of probe) {
        if (token.length < 3) continue;
        if (new RegExp(`\\b${token}`).test(hay)) score += 2;
        else if (hay.includes(token)) score += 1;
      }
      if (score > 0 && (!best || score > best.score)) best = { food, score };
    }
    if (best && best.score >= 2) return { food: best.food, strong: best.score >= 4 };

    // Typo rescue on the longest token: "chiken" → "chicken"
    const longest = [...probe].sort((a, b) => b.length - a.length)[0];
    if (longest && longest.length >= 5) {
      let near: { food: Food; dist: number } | null = null;
      for (const food of FOODS) {
        for (const term of [food.name.toLowerCase(), ...food.aliases]) {
          for (const word of term.split(/[\s,]+/)) {
            if (word.length < 4) continue;
            const d = editDistance(longest, word);
            if (d <= 2 && (!near || d < near.dist)) near = { food, dist: d };
          }
        }
      }
      if (near) return { food: near.food, strong: false };
    }
  }
  return null;
}

type Quantified = { qty: number; unit: string; rest: string; explicit: boolean };

/** Pull the leading quantity and unit off a phrase. */
function takeQuantity(phrase: string): Quantified {
  const words = phrase.split(" ").filter(Boolean);
  let qty = 1;
  let unit = "";
  let explicit = false;
  let i = 0;

  // Skip leading chatter: "i had two eggs" → start at "two"
  while (
    i < words.length &&
    (STOP_WORDS.has(words[i]!) ||
      words[i] === "had" ||
      words[i] === "ate" ||
      words[i] === "eaten")
  ) {
    // Don't skip number-words that are also weak stop ("a"/"an") if next is food
    if (words[i] === "a" || words[i] === "an") break;
    i += 1;
  }

  // Number (digit or word), possibly repeated: "1 1/2" already folded to 1.5
  if (i < words.length) {
    const w = words[i]!;
    if (/^\d+(\.\d+)?$/.test(w)) {
      qty = Number(w);
      explicit = true;
      i += 1;
    } else if (w in NUMBER_WORDS) {
      qty = NUMBER_WORDS[w]!;
      // "a"/"an" is a weak signal — do not treat it as an explicit count
      explicit = w !== "a" && w !== "an";
      i += 1;
    }
  }

  // Optional "of" between number and unit: "half of a cup"
  while (i < words.length && (words[i] === "of" || words[i] === "a" || words[i] === "an")) {
    i += 1;
  }

  if (i < words.length) {
    const w = words[i];
    const s = singular(w);
    if (w in MASS_UNITS || w in VOLUME_UNITS || PORTION_WORDS.has(w) || PORTION_WORDS.has(s)) {
      // Never eat the only remaining word — "2 eggs" must keep "eggs" as food.
      if (i + 1 < words.length) {
        unit = w;
        explicit = true;
        i += 1;
      }
    }
  }

  const rest = words.slice(i).filter((w) => !STOP_WORDS.has(w) || words.length === 1).join(" ");
  return { qty, unit, rest: rest || words.slice(i).join(" "), explicit };
}

/** Find a portion on this food matching the spoken unit. */
function portionFor(food: Food, unit: string) {
  if (!unit) return null;
  const s = singular(unit);
  return (
    food.portions.find((p) => p.label.toLowerCase() === unit) ||
    food.portions.find((p) => p.label.toLowerCase() === s) ||
    food.portions.find((p) => p.label.toLowerCase().startsWith(`${s} `)) ||
    food.portions.find((p) => p.label.toLowerCase().includes(s)) ||
    null
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Resolve a phrase into grams of a specific food. */
function resolveGrams(
  food: Food,
  qty: number,
  unit: string
): { grams: number; label: string; assumed: boolean } {
  if (unit in MASS_UNITS) {
    const grams = qty * MASS_UNITS[unit];
    return { grams, label: `${round(qty)} ${unit}`, assumed: false };
  }

  // A food's own portion always wins over a generic conversion.
  const portion = portionFor(food, unit);
  if (portion) {
    return {
      grams: qty * portion.grams,
      label: `${round(qty)} ${portion.label}`,
      assumed: false,
    };
  }

  if (unit in VOLUME_UNITS) {
    // ~1 g per ml is right for water, milk, and close enough for the rest.
    const grams = qty * VOLUME_UNITS[unit];
    return { grams, label: `${round(qty)} ${unit}`, assumed: false };
  }

  const fallback = defaultPortion(food);
  return {
    grams: qty * fallback.grams,
    label: `${round(qty)} ${fallback.label}`,
    assumed: true,
  };
}

/**
 * Parse a free-text meal description into logged-ready items.
 * Every item carries its own confidence so the UI can flag guesses.
 */
export function parseFoodText(text: string): ParseResult {
  const cleaned = stripFoodCommentary(text);
  const normalized = normalize(cleaned);
  const phrases = splitPhrases(normalized);
  const items: ParsedItem[] = [];
  const unmatched: string[] = [];

  for (const phrase of phrases) {
    const { qty, unit, rest, explicit } = takeQuantity(phrase);
    const target = rest.trim() || phrase;
    const match = matchFood(target);

    if (!match) {
      // Retry with prep words stripped: "pan seared salmon" → "salmon"
      const stripped = target
        .split(" ")
        .filter((w) => !PREP_WORDS.has(w) && !STOP_WORDS.has(w))
        .join(" ");
      const retry = stripped && stripped !== target ? matchFood(stripped) : null;
      if (!retry) {
        if (target.trim()) unmatched.push(target.trim());
        continue;
      }
      pushItem(retry.food, false);
      continue;
    }
    pushItem(match.food, match.strong);

    function pushItem(food: Food, strong: boolean) {
      const { grams, label, assumed } = resolveGrams(food, qty, unit);
      if (!(grams > 0)) return;
      const confidence: ParsedItem["confidence"] =
        strong && explicit && !assumed ? "high" : strong || explicit ? "medium" : "low";
      items.push({
        raw: phrase,
        food,
        name: food.name,
        grams: Math.round(grams),
        qty,
        unit: unit || defaultPortion(food).label,
        qtyLabel: label,
        macros: macrosFor(food, grams),
        confidence,
        note: assumed && !unit ? `Assumed ${defaultPortion(food).label}` : undefined,
      });
    }
  }

  return {
    items,
    totals: items.reduce((sum, item) => addMacros(sum, item.macros), emptyMacros()),
    unmatched,
  };
}
