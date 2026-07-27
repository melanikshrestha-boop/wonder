# Intelligence Level 3 — Compound OS

**V1** = operator (tools + live body + desks)  
**V2** = retrieve + quant math + decisions log + shelf concepts  
**L3** = **compound intelligence**: one system that sees body × money × decisions × shelf across a week and outputs a **single priority** with proof

L3 does not replace V1/V2. It **reads** them and **writes** a digest Mel can open on demand.

---

## What Level 3 is

| Piece | Job |
|---|---|
| **Weekly intelligence digest** | Last 7 local days: sleep, fog, bowel, water, spend, top leak, highlights count, decisions due |
| **Cross-desk links** | Explicit if-then lines (e.g. low sleep days + high delivery spend) |
| **Decision revisits** | Decisions past `revisitAt` surface as due |
| **One priority** | Single next move ranked by severity × fixability |
| **Mel command** | `weekly digest` / `level 3` / `compound brief` |

---

## What Level 3 is not

- Not another chat persona  
- Not medical diagnosis  
- Not “AI vibes about your week” without numbers  
- Not auto-email or spam notifications (on-demand first)

---

## Acceptance

1. `weekly digest` returns structured text with body + money + due decisions + priority  
2. Works offline (localStorage only)  
3. Empty ledger / empty body → honest partial digest  
4. tsc + build green  

---

## Code

- `src/melani/intelligenceL3.ts` — engine  
- Mel tools: `weekly_intelligence_digest`, `list_due_decisions`  
- Extends `decisionsStore` with `dueDecisions()`
