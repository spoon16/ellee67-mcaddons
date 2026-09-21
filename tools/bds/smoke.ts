// `npm run test:engine`: the boot smoke test. Builds the packs, starts the real Bedrock server with all of them
// active, runs one command per script namespace from the console, and fails on anything the engine mock cannot see:
// a pack missing from the stack, a script warning or error, a content log error, or a command the engine refused.
import fs from "node:fs";
import path from "node:path";
import { buildPacks } from "../build.ts";
import { loadPacks } from "../lib/packs.ts";
import { REPO_ROOT } from "../lib/paths.ts";
import { clearContentLogs, contentLog, contentProblems } from "./content-log.ts";
import { runServer } from "./run.ts";
import { BDS_VERSION, setup } from "./setup.ts";

/**
 * One command per pack that registers any. The console is not a player, so each callback answers with its
 * "run this as a player" refusal: that reply proves the command reached the add-on's code, while a namespace the
 * engine refused at startup answers "Unknown command" instead.
 */
const PROBES: Array<{ pack: string; command: string; reply: RegExp }> = [
  { pack: "pets", command: "pet:forms", reply: /Run directly as a player\./ },
  { pack: "stair-sit", command: "sit:controls", reply: /Run this command as a player in the world\./ },
  { pack: "ender-mod", command: "elleedog:ender_protect list", reply: /Run this command as a player with Operator/ },
];

/**
 * Any script warning fails the run, including the engine's "Custom Command alias [x] already in use" notice: it is
 * printed on screen at every world load, and the fix is a short name no vanilla command or other pack uses.
 */
const SCRIPT_PROBLEM = /\b(WARN|ERROR)\] \[Scripting\]/;

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

async function main(): Promise<void> {
  await buildPacks();
  const serverDir = setup();
  console.log(`Bedrock Dedicated Server ${BDS_VERSION} at ${path.relative(REPO_ROOT, serverDir)}`);
  clearContentLogs(serverDir);
  const result = await runServer(serverDir, {
    commands: PROBES.map((probe) => probe.command),
    onLine: (line) => {
      if (/\[Scripting\]|Server started|Unknown command|ERROR\]/.test(line)) console.log(`  ${line}`);
    },
  });

  const packs = loadPacks();
  const checks: Check[] = [];
  const lines = result.lines;
  checks.push({
    name: "server started",
    ok: result.started,
    detail: result.started ? undefined : lines.slice(-5).join("\n"),
  });
  checks.push({ name: "run finished within the time limit", ok: !result.timedOut });
  checks.push({ name: "server exited cleanly", ok: result.exitCode === 0, detail: `exit code ${result.exitCode}` });
  for (const pack of packs) {
    if (pack.kind !== "behavior") continue;
    const listed = lines.some((line) => line.includes("Pack Stack") && line.includes(`(id: ${pack.uuid},`));
    checks.push({ name: `${pack.id} in the pack stack`, ok: listed });
  }
  for (const pack of packs) {
    if (!pack.modules.script) continue;
    const loaded = lines.some((line) => line.includes(`[Scripting] [ElleeDog 67] ${pack.feature} loaded`));
    checks.push({ name: `${pack.id} scripts loaded`, ok: loaded });
  }
  const problems = lines.filter((line) => SCRIPT_PROBLEM.test(line));
  checks.push({ name: "no script warnings or errors", ok: problems.length === 0, detail: problems.join("\n") });
  const content = contentLog(serverDir);
  const contentErrors = contentProblems(content ?? []);
  checks.push({
    name: "content log written and clean",
    ok: content !== undefined && contentErrors.length === 0,
    detail: content === undefined ? "the server wrote no ContentLog*.txt" : contentErrors.join("\n"),
  });
  for (const probe of PROBES) {
    const name = probe.command.split(" ")[0] as string;
    const unknown = lines.find((line) => line.includes(`Unknown command: ${name}`));
    const answered = lines.some((line) => probe.reply.test(line));
    checks.push({
      name: `/${name} reaches the ${probe.pack} scripts`,
      ok: !unknown && answered,
      detail: unknown ?? (answered ? undefined : `no reply matching ${probe.reply}`),
    });
  }

  console.log("");
  for (const check of checks) {
    console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}`);
    if (!check.ok && check.detail) for (const line of check.detail.split("\n")) console.log(`       ${line}`);
  }
  const failed = checks.filter((check) => !check.ok);
  if (failed.length) {
    const dump = path.join(REPO_ROOT, ".bds", "last-run.log");
    fs.writeFileSync(dump, `${lines.join("\n")}\n`);
    console.error(`\n${failed.length} check(s) failed; full server output in ${path.relative(REPO_ROOT, dump)}`);
    process.exit(1);
  }
  console.log(`\nengine smoke test passed: ${checks.length} checks, ${lines.length} log lines`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
