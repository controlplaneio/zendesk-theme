import fs from "node:fs/promises";
import path from "node:path";

// Merge addition content into a translation JSON file.
// - New keys are appended to the existing theme keys.
// - Existing keys from the original theme are never overwritten.
// - If the target file does not exist, creates it with merged content (original + new additions).
export async function mergeTranslation(additionPath, buildPath, themePath) {
  const additionContent = await fs.readFile(additionPath, "utf8");
  const parsed = JSON.parse(additionContent);

  const exists = await fs.stat(buildPath).then(() => true).catch(() => false);
  let original;

  if (exists) {
    const existingContent = await fs.readFile(buildPath, "utf8");
    original = JSON.parse(existingContent);
  } else {
    original = JSON.parse(await fs.readFile(themePath, "utf8"));
  }

  const merged = { ...original };
  for (const [k, v] of Object.entries(parsed)) {
    if (!(k in original)) {
      merged[k] = v;
    }
  }

  await fs.mkdir(path.dirname(buildPath), { recursive: true });
  await fs.writeFile(buildPath, JSON.stringify(merged, null, 2) + "\n");
}
