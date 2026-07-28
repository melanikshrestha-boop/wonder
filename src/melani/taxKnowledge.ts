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
  unavailableReason?: string;
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
  /\b(tax(?:es|able)?|irs|1040|w-?2|1099|deduct(?:ion|ible)?|itemiz(?:e|ed|ing|ation)|refund|tax return|filing status|file taxes|withhold(?:ing)?|quarterly|estimated (?:tax|payment)|safe harbor|dependent|qualifying child|tax credit|child tax credit|earned income credit|ira|roth|capital gains?|qualified dividends?|dividends?|interest income|student loan interest|gift|inheritance|bequest|self[- ]employ(?:ed|ment)?|freelanc(?:e|er|ing)?|scholarships?|fellowships?|schedule [a-z]|standard deduction|adjusted gross income|agi)\b/i;

const EXPANSIONS: [RegExp, string][] = [
  [/\b(wage|salary|payroll|job|w-?2)\b/i, "wages salaries earnings withholding W-2"],
  [/\b(freelanc|gig|contract|self-employ|1099)\b/i, "self-employed business income estimated tax Schedule C 1099"],
  [/\b(child|kid|dependent)\b/i, "dependents qualifying child credit filing status"],
  [/\b(invest|stock|crypto|broker|capital gains?)\b/i, "capital gains losses dividends digital assets 1099"],
  [/\b(ira|roth|retire)\b/i, "individual retirement arrangements IRA Roth contribution distribution"],
  [/\b(deduct|write.?off|expense)\b/i, "deduction standard itemized adjusted gross income Schedule A"],
  [/\b(gift|family support|zelle)\b/i, "gifts inheritances taxable income recipient"],
  [/\b(quarter|estimate|withhold)\b/i, "estimated tax withholding underpayment payments"],
  [
    /\bstandard deduction\b/i,
    "standard deduction amount increased single married head household Table 10-1 15750",
  ],
  [
    /\bestimated tax|safe harbor|quarterly payment\b/i,
    "general rule 90% current year tax 100% prior year tax withholding refundable credits 1000",
  ],
  [
    /\bgift|inheritance|bequest\b/i,
    "gifts and inheritances property receive gift bequest inheritance not included income",
  ],
  [
    /\b(?:capital gains?|qualified dividends?|schedule d)\b/i,
    "net capital gain qualified dividends Schedule D Tax Worksheet Pub 550 special methods",
  ],
  [
    /\b(?:scholarships?|fellowships?)\b/i,
    "qualified scholarship fellowship tuition fees books supplies equipment room board",
  ],
  [
    /\bstudent loan interest\b/i,
    "student loan interest deduction Schedule 1 line 21 Pub 970",
  ],
];

type RetrievalIntent = {
  pattern: RegExp;
  anchors: string[];
  preferredPrintedPages: number[];
};

/**
 * Publication 17 is version-pinned, so these page priors are stable and
 * auditable. They keep examples and the back-of-book index from outranking the
 * actual rule page when many chunks repeat the same tax vocabulary.
 */
const RETRIEVAL_INTENTS: RetrievalIntent[] = [
  {
    pattern: /\bstandard deduction\b/i,
    anchors: ["standard deduction amount increased", "table 10-1"],
    preferredPrintedPages: [1, 92, 93, 94, 95],
  },
  {
    pattern: /\bestimated tax|safe harbor|quarterly payment\b/i,
    anchors: ["general rule", "90% of the tax", "estimated tax"],
    preferredPrintedPages: [37, 38, 39, 40, 41, 42],
  },
  {
    pattern: /\bgift|inheritance|bequest\b/i,
    anchors: ["gifts and inheritances", "isn't included in your income"],
    preferredPrintedPages: [76],
  },
  {
    pattern: /\b(?:capital gains?|qualified dividends?|schedule d)\b/i,
    anchors: ["net capital gain", "qualified dividends", "schedule d"],
    preferredPrintedPages: [76, 77, 106, 123],
  },
  {
    pattern: /\b(?:scholarships?|fellowships?)\b/i,
    anchors: ["scholarships and fellowships", "qualified scholarship"],
    preferredPrintedPages: [77],
  },
  {
    pattern: /\bstudent loan interest\b/i,
    anchors: ["student loan interest deduction", "schedule 1"],
    preferredPrintedPages: [23, 81, 82, 89],
  },
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
  const intents = RETRIEVAL_INTENTS.filter((intent) =>
    intent.pattern.test(question)
  );
  const documentCount = corpus.chunks.length;
  const documentFrequency = new Map<string, number>();
  for (const term of terms) {
    let frequency = 0;
    const pattern = new RegExp(
      `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    for (const chunk of corpus.chunks) {
      if (pattern.test(chunk.text)) frequency += 1;
    }
    documentFrequency.set(term, frequency);
  }

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
          const frequency = documentFrequency.get(term) || 0;
          const inverseFrequency =
            Math.log((documentCount + 1) / (frequency + 1)) + 1;
          score +=
            Math.min(Math.sqrt(count), 2.25) *
            inverseFrequency *
            (term.length >= 8 ? 2.2 : 1.3);
        }
      }
      score += (matched / terms.length) * 12;
      for (const intent of intents) {
        const anchorMatches = intent.anchors.filter((anchor) =>
          haystack.includes(anchor)
        ).length;
        score += anchorMatches * 18;
        if (
          chunk.printedPage != null &&
          intent.preferredPrintedPages.includes(chunk.printedPage)
        ) {
          score += 14;
        }
      }
      // Index chunks repeat many terms without explaining the rule.
      if (chunk.printedPage != null && chunk.printedPage >= 126) score -= 18;
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
    corpusPromise = fetch(CORPUS_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load IRS corpus (${response.status})`);
        }
        const corpus = (await response.json()) as TaxKnowledgeCorpus;
        if (corpus.pageCount !== 142 || corpus.taxYear !== 2025) {
          throw new Error("IRS corpus failed version/page validation");
        }
        return corpus;
      })
      .catch((error: unknown) => {
        // A transient first-load failure must not disable IRS retrieval for the
        // rest of the browser session.
        corpusPromise = null;
        throw error;
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
    const prefix = [
      "IRS TAX EVIDENCE (authoritative source excerpts for tax year 2025)",
      "Cite the printed page for every material tax claim. Do not extend a rule beyond the quoted scope.",
    ].join("\n\n");
    const suffix = `\n\nCanonical source: ${SOURCE_URL}`;
    if (maxChars < prefix.length + suffix.length) {
      return { text: "", sources: [], hits: [] };
    }

    let text = prefix;
    const accepted: TaxKnowledgeHit[] = [];
    for (const hit of hits) {
      const separator = "\n\n";
      const citation = `[${hit.citation}]\n`;
      const available =
        maxChars - text.length - suffix.length - separator.length;
      if (available <= citation.length + 1) break;
      const textBudget = available - citation.length;
      const excerpt =
        hit.text.length <= textBudget
          ? hit.text
          : `${hit.text.slice(0, Math.max(0, textBudget - 1)).trimEnd()}…`;
      if (!excerpt) break;
      text += `${separator}${citation}${excerpt}`;
      accepted.push({ ...hit, text: excerpt });
      if (excerpt.length < hit.text.length) break;
    }
    if (!accepted.length) return { text: "", sources: [], hits: [] };
    return {
      text: `${text}${suffix}`,
      sources: accepted.map((hit) => hit.citation),
      hits: accepted,
    };
  } catch {
    const unavailableReason =
      "IRS Publication 17 evidence is temporarily unavailable. Do not present an uncited tax answer as authoritative.";
    return {
      text: unavailableReason.slice(0, Math.max(0, maxChars)),
      sources: [],
      hits: [],
      unavailableReason,
    };
  }
}
