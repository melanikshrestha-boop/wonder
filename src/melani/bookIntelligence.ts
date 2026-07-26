/**
 * Bookshelf intelligence.
 *
 * Everything here is deterministic and offline: it reads the shelf you already
 * have and works out what it means. No model calls, no network, no guessing
 * dressed up as fact — every conclusion carries the evidence that produced it.
 *
 *   classifyBook    weighted shelving with reasons, instead of first-keyword-wins
 *   detectSeries    groups sequels and numbered volumes
 *   readingPace     how fast you actually read, from finished books
 *   estimateFinish  when a book in progress will be done
 *   suggestNextUp   what to read next, and why
 *   shelfInsights   composition, stalls, gaps, duplicates
 *   searchBooks     typo-tolerant search across titles, authors, subjects, quotes
 */
import {
  CATEGORY_ORDER,
  type Book,
  type BookCategory,
  type BuiltInBookCategory,
} from "./booksStore";

const DAY_MS = 86_400_000;

/* ────────────────────────── smart shelving ────────────────────────── */

type Rule = {
  category: BuiltInBookCategory;
  /** Subject/keyword fragments; a match in a subject tag counts double. */
  terms: string[];
  weight: number;
};

/**
 * Shelving rules. Several can fire at once — the winner is the highest total,
 * so "a physicist's memoir" lands on the shelf its strongest evidence supports
 * rather than whichever keyword happened to be checked first.
 */
const RULES: Rule[] = [
  {
    category: "Physics & Science",
    terms: [
      "physics", "quantum", "relativity", "astrophysics", "cosmology",
      "biology", "chemistry", "astronomy", "neuroscience", "mathematics",
      "evolution", "genetics", "science", "scientific", "feynman", "universe",
    ],
    weight: 3,
  },
  {
    category: "Technology & Innovation",
    terms: [
      "technology", "computer", "programming", "software", "engineering",
      "artificial intelligence", "machine learning", "startup", "startups",
      "silicon valley", "internet", "coding", "python", "algorithm",
      "innovation", "semiconductor", "robotics", "data science",
    ],
    weight: 3,
  },
  {
    category: "Business & Money",
    terms: [
      "business", "economics", "finance", "investing", "investment", "money",
      "wealth", "entrepreneur", "management", "marketing", "leadership",
      "negotiation", "accounting", "stock market", "venture capital",
      "personal finance", "capitalism", "real estate",
    ],
    weight: 3,
  },
  {
    category: "Psychology & Self-Development",
    terms: [
      "psychology", "self-help", "self help", "habit", "habits", "productivity",
      "motivation", "discipline", "mindset", "behavioral", "behaviour",
      "cognitive", "emotional intelligence", "happiness", "personal development",
      "focus", "decision making", "therapy", "anxiety",
    ],
    weight: 3,
  },
  {
    category: "Philosophy & Spirituality",
    terms: [
      "philosophy", "stoic", "stoicism", "ethics", "metaphysics", "religion",
      "spiritual", "spirituality", "buddhism", "meditation", "zen",
      "existential", "theology", "consciousness", "wisdom",
    ],
    weight: 3,
  },
  {
    category: "Autobiography & Memoir",
    terms: [
      "autobiography", "autobiographies", "memoir", "memoirs", "biography",
      "biographies", "diaries", "letters", "life story", "my life",
      "personal narrative",
    ],
    weight: 4,
  },
  {
    category: "Literature & Fiction",
    terms: [
      "fiction", "novel", "novels", "literature", "literary", "short stories",
      "poetry", "drama", "fantasy", "science fiction", "mystery", "thriller",
      "romance", "classics", "dystopia",
    ],
    weight: 3,
  },
  {
    category: "Music & Culture",
    terms: [
      "music", "musician", "musicians", "songwriting", "jazz", "rock music",
      "hip hop", "composer", "album", "band", "pop culture", "art history",
      "film", "cinema", "fashion",
    ],
    weight: 3,
  },
];

/** Authors whose whole body of work belongs on one shelf. */
const AUTHOR_SHELF: Record<string, BuiltInBookCategory> = {
  "richard feynman": "Physics & Science",
  "carl sagan": "Physics & Science",
  "stephen hawking": "Physics & Science",
  "brian greene": "Physics & Science",
  "walter isaacson": "Autobiography & Memoir",
  "james clear": "Psychology & Self-Development",
  "cal newport": "Psychology & Self-Development",
  "daniel kahneman": "Psychology & Self-Development",
  "robert greene": "Psychology & Self-Development",
  "morgan housel": "Business & Money",
  "benjamin graham": "Business & Money",
  "peter thiel": "Technology & Innovation",
  "eric ries": "Business & Money",
  "marcus aurelius": "Philosophy & Spirituality",
  "seneca": "Philosophy & Spirituality",
  "ryan holiday": "Philosophy & Spirituality",
  "george orwell": "Literature & Fiction",
  "ray bradbury": "Literature & Fiction",
  "haruki murakami": "Literature & Fiction",
};

export type Classification = {
  category: BookCategory;
  /** 0–1. Below ~0.35 the shelf is a guess worth showing as such. */
  confidence: number;
  /** Plain-language evidence, strongest first. */
  why: string[];
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Score every shelf against the book's signals and return the best one.
 * Subject tags are the strongest signal because they come from the publisher
 * or Open Library rather than from a filename.
 */
export function classifyBook(book: {
  title: string;
  author?: string;
  sourceGenre?: string;
  description?: string;
  subjects?: string[];
}): Classification {
  const title = normalize(book.title || "");
  const author = normalize(book.author || "");
  const subjects = (book.subjects || []).map(normalize);
  const subjectBlob = subjects.join(" · ");
  const genre = normalize(book.sourceGenre || "");
  const description = normalize(book.description || "").slice(0, 1200);

  const scores = new Map<BuiltInBookCategory, number>();
  const evidence = new Map<BuiltInBookCategory, string[]>();

  const bump = (category: BuiltInBookCategory, amount: number, reason: string) => {
    scores.set(category, (scores.get(category) || 0) + amount);
    const list = evidence.get(category) || [];
    if (!list.includes(reason)) list.push(reason);
    evidence.set(category, list);
  };

  const authorShelf = AUTHOR_SHELF[author];
  if (authorShelf) {
    bump(authorShelf, 5, `${book.author} writes for this shelf`);
  }

  for (const rule of RULES) {
    for (const term of rule.terms) {
      if (subjectBlob.includes(term)) {
        bump(rule.category, rule.weight * 2, `subject tag “${term}”`);
      }
      if (genre.includes(term)) {
        bump(rule.category, rule.weight * 1.5, `publisher genre “${term}”`);
      }
      if (title.includes(term)) {
        bump(rule.category, rule.weight, `title mentions “${term}”`);
      }
      if (description.includes(term)) {
        bump(rule.category, rule.weight * 0.5, `description mentions “${term}”`);
      }
    }
  }

  let best: BuiltInBookCategory = "Unsorted";
  let bestScore = 0;
  let runnerUp = 0;
  for (const [category, score] of scores) {
    if (score > bestScore) {
      runnerUp = bestScore;
      bestScore = score;
      best = category;
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  if (!bestScore) {
    return {
      category: "Unsorted",
      confidence: 0,
      why: ["No subject, genre, or title signal to shelve on yet"],
    };
  }

  // Confident when the winner is strong on its own and clear of the runner-up.
  const strength = Math.min(1, bestScore / 10);
  const margin = bestScore > 0 ? (bestScore - runnerUp) / bestScore : 0;
  const confidence = Math.round(Math.min(1, strength * 0.6 + margin * 0.4) * 100) / 100;

  return {
    category: best,
    confidence,
    why: (evidence.get(best) || []).slice(0, 3),
  };
}

/* ────────────────────────── series detection ────────────────────────── */

export type SeriesGroup = {
  name: string;
  author: string;
  books: Book[];
  /** Volumes present, sorted; gaps are the ones you're missing */
  have: number[];
  missing: number[];
};

const SERIES_PATTERNS: RegExp[] = [
  /^(.+?)\s*[,:]?\s*(?:book|vol\.?|volume|part)\s*(\d{1,2})\b/i,
  /^(.+?)\s*\(\s*(.+?)\s*#\s*(\d{1,2})\s*\)/i,
  /^(.+?)\s+(\d{1,2})\s*$/,
];

function seriesFromTitle(title: string): { name: string; index: number } | null {
  const clean = title.trim();
  for (const pattern of SERIES_PATTERNS) {
    const match = clean.match(pattern);
    if (!match) continue;
    // The bracketed form puts the series name in group 2.
    const name = (match.length > 3 ? match[2] : match[1]) || "";
    const index = Number(match[match.length - 1]);
    if (!name || !Number.isFinite(index) || index < 1 || index > 40) continue;
    // A trailing year is not a volume number.
    if (index > 1900) continue;
    return { name: name.replace(/[\s:,-]+$/, "").trim(), index };
  }
  return null;
}

export function detectSeries(books: Book[]): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>();

  for (const book of books) {
    const declared =
      book.seriesName && book.seriesIndex
        ? { name: book.seriesName, index: book.seriesIndex }
        : seriesFromTitle(book.title);
    if (!declared) continue;

    const key = `${normalize(declared.name)}|${normalize(book.author)}`;
    const group =
      groups.get(key) ||
      ({
        name: declared.name,
        author: book.author,
        books: [],
        have: [],
        missing: [],
      } satisfies SeriesGroup);
    group.books.push(book);
    if (!group.have.includes(declared.index)) group.have.push(declared.index);
    groups.set(key, group);
  }

  const result: SeriesGroup[] = [];
  for (const group of groups.values()) {
    if (group.books.length < 2) continue;
    group.have.sort((a, b) => a - b);
    const highest = group.have[group.have.length - 1];
    for (let i = 1; i < highest; i++) {
      if (!group.have.includes(i)) group.missing.push(i);
    }
    group.books.sort((a, b) => a.title.localeCompare(b.title));
    result.push(group);
  }
  return result.sort((a, b) => b.books.length - a.books.length);
}

/* ────────────────────────── reading pace ────────────────────────── */

export type ReadingPace = {
  /** Books finished in the last 90 days, expressed per month */
  booksPerMonth: number;
  /** Median days from start to finish, when both dates exist */
  medianDaysToFinish: number | null;
  finishedTotal: number;
  finishedLast90: number;
  /** Books started but never finished, as a share of all started books */
  abandonRate: number;
  /** Enough finished books with dates to trust the numbers */
  confident: boolean;
};

function daysBetween(from?: string, to?: string): number | null {
  if (!from || !to) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.max(1, Math.round((end - start) / DAY_MS));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function readingPace(books: Book[], now = Date.now()): ReadingPace {
  const finished = books.filter((book) => book.status === "finished");
  const durations = finished
    .map((book) => daysBetween(book.startedAt, book.finishedAt))
    .filter((value): value is number => value !== null);

  const finishedLast90 = finished.filter((book) => {
    const at = book.finishedAt ? Date.parse(book.finishedAt) : book.updatedAt;
    return Number.isFinite(at) && now - at <= 90 * DAY_MS;
  }).length;

  const started = books.filter(
    (book) => book.startedAt || book.status === "reading" || book.status === "finished"
  ).length;
  const stalled = books.filter(
    (book) => book.status === "paused" && (book.readerProgress || 0) > 0.05
  ).length;

  return {
    booksPerMonth: Math.round((finishedLast90 / 3) * 10) / 10,
    medianDaysToFinish: median(durations),
    finishedTotal: finished.length,
    finishedLast90,
    abandonRate: started ? Math.round((stalled / started) * 100) / 100 : 0,
    confident: durations.length >= 3,
  };
}

/* ────────────────────────── finish estimates ────────────────────────── */

export type FinishEstimate = {
  bookId: string;
  title: string;
  progress: number;
  /** Days left at your measured pace; null when there's nothing to go on */
  daysLeft: number | null;
  expectedDate: string | null;
  /** Days since progress last moved */
  idleDays: number | null;
  stalled: boolean;
  basis: string;
};

export function estimateFinish(
  book: Book,
  pace: ReadingPace,
  now = Date.now()
): FinishEstimate {
  const progress = Math.max(0, Math.min(1, book.readerProgress || 0));
  const touchedAt = book.lastReadAt || book.updatedAt;
  const idleDays = Number.isFinite(touchedAt)
    ? Math.max(0, Math.floor((now - touchedAt) / DAY_MS))
    : null;

  let daysLeft: number | null = null;
  let basis = "No pace history yet — finish one book to calibrate";

  const started = book.startedAt ? Date.parse(book.startedAt) : NaN;
  // Any real progress on a dated start beats the shelf-wide median, including
  // barely-any progress: a book open for a year at 1% should not be projected
  // to finish in a fortnight just because your other books took a fortnight.
  if (progress > 0 && Number.isFinite(started) && now > started) {
    // Best signal: this book's own measured rate.
    const elapsedDays = Math.max(1, (now - started) / DAY_MS);
    const perDay = progress / elapsedDays;
    if (perDay > 0) {
      daysLeft = Math.ceil((1 - progress) / perDay);
      basis = `${Math.round(progress * 100)}% in ${Math.round(elapsedDays)} days on this book`;
    }
  } else if (pace.medianDaysToFinish) {
    daysLeft = Math.ceil(pace.medianDaysToFinish * (1 - progress));
    basis = `your median ${pace.medianDaysToFinish} days per book`;
  }

  // Don't promise a date years out from a single page of progress.
  if (daysLeft !== null && daysLeft > 400) {
    daysLeft = null;
    basis = "Progress is too slow to project a finish date";
  }

  return {
    bookId: book.id,
    title: book.title,
    progress,
    daysLeft,
    expectedDate:
      daysLeft === null
        ? null
        : new Date(now + daysLeft * DAY_MS).toISOString().slice(0, 10),
    idleDays,
    stalled: (idleDays ?? 0) >= 14 && progress > 0.03 && progress < 0.97,
    basis,
  };
}

/* ────────────────────────── what to read next ────────────────────────── */

export type Suggestion = {
  book: Book;
  score: number;
  /** Why this one, strongest reason first */
  reasons: string[];
};

/** Subjects and authors you actually finish, weighted by rating. */
export function tasteProfile(books: Book[]): {
  subjects: Map<string, number>;
  authors: Map<string, number>;
  categories: Map<string, number>;
} {
  const subjects = new Map<string, number>();
  const authors = new Map<string, number>();
  const categories = new Map<string, number>();

  for (const book of books) {
    // Finishing is the strongest signal, then rating, then merely starting.
    let weight = 0;
    if (book.status === "finished") weight += 3;
    if (book.status === "reading") weight += 1.5;
    if (book.rating >= 4) weight += 2;
    if (book.rating === 5) weight += 1;
    if (book.quotes.length >= 3) weight += 1;
    if (weight <= 0) continue;

    for (const subject of book.subjects || []) {
      const key = normalize(subject);
      if (key.length < 3) continue;
      subjects.set(key, (subjects.get(key) || 0) + weight);
    }
    if (book.author) {
      const key = normalize(book.author);
      authors.set(key, (authors.get(key) || 0) + weight);
    }
    categories.set(book.category, (categories.get(book.category) || 0) + weight);
  }

  return { subjects, authors, categories };
}

/**
 * Rank the unread shelf. Every suggestion explains itself, and a book you
 * can't actually open (undownloaded cloud placeholder) is pushed down rather
 * than recommended and then failing.
 */
export function suggestNextUp(
  books: Book[],
  options?: { limit?: number; now?: number }
): Suggestion[] {
  const now = options?.now ?? Date.now();
  const limit = options?.limit ?? 3;
  const taste = tasteProfile(books);
  const pace = readingPace(books, now);

  const candidates = books.filter(
    (book) => book.status === "want" || book.status === "paused"
  );
  if (!candidates.length) return [];

  const readingCount = books.filter((book) => book.status === "reading").length;
  const scored: Suggestion[] = [];

  for (const book of candidates) {
    let score = 1;
    const reasons: string[] = [];

    // Rescue a book you were most of the way through.
    const progress = book.readerProgress || 0;
    if (book.status === "paused" && progress > 0.4) {
      score += 6;
      reasons.push(`You're ${Math.round(progress * 100)}% through it already`);
    } else if (progress > 0.1) {
      score += 3;
      reasons.push(`Already started — ${Math.round(progress * 100)}% in`);
    }

    // Authors you finish.
    const authorKey = normalize(book.author || "");
    const authorAffinity = authorKey ? taste.authors.get(authorKey) || 0 : 0;
    if (authorAffinity > 0) {
      score += Math.min(5, authorAffinity);
      reasons.push(`You read ${book.author} before`);
    }

    // Subjects you finish.
    let subjectHit = "";
    let subjectScore = 0;
    for (const subject of book.subjects || []) {
      const weight = taste.subjects.get(normalize(subject)) || 0;
      if (weight > subjectScore) {
        subjectScore = weight;
        subjectHit = subject;
      }
    }
    if (subjectScore > 0) {
      score += Math.min(4, subjectScore / 2);
      reasons.push(`Matches your ${subjectHit} reading`);
    }

    // Shelves you keep coming back to.
    const categoryAffinity = taste.categories.get(book.category) || 0;
    if (categoryAffinity > 0 && !subjectHit) {
      score += Math.min(2, categoryAffinity / 3);
      reasons.push(`${book.category} is a shelf you finish`);
    }

    // Nothing in progress: favour something short to rebuild momentum.
    if (readingCount === 0 && book.chapterCount && book.chapterCount <= 12) {
      score += 2;
      reasons.push(`Short at ${book.chapterCount} chapters — easy restart`);
    }

    // Just arrived — recency counts for something.
    const ageDays = (now - book.createdAt) / DAY_MS;
    if (ageDays <= 7) {
      score += 1.5;
      reasons.push("Just landed on the shelf");
    } else if (ageDays > 240) {
      score += 0.5;
      reasons.push(`Waiting ${Math.round(ageDays / 30)} months`);
    }

    if (book.rating >= 4) {
      score += 1;
      reasons.push(`You rated it ${book.rating}★`);
    }

    // Can you actually open it right now?
    if (book.cloudOnly) {
      score -= 3;
      reasons.push("Not downloaded yet — open it once to read here");
    } else if (book.readerUrl) {
      score += 1;
      if (!reasons.length) reasons.push("Ready to open in Wonder's reader");
    }

    if (!reasons.length) {
      reasons.push(
        pace.confident
          ? `Fits your ${pace.booksPerMonth}/month pace`
          : "Unread and ready"
      );
    }

    scored.push({
      book,
      score: Math.round(score * 100) / 100,
      reasons: reasons.slice(0, 3),
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ────────────────────────── shelf insights ────────────────────────── */

export type ShelfInsight = {
  id: string;
  kind: "stall" | "gap" | "duplicate" | "cloud" | "unsorted" | "series" | "pace";
  headline: string;
  detail: string;
  bookIds: string[];
};

export type ShelfBrief = {
  total: number;
  reading: number;
  finished: number;
  unread: number;
  quotes: number;
  pace: ReadingPace;
  /** Top subjects across the whole shelf */
  topSubjects: { subject: string; count: number }[];
  /** Shelves with almost nothing on them */
  thinShelves: string[];
  inProgress: FinishEstimate[];
  nextUp: Suggestion[];
  series: SeriesGroup[];
  insights: ShelfInsight[];
};

export function shelfInsights(books: Book[], now = Date.now()): ShelfBrief {
  const pace = readingPace(books, now);
  const reading = books.filter((book) => book.status === "reading");
  const finished = books.filter((book) => book.status === "finished");
  const unread = books.filter((book) => book.status === "want");

  const inProgress = reading
    .map((book) => estimateFinish(book, pace, now))
    .sort((a, b) => b.progress - a.progress);

  const subjectCounts = new Map<string, number>();
  for (const book of books) {
    for (const subject of book.subjects || []) {
      const key = subject.trim();
      if (key.length < 3) continue;
      subjectCounts.set(key, (subjectCounts.get(key) || 0) + 1);
    }
  }
  const topSubjects = [...subjectCounts.entries()]
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const perCategory = new Map<string, number>();
  for (const book of books) {
    perCategory.set(book.category, (perCategory.get(book.category) || 0) + 1);
  }
  const thinShelves = CATEGORY_ORDER.filter(
    (category) => category !== "Unsorted" && (perCategory.get(category) || 0) === 0
  );

  const series = detectSeries(books);
  const insights: ShelfInsight[] = [];

  const stalled = inProgress.filter((estimate) => estimate.stalled);
  if (stalled.length) {
    const worst = stalled[0];
    insights.push({
      id: "stall",
      kind: "stall",
      headline:
        stalled.length === 1
          ? `${worst.title} has sat for ${worst.idleDays} days`
          : `${stalled.length} books stalled mid-read`,
      detail: `Pick up ${worst.title} at ${Math.round(worst.progress * 100)}% or move it to Paused so the shelf stays honest.`,
      bookIds: stalled.map((estimate) => estimate.bookId),
    });
  }

  const cloudOnly = books.filter((book) => book.cloudOnly);
  if (cloudOnly.length) {
    insights.push({
      id: "cloud",
      kind: "cloud",
      headline: `${cloudOnly.length} book${cloudOnly.length === 1 ? "" : "s"} not downloaded`,
      detail:
        "These live in the cloud as placeholders. Open each once on this Mac and the reader can use them offline.",
      bookIds: cloudOnly.map((book) => book.id),
    });
  }

  const unsorted = books.filter((book) => book.category === "Unsorted");
  if (unsorted.length >= 2) {
    insights.push({
      id: "unsorted",
      kind: "unsorted",
      headline: `${unsorted.length} books still unsorted`,
      detail:
        "Fetching covers also pulls subject tags from Open Library, which is usually enough to shelve them automatically.",
      bookIds: unsorted.map((book) => book.id),
    });
  }

  // Same book twice, usually one copy per drive.
  const byTitle = new Map<string, Book[]>();
  for (const book of books) {
    const key = normalize(book.title).replace(/[^a-z0-9 ]/g, "");
    if (key.length < 6) continue;
    byTitle.set(key, [...(byTitle.get(key) || []), book]);
  }
  const duplicates = [...byTitle.values()].filter((group) => group.length > 1);
  if (duplicates.length) {
    insights.push({
      id: "duplicate",
      kind: "duplicate",
      headline: `${duplicates.length} title${duplicates.length === 1 ? "" : "s"} on the shelf twice`,
      detail: duplicates
        .slice(0, 3)
        .map((group) => `${group[0].title} (${group.length} copies)`)
        .join(" · "),
      bookIds: duplicates.flat().map((book) => book.id),
    });
  }

  const incompleteSeries = series.filter((group) => group.missing.length);
  if (incompleteSeries.length) {
    const first = incompleteSeries[0];
    insights.push({
      id: "series",
      kind: "series",
      headline: `${first.name} is missing book ${first.missing.join(", ")}`,
      detail: `You have ${first.have.join(", ")} of ${first.name}. Find the gap to read it in order.`,
      bookIds: first.books.map((book) => book.id),
    });
  }

  if (pace.confident) {
    insights.push({
      id: "pace",
      kind: "pace",
      headline: `${pace.booksPerMonth} books a month`,
      detail: `Median ${pace.medianDaysToFinish} days per book across ${pace.finishedTotal} finished. At this pace your ${unread.length} unread books are ${
        pace.booksPerMonth > 0
          ? `about ${Math.round(unread.length / Math.max(0.1, pace.booksPerMonth))} months`
          : "an open-ended queue"
      }.`,
      bookIds: [],
    });
  } else if (finished.length) {
    insights.push({
      id: "pace",
      kind: "pace",
      headline: `${finished.length} finished so far`,
      detail:
        "Mark start and finish dates on a few more and the shelf can predict when you'll finish what you're reading.",
      bookIds: [],
    });
  }

  return {
    total: books.length,
    reading: reading.length,
    finished: finished.length,
    unread: unread.length,
    quotes: books.reduce((count, book) => count + book.quotes.length, 0),
    pace,
    topSubjects,
    thinShelves,
    inProgress,
    nextUp: suggestNextUp(books, { now }),
    series,
    insights,
  };
}

/* ────────────────────────── smart search ────────────────────────── */

export type SearchHit = {
  book: Book;
  score: number;
  /** Which fields matched, e.g. ["title", "subject"] */
  fields: string[];
  /** The matching quote, when a quote is what matched */
  quote?: string;
};

/** Tolerates one typo in words of 4+ characters. */
function fuzzyIncludes(haystack: string, needle: string): boolean {
  if (haystack.includes(needle)) return true;
  if (needle.length < 4) return false;
  // One deletion from the needle is enough to match a single transposed or
  // dropped character without pulling in unrelated words.
  for (let i = 0; i < needle.length; i++) {
    const variant = needle.slice(0, i) + needle.slice(i + 1);
    if (variant.length >= 3 && haystack.includes(variant)) return true;
  }
  return false;
}

const FIELD_WEIGHT: Record<string, number> = {
  title: 10,
  author: 7,
  series: 6,
  subject: 5,
  category: 3,
  quote: 4,
  note: 2,
  description: 1,
};

/**
 * Search titles, authors, subjects, quotes, and notes at once. Results are
 * ranked by where the match landed, so typing an author's name surfaces their
 * books before a book that merely mentions them.
 */
export function searchBooks(
  books: Book[],
  query: string,
  options?: { limit?: number }
): SearchHit[] {
  const cleaned = normalize(query);
  if (!cleaned) return [];
  const terms = cleaned.split(" ").filter((term) => term.length >= 2);
  if (!terms.length) return [];
  const limit = options?.limit ?? 40;

  const hits: SearchHit[] = [];

  for (const book of books) {
    const fields: { name: string; text: string }[] = [
      { name: "title", text: normalize(book.title) },
      { name: "author", text: normalize(book.author || "") },
      { name: "series", text: normalize(book.seriesName || "") },
      { name: "subject", text: normalize((book.subjects || []).join(" ")) },
      { name: "category", text: normalize(book.category) },
      { name: "note", text: normalize(book.notes || "") },
      { name: "description", text: normalize(book.description || "").slice(0, 600) },
    ];

    let score = 0;
    const matched = new Set<string>();
    let matchedQuote: string | undefined;

    for (const term of terms) {
      let termMatched = false;
      for (const field of fields) {
        if (!field.text) continue;
        if (field.text.includes(term)) {
          // Whole-word and prefix matches beat a match buried mid-word.
          const boundary = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
          score += FIELD_WEIGHT[field.name] * (boundary.test(field.text) ? 1.5 : 1);
          matched.add(field.name);
          termMatched = true;
        } else if (fuzzyIncludes(field.text, term)) {
          score += FIELD_WEIGHT[field.name] * 0.5;
          matched.add(field.name);
          termMatched = true;
        }
      }

      for (const quote of book.quotes) {
        const text = normalize(quote.text);
        if (text.includes(term)) {
          score += FIELD_WEIGHT.quote;
          matched.add("quote");
          termMatched = true;
          if (!matchedQuote) matchedQuote = quote.text;
        }
      }

      // Every term should contribute, so an unmatched term costs the result.
      if (!termMatched) score -= 2;
    }

    if (score <= 0) continue;

    // A book you're reading is more likely the one you meant.
    if (book.status === "reading") score += 2;

    hits.push({
      book,
      score: Math.round(score * 100) / 100,
      fields: [...matched],
      quote: matchedQuote,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
