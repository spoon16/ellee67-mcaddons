# Testing

## Automated

```bash
npm test          # vitest: the runtime, every feature, and a real build of the packs
npm run check     # TypeScript and Biome
npm run codegen   # regenerates generated files; CI fails if that changes anything
npm run test:engine   # boots every pack in Bedrock Dedicated Server; CI runs it on every push
```

`@minecraft/server` and `@minecraft/server-ui` are replaced by `test/mocks/` during tests. The mock
models the scheduler (`step`, `ticks`, `flushCurrentTick`), event signals, the command and item
component registries, players with inventories, dimensions with blocks and entities, and the
`EntityTypes` and `ItemTypes` lookups. It also enforces two rules the engine enforces: a script
module's commands and enums share one namespace, and a signal whose `subscribe` takes one argument
rejects a second. The form mock records headers, labels, dividers, body text and buttons. It is a
test double, not the engine: it proves that the scripts wire up, schedule and clean up as designed,
and that the pack JSON is structurally sound. It cannot prove rendering, animation, touch UI,
networking, chunk generation or Bedrock's real command parser.

`test/core` covers `runFeature` (register at startup, start at world load, errors isolated and
logged) and `FeatureContext` (subscriptions, intervals and cleanups all undone by `dispose()`,
options forwarded only when given), plus the two engine rules above.

`test/pack/build.test.ts` builds `dist/` for real and validates it: ten manifests that match
`packs.json` with every behavior pack depending only on its own resource pack, one script bundle
per behavior pack importing exactly the engine modules its manifest declares, no controller
leftovers and no other feature's commands in any bundle, license and notices in every pack, the
player override byte-identical in Pets and Rbow Ore, the standalone Rbow attachables in the Rbow
Ore resource pack, every manifest on the `package.json` version, and a deterministic `.mcaddon`
whose top-level folders are exactly the ten `archiveDir` names.

The Pets compiler's own 244 Python tests run as part of `npm run codegen`.

### In the engine: `npm run test:engine`

The mock cannot see argument counting at the native boundary, the one-namespace rule, or whether a
pack's JSON loads. Bedrock Dedicated Server can, and it runs headlessly on Linux. `tools/bds/`:

- `setup.ts` downloads the pinned server version (`BDS_VERSION`, kept in step with
  `min_engine_version`) into `.bds/` once, with the browser user agent Mojang's CDN wants, unpacks
  it, writes `server.properties` for a headless run with the Content Log on stdout, copies `dist/`
  into the server's pack folders and creates a fresh world with all ten packs in its stack. Where
  the machine has no IPv6 (some containers) it builds and preloads `no-ipv6.c`, because the server
  refuses to start without an IPv6 socket.
- `run.ts` starts the server, waits for `Server started.`, types commands into its console and
  stops it.
- `smoke.ts` (the `test:engine` script) builds the packs, runs the server, and checks: every
  behavior pack in the pack stack, a `[ElleeDog 67] <id> loaded` line per script pack, no
  `[Scripting]` warning or error and a clean Content Log (the vanilla `help`/`clear` alias notices
  for `sit:help` and `sit:clear` are expected), and one command per namespace (`/pet:forms`,
  `/sit:help`, `/elleedog:ender_protect list`) answered by the add-on's own "run this as a player"
  reply rather than "Unknown command". About 25 seconds; a failing run leaves the full output in
  `.bds/last-run.log`.

The server is never committed: the Minecraft EULA lets you run it, not redistribute it. CI
downloads it too (cached by version). The next rung, GameTests with simulated players on a
Beta-APIs world, is described in [ECOSYSTEM.md](ECOSYSTEM.md).

## Manual, in Minecraft

Nothing in this repository has been played on a real device yet. Before calling a version good,
walk this list on a copy of a world. It is organised by activation combination, because which
packs are active is what changes between steps. Each feature page under `docs/features/` has its
own detailed checks; run them at the step that activates the feature. Packs are changed in Edit
World, so every step that changes them ends with reopening the world.

1. **Import.** Back up the world. Import the `.mcaddon` into a copy; the import reports ten packs.
   Keep the Content Log open for the whole session.
2. **Stair Sitting and Creeper Mod.** Activate "ElleeDog 67 Stair Sitting" (its resource pack is
   added) and "ElleeDog 67 Creeper Mod". Deactivate every old ElleeDog pack (old Pets before old
   Rbow; see [RELEASING.md](RELEASING.md)). Open the world.
   - The Content Log shows `[ElleeDog 67] stair-sit loaded` and `[ElleeDog 67] creeper-mod loaded`
     and no script errors. `/sit:help` lists the controls; `/pet:form carter` is an unknown
     command because the Pets pack is not active.
   - Run the checks on [features/stair-sit.md](features/stair-sit.md) and
     [features/creeper-mod.md](features/creeper-mod.md).
3. **Plus Pets.** Edit World, activate "ElleeDog 67 Pets": "ElleeDog 67 Pets Resources" is added.
   Reopen. `[ElleeDog 67] pets loaded` appears and `/pet:form carter` works. Run the checks on
   [features/pets.md](features/pets.md), including the armor fit steps (4 and 5) and the seated
   pose step (9). Watch the Content Log for missing texture messages: the Pets renderer has texture
   slots for Rbow items that point at files only the Rbow Ore resource pack has, and they are
   expected to stay silent while no Rbow item exists. Record anything that appears.
4. **Plus Rbow Ore, Pets off.** Deactivate "ElleeDog 67 Pets" and "ElleeDog 67 Pets Resources",
   activate "ElleeDog 67 Rbow Ore" ("ElleeDog 67 Rbow Ore Resources" is added). Reopen. The player
   renders as vanilla; Rbow armor and the spear render with the standalone attachables. Run the
   checks on [features/rbow-ore.md](features/rbow-ore.md).
5. **Plus both.** Activate "ElleeDog 67 Pets" again with Rbow Ore active. Confirm "ElleeDog 67 Pets
   Resources" sits above "ElleeDog 67 Rbow Ore Resources"; move it if not. Reopen. As a pet, wear a
   full Rbow set and hold the spear: fitted shapes, paw height 2, `/pet:rbowcheck` reports READY.
   Sit on a stair, a boat and a pig as a pet and check the pose.
6. **Plus Ender Mod.** Activate "ElleeDog 67 Ender Mod" (no resource pack is added). Reopen.
   `[ElleeDog 67] ender-mod loaded`. Run the checks on [features/ender-mod.md](features/ender-mod.md).
7. **Plus Redstone Guide.** Activate "ElleeDog 67 Redstone Guide" ("ElleeDog 67 Redstone Guide
   Resources" is added). Reopen. `[ElleeDog 67] redstone-guide loaded`. Run the checks on
   [features/redstone-guide.md](features/redstone-guide.md).
8. **Deactivating Pets.** With everything active and a player transformed into Carter, deactivate
   "ElleeDog 67 Pets" and "ElleeDog 67 Pets Resources". Reopen: the player renders as vanilla,
   `/pet:form carter` is an unknown command, and the Pet Morpher in the inventory shows as an
   unknown item. Reactivate both packs and reopen: the player is Carter again on join without a
   chat line and the morpher is back.
9. **Quiet join.** Rejoin the world with every pack active and confirm nothing was announced in
   chat on join except Stair Sitting's one-line hint (Pets is designed to be silent on lifecycle
   events) and the Content Log shows no script errors, missing assets or raw translation keys.

Record the Bedrock version, device, pack version, the active pack list and order, cheats setting,
reproduction steps, expected versus actual, and any Content Log errors.
