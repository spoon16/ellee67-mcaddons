// Bedrock Dedicated Server for headless testing: downloads the pinned version once into .bds/, unpacks it, and
// installs the built packs with a throwaway world that has every pack active. The server binary is never
// committed: the Minecraft EULA lets you run it, not redistribute it, so every machine fetches its own copy.
//   npm run bds:setup      download and unpack (idempotent), then install dist/ into it
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { readStrictJson } from "../lib/json.ts";
import { distDir, loadPacks } from "../lib/packs.ts";
import { REPO_ROOT } from "../lib/paths.ts";

/** Matches the game version the packs target (min_engine_version 1.26.40); bump both together. */
export const BDS_VERSION = "1.26.45.1";
export const BDS_ROOT = path.join(REPO_ROOT, ".bds");
export const SERVER_DIR = path.join(BDS_ROOT, "server");
export const WORLD_NAME = "elleedog67";
/** The GameTest runner's world: it turns the Beta APIs experiment on, which is never done to the smoke world. */
export const GAMETEST_WORLD_NAME = "elleedog67-gametest";

const DOWNLOAD_URL = `https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-${BDS_VERSION}.zip`;
// Mojang's CDN answers curl's default user agent with an HTTP/2 stream error; a browser agent over HTTP/1.1 works.
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

const PROPERTIES: Record<string, string> = {
  "allow-cheats": "true", // the console runs the add-on's commands
  "online-mode": "false", // no Xbox Live sign-in for a server nobody joins
  "allow-list": "false",
  "content-log-file-enabled": "true",
  "content-log-console-output-enabled": "true",
  "content-log-level": "info",
  "enable-lan-visibility": "false",
  "max-threads": "2",
};

/** Downloads and unpacks the server if `.bds/server` is missing or holds another version. Returns its directory. */
export function ensureServer(): string {
  const marker = path.join(SERVER_DIR, ".version");
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === BDS_VERSION) return SERVER_DIR;
  fs.mkdirSync(BDS_ROOT, { recursive: true });
  const zip = path.join(BDS_ROOT, `bedrock-server-${BDS_VERSION}.zip`);
  if (!fs.existsSync(zip)) {
    console.log(`downloading ${DOWNLOAD_URL}`);
    execFileSync("curl", ["-sSfL", "--http1.1", "-A", USER_AGENT, "-o", zip, DOWNLOAD_URL], { stdio: "inherit" });
  }
  console.log(`unpacking ${path.relative(REPO_ROOT, zip)} into ${path.relative(REPO_ROOT, SERVER_DIR)}`);
  fs.rmSync(SERVER_DIR, { recursive: true, force: true });
  fs.mkdirSync(SERVER_DIR, { recursive: true });
  for (const [name, bytes] of Object.entries(unzipSync(fs.readFileSync(zip)))) {
    if (name.endsWith("/")) continue;
    const target = path.join(SERVER_DIR, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  fs.chmodSync(path.join(SERVER_DIR, "bedrock_server"), 0o755);
  fs.writeFileSync(marker, `${BDS_VERSION}\n`);
  return SERVER_DIR;
}

/** Writes server.properties for a headless run of `worldName`, keeping every other key at the shipped default. */
export function configureServer(serverDir = SERVER_DIR, worldName = WORLD_NAME): void {
  const file = path.join(serverDir, "server.properties");
  const pending = new Map(Object.entries({ ...PROPERTIES, "level-name": worldName }));
  const lines = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const match = /^([a-z0-9-]+)=/.exec(line);
      const value = match && pending.get(match[1] as string);
      if (match && value !== undefined) {
        pending.delete(match[1] as string);
        return `${match[1]}=${value}`;
      }
      return line;
    });
  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  fs.writeFileSync(file, lines.join("\n"));
}

/** A behavior pack installed next to the built ones: its folder name in the server and its manifest identity. */
export interface ExtraPack {
  archiveDir: string;
  uuid: string;
  version: number[];
}

export interface InstallOptions {
  /** Copy the packs without their script bundles (and without the script module and engine dependencies in the
   * manifest copy), for a world whose scripts come from a test bundle instead. */
  scripts?: boolean;
  /** Recreate the world (default) or keep it and only rewrite its pack lists. */
  freshWorld?: boolean;
  /** Install only these pack ids (default: every pack in packs.json). */
  packIds?: string[];
}

/**
 * Copies dist/ (and any extra behavior packs, already placed in the server's behavior_packs folder) into the
 * server's pack folders and creates a fresh world with every pack in its stack. The world is recreated on each
 * call so a run never inherits state from the last one, unless `freshWorld` is false.
 */
export function installPacks(
  serverDir = SERVER_DIR,
  worldName = WORLD_NAME,
  extras: ExtraPack[] = [],
  options: InstallOptions = {},
): string {
  const { scripts = true, freshWorld = true, packIds } = options;
  const packs = loadPacks().filter((pack) => !packIds || packIds.includes(pack.id));
  for (const id of packIds ?? [])
    if (!packs.some((pack) => pack.id === id)) throw new Error(`packs.json has no pack ${id}`);
  const version = (readStrictJson(path.join(REPO_ROOT, "package.json")) as { version: string }).version
    .split(".")
    .map(Number);
  for (const kind of ["behavior_packs", "resource_packs"]) {
    const folder = path.join(serverDir, kind);
    for (const name of fs.readdirSync(folder)) {
      if (name.startsWith("ElleeDog67_") && !extras.some((extra) => extra.archiveDir === name))
        fs.rmSync(path.join(folder, name), { recursive: true, force: true });
    }
  }
  for (const pack of packs) {
    const source = distDir(pack.id);
    if (!fs.existsSync(path.join(source, "manifest.json")))
      throw new Error(`${pack.archiveDir} is not built; run \`npm run build\` first`);
    const folder = pack.kind === "behavior" ? "behavior_packs" : "resource_packs";
    const target = path.join(serverDir, folder, pack.archiveDir);
    fs.cpSync(source, target, {
      recursive: true,
      filter: (file) => scripts || path.relative(source, file).split(path.sep)[0] !== "scripts",
    });
    if (!scripts && pack.modules.script) {
      const manifestFile = path.join(target, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as {
        modules: Array<{ type: string }>;
        dependencies: Array<{ module_name?: string }>;
      };
      manifest.modules = manifest.modules.filter((module) => module.type !== "script");
      manifest.dependencies = manifest.dependencies.filter((dependency) => !dependency.module_name);
      fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }
  const world = path.join(serverDir, "worlds", worldName);
  if (freshWorld) fs.rmSync(world, { recursive: true, force: true });
  fs.mkdirSync(world, { recursive: true });
  const stack = (kind: "behavior" | "resources") =>
    packs.filter((pack) => pack.kind === kind).map((pack) => ({ pack_id: pack.uuid, version }));
  const behavior = [...stack("behavior"), ...extras.map((extra) => ({ pack_id: extra.uuid, version: extra.version }))];
  fs.writeFileSync(path.join(world, "world_behavior_packs.json"), `${JSON.stringify(behavior, null, 2)}\n`);
  fs.writeFileSync(path.join(world, "world_resource_packs.json"), `${JSON.stringify(stack("resources"), null, 2)}\n`);
  return world;
}

/** Environment additions the server needs here: its own libraries, and the IPv6 stand-in where IPv6 is absent. */
export function serverEnvironment(): Record<string, string> {
  const environment: Record<string, string> = { LD_LIBRARY_PATH: "." };
  if (process.platform === "linux" && !fs.existsSync("/proc/net/if_inet6")) {
    const shim = path.join(BDS_ROOT, "no-ipv6.so");
    if (!fs.existsSync(shim)) {
      fs.mkdirSync(BDS_ROOT, { recursive: true });
      execFileSync(
        "cc",
        ["-shared", "-fPIC", "-O2", "-o", shim, path.join(REPO_ROOT, "tools", "bds", "no-ipv6.c"), "-ldl"],
        {
          stdio: "inherit",
        },
      );
    }
    environment.LD_PRELOAD = shim;
  }
  return environment;
}

export function setup(): string {
  const serverDir = ensureServer();
  configureServer(serverDir);
  installPacks(serverDir);
  serverEnvironment();
  return serverDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    console.log(`ready: ${path.relative(REPO_ROOT, setup())} (Bedrock Dedicated Server ${BDS_VERSION})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
