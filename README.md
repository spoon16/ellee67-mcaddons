# ElleeDog 67

One Minecraft Bedrock add-on: nine packs in one `.mcaddon`. The two core packs carry the
ElleeDog 67 Manual (the in-game manual), Stair Sitting, Creeper Mod and every script. The other four
features each ship in their own packs and are turned on by activating those packs in the world
settings.

| Pack | What it turns on | Type | Needed |
|---|---|---|---|
| ElleeDog 67 (Behavior) | the ElleeDog 67 Manual manual, Stair Sitting, Creeper Mod, and the scripts every other pack uses | behavior | required |
| ElleeDog 67 (Resources) | the book and Stair Sitting visuals | resource | required; added with the Behavior pack |
| ElleeDog 67 Pets | Pets: become Carter, Mochi or Casper with the Pet Morpher book, with fitted armor and mouth-carried tools | behavior | optional |
| ElleeDog 67 Pets Resources | pet models, animations and fitted armor | resource | optional; added with Pets |
| ElleeDog 67 Rbow Ore | Rbow Ore: rainbow ore, ingots, tools, armor and a spear | behavior | optional |
| ElleeDog 67 Rbow Ore Resources | Rbow ore, item and armor art | resource | optional; added with Rbow Ore |
| ElleeDog 67 Ender Mod | Ender Mod: Endermen cannot move blocks in protected builds (`/elleedog:ender_protect`) | behavior | optional |
| ElleeDog 67 Redstone Guide | Redstone Guide: craft a book (1 redstone + 1 leather) that explains redstone components, recipes and builds | behavior | optional |
| ElleeDog 67 Redstone Guide Resources | the guide book art | resource | optional; added with Redstone Guide |

**Status: 0.2.0 has not been run in Minecraft yet.** Everything is checked by tests against an
engine mock and by pack validation, which is not the same thing. The manual checklist is in
[docs/TESTING.md](docs/TESTING.md).

## Play it

1. Download `ElleeDog67_<version>.mcaddon` from the latest GitHub Release (or the CI artifact) and
   open it with Minecraft. One import brings in all nine packs.
2. Edit a copy of your world. Under Behavior Packs, activate "ElleeDog 67 (Behavior)". That gives
   you the ElleeDog 67 Manual, Stair Sitting and Creeper Mod; "ElleeDog 67 (Resources)" comes along
   on its own.
3. Activate the optional packs you want: "ElleeDog 67 Pets", "ElleeDog 67 Rbow Ore",
   "ElleeDog 67 Ender Mod", "ElleeDog 67 Redstone Guide". Each one pulls in its resource pack and
   the core.
4. Two ordering rules: keep "ElleeDog 67 Pets Resources" above "ElleeDog 67 Rbow Ore Resources",
   and put any other pack that replaces the player or Endermen below the ElleeDog packs, or remove
   it. Everything else can be in any order.
5. In game, the **ElleeDog 67 Manual** is the manual. It lists every feature, whether it is on, and
   which packs turn it on or off. Anyone holding a book can read it. Players named ElleeDog (who
   receive one on join) and operators can flip the two switches, Stair Sitting and Creeper Mod,
   from its pages. `/elleedog67:features` prints the same states in chat. None of this needs cheats.

Import, activation and how to move a world from the old standalone packs or from 0.1.0:
[docs/RELEASING.md](docs/RELEASING.md). What each feature does, its commands and what "off"
means: [docs/FEATURES.md](docs/FEATURES.md).

## Develop it

You need [Node.js](https://nodejs.org) 24 or newer. Open the folder in VS Code and accept the
recommended extensions (Blockception's Bedrock extension gives you JSON validation and completion
for every pack file).

```bash
npm install
npm run build       # dist/<pack>/ for all nine packs, scripts bundled into the core, validation
npm run package     # dist/ElleeDog67_<version>.mcaddon and SHA256SUMS.txt
npm test            # unit tests plus a real build of the packs
npm run check       # types and lint
npm run manifests   # rewrite every manifest.json from packs.json
```

Where things are:

```
packs.json                    the nine packs: ids, titles, uuids, dependencies (manifests are generated from it)
behavior_packs/elleedog67/    core behavior pack: the book item and the Stair Sitting entities
behavior_packs/elleedog67_*/  one behavior pack per optional feature (pets, rbow_ore, ender_mod, redstone_guide)
resource_packs/elleedog67/    core resource pack: the book and Stair Sitting visuals
resource_packs/elleedog67_*/  one resource pack per optional feature that needs one
src/core/                     feature registry, pack probes, commands, the book and the manual
src/features/<id>/            each feature's scripts; index.ts is its entry point
test/                         vitest suites and the engine mock
tools/                        build, validate, package, manifests, version bump, codegen
docs/                         architecture, feature pages, testing, releasing, codegen, cloud environment
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first, then
[docs/ADDING_A_FEATURE.md](docs/ADDING_A_FEATURE.md) when you want to add something. The Pets and
Rbow Ore packs and the Enderman override are generated; they are committed and regenerated with
`npm run codegen`, which needs [uv](https://docs.astral.sh/uv/). See
[docs/CODEGEN.md](docs/CODEGEN.md).

Sessions in [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) get
this toolchain from a `SessionStart` hook in `.claude/`, which installs Node 24, the npm packages
and the pinned Python side before the session starts. What that hook does, and the network settings
the environment needs, are in [docs/CLOUD_ENVIRONMENT.md](docs/CLOUD_ENVIRONMENT.md).

## Not in this version

- No local "deploy to my PC's Minecraft folder" script; the `.mcaddon` is the delivery path.

## License

Original code is MIT licensed (see [LICENSE](LICENSE)). Adapted Mojang sample definitions and the
supplied artwork keep their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Not an official Minecraft product.
