# Systems (Wonder) — consistency as product

> It’s easy to get motivated one day and attack a goal head on.  
> What isn’t easy is doing that for days → weeks → years.  
> The only way is **systems that work for you**.

This doc is the **spec** for coding agents (Codex / Grok / Claude). Implement software, not essays.

---

## Law

| Idea | Product meaning |
|------|-----------------|
| Motivation | Optional fuel |
| System | Trigger + minimum + receipt + feedback + miss rule |
| If it only works when she’s hyped | Not a system — redesign the minimum |
| Proof | Artifact in Wonder (or git / Lunara), never “I thought about it” |

### Card template (every system)

```
Goal (outcome):
System name:
Trigger: when / where
Minimum (≤10 min when tired):
Full version (when strong):
Receipt (what she can see):
Cadence: daily | weekdays | after salon
Miss rule: same day restart — no catch-up marathon
Kill rule: 7 skips → redesign minimum, don’t abandon goal
```

---

## v1 — Three doors (ship first)

Minimal home / Systems surface. Three doors, every day. No vision-board chrome.

### 1. Company ship (Lens / product)

| Field | Value |
|-------|--------|
| Trigger | Opens product repo or ends deep work block |
| Minimum | One vertical slice **or** one real fix + commit |
| Full | Feature day + push |
| Receipt | Commit on `main` / line in ship log if present |
| Cadence | Days she codes company |

**Wonder side:** checklist item “Ship” with status `done` when she marks it or when we later wire git signal. v1 = manual mark + optional note.

### 2. Money close (salon → Lunara)

| Field | Value |
|-------|--------|
| Trigger | After Square day ends (salon workdays) |
| Minimum | Drop **transactions CSV** on Lunara `+` next to Fixed; glance net |
| Full | Tip split + notes |
| Receipt | Lunara day book for that date has Net Sales > 0 |
| Cadence | Salon days |

**Wonder side:** door “Money close” → deep link or copy path `http://127.0.0.1:5191/` + short rule text only if she asks for copy. v1 = link + mark done.

**Lunara path:** `~/lunar-glow` · [http://127.0.0.1:5191/](http://127.0.0.1:5191/)

### 3. Wonder open (personal OS)

| Field | Value |
|-------|--------|
| Trigger | First open of Wonder in a day |
| Minimum | One real update: meals **or** money **or** wardrobe **or** books |
| Full | Full desk pass |
| Receipt | Storage write on that surface (existing stores) |
| Cadence | Daily |

**Wonder side:** door “Wonder open” auto-suggests unfinished surfaces; mark done when any of meals/finance/wardrobe/bookshelf wrote today.

---

## UI (Selene)

- Surface name: **Systems** (nav / subnav — match existing Melani desk patterns)
- **No** dividers, **no** card boxes for structure, **no** taglines under titles
- Density: list of systems + status for **today** only by default
- Expand one system → card fields (trigger, minimum, receipt) — plain type, not marketing
- Streak optional later — only if she asks; don’t invent gamification chrome

### Suggested data (local)

```ts
// sketch — implement in melani/* store pattern (localStorage, merge-only)
type SystemDoor = {
  id: "company_ship" | "money_close" | "wonder_open" | string;
  name: string;
  trigger: string;
  minimum: string;
  full: string;
  receipt: string;
  cadence: "daily" | "weekdays" | "salon" | "custom";
};

type SystemDayLog = {
  date: string; // YYYY-MM-DD
  done: Record<string, boolean>; // system id → done
  notes?: Record<string, string>;
};
```

Persist like `habitStore` / `sleepStore`: merge-only, never wipe other health data.

---

## v2 (later — do not block v1)

- Auto-detect ship from git (optional)
- Auto-detect Lunara day import
- Auto-detect Wonder surface writes
- Custom systems from card template UI
- Week review (counts only, no essays)

---

## Out of scope

- Premed / clinic defaults  
- Replacing Lens or Lunara with a second finance app  
- Long motivational copy in the UI  

---

## Agent checklist when coding Systems

1. Read `docs/SELENE-UI.md` + `docs/NO-DELETE-UI.md`  
2. Implement v1 three doors + today status + local persistence  
3. Wire nav entry without removing existing desks  
4. Smoke at `http://127.0.0.1:5173/`  
5. Commit + push `main`  

When Melani says “add a system,” add a door via the card template — don’t rewrite the philosophy.
