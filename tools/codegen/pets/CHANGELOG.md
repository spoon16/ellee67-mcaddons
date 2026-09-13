# 0.5.2 — Native Armor

* Separate fixed native-body and native-armor rendering from pet-specific passes.
* Keep native armor offsets running; preserve item-owned material, trim and glint inputs.
* Remove obsolete pet grip/locomotion writes to the humanoid skeleton and the global
  native reset. All pet world/equipment meshes now contain only `pet_*` bones.
* Preserve first-person paws, book/art, quiet startup, inventories, merged float
  property fix and Rbow 1.2.0 gameplay. Match with companion pack version 1.2.3.
* Add build-time isolation validation and mutation/preservation tests.
* Known backwards sitting pose is not changed in this focused revision.

Minecraft/iPad/Realm: not executed here; client verification pending.
