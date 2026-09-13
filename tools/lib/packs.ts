// The pack registry behind every tool: which packs exist, where they live, and how they depend on each other.
import path from "node:path";
import { readStrictJson } from "./json.ts";
import { DIST, PACKS_FILE, REPO_ROOT } from "./paths.ts";

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
  /** Feature id this pack turns on, or null for the core packs. */
  feature: string | null;
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
    for (const pack of document.packs) {
      if (ids.has(pack.id)) throw new Error(`packs.json: duplicate pack id ${pack.id}`);
      ids.add(pack.id);
    }
    for (const pack of document.packs) {
      for (const dependency of pack.dependsOn) {
        if (!ids.has(dependency)) throw new Error(`packs.json: ${pack.id} depends on unknown pack ${dependency}`);
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

/** The pack whose behavior pack carries the script bundle. */
export const CORE_BEHAVIOR_ID = "elleedog67";

export function packDir(id: string): string {
  return path.join(REPO_ROOT, getPack(id).dir);
}

export function distDir(id: string): string {
  return path.join(DIST, getPack(id).archiveDir);
}
