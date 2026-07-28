import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  BookOpenText,
  CaretRight,
  Minus,
  Plus,
  BookmarkSimple,
  HighlighterCircle,
  Moon,
  Notebook,
  NotePencil,
  X,
  Sun,
  TextAa,
  Rows,
} from "@phosphor-icons/react";
import ePub, {
  type Book as EpubBook,
  type Location,
  type NavItem,
  type Rendition,
} from "epubjs";
import { newQuote, type Book, type BookQuote } from "./booksStore";
import {
  buildBookPageBrief,
  type BookPageBrief,
} from "./bookPageBrief";
import {
  readingFontStack,
  READING_FONT_OPTIONS,
  type BooksTheme,
  type ReadingFont,
} from "./booksPreferences";

/** Soft light-pink default for highlights (clean, not muddy yellow) */
const HIGHLIGHT_PINK = {
  fill: "#ffb6c8",
  "fill-opacity": "0.42",
  "mix-blend-mode": "normal",
} as const;

const HIGHLIGHT_CLASS = "reader-quote-highlight";

/**
 * Hard caps so “Opening book…” never hangs on a bad CFI / slow TOC.
 * Keep these low — first paint matters more than perfect landing.
 */
const DISPLAY_TIMEOUT_MS = 1_600; // one display() attempt
const FALLBACK_DISPLAY_MS = 2_200; // bare display()
const NAV_TIMEOUT_MS = 3_000; // TOC parse after first page is already showing
const CHAPTER_DISPLAY_TIMEOUT_MS = 12_000; // continuous chapter may span many files

function withTimeout<T>(promise: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

type ReaderContents = {
  document: Document;
  window: Window;
};

type ReaderSelection = {
  cfi: string;
  text: string;
  x: number;
  y: number;
  above: boolean;
};

type ReaderNotePopover = {
  quote: BookQuote;
  x: number;
  y: number;
  above: boolean;
  pinned: boolean;
};

type FlipDir = "next" | "prev";
type ReaderMode = "scroll" | "pages";

type MutableSpineSection = {
  index: number;
  href: string;
  linear?: boolean;
  next: () => MutableSpineSection | undefined;
  prev: () => MutableSpineSection | undefined;
};

type ChapterRange = {
  href: string;
  label: string;
  startIndex: number;
  endIndex: number;
  fromToc: boolean;
};

const READER_MODE_KEY = "wonder-reader-mode-v1";

/**
 * Free page pose — the leaf can move any direction, not only left/right.
 * x/y = position on screen, rotZ = spin (circles), rotX/rotY = 3D tilt.
 */
type LeafPose = {
  active: boolean;
  x: number;
  y: number;
  rotZ: number;
  rotY: number;
  rotX: number;
  scale: number;
  opacity: number;
};

/** Flat page resting on the book (nothing moving yet) */
const IDLE_LEAF: LeafPose = {
  active: false,
  x: 0,
  y: 0,
  rotZ: 0,
  rotY: 0,
  rotX: 0,
  scale: 1,
  opacity: 0,
};

type ReaderProps = {
  book: Book;
  startCfi?: string;
  theme: BooksTheme;
  font: ReadingFont;
  onThemeChange: (theme: BooksTheme) => void;
  onFontChange: (font: ReadingFont) => void;
  onClose: () => void;
  onProgress: (cfi: string, progress: number) => void;
  onBookmark: (bookmark: Book["smartBookmark"] | undefined) => void;
  onSaveQuote: (quote: BookQuote) => void;
};

function flattenToc(items: NavItem[], depth = 0): Array<NavItem & { depth: number }> {
  const output: Array<NavItem & { depth: number }> = [];
  for (const item of items) {
    output.push({ ...item, depth });
    if (item.subitems?.length) output.push(...flattenToc(item.subitems, depth + 1));
  }
  return output;
}

function normalizedHref(href: string): string {
  const withoutHash = href.split("#")[0].replace(/\\/g, "/");
  try {
    return decodeURIComponent(withoutHash).replace(/^(?:\.\.\/|\.\/)+/, "");
  } catch {
    return withoutHash.replace(/^(?:\.\.\/|\.\/)+/, "");
  }
}

function sameDocument(left: string, right: string): boolean {
  const a = normalizedHref(left);
  const b = normalizedHref(right);
  return Boolean(a && b) && (a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`));
}

function spineSections(epub: EpubBook): MutableSpineSection[] {
  const sections: MutableSpineSection[] = [];
  epub.spine.each((section: unknown) => {
    if (section && typeof section === "object") {
      sections.push(section as MutableSpineSection);
    }
  });
  return sections;
}

function resolveSpineSection(
  epub: EpubBook,
  target?: string
): MutableSpineSection | undefined {
  if (target) {
    try {
      const direct = epub.spine.get(target);
      if (direct) return direct as unknown as MutableSpineSection;
    } catch {
      /* fall through to normalized matching */
    }
  } else {
    const first = epub.spine.get();
    return first ? (first as unknown as MutableSpineSection) : undefined;
  }

  return spineSections(epub).find((section) =>
    sameDocument(section.href, target)
  );
}

function buildChapterRanges(
  epub: EpubBook,
  chapters: Array<NavItem & { depth: number }>
): ChapterRange[] {
  const sections = spineSections(epub);
  if (!sections.length) return [];

  const boundaryByIndex = new Map<
    number,
    { href: string; label: string }
  >();
  for (const chapter of chapters) {
    const section = resolveSpineSection(epub, chapter.href);
    if (!section || boundaryByIndex.has(section.index)) continue;
    boundaryByIndex.set(section.index, {
      href: chapter.href,
      label: chapter.label.trim(),
    });
  }

  const boundaries = Array.from(boundaryByIndex, ([startIndex, chapter]) => ({
    ...chapter,
    startIndex,
  })).sort((left, right) => left.startIndex - right.startIndex);

  // EPUBs without a navigation document remain readable and safely bounded.
  if (!boundaries.length) {
    return sections.map((section) => ({
      href: section.href,
      label: "Current section",
      startIndex: section.index,
      endIndex: section.index,
      fromToc: false,
    }));
  }

  const ranges: ChapterRange[] = [];
  if (boundaries[0].startIndex > 0) {
    ranges.push({
      href: sections[0].href,
      label: "Front matter",
      startIndex: 0,
      endIndex: boundaries[0].startIndex - 1,
      fromToc: false,
    });
  }
  boundaries.forEach((boundary, index) => {
    ranges.push({
      href: boundary.href,
      label: boundary.label,
      startIndex: boundary.startIndex,
      endIndex:
        index + 1 < boundaries.length
          ? boundaries[index + 1].startIndex - 1
          : sections[sections.length - 1].index,
      fromToc: true,
    });
  });
  return ranges;
}

function rangeForSection(
  ranges: ChapterRange[],
  index: number
): ChapterRange | undefined {
  return ranges.find(
    (range) => index >= range.startIndex && index <= range.endIndex
  );
}

function readerThemeRules(
  theme: BooksTheme,
  font: ReadingFont,
  mode: ReaderMode
) {
  const light = theme === "light";
  const ink = light ? "#29251f" : "#eee9df";
  const heading = light ? "#17140f" : "#fffaf0";
  const paper = light ? "#fffaf1" : "#151311";
  const horizontalPadding = "clamp(24px, 7vw, 82px)";
  const verticalPadding = "clamp(28px, 6vh, 68px)";
  return {
    "html, body": {
      color: `${ink} !important`,
      background: `${paper} !important`,
      "font-family": `${readingFontStack(font)} !important`,
      ...(mode === "scroll"
        ? {
            width: "100% !important",
            "max-width": "100% !important",
            "overflow-x": "hidden !important",
          }
        : {}),
      "box-sizing": "border-box !important",
    },
    body: {
      color: `${ink} !important`,
      background: `${paper} !important`,
      "font-family": `${readingFontStack(font)} !important`,
      "font-kerning": "normal !important",
      "line-height": "1.58 !important",
      outline: "none !important",
      margin: "0 auto !important",
      padding:
        mode === "scroll"
          ? `0 ${horizontalPadding} !important`
          : `${verticalPadding} ${horizontalPadding} !important`,
      ...(mode === "scroll" ? { "max-width": "52rem !important" } : {}),
      "box-sizing": "border-box !important",
    },
    "body.wonder-chapter-first": {
      "padding-top": `${verticalPadding} !important`,
    },
    "body.wonder-chapter-last": {
      "padding-bottom": `${verticalPadding} !important`,
    },
    "p, li, dd, dt, blockquote": {
      color: `${ink} !important`,
      "font-family": `${readingFontStack(font)} !important`,
      "line-height": "1.58 !important",
      "overflow-wrap": "anywhere !important",
      "word-break": "normal !important",
      hyphens: "auto !important",
    },
    "img, svg, video, canvas": {
      "max-width": "100% !important",
      height: "auto !important",
    },
    pre: {
      "max-width": "100% !important",
      "white-space": "pre-wrap !important",
      "overflow-wrap": "anywhere !important",
    },
    "h1, h2, h3, h4, h5, h6": {
      color: `${heading} !important`,
      "font-family": `${readingFontStack(font)} !important`,
      "line-height": "1.12 !important",
      "letter-spacing": "-0.018em !important",
    },
    a: { color: `${light ? "#7655a6" : "#c5a9f0"} !important` },
    'a[href*="oceanofpdf" i]': { display: "none !important" },
    hr: {
      border: "0 !important",
      "border-top": `1px solid ${light ? "#ded4c5" : "#39342f"} !important`,
    },
  };
}

export function BookReader({
  book,
  startCfi,
  theme,
  font,
  onThemeChange,
  onFontChange,
  onClose,
  onProgress,
  onBookmark,
  onSaveQuote,
}: ReaderProps) {
  const resumableCfi = startCfi
    || book.smartBookmark?.cfi
    || ((book.localReaderProgress || 0) >= 0.01 ? book.readerCfi : undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const epubRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const progressCallback = useRef(onProgress);
  const bookmarkCallback = useRef(onBookmark);
  const quoteCallback = useRef(onSaveQuote);
  const themeRef = useRef(theme);
  const fontRef = useRef(font);
  themeRef.current = theme;
  fontRef.current = font;
  const bookmarkRef = useRef<Book["smartBookmark"]>(book.smartBookmark);
  const initialCfi = useRef(resumableCfi);
  const chaptersRef = useRef<Array<NavItem & { depth: number }>>([]);
  const chapterRangesRef = useRef<ChapterRange[]>([]);
  const activeChapterRangeRef = useRef<ChapterRange | null>(null);
  const displayTargetRef = useRef<
    ((target?: string) => Promise<void>) | null
  >(null);
  const chapterNavigateRef = useRef<
    ((direction: FlipDir) => Promise<void>) | null
  >(null);
  const lastProgress = useRef(book.readerProgress || 0);
  const lastCfi = useRef(resumableCfi || "");
  const wheelState = useRef({ amount: 0, lastDirection: 0, lastTurnAt: 0 });
  const flipBusy = useRef(false);
  /**
   * Free drag tracker — page can move left/right/up/down and spin in circles.
   * pathLen + angleAccum make circular swipes feel real (not only sideways).
   */
  const freeDrag = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    width: number;
    height: number;
    pathLen: number;
    angleAccum: number;
    lastSegAngle: number | null;
  } | null>(null);
  /** Live leaf pose while dragging / flying (ref stays fresh mid-gesture) */
  const leafRef = useRef<LeafPose>(IDLE_LEAF);
  const [readerMode, setReaderMode] = useState<ReaderMode>(() => {
    try {
      return window.localStorage.getItem(READER_MODE_KEY) === "pages"
        ? "pages"
        : "scroll";
    } catch {
      return "scroll";
    }
  });
  const readingModeRef = useRef<ReaderMode>(readerMode);
  readingModeRef.current = readerMode;
  const [chapters, setChapters] = useState<Array<NavItem & { depth: number }>>([]);
  const [chapterHref, setChapterHref] = useState("");
  const [showContents, setShowContents] = useState(() => !resumableCfi);
  // Keep TOC open/closed fresh for keyboard handlers (window listeners)
  const showContentsRef = useRef(showContents);
  showContentsRef.current = showContents;
  const [fontSize, setFontSize] = useState(100);
  const [progress, setProgress] = useState(book.readerProgress || 0);
  const [message, setMessage] = useState("Opening book...");
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [addingThought, setAddingThought] = useState(false);
  const [thoughtDraft, setThoughtDraft] = useState("");
  const [closePrompt, setClosePrompt] = useState(false);
  const [bookmark, setBookmark] = useState(book.smartBookmark);
  const [readerQuotes, setReaderQuotes] = useState(book.quotes);
  const readerQuotesRef = useRef(book.quotes);
  readerQuotesRef.current = readerQuotes;
  const [notesOpen, setNotesOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [pageBrief, setPageBrief] = useState<BookPageBrief | null>(null);
  const [notePopover, setNotePopover] = useState<ReaderNotePopover | null>(null);
  /**
   * Free page leaf: move anywhere (x/y), spin (rotZ for circles), tilt (rotX/rotY).
   * Not locked to right-to-left — you steer it.
   */
  const [leaf, setLeaf] = useState<LeafPose>(IDLE_LEAF);
  const locationHrefRef = useRef("");

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /** Push leaf pose to React state + ref together (ref used mid-gesture) */
  function applyLeaf(next: LeafPose) {
    leafRef.current = next;
    setLeaf(next);
  }

  /**
   * Build a free pose from how far/where the finger moved.
   * - x/y follow the finger (any direction)
   * - rotZ grows when you arc (circles) and gets a little spin from diagonal pulls
   * - rotX/rotY tilt so it feels like a real sheet of paper in 3D space
   */
  function poseFromDrag(
    dx: number,
    dy: number,
    angleAccum: number,
    pathLen: number
  ): LeafPose {
    const dist = Math.hypot(dx, dy); // straight-line distance from grab start
    // Spin from curved path (main "circle" feel) + soft spin from direction
    const rotZ =
      angleAccum * (180 / Math.PI) * 0.62 + // path curvature → degrees
      dx * -0.045 + // pull left → slight counter-clockwise
      dy * 0.035; // pull down → slight clock-ish tilt
    // 3D paper tilt: pull left peels Y, pull up/down peels X
    const rotY = Math.max(-70, Math.min(70, -dx * 0.14));
    const rotX = Math.max(-55, Math.min(55, dy * 0.1));
    // How "lifted" the page feels (mix of straight pull + looping path)
    const lift = Math.min(1, (dist + pathLen * 0.18) / 160);
    return {
      active: true,
      x: dx,
      y: dy,
      rotZ,
      rotY,
      rotX,
      scale: 1 - lift * 0.08, // shrink a bit as it lifts off the stack
      opacity: Math.min(1, 0.28 + lift * 0.85),
    };
  }

  /** Decide next vs previous from final drag direction + path (works for circles too) */
  function directionFromGesture(
    dx: number,
    dy: number,
    pathLen: number,
    angleAccum: number
  ): FlipDir | null {
    const dist = Math.hypot(dx, dy);
    // Need a real swipe OR a long looping path before we commit a turn
    const spunEnough = Math.abs(angleAccum) > 1.15 || pathLen > 170;
    const pulledEnough = dist > 72;
    if (!spunEnough && !pulledEnough) return null;

    // Pure-ish spin / circle → still counts as "next" if you circled a lot
    if (spunEnough && dist < 48) {
      return angleAccum < 0 ? "next" : "prev";
    }

    // Prefer the stronger axis so up/down turns work, not only sideways
    if (Math.abs(dx) >= Math.abs(dy) * 0.85) {
      return dx < 0 ? "next" : "prev"; // left = next (natural book), right = back
    }
    return dy < 0 ? "next" : "prev"; // up = next, down = previous
  }

  /** Fly the leaf off-screen in a free path, then change the real EPUB page */
  async function completeFreeTurn(from: LeafPose, direction: FlipDir) {
    if (readingModeRef.current !== "pages" || !renditionRef.current || flipBusy.current) return;
    flipBusy.current = true;
    const duration = 520;
    const start = performance.now();
    let navigated = false;

    // End pose: keep going the way you were dragging, with extra spin (feels free, not a slide)
    const endX =
      direction === "next"
        ? (from.x <= 0 ? from.x - 520 : -480) - Math.abs(from.y) * 0.15
        : (from.x >= 0 ? from.x + 520 : 480) + Math.abs(from.y) * 0.15;
    const endY =
      from.y +
      (Math.abs(from.y) > 20 ? from.y * 0.55 : direction === "next" ? -140 : 140);
    const endRotZ = from.rotZ + (direction === "next" ? -150 : 150);
    const endRotY = direction === "next" ? -95 : 95;
    const endRotX = from.rotX + (direction === "next" ? -18 : 18);

    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOutCubic(t);
        applyLeaf({
          active: true,
          x: from.x + (endX - from.x) * e,
          y: from.y + (endY - from.y) * e,
          rotZ: from.rotZ + (endRotZ - from.rotZ) * e,
          rotY: from.rotY + (endRotY - from.rotY) * e,
          rotX: from.rotX + (endRotX - from.rotX) * e,
          scale: from.scale * (1 - e * 0.12),
          opacity: from.opacity * (1 - e * 0.92),
        });
        // Swap the real page once the leaf is mostly out of the way
        if (!navigated && t >= 0.38) {
          navigated = true;
          if (direction === "next") void renditionRef.current?.next();
          else void renditionRef.current?.prev();
        }
        if (t < 1) window.requestAnimationFrame(frame);
        else resolve();
      };
      window.requestAnimationFrame(frame);
    });

    applyLeaf(IDLE_LEAF);
    flipBusy.current = false;
  }

  /** Soft snap back when the gesture was too small (page returns home) */
  async function snapLeafBack(from: LeafPose) {
    const duration = 260;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeOutCubic(t);
        const live = 1 - e;
        applyLeaf({
          active: live > 0.02,
          x: from.x * live,
          y: from.y * live,
          rotZ: from.rotZ * live,
          rotY: from.rotY * live,
          rotX: from.rotX * live,
          scale: 1 - (1 - from.scale) * live,
          opacity: from.opacity * live,
        });
        if (t < 1) window.requestAnimationFrame(frame);
        else resolve();
      };
      window.requestAnimationFrame(frame);
    });
    applyLeaf(IDLE_LEAF);
  }

  /**
   * Keyboard / wheel preset: free arc + spin (not a boring left-right slide).
   * Next flies up-left while spinning; prev flies down-right while spinning the other way.
   */
  async function animatePresetTurn(direction: FlipDir) {
    if (readingModeRef.current !== "pages" || !renditionRef.current || flipBusy.current) return;
    flipBusy.current = true;
    const duration = 560;
    const start = performance.now();
    let navigated = false;
    const sign = direction === "next" ? -1 : 1;

    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOutCubic(t);
        // Parametric free path: diagonal + sine wave so it can feel like a curve/loop
        const wave = Math.sin(e * Math.PI); // 0 → 1 → 0 bump for arc
        const loop = Math.sin(e * Math.PI * 2) * 0.35; // small circle-ish wiggle
        applyLeaf({
          active: true,
          x: sign * e * 540 + loop * 90 * sign,
          y: sign * e * 90 - wave * 160 * (direction === "next" ? 1 : -0.6) + loop * 70,
          rotZ: sign * e * 170 + loop * 40,
          rotY: sign * e * 80,
          rotX: -wave * 28 * (direction === "next" ? 1 : -1),
          scale: 1 - e * 0.1,
          opacity: Math.min(1, 0.4 + e * 0.7) * (1 - Math.max(0, e - 0.7) / 0.3),
        });
        if (!navigated && t >= 0.4) {
          navigated = true;
          if (direction === "next") void renditionRef.current?.next();
          else void renditionRef.current?.prev();
        }
        if (t < 1) window.requestAnimationFrame(frame);
        else resolve();
      };
      window.requestAnimationFrame(frame);
    });

    applyLeaf(IDLE_LEAF);
    flipBusy.current = false;
  }

  /** Change section from the keyboard or a completed edge gesture. */
  function turnPage(direction: FlipDir, throttle = false) {
    // If the table of contents is open, first close it so the page is visible
    if (showContentsRef.current) {
      setShowContents(false);
    }
    const now = Date.now();
    if (throttle && now - wheelState.current.lastTurnAt < 420) return;
    wheelState.current.lastTurnAt = now;
    // Paginated mode gets the free page animation. Chapter Scroll moves
    // deliberately between TOC chapters instead of leaking into the whole book.
    if (readingModeRef.current === "pages") {
      void animatePresetTurn(direction);
      return;
    }
    if (flipBusy.current) return;
    void chapterNavigateRef.current?.(direction);
  }

  /**
   * Start free drag from any edge (top/right/bottom/left) — not right-corner only.
   * Center stays free so you can still select text.
   */
  function isFreeGrabZone(
    clientX: number,
    clientY: number,
    width: number,
    height: number,
    rectLeft: number,
    rectTop: number
  ): boolean {
    const x = clientX - rectLeft;
    const y = clientY - rectTop;
    const edgeX = Math.max(48, width * 0.14); // how thick the left/right grab strip is
    const edgeY = Math.max(44, height * 0.12); // how thick the top/bottom grab strip is
    const onLeft = x <= edgeX;
    const onRight = x >= width - edgeX;
    const onTop = y <= edgeY;
    const onBottom = y >= height - edgeY;
    return onLeft || onRight || onTop || onBottom;
  }

  /** Shared: begin free page drag from a pointer/touch point */
  function beginFreeDrag(clientX: number, clientY: number): boolean {
    if (readingModeRef.current !== "pages" || flipBusy.current) return false;
    const host = stageRef.current;
    const rect = host?.getBoundingClientRect();
    const width = rect?.width || window.innerWidth;
    const height = rect?.height || window.innerHeight;
    const left = rect?.left || 0;
    const top = rect?.top || 0;
    if (!isFreeGrabZone(clientX, clientY, width, height, left, top)) {
      freeDrag.current = null;
      return false;
    }
    freeDrag.current = {
      active: true,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      width,
      height,
      pathLen: 0,
      angleAccum: 0,
      lastSegAngle: null,
    };
    // Tiny lift so the leaf appears the moment you grab an edge
    applyLeaf({
      active: true,
      x: 0,
      y: 0,
      rotZ: 0,
      rotY: 0,
      rotX: 0,
      scale: 0.995,
      opacity: 0.35,
    });
    return true;
  }

  /** Shared: move free leaf — tracks arcs for circle spin */
  function moveFreeDrag(clientX: number, clientY: number, preventable?: Event) {
    const drag = freeDrag.current;
    if (!drag?.active || flipBusy.current) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    const segX = clientX - drag.lastX;
    const segY = clientY - drag.lastY;
    const segLen = Math.hypot(segX, segY);
    if (segLen < 0.5 && Math.hypot(dx, dy) < 4) return;

    // Path length = how far the finger traveled (circles add up even if you end near start)
    drag.pathLen += segLen;

    // Angle delta between segments → spinning the page when you go in circles
    if (segLen > 1.2) {
      const segAngle = Math.atan2(segY, segX);
      if (drag.lastSegAngle != null) {
        let delta = segAngle - drag.lastSegAngle;
        // Keep delta in (-π, π] so full loops don't jump
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        drag.angleAccum += delta;
      }
      drag.lastSegAngle = segAngle;
    }
    drag.lastX = clientX;
    drag.lastY = clientY;

    preventable?.preventDefault?.();
    applyLeaf(poseFromDrag(dx, dy, drag.angleAccum, drag.pathLen));
  }

  /** Shared: release free drag — complete turn or snap home */
  function endFreeDrag(clientX: number, clientY: number) {
    const drag = freeDrag.current;
    freeDrag.current = null;
    if (!drag?.active) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    const from = leafRef.current;
    const dir = directionFromGesture(dx, dy, drag.pathLen, drag.angleAccum);
    if (dir) void completeFreeTurn(from.active ? from : poseFromDrag(dx, dy, drag.angleAccum, drag.pathLen), dir);
    else void snapLeafBack(from.active ? from : poseFromDrag(dx, dy, drag.angleAccum, drag.pathLen));
  }

  function injectHighlightStyles(doc: Document) {
    if (doc.getElementById("wonder-reader-highlight-css")) return;
    const style = doc.createElement("style");
    style.id = "wonder-reader-highlight-css";
    style.textContent = `
      ::selection {
        background: rgba(255, 182, 200, 0.48) !important;
        color: inherit !important;
      }
      ::-moz-selection {
        background: rgba(255, 182, 200, 0.48) !important;
        color: inherit !important;
      }
      /* epub.js highlight rects — clean light pink, no muddy blend */
      svg.epubjs-hl,
      .epubjs-hl,
      g[class*="epubjs-hl"] rect,
      .${HIGHLIGHT_CLASS},
      rect.${HIGHLIGHT_CLASS} {
        fill: #ffb6c8 !important;
        fill-opacity: 0.42 !important;
        mix-blend-mode: normal !important;
        stroke: none !important;
      }
    `;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function showQuotePopover(
    quote: BookQuote,
    target: EventTarget | null,
    pinned: boolean
  ) {
    const element =
      target && typeof (target as Element).getBoundingClientRect === "function"
        ? (target as Element)
        : null;
    const rect = element?.getBoundingClientRect();
    const rawX = rect ? rect.left + rect.width / 2 : window.innerWidth - 210;
    const x = Math.max(188, Math.min(window.innerWidth - 188, rawX));
    const roomBelow = rect ? window.innerHeight - rect.bottom : 0;
    const above = Boolean(rect && roomBelow < 170);
    const y = rect
      ? above
        ? rect.top - 10
        : rect.bottom + 10
      : Math.min(window.innerHeight - 170, 220);
    setNotePopover({ quote, x, y, above, pinned });
  }

  function bindHighlightHover(
    annotation: unknown,
    quote: BookQuote
  ) {
    type HighlightMark = { element?: Element };
    type AnnotationHandle = {
      mark?: HighlightMark;
      on?: (event: string, listener: (mark: HighlightMark) => void) => void;
    };
    const handle = annotation as AnnotationHandle | undefined;
    const bind = (mark?: HighlightMark) => {
      const element = mark?.element;
      if (!element || element.getAttribute("data-wonder-note") === quote.id) return;
      element.setAttribute("data-wonder-note", quote.id);
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
      element.setAttribute(
        "aria-label",
        quote.interpretation || quote.note
          ? `Annotated highlight: ${quote.text}`
          : `Highlight: ${quote.text}`
      );
      element.addEventListener("mouseenter", (event) =>
        showQuotePopover(quote, event.currentTarget, false)
      );
      element.addEventListener("mouseleave", () =>
        setNotePopover((current) =>
          current?.quote.id === quote.id && !current.pinned ? null : current
        )
      );
      element.addEventListener("focus", (event) =>
        showQuotePopover(quote, event.currentTarget, false)
      );
      element.addEventListener("blur", () =>
        setNotePopover((current) =>
          current?.quote.id === quote.id && !current.pinned ? null : current
        )
      );
    };
    bind(handle?.mark);
    handle?.on?.("attach", bind);
  }

  function addPinkHighlight(quote: BookQuote) {
    if (!quote.location) return;
    const annotation = renditionRef.current?.annotations.add(
      "highlight",
      quote.location,
      { quoteId: quote.id },
      (event: Event) => showQuotePopover(quote, event.currentTarget, true),
      HIGHLIGHT_CLASS,
      { ...HIGHLIGHT_PINK }
    );
    bindHighlightHover(annotation, quote);
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    const element =
      target && (target as Node).nodeType === Node.ELEMENT_NODE
        ? (target as Element)
        : null;
    if (!element) return false;
    if (element.closest("[contenteditable='true']")) return true;
    const tag = element.tagName;
    if (["BUTTON", "SELECT", "A", "TEXTAREA"].includes(tag)) return true;
    if (element.closest("[role='button']")) return true;
    if (tag === "INPUT") {
      const type = (element as HTMLInputElement).type || "text";
      return !["button", "submit", "checkbox", "radio", "range"].includes(type);
    }
    return false;
  }

  function readerScrollContainer(): HTMLElement | null {
    return stageRef.current?.querySelector<HTMLElement>(".epub-container") ?? null;
  }

  function scrollReaderBy(amount: number, behavior: ScrollBehavior = "smooth") {
    readerScrollContainer()?.scrollBy({ top: amount, left: 0, behavior });
  }

  function handleReaderKey(event: KeyboardEvent) {
    const key = event.key;
    if (key === "Escape" && !isEditableTarget(event.target)) {
      setSelection(null);
      setAddingThought(false);
      setThoughtDraft("");
      setNotePopover(null);
      setNotesOpen(false);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
    if (readingModeRef.current === "scroll") {
      const container = readerScrollContainer();
      const page = (container?.clientHeight || window.innerHeight) * 0.82;
      const scrollAmount =
        key === "PageDown" || (key === " " && !event.shiftKey)
          ? page
          : key === "PageUp" || (key === " " && event.shiftKey)
            ? -page
            : key === "ArrowDown" || key === "j" || key === "J"
              ? 64
              : key === "ArrowUp" || key === "k" || key === "K"
                ? -64
                : key === "Home"
                  ? -(container?.scrollHeight || page)
                  : key === "End"
                    ? container?.scrollHeight || page
                    : null;
      if (scrollAmount !== null) {
        event.preventDefault();
        event.stopPropagation();
        const atTop = !container || container.scrollTop <= 8;
        const atBottom =
          !container ||
          container.scrollTop + container.clientHeight >= container.scrollHeight - 8;
        if (scrollAmount > 0 && atBottom && !["End"].includes(key)) {
          turnPage("next");
          return;
        }
        if (scrollAmount < 0 && atTop && !["Home"].includes(key)) {
          turnPage("prev");
          return;
        }
        scrollReaderBy(scrollAmount);
        return;
      }
    }

    const paginated = readingModeRef.current === "pages";
    const next =
      key === "ArrowRight" ||
      key === "Enter" ||
      (paginated &&
        (key === "ArrowDown" ||
          key === "PageDown" ||
          (key === " " && !event.shiftKey)));
    const prev =
      key === "ArrowLeft" ||
      key === "Backspace" ||
      (paginated &&
        (key === "ArrowUp" ||
          key === "PageUp" ||
          (key === " " && event.shiftKey)));
    if (!next && !prev) return;
    event.preventDefault();
    event.stopPropagation();
    turnPage(next ? "next" : "prev");
  }

  function handleReaderWheel(event: WheelEvent) {
    if (readingModeRef.current === "scroll") {
      const container = readerScrollContainer();
      if (!container) return;
      const factor =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 18
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? container.clientHeight
            : 1;
      const primaryDelta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!primaryDelta) return;
      setSelection(null);
      setAddingThought(false);
      setThoughtDraft("");
      setNotePopover(null);
      event.preventDefault();
      container.scrollBy({ top: primaryDelta * factor, left: 0, behavior: "auto" });
      return;
    }

    const horizontal = Math.abs(event.deltaX) > Math.max(10, Math.abs(event.deltaY) * 0.7) || event.shiftKey;
    if (!horizontal) return;
    event.preventDefault();
    const delta = event.shiftKey && Math.abs(event.deltaX) < 1 ? event.deltaY : event.deltaX;
    const direction = Math.sign(delta);
    if (!direction) return;
    if (wheelState.current.lastDirection && wheelState.current.lastDirection !== direction) wheelState.current.amount = 0;
    wheelState.current.lastDirection = direction;
    wheelState.current.amount += delta;
    if (Math.abs(wheelState.current.amount) >= 44) {
      turnPage(direction > 0 ? "next" : "prev", true);
      wheelState.current.amount = 0;
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleReaderKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleReaderKey);
    };
  }, []);

  useEffect(() => {
    progressCallback.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    bookmarkCallback.current = onBookmark;
  }, [onBookmark]);

  useEffect(() => {
    quoteCallback.current = onSaveQuote;
  }, [onSaveQuote]);

  useEffect(() => {
    setReaderQuotes(book.quotes);
  }, [book.quotes]);

  useEffect(() => {
    try {
      window.localStorage.setItem(READER_MODE_KEY, readerMode);
    } catch {
      /* private browsing / blocked storage: keep the in-memory preference */
    }
  }, [readerMode]);

  useEffect(() => {
    const warnBeforeTabClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeTabClose);
    return () => window.removeEventListener("beforeunload", warnBeforeTabClose);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !book.readerUrl) return;

    chapterRangesRef.current = [];
    activeChapterRangeRef.current = null;
    // Local-books serves one EPUB archive at a route ending in `/file`.
    // epub.js otherwise mistakes that extensionless URL for an unpacked
    // directory and never finds the package metadata.
    const epub = ePub(
      book.readerUrl,
      book.readerUrl.includes("/api/local-books/")
        ? { openAs: "epub" }
        : undefined
    );
    const cleanReaderSource = (
      readerDocument: Document,
      section: MutableSpineSection
    ) => {
      // Strip the download-site stamp in memory before epub.js measures the
      // iframe. The Apple Books source file itself is never modified.
      for (const link of Array.from(
        readerDocument.querySelectorAll<HTMLAnchorElement>(
          'a[href*="oceanofpdf" i]'
        )
      )) {
        let wrapper = link.parentElement;
        let removedWrapper = false;
        while (wrapper && wrapper !== readerDocument.body) {
          const onlySource =
            wrapper.textContent
              ?.replace(/\s+/g, " ")
              .trim()
              .toLowerCase() === "oceanofpdf.com";
          if (
            onlySource &&
            (wrapper.tagName === "P" || wrapper.tagName === "DIV")
          ) {
            wrapper.remove();
            removedWrapper = true;
            break;
          }
          wrapper = wrapper.parentElement;
        }
        if (!removedWrapper) link.remove();
      }

      const body =
        readerDocument.body || readerDocument.querySelector("body");
      if (!body) return;
      body.setAttribute("tabindex", "0");
      if (readerMode !== "scroll") return;
      body.classList.add("wonder-scroll-section");
      const range = rangeForSection(
        chapterRangesRef.current,
        section.index
      );
      if (range?.startIndex === section.index) {
        body.classList.add("wonder-chapter-first");
      }
      if (range?.endIndex === section.index) {
        body.classList.add("wonder-chapter-last");
      }
    };
    epub.spine.hooks.content.register(cleanReaderSource);

    const rendition = epub.renderTo(stage, {
      width: "100%",
      height: "100%",
      flow: readerMode === "scroll" ? "scrolled-continuous" : "paginated",
      spread: "none",
      manager: readerMode === "scroll" ? "continuous" : "default",
      overflow: readerMode === "scroll" ? "auto" : "hidden",
    });
    epubRef.current = epub;
    renditionRef.current = rendition;

    rendition.themes.default(
      readerThemeRules(themeRef.current, fontRef.current, readerMode)
    );

    let disposed = false;
    let restoreFence: (() => void) | null = null;
    const contentCleanups: Array<() => void> = [];
    const attachedDocuments = new WeakSet<Document>();

    const applyChapterFence = (target?: string): ChapterRange | undefined => {
      const section = resolveSpineSection(epub, target);
      if (!section) return undefined;
      let range = rangeForSection(
        chapterRangesRef.current,
        section.index
      );
      if (!range && readerMode === "scroll") {
        range = {
          href: section.href,
          label: "Current section",
          startIndex: section.index,
          endIndex: section.index,
          fromToc: false,
        };
        chapterRangesRef.current = [range];
      }
      if (!range) return undefined;

      restoreFence?.();
      restoreFence = null;
      activeChapterRangeRef.current = range;
      if (readerMode !== "scroll") return range;

      const start = resolveSpineSection(epub, String(range.startIndex));
      const end = resolveSpineSection(epub, String(range.endIndex));
      if (!start || !end) return range;
      const originalPrev = start.prev;
      const originalNext = end.next;
      start.prev = () => undefined;
      end.next = () => undefined;
      restoreFence = () => {
        start.prev = originalPrev;
        end.next = originalNext;
      };
      return range;
    };

    const displayTarget = async (target?: string) => {
      const range = applyChapterFence(target);
      if (range?.fromToc) setChapterHref(range.href);
      else if (range) setChapterHref("");
      await rendition.display(target);
    };
    displayTargetRef.current = displayTarget;

    chapterNavigateRef.current = async (direction) => {
      const ranges = chapterRangesRef.current;
      const active = activeChapterRangeRef.current;
      if (!ranges.length || !active || disposed) return;
      const currentIndex = ranges.findIndex(
        (range) =>
          range.startIndex === active.startIndex &&
          range.endIndex === active.endIndex
      );
      const nextIndex = currentIndex + (direction === "next" ? 1 : -1);
      const target = ranges[nextIndex];
      if (!target) return;
      setShowContents(false);
      setSelection(null);
      setAddingThought(false);
      setThoughtDraft("");
      setNotePopover(null);
      setMessage(
        direction === "next" ? "Opening next chapter..." : "Opening previous chapter..."
      );
      try {
        await displayTarget(target.href);
        if (!disposed) setMessage("");
      } catch {
        if (!disposed) setMessage("That chapter could not be opened.");
      }
    };

    const attachReaderInput = (contents: ReaderContents) => {
      const readerDocument = contents.document;
      if (!readerDocument || attachedDocuments.has(readerDocument)) return;
      attachedDocuments.add(readerDocument);
      injectHighlightStyles(readerDocument);

      // Free page drag from any edge — finger can then go anywhere (up/down/circles)
      const touchStarted = (event: TouchEvent) => {
        const t = event.touches[0];
        if (t) beginFreeDrag(t.clientX, t.clientY);
      };
      const touchMoved = (event: TouchEvent) => {
        const t = event.touches[0];
        if (t && freeDrag.current?.active) moveFreeDrag(t.clientX, t.clientY, event);
      };
      const touchEnded = (event: TouchEvent) => {
        const t = event.changedTouches[0];
        const fallbackX = freeDrag.current?.lastX ?? freeDrag.current?.startX ?? 0;
        const fallbackY = freeDrag.current?.lastY ?? freeDrag.current?.startY ?? 0;
        endFreeDrag(t?.clientX ?? fallbackX, t?.clientY ?? fallbackY);
      };
      const selectionChanged = () => {
        window.setTimeout(() => {
          const current = readerDocument.getSelection();
          if (!current || current.isCollapsed || !current.toString().trim()) {
            setSelection(null);
            setAddingThought(false);
            setThoughtDraft("");
          }
        }, 0);
      };

      readerDocument.addEventListener("wheel", handleReaderWheel, { passive: false });
      readerDocument.addEventListener("keydown", handleReaderKey);
      readerDocument.addEventListener("selectionchange", selectionChanged);
      readerDocument.addEventListener("touchstart", touchStarted, { passive: true });
      readerDocument.addEventListener("touchmove", touchMoved, { passive: false });
      readerDocument.addEventListener("touchend", touchEnded, { passive: false });
      readerDocument.addEventListener("touchcancel", touchEnded, { passive: false });
      contentCleanups.push(() => {
        readerDocument.removeEventListener("wheel", handleReaderWheel);
        readerDocument.removeEventListener("keydown", handleReaderKey);
        readerDocument.removeEventListener("selectionchange", selectionChanged);
        readerDocument.removeEventListener("touchstart", touchStarted);
        readerDocument.removeEventListener("touchmove", touchMoved);
        readerDocument.removeEventListener("touchend", touchEnded);
        readerDocument.removeEventListener("touchcancel", touchEnded);
      });
    };
    rendition.hooks.content.register(attachReaderInput);

    const relocated = (location: Location) => {
      const nextProgress = Number.isFinite(location.start.percentage)
        ? Math.min(1, Math.max(0, location.start.percentage))
        : lastProgress.current;
      lastProgress.current = nextProgress;
      setProgress(nextProgress);
      setPageBrief(null);
      setBriefOpen(false);
      const activeRange = rangeForSection(
        chapterRangesRef.current,
        location.start.index
      );
      if (activeRange) activeChapterRangeRef.current = activeRange;
      locationHrefRef.current =
        location.start.href || activeRange?.href || "";
      setChapterHref(
        activeRange?.fromToc ? activeRange.href : ""
      );
      lastCfi.current = location.start.cfi;
      progressCallback.current(location.start.cfi, nextProgress);
      const saved = bookmarkRef.current;
      if (saved && nextProgress > saved.progress + 0.006) {
        rendition.annotations.remove(saved.cfi, "underline");
        bookmarkRef.current = undefined;
        setBookmark(undefined);
        bookmarkCallback.current(undefined);
      }
    };
    rendition.on("relocated", relocated);

    const selected = (cfi: string, contents: { window?: Window }) => {
      const nativeSelection = contents?.window?.getSelection?.();
      const text = nativeSelection?.toString().trim() || "";
      if (text) {
        const rangeRect =
          nativeSelection && nativeSelection.rangeCount
            ? nativeSelection.getRangeAt(0).getBoundingClientRect()
            : null;
        const frameElement =
          (contents?.window?.frameElement as HTMLElement | null | undefined) ||
          Array.from(stageRef.current?.querySelectorAll("iframe") || []).find(
            (frame) => frame.contentWindow === contents?.window
          );
        const frameRect = frameElement?.getBoundingClientRect();
        const rawX =
          (frameRect?.left || 0) +
          (rangeRect ? rangeRect.left + rangeRect.width / 2 : window.innerWidth / 2);
        const rawBottom =
          (frameRect?.top || 0) + (rangeRect?.bottom || window.innerHeight / 2);
        const rawTop =
          (frameRect?.top || 0) + (rangeRect?.top || window.innerHeight / 2);
        const above = rawBottom > window.innerHeight - 170;
        setSelection({
          cfi,
          text,
          x: Math.max(190, Math.min(window.innerWidth - 190, rawX)),
          y: above ? rawTop - 10 : rawBottom + 10,
          above,
        });
        setAddingThought(false);
        setThoughtDraft("");
      }
    };
    rendition.on("selected", selected);

    void (async () => {
      try {
        if (/^\/api\/(?:apple-books|local-books)\//.test(book.readerUrl || "")) {
          const available = await withTimeout(
            fetch(book.readerUrl as string, { method: "HEAD" }),
            3_000,
            "book-file-check-timeout"
          );
          if (!available.ok) {
            throw new Error("book-file-missing");
          }
        }
        let opened = false;
        let navigation:
          | {
              toc?: NavItem[];
              landmarks?: Array<{ type?: string; href?: string }>;
            }
          | undefined;
        const resume = lastCfi.current || initialCfi.current;
        const displayTimeout =
          readerMode === "scroll"
            ? CHAPTER_DISPLAY_TIMEOUT_MS
            : DISPLAY_TIMEOUT_MS;
        const navigationPromise = withTimeout(
          epub.loaded.navigation as Promise<{
            toc?: NavItem[];
            landmarks?: Array<{ type?: string; href?: string }>;
          }>,
          NAV_TIMEOUT_MS,
          "nav-timeout"
        );

        const installNavigation = (
          loaded:
            | {
                toc?: NavItem[];
                landmarks?: Array<{ type?: string; href?: string }>;
              }
            | undefined
        ) => {
          const nextChapters = flattenToc(loaded?.toc || []).filter(
            (chapter) => Boolean(chapter.href && chapter.label?.trim())
          );
          chaptersRef.current = nextChapters;
          chapterRangesRef.current = buildChapterRanges(epub, nextChapters);
          setChapters(nextChapters);

          const currentSection = resolveSpineSection(
            epub,
            lastCfi.current || resume
          );
          const activeRange = currentSection
            ? rangeForSection(
                chapterRangesRef.current,
                currentSection.index
              )
            : undefined;
          if (activeRange) {
            activeChapterRangeRef.current = activeRange;
            setChapterHref(activeRange.fromToc ? activeRange.href : "");
          }
        };

        /*
         * Chapter Scroll must know the TOC boundaries before first paint.
         * Otherwise epub.js's continuous manager would keep appending the
         * entire book. Pages can paint immediately while navigation loads.
         */
        if (readerMode === "scroll") {
          try {
            navigation = await navigationPromise;
          } catch {
            navigation = undefined;
          }
          try {
            await withTimeout(epub.ready, NAV_TIMEOUT_MS, "book-ready-timeout");
          } catch {
            /* displayTarget still fences the current section as a safe fallback */
          }
          if (disposed) return;
          installNavigation(navigation);
        }

        if (resume) {
          try {
            await withTimeout(
              displayTarget(resume),
              displayTimeout,
              "display-cfi"
            );
            opened = true;
          } catch {
            // A continuous chapter can paint before epub.js finishes filling
            // its neighboring split documents. Do not start a second display
            // and race the manager only when the first view is already visible.
            opened = Boolean(stage.querySelector("iframe"));
          }
        }
        if (!opened) {
          try {
            await withTimeout(
              displayTarget(),
              readerMode === "scroll"
                ? CHAPTER_DISPLAY_TIMEOUT_MS
                : FALLBACK_DISPLAY_MS,
              "display-default"
            );
            opened = true;
          } catch {
            opened = Boolean(stage.querySelector("iframe"));
          }
        }
        if (opened && !disposed) setMessage("");

        if (readerMode === "pages") {
          try {
            navigation = await navigationPromise;
          } catch {
            navigation = undefined;
          }
          if (disposed) return;
          installNavigation(navigation);
        }

        // If the default/resume target failed, use the TOC as a safe landing.
        if (!opened) {
          const contentsLandmark = navigation?.landmarks?.find(
              (item) => item.type?.toLowerCase() === "toc"
            )?.href;
          const contentsItem = chaptersRef.current.find((item) =>
            /^(?:table\s+of\s+)?contents$/i.test(item.label.trim())
          )?.href;
          const targets = [
            contentsLandmark,
            contentsItem,
            chaptersRef.current[0]?.href,
          ].filter(
            (target, index, all): target is string =>
              Boolean(target) && all.indexOf(target) === index
          );
          for (const target of targets) {
            try {
              await withTimeout(
                displayTarget(target),
                displayTimeout,
                "display-target"
              );
              opened = true;
              break;
            } catch {
              /* next target */
            }
          }
        }

        if (disposed) return;
        if (!opened) {
          setMessage("This book could not be opened.");
          return;
        }
        setMessage("");

        for (const quote of readerQuotesRef.current) {
          try {
            addPinkHighlight(quote);
          } catch {
            /* bad CFI — skip */
          }
        }
        if (bookmarkRef.current?.cfi) {
          rendition.annotations.add(
            "underline",
            bookmarkRef.current.cfi,
            {},
            undefined,
            "smart-bookmark",
            { stroke: "#76b9ff", "stroke-opacity": "0.9" }
          );
        }
      } catch (error) {
        if (!disposed) {
          setMessage(
            error instanceof Error && error.message === "book-file-missing"
              ? "This file is no longer on this Mac. Re-download it in Apple Books or add the EPUB again."
              : "This book could not be opened."
          );
        }
      }
    })();

    return () => {
      disposed = true;
      restoreFence?.();
      rendition.off("relocated", relocated);
      rendition.off("selected", selected);
      rendition.hooks.content.deregister(attachReaderInput);
      epub.spine.hooks.content.deregister(cleanReaderSource);
      contentCleanups.forEach((cleanup) => cleanup());
      rendition.destroy();
      epub.destroy();
      if (renditionRef.current === rendition) renditionRef.current = null;
      if (epubRef.current === epub) epubRef.current = null;
      if (displayTargetRef.current === displayTarget) {
        displayTargetRef.current = null;
        chapterNavigateRef.current = null;
      }
    };
  }, [book.id, book.readerUrl, readerMode]);

  function openChapter(href: string) {
    const displayTarget = displayTargetRef.current;
    if (!href || !displayTarget) return;
    setShowContents(false);
    setChapterHref(href);
    setMessage("Opening chapter...");
    void displayTarget(href)
      .then(() => setMessage(""))
      .catch(() => setMessage("That chapter could not be opened."));
  }

  function changeReaderMode(nextMode: ReaderMode) {
    if (nextMode === readerMode) return;
    flipBusy.current = false;
    applyLeaf(IDLE_LEAF);
    setSelection(null);
    setAddingThought(false);
    setThoughtDraft("");
    setNotePopover(null);
    setMessage(
      nextMode === "scroll" ? "Opening full chapter..." : "Fitting page..."
    );
    setReaderMode(nextMode);
  }

  function savePlace(candidate = selection) {
    const cfi = candidate?.cfi || lastCfi.current;
    if (!cfi) return;
    if (bookmark?.cfi) renditionRef.current?.annotations.remove(bookmark.cfi, "underline");
    const next = { cfi, text: candidate?.text || "Resume from this page", progress: lastProgress.current, createdAt: Date.now() };
    renditionRef.current?.annotations.add(
      "underline",
      cfi,
      {},
      undefined,
      "smart-bookmark",
      { stroke: "#76b9ff", "stroke-opacity": "0.9" }
    );
    setBookmark(next);
    bookmarkRef.current = next;
    bookmarkCallback.current(next);
    setSelection(null);
    setAddingThought(false);
    setThoughtDraft("");
    setClosePrompt(false);
  }

  function saveHighlight(note = "") {
    if (!selection) return;
    const sectionLabel =
      activeChapterRangeRef.current?.label ||
      chaptersRef.current.find((chapter) =>
        sameDocument(chapter.href, locationHrefRef.current || chapterHref)
      )?.label?.trim() ||
      "Current section";
    const quote = newQuote(selection.text, sectionLabel, note, selection.cfi);
    try {
      // Remove any sloppy partial mark at this CFI first
      renditionRef.current?.annotations.remove(selection.cfi, "highlight");
    } catch {
      /* none yet */
    }
    try {
      addPinkHighlight(quote);
    } catch {
      /* CFI may fail on some EPUBs — still save the quote */
    }
    setReaderQuotes((current) => [quote, ...current]);
    quoteCallback.current(quote);
    // Clear native selection so UI feels clean
    try {
      const contents = renditionRef.current?.getContents?.() as
        | Array<{ window?: Window }>
        | { window?: Window }
        | undefined;
      const list = Array.isArray(contents) ? contents : contents ? [contents] : [];
      list.forEach((c) => c.window?.getSelection?.()?.removeAllRanges());
    } catch {
      /* ignore */
    }
    setSelection(null);
    setAddingThought(false);
    setThoughtDraft("");
  }

  function requestClose() {
    setClosePrompt(true);
  }

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}%`);
  }, [fontSize]);

  useEffect(() => {
    renditionRef.current?.themes.default(
      readerThemeRules(theme, font, readerMode)
    );
  }, [theme, font, readerMode]);

  function openSavedQuote(quote: BookQuote) {
    const displayTarget = displayTargetRef.current;
    if (!quote.location || !displayTarget) return;
    setShowContents(false);
    setNotesOpen(false);
    setNotePopover(null);
    setMessage("Opening highlight...");
    void displayTarget(quote.location)
      .then(() => setMessage(""))
      .catch(() => setMessage("That highlight could not be opened."));
  }

  function visibleReaderText(): string {
    try {
      const contents = renditionRef.current?.getContents?.() as
        | ReaderContents[]
        | ReaderContents
        | undefined;
      const list = Array.isArray(contents) ? contents : contents ? [contents] : [];
      const visibleText: string[] = [];
      for (const content of list) {
        const frame = content.window?.frameElement as HTMLElement | null;
        const frameRect = frame?.getBoundingClientRect();
        if (
          frameRect &&
          (frameRect.bottom < 0 ||
            frameRect.top > window.innerHeight ||
            frameRect.right < 0 ||
            frameRect.left > window.innerWidth)
        ) {
          continue;
        }
        const width = content.window.innerWidth;
        const height = content.window.innerHeight;
        const nodes = Array.from(
          content.document.body.querySelectorAll(
            "h1, h2, h3, h4, p, li, blockquote"
          )
        ) as HTMLElement[];
        const inView = nodes
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.bottom >= 0 &&
              rect.top <= height &&
              rect.right >= 0 &&
              rect.left <= width
            );
          })
          .map((node) => node.innerText.trim())
          .filter(Boolean);
        visibleText.push(
          ...(inView.length
            ? inView
            : [content.document.body.innerText || ""])
        );
      }
      return visibleText.join(" ").replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
  }

  function togglePageBrief() {
    if (briefOpen) {
      setBriefOpen(false);
      return;
    }
    const text = visibleReaderText();
    const heading =
      activeChapterRangeRef.current?.label ||
      chaptersRef.current.find((chapter) =>
        sameDocument(chapter.href, locationHrefRef.current || chapterHref)
      )?.label ||
      "Current page";
    setPageBrief(buildBookPageBrief(text, heading));
    setBriefOpen(true);
  }

  const quoteGroups = Array.from(
    readerQuotes.reduce((groups, quote) => {
      const label = quote.page?.trim() || "Saved passages";
      const items = groups.get(label) || [];
      items.push(quote);
      groups.set(label, items);
      return groups;
    }, new Map<string, BookQuote[]>())
  );
  const progressLabel = `${Math.round(progress * 100)}%`;

  return (
    <div
      className={`bl-reader ${
        readerMode === "scroll" ? "is-scroll-reader" : "is-page-reader"
      }`}
      data-reader-theme={theme}
      data-reader-font={font}
      data-reader-mode={readerMode}
    >
      <header className="bl-reader-head">
        <button
          type="button"
          className="bl-icon-btn bl-reader-back"
          onClick={requestClose}
          title="Back to bookshelf"
        >
          <ArrowLeft size={18} aria-hidden />
        </button>
        <div className="bl-reader-title">
          <strong>{book.title}</strong>
          <span>{book.author || "Wonder Bookshelf"}</span>
        </div>
        <div
          className="bl-reader-progress"
          aria-label={`${progressLabel} complete`}
        >
          <i style={{ width: progressLabel }} />
        </div>
        <span className="bl-reader-percent">{progressLabel}</span>
      </header>

      <div className="bl-reader-tools" role="toolbar" aria-label="Reading controls">
        <label className="bl-reader-chapters-wrap">
          <span className="bl-reader-chapters-label">Chapters</span>
          <select
            className="bl-reader-chapters"
            value={showContents ? "__contents__" : chapterHref}
            onChange={(event) => {
              const href = event.target.value;
              if (href === "__contents__") {
                setShowContents(true);
                return;
              }
              openChapter(href);
            }}
            aria-label="Book chapter"
          >
            <option value="__contents__">Table of Contents</option>
            {!showContents && !chapterHref ? (
              <option value="">Current page</option>
            ) : null}
            {chapters.map((chapter) => (
              <option key={`${chapter.id}-${chapter.href}`} value={chapter.href}>
                {`${"  ".repeat(chapter.depth)}${chapter.label.trim()}`}
              </option>
            ))}
          </select>
        </label>

        <div
          className="bl-reader-mode"
          role="group"
          aria-label="Reading mode"
        >
          <button
            type="button"
            className={readerMode === "scroll" ? "is-on" : ""}
            aria-pressed={readerMode === "scroll"}
            onClick={() => changeReaderMode("scroll")}
            title="Scroll through one complete chapter"
          >
            <Rows size={14} aria-hidden />
            <span>Chapter scroll</span>
          </button>
          <button
            type="button"
            className={readerMode === "pages" ? "is-on" : ""}
            aria-pressed={readerMode === "pages"}
            onClick={() => changeReaderMode("pages")}
            title="Fit one page and turn with the keyboard or a swipe"
          >
            <BookOpenText size={14} aria-hidden />
            <span>Pages</span>
          </button>
        </div>

        <div className="bl-reader-size" aria-label="Text size">
          <button
            type="button"
            className="bl-size-btn"
            onClick={() => setFontSize((value) => Math.max(80, value - 10))}
            title="Smaller text"
            aria-label="Smaller text"
          >
            <Minus size={14} weight="bold" aria-hidden />
          </button>
          <span className="bl-size-label" aria-hidden>
            Aa
          </span>
          <button
            type="button"
            className="bl-size-btn"
            onClick={() => setFontSize((value) => Math.min(150, value + 10))}
            title="Larger text"
            aria-label="Larger text"
          >
            <Plus size={14} weight="bold" aria-hidden />
          </button>
        </div>

        <div className="bl-reader-appearance" aria-label="Reader appearance">
          <div
            className="bl-reader-theme"
            role="group"
            aria-label="Reading theme"
          >
            <button
              type="button"
              className={theme === "light" ? "is-on" : ""}
              aria-pressed={theme === "light"}
              onClick={() => onThemeChange("light")}
              title="Light reading theme"
            >
              <Sun size={14} aria-hidden />
              <span>Light</span>
            </button>
            <button
              type="button"
              className={theme === "dark" ? "is-on" : ""}
              aria-pressed={theme === "dark"}
              onClick={() => onThemeChange("dark")}
              title="Dark reading theme"
            >
              <Moon size={14} aria-hidden />
              <span>Dark</span>
            </button>
          </div>
          <label className="bl-reader-font">
            <TextAa size={15} aria-hidden />
            <span className="bl-sr-only">Reading font</span>
            <select
              aria-label="Reading font"
              value={font}
              onChange={(event) =>
                onFontChange(event.target.value as ReadingFont)
              }
            >
              {READING_FONT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

      </div>

      <div className={`bl-reader-stage-wrap${leaf.active ? " is-free-leaf" : ""}`}>
        {showContents ? (
          <section className="bl-reader-toc" aria-label="Table of Contents">
            <div className="bl-reader-toc-glow" aria-hidden />
            <div className="bl-reader-toc-inner">
              <header>
                <div>
                  <span>Open a chapter</span>
                  <h2>Table of Contents</h2>
                  <p className="bl-reader-toc-sub">
                    {book.title}
                    {book.author ? ` · ${book.author}` : ""}
                  </p>
                </div>
                {resumableCfi ? (
                  <button
                    type="button"
                    className="bl-icon-btn bl-toc-resume"
                    onClick={() => setShowContents(false)}
                    title="Return to saved place"
                    aria-label="Return to saved place"
                  >
                    <X size={15} aria-hidden />
                  </button>
                ) : null}
              </header>
              {chapters.length ? (
                <nav>
                  {chapters.map((chapter, index) => (
                    <button
                      key={`${chapter.id}-${chapter.href}`}
                      type="button"
                      className={chapter.depth ? "is-nested" : ""}
                      style={{
                        paddingLeft: `${18 + chapter.depth * 22}px`,
                      }}
                      onClick={() => openChapter(chapter.href)}
                    >
                      <em className="bl-toc-num" aria-hidden>
                        {String(index + 1).padStart(2, "0")}
                      </em>
                      <span>{chapter.label.trim()}</span>
                      <CaretRight size={16} weight="bold" aria-hidden />
                    </button>
                  ))}
                </nav>
              ) : (
                <p>This EPUB does not include a chapter list.</p>
              )}
              <p className="bl-reader-toc-hint">
                {readerMode === "scroll"
                  ? "↓ scroll this chapter · Enter or → next chapter"
                  : "← previous page · Enter or → next page"}
              </p>
            </div>
          </section>
        ) : null}
        {message ? <p className="bl-reader-message">{message}</p> : null}

        <div className="bl-flip-scene">
          <div ref={stageRef} className="bl-reader-stage" />

          {/* Free page leaf — follows finger any direction (x/y/spin/tilt) */}
          <div
            className={`bl-page-leaf${leaf.active ? " is-on" : ""}`}
            style={
              {
                ["--lx" as string]: `${leaf.x}px`,
                ["--ly" as string]: `${leaf.y}px`,
                ["--rz" as string]: `${leaf.rotZ}deg`,
                ["--ry" as string]: `${leaf.rotY}deg`,
                ["--rx" as string]: `${leaf.rotX}deg`,
                ["--sc" as string]: String(leaf.scale),
                ["--op" as string]: String(leaf.opacity),
              } as CSSProperties
            }
            aria-hidden
          >
            <div className="bl-page-leaf-front" />
            <div className="bl-page-leaf-back" />
            <div className="bl-page-leaf-glow" />
          </div>

        </div>
      </div>

      <aside className={`bl-notes-dock${notesOpen ? " is-open" : ""}`}>
        <button
          type="button"
          className="bl-notes-edge"
          aria-label={`${readerQuotes.length} saved book highlights and notes`}
          aria-expanded={notesOpen}
          aria-controls="bl-reader-notes"
          onClick={() => setNotesOpen((open) => !open)}
        >
          <Notebook size={18} weight="fill" aria-hidden />
          <span>Notes</span>
          {readerQuotes.length ? <em>{readerQuotes.length}</em> : null}
        </button>
        {!notesOpen ? (
          <div className="bl-notes-peek" aria-hidden>
            <strong>Book notes</strong>
            <span>
              {readerQuotes.length
                ? `${readerQuotes.length} saved passage${readerQuotes.length === 1 ? "" : "s"}`
                : "Nothing saved yet"}
            </span>
            {readerQuotes.slice(0, 2).map((quote) => (
              <q key={quote.id}>{quote.text}</q>
            ))}
            <small>Click once to open</small>
          </div>
        ) : null}
        {notesOpen ? (
          <section id="bl-reader-notes" className="bl-notes-drawer" aria-label="Book notes">
            <header>
              <div>
                <span>Book memory</span>
                <h2>Highlights & notes</h2>
              </div>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                aria-label="Close book notes"
              >
                <X size={16} aria-hidden />
              </button>
            </header>
            <p className="bl-notes-intro">
              Grouped section by section. Click any passage to return to it.
            </p>
            {quoteGroups.length ? (
              <div className="bl-notes-groups">
                {quoteGroups.map(([label, quotes]) => (
                  <section key={label}>
                    <h3>{label}</h3>
                    {quotes.map((quote) => {
                      const note = quote.interpretation || quote.note;
                      return (
                        <button
                          key={quote.id}
                          type="button"
                          className={note ? "has-note" : ""}
                          onClick={() => openSavedQuote(quote)}
                          disabled={!quote.location}
                        >
                          <q>{quote.text}</q>
                          {note ? <span>{note}</span> : <small>Highlight</small>}
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>
            ) : (
              <div className="bl-notes-empty">
                <HighlighterCircle size={24} aria-hidden />
                <strong>Your margin is clear.</strong>
                <span>Select a passage to highlight it or add a thought.</span>
              </div>
            )}
          </section>
        ) : null}
      </aside>

      <aside className={`bl-brief-dock${briefOpen ? " is-open" : ""}`}>
        <button
          type="button"
          className="bl-brief-edge"
          aria-label="Brief the visible page"
          aria-expanded={briefOpen}
          onClick={togglePageBrief}
        >
          <BookOpenText size={18} weight="fill" aria-hidden />
          <span>Brief</span>
        </button>
        {briefOpen ? (
          <section className="bl-brief-drawer" aria-label="Visible page brief">
            <header>
              <div>
                <span>From the visible text</span>
                <h2>{pageBrief?.heading || "Page brief"}</h2>
              </div>
              <button
                type="button"
                onClick={() => setBriefOpen(false)}
                aria-label="Close page brief"
              >
                <X size={16} aria-hidden />
              </button>
            </header>
            {pageBrief?.takeaways.length ? (
              <>
                <ol>
                  {pageBrief.takeaways.map((takeaway) => (
                    <li key={takeaway}>{takeaway}</li>
                  ))}
                </ol>
                {pageBrief.action ? (
                  <div className="bl-brief-action">
                    <span>Apply</span>
                    <p>{pageBrief.action}</p>
                  </div>
                ) : null}
                <small>
                  Extractive brief · {pageBrief.sourceWords} visible words · no
                  ideas added outside the page
                </small>
              </>
            ) : (
              <p className="bl-brief-empty">
                No readable paragraph is visible yet. Open a page, then tap
                Brief again.
              </p>
            )}
          </section>
        ) : null}
      </aside>

      {notePopover ? (
        <aside
          className={`bl-note-popover${notePopover.above ? " is-above" : ""}${
            notePopover.pinned ? " is-pinned" : ""
          }`}
          style={
            {
              ["--note-x" as string]: `${notePopover.x}px`,
              ["--note-y" as string]: `${notePopover.y}px`,
            } as CSSProperties
          }
          aria-label="Saved annotation"
        >
          <span>
            {notePopover.quote.interpretation || notePopover.quote.note
              ? "Your note"
              : "Highlighted"}
          </span>
          {notePopover.pinned ? (
            <button
              type="button"
              onClick={() => setNotePopover(null)}
              aria-label="Close annotation"
            >
              <X size={13} aria-hidden />
            </button>
          ) : null}
          <q>{notePopover.quote.text}</q>
          {notePopover.quote.interpretation || notePopover.quote.note ? (
            <p>{notePopover.quote.interpretation || notePopover.quote.note}</p>
          ) : null}
        </aside>
      ) : null}

      {selection ? (
        <div
          className={`bl-smart-selection${addingThought ? " is-writing" : ""}${
            selection.above ? " is-above" : ""
          }`}
          style={
            {
              ["--selection-x" as string]: `${selection.x}px`,
              ["--selection-y" as string]: `${selection.y}px`,
            } as CSSProperties
          }
        >
          {addingThought ? (
            <div className="bl-selection-thought">
              <p>{selection.text}</p>
              <textarea
                value={thoughtDraft}
                placeholder="Your interpretation, connection, or question..."
                autoFocus
                onChange={(event) => setThoughtDraft(event.target.value)}
              />
              <div>
                <button type="button" className="is-primary" onClick={() => saveHighlight(thoughtDraft)}>
                  Save highlight + thought
                </button>
                <button type="button" onClick={() => setAddingThought(false)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="bl-selection-actions">
              <button type="button" className="is-primary" onClick={() => saveHighlight()}>
                <HighlighterCircle size={15} weight="fill" /> Highlight
              </button>
              <button type="button" onClick={() => setAddingThought(true)}>
                <NotePencil size={15} /> Add thought
              </button>
              <button type="button" onClick={() => savePlace()}>
                <BookmarkSimple size={15} weight="fill" /> Bookmark
              </button>
            </div>
          )}
          <button
            type="button"
            className="bl-selection-close"
            onClick={() => {
              setSelection(null);
              setAddingThought(false);
              setThoughtDraft("");
            }}
            aria-label="Dismiss selection tools"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {closePrompt && <div className="bl-bookmark-prompt" role="dialog" aria-modal="true" aria-label="Save reading position"><div><p>Where did you leave off?</p><h2>{selection ? "Use the sentence you highlighted?" : "Highlight a sentence, or save this page."}</h2><div>{selection && <button type="button" className="is-primary" onClick={() => savePlace(selection)}>Save highlighted point</button>}<button type="button" onClick={() => savePlace(null)}>Save current page</button><button type="button" onClick={onClose}>Close without changing bookmark</button><button type="button" className="bl-prompt-cancel" onClick={() => setClosePrompt(false)}>Keep reading</button></div></div></div>}

    </div>
  );
}
