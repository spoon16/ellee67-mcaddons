# Features

Each feature has its own page with commands, identifiers, what deactivating its packs means and the
manual in-game checks.

| Id | Title | Packs | Page |
|---|---|---|---|
| `pets` | Pets | ElleeDog 67 Pets, ElleeDog 67 Pets Resources | [pets.md](features/pets.md) |
| `stair-sit` | Stair Sitting | ElleeDog 67 Stair Sitting, ElleeDog 67 Stair Sitting Resources | [stair-sit.md](features/stair-sit.md) |
| `creeper-mod` | Creeper Mod | ElleeDog 67 Creeper Mod | [creeper-mod.md](features/creeper-mod.md) |
| `ender-mod` | Ender Mod | ElleeDog 67 Ender Mod | [ender-mod.md](features/ender-mod.md) |
| `redstone-guide` | Redstone Guide | ElleeDog 67 Redstone Guide, ElleeDog 67 Redstone Guide Resources | [redstone-guide.md](features/redstone-guide.md) |
| `rbow-ore` | Rbow Ore | ElleeDog 67 Rbow Ore, ElleeDog 67 Rbow Ore Resources | [rbow-ore.md](features/rbow-ore.md) |

## How a feature is switched

A feature is on exactly when its behavior pack is active in Edit World, and off otherwise. There is
no runtime switch, no central pack and no controller command: each behavior pack carries its own
scripts, and activating it adds its resource pack (if it has one) automatically. Packs are changed
in Edit World, which reloads the world, so a feature is either fully present or entirely absent.

Any subset of the six packs works in any combination. The two ordering rules are in
[RELEASING.md](RELEASING.md).

## Commands

Every command is registered by its feature's own pack under that feature's namespace, none needs
cheats, and each is documented on the feature's page:

| Namespace | Feature | Examples |
|---|---|---|
| `pet:` | Pets | `/pet:book`, `/pet:form carter`, `/pet:menu`, `/pet:armor fitted` |
| `sit:` | Stair Sitting | `/sit:down`, `/sit:stand`, `/sit:help`, `/sit:clear` (operators) |
| `elleedog:` | Ender Mod | `/elleedog:ender_protect pos1|pos2|name "…"|list|remove "…"` (operators) |
| | Rbow Ore | `/scriptevent elleedog:rbow_check`, `/function elleedog/rbow_test_kit` |
| | Redstone Guide, Creeper Mod | none; the guide is an item, the creeper change is automatic |

A pack's commands exist only while that pack is active: with the pack off, the game reports the
command as unknown.

## Where the state lives

Nothing is stored about which feature is on: the world's pack list is the state. Per-player
settings (pet choices, seat trims, sitting preferences, guide bookmarks) are player properties and
world properties owned by each feature; they survive the pack being deactivated and apply again
when it is back. See each feature page.
