import fs from "node:fs/promises";
import path from "node:path";

// Append addition content to an existing file, or create it if it doesn't exist.
// If filter is provided, it transforms the addition content before writing.
export async function appendOrAdd(additionPath, targetPath, filter) {
  let content = await fs.readFile(additionPath, "utf8");
  if (filter) content = filter(content);

  const exists = await fs.stat(targetPath).then(() => true).catch(() => false);

  if (exists) {
    const existingContent = await fs.readFile(targetPath, "utf8");
    await fs.writeFile(targetPath, existingContent + "\n" + content);
  } else {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content);
  }
}
