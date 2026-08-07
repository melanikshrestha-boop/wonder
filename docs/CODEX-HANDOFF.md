# Codex handoff — Wonder + Systems

**Date context:** 2026-08 (Melani / founder track)  
**Purpose:** Open Wonder correctly and continue building **systems** in-app.

---

## 60-second boot

```bash
cd ~/wonder
git pull origin main
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5173/
# if not 200:
#   npm run wonder:install   # preferred KeepAlive
#   # or: npm run dev
```

Open: **http://127.0.0.1:5173/** (Safari). Never `localhost:5173`.

Read:

1. `CODEX.md` (root)  
2. `AGENTS.md`  
3. `docs/SYSTEMS.md` ← **what to build**  
4. `docs/SELENE-UI.md`  

---

## Product snapshot

| | |
|--|--|
| Name | **Wonder** (not Dr. Melani) |
| Role | Personal OS: meals, fitness, finances, care, books, wardrobe, Mel coach |
| Stack | Vite + React + TS · localStorage heavy · private GitHub |
| UI law | **Selene** — no dividers, no boxes, no default helper blurbs |
| Data law | Merge-only health/finance stores; never wipe meals/bowel/habits |

### Related (separate windows)

- **Lunara Glow** salon books: `~/lunar-glow` · `http://127.0.0.1:5191/`  
  - Day import: drop Square **transactions CSV** on `+` next to Fixed  
  - Aug 7 already seeded from real tickets (Net $245, 8 payments)  
- **Lens:** `~/Projects/lens` / `~/Projects/LensOSS` — company product  

---

## Active mission: Systems

Melani’s framing (lock this):

> Motivation is one day. Systems are days → weeks → years.  
> Systems that **work for her** = trigger + minimum + receipt + miss recovery.

**Implement v1** from `docs/SYSTEMS.md`:

1. **Systems** desk/surface in Wonder  
2. **Three doors:** Company ship · Money close · Wonder open  
3. Today done-state + local persistence  
4. Selene density — no chrome fluff  

Do **not** build a second habit product full of streaks unless she asks.

---

## Recent git (already on main)

Wonder was pushed with meals/shop/fitness, finance charts, care, desk error boundary, water/diet helpers. Pull before coding.

Lunara Glow finances (separate repo `lunara-glow-finances`) has Square import + Aug 7 CSV — money-close door should **link** there, not reimplement P&L in Wonder.

---

## Paste into Codex (first turn)

```
Workspace: ~/wonder

1. git pull origin main
2. Ensure http://127.0.0.1:5173/ returns 200 (keeper or npm run dev)
3. Read CODEX.md, AGENTS.md, docs/SYSTEMS.md, docs/SELENE-UI.md, docs/NO-DELETE-UI.md
4. Implement Systems v1: three doors (company ship, money close → Lunara :5191, Wonder open), today checkmarks, localStorage merge-only store
5. Do not add dividers/boxes/marketing blurbs
6. Do not delete existing nav desks
7. Smoke in browser at 127.0.0.1:5173
8. Commit + push main with a clear why message

Melani will keep adding systems via the card template in docs/SYSTEMS.md — leave extension points.
```

---

## How Melani will work with you

- She codes in Codex for Wonder systems; Grok/Claude may touch sister apps  
- **Push main** so handoffs don’t desync  
- If she says “systems,” open `docs/SYSTEMS.md` and ship product — short status, not a lecture  

---

## Done when (v1)

- [ ] Systems entry exists in Wonder nav / views  
- [ ] Three doors visible for **today**  
- [ ] Can mark done / undo; survives reload  
- [ ] Money close points at Lunara 5191  
- [ ] Selene clean; no deleted desks  
- [ ] On GitHub `main`  
