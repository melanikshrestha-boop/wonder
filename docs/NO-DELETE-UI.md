# NO-DELETE UI (Melani law — permanent)

**When you add something new, you do not delete something that was already there.**

This is not optional. Not “cleanup.” Not “we moved it.” Not “redundant now.”

## Absolute rule

1. **Additive only by default.** New controls, pages, imports, graphs = **add**. Existing labels, toggles, footers, import buttons, night lists stay.
2. **Never remove UI Melani has used** unless she **explicitly** says: delete / remove / get rid of / kill this.
3. **Moving is not deleting** — if you add a second path (e.g. quote **+** drop), the **old path stays** until she orders it gone.
4. **Refactoring storage is fine.** Refactoring away a button she still looks for is **not**.
5. If you’re unsure whether something is “hers”: **keep it.**

## Fitness / Sleep (known protect list)

Do **not** remove without explicit order:

| Surface | Location |
|---------|----------|
| **every night logged** toggle + night list | Sleep footer |
| Brain fog Yes/No + lifetime pie | Sleep |
| Whoop metric graphs (n = · latest · range) | Sleep body signals |
| Quote refresh 2/2 | Fitness header |
| Quote **+** Whoop drop | Fitness header — weekly CSV import (owner deleted “Import weekly data” text control 2026-08-01) |
| **BOWEL MOVEMENT** Yes/No + types + graphs | Meals — never strip |
| **PLATE** (Don't Die guide + cut-out bin) | Meals **bottom only** — reference/reminder, not daily chrome; never strip macros/usuals/bowel for it |
| **Cut-out law** | Trash bin items never planned/shopped/seeded; manual log → flag only (`foodGuide.ts`) |
| **TODAY'S MACROS** rings + stats | Meals |
| Usual meal cards (Breakfast …) | Meals |

Quote **+** is the Whoop import path. Do not remove bowel.

### Whoop + weekly cadence (silent)
- **+** is black while the 7-day window is open after a real CSV drop.
- After **7 days**, **+** turns **red + jumpy** (no reminder text).
- Dropping new weekly CSVs resets the clock (black again).
- Auto seed from `/whoop/latest` does **not** reset the + clock.
- Anchor key: `wonder-whoop-plus-week-anchor-v1`

## How agents work

- Before shipping a Fitness/Meals/Gym change: scan the diff for **deleted JSX** (`-` lines that remove buttons, footers, toggles).
- If the diff deletes UI and Melani did not ask to delete it → **put it back**, then ship the new thing beside it.
- Comments in code that say `PRESERVE` / `KEEP` are law for that control.
- Read this file at session start when touching Wonder UI.

## Why

Melani builds personal software she navigates by muscle memory. Silent deletes break trust and waste her time hunting for “where did that go.”

**Add. Don’t steal.**
