# Add a pet or coat variant

```sh
python tools/new_pet.py --id buddy --name "Buddy" --from carter
python tools/new_pet.py --id oreo --name "Oreo" --from mochi --variant
python tools/build.py
```

The first command copies starter assets and a profile; the second reuses geometry/rig
and copies the coat texture. Placeholder artwork is not a newly authored animal. Do
not reuse or renumber retired wire IDs. The shared runtime requires no per-pet branch.

## Art and rig contract

Keep the native skeleton pivots/parents unchanged. Author body geometry on the
required `pet_*` bones and preserve the quadruped rig's anatomical hierarchy. A new
body family requires a new compiler/rig implementation, not just a scale tweak.
Do not put visible human body cubes in pet geometry. `first_person` supplies separate
paws, texture and default hand height; the current profile default is 2.

## Equipment profile

The starter profile now includes:

- `helmet_profile`: `covered_crown_floppy_ears` or `upright_ear_openings`.
- `armor_fit`: all four slot definitions; crown partitions/ear clearances and dorsal
  coverage are art data. Set the actual cube boundaries, not just the profile label.
- `mouth_sprite.position`: bite location in model units; `pixel_scale`, `thickness`,
  and `rotation` set the new ordinary tool mesh. Current rotation `[0,0,-45]` turns the
  native icon's diagonal handle horizontally; edit only with an exported visual check.
- `shield.side_position`, `front_position`, `side_rotation`, `front_rotation`, `width`,
  `height`, and `depth`: pet-specific torso mounting. The right side is mirrored for a
  main-hand shield. The shared guard transition is 0.16 seconds.
- Legacy `mainhand`/`offhand` native anchors remain as the fallback for unadapted items.

Do not add `pet_tool_mount`, `pet_shield_left`, or `pet_shield_right` to the source
geometry; the compiler creates these helpers. Reserve those names.

A new coat variant can reuse fitting unchanged; a new muzzle/body/ear shape requires
new fitting review. Boots/leg joints, ear clearance, and tool bite positions cannot be
inferred reliably from an arbitrary mesh without artist input.

## Validate before publishing

```sh
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
python tools/preview_gear.py
```

The supplied gear preview currently presents Carter/Mochi as reference examples;
additional pets can be passed to its `panel()` function using the same pipeline.
Run `docs/TEST_PLAN.md` in the client for every new pet. In particular check another
player's form, the restored human appearance, moving armor, a single mouth-held item,
side/front shields, paw visibility and iPad performance.

The catalog supports more than 16 forms through a permanent integer property, not a
small enum. That is a configuration capability, not a benchmark of many pets rendered
simultaneously on a Realm.
