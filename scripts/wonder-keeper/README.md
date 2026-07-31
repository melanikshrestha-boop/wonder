# Wonder Keeper

Keeps Wonder running on this Mac so the site does not randomly die.

## Why it dies

- Terminal closed → Vite process gone
- Mac sleep / crash → node exits
- Old health LaunchAgents pointed at dead paths
- Wrong URL (`localhost` vs `127.0.0.1` = empty workspace)

## Commands

```bash
cd ~/wonder   # or your clone path
npm run wonder:status
npm run wonder:install   # LaunchAgent: login + KeepAlive forever
npm run wonder:open      # ensure up + Safari
npm run wonder:stop
npm run wonder:uninstall
```

## URLs

| Surface | URL |
|--------|-----|
| Desktop Safari | http://127.0.0.1:5173/ |
| Base widget | http://127.0.0.1:5173/?widget=1 |
| Phone (same Wi‑Fi) | http://YOUR_LAN_IP:5173/ |

## Logs

- `~/.wonder/logs/keeper.log`
- `~/.wonder/logs/vite.log`
- `~/.wonder/status.json`
