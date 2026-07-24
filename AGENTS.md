# Wonder — agent rules

**Product:** Wonder (formerly Dr. Melani)  
**Repo:** https://github.com/melanikshrestha-boop/wonder (private)  
**Canonical branch:** `main`  
**Local app:** http://127.0.0.1:5173/ (open in **Safari**)

Mel = the coach/AI bubble. Wonder = the whole product. Do not call the product Dr. Melani.

---

## Standing order: continuous GitHub sync

**Every meaningful change in a prompt/session MUST be committed and pushed to GitHub before you stop.**

Owner switches agents often (Claude Code, Grok, Codex, etc.). GitHub is the shared source of truth — not local-only edits.

### After any non-trivial work

1. `git status` + `git diff`
2. Stage intentional files only (never raw bank `.xlsx`, never secrets)
3. Commit with a clear message
4. `git push` to `origin` / `dr-melani` tracking remote (repo: `melanikshrestha-boop/wonder`)
5. Prefer pushing to **`main`** so the next agent’s default clone is current

### Do this even when

- The user did not say “commit” or “push”
- The session is short
- You only changed docs or config
- You might continue later

### Do not

- Leave uncommitted finance / rebrand / feature work on disk only
- Force-push unless the user explicitly asks
- Commit `*.xlsx` bank dumps, `.env`, API keys, or `node_modules`

### Optional WIP commits

If mid-task and interrupted: commit as `WIP: <what>` and push so Claude/Grok can resume from GitHub.

---

## Run / open

```bash
npm install
npm run dev
# open in Safari
open -a Safari "http://127.0.0.1:5173/"
```

Production build (static UI only — Vite APIs/bridges are local-dev):

```bash
npm run build   # vite build → dist/
```

---

## Naming

| Use | Avoid |
|-----|--------|
| Wonder | Dr. Melani (product) |
| Mel (coach) | Calling the whole app Melani |
| One app :5173 | Sending people to :8781 as a second app |

Internal folders/keys may still say `melani` / `dr-melani` so localStorage keeps working. Do not mass-rename storage keys.

---

## Deploy notes

- Frontend is a static Vite SPA; core data is browser `localStorage`
- Optional bridges (Gmail :8790, Mel AI :8791) are local only unless separately hosted
- See `## Deploy Configuration` in `CLAUDE.md` / this file when present
