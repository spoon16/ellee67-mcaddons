// `npm run test:gametest`: real behaviour tests inside Bedrock Dedicated Server, with simulated players.
//
// A SimulatedPlayer exists only in the script module that spawned it (other modules see it as undefined), so a
// feature is tested from inside its own module: for each tools/bds/gametest/src/<feature>.test.ts this builds one
// bundle holding that feature's scripts plus its tests, installs the shipped packs data-only (their script bundles
// stripped), and runs the tests on a throwaway world with the Beta APIs experiment on. The world is created once,
// its level.dat patched once, and reused for every feature in the run.
import fs from "node:fs";
import path from "node:path";
import { build as esbuild } from "esbuild";
import { buildPacks } from "../build.ts";
import { loadPacks } from "../lib/packs.ts";
import { REPO_ROOT } from "../lib/paths.ts";
import { clearContentLogs, contentLog, contentProblems } from "./content-log.ts";
import { buildStructure, byte, compound, int, readLevelDat, type Tag, writeLevelDat } from "./nbt.ts";
import { runServer } from "./run.ts";
import {
  BDS_ROOT,
  BDS_VERSION,
  configureServer,
  type ExtraPack,
  ensureServer,
  GAMETEST_WORLD_NAME,
  installPacks,
} from "./setup.ts";

const PACK_SOURCE = path.join(REPO_ROOT, "tools", "bds", "gametest");
const TESTS_DIR = path.join(PACK_SOURCE, "src");
const PACK_DIR_NAME = "ElleeDog67_GameTests";
const TEST_CLASS = "ed67";
const SIZE: [number, number, number] = [7, 5, 7];

interface Suite {
  feature: string;
  file: string;
  tests: string[];
  /** Pack ids installed for this suite: the feature's own, plus any a `// packs: a, b` line in the file adds. */
  packIds: string[];
}

interface Verdict {
  name: string;
  passed: boolean;
  detail?: string;
}

/** One suite per tools/bds/gametest/src/<feature>.test.ts, with the names its defineTest calls register. */
function suites(): Suite[] {
  const found: Suite[] = [];
  for (const name of fs.readdirSync(TESTS_DIR).sort()) {
    if (!name.endsWith(".test.ts")) continue;
    const file = path.join(TESTS_DIR, name);
    const source = fs.readFileSync(file, "utf8");
    const tests = [...source.matchAll(/defineTest\(\s*"([a-z0-9_]+)"/g)].map((match) => match[1] as string);
    if (tests.length === 0) throw new Error(`${name} registers no tests`);
    const feature = name.slice(0, -".test.ts".length);
    const extra =
      /^\/\/ packs:\s*(.+)$/m
        .exec(source)?.[1]
        ?.split(",")
        .map((id) => id.trim()) ?? [];
    const own = loadPacks()
      .filter((pack) => pack.feature === feature)
      .map((pack) => pack.id);
    found.push({ feature, file, tests, packIds: [...new Set([...own, ...extra])] });
  }
  if (found.length === 0) throw new Error(`no <feature>.test.ts under ${TESTS_DIR}`);
  return found;
}

const camel = (id: string) => id.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** Bundles one feature's scripts and its tests into the test pack's scripts/main.js. */
async function bundleSuite(suite: Suite, packDir: string): Promise<void> {
  const entryDir = path.join(BDS_ROOT, "gametest-entries");
  fs.mkdirSync(entryDir, { recursive: true });
  const entry = path.join(entryDir, `${suite.feature}.ts`);
  const rel = (file: string) => path.relative(entryDir, file).split(path.sep).join("/");
  fs.writeFileSync(
    entry,
    [
      `import "${rel(path.join(REPO_ROOT, "src", "core", "polyfills.ts"))}";`,
      `import { runFeature } from "${rel(path.join(REPO_ROOT, "src", "core", "feature.ts"))}";`,
      `import { ${camel(suite.feature)} } from "${rel(path.join(REPO_ROOT, "src", "features", suite.feature, "index.ts"))}";`,
      `import "${rel(suite.file)}";`,
      `runFeature(${camel(suite.feature)});`,
      "",
    ].join("\n"),
  );
  await esbuild({
    entryPoints: [entry],
    outfile: path.join(packDir, "scripts", "main.js"),
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2020",
    external: ["@minecraft/server", "@minecraft/server-ui", "@minecraft/server-gametest"],
    logLevel: "warning",
  });
}

/** Copies the pack skeleton into the server and writes its structures: a stone floor, and the floor with a stair. */
function installTestPack(serverDir: string): { dir: string; pack: ExtraPack } {
  const dir = path.join(serverDir, "behavior_packs", PACK_DIR_NAME);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(PACK_SOURCE, "manifest.json"), path.join(dir, "manifest.json"));
  const structures = path.join(dir, "structures", TEST_CLASS);
  fs.mkdirSync(structures, { recursive: true });
  const floor = (_x: number, y: number, _z: number) => (y === 0 ? { name: "minecraft:stone" } : undefined);
  fs.writeFileSync(path.join(structures, "floor.mcstructure"), buildStructure(SIZE, floor));
  const stair = (x: number, y: number, z: number) =>
    x === 3 && y === 1 && z === 3
      ? { name: "minecraft:oak_stairs", states: { upside_down_bit: byte(0), weirdo_direction: int(3) } }
      : floor(x, y, z);
  fs.writeFileSync(path.join(structures, "stair.mcstructure"), buildStructure(SIZE, stair));
  const manifest = JSON.parse(fs.readFileSync(path.join(PACK_SOURCE, "manifest.json"), "utf8")) as {
    header: { uuid: string; version: number[] };
  };
  return { dir, pack: { archiveDir: PACK_DIR_NAME, uuid: manifest.header.uuid, version: manifest.header.version } };
}

/**
 * Rewrites the world the first boot created, in its little-endian NBT level.dat: the Beta APIs experiment on
 * (`experiments/gametest = 1`, which @minecraft/server-gametest needs) and a flat generator (`Generator = 2`, with
 * the default FlatWorldLayers the server already wrote). The generated chunks are dropped so the next boot builds
 * the flat terrain: a random default world puts the test area in a lake often enough, and structure air does not
 * displace water, so tests that need headroom refused at random.
 */
function prepareWorld(worldDir: string): void {
  const file = path.join(worldDir, "level.dat");
  const { storageVersion, root } = readLevelDat(fs.readFileSync(file));
  if (root.type !== "compound") throw new Error(`${file}: root is not a compound`);
  const existing = root.value.experiments;
  const experiments: Record<string, Tag> = existing?.type === "compound" ? { ...existing.value } : {};
  experiments.gametest = byte(1);
  experiments.experiments_ever_used = byte(1);
  experiments.saved_with_toggled_experiments = byte(1);
  root.value.experiments = compound(experiments);
  root.value.Generator = int(2);
  fs.writeFileSync(file, writeLevelDat(storageVersion, root));
  fs.rmSync(path.join(worldDir, "db"), { recursive: true, force: true });
}

function verdictsIn(lines: string[]): Map<string, Verdict> {
  const verdicts = new Map<string, Verdict>();
  for (const line of lines) {
    const passed = /onTestPassed: ed67:([a-z0-9_]+)/.exec(line);
    if (passed) verdicts.set(passed[1] as string, { name: passed[1] as string, passed: true });
    const failed = /onTestFailed: ed67:([a-z0-9_]+) - (.*)$/.exec(line);
    if (failed) verdicts.set(failed[1] as string, { name: failed[1] as string, passed: false, detail: failed[2] });
  }
  return verdicts;
}

async function main(): Promise<void> {
  const all = suites();
  await buildPacks();
  const serverDir = ensureServer();
  configureServer(serverDir, GAMETEST_WORLD_NAME);
  const { dir: packDir, pack } = installTestPack(serverDir);
  console.log(
    `Bedrock Dedicated Server ${BDS_VERSION}; ${all.length} suites: ${all.map((suite) => `${suite.feature} (${suite.tests.length})`).join(", ")}`,
  );

  // A first boot with the first suite creates the world, then its level.dat gets the experiment the tests need.
  const first = all[0] as Suite;
  await bundleSuite(first, packDir);
  const worldDir = installPacks(serverDir, GAMETEST_WORLD_NAME, [pack], { scripts: false, packIds: first.packIds });
  const boot = await runServer(serverDir, { warmUpMs: 500, commandGapMs: 0 });
  if (!boot.started) throw new Error("the server did not start to create the world");
  prepareWorld(worldDir);

  const failures: string[] = [];
  const dump: string[] = [];
  for (const suite of all) {
    if (suite !== first) await bundleSuite(suite, packDir);
    installPacks(serverDir, GAMETEST_WORLD_NAME, [pack], { scripts: false, freshWorld: false, packIds: suite.packIds });
    console.log(
      `\n${suite.feature} (${suite.packIds.join(", ")}): ${suite.tests.map((name) => `${TEST_CLASS}:${name}`).join(", ")}`,
    );
    clearContentLogs(serverDir);
    const result = await runServer(serverDir, {
      commands: [`gametest runset ${TEST_CLASS}`],
      warmUpMs: 3000,
      commandGapMs: 90_000,
      timeoutMs: 180_000,
      stopWhen: (lines) => verdictsIn(lines).size >= suite.tests.length,
      onLine: (line) => {
        if (/onTest|\[Scripting\]|\[gametest\]|ERROR\]/.test(line)) console.log(`  ${line}`);
      },
    });
    dump.push(`===== ${suite.feature} =====`, ...result.lines);
    if (!result.lines.some((line) => line.includes("Experiment(s) active"))) {
      failures.push(`${suite.feature}: the Beta APIs experiment was not active`);
    }
    const verdicts = verdictsIn(result.lines);
    for (const name of suite.tests) {
      const verdict = verdicts.get(name);
      const ok = verdict?.passed === true;
      if (!ok) failures.push(`${TEST_CLASS}:${name}: ${verdict?.detail ?? "no verdict"}`);
      console.log(`  ${ok ? "ok  " : "FAIL"} ${TEST_CLASS}:${name}${verdict?.detail ? `: ${verdict.detail}` : ""}`);
    }
    // This boot had only the suite's packs active, a combination the all-pack smoke test never sees. Pets alone once
    // printed eleven warnings here, from a function that gave items only Rbow Ore defines.
    const problems = contentProblems(contentLog(serverDir) ?? []);
    if (problems.length) failures.push(`${suite.feature}: content log not clean\n    ${problems.join("\n    ")}`);
    console.log(`  ${problems.length ? "FAIL" : "ok  "} content log clean`);
  }

  if (failures.length) {
    const file = path.join(BDS_ROOT, "last-gametest.log");
    fs.writeFileSync(file, `${dump.join("\n")}\n`);
    console.error(`\n${failures.length} failure(s); full server output in ${path.relative(REPO_ROOT, file)}`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(`\nall ${all.reduce((sum, suite) => sum + suite.tests.length, 0)} GameTests passed`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
