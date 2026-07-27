/**
 * Retrieve-then-generate evidence pack (Intelligence V2 Phase A).
 *
 * Builds a capped, ranked context string for Mel / Finance Mel so we stop
 * dumping the entire shelf into every prompt.
 */
import {
  bookshelfStats,
  buildBookshelfKnowledgePack,
  searchBookshelfKnowledge,
} from "./bookKnowledge";
import { conceptLabel, conceptsMatchingQuery } from "./bookConcepts";
import {
  findEconFramework,
  buildEconCanonPack,
  type EconFramework,
} from "./econCanon";
import {
  formatHighlightHits,
  highlightStats,
  searchHighlights,
  type HighlightHit,
} from "./highlightIndex";
import { todayKey } from "./data";

const PINS_KEY = "dr-melani-pins-v1";

function loadPinsLocal(): string[] {
  try {
    const rows = JSON.parse(localStorage.getItem(PINS_KEY) || "[]") as string[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export type EvidencePack = {
  query: string;
  builtAt: string;
  highlights: HighlightHit[];
  text: string;
  sources: string[];
  stats: {
    shelfBooks: number;
    highlights: number;
    pins: number;
  };
};

function moneyQuery(q: string): boolean {
  return /\b(money|spend|spent|budget|cash|debt|worth|subscri|invest|econom|financ|capital|price|cost|save|saving|afford|ledger|runway|apr|inflat|incentive|opportun)/i.test(
    q
  );
}

function shortBodySlice(): string {
  // Lightweight body line from the same keys Fitness uses — no full snapshot recursion
  const day = todayKey();
  let sleep = "sleep not logged";
  try {
    const raw = localStorage.getItem(`dr-melani-sleep-v1:${day}`);
    if (raw) {
      const s = JSON.parse(raw) as { bedtime?: string; wake?: string };
      if (s.bedtime || s.wake) sleep = `sleep bed ${s.bedtime || "?"} wake ${s.wake || "?"}`;
    }
  } catch {
    /* ignore */
  }
  let water = 0;
  try {
    water = Math.max(0, Number(localStorage.getItem(`dr-melani-water-ml:${day}`)) || 0);
  } catch {
    /* ignore */
  }
  return `BODY TODAY (${day}): water ${water} ml · ${sleep}`;
}

function pickFrameworks(query: string): EconFramework[] {
  const q = query.trim();
  if (!q) {
    // default two high-leverage frameworks
    const pack = buildEconCanonPack(2000);
    void pack;
  }
  const one = q ? findEconFramework(q) : null;
  const out: EconFramework[] = [];
  if (one) out.push(one);
  // second: if money query, add capital-allocation-ish via find
  if (out.length < 2 && moneyQuery(q || "capital")) {
    const two = findEconFramework("capital allocation") || findEconFramework("opportunity cost");
    if (two && two.id !== one?.id) out.push(two);
  }
  if (!out.length) {
    const fallback = findEconFramework("opportunity cost");
    if (fallback) out.push(fallback);
  }
  return out.slice(0, 2);
}

/**
 * Ranked evidence for one user question (or baseline if query empty).
 * Total text hard-capped.
 */
export function buildEvidencePack(
  query: string,
  opts?: {
    pageId?: string;
    pageTitle?: string;
    maxChars?: number;
    /** Include longer shelf list */
    deepShelf?: boolean;
  }
): EvidencePack {
  const maxChars = opts?.maxChars ?? 4500;
  const q = (query || "").trim();
  const pageBlob = `${opts?.pageId || ""} ${opts?.pageTitle || ""}`;
  const wantMoney =
    moneyQuery(q) ||
    /pg-finance|financ|money|market/i.test(pageBlob);

  const pins = loadPinsLocal();
  const hStats = highlightStats();
  const bStats = bookshelfStats();

  // Retrieve
  const highlights = searchHighlights(q || "", wantMoney ? 5 : 4);
  const books = searchBookshelfKnowledge(q || "", wantMoney ? 5 : 3);
  const frameworks = pickFrameworks(q || (wantMoney ? "opportunity cost" : ""));
  const conceptIds = conceptsMatchingQuery(q);

  const sources: string[] = [];
  if (bStats.total) sources.push(`shelf:${bStats.total}`);
  if (hStats.total) sources.push(`highlights:${hStats.total}`);
  if (highlights.length) sources.push(`hits:${highlights.length}`);
  for (const h of highlights.slice(0, 3)) {
    sources.push(`highlight:${h.title}`);
  }
  for (const f of frameworks) sources.push(`econ:${f.name}`);
  if (pins.length) sources.push(`pins:${pins.length}`);

  const sections: string[] = [];
  sections.push("EVIDENCE PACK (retrieved for this turn — prefer these facts)");
  sections.push(`Query: ${q || "(baseline)"}`);
  if (conceptIds.length) {
    sections.push(`Concepts matched: ${conceptIds.map(conceptLabel).join(", ")}`);
  }

  // Pins (always, short)
  if (pins.length) {
    sections.push("");
    sections.push("PINS");
    for (const p of pins.slice(0, 8)) {
      sections.push(`- ${p.slice(0, 120)}`);
    }
  }

  sections.push("");
  sections.push(shortBodySlice());

  // Highlights first (highest signal)
  sections.push("");
  sections.push(
    `HIGHLIGHTS (${highlights.length} of ${hStats.total} on shelf)`
  );
  if (highlights.length) {
    sections.push(formatHighlightHits(highlights, { maxEach: 180 }));
  } else {
    sections.push(
      hStats.total === 0
        ? "None saved yet. User can highlight while reading in Wonder."
        : "None matched this query. Try different words or open Bookshelf."
    );
  }

  // Books with concepts
  sections.push("");
  sections.push("SHELF HITS");
  if (books.length) {
    for (const b of books.slice(0, 4)) {
      const concepts = b.isEcon ? "econ" : "";
      sections.push(
        `• ${b.title} — ${b.author} [${b.status}${concepts ? ", " + concepts : ""}]`
      );
      if (b.noteSnippet) sections.push(`  note: ${b.noteSnippet.slice(0, 120)}`);
    }
  } else {
    sections.push(
      buildBookshelfKnowledgePack({
        maxChars: opts?.deepShelf ? 900 : 500,
        deep: false,
      })
        .split("\n")
        .slice(0, 12)
        .join("\n")
    );
  }

  // Frameworks (1–2 cards compressed)
  if (frameworks.length) {
    sections.push("");
    sections.push("FRAMEWORKS (original teaching — not book text)");
    for (const f of frameworks) {
      sections.push(`• ${f.name}: ${f.oneLine}`);
      if (f.founderMove) sections.push(`  move: ${f.founderMove}`);
      if (f.reading) sections.push(`  read pointer: ${f.reading}`);
    }
  }

  sections.push("");
  sections.push(
    "RULES: Cite highlight text only if present above. Never invent quotes. Prefer ledger numbers for her money. No em dashes."
  );

  let text = sections.join("\n");
  if (text.length > maxChars) {
    text = text.slice(0, maxChars - 20) + "\n…[pack truncated]";
  }

  return {
    query: q,
    builtAt: new Date().toISOString(),
    highlights,
    text,
    sources,
    stats: {
      shelfBooks: bStats.total,
      highlights: hStats.total,
      pins: pins.length,
    },
  };
}

/** Baseline pack for general live snapshot (no user query yet). */
export function buildBaselineEvidencePack(pageId?: string, pageTitle?: string): string {
  return buildEvidencePack("", {
    pageId,
    pageTitle,
    maxChars: 2800,
    deepShelf: /pg-finance|pg-library/i.test(pageId || ""),
  }).text;
}
