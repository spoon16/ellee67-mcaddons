# Adding a feature

Use this checklist for a brand-new feature or when porting one. The six existing features are
worked examples: `src/features/creeper-mod/` is the smallest (scripts only, no data),
`src/features/redstone-guide/` the smallest with pack content.

## 1. One feature, one pack

Every feature is its own behavior pack with its own script bundle, plus a resource pack when it has
client files (textures, client entities, lang). Activating the pack is the switch; there is no
runtime toggle and no shared core. Two engine rules follow from that and shape the scripts:

- All the commands and enums one pack registers share **one namespace** (the engine refuses a
  second one), so pick the namespace once: `myfeature:`.
- A command's short name (the part after the colon) becomes an engine alias shared by every pack, so
  it must be unique across the add-on and must not be a vanilla command name such as `help`, `clear`,
  `give` or `list`: the engine warns on the player's screen at every world load. `npm test` checks
  the names (`test/core/command-names.test.ts`) and `npm run test:engine` fails on the notice.
- Subscribe to events only through `FeatureContext.on`; it passes the engine exactly the arguments
  it accepts.

## 2. Pick an id and write the definition

- Choose an id (lowercase, hyphens): `my-feature`. It names the feature folder, the pack entry and
  the log lines.
- Create `src/features/my-feature/index.ts` exporting a `FeatureDefinition` (see
  [ARCHITECTURE.md](ARCHITECTURE.md)):

  ```ts
  import type { FeatureDefinition } from "../../core/feature.ts";

  export const myFeature: FeatureDefinition = {
    id: "my-feature",
    title: "My Feature",
    register({ commands, items }) {
      // commands.registerEnum / registerCommand, items.registerCustomComponent; all under myfeature:
    },
    start(ctx) {
      ctx.on(world.afterEvents.playerBreakBlock, onBreak);
      ctx.every(20, sweep);
      // load-time work runs here directly; never subscribe to worldLoad
    },
  };
  ```

- Create the pack entry `src/packs/my-feature.ts`, a copy of any existing one with the import
  changed. esbuild bundles it into the pack's `scripts/main.js`.

## 3. Scripts

- Keep modules small and pure where possible; the engine-facing glue lives in `index.ts`.
- Command callbacks and before-events are read-only: capture what you need and mutate inside
  `system.run`.
- Chat and log text: plain sentences, no em-dashes, prefix log lines with the feature name.
- Do not hand-write `@minecraft/server` API calls you have not seen in the typings; run
  `npm run check`.
- Write vanilla ids as `entityId("minecraft:creeper")`, `blockId("minecraft:dirt")` and
  `itemId("minecraft:iron_pickaxe")` from `src/core/vanilla.ts`: a typo is a compile error
  (checked against `@minecraft/vanilla-data`) and the runtime cost is nothing. Component, tag and
  block-state ids stay plain literals.
- There is no `stop()`. Deactivating the pack reloads the world without it, so nothing has to be
  undone at runtime; but per-player settings should be player properties so they survive.

## 4. Packs

1. Add one entry per pack to `packs.json`. The behavior pack needs `uuid`, `modules.script`,
   `scriptModules` (the engine modules the scripts import: `@minecraft/server`, plus
   `@minecraft/server-ui` if it shows forms) and `modules.data` if it carries any JSON; a resource
   pack needs `uuid` and `modules.resources`. Make every uuid with `uuidgen` (lowercase it) and never
   reuse one, not even from a standalone pack the feature came from: Bedrock replaces an imported
   pack only when its version is higher, so a reused uuid can block the import. The behavior pack's
   `dependsOn` lists its resource pack (if any) and nothing else; the resource pack's `dependsOn` is
   empty. `title` and `description` are what the player reads in Edit World. Set `overrides: true`
   only if the pack replaces a vanilla definition.

   ```json
   {
     "id": "my-feature",
     "kind": "behavior",
     "dir": "behavior_packs/elleedog67_my_feature",
     "archiveDir": "ElleeDog67_MyFeature_Behavior",
     "title": "ElleeDog 67 My Feature",
     "description": "What it turns on.",
     "uuid": "<uuidgen>",
     "modules": { "data": "<uuidgen>", "script": "<uuidgen>" },
     "scriptModules": ["@minecraft/server"],
     "feature": "my-feature",
     "dependsOn": ["my-feature-resources"],
     "overrides": false
   }
   ```

2. Create the pack directories with a 256x256 `pack_icon.png` each (`tools/art/pack_icons.py`
   draws the simple ones), then run `npm run manifests` to write their `manifest.json`. Do not write
   a manifest by hand; the build rejects one that differs from what `packs.json` generates.
3. Put content at the pack root by content type (`items/`, `recipes/`, `textures/items/`). Each
   pack owns its own `texts/languages.json`, `texts/*.lang` and `textures/item_texture.json`; the
   game merges them across active packs. Vanilla replacements go under an `overrides/` folder and
   need `overrides: true`; think twice, a second override of the same vanilla file cannot coexist,
   and the `minecraft:player` file is already shared by Pets and Rbow Ore.
4. Namespace everything (`myfeature:thing`); the build rejects duplicate identifiers across all
   packs, and textures keep the exact path referenced from JSON (`textures/items/<name>.png`).

## 5. Tests

- Tests live in `test/features/<id>/*.test.ts` and run with `npm test`.
- `@minecraft/server` and `@minecraft/server-ui` resolve to `test/mocks/*`. The mock exports the
  scheduler (`step`, `ticks`, `flushCurrentTick`), `startup()`, `loadWorld()`, `runCommand()`,
  `addPlayer()`/`joinPlayer()`, `registry`, `dimensions` and `reset()`. Call `reset()` in
  `beforeEach`.
- To exercise the full lifecycle, `runFeature(myFeature)` from `src/core/feature.ts`, then
  `startup()` and `loadWorld()`.
- The mock enforces the two engine rules: a second command namespace throws, and a second argument
  to a one-argument signal throws. A feature that passes the mock still has to pass
  `npm run test:engine`, which boots the real server with every pack and probes one command per
  namespace; add your command to `PROBES` in `tools/bds/smoke.ts`. For behaviour a simulated player
  can drive, add a GameTest to `tools/bds/gametest/scripts/main.js` (`npm run test:gametest`).
- When a `src/` function expects an engine `Player`, pass `engine(mockPlayer)`.
- Assert on behaviour the game would show (messages, properties, entities, drops), not on how
  many lines of code ran.
- Do not edit `test/mocks/` from a feature branch; extend the mock's exported objects from your
  own test helpers, and raise a gap in the pull request if the mock genuinely lacks something.
- `test/pack/build.test.ts` builds the real packs; a new pack shows up in its manifest and
  `.mcaddon` assertions automatically because they read `packs.json`. Update `PACK_COUNT` and
  `SCRIPT_PACKS` there.

## 6. Docs and release notes

- Add a row to the tables in [FEATURES.md](FEATURES.md), to the packs table in
  [ARCHITECTURE.md](ARCHITECTURE.md), [DEVELOPING.md](DEVELOPING.md) and the README, and to the install table in
  [RELEASING.md](RELEASING.md).
- Write `docs/features/<id>.md` (packs, commands, identifiers, what deactivating means, known
  limits, manual checks) and add its activation step to [TESTING.md](TESTING.md).
- Add a line to `CHANGELOG.md`.

## 7. Verify

```bash
npm run check && npm test && npm run build && npm run package && npm run test:engine
```

Then import `dist/ElleeDog67_<version>.mcaddon` into a copy of a world, activate the new packs and
walk the checklist.
