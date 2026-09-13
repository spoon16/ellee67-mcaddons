// Zips dist/ into one installable .mcaddon holding every pack. Deterministic: fixed timestamps, sorted entries.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type Zippable, zipSync } from "fflate";
import { listFiles } from "./lib/files.ts";
import { readStrictJson } from "./lib/json.ts";
import { distDir, loadPacks } from "./lib/packs.ts";
import { DIST, REPO_ROOT } from "./lib/paths.ts";

const STAMP = new Date(Date.UTC(2026, 0, 1));

function zipTree(root: string, prefix: string): Zippable {
  const entries: Zippable = {};
  for (const relative of listFiles(root)) {
    entries[`${prefix}/${relative}`] = [fs.readFileSync(path.join(root, relative)), { mtime: STAMP, level: 9 }];
  }
  return entries;
}

export function packageArchives(): string[] {
  const version = (readStrictJson(path.join(REPO_ROOT, "package.json")) as { version: string }).version;
  const entries: Zippable = {};
  for (const pack of loadPacks()) {
    const root = distDir(pack.id);
    if (!fs.existsSync(root)) throw new Error(`run \`npm run build\` first (${pack.archiveDir} is missing)`);
    Object.assign(entries, zipTree(root, pack.archiveDir));
  }
  const addon = path.join(DIST, `ElleeDog67_${version}.mcaddon`);
  fs.writeFileSync(addon, zipSync(entries, { mtime: STAMP }));
  const sum = crypto.createHash("sha256").update(fs.readFileSync(addon)).digest("hex");
  fs.writeFileSync(path.join(DIST, "SHA256SUMS.txt"), `${sum}  ${path.basename(addon)}\n`);
  return [addon];
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    for (const file of packageArchives())
      console.log(`wrote ${path.relative(REPO_ROOT, file)} (${fs.statSync(file).size} bytes)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
