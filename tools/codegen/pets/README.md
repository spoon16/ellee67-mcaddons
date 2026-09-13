# ElleeDog 67 Pets 0.5.2 — Native Armor

**Client-validation build. Minecraft/iPad/Realm execution has not been performed here.**

This matched installer contains Pets 0.5.2 and the Rbow 1.2.3 Pets companion.
Rbow gameplay and artwork remain based on the supplied 1.2.0 source.

## What this changes

The 0.5.1 native armor path was still part of a geometry-switching pet renderer.
Older pet-grip and locomotion clips also moved the native `root`, `body`, arms,
and other humanoid bones. Those legacy channels were no longer needed: the
current mouth and side-carried items have direct pet-head/body attachments.

This revision gives native armor a fixed `Geometry.default` render pass using
the native material/trim/glint inputs and continuously evaluated native offsets.
Each pet has a separate fixed-geometry armor pass. Visibility, not a switch
between native and pet skeletons in one geometry array, selects the appropriate
armor. Pet-only meshes and animations contain only `pet_*` bones. The native
player body also has a fixed native render pass and is never a fallback entry
in a pet-world geometry array. The unconditional humanoid reset is removed.

This is a plausible structural correction to the reported rendering failure;
the local tests cannot prove Minecraft has restored the armor on screen.

## Install

Back up the world and use a copy. Import `dist/ElleeDog_67_Pets_v0.5.2.mcaddon`.
Activate the following matched pairs, top to bottom:

| Behavior | Resource |
|---|---|
| ElleeDog 67 Pets 0.5.2 — NATIVE ARMOR BP | ElleeDog 67 Pets 0.5.2 — NATIVE ARMOR RP |
| 67 Rbow Ore Mod 1.2.3 — PETS COMPANION Behavior | 67 Rbow Ore Mod 1.2.3 — PETS COMPANION Resources |

Deactivate PLAYER DEFINITION TEST 0.1.0, FORCE STATIC, and older competing
versions in the copy. No third diagnostic pack is required. Leave and reopen
the world after updating. Pack UUIDs are unchanged for in-place family updates.
The float `pet:seat_lift` default remains `0.0` in both merged player files.

## Commands and book

Choose **Player** in the Pet Morpher, or use `/pet:form player`, to return to your
normal character. That selects native armor automatically.

`/pet:armor native` changes only armor presentation; it does NOT change your form
or move inventory items into equipment slots. Armor must already be equipped.
While still a pet, native armor is a diagnostic fallback, not fitted pet armor.
`/pet:armor fitted` and `/pet:armor auto` re-enable fitted pet armor. Choosing a
pet through the book restores its default fitted presentation.

The book, approved green artwork, pack icons, three forms, owner descriptions,
quiet startup, and paw-height calibration (default 2) are retained. Item stacks,
slots, durability and enchantments are never rewritten by the form transition.

## Scope and known limits

This release is specifically for Player armor restoration. The reported
backwards sitting pose is still open and its pose calculations have not been
changed. Third-person pet channels and visible equipment geometry are preserved;
only obsolete humanoid companions are removed. Previously unsupported held items
still use the unmodified native fallback and can appear at normal human-hand
height in pet form. First-person paws keep their dedicated native hand rig.

Fitted dye, trims, glint, Persona/Character Creator outfits, simultaneous viewers,
and armor binding still require Minecraft tests. More render passes can have a
performance cost, which has not been measured on iPad. Each armor adapter has
one fixed native pass and one fixed pass per registered pet; only one is visible.

## Build

Python with `requirements.txt`, and Node.js for script tests:

```sh
python tools/build.py
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
python tools/package_release.py
```

Builds use the included inputs without network access. `NATIVE_ARMOR_ISOLATION.json`
records static path-isolation checks; `LOAD_VALIDATION.json` records property and
recipe checks. Neither is a game-runtime result.
