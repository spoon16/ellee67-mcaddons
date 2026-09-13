# Native sulfur-cube support — 1.2.0

## Scope

Add `minecraft:sulfur_cube_archetype_bouncy` to the **item** definitions for
`elleedog:rbow_block`, `elleedog:rbow_ore` and `elleedog:deepslate_rbow_ore`.
The integration deliberately selects the requested oak-style bouncy treatment
rather than giving stone-host ores a separate stone/metal category.

The three definitions otherwise remain identical to 1.1.10. The block files,
geometry, textures, scripts, items other than the three blocks, recipes and
world-generation definitions are unchanged. The generator supplies the tag; a
rebuild will not lose the change.

## Native implementation contract

Mojang's `v1.26.40.05` behavior definition uses item tags for:

- `minecraft:behavior.tempt` item selection;
- normal feeding and block replacement via `has_equipment_tag` and
  `equip_item_slot: slot.weapon.mainhand`;
- `minecraft:shareables` with `singular_pickup: true` and a one-item maximum;
- the `minecraft:on_block_absorbed` branch that triggers
  `minecraft:become_bouncy`;
- normal equipment-change events; shearing drops the mainhand slot item.

The native client entity renders the held item; only TNT is hidden by its
special-case `hide_held_items` expression. Rbow uses opaque full-block geometry
and the existing block material textures. No new sulfur-cube geometry or
attachable is needed, and no normal item is converted into a helper entity.

The excerpts in `sulfur_cube_reference/contract.json` were normalized from the
retrieved native files. They are a contract fixture, not a complete entity or a
simulation of Minecraft's renderer. Tests show that our item definitions satisfy
these selected conditions. They do not demonstrate in-game consumption,
rendering, dispensing or persistence.

## Sources

- Mojang behavior definition, pinned tag: https://github.com/Mojang/bedrock-samples/blob/v1.26.40.05/behavior_pack/entities/sulfur_cube.json
- Mojang client rendering definition, pinned tag: https://github.com/Mojang/bedrock-samples/blob/v1.26.40.05/resource_pack/entity/sulfur_cube.entity.json
- Microsoft item tags reference: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_tags?view=minecraft-bedrock-stable
- Microsoft block-placer reference: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_block_placer?view=minecraft-bedrock-stable
- Mojang Chaos Cubed announcement (feeding directly or dropping a block nearby): https://www.minecraft.net/nb-no/article/chaos-cubed-official-release-date

Mojang reference excerpts remain subject to the Mojang sample repository's terms;
see THIRD_PARTY_NOTICES.md. They are not included in installed runtime packs.
