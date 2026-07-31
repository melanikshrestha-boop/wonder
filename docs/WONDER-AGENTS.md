# Wonder sub-agents

## 1. Data Guardian (priority: never wipe health)

**Job:** Every health write is **merge-only**. Prior days are never deleted by agents, seed data, empty profiles, or “fix” scripts.

### Protected domains (most sensitive first)

| Domain | Storage keys (examples) | Rule |
|--------|-------------------------|------|
| **Bowel** | `dr-melani-bowel-detail-v1`, `dr-melani-bowel-v1`, events | Merge archive + local; never shrink day map |
| **Brain fog** | `dr-melani-brainfog-v1` | Merge known days; no blank overwrite |
| **Meals / macros** | `dr-melani-meals-usuals:YYYY-MM-DD`, nutrition day keys | Per-day logs; new day ≠ delete old day |
| **Weight** | gym / body weight keys | Never clear history for a “fresh” UI |
| **Sleep** | `dr-melani-sleep-v1:*` | Same |
| **Water, bowel, habits** | matching `dr-melani-*` / `wonder-*` | Same family of rules |

### What it does in practice

1. On app load → re-merge archives from disk (`~/.wonder/local/`) into browser storage **only filling gaps**.
2. On every save → write to localStorage **and** `~/.wonder/local/` (and later vault).
3. On conflict → **owner’s local day wins**; archive never re-clobbers a corrected day.
4. Forbidden: `localStorage.clear()`, full-map replace with fewer keys, “reset today” that touches other days.

---

## 2. Data Vault

**Job:** Time-stamped **snapshots** of all protected keys so even a bad merge or browser profile switch is recoverable.

### How it works (example)

You log **Tue Type 1 bowel** at 9:02pm.

1. UI saves to localStorage.  
2. Data Guardian merges + mirrors to `~/.wonder/local/dr-melani-bowel-detail-v1.json`.  
3. Data Vault also writes:

```text
~/.wonder/vault/2026-07-30T21-02-11Z/
  bowel-detail.json
  brainfog.json
  meals-index.json
  weight.json
  manifest.json   ← list of keys + hashes
```

4. Nightly (or every N minutes): another snapshot if anything changed.

### Recovery example

Chrome opens on a blank profile → bowel week looks empty.

1. You (or Guardian on load) open latest vault snapshot.  
2. Diff: vault has Mon–Thu logs; browser has `{}`.  
3. **Merge-only restore** → days come back. Nothing in vault is deleted.  
4. Optional: “Restore from vault…” button for Melani only.

Vault is **append / versioned**. It does not edit live data except via an explicit restore path.

---

## 3. Twin

**Job:** Your **body readiness twin** for *today* — scores + one top move. Not a doctor. Not a second medical chart.

### Inputs (examples)

| Signal | Source |
|--------|--------|
| Sleep hours / debt | Sleep log |
| Brain fog Y/N | Fog map |
| Protein / water / meals | Meals |
| Cycle phase | Cycle data |
| Strain (if Whoop present) | Whoop import |

### Outputs (examples)

- **Overall 62** · energy 58 · recovery 55 · fuel 70 · stress 40  
- **Needs attention:** “Fog yes + short sleep two nights”  
- **Twin lever:** “Protect 8h tonight; don’t stack hard deep work after fog”  
- **Operating brain top move:** same idea, one sentence

### How it works (example day)

1. You log breakfast + water. Twin fuel score rises.  
2. You log bowel Type 4. Twin doesn’t diagnose stool; Guardian only stores it. Twin may note “fuel/GI log present” if wired later.  
3. You mark **fog Yes**. Recovery/energy dip; lever becomes sleep + lighter cognitive load.  
4. Mel Overview / Twin panel shows the scores. Nightly brief agent can paste:  
   *“Fog yes · sleep 6.2h · Type 4 BM · top move: earlier bed.”*

Twin **reads** Guardian-protected data. Twin **never** deletes or rewrites historical bowel/fog/meals/weight.

---

## Relationship

```text
You log health
    → Data Guardian (merge + disk mirror, never wipe)
    → Data Vault (timestamped snapshots)
    → Twin (scores + lever from *today’s* live state)
```

## Removed

- **Focus / Screen Time** page under Fitness — permanently out of nav (owner request). Historical screen-time files on disk are not bulk-deleted; the UI surface is gone.

## UI

Body OS desk UI was permanently removed (owner request). Guardian + Vault still run **headless** on app boot (`main.tsx`).

Code:

- `src/melani/agents/dataGuardian.ts`
- `src/melani/agents/dataVault.ts`
- `scripts/wonder-vault-api.mjs`
