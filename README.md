# ElleeDog 67

One Minecraft Bedrock add-on: six features, ten packs, one `.mcaddon`. Every feature is its own
behavior pack (plus a resource pack where it needs client files) with its own scripts. Activating a
pack in the world settings is what turns the feature on; deactivating it turns the feature off.
There is no central pack, no controller and no in-game switch.

| Pack | What it turns on | Type | Comes with |
|---|---|---|---|
| ElleeDog 67 Pets | Pets: become Carter, Mochi or Casper with the Pet Morpher book, with fitted armor and mouth-carried tools | behavior | ElleeDog 67 Pets Resources |
| ElleeDog 67 Pets Resources | pet models, animations and fitted armor | resource | |
| ElleeDog 67 Rbow Ore | Rbow Ore: rainbow ore, ingots, tools, armor and a spear | behavior | ElleeDog 67 Rbow Ore Resources |
| ElleeDog 67 Rbow Ore Resources | Rbow ore, item and armor art | resource | |
| ElleeDog 67 Ender Mod | Ender Mod: Endermen cannot move blocks in protected builds (`/elleedog:ender_protect`) | behavior | |
| ElleeDog 67 Redstone Guide | Redstone Guide: craft a book (1 redstone + 1 leather) that explains redstone components, recipes and builds | behavior | ElleeDog 67 Redstone Guide Resources |
| ElleeDog 67 Redstone Guide Resources | the guide book art | resource | |
| ElleeDog 67 Stair Sitting | Stair Sitting: sit on stairs with the Sit button, a crouch gesture or `/sit:down` | behavior | ElleeDog 67 Stair Sitting Resources |
| ElleeDog 67 Stair Sitting Resources | the invisible seat and Sit prompt | resource | |
| ElleeDog 67 Creeper Mod | Creeper Mod: creeper blasts hurt players only; blocks and other mobs are safe | behavior | |

**Status: the packs boot cleanly in Bedrock Dedicated Server (`npm run test:engine`) but have not
been played on a real device yet.** Everything else is checked by tests against an engine mock and
by pack validation. The manual checklist is in [docs/TESTING.md](docs/TESTING.md).

## Play it

1. Download `ElleeDog67_<version>.mcaddon` from the latest GitHub Release (or the CI artifact) and
   open it with Minecraft. One import brings in all ten packs.
2. Edit a copy of your world. Under Behavior Packs, activate the features you want: "ElleeDog 67
   Pets", "ElleeDog 67 Rbow Ore", "ElleeDog 67 Ender Mod", "ElleeDog 67 Redstone Guide",
   "ElleeDog 67 Stair Sitting", "ElleeDog 67 Creeper Mod". A pack that has a resource pack pulls it
   in on its own.
3. Two ordering rules: keep "ElleeDog 67 Pets Resources" above "ElleeDog 67 Rbow Ore Resources",
   and put any other pack that replaces the player or Endermen below the ElleeDog packs, or remove
   it. Everything else can be in any order.
4. In game, each feature brings its own commands: `/pet:book` gives you the Pet Morpher, `/sit:help`
   lists the sitting controls, `/elleedog:ender_protect` protects a build. None of them needs
   cheats.

Import, activation and how to move a world from earlier versions:
[docs/RELEASING.md](docs/RELEASING.md). What each feature does and its commands:
[docs/FEATURES.md](docs/FEATURES.md).

## Develop it

You need [Node.js](https://nodejs.org) 24 or newer. Open the folder in VS Code and accept the
recommended extensions; `.vscode/settings.json` points every pack JSON file at Mojang's schemas
(`@minecraft/bedrock-schemas`) for validation and completion, and Blockception's extension adds
Molang and lang support. `CLAUDE.md` is the short guide for Claude Code sessions.

```bash
npm install
npm run build       # dist/<pack>/ for all ten packs, one script bundle per behavior pack, validation
npm run package     # dist/ElleeDog67_<version>.mcaddon and SHA256SUMS.txt
npm test            # unit tests plus a real build of the packs
npm run check       # types and lint
npm run test:engine # boots the packs in Bedrock Dedicated Server (downloads it once into .bds/)
npm run test:gametest # GameTests with simulated players inside that server
npm run manifests   # rewrite every manifest.json from packs.json
```

Where things are:

```
packs.json                    the ten packs: ids, titles, uuids, script modules, dependencies (manifests are generated from it)
behavior_packs/elleedog67_*/  one behavior pack per feature (pets, rbow_ore, ender_mod, redstone_guide, stair_sit, creeper_mod)
resource_packs/elleedog67_*/  one resource pack per feature that needs one
src/packs/<id>.ts             each behavior pack's script entry: runs its feature
src/core/                     the tiny shared runtime bundled into every pack: runFeature, FeatureContext, log
src/features/<id>/            each feature's scripts; index.ts exports its definition
test/                         vitest suites and the engine mock
tools/                        build, validate, package, manifests, version bump, codegen, the headless server harness
docs/                         architecture, feature pages, testing, releasing, codegen, cloud environment, ecosystem
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
[docs/ECOSYSTEM.md](docs/ECOSYSTEM.md) evaluates the community and Mojang tooling against this
repository's own, and records the headless Bedrock Dedicated Server runs that led to
`npm run test:engine`.

## Not in this version

- No local "deploy to my PC's Minecraft folder" script; the `.mcaddon` is the delivery path.

## License

Original code is MIT licensed (see [LICENSE](LICENSE)). Adapted Mojang sample definitions and the
supplied artwork keep their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Not an official Minecraft product.
