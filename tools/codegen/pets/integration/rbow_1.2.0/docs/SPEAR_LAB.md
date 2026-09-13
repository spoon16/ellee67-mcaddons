# Spear rendering laboratory — test instructions

This is an isolated diagnostic, not a finished animation fix. Use a **new
Creative test world** with only the Spear Lab Behavior and Resources packs.
Do not activate the full Rbow pack, Creeper/Ender packs, or animation packs there.
Keep it off the main Realm. No cheats or experimental toggles are requested.

## Baseline

Record the exact title-screen Minecraft version, platform, graphics mode,
player skin type, and active resource packs. First equip Minecraft's own
**Netherite Spear** from Creative. Check that it is visible and that holding Use
readies it. If vanilla is also broken, record that before interpreting the lab.

## Controls

Search **Spear Lab** in Creative and take the five numbered items. For each,
look in first and third person while holding it. For 1, 3, 4, and 5, hold **Use**
for about one second and release; then tap **Attack** once toward empty air.
Control 2 is deliberately inert: check only that its trident model appears in
hand. Do not interpret its lack of charge as a failure.

A name/icon in inventory or a use sound does **not** count as a visible held
model or a successful animation. In test 3, only the attachment-local pose is
fixed: native parent/arm motion is still possible.

| Item | Held model visible, first person? | Held model visible, third person? | Use visibly changes pose? | Air attack visibly moves? |
|---|---|---|---|---|
| Vanilla Netherite Spear | | | | |
| Lab 1 — ordinary sprite | | | | |
| Lab 2 — trident model | | | Not tested (inert) | Not tested (inert) |
| Lab 3 — native, fixed local pose | | | Record, do not require | Record, do not require |
| Lab 4 — native, animated | | | | |
| Lab 5 — Rbow, animated | | | | |

## Interpreting the result

- Lab 1 missing: the baseline itself is not reproduced. Inspect pack loading
  before tuning a model.
- Lab 1 visible, Lab 2 missing: a custom-ID attachable/native reference path is
  failing. A Content Log is needed; this is not automatically a texture bug.
- Lab 2 visible, Lab 3 missing: investigate the spear-specific mesh, dimensions,
  and fixed transform path before enabling any action expressions.
- Lab 3 visible, Lab 4 fails: investigate owner animation state / attachment-local
  expressions and resource overrides. The art and geometry are held constant.
- Lab 4 works, Lab 5 fails: the held texture/layout is the distinguishing input.
- Lab 5 works: that tested combination is the candidate for integration into the
  real Rbow spear, rather than another hand-position estimate.

These comparisons narrow hypotheses; they do not uniquely identify all engine
causes by themselves. Missing native public variables may fall back to zero and
produce a visible but unmoving object. The fallback does not invent valid state.

## Evidence to return

A short first-person recording while switching through the controls, holding
Use and then tapping Attack separately, plus the first relevant Content Log
error for `elleedog_spear_lab`, `attachable`, `geometry`, `material`, `texture`, or
`Molang`. Include a third-person still for a model visible only in that view.

Content Log is Minecraft's own pack-loading/error facility. Enable it in
Settings > Creator where available, clear old messages, reopen the test world,
and reproduce the failure. Do not send account tokens or unrelated logs.

Reference: https://learn.microsoft.com/en-us/minecraft/creator/documents/contenterrorlog?view=minecraft-bedrock-stable
