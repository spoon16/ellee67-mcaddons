# Releasing

Every push to `main` builds the add-on and attaches `ElleeDog67_<version>.mcaddon` to the CI run as
an artifact. A tag turns that into a GitHub Release, which is the easiest place to download from
on an iPad.

## Cut a release

```bash
npm run bump -- 0.2.0     # updates package.json and both manifests, commits, tags v0.2.0
git push --follow-tags
```

`npm run bump` runs `npm version`, whose `version` hook rewrites `header.version`, every module
version and the behavior pack's dependency on the resource pack. The Release workflow checks that
the tag matches `package.json`, builds, tests, packages and uploads `.mcaddon`, both `.mcpack`
files and `SHA256SUMS.txt`.

Add a `CHANGELOG.md` entry before bumping.

## Install on an iPad (or any Bedrock device)

1. Back up the world first: Settings, Game, Export (or copy the world in the Files app).
2. Open the GitHub Release in Safari and download `ElleeDog67_<version>.mcaddon`.
3. Tap the downloaded file; Minecraft imports both packs and reports "Import Complete".
4. Edit the world: under Behavior Packs, activate "ElleeDog 67 (Behavior)". The resource pack is
   pulled in automatically because the behavior pack depends on it.
5. **Deactivate the six old packs** if the world had them (Pets, Rbow, Stair Sitting, Creeper,
   Ender, Redstone Guide). Two packs that replace `minecraft:player` or `minecraft:enderman`
   cannot both be active.
6. Leave and reopen the world. Run `/elleedog67:features` to confirm the six features are listed.

Player settings from the old packs carry over (pet form, seat height, bookmarks) because the
feature namespaces did not change.

## Updating a world to a newer version

Import the new `.mcaddon`, open the world settings, and make sure the newer version is the one
activated (Minecraft keeps older versions around). Pack UUIDs never change between versions, so
the world keeps its settings.
