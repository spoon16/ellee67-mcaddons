# Shared pet architecture — 0.3.1

The player remains `minecraft:player`. No invisible mount, replacement animal,
continuous teleports, inventory clone, or gameplay reimplementation is used.

## Catalog and persisted identity

`catalog/pets/*.json` describes each pet; `catalog/wire_ids.json` assigns permanent
numeric rendering IDs independent of menu order. Saved string selections remain
stable. Adding a pet or coat variant through `tools/new_pet.py` does not require
adding pet-specific branches to the runtime. The compiler generates scripts, model
selection, controllers, menu metadata, armor and equipment assets.

## Bone families

The native empty hand/body skeleton is retained for native rendering contexts. A
separate `pet_*` quadruped skeleton animates the visible pet. Carter and Mochi share
clip conventions but have rig-specific stride, ear and tail parameters. User-confirmed
0.3.0 locomotion clips and original model/paw files are locked by hash regressions.

The compiler adds empty `pet_tool_mount`, `pet_shield_left`, `pet_shield_right` helpers.
Ordinary tool meshes inherit `pet_head` via the mouth mount; shields inherit the torso.
Native-hand companion channels are retained as a fallback for unadapted items, but
mapped ordinary tools no longer depend on their speculative native grip placement.

## Fitted armor

The existing, client-confirmed per-player armor attachable pipeline is retained.
Each slot's mesh copies the pet skeleton, adds only the relevant armor cubes, and
uses the native material/glint/dye/trim inputs. The crown/back geometry has changed;
leggings/boots definitions have not. Human/non-fitted first-person paths remain native.

Carter's covered crown is placed above the highest head-fur cube. Mochi's crown is
partitioned around two explicit ear clearance regions. Dorsal plates span the actual
torso; their upper faces sample occupied material UV islands rather than neckline gaps.
`helmet_profile` is per pet; all configured helmet materials use that pet's geometry.

## Ordinary hand tools

`catalog/equipment/handhelds.json` lists supported native item IDs, icon paths, mesh
shapes and bite pixels. The RP queries the subject's main-hand item and selects a
pixel-extruded mouth mesh. Its handle diagonal is rotated into a horizontal bite.
Only mapped, third-person, active-pet gear suppresses the original rightArm/rightItem
visual. The visible pet forelegs are different bones and are not hidden. Unmapped
items, first-person and Human form remain on the original item paths.

Each selected tool uses one 256-cuboid mesh, not 256 entities or animation bones.
Native texture alpha supplies the real pixel silhouette. One item mesh is drawn per
pet; only the selected shape/texture is rendered. iPad multi-player performance needs
measurement; the pack does not claim a measured frame-rate result.

`src/tool_effects.js` reads only the selected item for transformed players every four
ticks. It synchronizes enchantment appearance with write-on-change properties. It
does not scan, create or replace inventories. A companion item index rejects glint
from a different stale selected item. Equip-time visual delay is possible.

## Shields

The original shield attachable's native first-person animation aliases, variables,
materials and textures are preserved. A guarded third-person pet route selects a
full-skeleton fitted shield mesh. A torso-child mounting bone interpolates between
profile side/front positions on crouch or native blocking. Offhand/main-hand positions
are mirrored, with a small front separation for the unusual two-shield case. This is
purely visual and does not confer blocking, change hitboxes, or move projectile origins.

## Defaults and compatibility

Armor and gear fitting default on, but explicit native overrides are respected.
`/pet:armor auto` and `/pet:gear auto` clear only their respective override. The first-
person height default remains 2 and explicit prior calibration persists.

Shared player, Persona, cape and armor resources still need a combined build with
Rbow and any other pack that edits those resources. `tools/pack_conflicts.py` is an
inspection tool, not an automatic safe merge of arbitrary third-party definitions.

All automated tests are local structural/mocked/mathematical checks. They are not
Minecraft, real networking, shader execution, or proof that native item suppression
works on the iPad. The client acceptance checklist remains a release gate.
