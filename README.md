# ElleeDog 67

One Minecraft Bedrock add-on (a behavior pack and a resource pack) that bundles six ElleeDog 67
features and lets you switch each one on or off per world.

| Feature | What it does |
|---|---|
| Pets | become Carter, Mochi or Casper with the Pet Morpher book, with fitted armor and mouth-carried tools |
| Stair Sitting | sit on any stair with the Sit button, a crouch gesture or `/sit:down` |
| Creeper Mod | creeper blasts hurt players only; blocks and other mobs are safe |
| Ender Mod | Endermen cannot move blocks in protected builds (`/elleedog:ender_protect`) |
| Redstone Guide | craft a book (1 redstone + 1 leather) that explains redstone components, recipes and builds |
| Rbow Ore | rainbow ore, ingots, tools, armor and a spear |

**Status: 0.1.0 has not been run in Minecraft yet.** Everything is checked by tests against an
engine mock and by pack validation, which is not the same thing. The manual checklist is in
[docs/TESTING.md](docs/TESTING.md).

## Play it

1. Download `ElleeDog67_<version>.mcaddon` from the latest GitHub Release (or the CI artifact).
2. Open it with Minecraft. Activate "ElleeDog 67 (Behavior)" on a copy of your world and
   deactivate the old separate ElleeDog packs. Details: [docs/RELEASING.md](docs/RELEASING.md).
3. In game: `/elleedog67:features` shows what is on. Operators use `/elleedog67:enable <feature>`
   and `/elleedog67:disable <feature>`. Players named ElleeDog get the **ElleeDog 67 Book**, whose
   menu toggles features without typing. Feature ids: `pets`, `stair-sit`, `creeper-mod`,
   `ender-mod`, `redstone-guide`, `rbow-ore`.

What each feature does, its commands, and what "disabled" means: [docs/FEATURES.md](docs/FEATURES.md).

## Develop it

You need [Node.js](https://nodejs.org) 24 or newer. Open the folder in VS Code and accept the
recommended extensions (Blockception's Bedrock extension gives you JSON validation and completion
for every pack file).

```bash
npm install
npm run build       # dist/behavior_pack + dist/resource_pack, bundled scripts, validation
npm run package     # dist/ElleeDog67_<version>.mcaddon and the two .mcpack files
npm test            # unit tests plus a real build of the packs
npm run check       # types and lint
```

Where things are:

```
behavior_packs/elleedog67/   the behavior pack (entities, items, recipes, ...), one subfolder per feature
resource_packs/elleedog67/   the resource pack (client entities, attachables, models, textures, texts)
src/core/                    feature toggles, commands, the ElleeDog 67 Book
src/features/<id>/           each feature's scripts; index.ts is its entry point
test/                        vitest suites and the engine mock
tools/                       build, validate, package, version bump, codegen
docs/                        architecture, feature pages, testing, releasing, codegen
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first, then
[docs/ADDING_A_FEATURE.md](docs/ADDING_A_FEATURE.md) when you want to add something. Some pack
folders are generated (Pets, Rbow Ore and the Enderman override); they are committed and
regenerated with `npm run codegen`, which needs [uv](https://docs.astral.sh/uv/). See
[docs/CODEGEN.md](docs/CODEGEN.md).

## Not in this version

- Turning a feature off does not remove its data from the world: Rbow ore keeps generating and
  its recipes keep working, the Redstone Guide can still be crafted, and the player and enderman
  definitions stay replaced. A build-time way to leave a feature out entirely is a follow-up.
- The migrated feature scripts are still JavaScript; the core is TypeScript.
- No local "deploy to my PC's Minecraft folder" script; the `.mcaddon` is the delivery path.

## License

Original code is MIT licensed (see [LICENSE](LICENSE)). Adapted Mojang sample definitions and the
supplied artwork keep their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Not an official Minecraft product.
