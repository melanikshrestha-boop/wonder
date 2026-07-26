/**
 * Drive scanner checks: discovery, dedupe, metadata, cache speedup, revision.
 * Run: npm run test:books
 */
import assert from "node:assert/strict";
import { createLibraryScanner, discoverDrives, parseBookName } from "./library-scan.mjs";

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    throw error;
  }
}

console.log("Filename parsing");
check("Ocean of PDF names split into title and author", () => {
  const parsed = parseBookName("OceanofPDF.com_Deep_Work_-_Cal_Newport.epub");
  assert.equal(parsed.title, "Deep Work");
  assert.equal(parsed.author, "Cal Newport");
  assert.equal(parsed.fromOcean, true);
});

check("plain dash names split into title and author", () => {
  const parsed = parseBookName("The Lean Startup - Eric Ries.pdf");
  assert.equal(parsed.title, "The Lean Startup");
  assert.equal(parsed.author, "Eric Ries");
});

check("hyphenated slugs become a readable title", () => {
  const parsed = parseBookName("atomic-habits.epub");
  assert.equal(parsed.title, "Atomic Habits");
});

console.log("\nDrive discovery");
const drives = await discoverDrives();
check("finds at least one live drive", () => {
  assert.ok(drives.length >= 1, `expected drives, got ${drives.length}`);
});
check("labels every drive with a kind", () => {
  for (const drive of drives) {
    assert.ok(drive.label, "missing label");
    assert.ok(
      ["local", "apple", "icloud", "cloud", "external"].includes(drive.kind),
      `bad kind ${drive.kind}`
    );
  }
});
console.log(
  `      drives: ${drives.map((d) => `${d.label}(${d.kind})`).join(", ")}`
);

console.log("\nLibrary scan");
const scanner = createLibraryScanner({ rescanMs: 60_000 });
const coldStart = Date.now();
await scanner.ensureFresh(true);
const coldMs = Date.now() - coldStart;
const first = scanner.snapshot();

check("finds books across drives", () => {
  assert.ok(first.books.length >= 1, `expected books, got ${first.books.length}`);
});

check("reads real titles out of EPUB metadata", () => {
  const titles = first.books.map((b) => b.title);
  const hasMetaTitle = titles.some((t) =>
    ["Deep Work", "Atomic Habits", "Thinking, Fast and Slow", "Zero to One", "Steve Jobs"].includes(t)
  );
  assert.ok(hasMetaTitle, `no metadata title in ${JSON.stringify(titles)}`);
});

check("epubs are readable and non-epubs are not", () => {
  for (const book of first.books) {
    if (book.format === "epub" && !book.cloudOnly) {
      assert.ok(book.readable, `${book.fileName} should be readable`);
      assert.ok(book.readerUrl, `${book.fileName} needs a reader url`);
    } else {
      assert.equal(book.readable, false, `${book.fileName} should not be readable`);
      assert.equal(book.readerUrl, "", `${book.fileName} should have no reader url`);
    }
  }
});

check("undownloaded iCloud files are marked cloud-only", () => {
  const stubs = first.books.filter((b) => b.cloudOnly);
  for (const stub of stubs) {
    assert.equal(stub.fileUrl, "", "cloud placeholder must not expose a file url");
  }
});

check("every book names the drive it came from", () => {
  for (const book of first.books) {
    assert.ok(book.drive, `${book.fileName} missing drive label`);
    assert.ok(book.driveKind, `${book.fileName} missing drive kind`);
  }
});

check("ids resolve back to a real path", () => {
  for (const book of first.books) {
    assert.ok(scanner.pathFor(book.id), `${book.id} has no path`);
  }
});

check("drive summary counts add up to the library", () => {
  const summed = first.drives.reduce((total, drive) => total + drive.count, 0);
  assert.equal(summed, first.books.length);
});

console.log("\nIncremental behaviour");
const warmStart = Date.now();
await scanner.ensureFresh(true);
const warmMs = Date.now() - warmStart;
const second = scanner.snapshot();

check("revision is stable when nothing changed", () => {
  assert.equal(second.revision, first.revision);
});

check("book count is stable when nothing changed", () => {
  assert.equal(second.books.length, first.books.length);
});

check("cached rescan reuses directory listings", () => {
  assert.ok(
    second.dirCacheHits > 0,
    `expected cache hits, got ${second.dirCacheHits}`
  );
});

check("cached rescan is not slower than the cold scan", () => {
  // Cold scan pays for unzip metadata reads; warm scan must not regress past it.
  assert.ok(
    warmMs <= Math.max(coldMs, 250),
    `warm ${warmMs}ms vs cold ${coldMs}ms`
  );
});

check("ensureFresh is a no-op when the library is clean", () => {
  const before = scanner.snapshot();
  scanner.ensureFresh();
  const after = scanner.snapshot();
  assert.equal(after.revision, before.revision);
});

scanner.stop();

console.log(
  `\n${passed} checks passed · ${first.books.length} books · cold ${coldMs}ms · cached ${warmMs}ms · cache hits ${second.dirCacheHits}/${second.dirCacheHits + second.dirCacheMisses}`
);
