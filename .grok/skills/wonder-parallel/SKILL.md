---
name: wonder-parallel
description: >
  Orchestrate parallel Wonder subagents without file stomping. Use when Melani
  wants multi-track work, "run in parallel", "subagents", "don't mess up data",
  or several Wonder surfaces at once. Slash: /wonder-parallel
---

# Wonder parallel orchestration

When Melani asks for multi-part work, **spawn subagents in parallel** with non-overlapping file surfaces.

## Default lanes

| Agent | Lane | Isolation |
|-------|------|-----------|
| `wonder-data-guardian` | Health storage / restore / never-wipe | worktree if multi-file rewrite |
| `wonder-selene` | Shell + page CSS, no dividers/boxes | worktree if large CSS |
| `wonder-wardrobe` | Closet only | worktree preferred |
| `wonder-keeper` | Server uptime | none (shared) |
| `wonder-verify` | Read-only checks after | none, read-only |

## Rules
1. **Never two agents on the same files.**
2. Always inject laws into prompts:
   - Data: merge-only, empty disk ≠ truth
   - UI: Selene — no dividers, no boxes, no blurbs
3. After children complete → spawn `wonder-verify` (or run checks yourself).
4. Parent commits/pushes per `AGENTS.md` after merges.

## Spawn pattern

```
# Parallel example
spawn wonder-selene: "Kill remaining hairlines on Habits CSS only"
spawn wonder-wardrobe: "Tighten shoes grid further; no new copy"
spawn wonder-data-guardian: "Audit habit checks hydrate path; prove empty disk cannot overwrite"
# Then
spawn wonder-verify: "Smoke 5173 + typecheck + grep border-top in touched CSS"
```

## File fences (do not cross)

- Guardian: `habitStore`, `sleepStore`, `nutrition`, `whoopStore` weight, `agents/data*.ts`
- Selene: `notion.css`, `App.tsx`, `components/*`, fitness/habits **CSS only**
- Wardrobe: `src/melani/wardrobe/**`, `scripts/wardrobe/**`, local `data/library.json`
