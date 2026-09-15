import fs from "node:fs/promises";
import path from "node:path";

// Copy replacement files for a single subdirectory, overwriting existing files in the build.
// The replacementsDir contains the source files to replace.
// The targetSubDir is the name of this subdirectory (e.g., "templates").
// Errors if the target directory does not exist in the build.
export async function applyReplacements(replacementsDir, buildDir, targetSubDir, include) {
  const repSubDir = path.join(replacementsDir, targetSubDir);
  const destDir = path.join(buildDir, targetSubDir);

  // Check that the target directory exists in the build
  const dirExists = await fs.stat(destDir).then(() => true).catch(() => false);
  if (!dirExists) {
    throw new Error(`replacement target does not exist: ${targetSubDir}`);
  }

  // Copy all files from replacement dir to build dir (overwriting)
  const entries = await fs.readdir(repSubDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const srcPath = path.join(repSubDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    const relPath = targetSubDir + "/" + entry.name;

    if (!isIncluded(include, relPath)) continue;
    await fs.copyFile(srcPath, destPath);
  }
}

function isIncluded(ig, relPath) {
  if (!ig) return true; // no patterns means include everything
  const normalized = relPath.replace(/\\/g, "/");
  return ig.ignores(normalized);
}
