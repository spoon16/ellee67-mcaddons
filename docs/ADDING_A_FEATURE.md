# Adding a feature

Use this checklist for a brand-new feature or when porting one. The six existing features are
worked examples: `src/features/creeper-mod/` is the smallest switch feature,
`src/features/redstone-guide/` the smallest pack feature.

## 1. Choose a kind

- **switch**: the feature is script only, or its data is harmless while the scripts are idle
  (Stair Sitting's invisible seat entities). It ships in the core packs, is on by default, and is
  turned on or off per world from the manual or `/elleedog67:enable|disable`. `stop()` must undo
  everything visible.
- **pack**: the feature carries data the game cannot unload once the pack is active: a
  `minecraft:` override, blocks, items, recipes, world generation. It gets its own behavior pack
  (and a resource pack if it has client files), is off until the player activates those packs in
  Edit World, and has no runtime switch. `stop()` is a no-op.

When in doubt: if turning the feature off with a script would leave a replaced vanilla definition
or an unknown item in the world, it is a pack feature.

## 2. Pick an id and register it

- Add the id to `FEATURE_IDS` in `src/core/features.ts` (lowercase, hyphens). This is also what
  players type after `/elleedog67:enable`.
- Create `src/features/<id>/index.ts` exporting a `FeatureDefinition` (see
  [ARCHITECTURE.md](ARCHITECTURE.md)) and add it to the list in `src/features/index.ts`.
- Fill in the `manual` fields; every feature must have them, the manual and
  `/elleedog67:features` are built from them:
  - `about`: a few plain sentences on what the feature does, shown on its manual page.
  - `commands`: the commands it adds, one string per line, for the Commands page. Omit it when
    there are none.
  - `whileOff`: what keeps working, or what is lost, while the feature is off. For a pack feature
    this is what happens when the packs are deactivated (what stays in the world, what turns into
    unknown items, what comes back when the packs are active again).
- A switch feature sets `kind: "switch"` and `defaultEnabled`. A pack feature sets `kind: "pack"`,
  `packs` (its pack ids from `packs.json`) and `installed()`; `defineFeatures` throws without them.

## 3. Scripts

- Keep modules small and pure where possible; the engine-facing glue lives in `index.ts`.
- Subscribe only through the context:

  ```ts
  start(ctx) {
    ctx.on(world.afterEvents.playerBreakBlock, onBreak);
    ctx.every(20, sweep);
    // load-time work runs here directly; never subscribe to worldLoad
  }
  stop(ctx) {
    // switch: undo visible state (remove helper entities, reset properties); ctx disposes subscriptions afterwards
    // pack: leave empty; the packs are the switch and stop() is never called at runtime
  }
  ```

- Register commands and item components in `register()`, using the registries it receives. They
  are gated automatically and reply with the disabled message or the pack hint; do not check
  `isActive` yourself in command handlers.
- Command callbacks and before-events are read-only: capture what you need and mutate inside
  `system.run`.
- Chat and log text: plain sentences, no em-dashes, prefix log lines with the feature name.
- Do not hand-write `@minecraft/server` API calls you have not seen in the typings; run
  `npm run check`.

## 4. Pack content

### Switch feature: the core packs

- Put JSON under the matching content type folder in a `<id>/` subfolder:
  `behavior_packs/elleedog67/items/<id>/`, `resource_packs/elleedog67/entity/<id>/`, and so on.
- Lang keys go in the core `texts/en_US.lang` and `texts/en_GB.lang` (keep both identical) under a
  `## <id>` section; item textures go in the core `textures/item_texture.json`.
- No `minecraft:` identifiers: the core packs have `overrides: false` in `packs.json` and the
  build rejects a vanilla replacement there.

### Pack feature: packs of its own

1. Add one entry per pack to `packs.json`. A behavior pack needs `uuid` and `modules.data`; a
   resource pack needs `uuid` and `modules.resources`. Make every uuid with `uuidgen` (lowercase
   it to match the file) and never reuse one, not even from the standalone pack the feature came
   from: Bedrock replaces an imported pack only when its version is higher, so a reused uuid can
   block the import. The behavior pack's `dependsOn` lists its resource pack (if any) and
   `"elleedog67"`; the resource pack's `dependsOn` is empty. `title` and `description` are what the
   player reads in Edit World; say what the pack turns on and that it needs ElleeDog 67 (Behavior).
   Set `overrides: true` only if the pack replaces a vanilla definition.

   ```json
   {
     "id": "my-feature",
     "kind": "behavior",
     "dir": "behavior_packs/elleedog67_my_feature",
     "archiveDir": "ElleeDog67_MyFeature_Behavior",
     "title": "ElleeDog 67 My Feature",
     "description": "Optional: what it turns on. Needs ElleeDog 67 (Behavior).",
     "uuid": "<uuidgen>",
     "modules": { "data": "<uuidgen>" },
     "feature": "my-feature",
     "dependsOn": ["my-feature-resources", "elleedog67"],
     "overrides": false
   }
   ```

2. Create the pack directories with a 256x256 `pack_icon.png` each, then run `npm run manifests`
   to write their `manifest.json`. Do not write a manifest by hand; the build rejects one that
   differs from what `packs.json` generates.
3. Put content at the pack root by content type (`items/`, `recipes/`, `textures/items/`). Each
   pack owns its own `texts/languages.json`, `texts/*.lang` and `textures/item_texture.json`; the
   game merges them across active packs. Vanilla replacements go under an `overrides/` folder and
   need `overrides: true`; think twice, a second override of the same vanilla file cannot coexist,
   and the `minecraft:player` file is already shared by Pets and Rbow Ore.
4. Give the scripts a probe. `installed()` must return true exactly when the packs are active:
   `ItemTypes.get("<ns>:<item>") !== undefined` for a pack that adds an item, or
   `EntityTypes.get("<ns>:<entity>") !== undefined` for one that adds an entity. A pack with
   neither gets a marker entity like `behavior_packs/elleedog67_ender_mod/entities/ender_mod_marker.json`
   (`is_spawnable: false`, `is_summonable: false`, no components, no client entity).
5. Set `packs: ["my-feature", "my-feature-resources"]` on the definition.

In both cases: textures keep the exact path referenced from JSON (`textures/items/<name>.png`),
namespace everything (`myfeature:thing`), and the build rejects duplicate identifiers across all
nine packs.

## 5. Tests

- Tests live in `test/features/<id>/*.test.ts` and run with `npm test`.
- `@minecraft/server` and `@minecraft/server-ui` resolve to `test/mocks/*`. The mock exports the
  scheduler (`step`, `ticks`, `flushCurrentTick`), `startup()`, `loadWorld()`, `runCommand()`,
  `addPlayer()`/`joinPlayer()`, `registry`, `dimensions`, `registerEntityType(id)`,
  `registerItemType(id)` and `reset()`. Call `reset()` in `beforeEach`.
- To exercise the full lifecycle, `bootstrap([feature])` from `src/core/bootstrap.ts`, then
  `startup()` and `loadWorld()`.
- A pack feature's suite registers its probe type before `loadWorld()` to simulate active packs,
  and needs one case with the type absent: the feature never starts, `stop()` is not called, and
  its commands reply with the pack hint.
- A switch feature needs a test that `stop()` leaves no subscriptions or intervals behind:
  `world.afterEvents.x.size` and `system.intervalCount` return to their pre-`start()` values.
- When a `src/` function expects an engine `Player`, pass `engine(mockPlayer)`.
- Assert on behaviour the game would show (messages, properties, entities, drops), not on how
  many lines of code ran.
- Do not edit `test/mocks/` from a feature branch; extend the mock's exported objects from your
  own test helpers, and raise a gap in the pull request if the mock genuinely lacks something.
- `test/pack/build.test.ts` builds the real packs; a new pack shows up in its manifest and
  `.mcaddon` assertions automatically because they read `packs.json`.

## 6. Docs and release notes

- Add a row to the tables in [FEATURES.md](FEATURES.md) and to "What off means" in
  [ARCHITECTURE.md](ARCHITECTURE.md), and add the pack to the table in
  [RELEASING.md](RELEASING.md) and the packs table in the README.
- Write `docs/features/<id>.md` (kind and packs, commands, identifiers, what off means, known
  limits, manual checks) and add its activation step to [TESTING.md](TESTING.md).
- Add a line to `CHANGELOG.md`.

## 7. Verify

```bash
npm run check && npm test && npm run build && npm run package
```

Then import `dist/ElleeDog67_<version>.mcaddon` into a copy of a world, activate the new packs and
walk the checklist.
