// `npm run codegen`: regenerates every generated file in the repo.
//   1. Enderman override from the pinned vanilla snapshot (tools/codegen/enderman).
//   2. Pets and Rbow pack content: copies the vendored compiler into .codegen-work/pets, adds the hand-written
//      pet scripts as its src/, runs it with the uv-managed Python, runs its own unit tests, and syncs the output
//      into the pack tree (tools/codegen/sync.ts).
// CI runs this and fails if `git diff` is not empty afterwards.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../lib/paths.ts";
import { writeManifests } from "../manifests.ts";
import { syncWorkspace } from "./sync.ts";

const COMPILER = path.join(REPO_ROOT, "tools", "codegen", "pets");
const WORKSPACE = path.join(REPO_ROOT, ".codegen-work", "pets");
const PETS_SCRIPTS = path.join(REPO_ROOT, "src", "features", "pets");

function uv(args: string[], cwd = REPO_ROOT): void {
  execFileSync("uv", ["run", "--project", COMPILER, "--frozen", ...args], { cwd, stdio: "inherit" });
}

function prepareWorkspace(): void {
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
  fs.mkdirSync(WORKSPACE, { recursive: true });
  fs.cpSync(COMPILER, WORKSPACE, {
    recursive: true,
    filter: (source) => !/\/(\.venv|__pycache__)(\/|$)/.test(source) && !/\/(uv\.lock|pyproject\.toml)$/.test(source),
  });
  const scripts = fs
    .readdirSync(PETS_SCRIPTS)
    .filter((name) => name.endsWith(".js") && !name.endsWith(".generated.js"));
  if (scripts.length === 0) throw new Error(`no pet scripts found in ${PETS_SCRIPTS}`);
  fs.mkdirSync(path.join(WORKSPACE, "src"), { recursive: true });
  for (const name of scripts) fs.copyFileSync(path.join(PETS_SCRIPTS, name), path.join(WORKSPACE, "src", name));
}

async function generateEnderman(): Promise<void> {
  const module = await import("./enderman/inject.ts");
  module.generateEnderman(module.UPSTREAM_FILE, module.OUTPUT_FILE);
}

async function main(): Promise<void> {
  const pythonTestsOnly = process.argv.includes("--python-tests-only");
  const skipPythonTests = process.argv.includes("--skip-python-tests");
  if (!pythonTestsOnly) await generateEnderman();
  prepareWorkspace();
  console.log("compiling pets and rbow packs...");
  uv(["python", path.join(WORKSPACE, "tools", "build.py"), "--root", WORKSPACE]);
  if (!skipPythonTests) {
    console.log("running the compiler's unit tests...");
    uv(["python", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"], WORKSPACE);
  }
  if (pythonTestsOnly) return;
  const report = syncWorkspace(WORKSPACE);
  console.log(
    `synced: ${report.written.length} written, ${report.unchanged.length} unchanged, ${report.removed.length} removed`,
  );
  for (const file of report.written) console.log(`  wrote ${file}`);
  for (const file of report.removed) console.log(`  removed ${file}`);
  for (const file of writeManifests()) console.log(`  manifest ${file}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
