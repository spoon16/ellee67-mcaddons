// Writes every pack's manifest.json from packs.json and the package.json version.
// Run by `npm run manifests`, by `npm run codegen`, and by the `npm version` hook.
import fs from "node:fs";
import path from "node:path";
import { readStrictJson } from "./lib/json.ts";
import { getPack, loadPacks, type PackSpec, packDir } from "./lib/packs.ts";
import { REPO_ROOT } from "./lib/paths.ts";

export const MIN_ENGINE_VERSION = [1, 26, 40];
export const SERVER_API = "2.9.0";
export const SERVER_UI_API = "2.0.0";
/** The stable engine module versions every script pack declares; packs.json names which of them each pack uses. */
export const SCRIPT_MODULE_VERSIONS: Readonly<Record<string, string>> = {
  "@minecraft/server": SERVER_API,
  "@minecraft/server-ui": SERVER_UI_API,
};

export function packageVersion(): [number, number, number] {
  const text = (readStrictJson(path.join(REPO_ROOT, "package.json")) as { version: string }).version;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (!match) throw new Error(`package.json version must be MAJOR.MINOR.PATCH, got ${text}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** The manifest a pack must have for the current version. */
export function expectedManifest(pack: PackSpec, version = packageVersion()): Record<string, unknown> {
  const modules: Array<Record<string, unknown>> = [];
  if (pack.modules.data) modules.push({ type: "data", uuid: pack.modules.data, version });
  if (pack.modules.resources) modules.push({ type: "resources", uuid: pack.modules.resources, version });
  if (pack.modules.script) {
    modules.push({
      type: "script",
      language: "javascript",
      uuid: pack.modules.script,
      version,
      entry: "scripts/main.js",
    });
  }
  const dependencies: Array<Record<string, unknown>> = pack.dependsOn.map((id) => ({
    uuid: getPack(id).uuid,
    version,
  }));
  for (const name of pack.scriptModules ?? []) {
    const moduleVersion = SCRIPT_MODULE_VERSIONS[name];
    if (!moduleVersion) throw new Error(`packs.json: ${pack.id} uses unknown script module ${name}`);
    dependencies.push({ module_name: name, version: moduleVersion });
  }
  return {
    format_version: 2,
    header: {
      name: pack.title,
      description: pack.description,
      uuid: pack.uuid,
      version,
      min_engine_version: MIN_ENGINE_VERSION,
    },
    modules,
    dependencies,
    metadata: {
      authors: ["ElleeDog 67"],
      license: "MIT for original code; see LICENSE and THIRD_PARTY_NOTICES.md",
      product_type: "addon",
    },
  };
}

export function writeManifests(): string[] {
  const written: string[] = [];
  const version = packageVersion();
  for (const pack of loadPacks()) {
    const file = path.join(packDir(pack.id), "manifest.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(expectedManifest(pack, version), null, 2)}\n`);
    written.push(path.relative(REPO_ROOT, file));
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  for (const file of writeManifests()) console.log(`wrote ${file}`);
}
