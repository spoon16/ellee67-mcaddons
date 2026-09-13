# Spear Alignment Lab 0.2.0

This is a standalone placement test, not required for the Rbow Ore add-on.
It has independent UUIDs and no scripts, recipes, ore generation, native item
replacement, player overrides, or gameplay-pack dependency. Install both its
Behavior and Resources packs into a new Creative test world.

Search **Spear Alignment** in Creative. All four controls share Lab 5's exact
held texture, mesh, animation expressions, scale and combat components.
Only their names, identifiers, and fixed translation differ.

| Item | Fixed translation | Purpose |
|---|---|---|
| A — Original Lab 5 | `[0, 24, -27]` | Unchanged-offset baseline, matching the prior Lab 5 behavior. |
| B — Remove Y Offset | `[0, 0, -27]` | Isolate removal of the fixed Y component. |
| C — Remove Z Offset | `[0, 24, 0]` | Isolate removal of the fixed Z component. |
| D — Remove Both Offsets | `[0, 0, 0]` | Same candidate placement as the full Rbow 1.1.9 installer. |

These are model-space coordinate labels. They do not promise screen-vertical
or world-forward movement; the holder's rotations transform those directions.

Start with D next to a native Netherite Spear. Without moving or changing the
camera, check the grip in first person and third person behind. Hold Use for
roughly one second, then release. Test Attack separately. A side-view screenshot
is useful because a top-down image can hide vertical separation.

If D is still off, compare A/B/C/D from the same camera. Report which comes
closest to the hand and whether it moves in the desired direction; a screenshot
showing the selected item's name disambiguates the result. One-second recordings
can show the readying movement. There is no need to repeat the old Lab 1–4 tests.

Do not run this on the main Realm. Disable other animation/item resource packs
while testing. The old 0.1.0 Render Lab can be disabled to avoid duplicate-looking
items. This pack only creates Creative test items; installing it does not fix
the Rbow item in another world.

## Evidence status

The user has confirmed old Lab 5 visibility and brandishing but reported incorrect
placement. **None of A/B/C/D in this newly packaged comparison has been tested in
Minecraft by the assistant.** A is a source-matched baseline; D is a candidate,
not a proven correction. All four results remain NOT RUN pending client feedback.
