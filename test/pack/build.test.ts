import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPacks } from "../../tools/build.ts";
import { readStrictJson } from "../../tools/lib/json.ts";
import { CORE_BEHAVIOR_ID, distDir, loadPacks } from "../../tools/lib/packs.ts";
import { REPO_ROOT } from "../../tools/lib/paths.ts";
import { expectedManifest } from "../../tools/manifests.ts";
import { packageArchives } from "../../tools/package.ts";
import { validateBuild } from "../../tools/validate.ts";

// Builds the real packs once and checks what a player would install. Slow-ish (esbuild + hundreds of JSON files),
// which is why it lives in its own file.
describe("built packs", () => {
  beforeAll(async () => {
    await buildPacks();
  }, 60_000);

  it("pass structural validation", () => {
    const report = validateBuild();
    expect(report.errors).toEqual([]);
    expect(report.counts.packs).toBe(9);
    expect(report.counts["minecraft:item"]).toBeGreaterThan(0);
  });

  it("carry one manifest per pack, generated from packs.json, with the dependency graph the manual describes", () => {
    const packs = loadPacks();
    expect(packs).toHaveLength(9);
    for (const pack of packs) {
      const manifest = readStrictJson(path.join(distDir(pack.id), "manifest.json"));
      expect(manifest, pack.id).toEqual(expectedManifest(pack));
    }
    const byId = new Map(packs.map((pack) => [pack.id, pack]));
    for (const pack of packs) {
      if (pack.kind !== "behavior" || pack.id === CORE_BEHAVIOR_ID) continue;
      expect(pack.dependsOn, pack.id).toContain(CORE_BEHAVIOR_ID);
      const own = packs.filter((candidate) => candidate.feature === pack.feature && candidate.kind === "resources");
      for (const resource of own) expect(pack.dependsOn, pack.id).toContain(resource.id);
    }
    expect(byId.get("pets")?.dependsOn).not.toContain("rbow-ore");
    expect(byId.get("rbow-ore")?.dependsOn).not.toContain("pets");
    expect(byId.get(CORE_BEHAVIOR_ID)?.dependsOn).toEqual(["elleedog67-resources"]);
  });

  it("bundle one script, only in the core, that only imports the engine modules", () => {
    const bundle = fs.readFileSync(path.join(distDir(CORE_BEHAVIOR_ID), "scripts", "main.js"), "utf8");
    const imports = [...bundle.matchAll(/^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm)].map(
      (match) => match[1],
    );
    expect(new Set(imports)).toEqual(new Set(["@minecraft/server", "@minecraft/server-ui"]));
    expect(bundle).toContain('NAMESPACE = "elleedog67"');
    expect(bundle).toContain(":feature_book");
    // Object.hasOwn is ES2022; the guarded polyfill in src/core/polyfills.ts must come before any feature code.
    expect(bundle.indexOf('Object.defineProperty(Object, "hasOwn"')).toBeGreaterThan(-1);
    expect(bundle.indexOf('Object.defineProperty(Object, "hasOwn"')).toBeLessThan(bundle.indexOf("Object.hasOwn("));
    for (const pack of loadPacks()) {
      if (pack.id !== CORE_BEHAVIOR_ID)
        expect(fs.existsSync(path.join(distDir(pack.id), "scripts")), pack.id).toBe(false);
    }
  });

  it("carry the license and notices in every pack", () => {
    for (const pack of loadPacks()) {
      expect(fs.existsSync(path.join(distDir(pack.id), "LICENSE")), pack.id).toBe(true);
      expect(fs.existsSync(path.join(distDir(pack.id), "THIRD_PARTY_NOTICES.md")), pack.id).toBe(true);
    }
  });

  it("ship the player override identically in Pets and Rbow Ore, and Rbow's standalone attachables", () => {
    const pets = fs.readFileSync(path.join(distDir("pets"), "entities", "overrides", "player.json"));
    const rbow = fs.readFileSync(path.join(distDir("rbow-ore"), "entities", "overrides", "player.json"));
    expect(pets.equals(rbow)).toBe(true);
    for (const name of ["rbow_helmet.player.json", "rbow_boots.player.json", "rbow_spear_native.json"]) {
      expect(fs.existsSync(path.join(distDir("rbow-ore-resources"), "attachables", name)), name).toBe(true);
      expect(fs.existsSync(path.join(distDir("pets-resources"), "attachables", name)), name).toBe(true);
    }
  });

  it("agree with package.json on the version", () => {
    const version = (readStrictJson(path.join(REPO_ROOT, "package.json")) as { version: string }).version;
    for (const pack of loadPacks()) {
      const manifest = readStrictJson(path.join(distDir(pack.id), "manifest.json")) as {
        header: { version: number[] };
      };
      expect(manifest.header.version.join("."), pack.id).toBe(version);
    }
  });

  it("package every pack into one deterministic .mcaddon", () => {
    const [first] = packageArchives();
    const bytes = fs.readFileSync(first as string);
    const folders = new Set(Object.keys(unzipSync(bytes)).map((entry) => entry.split("/")[0]));
    expect(folders).toEqual(new Set(loadPacks().map((pack) => pack.archiveDir)));
    const [second] = packageArchives();
    expect(bytes.equals(fs.readFileSync(second as string))).toBe(true);
  });
});
