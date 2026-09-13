# 67 Rbow Ore Mod — 1.2.0

**Ellee Schoonover — ellee@ellee.com**

Release built from the user-confirmed 1.1.10 native spear configuration. The
spear's item definition, attachable and both textures are unchanged. All 20
runtime textures and the chestplate sleeve repair are preserved.

New in this release: native sulfur-cube support for **Rbow Block**, **Rbow Ore**,
and **Deepslate Rbow Ore**, using the bouncy category requested for oak-style
behavior. No new interaction script, custom cube, item substitute or rendering
override is installed.

## Download and installation

Open `67_Rbow_Ore_Mod_v1.2.0.mcaddon` in Minecraft. The single installer contains:

- **67 Rbow Ore Mod — Behavior 1.2.0**: items, ores, equipment, recipes, world
  generation and native sulfur-cube item tags.
- **67 Rbow Ore Mod — Resources 1.2.0**: the existing Rbow artwork, armor
  rendering, and the working native spear attachment.

Back up your world before updating. Activate the Behavior pack and check that
Resources is also active at **1.2.0**. The Behavior pack declares its companion
Resources dependency. The original pack UUIDs and item/block identifiers are
unchanged; this is an update, not a second set of Rbow items.

Keep retired **Spear Render Lab** and **Spear Alignment Lab** packs inactive in
both the world and Global Resources. They are not part of the release. Fully
restart Minecraft after replacing the active pack versions. Use a local world
copy for the initial sulfur-cube check before updating your main Realm.

The engine target remains **Bedrock 26.40 or later**, with manifest minimum
`[1,26,40]` and stable Script API `2.9.0`. No experimental-feature or Beta API
dependency is declared. Engine/API requirements were not raised by this update.

## Included content

Rbow Ore, Deepslate Rbow Ore and Rbow Block; Raw Rbow Ore, Rbow Ingots and Rbow
Nugs; sword, pickaxe, axe, shovel, hoe and spear; helmet, chestplate, leggings
and boots. Existing recipes, smelting, repairs, equipment stats and tool actions
are retained. Ordinary sticks are used in the recipes; no custom stick or Nether
ore variant is included.

Ore generation remains Overworld-only between **Y -50 and Y 10**, using connected
8–16-block templates in newly generated terrain. The redstone-like rarity target
has not been calibrated with generated-world measurements; touching deposits can
look larger than one template. This update does not regenerate existing terrain.

Standard trim templates and standard trim materials can be applied to Rbow armor
through the native trim configuration. **Rbow Ingots are not trim materials**;
there is no crouch/workshop menu. This release does not change that configuration.

Placed Rbow blocks retain native explosion resistance. Dropped items remain
ordinary Minecraft items and can be destroyed by explosions. Their native
fire/lava resistance remains configured. No damage-immune pickup mobs or
explosion-cancellation system are added.

## Sulfur cubes

### What to feed

| Item | Native category | Intended display |
| --- | --- | --- |
| Rbow Block | Bouncy | The colorful Rbow storage block inside the cube. |
| Rbow Ore | Bouncy | The stone-host Rbow ore block inside the cube. |
| Deepslate Rbow Ore | Bouncy | The darker deepslate-host ore block inside the cube. |

Only these three **placeable block items** receive the new tag. Raw Rbow Ore,
ingots, nugs, tools and armor are not sulfur-cube food.

Use a grown/large sulfur cube that would accept an oak block. Hold one of the
three Rbow blocks and use the cube's normal feeding interaction, or drop a block
item nearby for its normal pickup behavior. No crouching or custom menu is
required. Use shears through the normal interaction to remove the held block.

The addition is the item tag:

```json
"minecraft:tags": {
  "tags": ["minecraft:sulfur_cube_archetype_bouncy"]
}
```

The native mob checks that tag for temptation, feeding, pickup and its bouncy
archetype. It equips the actual block item in its normal slot. The items already
use `minecraft:block_placer` and opaque full-block geometry, allowing the native
held-item renderer to use the real block and its existing textures. There is no
proxy oak block, invisible-item bookkeeping, extra visual entity or replacement
sulfur-cube definition. Wood recipe tags such as `minecraft:planks` are **not**
added. Fire resistance, mining behavior and block recipes are not changed.

This enables feeding and dropped-item absorption. It does not add any routine
that removes placed blocks from builds or natural terrain.

### In-game acceptance check for the new feature

These checks are **NOT RUN** in this environment. Repeat with each of the three
blocks, using oak as a control in the same world:

1. Feed one from a Survival stack. Check that exactly one item is consumed,
   the correct block appears inside the cube, and the stack remainder is intact.
2. Drop a small stack nearby. Check that one is absorbed and the others remain
   ordinary dropped items. Compare bounce behavior with the oak-fed cube.
3. Shear the block out and confirm the same Rbow block item is returned.
4. Save/reload, and test bucketing/releasing the cube. Confirm that the held
   block remains correct and is still recoverable. Check another player's view.

A young cube is not a valid feeding test; first verify that the same cube can
accept oak. Ordinary native pickup cooldowns still apply. No custom dispenser
behavior is implemented; dispenser compatibility is left to the native engine.

## Validation status

The user reported: **“The Rbow spear now works. We are satisified with this
outcome.”** This report applies to 1.1.10, whose working spear files are retained
byte-for-byte in 1.2.0. No new spear geometry, offsets or animations were authored.
The report is not treated as validation of every other feature.

The automated suite verifies the native sulfur-cube tag contract, exactly which
items receive it, opaque block render paths, unchanged spear/art/gameplay files,
recipe/structure data, script logic with mocks, and deterministic regeneration.
`TEST_RESULTS.txt` records the local results. The release baseline is pinned to
the actual 1.1.10 installer, not reconstructed from its release description.

**New sulfur-cube feeding, display, shearing and persistence have not been tested
in a Minecraft client or Realm here.** A complete engine/Realm acceptance matrix
has not been run. See `docs/release_status.json` and `docs/RELEASE_VALIDATION.json`
for the distinct user-confirmed, locally verified and not-run results.

## Existing compatibility limits

The Behavior pack retains the existing `minecraft:player` override for armor
knockback; other player-behavior overrides can conflict. The Resource pack does
not replace the player or sulfur cube. Other resource packs that replace native
spear or armor resources can still affect their rendering.

The load-only recovery helper for old custom item carriers from earlier Rbow
versions remains unchanged. It creates no new carriers. Collect old loose Rbow
items before an upgrade where practical, and retain your world backup; recovery
of old saved entities was not engine-validated.

## Source and reproducible build

Prerequisites: Python 3.10+, Pillow, NumPy and Node.js 20+. See
`requirements-dev.txt`. From the extracted `67_Rbow_Ore_Mod` folder:

```sh
python tools/regenerate.py
python tools/build.py
```

Version, release filename and the sulfur-cube tag are in `release.json`.
`tools/build_data.py` generates the three item tags. `tools/build_native_spear.py`
is unchanged from the user-confirmed 1.1.10 build and directly references the
native spear resources. `tools/build_assets.py` copies hash-locked artwork.

The build creates the `.mcaddon`, individual `.mcpack` files, matching source ZIP,
checksums and test log under `dist/`. It makes no network calls, does not start
Minecraft and does not modify any world. Old labs are preserved only as historical
source and are neither built nor installed by the release commands.

Native-source provenance: `docs/SULFUR_CUBES.md` and
`docs/sulfur_cube_reference/contract.json`. See `LICENSE` and
`THIRD_PARTY_NOTICES.md` for original-code, artwork and Mojang reference terms.
