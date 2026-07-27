/**
 * Melani's usual foods — Mel should recognize these without asking.
 * "two boiled eggs" is a normal pattern; log exact portions, not vibes.
 */
export type FoodHabit = {
  /** Match against spoken line (case-insensitive) */
  patterns: RegExp[];
  /** What Mel logs (plain English for the nutrition ledger) */
  logPhrase: string;
  note?: string;
};

/**
 * High-confidence expansions before free parse.
 * Order: more specific first.
 */
export const MELANI_FOOD_HABITS: FoodHabit[] = [
  {
    patterns: [
      /\b(?:two|2)\s+(?:boiled\s+)?eggs?\b/i,
      /\b(?:boiled\s+)?eggs?\s*x\s*2\b/i,
      /\b2\s*x\s*(?:boiled\s+)?eggs?\b/i,
    ],
    logPhrase: "2 large boiled eggs",
    note: "Usual protein snack / add-on",
  },
  {
    patterns: [
      /\b(?:three|3)\s+(?:boxes?|packs?|sleeves?)\s+(?:of\s+)?pockys?\b/i,
    ],
    logPhrase: "3 boxes pocky",
    note: "Treat — log honestly",
  },
  {
    patterns: [
      /\b(?:two|2)\s+(?:boxes?|packs?)\s+(?:of\s+)?pockys?\b/i,
    ],
    logPhrase: "2 boxes pocky",
  },
  {
    patterns: [
      /\b(?:one|1|a)\s+(?:box|pack|sleeve)\s+(?:of\s+)?pockys?\b/i,
      /\bpockys?\b/i,
    ],
    logPhrase: "1 box pocky",
  },
  {
    patterns: [
      /\b(?:grilled\s+)?chicken(?:\s+breast)?\b/i,
      /\bi had chicken\b/i,
    ],
    logPhrase: "1 chicken breast cooked",
    note: "Default cooked breast portion",
  },
  {
    patterns: [/\b(?:my\s+)?(?:usual\s+)?breakfast\b/i],
    logPhrase: "__usual_breakfast__",
  },
];

/**
 * Expand a free-text meal using Melani habits, then leave remainder for parseFood.
 * Returns log-ready phrases (not macros — parseFood still owns grams).
 */
export function expandFoodHabits(raw: string): {
  phrases: string[];
  notes: string[];
  remainder: string;
} {
  let text = raw.trim();
  const phrases: string[] = [];
  const notes: string[] = [];
  const used = new Set<string>();

  for (const habit of MELANI_FOOD_HABITS) {
    for (const re of habit.patterns) {
      if (re.test(text) && !used.has(habit.logPhrase)) {
        if (habit.logPhrase === "__usual_breakfast__") {
          phrases.push("__usual_breakfast__");
        } else {
          phrases.push(habit.logPhrase);
        }
        if (habit.note) notes.push(habit.note);
        used.add(habit.logPhrase);
        text = text.replace(re, " ");
        break;
      }
    }
  }

  const remainder = text
    .replace(/\bwhich is\b.*$/i, " ")
    .replace(/\b(i\s+)?(had|ate|have)\s*(today)?\b/gi, " ")
    .replace(/\btoday\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;and]+|[\s,;and]+$/gi, "")
    .trim();

  return { phrases, notes, remainder };
}
