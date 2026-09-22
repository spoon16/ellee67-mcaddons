# Rbow Ore

The 67 Rbow Ore Mod 1.2.0 by Ellee Schoonover, carried into ElleeDog 67 as the `rbow-ore` feature
(title "Rbow Ore"). It adds a rainbow ore to the Overworld and a complete netherite-tier material
set on top of it: three blocks, three materials, six tools, four armour pieces, recipes, smelting
and world generation. Everything except the ore drop, the tool behaviours and legacy-drop recovery
is plain pack data.

Packs: "ElleeDog 67 Rbow Ore" (Behavior Packs, carries the scripts) and "ElleeDog 67 Rbow Ore
Resources" (Resource Packs); activating the behavior pack adds the resource pack. The feature is on
exactly when the packs are active. It registers no custom commands; its diagnostic is a
`/scriptevent`.

## Pack data

All of it lives in `behavior_packs/elleedog67_rbow_ore/` and `resource_packs/elleedog67_rbow_ore/`.

- **Blocks**: Rbow Ore `elleedog:rbow_ore`, Deepslate Rbow Ore `elleedog:deepslate_rbow_ore` and the
  storage block `elleedog:rbow_block`. Placed blocks cannot be blown up. Their loot table
  (`loot_tables/blocks/rbow_empty.json`) is empty on purpose; the script spawns the drop so Fortune
  and Silk Touch can be read from the tool. Any tool breaks the block, but only an iron, diamond,
  netherite or Rbow pickaxe (or a third-party pickaxe tagged `minecraft:is_pickaxe` plus one of
  those tiers) yields a drop.
- **Materials**: Raw Rbow Ore `elleedog:raw_rbow_ore`, Rbow Ingot `elleedog:rbow_ingot`, Rbow Nug
  `elleedog:rbow_nug`. Every Rbow item is fire resistant.
- **Tools**: `elleedog:rbow_sword`, `rbow_pickaxe`, `rbow_axe`, `rbow_shovel`, `rbow_hoe` and
  `rbow_spear`. Netherite tier, 2032 durability (spear 2030), repairable with Rbow ingots or a second
  copy. The spear is a native spear item (`minecraft:kinetic_weapon`, `minecraft:piercing_weapon`)
  with the Rbow model; no script touches it. Sword, pickaxe, axe, shovel and hoe carry the
  `elleedog:rbow_tool` custom component described below.
- **Armour**: `elleedog:rbow_helmet` (407 durability, 3 protection), `rbow_chestplate` (592, 8),
  `rbow_leggings` (555, 6), `rbow_boots` (481, 3). Netherite tier and `minecraft:trimmable_armors`,
  so vanilla trim templates and materials apply in a smithing table. Rbow ingots are not a trim
  material and there is no trim workshop. The `minecraft:player` override in
  `entities/overrides/player.json` (byte-identical to the one in the Pets behavior pack, so either
  pack alone or both together give the same player) counts worn Rbow pieces through the
  `elleedog:rbow_armor_0` to `elleedog:rbow_armor_4` component groups and grants 0.1 knockback
  resistance per piece.
- **Player armour and spear art**: the resource pack carries the standalone Rbow 1.2.0
  `elleedog:rbow_*.player` armor attachables and `rbow_spear_native.json`, so Rbow Ore alone renders
  exactly as Rbow 1.2.0 did. The Pets resource pack defines the same identifiers with pet-aware
  versions, which win when "ElleeDog 67 Pets Resources" sits above "ElleeDog 67 Rbow Ore Resources".
- **Recipes**: the vanilla tool and armour shapes from ingots and ordinary sticks; nine ingots to a
  block and back; nine nugs to an ingot and back; furnace or blast furnace smelting of both ores and
  raw ore into an ingot; and `elleedog:recycle_rbow_<gear>` smelts any tool or armour piece into a
  nug.
- **World generation**: `elleedog:rbow_ore_distribution` runs in the Overworld underground pass and
  tries four times per chunk to place the weighted `elleedog:rbow_vein` feature with its origin
  between Y -50 and Y 8. Each attempt picks one of the 8 to 16 block vein structures under
  `structures/elleedog/` (stone and deepslate variants). Only newly generated chunks get ore.
- **Sulfur cubes**: the three block items carry `minecraft:sulfur_cube_archetype_bouncy`, so a grown
  sulfur cube treats them like an oak block. Raw ore, ingots, nugs, tools and armour are not cube food.
- **Legacy carrier**: `elleedog:rbow_drop` (property `elleedog:drop_art`) is the invisible,
  persistent entity Rbow 1.1.3 and 1.1.4 used to protect dropped items. It stays defined so old chunks
  can still be read; nothing spawns it any more. It doubles as the pack probe.

The three blocks declare an item visual (`minecraft:item_visual`: the plain cube geometry
`geometry.elleedog.rbow_cube` this pack ships, with the block's own materials) because on a device
their items drew as a flat top-texture plane in the inventory and hotbar, carpet style. The items
themselves stay custom, since the sulfur cube item tag lives on an item, and the world block keeps
the vanilla full block. The Pets compiler applies this (`rbow_block_visuals` in `rbow_compat.py`)
on top of the pinned Rbow 1.2.0 inputs.

## What the scripts do

`src/features/rbow-ore/rules.ts` and `legacy_drop_logic.ts` are TypeScript ports of the original
pack's pure logic; each cites the upstream file's sha256 in its header comment, and
`test/features/rbow-ore/pinned_sources.test.ts` fails when the vendored Rbow 1.2.0 copy no longer
matches that hash, so an upstream change forces a re-review of the port. `main.ts` and
`legacy_drops.ts` are the original handlers exported as functions; `index.ts` wires them into the
feature lifecycle.

| Handler | Registered | Behaviour |
| --- | --- | --- |
| `world.afterEvents.playerBreakBlock` | at world load | Spawns the drop for the three Rbow blocks using the tool held before the break: raw ore (1 to 4 with Fortune, one stack of at most 64 per spawn), the ore block itself with Silk Touch, the storage block for `rbow_block`. Nothing in Creative or Spectator, with a wrong tool, or while `doTileDrops` is false. |
| `elleedog:rbow_tool` item component | at startup | Mining wear for the five diggers: two points for the sword, one for the others, each point skipped with the usual Unbreaking chance; the tool breaks with `random.break` at max durability. Combat wear: one point for sword and hoe, two for pickaxe, axe and shovel. |
| `world.beforeEvents.playerInteractWithBlock` | at world load | Hoe tills dirt, grass block, grass and path into farmland, coarse dirt into dirt, rooted dirt into dirt plus hanging roots. Shovel turns dirt, grass block, grass, coarse dirt, podzol, mycelium and rooted dirt into a path and extinguishes campfires. Axe strips vanilla logs, woods, stems, hyphae and bamboo blocks, keeping their states. Soil actions need air above and not an underside click. The before-event only cancels; the edit runs on the next tick and is skipped if the player, hotbar slot, held tool, game mode, block or the space above changed. |
| `system.afterEvents.scriptEventReceive` | while active | `/scriptevent elleedog:rbow_check` (below). |
| `world.afterEvents.entityLoad` and a scan on start | at world load | Legacy drop recovery: each `elleedog:rbow_drop` that loads gets its stored stack cloned into a native item drop, then the empty carrier is removed. A failed write rolls the spawned copy back and retries twice; a double failure marks the carrier `elleedog:legacy_release_blocked` and stops. |

### Diagnostics and helpers

- `/scriptevent elleedog:rbow_check` prints "67 Rbow Ore Mod 1.2.0 | diagnostic check", one line per
  Rbow gear item comparing its durability with the netherite equivalent, one line per Rbow block
  confirming it resolves, and the current `recipesUnlock` and `showRecipeMessages` game rules. It
  changes nothing. Run it as a player to get the report in chat; from a command block or the server
  it goes to the content log.
- `/function elleedog/rbow_test_kit` gives the running player 64 of every Rbow block and material and
  one of each tool and armour piece. Cheats must be on; use a disposable world.

## What off means

When "ElleeDog 67 Rbow Ore" and "ElleeDog 67 Rbow Ore Resources" are deactivated: no new ore
generates and the Rbow tools and armor lose their behaviours. Ore already placed, items in chests and
the recipes need the packs active to keep working, so activate Rbow Ore before opening a world that
ever used it. Legacy `elleedog:rbow_drop` carriers are in the same position: they are entities the
pack defines, so they are only safe to load with the pack active.

## Known limits

Carried over from the original mod's `release_status.json` and README:

- "New sulfur-cube interaction/rendering requires a client check."
- "Native trims on Rbow armor are retained; a complete client/Realm acceptance matrix has not been run."
- "Dropped Rbow items can be destroyed by explosions; placed-block blast resistance is retained."
- "Redstone-like ore rarity is configured but has not been empirically calibrated." Touching veins
  can look larger than one template, and existing terrain is not regenerated.
- "The existing behavior-pack player override for armor knockback can conflict with other player
  overrides." In this add-on the same file ships in the Pets and Rbow Ore behavior packs, which is
  why any other pack that replaces the player must sit below them or be removed.
- "Legacy custom-drop recovery from earlier versions is retained but not engine-validated."

## Manual in-game checks

Use a copy of a world with "ElleeDog 67 Rbow Ore" active, cheats on and
`/function elleedog/rbow_test_kit`. Do the first pass without the Pets packs, so the standalone
attachables are what renders.

1. **Mining by tier.** Mine Rbow Ore and Deepslate Rbow Ore with a wooden, stone, golden and copper
   pickaxe: nothing drops. With iron, diamond, netherite and Rbow pickaxes: one Raw Rbow Ore each.
   Mine a placed Rbow Block: the block drops. In Creative nothing drops; with
   `/gamerule dotiledrops false` nothing drops.
2. **Fortune.** Mine ten ores with a Fortune III pickaxe: between one and four raw ore each, never
   zero.
3. **Silk Touch.** Mine each ore with a Silk Touch pickaxe: the ore block itself, even if the same
   tool also has Fortune.
4. **Last use of a tool.** Mine an ore with a pickaxe on its last durability point: the tool breaks
   and the drop still appears.
5. **Hoe.** Right-click the top of dirt, a grass block and a path with the Rbow hoe: farmland with
   the gravel sound and one point of wear. Coarse dirt becomes dirt; rooted dirt becomes dirt and
   drops hanging roots. Clicking the underside, or a block with something on top, does nothing.
6. **Shovel.** Right-click dirt, grass, podzol and mycelium: a path. Right-click a lit campfire and a
   soul campfire: extinguished with a fizz.
7. **Axe.** Right-click an oak log, a spruce wood, a crimson stem, a warped hyphae and a bamboo
   block: the stripped variant, keeping the log's axis. An already stripped log and a block from
   another add-on are left alone.
8. **Stale edits.** Right-click dirt with the hoe and, in the same instant, scroll the hotbar or
   switch to Creative: the farmland must not appear and the hoe must not wear.
9. **Durability.** Mine a stone block with each of the five diggers: the sword loses two points, the
   others one; Unbreaking III reduces the loss. Hit a mob: the sword and hoe lose one, pickaxe, axe
   and shovel two.
10. **Spear.** Charge and throw the Rbow spear in first and third person and from an armour stand:
    it behaves like the native spear with the Rbow model.
11. **Armour knockback groups.** Wear one, two, three and four Rbow pieces and get hit by a zombie
    each time: knockback shrinks with every piece and returns to normal when the set is removed.
    Trim a piece in a smithing table with a vanilla template and material: the trim renders and the
    piece keeps its stats. Crouch-clicking the table with an Rbow ingot does nothing special.
12. **Armour on a vanilla player.** With the Pets packs off, wear the full set and hold the spear:
    the armour fits the vanilla player model and the spear shows the Rbow model. Then activate Pets
    (Pets Resources above Rbow Ore Resources) and repeat as a pet: fitted shapes, `/pet:rbowcheck`
    READY.
13. **Legacy drop recovery.** Load a world saved by Rbow 1.1.3 or 1.1.4 with items on the ground:
    when their chunk loads each carrier turns into an ordinary dropped item and disappears; the
    content log stays quiet unless recovery failed.
14. **Diagnostic.** `/scriptevent elleedog:rbow_check` as a player: every gear line and block line
    says OK.
15. **Packs off.** Deactivate "ElleeDog 67 Rbow Ore" and its resource pack on a disposable copy that
    has placed ore and Rbow items in a chest, reopen it, and record what the game did with them;
    then reactivate the packs.
