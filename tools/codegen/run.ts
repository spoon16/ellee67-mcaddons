// `npm run codegen`: regenerates every generated file in the repo.
//   1. Enderman override from the pinned vanilla snapshot (tools/codegen/enderman).
//   2. Pets and Rbow pack content: copies the vendored compiler into .codegen-work/pets, transpiles the hand-written
//      TypeScript pet scripts into its src/*.js (the compiler packages and unit-tests plain JavaScript), runs it with
//      the uv-managed Python, runs its own unit tests, and syncs the output into the pack tree (tools/codegen/sync.ts).
// CI runs this and fails if `git diff` is not empty afterwards.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
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
  transpilePetScripts(path.join(WORKSPACE, "src"));
}

// index.ts is the add-on's feature wrapper and the *.generated.ts files are the compiler's own output; everything else
// in src/features/pets is a script the compiler expects to find as src/<name>.js. Some of its Python tests grep that
// emitted JavaScript: test_quiet_startup_044 (main.js keeps `rememberFailure(player, error, system.currentTick,
// "lifecycle"); fail(undefined, error);`, a `restore(<x>.player)` call and `reg("book"`, and no gamerule, chat or
// onScreenDisplay tokens anywhere), test_property_diagnostics_045 (property_health.js has no property, equipment,
// command or teleport write calls), test_gear (tool_effects.js never mutates inventories) and test_framework
// (core.js references MODEL_BY_ID).
const NOT_A_PET_SCRIPT = /^(index\.ts|.*\.generated\.ts|.*\.d\.ts|.*\.test\.ts)$/;

/** Emits each pet script as ES2020 JavaScript, rewriting `./x.ts` imports to `./x.js`, without bundling. */
export function transpilePetScripts(destination: string): string[] {
  const names = fs.readdirSync(PETS_SCRIPTS).filter((name) => name.endsWith(".ts") && !NOT_A_PET_SCRIPT.test(name));
  if (names.length === 0) throw new Error(`no pet scripts found in ${PETS_SCRIPTS}`);
  fs.mkdirSync(destination, { recursive: true });
  const written: string[] = [];
  for (const name of names) {
    const source = fs.readFileSync(path.join(PETS_SCRIPTS, name), "utf8");
    const { outputText, diagnostics } = ts.transpileModule(source, {
      fileName: name,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        rewriteRelativeImportExtensions: true,
        removeComments: false,
      },
    });
    const problem = diagnostics?.[0];
    if (problem) throw new Error(`${name}: ${ts.flattenDiagnosticMessageText(problem.messageText, "\n")}`);
    const target = path.join(destination, name.replace(/\.ts$/, ".js"));
    fs.writeFileSync(target, outputText);
    written.push(target);
  }
  return written;
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
