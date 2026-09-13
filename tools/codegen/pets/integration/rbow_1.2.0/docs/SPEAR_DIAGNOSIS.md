# Spear audit and first-principles reset — 1.1.8

## Established from user reports

- 1.1.5 rendered the shortened spear correctly; brandishing was missing.
- 1.1.6 did not produce the expected first-person movement despite sound.
- 1.1.7 no longer renders the spear in the player's hand.

## Established from packaged files

The Rbow spear has the `minecraft:is_spear` tag and native piercing/kinetic
weapon, use-modifier, cooldown and swing components. Its behavior definition
remained unchanged across the recent visual experiments. The spear is not a
thrown trident and the recovery does not add `minecraft:use_animation: spear`.

The graphics experiments changed renderer families: plain item sprite in 1.1.5,
then vanilla player-animation overrides, then 126 separately UV-mapped pixel
cubes with an assumed binding anchor and fitted first-person Euler rotations.
The last implementation bound an empty root to the item slot and placed the
visible cubes on descendant bones. This design is removed, not declared to be a
proven engine bug. The old tests verified that design's internal arithmetic and
file graph, not whether Minecraft could display it.

The original 1.1.2 package already contained the native single-bone spear mesh
with local_pivot [0,0.5,0], mesh rotation [0,-45,90], and paired [0,24,-27]
held-pose translation. That fact rules out presenting a simple repeat of those
constants as a newly established solution. Texture layout, parent pose and
engine/runtime state must be examined together.

## Rendering contract

```text
BEHAVIOR: item identifier -> native use/attack components -> mechanics and sound
INVENTORY: item icon key -> item_texture atlas -> inventory PNG
HELD: matching attachable identifier -> texture + geometry + material/controller
                                      -> item-slot binding + context-specific pose
                                      -> actual client rendering
```

The held texture can define geometry in a texture-mesh renderer. It therefore
must have the intended physical texel layout, not merely attractive inventory
art. The native held spear is a 32px diagonal with its tip upper-left and a thin
shaft extending lower-right. A global rotation/scale is not a substitute for
checking the texture's shaft and grip layout in the paired coordinate frame.

The modern melee spear has hold/use/attack player animation paths. The older
`brandish_spear` humanoid animation is associated with trident-style behavior;
its name does not establish that it is the correct mechanism for this weapon.

## What remains unknown

Without client evidence, the specific cause of 1.1.7's disappearance is not
established. Candidates include load/parse errors, resource conflicts, missing
native state, binding-space errors, and offscreen transforms/culling. The source
checks do not warrant selecting one as the confirmed root cause.

## Changes delivered

1. Recovery installer restores the 1.1.5 held-sprite path and preserves 1.1.7's
   sleeve correction. It explicitly retains the known animation limitation.
2. A separate five-control Creative laboratory implements an inert native
   attachable control, native fixed-local-pose spear, native animated spear,
   and a texture-only Rbow variant. No gameplay overrides or scripts.
3. Archived failed generators cannot accidentally recreate the removed paths.
4. The full laboratory is reproducible offline from the matching source ZIP.

## Primary references used

Pinned samples: Mojang/bedrock-samples **v1.26.40.05**. Reference excerpts are
normalized JSON; byte-identical upstream formatting is not claimed.

- Using attachables: https://learn.microsoft.com/en-us/minecraft/creator/documents/attachables?view=minecraft-bedrock-stable
- Attachable schema: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/attachablereference/examples/attachabledefinitions/attachable?view=minecraft-bedrock-stable
- Spear model: https://github.com/Mojang/bedrock-samples/blob/v1.26.40.05/resource_pack/models/entity/spear.geo.json (Git blob 5bbd4cd2a913c2ca1c49dfea4b5edf5528230fde)
- Spear held/action animations: https://github.com/Mojang/bedrock-samples/blob/v1.26.40.05/resource_pack/animations/spear.animation.json
- Player spear state machine: https://github.com/Mojang/bedrock-samples/blob/v1.26.40.05/resource_pack/animation_controllers/player.animation_controllers.json
- Trident attachable control: https://github.com/Mojang/bedrock-samples/blob/v1.26.40.05/resource_pack/attachables/trident.entity.json (Git blob aba4be8788ea29e98fd48b0fa777e38f06461a2e)
- Trident controller: https://github.com/Mojang/bedrock-samples/blob/v1.26.40.05/resource_pack/animation_controllers/trident.animation_controllers.json
- Native spear behavior reference: https://github.com/Mojang/bedrock-samples/blob/v1.26.40.05/behavior_pack/items/netherite_spear.json

Mojang reference assets/data are subject to Mojang's terms and the Minecraft
EULA, not relicensed as original Rbow artwork. The laboratory native texture is
an actual native reference. The diagnostic Rbow texture is generated separately.

**Engine/client/Realm tests performed here: zero.**
