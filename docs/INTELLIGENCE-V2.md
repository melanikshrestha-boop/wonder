# Intelligence Version 2 — What Comes After V1

**V1 is shipping now.** L0–L6 work: tools, live body, pins/log, desks, bookshelf metadata + highlights, economics canon, optional Grok polish.

**V2 keeps every level of V1** and makes Mel *compound* — she does not only answer; she builds a private model of Melani over time, grounded in ledger + shelf + body + markets, without ever becoming a black box that invents facts.

This is the product plan for “best version,” not a rewrite.

---

## North star for V2

> Melani asks once. Mel answers with: **her numbers** · **her shelf evidence** · **a framework** · **one move** · **and a memory she can open later.**

V1 is a smart operator with books on the desk.  
V2 is a **personal research OS** that gets sharper the more she lives inside Wonder.

---

## What V1 already is (do not delete)

| Level | V1 status |
|---|---|
| L0 Reflex | Done |
| L1 Hands | Done (tools) |
| L2 Live body | Done (snapshot + red flags) |
| L3 Sticky memory | Done (pins, life log, session) |
| L4 Desks | Done (finance, markets, care, …) |
| L5 Shelf + econ canon | Done (titles/notes/highlights + frameworks) |
| L6 Models | Done (Grok / local / research path) |

V2 = **L5+ and L7**, plus upgrades inside L1–L4 that feed them.

---

## Version 2 — new and upgraded layers

### L5.1 — Concept graph (auto-tag the shelf)

**V1:** Mel knows titles and any notes you typed.  
**V2:** Every shelf book is tagged with **teachable concepts** Mel already understands.

Examples (computed, not manual busywork):

| Book on shelf | Auto concepts |
|---|---|
| *Psychology of Money* | time preference, wealth vs income, room for error |
| *Zero to One* | monopoly, secrets, 0→1 vs 1→n, distribution |
| *Deep Work* | attention as capital, opportunity cost of shallow work |
| *Influence* | reciprocity, social proof, commitment |

**How:** keyword + category rules first; optional model pass once per book when online; store tags on the `Book` record.

**Why it wins:** Mel can say *“this is opportunity cost — you already own Psychology of Money for this”* even if you never wrote a note.

**Ship order:** rule-based tags → user can edit tags → optional AI propose tags.

---

### L5.2 — Highlight graph (your sentences become a retrieval index)

**V1:** Highlights exist on the book and get dumped into context if short.  
**V2:** Highlights are a **searchable memory layer**.

For each highlight store:

- text (you selected it — your data)  
- book + author  
- location / CFI  
- your interpretation (optional)  
- auto concepts (from L5.1)  
- createdAt  

**Query path:**

1. User asks something  
2. Retrieve top K highlights by keyword / concept / recency  
3. Inject only those K into Mel (not the whole shelf)  
4. Answer cites: quote · book · page/location · your note  

**Legal bar stays:** only text **you** highlighted or noted. No full EPUB corpus dump into the model.

**You already have hooks:** `BookQuote`, reader CFI, chapter imprint plain-text helpers. V2 wires them into Mel retrieval instead of leaving them on the shelf UI only.

---

### L5.3 — “Teach from my shelf” mode

A first-class Mel / Finance mode:

- **Explain X using only my shelf + ledger**  
- **Quiz me on my last 10 highlights**  
- **What did I mark about risk / incentives / focus?**  

Not a courseware product. A private tutor over **her** annotations.

Offline: keyword match over highlights + econ canon.  
Online: Grok synthesizes, but citations must resolve to real highlight IDs.

---

### L6.1 — Retrieval before generation (always)

**V1:** Stuff a big snapshot into the prompt (size-capped).  
**V2:** **Retrieve → then generate.**

Every Mel turn builds a small **evidence pack**:

| Slot | Source | Cap |
|---|---|---|
| Body | L2 today + red flags | ~800 chars |
| Money | ledger rollup + top leaks | ~1.2k |
| Shelf hits | L5.2 highlights + L5.1 tags | ~1.5k |
| Canon | 1–2 frameworks only | ~800 chars |
| Pins | always | full pins |
| Tools | results of this turn | as now |

**Change:** less “paste the world,” more “paste the right 2 pages.”  
Same models, much better intelligence density. Faster. Cheaper. Fewer hallucinations.

---

### L7 — Compound memory (new level)

**The big V2 addition.** A durable layer above L3 that is not a chat log.

#### 7a — Decisions log

When Mel helps choose something, she can save:

- date  
- question  
- options  
- choice  
- assumed numbers  
- revisit date  

Example: *“Keep Grok at $30/mo for 90 days; kill if unused weeks > 3.”*

Query later: *“what did I decide about AI subs?”*

#### 7b — World model cards

Short structured cards Mel maintains (user can edit/delete):

- **Business:** what Melani is building this quarter  
- **Money rules:** cash floor, max burn, no BNPL, etc.  
- **Health non-negotiables:** sleep target, bowel daily, …  
- **Content / company:** open bets  

Unlike pins (atomic facts), cards are **living paragraphs with fields**.

#### 7c — Weekly intelligence digest

Sunday (or on demand): one page Mel writes from L2+L4+L5:

- body: sleep / fog / bowel / protein trend  
- money: net, top leak, sub burn  
- mind: highlights added, concepts touched  
- markets: only if she opened World Monitor  
- **one priority for next week**

Stored in Wonder as a page or note, not a throwaway chat bubble.

---

### L4 upgrades (desks get cross-wired)

V1 desks are silos. V2 desks **call each other with typed facts**.

| Cross-wire | Example |
|---|---|
| Finance ↔ Shelf | “Your dining out is up; *Psychology of Money* highlight on lifestyle creep applies.” |
| Body ↔ Finance | “Low sleep 3 nights + high DoorDash — same week.” |
| Markets ↔ Finance | “Sub burn vs cash runway months.” |
| Care ↔ Body | “Visit prep pulls life log + labs + open questions.” |

Still no invented numbers. Only linked **citations**.

---

### L2 upgrades — predictive, not only descriptive

**V1:** “You slept 5.5h.”  
**V2:** light forecasts with confidence:

- “If bedtime stays after 1am, fog probability rises (based on *your* last N days).”  
- “Bowel No streak = 2; flag at 3.”  

Rules first. Models optional. Always show the basis.

---

### L1 upgrades — multi-step plans with proof

**V1:** one-shot tools.  
**V2:** short plans Mel can run and show a receipt:

1. Log water 500  
2. Open Fitness  
3. Pin “hydrate before coffee”  

User sees a checklist of **done / failed**. Undo still works per domain.

---

### L6 upgrades — model routing

| Job | Model path |
|---|---|
| Tool plan + compose | local / offline (free, fast) |
| Finance prose on ledger | Grok flagship + ledger snapshot |
| Research / markets narrative | research path + sources |
| Vision (meal photo, receipt) | vision model when key present |
| Embeddings for highlights (optional) | local or small API, **on-device preferred** |

V2 default: **local retrieval + cloud only for language.** Empire reliability: Wonder works on a plane.

---

## What V2 deliberately does *not* do

- Does **not** pirate or embed entire commercial books into a vector DB by default  
- Does **not** replace human clinicians or give personalized financial advice as authority  
- Does **not** make Mel chatty; higher intelligence means **shorter, more cited answers**  
- Does **not** require a rewrite of L0–L6 — only additive modules

---

## Concrete V2 ship sequence (build order)

### Phase A — Intelligence density (1–2 weeks of focused work)

1. **Highlight index** — all quotes searchable by Mel (`search_highlights`)  
2. **Retrieve pack** — replace “slice 4500 of snapshot” with ranked evidence slots  
3. **Concept auto-tags** on Business & Money books (rules)  
4. Finance Copilot cites shelf hits in local explain path (already half there)

*Win: Mel feels like she read your highlights without new hardware.*

### Phase B — Compound memory (next)

5. **Decisions log** tool + UI in Mel or Finances  
6. **Weekly digest** page generator  
7. Cross-desk one-liners (body ↔ money, shelf ↔ finance)

*Win: Mel remembers choices, not just chats.*

### Phase C — Graph & tutor (after A+B feel solid)

8. Editable concept tags on each book  
9. “Quiz me from my highlights”  
10. Optional local embeddings for fuzzy highlight search  
11. Chapter imprint → key sentences **only when user opts in per chapter**

*Win: private tutor over her own reading life.*

---

## New levels diagram (V2)

```
L0  Reflex
L1  Hands (+ multi-step receipts)
L2  Live body (+ light forecasts)
L3  Sticky memory (pins, log, session)
L4  Desks (+ cross-citations)
L5  Shelf metadata + econ canon          ← V1
L5.1 Concept graph on books              ← V2
L5.2 Highlight retrieval index           ← V2
L5.3 Teach / quiz from shelf             ← V2
L6  Models (+ routing, denser context)
L6.1 Retrieve-then-generate              ← V2
L7  Compound memory (decisions, cards, weekly digest)  ← V2 NEW
```

---

## Success metrics (how you know V2 is real)

| Metric | Target |
|---|---|
| Answer cites a **real** highlight or ledger row when relevant | >70% of money/teach answers |
| Mel works offline for L1–L5.2 | Always |
| Weekly digest opened or acted on | ≥1× / week when she is active |
| “Invented quote” rate | Zero (automated test: citation must resolve) |
| Time to first useful money answer | Faster than V1 (smaller, better context) |

---

## Relationship to empire product

Wonder V1 intelligence = **personal OS with a sharp agent.**  
Wonder V2 intelligence = **personal OS that compounds learning and capital decisions.**

That is the wedge against generic ChatGPT:  
not a bigger model — a **tighter loop** between her life data, her reading, and her next move.

---

## Open decisions (for Melani to call)

1. **Embeddings:** on-device only vs cloud? (Default recommendation: on-device / none until Phase C)  
2. **Weekly digest:** auto-create a Wonder page vs Mel chat only? (Recommend: real page under Learn)  
3. **Chapter opt-in:** imprint key sentences only after explicit “imprint this chapter”? (Recommend: yes)  
4. **Decisions log location:** Finances desk vs Mel global? (Recommend: global Mel, tagged `money` / `body` / `build`)

---

## Bottom line

| Version | One sentence |
|---|---|
| **V1** | Mel operates the app, sees today, knows your book list, teaches with a canon, polishes with Grok. |
| **V2** | Mel retrieves *your* highlights and decisions, tags concepts to your shelf, cross-links desks, and compounds a private world model every week. |

V2 does not throw V1 away. It makes every answer **shorter, more cited, and more personal** — the kind of intelligence incumbents cannot copy without *her* data.

---

*Companion to `docs/INTELLIGENCE-LEVELS.md` (V1). Update both when a phase ships.*
