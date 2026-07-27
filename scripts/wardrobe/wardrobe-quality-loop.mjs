#!/usr/bin/env node
/**
 * Wardrobe quality loop — manage the worker, not one-shot prompts.
 *
 * Beats:
 *  1. FIND  — audit library images + UI code contracts
 *  2. DO    — (this script reports; fixes are separate targeted tools)
 *  3. CHECK — re-audit thresholds
 *  4. REMEMBER — write data/wardrobe-loop-memory.json
 *  5. GO AGAIN — exit non-zero if still failing
 *
 * Run: node scripts/wardrobe/wardrobe-quality-loop.mjs
 */
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const root = process.cwd();
const libraryFile = path.join(root, "data/library.json");
const importedDir = path.join(root, "data/imported");
const memoryFile = path.join(root, "data/wardrobe-loop-memory.json");
const appFile = path.join(root, "src/melani/wardrobe/App.jsx");
const cssFile = path.join(root, "src/melani/wardrobe/styles.css");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function assetFile(url) {
  if (!url) return null;
  return path.basename(String(url).split(/[?#]/, 1)[0]);
}

async function auditLibrary(lib) {
  const issues = [];
  for (const item of lib) {
    const front = assetFile(item.frontImage || item.image);
    if (!front || !(await exists(path.join(importedDir, front)))) {
      issues.push({ sev: "high", kind: "missing-front", name: item.name, id: item.id });
      continue;
    }
    const { data, info } = await sharp(path.join(importedDir, front))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let opaque = 0;
    let pureWhite = 0;
    let minY = info.height;
    let maxY = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i + 3] < 40) continue;
        opaque += 1;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (Math.min(data[i], data[i + 1], data[i + 2]) > 248) pureWhite += 1;
      }
    }
    const hFrac = opaque ? (maxY - minY + 1) / info.height : 0;
    const whiteRatio = opaque ? pureWhite / opaque : 0;
    if (whiteRatio > 0.05) {
      issues.push({ sev: "med", kind: "white-plate", name: item.name, id: item.id, whiteRatio });
    }
    if (item.part === "lowerbody" && hFrac < 0.72) {
      issues.push({ sev: "med", kind: "short-pants", name: item.name, id: item.id, hFrac });
    }
    if (item.part === "upperbody" && hFrac < 0.65) {
      issues.push({ sev: "med", kind: "short-top", name: item.name, id: item.id, hFrac });
    }
  }
  return issues;
}

async function auditCode() {
  const app = await readFile(appFile, "utf8");
  const css = await readFile(cssFile, "utf8");
  const checks = {
    productPopupOnly:
      app.includes("product-popup") &&
      !/function ItemViewer[\s\S]*ItemEditor/.test(app),
    hoverBack: app.includes("has-back") && css.includes("gallery-img-back"),
    navTight: /category-nav[\s\S]{0,220}margin:\s*10px/.test(css),
    navSections:
      app.includes('label: "Tops"') &&
      app.includes('label: "All"') &&
      app.includes("hoodies"),
    shopTab: /Shop/.test(app) && /shop/.test(app),
  };
  const build = spawnSync(
    "npx",
    [
      "esbuild",
      "src/melani/wardrobe/App.jsx",
      "--bundle",
      "--outfile=/tmp/wardrobe-loop-bundle.js",
      "--format=esm",
      "--external:react",
      "--external:react-dom",
      "--external:@phosphor-icons/react",
      "--external:@unpic/react",
    ],
    { encoding: "utf8", cwd: root }
  );
  checks.bundleOk = build.status === 0;
  if (!checks.bundleOk) checks.bundleErr = (build.stderr || "").slice(0, 400);
  return checks;
}

const lib = JSON.parse(await readFile(libraryFile, "utf8"));
const issues = await auditLibrary(lib);
const codeChecks = await auditCode();
const open = issues.filter((i) => i.sev === "high" || i.sev === "med");
const codeFail = Object.entries(codeChecks).filter(([k, v]) => k !== "bundleErr" && v !== true);

const memory = {
  finishedAt: new Date().toISOString(),
  loop: "wardrobe-quality-v1",
  inventory: {
    total: lib.length,
    sell: lib.filter((i) => i.forSale).map((i) => i.name),
    want: lib
      .filter((i) => i.role === "wishlist" || (i.tags || []).includes("want"))
      .map((i) => i.name),
  },
  issuesOpen: open,
  codeChecks,
  verdict: open.length === 0 && codeFail.length === 0 ? "PASS" : "FAIL",
};

await mkdir(path.dirname(memoryFile), { recursive: true });
await writeFile(memoryFile, `${JSON.stringify(memory, null, 2)}\n`);

console.log(JSON.stringify(memory, null, 2));
process.exit(memory.verdict === "PASS" ? 0 : 1);
