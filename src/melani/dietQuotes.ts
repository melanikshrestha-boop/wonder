/**
 * Meals-only quotes — long-term thinking about body, diet, decades, and life.
 * Not cozy cooking tips. Not “keep it simple in the kitchen.”
 * Separate bank from Fitness hero quotes. Real attributed lines only.
 */
import type { DailyQuote } from "./dailyQuotes";
import { quoteSlotKey } from "./dailyQuotes";

/**
 * Lens: compound health · future self · prevention · body as capital · decades.
 * Soft recipe vibes and short kitchen platitudes stay out of this bank.
 */
export const DIET_QUOTES: DailyQuote[] = [
  {
    text: "The first wealth is health.",
    source: "Ralph Waldo Emerson",
    tag: "capital",
    weight: 3,
  },
  {
    text: "It is health that is real wealth and not pieces of gold and silver.",
    source: "Mahatma Gandhi",
    tag: "capital",
    weight: 3,
  },
  {
    text: "The doctor of the future will give no medicine, but will interest his patients in the care of the human frame, in diet and in the cause and prevention of disease.",
    source: "Thomas Edison",
    tag: "prevention",
    weight: 3,
  },
  {
    text: "Those who think they have no time for healthy eating will sooner or later have to find time for illness.",
    source: "Edward Stanley",
    tag: "time",
    weight: 3,
  },
  {
    text: "Take care of your body. It's the only place you have to live.",
    source: "Jim Rohn",
    tag: "vehicle",
    weight: 3,
  },
  {
    text: "The food you eat can be either the safest and most powerful form of medicine or the slowest form of poison.",
    source: "Ann Wigmore",
    tag: "trajectory",
    weight: 3,
  },
  {
    text: "When diet is wrong, medicine is of no use. When diet is correct, medicine is of no need.",
    source: "Ayurvedic proverb",
    tag: "system",
    weight: 3,
  },
  {
    text: "Leave your drugs in the chemist's pot if you can heal the patient with food.",
    source: "Hippocrates",
    tag: "first-principles",
    weight: 3,
  },
  {
    text: "Let food be thy medicine and medicine be thy food.",
    source: "Hippocrates",
    tag: "first-principles",
    weight: 2,
  },
  {
    text: "He that takes medicine and neglects diet wastes the skill of the physician.",
    source: "Chinese proverb",
    tag: "system",
    weight: 2,
  },
  {
    text: "We are indeed much more than what we eat, but what we eat can nevertheless help us to be much more than what we are.",
    source: "Adelle Davis",
    tag: "potential",
    weight: 3,
  },
  {
    text: "Don't dig your grave with your own knife and fork.",
    source: "English proverb",
    tag: "decades",
    weight: 3,
  },
  {
    text: "Man lives on one quarter of what he eats. On the other three quarters lives his doctor.",
    source: "Egyptian proverb",
    tag: "compound",
    weight: 2,
  },
  {
    text: "Health is not valued till sickness comes.",
    source: "Thomas Fuller",
    tag: "foresight",
    weight: 2,
  },
  {
    text: "Sickness comes on horseback but departs on foot.",
    source: "Dutch proverb",
    tag: "recovery-cost",
    weight: 2,
  },
  {
    text: "The groundwork of all happiness is health.",
    source: "Leigh Hunt",
    tag: "foundation",
    weight: 2,
  },
  {
    text: "One cannot think well, love well, sleep well, if one has not dined well.",
    source: "Virginia Woolf",
    tag: "performance",
    weight: 2,
  },
  {
    text: "Tell me what you eat, and I will tell you what you are.",
    source: "Jean Anthelme Brillat-Savarin",
    tag: "identity",
    weight: 2,
  },
  {
    text: "Eat food. Not too much. Mostly plants.",
    source: "Michael Pollan",
    tag: "rule",
    weight: 2,
  },
  {
    text: "If it came from a plant, eat it; if it was made in a plant, don't.",
    source: "Michael Pollan",
    tag: "long-horizon",
    weight: 2,
  },
  {
    text: "An ounce of prevention is worth a pound of cure.",
    source: "Benjamin Franklin",
    tag: "prevention",
    weight: 3,
  },
  {
    text: "The time to repair the roof is when the sun is shining.",
    source: "John F. Kennedy",
    tag: "foresight",
    weight: 2,
  },
  {
    text: "We do not inherit the earth from our ancestors; we borrow it from our children.",
    source: "Native American proverb",
    tag: "legacy",
    weight: 2,
  },
  {
    text: "Discipline is the bridge between goals and accomplishment.",
    source: "Jim Rohn",
    tag: "discipline",
    weight: 3,
  },
  {
    text: "Success is nothing more than a few simple disciplines, practiced every day.",
    source: "Jim Rohn",
    tag: "compound",
    weight: 3,
  },
  {
    text: "You will never change your life until you change something you do daily. The secret of your success is found in your daily routine.",
    source: "John C. Maxwell",
    tag: "compound",
    weight: 3,
  },
  {
    text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    source: "Will Durant",
    tag: "habit",
    weight: 3,
  },
  {
    text: "Sow a thought and you reap an action; sow an act and you reap a habit; sow a habit and you reap a character; sow a character and you reap a destiny.",
    source: "Ralph Waldo Emerson",
    tag: "destiny",
    weight: 3,
  },
  {
    text: "The best time to plant a tree was twenty years ago. The second best time is now.",
    source: "Chinese proverb",
    tag: "start",
    weight: 3,
  },
  {
    text: "Someone is sitting in the shade today because someone planted a tree a long time ago.",
    source: "Warren Buffett",
    tag: "compound",
    weight: 3,
  },
  {
    text: "Compound interest is the eighth wonder of the world. He who understands it, earns it; he who doesn't, pays it.",
    source: "Albert Einstein (attributed)",
    tag: "compound",
    weight: 2,
  },
  {
    text: "In the long run, we shape our lives, and we shape ourselves. The process never ends until we die. And the choices we make are ultimately our own responsibility.",
    source: "Eleanor Roosevelt",
    tag: "agency",
    weight: 3,
  },
  {
    text: "The secret of getting ahead is getting started. The secret of getting started is breaking your complex overwhelming tasks into small manageable tasks, and starting on the first one.",
    source: "Mark Twain (attributed)",
    tag: "execution",
    weight: 2,
  },
  {
    text: "It does not matter how slowly you go as long as you do not stop.",
    source: "Confucius",
    tag: "consistency",
    weight: 2,
  },
  {
    text: "A journey of a thousand miles begins with a single step.",
    source: "Lao Tzu",
    tag: "start",
    weight: 2,
  },
  {
    text: "The future depends on what you do today.",
    source: "Mahatma Gandhi",
    tag: "today",
    weight: 3,
  },
  {
    text: "Yesterday is gone. Tomorrow has not yet come. We have only today. Let us begin.",
    source: "Mother Teresa",
    tag: "today",
    weight: 2,
  },
  {
    text: "Do not save what is left after spending, but spend what is left after saving.",
    source: "Warren Buffett",
    tag: "priority",
    weight: 2,
  },
  {
    text: "The greatest wealth is health.",
    source: "Virgil",
    tag: "capital",
    weight: 2,
  },
  {
    text: "To keep the body in good health is a duty, otherwise we shall not be able to keep our mind strong and clear.",
    source: "Buddha",
    tag: "mind-body",
    weight: 3,
  },
  {
    text: "Physical fitness is not only one of the most important keys to a healthy body, it is the basis of dynamic and creative intellectual activity.",
    source: "John F. Kennedy",
    tag: "cognition",
    weight: 3,
  },
  {
    text: "Early to bed and early to rise makes a man healthy, wealthy, and wise.",
    source: "Benjamin Franklin",
    tag: "system",
    weight: 2,
  },
  {
    text: "Your body hears everything your mind says.",
    source: "Naomi Judd",
    tag: "alignment",
    weight: 2,
  },
  {
    text: "The groundwork for all happiness is good health. We must see that the body is kept clean and well, and that the mind is occupied with pure thoughts.",
    source: "Brigham Young (adapted tradition)",
    tag: "foundation",
    weight: 1,
  },
  {
    text: "Prevention is better than cure.",
    source: "Desiderius Erasmus",
    tag: "prevention",
    weight: 2,
  },
  {
    text: "A man too busy to take care of his health is like a mechanic too busy to take care of his tools.",
    source: "Spanish proverb",
    tag: "tools",
    weight: 3,
  },
  {
    text: "He who has health has hope; and he who has hope has everything.",
    source: "Arabian proverb",
    tag: "hope",
    weight: 2,
  },
  {
    text: "The greatest of follies is to sacrifice health for any other kind of happiness.",
    source: "Arthur Schopenhauer",
    tag: "priority",
    weight: 3,
  },
  {
    text: "Life is not merely being alive, but being well.",
    source: "Martial",
    tag: "quality",
    weight: 2,
  },
  {
    text: "There is no wealth like health, and no joy like a clear mind.",
    source: "Indian proverb",
    tag: "clarity",
    weight: 2,
  },
];

/** Drop soft kitchen fluff and ultra-short poster lines. */
function isStrongDietQuote(q: DailyQuote): boolean {
  const t = q.text.trim();
  if (t.length < 28) return false;
  if (q.source === "Wonder") return false;
  // Explicit ban: cozy cook-show energy, not decades thinking
  if (/masterpiece|recipe|kitchen|gourmet|fancy or complicated/i.test(t)) {
    return false;
  }
  return true;
}

function weightedBank(): DailyQuote[] {
  const out: DailyQuote[] = [];
  for (const q of DIET_QUOTES) {
    if (!isStrongDietQuote(q)) continue;
    const w = Math.max(1, Math.min(3, q.weight ?? 1));
    for (let i = 0; i < w; i++) out.push(q);
  }
  return out.length ? out : DIET_QUOTES.filter(isStrongDietQuote);
}

function uniqueBank(): DailyQuote[] {
  const seen = new Set<string>();
  return weightedBank().filter((q) => {
    const key = `${q.source}\u0000${q.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hashSlot(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Bumped salt so old cozy-kitchen slots don’t stick after the bank rewrite. */
const MEALS_SALT = "meals-longterm-v2";

export function dietQuoteForSlot(slotKey: string = quoteSlotKey()): DailyQuote {
  const list = weightedBank();
  if (!list.length) {
    return {
      text: "The first wealth is health.",
      source: "Ralph Waldo Emerson",
    };
  }
  const idx = hashSlot(`${MEALS_SALT}:${slotKey}`) % list.length;
  return list[idx];
}

export function dietQuoteForSlotOffset(
  slotKey: string = quoteSlotKey(),
  offset = 0
): DailyQuote {
  const scheduled = dietQuoteForSlot(slotKey);
  if (offset <= 0) return scheduled;

  const alternatives = uniqueBank().filter(
    (q) => q.text !== scheduled.text || q.source !== scheduled.source
  );
  if (!alternatives.length) return scheduled;
  const start =
    hashSlot(`${MEALS_SALT}:${slotKey}:manual`) % alternatives.length;
  return alternatives[(start + offset - 1) % alternatives.length];
}
