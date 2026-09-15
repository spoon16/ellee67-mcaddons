# Generated files

Part of the pack tree is produced by generators rather than written by hand. The generated files
are committed, so `npm run build` never needs Python and a fresh clone builds in seconds. CI runs
`npm run codegen` and fails if the result differs from what is committed, so a stale or hand-edited
generated file is caught on the next pull request.

```bash
npm run codegen        # regenerate everything and sync into the pack tree
npm run codegen:test   # only run the Pets compiler's own Python tests
npm run manifests      # only rewrite every manifest.json from packs.json (Node only)
```

Requirements for `npm run codegen`: [uv](https://docs.astral.sh/uv/) (it installs the pinned
Python 3.12, Pillow and numpy from `tools/codegen/pets/uv.lock` on first use).

## What is generated, and from what

| Generated | Generator | Inputs you edit |
|---|---|---|
| `behavior_packs/*/manifest.json`, `resource_packs/*/manifest.json` (all nine) | `tools/manifests.ts` | `packs.json` and the `version` in `package.json` |
| `behavior_packs/elleedog67_ender_mod/entities/overrides/enderman.json` | `tools/codegen/enderman/inject.ts` | `tools/codegen/enderman/upstream/enderman.json` (pinned vanilla file) |
| `behavior_packs/elleedog67_pets/` and `resource_packs/elleedog67_pets/` (everything except the manifest and icon), plus `src/features/pets/*.generated.js` | `tools/codegen/pets/tools/build.py` (the Pets compiler) and the sync | `tools/codegen/pets/catalog/`, `assets/`, `project.json`, `baseline/`, `upstream/`, and the hand-written scripts in `src/features/pets/` |
| `behavior_packs/elleedog67_rbow_ore/` and `resource_packs/elleedog67_rbow_ore/` (everything except the manifest and icon) | the Pets compiler, which copies and adapts the hash-locked Rbow 1.2.0 packs under `tools/codegen/pets/integration/rbow_1.2.0/`; the sync adds the standalone player armor and spear attachables from that tree directly | `tools/codegen/pets/integration/rbow_1.2.0/tools/build_data.py` and its tables (see "Regenerating Rbow") |

Hand-written and never touched by the sync: the Stair Sitting, Creeper Mod and Redstone Guide packs, the Ender Mod marker entity
`behavior_packs/elleedog67_ender_mod/entities/ender_mod_marker.json`, the two Redstone Guide packs,
and every `pack_icon.png`.

The complete list of files the sync owns is `tools/codegen/synced-files.json`; `.gitattributes`
marks them and the manifests `linguist-generated` so GitHub folds them in diffs.

## How `npm run codegen` works

1. **Enderman.** `inject.ts` reads the pinned vanilla definition (with its `//` comments), adds the
   `elleedog:may_move_blocks` property and a `bool_property` filter on the take-block and
   place-block goals (wrapping any existing filter in `all_of`), and writes the override into the
   Ender Mod pack. `test/features/ender-mod/codegen.test.ts` fails if the committed file drifts.
2. **Pets compiler.** `tools/codegen/pets/` is the Pets 0.5.2 compiler tree, vendored with three
   changes: `tools/seating.py` emits Bedrock-sign rotations; `tools/attachable_space.py` and
   `tools/equipment.py` pre-scale each pet's armor attachable meshes by the catalog's
   `equipment.armor_attachable.scale`; `tools/build.py` adds the `pet:armor_lift` and
   `pet:armor_scale` player properties and the `animation.pet.armor_fit` clip that lets the fit be
   adjusted live (all documented in the modules). The runner copies the tree to
   `.codegen-work/pets/` and transpiles the hand-written TypeScript modules from
   `src/features/pets/` (everything except `index.ts` and the generated files) into plain ES2020
   JavaScript in its `src/` with TypeScript's `transpileModule`, rewriting `./x.ts` imports to
   `./x.js`; the compiler packages and unit-tests that JavaScript, so a few of its tests grep the
   emitted text (see the constraints listed in `tools/codegen/run.ts`). It then runs
   `tools/build.py` in place and the compiler's own 244 Python tests. The compiler verifies its baseline and Rbow input hashes itself and produces
   four packs: `behavior_pack`, `resource_pack`, `rbow_behavior_pack`, `rbow_resource_pack`.
3. **Sync.** `tools/codegen/sync.ts` writes each compiler pack into its own repo pack:

   | Compiler output | Repo pack |
   |---|---|
   | `behavior_pack` | `behavior_packs/elleedog67_pets` (`pets`) |
   | `resource_pack` | `resource_packs/elleedog67_pets` (`pets-resources`) |
   | `rbow_behavior_pack` | `behavior_packs/elleedog67_rbow_ore` (`rbow-ore`) |
   | `rbow_resource_pack` | `resource_packs/elleedog67_rbow_ore` (`rbow-ore-resources`) |

   It skips each output's `manifest.json`, `pack_icon.png`, `LICENSE*`, `THIRD_PARTY_NOTICES*` and
   `scripts/`. Files under `entities/`, `entity/` and `attachables/` whose identifier starts with
   `minecraft:`, and render controller files that define a vanilla player, persona or cape
   controller, land under `<type>/overrides/` inside that pack; everything else keeps its relative
   path. Lang files are copied with their `pack.name` and `pack.description` lines stripped and
   duplicate keys removed keep-first (the manifests carry literal names). The standalone Rbow 1.2.0
   `elleedog:rbow_*.player` armor attachables and `rbow_spear_native.json` are copied from
   `tools/codegen/pets/integration/rbow_1.2.0/resource_pack/attachables/` into the Rbow Ore
   resource pack, so Rbow alone renders as Rbow 1.2.0 did; the Pets resource pack keeps the
   pet-aware versions of the same identifiers. `*.generated.js` from the compiler's `src/` goes to
   `src/features/pets/*.generated.ts` (the content is plain object literals, valid as TypeScript).
   Two sources mapping to one destination with different bytes is an error.
   The sync then removes whatever it wrote last time that is no longer produced, writes the new
   files, and records the list in `synced-files.json`. PNGs are compared by pixels so an encoder
   change cannot churn the repo.
4. **Manifests.** `tools/manifests.ts` rewrites all nine manifests from `packs.json`.

Not part of `npm run codegen`: the Stair Sitting and Creeper Mod pack icons are 32x32 pixel art drawn
by `tools/art/pack_icons.py` and saved at 256x256. Rerun it by hand after changing the drawing:

```bash
uv run --project tools/codegen/pets --frozen python tools/art/pack_icons.py
```

There is no union or verification step for shared files: each pack ships its own `texts/`,
`textures/item_texture.json`, `textures/terrain_texture.json` and `blocks.json`, and the game
merges them across active packs. The Stair Sitting and Redstone Guide resource packs' `texts/` and
`item_texture.json` are hand-maintained.

## Adding a pet

Follow `tools/codegen/pets/docs/ADDING_A_PET.md` inside the vendored tree (`tools/new_pet.py`
creates the catalog entry and reserves a wire id). Then `npm run codegen`, `npm test` and
`npm run build`. The compiler's lang lines land in the Pets resource pack; nothing is added by hand.

## Regenerating Rbow

The Rbow packs inside `tools/codegen/pets/integration/rbow_1.2.0/` are a hash-locked input of the
Pets compiler (`integration/RBOW_INPUT_SHA256.json`). To change Rbow data (a recipe, an ore
distribution value, a new item):

1. Edit the tables in `integration/rbow_1.2.0/tools/build_data.py` or `release.json`.
2. Run `python tools/regenerate.py` inside `integration/rbow_1.2.0/` (it needs Pillow; use
   `uv run --project tools/codegen/pets python ...`).
3. Rewrite `integration/RBOW_INPUT_SHA256.json` with the new hashes of every file under
   `integration/rbow_1.2.0/behavior_pack` and `resource_pack` (same format as the existing file).
4. `npm run codegen`, then `npm test`.

The standalone player armor and spear attachables in that tree are copied into the Rbow Ore
resource pack as they are, so an edit to them flows through the same steps.

Rbow's runtime scripts are the exception: `src/features/rbow-ore/` is their source of truth. The
two pure modules (`rules.ts`, `legacy_drop_logic.ts`) are TypeScript ports of the vendored
`rules.js` and `legacy_drop_logic.js`; each cites the upstream sha256 in its header comment and
`test/features/rbow-ore/pinned_sources.test.ts` fails when the vendored copy no longer matches
that hash, so an upstream change forces a re-review of the port. `main.ts` and `legacy_drops.ts`
intentionally differ because the feature lifecycle owns their subscriptions.

## Re-pinning the Enderman

1. Download `behavior_pack/entities/enderman.json` from the Mojang/bedrock-samples tag that matches
   the `min_engine_version` in the manifests and replace `tools/codegen/enderman/upstream/enderman.json`.
2. Update `PROVENANCE.json` (tag, path, git blob SHA, retrieved date, sha256).
3. `npm run codegen`, `npm test`. If the take-block or place-block goals moved, `inject.ts` fails
   loudly rather than shipping an override without the gate.
