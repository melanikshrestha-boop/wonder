/**
 * Data Vault — timestamped snapshots of protected health keys.
 * Never deletes old snapshots (only trims when > MAX_SNAPS).
 *
 * POST /api/wonder-vault/snapshot  { payload: { key: value, ... }, label? }
 * GET  /api/wonder-vault/list
 * GET  /api/wonder-vault/get?id=
 * POST /api/wonder-vault/restore   { id } → returns payload (client merges)
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), ".wonder", "vault");
const MAX_SNAPS = 120; // ~months of frequent snaps

function ensureRoot() {
  mkdirSync(ROOT, { recursive: true });
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return null;
  }
}

function listSnapIds() {
  ensureRoot();
  return readdirSync(ROOT)
    .filter((name) => {
      const p = join(ROOT, name);
      try {
        return existsSync(join(p, "manifest.json"));
      } catch {
        return false;
      }
    })
    .sort()
    .reverse();
}

function trimOld() {
  const ids = listSnapIds();
  if (ids.length <= MAX_SNAPS) return;
  for (const id of ids.slice(MAX_SNAPS)) {
    try {
      rmSync(join(ROOT, id), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function stampId() {
  // 2026-07-31T04-12-09-482Z style filesystem-safe
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function wonderVaultApi() {
  return {
    name: "wonder-vault-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (!url.pathname.startsWith("/api/wonder-vault")) return next();

        try {
          ensureRoot();

          if (url.pathname === "/api/wonder-vault/list" && req.method === "GET") {
            const ids = listSnapIds();
            const items = ids.slice(0, 40).map((id) => {
              try {
                const man = JSON.parse(
                  readFileSync(join(ROOT, id, "manifest.json"), "utf8")
                );
                return {
                  id,
                  at: man.at || id,
                  label: man.label || "snapshot",
                  keyCount: man.keyCount || 0,
                  domains: man.domains || [],
                };
              } catch {
                return { id, at: id, label: "snapshot", keyCount: 0, domains: [] };
              }
            });
            return json(res, 200, { ok: true, root: ROOT, items });
          }

          if (url.pathname === "/api/wonder-vault/get" && req.method === "GET") {
            const id = String(url.searchParams.get("id") || "").replace(
              /[^a-zA-Z0-9T._-]/g,
              ""
            );
            if (!id) return json(res, 400, { error: "id required" });
            const dir = join(ROOT, id);
            if (!existsSync(join(dir, "payload.json"))) {
              return json(res, 404, { error: "not found" });
            }
            const payload = JSON.parse(
              readFileSync(join(dir, "payload.json"), "utf8")
            );
            const manifest = JSON.parse(
              readFileSync(join(dir, "manifest.json"), "utf8")
            );
            return json(res, 200, { ok: true, id, manifest, payload });
          }

          if (
            url.pathname === "/api/wonder-vault/snapshot" &&
            req.method === "POST"
          ) {
            const body = await readBody(req);
            if (!body || typeof body.payload !== "object" || !body.payload) {
              return json(res, 400, { error: "payload object required" });
            }
            const id = stampId();
            const dir = join(ROOT, id);
            mkdirSync(dir, { recursive: true });
            const keys = Object.keys(body.payload);
            const domains = [
              ...new Set(
                keys.map((k) => {
                  if (k.includes("bowel")) return "bowel";
                  if (k.includes("fog")) return "fog";
                  if (k.includes("meal") || k.includes("nutri")) return "meals";
                  if (k.includes("weight")) return "weight";
                  if (k.includes("sleep")) return "sleep";
                  if (k.includes("water")) return "water";
                  if (k.includes("habit")) return "habits";
                  return "health";
                })
              ),
            ];
            const manifest = {
              id,
              at: new Date().toISOString(),
              label: String(body.label || "auto").slice(0, 80),
              keyCount: keys.length,
              domains,
            };
            writeFileSync(
              join(dir, "payload.json"),
              JSON.stringify(body.payload),
              "utf8"
            );
            writeFileSync(
              join(dir, "manifest.json"),
              JSON.stringify(manifest, null, 2),
              "utf8"
            );
            trimOld();
            return json(res, 201, { ok: true, id, manifest });
          }

          if (
            url.pathname === "/api/wonder-vault/restore" &&
            req.method === "POST"
          ) {
            // Returns payload only — client performs merge-only restore
            const body = await readBody(req);
            const id = String(body?.id || "").replace(/[^a-zA-Z0-9T._-]/g, "");
            if (!id) return json(res, 400, { error: "id required" });
            const dir = join(ROOT, id);
            if (!existsSync(join(dir, "payload.json"))) {
              return json(res, 404, { error: "not found" });
            }
            const payload = JSON.parse(
              readFileSync(join(dir, "payload.json"), "utf8")
            );
            return json(res, 200, { ok: true, id, payload });
          }

          return json(res, 404, { error: "not found" });
        } catch (error) {
          return json(res, 500, { error: String(error?.message || error) });
        }
      });
    },
  };
}
