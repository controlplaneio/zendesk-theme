#!/usr/bin/env node
import fs from "node:fs";
import fjp from "fast-json-patch";

const [manifestPath, patchPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !patchPath) {
  console.error(
    "Usage: node apply.mjs <manifest.json> <patch.json> [output.json]",
  );
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const patches = JSON.parse(fs.readFileSync(patchPath, "utf8"));

const result = fjp.applyPatch(doc, patches);
if (result.error) {
  console.error("Patch error:", result.error);
  process.exit(1);
}

// because we output using console.log we don't need to add a trailing newline
const output = JSON.stringify(result.newDocument, null, 2);
if (outputPath) {
  fs.writeFileSync(outputPath, output);
  console.error("Wrote", outputPath);
} else {
  console.log(output);
}
