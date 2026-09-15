// Assembles dist/: copies every pack from packs.json, bundles each behavior pack's src/packs/<feature>.ts into its
// scripts/main.js with esbuild, then validates the result. Nothing here runs a generator; see tools/codegen for that.
import fs from "node:fs";
import path from "node:path";
import { build as esbuild } from "esbuild";
import { copyTree } from "./lib/files.ts";
import { distDir, loadPacks, packDir, scriptEntry } from "./lib/packs.ts";
import { DIST, isMain, REPO_ROOT } from "./lib/paths.ts";
import { validateBuild } from "./validate.ts";

export async function buildPacks(): Promise<void> {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  for (const pack of loadPacks()) {
    const target = distDir(pack.id);
    copyTree(packDir(pack.id), target);
    for (const notice of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
      const source = path.join(REPO_ROOT, notice);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(target, notice));
    }
  }
  for (const pack of loadPacks()) {
    const entry = scriptEntry(pack);
    if (!entry) continue;
    await esbuild({
      entryPoints: [entry],
      outfile: path.join(distDir(pack.id), "scripts", "main.js"),
      bundle: true,
      format: "esm",
      platform: "neutral",
      target: "es2020",
      external: ["@minecraft/server", "@minecraft/server-ui"],
      sourcemap: false,
      minify: false,
      legalComments: "none",
      logLevel: "warning",
    });
  }
  const report = validateBuild();
  if (report.errors.length) {
    for (const error of report.errors) console.error(`error: ${error}`);
    throw new Error(`build validation failed with ${report.errors.length} error(s)`);
  }
  console.log(`built dist/ (${JSON.stringify(report.counts)})`);
}

if (isMain(import.meta.url)) {
  buildPacks().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
