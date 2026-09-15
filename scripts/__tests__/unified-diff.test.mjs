import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { applyUnifiedDiff } from "../utils/additions/apply-unified-diff.mjs";

describe("unified diff patch application", () => {
  const tmpDir = path.join(process.cwd(), "__tests__", ".fixtures-unified-diff");

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function setup() {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const buildDir = path.join(tmpDir, "build", "templates");
    await fs.mkdir(buildDir, { recursive: true });
    await fs.writeFile(
      path.join(buildDir, "document.hbs"),
      "line1\nline2\nline3\n"
    );

    return tmpDir;
  }

  const test = async ({ name, fn }) => {
    it(name, async () => {
      await fn();
    });
  };

  test({
    name: "inserts lines at correct position",
    fn: async () => {
      const tmpDir = await setup();
      const buildDir = path.join(tmpDir, "build");

      const patch = [
        "--- a/templates/document.hbs",
        "+++ b/templates/document.hbs",
        "@@ -1,3 +1,4 @@",
        " line1",
        "+inserted line",
        " line2",
        " line3",
      ].join("\n");

      await applyUnifiedDiff(patch, buildDir);

      const result = await fs.readFile(path.join(buildDir, "templates", "document.hbs"), "utf8");
      expect(result).toBe("line1\ninserted line\nline2\nline3\n");
    },
  });

  test({
    name: "skips hunks when target file does not exist",
    fn: async () => {
      const tmpDir = await setup();
      const buildDir = path.join(tmpDir, "build");

      const patch = [
        "--- a/templates/missing.hbs",
        "+++ b/templates/missing.hbs",
        "@@ -1 +1,2 @@",
        "+new file line",
      ].join("\n");

      await applyUnifiedDiff(patch, buildDir);
      // Should not error — just skips
    },
  });

  test({
    name: "inserts multiple lines in a single hunk",
    fn: async () => {
      const tmpDir = await setup();
      const buildDir = path.join(tmpDir, "build");

      const patch = [
        "--- a/templates/document.hbs",
        "+++ b/templates/document.hbs",
        "@@ -1,3 +1,5 @@",
        " line1",
        "+new line A",
        "+new line B",
        " line2",
        " line3",
      ].join("\n");

      await applyUnifiedDiff(patch, buildDir);

      const result = await fs.readFile(path.join(buildDir, "templates", "document.hbs"), "utf8");
      expect(result).toBe("line1\nnew line A\nnew line B\nline2\nline3\n");
    },
  });
});

// These lock in the semantics `git apply` gives us, since that is what the
// build shells out to.
describe("unified diff deletions and replacements", () => {
  const tmpDir = path.join(process.cwd(), "__tests__", ".fixtures-unified-diff-delete");

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function setup(content = "line1\nline2\nline3\n") {
    await fs.rm(tmpDir, { recursive: true, force: true });
    const buildDir = path.join(tmpDir, "build", "templates");
    await fs.mkdir(buildDir, { recursive: true });
    await fs.writeFile(path.join(buildDir, "document.hbs"), content);
    return path.join(tmpDir, "build");
  }

  const read = (buildDir) =>
    fs.readFile(path.join(buildDir, "templates", "document.hbs"), "utf8");

  const diff = (...body) =>
    ["--- a/templates/document.hbs", "+++ b/templates/document.hbs", ...body].join("\n");

  it("removes lines marked with -", async () => {
    const buildDir = await setup();

    await applyUnifiedDiff(diff("@@ -1,3 +1,2 @@", " line1", "-line2", " line3"), buildDir);

    expect(await read(buildDir)).toBe("line1\nline3\n");
  });

  it("replaces a line, keeping order of - then +", async () => {
    const buildDir = await setup();

    await applyUnifiedDiff(
      diff("@@ -1,3 +1,3 @@", " line1", "-line2", "+replaced", " line3"),
      buildDir
    );

    expect(await read(buildDir)).toBe("line1\nreplaced\nline3\n");
  });

  it("reindents a line without duplicating it", async () => {
    const buildDir = await setup('<div>\n<img src="a" />\n</div>\n');

    await applyUnifiedDiff(
      diff(
        "@@ -1,3 +1,5 @@",
        " <div>",
        '-<img src="a" />',
        "+  {{#if x}}",
        '+    <img src="a" />',
        "+  {{/if}}",
        " </div>"
      ),
      buildDir
    );

    expect(await read(buildDir)).toBe(
      '<div>\n  {{#if x}}\n    <img src="a" />\n  {{/if}}\n</div>\n'
    );
  });

  it("applies multiple hunks, tracking line drift between them", async () => {
    const buildDir = await setup("a\nb\nc\nd\ne\nf\ng\n");

    await applyUnifiedDiff(
      diff(
        "@@ -1,3 +1,2 @@",
        " a",
        "-b",
        " c",
        "@@ -5,3 +4,4 @@",
        " e",
        "+inserted",
        " f",
        " g"
      ),
      buildDir
    );

    expect(await read(buildDir)).toBe("a\nc\nd\ne\ninserted\nf\ng\n");
  });

  it("finds context that has drifted from the line number in the header", async () => {
    // Upstream grew two lines above the hunk; the patch should still land.
    const buildDir = await setup("new1\nnew2\na\nb\nline1\nline2\nline3\n");

    await applyUnifiedDiff(
      diff("@@ -3,3 +3,3 @@", " line1", "-line2", "+replaced", " line3"),
      buildDir
    );

    expect(await read(buildDir)).toBe("new1\nnew2\na\nb\nline1\nreplaced\nline3\n");
  });

  it("anchors a hunk that starts at line 1, so drift above it is a conflict", async () => {
    // git apply treats a hunk starting at line 1 as pinned to the top of the
    // file. Patches that insert into a file head (document_head.hbs) need
    // regenerating if upstream changes the first line.
    const buildDir = await setup("new upstream line\nline1\nline2\nline3\n");

    await expect(
      applyUnifiedDiff(
        diff("@@ -1,3 +1,4 @@", " line1", "+inserted", " line2", " line3"),
        buildDir
      )
    ).rejects.toThrow(/does not apply/);
  });

  it("throws when the context no longer matches", async () => {
    const buildDir = await setup("totally\ndifferent\ncontent\n");

    await expect(
      applyUnifiedDiff(
        diff("@@ -1,3 +1,3 @@", " line1", "-line2", "+replaced", " line3"),
        buildDir,
        "0001-example.patch"
      )
    ).rejects.toThrow(/failed to apply 0001-example\.patch/);
  });

  it("rejects a hunk with no context lines", async () => {
    // git apply needs context to locate a hunk; `git diff` always emits it.
    const buildDir = await setup();

    await expect(
      applyUnifiedDiff(diff("@@ -2,1 +2,1 @@", "-line2", "+two"), buildDir)
    ).rejects.toThrow(/does not apply/);
  });

  it("patches more than one file from a single diff", async () => {
    const buildDir = await setup();
    await fs.writeFile(path.join(buildDir, "templates", "other.hbs"), "x\ny\nz\n");

    const patch = [
      diff("@@ -1,3 +1,3 @@", " line1", "-line2", "+two", " line3"),
      "--- a/templates/other.hbs",
      "+++ b/templates/other.hbs",
      "@@ -1,3 +1,4 @@",
      " x",
      "+middle",
      " y",
      " z",
    ].join("\n");

    await applyUnifiedDiff(patch, buildDir);

    expect(await read(buildDir)).toBe("line1\ntwo\nline3\n");
    expect(await fs.readFile(path.join(buildDir, "templates", "other.hbs"), "utf8")).toBe(
      "x\nmiddle\ny\nz\n"
    );
  });

  it("skips only the chunks whose target is missing from the build", async () => {
    // A shared patch may touch a file a centre leaves out via build.include.
    const buildDir = await setup();

    const patch = [
      "--- a/templates/excluded.hbs",
      "+++ b/templates/excluded.hbs",
      "@@ -1,3 +1,4 @@",
      " x",
      "+middle",
      " y",
      " z",
      diff("@@ -1,3 +1,3 @@", " line1", "-line2", "+two", " line3"),
    ].join("\n");

    await applyUnifiedDiff(patch, buildDir);

    expect(await read(buildDir)).toBe("line1\ntwo\nline3\n");
  });

  it("honours the no-newline marker", async () => {
    const buildDir = await setup("line1\nline2\nline3\n");

    await applyUnifiedDiff(
      diff(
        "@@ -1,3 +1,3 @@",
        " line1",
        " line2",
        "-line3",
        "+line3 without trailing newline",
        "\\ No newline at end of file"
      ),
      buildDir
    );

    expect(await read(buildDir)).toBe("line1\nline2\nline3 without trailing newline");
  });
});
