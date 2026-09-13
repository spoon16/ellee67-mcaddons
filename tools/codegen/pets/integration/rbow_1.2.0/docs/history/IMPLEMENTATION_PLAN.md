# 67 Rbow Ore Mod — implementation and verification plan

**Baseline:** delivered v1.1.0 test installer and matching source.  
**Proposed next complete release:** v1.2.0, subject to the acceptance gates below.  
**Author credit to retain:** Ellee Schoonover — ellee@ellee.com.  
**Scope:** repair the reported item/armor/block failures, implement real rainbow-colored trims, and establish fire/blast protection in Minecraft. This document is a plan, not an updated add-on or a claim that engine tests passed.

## 1. Baseline and product contract

The inspected installer is `67_Rbow_Ore_Mod_v1.1.0_Test.mcaddon`, SHA-256 `796a81f02948320073311a0896a72e849c4dae1698a636ed8b41055db3964741`. Its behavior and resource packs both declare version 1.1.0, minimum engine 1.26.40, and the behavior pack requests stable `@minecraft/server` 2.9.0. Mojang's 26.40 release notes confirm the release of that API version. [S1]

The baseline contains all 16 Rbow item identifiers and all three block definitions. The ingot lacks the `minecraft:trim_materials` tag, and no working new trim-material registration was shipped. Four wearable armor definitions, their icons, and trim-aware attachables are present, but normal equipping/rendering has not been established. Dropped-item protection relies on a before-hurt callback whose coverage of actual destruction paths remains unverified.

Preserve the behavior-pack UUID `ea58ca29-f4bb-4cc7-8d8c-3d7e0a39c867`, resource-pack UUID `898ad9f2-55bc-4347-aa25-9079c12c8cb9`, module UUIDs, existing `elleedog:` item/block identifiers, author credit, and approved ElleeDog/67 icon. Fixes must not delete existing equipment or regenerate terrain merely to hide a migration problem.

### Required outcomes

| ID | Outcome | Completion evidence |
|---|---|---|
| CORE-1 | All 16 items have readable Creative, inventory, hotbar, and recipe-result icons. | Actual client screenshots, not a texture atlas or promotional poster. |
| CORE-2 | Rbow Ore, Deepslate Rbow Ore, and Rbow Block place, render, persist, and mine normally. | Normal player placement/breaking; correct counts and no duplicate drops after reload. |
| CORE-3 | Helmet, chestplate, leggings, and boots equip through normal controls and render on their wearer. | Four slot tests, full-set and mixed-set tests, armor stand, and second-player observation. |
| SAFE-1 | Placed Rbow blocks and dropped Rbow materials/equipment survive supported fire/lava/explosion tests. | Native engine events, control items, before/after inventory reconciliation, and no duplication. |
| TRIM-1 | A standard trim template + existing armor + Rbow Ingot creates that pattern with multicolored ornamentation. | Normal smithing-table interaction; correct worn/GUI appearance; existing armor properties preserved. |
| TRIM-2 | Rbow armor accepts normal templates and native trim materials. | Separate native-trimming test; not used as a substitute for TRIM-1. |
| ART-1 | Runtime assets have original, coherent pixel art and clean alpha edges. | Source provenance, pixel checks, actual-scale review, and client screenshots. |
| RELEASE-1 | The pack survives upgrades, restarts, multiplayer, and use with the Creeper/Ender packs. | Isolated tests first, then a disposable Realm-copy test with the complete combination. |

**Working interpretation of blast-proof:** environmental immunity for placed Rbow material and dropped Rbow items. This does not grant the wearer explosion or fire immunity, infinite durability, or special protection to ordinary armor merely because it has a cosmetic Rbow trim. Worn armor retains the requested Netherite-equivalent normal wear. Zero blast-related durability loss while worn would be an additional decision and a separately tested behavior, not a silent assumption.

Keep the existing content scope: Rbow names, Rbow Nugs, no custom stick, no Nether ore, native-looking hoe/spear, Netherite-tier equipment, Y -50 through 10, 8–16-block deposit templates, and a measured redstone-comparable rarity target.

## 2. Work order and dependencies

Begin the high-risk trim proof of concept immediately in an isolated development pack while the core repair work proceeds. Do not generate hundreds of trim combinations before demonstrating one correct diamond-chestplate result.

| Stage | Work | Depends on | Gate |
|---|---|---|---|
| A | Version-pinned reproduction and observability | Baseline files | Reproducible failure, exact game version, usable logs. |
| B | Item/block registration, icons, placement, and armor repair | A | Every reported item passes normal client interaction. |
| C | Native Rbow trim-material feasibility prototype | A; can run alongside B | Real diamond armor receives a real multicolor trim, or a documented implementation decision is required. |
| D | Fire/blast protection repair | A; B for reliable equipment test fixtures | Native explosion tests and loss/duplication checks pass. |
| E | Full trim assets, supported combinations, and metadata preservation | B and successful C | Supported patterns/materials/slots render correctly with no armor data loss. |
| F | Equipment parity, generation, compatibility, packaging | B, D, E | Full acceptance matrix and upgrade/Realm checks pass. |

These are engineering stages, not promised delivery dates. Internal prototypes may be incomplete; they are not Realm-ready releases.

## 3. Stage A — reproduce failures on the target engine

Record the user's full title-screen version, platform, UI mode, graphics mode, active behavior/resource versions, and other enabled packs before interpreting a failure. Do not assume a historical version is still the version on the Realm. Pin the development engine, API typings, sample references, and applicable schemas to a compatible stable release. Preview-only features may be explored in a separate prototype but cannot silently become requirements of the shipping pack.

Build a disposable test world with only the Rbow pack pair active. Include a crafting table, furnace/blast furnace, smithing table, armor stand, item display/storage, a safe blast-test area, and reference vanilla items. Use fresh Creative items for the initial reproduction, then test an upgraded copy of an existing 1.1.0 world with its old items. A fresh world passing does not prove migration works.

Enable the Content Log and keep all pack-related registration, component, texture, and script errors. Minecraft documents this log specifically for malformed content and missing references. Do not diagnose a cache problem without evidence. [S2]

Improve `rbow_check` to identify the build, item registration and expected exposed component values, block permutations, script initialization status, and protection-hook availability. Do not label an item “OK” just because it has a durability component: compare the expected value with the actual value and use the installed vanilla item as the parity reference. Not every declarative component is exposed through ItemStack.getComponent; keep manual wearable/renderer checks separate. [S13]

Give every engine test a result of **PASS**, **FAIL**, or **NOT RUN**, along with engine version, artifact hash, configuration, and evidence. Unit-test success must not automatically mark an engine feature as PASS.

## 4. Stage B — fix the seven reported items before layering on features

### B1. Armor loading, equipping, and rendering

Use one minimal helmet prototype with a simple visible texture, icon, correct wearable slot, protection, and durability. Temporarily omit trims, repair/enchant additions, and the player override from this isolated fixture. Verify normal equipping first; then add the remaining components one at a time until any rejection is reproduced. Repeat the proven schema for chest, legs, and feet rather than fixing four different definitions independently.

The declared slots must be head, chest, legs, and feet respectively. Check format-version compatibility and explicit stack size as well as component syntax. Current wearable documentation contains a format-1.26.30 correction related to armor-slot stack-size handling; this makes matching the target version important, but does not establish the root cause of this user's failure. [S3]

Validate the entire render path: identifier → icon key → item atlas → actual PNG, and separately item identifier → attachable → geometry → armor materials → render controller → worn UV texture. Reuse native geometry only through valid references; confirm the renderer accepts the chosen materials and the resource pack is actually active.

**Pass condition:** every armor piece can be dragged into its correct slot and equipped using the normal supported use/quick-equip controls; it cannot occupy inappropriate slots; it has a visible icon; full and partial sets render correctly; another player sees the same armor. An API command forcing equipment into a slot is not proof of ordinary equip behavior.

### B2. Placeable blocks and their inventory items

Audit both the block definitions and the three explicit item definitions. The item must refer to a registered block with the intended identifier. Verify `minecraft:block_placer`, `replace_block_item`, valid block tags, materials, geometry, loot, and atlas references against the pinned schemas. Microsoft documents that replacement block items must match the corresponding block identifier. [S4]

Prefer a correct native block-item model when it gives a good icon; retain explicit custom icons only when their integration is proven. Do not create a second lookalike item that crafts but cannot place. Crafting, Creative selection, pick-block, normal mining, and Silk Touch must lead to the same intended identifiers.

Test placing on different faces, pick-block, Survival consumption, storage, save/reload, and the block→ingot→block round trip. Because the current pack uses empty native loot tables plus scripted mining drops, check that script startup succeeds and that there is exactly one drop implementation. Evaluate native loot tables as a way to reduce script dependence, but only migrate after Fortune, Silk Touch, tool-tier gating, and final-use durability cases match the intended results.

### B3. Artwork and asset generation

Work in `tools/build_assets.py` and `tools/build_data.py`, not only in generated files that the next build will overwrite. Maintain a single catalog of identifiers, display names, texture keys, slots, stats, and protection membership; generate dependent JSON and asset-reference tests from it.

Keep original sprite geometry and deliberate rainbow shading rather than recoloring a Netherite raster. Inventory sprites use a consistent pixel grid, binary transparency, zero RGB in transparent pixels, and no blurred halos. Preserve familiar tool silhouettes, an unmistakable hoe, a narrow native-looking spear, bumpy raw ore, a recognizable bar-shaped ingot, and small Rbow Nugs. Review icons at actual UI scale on light and dark backgrounds. Worn armor needs its own UV review; an inventory icon is not its worn texture.

Any preview delivered as evidence must be either a clearly labeled asset preview or a real game screenshot. A generated promotional image is never evidence of a working feature.

## 5. Stage D — implement environmental protection without changing everyone else's game

### D1. Native protection where it exists

Keep `minecraft:fire_resistant` on all intended Rbow items: it explicitly covers dropped items in fire or lava. Keep `minecraft:flammable: false` and `minecraft:destructible_by_explosion: false` on the three Rbow blocks. Those block settings do not make dropped equipment blast-proof. [S5, S6]

The Rbow pack must not cancel all TNT/creeper explosions, grant immunity to unrelated drops, or change world gamerules. In a control test, ordinary unprotected items must still behave normally. Test Rbow alone before enabling 67 Creeper Mod, whose cancellation of native creeper explosions can conceal a broken Rbow item-protection implementation.

### D2. Instrument and prove the dropped-item damage route

In the isolated test pack, record native explosion, before-hurt, after-hurt, spawn, pickup, and removal observations for marked test entities. Capture entity identity, type, stack information, damage cause, tick order, and whether cancellation occurred. The current API provides a cancellable EntityHurtBeforeEvent and distinguishes entity and block explosions, but documentation alone does not prove every item destruction route reaches the handler. [S7, S8]

Start with one named, partially damaged, enchanted Rbow sword and a plain control item at measured positions beside TNT. Run the same test with a Rbow armor piece. This distinguishes a rejected item component, missing script subscription, incorrect cause filter, or a native destruction path that bypasses the callback.

If the hook works reliably, retain the native explosion and cancel damage only to confirmed Rbow dropped items for the intended causes. Use a catalog-derived allowlist and stable enum values; make protection startup failures visible. Keep event callbacks restricted to permitted operations; before-event gameplay writes can throw. [S9]

If the engine bypasses the hook, treat native item/entity protection and narrowly scoped item-preservation mechanisms as separate feasibility prototypes. Do not ship an untested broad item-entity override or an unconditional restore-on-removal script. EntityRemoveBeforeEvent can also indicate unloading and exposes no cancellation flag; disappearance alone is not proof of explosion loss. [S10]

A snapshot/recovery alternative is eligible only if it can prove explosion-caused loss and preserve original stack data exactly once despite pickup, hopper collection, merging, unloading, nested explosions, and restarts. Prefer intact ItemStack copies over rebuilding items from type/count; the documented clone operation preserves custom data. If causality or atomicity cannot be established, the candidate fails the release gate rather than risking duplication or gear loss. [S11]

### D3. Required engine tests

Cover TNT, TNT minecarts, ordinary and charged creepers, end crystals, representative Wither explosions, beds/respawn anchors in dimensions where they explode, and chained blasts. Use fixtures with real blast exposure rather than terrain shielding. Test blast-followed-by-fire/lava, items already on the ground, equipment dropped on death, and Rbow contents released from a destroyed container.

Repeat with a single item and a stack, renamed/enchant/damaged equipment, adjacent identical stacks, simultaneous pickup, hoppers, chunk unload/reload, and Realm restart. For each run, reconcile total item count and metadata across ground, inventories, and containers. Normal pickup, time-based despawn, and explicit removal must remain normal; environmental resistance is not permanent world persistence.

**Pass condition:** no protected-item loss, no extra items, no loss of name/enchantments/durability/trim data, unchanged unprotected controls, and no player/mob/explosion changes caused by the Rbow pack.

## 6. Stages C and E — actual rainbow-colored armor trims

### C1. Define the exact visual and inventory result

The required operation is:

`standard armor-trim template + existing armor + Rbow Ingot → same armor with that template's pattern in multiple Rbow colors`

The base armor remains its normal material and color. Rainbow appears only in the decorative pattern, not as a replacement full-armor texture. Different templates must retain their distinct patterns. Native materials and existing trims elsewhere must not change color globally. Trimming does not upgrade diamond/iron/etc. to Netherite stats or make ordinary armor blast-proof.

The item must preserve identity where the native route permits, name, lore, enchantments/curses, current damage, leather dye, and native repair/upgrade behavior. The selected trim replaces the prior trim in the normal way. An unverified script reconstruction of valuable armor is not acceptable.

### C2. Minimal native feasibility test — first

Build a separate prototype with one Rbow Ingot, one known standard template such as Coast, and one vanilla diamond chestplate. Inspect the target's recipe schema and renderer/material mapping and add the relevant input tags and recipe only in this prototype.

The official smithing-trim recipe documents `minecraft:trim_materials`, `minecraft:trimmable_armors`, and `minecraft:trim_templates`, and property-preserving trim recipes. It does not, by itself, establish how an arbitrary new material identifier becomes a supported multicolor native trim. Official custom-armor examples show existing trims on custom armor, which is the opposite direction from using our ingot on native armor. Do not mistake input acceptance for completion. [S12, S14]

Check the complete chain: accepted inputs → valid result → correct pattern and multicolor rendering → correct inventory indication → wear/display on another player → save/reload → metadata preservation → re-trimming and Netherite upgrading.

Use an identifiable red-through-violet field constrained by the template's opaque trim mask. If the native renderer permits only a palette transformation, confirm its result actually looks rainbow-colored rather than becoming a single-color trim or illegible colored noise. Generate larger pattern sets only after this prototype passes.

**Gate:** a real native smithing operation on diamond armor must work with the requested appearance and preserved data. A tag, recipe JSON, output identifier, or concept screenshot alone cannot pass this gate.

### C3. Explicit decision if the native route is unavailable

Do not invent a Bedrock `trim_material` schema based on Java Edition and do not assume a generic smithing-transform recipe is an unrestricted substitute. The published transform reference has its own input restrictions; any alternative must be independently proven on the pinned version. [S15]

| Alternative | Tradeoff | Policy |
|---|---|---|
| Verified new native material | Standard smithing, native armor identity, native metadata behavior. | Preferred implementation. |
| Separate application interface plus per-item overlay/rendering | Changes the requested UI and may require renderer/entity changes. | Prototype only; obtain approval before changing the product contract. |
| Namespaced trimmed-armor variants | Changes item identity; risks dyes, repair costs, upgrades, other add-ons, and removal/migration. | Not a silent equivalent. Reject any variant that loses data or native behavior. |
| Recolor an existing native trim material globally | Alters unrelated players' and existing armor colors; does not truly add an independent material. | Excluded from the default design. |

The fallback is a decision point, not a hidden implementation detail. If an alternative needs new UI, replacement items, experimental features, or compromises metadata, disclose that before full implementation and obtain approval. Do not label the original requirement complete until it works or an explicitly accepted alternative is delivered.

### E1. Expand only the proven route

Derive the supported pattern and armor lists from the pinned game release. Cover all its native trimmable armor categories and four slots, and any special single-slot items the release actually permits trimming. Include Rbow armor. Do not claim arbitrary third-party armor compatibility without integration tests.

Produce the standard armor trim masks and leggings masks, corresponding multicolor texture/palette assets, inventory indicators, and localized material descriptions using the verified renderer route. Keep base-material texture pixels and existing non-Rbow trim materials unchanged.

Validate every supported pattern/slot combination automatically where feasible, then perform client visual review with representative base materials and a second player. Include renamed/enchanted/damaged gear, dyed leather, cursed gear, already-trimmed gear, repair, re-trimming, diamond-to-Netherite upgrading, armor stands/mobs where applicable, death drops, storage, and reload. If hidden metadata cannot be preserved by an alternative route, do not guess its value or silently discard it.

## 7. Stage F — finish parity, generation, and compatibility

Compare actual Rbow maximum durability, observed wear, mining speed, combat behavior, protection, enchantability, repair, and knockback against native Netherite equipment in the same Bedrock version. Use exact counters for deterministic cases and repeated controlled comparisons for probabilistic wear. Do not import Java numbers or rely on third-party server implementations as definitive Bedrock behavior.

Specifically test mixed native-Netherite/Rbow armor sets. The current player override must not erase or double-count resistance, interfere with other player components, or leave resistance active after equipment removal. Prefer removing the global player override if a verified narrower implementation provides the required parity. Otherwise document its compatibility boundary, pin its vanilla baseline, and regression-test it rather than hand-copying an ever-growing player definition without comparison.

Retest original tool actions and the spear's native-looking inventory/held presentation. Validate smelting and the 9-nugs ↔ 1-ingot and 9-ingots ↔ 1-block conversions. Keep recipes non-overlapping and native loot/script wear paths from double charging durability or duplicating drops.

Ore-generation verification remains a separate completeness task: check entire generated deposits stay within Y -50 through 10, correct stone/deepslate replacement, new terrain only, and no replacement of other ores. Verify template placement all-or-nothing behavior and distinguish a deposit from adjacent deposits that touch. Calibrate measured ore-block abundance against redstone in that same height band across multiple seeds. Report deposit encounter frequency separately: larger 8–16-block deposits and equal block abundance do not imply equal vein counts. Define the numeric tolerance before the density test, not after seeing its result.

Run the standalone pack first, then Rbow+Creeper, Rbow+Ender, and all three in relevant load orders. Test fresh client import, upgrade from 1.1.0 with existing items, local multiplayer, and a disposable Realm copy. Keep both resource and behavior release versions synchronized and check the exact final archive, not only the source tree. No Beta API requirement, global gamerule change, or unrelated entity override may be introduced without an explicit documented decision.

## 8. Implementation organization and evidence

Keep changes small and traceable. Correct source generators before editing generated output. Split the current runtime only as needed into bootstrap/diagnostics, tool interactions, mining drops, and item protection. Add trim implementation modules only after choosing the verified route. Maintain one catalog and a generated reference manifest rather than multiple hand-maintained ID sets.

Add dedicated test fixtures for core registration, item protection, native trim feasibility, and upgrade regression. Test-only fixtures and verbose tracing stay outside the shipping packs. Existing unit/image/ZIP tests remain useful but are only the first verification layer.

| Verification layer | What it proves | What it does not prove |
|---|---|---|
| Schema, reference, image, and pure-logic checks | File validity, consistent IDs, valid assets, expected branch behavior. | That Minecraft accepts or renders the feature. |
| Real-engine automation | Supported registration, damage/drop behavior, recipe/data persistence that the harness actually exercises. | Normal client UI/rendering or every interaction path. |
| Client manual/visual acceptance | Creative icons, ordinary placement/equipping, smithing UI, held/worn appearance. | All multiplayer, migration, and update behavior. |
| Multiplayer and Realm-copy acceptance | Resource synchronization, other-player rendering, restarts, combined-pack behavior. | Unspecified versions or unrelated add-ons. |

Each test record includes an ID, scenario, expected result, actual result, engine/platform, installer hash, and log/screenshot evidence. All new engine scenarios begin as NOT RUN. Preserve failed-case evidence and add the regression before closing a defect.

## 9. Release gate and deliverables

The proposed complete release is `67_Rbow_Ore_Mod_v1.2.0.mcaddon`; that filename is a planned output, not a current download. Preserve existing identities and publish synchronized pack/module/dependency versions. Confirm old held items and existing placed blocks survive the upgrade before advising use on the main Realm.

Ship the installer, matching editable source and original asset sources, release notes with a supported-version/feature matrix, runtime texture preview, a user acceptance guide, and actual engine/client/Realm evidence. Include a checksummed build manifest and a reproducible build procedure.

Release only when the seven original items work normally; all 16 item icons render; placed and dropped Rbow protection passes; native Rbow-ingot trimming or an explicitly agreed alternative is complete; relevant armor data is preserved; existing native materials remain unchanged; no duplication or item loss occurs; core parity and migration pass; and pack-related Content Log errors are resolved. Unrun client tests cannot be converted into passing results by a higher unit-test count.

**Immediate next action:** establish the version-pinned helmet/block reproduction and the one-template/one-diamond-chestplate trim prototype. Those two experiments determine the real repairs and prevent another large but unproven release.

## Sources and evidence

Local evidence inspected: the delivered v1.1.0 installer; its matching source archive; `docs/TRIM_SUPPORT.md`; `docs/REPORTED_ISSUES.md`; the four wearable definitions and three block items; `scripts/main.js`/`rules.js`; `tools/build_player.py`; and the existing audit. The installer hash was recalculated for this plan. No new Minecraft engine, client, or Realm test was run while preparing this document.

The following primary documentation supports platform facts, not claims that our implementation is verified. Some broad reference pages describe multiple versions; implementation must use the schema/API surface of the pinned target.

```text
[S1] Mojang — Minecraft Bedrock Edition 26.40 release notes
https://www.minecraft.net/fi-fi/article/minecraft-bedrock-edition-26-40

[S2] Microsoft — Content Error Log
https://learn.microsoft.com/en-us/minecraft/creator/documents/contenterrorlog?view=minecraft-bedrock-stable

[S3] Microsoft — minecraft:wearable
https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_wearable?view=minecraft-bedrock-stable

[S4] Microsoft — minecraft:block_placer
https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_block_placer?view=minecraft-bedrock-stable

[S5] Microsoft — minecraft:fire_resistant
https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_fire_resistant?view=minecraft-bedrock-stable

[S6] Microsoft — minecraft:destructible_by_explosion
https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_destructible_by_explosion?view=minecraft-bedrock-stable

[S7] Microsoft — EntityHurtBeforeEvent
https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityhurtbeforeevent?view=minecraft-bedrock-stable

[S8] Microsoft — EntityDamageCause
https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entitydamagecause?view=minecraft-bedrock-stable

[S9] Microsoft — WorldBeforeEvents
https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/worldbeforeevents?view=minecraft-bedrock-stable

[S10] Microsoft — EntityRemoveBeforeEvent
https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityremovebeforeevent?view=minecraft-bedrock-stable

[S11] Microsoft — ItemStack (including clone and data access)
https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itemstack?view=minecraft-bedrock-stable

[S12] Microsoft — Smithing Trim Recipe
https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_smithingtrim?view=minecraft-bedrock-stable

[S13] Microsoft — ItemComponentTypes
https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itemcomponenttypes?view=minecraft-bedrock-stable

[S14] Microsoft — How to Add Custom Items, custom chestplate with vanilla armor trim
https://learn.microsoft.com/en-us/minecraft/creator/documents/addcustomitems?view=minecraft-bedrock-stable

[S15] Microsoft — Smithing Transform Recipe
https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_smithingtransform?view=minecraft-bedrock-stable
```
