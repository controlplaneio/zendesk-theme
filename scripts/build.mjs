#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import pkg from "fast-json-patch";
const { applyPatch } = pkg;
import { loadIncludePatterns, isIncluded } from "./utils/build-include.mjs";
import { coloured } from "./utils/colours.mjs";

const themeDir = "copenhagen_theme";
const releases = ["external", "internal"];
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

// ─── Shared centre processing ────────────────────────────────────────
async function buildSharedForCentre(centre, centrePath, themePath, sharedPath) {
  const buildPath = path.join(centrePath, "build");

  // Compound patterns for shared replacements
  const include = await loadIncludePatterns(centrePath, sharedPath);

  // Load shared replacements
  const sharedReplacementsDir = path.join(sharedPath, "replacements");
  const hasSharedReplacements = await fs.stat(sharedReplacementsDir).catch(() => null);

  if (hasSharedReplacements) {
    const repEntries = await fs.readdir(sharedReplacementsDir, { withFileTypes: true });
    for (const entry of repEntries) {
      if (!entry.isDirectory()) continue;
      const repSubDir = path.join(sharedReplacementsDir, entry.name);

      await log(`shared replacing ${entry.name}`, centre, async () => {
        await copyRecursive(repSubDir, path.join(buildPath, entry.name), entry.name + "/", include);
      });
    }
  }

  // Load shared additions (append content to matching files)
  const sharedAdditionsDir = path.join(sharedPath, "additions");
  if (await fs.stat(sharedAdditionsDir).catch(() => null)) {
    const addEntries = await fs.readdir(sharedAdditionsDir, { withFileTypes: true });
    for (const entry of addEntries) {
      if (!entry.isDirectory()) continue;
      const addSubDir = path.join(sharedAdditionsDir, entry.name);

      await log(`shared appending ${entry.name}`, centre, async () => {
        const files = await fs.readdir(addSubDir);
        for (const file of files) {
          const additionContent = await fs.readFile(path.join(addSubDir, file), "utf8");
          const targetPath = path.join(buildPath, entry.name, file);
          const exists = await fs.stat(targetPath).then(() => true).catch(() => false);
          if (!exists) {
            const destDir = path.dirname(targetPath);
            await fs.mkdir(destDir, { recursive: true });
            await fs.writeFile(targetPath, additionContent);
            console.log(`${coloured(centre)} added ${entry.name}/${file}`);
            continue;
          }
          const existingContent = await fs.readFile(targetPath, "utf8");
          await fs.writeFile(targetPath, existingContent + "\n" + additionContent);
        }
      });
    }
  }

  // Collect shared .patch.json files (applied immediately)
  const entries = (await fs.readdir(sharedPath)).sort();
  const sharedPatchJsonFiles = entries.filter((f) => f.endsWith(".patch.json"));

  // Apply shared JSON patches
  for (const patchFile of sharedPatchJsonFiles) {
    const baseName = patchFile.replace(/\.patch\.json$/, ".json");
    const sourcePath = path.join(themePath, baseName);
    const patchPath = path.join(sharedPath, patchFile);

    try {
      await fs.access(sourcePath);
    } catch {
      console.error(`${coloured(centre)} skip (no source): ${sourcePath}`);
      continue;
    }

    await log(`shared applying ${patchFile} -> ${baseName}`, centre, async () => {
      const doc = JSON.parse(await fs.readFile(sourcePath, "utf8"));
      const patches = JSON.parse(await fs.readFile(patchPath, "utf8"));
      const result = applyPatch(doc, patches);
      if (result.error) {
        console.error(`${coloured(centre)} patch error on ${baseName}:`, result.error);
        process.exit(1);
      }
      await fs.writeFile(path.join(buildPath, baseName), JSON.stringify(result.newDocument, null, 2) + "\n");
    });
  }

  // Collect unified diff patches (shared + centre) for sorted application
  const sharedUnifiedPatches = entries.filter((f) => f.endsWith(".patch") && !f.endsWith(".patch.json"));
  return { sharedUnifiedPatches };
}

// ─── Centre processing ──────────────────────────────────────────────
async function buildCentre(centre, centrePath) {
  const themePath = path.resolve(themeDir);
  const buildPath = path.join(centrePath, "build");

  // Clean and create build dir
  await log("cleaning build dir", centre, async () => {
    await fs.rm(buildPath, { recursive: true, force: true });
    await fs.mkdir(buildPath, { recursive: true });
  });

  // Load compound patterns: shared + centre-specific
  const sharedPath = path.resolve("shared");

  // Apply shared patches and replacements first (before centre processing)
  let sharedUnifiedPatches = [];
  if (await fs.stat(sharedPath).catch(() => null)) {
    const result = await buildSharedForCentre(centre, centrePath, themePath, sharedPath);
    sharedUnifiedPatches = result.sharedUnifiedPatches || [];
  }

  // Compound patterns: shared + centre-specific
  const include = await loadIncludePatterns(centrePath, sharedPath);

  // Copy theme files filtered by compiled patterns
  const themeFiles = await fs.readdir(themePath, { withFileTypes: true });
  for (const entry of themeFiles) {
    if (!entry.isDirectory()) continue;
    const srcDir = path.join(themePath, entry.name);

    const count = await countMatches(srcDir, entry.name + "/", include);
    if (count === 0) continue;

    await log(`copying ${entry.name}`, centre, async () => {
      await copyRecursive(srcDir, path.join(buildPath, entry.name), entry.name + "/", include);
    });
  }

  // Apply centre-specific replacements
  const replacementsDir = path.join(centrePath, "replacements");
  if (await fs.stat(replacementsDir).catch(() => null)) {
    const repEntries = await fs.readdir(replacementsDir, { withFileTypes: true });
    for (const entry of repEntries) {
      if (!entry.isDirectory()) continue;
      const repSubDir = path.join(replacementsDir, entry.name);

      await log(`replacing ${entry.name}`, centre, async () => {
        await copyRecursive(repSubDir, path.join(buildPath, entry.name), entry.name + "/", include);
      });
    }
  }

  // Apply centre-specific additions (append content to matching files)
  const additionsDir = path.join(centrePath, "additions");
  if (await fs.stat(additionsDir).catch(() => null)) {
    const addEntries = await fs.readdir(additionsDir, { withFileTypes: true });
    for (const entry of addEntries) {
      if (!entry.isDirectory()) continue;
      const addSubDir = path.join(additionsDir, entry.name);

      await log(`appending ${entry.name}`, centre, async () => {
        const files = await fs.readdir(addSubDir);
        for (const file of files) {
          const additionContent = await fs.readFile(path.join(addSubDir, file), "utf8");
          const targetPath = path.join(buildPath, entry.name, file);
          const exists = await fs.stat(targetPath).then(() => true).catch(() => false);
          if (!exists) {
            const destDir = path.dirname(targetPath);
            await fs.mkdir(destDir, { recursive: true });
            await fs.writeFile(targetPath, additionContent);
            console.log(`${coloured(centre)} added ${entry.name}/${file}`);
            continue;
          }
          const existingContent = await fs.readFile(targetPath, "utf8");
          await fs.writeFile(targetPath, existingContent + "\n" + additionContent);
        }
      });
    }
  }

  // Build style.css from theme (centre-specific additions appended separately)
  await log("building style.css", centre, async () => {
    const styleCss = await fs.readFile(path.join(themePath, "style.css"), "utf8");
    await fs.writeFile(path.join(buildPath, "style.css"), styleCss);
  });

  // Apply centre-specific JSON patches
  const entries = (await fs.readdir(centrePath)).sort();
  for (const entry of entries) {
    if (!entry.endsWith(".patch.json")) continue;

    const baseName = entry.replace(/\.patch\.json$/, ".json");
    const sourcePath = path.join(themePath, baseName);
    const patchPath = path.join(centrePath, entry);

    try {
      await fs.access(sourcePath);
    } catch {
      console.error(`${coloured(centre)} skip (no source): ${sourcePath}`);
      continue;
    }

    await log(`applying ${entry} -> ${baseName}`, centre, async () => {
      const doc = JSON.parse(await fs.readFile(sourcePath, "utf8"));
      const patches = JSON.parse(await fs.readFile(patchPath, "utf8"));
      const result = applyPatch(doc, patches);
      if (result.error) {
        console.error(`${coloured(centre)} patch error on ${baseName}:`, result.error);
        process.exit(1);
      }
      await fs.writeFile(path.join(buildPath, baseName), JSON.stringify(result.newDocument, null, 2) + "\n");
    });
  }

  // Apply all unified diff patches in a single sorted pass (shared first, then centre)
  const centreUnifiedPatches = entries.filter((f) => f.endsWith(".patch") && !f.endsWith(".patch.json"));
  const allUnifiedPatches = [...sharedUnifiedPatches, ...centreUnifiedPatches].sort();

  for (const patchFile of allUnifiedPatches) {
    const sourceDir = sharedUnifiedPatches.includes(patchFile) ? sharedPath : centrePath;
    await log(`applying ${patchFile}`, centre, async () => {
      const patchContent = await fs.readFile(path.join(sourceDir, patchFile), "utf8");
      const lines = patchContent.split("\n");
      let currentFile = null;
      let srcLine = 0;
      let dstLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("--- a/") || line.startsWith("--- b/")) continue;
        if (line.startsWith("+++ ")) {
          currentFile = line.slice(6);
          srcLine = 0;
          dstLine = 0;
          continue;
        }
        const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunkMatch) {
          srcLine = parseInt(hunkMatch[1], 10);
          dstLine = parseInt(hunkMatch[2], 10);
          continue;
        }
        if (!currentFile) continue;

        const cleanPath = currentFile.replace(/^[ab]\//, "");
        const filePath = path.join(buildPath, cleanPath);
        const fileExists = await fs.stat(filePath).then(() => true).catch(() => false);
        if (!fileExists) {
          currentFile = null;
          continue;
        }

        if (line.startsWith("-")) {
          srcLine++;
          continue;
        }
        if (line.startsWith("+")) {
          const content = line.slice(1);
          const contents = await fs.readFile(filePath, "utf8");
          const fileLines = contents.split("\n");
          fileLines.splice(dstLine - 1, 0, content);
          await fs.writeFile(filePath, fileLines.join("\n"));
          dstLine++;
          continue;
        }
        srcLine++;
        dstLine++;
      }
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
const releasePaths = releases.map((c) => path.resolve(c));

await runPool(
  releases.map((c) => () => buildCentre(c, path.resolve(c))),
  CONCURRENCY,
);
