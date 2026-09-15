import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

// Split a unified diff into one chunk per target file, so chunks aimed at
// files a centre excludes via build.include can be dropped before git sees
// them. Anything before the first file header (a commit message from
// `git format-patch`, say) is discarded.
function splitByFile(patchContent) {
  const lines = patchContent.split("\n");
  const chunks = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeader =
      line.startsWith("diff --git ") ||
      (line.startsWith("--- ") && (lines[i + 1] ?? "").startsWith("+++ "));

    if (isHeader) {
      const plusLine = line.startsWith("diff --git ") ? lines[i + 2] : lines[i + 1];
      const file = (plusLine ?? "")
        .replace(/^\+\+\+ /, "")
        .replace(/\t.*$/, "")
        .trim()
        .replace(/^[ab]\//, "");

      current = { file, lines: [] };
      chunks.push(current);
    }

    if (current) current.lines.push(line);
  }

  return chunks;
}

// Apply a unified diff (.patch) to the build tree with `git apply`, so patches
// behave exactly as they do on the command line — context matching, line
// offsets and all.
//
// Patches must use the `a/` `b/` path prefixes that `git diff` emits; paths are
// relative to the theme root. Chunks targeting files that aren't in the build
// are skipped, which is how a shared patch can touch a file a centre leaves
// out. Anything else that fails to apply throws, so a patch rotting against an
// upstream bump fails the build rather than half-patching the theme.
export async function applyUnifiedDiff(patchContent, buildPath, patchName = "patch") {
  const chunks = [];
  for (const chunk of splitByFile(patchContent)) {
    const exists = await fs
      .stat(path.join(buildPath, chunk.file))
      .then(() => true)
      .catch(() => false);
    if (exists) chunks.push(chunk.lines.join("\n"));
  }

  if (chunks.length === 0) return;

  const patch = chunks.join("\n").replace(/\n*$/, "\n");

  await new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      ["apply", "--whitespace=nowarn", "-"],
      { cwd: buildPath },
      (error, stdout, stderr) => {
        if (!error) return resolve();
        reject(new Error(`failed to apply ${patchName}:\n${(stderr || stdout || error.message).trim()}`));
      }
    );
    child.stdin.end(patch);
  });
}
