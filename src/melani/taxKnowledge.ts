/**
 * Complete IRS Publication 17 (2025) retrieval for Mel.
 *
 * The full 142-page corpus lives in public/knowledge/irs. Runtime prompts receive
 * only the strongest page-addressed excerpts for the current question.
 */

export type TaxKnowledgeChunk = {
  id: string;
  pdfPage: number;
  printedPage: number | null;
  text: string;
};

export type TaxKnowledgeCorpus = {
  schemaVersion: number;
  publication: string;
  taxYear: number;
  published: string;
  sourceUrl: string;
  localPdf: string;
  sha256: string;
  pageCount: number;
  printedPageCount: number;
  chunkCount: number;
  pages: { pdfPage: number; printedPage: number | null; text: string }[];
  chunks: TaxKnowledgeChunk[];
};

export type TaxKnowledgeHit = TaxKnowledgeChunk & {
  score: number;
  citation: string;
};

export type TaxEvidencePack = {
  text: string;
  sources: string[];
  hits: TaxKnowledgeHit[];
};

const CORPUS_URL = "/knowledge/irs/p17-2025-corpus.json";
const SOURCE_URL = "https://www.irs.gov/pub/irs-prior/p17--2025.pdf";
let corpusPromise: Promise<TaxKnowledgeCorpus> | null = null;

const STOP_WORDS = new Set(
  "a an and are as at be by can do for from had has have how i if in into is it its may my of on or our that the their this to was what when where which who will with your".split(
    " "
  )
);

const TAX_SIGNAL =
  /\b(tax|taxes|taxable|irs|1040|w-?2|1099|deduct|deduction|itemiz|refund|return|filing|file|withhold|quarterly|estimated payment|dependent|credit|ira|roth|capital gain|dividend|interest income|gift|self-employ|freelanc|schedule [a-z]|standard deduction|adjusted gross|agi)\b/i;

const EXPANSIONS: [RegExp, string][] = [
  [/\b(wage|salary|payroll|job|w-?2)\b/i, "wages salaries earnings withholding W-2"],
  [/\b(freelanc|gig|contract|self-employ|1099)\b/i, "self-employed business income estimated tax Schedule C 1099"],
  [/\b(child|kid|dependent)\b/i, "dependents qualifying child credit filing status"],
  [/\b(invest|stock|crypto|broker|capital gain)\b/i, "capital gains losses dividends digital assets 1099"],
  [/\b(ira|roth|retire)\b/i, "individual retirement arrangements IRA Roth contribution distribution"],
  [/\b(deduct|write.?off|expense)\b/i, "deduction standard itemized adjusted gross income Schedule A"],
  [/\b(gift|family support|zelle)\b/i, "gifts inheritances taxable income recipient"],
  [/\b(quarter|estimate|withhold)\b/i, "estimated tax withholding underpayment payments"],
];

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function expandedQuery(question: string): string {
  const additions = EXPANSIONS.filter(([pattern]) => pattern.test(question)).map(
    ([, words]) => words
  );
  return [question, ...additions].join(" ");
}

function citationFor(chunk: TaxKnowledgeChunk): string {
  return chunk.printedPage == null
    ? `IRS Publication 17 (2025), PDF p. ${chunk.pdfPage}`
    : `IRS Publication 17 (2025), p. ${chunk.printedPage} (PDF p. ${chunk.pdfPage})`;
}

export function isTaxKnowledgeQuestion(question: string): boolean {
  return TAX_SIGNAL.test(question);
}

export function searchTaxCorpus(
  corpus: TaxKnowledgeCorpus,
  question: string,
  limit = 6
): TaxKnowledgeHit[] {
  const query = expandedQuery(question);
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const phrase = question.toLowerCase().trim();

  const ranked = corpus.chunks
    .map((chunk) => {
      const haystack = chunk.text.toLowerCase();
      let score = phrase.length > 7 && haystack.includes(phrase) ? 18 : 0;
      let matched = 0;
      for (const term of terms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const count = (haystack.match(new RegExp(`\\b${escaped}\\b`, "g")) || [])
          .length;
        if (count) {
          matched += 1;
          score += Math.min(count, 5) * (term.length >= 8 ? 2.4 : 1.4);
        }
      }
      score += (matched / terms.length) * 12;
      return { ...chunk, score, citation: citationFor(chunk) };
    })
    .filter((hit) => hit.score >= 4)
    .sort((a, b) => b.score - a.score);

  const hits: TaxKnowledgeHit[] = [];
  const pages = new Set<number>();
  for (const hit of ranked) {
    if (pages.has(hit.pdfPage)) continue;
    hits.push(hit);
    pages.add(hit.pdfPage);
    if (hits.length >= limit) break;
  }
  return hits;
}

export async function loadTaxCorpus(): Promise<TaxKnowledgeCorpus> {
  if (!corpusPromise) {
    corpusPromise = fetch(CORPUS_URL).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Could not load IRS corpus (${response.status})`);
      }
      const corpus = (await response.json()) as TaxKnowledgeCorpus;
      if (corpus.pageCount !== 142 || corpus.taxYear !== 2025) {
        throw new Error("IRS corpus failed version/page validation");
      }
      return corpus;
    });
  }
  return corpusPromise;
}

export async function buildTaxEvidencePack(
  question: string,
  maxChars = 7200
): Promise<TaxEvidencePack> {
  if (!isTaxKnowledgeQuestion(question)) {
    return { text: "", sources: [], hits: [] };
  }
  try {
    const corpus = await loadTaxCorpus();
    const hits = searchTaxCorpus(corpus, question);
    let used = 0;
    const excerpts: string[] = [];
    const accepted: TaxKnowledgeHit[] = [];
    for (const hit of hits) {
      const block = `[${hit.citation}]\n${hit.text}`;
      if (accepted.length && used + block.length > maxChars) break;
      excerpts.push(block);
      accepted.push(hit);
      used += block.length;
    }
    if (!accepted.length) return { text: "", sources: [], hits: [] };
    return {
      text: [
        "IRS TAX EVIDENCE (authoritative source excerpts for tax year 2025)",
        "Cite the printed page for every material tax claim. Do not extend a rule beyond the quoted scope.",
        ...excerpts,
        `Canonical source: ${SOURCE_URL}`,
      ].join("\n\n"),
      sources: accepted.map((hit) => hit.citation),
      hits: accepted,
    };
  } catch {
    return { text: "", sources: [], hits: [] };
  }
}

