/**
 * Pull EPUBs from Downloads + Documents books folders into Wonder Bookshelf.
 * Continuous: Bookshelf re-scans while open so new Ocean PDF downloads appear.
 */
import {
  SPINE_COLORS,
  categorizeBook,
  isBookDeleted,
  keepBook,
  newBook,
  type Book,
} from "./booksStore";

export type LocalBookRecord = {
  id: string;
  title: string;
  author: string;
  fileName: string;
  folder: string;
  size: number;
  mtimeMs: number;
  fromOcean: boolean;
  readerUrl: string;
  format: "epub";
  source: "local-file";
};

type LocalBooksResponse = {
  source: string;
  count: number;
  roots: string[];
  syncedAt: string;
  books: LocalBookRecord[];
};

function normalizedTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameBook(a: Pick<Book, "title" | "author">, b: LocalBookRecord): boolean {
  const aTitle = normalizedTitle(a.title);
  const bTitle = normalizedTitle(b.title);
  if (aTitle === bTitle) return true;
  const authorOk =
    !a.author ||
    !b.author ||
    normalizedTitle(a.author) === normalizedTitle(b.author) ||
    normalizedTitle(a.author).includes(normalizedTitle(b.author)) ||
    normalizedTitle(b.author).includes(normalizedTitle(a.author));
  return (
    authorOk &&
    Math.min(aTitle.length, bTitle.length) >= 8 &&
    (aTitle.startsWith(bTitle) || bTitle.startsWith(aTitle))
  );
}

function stableColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return SPINE_COLORS[Math.abs(hash) % SPINE_COLORS.length];
}

export async function fetchLocalBooks(): Promise<LocalBooksResponse> {
  const response = await fetch("/api/local-books", {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as LocalBooksResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Local books folder could not be read.");
  }
  return payload;
}

/**
 * Merge local EPUB files into the shelf.
 * Returns { books, addedCount } so the UI can toast new downloads.
 */
export function mergeLocalBooks(
  current: Book[],
  incoming: LocalBookRecord[]
): { books: Book[]; addedCount: number; addedTitles: string[] } {
  const next = [...current];
  const addedTitles: string[] = [];

  for (const item of incoming) {
    const stableId = `local-${item.id}`;
    if (isBookDeleted(item.id, stableId)) continue;
    const category = categorizeBook(item.title, item.author);
    if (!keepBook({ title: item.title, category })) continue;

    const index = next.findIndex(
      (book) =>
        book.sourceId === item.id ||
        (book.source === "local-file" && book.sourceId === item.id) ||
        sameBook(book, item)
    );

    if (index >= 0) {
      const existing = next[index];
      // Re-file Unsorted when we can guess a better shelf
      const nextCategory = existing.categoryOverride
        ? existing.category
        : existing.category === "Unsorted" || !existing.category
          ? category
          : existing.category;
      next[index] = {
        ...existing,
        // Keep local notes / progress; refresh file URL + metadata
        title: existing.title || item.title,
        author: existing.author || item.author || "",
        source: existing.source === "apple-books" ? existing.source : "local-file",
        sourceId: existing.sourceId || item.id,
        readerUrl: item.readerUrl || existing.readerUrl,
        format: "epub",
        cloudOnly: false,
        description:
          existing.description ||
          (item.fromOcean
            ? "Imported from your Downloads folder (local EPUB)."
            : "Imported from a local EPUB on this Mac."),
        category: nextCategory,
        updatedAt: Date.now(),
      };
      continue;
    }

    addedTitles.push(item.title);
    next.push(
      newBook({
        id: stableId,
        title: item.title,
        author: item.author || "Unknown",
        status: "want",
        category,
        categoryOverride: false,
        statusOverride: true,
        source: "local-file",
        sourceId: item.id,
        readerUrl: item.readerUrl,
        format: "epub",
        cloudOnly: false,
        readingFormat: "digital",
        readingFormats: ["ebook"],
        description: item.fromOcean
          ? "Imported from your Downloads folder (local EPUB)."
          : "Imported from a local EPUB on this Mac.",
        color: stableColor(item.id),
      })
    );
  }

  return {
    books: next,
    addedCount: addedTitles.length,
    addedTitles,
  };
}
