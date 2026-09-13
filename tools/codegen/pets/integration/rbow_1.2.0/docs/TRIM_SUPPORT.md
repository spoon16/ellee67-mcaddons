# Trim support in 1.1.5 (unchanged from 1.1.4)

**Supported configuration:** existing vanilla trim templates and materials
applied to Rbow helmet, chestplate, leggings, and boots in the normal smithing
table. All four retain `minecraft:is_armor`, `minecraft:trimmable_armors`, the
correct wearable slots, modern icon definitions, and format versions at least
1.20.60. The eight worn-armor attachables use `controller.render.armor` without
conditions or a custom overlay.

**Removed:** using Rbow as a trim material, its workshop, crouch/use interception,
server-ui dependency, client-synced overlay properties, custom pattern/color
textures, vanilla armor attachment overrides, and armor-stand override.
No Rbow ingot is tagged as a trim or smithing-transform material. No native
material palette, template, armor item, or smithing recipe is replaced.

The engine's native recipe handles template/material selection. This pack does
not copy or maintain a separate list of standard trim patterns or materials.
Applying and rendering an actual trim on a client is still NOT RUN; the local
tests validate data configuration and event non-interception, not native UI.

## Existing workshop-applied overlays

The old operation cloned the original armor item and added a custom dynamic
property and lore. 1.1.4 does not read that property, synchronize it, or render
its overlay. The original item and any native trim data are not modified. Old
`Rbow trim: ... (extension)` lore may remain inert. There is deliberately no
inventory-scanning migration or new interaction menu. A backup is recommended.

## Documentation checked for this change

Microsoft Learn, Custom Items, section "Custom chestplate with vanilla armor
trim": https://learn.microsoft.com/en-us/minecraft/creator/documents/addcustomitems?view=minecraft-bedrock-stable

Microsoft Learn, Smithing Trim Recipe:
https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_smithingtrim?view=minecraft-bedrock-stable
