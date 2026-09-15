# ElleeDog 67: guide for Claude Code sessions

One Minecraft Bedrock add-on: six features, ten packs, one `.mcaddon`. Each feature is its own
behavior pack with its own script bundle; activating the pack in the world is the only switch.
Read `docs/ARCHITECTURE.md` before changing structure and `docs/ADDING_A_FEATURE.md` before adding
one. This file is the short version.

## Commands

```bash
npm run check         # tsc --noEmit + biome; run before every commit
npm test              # vitest: runtime, every feature, and a real build of the packs (~6 s)
npm run build         # dist/<pack>/ for all ten packs, one bundle per behavior pack, validation
npm run package       # dist/ElleeDog67_<version>.mcaddon + SHA256SUMS.txt
npm run codegen       # regenerates the Pets/Rbow packs and the Enderman override; CI fails on drift
npm run test:engine   # boots every pack in Bedrock Dedicated Server: pack stack, load lines, Content Log, commands (~25 s)
npm run test:gametest # GameTests with simulated players on a Beta-APIs world (~60 s)
npm run format        # biome --write
```

The full verification ladder before calling work done: `npm run check && npm test && npm run build
&& npm run test:engine`, plus `npm run codegen` (then `git status` must be clean) when anything under
`tools/codegen/` or `src/features/pets/` changed, and `npm run test:gametest` when scripts changed.
The engine tests download Bedrock Dedicated Server once into `.bds/` (git-ignored) from
`www.minecraft.net`; the cloud session hook and CI both allow that host.

## Two engine rules the mock cannot teach you

1. **One command namespace per script module.** Every custom command and enum a pack registers
   must share the namespace of the first one registered; the engine refuses a second with "Custom
   Command Enum namespaces must match". Pets is `pet:`, Stair Sitting `sit:`, Ender Mod
   `elleedog:`. Never register a name under another prefix inside a feature, and never share a
   bundle between features.
2. **Argument counts are checked at the native boundary.** `signal.subscribe(callback, undefined)`
   is a `TypeError` on the 117 signals that take one argument. Subscribe only through
   `FeatureContext.on`, which forwards options only when given. The same applies to any engine
   method: do not pass explicit `undefined` for optional parameters.

Both rules are enforced by `test/mocks/minecraft-server.ts` and proven by `npm run test:engine`.

## Layout and sources of truth

- `packs.json` defines every pack: uuids, module uuids, `scriptModules`, `feature`, `dependsOn`,
  `overrides`. Manifests are generated from it (`npm run manifests`); never edit a `manifest.json`
  by hand and never change a uuid.
- `src/packs/<feature>.ts` is a behavior pack's entry; `src/features/<id>/index.ts` exports its
  `FeatureDefinition` (`id`, `title`, `register?`, `start`). `src/core/` (runFeature,
  FeatureContext, log, polyfills) is bundled into every pack; keep it tiny and generic.
- Generated, never hand-edited (see `docs/CODEGEN.md` and `.gitattributes`):
  `behavior_packs/elleedog67_pets/**`, `resource_packs/elleedog67_pets/**`,
  `behavior_packs/elleedog67_rbow_ore/**`, `resource_packs/elleedog67_rbow_ore/**`,
  `behavior_packs/elleedog67_ender_mod/entities/overrides/**`, `src/features/pets/*.generated.ts`,
  `tools/codegen/synced-files.json`. Change their inputs under `tools/codegen/` and rerun
  `npm run codegen`.
- `src/features/pets/*.ts` (except `index.ts`) are also transpiled file-by-file for the Python
  Pets compiler, which packages and greps them. Keep them free of imports outside
  `@minecraft/server`, `@minecraft/server-ui` and sibling files. Every other feature writes
  vanilla entity, block and item ids as `entityId("minecraft:creeper")`, `blockId(...)` and
  `itemId(...)` from `src/core/vanilla.ts`: the literal at runtime, checked against
  `@minecraft/vanilla-data`'s types at compile time. Never import the package's runtime enums into a
  pack; they are 250 KB of un-tree-shakeable objects per bundle. Component, tag and state ids stay
  plain literals.
- Vanilla replacements (`minecraft:player`, `minecraft:enderman`, player render controllers) live
  under an `overrides/` folder in packs flagged `overrides: true`; the build rejects them anywhere
  else. Pets and Rbow Ore ship a byte-identical player override.
- Tests: `test/features/<id>/`, against the mock (`@minecraft/server` resolves to
  `test/mocks/`). Boot a feature with `runFeature(x); startup(); loadWorld()`. Do not edit the mock
  from a feature change; extend it from helpers and say so.

## Conventions

- Engine callbacks and before-events are read-only: capture, then mutate inside `system.run`.
- Chat and log text are plain sentences with no em-dashes; log lines carry the feature name.
- Do not write `@minecraft/server` calls you have not seen in `node_modules/@minecraft/server/index.d.ts`.
- Stable modules only in shipped packs (`@minecraft/server` 2.9.0, `@minecraft/server-ui` 2.0.0);
  the beta `@minecraft/server-gametest` is used only by `tools/bds/gametest/`, which is never shipped.
- GameTests live in `tools/bds/gametest/src/<feature>.test.ts` and run bundled with that feature's
  scripts: a simulated player is invisible to every other script module, so a test can only drive
  the feature it is bundled with.
- Commit messages explain why; `CHANGELOG.md` gets a line under the next version; a release is
  `npm run bump -- x.y.z` (bumps every manifest and tags), never a hand-edited version.
- Docs live next to the code they describe: `docs/features/<id>.md` per feature, `docs/TESTING.md`
  for the manual checklist, `docs/RELEASING.md` for install and migration.

## Where to look

| Question | Read |
|---|---|
| How the packs, scripts and build fit together | `docs/ARCHITECTURE.md` |
| Adding a feature or a pack | `docs/ADDING_A_FEATURE.md` |
| What a feature does and its commands | `docs/FEATURES.md`, `docs/features/<id>.md` |
| Generated files and the Pets compiler | `docs/CODEGEN.md` |
| Tests, the engine harness, the manual checklist | `docs/TESTING.md` |
| Releasing and migrating worlds | `docs/RELEASING.md` |
| The cloud session environment | `docs/CLOUD_ENVIRONMENT.md` |
| Tooling choices and the headless-server findings | `docs/ECOSYSTEM.md` |
