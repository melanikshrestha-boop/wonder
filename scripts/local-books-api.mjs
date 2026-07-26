/**
 * Local book library API.
 *
 * Serves every book found across Downloads, Desktop, Documents, Apple Books,
 * iCloud Drive, Google Drive / Dropbox / OneDrive, and mounted volumes. The
 * scan runs in the background (see library-scan.mjs), so requests are answered
 * from memory and never wait on a cold cloud folder.
 *
 * GET /api/local-books            → full library
 * GET /api/local-books?rev=<hash> → { unchanged: true } when nothing moved
 * GET /api/local-books?force=1    → rescan now, then answer
 * GET /api/local-books/drives     → which drives are mounted and their counts
 * GET /api/local-books/:id/file   → stream one book file
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createLibraryScanner } from "./library-scan.mjs";

const MIME = {
  ".epub": "application/epub+zip",
  ".pdf": "application/pdf",
  ".mobi": "application/x-mobipocket-ebook",
  ".azw": "application/vnd.amazon.ebook",
  ".azw3": "application/vnd.amazon.ebook",
  ".cbz": "application/vnd.comicbook+zip",
  ".cbr": "application/vnd.comicbook-rar",
  ".djvu": "image/vnd.djvu",
  ".fb2": "application/x-fictionbook+xml",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function safeId(value) {
  return typeof value === "string" && /^[a-f0-9]{12,40}$/i.test(value);
}

export function localBooksApi(options = {}) {
  const scanner = createLibraryScanner(options);

  return {
    name: "wonder-local-books-api",
    configureServer(server) {
      scanner.start();
      server.httpServer?.once("close", () => scanner.stop());

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://wonder.local");
        if (!url.pathname.startsWith("/api/local-books")) return next();
        if (req.method !== "GET" && req.method !== "HEAD") {
          return sendJson(res, 405, { error: "Method not allowed" });
        }

        try {
          if (url.pathname === "/api/local-books") {
            const force = url.searchParams.get("force") === "1";
            await scanner.ensureFresh(force);
            const snap = scanner.snapshot();
            const clientRev = url.searchParams.get("rev");

            // Nothing moved since the caller last looked — skip the payload.
            if (clientRev && clientRev === snap.revision) {
              return sendJson(res, 200, {
                source: "Local drives",
                unchanged: true,
                count: snap.books.length,
                revision: snap.revision,
                syncedAt: snap.syncedAt,
                scanMs: snap.scanMs,
                drives: snap.drives,
              });
            }

            return sendJson(res, 200, {
              source: "Local drives",
              count: snap.books.length,
              revision: snap.revision,
              syncedAt: snap.syncedAt,
              scanMs: snap.scanMs,
              scanning: snap.scanning,
              drives: snap.drives,
              roots: snap.drives.map((drive) => drive.path),
              books: snap.books,
            });
          }

          if (url.pathname === "/api/local-books/drives") {
            await scanner.ensureFresh();
            const snap = scanner.snapshot();
            return sendJson(res, 200, {
              drives: snap.drives,
              revision: snap.revision,
              syncedAt: snap.syncedAt,
              scanMs: snap.scanMs,
              cacheHits: snap.dirCacheHits,
              cacheMisses: snap.dirCacheMisses,
            });
          }

          const fileMatch = url.pathname.match(
            /^\/api\/local-books\/([a-f0-9]+)\/file$/i
          );
          if (fileMatch && safeId(fileMatch[1])) {
            const id = fileMatch[1].toLowerCase();
            let filePath = scanner.pathFor(id);
            if (!filePath) {
              await scanner.ensureFresh(true);
              filePath = scanner.pathFor(id);
            }
            if (!filePath) {
              return sendJson(res, 404, { error: "Book file not found" });
            }

            let fileStat;
            try {
              fileStat = await stat(filePath);
            } catch {
              return sendJson(res, 404, { error: "Book file not found" });
            }
            if (!fileStat.isFile()) {
              return sendJson(res, 404, { error: "Not a file" });
            }

            const ext = path.extname(filePath).toLowerCase();
            res.statusCode = 200;
            res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
            res.setHeader("Content-Length", fileStat.size);
            res.setHeader("Cache-Control", "private, max-age=300");
            res.setHeader(
              "Content-Disposition",
              `inline; filename="${path.basename(filePath).replace(/"/g, "")}"`
            );
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
