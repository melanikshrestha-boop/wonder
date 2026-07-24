# Wonder — Claude Code / agent notes

Same product as Grok. Read **AGENTS.md** first for standing rules.

## Continuous GitHub sync (mandatory)

After every meaningful prompt of work: **commit + push** to  
`https://github.com/melanikshrestha-boop/wonder` on **`main`**.

Owner may switch mid-day from Claude Code to Grok (or the reverse). Unpushed work is lost to the other agent.

## Deploy Configuration

- Platform: **GitHub (private) is the real handoff “deploy”** — push to `main` every prompt
- CI: `.github/workflows/deploy.yml` builds on push to `main` and uploads `dist` artifact
- GitHub Pages: **not available** on free private plan (needs GitHub Pro or public repo)
- Optional live host: Vercel/Netlify private project after one-time `vercel login` / `netlify login`
- Project type: static web app (Vite); finance/health data is sensitive — keep host private
- Local: http://127.0.0.1:5173/ in Safari — ALWAYS this exact address
  (`localhost:5173` is a different browser storage origin and shows an
  empty workspace; user data lives under 127.0.0.1)
- Owner's Mac clone lives in a folder named **`notion-like`** (NOT
  "wonder") — when giving the owner terminal steps, never assume
  `~/wonder`; the safe start command is `cd ~/notion-like && npm run dev`

## Naming

Wonder = product. Mel = coach. Not Dr. Melani for the product name.
