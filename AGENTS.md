# Wonder — agent rules

**Product:** Wonder (formerly Dr. Melani)  
**Repo:** https://github.com/melanikshrestha-boop/wonder (private)  
**Canonical branch:** `main`  
**Local app:** http://127.0.0.1:5173/ (open in **Safari**)

Mel = the coach/AI bubble. Wonder = the whole product. Do not call the product Dr. Melani.

---

## Selene UI (non-negotiable)

Read **`docs/SELENE-UI.md`** before any Wonder UI change.

- **Never** add divider lines (`border-top` / `border-bottom` / `hr` / section hairlines)
- **Never** box content in frames/cards for “structure”
- **Never** add instructional/marketing copy unless Melani **explicitly** asks  
- Space with hierarchy + whitespace only

This is permanent. “Which is never” = she will not ask for dividers/boxes.

---

## NO-DELETE UI (non-negotiable)

Read **`docs/NO-DELETE-UI.md`** before any Wonder UI change.

- **When you add something new, do not delete existing UI** unless Melani explicitly orders delete/remove.
- Fitness example: quote **+** Whoop drop is **additive** — **Import weekly data** under **every night logged** must stay.
- Scan diffs for deleted buttons/toggles/footers. If she didn’t ask to delete them → put them back.

---

## Subagents (Dynamic Spawning)

Project agents: **`.grok/agents/`**. Lead breaks work into specialized children — **max 8 concurrent** — so parallel edits do not stomp data.

Orchestration: **`.grok/skills/wonder-parallel/SKILL.md`** (`/wonder-parallel`) · lead law: **`.grok/agents/wonder-lead.md`**.

### Specialization trio (Wonder-named)

| Agent | Job | Isolation |
|-------|-----|-----------|
| `wonder-researcher` | Read-only code/data investigation | none (read-only) |
| `wonder-implementer` | Bounded code slice | **worktree** |
| `wonder-reviewer` | Diff gate (Guardian + Selene + correctness) | none (read-only) |
| `wonder-lead` | Orchestrator: decompose → spawn ≤8 → merge → ship | parent only |

### Quality & validation (`.grok/agents/`)

| Agent | Job | Tools | Isolation |
|-------|-----|-------|-----------|
| `repo-explorer` | Entry points, data flows, risk zones | Read, Grep, Glob | read-only |
| `docs-researcher` | Official docs + release notes | Read, Grep, Glob, WebFetch, WebSearch | research.md only |
| `code-reviewer` | Code quality + security standards on diffs | Read, Grep, Glob | read-only |
| `test-writer` | Unit + integration tests | Read, Write, Edit, Grep, Glob | worktree if multi-file |
| `debugger` | Isolate + fix runtime errors | Read, Write, Edit, Bash, Grep, Glob | worktree if multi-file |
| `test-debugger` | Run tests, group failures / coverage gaps | Bash + read | execute tests |
| `security-reviewer` | Authz, validation, secret exposure | Read, Grep, Glob | read-only (no exploits) |

### Domain lanes

| Agent | Job |
|-------|-----|
| `wonder-data-guardian` | Health storage: merge-only; never wipe bowel/fog/meals/weight/habits |
| `wonder-selene` | UI law: no dividers, no boxes, no blurbs |
| `wonder-wardrobe` | Closet: fullscreen must work, paste-link + screenshot reverse-import, density, Selene |
| `hoodie` | Hoodie tiles: official flat front/back (not on-model rembg); 1000×1200 front-cut + back-cut |
| `wonder-open` | Open Wonder with full `:5173` URL; prove not blank; wardrobe full-page fallback |
| `wonder-keeper` | Keep `http://127.0.0.1:5173/` alive |
| `wonder-verify` | Read-only smoke after parallel work |

### Parallel rules (absolute)
1. **Dynamic spawn:** lead assigns roles; do not run one mega-session on multi-track work.
2. **Max 8 concurrent** subagents; batch the rest into wave 2.
3. **One writer per file surface** — never two agents on `habitStore` or the same CSS file.
4. **Git worktree isolation** for every multi-file writer (`isolation: worktree`).
5. Researchers + reviewers are **read-only**; implementers report worktree path + branch for merge.
6. Health + UI + wardrobe can run **at the same time** on non-overlapping fences.
7. Finish with `wonder-reviewer` then `wonder-verify` before “done.”
8. Children **never** recursive-spawn; only the lead fans out.

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

## Undo — press **U**

- No topbar label. Just press **`U`** (when not typing in a field) to undo the last action.
- Twice undoes the last two actions. Also **⌘Z** / **Ctrl+Z** when not in a text field.
- Wired: workspace, Mel, Finances, brain fog, sleep times.
- New features: call `pushUndo(label, restore)` from `src/undoStack.ts` before mutating saved state.

## Run / open

```bash
npm install
npm run dev
# open in Safari
open -a Safari "http://127.0.0.1:5173/"
```

### Always-on (Wonder Keeper)

Vite dies when a terminal closes or the process crashes. Install the LaunchAgent once:

```bash
npm run wonder:install   # login + KeepAlive health loop
npm run wonder:status
npm run wonder:open      # ensure up + Safari
```

- Health URL: **http://127.0.0.1:5173/** (never `localhost` — different storage origin)
- Base widget: **http://127.0.0.1:5173/?widget=1**
- Phone (same Wi‑Fi): `http://LAN_IP:5173/` (see `wonder:status`)
- Logs: `~/.wonder/logs/` · status JSON: `~/.wonder/status.json`

Safari → Share → **Add to Dock** (Mac) or **Add to Home Screen** (iPhone) for app-like use.

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

- **“Deploy” for agent switching = push to GitHub `main`.** That is mandatory every prompt.
- CI builds `dist/` on every push to `main` (see `.github/workflows/deploy.yml`).
- GitHub Pages does not work for free private repos; do not make the repo public (bank/health data).
- Optional public/private web host (Vercel/Netlify) needs a one-time CLI login — ask Melani before putting a live URL on the internet.
- Frontend is a static Vite SPA; core data is browser `localStorage`.
- Optional bridges (Gmail :8790, Mel AI :8791) are local only unless separately hosted.
