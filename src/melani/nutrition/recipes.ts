/**
 * Recipes — the meals you eat over and over, saved once.
 *
 * The breakfast in Wonder's profile is ten ingredients logged every morning.
 * Typing that daily is why food tracking gets abandoned. A recipe stores the
 * ingredient list once, computes macros per serving, and logs in one tap.
 *
 * Recipes hold *ingredients*, not totals, so re-weighing an ingredient or
 * changing the serving count recomputes everything. Storing frozen totals
 * would drift the moment anything changed.
 */
import { addMacros, emptyMacros, type Macros } from "./foodDb";
import type { MealSlot, NewEntry, NutriEntry } from "./nutritionStore";

export type RecipeIngredient = {
  name: string;
  grams: number;
  qtyLabel: string;
  macros: Macros;
  foodId?: string;
};

export type Recipe = {
  id: string;
  name: string;
  /** How many servings the whole ingredient list makes. Always >= 1. */
  servings: number;
  ingredients: RecipeIngredient[];
  defaultSlot: MealSlot;
  createdAt: number;
  lastUsedAt: number | null;
  useCount: number;
};

const RECIPES_KEY = "wonder-nutrition-recipes-v1";
export const RECIPES_EVENT = "wonder-nutrition-update";

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RECIPES_EVENT));
}

export function loadRecipes(): Recipe[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const parsed = JSON.parse(localStorage.getItem(RECIPES_KEY) || "[]") as Recipe[];
    return Array.isArray(parsed) ? parsed.filter((r) => r && r.id && r.name) : [];
  } catch {
    return [];
  }
}

export function saveRecipes(recipes: Recipe[]) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
    }
  } catch {
    /* ignore */
  }
  emit();
}

/** Total macros for the whole recipe, derived from ingredients. */
export function recipeTotals(recipe: Recipe): Macros {
  return recipe.ingredients.reduce((sum, i) => addMacros(sum, i.macros), emptyMacros());
}

/** Macros for one serving. */
export function perServing(recipe: Recipe): Macros {
  const total = recipeTotals(recipe);
  const n = Math.max(1, recipe.servings);
  return {
    calories: Math.round(total.calories / n),
    protein_g: Math.round((total.protein_g / n) * 10) / 10,
    carbs_g: Math.round((total.carbs_g / n) * 10) / 10,
    fat_g: Math.round((total.fat_g / n) * 10) / 10,
    fiber_g: Math.round((total.fiber_g / n) * 10) / 10,
  };
}

export function recipeGrams(recipe: Recipe): number {
  return recipe.ingredients.reduce((sum, i) => sum + i.grams, 0);
}

function newId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createRecipe(input: {
  name: string;
  ingredients: RecipeIngredient[];
  servings?: number;
  defaultSlot?: MealSlot;
}): Recipe {
  return {
    id: newId(),
    name: input.name.trim() || "Untitled recipe",
    servings: Math.max(1, Math.round(input.servings ?? 1)),
    ingredients: input.ingredients,
    defaultSlot: input.defaultSlot || "breakfast",
    createdAt: Date.now(),
    lastUsedAt: null,
    useCount: 0,
  };
}

export function addRecipe(recipes: Recipe[], recipe: Recipe): Recipe[] {
  return [recipe, ...recipes];
}

export function updateRecipe(recipes: Recipe[], id: string, patch: Partial<Recipe>): Recipe[] {
  return recipes.map((r) =>
    r.id === id
      ? { ...r, ...patch, servings: Math.max(1, Math.round(patch.servings ?? r.servings)) }
      : r
  );
}

export function removeRecipe(recipes: Recipe[], id: string): Recipe[] {
  return recipes.filter((r) => r.id !== id);
}

/**
 * Build a recipe out of a day's logged entries — the fastest way to capture
 * a meal you already ate and want to repeat.
 */
export function recipeFromEntries(
  name: string,
  entries: NutriEntry[],
  servings = 1
): Recipe {
  return createRecipe({
    name,
    servings,
    defaultSlot: entries[0]?.slot || "breakfast",
    ingredients: entries.map((e) => ({
      name: e.name,
      grams: e.grams,
      qtyLabel: e.qtyLabel,
      macros: e.macros,
      foodId: e.foodId,
    })),
  });
}

/**
 * Expand a recipe into loggable entries.
 *
 * `servings` is how many you ate. Each ingredient is scaled by
 * servings/recipe.servings, so half a batch logs half of every ingredient.
 * Ingredients are kept separate rather than collapsed into one row, so the
 * day stays editable at the ingredient level.
 */
export function recipeToEntries(
  recipe: Recipe,
  servingsEaten: number,
  slot?: MealSlot
): NewEntry[] {
  const factor = servingsEaten / Math.max(1, recipe.servings);
  if (!(factor > 0)) return [];
  return recipe.ingredients.map((ingredient) => ({
    slot: slot || recipe.defaultSlot,
    name: ingredient.name,
    grams: Math.round(ingredient.grams * factor),
    qtyLabel: `${recipe.name} · ${ingredient.qtyLabel}`,
    macros: {
      calories: Math.round(ingredient.macros.calories * factor),
      protein_g: Math.round(ingredient.macros.protein_g * factor * 10) / 10,
      carbs_g: Math.round(ingredient.macros.carbs_g * factor * 10) / 10,
      fat_g: Math.round(ingredient.macros.fat_g * factor * 10) / 10,
      fiber_g: Math.round(ingredient.macros.fiber_g * factor * 10) / 10,
    },
    foodId: ingredient.foodId,
    source: "preset" as const,
  }));
}

/** Record a use so the most-cooked recipes float to the top. */
export function markRecipeUsed(recipes: Recipe[], id: string): Recipe[] {
  return recipes.map((r) =>
    r.id === id ? { ...r, lastUsedAt: Date.now(), useCount: r.useCount + 1 } : r
  );
}

/** Most-used first, then most-recent. */
export function sortedRecipes(recipes: Recipe[]): Recipe[] {
  return [...recipes].sort(
    (a, b) => b.useCount - a.useCount || (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt)
  );
}
