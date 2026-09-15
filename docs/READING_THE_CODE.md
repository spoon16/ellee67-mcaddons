# Reading the code

A tour for someone opening the code for the first time: what the words mean, which files to read in
which order, and the few patterns that show up everywhere. The other docs assume this page.

## What you are looking at

A Minecraft Bedrock add-on is a set of packs. A **behavior pack** changes how the game behaves (new
items, new entities, scripts). A **resource pack** changes how things look (models, textures, text).
This repository builds six features, each its own behavior pack, and ships them all in one `.mcaddon`
file.

The scripts are written in TypeScript, in `src/`. TypeScript is JavaScript with types: notes about
what kind of value each variable holds, checked before the game ever runs the code. The build turns
each feature's TypeScript into one JavaScript file (`scripts/main.js` inside its pack) that Minecraft
runs.

## Words you will meet

| Word | Meaning here |
|---|---|
| tick | Minecraft's heartbeat. The world updates 20 times a second and each update is one tick, so timers count in ticks and 20 ticks is one second. |
| event | Something the game announces: a player broke a block, an explosion is about to happen. A script *subscribes* to an event to be called each time it happens. |
| before-event, after-event | `world.beforeEvents.*` fire before the game acts; a handler may cancel the action but may not change the world. `world.afterEvents.*` fire afterwards and may change anything. |
| entity | Anything in the world that is not a block: a player, a creeper, a boat, an item on the ground, and the invisible helpers some features spawn. |
| dimension | One of the three worlds: the Overworld, the Nether and the End. Entities live in exactly one. |
| block, permutation, state | A block is one cube of the world. Its permutation is its type plus its states, the small settings such as which way a stair faces or whether a campfire is lit. |
| component | A named part of an entity or item that adds a capability: `minecraft:rideable`, `minecraft:inventory`, `minecraft:durability`. Scripts ask for one with `getComponent`. |
| entity property | A value declared in an entity's JSON and sent to every player's screen; what the renderer reads. Written with `setProperty`. |
| dynamic property | Free-form storage on a player, an entity or the world, saved with the world. Invisible to the renderer. Written with `setDynamicProperty`. |
| namespace | The part before the colon in an id: `pet:form`, `sit:seat`, `elleedog:rbow_ore`. Every command one pack registers shares one namespace. |
| Content Log | The in-game log (Settings, then Creator) where scripts print warnings. Every line from this add-on starts with `[ElleeDog 67]`. |

## Where to start reading

1. `src/packs/creeper-mod.ts`: the smallest entry point. A few lines: load a polyfill, import a
   feature, run it.
2. `src/core/feature.ts`: `runFeature`, the two-step start every feature goes through.
3. `src/core/subscriptions.ts`: `FeatureContext`, how a feature listens to events and sets timers.
4. `src/features/creeper-mod/`: the smallest feature. `index.ts` is the definition, `blast.ts` the
   logic.
5. `src/features/redstone-guide/`: a feature with a menu. `reader.ts` is pure logic, `index.ts` the
   engine side.
6. `src/features/ender-mod/`: a feature with saved data and a command.
7. `src/features/stair-sit/`: the largest hand-written feature. Read the header of `index.ts` first.
8. `src/features/pets/`: the biggest. Read the header of `core.ts` first; `main.ts` is the glue.

Every file starts with a comment saying what it is for and how it connects to its neighbours. The
pages in `docs/features/` say what each feature does from the player's side.

## Patterns that show up everywhere

**Capture now, change later.** Before-events and command callbacks are read-only. So a handler
decides what to do, remembers plain values (never the event object itself), and schedules the change
with `system.run`. When that runs a tick later it re-checks that the world still looks the way it did.
`onPlayerInteractWithBlock` in `src/features/rbow-ore/main.ts` is a worked example.

**Pure logic in one file, engine glue in another.** `blast.ts`, `reader.ts`, `rules.ts`, `stairs.ts`,
`gate.ts` and `geometry.ts` never import the engine, so `npm test` can run them in plain Node with
simple objects. The `index.ts` or `main.ts` beside them reads the engine, calls them, and applies the
answer.

**Fail safe.** Every engine call that can throw sits in a `try`. Small helpers answer "no" instead of
crashing (`valid`, `readStair`, `ridingEntity`), a broken store denies rather than allows (Ender Mod),
and a feature that throws while starting is logged and undone rather than left half-running.

**Say it once.** Loops run every tick, and a warning inside one would flood the log. `warnOnce` and
`throttled` from `src/core/log.ts` say a thing once, or once per interval.

**Explain the number.** A value like `0.09` on its own says nothing. The code names it
(`MAX_SEAT_DRIFT_SQUARED`) or comments it where it lives, and keeps a feature's tuning values together
(`src/features/stair-sit/config.ts`).

## Trying things

- `npm test` runs every unit test in a few seconds against a fake engine (`test/mocks/`). Change a
  number in `blast.ts`, run it, and see which test notices.
- `npm run check` finds type errors and style problems before the game would.
- `npm run build` writes the packs to `dist/`; open any pack's `scripts/main.js` there to see what the
  TypeScript became.
- `npm run test:engine` starts a real Minecraft server on this machine and loads every pack into it.

The full developer reference is [DEVELOPING.md](DEVELOPING.md); how the packs fit together is
[ARCHITECTURE.md](ARCHITECTURE.md).
