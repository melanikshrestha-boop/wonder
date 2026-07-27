/**
 * Book → concept graph (Intelligence V2 Phase A).
 *
 * Rule-based first: map known titles + categories to stable concept ids.
 * Same ids as econCanon / finance teach paths where possible so retrieval
 * and teaching share a vocabulary.
 *
 * No model call. No full-book text. Editable later (Phase C).
 */
import type { Book } from "./booksStore";

export type ConceptId = string;

export type ConceptDef = {
  id: ConceptId;
  label: string;
  aliases: string[];
};

/** Shared vocabulary Mel can retrieve and teach. */
export const CONCEPT_DEFS: ConceptDef[] = [
  { id: "opportunity-cost", label: "Opportunity cost", aliases: ["tradeoff", "trade-off", "forgone"] },
  { id: "incentives", label: "Incentives", aliases: ["incentive", "aligned", "principal agent"] },
  { id: "time-preference", label: "Time preference", aliases: ["patience", "delayed gratification", "present bias"] },
  { id: "wealth-behavior", label: "Wealth behavior", aliases: ["psychology of money", "room for error", "lifestyle creep"] },
  { id: "compounding", label: "Compounding", aliases: ["compound interest", "compound"] },
  { id: "attention-capital", label: "Attention as capital", aliases: ["deep work", "focus", "shallow work", "distraction"] },
  { id: "monopoly-secrets", label: "Monopoly and secrets", aliases: ["zero to one", "0 to 1", "competition"] },
  { id: "distribution", label: "Distribution", aliases: ["go to market", "sales", "channel"] },
  { id: "persuasion", label: "Persuasion", aliases: ["influence", "social proof", "reciprocity", "commitment"] },
  { id: "offers-pricing", label: "Offers and pricing", aliases: ["offer", "value equation", "pricing power"] },
  { id: "personal-finance-system", label: "Personal finance system", aliases: ["budget", "automate money", "i will teach you to be rich"] },
  { id: "capital-allocation", label: "Capital allocation", aliases: ["allocate capital", "reinvest", "deploy cash"] },
  { id: "expected-value", label: "Expected value", aliases: ["ev", "probability", "odds"] },
  { id: "scarcity-tradeoffs", label: "Scarcity and trade-offs", aliases: ["scarcity", "constraints"] },
  { id: "price-signals", label: "Price signals", aliases: ["price signal", "market price"] },
  { id: "elasticity", label: "Elasticity", aliases: ["price sensitive", "inelastic"] },
  { id: "sunk-cost", label: "Sunk cost discipline", aliases: ["sunk cost", "escalation"] },
  { id: "creative-destruction", label: "Creative destruction", aliases: ["disruption", "schumpeter"] },
  { id: "liquidity", label: "Liquidity vs return", aliases: ["runway", "cash buffer", "illiquid"] },
  { id: "real-vs-nominal", label: "Real vs nominal", aliases: ["inflation", "purchasing power"] },
  { id: "leverage-risk", label: "Leverage and risk", aliases: ["ruin", "risk of ruin", "asymmetry"] },
  { id: "storytelling", label: "Storytelling / TED", aliases: ["talk like ted", "presentation", "narrative"] },
  { id: "creator-business", label: "Creator / platform business", aliases: ["youtube", "audience", "influencer"] },
  { id: "biography-builder", label: "Builder biography", aliases: ["elon", "musk", "founder story"] },
];

const BY_ID = new Map(CONCEPT_DEFS.map((c) => [c.id, c]));

/** Exact / substring title → concepts (lowercase title keys). */
const TITLE_MAP: Array<{ match: RegExp; concepts: ConceptId[] }> = [
  {
    match: /psychology of money/i,
    concepts: ["wealth-behavior", "time-preference", "compounding", "opportunity-cost"],
  },
  {
    match: /zero to one/i,
    concepts: ["monopoly-secrets", "distribution", "creative-destruction"],
  },
  {
    match: /deep work/i,
    concepts: ["attention-capital", "opportunity-cost", "scarcity-tradeoffs"],
  },
  {
    match: /i will teach you to be rich/i,
    concepts: ["personal-finance-system", "compounding", "capital-allocation"],
  },
  {
    match: /^influence\b|influence:\s*the psychology/i,
    concepts: ["persuasion", "incentives"],
  },
  {
    match: /\$100m offers|100m offers|hundred million offers/i,
    concepts: ["offers-pricing", "distribution", "incentives"],
  },
  {
    match: /talk like ted/i,
    concepts: ["storytelling", "persuasion"],
  },
  {
    match: /youtube secrets/i,
    concepts: ["creator-business", "distribution"],
  },
  {
    match: /elon musk/i,
    concepts: ["biography-builder", "creative-destruction", "attention-capital"],
  },
  {
    match: /intelligent investor|security analysis/i,
    concepts: ["capital-allocation", "expected-value", "leverage-risk"],
  },
  {
    match: /thinking,? fast and slow/i,
    concepts: ["expected-value", "sunk-cost", "time-preference"],
  },
  {
    match: /basic economics|economics in one lesson|wealth of nations/i,
    concepts: ["scarcity-tradeoffs", "price-signals", "incentives", "opportunity-cost"],
  },
  {
    match: /rich dad|total money makeover|simple path to wealth/i,
    concepts: ["personal-finance-system", "compounding"],
  },
  {
    match: /atomic habits|habit/i,
    concepts: ["attention-capital", "incentives"],
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Concepts for one shelf book. */
export function conceptsForBook(book: Pick<Book, "title" | "author" | "category" | "description" | "notes">): ConceptId[] {
  const out = new Set<ConceptId>();
  const title = book.title || "";

  for (const row of TITLE_MAP) {
    if (row.match.test(title)) {
      for (const c of row.concepts) out.add(c);
    }
  }

  // Category heuristics (keep independent of bookKnowledge to avoid import cycles)
  if (
    book.category === "Business & Money" ||
    /\b(econom|invest|financ|money|wealth|market)\b/i.test(
      `${book.title} ${book.author || ""} ${book.description || ""}`
    )
  ) {
    out.add("opportunity-cost");
    out.add("capital-allocation");
  }
  if (book.category === "Psychology & Self-Development") {
    out.add("attention-capital");
  }
  if (book.category === "Technology & Innovation") {
    out.add("creative-destruction");
  }
  if (book.category === "Autobiography & Memoir" && /elon|jobs|musk|founder|builder/i.test(title + (book.author || ""))) {
    out.add("biography-builder");
  }

  // Notes may mention concepts explicitly
  const noteBlob = norm(`${book.notes || ""} ${book.description || ""}`);
  for (const def of CONCEPT_DEFS) {
    if (noteBlob.includes(norm(def.label))) out.add(def.id);
    for (const a of def.aliases) {
      if (a.length >= 4 && noteBlob.includes(norm(a))) out.add(def.id);
    }
  }

  return [...out];
}

export function conceptLabel(id: ConceptId): string {
  return BY_ID.get(id)?.label || id;
}

/** Resolve free text to concept ids (for search). */
export function conceptsMatchingQuery(query: string): ConceptId[] {
  const q = norm(query);
  if (!q) return [];
  const hits: ConceptId[] = [];
  for (const def of CONCEPT_DEFS) {
    if (q.includes(norm(def.id.replace(/-/g, " "))) || q.includes(norm(def.label))) {
      hits.push(def.id);
      continue;
    }
    if (def.aliases.some((a) => a.length >= 3 && q.includes(norm(a)))) {
      hits.push(def.id);
    }
  }
  return hits;
}

/** One-line shelf map for evidence packs. */
export function formatBookConceptsLine(book: Book): string {
  const ids = conceptsForBook(book);
  if (!ids.length) return "";
  return ids.map(conceptLabel).join(", ");
}
