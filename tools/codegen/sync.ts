// Copies the Pets compiler's output into the pack tree and src/, deciding each file's home by its identifier.
// Every destination it writes is recorded in synced-files.json so the next run can remove files the compiler
// no longer produces. Shared hand-maintained files (lang, atlases, blocks.json) are verified, never written.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { listFiles } from "../lib/files.ts";
import { readStrictJson } from "../lib/json.ts";
import { BP_SOURCE, REPO_ROOT, RP_SOURCE } from "../lib/paths.ts";

type Json = Record<string, any>;

export const SYNC_MANIFEST = path.join(REPO_ROOT, "tools", "codegen", "synced-files.json");
const PETS_SCRIPTS = path.join(REPO_ROOT, "src", "features", "pets");

interface Planned {
  source: string;
  destination: string;
}

export interface SyncReport {
  written: string[];
  unchanged: string[];
  removed: string[];
  problems: string[];
}

const SKIP = /^(manifest\.json|pack_icon\.png|LICENSE.*|THIRD_PARTY_NOTICES.*|scripts\/.*)$/;
const VERIFIED_RP = new Set([
  "blocks.json",
  "textures/item_texture.json",
  "textures/terrain_texture.json",
  "texts/languages.json",
]);

function namespaceOf(identifier: string): string {
  return identifier.split(":")[0] ?? "";
}

function featureFor(identifier: string, file: string): string {
  const namespace = namespaceOf(identifier);
  if (namespace === "minecraft") return "overrides";
  if (namespace === "pet" || namespace === "cav") return "pets";
  if (namespace === "elleedog") return "rbow-ore";
  throw new Error(`${file}: cannot place identifier ${identifier}`);
}

function firstIdentifier(document: Json, file: string): string {
  for (const [key, value] of Object.entries(document)) {
    if (key === "format_version" || typeof value !== "object" || value === null) continue;
    const identifier = (value as Json).description?.identifier;
    if (typeof identifier === "string") return identifier;
  }
  throw new Error(`${file}: no identifier found`);
}

function renderControllerFeature(document: Json, file: string): string {
  const ids = Object.keys(document.render_controllers ?? {});
  if (ids.some((id) => /^controller\.render\.(player|persona|cape)(\.|_|$)/.test(id))) return "overrides";
  if (ids.every((id) => id.startsWith("controller.render.pet."))) return "pets";
  if (ids.every((id) => id.startsWith("controller.render.elleedog."))) return "rbow-ore";
  throw new Error(`${file}: mixed or unknown render controller ids ${ids.join(", ")}`);
}

/** Decides where one compiler output file belongs in the pack tree, or undefined to skip it. */
export function planDestination(pack: string, relative: string, sourceFile: string): string | undefined {
  if (SKIP.test(relative)) return undefined;
  const isBehavior = pack.endsWith("behavior_pack");
  const root = isBehavior ? BP_SOURCE : RP_SOURCE;
  const [top = "", ...rest] = relative.split("/");
  const name = rest.join("/");
  const readDocument = () => readStrictJson(sourceFile) as Json;
  if (isBehavior) {
    switch (top) {
      case "entities":
      case "items":
      case "recipes":
      case "blocks":
        return path.join(root, top, featureFor(firstIdentifier(readDocument(), relative), relative), name);
      case "features":
      case "feature_rules":
        return path.join(root, top, "rbow-ore", name);
      case "loot_tables":
      case "structures":
      case "functions":
        return path.join(root, relative);
      default:
        throw new Error(`${pack}/${relative}: unexpected behavior pack file`);
    }
  }
  if (VERIFIED_RP.has(relative) || top === "texts") return undefined;
  switch (top) {
    case "entity":
    case "attachables": {
      const identifier = firstIdentifier(readDocument(), relative);
      const feature =
        namespaceOf(identifier) === "elleedog" && pack === "resource_pack" ? "pets" : featureFor(identifier, relative);
      return path.join(root, top, feature, name);
    }
    case "render_controllers":
      return path.join(root, top, renderControllerFeature(readDocument(), relative), name);
    case "animations":
    case "animation_controllers":
      return path.join(root, top, "pets", name.startsWith("pets/") ? name.slice("pets/".length) : name);
    case "models":
      if (name.startsWith("entity/pets/")) return path.join(root, relative);
      if (pack === "resource_pack") return path.join(root, "models", "entity", "pets", name.replace(/^entity\//, ""));
      return path.join(root, "models", "entity", "rbow-ore", name.replace(/^entity\//, ""));
    case "textures":
      return path.join(root, relative);
    default:
      throw new Error(`${pack}/${relative}: unexpected resource pack file`);
  }
}

function samePixels(a: Buffer, b: Buffer): boolean {
  try {
    const left = PNG.sync.read(a);
    const right = PNG.sync.read(b);
    return left.width === right.width && left.height === right.height && left.data.equals(right.data);
  } catch {
    return false;
  }
}

function readLang(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("##")) continue;
    const equals = line.indexOf("=");
    if (equals > 0)
      entries.set(
        line.slice(0, equals),
        line
          .slice(equals + 1)
          .replace(/\t##.*$/, "")
          .trim(),
      );
  }
  return entries;
}

/** Every key the compiler emits into a shared file must already be present in the hand-maintained union. */
export function verifySharedFiles(workspace: string): string[] {
  const problems: string[] = [];
  const ourLang = new Map<string, Map<string, string>>();
  for (const code of ["en_US", "en_GB"]) {
    ourLang.set(code, readLang(fs.readFileSync(path.join(RP_SOURCE, "texts", `${code}.lang`), "utf8")));
  }
  for (const pack of ["resource_pack", "rbow_resource_pack"]) {
    for (const code of ["en_US", "en_GB"]) {
      const file = path.join(workspace, pack, "texts", `${code}.lang`);
      if (!fs.existsSync(file)) continue;
      const theirs = readLang(fs.readFileSync(file, "utf8"));
      const ours = ourLang.get(code);
      for (const [key, value] of theirs) {
        if (key === "pack.name" || key === "pack.description") continue;
        if (!ours?.has(key)) problems.push(`resource_packs/elleedog67/texts/${code}.lang is missing: ${key}=${value}`);
        else if (ours.get(key) !== value)
          problems.push(`resource_packs/elleedog67/texts/${code}.lang: ${key} should be "${value}"`);
      }
    }
    for (const atlas of ["textures/item_texture.json", "textures/terrain_texture.json"]) {
      const file = path.join(workspace, pack, atlas);
      if (!fs.existsSync(file)) continue;
      const theirs = (readStrictJson(file) as Json).texture_data ?? {};
      const ourAtlas = path.join(RP_SOURCE, atlas);
      const ours = fs.existsSync(ourAtlas) ? ((readStrictJson(ourAtlas) as Json).texture_data ?? {}) : {};
      for (const [key, value] of Object.entries(theirs)) {
        if (JSON.stringify(ours[key]) !== JSON.stringify(value)) {
          problems.push(`resource_packs/elleedog67/${atlas} needs "${key}": ${JSON.stringify(value)}`);
        }
      }
    }
    const blocks = path.join(workspace, pack, "blocks.json");
    if (fs.existsSync(blocks)) {
      const theirs = readStrictJson(blocks) as Json;
      const ourBlocks = path.join(RP_SOURCE, "blocks.json");
      const ours = fs.existsSync(ourBlocks) ? (readStrictJson(ourBlocks) as Json) : {};
      for (const [key, value] of Object.entries(theirs)) {
        if (key === "format_version") continue;
        if (JSON.stringify(ours[key]) !== JSON.stringify(value)) {
          problems.push(`resource_packs/elleedog67/blocks.json needs "${key}": ${JSON.stringify(value)}`);
        }
      }
    }
  }
  return problems;
}

export function syncWorkspace(workspace: string): SyncReport {
  const report: SyncReport = { written: [], unchanged: [], removed: [], problems: [] };
  const planned = new Map<string, Planned>();
  const add = (source: string, destination: string) => {
    const existing = planned.get(destination);
    if (existing && !fs.readFileSync(existing.source).equals(fs.readFileSync(source))) {
      throw new Error(`${existing.source} and ${source} both map to ${destination} with different content`);
    }
    if (!existing) planned.set(destination, { source, destination });
  };
  for (const pack of ["behavior_pack", "rbow_behavior_pack", "resource_pack", "rbow_resource_pack"]) {
    const root = path.join(workspace, pack);
    if (!fs.existsSync(root)) throw new Error(`compiler output ${pack} is missing`);
    for (const relative of listFiles(root)) {
      const source = path.join(root, relative);
      const destination = planDestination(pack, relative, source);
      if (destination) add(source, destination);
    }
  }
  for (const name of fs.readdirSync(path.join(workspace, "src"))) {
    if (name.endsWith(".generated.js")) add(path.join(workspace, "src", name), path.join(PETS_SCRIPTS, name));
  }

  const previous: string[] = fs.existsSync(SYNC_MANIFEST) ? (readStrictJson(SYNC_MANIFEST) as string[]) : [];
  const oldContents = new Map<string, Buffer>();
  for (const relative of previous) {
    const file = path.join(REPO_ROOT, relative);
    if (fs.existsSync(file)) oldContents.set(file, fs.readFileSync(file));
  }

  const kept = new Set<string>();
  for (const { source, destination } of planned.values()) {
    kept.add(destination);
    const next = fs.readFileSync(source);
    const before =
      oldContents.get(destination) ?? (fs.existsSync(destination) ? fs.readFileSync(destination) : undefined);
    const relative = path.relative(REPO_ROOT, destination);
    if (before && (before.equals(next) || (destination.endsWith(".png") && samePixels(before, next)))) {
      report.unchanged.push(relative);
      continue;
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, next);
    report.written.push(relative);
  }
  for (const relative of previous) {
    const file = path.join(REPO_ROOT, relative);
    if (kept.has(file) || !fs.existsSync(file)) continue;
    fs.rmSync(file);
    report.removed.push(relative);
    let dir = path.dirname(file);
    while (dir !== REPO_ROOT && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    }
  }
  const manifest = [...kept].map((file) => path.relative(REPO_ROOT, file)).sort();
  fs.writeFileSync(SYNC_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  report.problems = verifySharedFiles(workspace);
  return report;
}
