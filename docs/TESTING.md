# Testing

## Automated

```bash
npm test          # vitest: core, every feature, and a real build of the packs
npm run check     # TypeScript and Biome
npm run codegen   # regenerates generated files; CI fails if that changes anything
```

`@minecraft/server` and `@minecraft/server-ui` are replaced by `test/mocks/` during tests. The mock
models the scheduler (`step`, `ticks`, `flushCurrentTick`), event signals, the command and item
component registries, players with inventories, and dimensions with blocks and entities. It is a
test double, not the engine: it proves that the scripts wire up, cancel, schedule and clean up as
designed, and that the pack JSON is structurally sound. It cannot prove rendering, animation,
touch UI, networking, chunk generation or Bedrock's real command parser.

`test/pack/build.test.ts` builds `dist/` for real and validates it (manifests, identifiers,
overrides placement, lang keys, texture references, bundle imports, deterministic archives).

The Pets compiler's own 243 Python tests run as part of `npm run codegen`.

## Manual, in Minecraft

Nothing in this repository has been run in Minecraft yet. Before calling a version good, walk this
list on a copy of a world. Each feature page under `docs/features/` has its own detailed checks;
this is the order to do them in.

1. Back up the world. Import the `.mcaddon` into a copy.
2. Activate "ElleeDog 67 (Behavior)"; confirm the resource pack was pulled in. Deactivate every old
   ElleeDog pack. Open the world and check the content log for errors.
3. `/elleedog67:features` lists six entries. If it does not, look in the content log for a
   `registerEnum` error: that means the hyphenated ids were rejected and the text fallback is in
   use (still fine), or the whole script failed (not fine).
4. Join as a player named ElleeDog: the ElleeDog 67 Book appears in the inventory. Use it: a menu
   with six switches opens. Turn one off, apply, and confirm `/elleedog67:features` agrees. Leave
   and rejoin: the setting persisted.
5. As a non-host operator, run `/elleedog67:disable creeper-mod` and `/elleedog67:enable creeper-mod`.
6. As a non-operator, drop the book and pick it up: using it says only ElleeDog or an operator can.
7. For each feature, run its page's checks with the feature enabled, then disable it and confirm
   the "disabled" behaviour on its page, then enable it again.
8. Rejoin the world with every feature enabled and confirm nothing was announced in chat on join
   (Pets is designed to be silent on lifecycle events).
