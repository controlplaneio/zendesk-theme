import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { appendOrAdd } from "../utils/additions/append-or-add.mjs";

describe("append or add additions", () => {
  const tmpDir = path.join(process.cwd(), "__tests__", ".fixtures-append-or-add");

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function setup() {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
    return tmpDir;
  }

  const test = ({ name, targetExists, additionContent, expected }) => {
    it(name, async () => {
      const tmpDir = await setup();
      const additionFile = path.join(tmpDir, "addition.txt");
      const targetPath = path.join(tmpDir, "target.txt");

      await fs.writeFile(additionFile, additionContent);
      if (targetExists) {
        await fs.writeFile(targetPath, targetExists);
      }

      await appendOrAdd(additionFile, targetPath);

      const result = await fs.readFile(targetPath, "utf8");
      expect(result).toBe(expected);
    });
  };

  function testMatrix(cases) {
    cases.forEach(test);
  }

  testMatrix([
    {
      name: "appends to existing file",
      targetExists: "original content\n",
      additionContent: "added content",
      expected: "original content\n\nadded content",
    },
    {
      name: "creates file when target does not exist",
      targetExists: null,
      additionContent: "new content",
      expected: "new content",
    },
    {
      name: "appends across nested directories",
      targetExists: "existing\n",
      additionContent: "appended",
      expected: "existing\n\nappended",
    },
  ]);
});
