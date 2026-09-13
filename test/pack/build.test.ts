import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPacks } from "../../tools/build.ts";
import { readStrictJson } from "../../tools/lib/json.ts";
import { DIST_BP, DIST_RP, REPO_ROOT } from "../../tools/lib/paths.ts";
import { packageArchives } from "../../tools/package.ts";
import { validateBuild } from "../../tools/validate.ts";

// Builds the real packs once and checks what a player would install. Slow-ish (esbuild + 300 JSON files),
// which is why it lives in its own file.
describe("built packs", () => {
  beforeAll(async () => {
    await buildPacks();
  }, 60_000);

  it("pass structural validation", () => {
    const report = validateBuild();
    expect(report.errors).toEqual([]);
    expect(report.counts["minecraft:item"]).toBeGreaterThan(0);
  });

  it("bundle one script that only imports the engine modules", () => {
    const bundle = fs.readFileSync(path.join(DIST_BP, "scripts", "main.js"), "utf8");
    const imports = [...bundle.matchAll(/^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm)].map(
      (match) => match[1],
    );
    expect(new Set(imports)).toEqual(new Set(["@minecraft/server", "@minecraft/server-ui"]));
    expect(bundle).toContain('NAMESPACE = "elleedog67"');
    expect(bundle).toContain(":enable");
    expect(bundle).toContain(":feature_book");
    // Object.hasOwn is ES2022; the guarded polyfill in src/core/polyfills.ts must come before any feature code.
    expect(bundle.indexOf('Object.defineProperty(Object, "hasOwn"')).toBeGreaterThan(-1);
    expect(bundle.indexOf('Object.defineProperty(Object, "hasOwn"')).toBeLessThan(bundle.indexOf("Object.hasOwn("));
  });

  it("carry the license and notices in both packs", () => {
    for (const root of [DIST_BP, DIST_RP]) {
      expect(fs.existsSync(path.join(root, "LICENSE"))).toBe(true);
      expect(fs.existsSync(path.join(root, "THIRD_PARTY_NOTICES.md"))).toBe(true);
    }
  });

  it("agree with package.json on the version", () => {
    const version = (readStrictJson(path.join(REPO_ROOT, "package.json")) as { version: string }).version;
    const manifest = readStrictJson(path.join(DIST_BP, "manifest.json")) as { header: { version: number[] } };
    expect(manifest.header.version.join(".")).toBe(version);
  });

  it("package into deterministic archives", () => {
    const first = packageArchives().map((file) => fs.readFileSync(file));
    const second = packageArchives().map((file) => fs.readFileSync(file));
    expect(first.map((buffer) => buffer.length)).toEqual(second.map((buffer) => buffer.length));
    for (const [index, buffer] of first.entries()) {
      expect(buffer.equals(second[index] as Buffer)).toBe(true);
    }
  });
});
