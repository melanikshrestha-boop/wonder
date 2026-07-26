/**
 * Fill missing book covers + Goodreads links from Open Library.
 * Batched so the shelf doesn't spam the network.
 */

import type { Book } from "./booksStore";
import { classifyBook } from "./bookIntelligence";

export type CoverLookup = {
  title: string;
  author: string;
  coverUrl: string;
  catalogUrl: string;
  goodreadsUrl: string;
  subjects?: string[];
  year?: number | null;
};

const cache = new Map<string, CoverLookup | null>();

function cacheKey(title: string, author: string) {
  return `${title.toLowerCase().trim()}::${author.toLowerCase().trim()}`;
}

export function goodreadsSearchUrl(title: string, author = ""): string {
  const q = [title, author].filter(Boolean).join(" ");
  return `https://www.goodreads.com/search?q=${encodeURIComponent(q)}`;
}

export async function lookupBookCover(
  title: string,
  author = ""
): Promise<CoverLookup | null> {
  const key = cacheKey(title, author);
  if (cache.has(key)) return cache.get(key) || null;
  try {
    const params = new URLSearchParams({ title });
    if (author) params.set("author", author);
    const res = await fetch(`/api/book-covers?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const data = (await res.json()) as CoverLookup & { error?: string };
    if (data.error) {
      cache.set(key, null);
      return null;
    }
    const result: CoverLookup = {
      title: data.title || title,
      author: data.author || author,
      coverUrl: data.coverUrl || "",
      catalogUrl: data.catalogUrl || "",
      goodreadsUrl:
        data.goodreadsUrl || goodreadsSearchUrl(title, author),
      subjects: data.subjects,
      year: data.year,
    };
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/**
 * Enrich books missing covers (and optionally re-file Unsorted).
 * Processes a few at a time so the UI stays smooth.
 */
export async function enrichBooksWithCovers(
  books: Book[],
  options?: { limit?: number; fixUnsorted?: boolean }
): Promise<{ books: Book[]; filled: number }> {
  const limit = options?.limit ?? 12;
  const fixUnsorted = options?.fixUnsorted !== false;
  const next = [...books];
  let filled = 0;
  let processed = 0;

  for (let i = 0; i < next.length; i++) {
    if (processed >= limit) break;
    const book = next[i];
    const needsCover = !book.coverUrl;
    const needsSort =
      fixUnsorted &&
      book.category === "Unsorted" &&
      !book.categoryOverride;
    // Subjects are what make the shelf smart, so fetch them even when the
    // cover and shelf are already settled.
    const needsSubjects = !book.subjects?.length;

    if (!needsCover && !needsSort && !needsSubjects) continue;
    if (!book.title.trim()) continue;

    processed += 1;
    const hit = await lookupBookCover(book.title, book.author || "");
    if (!hit) {
      // Still attach Goodreads link via externalUrl if empty
      if (!book.externalUrl) {
        next[i] = {
          ...book,
          externalUrl: goodreadsSearchUrl(book.title, book.author),
          updatedAt: Date.now(),
        };
      }
      continue;
    }

    const subjects = Array.from(
      new Set([...(book.subjects || []), ...(hit.subjects || [])])
    ).slice(0, 24);

    const shelf = needsSort
      ? classifyBook({
          title: hit.title || book.title,
          author: hit.author || book.author,
          subjects,
        })
      : null;

    next[i] = {
      ...book,
      coverUrl: hit.coverUrl || book.coverUrl,
      externalUrl:
        book.externalUrl ||
        hit.goodreadsUrl ||
        hit.catalogUrl ||
        goodreadsSearchUrl(book.title, book.author),
      category:
        shelf && shelf.category !== "Unsorted" ? shelf.category : book.category,
      subjects: subjects.length ? subjects : book.subjects,
      publishedYear: book.publishedYear ?? hit.year ?? null,
      description: book.description || undefined,
      updatedAt: Date.now(),
    };
    if (hit.coverUrl && needsCover) filled += 1;
  }

  return { books: next, filled };
}

/** Parse Goodreads library CSV export (Settings → Export) */
export function parseGoodreadsCsv(text: string): Array<{
  title: string;
  author: string;
  isbn: string;
  rating: number;
  shelf: string;
  coverUrl: string;
}> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  const iTitle = idx("title");
  const iAuthor = idx("author");
  const iIsbn = idx("isbn13") >= 0 ? idx("isbn13") : idx("isbn");
  const iRating = idx("my rating");
  const iShelf = idx("exclusive shelf");

  const out: Array<{
    title: string;
    author: string;
    isbn: string;
    rating: number;
    shelf: string;
    coverUrl: string;
  }> = [];

  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    const title = (cols[iTitle] || "").replace(/^="?|"?$/g, "").trim();
    if (!title) continue;
    const author = (cols[iAuthor] || "").replace(/^="?|"?$/g, "").trim();
    const isbn = (cols[iIsbn] || "")
      .replace(/^="?|"?$/g, "")
      .replace(/[^0-9Xx]/g, "");
    const rating = Math.max(0, Math.min(5, Number(cols[iRating]) || 0));
    const shelf = (cols[iShelf] || "to-read").toLowerCase();
    const coverUrl = isbn
      ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
      : "";
    out.push({ title, author, isbn, rating, shelf, coverUrl });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}
