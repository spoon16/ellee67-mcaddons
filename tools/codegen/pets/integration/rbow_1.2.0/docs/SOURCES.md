# Implementation references

References checked during this build. These document the APIs/data used; they
are not evidence that the built add-on has been run in the engine.

## Compatibility and scripting

- Bedrock 26.40 release notes (stable Script API 2.9.0):
  https://www.minecraft.net/en-us/article/minecraft-bedrock-edition-26-40
- Server module:
  https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/minecraft-server?view=minecraft-bedrock-stable
- Explosion before event:
  https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/explosionbeforeevent?view=minecraft-bedrock-stable
- Entity hurt before event:
  https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityhurtbeforeevent?view=minecraft-bedrock-stable
- Player break event / pre-break item snapshot:
  https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/playerbreakblockafterevent?view=minecraft-bedrock-stable
- Item before durability damage:
  https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itemcomponentbeforedurabilitydamageevent?view=minecraft-bedrock-stable

## Data components

- Durability:
  https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_durability?view=minecraft-bedrock-stable
- Fire resistance:
  https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_fire_resistant?view=minecraft-bedrock-stable
- Wearable:
  https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_wearable?view=minecraft-bedrock-stable
- Digger:
  https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_digger?view=minecraft-bedrock-stable
- Block placer and replace_block_item:
  https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_block_placer?view=minecraft-bedrock-stable
- Destructible by explosion:
  https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_destructible_by_explosion?view=minecraft-bedrock-stable
- Equipment filters / armor slot domains:
  https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/filters/has_equipment?view=minecraft-bedrock-stable

## Native world-generation features

- Structure template feature and intersection constraints:
  https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/features/minecraftstructure_template_feature?view=minecraft-bedrock-stable
- Aggregate feature:
  https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/features/minecraftaggregate_feature?view=minecraft-bedrock-stable
- Weighted random feature:
  https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/features/minecraftweighted_random_feature?view=minecraft-bedrock-stable

These native features were chosen so each attempted deposit has a complete,
connected 8–16-block template rather than relying on a nominal ore-feature
count that can place fewer actual blocks. Successful placement rate, adjacent
vein merging and exact redstone-equivalent density still require live testing.

## Native source material

See `THIRD_PARTY_NOTICES.md` for pinned Mojang source paths and license terms.
The spear recipe follows `behavior_pack/recipes/iron_spear.json`, using one
Rbow Ingot in place of the iron ingot. The earlier concept's two-ingot spear
recipe was not retained because it collided with the hoe's shaped recipe.

## 1.1.0 repair references

- Modern block tag breaking change (1.26.20): https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.20?view=minecraft-bedrock-stable
- Native block placement and replacement-item identity rule: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_block_placer?view=minecraft-bedrock-stable
- Icon atlas mapping: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_icon?view=minecraft-bedrock-stable
- Wearable slots: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_wearable?view=minecraft-bedrock-stable
- Custom armor and native trim prerequisites: https://learn.microsoft.com/en-us/minecraft/creator/documents/addcustomitems?view=minecraft-bedrock-stable

These sources validate documented data fields; they are not records of this pack running in Minecraft.
