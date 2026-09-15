// The pack registry behind every tool: which packs exist, where they live, and how they depend on each other.
import fs from "node:fs";
import path from "node:path";
import { readStrictJson } from "./json.ts";
import { DIST, PACK_ENTRIES, PACKS_FILE, REPO_ROOT } from "./paths.ts";

export type PackKind = "behavior" | "resources";

export interface PackSpec {
  id: string;
  kind: PackKind;
  /** Source folder relative to the repo root, for example behavior_packs/elleedog67_pets. */
  dir: string;
  /** Folder name inside dist/ and inside the .mcaddon; must be unique across packs. */
  archiveDir: string;
  title: string;
  description: string;
  uuid: string;
  modules: { data?: string; resources?: string; script?: string };
  /** Engine modules the script bundle imports; each becomes a manifest dependency. Only with a script module. */
  scriptModules?: string[];
  /** Feature id this pack belongs to; a behavior pack with a script module bundles src/packs/<feature>.ts. */
  feature: string;
  /** Pack ids this pack depends on; the game activates them along with this pack. */
  dependsOn: string[];
  /** Whether the pack may replace vanilla definitions (under an overrides/ folder). */
  overrides: boolean;
}

let cache: PackSpec[] | undefined;

export function loadPacks(): PackSpec[] {
  if (!cache) {
    const document = readStrictJson(PACKS_FILE) as { packs: PackSpec[] };
    const ids = new Set<string>();
    // A uuid names a pack or a module to the game for its whole life; two packs sharing one would replace each
    // other on import. Folder names are how the .mcaddon keeps the packs apart.
    const unique = new Map<string, Set<string>>([
      ["uuid", new Set()],
      ["module uuid", new Set()],
      ["archiveDir", new Set()],
    ]);
    const claim = (kind: string, value: string | undefined, pack: PackSpec) => {
      if (value === undefined) return;
      const seen = unique.get(kind) as Set<string>;
      if (seen.has(value)) throw new Error(`packs.json: ${pack.id} repeats ${kind} ${value}`);
      seen.add(value);
    };
    for (const pack of document.packs) {
      if (ids.has(pack.id)) throw new Error(`packs.json: duplicate pack id ${pack.id}`);
      ids.add(pack.id);
      claim("uuid", pack.uuid, pack);
      claim("module uuid", pack.modules.data, pack);
      claim("module uuid", pack.modules.resources, pack);
      claim("module uuid", pack.modules.script, pack);
      claim("archiveDir", pack.archiveDir, pack);
    }
    for (const pack of document.packs) claim("module uuid", pack.uuid, pack);
    for (const pack of document.packs) {
      for (const dependency of pack.dependsOn) {
        if (!ids.has(dependency)) throw new Error(`packs.json: ${pack.id} depends on unknown pack ${dependency}`);
      }
      if (pack.modules.script) {
        if (pack.kind !== "behavior") throw new Error(`packs.json: ${pack.id} is a resource pack with a script module`);
        if (!pack.scriptModules?.length)
          throw new Error(`packs.json: ${pack.id} has a script module but no scriptModules`);
        if (!fs.existsSync(scriptEntry(pack) as string))
          throw new Error(`packs.json: ${pack.id} has a script module but no src/packs/${pack.feature}.ts`);
      } else if (pack.scriptModules) {
        throw new Error(`packs.json: ${pack.id} lists scriptModules without a script module`);
      }
    }
    cache = document.packs;
  }
  return cache;
}

export function getPack(id: string): PackSpec {
  const pack = loadPacks().find((candidate) => candidate.id === id);
  if (!pack) throw new Error(`packs.json: no pack with id ${id}`);
  return pack;
}

/** The TypeScript entry esbuild bundles into this pack's scripts/main.js, or undefined for packs without scripts. */
export function scriptEntry(pack: PackSpec): string | undefined {
  return pack.modules.script ? path.join(PACK_ENTRIES, `${pack.feature}.ts`) : undefined;
}

export function packDir(id: string): string {
  return path.join(REPO_ROOT, getPack(id).dir);
}

export function distDir(id: string): string {
  return path.join(DIST, getPack(id).archiveDir);
}
