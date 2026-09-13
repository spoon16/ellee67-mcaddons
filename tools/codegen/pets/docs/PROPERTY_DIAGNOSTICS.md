# ElleeDog 67 Pets 0.4.5 — State Diagnostics

This update fixes misleading diagnostics and error wording. It does **not** claim to
fix the as-yet-unconfirmed cause of missing player properties, merge Rbow, or validate
the current pack inside Minecraft. The actual player-property declarations are unchanged.

## What the report previously got wrong

The 0.4.4 transition code rejects an undefined `pet:model_id` read. Its diagnostic code
then serialized `undefined` with JSON.stringify, dropping the `model` field entirely.
Its fallback also reported `serverForm: "human"` when the model value was absent.
A valid-looking JSON object therefore was not evidence of a valid player definition.
The model declaration, appearance transition and core form helpers were byte-identical
in the 0.4.3 and 0.4.4 installable archives inspected for this issue.

## Install and check

Open `dist/ElleeDog_67_Pets_v0.4.5.mcaddon` in Minecraft and use a disposable/copy test
world. Both pack headers are 0.4.5 STATE DIAGNOSTICS. Pack UUIDs are unchanged.
After reopening the world, run `/pet:check`.

This command is read-only and prints a small summary of the **actual property reads**:

* `READY`: all 17 expected properties have valid values. This is not a render or pack-version test.
* `MISSING_DEFINITION`: every expected property read returned undefined.
* `PARTIAL_DEFINITION`: some properties were available and some missing.
* `READ_ERROR`: one or more entity reads threw an error, distinct from undefined.
* `INVALID_VALUES`: a read returned a value with the wrong type or outside the expected range.
* `UNREGISTERED_MODEL`: model is numeric/in range, but not Player or a registered pet.

Model IDs: 0=Player, 1=Carter, 2=Mochi, 3=Casper. **Zero is valid.**
The report lists missing/invalid/error keys; it does not infer them from saved preferences.
`/pet:diagnose` retains the full report and explicitly prints null/status for absent data.
It no longer substitutes Player for a missing or unknown model.

`/pet:clientcheck` separately requests the resource-pack language translation:
`PET-RP-045: ElleeDog 67 Pets 0.4.5 STATE DIAGNOSTICS resources loaded.`
The script cannot read the client's pixels, confirm every resource file, enumerate the
active pack stack, or prove that Rbow is enabled.

## Useful next test

Run `/pet:check` in the affected world, attempt the form change which produces the
error, and run `/pet:check` again. The last command/lifecycle failure is retained in
memory with its tick and property-read status. It is removed when the player leaves.
This distinguishes data missing earlier from data readable now without changing anything.

For isolation, create a **brand-new disposable local world with only this Pets BP/RP**.
Run the same commands there. Do not disable custom-content packs on your live Realm to
perform this experiment. If the new world works, compare the original world's active
pack list and ordering. If it also fails, capture the first relevant content-log error
and exact Minecraft title-screen version. No repeated re-import loop is required.

Send one screenshot of `/pet:check`, the full `/pet:diagnose` output, active BP/RP
names/order, and whether the error appeared on join or after a command/book choice.

## Preserved

Quiet startup, joins, respawns and dimension changes; the approved green option-3 book
and pack icon; Player/Carter/Mochi/Casper menus; height-2 paws; models, armor, seating,
movement, item mechanics, inventories and saved preferences. Explicit commands still
reply. Missing declarations are never synthesized as dynamic properties and no inventory
re-equipping or destructive reset is attempted.

## Build

```
python tools/build.py
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
python tools/package_release.py
```

Use `VALIDATION.md` for the completed local test scope. All game/Realm acceptance is pending.
