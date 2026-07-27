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
- Bookshelf, Finances, Tasks
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

## Smart Accountant (Finances)

The Finances desk is a local-first bookkeeping OS: ledger, budget plan, goals,
accounts, double-entry accounting pack (journal, reconciliation, statements,
monthly close), plus:

- **Worth tab** — net worth as a timeline, not one number. Month-end snapshots
  reconstruct past bank balances from the ledger (labeled *estimated*); manual
  valuations (property, vehicle, business, collectibles) carry forward from
  their last recorded date and are labeled as carried forward — nothing is
  invented between data points. Every change comes with a "why it changed"
  breakdown showing the arithmetic.
- **Imports without APIs** — drag a bank export onto Import: Chase-style CSV,
  generic CSV (Date + Amount + Description), and **OFX/QFX** (bank & card).
  OFX `FITID` becomes the transaction's `externalId`, so re-importing the same
  statement never duplicates rows. No Plaid or bank credentials required.
- **Transfer intelligence** — deterministic matching of money-out/money-in
  pairs (same cents, ≤3-day window, different accounts, transfer-y wording).
  Each proposal shows its evidence and confidence; nothing is applied without
  your click. Transfers and card payments are excluded from true income and
  spending so moving money never looks like earning or spending it.
- **Cents-safe math** — `financeMoney.ts` does ledger arithmetic in integer
  cents so floating-point dust can never fake a penny.
- **Optional encryption** — a local passphrase vault (AES-GCM, PBKDF2) can
  encrypt the finance books at rest. Off by default; no cloud.

Run its test suite:

```bash
npm run test:finance   # money math, CSV/OFX parsing, dedupe, transfers, net-worth timeline
```

**Limits:** Wonder is a personal records tool. It is **not** tax, legal,
investment, or accounting advice. Credit figures are educational estimates,
not FICO. All data stays in this browser — export CSV backups yourself
(Ledger → Export CSV); local storage means *you* own backups.

## Data
Core data lives in the **browser** (`localStorage`). Some finance imports are shipped as TypeScript snapshots under `src/melani/` for offline books. Raw bank spreadsheets (e.g. `.xlsx` statement dumps) are **not** committed.

## Internal note for agents
Some folders and storage keys still say `melani` / `dr-melani` (e.g. `src/melani/`, `dr-melani-sleep-v1`). That is intentional so existing local data is not wiped. Product-facing name is always **Wonder**.
