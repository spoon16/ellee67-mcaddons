import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPacks } from "../../tools/build.ts";
import { readStrictJson } from "../../tools/lib/json.ts";
import { distDir, loadPacks, scriptEntry } from "../../tools/lib/packs.ts";
import { REPO_ROOT } from "../../tools/lib/paths.ts";
import { expectedManifest } from "../../tools/manifests.ts";
import { packageArchives } from "../../tools/package.ts";
import { validateBuild } from "../../tools/validate.ts";

const PACK_COUNT = 10;
const SCRIPT_PACKS = ["pets", "rbow-ore", "ender-mod", "redstone-guide", "stair-sit", "creeper-mod"];

function bundleOf(id: string): string {
  return fs.readFileSync(path.join(distDir(id), "scripts", "main.js"), "utf8");
}

function importsOf(bundle: string): Set<string> {
  return new Set(
    [...bundle.matchAll(/^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm)].map((match) => match[1] as string),
  );
}

// Builds the real packs once and checks what a player would install. Slow-ish (esbuild + hundreds of JSON files),
// which is why it lives in its own file.
describe("built packs", () => {
  beforeAll(async () => {
    await buildPacks();
  }, 60_000);

  it("pass structural validation", () => {
    const report = validateBuild();
    expect(report.errors).toEqual([]);
    expect(report.counts.packs).toBe(PACK_COUNT);
    expect(report.counts["minecraft:item"]).toBeGreaterThan(0);
  });

  it("carry one manifest per pack, generated from packs.json, with every feature self-contained", () => {
    const packs = loadPacks();
    expect(packs).toHaveLength(PACK_COUNT);
    for (const pack of packs) {
      const manifest = readStrictJson(path.join(distDir(pack.id), "manifest.json"));
      expect(manifest, pack.id).toEqual(expectedManifest(pack));
    }
    for (const pack of packs) {
      if (pack.kind === "resources") {
        expect(pack.dependsOn, pack.id).toEqual([]);
        continue;
      }
      // A behavior pack depends on its own resource pack (if any) and on nothing else: no shared core.
      const own = packs.filter((candidate) => candidate.feature === pack.feature && candidate.kind === "resources");
      expect(new Set(pack.dependsOn), pack.id).toEqual(new Set(own.map((resource) => resource.id)));
    }
    expect(packs.filter((pack) => scriptEntry(pack)).map((pack) => pack.id)).toEqual(SCRIPT_PACKS);
  });

  it("bundle one script per behavior pack that imports exactly the engine modules its manifest declares", () => {
    for (const pack of loadPacks()) {
      const scripts = path.join(distDir(pack.id), "scripts");
      if (!scriptEntry(pack)) {
        expect(fs.existsSync(scripts), pack.id).toBe(false);
        continue;
      }
      const bundle = bundleOf(pack.id);
      expect(importsOf(bundle), pack.id).toEqual(new Set(pack.scriptModules));
      // Object.hasOwn is ES2022; the guarded polyfill in src/core/polyfills.ts must come before any feature code.
      const polyfill = bundle.indexOf('Object.defineProperty(Object, "hasOwn"');
      expect(polyfill, pack.id).toBeGreaterThan(-1);
      const firstUse = bundle.indexOf("Object.hasOwn(");
      if (firstUse !== -1) expect(polyfill, pack.id).toBeLessThan(firstUse);
      expect(bundle, pack.id).toContain(`id: "${pack.feature}"`);
    }
  });

  it("keep every bundle to its own feature: no controller leftovers and no other pack's commands", () => {
    // The engine holds every command and enum one script module registers to a single namespace; a stray command
    // from another feature would refuse the whole registration (the mock and the engine smoke test both check the
    // rule itself). Here: no `elleedog67:` controller commands remain, and no bundle carries a neighbour's names.
    const foreign: Record<string, string[]> = {
      pets: ["sit:down", "elleedog:ender_protect", "elleedog_redstone:"],
      "stair-sit": ["pet:form", "elleedog:ender_protect"],
      "ender-mod": ["pet:form", "sit:down"],
      "creeper-mod": ["pet:", "sit:", "elleedog:ender_protect"],
    };
    for (const pack of loadPacks()) {
      if (!scriptEntry(pack)) continue;
      const bundle = bundleOf(pack.id);
      expect(bundle, pack.id).not.toContain("elleedog67:");
      for (const name of foreign[pack.id] ?? []) expect(bundle, `${pack.id} carries ${name}`).not.toContain(name);
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

  it("no longer ship the Paw Menu token or the ElleeDog 67 Manual", () => {
    expect(fs.existsSync(path.join(distDir("pets"), "items", "paw_token.json"))).toBe(false);
    expect(fs.existsSync(path.join(distDir("pets"), "recipes", "paw_token.json"))).toBe(false);
    expect(bundleOf("pets")).not.toContain("open_form_menu");
    for (const pack of loadPacks()) expect(pack.title, pack.id).not.toContain("(Behavior)");
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
