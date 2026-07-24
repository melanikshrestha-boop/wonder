# Wonder — Claude Code / agent notes

Same product as Grok. Read **AGENTS.md** first for standing rules.

## Continuous GitHub sync (mandatory)

After every meaningful prompt of work: **commit + push** to  
`https://github.com/melanikshrestha-boop/wonder` on **`main`**.

Owner may switch mid-day from Claude Code to Grok (or the reverse). Unpushed work is lost to the other agent.

## Deploy Configuration

- Platform: GitHub Pages (private repo; Actions workflow)
- Production URL: https://melanikshrestha-boop.github.io/wonder/ (if Pages enabled)
- Deploy workflow: `.github/workflows/deploy.yml` — runs on push to `main`
- Deploy trigger: automatic on push to `main`
- Project type: static web app (Vite)
- Pre-merge: `npm run build`
- Health check: production URL returns 200
- Local: http://127.0.0.1:5173/ in Safari

## Naming

Wonder = product. Mel = coach. Not Dr. Melani for the product name.
