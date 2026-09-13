# Native / pet rendering separation in 0.5.2

## Prior configuration observed in the delivered 0.5.1 source

* All worn armor used `controller.render.pet.armor_switch`, with a geometry array
  containing native geometry followed by pet geometries, and
  `rebuild_animation_matrices: true` even for native armor.
* `animation.pet.<pet>.grip` still moved/reset `root`, `waist`, `body`, `head`, arms,
  and item bones. Locomotion/look channels mirrored pet changes onto `waist`/`body`.
* Pet submeshes carried unused humanoid bones. A forced native reset was applied
  before the stock player controller. Reapplying server `armor_fit=false` could
  not remove these mechanisms from the renderer.

The source evidence is concrete. Precisely which of these mechanisms caused the
client's displaced armor cannot be confirmed without in-game execution.

## Revised invariants

1. Native body and armor render passes always reference fixed native geometry.
2. Native armor uses the official shader/trim/glint expressions and native offset
   animations. The Pets compiler does not force matrix rebuilding on that pass.
3. Each pet armor pass has fixed geometry and only `pet_*` bones. Visibility masks
   are mutually exclusive and read the wearer's current form/fit state.
4. Pet third-person clips and seat alignment never write humanoid bone channels.
5. First-person paws remain an explicit exception, guarded by pet/first-person
   state. Their assets and animation parameters are unchanged.
6. No inventory, camera, collision, reach or damage changes implement the repair.

## Test changes

Prior tests enforcing a single rebuilding armor controller, mirrored native grip
channels, or a global native-reset animation encoded the old implementation.
Those assertions are replaced by fixed-native-path/disjoint-skeleton tests.
Original historical golden files are not rewritten. New preservation hashes are
computed from the delivered 0.5.1 source, projecting only the pet-visible channels
where obsolete native companions are intentionally removed. Source art, fit shapes,
paw rig, Rbow gameplay and textures remain byte-for-byte comparisons.

Mutation tests reject reintroduction of a geometry array in the native armor pass,
forced native matrix rebuilding, humanoid bones in pet submeshes, pet clips rotating
the native body, and disabling the native offset animation while morphed.

No offline test implements the Minecraft renderer, skin system, dynamic bone binding,
client replication or cached matrix behavior. In-game acceptance is required.
