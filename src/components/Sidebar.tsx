import { useEffect, useRef, useState } from "react";
import type { Page } from "../types";
import { iconForPage, MinimalIcon } from "./MinimalIcon";
import {
  MEL_SIDEBAR_ACTION_EVENT,
  type MelSidebarActionRequest,
} from "../melani/melActions";

type Props = {
  workspaceName: string;
  pages: Page[];
  allPages: Page[];
  recents: string[];
  activePageId: string;
  open: boolean;
  onSelect: (id: string) => void;
  onNewPage: () => void;
  onNewTopPage: () => void;
  /** @deprecated Never spawn stub Name/Status/Notes databases */
  onNewDatabase?: () => void;
  onNewAgent: () => void;
  onDeletePage: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onMovePage: (
    movingId: string,
    targetId: string,
    position?: "before" | "inside"
  ) => void;
  onOpenSearch: () => void;
  onClose: () => void;
  onRestorePage?: (id: string) => void;
  onEmptyTrash?: () => void;
  onReimport?: () => void;
};

const COLLAPSE_KEY = "dr-melani-sidebar-collapsed";
const COLLAPSE_VERSION_KEY = "dr-melani-sidebar-collapse-version";
const TRASH_KEY = "dr-melani-show-trash";
/** Saved width of the main menu (sidebar) — drag the right edge */
const SIDEBAR_WIDTH_KEY = "dr-melani-sidebar-width-v1";
const SIDEBAR_W_MIN = 200;
const SIDEBAR_W_MAX = 420;
const SIDEBAR_W_DEFAULT = 252;
/** How long (ms) between two taps counts as a double-tap to OPEN */
const DOUBLE_TAP_MS = 420;

function loadSidebarWidth(): number {
  try {
    const n = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(n) && n >= SIDEBAR_W_MIN && n <= SIDEBAR_W_MAX) return n;
  } catch {
    /* ignore */
  }
  return SIDEBAR_W_DEFAULT;
}

function saveSidebarWidth(w: number) {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(w)));
  } catch {
    /* ignore */
  }
}

function applySidebarWidth(w: number) {
  // Live CSS variable so the whole shell tracks the drag
  document.documentElement.style.setProperty("--sidebar-w", `${Math.round(w)}px`);
}

/** Health section roots */
const HEALTH_ROOT_IDS = ["pg-fitness", "pg-hygiene", "pg-data"] as const;
/** Learn section roots — Bookshelf + World Monitor + Finances. No Work section. */
const LEARN_ROOT_IDS = ["pg-library", "pg-world-monitor", "pg-finance"] as const;

/** true = closed (kids hidden). Opening a parent always forces its kids closed. */
function markClosed(ids: readonly string[], map: Record<string, boolean>) {
  for (const id of ids) map[id] = true;
}

/** Close every page that has this parent (and their kids too) */
function closeDescendants(
  pages: Page[],
  parentId: string,
  map: Record<string, boolean>
) {
  for (const page of pages) {
    if (page.parentId !== parentId) continue;
    map[page.id] = true;
    closeDescendants(pages, page.id, map);
  }
}
/** Hidden from sidebar for good */
const SIDEBAR_HIDDEN_IDS = new Set([
  "pg-life",
  "pg-my-tasks",
  "pg-books", // Bookshelf is pg-library
  "pg-my-data", // use pg-data
  "pg-agents", // hub is hidden; children show under Agents
  "pg-work", // Work section removed — stocks live on World Monitor under Learn
]);

/** Section collapse keys (double-tap Health / Learn labels) */
const SECTION_KEYS = {
  health: "section:health",
  learn: "section:learn",
} as const;

function loadCollapsed(): Record<string, boolean> {
  // true = closed (kids hidden). false = open.
  // Double-tap opens · single-tap closes. Opening always restarts with kids closed.
  const defaults: Record<string, boolean> = {
    "pg-fitness": true,
    "pg-hygiene": true,
    "pg-data": true,
    "pg-library": true,
    "pg-world-monitor": true,
    "pg-finance": true,
    // Sections start open so you see the three Health roots (each still closed inside)
    [SECTION_KEYS.health]: false,
    [SECTION_KEYS.learn]: false,
  };
  try {
    // v7 = double-tap open / single-tap close + kids closed on open
    if (localStorage.getItem(COLLAPSE_VERSION_KEY) !== "7") {
      localStorage.setItem(COLLAPSE_VERSION_KEY, "7");
      const merged = { ...defaults };
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(merged));
      return merged;
    }
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) as Record<string, boolean> };
  } catch {
    /* ignore */
  }
  return defaults;
}

function saveCollapsed(map: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function loadFlag(key: string, defaultOn: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return defaultOn;
}

function saveFlag(key: string, show: boolean) {
  try {
    localStorage.setItem(key, show ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function PageIcon({ page }: { page: Page }) {
  // Always use your minimal line icons — never page emojis in the sidebar
  return (
    <span className="side-icon" aria-hidden>
      <MinimalIcon name={iconForPage(page)} size={16} />
    </span>
  );
}

/**
 * Health / Learn label.
 * Double-tap → OPEN (kids start closed). Single tap while open → CLOSE.
 * Drop a page on it to nest under that section’s main page.
 */
function SectionLabel({
  label,
  sectionKey,
  closed,
  nestTargetId,
  onOpen,
  onClose,
  onNestInside,
}: {
  label: string;
  sectionKey: string;
  closed: boolean;
  nestTargetId?: string;
  onOpen: (sectionKey: string) => void;
  onClose: (sectionKey: string) => void;
  onNestInside: (movingId: string, nestTargetId: string, sectionKey: string) => void;
}) {
  const lastTap = useRef(0);
  return (
    <div
      className={`sidebar-section-label is-tappable${closed ? " is-closed" : " is-open"}${
        nestTargetId ? " is-drop-target" : ""
      }`}
      role="button"
      tabIndex={0}
      title={
        closed
          ? `${label} — double-tap to open`
          : `${label} — tap once to close`
      }
      aria-expanded={!closed}
      onClick={() => {
        if (!closed) {
          // Already open → one tap closes (no double-tap needed)
          lastTap.current = 0;
          onClose(sectionKey);
          return;
        }
        // Closed → only double-tap opens
        const now = Date.now();
        const doubleTap = now - lastTap.current <= DOUBLE_TAP_MS;
        lastTap.current = doubleTap ? 0 : now;
        if (doubleTap) onOpen(sectionKey);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (closed) onOpen(sectionKey);
          else onClose(sectionKey);
        }
      }}
      onDragOver={(event) => {
        if (!nestTargetId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!nestTargetId) return;
        event.preventDefault();
        const movingId = event.dataTransfer.getData("text/wonder-page");
        if (movingId && movingId !== nestTargetId) {
          onNestInside(movingId, nestTargetId, sectionKey);
        }
      }}
    >
      {/* No triangle icon — label only */}
      <span className="sidebar-section-name">{label}</span>
    </div>
  );
}

function PageTreeItem({
  page,
  pages,
  activePageId,
  depth,
  collapsed,
  onOpenBranch,
  onCloseBranch,
  onSelect,
  onDeletePage,
  onToggleFavorite,
  onMovePage,
}: {
  page: Page;
  pages: Page[];
  activePageId: string;
  depth: number;
  collapsed: Record<string, boolean>;
  /** Double-tap open — kids start closed */
  onOpenBranch: (id: string) => void;
  /** Single-tap close when branch is open */
  onCloseBranch: (id: string) => void;
  onSelect: (id: string) => void;
  onDeletePage: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onMovePage: (
    movingId: string,
    targetId: string,
    position?: "before" | "inside"
  ) => void;
}) {
  const kids = pages.filter((p) => p.parentId === page.id);
  const hasKids = kids.length > 0;
  // Missing key → closed (safe default). Open only when explicitly false.
  const isCollapsed =
    hasKids &&
    (collapsed[page.id] === true || collapsed[page.id] === undefined);
  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<number | null>(null);
  const nestTimer = useRef<number | null>(null);
  const dropIntent = useRef<"before" | "inside">("before");
  const [dropState, setDropState] = useState<"before" | "inside" | null>(null);

  function clearDropState() {
    if (nestTimer.current !== null) window.clearTimeout(nestTimer.current);
    nestTimer.current = null;
    dropIntent.current = "before";
    setDropState(null);
  }

  function beginDropState() {
    if (nestTimer.current !== null || dropState) return;
    dropIntent.current = "before";
    setDropState("before");
    // Hold a bit → nest inside (so you can put Work inside Learn / Bookshelf)
    nestTimer.current = window.setTimeout(() => {
      dropIntent.current = "inside";
      setDropState("inside");
      nestTimer.current = null;
    }, 420);
  }

  return (
    <div className="page-tree-node">
      <div
        className={`page-row${page.id === activePageId ? " is-active" : ""}${
          hasKids ? " has-kids" : ""
        }${hasKids && !isCollapsed ? " is-open" : ""}${
          dropState === "inside" ? " is-nest-target" : ""
        }${dropState === "before" ? " is-reorder-target" : ""}`}
        style={{ paddingLeft: depth * 12 }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/wonder-page", page.id);
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          beginDropState();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          beginDropState();
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
          clearDropState();
        }}
        onDrop={(event) => {
          event.preventDefault();
          const movingId = event.dataTransfer.getData("text/wonder-page");
          const position = dropIntent.current;
          clearDropState();
          if (movingId && movingId !== page.id) onMovePage(movingId, page.id, position);
        }}
        onDragEnd={clearDropState}
      >
        {/* No ▸ icons — double-tap opens branch, one tap closes when open */}
        <button
          type="button"
          className={`page-row-main${hasKids ? " has-kids" : ""}`}
          aria-expanded={hasKids ? !isCollapsed : undefined}
          title={
            hasKids
              ? isCollapsed
                ? `${page.title} — double-tap to open`
                : `${page.title} — tap once to close`
              : page.title
          }
          onClick={() => {
            // Branch open → one tap closes (and still opens that page)
            if (hasKids && !isCollapsed) {
              if (singleTapTimer.current !== null) {
                window.clearTimeout(singleTapTimer.current);
                singleTapTimer.current = null;
              }
              lastTapAt.current = 0;
              onCloseBranch(page.id);
              onSelect(page.id);
              return;
            }

            const now = Date.now();
            const doubleTap = now - lastTapAt.current <= DOUBLE_TAP_MS;
            lastTapAt.current = doubleTap ? 0 : now;

            // Branch closed → double-tap opens kids (all start closed inside)
            if (doubleTap && hasKids) {
              if (singleTapTimer.current !== null) {
                window.clearTimeout(singleTapTimer.current);
                singleTapTimer.current = null;
              }
              onOpenBranch(page.id);
              return;
            }

            // Single tap: go to the page (delay only if double-tap could still open)
            if (hasKids) {
              if (singleTapTimer.current !== null) window.clearTimeout(singleTapTimer.current);
              singleTapTimer.current = window.setTimeout(() => {
                singleTapTimer.current = null;
                onSelect(page.id);
              }, DOUBLE_TAP_MS);
            } else {
              onSelect(page.id);
            }
          }}
        >
          <PageIcon page={page} />
          <span className="page-title-side">
            {page.title.trim() || "Untitled"}
          </span>
        </button>
        <div className="page-row-actions">
          <button
            type="button"
            className="page-mini-btn"
            title={page.favorite ? "Unfavorite" : "Favorite"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(page.id);
            }}
          >
            {page.favorite ? "★" : "☆"}
          </button>
          <button
            type="button"
            className="page-mini-btn"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              if (pages.length <= 1) return;
              onDeletePage(page.id);
            }}
          >
            ×
          </button>
        </div>
      </div>

      {hasKids && (
        <div
          className={`page-tree-kids${isCollapsed ? " is-collapsed" : ""}`}
        >
          <div className="page-tree-kids-inner">
            {kids.map((child) => (
              <PageTreeItem
                key={child.id}
                page={child}
                pages={pages}
                activePageId={activePageId}
                depth={depth + 1}
                collapsed={collapsed}
                onOpenBranch={onOpenBranch}
                onCloseBranch={onCloseBranch}
                onSelect={onSelect}
                onDeletePage={onDeletePage}
                onToggleFavorite={onToggleFavorite}
                onMovePage={onMovePage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  workspaceName,
  pages,
  allPages,
  activePageId,
  open,
  onSelect,
  onNewPage,
  onNewAgent,
  onDeletePage,
  onToggleFavorite,
  onMovePage,
  onOpenSearch,
  onClose,
  onRestorePage,
  onEmptyTrash,
  onReimport,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    loadCollapsed
  );
  const [showTrash, setShowTrash] = useState(() => loadFlag(TRASH_KEY, false));
  // Main menu width — drag right edge; × buttons always stick to the far right
  const [sidebarWidth, setSidebarWidth] = useState(() => loadSidebarWidth());
  const sidebarDrag = useRef<{ startX: number; startW: number } | null>(null);
  const sidebarWidthLive = useRef(sidebarWidth);

  useEffect(() => {
    applySidebarWidth(sidebarWidth);
    sidebarWidthLive.current = sidebarWidth;
  }, [sidebarWidth]);

  function onSidebarResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    sidebarDrag.current = {
      startX: e.clientX,
      startW: sidebarWidthLive.current,
    };
    document.documentElement.classList.add("is-sidebar-resizing");
  }

  function onSidebarResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = sidebarDrag.current;
    if (!drag) return;
    const next = Math.min(
      SIDEBAR_W_MAX,
      Math.max(SIDEBAR_W_MIN, drag.startW + (e.clientX - drag.startX))
    );
    sidebarWidthLive.current = next;
    setSidebarWidth(next);
  }

  function onSidebarResizeUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!sidebarDrag.current) return;
    sidebarDrag.current = null;
    document.documentElement.classList.remove("is-sidebar-resizing");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    saveSidebarWidth(sidebarWidthLive.current);
  }

  /** Double-tap open a page branch — show kids, but every kid starts closed */
  function openBranch(id: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: false };
      closeDescendants(pages, id, next);
      saveCollapsed(next);
      return next;
    });
  }

  /** One tap close a page branch */
  function closeBranch(id: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: true };
      saveCollapsed(next);
      return next;
    });
  }

  /**
   * Double-tap open Health / Learn.
   * Roots inside always start closed (Fitness / Hygiene / My Data folded).
   */
  function openSection(sectionKey: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [sectionKey]: false };
      if (sectionKey === SECTION_KEYS.health) {
        markClosed(HEALTH_ROOT_IDS, next);
        for (const id of HEALTH_ROOT_IDS) closeDescendants(pages, id, next);
      }
      if (sectionKey === SECTION_KEYS.learn) {
        markClosed(LEARN_ROOT_IDS, next);
        for (const id of LEARN_ROOT_IDS) closeDescendants(pages, id, next);
      }
      saveCollapsed(next);
      return next;
    });
  }

  /** One tap close Health / Learn */
  function closeSection(sectionKey: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [sectionKey]: true };
      // Remember: next open will re-close kids via openSection
      if (sectionKey === SECTION_KEYS.health) {
        markClosed(HEALTH_ROOT_IDS, next);
        for (const id of HEALTH_ROOT_IDS) closeDescendants(pages, id, next);
      }
      if (sectionKey === SECTION_KEYS.learn) {
        markClosed(LEARN_ROOT_IDS, next);
        for (const id of LEARN_ROOT_IDS) closeDescendants(pages, id, next);
      }
      saveCollapsed(next);
      return next;
    });
  }

  function openSectionAndParent(sectionKey: string, nestTargetId: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [sectionKey]: false, [nestTargetId]: false };
      closeDescendants(pages, nestTargetId, next);
      saveCollapsed(next);
      return next;
    });
  }

  useEffect(() => {
    const controlSidebar = (event: Event) => {
      const request = (event as CustomEvent<MelSidebarActionRequest>).detail;
      if (!request?.action) return;

      const parentPages = pages.filter((page) =>
        pages.some((candidate) => candidate.parentId === page.id)
      );

      if (request.action.kind === "collapse-all") {
        // Close page trees AND Health / Learn / Work labels
        const next: Record<string, boolean> = Object.fromEntries(
          parentPages.map((page) => [page.id, true])
        );
        next[SECTION_KEYS.health] = true;
        next[SECTION_KEYS.learn] = true;
        setCollapsed(next);
        saveCollapsed(next);
        setShowTrash(false);
        saveFlag(TRASH_KEY, false);
        request.result = {
          ok: true,
          summary: `Closed all sidebar sections.`,
          data: { count: parentPages.length + 2 },
        };
        return;
      }

      const query = request.action.target.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const shouldCollapse = request.action.collapsed;

      // Mel can say "open Learn" / "close Health" — section labels, not pages
      const sectionMatch =
        /^(health)$/.test(query)
          ? { key: SECTION_KEYS.health, label: "Health" }
          : /^(learn|learning|bookshelf|library|stocks?|markets?|world monitor)$/.test(query)
            ? { key: SECTION_KEYS.learn, label: "Learn" }
            : null;

      if (sectionMatch) {
        if (shouldCollapse) closeSection(sectionMatch.key);
        else openSection(sectionMatch.key);
        request.result = {
          ok: true,
          summary: `${shouldCollapse ? "Closed" : "Opened"} the ${sectionMatch.label} section.`,
          pageTitle: sectionMatch.label,
        };
        return;
      }

      const target = parentPages
        .map((page) => {
          const title = page.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          const score = title === query ? 100 : title.includes(query) || query.includes(title) ? 70 : 0;
          return { page, score };
        })
        .sort((a, b) => b.score - a.score)[0];
      if (!target?.score) {
        request.result = {
          ok: false,
          summary: `I could not find a sidebar section matching ${request.action.target}.`,
        };
        return;
      }

      if (shouldCollapse) closeBranch(target.page.id);
      else openBranch(target.page.id);
      request.result = {
        ok: true,
        summary: `${shouldCollapse ? "Closed" : "Opened"} the ${target.page.title} sidebar section.`,
        pageId: target.page.id,
        pageTitle: target.page.title,
      };
    };

    window.addEventListener(MEL_SIDEBAR_ACTION_EVENT, controlSidebar);
    return () => window.removeEventListener(MEL_SIDEBAR_ACTION_EVENT, controlSidebar);
  }, [pages]);


  function toggleTrash() {
    setShowTrash((prev) => {
      const next = !prev;
      saveFlag(TRASH_KEY, next);
      return next;
    });
  }

  // Only child agents under the hidden hub (pg-agents itself is never listed)
  const agentPages = pages.filter((p) => p.parentId === "pg-agents");

  function pageById(id: string): Page | undefined {
    return pages.find((p) => p.id === id);
  }

  // Section roots (always shown when present — storage pins them top-level)
  const healthTop = HEALTH_ROOT_IDS.map((id) => pageById(id)).filter(
    (p): p is Page => Boolean(p) && !SIDEBAR_HIDDEN_IDS.has(p!.id) && !p!.trashedAt
  );

  // Learn ALWAYS prefers Bookshelf + World Monitor (stocks), even if parent got weird
  const learnTop = LEARN_ROOT_IDS.map((id) => pageById(id)).filter(
    (p): p is Page => Boolean(p) && !SIDEBAR_HIDDEN_IDS.has(p!.id) && !p!.trashedAt
  );

  // Preferred drop targets
  const learnNestId = pageById("pg-library")?.id || learnTop[0]?.id;
  const healthNestId = pageById("pg-fitness")?.id || healthTop[0]?.id;

  const sectionHealthClosed = collapsed[SECTION_KEYS.health] === true;
  const sectionLearnClosed = collapsed[SECTION_KEYS.learn] === true;

  const help = pages.find((p) => p.id === "pg-help");
  const trash = allPages.filter((p) => !!p.trashedAt);

  return (
    <aside
      className={`sidebar${open ? "" : " is-closed"}`}
      aria-label="Sidebar"
      style={
        open
          ? {
              width: sidebarWidth,
              minWidth: sidebarWidth,
              maxWidth: sidebarWidth,
            }
          : undefined
      }
    >
      {/* Drag the right edge to widen or narrow the main menu */}
      {open ? (
        <div
          className="sidebar-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to make the menu wider or narrower"
          onPointerDown={onSidebarResizeDown}
          onPointerMove={onSidebarResizeMove}
          onPointerUp={onSidebarResizeUp}
          onPointerCancel={onSidebarResizeUp}
        />
      ) : null}
      {/* Workspace name — like “Disciplined” */}
      <div className="sidebar-top">
        <button type="button" className="workspace-btn" title={workspaceName}>
          <span className="workspace-avatar" aria-hidden>
            {(workspaceName || "D").trim().charAt(0).toUpperCase()}
          </span>
          <span className="workspace-name">{workspaceName}</span>
        </button>
        <button type="button" className="sidebar-icon-btn" onClick={onClose}>
          «
        </button>
      </div>

      {/* Search is the only control above Agents. */}
      <div className="sidebar-home-row">
        <button
          type="button"
          className="sidebar-tool-btn"
          title="Search (⌘K)"
          onClick={onOpenSearch}
        >
          <MinimalIcon name="search" size={15} />
        </button>
      </div>

      {/* ── Agents — only real agents (no “Agents” hub page in the list) ── */}
      <div className="sidebar-section-label">Agents</div>
      <div className="sidebar-block">
        {agentPages.map((p) => (
          <div
            key={p.id}
            className={`page-row page-row-agent${
              p.id === activePageId ? " is-active" : ""
            }`}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/wonder-page", p.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const movingId = event.dataTransfer.getData("text/wonder-page");
              if (movingId) onMovePage(movingId, p.id);
            }}
          >
            <button
              type="button"
              className="page-row-main"
              onClick={() => onSelect(p.id)}
            >
              <PageIcon page={p} />
              <span className="page-title-side">
                {p.title.trim() || "Untitled agent"}
              </span>
            </button>
            {/* Always show delete for agents */}
            <button
              type="button"
              className="page-mini-btn page-agent-delete"
              title="Delete agent"
              onClick={(e) => {
                e.stopPropagation();
                onDeletePage(p.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="sidebar-new-soft" onClick={onNewAgent}>
          <span>+</span>
          <span>New agent</span>
        </button>
      </div>

      {/* ── Health — double-tap open · one tap close; kids start folded ── */}
      <SectionLabel
        label="Health"
        sectionKey={SECTION_KEYS.health}
        closed={sectionHealthClosed}
        nestTargetId={healthNestId}
        onOpen={openSection}
        onClose={closeSection}
        onNestInside={(movingId, nestId, sectionKey) => {
          onMovePage(movingId, nestId, "inside");
          openSectionAndParent(sectionKey, nestId);
        }}
      />
      {!sectionHealthClosed ? (
        <div className="sidebar-block sidebar-block-health">
          {healthTop.map((page) => (
            <PageTreeItem
              key={page.id}
              page={page}
              pages={pages}
              activePageId={activePageId}
              depth={0}
              collapsed={collapsed}
              onOpenBranch={openBranch}
              onCloseBranch={closeBranch}
              onSelect={onSelect}
              onDeletePage={onDeletePage}
              onToggleFavorite={onToggleFavorite}
              onMovePage={onMovePage}
            />
          ))}
        </div>
      ) : null}

      {/* ── Learn — double-tap open · one tap close ── */}
      <SectionLabel
        label="Learn"
        sectionKey={SECTION_KEYS.learn}
        closed={sectionLearnClosed}
        nestTargetId={learnNestId}
        onOpen={openSection}
        onClose={closeSection}
        onNestInside={(movingId, nestId, sectionKey) => {
          onMovePage(movingId, nestId, "inside");
          openSectionAndParent(sectionKey, nestId);
        }}
      />
      {!sectionLearnClosed ? (
        <div className="sidebar-scroll">
          {learnTop.map((page) => (
            <PageTreeItem
              key={page.id}
              page={page}
              pages={pages}
              activePageId={activePageId}
              depth={0}
              collapsed={collapsed}
              onOpenBranch={openBranch}
              onCloseBranch={closeBranch}
              onSelect={onSelect}
              onDeletePage={onDeletePage}
              onToggleFavorite={onToggleFavorite}
              onMovePage={onMovePage}
            />
          ))}
          {learnTop.length === 0 ? (
            <p className="sidebar-empty-hint">
              Bookshelf and World Monitor will show here after a refresh.
            </p>
          ) : null}
          <button type="button" className="sidebar-new" onClick={onNewPage}>
            <span>+</span>
            <span>New page</span>
          </button>
        </div>
      ) : null}

      {/* Bottom utility links — like Notion */}
      <div className="sidebar-bottom">
        {help && (
          <button
            type="button"
            className={`sidebar-bottom-link${
              activePageId === help.id ? " is-active" : ""
            }`}
            onClick={() => onSelect(help.id)}
          >
            <span className="side-icon" aria-hidden>
              <MinimalIcon name={iconForPage(help)} size={16} />
            </span>
            <span>Help</span>
          </button>
        )}

        <button
          type="button"
          className="sidebar-section-toggle sidebar-trash-toggle"
          onClick={toggleTrash}
          aria-expanded={showTrash}
        >
          {/* No triangle — trash icon + label only */}
          <span className="side-icon" aria-hidden>
            <MinimalIcon name="trash" size={16} />
          </span>
          <span className="sidebar-section-text">
            Trash{trash.length ? ` (${trash.length})` : ""}
          </span>
        </button>
        {showTrash && (
          <div className="sidebar-block">
            {trash.length === 0 && (
              <p className="sidebar-empty-hint">Trash is empty</p>
            )}
            {trash.map((p) => (
              <div key={p.id} className="page-row">
                <button
                  type="button"
                  className="page-row-main"
                  onClick={() => onRestorePage?.(p.id)}
                  title="Restore"
                >
                  <PageIcon page={p} />
                  <span className="page-title-side">
                    {p.title.trim() || "Untitled"}
                  </span>
                </button>
              </div>
            ))}
            {trash.length > 0 && onEmptyTrash && (
              <button
                type="button"
                className="sidebar-new-soft"
                onClick={() => {
                  if (window.confirm("Permanently empty trash?"))
                    onEmptyTrash();
                }}
              >
                Empty trash
              </button>
            )}
          </div>
        )}

        {onReimport && (
          <button
            type="button"
            className="sidebar-new-soft"
            style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}
            onClick={onReimport}
          >
            <span>↺</span>
            <span>Restore full workspace</span>
          </button>
        )}
      </div>
    </aside>
  );
}
