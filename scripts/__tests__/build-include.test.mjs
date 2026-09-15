import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { loadIncludePatterns, isIncluded } from "../utils/build-include.mjs";

describe("build.include pattern loading", () => {
  const base = path.join(process.cwd(), "__tests__", ".fixtures-build-include");

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  async function load(shared, centre) {
    await fs.rm(base, { recursive: true, force: true });
    const centreDir = path.join(base, "centre");
    await fs.mkdir(centreDir, { recursive: true });
    if (shared) {
      const sharedDir = path.join(base, "shared");
      await fs.mkdir(sharedDir, { recursive: true });
      await fs.writeFile(path.join(sharedDir, "build.include"), shared);
    }
    if (centre) {
      await fs.writeFile(path.join(centreDir, "build.include"), centre);
    }
    return loadIncludePatterns(
      centreDir,
      shared ? path.join(base, "shared") : null,
    );
  }

  const test = ({ name, shared = [], centre = [], cases }) => {
    it(name, async () => {
      const s = Array.isArray(shared) ? shared.join("\n") : shared;
      const c = Array.isArray(centre) ? centre.join("\n") : centre;
      const ig = await load(s, c);
      for (const [p, expected] of Object.entries(cases)) {
        expect(isIncluded(ig, p)).toBe(expected);
      }
    });
  };

  function testMatrix(cases) {
    cases.forEach(test);
  }

  testMatrix([
    {
      name: "compounds shared + centre",
      shared: ["templates/*", "translations/*"],
      centre: ["assets/"],
      cases: {
        "templates/x.hbs": true,
        "translations/en.json": true,
        "assets/icon.svg": true,
      },
    },
    {
      name: "centre negation overrides shared",
      shared: ["templates/*"],
      centre: ["!templates/skip.hbs"],
      cases: { "templates/good.hbs": true, "templates/skip.hbs": false },
    },
    {
      name: "empty patterns means nothing included",
      shared: [""],
      centre: [""],
      cases: { "anything.txt": false },
    },
    {
      name: "no patterns means nothing included",
      shared: [],
      centre: [],
      cases: { "anything.txt": false },
    },
    {
      name: "only shared patterns",
      shared: ["translations/*"],
      centre: null,
      cases: { "translations/en.json": true, "templates/x.hbs": false },
    },
    {
      name: "only centre patterns",
      shared: null,
      centre: ["assets/"],
      cases: { "assets/icon.svg": true, "translations/en.json": false },
    },
  ]);
});
