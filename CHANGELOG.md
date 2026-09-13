# Changelog

## 0.1.0 (unreleased)

First combined release. Not yet run in Minecraft; see [docs/TESTING.md](docs/TESTING.md).

- One behavior pack and one resource pack replace the six separate packs (Pets 0.5.2, Rbow Ore 1.2.3,
  Stair Sitting 0.2.1, Creeper Mod 1.2.0, Ender Mod 1.0.1, Redstone Guide 1.0.3).
- Features can be turned on and off per world with `/elleedog67:enable`, `/elleedog67:disable`,
  `/elleedog67:features`, or from the ElleeDog 67 Book, which players named ElleeDog receive on join.
- The Ender Mod's `minecraft:enderman` override is regenerated from the 1.26.40 vanilla definition
  (it was pinned to 1.21.100) and its command is now `/elleedog:ender_protect`.
- All packs target Minecraft 1.26.40 with `@minecraft/server` 2.9.0 and `@minecraft/server-ui` 2.0.0.
- Pets: the seated pose is generated in Bedrock's rotation sign, so a riding pet sits on its haunches
  with its chest up and front legs straight instead of nose-down.
- Pets: fitted armor meshes are pre-scaled by the player's render scale so they rest on the pet
  instead of floating slightly above it.
