/**
 * Wonder book drive scanner.
 *
 * Finds every readable book file across the Mac: Downloads, Desktop,
 * Documents, Apple Books' own container, iCloud Drive, iCloud Books,
 * Google Drive / Dropbox / OneDrive / Box (macOS CloudStorage providers),
 * and mounted external drives under /Volumes.
 *
 * Fast by construction:
 *   - directory listings are cached by folder mtime, so a rescan of an
 *     unchanged tree costs one stat per folder instead of a full readdir
 *   - the walk runs with bounded concurrency instead of one folder at a time
 *   - only book-shaped files get stat'd
 *   - EPUB metadata (real title/author from the OPF) is read once per file
 *     and cached on disk across restarts
 *   - a revision token lets callers skip transferring an unchanged library
 */
import { execFile } from "node:child_process";
import { watch } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** epub is readable in Wonder's reader; the rest are shelved and openable. */
const READABLE_RE = /\.epub$/i;
const BOOK_RE = /\.(epub|pdf|mobi|azw3?|cbz|cbr|djvu|fb2)$/i;
/** iCloud placeholders: ".Some Book.epub.icloud" until downloaded */
const ICLOUD_STUB_RE = /^\.(.+)\.icloud$/i;
const OCEAN_RE = /^_?OceanofPDF\.com[_-](.+)\.(epub|pdf)$/i;

const MAX_DEPTH = 5;
const WALK_CONCURRENCY = 16;
/** Metadata reads per pass — bounded so a huge shelf never stalls a scan */
const META_BUDGET_PER_PASS = 40;

const META_CACHE_FILE = path.join(os.tmpdir(), "wonder-book-meta-cache.json");

/** Folders that never hold books but cost a lot to walk. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".Trash",
  ".Trashes",
  "Applications",
  "Library",
  "System",
  "Cache",
  "Caches",
  "Photos Library",
  "site-packages",
  "venv",
  ".venv",
  "dist",
  "build",
  "DerivedData",
  "Xcode",
  "Steam",
]);

const SKIP_SUFFIXES = [
  ".app",
  ".photoslibrary",
  ".fcpbundle",
  ".sparsebundle",
  ".framework",
  ".xcodeproj",
  ".lrdata",
  ".aplibrary",
];

function skippableDir(name) {
  if (name.startsWith(".") && name !== ".") return true;
  if (SKIP_DIRS.has(name)) return true;
  const lower = name.toLowerCase();
  return SKIP_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function hash(value) {
  return createHash("sha1").update(value).digest("hex");
}

export function bookIdFromPath(filePath) {
  return hash(filePath).slice(0, 16);
}

function titleCase(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(And|Of|The|A|An|In|On|For|To|With|Or|At|By)\b/g, (w) =>
      w.toLowerCase()
    )
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

/** Turn Ocean / messy filenames into Title + Author. */
export function parseBookName(fileName) {
  const base = path.basename(fileName);
  const ocean = base.match(OCEAN_RE);
  if (ocean) {
    const body = ocean[1].replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    const dash = body.match(/^(.+?)\s+-\s+(.+)$/);
    if (dash) {
      return {
        title: titleCase(dash[1]),
        author: titleCase(dash[2]),
        fromOcean: true,
      };
    }
    return { title: titleCase(body), author: "", fromOcean: true };
  }

  const noExt = base
    .replace(BOOK_RE, "")
    .replace(/\bz-?lib(rary)?(\.org)?\b/gi, " ")
    .replace(/\(\s*\)/g, " ")
    .trim();

  // "Title - Author" and "Title_-_Author" both name an author; a bare hyphen
  // inside a slug ("atomic-habits") does not.
  const dash = noExt.replace(/_/g, " ").match(/^(.+?)\s+-\s+(.+)$/);
  if (dash) {
    return {
      title: titleCase(dash[1]),
      author: titleCase(dash[2]),
      fromOcean: false,
    };
  }

  const words = noExt.replace(/[_-]+/g, " ").trim();
  return { title: titleCase(words) || "Untitled book", author: "", fromOcean: false };
}

function formatFor(fileName) {
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  if (ext === "epub") return "epub";
  return ext || "file";
}

async function isDir(candidate) {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Every place a book might live on this Mac, labeled so the shelf can say
 * "iCloud Drive" or "SanDisk" instead of a raw path.
 */
export async function discoverDrives() {
  const home = os.homedir();
  const candidates = [];

  const add = (label, kind, dir, depth = MAX_DEPTH) => {
    candidates.push({ label, kind, path: dir, depth });
  };

  add("Downloads", "local", path.join(home, "Downloads"), 3);
  add("Desktop", "local", path.join(home, "Desktop"), 3);
  add("Documents", "local", path.join(home, "Documents"), 4);
  add("Books folder", "local", path.join(home, "Books"), 4);

  // Apple Books keeps downloaded EPUBs in its own container.
  add(
    "Apple Books",
    "apple",
    path.join(
      home,
      "Library/Containers/com.apple.BKAgentService/Data/Documents/iBooks/Books"
    ),
    3
  );
  add(
    "Apple Books (iCloud)",
    "apple",
    path.join(home, "Library/Mobile Documents/iCloud~com~apple~iBooks/Documents"),
    3
  );
  add(
    "iCloud Drive",
    "icloud",
    path.join(home, "Library/Mobile Documents/com~apple~CloudDocs"),
    4
  );

  // macOS File Provider mounts: Google Drive, Dropbox, OneDrive, Box…
  const cloudStorage = path.join(home, "Library/CloudStorage");
  if (await isDir(cloudStorage)) {
    for (const entry of await readdir(cloudStorage, { withFileTypes: true }).catch(
      () => []
    )) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;
      const provider = entry.name.split("-")[0] || entry.name;
      add(provider, "cloud", path.join(cloudStorage, entry.name), 4);
    }
  }

  // Legacy sync folders that still exist on plenty of Macs.
  for (const legacy of ["Google Drive", "Dropbox", "OneDrive", "Box Sync"]) {
    add(legacy, "cloud", path.join(home, legacy), 4);
  }

  // Mounted volumes: USB sticks, SD cards, external SSDs, network shares.
  for (const entry of await readdir("/Volumes", { withFileTypes: true }).catch(
    () => []
  )) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith(".")) continue;
    // The boot volume is already covered by the home-folder roots.
    if (entry.name === "Macintosh HD") continue;
    add(entry.name, "external", path.join("/Volumes", entry.name), 3);
  }

  const live = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    if (!(await isDir(candidate.path))) continue;
    live.push({ ...candidate, id: bookIdFromPath(candidate.path) });
  }
  return live;
}

/** Cached directory listing keyed by folder mtime. */
class DirCache {
  constructor() {
    this.entries = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  async list(dir) {
    let dirStat;
    try {
      dirStat = await stat(dir);
    } catch {
      this.entries.delete(dir);
      return null;
    }
    const cached = this.entries.get(dir);
    if (cached && cached.mtimeMs === dirStat.mtimeMs) {
      this.hits += 1;
      return cached;
    }
    let raw;
    try {
      raw = await readdir(dir, { withFileTypes: true });
    } catch {
      this.entries.delete(dir);
      return null;
    }
    this.misses += 1;
    const dirs = [];
    const files = [];
    for (const entry of raw) {
      if (entry.isDirectory()) {
        if (skippableDir(entry.name)) continue;
        dirs.push(entry.name);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      const stub = entry.name.match(ICLOUD_STUB_RE);
      const effective = stub ? stub[1] : entry.name;
      if (!BOOK_RE.test(effective)) continue;
      files.push({ name: entry.name, effective, placeholder: Boolean(stub) });
    }
    const record = { mtimeMs: dirStat.mtimeMs, dirs, files };
    this.entries.set(dir, record);
    return record;
  }

  prune(livePaths) {
    for (const key of this.entries.keys()) {
      if (!livePaths.has(key)) this.entries.delete(key);
    }
  }
}

/** Bounded-concurrency walk of one drive. */
async function walkDrive(drive, dirCache, visitedDirs) {
  const found = [];
  const stack = [{ dir: drive.path, depth: 0 }];
  let active = 0;

  await new Promise((resolve) => {
    const pump = () => {
      if (!stack.length && active === 0) {
        resolve();
        return;
      }
      while (active < WALK_CONCURRENCY && stack.length) {
        const job = stack.pop();
        active += 1;
        void (async () => {
          const listing = await dirCache.list(job.dir);
          if (listing) {
            visitedDirs.add(job.dir);
            for (const file of listing.files) {
              found.push({
                dir: job.dir,
                name: file.name,
                effective: file.effective,
                placeholder: file.placeholder,
              });
            }
            if (job.depth < drive.depth) {
              for (const child of listing.dirs) {
                stack.push({
                  dir: path.join(job.dir, child),
                  depth: job.depth + 1,
                });
              }
            }
          }
          active -= 1;
          pump();
        })();
      }
    };
    pump();
  });

  return found;
}

/** Read real title/author out of an EPUB's OPF, cached on disk. */
class MetaCache {
  constructor() {
    this.map = new Map();
    this.dirty = false;
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = JSON.parse(await readFile(META_CACHE_FILE, "utf8"));
      if (raw && typeof raw === "object") {
        for (const [key, value] of Object.entries(raw)) this.map.set(key, value);
      }
    } catch {
      /* first run */
    }
  }

  async persist() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(path.dirname(META_CACHE_FILE), { recursive: true });
      await writeFile(
        META_CACHE_FILE,
        JSON.stringify(Object.fromEntries(this.map)),
        "utf8"
      );
    } catch {
      /* cache is best effort */
    }
  }

  key(filePath, size, mtimeMs) {
    return `${filePath}|${size}|${Math.round(mtimeMs)}`;
  }

  get(filePath, size, mtimeMs) {
    return this.map.get(this.key(filePath, size, mtimeMs)) || null;
  }

  set(filePath, size, mtimeMs, value) {
    this.map.set(this.key(filePath, size, mtimeMs), value);
    this.dirty = true;
  }
}

function firstTag(xml, tag) {
  const match = xml.match(
    new RegExp(`<(?:dc:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:dc:)?${tag}>`, "i")
  );
  if (!match) return "";
  return match[1]
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function allTags(xml, tag) {
  const matches = xml.matchAll(
    new RegExp(`<(?:dc:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:dc:)?${tag}>`, "gi")
  );
  const out = [];
  for (const match of matches) {
    const value = match[1]
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/** `<meta name="calibre:series" content="Foundation"/>` and friends. */
function metaContent(xml, name) {
  const match = xml.match(
    new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, "i")
  ) ||
    xml.match(
      new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, "i")
    );
  return match ? match[1].trim() : "";
}

async function readEpubMeta(filePath) {
  try {
    const { stdout } = await execFileAsync("/usr/bin/unzip", ["-p", filePath, "*.opf"], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 4000,
    });
    const head = stdout.slice(0, 60_000);
    const title = firstTag(head, "title");
    const author = firstTag(head, "creator");
    // Subject tags come from the publisher, so they shelve far better than a
    // filename ever will.
    const subjects = allTags(head, "subject")
      .flatMap((subject) => subject.split(/\s*[;/]\s*/))
      .map((subject) => subject.trim())
      .filter((subject) => subject.length > 2 && subject.length < 60)
      .slice(0, 12);
    const publisher = firstTag(head, "publisher");
    const language = firstTag(head, "language");
    const date = firstTag(head, "date");
    const year = Number((date.match(/\b(1[5-9]\d{2}|20\d{2})\b/) || [])[1]) || null;
    const seriesName = metaContent(head, "calibre:series");
    const seriesIndex = Number(metaContent(head, "calibre:series_index")) || null;
    const description = firstTag(head, "description").slice(0, 600);

    if (!title && !author && !subjects.length) return null;
    return {
      title,
      author,
      subjects,
      publisher,
      language,
      year,
      seriesName,
      seriesIndex,
      description,
    };
  } catch {
    return null;
  }
}

/**
 * Background library scanner. Call start() once; snapshot() is then always
 * instant because HTTP handlers read memory, never the disk.
 */
export function createLibraryScanner(options = {}) {
  const rescanMs = options.rescanMs ?? 15_000;
  const driveRefreshMs = options.driveRefreshMs ?? 60_000;

  const dirCache = new DirCache();
  const metaCache = new MetaCache();

  let drives = [];
  let drivesCheckedAt = 0;
  let books = [];
  let pathById = new Map();
  let revision = "";
  let syncedAt = null;
  let scanMs = 0;
  let scanning = false;
  let dirty = true;
  let inFlight = null;
  let timer = null;
  const watchers = new Map();

  function markDirty() {
    dirty = true;
  }

  function watchDrives() {
    for (const drive of drives) {
      if (watchers.has(drive.path)) continue;
      try {
        const watcher = watch(
          drive.path,
          { recursive: true, persistent: false },
          (_event, name) => {
            if (typeof name === "string" && !BOOK_RE.test(name)) {
              const stub = path.basename(name).match(ICLOUD_STUB_RE);
              if (!stub || !BOOK_RE.test(stub[1])) return;
            }
            markDirty();
          }
        );
        watcher.on("error", () => {
          watcher.close();
          watchers.delete(drive.path);
        });
        watchers.set(drive.path, watcher);
      } catch {
        /* watching is an optimization, polling still covers this drive */
      }
    }
    for (const [dir, watcher] of watchers) {
      if (drives.some((drive) => drive.path === dir)) continue;
      watcher.close();
      watchers.delete(dir);
    }
  }

  async function refreshDrives(force = false) {
    if (!force && Date.now() - drivesCheckedAt < driveRefreshMs && drives.length) {
      return drives;
    }
    const next = await discoverDrives();
    const changed =
      next.length !== drives.length ||
      next.some((drive, index) => drive.path !== drives[index]?.path);
    drives = next;
    drivesCheckedAt = Date.now();
    if (changed) {
      markDirty();
      watchDrives();
    }
    return drives;
  }

  /**
   * One copy per real book. A file that exists in both iCloud and Downloads
   * is the same book; prefer the downloaded (readable) copy.
   */
  function dedupe(candidates) {
    const byKey = new Map();
    // Prefer a copy you can actually open: downloaded over placeholder, EPUB
    // over anything else, a local disk over a cloud folder, and richer metadata
    // over a bare filename. File size breaks the last tie, since a truncated
    // download is smaller than the real thing.
    const score = (item) =>
      (item.placeholder ? 0 : 40) +
      (item.format === "epub" ? 20 : 0) +
      (item.driveKind === "local" || item.driveKind === "apple" ? 10 : 0) +
      (item.subjects?.length ? 5 : 0) +
      (item.author ? 2 : 0);

    for (const item of candidates) {
      // The same title by the same author is one book, even when two drives
      // hold copies of slightly different sizes.
      const authorKey = (item.author || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      const key = `${item.titleKey}|${authorKey}|${item.format}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...item, copies: 1 });
        continue;
      }
      const copies = (existing.copies || 1) + 1;
      const better =
        score(item) > score(existing) ||
        (score(item) === score(existing) && (item.size || 0) > (existing.size || 0));
      if (better) {
        byKey.set(key, { ...item, copies });
      } else {
        existing.copies = copies;
      }
    }

    // A copy whose filename never named an author is still the same book as the
    // one whose metadata did, so fold it into the named entry.
    const kept = [...byKey.values()];
    const named = new Map();
    for (const item of kept) {
      if (item.author) named.set(`${item.titleKey}|${item.format}`, item);
    }
    return kept.filter((item) => {
      if (item.author) return true;
      const match = named.get(`${item.titleKey}|${item.format}`);
      if (!match) return true;
      match.copies = (match.copies || 1) + (item.copies || 1);
      return false;
    });
  }

  async function scanOnce() {
    const startedAt = Date.now();
    scanning = true;
    await metaCache.load();
    await refreshDrives();

    const visitedDirs = new Set();
    const perDrive = await Promise.all(
      drives.map(async (drive) => ({
        drive,
        hits: await walkDrive(drive, dirCache, visitedDirs),
      }))
    );

    const candidates = [];
    let metaBudget = META_BUDGET_PER_PASS;

    for (const { drive, hits } of perDrive) {
      for (const hit of hits) {
        const filePath = path.join(hit.dir, hit.name);
        let fileStat = null;
        if (!hit.placeholder) {
          try {
            fileStat = await stat(filePath);
          } catch {
            continue;
          }
          if (!fileStat.isFile()) continue;
        }

        const format = formatFor(hit.effective);
        const parsed = parseBookName(hit.effective);
        let title = parsed.title;
        let author = parsed.author;
        let meta = null;

        if (format === "epub" && fileStat) {
          const cached = metaCache.get(filePath, fileStat.size, fileStat.mtimeMs);
          if (cached) {
            meta = cached;
          } else if (metaBudget > 0) {
            metaBudget -= 1;
            meta = await readEpubMeta(filePath);
            metaCache.set(filePath, fileStat.size, fileStat.mtimeMs, meta || {});
          }
          if (meta) {
            title = meta.title || title;
            author = meta.author || author;
          }
        }

        const id = bookIdFromPath(filePath);
        candidates.push({
          id,
          filePath,
          title,
          author,
          titleKey: title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
          fileName: hit.effective,
          folder: path.basename(hit.dir),
          drive: drive.label,
          driveKind: drive.kind,
          size: fileStat?.size || 0,
          mtimeMs: fileStat?.mtimeMs || 0,
          placeholder: hit.placeholder,
          format,
          fromOcean: parsed.fromOcean,
          subjects: meta?.subjects || [],
          publisher: meta?.publisher || "",
          language: meta?.language || "",
          publishedYear: meta?.year || null,
          seriesName: meta?.seriesName || "",
          seriesIndex: meta?.seriesIndex || null,
          description: meta?.description || "",
        });
      }
    }

    dirCache.prune(visitedDirs);
    void metaCache.persist();

    const unique = dedupe(candidates);
    const nextBooks = unique
      .map((item) => ({
        id: item.id,
        title: item.title,
        author: item.author,
        fileName: item.fileName,
        folder: item.folder,
        drive: item.drive,
        driveKind: item.driveKind,
        size: item.size,
        mtimeMs: item.mtimeMs,
        fromOcean: item.fromOcean,
        format: item.format,
        subjects: item.subjects || [],
        publisher: item.publisher || "",
        language: item.language || "",
        publishedYear: item.publishedYear || null,
        seriesName: item.seriesName || "",
        seriesIndex: item.seriesIndex || null,
        description: item.description || "",
        readable: READABLE_RE.test(item.fileName) && !item.placeholder,
        cloudOnly: item.placeholder,
        copies: item.copies || 1,
        readerUrl:
          READABLE_RE.test(item.fileName) && !item.placeholder
            ? `/api/local-books/${item.id}/file`
            : "",
        fileUrl: item.placeholder ? "" : `/api/local-books/${item.id}/file`,
        source: "local-file",
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    books = nextBooks;
    pathById = new Map(unique.map((item) => [item.id, item.filePath]));
    revision = hash(
      nextBooks.map((b) => `${b.id}:${b.mtimeMs}:${b.size}`).join("|")
    ).slice(0, 16);
    syncedAt = new Date().toISOString();
    scanMs = Date.now() - startedAt;
    scanning = false;
    dirty = false;
    return books;
  }

  async function ensureFresh(force = false) {
    if (inFlight) return inFlight;
    if (!force && !dirty && syncedAt) return books;
    inFlight = scanOnce().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function driveSummary() {
    const counts = new Map();
    for (const book of books) {
      counts.set(book.drive, (counts.get(book.drive) || 0) + 1);
    }
    return drives.map((drive) => ({
      id: drive.id,
      label: drive.label,
      kind: drive.kind,
      path: drive.path,
      count: counts.get(drive.label) || 0,
    }));
  }

  return {
    start() {
      if (timer) return;
      void ensureFresh(true);
      timer = setInterval(() => {
        void refreshDrives().then(() => {
          if (dirty) void ensureFresh();
        });
      }, rescanMs);
      if (typeof timer.unref === "function") timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
    ensureFresh,
    markDirty,
    snapshot() {
      return {
        books,
        drives: driveSummary(),
        revision,
        syncedAt,
        scanMs,
        scanning,
        dirCacheHits: dirCache.hits,
        dirCacheMisses: dirCache.misses,
      };
    },
    pathFor(id) {
      return pathById.get(id) || null;
    },
    knownPaths() {
      return new Set(pathById.values());
    },
  };
}
