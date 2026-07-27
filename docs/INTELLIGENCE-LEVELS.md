# Levels of Intelligence — Wonder / Mel

How smart Mel (and Finance Copilot) actually is. Each level stacks on the one below. Higher levels never replace lower ones; they only add judgment when the lower levels are honest.

**V2 execution contract:** `docs/INTELLIGENCE-V2-EXECUTION.md` (Phase A shipping).  
**V2 product vision:** `docs/INTELLIGENCE-V2.md`.  
**Level 3 compound digest:** `docs/INTELLIGENCE-L3.md` + `src/melani/intelligenceL3.ts`.

No fluff. No cosplay. Empire-grade product brain.

---

## L0 — Reflex (instant, no tools)

**What it is:** Social glue only. Hi / thanks / short mood.

**Latency:** Instant  
**Source of truth:** Pattern match on the message  
**Never used for:** Numbers, money, health, books, workspace actions  

If a question needs a fact or a write, it is **not** L0.

---

## L1 — Hands (tools that change or read the app)

**What it is:** Deterministic tools. Mel’s hands, not her mouth.

Examples:

- Log water, sleep, bowel, breakfast, brain fog  
- Move pages, open Bookshelf, write body brief  
- Care draft / approve / send (with confirm where required)  
- Shopping / tasks / habits  

**Latency:** Sync (local) or short async  
**Source of truth:** `localStorage` + tool return  
**Rule:** Never claim “I logged X” unless a tool result says it happened  

This is the layer that makes Mel an **operator**, not a chatbot.

---

## L2 — Live body + day (Tier 1 snapshot)

**What it is:** What is true about *today* and the last 7 days, computed from the app.

Includes:

- Today vs goals (water, protein, calories, sleep)  
- Meals logged, supplements, gym week  
- Cycle phase / flow (when tracked)  
- Weekly rollup (avg water, meal days, migraine/sleep hits in life log)  
- Red flags (computed rules, not vibes)  
- Doctor-questions pack (clinic prep, not a diagnosis)  

**Source of truth:** Fitness, habits, cycle, labs keys Melani already uses  
**Rule:** Prefer L2 numbers over model memory. Never invent labs or sleep hours.

---

## L3 — Memory that is supposed to stick (Tier 2)

**What it is:** Facts that outlive a single day.

| Store | Purpose |
|---|---|
| **Pins** | Permanent truths (`pin no dairy after 6`) |
| **Life log** | Dated notes with tags (pain, sleep, food, …) |
| **Session memory** | This tab only (last topics / last reply) |
| **Goals** | Editable targets Mel measures against |
| **Page notes** | Free text on the open page |

**Rule:** Pins always win over casual chat. Life log is searchable evidence, not poetry.

---

## L4 — Domain desks (specialized brains)

Parallel expert packs. Each desk has its own ground truth.

| Desk | Ground truth | Offline brain |
|---|---|---|
| **Markets / World Monitor** | Quarterly packs, quotes when fetched | Trading knowledge (thesis, catalyst, invalidation, size, options intuition) |
| **Finance Copilot** | Ledger rows, categories, subscriptions, worth/cash/debt | Ledger query engine + scenarios + personal finance concepts (APR, compounding, runway…) |
| **Care** | Draft → approve → send pipeline | Never invents a confirmed appointment |
| **Wardrobe / Weather** | Inventory + real weather | Outfit ranking under constraints |
| **Health coaching** | Soft education only | No diagnosis |

**Rule:** A desk may not invent its own numbers. Markets desk does not invent EPS. Finance desk does not invent merchants.

---

## L5 — Shelf + economics canon (knowledge layer)

**What it is:** How Mel thinks about money, strategy, and “what you already study.”

### 5a — Your Bookshelf (live, private)

Fed every Mel / Finance turn:

- Titles, authors, category, status, progress  
- **Notes you wrote**  
- **Highlights / quotes you saved**  

**Your shelf right now includes economics/money-adjacent titles such as:**  
*The Psychology of Money*, *Zero to One*, *Deep Work*, *I Will Teach You to Be Rich*, *Influence*, *$100M Offers*, …

**Legal + product bar:**

- Never paste full book or EPUB body  
- Never invent a quote she did not save  
- Cite `title — author` when a framework matches a shelf book  

### 5b — Economics canon (built-in frameworks)

Original teaching cards (mechanisms, formulas, gotchas, founder moves), e.g.:

- Scarcity & trade-offs  
- Opportunity cost  
- Incentives / principal–agent  
- Marginal thinking  
- Supply & demand / price signals  
- Elasticity  
- Comparative advantage  
- Externalities  
- Adverse selection & moral hazard  
- Real vs nominal  
- Expected value  
- Capital allocation  
- Creative destruction  
- Liquidity vs return  
- Sunk-cost discipline  

`reading:` fields are **pointers** to real books, not summaries of their prose.

### How L5 answers a money question

1. Ledger numbers (L4 finance) if the question is about *her* money  
2. Her shelf notes/highlights if she annotated the idea  
3. Econ canon / finance concepts for the mechanism  
4. One next action  

---

## L6 — Language models (optional polish)

**What it is:** Grok (flagship, e.g. grok-4.5) or a local model for prose, research, and multi-step reasoning.

| Mode | When | Budget |
|---|---|---|
| **Offline local** | Tools + compose only | No network |
| **Local model** | Snapshot in system prompt | Bounded |
| **Grok connected** | Chat polish over live context + tool results | ~3.5s casual · larger on money/books pages |
| **Research** | Explicit research / look-up intents | Longer |

**Rules:**

- Tools run **before** the model answers  
- Model may not invent tool side effects  
- Live snapshot + shelf + econ pack are injected; trust those over “I recall…”  
- No em/en dashes in output  
- Not personalized financial or medical advice  

If the key is missing or the bridge times out, Wonder **falls back** to L1–L5. That is a feature, not a failure.

---

## How a request climbs the ladder

```
Message
  │
  ├─ L0 instant social? ──────────────────────► short reply
  │
  ├─ L1 plan tools (bowel, log, move, open…) ──► execute
  │
  ├─ L2/L3 attach live snapshot + pins/log
  │
  ├─ L4/L5 attach desk + shelf + econ if money/strategy
  │
  └─ L6 optional model polish ─────────────────► final reply
         (or pure L1–L5 compose if offline)
```

---

## What each level is optimized for

| Level | Optimizes for | Fails if… |
|---|---|---|
| L0 | Latency + warmth | Used for real work |
| L1 | Correct app state | Hallucinated actions |
| L2 | Today’s truth | Stale or invented vitals |
| L3 | Continuity | Forgotten pins / lost log |
| L4 | Domain correctness | Fake prices / fake ledger rows |
| L5 | Judgment + learning | Invented quotes / book dumps |
| L6 | Language + synthesis | Overrides L1–L5 facts |

---

## Product ambition (what “best version” means)

- **L1–L3 always work** with no API key (life OS never dies).  
- **L4 desks** feel like a real operator on money, markets, care, body.  
- **L5** makes Mel sound like she studied *your* shelf, not a generic syllabus.  
- **L6** is leverage on top, never the foundation.

---

## Commands that exercise L5

- `my bookshelf` / `what am I reading`  
- `my economics books`  
- `search shelf for inflation`  
- `explain opportunity cost` / `economics 101`  
- Finance Copilot: any teach or “what if” on top of the live ledger  

---

## Related code

| Piece | Path |
|---|---|
| Live snapshot (L2–L3 + L5 inject) | `src/melani/melContext.ts` |
| Tools (L1) | `src/melani/melTools.ts` |
| Planner / cloud (L1 + L6) | `src/melani/melAgent.ts` |
| Shelf feed (L5a) | `src/melani/bookKnowledge.ts` |
| Econ canon (L5b) | `src/melani/econCanon.ts` |
| Finance desk (L4 + L5) | `src/melani/financeMel.ts`, `financeCopilotEngine.ts`, `financeConcepts.ts` |
| Runtime budget | `src/melani/core/agentRuntime.ts` |
| Bridge system prompt | `server/melani_ai.py` |

---

*Last aligned with the bookshelf + economics brain ship. Update this file when a new desk or memory store is added.*
