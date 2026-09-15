import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { mergeTranslation } from "../utils/additions/translation-merge.mjs";

describe("translation merging in additions", () => {
  const tmpDir = path.join(process.cwd(), "__tests__", ".fixtures");

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function setup(themeKeys, additionKeys) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const themeTranslations = path.join(tmpDir, "theme", "translations");
    await fs.mkdir(themeTranslations, { recursive: true });
    await fs.writeFile(
      path.join(themeTranslations, "en-gb.json"),
      JSON.stringify(themeKeys, null, 2) + "\n",
    );

    const centreAdditions = path.join(
      tmpDir,
      "centre",
      "additions",
      "translations",
    );
    await fs.mkdir(centreAdditions, { recursive: true });
    await fs.writeFile(
      path.join(centreAdditions, "en-gb.json"),
      JSON.stringify(additionKeys, null, 2) + "\n",
    );

    return { themeTranslations, centreAdditions };
  }

  const test = ({ name, themeKeys, additionKeys, buildExists, expected }) => {
    it(name, async () => {
      const { themeTranslations, centreAdditions } = await setup(
        themeKeys,
        additionKeys,
      );

      const buildPath = path.join(tmpDir, "build");
      const targetPath = path.join(buildPath, "translations", "en-gb.json");
      const additionFile = path.join(centreAdditions, "en-gb.json");

      if (buildExists) {
        await fs.mkdir(path.join(buildPath, "translations"), {
          recursive: true,
        });
        await fs.copyFile(
          path.join(themeTranslations, "en-gb.json"),
          targetPath,
        );
      }

      await mergeTranslation(
        additionFile,
        targetPath,
        path.join(themeTranslations, "en-gb.json"),
      );

      const result = JSON.parse(await fs.readFile(targetPath, "utf8"));
      for (const [key, value] of Object.entries(expected)) {
        expect(result[key]).toBe(value);
      }
    });
  };

  function testMatrix(cases) {
    cases.forEach(test);
  }

  testMatrix([
    {
      name: "merges new keys into existing file",
      themeKeys: { existing_key: "existing_value", shared_added: "shared_val" },
      additionKeys: { new_key: "new_value", shared_added: "overridden_val" },
      buildExists: true,
      expected: {
        existing_key: "existing_value",
        shared_added: "shared_val",
        new_key: "new_value",
      },
    },
    {
      name: "key count includes only theme + new keys",
      themeKeys: { a: 1, b: 2 },
      additionKeys: { c: 3, d: 4 },
      buildExists: true,
      expected: { a: 1, b: 2, c: 3, d: 4 },
    },
    {
      name: "writes content when target does not exist",
      themeKeys: { existing_key: "existing_value" },
      additionKeys: { new_key: "new_value" },
      buildExists: false,
      expected: { existing_key: "existing_value", new_key: "new_value" },
    },
  ]);
});
