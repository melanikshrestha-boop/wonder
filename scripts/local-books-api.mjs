/**
 * Local EPUB library — watches Downloads + Documents books folders.
 * Ocean of PDF files (and any .epub) show up in Wonder Bookshelf.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SCAN_ROOTS = [
  path.join(os.homedir(), "Downloads"),
  path.join(os.homedir(), "Documents", "04-Books"),
  path.join(os.homedir(), "Documents", "Books"),
  path.join(os.homedir(), "Documents", "E-Books"),
];

const EPUB_RE = /\.epub$/i;
const OCEAN_RE = /^_?OceanofPDF\.com[_-](.+)\.epub$/i;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function safeId(value) {
  return typeof value === "string" && /^[a-f0-9]{12,40}$/i.test(value);
}

function bookIdFromPath(filePath) {
  return createHash("sha1").update(filePath).digest("hex").slice(0, 16);
}

/** Turn Ocean / messy filenames into Title + Author */
function parseEpubName(fileName) {
  const base = path.basename(fileName);
  const ocean = base.match(OCEAN_RE);
  if (ocean) {
    // Title_-_Author  (underscores inside words)
    const body = ocean[1].replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    const dash = body.match(/^(.+?)\s+-\s+(.+)$/);
    if (dash) {
      return {
        title: cleanTitle(dash[1]),
        author: cleanTitle(dash[2]),
        fromOcean: true,
      };
    }
    return { title: cleanTitle(body), author: "", fromOcean: true };
  }

  const noExt = base.replace(/\.epub$/i, "").replace(/[_-]+/g, " ").trim();
  const dash = noExt.match(/^(.+?)\s+-\s+(.+)$/);
  if (dash) {
    return { title: cleanTitle(dash[1]), author: cleanTitle(dash[2]), fromOcean: false };
  }
  return { title: cleanTitle(noExt) || "Untitled EPUB", author: "", fromOcean: false };
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(And|Of|The|A|An|In|On|For|To|With)\b/g, (w) => w.toLowerCase())
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

async function listDirSafe(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function collectEpubs(dir, depth = 0, out = []) {
  if (depth > 3) return out;
  const entries = await listDirSafe(dir);
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectEpubs(full, depth + 1, out);
      continue;
    }
    if (entry.isFile() && EPUB_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function scanLibrary() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    try {
      const real = await realpath(root);
      const st = await stat(real);
      if (!st.isDirectory()) continue;
      await collectEpubs(real, 0, files);
    } catch {
      /* folder missing — skip */
    }
  }

  // Dedupe by real path
  const seen = new Set();
  const books = [];
  for (const filePath of files) {
    let real;
    try {
      real = await realpath(filePath);
    } catch {
      continue;
    }
    if (seen.has(real)) continue;
    seen.add(real);
    let st;
    try {
      st = await stat(real);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;

    const { title, author, fromOcean } = parseEpubName(path.basename(real));
    const id = bookIdFromPath(real);
    books.push({
      id,
      title,
      author,
      fileName: path.basename(real),
      folder: path.basename(path.dirname(real)),
      size: st.size,
      mtimeMs: st.mtimeMs,
      fromOcean: Boolean(fromOcean),
      readerUrl: `/api/local-books/${id}/file`,
      format: "epub",
      source: "local-file",
    });
  }

  books.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { books, pathById: new Map(books.map((b) => [b.id, files.find((f) => bookIdFromPath(f) === b.id) || ""])) };
}

// Keep path map for file serving between list calls
let pathCache = new Map();
let lastScan = 0;
const SCAN_TTL_MS = 4000;

async function refreshCatalog(force = false) {
  if (!force && Date.now() - lastScan < SCAN_TTL_MS && pathCache.size) {
    return pathCache;
  }
  const files = [];
  for (const root of SCAN_ROOTS) {
    try {
      const real = await realpath(root);
      await collectEpubs(real, 0, files);
    } catch {
      /* skip */
    }
  }
  const next = new Map();
  for (const filePath of files) {
    try {
      const real = await realpath(filePath);
      next.set(bookIdFromPath(real), real);
    } catch {
      /* skip */
    }
  }
  pathCache = next;
  lastScan = Date.now();
  return pathCache;
}

async function isUnderAllowedRoot(filePath) {
  let real;
  try {
    real = await realpath(filePath);
  } catch {
    return false;
  }
  for (const root of SCAN_ROOTS) {
    try {
      const rootReal = await realpath(root);
      if (real === rootReal || real.startsWith(rootReal + path.sep)) return true;
    } catch {
      /* root may not exist */
    }
  }
  return false;
}

export function localBooksApi() {
  return {
    name: "wonder-local-books-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://wonder.local");
        if (!url.pathname.startsWith("/api/local-books")) return next();
        if (req.method !== "GET" && req.method !== "HEAD") {
          return sendJson(res, 405, { error: "Method not allowed" });
        }

        try {
          if (url.pathname === "/api/local-books") {
            const paths = await refreshCatalog(true);
            const books = [];
            for (const [id, filePath] of paths) {
              let st;
              try {
                st = await stat(filePath);
              } catch {
                continue;
              }
              const { title, author, fromOcean } = parseEpubName(path.basename(filePath));
              books.push({
                id,
                title,
                author,
                fileName: path.basename(filePath),
                folder: path.basename(path.dirname(filePath)),
                size: st.size,
                mtimeMs: st.mtimeMs,
                fromOcean: Boolean(fromOcean),
                readerUrl: `/api/local-books/${id}/file`,
                format: "epub",
                source: "local-file",
              });
            }
            books.sort((a, b) => b.mtimeMs - a.mtimeMs);
            return sendJson(res, 200, {
              source: "Local files",
              count: books.length,
              roots: SCAN_ROOTS,
              syncedAt: new Date().toISOString(),
              books,
            });
          }

          const fileMatch = url.pathname.match(/^\/api\/local-books\/([a-f0-9]+)\/file$/i);
          if (fileMatch && safeId(fileMatch[1])) {
            const id = fileMatch[1].toLowerCase();
            const paths = await refreshCatalog(false);
            let filePath = paths.get(id);
            if (!filePath) {
              await refreshCatalog(true);
              filePath = pathCache.get(id);
            }
            if (!filePath || !(await isUnderAllowedRoot(filePath))) {
              return sendJson(res, 404, { error: "Book file not found" });
            }
            const st = await stat(filePath);
            if (!st.isFile()) return sendJson(res, 404, { error: "Not a file" });
            const size = st.size;
            const type = "application/epub+zip";
            const disposition = `inline; filename="${path.basename(filePath).replace(/"/g, "")}"`;
            // Range support → epub.js can open large books without waiting on full file
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader("Content-Type", type);
            res.setHeader("Cache-Control", "private, max-age=300");
            res.setHeader("Content-Disposition", disposition);

            const range = req.headers.range;
            if (range && typeof range === "string") {
              const m = /^bytes=(\d+)-(\d*)$/i.exec(range.trim());
              if (m) {
                const start = Number(m[1]);
                const end = m[2] ? Number(m[2]) : size - 1;
                if (
                  Number.isFinite(start) &&
                  Number.isFinite(end) &&
                  start >= 0 &&
                  end >= start &&
                  start < size
                ) {
                  const safeEnd = Math.min(end, size - 1);
                  res.statusCode = 206;
                  res.setHeader("Content-Range", `bytes ${start}-${safeEnd}/${size}`);
                  res.setHeader("Content-Length", String(safeEnd - start + 1));
                  if (req.method === "HEAD") return res.end();
                  createReadStream(filePath, { start, end: safeEnd }).pipe(res);
                  return;
                }
              }
            }

            res.statusCode = 200;
            res.setHeader("Content-Length", size);
            if (req.method === "HEAD") return res.end();
            createReadStream(filePath).pipe(res);
            return;
          }

          return sendJson(res, 404, { error: "Not found" });
        } catch (error) {
          return sendJson(res, 500, {
            error: error instanceof Error ? error.message : "Local books failed",
          });
        }
      });
    },
  };
}
