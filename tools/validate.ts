// Structural validation of the built packs. Runs inside `npm run build` and from the pack tests.
// It checks what the content log would complain about, not whether the add-on plays well.
import fs from "node:fs";
import path from "node:path";
import { MinecraftBlockTypes, MinecraftItemTypes } from "@minecraft/vanilla-data";
import { listFiles, pngSize } from "./lib/files.ts";
import { JsonFileError, readStrictJson } from "./lib/json.ts";
import { distDir, loadPacks, type PackSpec, scriptEntry } from "./lib/packs.ts";
import { isMain, REPO_ROOT } from "./lib/paths.ts";
import { expectedManifest } from "./manifests.ts";

export interface ValidationReport {
  errors: string[];
  counts: Record<string, number>;
}

// Texture folders the game itself ships (including their subfolders, such as textures/blocks/deepslate). References
// into them point at vanilla art, so only references into folders vanilla does not have must exist in our packs.
const VANILLA_TEXTURE_DIRS = new Set([
  "textures/blocks",
  "textures/items",
  "textures/entity",
  "textures/ui",
  "textures/models/armor",
  "textures/misc",
  "textures/particle",
  "textures/environment",
  "textures/gui",
  "textures/map",
  "textures/painting",
  "textures/trims",
  "textures/colormap",
]);

// Folders that only our packs have; references into them must resolve even though they sit under a vanilla folder.
const OWNED_TEXTURE_DIRS = ["textures/entity/pets", "textures/ui/pets"];

// Every vanilla id `give` accepts: items, and blocks in their item form.
const VANILLA_ITEMS = new Set<string>([...Object.values(MinecraftItemTypes), ...Object.values(MinecraftBlockTypes)]);

// Identifiers that two packs deliberately both define. The pack higher in the world's stack wins.
const SHARED_IDENTIFIERS: Record<string, string[]> = {
  "minecraft:entity:minecraft:player": ["pets", "rbow-ore"],
  "minecraft:attachable:elleedog:rbow_helmet.player": ["pets-resources", "rbow-ore-resources"],
  "minecraft:attachable:elleedog:rbow_chestplate.player": ["pets-resources", "rbow-ore-resources"],
  "minecraft:attachable:elleedog:rbow_leggings.player": ["pets-resources", "rbow-ore-resources"],
  "minecraft:attachable:elleedog:rbow_boots.player": ["pets-resources", "rbow-ore-resources"],
  "minecraft:attachable:elleedog:rbow_spear": ["pets-resources", "rbow-ore-resources"],
};

type Json = Record<string, any>;

interface PinnedVanillaFile {
  controllers: string[];
}
/**
 * The vanilla render controller files the add-on replaces, pinned beside the Pets compiler that builds from them
 * (`tools/codegen/pets/upstream/render_controllers.PROVENANCE.json`). Keyed by the path the pack ships them at,
 * which is the vanilla path with the `overrides/` folder the build requires for a vanilla replacement.
 */
function pinnedVanillaFiles(): Map<string, PinnedVanillaFile> {
  const provenance = readStrictJson(
    path.join(REPO_ROOT, "tools", "codegen", "pets", "upstream", "render_controllers.PROVENANCE.json"),
  ) as Json;
  return new Map(
    Object.entries(provenance.files as Record<string, PinnedVanillaFile>).map(([name, entry]) => [
      `render_controllers/overrides/${name}`,
      entry,
    ]),
  );
}
const PINNED_VANILLA = pinnedVanillaFiles();
/** The pinned vanilla file a built pack file replaces, or undefined when it replaces none. */
function replacedVanillaFile(file: string): PinnedVanillaFile | undefined {
  return PINNED_VANILLA.get(file.slice(file.indexOf("/") + 1));
}

function isVanillaIdentifier(id: string): boolean {
  return (
    id.startsWith("minecraft:") ||
    /^controller\.render\.(player|persona|cape)(\.|_|$)/.test(id) ||
    id === "controller.render.item_default"
  );
}

function identifiersIn(document: Json, file: string): Array<{ kind: string; id: string }> {
  const found: Array<{ kind: string; id: string }> = [];
  for (const [key, value] of Object.entries(document)) {
    if (key === "format_version" || typeof value !== "object" || value === null) continue;
    const identifier = (value as Json).description?.identifier;
    if (typeof identifier === "string") found.push({ kind: key, id: identifier });
  }
  if (file.includes("/render_controllers/")) {
    for (const id of Object.keys(document.render_controllers ?? {})) found.push({ kind: "render_controller", id });
  }
  if (file.includes("/animation_controllers/")) {
    for (const id of Object.keys(document.animation_controllers ?? {}))
      found.push({ kind: "animation_controller", id });
  }
  if (file.includes("/animations/")) {
    for (const id of Object.keys(document.animations ?? {})) found.push({ kind: "animation", id });
  }
  if (file.includes("/models/")) {
    for (const geometry of document["minecraft:geometry"] ?? []) {
      const id = geometry?.description?.identifier;
      if (typeof id === "string") found.push({ kind: "geometry", id });
    }
  }
  return found;
}

function ownsTextureDir(texture: string): boolean {
  const dir = texture.slice(0, Math.max(0, texture.lastIndexOf("/")));
  if (!dir.startsWith("textures/")) return false;
  for (const owned of OWNED_TEXTURE_DIRS) {
    if (dir === owned || dir.startsWith(`${owned}/`)) return true;
  }
  for (const vanilla of VANILLA_TEXTURE_DIRS) {
    if (dir === vanilla || dir.startsWith(`${vanilla}/`)) return false;
  }
  return true;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface ValidateOptions {
  /** Where each pack's built folder is, by pack id; defaults to dist/. Tests point this at doctored copies. */
  roots?: Map<string, string>;
}

/** Where every pack lands after `npm run build`. */
export function distRoots(): Map<string, string> {
  return new Map(loadPacks().map((pack) => [pack.id, distDir(pack.id)]));
}

export function validateBuild(options: ValidateOptions = {}): ValidationReport {
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  const packs = loadPacks();
  const roots = options.roots ?? distRoots();

  // Every JSON file in every pack, parsed strictly. Keys are "<pack id>/<relative path>".
  const documents = new Map<string, Json>();
  const filesByPack = new Map<string, Set<string>>();
  for (const pack of packs) {
    const root = roots.get(pack.id) as string;
    if (!fs.existsSync(root)) {
      errors.push(`${pack.id}: missing at ${root}`);
      continue;
    }
    const files = listFiles(root);
    filesByPack.set(pack.id, new Set(files));
    for (const relative of files) {
      if (!relative.endsWith(".json")) continue;
      const file = `${pack.id}/${relative}`;
      try {
        documents.set(file, readStrictJson(path.join(root, relative)) as Json);
      } catch (error) {
        errors.push(error instanceof JsonFileError ? error.message : `${file}: ${String(error)}`);
      }
    }
  }
  counts.json = documents.size;
  counts.packs = packs.length;

  // Manifests: exactly what packs.json + package.json generate; a bundle exactly where a script module is declared.
  for (const pack of packs) {
    const manifest = documents.get(`${pack.id}/manifest.json`);
    if (!manifest) {
      errors.push(`${pack.id}/manifest.json is missing or invalid`);
      continue;
    }
    if (!sameJson(manifest, expectedManifest(pack))) {
      errors.push(`${pack.id}/manifest.json differs from packs.json; run \`npm run manifests\``);
    }
    const bundle = path.join(roots.get(pack.id) as string, "scripts", "main.js");
    if (scriptEntry(pack)) {
      if (!fs.existsSync(bundle)) errors.push(`${pack.id}: scripts/main.js was not bundled`);
    } else if (fs.existsSync(path.join(roots.get(pack.id) as string, "scripts"))) {
      errors.push(`${pack.id}: carries scripts but declares no script module in packs.json`);
    }
    for (const dependency of pack.dependsOn) {
      if (pack.kind === "resources") errors.push(`${pack.id}: resource packs must not depend on other packs`);
      else if (loadPacks().find((candidate) => candidate.id === dependency)?.feature !== pack.feature)
        errors.push(`${pack.id}: may only depend on its own feature's packs, not ${dependency}`);
    }
    const icon = path.join(roots.get(pack.id) as string, "pack_icon.png");
    if (!fs.existsSync(icon)) errors.push(`${pack.id}/pack_icon.png is missing`);
    else {
      const size = pngSize(icon);
      if (size.width !== 256 || size.height !== 256)
        errors.push(`${pack.id}/pack_icon.png must be 256x256, got ${size.width}x${size.height}`);
    }
  }

  // Identifiers: unique across the union of all packs except the documented shared ones; vanilla replacements only in
  // packs that may carry overrides, under an overrides/ folder, and every overrides/ file must replace something.
  const seen = new Map<string, { pack: string; file: string }>();
  const byPack = new Map<string, PackSpec>(packs.map((pack) => [pack.id, pack]));
  for (const [file, document] of documents) {
    if (file.endsWith("/manifest.json")) continue;
    const packId = file.slice(0, file.indexOf("/"));
    const pack = byPack.get(packId) as PackSpec;
    const identifiers = identifiersIn(document, file);
    let vanillaInFile = 0;
    for (const { kind, id } of identifiers) {
      const key = `${kind}:${id}`;
      const previous = seen.get(key);
      const shared = SHARED_IDENTIFIERS[key];
      if (previous && previous.pack !== packId && shared?.includes(previous.pack) && shared.includes(packId)) {
        // Deliberate duplicate across two packs; the world's pack order decides.
      } else if (previous) {
        errors.push(`duplicate ${kind} identifier ${id} in ${file} and ${previous.file}`);
      }
      seen.set(key, { pack: packId, file });
      counts[kind] = (counts[kind] ?? 0) + 1;
      if (!isVanillaIdentifier(id)) continue;
      vanillaInFile++;
      if (!pack.overrides) errors.push(`${file}: pack ${packId} may not replace vanilla identifier ${id}`);
      else if (!file.includes("/overrides/"))
        errors.push(`${file}: vanilla identifier ${id} must live under an overrides/ folder`);
    }
    if (file.includes("/overrides/") && identifiers.length > 0 && vanillaInFile === 0) {
      errors.push(`${file}: lives under overrides/ but replaces no vanilla identifier`);
    }
  }
  // A file in a pack replaces the vanilla file of the same path outright, so every identifier the vanilla file
  // defined and the pack does not simply stops existing. The pinned copies the Pets compiler builds from say what
  // vanilla defines; 0.4.0 shipped a player.render_controllers.json without the spectator and map passes its own
  // client entity still asked for, and nothing here noticed.
  for (const [file, document] of documents) {
    const vanilla = replacedVanillaFile(file);
    if (!vanilla) continue;
    const defined = new Set(Object.keys(document.render_controllers ?? {}));
    for (const id of vanilla.controllers) {
      if (!defined.has(id)) errors.push(`${file}: replaces the vanilla file but no longer defines ${id}`);
    }
  }

  for (const [key, packIds] of Object.entries(SHARED_IDENTIFIERS)) {
    const owner = seen.get(key);
    if (!owner) errors.push(`shared identifier ${key} is not defined by any pack`);
    else if (!packIds.includes(owner.pack))
      errors.push(`shared identifier ${key} is defined by unexpected pack ${owner.pack}`);
  }
  // The two behavior packs that replace the player must ship the same file, so any subset of them behaves alike.
  const petsPlayer = path.join(roots.get("pets") as string, "entities", "overrides", "player.json");
  const rbowPlayer = path.join(roots.get("rbow-ore") as string, "entities", "overrides", "player.json");
  if (
    fs.existsSync(petsPlayer) &&
    fs.existsSync(rbowPlayer) &&
    !fs.readFileSync(petsPlayer).equals(fs.readFileSync(rbowPlayer))
  ) {
    errors.push("pets and rbow-ore must ship byte-identical entities/overrides/player.json");
  }

  // Lang files and languages.json per pack.
  for (const pack of packs) {
    const root = roots.get(pack.id) as string;
    const texts = path.join(root, "texts");
    if (!fs.existsSync(texts)) continue;
    const languages = documents.get(`${pack.id}/texts/languages.json`) as string[] | undefined;
    const langFiles = fs
      .readdirSync(texts)
      .filter((name) => name.endsWith(".lang"))
      .map((name) => name.slice(0, -5));
    for (const code of langFiles)
      if (!languages?.includes(code)) errors.push(`${pack.id}/texts/languages.json does not list ${code}`);
    for (const code of languages ?? [])
      if (!langFiles.includes(code)) errors.push(`${pack.id}/texts/${code}.lang is missing`);
    for (const code of langFiles) {
      const keys = new Set<string>();
      const lines = fs.readFileSync(path.join(texts, `${code}.lang`), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!line.trim() || line.startsWith("##")) return;
        const equals = line.indexOf("=");
        if (equals <= 0) {
          errors.push(`${pack.id}/texts/${code}.lang:${index + 1}: expected key=value`);
          return;
        }
        const key = line.slice(0, equals);
        if (keys.has(key)) errors.push(`${pack.id}/texts/${code}.lang: duplicate key ${key}`);
        keys.add(key);
      });
    }
  }

  // Textures resolve against the union of every resource pack (Bedrock stacks them); atlas keys are unioned too.
  const resourceFiles = new Set<string>();
  for (const pack of packs) {
    if (pack.kind !== "resources") continue;
    for (const relative of filesByPack.get(pack.id) ?? []) resourceFiles.add(relative);
  }
  const textureExists = (texture: string) =>
    resourceFiles.has(`${texture}.png`) || resourceFiles.has(`${texture}.tga`) || resourceFiles.has(`${texture}.jpg`);
  const atlasKeys = new Set<string>();
  for (const [file, document] of documents) {
    if (!file.endsWith("/textures/item_texture.json") && !file.endsWith("/textures/terrain_texture.json")) continue;
    for (const [key, value] of Object.entries(document.texture_data ?? {})) {
      atlasKeys.add(key);
      const textures = (value as Json).textures;
      const list = Array.isArray(textures) ? textures : [textures];
      for (const texture of list) {
        const pathText = typeof texture === "string" ? texture : texture?.path;
        if (typeof pathText === "string" && !textureExists(pathText))
          errors.push(`${file}: ${key} points at missing ${pathText}`);
      }
    }
  }
  for (const [file, document] of documents) {
    const description =
      document["minecraft:client_entity"]?.description ?? document["minecraft:attachable"]?.description;
    if (!description) continue;
    for (const [name, texture] of Object.entries(description.textures ?? {})) {
      if (typeof texture !== "string" || texture.includes("$")) continue;
      if (ownsTextureDir(texture) && !textureExists(texture))
        errors.push(`${file}: texture ${name} points at missing ${texture}`);
    }
  }
  for (const [file, document] of documents) {
    const item = document["minecraft:item"];
    if (!item) continue;
    const icon = item.components?.["minecraft:icon"];
    const key = typeof icon === "string" ? icon : (icon?.textures?.default ?? icon?.texture);
    if (typeof key === "string" && !atlasKeys.has(key))
      errors.push(`${file}: icon ${key} is not in any item_texture.json`);
  }

  // The engine parses every function when the world opens and prints each line it cannot parse on the player's
  // screen, and an item id nothing defines is such a line. So a `give` may only name an item that exists whenever
  // its pack is active: vanilla's, the pack's own, or one from a pack it depends on. Pets shipped a Rbow test kit
  // that failed this way, eleven warnings at every world load, whenever Rbow Ore was off.
  const itemOwner = new Map<string, string>();
  for (const [key, owner] of seen) {
    if (key.startsWith("minecraft:item:")) itemOwner.set(key.slice("minecraft:item:".length), owner.pack);
  }
  for (const pack of packs) {
    if (pack.kind !== "behavior") continue;
    const root = roots.get(pack.id) as string;
    const active = new Set([pack.id, ...pack.dependsOn]);
    for (const relative of filesByPack.get(pack.id) ?? []) {
      if (!relative.startsWith("functions/") || !relative.endsWith(".mcfunction")) continue;
      const lines = fs.readFileSync(path.join(root, relative), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const words = line.trim().split(/\s+/);
        const given = words[2];
        if (words[0] !== "give" || given === undefined) return;
        const item = given.includes(":") ? given : `minecraft:${given}`;
        const where = `${pack.id}/${relative}:${index + 1}`;
        if (item.startsWith("minecraft:")) {
          if (!VANILLA_ITEMS.has(item)) errors.push(`${where}: gives ${item}, which vanilla does not define`);
        } else if (!active.has(itemOwner.get(item) ?? "")) {
          errors.push(`${where}: gives ${item}, which neither ${pack.id} nor a pack it depends on defines`);
        }
      });
    }
  }

  for (const pack of packs) {
    if (pack.kind === "resources" && fs.existsSync(path.join(roots.get(pack.id) as string, "ui"))) {
      errors.push(`${pack.id}/ui must not exist (no UI overrides)`);
    }
  }

  // Each bundle imports exactly the engine modules its manifest declares: nothing else, and nothing it does not use.
  for (const pack of packs) {
    if (!scriptEntry(pack)) continue;
    const bundle = path.join(roots.get(pack.id) as string, "scripts", "main.js");
    if (!fs.existsSync(bundle)) continue;
    const script = fs.readFileSync(bundle, "utf8");
    const imports = new Set(
      [...script.matchAll(/^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm)].map((match) => match[1] as string),
    );
    const declared = new Set(pack.scriptModules ?? []);
    for (const specifier of imports)
      if (!declared.has(specifier)) errors.push(`${pack.id}/scripts/main.js imports undeclared module ${specifier}`);
    for (const name of declared)
      if (!imports.has(name))
        errors.push(`${pack.id}: packs.json declares ${name} but scripts/main.js never imports it`);
  }

  return { errors, counts };
}

if (isMain(import.meta.url)) {
  const report = validateBuild();
  for (const error of report.errors) console.error(`error: ${error}`);
  console.log(`validated: ${JSON.stringify(report.counts)}`);
  process.exit(report.errors.length ? 1 : 0);
}
