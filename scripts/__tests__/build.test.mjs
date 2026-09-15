import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(new URL("./", import.meta.url)));
const buildScript = path.join(scriptsDir, "build.mjs");

// End-to-end: run build.mjs against a miniature theme so the layering rules
// (base copy → shared → centre) are exercised the way a real build hits them.
describe("build pipeline", () => {
  const tmpDir = path.join(scriptsDir, "__tests__", ".fixtures-build");

  const write = async (relPath, content) => {
    const full = path.join(tmpDir, relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  };

  const read = (relPath) => fs.readFile(path.join(tmpDir, relPath), "utf8");
  const readJson = async (relPath) => JSON.parse(await read(relPath));

  beforeAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });

    // ── base theme ──
    await write("copenhagen_theme/style.css", ".base { color: red; }");
    await write(
      "copenhagen_theme/manifest.json",
      JSON.stringify({ name: "Copenhagen", author: "Zendesk", version: "4.47.2" }, null, 2)
    );
    await write("copenhagen_theme/templates/header.hbs", "<header>\n<img src=\"logo\" />\n</header>\n");
    await write("copenhagen_theme/templates/footer.hbs", "<footer>base</footer>\n");
    await write(
      "copenhagen_theme/translations/en-us.json",
      JSON.stringify({ base_key: "base" }, null, 2)
    );
    await write("copenhagen_theme/script.js", "// base script\n");

    // ── shared layer ──
    await write("shared/build.include", "templates/\ntranslations/\nscript.js\n");
    await write("shared/manifest.patch.json", JSON.stringify([
      { op: "replace", path: "/author", value: "ControlPlane" },
    ]));
    await write("shared/replacements/templates/footer.hbs", "<footer>shared</footer>\n");
    await write("shared/additions/translations/en-us.json", JSON.stringify({ shared_key: "shared" }));
    await write("shared/additions/script.js", "// shared script\n");

    // ── centre layers ──
    await write("external/manifest.patch.json", JSON.stringify([
      { op: "replace", path: "/name", value: "External" },
    ]));
    await write("external/additions/style.css", '@import url("ignored.css");\n.external { color: blue; }');
    await write("external/additions/translations/en-us.json", JSON.stringify({ external_key: "external" }));
    await write("external/3001-wrap-logo.patch", [
      "--- a/templates/header.hbs",
      "+++ b/templates/header.hbs",
      "@@ -1,3 +1,5 @@",
      " <header>",
      "-<img src=\"logo\" />",
      "+  {{#if settings.logo}}",
      "+    <img src=\"logo\" />",
      "+  {{/if}}",
      " </header>",
      "",
    ].join("\n"));

    await write("internal/manifest.patch.json", JSON.stringify([
      { op: "replace", path: "/name", value: "Internal" },
    ]));
    await write("internal/additions/style.css", ".internal { color: green; }");

    await run(process.execPath, [buildScript], { cwd: tmpDir });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("copies the base theme through build.include", async () => {
    expect(await read("external/build/script.js")).toContain("// base script");
    expect(await read("internal/build/templates/header.hbs")).toContain("<header>");
  });

  it("applies a centre additions/<dir>/ translation merge", async () => {
    // Regression: the centre additions loop used to skip directories entirely.
    const t = await readJson("external/build/translations/en-us.json");
    expect(t).toEqual({ base_key: "base", shared_key: "shared", external_key: "external" });
  });

  it("keeps centre-only translations out of the other centre", async () => {
    const t = await readJson("internal/build/translations/en-us.json");
    expect(t).toEqual({ base_key: "base", shared_key: "shared" });
  });

  it("keeps shared replacements, rather than letting the base copy overwrite them", async () => {
    // Regression: shared replacements ran before the base theme was copied.
    expect(await read("external/build/templates/footer.hbs")).toBe("<footer>shared</footer>\n");
    expect(await read("internal/build/templates/footer.hbs")).toBe("<footer>shared</footer>\n");
  });

  it("appends shared additions to a theme root file", async () => {
    const script = await read("external/build/script.js");
    expect(script).toBe("// base script\n\n// shared script\n");
  });

  it("appends centre additions to style.css and strips @import", async () => {
    const css = await read("external/build/style.css");
    expect(css).toBe(".base { color: red; }\n.external { color: blue; }");
    expect(css).not.toContain("@import");

    expect(await read("internal/build/style.css")).toBe(".base { color: red; }\n.internal { color: green; }");
  });

  it("layers shared then centre JSON patches onto the base manifest", async () => {
    expect(await readJson("external/build/manifest.json")).toEqual({
      name: "External",
      author: "ControlPlane",
      version: "4.47.2",
    });
    expect(await readJson("internal/build/manifest.json")).toEqual({
      name: "Internal",
      author: "ControlPlane",
      version: "4.47.2",
    });
  });

  it("applies a centre unified diff patch, deletions included", async () => {
    expect(await read("external/build/templates/header.hbs")).toBe(
      "<header>\n  {{#if settings.logo}}\n    <img src=\"logo\" />\n  {{/if}}\n</header>\n"
    );
    // Centre patches must not leak into the other centre
    expect(await read("internal/build/templates/header.hbs")).toBe(
      "<header>\n<img src=\"logo\" />\n</header>\n"
    );
  });
});
