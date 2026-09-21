# Architecture

Ten packs, six features, six script bundles. Each feature is one behavior pack, with a resource pack
beside it when it has client files, and the behavior pack carries that feature's scripts and
nothing else. Activating the pack in Edit World is the switch.

## Packs

| Pack (title) | Directory | Holds |
|---|---|---|
| ElleeDog 67 Pets | `behavior_packs/elleedog67_pets` | the Pets scripts, the `minecraft:player` override, the Pet Morpher book item and functions (generated) |
| ElleeDog 67 Pets Resources | `resource_packs/elleedog67_pets` | the player renderer overrides, pet models, animations, textures, lang files and item atlas (generated) |
| ElleeDog 67 Rbow Ore | `behavior_packs/elleedog67_rbow_ore` | the Rbow scripts, the same `minecraft:player` override, blocks, items, recipes, features, feature rules, structures, loot tables, functions (generated) |
| ElleeDog 67 Rbow Ore Resources | `resource_packs/elleedog67_rbow_ore` | `blocks.json`, terrain and item atlases, textures, attachables (including the standalone Rbow 1.2.0 player armor and spear), lang files (generated) |
| ElleeDog 67 Ender Mod | `behavior_packs/elleedog67_ender_mod` | the Ender Mod scripts and the `minecraft:enderman` override (generated) |
| ElleeDog 67 Redstone Guide | `behavior_packs/elleedog67_redstone_guide` | the guide scripts, the guide book item and recipe |
| ElleeDog 67 Redstone Guide Resources | `resource_packs/elleedog67_redstone_guide` | the book texture, its item atlas and lang files |
| ElleeDog 67 Stair Sitting | `behavior_packs/elleedog67_stair_sit` | the sitting scripts and the `sit:seat` and `sit:target` entities |
| ElleeDog 67 Stair Sitting Resources | `resource_packs/elleedog67_stair_sit` | the seat client entities, model, renderer, texture and lang files |
| ElleeDog 67 Creeper Mod | `behavior_packs/elleedog67_creeper_mod` | the creeper scripts; nothing else |

Dependencies, as the manifests declare them: each behavior pack depends on its own resource pack
when it has one, and on nothing else. Pets and Rbow Ore do not depend on each other: both behavior
packs ship a byte-identical `entities/overrides/player.json` (the build asserts this), so any subset
of the two works in any stack order. The only cross-pack references are the Pets renderer's texture
slots for Rbow items, which are never sampled unless Rbow items exist.

`packs.json` at the repo root is the source of truth: one entry per pack with `id`, `kind`, `dir`,
`archiveDir` (the folder name inside `dist/` and the `.mcaddon`), `title`, `description`, `uuid`,
module uuids (`data`, `resources`, `script`), `scriptModules` (the engine modules the bundle
imports), `feature`, `dependsOn` and `overrides` (whether the pack may replace vanilla definitions).
`tools/manifests.ts` writes every `manifest.json` from it with the version from `package.json`, the
dependency versions, and `@minecraft/server` 2.9.0 plus `@minecraft/server-ui` 2.0.0 where a pack
lists them, with `product_type: addon`. Never change a uuid: Bedrock identifies an imported pack by
it, and replaces the pack only when the imported version is higher.

## Where things live

```
packs.json                                 the ten packs; manifests are generated from it
behavior_packs/elleedog67_pets/            Pets behavior pack (generated)
behavior_packs/elleedog67_rbow_ore/        Rbow Ore behavior pack (generated)
behavior_packs/elleedog67_ender_mod/       Ender Mod behavior pack (generated override)
behavior_packs/elleedog67_redstone_guide/  Redstone Guide behavior pack
behavior_packs/elleedog67_stair_sit/       Stair Sitting behavior pack
behavior_packs/elleedog67_creeper_mod/     Creeper Mod behavior pack (scripts only)
resource_packs/elleedog67_pets/            Pets resource pack (generated)
resource_packs/elleedog67_rbow_ore/        Rbow Ore resource pack (generated)
resource_packs/elleedog67_redstone_guide/  Redstone Guide resource pack
resource_packs/elleedog67_stair_sit/       Stair Sitting resource pack
src/packs/<feature>.ts                     one entry per behavior pack; esbuild bundles it into dist/<pack>/scripts/main.js
src/core/                                  runFeature, FeatureContext, log, the ES2020 polyfill
src/features/<id>/                         each feature's scripts; index.ts exports its FeatureDefinition
test/                                      vitest suites and the engine mock
tools/                                     build, validate, package, manifests, version, codegen, bds (headless server)
docs/                                      this folder
dist/                                      build output (ignored by git)
.bds/                                      Bedrock Dedicated Server for npm run test:engine (ignored by git)
```

Inside a pack, content is organised by Bedrock content type at the pack root (`entities/`,
`items/`, `entity/`, which the engine loads recursively). Files that replace a vanilla definition
(`minecraft:player`, `minecraft:enderman`, the player render controllers, the vanilla armor
attachables) live under an `overrides/` folder so the risky files are visible at a glance.
`npm run build` fails if a `minecraft:` identifier appears anywhere else, or in a pack whose
`packs.json` entry has `overrides: false`.

Folders whose path is part of an identifier keep their original layout:
`functions/<ns>/x.mcfunction` is `/function <ns>/x`, `structures/<ns>/x.mcstructure` is `<ns>:x`,
and texture paths are referenced verbatim from JSON.

The Pets and Rbow Ore packs and the Enderman override are generated by `npm run codegen` and must
not be edited by hand; see [CODEGEN.md](CODEGEN.md). `.gitattributes` lists them.

## Scripts

Each behavior pack's `scripts/main.js` is esbuild's bundle of `src/packs/<feature>.ts`, which does
three things: imports the ES2020 polyfill, imports the feature's definition from
`src/features/<feature>/index.ts`, and calls `runFeature` with it. Each bundle carries its own copy
of `src/core/`; nothing is shared between packs at runtime.

```ts
interface FeatureDefinition {
  id: string;                        // "pets" | "stair-sit" | "creeper-mod" | "ender-mod" | "redstone-guide" | "rbow-ore"
  title: string;                     // "Stair Sitting"
  register?(registries): void;       // startup: commands and item components
  start(ctx): void;                  // after world load: subscribe events and intervals through ctx
}
```

`src/core/` provides:

- `feature.ts`: `runFeature(definition)`. During `system.beforeEvents.startup` (early execution,
  no world access) it calls `register()` with the engine's command and item component registries;
  after `world.afterEvents.worldLoad` it calls `start(ctx)` with a fresh `FeatureContext` and logs
  `<id> loaded`. A throwing `register()` or `start()` is logged and leaves the rest of the pack
  running. A second `worldLoad` in the same module's life disposes the previous context before
  `start` runs again, so nothing is subscribed twice; features clear their own module state at the
  top of `start`.
- `subscriptions.ts`: `FeatureContext`, whose `on(signal, handler, options?)`, `every(ticks, fn)`,
  `after(ticks, fn)` and `onDispose(fn)` are all undone by `dispose()`. `on` forwards `options` only
  when the caller gave some: the engine counts arguments at the native boundary, and most signals
  take exactly one.
- `log.ts`: `featureLog(title)` gives a feature `info`, `warn`, `warnOnce(key)` and
  `throttled(key, tick, ticks)`, every line prefixed `[ElleeDog 67] <title>:`; the runner's own
  `log` writes the `<id> loaded` lines.
- `dimensions.ts`: `loadedDimensions(world)`, the three vanilla dimensions plus every online
  player's, for the sweeps that look for helper entities.
- `vanilla.ts`: `entityId`, `blockId` and `itemId`, compile-time-checked vanilla identifiers.

Two engine rules shape every feature and are enforced by the engine mock and by
`npm run test:engine`:

1. **One namespace per script module.** Every custom command and enum a pack registers must share
   the namespace of the first one registered; the engine refuses a second namespace with "Custom
   Command Enum namespaces must match". Pets uses `pet:`, Stair Sitting `sit:`, Ender Mod
   `elleedog:`. This is why the scripts are split per pack rather than shared.
2. **Arity at the native boundary.** `signal.subscribe(callback, undefined)` is a `TypeError` on
   the signals that take one argument, which is most of them. Always subscribe through
   `FeatureContext.on`.

Bedrock cannot unregister commands or item components after startup and cannot unload pack data,
so there is no `stop()`: deactivating the pack in Edit World reloads the world without it.

## Lifecycle

1. `system.beforeEvents.startup` (early execution, no world access): each pack's `register()` runs
   with the engine registries.
2. `world.afterEvents.worldLoad`: each pack's `start(ctx)` runs, does its load-time work directly,
   and subscribes through `ctx`. `start()` must never subscribe to `worldLoad` (it already
   happened).
3. Packs are changed in Edit World, which always reloads the world, so a feature is either fully
   present or entirely absent; nothing toggles at runtime.

## What deactivating a pack means

| Feature | Deactivating leaves in the world |
|---|---|
| creeper-mod | nothing; creeper explosions behave like vanilla |
| stair-sit | nothing; per-player settings are player properties and apply again when the pack is back |
| pets | saved pet choices (player properties); pet items in inventories show as unknown items until the packs are active again |
| rbow-ore | placed ore, items in chests, recipes and legacy drop entities all need the packs active, so activate Rbow Ore before opening a world that ever used it |
| ender-mod | saved regions and placement records (world properties), applied again when the pack is active |
| redstone-guide | bookmarks (player properties), used again when the packs are active |

## Build

`npm run build` copies every pack in `packs.json` to `dist/<archiveDir>/`, copies `LICENSE` and
`THIRD_PARTY_NOTICES.md` into each, bundles every `src/packs/<feature>.ts` with esbuild (`es2020`,
ESM, `@minecraft/server` and `@minecraft/server-ui` external) into its pack's `scripts/main.js`,
and runs `tools/validate.ts`. Validation checks that each manifest equals what `packs.json` and
`package.json` generate, that a bundle exists exactly where a script module is declared and imports
exactly the modules the manifest lists, that a behavior pack depends only on its own feature's
resource pack, that identifiers are unique across the union of all packs except the documented
duplicates (the player override in Pets and Rbow Ore, asserted byte-identical; the five Rbow armor
and spear attachables that Pets Resources overrides), that vanilla identifiers sit only under
`overrides/` in packs flagged `overrides`, that a file replacing a vanilla render controller file still
defines every controller that file defined (the pinned list is
`tools/codegen/pets/upstream/render_controllers.PROVENANCE.json`), that texture references resolve
against the union of all resource packs, that lang keys are unique per file, and that every pack icon
is 256x256.

`npm run package` zips `dist/` into `dist/ElleeDog67_<version>.mcaddon` holding all ten pack
folders, plus `SHA256SUMS.txt`, with fixed timestamps so the same commit always produces the same
bytes. There are no per-pack `.mcpack` files. Neither script runs a generator.

`npm run test:engine` builds, then boots the packs in Bedrock Dedicated Server; see
[TESTING.md](TESTING.md).

## Shared files

Bedrock merges `texts/*.lang`, `textures/item_texture.json`, `textures/terrain_texture.json` and
`blocks.json` across the active resource packs, so each pack owns its own copies of the files it
needs. Lang keys must be unique within a file and identifiers unique across all packs; the build
checks both.
