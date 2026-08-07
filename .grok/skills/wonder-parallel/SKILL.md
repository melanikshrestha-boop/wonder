---
name: wonder-parallel
description: >
  Dynamic spawning for Wonder: lead breaks work into specialized subagents
  (researcher, implementer, reviewer + domain lanes), up to 8 in parallel,
  with Git worktree isolation for writers so file edits never collide. Use
  when Melani wants multi-track work, "run in parallel", "subagents",
  "dynamic spawn", "don't mess up data", "worktree", or several Wonder
  surfaces at once. Slash: /wonder-parallel
---

# Wonder parallel — Dynamic Spawning

When Melani asks for multi-part work, **you are the lead**. Decompose → specialize → spawn ≤8 → merge → verify → push.

Full lead law: **`.grok/agents/wonder-lead.md`** (`wonder-lead`).

## Three pillars

| Pillar | Rule |
|--------|------|
| **Dynamic Spawning** | Lead breaks the task; spawn only what is needed, **max 8 concurrent** |
| **Task Specialization** | Researcher / implementer / reviewer (+ domain agents) |
| **Git Worktree Isolation** | Every multi-file **writer** uses `isolation: worktree` |

## Role menu

### Specialization trio (core)

| Agent | Job | Isolation |
|-------|-----|-----------|
| `wonder-researcher` | Read-only code/data investigation | none, read-only |
| `wonder-implementer` | Bounded code slice | **worktree** |
| `wonder-reviewer` | Diff gate before merge | none, read-only |

### Quality & validation (verify stack)

| Agent | Job | Tools bias | Isolation |
|-------|-----|------------|-----------|
| `repo-explorer` | Entry points + data flow + risk map | Read, Grep, Glob | read-only |
| `docs-researcher` | Official docs + release notes → research.md | Read, Grep, Glob, WebFetch, WebSearch | read-only (+ research.md) |
| `code-reviewer` | Quality + security standards on diffs | Read, Grep, Glob | read-only |
| `test-writer` | Unit + integration tests | Read, Write, Edit, Grep, Glob | worktree if multi-file tests |
| `debugger` | Isolate + fix runtime errors | Read, Write, Edit, Bash, Grep, Glob | worktree if multi-file fix |
| `test-debugger` | Run suites, group failures (no big feature rewrite) | Bash + read | execute |
| `security-reviewer` | Authz / validation / secrets (no exploits) | Read, Grep, Glob | read-only |

### Domain lanes

| Agent | Lane | Isolation |
|-------|------|-----------|
| `wonder-data-guardian` | Health storage / never-wipe | worktree if multi-file |
| `wonder-selene` | Shell + CSS, no dividers/boxes | worktree if large CSS |
| `wonder-wardrobe` | Closet only | worktree preferred |
| `wonder-keeper` | Server uptime | none (shared) |
| `wonder-verify` | Smoke after merge | none, read-only |
| `wonder-lead` | Orchestrator only (parent role) | n/a |

## Lead algorithm (every multi-track request)

```
1. PARSE     outcomes in 1–3 bullets
2. DECOMPOSE independent slices by file fence
3. ROLE      researcher | implementer | domain | reviewer
4. CAP       ≤8 concurrent; batch remaining into wave 2
5. FENCE     allowed paths only in each child prompt
6. SPAWN     parallel; writers = isolation: worktree
7. AWAIT     all reports
8. REVIEW    wonder-reviewer
9. MERGE     worktrees → parent (dependency order)
10. VERIFY   wonder-verify / typecheck + curl :5173
11. SHIP     commit + push main (AGENTS.md)
```

## Spawn pattern (example)

```
# Wave 1 — research + implementers (≤8 total)
spawn wonder-researcher: "Trace habitStore empty hydrate; report wipe paths"
spawn wonder-implementer isolation=worktree fence=src/melani/habitStore.ts:
  "Refuse empty disk overwrite of non-empty checks"
spawn wonder-selene isolation=worktree fence=Habits CSS only:
  "Kill remaining hairlines; no new copy"
spawn wonder-wardrobe isolation=worktree fence=wardrobe/**:
  "Tighten shoes grid density only"

# Wave 2 — after implementers
spawn wonder-reviewer: "Review worktree branches vs main; Guardian + Selene"
spawn wonder-verify: "typecheck + curl 127.0.0.1:5173 + divider grep"
```

## Child prompt must include

1. Agent identity  
2. One-line slice goal  
3. **File fence** (only these paths)  
4. Do-not-touch list  
5. Wonder laws (Guardian + Selene + `:5173`)  
6. Isolation mode  
7. Acceptance criteria  

## File fences (do not cross)

| Lane | Paths |
|------|--------|
| Guardian | `habitStore`, `sleepStore`, `nutrition`, `whoopStore` weight, `agents/data*.ts`, wonder-state/vault scripts |
| Selene | `notion.css`, `App.tsx`, `components/*`, fitness/habits **CSS only** |
| Wardrobe | `src/melani/wardrobe/**`, `scripts/wardrobe/**`, local `data/library.json` |
| Implementer | **Only** paths named in the prompt |

## Rules (absolute)

1. **Never two writers on the same files.**  
2. Inject laws into every child: merge-only health; empty ≠ truth; no dividers/boxes/blurbs.  
3. Writers → **worktree**; researchers/reviewers → read-only.  
4. **Max 8** concurrent subagents.  
5. After children → **reviewer** then **verify**.  
6. Parent **commits/pushes** per `AGENTS.md`.  
7. Children **do not** recursive-spawn.  
8. On merge conflict over health code → stop; preserve data-safety side.

## When not to fan out

- Trivial single-file fix the lead can do in one shot  
- Pure explanation / no repo change  

## Related agents on disk

`.grok/agents/wonder-{lead,researcher,implementer,reviewer,data-guardian,selene,wardrobe,keeper,verify}.md`
