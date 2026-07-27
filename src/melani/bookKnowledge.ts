/**
 * Book knowledge layer for Mel + Finance Copilot.
 *
 * Feeds agents from YOUR Bookshelf only:
 *   - title, author, category, status, progress
 *   - notes you wrote
 *   - quotes / highlights YOU saved (your data)
 *
 * Never pastes full book text or EPUB body. Legal + useful:
 * the models learn what you own, what you are reading, and the
 * sentences you marked as important.
 */
import {
  loadBooks,
  type Book,
  type BookQuote,
  type BookStatus,
} from "./booksStore";
import { conceptLabel, conceptsForBook } from "./bookConcepts";

/** Words that mark a shelf book as economics / money / markets. */
const ECON_RE =
  /\b(econom(?:y|ics|ic|ist)|macro|micro|inflation|deflation|monetary|fiscal|gdp|capital|markets?|invest(?:ing|ment)?|finance|financial|money|wealth|trade|tariff|scarcity|incentive|supply|demand|pricing|valuation|portfolio|interest rate|central bank|fed|keynes|hayek|smith|mankiw|sowell|hazlitt|piketty|munger|buffett|graham|bogle|dalio|taleb|kahneman|thaler)\b/i;

export type ShelfBookHit = {
  id: string;
  title: string;
  author: string;
  category: string;
  status: BookStatus;
  progress: number;
  isEcon: boolean;
  noteSnippet?: string;
  quotes: Array<{ text: string; note?: string; interpretation?: string }>;
  score: number;
};

export type BookshelfStats = {
  total: number;
  econ: number;
  reading: number;
  finished: number;
  want: number;
  withNotes: number;
  withQuotes: number;
  quoteCount: number;
};

function progressOf(book: Book): number {
  return Math.max(
    book.readerProgress || 0,
    book.localReaderProgress || 0,
    book.appleProgress || 0
  );
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** True if this shelf book is economics / money / markets related. */
export function isEconBook(book: Book): boolean {
  if (book.category === "Business & Money") return true;
  const blob = [
    book.title,
    book.author,
    book.description || "",
    book.notes || "",
    book.sourceGenre || "",
  ].join(" ");
  return ECON_RE.test(blob);
}

export function bookshelfStats(): BookshelfStats {
  const books = loadBooks();
  let econ = 0;
  let reading = 0;
  let finished = 0;
  let want = 0;
  let withNotes = 0;
  let withQuotes = 0;
  let quoteCount = 0;
  for (const b of books) {
    if (isEconBook(b)) econ += 1;
    if (b.status === "reading") reading += 1;
    else if (b.status === "finished") finished += 1;
    else if (b.status === "want") want += 1;
    if ((b.notes || "").trim()) withNotes += 1;
    if (b.quotes?.length) {
      withQuotes += 1;
      quoteCount += b.quotes.length;
    }
  }
  return {
    total: books.length,
    econ,
    reading,
    finished,
    want,
    withNotes,
    withQuotes,
    quoteCount,
  };
}

function scoreBook(book: Book, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const title = normalize(book.title);
  const author = normalize(book.author);
  const notes = normalize(book.notes || "");
  const desc = normalize(book.description || "");
  const quoteBlob = normalize(
    (book.quotes || [])
      .map((x) => `${x.text} ${x.note || ""} ${x.interpretation || ""}`)
      .join(" ")
  );
  let score = 0;
  if (title === q) score += 100;
  else if (title.includes(q) || q.includes(title)) score += 80;
  else {
    const words = q.split(" ").filter((w) => w.length >= 3);
    for (const w of words) {
      if (title.includes(w)) score += 18;
      if (author.includes(w)) score += 10;
      if (notes.includes(w)) score += 14;
      if (quoteBlob.includes(w)) score += 16;
      if (desc.includes(w)) score += 6;
    }
  }
  if (isEconBook(book)) score += 4;
  if (book.status === "reading") score += 6;
  if (book.status === "finished") score += 3;
  if ((book.notes || "").trim()) score += 2;
  if (book.quotes?.length) score += Math.min(8, book.quotes.length);
  return score;
}

function quoteLines(quotes: BookQuote[], limit = 3): Array<{
  text: string;
  note?: string;
  interpretation?: string;
}> {
  return quotes
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit)
    .map((q) => ({
      text: (q.text || "").trim().slice(0, 280),
      ...(q.note?.trim() ? { note: q.note.trim().slice(0, 160) } : {}),
      ...(q.interpretation?.trim()
        ? { interpretation: q.interpretation.trim().slice(0, 200) }
        : {}),
    }))
    .filter((q) => q.text.length > 0);
}

/**
 * Search the shelf by free text (title, author, notes, quotes).
 * Returns ranked hits Mel / Copilot can cite.
 */
export function searchBookshelfKnowledge(
  query: string,
  limit = 8
): ShelfBookHit[] {
  const books = loadBooks();
  const q = query.trim();
  const ranked = books
    .map((book) => {
      const score = q ? scoreBook(book, q) : basePriority(book);
      return { book, score };
    })
    .filter((x) => (q ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title))
    .slice(0, limit);

  return ranked.map(({ book, score }) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    category: book.category,
    status: book.status,
    progress: progressOf(book),
    isEcon: isEconBook(book),
    noteSnippet: (book.notes || "").trim().slice(0, 220) || undefined,
    quotes: quoteLines(book.quotes || [], 3),
    score,
  }));
}

/** Priority when no query: reading + notes + econ first. */
function basePriority(book: Book): number {
  let s = 1;
  if (book.status === "reading") s += 40;
  if (book.status === "finished") s += 20;
  if (book.status === "paused") s += 10;
  if (isEconBook(book)) s += 25;
  if ((book.notes || "").trim()) s += 15;
  if (book.quotes?.length) s += Math.min(20, book.quotes.length * 3);
  s += Math.round(progressOf(book) * 10);
  return s;
}

function lineForBook(book: Book, opts?: { withNotes?: boolean }): string {
  const pct = Math.round(progressOf(book) * 100);
  const concepts = conceptsForBook(book).slice(0, 4).map(conceptLabel);
  const tags = [
    book.status,
    isEconBook(book) ? "econ" : null,
    pct > 0 ? `${pct}%` : null,
  ]
    .filter(Boolean)
    .join(", ");
  let line = `• ${book.title} — ${book.author || "unknown"} [${tags}]`;
  if (concepts.length) line += `\n  concepts: ${concepts.join(", ")}`;
  if (opts?.withNotes) {
    const note = (book.notes || "").trim().replace(/\s+/g, " ").slice(0, 140);
    if (note) line += `\n  note: ${note}`;
    const qs = quoteLines(book.quotes || [], 2);
    for (const q of qs) {
      line += `\n  highlight: "${q.text.slice(0, 160)}"`;
      if (q.interpretation) line += ` → ${q.interpretation.slice(0, 100)}`;
    }
  }
  return line;
}

/**
 * Compact shelf brief for Mel live_context / Finance Mel.
 * Prioritizes: reading now → Business & Money / econ → finished with notes → rest.
 */
export function buildBookshelfKnowledgePack(opts?: {
  maxChars?: number;
  /** When true, only economics / money shelf books. */
  econOnly?: boolean;
  /** Include note + quote snippets (heavier). */
  deep?: boolean;
}): string {
  const maxChars = opts?.maxChars ?? 2200;
  const books = loadBooks();
  if (!books.length) {
    return [
      "BOOKSHELF KNOWLEDGE (empty)",
      "No books in Wonder yet. When Melani adds EPUBs or Apple Books, Mel reads titles, status, notes, and highlights.",
    ].join("\n");
  }

  const pool = opts?.econOnly ? books.filter(isEconBook) : books;
  const ordered = pool
    .map((b) => ({ b, s: basePriority(b) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.b);

  const stats = bookshelfStats();
  const header = [
    "BOOKSHELF KNOWLEDGE (her real shelf — titles/notes/highlights only, never full book text)",
    `Shelf: ${stats.total} books · ${stats.econ} economics/money · reading ${stats.reading} · finished ${stats.finished} · want ${stats.want}`,
    `Her writing: ${stats.withNotes} with notes · ${stats.quoteCount} highlights across ${stats.withQuotes} books`,
    "When answering money / markets / strategy, prefer frameworks she already owns on the shelf and cite title + author.",
    "If a highlight or note exists, use it as her annotated evidence. Do not invent quotes she did not save.",
    "",
    opts?.econOnly ? "ECONOMICS / MONEY SHELF (priority):" : "PRIORITY SHELF (reading + notes + econ first):",
  ];

  const lines: string[] = [...header];
  let used = lines.join("\n").length;
  const deep = opts?.deep !== false;
  for (const book of ordered) {
    const chunk = lineForBook(book, { withNotes: deep });
    if (used + chunk.length + 1 > maxChars) break;
    lines.push(chunk);
    used += chunk.length + 1;
  }

  if (ordered.length === 0 && opts?.econOnly) {
    lines.push(
      "(No Business & Money / economics titles detected yet. General shelf still available via bookshelf search.)"
    );
  }

  return lines.join("\n");
}

/**
 * One-shot answer for "what am I reading" / "my economics books".
 */
export function bookshelfBriefReply(query?: string): string {
  const q = (query || "").trim().toLowerCase();
  const stats = bookshelfStats();
  if (!stats.total) {
    return "Your Bookshelf is empty. Add or sync books and I will train on titles, notes, and highlights.";
  }

  const econOnly = /\b(econ|econom|money|finance|invest|market|business)\b/.test(q);
  const isGeneral =
    !q ||
    /^(what|show|list|my|books?|bookshelf|shelf|reading|all|econ.*books?)$/i.test(q);

  let list = isGeneral
    ? searchBookshelfKnowledge("", 12)
    : searchBookshelfKnowledge(q, 10);

  if (econOnly) {
    list = list.filter((h) => h.isEcon);
    if (!list.length) {
      list = searchBookshelfKnowledge("", 20).filter((h) => h.isEcon).slice(0, 10);
    }
  }

  const lines = [
    `Bookshelf: ${stats.total} titles · ${stats.econ} economics/money · ${stats.reading} reading now · ${stats.quoteCount} highlights.`,
    "",
  ];
  for (const h of list.slice(0, 8)) {
    const pct = Math.round(h.progress * 100);
    lines.push(
      `• ${h.title} — ${h.author} (${h.status}${pct ? `, ${pct}%` : ""}${h.isEcon ? ", econ" : ""})`
    );
    if (h.noteSnippet) lines.push(`  note: ${h.noteSnippet}`);
    for (const quote of h.quotes.slice(0, 1)) {
      lines.push(`  highlight: "${quote.text.slice(0, 140)}"`);
    }
  }
  lines.push("");
  lines.push(
    "I use this shelf as live context for Mel and Finance Copilot. Ask about a title, or ask a money question and I will lean on what you actually own."
  );
  return lines.join("\n");
}
