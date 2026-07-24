# Wonder — personal OS

**Wonder** is one private app: a Notion-style workspace with health, finances, agents, and Mel built in.

## Melani → Wonder

| Old name | New name |
|----------|----------|
| **Dr. Melani** (product) | **Wonder** |
| Separate health app on port 8781 | **Gone** — health lives inside Wonder |
| Repo / package names that said Melani or notion-like | Prefer **Wonder** |

**Mel** (the in-app coach / AI bubble) is still called Mel. That is the assistant, not the product name.

There is **one entry point**:

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**

That URL is Wonder: Fitness, Finances, Bookshelf, Mel, Wardrobe, Hygiene, Labs, and the rest of the sidebar. No second tab. No second repo required for daily use.

## What’s inside

### Health
- **Fitness** — Digital Twin · Nightly body brief · Sleep · Meals · Gym
- **My Data** — Labs, cycle tracker, profile
- **Hygiene** — AM/PM routines, restock list, product links
- **Mel** — local coach (type `twin` for the forecast or `brief` for tonight)

### Agents
- **Wardrobe** — garment perception, imports, closet memory, outfit decisions
- **Weather** — live conditions, forecast, weather-aware grooming guidance
- **Care Concierge** — dental/medical appointment admin with drafts and calendar export
- **Gmail** · **Shopping**

### Life
- Bookshelf, Finances, World Monitor, Tasks
- **+ New page** anytime in the sidebar

## Write like Notion
- Click title → type  
- **Enter** = new block · **/** = slash menu · **Tab** = indent  
- **⌘K** = search · everything auto-saves in this browser  

## Optional bridges
```bash
npm run ai      # Mel Grok bridge :8791 (needs XAI_API_KEY)
npm run gmail   # Gmail IMAP bridge :8790
```

These are optional backends. The UI itself is one app on **:5173**.

## Data
Core data lives in the **browser** (`localStorage`). Some finance imports are shipped as TypeScript snapshots under `src/melani/` for offline books. Raw bank spreadsheets (e.g. `.xlsx` statement dumps) are **not** committed.

## Internal note for agents
Some folders and storage keys still say `melani` / `dr-melani` (e.g. `src/melani/`, `dr-melani-sleep-v1`). That is intentional so existing local data is not wiped. Product-facing name is always **Wonder**.
