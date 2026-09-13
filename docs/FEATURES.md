# Features

Each feature has its own page with commands, identifiers, what "off" means and the manual in-game
checks.

| Id | Title | Kind | Packs | Page |
|---|---|---|---|---|
| `pets` | Pets | pack | ElleeDog 67 Pets, ElleeDog 67 Pets Resources | [pets.md](features/pets.md) |
| `stair-sit` | Stair Sitting | switch, on by default | core | [stair-sit.md](features/stair-sit.md) |
| `creeper-mod` | Creeper Mod | switch, on by default | core | [creeper-mod.md](features/creeper-mod.md) |
| `ender-mod` | Ender Mod | pack | ElleeDog 67 Ender Mod | [ender-mod.md](features/ender-mod.md) |
| `redstone-guide` | Redstone Guide | pack | ElleeDog 67 Redstone Guide, ElleeDog 67 Redstone Guide Resources | [redstone-guide.md](features/redstone-guide.md) |
| `rbow-ore` | Rbow Ore | pack | ElleeDog 67 Rbow Ore, ElleeDog 67 Rbow Ore Resources | [rbow-ore.md](features/rbow-ore.md) |

"Core" means the two packs every world has: "ElleeDog 67 (Behavior)" and "ElleeDog 67 (Resources)".

## Two kinds of feature

- A **switch** feature is script only. It lives in the core packs and is on or off per world. Turn
  it from the manual (ElleeDog and operators) or with `/elleedog67:enable` and
  `/elleedog67:disable`. A world that has never touched it has it on.
- A **pack** feature carries data the game cannot unload: a player or Enderman override, blocks,
  items, recipes. It is active exactly when its packs are active in Edit World and off otherwise.
  There is no runtime switch. `/elleedog67:enable` and `/elleedog67:disable` reply with the packs
  to activate or deactivate and change nothing.

## State words

The manual's Home page and `/elleedog67:features` use four words:

| State | Kind | Meaning |
|---|---|---|
| on | switch | the feature is running in this world |
| off | switch | the world flag is off and the feature is stopped |
| active | pack | the feature's packs are active in this world and the feature is running |
| packs off | pack | the feature's packs are not active; the hint names the packs to activate |

`/elleedog67:features` prints one line per feature, `<id>: <state>`, and appends the activation
hint to "packs off" lines, for example:

```
pets: packs off (Pets is turned on by activating "ElleeDog 67 Pets" (Behavior Packs) in Edit World. Its resource pack is added automatically.)
```

The manual marks its Home buttons `[ON]`, `[OFF]`, `[ACTIVE]` and `[PACKS OFF]`.

## Core commands

| Command | Who | What |
|---|---|---|
| `/elleedog67:features` | anyone | lists the six features with their state and, for inactive pack features, the pack hint |
| `/elleedog67:enable <feature>` | operators | switch features: turns the feature on, effective on the next tick. Pack features: replies with the packs to activate and changes nothing |
| `/elleedog67:disable <feature>` | operators | switch features: turns the feature off and restores vanilla behaviour. Pack features: replies with the packs to deactivate |
| `/elleedog67:book` | operators | gives the caller an ElleeDog 67 Manual |

No core command needs cheats. `<feature>` is one of the ids above. If the game rejects the
hyphenated names when the pack loads, the command accepts them as plain text and `stair_sit` works
too.

A feature's own commands (`/sit:*`, `/pet:*`, `/elleedog:ender_protect`) refuse while the feature
is off. A switch feature answers "X is disabled. An operator can run /elleedog67:enable x."; a pack
feature answers "X is not active." followed by the pack hint.

## The ElleeDog 67 Manual

The in-game manual. Players whose gamertag starts with `ElleeDog` receive one when they join (the
list is `BOOK_HOLDER_HANDLES` in `src/core/config.ts`); operators get one with `/elleedog67:book`.
Anyone holding a book can open and read it. Pages:

- **Home**: one button per feature with its state marker, then "Setup and packs" and
  "Commands".
- **Feature page**: what the feature does, its current state, and how to turn it on or off. Switch
  features show Turn on or Turn off to ElleeDog and operators only. Pack features name the exact
  packs to activate or deactivate in Edit World and say what stays in the world afterwards.
- **Setup and packs**: the nine packs and what each turns on, that activating a companion
  pulls in its resource pack and the core, that Pets and Rbow Ore work in any combination, the two
  ordering rules and the update rule.
- **Commands**: the core commands and every feature's commands.

## Where the state lives

A switch feature stores its setting as the world dynamic property `elleedog67:feature:<id>`, so it
survives rejoins and is per world. A pack feature has no stored setting: once after world load the
scripts probe for a definition only its packs provide (`EntityTypes.get` or `ItemTypes.get`) and
remember the answer until the next world load. Packs are changed in Edit World, which always
reloads the world, so the probe is never stale.
