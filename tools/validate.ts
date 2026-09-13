// Structural validation of a built pack pair. Runs inside `npm run build` and from the pack tests.
// It checks what the content log would complain about, not whether the add-on plays well.
import fs from "node:fs";
import path from "node:path";
import { listFiles, pngSize } from "./lib/files.ts";
import { JsonFileError, readStrictJson } from "./lib/json.ts";
import { DIST_BP, DIST_RP, REPO_ROOT } from "./lib/paths.ts";

export interface ValidationReport {
  errors: string[];
  counts: Record<string, number>;
}

const SERVER_API = "2.9.0";
const SERVER_UI_API = "2.0.0";
const MIN_ENGINE = "1.26.40";

// Texture folders the game itself ships (including their subfolders, such as textures/blocks/deepslate). References
// into them point at vanilla art, so only references into folders vanilla does not have must exist in this pack.
// Our own textures live in folders with a feature name in them (textures/entity/pets, textures/ui/pets).
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

// Folders that only this pack has; references into them must resolve even though they sit under a vanilla folder.
const OWNED_TEXTURE_DIRS = ["textures/entity/pets", "textures/ui/pets"];

type Json = Record<string, any>;

function versionText(version: unknown): string {
  return Array.isArray(version) ? version.join(".") : String(version);
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

export function validateBuild(bp = DIST_BP, rp = DIST_RP): ValidationReport {
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  const packageVersion = (readStrictJson(path.join(REPO_ROOT, "package.json")) as Json).version as string;

  const documents = new Map<string, Json>();
  for (const [root, label] of [
    [bp, "behavior_pack"],
    [rp, "resource_pack"],
  ] as const) {
    if (!fs.existsSync(root)) {
      errors.push(`${label} is missing at ${root}`);
      continue;
    }
    for (const relative of listFiles(root)) {
      if (!relative.endsWith(".json")) continue;
      const file = `${label}/${relative}`;
      try {
        documents.set(file, readStrictJson(path.join(root, relative)) as Json);
      } catch (error) {
        errors.push(error instanceof JsonFileError ? error.message : `${file}: ${String(error)}`);
      }
    }
  }
  counts.json = documents.size;

  // Manifests.
  const bpManifest = documents.get("behavior_pack/manifest.json");
  const rpManifest = documents.get("resource_pack/manifest.json");
  if (!bpManifest || !rpManifest) {
    errors.push("both manifests must exist and parse");
    return { errors, counts };
  }
  for (const [label, manifest] of [
    ["behavior_pack", bpManifest],
    ["resource_pack", rpManifest],
  ] as const) {
    if (manifest.format_version !== 2) errors.push(`${label}/manifest.json: format_version must be 2`);
    if (versionText(manifest.header?.version) !== packageVersion) {
      errors.push(
        `${label}/manifest.json: header.version ${versionText(manifest.header?.version)} != package.json ${packageVersion}`,
      );
    }
    if (versionText(manifest.header?.min_engine_version) !== MIN_ENGINE) {
      errors.push(`${label}/manifest.json: min_engine_version must be ${MIN_ENGINE}`);
    }
    for (const module of manifest.modules ?? []) {
      if (versionText(module.version) !== packageVersion) {
        errors.push(`${label}/manifest.json: module ${module.type} version != ${packageVersion}`);
      }
    }
    for (const dependency of manifest.dependencies ?? []) {
      if (String(dependency.version).includes("beta"))
        errors.push(`${label}/manifest.json: beta dependency ${dependency.module_name}`);
    }
    for (const uuid of [manifest.header?.uuid, ...(manifest.modules ?? []).map((module: Json) => module.uuid)]) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(uuid))) {
        errors.push(`${label}/manifest.json: malformed uuid ${uuid}`);
      }
    }
  }
  const scriptModules = (bpManifest.modules ?? []).filter((module: Json) => module.type === "script");
  if (scriptModules.length !== 1) errors.push("behavior_pack/manifest.json: exactly one script module is required");
  const entry = scriptModules[0]?.entry;
  if (entry && !fs.existsSync(path.join(bp, entry))) errors.push(`behavior_pack: script entry ${entry} does not exist`);
  const dependencies: Json[] = bpManifest.dependencies ?? [];
  const rpDependency = dependencies.find((dependency) => dependency.uuid === rpManifest.header?.uuid);
  if (!rpDependency) errors.push("behavior_pack/manifest.json: must depend on the resource pack uuid");
  else if (versionText(rpDependency.version) !== versionText(rpManifest.header?.version)) {
    errors.push("behavior_pack/manifest.json: resource pack dependency version must match the resource pack header");
  }
  const serverDependency = dependencies.find((dependency) => dependency.module_name === "@minecraft/server");
  if (serverDependency?.version !== SERVER_API)
    errors.push(`behavior_pack/manifest.json: @minecraft/server must be ${SERVER_API}`);
  const uiDependency = dependencies.find((dependency) => dependency.module_name === "@minecraft/server-ui");
  if (uiDependency?.version !== SERVER_UI_API)
    errors.push(`behavior_pack/manifest.json: @minecraft/server-ui must be ${SERVER_UI_API}`);

  // Pack icons.
  for (const [root, label] of [
    [bp, "behavior_pack"],
    [rp, "resource_pack"],
  ] as const) {
    const icon = path.join(root, "pack_icon.png");
    if (!fs.existsSync(icon)) errors.push(`${label}/pack_icon.png is missing`);
    else {
      const size = pngSize(icon);
      if (size.width !== 256 || size.height !== 256)
        errors.push(`${label}/pack_icon.png must be 256x256, got ${size.width}x${size.height}`);
    }
  }

  // Identifiers: unique per kind; vanilla replacements only under overrides/, and every overrides/ file replaces one.
  const seen = new Map<string, string>();
  for (const [file, document] of documents) {
    if (file.endsWith("manifest.json")) continue;
    const identifiers = identifiersIn(document, file);
    let vanillaInFile = 0;
    for (const { kind, id } of identifiers) {
      const key = `${kind}:${id}`;
      const previous = seen.get(key);
      if (previous) errors.push(`duplicate ${kind} identifier ${id} in ${file} and ${previous}`);
      seen.set(key, file);
      counts[kind] = (counts[kind] ?? 0) + 1;
      if (!isVanillaIdentifier(id)) continue;
      vanillaInFile++;
      if (!file.includes("/overrides/"))
        errors.push(`${file}: vanilla identifier ${id} must live under an overrides/ folder`);
    }
    if (file.includes("/overrides/") && identifiers.length > 0 && vanillaInFile === 0) {
      errors.push(`${file}: lives under overrides/ but replaces no vanilla identifier`);
    }
  }

  // Lang files and languages.json.
  for (const [root, label] of [
    [bp, "behavior_pack"],
    [rp, "resource_pack"],
  ] as const) {
    const texts = path.join(root, "texts");
    if (!fs.existsSync(texts)) continue;
    const languages = documents.get(`${label}/texts/languages.json`) as string[] | undefined;
    const langFiles = fs
      .readdirSync(texts)
      .filter((name) => name.endsWith(".lang"))
      .map((name) => name.slice(0, -5));
    for (const code of langFiles)
      if (!languages?.includes(code)) errors.push(`${label}/texts/languages.json does not list ${code}`);
    for (const code of languages ?? [])
      if (!langFiles.includes(code)) errors.push(`${label}/texts/${code}.lang is missing`);
    for (const code of langFiles) {
      const keys = new Set<string>();
      const lines = fs.readFileSync(path.join(texts, `${code}.lang`), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!line.trim() || line.startsWith("##")) return;
        const equals = line.indexOf("=");
        if (equals <= 0) {
          errors.push(`${label}/texts/${code}.lang:${index + 1}: expected key=value`);
          return;
        }
        const key = line.slice(0, equals);
        if (keys.has(key)) errors.push(`${label}/texts/${code}.lang: duplicate key ${key}`);
        keys.add(key);
      });
    }
  }

  // Textures referenced by atlases, client entities and attachables.
  const rpFiles = new Set(listFiles(rp));
  const textureExists = (texture: string) =>
    rpFiles.has(`${texture}.png`) || rpFiles.has(`${texture}.tga`) || rpFiles.has(`${texture}.jpg`);
  const atlasKeys = new Set<string>();
  for (const atlas of ["textures/item_texture.json", "textures/terrain_texture.json"]) {
    const document = documents.get(`resource_pack/${atlas}`);
    if (!document) continue;
    for (const [key, value] of Object.entries(document.texture_data ?? {})) {
      atlasKeys.add(key);
      const textures = (value as Json).textures;
      const list = Array.isArray(textures) ? textures : [textures];
      for (const texture of list) {
        const pathText = typeof texture === "string" ? texture : texture?.path;
        if (typeof pathText === "string" && !textureExists(pathText))
          errors.push(`resource_pack/${atlas}: ${key} points at missing ${pathText}`);
      }
    }
  }
  for (const [file, document] of documents) {
    const description =
      document["minecraft:client_entity"]?.description ?? document["minecraft:attachable"]?.description;
    if (!description) continue;
    for (const [name, texture] of Object.entries(description.textures ?? {})) {
      if (typeof texture !== "string" || texture.includes("$")) continue;
      if (ownsTextureDir(texture) && !textureExists(texture)) {
        errors.push(`${file}: texture ${name} points at missing ${texture}`);
      }
    }
  }
  for (const [file, document] of documents) {
    const item = document["minecraft:item"];
    if (!item) continue;
    const icon = item.components?.["minecraft:icon"];
    const key = typeof icon === "string" ? icon : (icon?.textures?.default ?? icon?.texture);
    if (typeof key === "string" && !atlasKeys.has(key)) errors.push(`${file}: icon ${key} is not in item_texture.json`);
  }

  if (fs.existsSync(path.join(rp, "ui"))) errors.push("resource_pack/ui must not exist (no UI overrides)");

  // Bundled script imports only the engine modules.
  if (entry && fs.existsSync(path.join(bp, entry))) {
    const script = fs.readFileSync(path.join(bp, entry), "utf8");
    const imports = [...script.matchAll(/^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm)].map(
      (match) => match[1],
    );
    for (const specifier of imports) {
      if (specifier !== "@minecraft/server" && specifier !== "@minecraft/server-ui")
        errors.push(`${entry}: unexpected import ${specifier}`);
    }
  }

  return { errors, counts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const report = validateBuild();
  for (const error of report.errors) console.error(`error: ${error}`);
  console.log(`validated: ${JSON.stringify(report.counts)}`);
  process.exit(report.errors.length ? 1 : 0);
}
