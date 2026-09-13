# Testing

## Automated

```bash
npm test          # vitest: core, every feature, and a real build of the packs
npm run check     # TypeScript and Biome
npm run codegen   # regenerates generated files; CI fails if that changes anything
```

`@minecraft/server` and `@minecraft/server-ui` are replaced by `test/mocks/` during tests. The mock
models the scheduler (`step`, `ticks`, `flushCurrentTick`), event signals, the command and item
component registries, players with inventories, dimensions with blocks and entities, and the
`EntityTypes` and `ItemTypes` lookups behind the pack probes (`registerEntityType`,
`registerItemType`, cleared by `reset()`), so a suite can simulate present and absent packs. The
form mock records headers, labels, dividers, body text and buttons, so manual pages can be
asserted. It is a test double, not the engine: it proves that the scripts wire up, cancel, schedule
and clean up as designed, and that the pack JSON is structurally sound. It cannot prove rendering,
animation, touch UI, networking, chunk generation or Bedrock's real command parser.

`test/core` covers the registry and the manual: pack features start only when their probe finds
the packs and are skipped without `stop()` when it does not, orphaned 0.1.0 switch properties are
removed, switch features toggle and settle, `/elleedog67:enable` on a pack feature returns the pack
hint, a gated `pet:` command refuses with the hint when the packs are absent, the Home page lists
every feature with the right state marker, each feature page names its packs, the setup page
states the two ordering rules, a stranger can read pages but gets no switch button, and ElleeDog
can switch a switch feature from its page.

`test/pack/build.test.ts` builds `dist/` for real and validates it: nine manifests that match
`packs.json` with the dependency graph the manual describes (every companion behavior pack depends
on its resource pack and the core; Pets and Rbow Ore are independent), one script bundle in the
core only that imports nothing but the engine modules, license and notices in every pack, the
player override byte-identical in Pets and Rbow Ore, the standalone Rbow attachables in the Rbow
Ore resource pack, every manifest on the `package.json` version, and a deterministic `.mcaddon`
whose top-level folders are exactly the nine `archiveDir` names.

The Pets compiler's own 243 Python tests run as part of `npm run codegen`.

## Manual, in Minecraft

Nothing in this repository has been run in Minecraft yet. Before calling a version good, walk this
list on a copy of a world. It is organised by activation combination, because which packs are
active is what changes between steps. Each feature page under `docs/features/` has its own detailed
checks; run them at the step that activates the feature. Packs are changed in Edit World, so every
step that changes them ends with reopening the world.

1. **Import.** Back up the world. Import the `.mcaddon` into a copy; the import reports nine packs.
   Keep the Content Log open for the whole session.
2. **Core only.** Activate "ElleeDog 67 (Behavior)" and confirm "ElleeDog 67 (Resources)" was
   added. Deactivate every old ElleeDog pack (old Pets before old Rbow). Open the world.
   - `/elleedog67:features` shows `stair-sit: on`, `creeper-mod: on`, and `pets`, `rbow-ore`,
     `ender-mod` and `redstone-guide` as `packs off`, each with its activation hint. If the list
     does not appear, look in the content log for a `registerEnum` error: that means the
     hyphenated ids were rejected and the text fallback is in use (still fine), or the whole
     script failed (not fine).
   - Join as a player named ElleeDog: the ElleeDog 67 Book appears in the inventory, with the lore
     "The ElleeDog 67 manual." Use it: Home lists six features, marked `[ON]` for Stair Sitting
     and Creeper Mod and `[PACKS OFF]` for the other four, then "Setup and packs" and
     "Commands". Open each page. The Pets page names "ElleeDog 67 Pets" and "ElleeDog 67 Pets
     Resources"; the setup page states the two ordering rules.
   - With cheats off, open the Creeper Mod page and press Turn off. `/elleedog67:features` says
     `creeper-mod: off` and the Home button reads `[OFF]`. Press Turn on. Leave and rejoin: the
     setting persisted.
   - As a non-host operator, run `/elleedog67:disable creeper-mod` and
     `/elleedog67:enable creeper-mod`. Run `/elleedog67:enable pets`: the reply is the pack hint and
     nothing changes.
   - As a player who is neither ElleeDog nor an operator, pick up a dropped book: the manual opens
     and every page can be read, but no feature page shows Turn on or Turn off.
   - `/pet:form carter` replies "Pets is not active." followed by the pack hint.
   - Run the checks on [features/stair-sit.md](features/stair-sit.md) and
     [features/creeper-mod.md](features/creeper-mod.md).
3. **Plus Pets.** Edit World, activate "ElleeDog 67 Pets": "ElleeDog 67 Pets Resources" is added.
   Reopen. `/elleedog67:features` says `pets: active` and Home reads `[ACTIVE] Pets`.
   `/pet:form carter` works. Run the checks on [features/pets.md](features/pets.md), including the
   armor fit steps (4 and 5) and the seated pose step (9). Watch the content log for missing
   texture messages: the Pets renderer has texture slots for Rbow items that point at files only the
   Rbow Ore resource pack has, and they are expected to stay silent while no Rbow item exists.
   Record anything that appears.
4. **Plus Rbow Ore, Pets off.** Deactivate "ElleeDog 67 Pets" and "ElleeDog 67 Pets Resources",
   activate "ElleeDog 67 Rbow Ore" ("ElleeDog 67 Rbow Ore Resources" is added). Reopen.
   `rbow-ore: active`, `pets: packs off`. The player renders as vanilla; Rbow armor and the spear
   render with the standalone attachables. Run the checks on
   [features/rbow-ore.md](features/rbow-ore.md).
5. **Plus both.** Activate "ElleeDog 67 Pets" again with Rbow Ore active. Confirm "ElleeDog 67 Pets
   Resources" sits above "ElleeDog 67 Rbow Ore Resources"; move it if not. Reopen. Both read
   active. As a pet, wear a full Rbow set and hold the spear: fitted shapes, paw height 2,
   `/pet:rbowcheck` reports READY. Sit on a stair, a boat and a pig as a pet and check the pose.
6. **Plus Ender Mod.** Activate "ElleeDog 67 Ender Mod" (no resource pack is added). Reopen.
   `ender-mod: active`. Run the checks on [features/ender-mod.md](features/ender-mod.md).
7. **Plus Redstone Guide.** Activate "ElleeDog 67 Redstone Guide" ("ElleeDog 67 Redstone Guide
   Resources" is added). Reopen. `redstone-guide: active`. Run the checks on
   [features/redstone-guide.md](features/redstone-guide.md).
8. **Deactivating Pets.** With everything active and a player transformed into Carter, deactivate
   "ElleeDog 67 Pets" and "ElleeDog 67 Pets Resources". Reopen: the player renders as vanilla,
   `pets: packs off`, Home reads `[PACKS OFF] Pets`, `/pet:form carter` replies with the pack hint,
   and the Pet Morpher in the inventory shows as an unknown item. Reactivate both packs and reopen:
   the player is Carter again on join without a chat line and the morpher is back.
9. **Quiet join.** Rejoin the world with every pack active and confirm nothing was announced in
   chat on join (Pets is designed to be silent on lifecycle events) and the content log shows no
   script errors, missing assets or raw translation keys.

Record the Bedrock version, device, pack version, the active pack list and order, cheats setting,
reproduction steps, expected versus actual, and any Content Log errors.
