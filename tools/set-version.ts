// Keeps package.json and both manifests on the same version.
//   npm run bump -- 0.2.0      runs `npm version 0.2.0`, which commits, tags and (via the "version" hook) rewrites the manifests
//   tsx tools/set-version.ts --from-package   rewrites the manifests from package.json (what the hook runs)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readStrictJson } from "./lib/json.ts";
import { BP_SOURCE, REPO_ROOT, RP_SOURCE } from "./lib/paths.ts";

function parseVersion(text: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (!match) throw new Error(`version must be MAJOR.MINOR.PATCH, got ${text}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function writeManifestVersions(version: string): void {
  const triple = parseVersion(version);
  const rpManifestPath = path.join(RP_SOURCE, "manifest.json");
  const bpManifestPath = path.join(BP_SOURCE, "manifest.json");
  const rp = readStrictJson(rpManifestPath) as any;
  const bp = readStrictJson(bpManifestPath) as any;
  for (const manifest of [rp, bp]) {
    manifest.header.version = triple;
    for (const module of manifest.modules) module.version = triple;
  }
  for (const dependency of bp.dependencies) if (dependency.uuid === rp.header.uuid) dependency.version = triple;
  fs.writeFileSync(rpManifestPath, `${JSON.stringify(rp, null, 2)}\n`);
  fs.writeFileSync(bpManifestPath, `${JSON.stringify(bp, null, 2)}\n`);
}

const argument = process.argv[2];
if (argument === "--from-package") {
  const version = (readStrictJson(path.join(REPO_ROOT, "package.json")) as { version: string }).version;
  writeManifestVersions(version);
  console.log(`manifests set to ${version}`);
} else if (argument) {
  parseVersion(argument);
  execFileSync("npm", ["version", argument], { cwd: REPO_ROOT, stdio: "inherit" });
} else {
  console.error("usage: npm run bump -- <major.minor.patch>");
  process.exit(2);
}
