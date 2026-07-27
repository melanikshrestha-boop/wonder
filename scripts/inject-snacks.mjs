/**
 * Inject Melani's snack log into Wonder localStorage via Playwright.
 * Run: node scripts/inject-snacks.mjs
 */
import { chromium } from "playwright";

const day = new Date().toISOString().slice(0, 10);

const created = [
  {
    id: `n-snack-pocky-${day}`,
    day,
    slot: "snack",
    name: "Pocky, chocolate",
    grams: 140,
    qtyLabel: "2 packs",
    macros: {
      calories: 720,
      protein_g: 8,
      carbs_g: 102.1,
      fat_g: 32.1,
      fiber_g: 2,
    },
    foodId: "pocky-chocolate",
    source: "manual",
    loggedAt: new Date().toISOString(),
  },
  {
    id: `n-snack-pom-${day}`,
    day,
    slot: "snack",
    name: "Pomegranate seeds",
    grams: 160,
    qtyLabel: "1 whole (arils)",
    macros: {
      calories: 133,
      protein_g: 2.7,
      carbs_g: 29.9,
      fat_g: 1.9,
      fiber_g: 6.4,
    },
    foodId: "pomegranate-seeds",
    source: "manual",
    loggedAt: new Date().toISOString(),
  },
  {
    id: `n-snack-cherries-${day}`,
    day,
    slot: "snack",
    name: "Cherries",
    grams: 230,
    qtyLabel: "1 bowl",
    macros: {
      calories: 145,
      protein_g: 2.5,
      carbs_g: 36.8,
      fat_g: 0.5,
      fiber_g: 4.8,
    },
    foodId: "cherries",
    source: "manual",
    loggedAt: new Date().toISOString(),
  },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5173/?page=pg-meals", {
  waitUntil: "domcontentloaded",
  timeout: 15000,
});

const result = await page.evaluate((payload) => {
  const { day, created } = payload;
  const key = "wonder-nutrition-entries-v1";
  let map = {};
  try {
    map = JSON.parse(localStorage.getItem(key) || "{}") || {};
  } catch {
    map = {};
  }
  const dayList = Array.isArray(map[day]) ? map[day].slice() : [];
  const ids = new Set(dayList.map((e) => e.id));
  for (const e of created) {
    if (!ids.has(e.id)) dayList.push(e);
  }
  map[day] = dayList;
  localStorage.setItem(key, JSON.stringify(map));

  const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
  for (const e of dayList) {
    const m = e.macros || {};
    totals.calories += m.calories || 0;
    totals.protein_g += m.protein_g || 0;
    totals.carbs_g += m.carbs_g || 0;
    totals.fat_g += m.fat_g || 0;
    totals.fiber_g += m.fiber_g || 0;
  }
  localStorage.setItem(
    `dr-melani-meals-usuals:${day}`,
    JSON.stringify({
      loggedIds: dayList.map((e) => e.presetId || e.id),
      totals: {
        calories: Math.round(totals.calories),
        protein_g: Math.round(totals.protein_g * 10) / 10,
        carbs_g: Math.round(totals.carbs_g * 10) / 10,
        fat_g: Math.round(totals.fat_g * 10) / 10,
        fiber_g: Math.round(totals.fiber_g * 10) / 10,
      },
    })
  );
  window.dispatchEvent(new Event("wonder-nutrition-update"));
  return { day, count: dayList.length, snackIds: created.map((c) => c.id), totals };
}, { day, created });

console.log(JSON.stringify(result, null, 2));
await browser.close();
