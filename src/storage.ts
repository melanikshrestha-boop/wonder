import type { Block, Database, Page, Workspace } from "./types";
import {
  buildWonderWorkspace,
  WONDER_EXPORT_VERSION,
} from "./drMelaniExport";

const KEY = "notion-like-workspace-v4-full";
const VERSION_KEY = "notion-like-export-version";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Truly empty table. No seed rows. No Status/Notes junk. */
export function emptyDatabase(): Database {
  const titleCol = uid();
  return {
    columns: [{ id: titleCol, name: "Name", type: "title" }],
    rows: [],
  };
}

export function newBlock(type: Block["type"] = "paragraph", text = ""): Block {
  return {
    id: uid(),
    type,
    text,
    checked: type === "todo" ? false : undefined,
    open: type === "toggle" ? true : undefined,
    indent: 0,
    children: type === "toggle" ? [newBlock("paragraph")] : undefined,
  };
}

export function defaultWorkspace(): Workspace {
  const ws = buildWonderWorkspace() as Workspace;
  return migrateWorkspace(ws);
}

/** Pages that should exist for Notion-style sidebar (never wipe user pages) */
const SIDEBAR_EXTRA_PAGES: {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
}[] = [
  {
    id: "pg-agents",
    title: "Agents",
    icon: "🤖",
    parentId: null,
  },
  {
    id: "pg-library",
    title: "Bookshelf",
    icon: "📚",
    parentId: null, // Learn section
  },
  {
    id: "pg-help",
    title: "Help",
    icon: "❓",
    parentId: null,
  },
  {
    id: "pg-fashion-os",
    title: "Wardrobe",
    icon: "fashion",
    parentId: "pg-agents",
  },
  // Weather is Mel-only (default NYC) — not a sidebar page
  {
    id: "pg-agent-gmail",
    title: "Gmail",
    icon: "✉",
    parentId: "pg-agents",
  },
  {
    id: "pg-agent-shopping",
    title: "Shopping",
    icon: "🛒",
    parentId: "pg-agents",
  },
  {
    id: "pg-agent-care",
    title: "Care Concierge",
    icon: "care",
    parentId: "pg-agents",
  },
];

/** Pages user asked removed from sidebar permanently */
const PURGE_PAGE_IDS = new Set([
  "pg-home",
  "pg-books",
  "pg-book-innovators",
  "pg-book-photo",
  "pg-body", // Body: weight lives under Gym
  "pg-tests", // Upcoming tests
  "pg-doctor", // My doctor
  "pg-goals", // Goals Tracker
  "pg-todo", // To Do List
  "pg-journal", // Journal
  "pg-75hard", // 75 Hard (not part of the core workspace)
  "pg-personal-life", // Personal Life (kept out of the main tree)
  "pg-neurotech", // Neurotech
  "pg-openneuro", // Downloading OpenNeuro
  "pg-doc-hub", // Document Hub
  "pg-meetings", // Meetings
  "pg-classes", // Classes
  "pg-content", // Content OS — permanently deleted
  "pg-math", // was Content Empire
  "pg-math-lab",
  "pg-youtube",
  "pg-channel",
  "pg-learn-math",
  // pg-finance is live again (Finances desk under Learn)
  "pg-startups", // Startups / Silicon Valley
  "pg-reading-list", // Reading list
  "pg-wearables", // Wearables (WHOOP etc.) — not needed as a page
  "pg-profile",
  "pg-period",
  "pg-period-tracker",
  "pg-labs",
  "pg-analytics", // Health Analytics dump page
  "pg-agent-weather", // Weather lives in Mel only (NYC default)
  "pg-life", // removed — Bookshelf lives under Learn
  "pg-my-tasks", // removed for now
  "pg-books", // use pg-library Bookshelf
  "pg-nutrition", // Claude nutrition tab — removed from sidebar (hideous)
  "pg-macros",
  "pg-calories",
  // Focus / Screen Time — permanently deleted (owner: no value, too much space)
  "pg-focus",
  "pg-screentime",
  "pg-screen-time",
  // Failures desk — permanently deleted
  "pg-failures",
  "pg-failure",
  "pg-learn-failures",
  // Body OS desk — permanently deleted (Guardian/Vault still run headless)
  "pg-body-os",
  "pg-data-guardian",
  "pg-twin-desk",
  // Operator + paper trading desks — permanently deleted
  "pg-operator",
  "pg-empire",
  "pg-paper-trading",
  "pg-trading",
  "pg-day-trade",
  "pg-daytrade",
  "pg-day-trading",
  // World Monitor — permanently deleted
  "pg-world-monitor",
]);

/** Exact titles to kill (user-made dupes under Data, etc.) */
const PURGE_PAGE_TITLES = new Set([
  "profile",
  "period tracker",
  "period",
  "labs",
  "wearables",
  "health analytics",
  "new database",
  "weather",
  "life",
  "my tasks",
  "operator",
  "paper trading",
  "day trade",
  "day trading",
  "world monitor",
]);

function shouldPurgePage(p: {
  id: string;
  title?: string;
  kind?: string;
  database?: { rows?: unknown[]; columns?: { name?: string }[] };
}): boolean {
  if (PURGE_PAGE_IDS.has(p.id)) return true;
  const t = (p.title || "").trim().toLowerCase();
  if (PURGE_PAGE_TITLES.has(t)) return true;
  // Kill empty stub databases (Name / Status / Notes + New item junk)
  if (p.kind === "database") {
    const names = (p.database?.columns || [])
      .map((c) => (c.name || "").toLowerCase())
      .join("|");
    if (
      names.includes("status") &&
      names.includes("notes") &&
      (t === "" || t === "new database" || t === "untitled")
    ) {
      return true;
    }
  }
  return false;
}

function purgeRemovedPages(ws: Workspace): Workspace {
  const pages = ws.pages.filter((p) => !shouldPurgePage(p));
  if (pages.length === ws.pages.length) return ws;
  let activePageId = ws.activePageId;
  if (shouldPurgePage({ id: activePageId, title: ws.pages.find((x) => x.id === activePageId)?.title })) {
    activePageId = pages.find((p) => !p.trashedAt)?.id || pages[0]?.id || activePageId;
  }
  return {
    ...ws,
    pages,
    activePageId,
    recents: (ws.recents || []).filter((id) => pages.some((p) => p.id === id)),
  };
}

function ensureSidebarPages(ws: Workspace): Workspace {
  const now = Date.now();
  const ids = new Set(ws.pages.map((p) => p.id));
  const extra: Page[] = [];
  for (const spec of SIDEBAR_EXTRA_PAGES) {
    if (ids.has(spec.id)) continue;
    // Never re-add purged pages
    if (PURGE_PAGE_IDS.has(spec.id)) continue;
    extra.push({
      id: spec.id,
      title: spec.title,
      icon: spec.icon,
      parentId: spec.parentId,
      createdAt: now,
      updatedAt: now,
      blocks: [newBlock("paragraph", "")],
      kind: "page",
      favorite: false,
      trashedAt: null,
      cover: null,
    });
  }
  const pages = [...ws.pages, ...extra].map((page) =>
    page.id === "pg-library" ? { ...page, title: "Bookshelf", icon: "books" } : page
  );
  if (!extra.length && pages.every((page, index) => page === ws.pages[index])) return ws;
  return { ...ws, pages };
}

function cleanWorkPageBlocks(blocks: Block[]): Block[] {
  // Drop seed fluff: duplicate H1 "Work", intro paragraph about Dr. Melani tab
  return blocks.filter((b) => {
    const t = (b.text || "").trim();
    if (b.type === "heading1" && /^work$/i.test(t)) return false;
    if (
      b.type === "paragraph" &&
      /from dr\.?\s*melani work tab/i.test(t)
    )
      return false;
    // normalize old em dashes in todos to colon
    return true;
  }).map((b) => ({
    ...b,
    text: (b.text || "")
      .replace(/\u2014/g, ":")
      .replace(/\u2013/g, "-")
      .replace(/—/g, ":")
      .replace(/–/g, "-"),
    indent: b.indent ?? 0,
  }));
}

/**
 * Sidebar layout (enforced so it can’t get stuck broken):
 * Health → Fitness, Hygiene, My Data
 * Learn → Bookshelf + Finances (NO Work section, NO World Monitor)
 *
 * Work hub is hidden. Bookshelf is ALWAYS top-level under Learn.
 */
function ensureLifePages(ws: Workspace): Workspace {
  const now = Date.now();
  let pages = [...ws.pages];

  function ensurePage(
    id: string,
    title: string,
    icon: string,
    parentId: string | null,
    blocks?: ReturnType<typeof newBlock>[]
  ) {
    const existing = pages.find((p) => p.id === id);
    if (!existing) {
      pages.push({
        id,
        title,
        icon,
        parentId,
        createdAt: now,
        updatedAt: now,
        blocks: blocks || [newBlock("paragraph", "")],
        kind: "page",
        favorite: false,
        trashedAt: null,
        cover: null,
      });
      return;
    }
    pages = pages.map((p) =>
      p.id === id
        ? {
            ...p,
            parentId, // pin known homes so Learn never goes empty
            title: p.title || title,
            // Force line icons for system pages
            icon:
              id === "pg-library" || id === "pg-finance" ? icon : p.icon || icon,
            trashedAt: null, // never leave Bookshelf / Finances in trash by accident
            updatedAt: p.updatedAt || now,
          }
        : p
    );
  }

  // Health
  ensurePage("pg-fitness", "Fitness", "fitness", null);
  ensurePage("pg-sleep", "Sleep", "sleep", "pg-fitness");
  ensurePage("pg-meals", "Meals", "meals", "pg-fitness");
  ensurePage("pg-gym", "Gym", "gym", "pg-fitness");
  // Whoop + Focus permanently out of nav (data keys may remain; never wipe health)
  pages = pages.map((p) =>
    (p.id === "pg-whoop" ||
      p.id === "pg-focus" ||
      p.id === "pg-screentime" ||
      p.id === "pg-screen-time") &&
    !p.trashedAt
      ? { ...p, trashedAt: now, parentId: null, updatedAt: now }
      : p
  );
  ensurePage("pg-hygiene", "Hygiene", "hygiene", null);
  // Hygiene sub-routines — Mel can open these by name; must exist in workspace
  ensurePage("pg-shower-daily", "Daily shower", "shower", "pg-hygiene", [
    newBlock("paragraph", ""),
  ]);
  ensurePage("pg-shower-everything", "Everything shower", "shower", "pg-hygiene", [
    newBlock("paragraph", ""),
  ]);
  ensurePage("pg-hair", "Hair care", "hair", "pg-hygiene", [
    newBlock("paragraph", ""),
  ]);
  ensurePage("pg-am-skin", "AM skincare", "skin", "pg-hygiene", [
    newBlock("paragraph", ""),
  ]);
  ensurePage("pg-pm-skin", "PM skincare", "skin", "pg-hygiene", [
    newBlock("paragraph", ""),
  ]);
  ensurePage("pg-oral-care", "Oral care", "hygiene", "pg-hygiene", [
    newBlock("paragraph", ""),
  ]);
  ensurePage("pg-data", "My Data", "data", null);

  // Learn — Bookshelf ALWAYS sits here (top-level), never buried under Work
  ensurePage("pg-library", "Bookshelf", "books", null, [
    newBlock("paragraph", "Books, notes, and saved references."),
  ]);

  // Learn — personal Finances desk (accounts + budget + spending)
  ensurePage(
    "pg-finance",
    "Finances",
    "finance",
    null,
    [
      newBlock(
        "paragraph",
        "Your money desk: accounts, monthly budget, spending log, and a light market watchlist."
      ),
    ]
  );

  // Permanently remove Operator + paper trading + World Monitor + Failures + Content (no re-create)
  const PERMANENTLY_DELETED = new Set([
    "pg-operator",
    "pg-empire",
    "pg-paper-trading",
    "pg-trading",
    "pg-day-trading",
    "pg-day-trade",
    "pg-daytrade",
    "pg-world-monitor",
    "pg-failures",
    "pg-failure",
    "pg-learn-failures",
    "pg-math",
    "pg-math-lab",
    "pg-content",
    "pg-youtube",
    "pg-channel",
    "pg-learn-math",
    "pg-body-os",
    "pg-data-guardian",
    "pg-twin-desk",
  ]);
  pages = pages.filter((p) => !PERMANENTLY_DELETED.has(p.id));

  // Health — Habit Tracker (top-level so it's always one click away)
  ensurePage(
    "pg-habits",
    "Habits",
    "habits",
    null,
    [
      newBlock(
        "paragraph",
        "Every habit, every day. Streaks, momentum, and the ruthless truth about what you actually did."
      ),
    ]
  );

  // Nutrition page is purged (see PURGE_PAGE_IDS) — do not re-seed it.
  // Paper trading / Operator permanently purged — do not re-seed.

  // Wardrobe stays under Agents
  ensurePage("pg-fashion-os", "Wardrobe", "fashion", "pg-agents", [
    newBlock("paragraph", "Your clothes, extracted and organized."),
  ]);
  ensurePage("pg-agent-care", "Care Concierge", "care", "pg-agents", [
    newBlock("paragraph", ""),
  ]);

  // Lift anything that was nested under the old Work hub (so stocks kids aren’t lost)
  pages = pages.map((p) =>
    p.parentId === "pg-work" ? { ...p, parentId: null, updatedAt: now } : p
  );

  // Soft-delete the old Work hub — section is gone
  pages = pages.map((p) =>
    p.id === "pg-work"
      ? { ...p, trashedAt: p.trashedAt || now, parentId: null, updatedAt: now }
      : p
  );

  // Fitness / Hygiene children only when still orphaned
  pages = pages.map((p) => {
    if (p.parentId != null) return p;
    if (["pg-sleep", "pg-meals", "pg-gym"].includes(p.id)) {
      return { ...p, parentId: "pg-fitness" };
    }
    if (
      ["pg-shower-daily", "pg-shower-everything", "pg-hair", "pg-am-skin", "pg-pm-skin"].includes(
        p.id
      )
    ) {
      return { ...p, parentId: "pg-hygiene" };
    }
    return p;
  });

  // If you were on deleted Work / World Monitor, open Bookshelf
  let activePageId = ws.activePageId;
  if (activePageId === "pg-work" || activePageId === "pg-world-monitor") {
    activePageId = "pg-library";
  }
  if (
    activePageId === "pg-focus" ||
    activePageId === "pg-screentime" ||
    activePageId === "pg-screen-time"
  ) {
    activePageId = "pg-sleep";
  }
  if (
    activePageId === "pg-failures" ||
    activePageId === "pg-failure" ||
    activePageId === "pg-learn-failures" ||
    activePageId === "pg-math" ||
    activePageId === "pg-math-lab" ||
    activePageId === "pg-content" ||
    activePageId === "pg-youtube" ||
    activePageId === "pg-channel" ||
    activePageId === "pg-learn-math" ||
    activePageId === "pg-body-os" ||
    activePageId === "pg-data-guardian" ||
    activePageId === "pg-twin-desk"
  ) {
    activePageId = "pg-library";
  }

  return { ...ws, pages, activePageId };
}

function migrateWorkspace(ws: Workspace): Workspace {
  // Workspace display name (sidebar top) — always Wonder for this app
  const name =
    !ws.name ||
    /^dr\.?\s*melani$/i.test(ws.name.trim()) ||
    ws.name.trim() === "Dr Melani" ||
    /^notion-?like$/i.test(ws.name.trim())
      ? "Wonder"
      : ws.name;

  const base: Workspace = {
    ...ws,
    name,
    recents: ws.recents || [ws.activePageId],
    pages: (ws.pages || []).map((p) => {
      let blocks: Block[] = (p.blocks || []).map((b) => ({
        ...b,
        indent: b.indent ?? 0,
      }));
      if (p.id === "pg-work") {
        blocks = cleanWorkPageBlocks(blocks);
        if (!blocks.length) blocks = [newBlock("paragraph", "")];
      }
      return {
        ...p,
        kind: p.kind || "page",
        favorite: !!p.favorite,
        trashedAt: p.trashedAt ?? null,
        cover: p.cover ?? null,
        blocks,
      };
    }),
  };
  // Keep your tree; add Life → Books; extras; drop purged pages
  return purgeRemovedPages(ensureSidebarPages(ensureLifePages(base)));
}

export function forceImportWonder(): Workspace {
  const ws = migrateWorkspace(buildWonderWorkspace() as Workspace);
  saveWorkspace(ws);
  try {
    localStorage.setItem(VERSION_KEY, String(WONDER_EXPORT_VERSION));
  } catch {
    /* ignore */
  }
  return ws;
}

/** @deprecated Use forceImportWonder */
export const forceImportDrMelani = forceImportWonder;

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // Prefer v2 if user already imported an older Wonder / Dr. Melani tree
      const v2 = localStorage.getItem("notion-like-workspace-v2-dr-melani");
      if (v2) {
        const data = migrateWorkspace(JSON.parse(v2) as Workspace);
        saveWorkspace(data);
        return data;
      }
      return forceImportWonder();
    }
    const data = migrateWorkspace(JSON.parse(raw) as Workspace);
    if (!data.pages?.length) return forceImportWonder();
    return data;
  } catch {
    return forceImportWonder();
  }
}

export function saveWorkspace(ws: Workspace): void {
  localStorage.setItem(KEY, JSON.stringify(ws));
}

/**
 * Known system pages that deep-links / Mel transport must always be able to open.
 * Seeds the page if missing (does not wipe user content on existing pages).
 */
const SYSTEM_PAGE_SEEDS: Record<
  string,
  { title: string; icon: string; parentId: string | null }
> = {
  "pg-hygiene": { title: "Hygiene", icon: "hygiene", parentId: null },
  "pg-oral-care": { title: "Oral care", icon: "hygiene", parentId: "pg-hygiene" },
  "pg-am-skin": { title: "AM skincare", icon: "skin", parentId: "pg-hygiene" },
  "pg-pm-skin": { title: "PM skincare", icon: "skin", parentId: "pg-hygiene" },
  "pg-shower-daily": { title: "Daily shower", icon: "shower", parentId: "pg-hygiene" },
  "pg-shower-everything": {
    title: "Everything shower",
    icon: "shower",
    parentId: "pg-hygiene",
  },
  "pg-hair": { title: "Hair care", icon: "hair", parentId: "pg-hygiene" },
  "pg-fitness": { title: "Fitness", icon: "fitness", parentId: null },
  "pg-sleep": { title: "Sleep", icon: "sleep", parentId: "pg-fitness" },
  "pg-meals": { title: "Meals", icon: "meals", parentId: "pg-fitness" },
  "pg-gym": { title: "Gym", icon: "gym", parentId: "pg-fitness" },
  "pg-fashion-os": { title: "Wardrobe", icon: "fashion", parentId: "pg-agents" },
  "pg-library": { title: "Bookshelf", icon: "books", parentId: null },
  "pg-finance": { title: "Finances", icon: "finance", parentId: null },
  "pg-habits": { title: "Habits", icon: "habits", parentId: null },
  "pg-data": { title: "My Data", icon: "data", parentId: null },
};

/** Ensure a system page exists and is not trashed, then return updated workspace. */
export function ensureSystemPage(ws: Workspace, pageId: string): Workspace {
  const seed = SYSTEM_PAGE_SEEDS[pageId];
  if (!seed) return ws;
  const now = Date.now();
  const existing = ws.pages.find((p) => p.id === pageId);
  if (existing) {
    if (!existing.trashedAt && existing.parentId === seed.parentId) return ws;
    return {
      ...ws,
      pages: ws.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              title: p.title || seed.title,
              icon: p.icon || seed.icon,
              parentId: seed.parentId,
              trashedAt: null,
              updatedAt: now,
            }
          : p
      ),
    };
  }
  return {
    ...ws,
    pages: [
      ...ws.pages,
      {
        id: pageId,
        title: seed.title,
        icon: seed.icon,
        parentId: seed.parentId,
        createdAt: now,
        updatedAt: now,
        blocks: [newBlock("paragraph", "")],
        kind: "page" as const,
        favorite: false,
        trashedAt: null,
        cover: null,
      },
    ],
  };
}

export function createPage(parentId: string | null = null): Page {
  const now = Date.now();
  return {
    id: uid(),
    title: "",
    icon: "",
    parentId,
    createdAt: now,
    updatedAt: now,
    // One blank line — no starter fluff
    blocks: [newBlock("paragraph", "")],
    kind: "page",
    favorite: false,
    trashedAt: null,
    cover: null,
  };
}

/** Prefer createPage. If a database is ever needed, it starts blank (no demo rows). */
export function createDatabasePage(parentId: string | null = null): Page {
  const now = Date.now();
  return {
    id: uid(),
    title: "",
    icon: "",
    parentId,
    createdAt: now,
    updatedAt: now,
    blocks: [newBlock("paragraph", "")],
    // Normal page — never auto-spawn the ugly Name/Status/Notes stub table
    kind: "page",
    favorite: false,
    trashedAt: null,
    cover: null,
  };
}
