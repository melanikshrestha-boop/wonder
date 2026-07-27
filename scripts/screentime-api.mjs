/**
 * Vite middleware: live Mac screen-time from knowledgeC via scripts/screentime.py
 * GET /api/screentime?days=30
 * GET /api/screentime/today
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PY = resolve(ROOT, "scripts/screentime.py");

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function runExport(days) {
  // Cap 365 — knowledgeC may have less; client keeps forever history
  const n = Math.max(1, Math.min(Number(days) || 120, 365));
  const { stdout, stderr } = await exec(
    "python3",
    [PY, "--export", "--days", String(n)],
    {
      timeout: 60_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env },
    }
  );
  const text = (stdout || "").trim();
  if (!text) {
    throw new Error(stderr || "Empty screentime export");
  }
  // last JSON object in stdout (in case of noise)
  const start = text.indexOf("{");
  const payload = JSON.parse(start >= 0 ? text.slice(start) : text);
  return payload;
}

export function screentimeApi() {
  return {
    name: "screentime-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!url.pathname.startsWith("/api/screentime")) return next();
        try {
          if (req.method !== "GET") {
            return json(res, 405, { ok: false, error: "GET only" });
          }
          if (url.pathname === "/api/screentime" || url.pathname === "/api/screentime/") {
            const days = url.searchParams.get("days") || "30";
            const payload = await runExport(days);
            return json(res, 200, payload);
          }
          if (url.pathname === "/api/screentime/today") {
            const payload = await runExport(1);
            return json(res, 200, payload);
          }
          return json(res, 404, { ok: false, error: "Not found" });
        } catch (error) {
          return json(res, 503, {
            ok: false,
            error:
              "Could not read Mac screen time. Grant Full Disk Access to your terminal/Node if needed.",
            detail: String(error?.message || error),
          });
        }
      });
    },
  };
}
