import {
  CATEGORY_ORDER,
  type Book,
  type BookCategory,
  type BuiltInBookCategory,
} from "./booksStore";

export type BookFolder = {
  id: BookCategory;
  label: string;
  accent: string;
  builtIn: boolean;
  createdAt: number;
};

const KEY = "wonder-books-folders-v1";

const BUILT_IN_ACCENTS: Record<BuiltInBookCategory, string> = {
  "Autobiography & Memoir": "#e58fa3",
  "Physics & Science": "#72b9d6",
  "Literature & Fiction": "#b89adc",
  "Technology & Innovation": "#65c5a6",
  "Business & Money": "#d6b367",
  "Psychology & Self-Development": "#e59b72",
  "Philosophy & Spirituality": "#8296d8",
  "Music & Culture": "#cf87bd",
  Unsorted: "#8e98a6",
};

const CUSTOM_ACCENTS = [
  "#69c4aa",
  "#e08ca4",
  "#79aee8",
  "#d7b365",
  "#ad94db",
  "#df966f",
  "#76bfc9",
];

function defaultFolders(): BookFolder[] {
  return CATEGORY_ORDER.map((category) => ({
    id: category,
    label: category,
    accent: BUILT_IN_ACCENTS[category],
    builtIn: true,
    createdAt: 0,
  }));
}

function normalizeFolder(value: Partial<BookFolder>): BookFolder | null {
  if (typeof value.id !== "string" || typeof value.label !== "string") return null;
  const label = value.label.trim();
  if (!label) return null;
  return {
    id: value.id as BookCategory,
    label,
    accent: typeof value.accent === "string" ? value.accent : "#8e98a6",
    builtIn: Boolean(value.builtIn),
    createdAt: Number(value.createdAt) || 0,
  };
}

/**
 * Nic Muñoz Top 50 Biographies — exact section labels from
 * https://www.nicmunoz.com/p/top50list (stable ids so Want books group cleanly).
 */
export const NIC_MUNOZ_FOLDERS: Array<{
  id: `custom:${string}`;
  label: string;
  accent: string;
}> = [
  { id: "custom:nic-entrepreneur", label: "Entrepreneur", accent: "#d6b367" },
  { id: "custom:nic-conqueror", label: "Conqueror", accent: "#e08ca4" },
  { id: "custom:nic-genius", label: "Genius", accent: "#72b9d6" },
  { id: "custom:nic-must-read-stories", label: "Must-Read Stories", accent: "#65c5a6" },
  {
    id: "custom:nic-historical-narratives",
    label: "Historical Narratives",
    accent: "#ad94db",
  },
];

export function loadBookFolders(): BookFolder[] {
  let saved: BookFolder[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as Partial<BookFolder>[];
    if (Array.isArray(parsed)) {
      saved = parsed.map(normalizeFolder).filter((folder): folder is BookFolder => Boolean(folder));
    }
  } catch {
    /* Use the built-in folder set when storage is malformed. */
  }

  const savedById = new Map(saved.map((folder) => [folder.id, folder]));
  const builtIns = defaultFolders().map((folder) => ({
    ...folder,
    ...savedById.get(folder.id),
    id: folder.id,
    builtIn: true,
  }));

  // Nic’s Top 50 sections first among customs, then any other user folders
  const nicIds = new Set(NIC_MUNOZ_FOLDERS.map((f) => f.id));
  const nicFolders: BookFolder[] = NIC_MUNOZ_FOLDERS.map((folder, index) => {
    const prior = savedById.get(folder.id);
    return {
      id: folder.id,
      label: prior?.label || folder.label,
      accent: prior?.accent || folder.accent,
      builtIn: false,
      createdAt: prior?.createdAt || index + 1,
    };
  });
  const otherCustom = saved.filter(
    (folder) => folder.id.startsWith("custom:") && !nicIds.has(folder.id as `custom:${string}`)
  );

  const merged = [...builtIns, ...nicFolders, ...otherCustom];
  // Persist Nic folders so they survive even before Want books load
  try {
    const hadAllNic = NIC_MUNOZ_FOLDERS.every((f) => savedById.has(f.id));
    if (!hadAllNic) saveBookFolders(merged);
  } catch {
    /* ignore */
  }
  return merged;
}

export function saveBookFolders(folders: BookFolder[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(folders));
  } catch {
    /* Keep the current in-memory folders when storage is unavailable. */
  }
}

export function createBookFolder(label: string, existing: BookFolder[]): BookFolder | null {
  const cleaned = label.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  if (existing.some((folder) => folder.label.toLowerCase() === cleaned.toLowerCase())) {
    return null;
  }
  const slug = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder";
  return {
    id: `custom:${Date.now().toString(36)}-${slug}`,
    label: cleaned,
    accent: CUSTOM_ACCENTS[existing.filter((folder) => !folder.builtIn).length % CUSTOM_ACCENTS.length],
    builtIn: false,
    createdAt: Date.now(),
  };
}

function orphanLabel(id: BookCategory): string {
  return id.startsWith("custom:")
    ? id.slice(7).replace(/^[a-z0-9]+-/, "").replace(/-/g, " ") || "Custom folder"
    : id;
}

export function includeBookFolders(folders: BookFolder[], books: Book[]): BookFolder[] {
  const known = new Set(folders.map((folder) => folder.id));
  const next = [...folders];
  for (const book of books) {
    if (known.has(book.category)) continue;
    next.push({
      id: book.category,
      label: orphanLabel(book.category),
      accent: CUSTOM_ACCENTS[next.length % CUSTOM_ACCENTS.length],
      builtIn: false,
      createdAt: book.createdAt,
    });
    known.add(book.category);
  }
  return next;
}
