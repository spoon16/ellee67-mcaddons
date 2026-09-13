// Copies the Pets compiler's four output packs into their own repo packs, deciding each vanilla replacement's home by
// its identifier. Every destination it writes is recorded in synced-files.json so the next run can remove files the
// compiler no longer produces.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { listFiles } from "../lib/files.ts";
import { readStrictJson } from "../lib/json.ts";
import { packDir } from "../lib/packs.ts";
import { REPO_ROOT } from "../lib/paths.ts";

type Json = Record<string, any>;

export const SYNC_MANIFEST = path.join(REPO_ROOT, "tools", "codegen", "synced-files.json");
const PETS_SCRIPTS = path.join(REPO_ROOT, "src", "features", "pets");
const STANDALONE_RBOW_ATTACHABLES = path.join(
  REPO_ROOT,
  "tools",
  "codegen",
  "pets",
  "integration",
  "rbow_1.2.0",
  "resource_pack",
  "attachables",
);

/** Compiler output folder to repo pack id. */
const PACK_MAPPING: Array<{ source: string; target: string }> = [
  { source: "behavior_pack", target: "pets" },
  { source: "resource_pack", target: "pets-resources" },
  { source: "rbow_behavior_pack", target: "rbow-ore" },
  { source: "rbow_resource_pack", target: "rbow-ore-resources" },
];

interface Planned {
  source: string;
  destination: string;
  /** Content to write instead of the source bytes (lang files are normalised). */
  content?: Buffer;
}

export interface SyncReport {
  written: string[];
  unchanged: string[];
  removed: string[];
}

const SKIP = /^(manifest\.json|pack_icon\.png|LICENSE.*|THIRD_PARTY_NOTICES.*|scripts\/.*)$/;
// The compiler emits 27 identical English locale files; two are enough.
const LANGUAGES = ["en_US", "en_GB"];

function firstIdentifier(document: Json, file: string): string {
  for (const [key, value] of Object.entries(document)) {
    if (key === "format_version" || typeof value !== "object" || value === null) continue;
    const identifier = (value as Json).description?.identifier;
    if (typeof identifier === "string") return identifier;
  }
  throw new Error(`${file}: no identifier found`);
}

function isVanillaRenderController(document: Json): boolean {
  return Object.keys(document.render_controllers ?? {}).some((id) =>
    /^controller\.render\.(player|persona|cape)(\.|_|$)/.test(id),
  );
}

/** Where one compiler output file belongs inside its target pack, or undefined to skip it. */
export function planDestination(target: string, relative: string, sourceFile: string): string | undefined {
  if (SKIP.test(relative)) return undefined;
  if (/^texts\/.*\.lang$/.test(relative) && !LANGUAGES.includes(path.basename(relative, ".lang"))) return undefined;
  const root = packDir(target);
  const [top = "", ...rest] = relative.split("/");
  const name = rest.join("/");
  const readDocument = () => readStrictJson(sourceFile) as Json;
  switch (top) {
    case "entities":
    case "entity":
    case "attachables": {
      const identifier = firstIdentifier(readDocument(), relative);
      return identifier.startsWith("minecraft:") ? path.join(root, top, "overrides", name) : path.join(root, relative);
    }
    case "render_controllers":
      return isVanillaRenderController(readDocument())
        ? path.join(root, top, "overrides", name)
        : path.join(root, relative);
    default:
      return path.join(root, relative);
  }
}

/** Lang files come through with the compiler's own pack.name/pack.description dropped and duplicate keys removed. */
export function normaliseLang(text: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("##")) {
      lines.push(line);
      continue;
    }
    const equals = line.indexOf("=");
    const key = equals > 0 ? line.slice(0, equals) : line;
    if (key === "pack.name" || key === "pack.description" || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
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

export function syncWorkspace(workspace: string): SyncReport {
  const report: SyncReport = { written: [], unchanged: [], removed: [] };
  const planned = new Map<string, Planned>();
  const add = (source: string, destination: string, content?: Buffer) => {
    const existing = planned.get(destination);
    if (existing) {
      const previous = existing.content ?? fs.readFileSync(existing.source);
      const next = content ?? fs.readFileSync(source);
      if (!previous.equals(next))
        throw new Error(`${existing.source} and ${source} both map to ${destination} with different content`);
      return;
    }
    planned.set(destination, { source, destination, content });
  };
  for (const { source, target } of PACK_MAPPING) {
    const root = path.join(workspace, source);
    if (!fs.existsSync(root)) throw new Error(`compiler output ${source} is missing`);
    for (const relative of listFiles(root)) {
      const sourceFile = path.join(root, relative);
      const destination = planDestination(target, relative, sourceFile);
      if (!destination) continue;
      if (relative.endsWith(".lang"))
        add(sourceFile, destination, Buffer.from(normaliseLang(fs.readFileSync(sourceFile, "utf8"))));
      else if (relative === "texts/languages.json")
        add(sourceFile, destination, Buffer.from(`${JSON.stringify(LANGUAGES)}\n`));
      else add(sourceFile, destination);
    }
  }
  // Rbow alone must render as Rbow 1.2.0 did: its standalone player armor and spear attachables go back into its
  // resource pack. When Pets Resources sits above it, the pet-aware versions of the same identifiers win.
  for (const name of fs.readdirSync(STANDALONE_RBOW_ATTACHABLES)) {
    if (/\.player\.json$/.test(name) || name === "rbow_spear_native.json") {
      add(path.join(STANDALONE_RBOW_ATTACHABLES, name), path.join(packDir("rbow-ore-resources"), "attachables", name));
    }
  }
  for (const name of fs.readdirSync(path.join(workspace, "src"))) {
    if (name.endsWith(".generated.js"))
      add(path.join(workspace, "src", name), path.join(PETS_SCRIPTS, name.replace(/\.js$/, ".ts")));
  }

  const previous: string[] = fs.existsSync(SYNC_MANIFEST) ? (readStrictJson(SYNC_MANIFEST) as string[]) : [];
  const oldContents = new Map<string, Buffer>();
  for (const relative of previous) {
    const file = path.join(REPO_ROOT, relative);
    if (fs.existsSync(file)) oldContents.set(file, fs.readFileSync(file));
  }

  const kept = new Set<string>();
  for (const { source, destination, content } of planned.values()) {
    kept.add(destination);
    const next = content ?? fs.readFileSync(source);
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
  return report;
}
