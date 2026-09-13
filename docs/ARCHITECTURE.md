# Architecture

Nine packs, one script bundle, six features. The core packs carry the scripts and the two switch
features; each pack feature has packs of its own that the player activates in Edit World.

## Packs

| Pack (title) | Directory | Holds |
|---|---|---|
| ElleeDog 67 (Behavior) | `behavior_packs/elleedog67` | the script bundle, `elleedog67:feature_book`, the Stair Sitting entities `sit:seat` and `sit:target` |
| ElleeDog 67 (Resources) | `resource_packs/elleedog67` | the book texture and atlas entry, the Stair Sitting client entity, model and renderer, the core lang files |
| ElleeDog 67 Pets | `behavior_packs/elleedog67_pets` | the `minecraft:player` override, pet items, recipes and functions (generated) |
| ElleeDog 67 Pets Resources | `resource_packs/elleedog67_pets` | the player renderer overrides, pet models, animations, textures, its own lang files and item atlas (generated) |
| ElleeDog 67 Rbow Ore | `behavior_packs/elleedog67_rbow_ore` | the same `minecraft:player` override, blocks, items, recipes, features, feature rules, structures, loot tables, functions (generated) |
| ElleeDog 67 Rbow Ore Resources | `resource_packs/elleedog67_rbow_ore` | `blocks.json`, terrain and item atlases, textures, attachables (including the standalone Rbow 1.2.0 player armor and spear), its lang files (generated) |
| ElleeDog 67 Ender Mod | `behavior_packs/elleedog67_ender_mod` | the `minecraft:enderman` override (generated) and the never-spawned marker entity `elleedog:ender_mod_marker` |
| ElleeDog 67 Redstone Guide | `behavior_packs/elleedog67_redstone_guide` | the guide book item and recipe |
| ElleeDog 67 Redstone Guide Resources | `resource_packs/elleedog67_redstone_guide` | the book texture, its item atlas and lang files |

Dependencies, as the manifests declare them:

- ElleeDog 67 (Behavior) depends on ElleeDog 67 (Resources).
- ElleeDog 67 Pets depends on ElleeDog 67 Pets Resources and ElleeDog 67 (Behavior).
- ElleeDog 67 Rbow Ore depends on ElleeDog 67 Rbow Ore Resources and ElleeDog 67 (Behavior).
- ElleeDog 67 Ender Mod depends on ElleeDog 67 (Behavior). It has no resource pack.
- ElleeDog 67 Redstone Guide depends on ElleeDog 67 Redstone Guide Resources and ElleeDog 67 (Behavior).

Pets and Rbow Ore do not depend on each other: both behavior packs ship a byte-identical
`entities/overrides/player.json` (the build asserts this), so any subset of the two works in any
stack order. The only cross-pack references are the Pets renderer's texture slots for Rbow items,
which are never sampled unless Rbow items exist.

`packs.json` at the repo root is the source of truth: one entry per pack with `id`, `kind`, `dir`,
`archiveDir` (the folder name inside `dist/` and the `.mcaddon`), `title`, `description`, `uuid`,
module uuids, `feature`, `dependsOn` and `overrides` (whether the pack may replace vanilla
definitions). `tools/manifests.ts` writes every `manifest.json` from it with the version from
`package.json`, the dependency versions, `@minecraft/server` 2.9.0 and `@minecraft/server-ui` 2.0.0
on the core, and `product_type: addon`. The script bundle imports `packs.json` too, so the manual
and the command replies name packs from the same file. Never change a uuid: Bedrock identifies an
imported pack by it, and replaces the pack only when the imported version is higher.

## Where things live

```
packs.json                                 the nine packs; manifests are generated from it
behavior_packs/elleedog67/                 core behavior pack
behavior_packs/elleedog67_pets/            Pets behavior pack (generated)
behavior_packs/elleedog67_rbow_ore/        Rbow Ore behavior pack (generated)
behavior_packs/elleedog67_ender_mod/       Ender Mod behavior pack (generated override plus a hand-written marker)
behavior_packs/elleedog67_redstone_guide/  Redstone Guide behavior pack
resource_packs/elleedog67/                 core resource pack
resource_packs/elleedog67_pets/            Pets resource pack (generated)
resource_packs/elleedog67_rbow_ore/        Rbow Ore resource pack (generated)
resource_packs/elleedog67_redstone_guide/  Redstone Guide resource pack
src/                                       scripts; bundled by esbuild into dist/ElleeDog67_Behavior/scripts/main.js
test/                                      vitest suites and the engine mock
tools/                                     build, validate, package, manifests, version, codegen
docs/                                      this folder
dist/                                      build output (ignored by git)
```

Inside the core packs, content is organised by Bedrock content type first (`entities/`, `items/`,
`entity/`, which the engine loads recursively) and by feature second:

```
behavior_packs/elleedog67/entities/stair-sit/seat.json
behavior_packs/elleedog67/items/core/feature_book.json
resource_packs/elleedog67/render_controllers/stair-sit/seat.render_controllers.json
```

Inside a companion pack, content keeps the compiler's layout (content type folders at the pack
root). In every pack, files that replace a vanilla definition (`minecraft:player`,
`minecraft:enderman`, the player render controllers, the vanilla armor attachables) live under an
`overrides/` folder so the risky files are visible at a glance. `npm run build` fails if a
`minecraft:` identifier appears anywhere else, or in a pack whose `packs.json` entry has
`overrides: false`.

Folders whose path is part of an identifier keep their original layout:
`functions/<ns>/x.mcfunction` is `/function <ns>/x`, `structures/<ns>/x.mcstructure` is `<ns>:x`,
and texture paths are referenced verbatim from JSON.

The Pets and Rbow Ore packs and the Enderman override are generated by `npm run codegen` and must
not be edited by hand; see [CODEGEN.md](CODEGEN.md). `.gitattributes` lists them.

## Scripts

`src/main.ts` calls `bootstrap(features)` with the list in `src/features/index.ts`. Each feature is
a folder under `src/features/<id>/` whose `index.ts` exports a `FeatureDefinition`:

```ts
interface FeatureDefinition {
  id: FeatureId;                 // "pets" | "stair-sit" | "creeper-mod" | "ender-mod" | "redstone-guide" | "rbow-ore"
  title: string;                 // "Stair Sitting"
  summary: string;               // one line for /elleedog67:features and the manual
  kind: "switch" | "pack";
  packs?: readonly string[];     // pack ids from packs.json; required for kind "pack"
  installed?(): boolean;         // kind "pack": EntityTypes.get / ItemTypes.get probe, run once after world load
  defaultEnabled?: boolean;      // kind "switch": state for a world that has never toggled it
  manual: { about: string; commands?: string[]; whileOff: string };
  register?(registries): void;   // startup: commands and item components, always runs
  alwaysOn?(ctx): void;          // after world load, regardless of state, never disposed (rare)
  start(ctx): void;              // subscribe events and intervals through ctx
  stop(ctx): void;               // switch: restore vanilla-ish behaviour; pack: a no-op
}
```

The core (`src/core/`) provides:

- `features.ts`: the registry. `isEnabled` reads a switch feature's world flag
  (`elleedog67:feature:<id>`, falling back to `defaultEnabled`); `isInstalled` runs a pack
  feature's probe once and memoizes it until the next world load; `isActive` is both. `setEnabled`
  toggles a switch feature and returns an error carrying the pack hint for a pack feature.
  `featureState` yields the state word, `packHint` the activation sentence.
- `packs.ts`: the pack list from `packs.json`, `packTitle`, `packsForFeature` and
  `activationHint`, which builds the "X is turned on by activating ... in Edit World" sentence
  every command and manual page uses.
- `subscriptions.ts`: `FeatureContext`, whose `on(signal, handler)`, `every(ticks, fn)`,
  `after(ticks, fn)` and `onDispose(fn)` are all undone by `dispose()`.
- `commands.ts`: `/elleedog67:enable`, `/elleedog67:disable`, `/elleedog67:features`,
  `/elleedog67:book`, plus the gated registries handed to `register()`. A gated command returns
  `CustomCommandStatus.Failure` with the disabled message while `isActive` is false; a gated item
  component's callbacks do nothing. The message is "X is disabled. An operator can run
  /elleedog67:enable x." for a switch feature and "X is not active." plus the pack hint for a pack
  feature.
- `book.ts`: the ElleeDog 67 Manual item, who receives it, and the entitlement check for the switch
  buttons.
- `manual.ts`: the manual pages, built from the feature definitions and `packs.json`.

Bedrock cannot unregister commands or item components after startup, which is why `register()`
always runs and the gate lives in the callbacks.

## Feature kinds and the probe

A **switch** feature (`creeper-mod`, `stair-sit`) is script only and ships in the core packs. Its
state is the world flag; the manual buttons and `/elleedog67:enable|disable` flip it and call
`start()` or `stop()` on the next tick.

A **pack** feature (`pets`, `rbow-ore`, `ender-mod`, `redstone-guide`) carries data the game cannot
unload, so the packs are the switch. `installed()` asks the engine for a definition only the
feature's packs provide, which is `undefined` when no active pack defines it:

| Feature | Probe |
|---|---|
| pets | `EntityTypes.get("pet:diag_model")` |
| rbow-ore | `EntityTypes.get("elleedog:rbow_drop")` |
| ender-mod | `EntityTypes.get("elleedog:ender_mod_marker")` (a marker entity in the Ender Mod pack with `is_spawnable: false`, `is_summonable: false`, no components and no client entity) |
| redstone-guide | `ItemTypes.get("elleedog_redstone:guide_book")` |

The probe runs once after `worldLoad` and the answer is memoized, because the gated registries ask
on every command and item callback. A probe that throws counts as absent and is logged.

## The manual

`manual.ts` builds `ActionFormData` pages (header, label, divider, body and button elements) from
the feature definitions and `packs.json`. Anyone holding a book may read every page; only entitled
players (handles in `BOOK_HOLDER_HANDLES`, or operators) see and use the switch buttons.

1. **Home**: header "ElleeDog 67", one button per feature showing its state (`[ON] Stair Sitting`,
   `[OFF] Creeper Mod`, `[ACTIVE] Pets`, `[PACKS OFF] Rbow Ore`), then "Setup and packs" and
   "Commands".
2. **Feature page**: the feature's `manual.about`, its current state, and how to turn it on or
   off. For a switch feature: use the button below, plus the command. For a pack feature: the exact
   pack titles to activate or deactivate in Edit World under Behavior Packs or Resource Packs, and
   `manual.whileOff`, which says what stays in the world after deactivating. Buttons: Turn on or
   Turn off (switch features, entitled players only) and Back.
3. **Setup and packs**: which packs exist and what each turns on, that activating a companion
   pulls in the core automatically, that Pets and Rbow Ore can be used in any combination, the two
   ordering rules (Pets Resources above Rbow Ore Resources; other player or Enderman packs below
   the ElleeDog packs or removed), and the update rule (import a newer version, then confirm the
   newer pack is the active one).
4. **Commands**: `/elleedog67:*` and each feature's `manual.commands`.

All text is plain strings in `manual.ts`. Buttons are added through a parallel handler array so
`response.selection` maps to the right action regardless of how headers and labels are counted.

## Lifecycle

1. `system.beforeEvents.startup` (early execution, no world access): core commands and the book
   component are registered, then every feature's `register()`. A throwing `register()` is logged
   and skipped; the others still run.
2. `world.afterEvents.worldLoad`: `startEnabledFeatures()` walks the registry. For every feature
   it runs `alwaysOn` if present. A pack feature has its probe re-evaluated; if its packs are
   present it is started, otherwise it is skipped entirely (`stop()` is never called on a pack
   feature) and the log says "packs not active". Any `elleedog67:feature:<id>` world property left
   behind for a pack feature is deleted. A switch feature is started when its flag is on, otherwise
   settled: `stop()` runs once without a preceding `start()`, so anything it does to keep the world
   vanilla-like is in place from the first tick. Then books are handed out.
3. A manual button or `/elleedog67:enable x` or `/elleedog67:disable x` on a switch feature: on the
   next tick the flag is written and `start` or `stop` runs. Command callbacks are read-only in
   Bedrock, so this happens inside `system.run`. On a pack feature the same actions reply with the
   pack hint and touch nothing.

`start()` must never subscribe to `worldLoad` (it already happened); do the load-time work
directly. A switch feature's `stop()` must tolerate never having been started.

## What off means

| Feature | Kind | Off means | Stays in the world while off |
|---|---|---|---|
| creeper-mod | switch | vanilla creeper explosions | nothing |
| stair-sit | switch | seats and Sit prompts removed, `sit:*` commands refuse | nothing; per-player settings are player properties and apply again when it is on |
| pets | pack | packs deactivated: players render as themselves, `pet:*` commands and the morpher refuse with the pack hint | saved pet choices (player properties); pet items in inventories show as unknown items until the packs are active again |
| rbow-ore | pack | packs deactivated: no new ore generates, Rbow tools and armor lose their behaviours | placed ore, items in chests, recipes and legacy drop entities all need the packs active, so activate Rbow Ore before opening a world that ever used it |
| ender-mod | pack | pack deactivated: Endermen behave like vanilla, `/elleedog:ender_protect` refuses with the pack hint | saved regions and placement records (world properties), applied again when the pack is active |
| redstone-guide | pack | packs deactivated: the guide cannot be crafted and existing guides show as unknown items | bookmarks (player properties), used again when the packs are active |

## Build

`npm run build` copies every pack in `packs.json` to `dist/<archiveDir>/`, copies `LICENSE` and
`THIRD_PARTY_NOTICES.md` into each, bundles `src/main.ts` with esbuild (`es2020`, ESM,
`@minecraft/server` and `@minecraft/server-ui` external) into the core behavior pack only, and runs
`tools/validate.ts`. Validation checks that each manifest equals what `packs.json` and
`package.json` generate, that only the core carries scripts, that every companion behavior pack
depends on the core, that identifiers are unique across the union of all packs except the
documented duplicates (the player override in Pets and Rbow Ore, asserted byte-identical; the five
Rbow armor and spear attachables that Pets Resources overrides), that vanilla identifiers sit only
under `overrides/` in packs flagged `overrides`, that texture references resolve against the union
of all resource packs, that lang keys are unique per file, that the bundle imports only the engine
modules, and that every pack icon is 256x256.

`npm run package` zips `dist/` into `dist/ElleeDog67_<version>.mcaddon` holding all nine pack
folders, plus `SHA256SUMS.txt`, with fixed timestamps so the same commit always produces the same
bytes. There are no per-pack `.mcpack` files. Neither script runs a generator.

## Shared files

Bedrock merges `texts/*.lang`, `textures/item_texture.json`, `textures/terrain_texture.json` and
`blocks.json` across the active resource packs, so each pack owns its own copies of the files it
needs. The core resource pack keeps only the book and Stair Sitting lang keys and the book atlas
entry; the Pets, Rbow Ore and Redstone Guide resource packs carry their own. Lang keys must be
unique within a file and identifiers unique across all packs; the build checks both.
