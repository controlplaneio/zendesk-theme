import ignore from "ignore";
import fs from "node:fs/promises";
import path from "node:path";

// Load and compound build.include patterns from shared + release paths.
// Uses the "ignore" library which implements the .gitignore spec.
// Patterns are POSITIVE: only files matching a pattern are copied.
// If no build.include exists in a path, its patterns are skipped (no error).
// Patterns compound across shared and release — last match wins.
export async function loadIncludePatterns(centrePath, sharedPath) {
  const ig = ignore();

  if (sharedPath) {
    try {
      const content = await fs.readFile(path.join(sharedPath, "build.include"), "utf8");
      ig.add(content);
    } catch { /* no shared build.include — skip */ }
  }

  try {
    const content = await fs.readFile(path.join(centrePath, "build.include"), "utf8");
    ig.add(content);
  } catch { /* no release build.include — copy nothing */ }

  return ig;
}

// Check if a relative path should be INCLUDED by the compiled patterns.
// Returns true if the path matches at least one pattern (positive match).
// Returns false if no patterns exist or no match found.
export function isIncluded(ig, relPath) {
  if (!ig) return false;
  const normalized = relPath.replace(/\\/g, "/");
  return ig.ignores(normalized);
}
