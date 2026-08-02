/**
 * Full Wonder workspace export.
 * Structure mirrors the live app (Fitness / Work / Hygiene / My Data)
 * plus health analytics and lab numbers from Melani’s chart.
 */
import type { Block, Page, Workspace } from "./types";

function uid(stable: string): string {
  return stable;
}

function b(type: Block["type"], text = "", extra: Partial<Block> = {}): Block {
  return {
    id: uid(`b-${Math.random().toString(36).slice(2, 9)}`),
    type,
    text,
    checked: type === "todo" ? false : undefined,
    open: type === "toggle" ? true : undefined,
    ...extra,
  };
}

function page(
  id: string,
  title: string,
  icon: string,
  parentId: string | null,
  blocks: Block[]
): Page {
  const now = Date.now();
  return {
    id,
    title,
    icon,
    parentId,
    createdAt: now,
    updatedAt: now,
    blocks,
  };
}

/** Entire Wonder system as Notion pages */
export function buildWonderWorkspace(): Workspace {
  const FITNESS = "pg-fitness";
  const SLEEP = "pg-sleep";
  const MEALS = "pg-meals";
  const GYM = "pg-gym";
  const WORK = "pg-work";
  const HYGIENE = "pg-hygiene";
  const SHOWER_DAILY = "pg-shower-daily";
  const SHOWER_EVERY = "pg-shower-everything";
  const HAIR = "pg-hair";
  const AM_SKIN = "pg-am-skin";
  const PM_SKIN = "pg-pm-skin";
  const DATA = "pg-data";
  const GROCERY = "pg-grocery";
  // Personal pages
  const WARDROBE = "pg-fashion-os";
  const AGENTS = "pg-agents";
  const CARE = "pg-agent-care";
  const LIBRARY = "pg-library";

  const pages: Page[] = [
    // ── Fitness hub ──
    page(FITNESS, "Fitness", "💪", null, [
      b("heading1", "Fitness"),
      b("heading2", "Pages"),
      b("bullet", "Sleep: bedtime, wake, brain fog, weekly chart"),
      b("bullet", "Meals: macros, usuals, water"),
      b("bullet", "Gym: week plan, warm-up, weight, day checklists"),
      b("divider"),
    ]),

    page(SLEEP, "Sleep", "😴", FITNESS, [
      b("heading1", "Sleep"),
      b("heading2", "Today"),
      b("paragraph", "Day: (log in Wonder — Fitness → Sleep)"),
      b("paragraph", "Bedtime: —"),
      b("paragraph", "Wake: —"),
      b("divider"),
      b("heading2", "Brain fog"),
      b("paragraph", "Yes = red day · No = green day (for doctor chat)"),
      b("todo", "Log brain fog for today"),
      b("divider"),
      b("heading2", "Weekly sleep"),
      b("paragraph", "Target line ~8 hours (same as Fitness weekly chart)."),
      b("bullet", "Sat —"),
      b("bullet", "Sun —"),
      b("bullet", "Mon —"),
      b("bullet", "Tue —"),
      b("bullet", "Wed —"),
      b("bullet", "Thu —"),
      b("bullet", "Fri —"),
      b("callout", "Source of truth: Wonder → Fitness → Sleep."),
    ]),

    page(MEALS, "Meals", "🍽️", FITNESS, [
      b("heading1", "Meals"),
      b("heading2", "Goals"),
      b("bullet", "Protein priority (from app goals)"),
      b("bullet", "0% added sugar · organic when possible · measured portions"),
      b("divider"),
      b("heading2", "Breakfast · 7-day trial (exported)"),
      b("paragraph", "Locked 8-product breakfast · pack math"),
      b("bullet", "Fage Total 0% Nonfat Greek Yogurt (Costco · 48 oz) — 180 g/day; 3 tubs at once: $29.07 — Lasts ~ 23 days"),
      b("bullet", "Mayorga Organic Chia Seeds (Costco · 3 lb) — 8 g/day (2 tsp); 1 bag: $11.06 — Lasts ~ 5.5 months"),
      b("bullet", "Spectrum Cold Milled Organic Ground Flaxseed (14 oz) — 2.7 g/day (1 tsp); 1 bag — Lasts ~ 5 months"),
      b("bullet", "Simply Organic Ceylon Cinnamon (2.08 oz) — 1.3 g/day (½ tsp); 1 bottle — Lasts ~ 45 days"),
      b("bullet", "Kirkland Signature Dry Roasted Macadamia Nuts (Costco · 24 oz) — 1 macadamia nut/day; 1 bag: $19.52 — Lasts ~ 6.4 months"),
      b("bullet", "Kirkland Signature Walnut Halves (Costco · 3 lb) — 3 walnuts/day; 1 bag: $17.15 — Lasts ~ 3 months"),
      b("bullet", "Kirkland Signature Supreme Whole Almonds (Costco · 3 lb) — 5 almonds/day; 1 bag: $17.15 — Lasts ~ 7.5 months"),
      b("bullet", "Lifeway Plain Unsweetened Kefir (32 fl oz) — 100 ml/day; 2 bottles at once — Lasts ~ 19 days"),
      b("bullet", "Blueberries — 60 g/day · 34.2 cal · 0.4g P · 8.7g C · 0.2g F · 1.4g fiber"),
      b("bullet", "Strawberries — 30 g/day · 9.6 cal · 0.2g P · 2.3g C · 0.1g F · 0.6g fiber"),
      b("divider"),
      b("heading2", "Common / usuals"),
      b("bullet", "Breakfast only during 7-day trial — lunch/dinner later"),
      b("divider"),
      b("heading2", "Water"),
      b("paragraph", "Goal: 4000 ml / day (profile)"),
      b("todo", "Log water glasses / ml"),
      b("heading2", "Bowel"),
      b("todo", "Log bowel Yes / No for today"),
      b("divider"),
      b("heading2", "Before 7pm"),
      b("paragraph", "Meal-before-7pm tracking lives in the app meals module."),
    ]),

    page(GYM, "Gym", "🏋️", FITNESS, [
      b("heading1", "Gym"),
      b("heading2", "Week structure (from Wonder gym plans)"),
      b("bullet", "Monday — Glutes + Abs"),
      b("bullet", "Tuesday — Lower / upper plan day"),
      b("bullet", "Wednesday — plan day"),
      b("bullet", "Thursday — Upper + Abs"),
      b("bullet", "Friday — Glutes + Abs"),
      b("bullet", "Saturday — Glutes + Abs"),
      b("bullet", "Sunday — rest or cardio"),
      b("divider"),
      b("heading2", "Cardio options"),
      b("bullet", "Running program"),
      b("bullet", "Swimming"),
      b("divider"),
      b("heading2", "Plan files in app"),
      b("bullet", "lower_one / lower_two / lower_three"),
      b("bullet", "upper_abs_one / upper_abs_two"),
      b("bullet", "cardio_running / cardio_swimming"),
      b("divider"),
      b("heading2", "Warm-up"),
      b("todo", "Complete warm-up checklist before main lifts"),
    ]),

    // Body removed: weight/photos live under Gym

    // ── Work ──
    page(WORK, "Work", "💼", null, [
      b("heading2", "Focus"),
      b("todo", "Ship product"),
      b("todo", "Neurotech / deep tech learning"),
      b("todo", "Silicon Valley / biotech updates"),
      b("heading2", "Learning"),
      b("bullet", "Electrical engineering"),
      b("bullet", "Computer engineering"),
      b("bullet", "Personal finance + business"),
      b("heading2", "Content"),
      b("todo", "Post ideas / LinkedIn"),
      b("todo", "Video / photography project"),
    ]),
    // ── Hygiene hub ──
    page(HYGIENE, "Hygiene", "✨", null, [
      b("heading1", "Hygiene"),
      b("heading2", "Shower"),
      b("bullet", "Daily shower"),
      b("bullet", "Everything shower"),
      b("bullet", "Hair care"),
      b("heading2", "Skincare"),
      b("bullet", "AM skincare"),
      b("bullet", "PM skincare (night types + calendar)"),
      b("divider"),
      b("heading2", "Products & restock"),
      b("bullet", "Using / Researching / Buy next lanes in app"),
    ]),

    page(SHOWER_DAILY, "Daily shower", "🚿", HYGIENE, [
      b("heading1", "Daily shower"),
      b("todo", "Body wash"),
      b("todo", "Face rinse / cleanse if needed"),
      b("todo", "Moisturize after"),
    ]),

    page(SHOWER_EVERY, "Everything shower", "🛁", HYGIENE, [
      b("heading1", "Everything shower"),
      b("paragraph", "Full routine night — scrub, hair, skincare."),
      b("todo", "Scrub"),
      b("todo", "Hair wash + treatment"),
      b("todo", "MediCube pore mask / face mask (guide in app)"),
      b("todo", "No acids or retinol same night if mask night"),
    ]),

    page(HAIR, "Hair care", "💇", HYGIENE, [
      b("heading1", "Hair care"),
      b("paragraph", "Wash day ~2× this week (plan in app calendar)."),
      b("todo", "Wash"),
      b("todo", "Condition / treatment"),
      b("todo", "Style / protect"),
    ]),

    page(AM_SKIN, "AM skincare", "☀️", HYGIENE, [
      b("heading1", "AM skincare"),
      b("todo", "Cleanse"),
      b("todo", "Treat / serum"),
      b("todo", "Moisturize"),
      b("todo", "SPF"),
    ]),

    page(PM_SKIN, "PM skincare", "🌙", HYGIENE, [
      b("heading1", "PM skincare"),
      b("paragraph", "Four night types — see calendar in Wonder Hygiene."),
      b("bullet", "Gentle / recovery night"),
      b("bullet", "Active night"),
      b("bullet", "Retinol night"),
      b("bullet", "Mask night"),
      b("todo", "Log tonight’s PM type"),
    ]),

    // ── Data (one page only: cycle + labs inside the app UI) ──
    // No separate Profile / Period tracker / Labs / Wearables sidebar pages
    page(DATA, "My Data", "data", null, [
      b("paragraph", ""),
    ]),

    // ── Grocery ──
    page(GROCERY, "Grocery / Shop", "🛒", null, [
      b("heading1", "Grocery / Shop"),
      b("heading2", "Heart-smart staples (for lipid flags)"),
      b("todo", "Extra virgin olive oil"),
      b("todo", "Oats (plain)"),
      b("todo", "Salmon"),
      b("todo", "Walnuts / almonds"),
      b("todo", "Spinach / greens"),
      b("todo", "Berries"),
      b("todo", "Beans"),
      b("todo", "Fage 0% yogurt + kefir"),
    ]),

    // Wardrobe under Agents
    page(WARDROBE, "Wardrobe", "fashion", AGENTS, [
      b("paragraph", "Your clothes, extracted and organized."),
    ]),

    page(CARE, "Care Concierge", "care", AGENTS, [
      b("paragraph", ""),
    ]),

    // Agents hub (hidden from sidebar list — only children show under Agents)
    page(AGENTS, "Agents", "🤖", null, [
      b("heading1", "Agents"),
      b(
        "paragraph",
        "Build your own agents here. Use + New agent in the sidebar."
      ),
    ]),

    // Learn → Bookshelf
    page(LIBRARY, "Bookshelf", "books", null, [
      b("heading1", "Bookshelf"),
      b("paragraph", "Books, notes, and saved references."),
    ]),

    page("pg-help", "Help", "❓", null, [
      b("heading1", "Help"),
      b(
        "paragraph",
        "Tips: ⌘K search · ⌘N new page · / for blocks · sidebar + New page anytime."
      ),
    ]),
  ];

  return {
    name: "Wonder",
    pages,
    activePageId: FITNESS,
    sidebarOpen: true,
    exportVersion: 8,
  } as Workspace & { exportVersion?: number };
}

export const WONDER_EXPORT_VERSION = 17;
/** @deprecated Use WONDER_EXPORT_VERSION */
export const DR_MELANI_EXPORT_VERSION = WONDER_EXPORT_VERSION;
/** @deprecated Use buildWonderWorkspace */
export const buildDrMelaniWorkspace = buildWonderWorkspace;
