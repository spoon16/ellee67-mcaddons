// Zips dist/ into installable archives. Archives are deterministic: fixed timestamps, sorted entries.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type Zippable, zipSync } from "fflate";
import { listFiles } from "./lib/files.ts";
import { readStrictJson } from "./lib/json.ts";
import { DIST, DIST_BP, DIST_RP, REPO_ROOT } from "./lib/paths.ts";

const STAMP = new Date(Date.UTC(2026, 0, 1));

function zipTree(root: string, prefix = ""): Zippable {
  const entries: Zippable = {};
  for (const relative of listFiles(root)) {
    entries[`${prefix}${relative}`] = [fs.readFileSync(path.join(root, relative)), { mtime: STAMP, level: 9 }];
  }
  return entries;
}

function write(file: string, entries: Zippable): void {
  fs.writeFileSync(file, zipSync(entries, { mtime: STAMP }));
}

export function packageArchives(): string[] {
  if (!fs.existsSync(DIST_BP) || !fs.existsSync(DIST_RP)) throw new Error("run `npm run build` first");
  const version = (readStrictJson(path.join(REPO_ROOT, "package.json")) as { version: string }).version;
  const bp = path.join(DIST, `ElleeDog67_BP_${version}.mcpack`);
  const rp = path.join(DIST, `ElleeDog67_RP_${version}.mcpack`);
  const addon = path.join(DIST, `ElleeDog67_${version}.mcaddon`);
  write(bp, zipTree(DIST_BP));
  write(rp, zipTree(DIST_RP));
  write(addon, { ...zipTree(DIST_BP, "ElleeDog67_BP/"), ...zipTree(DIST_RP, "ElleeDog67_RP/") });
  const outputs = [bp, rp, addon];
  const sums = outputs.map(
    (file) => `${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}  ${path.basename(file)}`,
  );
  fs.writeFileSync(path.join(DIST, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);
  return outputs;
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
