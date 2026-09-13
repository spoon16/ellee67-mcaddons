# Releasing

Every push to `main` builds the add-on and attaches `ElleeDog67_<version>.mcaddon` to the CI run as
an artifact. A tag turns that into a GitHub Release, which is the easiest place to download from
on an iPad.

## Cut a release

```bash
npm run bump -- 0.2.0     # updates package.json and all nine manifests, commits, tags v0.2.0
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
3. Tap the downloaded file. Minecraft imports the nine packs in one go and reports "Import
   Complete".
4. Edit the world. Under Behavior Packs, activate "ElleeDog 67 (Behavior)". "ElleeDog 67
   (Resources)" is added on its own because the behavior pack depends on it.
5. Activate the optional packs you want. Activating a companion adds its resource pack and the core:

   | Feature | Activate under Behavior Packs | Added automatically |
   |---|---|---|
   | Pets | ElleeDog 67 Pets | ElleeDog 67 Pets Resources, the core |
   | Rbow Ore | ElleeDog 67 Rbow Ore | ElleeDog 67 Rbow Ore Resources, the core |
   | Ender Mod | ElleeDog 67 Ender Mod | the core (no resource pack) |
   | Redstone Guide | ElleeDog 67 Redstone Guide | ElleeDog 67 Redstone Guide Resources, the core |

   Stair Sitting and Creeper Mod come with the core and are switched in game.
6. Check the order. The game orders dependencies itself, so there are only two rules:
   - "ElleeDog 67 Pets Resources" stays above "ElleeDog 67 Rbow Ore Resources" (both define the
     Rbow armor and spear attachables; the pet-aware versions must win).
   - Any other pack that replaces the player or Endermen goes below the ElleeDog packs, or is
     removed. Two packs cannot both replace `minecraft:player` or `minecraft:enderman`.
7. Leave and reopen the world. Run `/elleedog67:features`: Stair Sitting and Creeper Mod are on,
   and each optional feature reads active or packs off according to what you activated. The
   ElleeDog 67 Book says the same and names the packs for anything still off.

## Updating a world to a newer version

Import the new `.mcaddon`. Its version is higher, so every pack replaces the previous import in
place; the uuids never change, so the world keeps its packs active and keeps its settings. Open the
world settings once and confirm the activated packs show the new version (Minecraft keeps an older
import if the version was not higher).

## Migration

### From the six standalone packs

The original packs (Pets 0.5.2, Rbow Ore 1.2.3, Stair Sitting 0.2.1, Creeper Mod 1.2.0,
Ender Mod 1.0.1, Redstone Guide 1.0.3) have their own uuids and stay imported until you deactivate
them.

1. Back up the world.
2. Edit the world and deactivate the old packs. **Deactivate old Pets before old Rbow**: old Pets
   depends on old Rbow, and the game refuses to remove a pack another active pack depends on.
   Deactivate every old ElleeDog behavior pack and resource pack.
3. Activate "ElleeDog 67 (Behavior)" and the companions for the features the world used (the
   table above).
4. Reopen the world.

Identifiers are unchanged, so everything carries over once the matching companion is active: pet
preferences and seat trims (`pet:*` player properties), stair seat settings (`sit:*` player
properties), placed Rbow ore, Rbow items in chests, Ender Mod regions and placement records, and
Redstone Guide bookmarks.

### From 0.1.0

The core packs keep their 0.1.0 uuids, so importing 0.2.0 updates them in place and the world
keeps them active. What 0.1.0 shipped inside the core now lives in the companions, so:

1. Back up the world.
2. Import 0.2.0 and confirm "ElleeDog 67 (Behavior)" shows the new version.
3. Activate the companions you want.
4. **Activate "ElleeDog 67 Rbow Ore" before opening any world that ever had Rbow ore.** Placed ore,
   Rbow items in chests and the legacy drop entities that hold old items are all definitions the
   world needs the pack for; opening the world without it puts them at risk.
5. Reopen the world. The stored switch settings 0.1.0 wrote for Pets, Rbow Ore, Ender Mod and
   Redstone Guide are deleted on load; the packs decide now. Stair Sitting and Creeper Mod keep
   their 0.1.0 settings.
