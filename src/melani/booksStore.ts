/**
 * Wonder Library local database.
 * Apple Books metadata is merged into this record without replacing local notes.
 */

export type BookStatus = "reading" | "want" | "finished" | "paused";

export type BuiltInBookCategory =
  | "Autobiography & Memoir"
  | "Physics & Science"
  | "Literature & Fiction"
  | "Technology & Innovation"
  | "Business & Money"
  | "Psychology & Self-Development"
  | "Philosophy & Spirituality"
  | "Music & Culture"
  | "Unsorted";

export type BookCategory = BuiltInBookCategory | `custom:${string}`;

export type BookSource = "manual" | "apple-books" | "wonder-page" | "local-file";

export type BookFormat = "epub" | "audiobook" | "cloud" | "archive" | "manual";
export type ReadingFormat = "digital" | "physical+digital";
export type BookMedium = "ebook" | "audiobook" | "physical";

export type BookQuote = {
  id: string;
  text: string;
  page?: string;
  note?: string;
  interpretation?: string;
  location?: string;
  source?: "manual" | "apple-books";
  createdAt: number;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  category: BookCategory;
  source: BookSource;
  sourceId?: string;
  sourceGenre?: string;
  description?: string;
  coverUrl?: string;
  readerUrl?: string;
  externalUrl?: string;
  format?: BookFormat;
  cloudOnly?: boolean;
  chapterCount?: number;
  readingFormat?: ReadingFormat;
  /** User-owned formats. Multi-select because one title can overlap. */
  readingFormats?: BookMedium[];
  wonderPageId?: string;
  readerCfi?: string;
  smartBookmark?: {
    cfi: string;
    text: string;
    progress: number;
    createdAt: number;
  };
  /** Reader progress from 0 to 1. */
  readerProgress?: number;
  /** Progress reported by Apple Books. */
  appleProgress?: number;
  /** Progress made inside Wonder's EPUB reader. */
  localReaderProgress?: number;
  statusOverride?: boolean;
  categoryOverride?: boolean;
  rating: number;
  pageNow: number;
  pageTotal: number;
  notes: string;
  quotes: BookQuote[];
  color: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: number;
  updatedAt: number;
};

const KEY = "wonder-books-library-v1";
const DELETED_KEY = "wonder-books-deleted-v1";
const OPEN_REQUEST_KEY = "wonder-books-open-request-v1";

export const BOOK_OPEN_EVENT = "wonder-books-open";

export type BookOpenRequest = {
  bookId: string;
  startCfi?: string;
  requestedAt: number;
};

const SPINE_COLORS = [
  "#c97b84",
  "#4faf8c",
  "#9b7fd4",
  "#6b9ec4",
  "#c4a06a",
  "#e07a5f",
  "#81b29a",
  "#3d405b",
  "#f2cc8f",
  "#a8dadc",
];

export const CATEGORY_ORDER: BuiltInBookCategory[] = [
  "Autobiography & Memoir",
  "Physics & Science",
  "Literature & Fiction",
  "Technology & Innovation",
  "Business & Money",
  "Psychology & Self-Development",
  "Philosophy & Spirituality",
  "Music & Culture",
  "Unsorted",
];

function uid(): string {
  return `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function isMichaelJacksonBook(title: string, author = ""): boolean {
  const identity = `${title} ${author}`.toLowerCase();
  return includesAny(identity, [
    "michael jackson",
    "moonwalk",
    "man in the music",
  ]);
}

export function categorizeBook(
  title: string,
  author = "",
  genre = "",
  description = ""
): BookCategory {
  const value = `${title} ${author} ${genre} ${description}`.toLowerCase();

  if (isMichaelJacksonBook(title, author)) {
    return "Autobiography & Memoir";
  }

  if (
    includesAny(value, [
      "feynman",
      "physics",
      "quantum",
      "biology",
      "chemistry",
      "astronomy",
      "science",
    ])
  ) {
    return "Physics & Science";
  }
  if (
    includesAny(value, [
      "music industry",
      "musician",
    ])
  ) {
    return "Music & Culture";
  }
  if (
    includesAny(value, [
      "elon musk",
      "steve jobs",
      "moonwalk",
      "benjamin franklin",
      "titan",
      "tuesdays with morrie",
      "autobiograph",
      "biograph",
      "memoir",
    ])
  ) {
    return "Autobiography & Memoir";
  }
  if (
    includesAny(value, [
      "1984",
      "fahrenheit 451",
      "to kill a mocking",
      "the stranger",
      "five people you meet in heaven",
      "literature",
      "fiction",
      "novel",
      "prose_",
    ])
  ) {
    return "Literature & Fiction";
  }
  if (
    includesAny(value, [
      "innovator",
      "zero to one",
      "automate the boring stuff",
      "programming",
      "computer",
      "technology",
      "startup",
      "digital revolution",
      "nvidia",
      "youtube secrets",
      "silicon valley",
      "software",
      "coding",
      "python",
    ])
  ) {
    return "Technology & Innovation";
  }
  if (
    includesAny(value, [
      "psychology of money",
      "$100m offers",
      "teach you to be rich",
      "talk like ted",
      "influence",
      "business",
      "economics",
      "finance",
      "money",
      "marketing",
      "titan",
    ])
  ) {
    return "Business & Money";
  }
  if (
    includesAny(value, [
      "atomic habits",
      "deep work",
      "psycho-cybernetics",
      "man's search for meaning",
      "mans search for meaning",
      "search for meaning",
      "viktor frankl",
      "frankl",
      "gad saad",
      "suicidal empathy",
      "parasitic mind",
      "psychology",
      "self-help",
      "self development",
      "time management",
      "productivity",
    ])
  ) {
    return "Psychology & Self-Development";
  }
  if (
    includesAny(value, [
      "leonardo da vinci",
      "leonardo",
      "isaacson",
      "steve jobs",
      "elon musk",
      "benjamin franklin",
      "biograph",
      "memoir",
      "autobiograph",
    ])
  ) {
    return "Autobiography & Memoir";
  }
  if (
    includesAny(value, [
      "bhagavad gita",
      "philosophy",
      "spiritual",
      "religion",
      "meditation",
    ])
  ) {
    return "Philosophy & Spirituality";
  }
  return "Unsorted";
}

function normalizeStoredBook(value: Partial<Book>, index: number): Book {
  const now = Date.now();
  const title = typeof value.title === "string" ? value.title : "Untitled";
  const author = typeof value.author === "string" ? value.author : "";
  const genre = typeof value.sourceGenre === "string" ? value.sourceGenre : "";
  const description = typeof value.description === "string" ? value.description : "";
  const forcedBiography = isMichaelJacksonBook(title, author);
  const categoryOverride = forcedBiography ? false : Boolean(value.categoryOverride);
  const storedCategory =
    typeof value.category === "string" &&
    (CATEGORY_ORDER.includes(value.category as BuiltInBookCategory) ||
      value.category.startsWith("custom:"))
      ? (value.category as BookCategory)
      : null;
  const category = forcedBiography
    ? "Autobiography & Memoir"
    : value.source === "apple-books" && !categoryOverride
      ? categorizeBook(title, author, genre, description)
      : storedCategory || categorizeBook(title, author, genre, description);
  const legacyProgress = typeof value.readerProgress === "number"
    ? Math.min(1, Math.max(0, value.readerProgress))
    : 0;
  const localReaderProgress = typeof value.localReaderProgress === "number"
    ? Math.min(1, Math.max(0, value.localReaderProgress))
    : value.source === "apple-books" && value.readerCfi
      ? legacyProgress
      : value.source === "apple-books"
        ? 0
        : legacyProgress;
  const appleProgress = typeof value.appleProgress === "number"
    ? Math.min(1, Math.max(0, value.appleProgress))
    : 0;
  const format: BookFormat = ["epub", "audiobook", "cloud", "archive", "manual"].includes(
    value.format || ""
  )
    ? (value.format as BookFormat)
    : value.source === "apple-books" || value.source === "local-file"
      ? "epub"
      : "manual";
  const validMedia = new Set<BookMedium>(["ebook", "audiobook", "physical"]);
  const storedMedia = Array.isArray(value.readingFormats)
    ? value.readingFormats.filter(
        (medium): medium is BookMedium => validMedia.has(medium as BookMedium)
      )
    : [];
  const readingFormats: BookMedium[] = storedMedia.length
    ? Array.from(new Set(storedMedia))
    : format === "audiobook"
      ? ["audiobook"]
      : value.readingFormat === "physical+digital"
        ? ["physical", "ebook"]
        : ["ebook"];

  return {
    id: typeof value.id === "string" ? value.id : uid(),
    title,
    author,
    status: STATUS_ORDER.includes(value.status as BookStatus)
      ? (value.status as BookStatus)
      : "want",
    category,
    source:
      value.source === "apple-books" ||
      value.source === "wonder-page" ||
      value.source === "local-file"
        ? value.source
        : "manual",
    sourceId: value.sourceId,
    sourceGenre: genre || undefined,
    description: description || undefined,
    coverUrl: value.coverUrl,
    readerUrl: value.readerUrl,
    externalUrl: value.externalUrl,
    format,
    cloudOnly: Boolean(value.cloudOnly),
    chapterCount: Math.max(0, Number(value.chapterCount) || 0),
    readingFormat:
      value.readingFormat === "physical+digital" ? "physical+digital" : "digital",
    readingFormats,
    wonderPageId: value.wonderPageId,
    readerCfi: value.readerCfi,
    smartBookmark:
      value.smartBookmark && typeof value.smartBookmark.cfi === "string"
        ? {
            cfi: value.smartBookmark.cfi,
            text: String(value.smartBookmark.text || ""),
            progress: Math.max(0, Math.min(1, Number(value.smartBookmark.progress) || 0)),
            createdAt: Number(value.smartBookmark.createdAt) || now,
          }
        : undefined,
    readerProgress: Math.max(localReaderProgress, appleProgress),
    appleProgress,
    localReaderProgress,
    statusOverride: Boolean(value.statusOverride),
    categoryOverride,
    rating: Math.min(5, Math.max(0, Number(value.rating) || 0)),
    pageNow: Math.max(0, Number(value.pageNow) || 0),
    pageTotal: Math.max(0, Number(value.pageTotal) || 0),
    notes: typeof value.notes === "string" ? value.notes : "",
    quotes: Array.isArray(value.quotes)
      ? value.quotes
          .filter((quote) => quote && typeof quote.text === "string")
          .map((quote) => {
            const source = quote.source === "apple-books" ? "apple-books" : "manual";
            return {
              id: typeof quote.id === "string" ? quote.id : uid(),
              text: quote.text.trim(),
              page: typeof quote.page === "string" ? quote.page : undefined,
              note:
                source === "apple-books" && typeof quote.note === "string"
                  ? quote.note
                  : undefined,
              interpretation:
                typeof quote.interpretation === "string"
                  ? quote.interpretation
                  : source === "manual" && typeof quote.note === "string"
                    ? quote.note
                    : undefined,
              location: typeof quote.location === "string" ? quote.location : undefined,
              source,
              createdAt: Number(quote.createdAt) || now,
            };
          })
      : [],
    color:
      typeof value.color === "string"
        ? value.color
        : SPINE_COLORS[index % SPINE_COLORS.length],
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    createdAt: Number(value.createdAt) || now,
    updatedAt: Number(value.updatedAt) || now,
  };
}

/** Nic Muñoz Top 50 sections — stable custom folder ids (see bookFolders.NIC_MUNOZ_FOLDERS). */
const NIC = {
  entrepreneur: "custom:nic-entrepreneur",
  conqueror: "custom:nic-conqueror",
  genius: "custom:nic-genius",
  mustRead: "custom:nic-must-read-stories",
  historical: "custom:nic-historical-narratives",
} as const;

type EnsureWantBook = {
  id: string;
  title: string;
  author: string;
  category: BookCategory;
  notes: string;
  description?: string;
  externalUrl?: string;
  /** Extra title keys that count as “already on shelf” (avoid dupes). */
  alsoMatch?: string[];
  /** When true, refile an existing match into this Nic section folder. */
  refile?: boolean;
};

/**
 * Curated Want picks — Suicidal Empathy + full Nic Muñoz Top 50
 * (https://www.nicmunoz.com/p/top50list), filed under his exact section names.
 * Stable ids; only added if missing. Genius-section books refile into Genius.
 */
const ENSURE_WANT_BOOKS: EnsureWantBook[] = [
  // ── personal add (not on Nic’s list) ───────────────────────────────────
  {
    id: "bk-want-suicidal-empathy",
    title: "Suicidal Empathy",
    author: "Gad Saad",
    category: "Psychology & Self-Development",
    notes: "Read at some point. Subtitle: Dying to Be Kind. Author of The Parasitic Mind.",
    description:
      "Dying to Be Kind — Saad on maladaptive empathy and civilizational risk. #1 NYT bestseller; follow-up to The Parasitic Mind.",
    externalUrl: "https://www.harpercollins.com/products/suicidal-empathy-gad-saad",
  },

  // ── Entrepreneur ───────────────────────────────────────────────────────
  {
    id: "bk-nic-ent-01-walt-disney",
    title: "Walt Disney",
    author: "Neal Gabler",
    category: NIC.entrepreneur,
    notes: "Nic Muñoz Top 50 · Entrepreneur #1",
    refile: true,
  },
  {
    id: "bk-nic-ent-02-elon-vance",
    title: "Elon Musk",
    author: "Ashlee Vance",
    category: NIC.entrepreneur,
    notes: "Nic Muñoz Top 50 · Entrepreneur #2",
    alsoMatch: ["elon musk ashlee vance", "elon musk by ashlee vance"],
    refile: true,
  },
  {
    id: "bk-nic-ent-03-rockefeller-letters",
    title: "The 38 Letters From John D. Rockefeller To His Son",
    author: "John D. Rockefeller",
    category: NIC.entrepreneur,
    notes: "Nic Muñoz Top 50 · Entrepreneur #3",
    alsoMatch: [
      "38 letters from john d rockefeller",
      "the 38 letters from john d rockefeller to his son",
    ],
    refile: true,
  },
  {
    id: "bk-nic-ent-04-nvidia-way",
    title: "The Nvidia Way",
    author: "Tae Kim",
    category: NIC.entrepreneur,
    notes: "Nic Muñoz Top 50 · Entrepreneur #4",
    refile: true,
  },
  {
    id: "bk-nic-ent-05-steve-jobs",
    title: "Steve Jobs",
    author: "Walter Isaacson",
    category: NIC.entrepreneur,
    notes: "Nic Muñoz Top 50 · Entrepreneur #5",
    refile: true,
  },
  {
    id: "bk-nic-ent-06-titan",
    title: "Titan",
    author: "Ron Chernow",
    category: NIC.entrepreneur,
    notes: "Nic Muñoz Top 50 · Entrepreneur #6 — Rockefeller",
    alsoMatch: ["titan the life of john d rockefeller", "titan ron chernow"],
    refile: true,
  },
  {
    id: "bk-nic-ent-07-source-code",
    title: "Source Code",
    author: "Bill Gates",
    category: NIC.entrepreneur,
    notes: "Nic Muñoz Top 50 · Entrepreneur #7",
    alsoMatch: ["source code bill gates", "source code my beginnings"],
    refile: true,
  },
  {
    id: "bk-nic-ent-08-book-of-elon",
    title: "The Book of Elon",
    author: "Eric Jorgenson",
    category: NIC.entrepreneur,
    notes: "Nic Muñoz Top 50 · Entrepreneur #8",
    refile: true,
  },
  {
    id: "bk-nic-ent-09-poor-charlie",
    title: "Poor Charlie's Almanack",
    author: "Charlie Munger",
    category: NIC.entrepreneur,
    notes: "Nic Muñoz Top 50 · Entrepreneur #9",
    alsoMatch: [
      "poor charlie s almanac",
      "poor charlies almanack",
      "poor charlies almanac",
      "poor charlie s almanack",
    ],
    refile: true,
  },
  {
    id: "bk-nic-ent-10-fish-whale",
    title: "The Fish That Ate the Whale",
    author: "Rich Cohen",
    category: NIC.entrepreneur,
    notes: "Nic Muñoz Top 50 · Entrepreneur #10",
    refile: true,
  },

  // ── Conqueror ──────────────────────────────────────────────────────────
  {
    id: "bk-nic-con-01-alexander",
    title: "Alexander the Great",
    author: "Philip Freeman",
    category: NIC.conqueror,
    notes: "Nic Muñoz Top 50 · Conqueror #1",
    refile: true,
  },
  {
    id: "bk-nic-con-02-hannibal",
    title: "Hannibal",
    author: "Philip Freeman",
    category: NIC.conqueror,
    notes: "Nic Muñoz Top 50 · Conqueror #2",
    refile: true,
  },
  {
    id: "bk-nic-con-03-caesar",
    title: "Caesar",
    author: "Philip Freeman",
    category: NIC.conqueror,
    notes: "Nic Muñoz Top 50 · Conqueror #3",
    refile: true,
  },
  {
    id: "bk-nic-con-04-napoleon-roberts",
    title: "Napoleon: A Life",
    author: "Andrew Roberts",
    category: NIC.conqueror,
    notes: "Nic Muñoz Top 50 · Conqueror #4",
    alsoMatch: ["napoleon a life", "napoleon andrew roberts"],
    refile: true,
  },
  {
    id: "bk-nic-con-05-masters-command",
    title: "Masters of Command",
    author: "Barry Strauss",
    category: NIC.conqueror,
    notes: "Nic Muñoz Top 50 · Conqueror #5",
    refile: true,
  },
  {
    id: "bk-nic-con-06-cleopatra",
    title: "Cleopatra",
    author: "Stacy Schiff",
    category: NIC.conqueror,
    notes: "Nic Muñoz Top 50 · Conqueror #6",
    refile: true,
  },
  {
    id: "bk-nic-con-07-philip-alexander",
    title: "Philip and Alexander",
    author: "Adrian Goldsworthy",
    category: NIC.conqueror,
    notes: "Nic Muñoz Top 50 · Conqueror #7",
    refile: true,
  },
  {
    id: "bk-nic-con-08-hitler-charisma",
    title: "Hitler's Charisma",
    author: "Laurence Rees",
    category: NIC.conqueror,
    notes: "Nic Muñoz Top 50 · Conqueror #8",
    refile: true,
  },
  {
    id: "bk-nic-con-09-talleyrand",
    title: "Talleyrand",
    author: "Duff Cooper",
    category: NIC.conqueror,
    notes: "Nic Muñoz Top 50 · Conqueror #9",
    refile: true,
  },
  {
    id: "bk-nic-con-10-napoleon-maxims",
    title: "Napoleon's Military Maxims",
    author: "Napoleon Bonaparte",
    category: NIC.conqueror,
    notes: "Nic Muñoz Top 50 · Conqueror #10",
    alsoMatch: ["napoleons military maxims", "napoleon s military maxims"],
    refile: true,
  },

  // ── Genius ─────────────────────────────────────────────────────────────
  {
    id: "bk-want-wright-brothers",
    title: "The Wright Brothers",
    author: "David McCullough",
    category: NIC.genius,
    notes: "Nic Muñoz Top 50 · Genius #1",
    refile: true,
  },
  {
    id: "bk-want-einstein-isaacson",
    title: "Einstein",
    author: "Walter Isaacson",
    category: NIC.genius,
    notes: "Nic Muñoz Top 50 · Genius #2",
    alsoMatch: ["einstein his life and universe"],
    refile: true,
  },
  {
    id: "bk-want-feynman-joking",
    title: "Surely You're Joking, Mr. Feynman!",
    author: "Richard P. Feynman",
    category: NIC.genius,
    notes: "Nic Muñoz Top 50 · Genius #3",
    alsoMatch: [
      "surely you re joking mr feynman",
      "surely youre joking mr feynman",
      "surely you are joking mr feynman",
    ],
    refile: true,
  },
  {
    id: "bk-want-genius-gleick",
    title: "Genius",
    author: "James Gleick",
    category: NIC.genius,
    notes: "Nic Muñoz Top 50 · Genius #4",
    alsoMatch: ["genius the life and science of richard feynman"],
    refile: true,
  },
  {
    id: "bk-want-tesla-carlson",
    title: "Tesla: Inventor of the Electrical Age",
    author: "W. Bernard Carlson",
    category: NIC.genius,
    notes: "Nic Muñoz Top 50 · Genius #5",
    alsoMatch: ["tesla inventor of the electrical age"],
    refile: true,
  },
  {
    id: "bk-want-leonardo-isaacson",
    title: "Leonardo da Vinci",
    author: "Walter Isaacson",
    category: NIC.genius,
    notes: "Nic Muñoz Top 50 · Genius #6",
    refile: true,
  },
  {
    id: "bk-want-tesla-autobiography",
    title: "My Inventions: The Autobiography of Nikola Tesla",
    author: "Nikola Tesla",
    category: NIC.genius,
    notes: "Nic Muñoz Top 50 · Genius #7 — Tesla’s autobiography",
    alsoMatch: [
      "tesla s autobiography",
      "teslas autobiography",
      "my inventions",
      "autobiography of nikola tesla",
    ],
    refile: true,
  },
  {
    id: "bk-want-wizard-menlo-park",
    title: "The Wizard of Menlo Park",
    author: "Randall Stross",
    category: NIC.genius,
    notes: "Nic Muñoz Top 50 · Genius #8",
    alsoMatch: ["wizard of menlo park"],
    refile: true,
  },
  {
    id: "bk-want-newton-gleick",
    title: "Isaac Newton",
    author: "James Gleick",
    category: NIC.genius,
    notes: "Nic Muñoz Top 50 · Genius #9",
    refile: true,
  },
  {
    id: "bk-want-franklin-isaacson",
    title: "Benjamin Franklin",
    author: "Walter Isaacson",
    category: NIC.genius,
    notes: "Nic Muñoz Top 50 · Genius #10",
    alsoMatch: [
      "benjamin franklin an american life",
      "benjamin franklin a life",
    ],
    refile: true,
  },

  // ── Must-Read Stories ──────────────────────────────────────────────────
  {
    id: "bk-nic-mrs-01-founders",
    title: "The Founders",
    author: "Jimmy Soni",
    category: NIC.mustRead,
    notes: "Nic Muñoz Top 50 · Must-Read Stories #1",
    alsoMatch: ["the founders jimmy soni", "the founders jimmy sonni"],
    refile: true,
  },
  {
    id: "bk-nic-mrs-02-endurance",
    title: "Endurance",
    author: "Alfred Lansing",
    category: NIC.mustRead,
    notes: "Nic Muñoz Top 50 · Must-Read Stories #2",
    alsoMatch: ["endurance shackleton", "endurance alfred lansing"],
    refile: true,
  },
  {
    id: "bk-nic-mrs-03-liftoff",
    title: "Liftoff",
    author: "Eric Berger",
    category: NIC.mustRead,
    notes: "Nic Muñoz Top 50 · Must-Read Stories #3",
    alsoMatch: ["lift off", "liftoff eric berger"],
    refile: true,
  },
  {
    id: "bk-nic-mrs-04-alone-wall",
    title: "Alone on the Wall",
    author: "Alex Honnold",
    category: NIC.mustRead,
    notes: "Nic Muñoz Top 50 · Must-Read Stories #4",
    refile: true,
  },
  {
    id: "bk-nic-mrs-05-ogilvy",
    title: "Confessions of an Advertising Man",
    author: "David Ogilvy",
    category: NIC.mustRead,
    notes: "Nic Muñoz Top 50 · Must-Read Stories #5",
    refile: true,
  },
  {
    id: "bk-nic-mrs-06-instant-polaroid",
    title: "Instant: The Story of Polaroid",
    author: "Christopher Bonanos",
    category: NIC.mustRead,
    notes: "Nic Muñoz Top 50 · Must-Read Stories #6",
    refile: true,
  },
  {
    id: "bk-nic-mrs-07-bushido",
    title: "Bushido: The Code of the Samurai",
    author: "Inazo Nitobe",
    category: NIC.mustRead,
    notes: "Nic Muñoz Top 50 · Must-Read Stories #7",
    alsoMatch: ["bushido code of the samurai", "bushido the soul of japan"],
    refile: true,
  },
  {
    id: "bk-nic-mrs-08-reentry",
    title: "Reentry",
    author: "Eric Berger",
    category: NIC.mustRead,
    notes: "Nic Muñoz Top 50 · Must-Read Stories #8",
    refile: true,
  },
  {
    id: "bk-nic-mrs-09-glock",
    title: "Glock",
    author: "Paul M. Barrett",
    category: NIC.mustRead,
    notes: "Nic Muñoz Top 50 · Must-Read Stories #9",
    refile: true,
  },
  {
    id: "bk-nic-mrs-10-talk-strangers",
    title: "Talk to Strangers",
    author: "Matt Dahila",
    category: NIC.mustRead,
    notes: "Nic Muñoz Top 50 · Must-Read Stories #10 (as listed by Nic Muñoz)",
    refile: true,
  },

  // ── Historical Narratives ──────────────────────────────────────────────
  {
    id: "bk-nic-hn-01-lessons-history",
    title: "The Lessons of History",
    author: "Will and Ariel Durant",
    category: NIC.historical,
    notes: "Nic Muñoz Top 50 · Historical Narratives #1",
    refile: true,
  },
  {
    id: "bk-nic-hn-02-changing-world-order",
    title: "The Changing World Order",
    author: "Ray Dalio",
    category: NIC.historical,
    notes: "Nic Muñoz Top 50 · Historical Narratives #2",
    alsoMatch: [
      "principles for dealing with the changing world order",
      "changing world order",
    ],
    refile: true,
  },
  {
    id: "bk-nic-hn-03-zero-to-one",
    title: "Zero to One",
    author: "Peter Thiel",
    category: NIC.historical,
    notes: "Nic Muñoz Top 50 · Historical Narratives #3",
    refile: true,
  },
  {
    id: "bk-nic-hn-04-33-strategies",
    title: "The 33 Strategies of War",
    author: "Robert Greene",
    category: NIC.historical,
    notes: "Nic Muñoz Top 50 · Historical Narratives #4",
    refile: true,
  },
  {
    id: "bk-nic-hn-05-art-of-seduction",
    title: "The Art of Seduction",
    author: "Robert Greene",
    category: NIC.historical,
    notes: "Nic Muñoz Top 50 · Historical Narratives #5",
    refile: true,
  },
  {
    id: "bk-nic-hn-06-mastery",
    title: "Mastery",
    author: "Robert Greene",
    category: NIC.historical,
    notes: "Nic Muñoz Top 50 · Historical Narratives #6",
    refile: true,
  },
  {
    id: "bk-nic-hn-07-guns-germs-steel",
    title: "Guns, Germs, and Steel",
    author: "Jared Diamond",
    category: NIC.historical,
    notes: "Nic Muñoz Top 50 · Historical Narratives #7",
    refile: true,
  },
  {
    id: "bk-nic-hn-08-principles",
    title: "Principles",
    author: "Ray Dalio",
    category: NIC.historical,
    notes: "Nic Muñoz Top 50 · Historical Narratives #8",
    alsoMatch: ["principles life and work", "principles ray dalio"],
    refile: true,
  },
  {
    id: "bk-nic-hn-09-12-rules",
    title: "12 Rules for Life",
    author: "Jordan B. Peterson",
    category: NIC.historical,
    notes: "Nic Muñoz Top 50 · Historical Narratives #9",
    refile: true,
  },
  {
    id: "bk-nic-hn-10-beyond-order",
    title: "Beyond Order",
    author: "Jordan B. Peterson",
    category: NIC.historical,
    notes: "Nic Muñoz Top 50 · Historical Narratives #10",
    alsoMatch: ["beyond order 12 more rules for life"],
    refile: true,
  },
];

/** User-requested adds from the 2026-07-29 shelf screenshot. */
const SCREENSHOT_WANT_BOOKS: EnsureWantBook[] = [
  {
    id: "bk-shelf-oathbringer",
    title: "Oathbringer",
    author: "Brandon Sanderson",
    category: "Literature & Fiction",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-atomic-accidents",
    title: "Atomic Accidents",
    author: "James Mahaffey",
    category: "Physics & Science",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-a-fine-balance",
    title: "A Fine Balance",
    author: "Rohinton Mistry",
    category: "Literature & Fiction",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-building-machine-learning-powered-applications",
    title: "Building Machine Learning Powered Applications",
    author: "Emmanuel Ameisen",
    category: "Technology & Innovation",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-art-of-happiness",
    title: "The Art of Happiness",
    author: "His Holiness the Dalai Lama and Howard C. Cutler",
    category: "Philosophy & Spirituality",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-the-maniac",
    title: "The Maniac",
    author: "Benjamin Labatut",
    category: "Technology & Innovation",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-the-diamond-age",
    title: "The Diamond Age",
    author: "Neal Stephenson",
    category: "Technology & Innovation",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-nuclear-war-scenario",
    title: "Nuclear War: A Scenario",
    author: "Annie Jacobsen",
    category: "Physics & Science",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-fourth-dimension",
    title: "The Fourth Dimension: Toward a Geometry of Higher Reality",
    author: "Rudy Rucker",
    category: "Physics & Science",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-inventing-temperature",
    title: "Inventing Temperature",
    author: "Hasok Chang",
    category: "Physics & Science",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-15-commitments-conscious-leadership",
    title: "The 15 Commitments of Conscious Leadership",
    author: "Jim Dethmer, Diana Chapman, and Kaley Warner Klemp",
    category: "Business & Money",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-wretched-of-the-earth",
    title: "The Wretched of the Earth",
    author: "Frantz Fanon",
    category: "Literature & Fiction",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-unreasonable-hospitality",
    title: "Unreasonable Hospitality",
    author: "Will Guidara",
    category: "Business & Money",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-influence",
    title: "Influence",
    author: "Robert B. Cialdini",
    category: "Business & Money",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-alignment-problem",
    title: "The Alignment Problem",
    author: "Brian Christian",
    category: "Technology & Innovation",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-real-world-bug-hunting",
    title: "Real-World Bug Hunting",
    author: "Peter Yaworski",
    category: "Technology & Innovation",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-smart-enough-animals",
    title: "Are We Smart Enough to Know How Smart Animals Are?",
    author: "Frans de Waal",
    category: "Physics & Science",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-surely-joking-feynman",
    title: "Surely You're Joking, Mr. Feynman!",
    author: "Richard P. Feynman",
    category: "Physics & Science",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
    alsoMatch: [
      "surely you re joking mr feynman",
      "surely youre joking mr feynman",
      "surely you are joking mr feynman",
    ],
  },
  {
    id: "bk-shelf-different-de-waal",
    title: "Different: Gender Through the Eyes of a Primatologist",
    author: "Frans de Waal",
    category: "Physics & Science",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-never-split-difference",
    title: "Never Split the Difference",
    author: "Chris Voss",
    category: "Business & Money",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-the-information",
    title: "The Information: A History, a Theory, a Flood",
    author: "James Gleick",
    category: "Technology & Innovation",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
  {
    id: "bk-shelf-from-dawn-to-decadence",
    title: "From Dawn to Decadence",
    author: "Jacques Barzun",
    category: "Literature & Fiction",
    notes: "Added from shelf screenshot · Want page · not downloaded.",
  },
];

function bookTitleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function ensureWantBooks(books: Book[], wants: EnsureWantBook[]): Book[] {
  const next = [...books];
  const existingKeys = new Set(next.map((book) => bookTitleKey(book.title)));
  for (const item of wants) {
    const keys = [item.title, ...(item.alsoMatch || [])].map(bookTitleKey);
    if (isBookDeleted(item.id) || keys.some((key) => existingKeys.has(key))) {
      continue;
    }
    const book = newBook({
      id: item.id,
      title: item.title,
      author: item.author,
      category: item.category,
      categoryOverride: false,
      status: "want",
      statusOverride: true,
      source: "manual",
      format: "manual",
      readingFormats: ["physical"],
      notes: item.notes,
      description: item.description,
      externalUrl: item.externalUrl,
    });
    next.unshift(book);
    existingKeys.add(bookTitleKey(book.title));
  }
  return next;
}

export function loadBooks(): Book[] {
  let books: Book[] = [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw) as Partial<Book>[];
      if (Array.isArray(arr)) {
        books = arr
          .map(normalizeStoredBook)
          .filter(keepBook)
          // Drop the old baked "starter shelf" seed so only your real books show
          .filter((b) => b.source !== "wonder-page");
      }
    }
  } catch {
    /* fall through to an empty real library */
  }
  // Remove the former auto-generated recommendation shelf. Real Apple/local
  // copies use their own source ids and remain untouched.
  const legacySeedIds = new Set(ENSURE_WANT_BOOKS.map((book) => book.id));
  books = books.filter(
    (book) => !(book.source === "manual" && legacySeedIds.has(book.id))
  );

  // The owner explicitly removed these stale titles. Persist tombstones so
  // Apple/local background sync cannot resurrect them.
  const unwantedTitles = new Set([
    "the five people you meet in heaven",
    "tuesdays with morrie",
  ]);
  const unwanted = books.filter((book) =>
    unwantedTitles.has(bookTitleKey(book.title))
  );
  unwanted.forEach(markBookDeleted);
  books = books.filter(
    (book) => !unwantedTitles.has(bookTitleKey(book.title))
  );
  // Never silently seed recommendations. This shelf mirrors the user's
  // actual library plus explicit adds the owner requested.
  return ensureWantBooks(books, SCREENSHOT_WANT_BOOKS);
}

function loadDeletedBookKeys(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_KEY) || "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : []
    );
  } catch {
    return new Set();
  }
}

export function isBookDeleted(...keys: Array<string | undefined>): boolean {
  const deleted = loadDeletedBookKeys();
  return keys.some((key) => Boolean(key && deleted.has(key)));
}

export function markBookDeleted(
  book: Pick<Book, "id" | "sourceId" | "wonderPageId">
): void {
  const deleted = loadDeletedBookKeys();
  deleted.add(book.id);
  if (book.sourceId) deleted.add(book.sourceId);
  if (book.wonderPageId) deleted.add(`wonder-${book.wonderPageId}`);
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(deleted)));
  } catch {
    /* In-memory removal still works if persistence is unavailable. */
  }
}

export function keepBook(book: Pick<Book, "title" | "category">): boolean {
  // Keep every real book. No title/category blocklists — nothing from your
  // library is filtered out. Only drop a genuinely empty entry.
  return Boolean(book.title && book.title.trim());
}

export function saveBooks(books: Book[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(books));
  } catch {
    /* The library remains usable in memory when storage is unavailable. */
  }
}

export function requestBookOpen(book: Book): BookOpenRequest {
  const request: BookOpenRequest = {
    bookId: book.id,
    startCfi: book.smartBookmark?.cfi || book.readerCfi,
    requestedAt: Date.now(),
  };
  try {
    localStorage.setItem(OPEN_REQUEST_KEY, JSON.stringify(request));
  } catch {
    /* The event still opens the book when Bookshelf is already mounted. */
  }
  window.dispatchEvent(new CustomEvent(BOOK_OPEN_EVENT, { detail: request }));
  return request;
}

export function takeBookOpenRequest(): BookOpenRequest | null {
  try {
    const raw = localStorage.getItem(OPEN_REQUEST_KEY);
    localStorage.removeItem(OPEN_REQUEST_KEY);
    if (!raw) return null;
    const request = JSON.parse(raw) as Partial<BookOpenRequest>;
    if (typeof request.bookId !== "string") return null;
    return {
      bookId: request.bookId,
      startCfi: typeof request.startCfi === "string" ? request.startCfi : undefined,
      requestedAt: Number(request.requestedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export function newBook(partial?: Partial<Book>): Book {
  const now = Date.now();
  const color = SPINE_COLORS[Math.floor(Math.random() * SPINE_COLORS.length)];
  const title = partial?.title || "";
  const author = partial?.author || "";
  return {
    id: uid(),
    title,
    author,
    status: "want",
    category: categorizeBook(title, author),
    source: "manual",
    format: "manual",
    readingFormat: "digital",
    readingFormats: ["ebook"],
    appleProgress: 0,
    localReaderProgress: 0,
    statusOverride: Boolean(partial?.status),
    categoryOverride: Boolean(partial?.category),
    rating: 0,
    pageNow: 0,
    pageTotal: 0,
    notes: "",
    quotes: [],
    color,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function newQuote(
  text: string,
  page?: string,
  interpretation?: string,
  location?: string
): BookQuote {
  return {
    id: uid(),
    text: text.trim(),
    page: page?.trim() || undefined,
    interpretation: interpretation?.trim() || undefined,
    location: location?.trim() || undefined,
    source: "manual",
    createdAt: Date.now(),
  };
}

export const STATUS_LABEL: Record<BookStatus, string> = {
  reading: "Reading",
  want: "Want to read",
  finished: "Finished",
  paused: "Paused",
};

export const STATUS_ORDER: BookStatus[] = [
  "reading",
  "want",
  "paused",
  "finished",
];

export { SPINE_COLORS };
