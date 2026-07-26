/**
 * Pull books off every drive on this Mac into Wonder Bookshelf.
 *
 * The dev-server scanner (scripts/library-scan.mjs) walks Downloads, Desktop,
 * Documents, Apple Books, iCloud Drive, Google Drive / Dropbox / OneDrive and
 * mounted volumes in the background. This module keeps the shelf in step with
 * it and skips the merge entirely when the scanner reports nothing changed.
 */
import {
  SPINE_COLORS,
  keepBook,
  newBook,
  type Book,
  type BookFormat,
} from "./booksStore";
import { classifyBook } from "./bookIntelligence";

export type DriveKind = "local" | "apple" | "icloud" | "cloud" | "external";

export type LocalBookRecord = {
  id: string;
  title: string;
  author: string;
  fileName: string;
  folder: string;
  /** Human label of the drive it came from, e.g. "iCloud Drive" */
  drive: string;
  driveKind: DriveKind;
  size: number;
  mtimeMs: number;
  fromOcean: boolean;
  /** File extension: epub, pdf, mobi… */
  format: string;
  /** Wonder's reader only opens EPUBs */
  readable: boolean;
  /** iCloud placeholder that hasn't downloaded yet */
  cloudOnly: boolean;
  copies: number;
  readerUrl: string;
  fileUrl: string;
  source: "local-file";
  /** Subject tags out of the EPUB's own metadata */
  subjects?: string[];
  publisher?: string;
  language?: string;
  publishedYear?: number | null;
  seriesName?: string;
  seriesIndex?: number | null;
  description?: string;
};

export type DriveSummary = {
  id: string;
  label: string;
  kind: DriveKind;
  path: string;
  count: number;
};

export type LocalBooksResponse = {
  source: string;
  count: number;
  revision: string;
  syncedAt: string;
  scanMs: number;
  scanning?: boolean;
  drives: DriveSummary[];
  roots?: string[];
  books: LocalBookRecord[];
  /** Set when the caller's revision already matches — books is omitted */
  unchanged?: boolean;
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

function bookFormat(record: LocalBookRecord): BookFormat {
  if (record.format === "epub") return "epub";
  if (record.cloudOnly) return "cloud";
  return "archive";
}

function driveNote(record: LocalBookRecord): string {
  if (record.cloudOnly) {
    return `In ${record.drive} but not downloaded yet — open it once on this Mac to read it here.`;
  }
  const where =
    record.driveKind === "external"
      ? `the ${record.drive} drive`
      : record.driveKind === "cloud" || record.driveKind === "icloud"
        ? record.drive
        : record.drive === "Downloads"
          ? "your Downloads folder"
          : record.drive;
  const kind = record.format === "epub" ? "EPUB" : record.format.toUpperCase();
  return `${kind} found in ${where}.`;
}

/** Track the last revision so polling can be nearly free. */
let lastRevision = "";

export function currentLocalRevision(): string {
  return lastRevision;
}

export function resetLocalRevision(): void {
  lastRevision = "";
}

export async function fetchLocalBooks(options?: {
  force?: boolean;
  /** Pass false to always receive the full list */
  incremental?: boolean;
}): Promise<LocalBooksResponse> {
  const params = new URLSearchParams();
  if (options?.force) params.set("force", "1");
  if (options?.incremental !== false && lastRevision) {
    params.set("rev", lastRevision);
  }
  const query = params.toString();
  const response = await fetch(`/api/local-books${query ? `?${query}` : ""}`, {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as LocalBooksResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "Book drives could not be read.");
  }
  lastRevision = payload.revision || lastRevision;
  if (payload.unchanged) return { ...payload, books: [] };
  return payload;
}

/**
 * Merge drive books into the shelf.
 * Returns { books, addedCount } so the UI can toast new arrivals.
 */
export function mergeLocalBooks(
  current: Book[],
  incoming: LocalBookRecord[]
): { books: Book[]; addedCount: number; addedTitles: string[] } {
  if (!incoming.length) {
    return { books: current, addedCount: 0, addedTitles: [] };
  }

  const next = [...current];
  const addedTitles: string[] = [];

  for (const item of incoming) {
    // Subject tags from the file's own metadata beat guessing off the filename.
    const shelf = classifyBook({
      title: item.title,
      author: item.author,
      subjects: item.subjects,
      description: item.description,
    });
    const category = shelf.category;
    if (!keepBook({ title: item.title, category })) continue;
    const subjects = item.subjects?.length ? item.subjects : undefined;

    const index = next.findIndex(
      (book) => book.sourceId === item.id || sameBook(book, item)
    );

    if (index >= 0) {
      const existing = next[index];
      // Re-file Unsorted when we can guess a better shelf
      const nextCategory = existing.categoryOverride
        ? existing.category
        : existing.category === "Unsorted" || !existing.category
          ? category
          : existing.category;
      const isApple = existing.source === "apple-books";
      next[index] = {
        ...existing,
        // Keep local notes / progress; refresh file URL + metadata
        title: existing.title || item.title,
        author: existing.author || item.author || "",
        source: isApple ? existing.source : "local-file",
        sourceId: existing.sourceId || item.id,
        readerUrl: isApple
          ? existing.readerUrl
          : item.readerUrl || existing.readerUrl,
        externalUrl:
          !item.readable && item.fileUrl
            ? item.fileUrl
            : existing.externalUrl,
        format: isApple ? existing.format : bookFormat(item),
        cloudOnly: isApple ? existing.cloudOnly : item.cloudOnly,
        description: existing.description || item.description || driveNote(item),
        category: nextCategory,
        subjects: subjects || existing.subjects,
        seriesName: existing.seriesName || item.seriesName || undefined,
        seriesIndex: existing.seriesIndex || item.seriesIndex || undefined,
        publishedYear: existing.publishedYear || item.publishedYear || null,
        drive: item.drive || existing.drive,
        updatedAt: Date.now(),
      };
      continue;
    }

    addedTitles.push(item.title);
    next.push(
      newBook({
        id: `local-${item.id}`,
        title: item.title,
        author: item.author || "Unknown",
        status: "want",
        category,
        categoryOverride: false,
        statusOverride: true,
        source: "local-file",
        sourceId: item.id,
        readerUrl: item.readable ? item.readerUrl : undefined,
        externalUrl: !item.readable && item.fileUrl ? item.fileUrl : undefined,
        format: bookFormat(item),
        cloudOnly: item.cloudOnly,
        readingFormat: "digital",
        description: item.description || driveNote(item),
        color: stableColor(item.id),
        subjects,
        seriesName: item.seriesName || undefined,
        seriesIndex: item.seriesIndex || undefined,
        publishedYear: item.publishedYear || null,
        drive: item.drive,
      })
    );
  }

  return {
    books: next,
    addedCount: addedTitles.length,
    addedTitles,
  };
}

/** Short label for the sync chip: "42 books · 4 drives" */
export function driveSyncLabel(result: LocalBooksResponse): string {
  const active = (result.drives || []).filter((drive) => drive.count > 0);
  const books = `${result.count} book${result.count === 1 ? "" : "s"}`;
  if (!active.length) return books;
  if (active.length <= 2) {
    return `${books} · ${active.map((drive) => drive.label).join(" · ")}`;
  }
  return `${books} · ${active.length} drives`;
}
