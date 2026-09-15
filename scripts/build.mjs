#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import pkg from "fast-json-patch";
const { applyPatch } = pkg;
import { loadIncludePatterns, isIncluded } from "./utils/build-include.mjs";
import { coloured } from "./utils/colours.mjs";
import { appendOrAdd } from "./utils/additions/append-or-add.mjs";
import { applyUnifiedDiff } from "./utils/additions/apply-unified-diff.mjs";
import { applyReplacements } from "./utils/additions/replacements.mjs";
import { mergeTranslation } from "./utils/additions/translation-merge.mjs";

const themeDir = "copenhagen_theme";
const releases = ["external"];
const CONCURRENCY = 2;

async function log(label, centre, fn) {
  console.log(`${coloured(centre)} ${label}`);
  await fn();
}

// ─── File copying with pattern filtering ─────────────────────────────
async function copyRecursive(srcDir, destDir, relPrefix, include) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  const matchedFiles = [];

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    const relPath = relPrefix + entry.name;
    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath, relPath + "/", include);
    } else if (isIncluded(include, relPath)) {
      matchedFiles.push({ srcPath, destPath });
    }
  }

  if (matchedFiles.length > 0) {
    await fs.mkdir(destDir, { recursive: true });
    for (const { srcPath, destPath } of matchedFiles) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function countMatches(srcDir, relPrefix, include) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const relPath = relPrefix + entry.name;
    if (entry.isDirectory()) {
      count += await countMatches(srcDir + "/" + entry.name, relPath + "/", include);
    } else if (isIncluded(include, relPath)) {
      count++;
    }
  }
  return count;
}

// ─── Additions / replacements ───────────────────────────────────────
// Apply one additions/ dir. Files sitting directly in it (e.g. style.css)
// append to the matching theme root file; directories append to the matching
// file inside them, with translations/*.json merged key-wise instead.
async function applyAdditions(centre, additionsDir, buildPath, themePath, label) {
  if (!(await fs.stat(additionsDir).catch(() => null))) return;

  const entries = await fs.readdir(additionsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile()) {
      const additionFile = path.join(additionsDir, entry.name);
      const targetPath = path.join(buildPath, entry.name);

      await appendOrAdd(
        additionFile,
        targetPath,
        (c) => c.split("\n").filter((l) => !l.startsWith("@import")).join("\n")
      );
      console.log(`${coloured(centre)} ${label}appended ${entry.name}`);
      continue;
    }

    if (!entry.isDirectory()) continue;
    const addSubDir = path.join(additionsDir, entry.name);

    await log(`${label}appending ${entry.name}`, centre, async () => {
      const files = await fs.readdir(addSubDir);
      for (const file of files) {
        const additionFile = path.join(addSubDir, file);
        const targetPath = path.join(buildPath, entry.name, file);

        if (entry.name === "translations" && file.endsWith(".json")) {
          const themeFile = path.join(themePath, entry.name, file);
          await mergeTranslation(additionFile, targetPath, themeFile);
          continue;
        }

        await appendOrAdd(additionFile, targetPath);
      }
    });
  }
}

// Apply one replacements/ dir, a subdirectory at a time.
async function applyReplacementsDir(centre, replacementsDir, buildPath, include, label) {
  if (!(await fs.stat(replacementsDir).catch(() => null))) return;

  const repEntries = await fs.readdir(replacementsDir, { withFileTypes: true });
  for (const entry of repEntries) {
    if (!entry.isDirectory()) continue;

    await log(`${label}replacing ${entry.name}`, centre, async () => {
      await applyReplacements(replacementsDir, buildPath, entry.name, include);
    });
  }
}

// ─── Centre processing ──────────────────────────────────────────────
async function buildCentre(centre, centrePath) {
  const themePath = path.resolve(themeDir);
  const sharedPath = path.resolve("shared");
  const buildPath = path.join(centrePath, "build");
  const hasShared = Boolean(await fs.stat(sharedPath).catch(() => null));

  // Clean and create build dir
  await log("cleaning build dir", centre, async () => {
    await fs.rm(buildPath, { recursive: true, force: true });
    await fs.mkdir(buildPath, { recursive: true });
  });

  // Write base style.css from theme (additions will append to this later)
  await fs.writeFile(path.join(buildPath, "style.css"), await fs.readFile(path.join(themePath, "style.css"), "utf8"));

  // Copy theme files filtered by compound shared + centre patterns (base layer).
  // This has to happen before any replacement or addition, otherwise the copy
  // would overwrite them.
  const include = await loadIncludePatterns(centrePath, hasShared ? sharedPath : null);
  const themeFiles = await fs.readdir(themePath, { withFileTypes: true });
  for (const entry of themeFiles) {
    if (entry.isFile()) {
      const relPath = entry.name;
      if (!isIncluded(include, relPath)) continue;
      await log(`copying ${entry.name}`, centre, async () => {
        await fs.copyFile(path.join(themePath, entry.name), path.join(buildPath, entry.name));
      });
      continue;
    }
    const srcDir = path.join(themePath, entry.name);

    const count = await countMatches(srcDir, entry.name + "/", include);
    if (count === 0) continue;

    await log(`copying ${entry.name}`, centre, async () => {
      await copyRecursive(srcDir, path.join(buildPath, entry.name), entry.name + "/", include);
    });
  }

  // Shared modifications layer over the base theme, centre-specific over shared
  if (hasShared) {
    await applyReplacementsDir(centre, path.join(sharedPath, "replacements"), buildPath, include, "shared ");
    await applyAdditions(centre, path.join(sharedPath, "additions"), buildPath, themePath, "shared ");
  }

  await applyReplacementsDir(centre, path.join(centrePath, "replacements"), buildPath, include, "");
  await applyAdditions(centre, path.join(centrePath, "additions"), buildPath, themePath, "");

  // Collect patch files from both layers
  const sharedEntries = hasShared ? (await fs.readdir(sharedPath)).sort() : [];
  const sharedPatchJsonFiles = sharedEntries.filter((f) => f.endsWith(".patch.json"));
  const sharedUnifiedPatches = sharedEntries.filter((f) => f.endsWith(".patch") && !f.endsWith(".patch.json"));

  // Apply all JSON patches (shared first, then centre-specific), sorted by target filename
  const entries = (await fs.readdir(centrePath)).sort();
  const centrePatchJsonFiles = entries.filter((f) => f.endsWith(".patch.json"));

  // Collect all patch.json files: shared first, then centre, grouped by target baseName
  const allPatchTargets = new Map();
  for (const patchFile of sharedPatchJsonFiles) {
    const baseName = patchFile.replace(/\.patch\.json$/, ".json");
    if (!allPatchTargets.has(baseName)) allPatchTargets.set(baseName, []);
    allPatchTargets.get(baseName).push({ file: patchFile, dir: sharedPath });
  }
  for (const patchFile of centrePatchJsonFiles) {
    const baseName = patchFile.replace(/\.patch\.json$/, ".json");
    if (!allPatchTargets.has(baseName)) allPatchTargets.set(baseName, []);
    allPatchTargets.get(baseName).push({ file: patchFile, dir: centrePath });
  }

  for (const [baseName, patches] of allPatchTargets) {
    const sourcePath = path.join(themePath, baseName);
    try {
      await fs.access(sourcePath);
    } catch {
      console.error(`${coloured(centre)} skip (no source): ${sourcePath}`);
      continue;
    }

    await log(`applying ${baseName}`, centre, async () => {
      let doc = JSON.parse(await fs.readFile(sourcePath, "utf8"));
      for (const { file, dir } of patches) {
        const patchDoc = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
        const result = applyPatch(doc, patchDoc);
        if (result.error) {
          console.error(`${coloured(centre)} patch error on ${baseName}:`, result.error);
          process.exit(1);
        }
        doc = result.newDocument;
      }
      await fs.writeFile(path.join(buildPath, baseName), JSON.stringify(doc, null, 2) + "\n");
    });
  }

  // Apply all unified diff patches in a single sorted pass (shared first, then centre)
  const centreUnifiedPatches = entries.filter((f) => f.endsWith(".patch") && !f.endsWith(".patch.json"));
  const allUnifiedPatches = [...sharedUnifiedPatches, ...centreUnifiedPatches].sort();

  for (const patchFile of allUnifiedPatches) {
    const sourceDir = sharedUnifiedPatches.includes(patchFile) ? sharedPath : centrePath;
    await log(`applying ${patchFile}`, centre, async () => {
      const patchContent = await fs.readFile(path.join(sourceDir, patchFile), "utf8");
      await applyUnifiedDiff(patchContent, buildPath, patchFile);
    });
  }

  console.log(`${coloured(centre)} done`);
}

// ─── Task pool ──────────────────────────────────────────────────────
async function runPool(tasks, concurrency) {
  const queue = [...tasks];
  let active = 0;

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      active++;
      try {
        await task();
      } finally {
        active--;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
}

// ─── Main ───────────────────────────────────────────────────────────
await runPool(
  releases.map((c) => () => buildCentre(c, path.resolve(c))),
  CONCURRENCY,
);
