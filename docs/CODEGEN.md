# Generated files

Some of the pack is produced by generators rather than written by hand. The generated files are
committed, so `npm run build` never needs Python and a fresh clone builds in seconds. CI runs
`npm run codegen` and fails if the result differs from what is committed, so a stale or hand-edited
generated file is caught on the next pull request.

```bash
npm run codegen        # regenerate everything and sync into the pack tree
npm run codegen:test   # only run the Pets compiler's own Python tests
```

Requirements: [uv](https://docs.astral.sh/uv/) (it installs the pinned Python 3.12, Pillow and numpy
from `tools/codegen/pets/uv.lock` on first use).

## What is generated, and from what

| Generated | Generator | Inputs you edit |
|---|---|---|
| `behavior_packs/elleedog67/entities/overrides/enderman.json` | `tools/codegen/enderman/inject.ts` | `tools/codegen/enderman/upstream/enderman.json` (pinned vanilla file) |
| Pets: `entities/overrides/player.json`, `entities/pets/`, `items/pets/`, `recipes/pets/`, `functions/pet/`, and in the resource pack `entity/overrides/player.entity.json`, `entity/pets/`, `attachables/overrides/`, `attachables/pets/`, `render_controllers/overrides/`, `render_controllers/pets/`, `animations/pets/`, `animation_controllers/pets/`, `models/entity/pets/`, `textures/entity/pets/`, `textures/ui/`, the pet item textures; plus `src/features/pets/*.generated.js` | `tools/codegen/pets/tools/build.py` (the Pets compiler) | `tools/codegen/pets/catalog/`, `assets/`, `project.json`, `baseline/`, `upstream/`, and the hand-written scripts in `src/features/pets/` |
| Rbow Ore: `blocks/rbow-ore/`, `items/rbow-ore/`, `recipes/rbow-ore/`, `features/rbow-ore/`, `feature_rules/rbow-ore/`, `structures/elleedog/`, `loot_tables/blocks/`, `functions/elleedog/`, `entities/rbow-ore/`, and in the resource pack `entity/rbow-ore/`, `attachables/rbow-ore/`, `render_controllers/rbow-ore/`, `models/entity/rbow-ore/`, the Rbow textures | the Pets compiler, which copies and adapts the hash-locked Rbow 1.2.0 packs under `tools/codegen/pets/integration/rbow_1.2.0/` | `tools/codegen/pets/integration/rbow_1.2.0/tools/build_data.py` and its tables (see "Regenerating Rbow") |

The complete list of files the sync owns is `tools/codegen/synced-files.json`; `.gitattributes`
marks them `linguist-generated` so GitHub folds them in diffs.

## How `npm run codegen` works

1. **Enderman.** `inject.ts` reads the pinned vanilla definition (with its `//` comments), adds the
   `elleedog:may_move_blocks` property and a `bool_property` filter on the take-block and
   place-block goals (wrapping any existing filter in `all_of`), and writes the override.
   `test/features/ender-mod/codegen.test.ts` fails if the committed file drifts.
2. **Pets compiler.** `tools/codegen/pets/` is the Pets 0.5.2 compiler tree, vendored unmodified. The
   runner copies it to `.codegen-work/pets/`, adds the hand-written modules from `src/features/pets/`
   as its `src/`, runs `tools/build.py` in place, then runs the compiler's own 243 Python tests. The
   compiler verifies its baseline and Rbow input hashes itself and produces four packs.
3. **Sync.** `tools/codegen/sync.ts` reads every output file, decides its home by identifier
   (`minecraft:` goes to `overrides/`, `pet:`/`cav:` to `pets/`, `elleedog:` to `rbow-ore/`;
   textures, functions, structures and loot tables keep their paths), deletes what it wrote last time,
   copies the new files, and records the list. PNGs are compared by pixels so an encoder change
   cannot churn the repo. The rbow copy of `player.json` is skipped (identical to the pets one).
4. **Verify shared files.** `texts/en_US.lang`, `texts/en_GB.lang`, `textures/item_texture.json`,
   `textures/terrain_texture.json` and `blocks.json` are hand-maintained unions. The sync checks
   that every key the compiler emits is present with the same value and prints the missing lines
   for you to add. It never writes those files.

## Adding a pet

Follow `tools/codegen/pets/docs/ADDING_A_PET.md` inside the vendored tree (`tools/new_pet.py`
creates the catalog entry and reserves a wire id). Then `npm run codegen`, add the lang lines it
asks for under `## pets` in both `.lang` files, run `npm test` and `npm run build`.

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

Rbow's runtime scripts are the exception: `src/features/rbow-ore/` is their source of truth. The
two pure modules (`rules.js`, `legacy_drop_logic.js`) must stay identical to the vendored copies
(`test/features/rbow-ore` checks this); `main.js` and `legacy_drops.js` intentionally differ
because the toggle lifecycle owns their subscriptions.

## Re-pinning the Enderman

1. Download `behavior_pack/entities/enderman.json` from the Mojang/bedrock-samples tag that matches
   the `min_engine_version` in the manifests and replace `tools/codegen/enderman/upstream/enderman.json`.
2. Update `PROVENANCE.json` (tag, path, git blob SHA, retrieved date, sha256).
3. `npm run codegen`, `npm test`. If the take-block or place-block goals moved, `inject.ts` fails
   loudly rather than shipping an override without the gate.
