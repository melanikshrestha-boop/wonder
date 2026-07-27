import { useEffect, useMemo, useRef, useState } from "react";
import type { Workspace } from "./types";
import { forceImportWonder, loadWorkspace, saveWorkspace } from "./storage";
import {
  activePages,
  addAgentPage,
  addChildPage,
  breadcrumbTrail,
  createSubpageFromBlock,
  duplicatePage,
  emptyTrash,
  restorePage,
  setActivePage,
  softDeletePage,
  toggleFavorite,
  updatePageInWs,
  movePageBefore,
} from "./workspaceOps";
import { Sidebar } from "./components/Sidebar";
import { PageEditor } from "./components/PageEditor";
import { SearchModal } from "./components/SearchModal";
import { iconForPage, MinimalIcon } from "./components/MinimalIcon";
import { isMelaniRichPage, MelaniRichPage } from "./melani/MelaniViews";
import { isHygienePage } from "./melani/pageRoutes";
import { isWardrobePage } from "./melani/wardrobe/route";
import { MelaniAI } from "./melani/MelaniAI";
import { SelectionResearch } from "./melani/SelectionResearch";
import { FocusOverlay } from "./melani/FocusOverlay";
import {
  MEL_NAVIGATE_EVENT,
  MEL_WORKSPACE_ACTION_EVENT,
  type MelWorkspaceActionRequest,
} from "./melani/melActions";
import { applyMelWorkspaceAction } from "./melani/melWorkspace";
import { canUndo, performUndo, pushUndo } from "./undoStack";
import {
  applyTheme,
  loadTheme,
  toggleTheme,
  type WonderTheme,
} from "./theme";
import "./notion.css";

/**
 * Notion workspace shell ALWAYS stays on.
 * Gym / Fitness / Data are special content INSIDE a Notion page —
 * never full-bleed that hides the sidebar, breadcrumbs, or New page.
 * (Restored from commit 1009966 layout before fitness full-bleed.)
 */
export default function App() {
  const [ws, setWs] = useState<Workspace>(() => {
    if (typeof window === "undefined") return forceImportWonder();
    // Allow deep-link: ?page=pg-meals (opens that page on load)
    const base = loadWorkspace();
    try {
      const page = new URLSearchParams(window.location.search).get("page");
      if (page && base.pages?.some((p) => p.id === page)) {
        return { ...base, activePageId: page };
      }
    } catch {
      /* ignore */
    }
    return base;
  });
  const [theme, setTheme] = useState<WonderTheme>(() => {
    const t = loadTheme();
    applyTheme(t);
    return t;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [compactLayout, setCompactLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 768px)").matches
      : false
  );
  const [compactSidebarOpen, setCompactSidebarOpen] = useState(false);
  const workspaceRef = useRef(ws);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    workspaceRef.current = ws;
    saveWorkspace(ws);
  }, [ws]);

  // Keep document theme in sync (Habits stays light via CSS even if dark is set)
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px)");
    const syncLayout = (matches: boolean) => {
      setCompactLayout(matches);
      // Never leave the dimmed drawer backdrop stuck when size class changes
      setCompactSidebarOpen(false);
    };

    syncLayout(query.matches);
    const onChange = (event: MediaQueryListEvent) => syncLayout(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  /** Save a restore point, then apply a change (drag, delete, Mel, etc.) */
  function commitWorkspace(mutator: (current: Workspace) => Workspace) {
    setWs((current) => {
      const next = mutator(current);
      if (next === current) return current;
      // Global **U** stack — pages, Mel, Finances share one undo history
      const snapshot = current;
      pushUndo("Workspace", () => {
        workspaceRef.current = snapshot;
        saveWorkspace(snapshot);
        setWs(snapshot);
      });
      workspaceRef.current = next;
      return next;
    });
  }

  /** Undo last change. Press **U** or click topbar U. */
  function undoLastChange(): boolean {
    return performUndo().ok;
  }

  // Global shortcuts — like Notion
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target instanceof HTMLElement ? target : null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.isContentEditable || Boolean(el.closest("[contenteditable='true']"));
    }

    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (meta && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (meta && e.key.toLowerCase() === "n" && !e.shiftKey) {
        e.preventDefault();
        commitWorkspace((prev) => addChildPage(prev, prev.activePageId));
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        commitWorkspace((prev) => addChildPage(prev, null));
      }
      // **U** = Undo (your shortcut). Also ⌘Z / Ctrl+Z when not typing.
      const isU =
        !meta && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "u";
      const isCmdZ = meta && !e.shiftKey && e.key.toLowerCase() === "z";
      if (isU || isCmdZ) {
        if (isTypingTarget(e.target)) return;
        if (!canUndo()) return;
        e.preventDefault();
        undoLastChange();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const live = useMemo(() => activePages(ws), [ws]);
  const activePage = useMemo(
    () => live.find((p) => p.id === ws.activePageId) || live[0],
    [ws, live]
  );

  useEffect(() => {
    if (!activePage || typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("page", activePage.id);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* The workspace still navigates if URL history is unavailable. */
    }
  }, [activePage]);

  // Page navigation starts at the page header. Changes inside the same page
  // keep the exact scroll position, so logging or toggling never jumps.
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activePage?.id]);

  const childPages = useMemo(
    () =>
      activePage
        ? live.filter((p) => p.parentId === activePage.id)
        : [],
    [live, activePage]
  );

  const crumbs = useMemo(
    () => (activePage ? breadcrumbTrail(ws, activePage.id) : []),
    [ws, activePage]
  );

  function openPage(id: string) {
    setWs((prev) => setActivePage(prev, id));
    // Always dismiss mobile drawer + scrim when navigating
    setCompactSidebarOpen(false);
    setMoreOpen(false);
  }

  useEffect(() => {
    const navigate = (event: Event) => {
      const pageId = (event as CustomEvent<{ pageId: string }>).detail?.pageId;
      if (!pageId) return;
      setWs((prev) => {
        // Mel transport: if system page missing, seed it so setActivePage works
        let next = prev;
        if (!next.pages.some((p) => p.id === pageId && !p.trashedAt)) {
          const titles: Record<string, string> = {
            "pg-am-skin": "AM skincare",
            "pg-pm-skin": "PM skincare",
            "pg-shower-daily": "Daily shower",
            "pg-shower-everything": "Everything shower",
            "pg-hair": "Hair care",
            "pg-hygiene": "Hygiene",
            "pg-sleep": "Sleep",
            "pg-meals": "Meals",
            "pg-gym": "Gym",
            "pg-focus": "Focus",
            "pg-fitness": "Fitness",
            "pg-habits": "Habits",
            "pg-library": "Bookshelf",
            "pg-finance": "Finances",
            "pg-math": "Content",
            "pg-failures": "Failures",
            "pg-agent-care": "Care Concierge",
            "pg-fashion-os": "Wardrobe",
            "pg-data": "My Data",
            "pg-screentime": "Focus",
            "pg-screen-time": "Focus",
          };
          const title = titles[pageId];
          if (title) {
            const parentId =
              pageId.startsWith("pg-shower") ||
              pageId === "pg-hair" ||
              pageId === "pg-am-skin" ||
              pageId === "pg-pm-skin"
                ? "pg-hygiene"
                : pageId === "pg-sleep" ||
                    pageId === "pg-meals" ||
                    pageId === "pg-gym" ||
                    pageId === "pg-focus" ||
                    pageId === "pg-screentime" ||
                    pageId === "pg-screen-time"
                  ? "pg-fitness"
                  : null;
            const now = Date.now();
            next = {
              ...next,
              pages: [
                ...next.pages,
                {
                  id: pageId,
                  title,
                  icon: "",
                  parentId,
                  createdAt: now,
                  updatedAt: now,
                  blocks: [{ id: `b-${now}`, type: "paragraph" as const, text: "" }],
                  kind: "page" as const,
                  favorite: false,
                  trashedAt: null,
                  cover: null,
                },
              ],
            };
          }
        }
        return setActivePage(next, pageId);
      });
      if (window.matchMedia("(max-width: 768px)").matches) {
        setCompactSidebarOpen(false);
      }
      // Keep URL deep-link honest so refresh stays on that desk
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("page", pageId);
        window.history.replaceState({}, "", url.toString());
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(MEL_NAVIGATE_EVENT, navigate);
    return () => window.removeEventListener(MEL_NAVIGATE_EVENT, navigate);
  }, []);

  useEffect(() => {
    const runWorkspaceAction = (event: Event) => {
      const request = (event as CustomEvent<MelWorkspaceActionRequest>).detail;
      if (!request?.action) return;

      if (request.action.kind === "undo-workspace") {
        if (!canUndo()) {
          request.result = {
            ok: false,
            summary:
              "Nothing to undo yet. Change a page, Finances, or ask Mel first — then press U.",
          };
          return;
        }
        const ok = undoLastChange();
        if (!ok) {
          request.result = { ok: false, summary: "Nothing to undo yet." };
          return;
        }
        const restored = workspaceRef.current.pages.find(
          (page) => page.id === workspaceRef.current.activePageId
        );
        request.result = {
          ok: true,
          summary:
            "Undid the last change (press U anytime — pages, Mel, Finances).",
          pageId: restored?.id,
          pageTitle: restored?.title,
        };
        return;
      }

      const before = workspaceRef.current;
      const applied = applyMelWorkspaceAction(before, request.action);
      request.result = applied.result;
      if (!applied.changed) return;

      // Same global **U** stack as drag-and-drop / topbar button
      pushUndo("Workspace", () => {
        workspaceRef.current = before;
        saveWorkspace(before);
        setWs(before);
      });
      workspaceRef.current = applied.workspace;
      saveWorkspace(applied.workspace);
      setWs(applied.workspace);
      setMoreOpen(false);
    };

    window.addEventListener(MEL_WORKSPACE_ACTION_EVENT, runWorkspaceAction);
    return () => window.removeEventListener(MEL_WORKSPACE_ACTION_EVENT, runWorkspaceAction);
  }, []);

  if (!activePage) return null;

  // Melani UI is content inside this Notion page (not a separate app mode)
  const melaniMode = isMelaniRichPage(activePage.id);
  const sidebarIsOpen = compactLayout ? compactSidebarOpen : ws.sidebarOpen;

  return (
    <div className="app">
      {compactLayout && compactSidebarOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={() => setCompactSidebarOpen(false)}
        />
      ) : null}
      <Sidebar
        workspaceName={ws.name}
        pages={live}
        allPages={ws.pages}
        recents={ws.recents || []}
        activePageId={activePage.id}
        open={sidebarIsOpen}
        onSelect={openPage}
        onNewPage={() => commitWorkspace((p) => addChildPage(p, p.activePageId))}
        onNewTopPage={() => commitWorkspace((p) => addChildPage(p, null))}
        onNewAgent={() => commitWorkspace((p) => addAgentPage(p))}
        onDeletePage={(id) => commitWorkspace((p) => softDeletePage(p, id))}
        onToggleFavorite={(id) => commitWorkspace((p) => toggleFavorite(p, id))}
        onMovePage={(movingId, targetId, position = "before") =>
          commitWorkspace((current) => {
            // Drag reorder or nest — always leave an undo point
            if (position === "before") return movePageBefore(current, movingId, targetId);
            const applied = applyMelWorkspaceAction(current, {
              kind: "move-page",
              target: { id: movingId },
              destination: { id: targetId },
              position: "inside",
            });
            return applied.changed ? applied.workspace : current;
          })
        }
        onOpenSearch={() => setSearchOpen(true)}
        onClose={() => {
          if (compactLayout) setCompactSidebarOpen(false);
          else setWs((p) => ({ ...p, sidebarOpen: false }));
        }}
        onRestorePage={(id) => commitWorkspace((p) => restorePage(p, id))}
        onEmptyTrash={() => commitWorkspace((p) => emptyTrash(p))}
        onReimport={() => {
          if (
            window.confirm(
              "Re-import full Wonder export? Local edits to the tree may be replaced."
            )
          ) {
            commitWorkspace(() => forceImportWonder());
          }
        }}
      />

      {/* Always Notion main: topbar + breadcrumbs + page body */}
      <main
        className={`main${melaniMode ? " is-melani" : ""}${
          isWardrobePage(activePage.id) ? " is-wardrobe" : ""
        }${
          activePage.id === "pg-finance" || activePage.id === "pg-finances"
            ? " is-finances"
            : ""
        }${activePage.id === "pg-habits" ? " is-habits" : ""}${
          isHygienePage(activePage.id) ? " is-hygiene" : ""
        }`}
      >
        <header className="topbar">
          <button
            type="button"
            className="topbar-btn"
            onClick={() => {
              if (compactLayout) setCompactSidebarOpen((open) => !open);
              else setWs((p) => ({ ...p, sidebarOpen: !p.sidebarOpen }));
            }}
            title="Toggle sidebar"
          >
            ☰
          </button>

          <div className="breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.id} className="breadcrumb-seg">
                {i > 0 && <span className="breadcrumb-sep">/</span>}
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={() => openPage(c.id)}
                >
                  <span className="breadcrumb-icon" aria-hidden>
                    <MinimalIcon
                      name={
                        c.kind === "database" ? "docs" : iconForPage(c)
                      }
                      size={14}
                    />
                  </span>
                  <span className="breadcrumb-title">
                    {c.title.trim() || "Untitled"}
                  </span>
                </button>
              </span>
            ))}
          </div>

          <div className="topbar-spacer" />
          {/* Tight cluster: same size, almost flush — no “Edited …” meta */}
          <div className="topbar-actions">
            <button
              type="button"
              className="topbar-btn topbar-theme-btn"
              title={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode (Habits white + Source Serif)"
              }
              aria-label={
                theme === "light" ? "Switch to dark mode" : "Switch to light mode"
              }
              onClick={() => setTheme((t) => toggleTheme(t))}
            >
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <button
              type="button"
              className="topbar-btn"
              title="Favorite"
              onClick={() =>
                commitWorkspace((p) => toggleFavorite(p, activePage.id))
              }
            >
              {activePage.favorite ? "★" : "☆"}
            </button>
            <button
              type="button"
              className="topbar-btn"
              title="Search (⌘K)"
              onClick={() => setSearchOpen(true)}
            >
              ⌕
            </button>
            <div className="topbar-more-wrap">
              <button
                type="button"
                className="topbar-btn"
                title="More"
                onClick={() => setMoreOpen((v) => !v)}
              >
                ···
              </button>
            {moreOpen && (
              <div className="more-menu">
                <button
                  type="button"
                  onClick={() => {
                    if (!undoLastChange()) {
                      window.alert("Nothing to undo yet. Press U after an edit.");
                    }
                    setMoreOpen(false);
                  }}
                >
                  Undo last change
                </button>
                <button
                  type="button"
                  onClick={() => {
                    commitWorkspace((p) => duplicatePage(p, activePage.id));
                    setMoreOpen(false);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    commitWorkspace((p) => softDeletePage(p, activePage.id));
                    setMoreOpen(false);
                  }}
                >
                  Move to Trash
                </button>
                <button
                  type="button"
                  onClick={() => {
                    commitWorkspace((p) => addChildPage(p, p.activePageId));
                    setMoreOpen(false);
                  }}
                >
                  New sub-page here
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWs((p) => emptyTrash(p));
                    setMoreOpen(false);
                  }}
                >
                  Empty trash
                </button>
              </div>
            )}
            </div>
          </div>
          <MelaniAI pageId={activePage.id} pageTitle={activePage.title} />
          <SelectionResearch />
        </header>

        {/* Page body scrolls here — Notion pages OR Melani content inside page */}
        <div ref={mainScrollRef} className="main-scroll">
          {melaniMode ? (
            /* Sleep / Meals / Gym live in the SIDEBAR only */
            <div className="notion-melani-page">
              <div className="notion-melani-body">
                <MelaniRichPage
                  pageId={activePage.id}
                  onGo={openPage}
                  pages={live}
                />
              </div>
            </div>
          ) : (
            <PageEditor
              page={activePage}
              allPages={ws.pages}
              childPages={childPages}
              onUpdatePage={(page) => setWs((p) => updatePageInWs(p, page))}
              onOpenPage={openPage}
              onCreateSubpage={(blockIndex) =>
                setWs((p) =>
                  createSubpageFromBlock(p, activePage.id, blockIndex)
                )
              }
              onDeletePage={(id) => setWs((p) => softDeletePage(p, id))}
            />
          )}
        </div>
      </main>

      {searchOpen && (
        <SearchModal
          ws={ws}
          onOpen={openPage}
          onClose={() => setSearchOpen(false)}
          onRestore={(id) => {
            setWs((p) => restorePage(p, id));
            setSearchOpen(false);
          }}
        />
      )}

      <FocusOverlay />
    </div>
  );
}
