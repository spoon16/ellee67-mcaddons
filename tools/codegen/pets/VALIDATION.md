# 0.5.2 — Validation

## Completed in this environment

* `npm test`: **199 passed, 0 failed, 0 skipped**, using explicit Minecraft API mocks.
* `python -m unittest discover -s tests -p 'test_*.py' -v`: **243 passed**. These test
  compiler behavior, input preservation, JSON/property types, packaging, Molang
  predicates and offline geometry calculations. They are not a Minecraft engine.
* Build-time `render_isolation.validate`: **PASS** for **90 pet-only world meshes**
  and **28 worn-armor adapters**. Native armor has a fixed native pass; pet armor has
  fixed pet passes; pet third-person clips do not mutate native body or arm bones.
* Old failure mechanisms are explicitly rejected by mutation tests: forced native
  matrix rebuild, native geometry arrays, humanoid bones in pet meshes, humanoid
  channel writes in pet animations, and stopping native armor offsets when morphed.
* Approved pet/book/pack artwork, armor-fit shapes and Rbow input files are checked
  against the delivered 0.5.1 source. Only obsolete humanoid companion channels and
  dummy bones are excluded from the pet-visible preservation projections.
* Player-property type validation preserves float default `0.0`; both behavior
  packs contain the same merged definition. Existing recipe-unlock fix is retained.

Raw results are `tests/node_results.txt`, `tests/test_results.txt`,
`NATIVE_ARMOR_ISOLATION.json` and `LOAD_VALIDATION.json`.

## Clean-source rebuild

The source archive was extracted into a separate directory. All four generated
pack folders and `dist` were deleted. The clean copy built successfully and passed
**199 script tests and 243 compiler/asset tests**. Its combined installer and all
four `.mcpack` archives are byte-identical to the release. See `tests/CLEAN_REBUILD.json`.

## Limits

No Minecraft client, iPad, Realm, actual armor binding/cache behavior, multiplayer
rendering, Character Creator skin, dye/trim/glint appearance or device performance
was tested here. A native armor pass with a separate fixed pet geometry is a
structural fix candidate, not an engine-confirmed correction.

The reported backwards sitting pose remains unresolved. Existing seating tests
validate the current offline coordinate calculation, not its correctness on the
user's client; this release makes no claim to fix the seated pose.

`docs/NATIVE_ARMOR.md` explains which implementation-dependent regression assertions
were superseded and how the untouched historical golden snapshots remain auditable.
