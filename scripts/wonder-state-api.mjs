/**
 * Shared local state for Wonder + desktop widget.
 * Browser localStorage does not cross Chrome ↔ Electron profiles;
 * this API keeps habits on disk under ~/.wonder/local/ so both stay in sync.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".wonder", "local");

function ensureDir() {
  mkdirSync(DIR, { recursive: true });
}

function safeKey(key) {
  // only allow known wonder keys (no path traversal)
  if (typeof key !== "string" || !/^[a-zA-Z0-9._-]{1,120}$/.test(key)) return null;
  if (!key.startsWith("wonder-") && !key.startsWith("dr-melani-")) return null;
  return key;
}

function pathFor(key) {
  return join(DIR, `${key}.json`);
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function wonderStateApi() {
  return {
    name: "wonder-state-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (!url.pathname.startsWith("/api/wonder-state")) return next();

        try {
          ensureDir();

          // GET /api/wonder-state?key=wonder-habits-v1
          if (url.pathname === "/api/wonder-state" && req.method === "GET") {
            const key = safeKey(url.searchParams.get("key") || "");
            if (!key) return json(res, 400, { error: "invalid key" });
            const file = pathFor(key);
            if (!existsSync(file)) return json(res, 200, { ok: true, key, value: null });
            const value = JSON.parse(readFileSync(file, "utf8"));
            return json(res, 200, { ok: true, key, value });
          }

          // PUT /api/wonder-state  { key, value }
          if (url.pathname === "/api/wonder-state" && req.method === "PUT") {
            const body = await readBody(req);
            if (!body) return json(res, 400, { error: "bad json" });
            const key = safeKey(body.key);
            if (!key) return json(res, 400, { error: "invalid key" });
            writeFileSync(pathFor(key), JSON.stringify(body.value ?? null), "utf8");
            return json(res, 200, { ok: true, key });
          }

          // GET /api/wonder-state/health
          if (url.pathname === "/api/wonder-state/health") {
            return json(res, 200, { ok: true, dir: DIR });
          }

          return json(res, 404, { error: "not found" });
        } catch (error) {
          return json(res, 500, { error: String(error?.message || error) });
        }
      });
    },
  };
}
