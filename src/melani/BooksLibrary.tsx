/** Wonder Library: Apple Books, Wonder reading pages, progress, notes, and quotes. */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  BookOpen,
  CaretRight,
  Check,
  DownloadSimple,
  FolderPlus,
  FolderSimple,
  MagnifyingGlass,
  Moon,
  NotePencil,
  PencilSimple,
  Plus,
  Quotes,
  Sun,
  TextAa,
  X,
} from "@phosphor-icons/react";
import { MinimalIcon } from "../components/MinimalIcon";
import type { Page } from "../types";
import {
  fetchAppleBooks,
  mergeAppleBooks,
  mergeWonderBookPages,
} from "./appleBooks";
import { fetchLocalBooks, mergeLocalBooks } from "./localBooks";
import {
  enrichBooksWithCovers,
  goodreadsSearchUrl,
  parseGoodreadsCsv,
} from "./bookCovers";
import { GREATS_AUTHORS } from "./greatsBlogs";
import {
  BOOK_OPEN_EVENT,
  type Book,
  type BookCategory,
  type BookMedium,
  type BookQuote,
  type BookStatus,
  STATUS_LABEL,
  STATUS_ORDER,
  categorizeBook,
  loadBooks,
  markBookDeleted,
  newBook,
  newQuote,
  saveBooks,
  takeBookOpenRequest,
  type BookOpenRequest,
} from "./booksStore";
import {
  createBookFolder,
  includeBookFolders,
  loadBookFolders,
  saveBookFolders,
  type BookFolder,
} from "./bookFolders";
import {
  BOOK_DISCOVERY_EVENT,
  searchLegalBooks,
  takeBookDiscoveryRequest,
  type BookDiscoveryRequest,
  type BookDiscoveryResult,
} from "./bookDiscovery";
import {
  loadBooksPreferences,
  READING_FONT_OPTIONS,
  saveBooksPreferences,
  type BooksTheme,
  type ReadingFont,
} from "./booksPreferences";
import "./books-library.css";

const BookReader = lazy(async () => {
  const module = await import("./BookReader");
  return { default: module.BookReader };
});

/**
 * Library sections (top chips):
 * All · Books · Audiobooks · Blogs · Finished
 * - All: the complete real library + blogs underneath
 * - Books: book drives only
 * - Audiobooks: any title marked as audiobook (including overlaps)
 * - Blogs: greats blogs/essays only
 * - Finished: completed books across all formats
 */
type Filter =
  | "all"
  | "books"
  | "ebooks"
  | "audiobooks"
  | "physical"
  | "blogs"
  | BookStatus;
type GroupMode = "subjects" | "status";
type ShelfGroup = {
  id: string;
  label: string;
  books: Book[];
  accent: string;
  canRename: boolean;
};

const LIBRARY_CHIPS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "books", label: "Books" },
  { id: "ebooks", label: "Ebooks" },
  { id: "audiobooks", label: "Audiobooks" },
  { id: "physical", label: "Physical" },
  { id: "blogs", label: "Blogs" },
  { id: "finished", label: "Finished" },
];

const LIBRARY_VIEW_KEY = "wonder-bookshelf-view-v1";

type LibraryViewState = {
  filter?: Filter;
  groupMode?: GroupMode;
  openFolders?: Record<string, boolean>;
};

function loadLibraryView(): LibraryViewState {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LIBRARY_VIEW_KEY) || "{}"
    ) as LibraryViewState;
    const validFilter = LIBRARY_CHIPS.some((chip) => chip.id === parsed.filter);
    return {
      filter: validFilter ? parsed.filter : undefined,
      groupMode:
        parsed.groupMode === "subjects" || parsed.groupMode === "status"
          ? parsed.groupMode
          : undefined,
      openFolders:
        parsed.openFolders && typeof parsed.openFolders === "object"
          ? parsed.openFolders
          : undefined,
    };
  } catch {
    return {};
  }
}

function saveLibraryView(view: LibraryViewState) {
  try {
    window.localStorage.setItem(LIBRARY_VIEW_KEY, JSON.stringify(view));
  } catch {
    /* The current view still works when browser storage is unavailable. */
  }
}

function isBookStatusFilter(filter: Filter): filter is BookStatus {
  return (
    filter === "reading" ||
    filter === "want" ||
    filter === "finished" ||
    filter === "paused"
  );
}

function BooksAppearanceControls({
  theme,
  font,
  onTheme,
  onFont,
  compact = false,
}: {
  theme: BooksTheme;
  font: ReadingFont;
  onTheme: (theme: BooksTheme) => void;
  onFont: (font: ReadingFont) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`bl-appearance${compact ? " is-compact" : ""}`}
      aria-label="Bookshelf appearance"
    >
      <div className="bl-theme-choice" role="group" aria-label="Reading theme">
        <button
          type="button"
          className={theme === "light" ? "is-on" : ""}
          aria-pressed={theme === "light"}
          onClick={() => onTheme("light")}
          title="Light reading theme"
        >
          <Sun size={14} aria-hidden />
          <span>Light</span>
        </button>
        <button
          type="button"
          className={theme === "dark" ? "is-on" : ""}
          aria-pressed={theme === "dark"}
          onClick={() => onTheme("dark")}
          title="Dark reading theme"
        >
          <Moon size={14} aria-hidden />
          <span>Dark</span>
        </button>
      </div>
      <label className="bl-font-choice">
        <TextAa size={15} aria-hidden />
        <span className="bl-sr-only">Reading font</span>
        <select
          aria-label="Reading font"
          value={font}
          onChange={(event) => onFont(event.target.value as ReadingFont)}
        >
          {READING_FONT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

type SyncState =
  | { state: "idle"; message: string }
  | { state: "syncing"; message: string }
  | { state: "done"; message: string }
  | { state: "error"; message: string };
type FinderState = "idle" | "searching" | "done" | "error";

function stars(n: number): string {
  if (n <= 0) return "";
  return "★".repeat(Math.min(5, n));
}

function progressPercent(progress: number): string {
  const percent = Math.max(0, Math.min(100, progress * 100));
  return percent > 0 && percent < 1 ? percent.toFixed(1) : String(Math.round(percent));
}

type FolderTone = CSSProperties & {
  "--bl-folder-accent": string;
  "--bl-folder-wash": string;
};

const STATUS_TONES: Record<BookStatus, string> = {
  reading: "#72b9d6",
  want: "#b89adc",
  paused: "#d6b367",
  finished: "#65c5a6",
};

function folderTone(accent: string): FolderTone {
  const normalized = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#8e98a6";
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return {
    "--bl-folder-accent": normalized,
    "--bl-folder-wash": `rgba(${red}, ${green}, ${blue}, 0.09)`,
  };
}

export function isBooksPage(pageId: string): boolean {
  return pageId === "pg-books" || pageId === "pg-library";
}

export function BooksLibrary({
  onGo,
  workspacePages = [],
}: {
  onGo?: (id: string) => void;
  workspacePages?: Page[];
}) {
  const [books, setBooks] = useState<Book[]>(() => loadBooks());
  const [booksPreferences, setBooksPreferences] = useState(() =>
    loadBooksPreferences()
  );
  const [folders, setFolders] = useState<BookFolder[]>(() =>
    includeBookFolders(loadBookFolders(), loadBooks())
  );
  const [filter, setFilter] = useState<Filter>(
    () => loadLibraryView().filter || "all"
  );
  const [groupMode, setGroupMode] = useState<GroupMode>(
    () => loadLibraryView().groupMode || "subjects"
  );
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(
    () => loadLibraryView().openFolders || {}
  );
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [readerId, setReaderId] = useState<string | null>(null);
  const [readerStartCfi, setReaderStartCfi] = useState<string | undefined>();
  const [showAllHighlights, setShowAllHighlights] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameDraft, setFolderRenameDraft] = useState("");
  const [draggingBookId, setDraggingBookId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderQuery, setFinderQuery] = useState("");
  const [finderState, setFinderState] = useState<FinderState>("idle");
  const [finderMessage, setFinderMessage] = useState("");
  const [finderResults, setFinderResults] = useState<BookDiscoveryResult[]>([]);
  /** Short popup: "Saved to Want → Business & Money" */
  const [toast, setToast] = useState<string | null>(null);
  const [wantBusy, setWantBusy] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAuthor, setDraftAuthor] = useState("");
  const [draftCategory, setDraftCategory] = useState<BookCategory>("Unsorted");
  const [quoteDraft, setQuoteDraft] = useState("");
  const [quotePage, setQuotePage] = useState("");
  const [quoteNoteDraft, setQuoteNoteDraft] = useState("");
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [interpretationDraft, setInterpretationDraft] = useState("");
  const [sync, setSync] = useState<SyncState>({
    state: "idle",
    message: "Apple Books",
  });
  const searchRef = useRef<HTMLInputElement>(null);
  /** Deep-link applied once: ?page=pg-library&book=id&read=1 */
  const deepLinkDone = useRef(false);

  useEffect(() => {
    saveBooksPreferences(booksPreferences);
  }, [booksPreferences]);

  function setBooksTheme(theme: BooksTheme) {
    setBooksPreferences((current) => ({ ...current, theme }));
  }

  function setReadingFont(font: ReadingFont) {
    setBooksPreferences((current) => ({ ...current, font }));
  }

  // Auto-hide placement toast after a few seconds
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const handleLibraryShortcut = (event: KeyboardEvent) => {
      if (!searchRef.current) return;
      const target =
        event.target instanceof HTMLElement ? event.target : null;
      const isEditing =
        target?.matches("input, textarea, select, [contenteditable='true']") ||
        Boolean(target?.closest("[contenteditable='true']"));
      if (event.key === "/" && !isEditing) {
        event.preventDefault();
        searchRef.current.focus();
        return;
      }
      if (event.key === "Escape") {
        setFinderOpen(false);
        setAdding(false);
        setAddingFolder(false);
        setQ("");
        searchRef.current.blur();
      }
    };
    window.addEventListener("keydown", handleLibraryShortcut);
    return () => window.removeEventListener("keydown", handleLibraryShortcut);
  }, []);

  useEffect(() => {
    saveBooks(books);
  }, [books]);

  useEffect(() => {
    saveBookFolders(folders);
  }, [folders]);

  useEffect(() => {
    saveLibraryView({ filter, groupMode, openFolders });
  }, [filter, groupMode, openFolders]);

  useEffect(() => {
    setFolders((current) => includeBookFolders(current, books));
  }, [books]);

  useEffect(() => {
    setShowAllHighlights(false);
  }, [openId]);

  useEffect(() => {
    if (!workspacePages.length) return;
    setBooks((current) => mergeWonderBookPages(current, workspacePages));
  }, [workspacePages]);

  const syncApple = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setSync({ state: "syncing", message: "Syncing Apple Books" });
    }
    try {
      const result = await fetchAppleBooks();
      setBooks((current) => mergeAppleBooks(current, result.books));
      if (!options?.quiet) {
        setSync({
          state: "done",
          message: `${result.count} from Apple Books`,
        });
      } else {
        // Quiet poll still updates the badge with live annotation counts
        setSync((prev) =>
          prev.state === "error"
            ? prev
            : {
                state: "done",
                message: `${result.count} books · annotations live`,
              }
        );
      }
    } catch {
      // No backend reachable (e.g. the shared web link, or the local server
      // isn't running). Apple Books can only be read from your own Mac.
      if (!options?.quiet) {
        setSync({
          state: "error",
          message:
            "Apple Books syncs on your Mac — run Wonder locally to pull your library",
        });
      }
    }
  }, []);

  /**
   * Pull EPUBs from Downloads + Documents books folders.
   * New EPUB downloads show up automatically while Bookshelf is open.
   */
  const syncLocalFiles = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setSync({ state: "syncing", message: "Scanning Downloads" });
    }
    try {
      const result = await fetchLocalBooks();
      setBooks((current) => {
        const merged = mergeLocalBooks(current, result.books);
        if (merged.addedCount > 0) {
          const names = merged.addedTitles.slice(0, 2).join(" · ");
          const msg =
            merged.addedCount === 1
              ? `New book · ${names}`
              : `${merged.addedCount} new books · ${names}${
                  merged.addedCount > 2 ? "…" : ""
                }`;
          // Toast after React applies the shelf update
          window.queueMicrotask(() => setToast(msg));
        }
        return merged.books;
      });
      if (!options?.quiet) {
        setSync({
          state: "done",
          message: `${result.count} local EPUB${result.count === 1 ? "" : "s"}`,
        });
      }
    } catch (error) {
      if (!options?.quiet) {
        setSync({
          state: "error",
          message:
            error instanceof Error ? error.message : "Local books unavailable",
        });
      }
    }
  }, []);

  /** Pull covers from Open Library for books that only show a plain spine */
  const enrichCovers = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setSync({ state: "syncing", message: "Finding covers" });
    }
    try {
      // Snapshot current shelf, enrich, write back
      let snapshot: Book[] = [];
      setBooks((current) => {
        snapshot = current;
        return current;
      });
      // Allow React to flush the snapshot read
      await new Promise((r) => window.setTimeout(r, 0));
      const result = await enrichBooksWithCovers(snapshot, {
        limit: 16,
        fixUnsorted: true,
      });
      setBooks(result.books);
      if (result.filled > 0) {
        setToast(
          result.filled === 1
            ? "Cover found for 1 book"
            : `Covers found for ${result.filled} books`
        );
      }
      if (!options?.quiet) {
        setSync({
          state: "done",
          message:
            result.filled > 0
              ? `${result.filled} cover${result.filled === 1 ? "" : "s"} updated`
              : "Covers checked",
        });
      }
    } catch {
      if (!options?.quiet) {
        setSync({ state: "error", message: "Cover lookup failed" });
      }
    }
  }, []);

  const syncAll = useCallback(async () => {
    await syncApple();
    await syncLocalFiles();
    await enrichCovers({ quiet: true });
  }, [syncApple, syncLocalFiles, enrichCovers]);

  useEffect(() => {
    void syncAll();
  }, [syncAll]);

  // Keep library + annotations live while Bookshelf is open
  // Apple Books annotations, Downloads EPUBs, covers — no manual refresh needed
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void syncApple({ quiet: true }).then(() =>
        syncLocalFiles({ quiet: true }).then(() =>
          enrichCovers({ quiet: true })
        )
      );
    };
    const timer = window.setInterval(tick, 25_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [syncApple, syncLocalFiles, enrichCovers]);

  /** Goodreads library CSV → Want / Reading / Finished shelves */
  function importGoodreadsCsv(file: File | null) {
    if (!file) return;
    void file.text().then((text) => {
      const rows = parseGoodreadsCsv(text);
      if (!rows.length) {
        setToast("No books found in that Goodreads export");
        return;
      }
      let added = 0;
      setBooks((current) => {
        const next = [...current];
        for (const row of rows) {
          const norm = row.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          const exists = next.some(
            (b) =>
              b.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === norm
          );
          if (exists) continue;
          const status =
            row.shelf === "read" || row.shelf === "currently-reading"
              ? row.shelf === "read"
                ? "finished"
                : "reading"
              : "want";
          const category = categorizeBook(row.title, row.author);
          next.unshift(
            newBook({
              title: row.title,
              author: row.author,
              status,
              statusOverride: true,
              category,
              rating: row.rating,
              coverUrl: row.coverUrl || undefined,
              externalUrl: goodreadsSearchUrl(row.title, row.author),
              source: "manual",
              format: "manual",
              description: "Imported from your Goodreads library export.",
            })
          );
          added += 1;
        }
        return next;
      });
      setToast(
        added
          ? `Goodreads · added ${added} book${added === 1 ? "" : "s"}`
          : "Goodreads · all books already on shelf"
      );
      // Pull real covers for new rows
      window.setTimeout(() => void enrichCovers({ quiet: true }), 400);
    });
  }

  const runFinderSearch = useCallback(async (query: string) => {
    const cleaned = query.trim();
    if (!cleaned) return;
    setFinderOpen(true);
    setFinderQuery(cleaned);
    setFinderState("searching");
    setFinderMessage("Searching legal catalogs...");
    try {
      const results = await searchLegalBooks(cleaned);
      setFinderResults(results);
      setFinderState("done");
      setFinderMessage(
        results.length
          ? `${results.length} legal sources found`
          : "No catalog match found"
      );
    } catch (error) {
      setFinderResults([]);
      setFinderState("error");
      setFinderMessage(
        error instanceof Error ? error.message : "Book search is unavailable."
      );
    }
  }, []);

  useEffect(() => {
    const openFinder = (request: BookDiscoveryRequest | null) => {
      if (!request) return;
      void runFinderSearch(request.query);
    };
    const onRequest = (event: Event) => {
      takeBookDiscoveryRequest();
      openFinder((event as CustomEvent<BookDiscoveryRequest>).detail);
    };
    window.addEventListener(BOOK_DISCOVERY_EVENT, onRequest);
    openFinder(takeBookDiscoveryRequest());
    return () => window.removeEventListener(BOOK_DISCOVERY_EVENT, onRequest);
  }, [runFinderSearch]);

  const open = books.find((book) => book.id === openId) || null;
  const reader = books.find((book) => book.id === readerId) || null;

  useEffect(() => {
    const openRequestedBook = (request: BookOpenRequest | null) => {
      if (!request) return;
      const requested = books.find((book) => book.id === request.bookId);
      if (!requested) return;
      setOpenId(null);
      if (requested.readerUrl) {
        setReaderStartCfi(request.startCfi);
        setReaderId(requested.id);
      } else {
        setReaderId(null);
        setReaderStartCfi(undefined);
        setOpenId(requested.id);
      }
    };
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<BookOpenRequest>).detail;
      takeBookOpenRequest();
      openRequestedBook(detail);
    };
    window.addEventListener(BOOK_OPEN_EVENT, onRequest);
    openRequestedBook(takeBookOpenRequest());
    return () => window.removeEventListener(BOOK_OPEN_EVENT, onRequest);
  }, [books]);

  const stats = useMemo(
    () => ({
      total: books.length,
      reading: books.filter((book) => book.status === "reading").length,
      want: books.filter((book) => book.status === "want").length,
      finished: books.filter((book) => book.status === "finished").length,
      quotes: books.reduce((count, book) => count + book.quotes.length, 0),
    }),
    [books]
  );

  const sectionCounts = useMemo<Record<Filter, number>>(
    () => ({
      all: books.length + GREATS_AUTHORS.length,
      books: books.length,
      ebooks: books.filter((book) => book.readingFormats?.includes("ebook"))
        .length,
      audiobooks: books.filter((book) =>
        book.readingFormats?.includes("audiobook")
      ).length,
      physical: books.filter((book) =>
        book.readingFormats?.includes("physical")
      ).length,
      blogs: GREATS_AUTHORS.length,
      reading: stats.reading,
      want: stats.want,
      paused: books.filter((book) => book.status === "paused").length,
      finished: stats.finished,
    }),
    [books, stats.finished, stats.reading, stats.want]
  );

  const filtered = useMemo(() => {
    // Blogs tab is essays only — no books in the list.
    if (filter === "blogs") return [] as Book[];
    const query = q.trim().toLowerCase();
    return books
      .filter((book) => {
        const formatFilter: Partial<Record<Filter, BookMedium>> = {
          ebooks: "ebook",
          audiobooks: "audiobook",
          physical: "physical",
        };
        const requiredFormat = formatFilter[filter];
        if (
          requiredFormat &&
          !book.readingFormats?.includes(requiredFormat)
        ) {
          return false;
        }
        // Status chips: Reading / Next (want) / Done / Paused
        if (isBookStatusFilter(filter) && book.status !== filter) return false;
        // all + books: every status (drives of books)
        if (!query) return true;
        return [
          book.title,
          book.author,
          book.category,
          book.notes,
          book.description || "",
          ...book.quotes.flatMap((quote) => [
            quote.text,
            quote.note || "",
            quote.interpretation || "",
          ]),
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => {
        const leftActive = left.status === "reading" ? 1 : 0;
        const rightActive = right.status === "reading" ? 1 : 0;
        return (
          rightActive - leftActive ||
          right.updatedAt - left.updatedAt ||
          left.title.localeCompare(right.title)
        );
      });
  }, [books, filter, q]);

  const effectiveGroupMode: GroupMode = isBookStatusFilter(filter)
    ? "subjects"
    : groupMode;

  const groups = useMemo<ShelfGroup[]>(() => {
    if (filter === "blogs") return [];
    if (effectiveGroupMode === "subjects") {
      return folders
        .map((folder) => ({
          id: folder.id,
          label: folder.label,
          books: filtered.filter((book) => book.category === folder.id),
          accent: folder.accent,
          canRename: true,
        }))
        .filter((group) => group.books.length > 0);
    }
    return STATUS_ORDER.map((status) => ({
      id: status,
      label: STATUS_LABEL[status],
      books: filtered.filter((book) => book.status === status),
      accent: STATUS_TONES[status],
      canRename: false,
    })).filter((group) => group.books.length);
  }, [effectiveGroupMode, filter, filtered, folders]);

  /** Blogs under books on All, or alone on Blogs. */
  const showBlogs = filter === "all" || filter === "blogs";

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders]
  );

  function patchBook(id: string, patch: Partial<Book>) {
    setBooks((current) =>
      current.map((book) =>
        book.id === id ? { ...book, ...patch, updatedAt: Date.now() } : book
      )
    );
  }

  function addBook() {
    const title = draftTitle.trim();
    if (!title) return;
    const book = newBook({
      title,
      author: draftAuthor.trim(),
      category: draftCategory,
      status: "want",
    });
    setBooks((current) => [book, ...current]);
    setDraftTitle("");
    setDraftAuthor("");
    setDraftCategory("Unsorted");
    setAdding(false);
    setOpenId(book.id);
  }

  /**
   * Add a found book to Want, auto-pick folder, show toast where it went.
   * Legal catalogs only (Open Library / Internet Archive) — not pirate sites.
   */
  function addDiscoveredBook(
    found: BookDiscoveryResult,
    options?: { silent?: boolean; openAfter?: boolean }
  ): { book: Book; folderLabel: string; alreadyHad: boolean } {
    const normalizedTitle = found.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const existing = books.find(
      (book) =>
        book.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalizedTitle
    );
    if (existing) {
      if (options?.openAfter !== false) setOpenId(existing.id);
      const folderLabel =
        folders.find((f) => f.id === existing.category)?.label || existing.category;
      if (!options?.silent) {
        setToast(`Already on your shelf · ${folderLabel}`);
      }
      return { book: existing, folderLabel, alreadyHad: true };
    }
    // Auto-organize into the right subject folder
    const category = categorizeBook(found.title, found.author);
    const folderLabel =
      folders.find((f) => f.id === category)?.label || String(category);
    const book = newBook({
      title: found.title,
      author: found.author,
      category,
      categoryOverride: false,
      status: "want",
      statusOverride: true,
      coverUrl: found.coverUrl || undefined,
      externalUrl: found.getCopyUrl || found.catalogUrl,
      source: "manual",
      format: found.access === "public" ? "archive" : "manual",
      description:
        found.access === "public"
          ? "Free public / library copy linked from Open Library or Internet Archive."
          : found.access === "borrow"
            ? "Borrowing or library listing linked from Open Library."
            : "Catalog listing from Open Library.",
    });
    setBooks((current) => [book, ...current]);
    setOpenFolders((current) => ({ ...current, [category]: true }));
    setGroupMode("subjects");
    setFilter("want");
    if (options?.openAfter) setOpenId(book.id);
    if (!options?.silent) {
      const freeNote =
        found.access === "public"
          ? " · free copy linked"
          : found.access === "borrow"
            ? " · borrow link saved"
            : " · catalog link saved";
      setToast(`Want list · filed in “${folderLabel}”${freeNote}`);
    }
    return { book, folderLabel, alreadyHad: false };
  }

  /**
   * Want tab magic: type a title in search → find legal source → auto-file into a folder.
   * Picks free public copy first when available.
   */
  async function findWantAndFile(query: string) {
    const cleaned = query.trim();
    if (!cleaned || wantBusy) return;
    setWantBusy(true);
    setFinderOpen(true);
    setFinderQuery(cleaned);
    setFinderState("searching");
    setFinderMessage("Looking up legal catalogs…");
    try {
      const results = await searchLegalBooks(cleaned);
      setFinderResults(results);
      if (!results.length) {
        setFinderState("done");
        setFinderMessage("No legal catalog match. Try a clearer title or author.");
        setToast("No legal free/catalog match for that title");
        return;
      }
      // Prefer free public scan, then borrow, then any catalog hit
      const best =
        results.find((r) => r.access === "public") ||
        results.find((r) => r.access === "borrow") ||
        results[0];
      const { folderLabel, alreadyHad } = addDiscoveredBook(best, {
        silent: true,
        openAfter: false,
      });
      setFinderState("done");
      setFinderMessage(
        alreadyHad
          ? `Already had “${best.title}”`
          : `Saved “${best.title}” to Want → ${folderLabel}`
      );
      setToast(
        alreadyHad
          ? `Already on shelf · ${folderLabel}`
          : `Want · “${best.title}” → ${folderLabel}${
              best.access === "public" ? " · free copy linked" : ""
            }`
      );
      // Open free public copy in a new tab when we can (legal only)
      if (!alreadyHad && best.access === "public" && best.getCopyUrl) {
        window.open(best.getCopyUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setFinderResults([]);
      setFinderState("error");
      const msg =
        error instanceof Error ? error.message : "Book search is unavailable.";
      setFinderMessage(msg);
      setToast(msg);
    } finally {
      setWantBusy(false);
    }
  }

  function addFolder() {
    const folder = createBookFolder(folderNameDraft, folders);
    if (!folder) return;
    setFolders((current) => [...current, folder]);
    setFolderNameDraft("");
    setAddingFolder(false);
    setDraftCategory(folder.id);
    setAdding(true);
  }

  function beginRenameFolder(folder: ShelfGroup) {
    setRenamingFolderId(folder.id);
    setFolderRenameDraft(folder.label);
  }

  function saveFolderName() {
    if (!renamingFolderId) return;
    const label = folderRenameDraft.trim().replace(/\s+/g, " ");
    if (!label) return;
    const duplicate = folders.some(
      (folder) =>
        folder.id !== renamingFolderId &&
        folder.label.toLowerCase() === label.toLowerCase()
    );
    if (duplicate) return;
    setFolders((current) =>
      current.map((folder) =>
        folder.id === renamingFolderId ? { ...folder, label } : folder
      )
    );
    setRenamingFolderId(null);
    setFolderRenameDraft("");
  }

  function moveBookToFolder(bookId: string, folderId: string) {
    setBooks((current) =>
      current.map((book) =>
        book.id === bookId
          ? {
              ...book,
              category: folderId as BookCategory,
              categoryOverride: true,
              updatedAt: Date.now(),
            }
          : book
      )
    );
    setOpenFolders((current) => ({ ...current, [folderId]: true }));
    setDraggingBookId(null);
    setDropFolderId(null);
  }

  function removeBook(book: Book) {
    if (!window.confirm("Remove this book from your local Wonder library?")) return;
    markBookDeleted(book);
    setBooks((current) => current.filter((item) => item.id !== book.id));
    setOpenId(null);
  }

  function addQuote() {
    if (!open || !quoteDraft.trim()) return;
    patchBook(open.id, {
      quotes: [newQuote(quoteDraft, quotePage, quoteNoteDraft), ...open.quotes],
    });
    setQuoteDraft("");
    setQuotePage("");
    setQuoteNoteDraft("");
  }

  function startInterpretation(quote: BookQuote) {
    setEditingQuoteId(quote.id);
    setInterpretationDraft(quote.interpretation || "");
  }

  function saveInterpretation() {
    if (!open || !editingQuoteId) return;
    patchBook(open.id, {
      quotes: open.quotes.map((quote) =>
        quote.id === editingQuoteId
          ? { ...quote, interpretation: interpretationDraft.trim() || undefined }
          : quote
      ),
    });
    setEditingQuoteId(null);
    setInterpretationDraft("");
  }

  function removeQuote(id: string) {
    if (!open) return;
    patchBook(open.id, {
      quotes: open.quotes.filter((quote) => quote.id !== id),
    });
  }

  function writeBookDeepLink(bookId: string | null, read: boolean) {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("page", "pg-library");
      if (bookId) {
        url.searchParams.set("book", bookId);
        if (read) url.searchParams.set("read", "1");
        else url.searchParams.delete("read");
      } else {
        url.searchParams.delete("book");
        url.searchParams.delete("read");
      }
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* ignore */
    }
  }

  function continueCfi(book: Book): string | undefined {
    return book.smartBookmark?.cfi || book.readerCfi || undefined;
  }

  function readBook(id: string, cfi?: string) {
    const book = books.find((b) => b.id === id);
    const start = cfi || (book ? continueCfi(book) : undefined);
    setReaderStartCfi(start);
    setReaderId(id);
    writeBookDeepLink(id, true);
  }

  function openBookDetails(id: string) {
    setOpenId(id);
    writeBookDeepLink(id, false);
  }

  function copyContinueLink(book: Book) {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.origin + window.location.pathname);
      url.searchParams.set("page", "pg-library");
      url.searchParams.set("book", book.id);
      if (book.readerUrl) url.searchParams.set("read", "1");
      void navigator.clipboard.writeText(url.toString()).then(() => {
        setToast(
          book.readerUrl
            ? "Continue link copied — opens at your place"
            : "Book link copied"
        );
      });
    } catch {
      setToast("Could not copy link");
    }
  }

  // Deep link: open book / resume reader after library hydrates
  useEffect(() => {
    if (deepLinkDone.current || !books.length) return;
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const bookParam = params.get("book");
      if (!bookParam) {
        deepLinkDone.current = true;
        return;
      }
      const book = books.find(
        (b) =>
          b.id === bookParam ||
          b.sourceId === bookParam ||
          b.id === `apple-${bookParam.toLowerCase()}`
      );
      if (!book) return; // wait for sync to bring the book in
      deepLinkDone.current = true;
      const wantRead = params.get("read") === "1";
      if (wantRead && book.readerUrl) {
        setReaderStartCfi(continueCfi(book));
        setReaderId(book.id);
      } else {
        setOpenId(book.id);
      }
    } catch {
      deepLinkDone.current = true;
    }
  }, [books]);

  /** One-tap cover fetch for a single book */
  async function lookupAndSetCover(bookId: string) {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    setToast("Looking up cover…");
    const result = await enrichBooksWithCovers([book], {
      limit: 1,
      fixUnsorted: true,
    });
    const updated = result.books[0];
    if (!updated) return;
    setBooks((current) =>
      current.map((b) => (b.id === bookId ? { ...b, ...updated } : b))
    );
    setToast(
      updated.coverUrl ? "Cover found" : "No cover found — try editing the title"
    );
  }

  if (reader?.readerUrl) {
    return (
      <Suspense fallback={<div className="bl-reader-loading">Opening reader...</div>}>
        <BookReader
          book={reader}
          startCfi={readerStartCfi}
          theme={booksPreferences.theme}
          font={booksPreferences.font}
          onThemeChange={setBooksTheme}
          onFontChange={setReadingFont}
          onClose={() => {
            setReaderId(null);
            setReaderStartCfi(undefined);
            writeBookDeepLink(reader.id, false);
          }}
          onProgress={(cfi, progress) => {
            const localProgress = Math.max(
              progress,
              reader.localReaderProgress || 0
            );
            patchBook(reader.id, {
              readerCfi: cfi,
              localReaderProgress: localProgress,
              readerProgress: Math.max(localProgress, reader.appleProgress || 0),
              status: reader.status === "finished" ? "finished" : "reading",
            });
          }}
          onBookmark={(smartBookmark) => patchBook(reader.id, { smartBookmark })}
          onSaveQuote={(quote) =>
            patchBook(reader.id, {
              quotes: [quote, ...reader.quotes],
            })
          }
        />
      </Suspense>
    );
  }

  if (open) {
    const visibleQuotes = showAllHighlights ? open.quotes : open.quotes.slice(0, 40);
    const importedHighlightCount = open.quotes.filter(
      (quote) => quote.source === "apple-books"
    ).length;
    return (
      <div
        className="bl bl-detail"
        data-books-theme={booksPreferences.theme}
        data-books-font={booksPreferences.font}
      >
        <div className="bl-detail-topbar">
          <button type="button" className="bl-back" onClick={() => setOpenId(null)}>
            ← Bookshelf
          </button>
          <BooksAppearanceControls
            compact
            theme={booksPreferences.theme}
            font={booksPreferences.font}
            onTheme={setBooksTheme}
            onFont={setReadingFont}
          />
        </div>

        <div className="bl-detail-workspace">
        <aside className="bl-detail-overview">
          <div className="bl-detail-head">
          <BookCover
            book={open}
            className="bl-cover"
            folderLabel={folderById.get(open.category)?.label}
          />
          <div className="bl-detail-fields">
            <div className="bl-source-line">
              <span>{sourceLabel(open)}</span>
              <span className="bl-source-facts">
                {open.readerProgress ? `${progressPercent(open.readerProgress)}% read` : "Not started"}
                {open.chapterCount ? ` · ${open.chapterCount} chapters` : ""}
              </span>
            </div>
            <input
              className="bl-input bl-input-title"
              value={open.title}
              placeholder="Title"
              onChange={(event) => patchBook(open.id, { title: event.target.value })}
            />
            <input
              className="bl-input bl-input-author"
              value={open.author}
              placeholder="Author"
              onChange={(event) => patchBook(open.id, { author: event.target.value })}
            />
            {/* One main action — resume from saved place */}
            <div className="bl-detail-actions">
              {open.readerUrl ? (
                <button
                  type="button"
                  className="bl-btn bl-btn-primary"
                  onClick={() => readBook(open.id)}
                >
                  <BookOpen size={15} aria-hidden />
                  {(open.readerProgress || 0) > 0.01
                    ? `Continue · ${progressPercent(open.readerProgress || 0)}%`
                    : "Read here"}
                </button>
              ) : null}
              <button
                type="button"
                className="bl-link-quiet"
                onClick={() => copyContinueLink(open)}
                title="Copy link that opens this book at your place"
              >
                Copy continue link
              </button>
              <a
                className="bl-link-quiet"
                href={
                  open.externalUrl?.includes("goodreads")
                    ? open.externalUrl
                    : goodreadsSearchUrl(open.title, open.author)
                }
                target="_blank"
                rel="noreferrer"
              >
                Goodreads
              </a>
              {!open.coverUrl ? (
                <button
                  type="button"
                  className="bl-link-quiet"
                  onClick={() => void lookupAndSetCover(open.id)}
                >
                  Find cover
                </button>
              ) : null}
              {open.externalUrl &&
              !open.externalUrl.includes("goodreads") ? (
                <a
                  className="bl-link-quiet"
                  href={open.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source
                </a>
              ) : null}
              {open.wonderPageId && onGo ? (
                <button
                  type="button"
                  className="bl-link-quiet"
                  onClick={() => onGo(open.wonderPageId as string)}
                >
                  Notes
                </button>
              ) : null}
            </div>

            {/* Quiet meta row: text-like controls, no chrome spinners */}
            <div className="bl-meta-quiet">
              <div className="bl-meta-line">
                <span className="bl-meta-k">Status</span>
                <div className="bl-status-pills" role="group" aria-label="Reading status">
                  {STATUS_ORDER.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`bl-status-pill${open.status === status ? " is-on" : ""}`}
                      onClick={() => {
                        const patch: Partial<Book> = {
                          status,
                          statusOverride: true,
                        };
                        if (status === "reading" && !open.startedAt) {
                          patch.startedAt = new Date().toISOString().slice(0, 10);
                        }
                        if (status === "finished") {
                          patch.finishedAt = new Date().toISOString().slice(0, 10);
                        }
                        patchBook(open.id, patch);
                      }}
                    >
                      {STATUS_LABEL[status]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bl-meta-line">
                <span className="bl-meta-k">Folder</span>
                <select
                  className="bl-select-ghost"
                  value={open.category}
                  aria-label="Folder"
                  onChange={(event) =>
                    patchBook(open.id, {
                      category: event.target.value as BookCategory,
                      categoryOverride: true,
                    })
                  }
                >
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bl-meta-line">
                <span className="bl-meta-k">Formats</span>
                <div className="bl-format-picks" role="group" aria-label="Book formats">
                  {(
                    [
                      ["ebook", "Ebook"],
                      ["audiobook", "Audiobook"],
                      ["physical", "Physical"],
                    ] as Array<[BookMedium, string]>
                  ).map(([medium, label]) => {
                    const selected = open.readingFormats?.includes(medium) || false;
                    return (
                      <button
                        key={medium}
                        type="button"
                        className={selected ? "is-on" : ""}
                        aria-pressed={selected}
                        onClick={() => {
                          const current = new Set(open.readingFormats || []);
                          if (selected) current.delete(medium);
                          else current.add(medium);
                          patchBook(open.id, {
                            readingFormats: Array.from(current),
                          });
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bl-meta-line">
                <span className="bl-meta-k">Pages</span>
                <div className="bl-pages-quiet">
                  <input
                    className="bl-input-ghost bl-num-ghost"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={open.pageNow || ""}
                    placeholder="0"
                    aria-label="Pages read"
                    onChange={(event) =>
                      patchBook(open.id, {
                        pageNow: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                  />
                  <span className="bl-divider-text">/</span>
                  <input
                    className="bl-input-ghost bl-num-ghost"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={open.pageTotal || ""}
                    placeholder="—"
                    aria-label="Total pages"
                    onChange={(event) =>
                      patchBook(open.id, {
                        pageTotal: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                  />
                </div>
                <span className="bl-meta-k bl-meta-rate">Rate</span>
                <div className="bl-stars-row" role="group" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((number) => (
                    <button
                      key={number}
                      type="button"
                      className={`bl-stars-btn${open.rating >= number ? " is-on" : ""}`}
                      onClick={() =>
                        patchBook(open.id, {
                          rating: open.rating === number ? 0 : number,
                        })
                      }
                      aria-label={`${number} stars`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          </div>

          {open.description ? (
            <details className="bl-description">
              <summary>About this book</summary>
              <p>{open.description}</p>
            </details>
          ) : null}
        </aside>

        <main className="bl-detail-reading">
        <section className="bl-section">
          <div className="bl-section-title-row">
            <h3 className="bl-section-h">Highlights &amp; notes</h3>
            {importedHighlightCount ? (
              <span>{importedHighlightCount} from Apple Books</span>
            ) : null}
          </div>
          <div className="bl-quote-add">
            <div className="bl-quote-compose-main">
              <Quotes size={17} aria-hidden />
              <textarea
                className="bl-textarea bl-quote-input"
                value={quoteDraft}
                placeholder="Paste or write the line you want to keep..."
                onChange={(event) => setQuoteDraft(event.target.value)}
              />
            </div>
            <div className="bl-quote-compose-main is-thought">
              <NotePencil size={17} aria-hidden />
              <textarea
                className="bl-textarea bl-quote-thought-input"
                value={quoteNoteDraft}
                placeholder="Your interpretation, connection, or question (optional)"
                onChange={(event) => setQuoteNoteDraft(event.target.value)}
              />
            </div>
            <div className="bl-quote-actions">
              <input
                className="bl-input bl-quote-page"
                value={quotePage}
                placeholder="page / chapter"
                onChange={(event) => setQuotePage(event.target.value)}
              />
              <button
                type="button"
                className="bl-btn bl-btn-primary"
                onClick={addQuote}
                disabled={!quoteDraft.trim()}
              >
                Save to this book
              </button>
            </div>
          </div>
          {open.quotes.length ? (
            <ul className="bl-quote-list">
              {visibleQuotes.map((quote) => (
                <li key={quote.id} className={`bl-quote-item${quote.note || quote.interpretation ? " has-thought" : ""}`}>
                  <span className="bl-quote-kicker">
                    {quote.source === "apple-books" ? "Apple Books highlight" : "Saved quote"}
                  </span>
                  <p className="bl-quote-text">“{quote.text}”</p>
                  {quote.note ? (
                    <div className="bl-quote-note">
                      <span>Apple Books note</span>
                      <p>{quote.note}</p>
                    </div>
                  ) : null}
                  {quote.interpretation ? (
                    <div className="bl-quote-note is-interpretation">
                      <span>Your interpretation</span>
                      <p>{quote.interpretation}</p>
                    </div>
                  ) : null}
                  {editingQuoteId === quote.id ? (
                    <div className="bl-interpret-editor">
                      <textarea
                        className="bl-textarea"
                        value={interpretationDraft}
                        placeholder="What does this mean to you? Where does it connect?"
                        autoFocus
                        onChange={(event) => setInterpretationDraft(event.target.value)}
                      />
                      <div>
                        <button type="button" className="bl-btn bl-btn-primary" onClick={saveInterpretation}>
                          Save interpretation
                        </button>
                        <button
                          type="button"
                          className="bl-btn"
                          onClick={() => {
                            setEditingQuoteId(null);
                            setInterpretationDraft("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="bl-quote-meta">
                    <span>
                      {quote.page
                        ? `p. ${quote.page}`
                        : quote.source === "apple-books"
                          ? "Imported highlight"
                          : "Saved here"}
                      {" · "}
                      {new Date(quote.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="bl-quote-controls">
                      <button
                        type="button"
                        className="bl-quote-open"
                        onClick={() => startInterpretation(quote)}
                      >
                        {quote.interpretation ? "Edit interpretation" : "Add interpretation"}
                      </button>
                      {quote.location && open.readerUrl ? (
                        <button
                          type="button"
                          className="bl-quote-open"
                          onClick={() => readBook(open.id, quote.location)}
                        >
                          Open in book
                        </button>
                      ) : null}
                      {quote.source !== "apple-books" ? (
                        <button
                          type="button"
                          className="bl-quote-del"
                          onClick={() => removeQuote(quote.id)}
                        >
                          remove
                        </button>
                      ) : null}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {open.quotes.length > 40 ? (
            <button
              type="button"
              className="bl-show-highlights"
              onClick={() => setShowAllHighlights((value) => !value)}
            >
              {showAllHighlights
                ? "Show fewer"
                : `Show all ${open.quotes.length} highlights and notes`}
            </button>
          ) : null}
        </section>

        <section className="bl-section">
          <h3 className="bl-section-h">Notes</h3>
          <textarea
            className="bl-textarea"
            value={open.notes}
            placeholder="Ideas, arguments, connections, questions..."
            onChange={(event) => patchBook(open.id, { notes: event.target.value })}
          />
        </section>

        <div className="bl-footer-actions">
          <button
            type="button"
            className="bl-btn bl-btn-danger"
            onClick={() => removeBook(open)}
          >
            Remove
          </button>
        </div>
        </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bl"
      data-books-theme={booksPreferences.theme}
      data-books-font={booksPreferences.font}
    >
      <header className="bl-head">
        <div className="bl-head-main">
          <div className="bl-head-copy">
            <h1 className="bl-title">
              <MinimalIcon name="books" size={22} />
              Bookshelf
            </h1>
            <div className="bl-stats" aria-label="Library totals">
              <span><b>{stats.total}</b> books</span>
              <span><b>{stats.reading}</b> reading</span>
              <span><b>{stats.want}</b> next</span>
              <span><b>{stats.quotes}</b> highlights</span>
            </div>
          </div>
          <div className="bl-head-actions">
            <button
              type="button"
              className={`bl-sync${sync.state === "syncing" ? " is-syncing" : ""}`}
              onClick={() => void syncAll()}
              title={sync.message}
            >
              <ArrowsClockwise size={15} aria-hidden />
              <span>
                {sync.state === "error"
                  ? "Sync unavailable"
                  : sync.state === "idle"
                    ? "Sync library"
                    : sync.message}
              </span>
            </button>
            <label
              className="bl-sync bl-goodreads-import"
              title="Import a Goodreads library CSV"
            >
              <DownloadSimple size={15} aria-hidden />
              <span>Import CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(event) => {
                  importGoodreadsCsv(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
              />
            </label>
            <BooksAppearanceControls
              theme={booksPreferences.theme}
              font={booksPreferences.font}
              onTheme={setBooksTheme}
              onFont={setReadingFont}
            />
          </div>
        </div>
      </header>

      <div className="bl-filter" aria-label="Library sections">
        {LIBRARY_CHIPS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`bl-chip${filter === id ? " is-on" : ""}`}
            onClick={() => {
              setFilter(id);
              setAdding(false);
              setAddingFolder(false);
              if (id === "want") {
                setFinderOpen(true);
                setFinderMessage(
                  "Type a title and press Enter. Wonder files the best legal catalog match automatically."
                );
              } else {
                setFinderOpen(false);
              }
            }}
          >
            <span>{label}</span>
            <em>{sectionCounts[id]}</em>
          </button>
        ))}
      </div>

      {filter !== "blogs" ? (
      <div className="bl-toolbar">
        <form
          className="bl-search-wrap"
          onSubmit={(event) => {
            event.preventDefault();
            // Next tab: search finds a book + auto-files it (legal catalogs only)
            if (filter === "want") {
              void findWantAndFile(q || finderQuery);
              return;
            }
            // Other tabs: filter your shelf as you type (no submit needed)
          }}
        >
          <MagnifyingGlass size={15} aria-hidden />
          <input
            ref={searchRef}
            className="bl-search"
            value={q}
            aria-label="Search bookshelf"
            aria-keyshortcuts="/"
            onChange={(event) => {
              setQ(event.target.value);
              if (filter === "want") setFinderQuery(event.target.value);
            }}
            placeholder={
              filter === "want"
                ? "Find your next book by title or author"
                : "Search titles, authors, notes, or highlights"
            }
          />
          {filter === "want" ? (
            <button
              type="submit"
              className="bl-want-go"
              disabled={wantBusy || !q.trim()}
              title="Find and file into Next"
            >
              {wantBusy ? "…" : "Get"}
            </button>
          ) : null}
        </form>
        {!isBookStatusFilter(filter) ? (
          <div className="bl-view-tabs" aria-label="Library arrangement">
            <button
              type="button"
              className={groupMode === "subjects" ? "is-on" : ""}
              onClick={() => setGroupMode("subjects")}
            >
              Folders
            </button>
            <button
              type="button"
              className={groupMode === "status" ? "is-on" : ""}
              onClick={() => setGroupMode("status")}
            >
              Status
            </button>
          </div>
        ) : <span className="bl-toolbar-spacer" aria-hidden />}
        <button
          type="button"
          className="bl-add-btn"
          onClick={() => setFinderOpen((value) => !value)}
          title="Find a legal copy"
        >
          <MagnifyingGlass size={15} aria-hidden />
          Find
        </button>
        {effectiveGroupMode === "subjects" ? (
          <button
            type="button"
            className="bl-add-btn bl-folder-add-btn"
            onClick={() => {
              setAddingFolder((value) => !value);
              setAdding(false);
            }}
            title={addingFolder ? "Close folder creator" : "Create a folder"}
          >
            <FolderPlus size={15} aria-hidden />
            Folder
          </button>
        ) : null}
        <button
          type="button"
          className="bl-add-btn"
          onClick={() => {
            setAdding((value) => !value);
            setAddingFolder(false);
          }}
          title={adding ? "Close add book" : "Add a book"}
        >
          <Plus size={15} aria-hidden />
          {adding ? "Close" : "Add book"}
        </button>
      </div>
      ) : null}

      {filter !== "blogs" && addingFolder ? (
        <form
          className="bl-folder-create"
          onSubmit={(event) => {
            event.preventDefault();
            addFolder();
          }}
        >
          <FolderSimple size={20} weight="duotone" aria-hidden />
          <input
            className="bl-input"
            value={folderNameDraft}
            placeholder="New folder name"
            autoFocus
            onChange={(event) => setFolderNameDraft(event.target.value)}
          />
          <button
            type="submit"
            className="bl-icon-btn"
            disabled={!folderNameDraft.trim()}
            title="Create folder"
            aria-label="Create folder"
          >
            <Check size={16} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            className="bl-icon-btn"
            onClick={() => {
              setAddingFolder(false);
              setFolderNameDraft("");
            }}
            title="Cancel"
            aria-label="Cancel creating folder"
          >
            <X size={15} aria-hidden />
          </button>
        </form>
      ) : null}

      {filter !== "blogs" && finderOpen ? (
        <section className="bl-finder" aria-label="Book Finder">
          <div className="bl-finder-head">
            <div>
              <span>Book Finder</span>
              <strong>Public-domain, borrowing, and catalog sources</strong>
            </div>
            <button
              type="button"
              className="bl-icon-btn"
              onClick={() => setFinderOpen(false)}
              title="Close Book Finder"
              aria-label="Close Book Finder"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
          <form
            className="bl-finder-search"
            onSubmit={(event) => {
              event.preventDefault();
              void runFinderSearch(finderQuery);
            }}
          >
            <MagnifyingGlass size={16} aria-hidden />
            <input
              className="bl-input"
              value={finderQuery}
              placeholder="Title or author"
              onChange={(event) => setFinderQuery(event.target.value)}
            />
            <button
              type="submit"
              className="bl-btn bl-btn-primary"
              disabled={!finderQuery.trim() || finderState === "searching"}
            >
              {finderState === "searching" ? "Searching" : "Search"}
            </button>
          </form>
          {finderMessage ? (
            <p className={`bl-finder-status is-${finderState}`}>{finderMessage}</p>
          ) : null}
          {finderResults.length ? (
            <div className="bl-finder-results">
              {finderResults.map((found) => (
                <article key={found.id} className="bl-finder-result">
                  <div className="bl-finder-cover">
                    {found.coverUrl ? (
                      <img src={found.coverUrl} alt="" loading="lazy" />
                    ) : (
                      <BookOpen size={20} aria-hidden />
                    )}
                  </div>
                  <div className="bl-finder-copy">
                    <strong>{found.title}</strong>
                    <span>
                      {found.author || "Unknown author"}
                      {found.year ? ` · ${found.year}` : ""}
                    </span>
                    <small className={`is-${found.access}`}>
                      {found.access === "public"
                        ? "Free public copy"
                        : found.access === "borrow"
                          ? "Borrowing available"
                          : "Catalog listing"}
                    </small>
                  </div>
                  <div className="bl-finder-actions">
                    <button
                      type="button"
                      className="bl-btn"
                      onClick={() => {
                        addDiscoveredBook(found);
                      }}
                    >
                      <Plus size={14} aria-hidden />
                      Add to Want
                    </button>
                    <a
                      className="bl-btn bl-btn-primary"
                      href={found.getCopyUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {found.access === "public" ? (
                        <DownloadSimple size={14} aria-hidden />
                      ) : (
                        <ArrowSquareOut size={14} aria-hidden />
                      )}
                      {found.access === "public"
                        ? "Free copy"
                        : found.access === "borrow"
                          ? "Borrow"
                          : "View"}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {filter !== "blogs" && adding ? (
        <div className="bl-add-panel">
          <input
            className="bl-input bl-input-title"
            value={draftTitle}
            placeholder="Book title"
            autoFocus
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addBook();
            }}
          />
          <div className="bl-add-row">
            <input
              className="bl-input"
              value={draftAuthor}
              placeholder="Author"
              onChange={(event) => setDraftAuthor(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addBook();
              }}
            />
            <select
              className="bl-select"
              value={draftCategory}
              onChange={(event) => setDraftCategory(event.target.value as BookCategory)}
            >
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="bl-btn bl-btn-primary"
              onClick={addBook}
              disabled={!draftTitle.trim()}
            >
              Add to bookshelf
            </button>
          </div>
        </div>
      ) : null}

      {/* Book drives — hidden on Blogs tab */}
      {filter !== "blogs" ? (
        groups.length === 0 ? (
          <p className="bl-empty-all">
            {q
              ? "No books match that search."
              : filter === "reading"
                ? "Nothing in Reading yet."
                : filter === "want"
                  ? "Nothing in Next yet — type a title above to find one."
                  : filter === "finished"
                    ? "Nothing marked Done yet."
                    : "Your library is ready for its first book."}
          </p>
        ) : (
          groups.map((group) => {
            const expanded = openFolders[group.id] !== false || Boolean(q.trim());
            return (
              <section
                key={group.id}
                className={`bl-shelf${expanded ? " is-open" : ""}${dropFolderId === group.id ? " is-drop-target" : ""}`}
                style={folderTone(group.accent)}
                onDragOver={(event) => {
                  if (effectiveGroupMode !== "subjects") return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropFolderId(group.id);
                }}
                onDragLeave={() => {
                  if (dropFolderId === group.id) setDropFolderId(null);
                }}
                onDrop={(event) => {
                  if (effectiveGroupMode !== "subjects") return;
                  event.preventDefault();
                  const bookId =
                    draggingBookId ||
                    event.dataTransfer.getData("text/wonder-book-id");
                  if (bookId) moveBookToFolder(bookId, group.id);
                }}
              >
                <div className="bl-folder-row">
                  <button
                    type="button"
                    className="bl-folder"
                    onClick={() =>
                      setOpenFolders((current) => ({
                        ...current,
                        [group.id]: current[group.id] === false,
                      }))
                    }
                    aria-expanded={expanded}
                  >
                    <CaretRight className="bl-folder-caret" size={14} aria-hidden />
                    <FolderSimple
                      className="bl-folder-icon"
                      size={22}
                      weight="fill"
                      aria-hidden
                      style={{ color: group.accent, fill: group.accent }}
                    />
                    <span className="bl-folder-copy">
                      <strong>{group.label}</strong>
                      <small>
                        {group.books.length}{" "}
                        {group.books.length === 1 ? "book" : "books"}
                      </small>
                    </span>
                  </button>
                  {group.canRename ? (
                    <button
                      type="button"
                      className="bl-folder-edit"
                      onClick={() => beginRenameFolder(group)}
                      title={`Rename ${group.label}`}
                      aria-label={`Rename ${group.label}`}
                    >
                      <PencilSimple size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>
                {renamingFolderId === group.id ? (
                  <form
                    className="bl-folder-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveFolderName();
                    }}
                  >
                    <input
                      className="bl-input"
                      value={folderRenameDraft}
                      autoFocus
                      onChange={(event) =>
                        setFolderRenameDraft(event.target.value)
                      }
                      aria-label="Folder name"
                    />
                    <button
                      type="submit"
                      className="bl-icon-btn"
                      title="Save name"
                      aria-label="Save folder name"
                    >
                      <Check size={16} weight="bold" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="bl-icon-btn"
                      onClick={() => {
                        setRenamingFolderId(null);
                        setFolderRenameDraft("");
                      }}
                      title="Cancel"
                      aria-label="Cancel renaming folder"
                    >
                      <X size={15} aria-hidden />
                    </button>
                  </form>
                ) : null}
                {expanded ? (
                  <div className="bl-grid">
                    {group.books.map((book) => (
                      <BookCard
                        key={book.id}
                        book={book}
                        folderLabel={group.label}
                        draggable={effectiveGroupMode === "subjects"}
                        dragging={draggingBookId === book.id}
                        onOpen={() => openBookDetails(book.id)}
                        onContinue={
                          book.readerUrl ? () => readBook(book.id) : undefined
                        }
                        onDragStart={(event) => {
                          setDraggingBookId(book.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/wonder-book-id",
                            book.id
                          );
                        }}
                        onDragEnd={() => {
                          setDraggingBookId(null);
                          setDropFolderId(null);
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })
        )
      ) : null}

      {/* Blogs under books on All, or as a focused writing index on Blogs. */}
      {showBlogs ? (
        <section
          className={`bl-greats${filter === "all" ? " bl-greats-after-books" : ""}`}
          aria-label="Blogs and essays"
        >
          <div className="bl-greats-head">
            <div>
              <span>Writing worth returning to</span>
              <h2 className="bl-greats-h">Blogs &amp; essays</h2>
            </div>
            <small>{GREATS_AUTHORS.length} sources</small>
          </div>
          <div className="bl-greats-grid">
            {GREATS_AUTHORS.map((author) => (
              <article
                key={author.id}
                className="bl-greats-card"
                style={{ "--bl-blog-accent": author.accent } as CSSProperties}
              >
                <header>
                  <div>
                    <span>{author.kind}</span>
                    <h3>{author.name}</h3>
                  </div>
                  <a
                    href={author.homeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${author.name}`}
                    aria-label={`Open ${author.name}`}
                  >
                    <ArrowSquareOut size={16} aria-hidden />
                  </a>
                </header>
                {author.posts.length ? (
                  <ul>
                    {author.posts.slice(0, 4).map((post) => (
                      <li key={post.id}>
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span>{post.title}</span>
                          <CaretRight size={13} weight="bold" aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <a
                    className="bl-greats-own-blog"
                    href={author.homeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open {author.name}&apos;s writing
                    <CaretRight size={13} weight="bold" aria-hidden />
                  </a>
                )}
                <a
                  className="bl-greats-home"
                  href={author.homeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {new URL(author.homeUrl).hostname.replace(/^www\./, "")}
                </a>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* Short placement popup after Want auto-file */}
      {toast ? (
        <div className="bl-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function sourceLabel(book: Book): string {
  const formats = book.readingFormats || [];
  if (formats.length) {
    const labels: Record<BookMedium, string> = {
      ebook: "Ebook",
      audiobook: "Audiobook",
      physical: "Physical",
    };
    return formats.map((format) => labels[format]).join(" + ");
  }
  if (book.format === "audiobook") return "Audiobook";
  if (book.format === "cloud") return "Apple Books · online";
  if (book.format === "archive") return "Apple Books · archived reading data";
  if (book.source === "apple-books") return "Apple Books · digital";
  if (book.source === "wonder-page") return "Wonder page";
  return "Wonder Bookshelf";
}

function BookCover({
  book,
  className = "",
  folderLabel,
}: {
  book: Book;
  className?: string;
  folderLabel?: string;
}) {
  const style: CSSProperties = {
    backgroundColor: book.color,
    backgroundImage: `linear-gradient(165deg, rgba(255,255,255,.14), transparent 42%), linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.58))`,
  };
  return (
    <div className={className} style={style}>
      <span className="bl-cover-fallback" aria-hidden>
        <small>{book.author || folderLabel || book.category}</small>
        <strong>{book.title || "Untitled"}</strong>
      </span>
      {book.coverUrl ? (
        <img
          src={book.coverUrl}
          alt=""
          className="bl-cover-image"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}

function BookCard({
  book,
  folderLabel,
  draggable,
  dragging,
  onOpen,
  onContinue,
  onDragStart,
  onDragEnd,
}: {
  book: Book;
  folderLabel: string;
  draggable: boolean;
  dragging: boolean;
  onOpen: () => void;
  onContinue?: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  const pageProgress =
    book.pageTotal > 0 ? Math.min(1, book.pageNow / book.pageTotal) : 0;
  const progress = Math.max(book.readerProgress || 0, pageProgress);
  const progressLabel =
    progress > 0
      ? `${progressPercent(progress)}%`
      : book.quotes.length
        ? `${book.quotes.length} quote${book.quotes.length === 1 ? "" : "s"}`
        : STATUS_LABEL[book.status];

  return (
    <div className={`bl-card-wrap${dragging ? " is-dragging" : ""}`}>
      <button
        type="button"
        className="bl-card"
        draggable={draggable}
        onClick={onOpen}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title={draggable ? "Open, or drag to another folder" : "Open book"}
      >
        <BookCover book={book} className="bl-card-cover" folderLabel={folderLabel} />
        <span className="bl-card-title">{book.title || "Untitled"}</span>
        {book.author ? <span className="bl-card-author">{book.author}</span> : null}
        <span className="bl-card-meta">
          <span>{progressLabel}</span>
          {book.rating > 0 ? (
            <span className="bl-card-stars">{stars(book.rating)}</span>
          ) : null}
          {book.readingFormats?.length ? (
            <span>{sourceLabel(book).toLowerCase()}</span>
          ) : null}
        </span>
        {progress > 0 ? (
          <span className="bl-card-progress" aria-hidden>
            <i style={{ width: `${Math.max(1, progress * 100)}%` }} />
          </span>
        ) : null}
      </button>
      {onContinue ? (
        <button
          type="button"
          className="bl-card-continue"
          onClick={(e) => {
            e.stopPropagation();
            onContinue();
          }}
        >
          {progress > 0.01 ? "Continue" : "Read"}
        </button>
      ) : null}
    </div>
  );
}
