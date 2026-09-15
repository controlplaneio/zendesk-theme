#!/usr/bin/env node
import fs from "node:fs";
import * as _ from "lodash-es";

const [oldPath, newerPath] = process.argv.slice(2);
if (!oldPath || !newerPath) {
  console.error("Usage: node gen-json-patch.mjs <old.json> <new.json>");
  process.exit(1);
}

const old = JSON.parse(fs.readFileSync(oldPath, "utf8"));
const newer = JSON.parse(fs.readFileSync(newerPath, "utf8"));

// TODO: handle warnings inside smartCompare
const warnings = [];
function smartCompare(a, b, path = "") {
  const ops = [];

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === b.length) {
      // Same length — recurse index by index for targeted replaces
      let allEqual = true;
      for (let i = 0; i < a.length; i++) {
        const sub = smartCompare(a[i], b[i], path + "/" + i);
        if (sub.length > 0) allEqual = false;
        ops.push(...sub);
      }
      if (allEqual) return ops;
    } else {
      // Different lengths — find prefix/suffix alignment to detect insertions
      let prefixLen = 0;
      while (
        prefixLen < a.length &&
        prefixLen < b.length &&
        _.isEqual(a[prefixLen], b[prefixLen])
      ) {
        prefixLen++;
      }

      // Align suffix from the end, accounting for different array lengths.
      // The shared tail starts at index (a.length - suffixLenA) in a
      // and (b.length - suffixLenB) in b, but we need to find where they
      // actually align — compare from the end moving backwards past prefix.
      let i = a.length - 1;
      let j = b.length - 1;
      while (i >= prefixLen && j >= prefixLen && _.isEqual(a[i], b[j])) {
        i--;
        j--;
      }
      const suffixLenA = a.length - 1 - i;
      const suffixLenB = b.length - 1 - j;

      const removedCount = a.length - prefixLen - suffixLenA;
      const addedCount = b.length - prefixLen - suffixLenB;

      // Warn on prepends (nothing matched at the front but tail aligned)
      if (prefixLen === 0 && addedCount > 0) {
        warnings.push({
          path,
          kind: "array prepend",
        });
      }

      // If nothing matched at the front (prepend), try to find where a's items
      // appear as a contiguous block inside b. If found, the gap is an insertion.
      let insertIdx = -1;
      if (prefixLen === 0) {
        for (let s = 0; s <= b.length - a.length; s++) {
          let match = true;
          for (let k = 0; k < a.length; k++) {
            if (!_.isEqual(a[k], b[s + k])) { match = false; break; }
          }
          if (match) { insertIdx = s; break; }
        }
        if (insertIdx >= 0) {
          // Old items found contiguously at insertIdx in b — add new items before them
          for (let k = 0; k < insertIdx; k++) {
            ops.push({ op: "add", path: path + "/" + k, value: b[k] });
          }
        } else if (removedCount > 0 && addedCount === 0) {
          // Items were removed from the front — replace whole array
          ops.push({ op: "replace", path, value: b });
        } else {
          // Fallback: items were inserted at the front or mixed — recurse into each old item
          // against corresponding new items to find nested changes, plus add truly new items
          for (let k = 0; k < a.length && k < b.length; k++) {
            ops.push(...smartCompare(a[k], b[k], path + "/" + k));
          }
          for (let k = a.length; k < b.length; k++) {
            ops.push({ op: "add", path: path + "/" + k, value: b[k] });
          }
        }
      } else {
        // Remove extra old items (from the middle)
        for (let i = 0; i < removedCount; i++) {
          ops.push({ op: "remove", path: path + "/" + prefixLen });
        }

        // Add new items (at the insertion point)
        for (let i = 0; i < addedCount; i++) {
          ops.push({
            op: "add",
            path: path + "/" + prefixLen,
            value: b[prefixLen + i],
          });
        }

        // Recurse into matched prefix items
        for (let i = 0; i < prefixLen; i++) {
          ops.push(...smartCompare(a[i], b[i], path + "/" + i));
        }

        // Recurse into suffix items
        for (let i = 0; i < suffixLenA; i++) {
          const idx = a.length - suffixLenA + i;
          ops.push(
            ...smartCompare(
              a[idx],
              b[b.length - suffixLenA + i],
              path + "/" + idx,
            ),
          );
        }
      }
    }
  } else if (
    typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null
  ) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const newPath = path + "/" + key;
      if (!(key in a)) {
        ops.push({ op: "add", path: newPath, value: b[key] });
      } else if (!(key in b)) {
        ops.push({ op: "remove", path: newPath });
      } else if (!_.isEqual(a[key], b[key])) {
        ops.push(...smartCompare(a[key], b[key], newPath));
      }
    }
  } else if (!_.isEqual(a, b)) {
    ops.push({ op: "replace", path, value: b });
  }

  ops.sort((a, b) => a.path.localeCompare(b.path));

  return ops;
}

const ops = smartCompare(old, newer);
console.log(JSON.stringify(ops, null, 2));
warnings.forEach((w) => {
  switch (w.kind) {
    // when an array is prepended to our only option is a cascading replace
    // 0 -> 1, 1 -> 2, 2 -> 3 etc
    // or the option we've gone for which is a full array replace
    // it's better if possible to just append to the rear of the array
    case "array prepend":
      console.error(
        "warning: array prepend detected at " + w.path,
        "-> consider adding new items at the end of the list to avoid replacing the whole array",
      );
      break;
    default:
      console.error(`unknown warning of ${w.kind} at ${w.path}`);
      break;
  }
});
