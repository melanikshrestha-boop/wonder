/**
 * The part that makes this a coach instead of a spreadsheet.
 *
 * Everything here is derived, explainable arithmetic — Mifflin-St Jeor for
 * resting burn, pace against the clock, and a search over the food database for
 * things that actually close today's remaining gap. No canned advice: if there
 * is nothing useful to say, it says nothing.
 */
import {
  defaultPortion,
  FOODS,
  macrosFor,
  type Food,
  type Macros,
} from "./foodDb";
import {
  history,
  loadWater,
  SLOTS,
  type MealSlot,
  type NutriEntry,
  type NutriProfile,
  type Targets,
} from "./nutritionStore";

export type Insight = {
  id: string;
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  detail: string;
};

export type EnergyModel = {
  bmr: number;
  tdee: number;
  /** Target calories after the cut/maintain/gain adjustment. */
  recommended: number;
  balance: number;
  /** Projected lb/week if today repeated — 3500 kcal ≈ 1 lb. */
  weeklyLb: number;
};

const ACTIVITY_FACTOR: Record<NutriProfile["activity"], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

const GOAL_FACTOR: Record<NutriProfile["goal"], number> = {
  cut: 0.8,
  maintain: 1,
  gain: 1.1,
};

/** Mifflin-St Jeor resting burn, then activity and goal scaling. */
export function energyModel(profile: NutriProfile, consumed: number): EnergyModel {
  const kg = profile.weight_lb * 0.453592;
  const cm = profile.height_in * 2.54;
  const base = 10 * kg + 6.25 * cm - 5 * profile.age;
  const bmr = Math.round(profile.sex === "male" ? base + 5 : base - 161);
  const tdee = Math.round(bmr * ACTIVITY_FACTOR[profile.activity]);
  const recommended = Math.round(tdee * GOAL_FACTOR[profile.goal]);
  const balance = Math.round(consumed - tdee);
  return { bmr, tdee, recommended, balance, weeklyLb: Math.round((balance * 7) / 3500 * 10) / 10 };
}

export function remaining(targets: Targets, totals: Macros): Macros {
  return {
    calories: Math.round(targets.calories - totals.calories),
    protein_g: Math.round((targets.protein_g - totals.protein_g) * 10) / 10,
    carbs_g: Math.round((targets.carbs_g - totals.carbs_g) * 10) / 10,
    fat_g: Math.round((targets.fat_g - totals.fat_g) * 10) / 10,
    fiber_g: Math.round((targets.fiber_g - totals.fiber_g) * 10) / 10,
  };
}

/** Which eating windows are still open, given the hour and what's logged. */
export function remainingSlots(entries: NutriEntry[], now = new Date()): MealSlot[] {
  const hour = now.getHours();
  const logged = new Set(entries.map((e) => e.slot));
  const windowEnd: Record<MealSlot, number> = {
    breakfast: 11,
    lunch: 16,
    dinner: 22,
    snack: 23,
  };
  return SLOTS.filter((slot) => !logged.has(slot) && hour < windowEnd[slot]);
}

/** How far through the eating day we are — 7am to 9pm, clamped. */
export function dayProgress(now = new Date()): number {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = 7 * 60;
  const end = 21 * 60;
  return Math.min(1, Math.max(0, (minutes - start) / (end - start)));
}

export type FoodSuggestion = {
  food: Food;
  grams: number;
  label: string;
  macros: Macros;
  reason: string;
};

/**
 * Search the database for servings that close the remaining protein gap
 * without spending calories you don't have. Ranked by protein per calorie,
 * then filtered so the suggestion actually fits the remaining budget.
 */
export function suggestClosers(
  need: Macros,
  limit = 3,
  exclude: string[] = []
): FoodSuggestion[] {
  const proteinNeed = need.protein_g;
  const calorieRoom = need.calories;
  if (proteinNeed < 8 || calorieRoom < 60) return [];

  const skip = new Set(exclude);
  const scored: { suggestion: FoodSuggestion; score: number }[] = [];

  for (const food of FOODS) {
    if (skip.has(food.id)) continue;
    // Condiments are protein-dense per calorie but nobody eats a bowl of soy
    // sauce. They are seasoning, not a way to close a gap.
    if (food.group === "condiment") continue;
    const per100 = food.per100g;
    if (per100.protein_g < 8) continue;
    // Protein per calorie — the only metric that matters for closing a gap.
    const density = per100.protein_g / Math.max(1, per100.calories);
    if (density < 0.045) continue;

    // Serve enough to cover the gap (capped at 40 g protein), rounded to a
    // portion the kitchen can actually measure.
    const targetProtein = Math.min(proteinNeed, 40);
    const rawGrams = (targetProtein / per100.protein_g) * 100;
    const portion = defaultPortion(food);
    // Never suggest more than four normal portions of anything, or 400 g. Without
    // this the maths happily proposes 25 tablespoons of something.
    const ceiling = Math.min(portion.grams * 4, 400);
    const units = Math.max(1, Math.round(rawGrams / portion.grams));
    const grams = Math.round(
      Math.min(ceiling, portion.grams >= 20 ? units * portion.grams : rawGrams)
    );
    if (grams <= 0) continue;

    const macros = macrosFor(food, grams);
    if (macros.calories > calorieRoom) continue;
    if (macros.protein_g < 8) continue;

    // Abbreviated units never take a plural: "6 oz", not "6 ozs".
    const abbreviated = /^(g|kg|oz|lb|ml|l|tbsp|tsp)$/.test(portion.label);
    const label =
      portion.grams >= 20 && units >= 1
        ? `${units} ${portion.label}${units > 1 && !abbreviated ? "s" : ""} (${grams} g)`
        : `${grams} g`;

    scored.push({
      score: density * 100 + Math.min(20, macros.protein_g) / 4,
      suggestion: {
        food,
        grams,
        label,
        macros,
        reason: `${macros.protein_g} g protein for ${macros.calories} cal`,
      },
    });
  }

  // One suggestion per food group, so you get options rather than four yogurts.
  const seenGroups = new Set<string>();
  const out: FoodSuggestion[] = [];
  for (const { suggestion } of scored.sort((a, b) => b.score - a.score)) {
    if (seenGroups.has(suggestion.food.group)) continue;
    seenGroups.add(suggestion.food.group);
    out.push(suggestion);
    if (out.length >= limit) break;
  }
  return out;
}

/** Consecutive days (ending yesterday or today) that hit the protein target. */
export function proteinStreak(targets: Targets, until: string): number {
  const days = history(60, until);
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    // Today only counts once it's actually hit — it shouldn't break the streak.
    if (i === days.length - 1 && day.totals.protein_g < targets.protein_g) continue;
    if (day.totals.protein_g >= targets.protein_g) streak += 1;
    else break;
  }
  return streak;
}

export type WeekStats = {
  loggedDays: number;
  avgCalories: number;
  avgProtein: number;
  bestDay: { day: string; protein: number } | null;
};

export function weekStats(until: string): WeekStats {
  const days = history(7, until).filter((d) => d.totals.calories > 0);
  if (!days.length) {
    return { loggedDays: 0, avgCalories: 0, avgProtein: 0, bestDay: null };
  }
  const totalCal = days.reduce((s, d) => s + d.totals.calories, 0);
  const totalPro = days.reduce((s, d) => s + d.totals.protein_g, 0);
  const best = days.reduce((a, b) => (b.totals.protein_g > a.totals.protein_g ? b : a));
  return {
    loggedDays: days.length,
    avgCalories: Math.round(totalCal / days.length),
    avgProtein: Math.round(totalPro / days.length),
    bestDay: { day: best.day, protein: Math.round(best.totals.protein_g) },
  };
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * Build the coaching feed. Ordered by urgency, capped so the page stays
 * readable, and empty when the day genuinely needs no comment.
 */
export function buildInsights(params: {
  day: string;
  entries: NutriEntry[];
  totals: Macros;
  targets: Targets;
  profile: NutriProfile;
  isToday: boolean;
  now?: Date;
}): Insight[] {
  const { day, entries, totals, targets, profile, isToday } = params;
  const now = params.now || new Date();
  const left = remaining(targets, totals);
  const out: Insight[] = [];

  if (!entries.length) {
    return [
      {
        id: "empty",
        tone: "info",
        title: "Nothing logged yet",
        detail: isToday
          ? "Type what you ate in plain English — \"2 eggs and a cup of rice\" — and it resolves to grams and macros."
          : "No food recorded for this day.",
      },
    ];
  }

  // 1. Pace — are you eating in step with the clock?
  if (isToday) {
    const clock = dayProgress(now);
    const eaten = totals.calories / Math.max(1, targets.calories);
    const gap = clock - eaten;
    if (gap > 0.28 && left.calories > 300) {
      out.push({
        id: "behind",
        tone: "warn",
        title: `Under-fuelled — ${Math.round(clock * 100)}% through the day, ${pct(totals.calories, targets.calories)}% of your calories`,
        detail: `${left.calories} cal still to eat. Under-eating early is what turns into a 9pm binge.`,
      });
    } else if (gap < -0.3 && eaten > 0.75) {
      out.push({
        id: "ahead",
        tone: "warn",
        title: `Ahead of the clock — ${pct(totals.calories, targets.calories)}% of calories, ${Math.round(clock * 100)}% of the day`,
        detail:
          left.calories > 0
            ? `Only ${left.calories} cal left for the rest of today. Make the remaining plates protein and vegetables.`
            : `You're ${Math.abs(left.calories)} cal over target with hours to go.`,
      });
    }
  }

  // 2. Protein pacing — the number that actually drives the result.
  const openSlots = isToday ? remainingSlots(entries, now).length : 0;
  if (left.protein_g > 10 && isToday) {
    const perMeal = openSlots > 0 ? Math.ceil(left.protein_g / openSlots) : left.protein_g;
    out.push({
      id: "protein-pace",
      tone: left.protein_g > targets.protein_g * 0.55 ? "bad" : "warn",
      title: `${Math.round(left.protein_g)} g protein still owed`,
      detail:
        openSlots > 0
          ? `${openSlots} eating window${openSlots > 1 ? "s" : ""} left — put about ${perMeal} g on each plate.`
          : "No meals left in the plan. Add a high-protein snack or move the target.",
    });
  } else if (totals.protein_g >= targets.protein_g) {
    out.push({
      id: "protein-hit",
      tone: "good",
      title: `Protein target cleared — ${Math.round(totals.protein_g)} g`,
      detail: `${Math.round(totals.protein_g - targets.protein_g)} g over the ${targets.protein_g} g goal. This is the habit that compounds.`,
    });
  }

  // 3. Energy balance in real terms, not a percentage.
  const energy = energyModel(profile, totals.calories);
  if (totals.calories > 400) {
    const dir = energy.balance < 0 ? "deficit" : "surplus";
    out.push({
      id: "energy",
      tone: "info",
      title: `${Math.abs(energy.balance)} cal ${dir} against a ${energy.tdee} cal burn`,
      detail: `${profile.weightConfirmed ? "" : "Estimated from a default weight — set yours for real numbers. "}Repeated daily that's ${Math.abs(energy.weeklyLb)} lb/week ${energy.balance < 0 ? "down" : "up"}.`,
    });
  }

  // 4. Fibre — the macro everyone under-eats and no app mentions.
  if (totals.calories > targets.calories * 0.6 && totals.fiber_g < targets.fiber_g * 0.6) {
    out.push({
      id: "fiber",
      tone: "warn",
      title: `Fibre low — ${Math.round(totals.fiber_g)} g of ${targets.fiber_g} g`,
      detail: "Berries, lentils, chia, or a pear closes most of that in one go.",
    });
  }

  // 5. Water, since it shares the same daily record.
  const water = loadWater(day);
  if (isToday && water > 0 && water < 1500 && now.getHours() >= 14) {
    out.push({
      id: "water",
      tone: "warn",
      title: `${(water / 1000).toFixed(1)} L water so far`,
      detail: "Thirst reads as hunger. Drink before you decide you're snacking.",
    });
  }

  // 6. Consistency over the week.
  const week = weekStats(day);
  if (week.loggedDays >= 3) {
    out.push({
      id: "week",
      tone: week.avgProtein >= targets.protein_g * 0.9 ? "good" : "info",
      title: `7-day average — ${week.avgCalories} cal, ${week.avgProtein} g protein`,
      detail: `Logged ${week.loggedDays} of the last 7 days. Averages beat any single day.`,
    });
  }

  const streak = proteinStreak(targets, day);
  if (streak >= 2) {
    out.push({
      id: "streak",
      tone: "good",
      title: `${streak}-day protein streak`,
      detail: "Don't break the chain today.",
    });
  }

  return out.slice(0, 6);
}
