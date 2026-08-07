# Codex — open Wonder and keep shipping

**Melani owns this machine.** You are Codex coding in **Wonder**.

## Open this (do first)

```bash
cd ~/wonder
# Prefer always-on keeper; only start dev if 5173 is dead:
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ || npm run dev
```

**App URL (exact):** [http://127.0.0.1:5173/](http://127.0.0.1:5173/)  
Use **127.0.0.1**, never `localhost` (different storage origin — empty app).  
Open in **Safari** when she dogfoods.

**Repo:** `https://github.com/melanikshrestha-boop/wonder` · branch **`main`**

## Read before you edit

| File | Why |
|------|-----|
| `AGENTS.md` | Standing product rules |
| `docs/SELENE-UI.md` | No dividers / boxes / marketing blurbs |
| `docs/NO-DELETE-UI.md` | Additive UI only |
| `docs/SYSTEMS.md` | **Active build:** systems for consistency |
| `docs/CODEX-HANDOFF.md` | Full context + current mission |

## Ship law

After every meaningful slice: **commit + push `main`**.  
Other agents (Grok / Claude) pick up from GitHub — unpushed work is lost.

## Who Melani is (do not invent)

- Founder / computer engineer building **her own company** — not premed, not “cute homework.”
- Worlds: **Wonder** (personal OS), **LensOSS/Lens** (company product), **Lunara Glow** (salon books at `~/lunar-glow`), Dream Life.
- Systems > one-day motivation. Build **receipts**, not pep talks.

## Current mission (systems)

Implement **Systems** in Wonder so consistency is software:

1. Trigger · minimum action · artifact (receipt) · feedback · miss recovery  
2. Start with **3 doors** (company ship · money close · Wonder open) — see `docs/SYSTEMS.md`  
3. Selene UI: no chrome boxes, no helper essays under headings unless she asks  

When she says “add systems” or “systems,” extend `docs/SYSTEMS.md` and the UI surface — do not lecture.

## Sister apps (do not confuse)

| Path | Product | Local |
|------|---------|--------|
| `~/wonder` | Wonder personal OS | `:5173` |
| `~/lunar-glow` | Lunara Glow salon finances | `:5191` |
| `~/Projects/lens` | Lens OS greenfield | Vite next free port |
| `~/Projects/LensOSS` | Lens monorepo | per package |

Default workspace for this handoff: **`~/wonder` only** unless she names another.

## First message after open (if blank slate)

> Read `CODEX.md` + `docs/SYSTEMS.md` + `docs/SELENE-UI.md`.  
> Confirm Wonder at 127.0.0.1:5173.  
> Continue building the Systems surface (minimum viable: 3 daily doors with receipts).  
> Commit + push when a slice works.
