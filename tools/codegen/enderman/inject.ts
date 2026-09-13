// Regenerates the minecraft:enderman override from the pinned Mojang snapshot in upstream/. The only edits are
// one entity property and a filter on each of the two block-movement goals; everything else passes through.
import path from "node:path";
import { readJsonWithComments, writeJson } from "../../lib/json.ts";
import { packDir } from "../../lib/packs.ts";
import { REPO_ROOT } from "../../lib/paths.ts";

export const UPSTREAM_FILE = path.join(REPO_ROOT, "tools", "codegen", "enderman", "upstream", "enderman.json");
export const OUTPUT_FILE = path.join(packDir("ender-mod"), "entities", "overrides", "enderman.json");
export const GATE_PROPERTY = "elleedog:may_move_blocks";
export const GATED_GOALS = [
  ["minecraft:behavior.take_block", "can_take"],
  ["minecraft:behavior.place_block", "can_place"],
] as const;

type Json = Record<string, any>;

export function gateFilter(): Json {
  return { test: "bool_property", subject: "self", domain: GATE_PROPERTY, value: true };
}

export function generateEnderman(upstreamFile: string, outputFile: string): void {
  const document = readJsonWithComments(upstreamFile) as Json;
  const entity = document["minecraft:entity"];
  if (!entity?.description) throw new Error(`${upstreamFile}: minecraft:entity.description is missing`);
  entity.description.properties ??= {};
  entity.description.properties[GATE_PROPERTY] = { type: "bool", default: false, client_sync: false };
  for (const [goalId, field] of GATED_GOALS) {
    const holders: Json[] = [entity.components, ...Object.values<Json>(entity.component_groups ?? {})].filter(
      (holder) => holder?.[goalId] !== undefined,
    );
    if (holders.length === 0) {
      throw new Error(`${upstreamFile}: ${goalId} is missing from components and every component group`);
    }
    for (const holder of holders) {
      const goal = holder[goalId];
      goal[field] = field in goal ? { all_of: [goal[field], gateFilter()] } : gateFilter();
    }
  }
  writeJson(outputFile, document);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  generateEnderman(UPSTREAM_FILE, OUTPUT_FILE);
  console.log(`wrote ${path.relative(REPO_ROOT, OUTPUT_FILE)}`);
}
