/**
 * Smart bookshelf tests — shelving, series, pace, next-up, insights, search.
 * Run: npm run test:book-brain
 */

const values = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  },
});

const {
  classifyBook,
  detectSeries,
  readingPace,
  estimateFinish,
  suggestNextUp,
  tasteProfile,
  shelfInsights,
  searchBooks,
} = await import("../src/melani/bookIntelligence.ts");
const { newBook } = await import("../src/melani/booksStore.ts");

type Book = ReturnType<typeof newBook>;

let passed = 0;
let failed = 0;
function assert(name: string, cond: unknown, detail?: unknown) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
  }
}

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-26T12:00:00Z");
const ymd = (offsetDays: number) =>
  new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);

function book(partial: Partial<Book> & { title: string }): Book {
  return newBook({ ...partial });
}

/* ───────────────── shelving ───────────────── */
console.log("\nSmart shelving");

{
  const shelf = classifyBook({
    title: "Surely You're Joking, Mr. Feynman",
    author: "Richard Feynman",
    subjects: ["Physicists", "Autobiography", "Science"],
  });
  assert(
    "subject tags outweigh a bare title guess",
    shelf.category === "Autobiography & Memoir" ||
      shelf.category === "Physics & Science",
    shelf
  );
  assert("classification explains itself", shelf.why.length > 0, shelf.why);
  assert("confidence is scored 0–1", shelf.confidence > 0 && shelf.confidence <= 1);
}

{
  const shelf = classifyBook({
    title: "The Psychology of Money",
    author: "Morgan Housel",
    subjects: ["Personal finance", "Investing", "Behavioral economics"],
  });
  assert("money subjects win over the word psychology", shelf.category === "Business & Money", shelf);
}

{
  const shelf = classifyBook({ title: "Zero to One", author: "Peter Thiel" });
  assert("known author shelves without subjects", shelf.category === "Technology & Innovation", shelf);
}

{
  const shelf = classifyBook({ title: "Untitled book" });
  assert("no signal means Unsorted, not a wrong guess", shelf.category === "Unsorted", shelf);
  assert("no-signal confidence is zero", shelf.confidence === 0);
}

{
  const meditations = classifyBook({
    title: "Meditations",
    author: "Marcus Aurelius",
    subjects: ["Stoicism", "Philosophy, Ancient"],
  });
  assert("stoicism shelves to philosophy", meditations.category === "Philosophy & Spirituality", meditations);
  assert("agreeing signals raise confidence", meditations.confidence >= 0.5, meditations.confidence);
}

/* ───────────────── series ───────────────── */
console.log("\nSeries detection");

{
  const series = detectSeries([
    book({ title: "Dune", author: "Frank Herbert" }),
    book({ title: "Mistborn Book 1", author: "Brandon Sanderson" }),
    book({ title: "Mistborn Book 2", author: "Brandon Sanderson" }),
    book({ title: "Mistborn Book 4", author: "Brandon Sanderson" }),
  ]);
  assert("groups a numbered series", series.length === 1, series.map((s) => s.name));
  assert("counts the volumes present", series[0]?.books.length === 3);
  assert("spots the missing volume", series[0]?.missing.join() === "3", series[0]?.missing);
  assert("a standalone book is not a series", !series.some((s) => s.name === "Dune"));
}

{
  const series = detectSeries([
    book({ title: "Foundation", author: "Isaac Asimov", seriesName: "Foundation", seriesIndex: 1 }),
    book({ title: "Second Foundation", author: "Isaac Asimov", seriesName: "Foundation", seriesIndex: 3 }),
  ]);
  assert("honours declared series metadata", series[0]?.name === "Foundation", series);
  assert("declared series finds its gap", series[0]?.missing.join() === "2", series[0]?.missing);
}

{
  const series = detectSeries([
    book({ title: "Sapiens 2011", author: "Yuval Noah Harari" }),
    book({ title: "Homo Deus 2016", author: "Yuval Noah Harari" }),
  ]);
  assert("a year is not a volume number", series.length === 0, series);
}

/* ───────────────── pace ───────────────── */
console.log("\nReading pace");

const finishedShelf: Book[] = [
  book({
    title: "Atomic Habits",
    author: "James Clear",
    status: "finished",
    rating: 5,
    subjects: ["Habits", "Psychology"],
    startedAt: ymd(-40),
    finishedAt: ymd(-30),
  }),
  book({
    title: "Deep Work",
    author: "Cal Newport",
    status: "finished",
    rating: 4,
    subjects: ["Productivity", "Psychology"],
    startedAt: ymd(-70),
    finishedAt: ymd(-50),
  }),
  book({
    title: "The Lean Startup",
    author: "Eric Ries",
    status: "finished",
    rating: 3,
    subjects: ["Startups", "Business"],
    startedAt: ymd(-25),
    finishedAt: ymd(-10),
  }),
];

{
  const pace = readingPace(finishedShelf, NOW);
  assert("counts finishes in the last 90 days", pace.finishedLast90 === 3, pace);
  assert("converts to books per month", pace.booksPerMonth === 1, pace.booksPerMonth);
  assert("median days to finish is the middle value", pace.medianDaysToFinish === 15, pace);
  assert("three dated finishes is enough to trust", pace.confident === true);
}

{
  const pace = readingPace([book({ title: "Nothing read yet" })], NOW);
  assert("an unread shelf claims no pace", pace.confident === false && pace.booksPerMonth === 0);
  assert("median is null without finish dates", pace.medianDaysToFinish === null);
}

/* ───────────────── finish estimates ───────────────── */
console.log("\nFinish estimates");

{
  const pace = readingPace(finishedShelf, NOW);
  const halfway = book({
    title: "Thinking, Fast and Slow",
    status: "reading",
    startedAt: ymd(-20),
    readerProgress: 0.5,
    lastReadAt: NOW - DAY,
  });
  const estimate = estimateFinish(halfway, pace, NOW);
  assert(
    "projects from the book's own rate",
    estimate.daysLeft !== null && Math.abs(estimate.daysLeft - 20) <= 1,
    estimate
  );
  assert(
    "returns a real date",
    estimate.expectedDate === ymd(estimate.daysLeft || 0),
    estimate.expectedDate
  );
  assert("cites what the estimate is based on", /this book/.test(estimate.basis), estimate.basis);
  assert("a book read yesterday is not stalled", estimate.stalled === false);
}

{
  const pace = readingPace(finishedShelf, NOW);
  const abandoned = book({
    title: "Infinite Jest",
    status: "reading",
    startedAt: ymd(-200),
    readerProgress: 0.2,
    lastReadAt: NOW - 60 * DAY,
  });
  const estimate = estimateFinish(abandoned, pace, NOW);
  assert("flags a stalled read", estimate.stalled === true, estimate);
  assert("reports how long it has sat", estimate.idleDays === 60, estimate.idleDays);
}

{
  const pace = readingPace(finishedShelf, NOW);
  const barelyStarted = book({
    title: "War and Peace",
    status: "reading",
    startedAt: ymd(-300),
    readerProgress: 0.01,
  });
  const estimate = estimateFinish(barelyStarted, pace, NOW);
  assert("refuses to promise an absurd finish date", estimate.daysLeft === null, estimate);
}

/* ───────────────── taste + next up ───────────────── */
console.log("\nWhat to read next");

{
  const taste = tasteProfile(finishedShelf);
  assert("learns subjects from finished books", (taste.subjects.get("psychology") || 0) > 0);
  assert("weights a 5-star read above a 3-star", 
    (taste.authors.get("james clear") || 0) > (taste.authors.get("eric ries") || 0),
    [taste.authors.get("james clear"), taste.authors.get("eric ries")]
  );
  assert("an untouched book teaches nothing", tasteProfile([book({ title: "Unread" })]).subjects.size === 0);
}

{
  const shelf: Book[] = [
    ...finishedShelf,
    book({
      title: "Slow Productivity",
      author: "Cal Newport",
      status: "want",
      subjects: ["Productivity"],
      readerUrl: "/api/local-books/x/file",
    }),
    book({ title: "Random Cookbook", author: "Nobody", status: "want", subjects: ["Cooking"] }),
    book({
      title: "Cloud Only Book",
      author: "Cal Newport",
      status: "want",
      subjects: ["Productivity"],
      cloudOnly: true,
    }),
  ];
  const picks = suggestNextUp(shelf, { now: NOW, limit: 3 });
  assert("ranks the author you already finished first", picks[0]?.book.title === "Slow Productivity", picks[0]);
  assert("every pick explains itself", picks.every((pick) => pick.reasons.length > 0));
  assert(
    "names the author as the reason",
    picks[0]?.reasons.some((reason) => reason.includes("Cal Newport")),
    picks[0]?.reasons
  );
  const cloud = picks.find((pick) => pick.book.title === "Cloud Only Book");
  const ready = picks.find((pick) => pick.book.title === "Slow Productivity");
  assert(
    "a book you can't open ranks below one you can",
    !cloud || !ready || cloud.score < ready.score,
    [cloud?.score, ready?.score]
  );
  assert("unrelated book ranks last", picks[picks.length - 1]?.book.title !== "Slow Productivity");
}

{
  const rescue = suggestNextUp(
    [
      ...finishedShelf,
      book({ title: "Almost Done", status: "paused", readerProgress: 0.8 }),
      book({ title: "Never Opened", status: "want" }),
    ],
    { now: NOW, limit: 2 }
  );
  assert("rescues the book you nearly finished", rescue[0]?.book.title === "Almost Done", rescue[0]);
  assert(
    "says how far in you were",
    rescue[0]?.reasons.some((reason) => reason.includes("80%")),
    rescue[0]?.reasons
  );
}

assert("no unread books means no suggestions", suggestNextUp(finishedShelf, { now: NOW }).length === 0);

/* ───────────────── shelf insights ───────────────── */
console.log("\nShelf insights");

{
  const shelf: Book[] = [
    ...finishedShelf,
    book({
      title: "Infinite Jest",
      status: "reading",
      startedAt: ymd(-200),
      readerProgress: 0.2,
      lastReadAt: NOW - 60 * DAY,
    }),
    book({ title: "Dune", author: "Frank Herbert", status: "want", cloudOnly: true }),
    book({ title: "The Selfish Gene", author: "Richard Dawkins", status: "want" }),
    book({ title: "The Selfish Gene", author: "Richard Dawkins", status: "want", drive: "iCloud Drive" }),
  ];
  const brief = shelfInsights(shelf, NOW);

  assert("counts the shelf", brief.total === 7 && brief.finished === 3 && brief.reading === 1, brief);
  const kinds = brief.insights.map((insight) => insight.kind);
  assert("reports the stalled read", kinds.includes("stall"), kinds);
  assert("reports undownloaded cloud books", kinds.includes("cloud"), kinds);
  assert("reports the duplicate copy", kinds.includes("duplicate"), kinds);
  assert("reports the pace", kinds.includes("pace"), kinds);
  assert("every insight carries a headline and detail",
    brief.insights.every((insight) => insight.headline && insight.detail));
  assert("surfaces the shelf's top subjects", brief.topSubjects.length > 0, brief.topSubjects);
  assert("suggests something to read next", brief.nextUp.length > 0);
  assert("estimates the in-progress book", brief.inProgress.length === 1);
  assert("names empty shelves as gaps", brief.thinShelves.includes("Music & Culture"), brief.thinShelves);
}

assert("an empty shelf produces an empty brief", shelfInsights([], NOW).total === 0);

/* ───────────────── smart search ───────────────── */
console.log("\nSmart search");

const searchShelf: Book[] = [
  book({
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    subjects: ["Behavioral economics", "Decision making"],
    notes: "The best chapter is on anchoring.",
  }),
  book({
    title: "The Beginning of Infinity",
    author: "David Deutsch",
    subjects: ["Physics", "Epistemology"],
  }),
  book({
    title: "Quiet Notes",
    author: "Susan Cain",
    quotes: [
      {
        id: "q1",
        text: "Solitude matters, and for some people it is the air they breathe.",
        createdAt: NOW,
        source: "manual" as const,
      },
    ],
  }),
];

{
  const hits = searchBooks(searchShelf, "kahneman");
  assert("finds a book by author", hits[0]?.book.title === "Thinking, Fast and Slow", hits[0]);
  assert("says which field matched", hits[0]?.fields.includes("author"), hits[0]?.fields);
}

{
  const hits = searchBooks(searchShelf, "physics");
  assert("finds a book by subject tag", hits[0]?.book.title === "The Beginning of Infinity", hits[0]);
  assert("credits the subject match", hits[0]?.fields.includes("subject"));
}

{
  const hits = searchBooks(searchShelf, "solitude");
  assert("finds a book by something it says", hits[0]?.book.title === "Quiet Notes", hits[0]);
  assert("returns the matching quote", /Solitude matters/.test(hits[0]?.quote || ""), hits[0]?.quote);
}

{
  const hits = searchBooks(searchShelf, "kahnemann");
  assert("survives a typo", hits[0]?.book.title === "Thinking, Fast and Slow", hits);
}

{
  const hits = searchBooks(searchShelf, "anchoring");
  assert("searches your own notes", hits[0]?.book.title === "Thinking, Fast and Slow", hits[0]);
}

{
  assert("nonsense finds nothing", searchBooks(searchShelf, "zzzzqqqx").length === 0);
  assert("an empty query finds nothing", searchBooks(searchShelf, "   ").length === 0);
}

{
  const title = searchBooks(searchShelf, "thinking")[0];
  assert("a title match outranks a passing mention", title?.book.title === "Thinking, Fast and Slow");
  assert("hits are scored", (title?.score || 0) > 0, title?.score);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
