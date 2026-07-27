import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const corpusPath = resolve(
  here,
  "../public/knowledge/irs/p17-2025-corpus.json"
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const { isTaxKnowledgeQuestion, searchTaxCorpus } = await import(
  "../src/melani/taxKnowledge.ts"
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(corpus.pageCount === 142, "expected all 142 PDF pages");
assert(corpus.printedPageCount === 140, "expected all 140 printed pages");
assert(corpus.pages.length === 142, "page array is incomplete");
assert(corpus.pages.every((page: { text: string }) => page.text.length > 0), "empty page text");
assert(corpus.chunks.length === corpus.chunkCount, "chunk count mismatch");
assert(
  corpus.sha256 ===
    "2d2381d62c7c77ed4b64b83ac23c28ed85b7c8304eb580c09bd9fd660be0840b",
  "source PDF checksum mismatch"
);
assert(isTaxKnowledgeQuestion("Can I deduct IRA contributions?"), "tax router miss");
assert(!isTaxKnowledgeQuestion("chart my coffee spending"), "tax router false positive");

const ira = searchTaxCorpus(corpus, "traditional IRA deduction phaseout");
assert(ira.length > 0, "IRA retrieval returned no evidence");
assert(
  ira.some((hit) => /traditional IRA|individual retirement/i.test(hit.text)),
  "IRA retrieval missed the relevant source"
);

const dependents = searchTaxCorpus(corpus, "who qualifies as my dependent child?");
assert(dependents.length > 0, "dependent retrieval returned no evidence");
assert(
  dependents.some((hit) => /qualifying child|dependent/i.test(hit.text)),
  "dependent retrieval missed the relevant source"
);

console.log(
  `IRS Publication 17 corpus verified: ${corpus.pageCount} pages, ${corpus.chunkCount} chunks`
);
