# Adding a feature

Use this checklist for a brand-new feature or when porting one. The six existing features are
worked examples; `src/features/creeper-mod/` is the smallest.

## 1. Pick an id and register it

- Add the id to `FEATURE_IDS` in `src/core/features.ts` (lowercase, hyphens). This also becomes the
  value players type after `/elleedog67:enable`.
- Create `src/features/<id>/index.ts` exporting a `FeatureDefinition` (see
  [ARCHITECTURE.md](ARCHITECTURE.md)) and add it to the list in `src/features/index.ts`.

## 2. Scripts

- Keep modules small and pure where possible; the engine-facing glue lives in `index.ts`.
- Subscribe only through the context so the feature can be switched off:

  ```ts
  start(ctx) {
    ctx.on(world.afterEvents.playerBreakBlock, onBreak);
    ctx.every(20, sweep);
    // load-time work runs here directly; never subscribe to worldLoad
  }
  stop(ctx) {
    // undo visible state (remove helper entities, reset properties); ctx disposes subscriptions afterwards
  }
  ```

- Register commands and item components in `register()`, using the registries it receives. They
  are gated automatically; do not check `isEnabled` yourself in command handlers.
- Command callbacks and before-events are read-only: capture what you need and mutate inside
  `system.run`.
- Chat and log text: plain sentences, no em-dashes, prefix log lines with the feature name.
- Do not hand-write `@minecraft/server` API calls you have not seen in the typings; run
  `npm run check`.

## 3. Pack content

- Put JSON under the matching content type folder in a `<id>/` subfolder:
  `behavior_packs/elleedog67/items/<id>/`, `resource_packs/elleedog67/entity/<id>/`, and so on.
- Only vanilla replacements go under an `overrides/` folder, and think twice before adding one:
  a second override of the same vanilla file cannot coexist.
- Textures keep the exact path referenced from JSON (`textures/items/<name>.png`).
- Shared files are hand-maintained unions with a `## <id>` section per feature:
  `texts/en_US.lang` and `texts/en_GB.lang` (keep both identical), `textures/item_texture.json`,
  `textures/terrain_texture.json`, `blocks.json`.
- Namespace everything (`myfeature:thing`). The build rejects duplicate identifiers.

## 4. Tests

- Tests live in `test/features/<id>/*.test.ts` and run with `npm test`.
- `@minecraft/server` and `@minecraft/server-ui` resolve to `test/mocks/*`. The mock exports the
  scheduler (`step`, `ticks`, `flushCurrentTick`), `startup()`, `loadWorld()`, `runCommand()`,
  `addPlayer()`/`joinPlayer()`, `registry`, `dimensions` and `reset()`. Call `reset()` in
  `beforeEach`.
- To exercise the full lifecycle, `bootstrap([feature])` from `src/core/bootstrap.ts`, then
  `startup()` and `loadWorld()`.
- When a `src/` function expects an engine `Player`, pass `engine(mockPlayer)`.
- Assert on behaviour the game would show (messages, properties, entities, drops), not on how
  many lines of code ran. Every feature needs a test that `stop()` leaves no subscriptions or
  intervals behind: `world.afterEvents.x.size` and `system.intervalCount` should return to their
  pre-`start()` values.
- Do not edit `test/mocks/` from a feature branch; extend the mock's exported objects from your
  own test helpers, and raise a gap in the pull request if the mock genuinely lacks something.

## 5. Docs and release notes

- Add a row to the "What disabled means" table in [ARCHITECTURE.md](ARCHITECTURE.md) and a
  section to [FEATURES.md](FEATURES.md) (commands, items, identifiers, known limits).
- Add the manual in-game checks to [TESTING.md](TESTING.md).
- Add a line to `CHANGELOG.md`.

## 6. Verify

```bash
npm run check && npm test && npm run build && npm run package
```

Then import `dist/ElleeDog67_<version>.mcaddon` into a copy of a world and walk the checklist.
