# Ecosystem: libraries, tools and how to test for real

An evaluation of what the Bedrock community and Mojang offer against what this repository already
has, and the answer to "can the add-on be tested in the cloud container without a person at an
iPad". Everything below was tried here, in a Claude Code on the web session, on 15 September 2026;
the "what happened" lines are quotes from those runs, not expectations.

The short version:

- **Yes, real in-engine testing works headlessly.** Bedrock Dedicated Server 1.26.45.1 (the same
  engine version as the game) starts in this container in about a second, loads all nine packs,
  prints the Content Log to stdout, runs the add-on's own custom commands from its console, and
  runs GameTests with simulated players. A full run is about 30 seconds.
- **The first headless boot found two shipping bugs the unit tests cannot see.** Every feature
  fails to start, and every `pet:`, `sit:` and `elleedog:` command is missing in the real game. Both
  are small fixes (below). They are the strongest argument for adopting the harness.
- **Keep the custom tooling.** `tools/build.ts`, `manifests.ts`, `validate.ts`, the engine mock and
  the Pets compiler each do something no community tool does for a nine-pack add-on. Regolith,
  `@minecraft/core-build-tasks` and bridge. would replace working code with a workflow built for
  one-pack projects.
- **Add, in this order:** the headless BDS harness; Mojang's `mct validate` in CI; a stricter
  engine mock; `@minecraft/vanilla-data` for typed identifiers.

## 1. What the headless engine run found

`README.md` says "Nothing in this repository has been run in Minecraft yet." Thirty seconds of BDS
answered what a mock never could:

```
[Scripting] [ElleeDog 67 Pets 0.5.2-native-armor-isolation] Custom Command Enum namespaces must match. Namespace 'pet' does not match existing namespace 'elleedog67'.
[Scripting] [ElleeDog 67] stair-sit registration failed: Custom Command Enum namespaces must match. Namespace 'sit' does not match existing namespace 'elleedog67'.
[Scripting] [ElleeDog 67] ender-mod registration failed: Custom Command Enum namespaces must match. Namespace 'elleedog' does not match existing namespace 'elleedog67'.
Server started.
[Scripting] [ElleeDog 67] pets failed to start: Incorrect number of arguments to function. Expected 1, received 2
[Scripting] [ElleeDog 67] stair-sit failed to start: Incorrect number of arguments to function. Expected 1, received 2
[Scripting] [ElleeDog 67] creeper-mod failed to start: Incorrect number of arguments to function. Expected 1, received 2
[Scripting] [ElleeDog 67] ender-mod failed to start: Incorrect number of arguments to function. Expected 1, received 2
[Scripting] [ElleeDog 67] redstone-guide failed to start: Incorrect number of arguments to function. Expected 1, received 2
[Scripting] [ElleeDog 67] rbow-ore failed to start: Incorrect number of arguments to function. Expected 1, received 2
[Scripting] [ElleeDog 67] loaded
```

Both were then pinned down with a throwaway probe pack that tried each call in isolation.

### Bug 1: `FeatureContext.on` passes `undefined` as a second argument

`src/core/subscriptions.ts` always calls `signal.subscribe(callback, options)`. The engine counts
arguments at the native boundary, so a signal whose `subscribe` takes one parameter rejects the
call even though `options` is `undefined`:

```
[PROBE] OK   beforeEvents.explosion.subscribe(cb)
[PROBE] FAIL beforeEvents.explosion.subscribe(cb, undefined): TypeError: Incorrect number of arguments to function. Expected 1, received 2
[PROBE] OK   afterEvents.entityHurt.subscribe(cb, undefined)
[PROBE] OK   afterEvents.entityHurt.subscribe(cb, {entityTypes:['minecraft:creeper']})
[PROBE] FAIL afterEvents.playerSpawn.subscribe(cb, undefined): TypeError: Incorrect number of arguments to function. Expected 1, received 2
```

In the `@minecraft/server` 2.9.0 typings, 29 `subscribe` signatures take an options object
(entity-filtered events such as `entityHurt`, `entityDie`, `effectAdd`, `playerBreakBlock`,
`scriptEventReceive`) and 117 take exactly one argument. No feature in this repository passes
options, so every `ctx.on` on a one-argument signal throws, and every feature has at least one.
Fix: forward the second argument only when it was given.

```ts
on<TEvent, TOptions>(signal: Signal<TEvent, TOptions>, callback: (event: TEvent) => void, options?: TOptions): void {
  if (options === undefined) signal.subscribe(callback);
  else signal.subscribe(callback, options);
  this.disposers.push(() => signal.unsubscribe(callback));
}
```

The mock's `subscribe(callback, _options?)` accepts any arity, which is why 650 tests pass.

### Bug 2: one script module gets one command namespace

The engine requires every custom command **and** every enum registered by a script module to share
the namespace of the first one registered. The core registers `elleedog67:feature` first, so
`sit:*`, `pet:*` and `elleedog:*` are refused at startup, and since a feature's `register()` throws
at that point, everything it would have registered afterwards is missing too. From the console:

```
[PROBE] OK   registerCommand elleedog67:a
[PROBE] FAIL registerCommand sit:b (different command namespace): CustomCommandError: Custom Command Enum namespaces must match. Namespace 'sit' does not match existing namespace 'elleedog67'.
[PROBE] OK   registerEnum elleedog67:e1
[PROBE] FAIL registerEnum pet:e2 (different enum namespace): CustomCommandError: ...
[PROBE] OK   registerEnum elleedog67:pet_e2 (same namespace, prefixed name)
[PROBE] FAIL registerCommand pet:c using enum elleedog67:pet_e2: CustomCommandError: ...
Unknown command: sit:b. Please check that the command exists and that you have permission to use it.
Unknown command: pet:c. Please check that the command exists and that you have permission to use it.
```

The message says "Enum" even for commands; the rule covers both. This is the `NamespaceNameError` /
`CustomCommandError` the [CustomCommandRegistry docs](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/customcommandregistry?view=minecraft-bedrock-stable)
mention without explaining. Fix: put every command and enum under `elleedog67:` and keep the
feature as a prefix on the name (`elleedog67:pet_form`, `elleedog67:sit`, `elleedog67:ender_protect`,
`elleedog67:pet_form_choice`), then update `manual.commands`, the feature docs and the tests. The
mock only checks that a name contains a colon, so it needs the same rule (see section 4).

Everything else in the boot was clean: nine packs on the stack, no Content Log complaints about
any JSON, and `/elleedog67:features` and `/elleedog67:enable creeper-mod` answered from the console
exactly as the manual describes (the latter with the add-on's own "could not be started ... See the
content log" reply, which means the error path works).

## 2. Testing in the cloud container: the headless BDS harness

### What was proven

| Step | Result here |
|---|---|
| Download `bedrock-server-1.26.45.1.zip` (104 MB) from `www.minecraft.net/bedrockdedicatedserver/bin-linux/` | 1.5 s. The CDN refuses the default `curl` user agent with an HTTP/2 stream error; a browser `User-Agent` and `--http1.1` fix it. The version list comes from a community JSON index (see Sources). |
| Start `bedrock_server` on Ubuntu 24.04 glibc 2.39, x86_64 | starts in ~1 s. The container has no IPv6, and BDS exits if its IPv6 socket fails; a 60-line `LD_PRELOAD` shim from the reference harness (see Sources) hands it a loopback IPv4 socket instead. Every dependency is bundled; no `apt` needed. |
| Load the nine packs from `dist/` | copy them under the server's `behavior_packs/` and `resource_packs/`, list their uuids in `worlds/<name>/world_behavior_packs.json` and `world_resource_packs.json` (that file can be written before the world exists), start once. |
| See the Content Log | `content-log-console-output-enabled=true` and `content-log-file-enabled=true` in `server.properties`; it is the same log the manual test plan says to keep open on the iPad. |
| Run the add-on's commands | typed on the server's stdin; replies arrive on stdout. `allow-cheats=true`, `online-mode=false`, `allow-list=false`. |
| Run GameTests with a simulated player | needs the Beta APIs experiment, which lives in the world's `level.dat` (little-endian NBT: `experiments/gametest = 1`), a test-only behavior pack depending on `@minecraft/server-gametest` `1.0.0-beta`, and an `.mcstructure` per test. Result: `onTestPassed: probe:hello` with `world.getAllPlayers()` returning the simulated player, and `onTestFailed: probe:deliberate_failure - <message>` for the failing one. |

Each run: about 30 seconds wall clock, 2 threads, well under 1 GB of RAM.

### Three rungs, cheapest first

1. **Boot smoke test.** Start the server with all nine packs, wait for `Server started.` and the
   add-on's `loaded` line, stop. Fail the run on any `[Scripting]` warning or error, any Content
   Log error, or a missing `loaded`. This alone would have caught both bugs above. No experiments,
   no extra pack, no world-state side effects: the stable API only.
2. **Console-driven checks.** After the boot, send `/elleedog67:features`, `/elleedog67:enable x`,
   `/elleedog67:disable x` and each feature's own commands, and assert on the replies. The console
   is an operator, so permission gates that need a player are not exercised here.
3. **GameTests.** A separate `tools/bds/gametest-pack/` (never in the `.mcaddon`) registers tests
   that spawn simulated players, give them the book, run commands as them, sit on stairs, and
   assert on world state. Runs on a throwaway world with Beta APIs on; achievements are disabled on
   such a world, which is why it must never be a real one. `@minecraft/server-gametest` is
   beta-only (`1.0.0-beta.1.26.60-preview.23` is current) and can change between releases; the
   shipped add-on stays on the stable modules.

### What it would look like in this repository

- `tools/bds/setup.ts`: resolve the version, download with a browser user agent, unzip into
  `.bds/` (git-ignored), write `server.properties`, copy `dist/`, write the world pack lists, and
  for rung 3 flip `gametest` in `level.dat`.
- `tools/bds/run.ts`: spawn the server, stream stdout, send commands, stop on quiet or timeout,
  return the lines; `tools/bds/smoke.ts` and `tools/bds/gametest.ts` judge them.
- `npm run test:engine` for rungs 1 and 2 in CI on every push; rung 3 when the tests exist.
- The session hook stays as it is; the harness downloads on first use. `www.minecraft.net` joins
  the host table in [CLOUD_ENVIRONMENT.md](CLOUD_ENVIRONMENT.md) when this lands.
- The server zip is downloaded at run time and never committed: the Minecraft EULA lets you run
  the dedicated server, not redistribute it. GitHub Actions `ubuntu-latest` runners can do the
  same download, and the IPv6 shim covers runners without IPv6.

### Why not the mock alone

`test/mocks/minecraft-server.ts` (855 lines) is good at what it was written for: proving that
features wire up, schedule and clean up. It is a model of the API written from the typings, so
it cannot know what the typings do not say: argument counting at the native boundary, the
one-namespace rule, whether a JSON file loads, whether `EntityTypes.get` finds a pack entity. The
engine is the only oracle for those, and now it is a 30-second command away.

## 3. Mojang's validator: `mct validate`

[Minecraft Creator Tools](https://learn.microsoft.com/en-us/minecraft/creator/documents/mctoolsoverview?view=minecraft-bedrock-stable)
(`@minecraft/creator-tools` 0.17.8, MIT, Node 22+) validates a folder holding `behavior_packs/`
and `resource_packs/` against [50-odd rule categories](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/mctoolsvalreference/validationrulesindex?view=minecraft-bedrock-stable):
manifests, format versions, JSON schemas, texture and item links, lang files, pack icons, script
module dependencies. It writes a CSV, an HTML report and a JSON file, and exits non-zero on errors.
It ran here in 29 seconds against the nine built packs.

Suites: `main` and `default` are the ones for a private add-on. `addon` is the Marketplace
"Cooperative Add-On" rule set (`<creatorshortname>` folders, `pack_scope: world`); it produced 60+
errors here that do not apply to a self-published pack, so do not use it.

What `main` reported on `dist/` (0.2.3):

| Severity | Count | What |
|---|---|---|
| Error | 14 | `LICENSE` and `THIRD_PARTY_NOTICES.md` in every pack: "File Does Not Have Allowed Extension" and "extraneous file or folder". Renaming to `.txt` clears 9 of them; the other 5 stay because mct wants nothing in a pack the game does not read. Either ship the notices at the release instead of inside the packs, or filter the `FORBFILE`/`PRJINT` rules. Bedrock itself ignores the files. |
| Warning | 90 | 33 "uv_anim is missing and it is required" in the Pets render controller overrides (a community-schema strictness; check against the vanilla file in `bedrock-samples` before changing anything); 21 structure notes; 28 "link not found in this pack" for textures and items the Pets and Rbow packs share (expected: they are split on purpose, see ARCHITECTURE.md); 3 "uses a `minecraft:` identifier override" (the documented player and Enderman overrides); 5 missing-field notes in the Rbow `weighted_random_feature`. |
| Recommendation | 394 | mostly "avoid linking to vanilla textures/models" (295) and format versions older than current (99). Informational. |

Recommendation: add `npx mct validate main -i <project> -o dist/mct` to CI as a report first
(upload the HTML), then turn errors into failures once the notices question is settled. It
complements rather than replaces `tools/validate.ts`: mct knows the schemas and the platform
rules, `validate.ts` knows this add-on (identifier uniqueness across nine packs, the `overrides/`
rule, the byte-identical player override, `packs.json` as the source of truth). mct also exposes an
MCP server, which a Claude Code session could use to validate content while editing.

## 4. The libraries and tools, one by one

### Keep

| Existing | Verdict | Why |
|---|---|---|
| `tools/build.ts` (48 lines) + esbuild | keep | Nine packs, one bundle, `packs.json`-driven, deterministic. Nothing to gain from a framework. |
| `tools/manifests.ts` + `packs.json` | keep | Single source of truth for uuids and the dependency graph; no tool offers that for multi-pack add-ons. |
| `tools/validate.ts` (303 lines) | keep, pair with mct | Encodes rules specific to this add-on (above). |
| `test/mocks/` (1003 lines) + vitest | keep, harden | Fast, deterministic unit tests are still the right first line. Harden it where the engine is stricter: (a) `subscribe` throws when a signal that takes one argument receives two, with the option-taking signals listed from the typings; (b) `registerCommand`/`registerEnum` throw on a second namespace, like the engine. Both bugs in section 1 then become failing unit tests. No community mock of `@minecraft/server` exists; a search found none. |
| Pets compiler (Python, 1860 lines, 244 tests) | keep | Hash-locked artwork and a bespoke rig catalog. Blockbench has no CLI (the request is an open issue), and Regolith's `blockbench_convert` filter needs `.bbmodel` sources this project does not have. |
| Biome | keep | `eslint-plugin-minecraft-linting` carries one rule (`avoid-unnecessary-command`) and would mean adding ESLint alongside Biome. |

### Add

| Package | Use | Notes |
|---|---|---|
| Headless BDS harness (section 2) | real engine tests | The largest gap; nothing else in this list catches what it catches. |
| `@minecraft/creator-tools` (section 3) | schema and platform validation in CI | Dev dependency or `npx`; already proven on this repo. |
| [`@minecraft/vanilla-data`](https://www.npmjs.com/package/@minecraft/vanilla-data) 1.26.44 | typed vanilla identifiers | The scripts contain 225 distinct `"minecraft:..."` string literals. `MinecraftEntityTypes.Player`, `MinecraftItemTypes.IronPickaxe`, `MinecraftBlockTypes.Dirt` make a typo a compile error. Versioned with the game, so pin it to the `min_engine_version`. Types only, no runtime cost. |
| [`@minecraft/math`](https://www.npmjs.com/package/@minecraft/math) 2.4.0 | vector helpers | Optional. Five files do their own `Math.hypot`/`atan2` work (creeper blast, ender gate, seats, pet seating and probes); `Vector3Utils.distance`, `subtract`, `normalize` would shorten them. Small win, adopt when touching those files. |
| [`@minecraft/bedrock-schemas`](https://github.com/Mojang/bedrock-schemas) | JSON schemas and `.d.ts` for pack files | Mojang's official schemas (beta, 1.26.x). Useful in two places: `settings-template.json` gives VS Code validation for hand-written pack JSON, and the TypeScript types could type the Pets compiler's templates. Blockception's schemas (already recommended via the VS Code extension) cover the editor case today. |

### Not worth it here

| Tool | What it is | Why not |
|---|---|---|
| [Regolith](https://github.com/Bedrock-OSS/regolith) 1.8.0 (Go, May 2026) | Filter-based add-on compiler: `packs/BP` + `packs/RP` through Python/Node/Go/shell filters into `com.mojang` or a build folder | Built around one BP and one RP per project; nine packs means nine projects or an `exact` export target per pair, on top of a Go binary to install. Its filters (`json_cleaner`, `bump_manifest`, `texture_list`, `gametests`) do what `tools/` already does in 48+75+303 lines of TypeScript. Its `gametests` filter is the one interesting piece, and section 2 covers that without it. |
| [`@minecraft/core-build-tasks`](https://www.npmjs.com/package/@minecraft/core-build-tasks) 5.7.0 | Mojang's `just-scripts` tasks: `bundle` (esbuild), `copyArtifacts` to `com.mojang`, `packBP`/`packRP`/`packMcaddon` | Assumes one BP and one RP, ESLint and Prettier, and `just` as the task runner. `package.ts` (44 lines) already makes a deterministic nine-folder `.mcaddon`. |
| [bridge.](https://bridge-core.app/) + Dash | An IDE for add-ons with its own compiler and TypeScript plugin | An editor, not a library; the repo is already VS Code + Biome + esbuild. |
| Blockception VS Code extension | JSON schemas, Molang and lang completion | Already in `.vscode/extensions.json`. Keep. |
| [`molang`](https://github.com/bridge-core/molang) (bridge-core) | Molang parser and interpreter in TypeScript | Only if a test wants to evaluate the render controller expressions the Pets compiler emits. Niche; revisit if a Molang bug ever ships. |
| `@minecraft/gameplay-utilities` | `nextEvent()` promise wrapper around signals | Tiny; `FeatureContext` already owns subscriptions and disposal. |

### Versions

`@minecraft/server` 2.9.0 and `@minecraft/server-ui` 2.0.0 in `manifests.ts` are the current
stable line (npm `latest` is 2.9.0 and 2.1.0, published 8 September 2026, matching game 1.26.4x).
`server-ui` 2.1.0 is available when something in it is wanted. BDS 1.26.45.1 is the matching
server.

## 5. Suggested order

1. Fix the two bugs in section 1 and harden the mock so they stay fixed.
2. Land `tools/bds/` with the boot smoke test and `npm run test:engine`; run it in CI.
3. Add `mct validate main` as a CI report; decide what to do with the notice files.
4. Adopt `@minecraft/vanilla-data` feature by feature.
5. Write the first GameTests for the manual test plan in [TESTING.md](TESTING.md): the book hand-out,
   `/elleedog67:enable` from a non-operator, one stair sit, one creeper blast.

## Sources

- Bedrock Dedicated Server download index (community, points at Mojang's CDN): [kittizz/bedrock-server-downloads](https://github.com/kittizz/bedrock-server-downloads); the itzg Docker image documents the user-agent requirement: [issue #458](https://github.com/itzg/docker-minecraft-bedrock-server/issues/458).
- Headless GameTest harness this spike copied its IPv6 shim and `level.dat` editor from: [tyevco/minecraft-qol PR #27](https://github.com/tyevco/minecraft-qol/pull/27).
- Experiments in `level.dat`: [Bedrock Wiki, Enabling Experiments by Editing NBT](https://wiki.bedrock.dev/nbt/enabling-experiments).
- Scripting on BDS and `config/default/permissions.json`: [Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/scripting?view=minecraft-bedrock-stable).
- GameTest: [Bedrock Wiki](https://wiki.bedrock.dev/scripting/game-tests), [`/gametest` command](https://minecraft.wiki/w/Commands/gametest), [`@minecraft/server-gametest` module](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/minecraft-server-gametest?view=minecraft-bedrock-experimental).
- Minecraft Creator Tools: [overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/mctoolsoverview?view=minecraft-bedrock-stable), [validation rules](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/mctoolsvalreference/validationrulesindex?view=minecraft-bedrock-stable), [repository](https://github.com/Mojang/minecraft-creator-tools).
- Mojang's open-source libraries (`math`, `gameplay-utilities`, `core-build-tasks`, the ESLint plugin): [Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/libraries?view=minecraft-bedrock-stable).
- Regolith: [repository](https://github.com/Bedrock-OSS/regolith), [standard filters](https://github.com/Bedrock-OSS/regolith-filters), [export targets](https://regolith-docs.readthedocs.io/en/1.5.1/project-configuration/export-targets/).
- Schemas: [Mojang/bedrock-schemas](https://github.com/Mojang/bedrock-schemas), [Blockception/Minecraft-bedrock-json-schemas](https://github.com/Blockception/Minecraft-bedrock-json-schemas).
- bridge. and Dash: [bridge-core](https://github.com/bridge-core), [dash-compiler](https://github.com/bridge-core/dash-compiler); Molang parser: [bridge-core/molang](https://github.com/bridge-core/molang).
- Blockbench CLI status: [JannisX11/blockbench issue #1764](https://github.com/JannisX11/blockbench/issues/1764).
