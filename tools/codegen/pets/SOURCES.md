# Sources for the compatibility build

## Primary implementation inputs

- User-uploaded `67_Rbow_Ore_Mod_v1.2.0_Source(1).zip`, expanded under
  `integration/rbow_1.2.0`. Input archive SHA-256 is recorded in project.json.
  All original runtime files are locked by integration/RBOW_INPUT_SHA256.json.
- The actual Pets 0.4.5 source ZIP from this conversation. Original retained
  model/art/animation hashes are in integration/PETS_045_RETAINED_SHA256.json;
  original player and equipment catalogs are retained alongside it.
- Approved pack icon and Morpher option 3 source PNGs remain hash-pinned in project.json.

## Official technical references consulted

- Entity properties and client synchronization: https://learn.microsoft.com/en-us/minecraft/creator/documents/introductiontoentityproperties?view=minecraft-bedrock-stable
- Attachable definitions: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/attachablereference/examples/attachabledefinitions/attachable?view=minecraft-bedrock-stable
- Resource pack stacking: https://learn.microsoft.com/en-us/minecraft/creator/documents/resourcepack?view=minecraft-bedrock-stable
- Render controllers: https://learn.microsoft.com/en-us/minecraft/creator/documents/animations/animationrendercontroller?view=minecraft-bedrock-stable
- Pack manifests/dependencies: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/addonsreference/packmanifest?view=minecraft-bedrock-stable

The documentation establishes formats, not proof that this build renders correctly
on a specific client. The exported-asset previews are not game screenshots. Native
reference provenance and licenses from earlier Pets builds remain under upstream/
and docs/history; Rbow's original notices remain in its source and runtime packs.


## 0.5.1 loader correction

- User-supplied content log: `pet:seat_lift` default did not match `float`; recipe
  `pet:paw_token` missing unlock; unknown native spear flag; actorless query warnings.
- Microsoft: Entity Property direct defaults must match type/range.
  https://learn.microsoft.com/en-us/minecraft/creator/documents/introductiontoentityproperties?view=minecraft-bedrock-stable
- Mojang pinned `behavior_pack/recipes/bone_meal_from_bone.json`, commit
  736072450c26a7c67f07b1661f29d9a5ebaa14b1, uses unlock item `minecraft:bone`
  with format 1.20.10. Used as reference for the Paw Token unlock, not copied recipe.
- Mojang pinned `resource_pack/entity/player.entity.json` and
  `resource_pack/animation_controllers/player.animation_controllers.json`:
  native spear flag/controller integration. Only an initial default was added.
- No Minecraft execution, online issue reports, or synthetic UI images are used
  as evidence of this patch working on the user's device.


## 0.5.2 native rendering comparison

Official Mojang sample objects, commit `736072450c26a7c67f07b1661f29d9a5ebaa14b1`:
- `resource_pack/render_controllers/armor.render_controllers.json`
- `resource_pack/render_controllers/player.render_controllers.json`
- `resource_pack/animations/armor.animation.json` (consulted; native aliases retained)

Normalized reference objects and original Git blob identifiers are stored in
`upstream/native_armor_052/PROVENANCE.json`. They describe the native pipeline;
not proof that the candidate was run in Minecraft.
