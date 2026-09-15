# Releasing

Every push to `main` builds the add-on and attaches `ElleeDog67_<version>.mcaddon` to the CI run as
an artifact. A tag turns that into a GitHub Release, which is the easiest place to download from
on an iPad.

## Cut a release

```bash
npm run bump -- 0.3.0     # updates package.json and all ten manifests, commits, tags v0.3.0
git push --follow-tags
```

`npm run bump` runs `npm version`, whose `version` hook regenerates every `manifest.json` from
`packs.json` with the new version (header, modules and dependency versions) and stages the pack
directories. The Release workflow checks that the tag matches `package.json`, builds, tests,
packages and uploads the `.mcaddon` and `SHA256SUMS.txt`.

Every build that ships must carry a higher version than the last one anyone imported: Minecraft
replaces an already imported pack only when the incoming version is higher, and silently keeps the
old one otherwise. Add a `CHANGELOG.md` entry before bumping.

## Install on an iPad (or any Bedrock device)

1. Back up the world first: Settings, Game, Export (or copy the world in the Files app).
2. Open the GitHub Release in Safari and download `ElleeDog67_<version>.mcaddon`.
3. Tap the downloaded file. Minecraft imports the ten packs in one go and reports "Import
   Complete".
4. Edit the world. Under Behavior Packs, activate the features you want. A pack with a resource
   pack adds it on its own:

   | Feature | Activate under Behavior Packs | Added automatically |
   |---|---|---|
   | Pets | ElleeDog 67 Pets | ElleeDog 67 Pets Resources |
   | Rbow Ore | ElleeDog 67 Rbow Ore | ElleeDog 67 Rbow Ore Resources |
   | Ender Mod | ElleeDog 67 Ender Mod | nothing (no resource pack) |
   | Redstone Guide | ElleeDog 67 Redstone Guide | ElleeDog 67 Redstone Guide Resources |
   | Stair Sitting | ElleeDog 67 Stair Sitting | ElleeDog 67 Stair Sitting Resources |
   | Creeper Mod | ElleeDog 67 Creeper Mod | nothing (scripts only) |

5. Check the order. Drag the lists to read, top to bottom:

   | Behavior Packs | Resource Packs |
   |---|---|
   | ElleeDog 67 Pets | ElleeDog 67 Pets Resources |
   | ElleeDog 67 Rbow Ore | ElleeDog 67 Rbow Ore Resources |
   | ElleeDog 67 Ender Mod | ElleeDog 67 Redstone Guide Resources |
   | ElleeDog 67 Redstone Guide | ElleeDog 67 Stair Sitting Resources |
   | ElleeDog 67 Stair Sitting | |
   | ElleeDog 67 Creeper Mod | |

   Behavior pack order never matters (Pets and Rbow Ore ship an identical player override). On the
   resource side one line matters: "ElleeDog 67 Pets Resources" stays above "ElleeDog 67 Rbow Ore
   Resources" (both define the Rbow armor and spear attachables; the pet-aware versions must win).
   Any other pack that replaces the player or Endermen goes below the ElleeDog packs, or is
   removed: two packs cannot both replace `minecraft:player` or `minecraft:enderman`.
6. Leave and reopen the world. Each active feature announces itself in the Content Log
   (`[ElleeDog 67] <id> loaded`) and its commands exist: `/pet:book`, `/sit:help`,
   `/elleedog:ender_protect list`.

## Updating a world to a newer version

Import the new `.mcaddon`. Its version is higher, so every pack replaces the previous import in
place; the uuids never change, so the world keeps its packs active and keeps its settings. Open the
world settings once and confirm the activated packs show the new version (Minecraft keeps an older
import if the version was not higher).

## Migration

### From 0.2.x

0.2.x had two core packs, "ElleeDog 67 (Behavior)" and "ElleeDog 67 (Resources)", which carried
every script, the ElleeDog 67 Manual, Stair Sitting and Creeper Mod. 0.3.0 has no core: each
feature's behavior pack carries its own scripts, and Stair Sitting and Creeper Mod are packs of
their own. The core packs are not updated by the import (their uuids are retired) and must be
removed by hand.

1. Back up the world.
2. Import 0.3.0. The Pets, Rbow Ore, Ender Mod and Redstone Guide packs update in place (their
   uuids are unchanged and the version is higher).
3. Edit the world and deactivate "ElleeDog 67 (Behavior)" and "ElleeDog 67 (Resources)". If the
   game refuses because another pack depends on them, deactivate that pack first, then reactivate
   it after.
4. Activate "ElleeDog 67 Stair Sitting" and "ElleeDog 67 Creeper Mod" if the world used them.
5. Reopen the world. The ElleeDog 67 Manual item in inventories is gone (it shows as an unknown
   item until dropped); the `elleedog67:feature:*` world flags 0.2.x wrote are ignored. Everything
   else carries over: pet preferences and seat trims (`pet:*` player properties), stair seat
   settings (`sit:*` player properties), placed Rbow ore, Rbow items in chests, Ender Mod regions and
   placement records, and Redstone Guide bookmarks. The Pets "Paw Menu" token was removed in 0.3.0;
   any left in inventories show as unknown items, and the Pet Morpher book (`/pet:book`) is the way
   into the menu.

### From the six standalone packs

The original packs (Pets 0.5.2, Rbow Ore 1.2.3, Stair Sitting 0.2.1, Creeper Mod 1.2.0,
Ender Mod 1.0.1, Redstone Guide 1.0.3) have their own uuids and stay imported until you deactivate
them.

1. Back up the world.
2. Edit the world and deactivate the old packs. **Deactivate old Pets before old Rbow**: old Pets
   depends on old Rbow, and the game refuses to remove a pack another active pack depends on.
   Deactivate every old ElleeDog behavior pack and resource pack.
3. Activate the ElleeDog 67 packs for the features the world used (the table above).
4. Reopen the world.

Identifiers are unchanged, so everything carries over once the matching pack is active: pet
preferences and seat trims (`pet:*` player properties), stair seat settings (`sit:*` player
properties), placed Rbow ore, Rbow items in chests, Ender Mod regions and placement records, and
Redstone Guide bookmarks.

### From 0.1.0

Follow "From 0.2.x" above: 0.1.0's core packs share the retired 0.2.x uuids. **Activate "ElleeDog
67 Rbow Ore" before opening any world that ever had Rbow ore.** Placed ore, Rbow items in chests
and the legacy drop entities that hold old items are all definitions the world needs the pack for;
opening the world without it puts them at risk.
