# Mel Finance: accounting-grade architecture

Mel Finance is not a chat UI with a large prompt. It is a layered personal
accounting system in which the model explains and investigates while code owns
the books and arithmetic.

## 1. System of record

The ledger is the source of truth. Imported bank and card rows retain source,
account, date, merchant, amount, import fingerprint, and reconciliation state.
Transfers must be paired so they do not become income or expense. Journal
entries must balance before they affect statements.

Required controls:

- amounts stored and summed in integer cents;
- immutable source row plus a separate classification/audit history;
- duplicate detection by institution ID and normalized fingerprint;
- month-end reconciliation against statement ending balances;
- explicit opening balances and account ownership;
- no inferred category silently treated as confirmed;
- close status for every month, with reopen history.

## 2. Deterministic accounting engines

Code, not the language model, calculates:

- journal and general ledger;
- trial balance;
- profit and loss;
- balance sheet;
- cash-flow statement;
- net-worth roll-forward;
- receivables and payables;
- depreciation and basis schedules when those modules are added;
- federal tax worksheets and bracket calculations by tax year;
- reconciliation differences and data-quality checks.

Every result should be reproducible from named rows and parameters. Mel may
explain a result, but cannot replace or silently override the calculation.

## 3. Versioned tax authority

The complete IRS Publication 17 (2025) is stored at:

- `/knowledge/irs/p17-2025.pdf`
- `/knowledge/irs/p17-2025-corpus.json`

The corpus contains all 142 PDF pages, all 140 printed pages, and 715 retrieval
chunks. The source is verified by SHA-256 before extraction. Every chunk retains
both the PDF page and printed page so an answer can cite the original.

Publication 17 is one authority, not the whole tax code. Tax-year answers may
also require the current Form 1040 instructions, schedule instructions, topic-
specific publications, Treasury regulations, state rules, or newer IRS
developments. Sources must be versioned by tax year and effective date.

Rebuild the corpus with the bundled Python environment:

```bash
python3 scripts/build-irs-p17-corpus.py
npm run test:tax
```

## 4. Retrieval and reasoning

For each tax question:

1. classify the question and requested tax year;
2. retrieve the most relevant page-addressed IRS passages;
3. assemble ledger facts separately from user-provided facts;
4. identify missing facts before reaching a personal conclusion;
5. run deterministic calculations where a worksheet exists;
6. have Mel explain the rule, calculation, uncertainty, and next document;
7. return citations and a source trail with the answer.

The full book remains available locally. Only the relevant excerpts enter a
single model request, which reduces hallucination and keeps the context focused.

## 5. Personal tax profile

Mel needs a dated tax profile rather than guessing from transactions:

- filing status and state residency;
- age, citizenship/residency, and dependent facts;
- W-2, 1099, K-1, 1098, and brokerage forms received;
- self-employment activities and business-use evidence;
- estimated payments and withholding;
- retirement contributions and distributions;
- capital-asset basis and holding periods;
- health coverage, education, and other credit facts;
- prior-year carryovers and notices.

Unknown values stay unknown. A bank deposit is not automatically wages, a gift,
or taxable business income.

## 6. Daily operating loop

Daily: import, deduplicate, classify, attach evidence, and flag anomalies.

Weekly: review uncategorized rows, reimbursements, transfers, subscriptions,
receipts, and business-purpose notes.

Monthly: reconcile every account, lock the period, produce statements, review
variance and cash runway, and preserve a close package.

Quarterly: estimate tax from confirmed year-to-date facts, compare safe-harbor
options, record payments, and forecast cash requirements.

Annually: ingest source forms, reconcile them to the ledger, run form-specific
worksheets, and produce a filing evidence package. Filing remains a deliberate
user action, never an automatic chat side effect.

## 7. Safety and auditability

Finance and health data belong in a private repository or local encrypted data
store. Public deployment should contain code only and obtain personal records
from a private local or authenticated backend.

Every material answer should show:

- data period and tax year;
- source rows or statement scope;
- formula and inputs;
- IRS source and page;
- assumptions and missing facts;
- confidence/review status;
- the next concrete action.

