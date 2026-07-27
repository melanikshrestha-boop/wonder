/**
 * Highlight retrieval index (Intelligence V2 Phase A).
 *
 * Flattens every user-saved quote on the Bookshelf into a searchable list.
 * Only text Melani selected or annotated — never full EPUB body.
 */
import { loadBooks, type Book } from "./booksStore";
import {
  conceptLabel,
  conceptsForBook,
  conceptsMatchingQuery,
  type ConceptId,
} from "./bookConcepts";
import { isEconBook } from "./bookKnowledge";

export type HighlightHit = {
  quoteId: string;
  bookId: string;
  title: string;
  author: string;
  text: string;
  note?: string;
  interpretation?: string;
  location?: string;
  createdAt: number;
  concepts: ConceptId[];
  score: number;
  isEcon: boolean;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((w) => w.length >= 3);
}

/** Build full flat index from current shelf. */
export function listAllHighlights(): HighlightHit[] {
  const books = loadBooks();
  const out: HighlightHit[] = [];
  for (const book of books) {
    const concepts = conceptsForBook(book);
    const econ = isEconBook(book);
    for (const q of book.quotes || []) {
      const text = (q.text || "").trim();
      if (!text) continue;
      out.push({
        quoteId: q.id,
        bookId: book.id,
        title: book.title,
        author: book.author || "unknown",
        text,
        note: q.note?.trim() || undefined,
        interpretation: q.interpretation?.trim() || undefined,
        location: q.location?.trim() || undefined,
        createdAt: Number(q.createdAt) || 0,
        concepts,
        score: 0,
        isEcon: econ,
      });
    }
  }
  return out;
}

export function highlightStats(): {
  total: number;
  booksWithHighlights: number;
  econHighlights: number;
} {
  const all = listAllHighlights();
  const books = new Set(all.map((h) => h.bookId));
  return {
    total: all.length,
    booksWithHighlights: books.size,
    econHighlights: all.filter((h) => h.isEcon).length,
  };
}

function scoreHighlight(h: HighlightHit, query: string, conceptHits: ConceptId[]): number {
  if (!query.trim()) {
    // Recency-only list
    const ageDays = h.createdAt
      ? (Date.now() - h.createdAt) / (86400 * 1000)
      : 999;
    return Math.max(0, 50 - Math.min(40, ageDays));
  }

  const q = normalize(query);
  const qTokens = tokens(query);
  const text = normalize(h.text);
  const note = normalize(h.note || "");
  const interp = normalize(h.interpretation || "");
  const title = normalize(h.title);
  let score = 0;

  if (text.includes(q)) score += 40;
  for (const t of qTokens) {
    if (text.includes(t)) score += 12;
    if (interp.includes(t)) score += 10;
    if (note.includes(t)) score += 8;
    if (title.includes(t)) score += 6;
  }
  if (interp.includes(q)) score += 25;
  if (note.includes(q)) score += 15;
  if (title.includes(q)) score += 10;

  for (const c of conceptHits) {
    if (h.concepts.includes(c)) score += 20;
  }
  // soft: concept labels in query already counted via conceptHits

  if (h.isEcon) score += 5;

  if (h.createdAt) {
    const ageDays = (Date.now() - h.createdAt) / (86400 * 1000);
    score += Math.max(0, 10 - Math.min(10, ageDays / 3));
  }

  return score;
}

/**
 * Search highlights. Empty query → most recent first.
 * Min score 12 when query present.
 */
export function searchHighlights(query: string, limit = 8): HighlightHit[] {
  const all = listAllHighlights();
  const conceptHits = conceptsMatchingQuery(query);
  const q = query.trim();
  const ranked = all
    .map((h) => ({
      ...h,
      score: scoreHighlight(h, q, conceptHits),
    }))
    .filter((h) => (q ? h.score >= 12 : true))
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, limit);

  return ranked;
}

/** Format hits for Mel reply / evidence pack. */
export function formatHighlightHits(hits: HighlightHit[], opts?: { maxEach?: number }): string {
  if (!hits.length) {
    return "No highlights matched. Save quotes while reading in Wonder and I will retrieve them here.";
  }
  const maxEach = opts?.maxEach ?? 220;
  return hits
    .map((h, i) => {
      const concepts =
        h.concepts.length > 0
          ? h.concepts.slice(0, 3).map(conceptLabel).join(", ")
          : "";
      const lines = [
        `${i + 1}. “${h.text.slice(0, maxEach)}${h.text.length > maxEach ? "…" : ""}”`,
        `   — ${h.title} (${h.author})` + (concepts ? ` · ${concepts}` : ""),
      ];
      if (h.interpretation) {
        lines.push(`   your take: ${h.interpretation.slice(0, 160)}`);
      } else if (h.note) {
        lines.push(`   note: ${h.note.slice(0, 120)}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

/** Resolve citation: quote must exist on shelf. */
export function resolveHighlight(quoteId: string): HighlightHit | null {
  return listAllHighlights().find((h) => h.quoteId === quoteId) || null;
}

/** Books that have concepts Mel can teach from (for pack). */
export function booksWithConcepts(limit = 6): Array<{ book: Book; concepts: ConceptId[] }> {
  return loadBooks()
    .map((book) => ({ book, concepts: conceptsForBook(book) }))
    .filter((x) => x.concepts.length > 0)
    .sort((a, b) => {
      const ap = a.book.status === "reading" ? 2 : a.book.status === "finished" ? 1 : 0;
      const bp = b.book.status === "reading" ? 2 : b.book.status === "finished" ? 1 : 0;
      return bp - ap || b.concepts.length - a.concepts.length;
    })
    .slice(0, limit);
}
