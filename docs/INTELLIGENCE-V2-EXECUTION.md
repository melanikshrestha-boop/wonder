# Intelligence V2 — Execution Plan (authoritative)

**Status:** Phase A implemented in code (see bottom).  
**Supersedes:** soft brainstorm in `INTELLIGENCE-V2.md` for *what to build next*. That file stays as product vision; **this file is the eng contract.**

---

## 0. Problem with V1 (honest)

V1 is real but thin:

| Gap | Why it feels weak |
|---|---|
| Shelf is a **list dump** | Mel gets titles, not *retrieved* evidence for the question |
| Highlights sit in Bookshelf UI | Mel rarely sees the sentence you marked |
| Concepts are only a static econ canon | No link from *your* book to *a* concept |
| Context is **slice-and-hope** | `live_context.slice(0, 4500)` cuts the useful tail |
| No citation contract | Model can invent a quote; nothing checks |
| No compound memory | Chat evaporates; decisions are not objects |

V2 fixes density and proof, not “more system prompt cosplay.”

---

## 1. Non-negotiables

1. **V1 stays.** L0–L6 keep working offline for tools + body + ledger.  
2. **No full-book corpus.** Only: metadata, user notes, user highlights, original teaching text.  
3. **Citations must resolve.** If Mel cites a highlight, the id exists in the index.  
4. **Retrieve → then generate.** Never paste the entire shelf into every prompt.  
5. **No em/en dashes** in user-facing Mel strings.  
6. **Tests of truth:** typecheck + build green; tools return structured data.

---

## 2. Architecture (V2)

```
                    ┌─────────────────────┐
  User message ───► │ melAgent plan       │
                    │  (L1 tools first)   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        tool results    evidencePack()    optional L6 model
        (L1)            (L5.1 + L5.2 +     (Grok / local)
                         L2 slice + L4)
                               │
                               ▼
                         compose / cloud
```

### New modules

| Module | Path | Job |
|---|---|---|
| Concept map | `src/melani/bookConcepts.ts` | Map title/author/category → concept ids |
| Highlight index | `src/melani/highlightIndex.ts` | Flatten all quotes; search + score |
| Evidence pack | `src/melani/evidencePack.ts` | Ranked slots for one question |
| (existing) | `bookKnowledge.ts` | Shelf stats + brief (uses index) |
| (existing) | `econCanon.ts` | Framework teaching cards |

### Call graph

- `buildLiveContext` injects **compact evidence** via `buildEvidencePack("", { pageId })` for baseline, and tools can request deeper packs.  
- `cloudReply` / `financeMel` send **evidence pack + ledger**, not a 16k kitchen sink.  
- Tools: `search_highlights`, `bookshelf_knowledge` (upgraded), `econ_knowledge` (unchanged contract).

---

## 3. Data contracts

### 3.1 Concept id

Stable string ids shared with econ canon where possible:

`opportunity-cost` · `incentives` · `attention-capital` · `wealth-behavior` · `monopoly-secrets` · `compounding` · `distribution` · `persuasion` · `capital-allocation` · `time-preference` · …

### 3.2 HighlightHit

```ts
{
  quoteId: string
  bookId: string
  title: string
  author: string
  text: string
  note?: string
  interpretation?: string
  location?: string
  createdAt: number
  concepts: string[]
  score: number
}
```

### 3.3 EvidencePack

```ts
{
  query: string
  builtAt: string
  slots: {
    pins: string[]           // always
    body: string             // short L2
    money?: string           // only if finance page or money query
    highlights: HighlightHit[]  // max 5
    books: ShelfBookHit[]       // max 4
    frameworks: { id, name, oneLine }[]  // max 2
  }
  text: string  // ready for live_context
  sources: string[]  // for UI chips
}
```

**Caps (chars):** pins 600 · body 700 · money 900 · highlights 1400 · books 700 · frameworks 700 · **total pack ≤ 4500**.

---

## 4. Phases

### Phase A — Density + proof (THIS SHIP)

**Goal:** Every Mel/Finance money or teach turn gets the right highlights + concepts, not a title dump.

| # | Task | Done when |
|---|---|---|
| A1 | `bookConcepts.ts` rule map for known shelf titles + category heuristics | `conceptsForBook(book)` returns ids |
| A2 | `highlightIndex.ts` list + search | `searchHighlights("risk")` ranks real quotes |
| A3 | `evidencePack.ts` builder | `buildEvidencePack(q)` ≤ 4500 chars, stable sections |
| A4 | Upgrade `bookshelf_knowledge` / add `search_highlights` tools | Mel tool results include hits |
| A5 | `melAgent` routes: “my highlights”, “what did I highlight about X” | offline compose works |
| A6 | `melContext` uses evidence pack early in snapshot | not only full shelf dump |
| A7 | `financeMel` + local explain cite highlight sources | sources array includes `highlight: …` |
| A8 | Replace soft V2 doc claim with this contract + code | tsc + build green |

**Out of Phase A:** decisions log UI, weekly digest page, embeddings, chapter full-text imprint opt-in.

### Phase B — Compound memory + quant desk

| # | Task | Status |
|---|---|---|
| B1 | `decisionsStore.ts` — append-only decisions with revisitAt | **done** |
| B2 | Mel tools: `log_decision`, `list_decisions` | **done** |
| B3 | Weekly digest generator → Wonder page under Learn | pending |
| B4 | Cross-desk one-liners (body week × money week) | pending |
| B5 | `financeMathEngine.ts` quant path (NPV/IRR/BS/MC/σ/FI/…) | **done** |
| B6 | Copilot + Finance Mel: local math first, LLM explains | **done** |

### Phase C — Tutor + graph polish

| # | Task |
|---|---|
| C1 | User-editable concept tags on book detail |
| C2 | Quiz mode over last N highlights |
| C3 | Optional local embeddings (only if keyword search fails UX) |
| C4 | Chapter imprint → key sentences **opt-in only** |

---

## 5. Scoring (highlight search)

```
score =
  + 40 if query tokens in highlight text
  + 25 if in interpretation
  + 15 if in note
  + 20 if concept id matches query / alias
  + 10 if book title matches
  + 5  if book is econ-related
  + recency boost: min(10, ageDays inverse)
```

Minimum score to include: **12** when query non-empty; else recency list.

---

## 6. Mel routes (Phase A)

| User says | Tool |
|---|---|
| my highlights / what did I highlight | `search_highlights` (empty query = recent) |
| highlights about risk / incentives | `search_highlights(query)` |
| my bookshelf / what am I reading | `bookshelf_knowledge` |
| explain opportunity cost | `econ_knowledge` |
| search shelf for X | `bookshelf_knowledge` or highlights if “highlight” in text |

---

## 7. Finance Copilot (Phase A)

On teach questions:

1. `explainConcept` / econ framework as now  
2. `searchHighlights(conceptName)` top 2  
3. Append “Your highlight: …” only if hit  
4. `sources` includes `highlight: Book Title`

On Grok path: `buildFinanceLiveContext` includes `buildEvidencePack(question).text` instead of raw full shelf dump only.

---

## 8. Acceptance tests (manual + automated)

### Automated

- `npx tsc --noEmit` exit 0  
- `npm run build` exit 0  

### Manual (Wonder open)

1. Mel: `my highlights` → lists quotes or honest empty state  
2. Mel: `explain opportunity cost` → framework + shelf pointer if relevant  
3. Finances Copilot chips still show book counts  
4. Dark/light still load (no CSS regression from this work)

### Proof invariant

```
for each highlight citation in a tool result:
  exists book in loadBooks() with quote.id === citation.quoteId
```

---

## 9. File touch list (Phase A)

| File | Action |
|---|---|
| `src/melani/bookConcepts.ts` | **create** |
| `src/melani/highlightIndex.ts` | **create** |
| `src/melani/evidencePack.ts` | **create** |
| `src/melani/bookKnowledge.ts` | use concepts + index |
| `src/melani/melTools.ts` | `search_highlights` |
| `src/melani/melAgent.ts` | routes + compose |
| `src/melani/melContext.ts` | evidence pack inject |
| `src/melani/financeMel.ts` | evidence pack in context |
| `src/melani/financeExplain.ts` | highlight cites on teach |
| `docs/INTELLIGENCE-V2-EXECUTION.md` | this file |
| `docs/INTELLIGENCE-LEVELS.md` | pointer to V2 exec |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Empty highlights on shelf | Honest empty state; still return concepts + canon |
| Context still too large | Hard caps per slot; total ≤ 4500 |
| Over-matching concepts | Conservative title map; category heuristics secondary |
| Double shelf dump | Evidence pack **replaces** long shelf pack in finance; melContext short pack only |

---

## 11. Phase A completion log

| Item | Status |
|---|---|
| A1 `bookConcepts.ts` | **done** |
| A2 `highlightIndex.ts` | **done** |
| A3 `evidencePack.ts` | **done** |
| A4–A5 tools + Mel routes | **done** (`search_highlights`, `evidence_pack`) |
| A6 `melContext` baseline pack | **done** |
| A7 finance Mel + local explain cites | **done** |
| A8 tsc + build | **done** (green) |

**How to feel it:** Mel → `my highlights` · `explain opportunity cost` · Finances Copilot chips show `N highlights indexed`.

---

*Owner: Wonder / Mel intelligence. Next after Phase A: Phase B decisions log.*
