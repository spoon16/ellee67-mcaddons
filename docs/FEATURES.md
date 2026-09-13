# Features

Each feature has its own page with commands, identifiers, what "disabled" means and the manual
in-game checks.

| Id | Title | Page | Default |
|---|---|---|---|
| `pets` | Pets | [pets.md](features/pets.md) | on |
| `stair-sit` | Stair Sitting | [stair-sit.md](features/stair-sit.md) | on |
| `creeper-mod` | Creeper Mod | [creeper-mod.md](features/creeper-mod.md) | on |
| `ender-mod` | Ender Mod | [ender-mod.md](features/ender-mod.md) | on |
| `redstone-guide` | Redstone Guide | [redstone-guide.md](features/redstone-guide.md) | on |
| `rbow-ore` | Rbow Ore | [rbow-ore.md](features/rbow-ore.md) | on (partial toggle) |

## Core commands

| Command | Who | What |
|---|---|---|
| `/elleedog67:features` | anyone | lists the six features and whether each is enabled in this world |
| `/elleedog67:enable <feature>` | operators | turns a feature on; takes effect on the next tick |
| `/elleedog67:disable <feature>` | operators | turns a feature off and restores vanilla behaviour as far as scripts can |
| `/elleedog67:book` | operators | gives the caller an ElleeDog 67 Book |

`<feature>` is one of the ids above. If the game rejects the hyphenated names when the pack loads,
the command accepts them as plain text and `stair_sit` works too.

## The ElleeDog 67 Book

An item that opens a menu with one switch per feature. Players whose gamertag starts with
`ElleeDog` receive one automatically when they join (the list is `BOOK_HOLDER_HANDLES` in
`src/core/config.ts`). Only those players and operators can use it; anyone else who picks one up
is told so. Submitting the menu applies every change at once and reports what changed.

## Feature state

The state lives in the world as dynamic properties named `elleedog67:feature:<id>`, so it survives
rejoins and is per world. A world that has never toggled a feature uses that feature's default.
