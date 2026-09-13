# 1.2.0 — Release

- Promoted the native spear setup after the user's successful in-game report.
  Its item, attachable, texture references and both PNGs are unchanged.
- Added native sulfur-cube bouncy-category support to Rbow Block, Rbow Ore and
  Deepslate Rbow Ore via item tags only. No mob override, extra script, display
  proxy, custom pickup system or smithing interaction was introduced.
- Preserved all 20 runtime textures, including the chestplate sleeve repair;
  retained standard trims on Rbow armor, ordinary drops and placed-block blast
  resistance. Stats, recipes and generation settings are unchanged.
- Added central release metadata, consistent 1.2.0 manifests/package version,
  distinct Behavior/Resources descriptions and a current player/source guide.
- Added exact release-baseline and native sulfur-cube contract checks. The new
  sulfur interaction/display is configured but not client/Realm-tested here.
- Historical test reports below remain historical; the user-confirmed spear
  result and current limitations are recorded in docs/release_status.json.

# 1.1.10 — Native Spear Pipeline Test

- Replaced the Lab-5 clone/offset renderer with a single attachable referencing
  native spear geometry, native held/hit controllers and native item rendering.
- Removed custom spear mesh, render controller, local animation definitions and
  owner-condition routing; no guessed offsets remain in the spear runtime.
- Preserved all 20 texture PNGs and all gameplay definitions. Updated both pack
  manifests and only the version string in the existing diagnostic script.
- Archived unsuccessful lab generators/contract tests; no old diagnostic lab
  installer is built by default. Added native-reference contract and diff tests.
- Recorded user-reported A/B/C/D failures. No root cause or client fix is claimed.

# 1.1.9 — Spear Alignment Test

- Adopt the user-tested visible/brandishing Lab 5 render path, with the fixed
  [0,24,-27] translation changed to [0,0,0]. Preserve all action-dependent values.
- No pivot, scale, mesh, rotation, material, texture or combat change versus Lab 5.
- All 19 pre-existing PNGs remain unchanged; add the exact Lab 5 held-only PNG.
- Add an optional standalone A/B/C/D fixed-translation comparison pack.
- Preserve the sleeve fix, normal drops, native block rendering, and standard trims.
- Placement is a hypothesis requiring a client test, not a verified repair.

# 1.1.8 — Spear Recovery and separate renderer lab

- Restored 1.1.5 ordinary held-sprite path; this is not a brandishing fix.
- Removed the failed compact attachable, model and player animation overrides.
- Kept 1.1.7 sleeve cleanup and all 19 current gameplay textures unchanged.
- Added a separate, opt-in five-control rendering laboratory with independent IDs.
- Archived abandoned implementation-specific tests; current regression tests
  verify recovery invariants and laboratory control differences.
- No Minecraft engine/client/Realm test results are claimed.

# 1.1.7 — Sleeve cleanup and direct spear animation test

- Clears the shared opaque sleeve bottom cap (64 texels); no rainbow repaint.
- Adds compact pixel-cube hand-bound spear from the existing icon; directly
  animates its FP grip/shaft instead of relying on ordinary sprite hooks.
- Keeps native FP parent baseline; retains TP 1.1.6 arm curves and non-Rbow math.
- No gameplay, dropped-item, recipe, trim-system, or item-stat changes.
- Client, engine, and Realm validation remain unrun. See the current README.

# 1.1.6 — Spear Animation Test

- Candidate jab/ready animation curves for the compact spear using four guarded
  native action animation overrides; no idle/hold or geometry changes.
- No gameplay/recipe/art/drop-system changes, beyond diagnostic version text.
- No confirmed client rendering result. Keep 1.1.5 placement as the regression
  baseline; test first/third person and native animation-pack compatibility.

# 1.1.5 — native drops and rendering cleanup

- Removed custom dropped-item protection, health-bearing carriers for new drops,
  collection/rotation systems, polling and all explosion/damage interception.
- Kept native placed-block blast resistance and native item fire resistance.
- Replaced the offset custom spear mesh with ordinary held-tool rendering;
  spear gameplay and its inventory sprite are unchanged.
- Removed the three block-icon thumbnails; use native opaque block geometry in
  inventory, hand and ordinary dropped stacks. No equipment/armor art recoloring.
- Native recipe unlock conditions now include the first raw Rbow acquisition.
  Notification settings are respected, not overwritten.
- Load-only upgrade importer releases old saved carrier inventories as normal
  drops, with clone/rollback checks; it never creates another carrier.
- Standard trims on Rbow armor and absence of the workshop are preserved.
- Client, native-event, and Realm acceptance NOT RUN.

# 1.1.4 — trim cleanup

Removed Rbow as a trim material and its custom smithing workshop. Kept native
trim tags and native armor rendering on all four Rbow armor pieces. Removed
server-ui, vanilla armor attachable overrides, overlay textures/controllers,
wearer trim synchronization, and the armor-stand override. Version and module
numbers now 1.1.4; UUIDs unchanged.

All 23 retained art PNGs and pack icons are byte-identical to 1.1.3 Art Aligned.
The asset export pipeline now preserves those files instead of rerunning an
obsolete painter. Core gameplay, recipes, spear positioning, and protective
drops are unchanged. Engine/client/Realm tests remain NOT RUN. One inherited
silhouette-quality check remains an explicit expected failure.

---
## Earlier history (superseded where noted above)

# 1.1.3 candidate

Original prismatic art revision; optional reversible pattern-only trim workshop (not native third-slot material support); protected dropped-item carriers; player and armor-stand overlay synchronization; real exported-asset software previews. No engine/client/Realm test has run. See README.md for changed behavior and uninstall safety.

# v1.1.2 — Spear Repair Test

Focused candidate repair: apply Mojang-based first/third-person held offsets, add a non-player held pose for armor stands/mobs, and mirror the independently authored held texture to the native texture-mesh diagonal. Preserve the inventory icon, gameplay definitions, UUIDs and all other art. Not in-game verified. The new Rbow-ingot trim material and overview-matched artwork remain unfinished; this is not the full 1.2.0 completion release.

# v1.1.1 — texture-first preview

- Recreated all 23 runtime artwork files with the original prismatic-alloy authoring program.
- 16 detailed inventory sprites; separate block faces; 128 × 64 worn-armor atlases.
- Added truthful runtime-sprite and software-UV previews, original editable pixels, reproducible generators and art QA.
- Kept the approved brand icon, names, UUIDs, and complete gameplay baseline. Only manifest metadata and the diagnostic version label changed.
- NOT a fix for equipping/placement/blast issues. Rbow-ingot native trim material remains unimplemented.
- No Minecraft/Realm integration test was performed.

---

# Changelog

## 1.1.0 — repair test build

- Replace invalid 1.26.40 block `tag:*` components with a modern namespaced tag array.
- Add explicit 32px icons for Rbow Ore, Deepslate Rbow Ore and Rbow Block; keep native placement and the original identifiers.
- Give all 16 items namespaced atlas keys; replace every cropped/recolored runtime PNG with newly authored pixel art.
- Remove optional dispensable wearable property, declare wearable slots explicitly, and use an item format containing the wearable/stack-size fix.
- Add vanilla trim eligibility to Rbow armor and replace legacy 1.8 attachables with trim-aware 1.20.60 definitions.
- Extend diagnostic output to catch missing armor durability/components and unresolved blocks.
- Add static regression checks for the block-schema error, complete icon coverage, transparent edge hygiene and trim prerequisites.
- Preserve pack IDs, author/icon branding, recipes, generation configuration, spear mechanics and the existing player-knockback compatibility tradeoff.

Not included: an independent Rbow Ingot trim material for vanilla armor. Not proven: successful client rendering/equipping, actual smithing behavior, or Realm integration.
