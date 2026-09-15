import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { applyReplacements } from "../utils/additions/replacements.mjs";

describe("replacements", () => {
  const tmpDir = path.join(process.cwd(), "__tests__", ".fixtures-replacements");

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function setup() {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const buildDir = path.join(tmpDir, "build");
    await fs.mkdir(buildDir, { recursive: true });

    // Create a target directory in the build with an existing file
    const buildTemplates = path.join(buildDir, "templates");
    await fs.mkdir(buildTemplates, { recursive: true });
    await fs.writeFile(path.join(buildTemplates, "document.hbs"), "original content\n");

    return tmpDir;
  }

  const test = async ({ name, fn }) => {
    it(name, async () => {
      await fn();
    });
  };

  test({
    name: "overwrites existing files",
    fn: async () => {
      const tmpDir = await setup();
      const buildDir = path.join(tmpDir, "build");

      // Replacement dir mirrors build structure: replacements/templates/ → build/templates/
      const replacementsDir = path.join(tmpDir, "replacements");
      await fs.mkdir(path.join(replacementsDir, "templates"), { recursive: true });
      await fs.writeFile(
        path.join(replacementsDir, "templates", "document.hbs"),
        "replaced content\n"
      );

      await applyReplacements(replacementsDir, buildDir, "templates", null);

      const result = await fs.readFile(path.join(buildDir, "templates", "document.hbs"), "utf8");
      expect(result).toBe("replaced content\n");
    },
  });

  test({
    name: "errors when target directory does not exist in build",
    fn: async () => {
      const tmpDir = await setup();
      const buildDir = path.join(tmpDir, "build");

      // Try to replace a directory that doesn't exist in build
      const replacementsDir = path.join(tmpDir, "replacements");
      await fs.mkdir(path.join(replacementsDir, "nonexistent"), { recursive: true });
      await fs.writeFile(path.join(replacementsDir, "nonexistent", "file.txt"), "content\n");

      await expect(
        applyReplacements(replacementsDir, buildDir, "nonexistent", null)
      ).rejects.toThrow("replacement target does not exist");
    },
  });
});
