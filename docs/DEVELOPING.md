# Developing

The developer reference: toolchain, commands, layout. The README is written for the add-on's owner,
who works through Claude Code; this page and `CLAUDE.md` are for whoever (or whatever) is editing
the code.

## Toolchain

You need [Node.js](https://nodejs.org) 24 or newer, and [uv](https://docs.astral.sh/uv/) for
`npm run codegen`. Open the folder in VS Code and accept the recommended extensions;
`.vscode/settings.json` points every pack JSON file at Mojang's schemas
(`@minecraft/bedrock-schemas`) for validation and completion, and Blockception's extension adds
Molang and lang support. `CLAUDE.md` is the short guide for Claude Code sessions.

```bash
npm install
npm run build         # dist/<pack>/ for all ten packs, one script bundle per behavior pack, validation
npm run package       # dist/ElleeDog67_<version>.mcaddon and SHA256SUMS.txt
npm test              # unit tests plus a real build of the packs
npm run check         # types and lint
npm run test:engine   # boots the packs in Bedrock Dedicated Server (downloads it once into .bds/)
npm run test:gametest # GameTests with simulated players inside that server
npm run codegen       # regenerates the Pets/Rbow packs and the Enderman override
npm run manifests     # rewrite every manifest.json from packs.json
```

## Where things are

```
packs.json                    the ten packs: ids, titles, uuids, script modules, dependencies (manifests are generated from it)
behavior_packs/elleedog67_*/  one behavior pack per feature (pets, rbow_ore, ender_mod, redstone_guide, stair_sit, creeper_mod)
resource_packs/elleedog67_*/  one resource pack per feature that needs one
src/packs/<id>.ts             each behavior pack's script entry: runs its feature
src/core/                     the tiny shared runtime bundled into every pack: runFeature, FeatureContext, log, vanilla ids
src/features/<id>/            each feature's scripts; index.ts exports its definition
test/                         vitest suites and the engine mock
tools/                        build, validate, package, manifests, version bump, codegen, the headless server harness
tools/bds/                    Bedrock Dedicated Server harness: smoke test, GameTests, NBT tools
docs/                         architecture, feature pages, testing, releasing, codegen, cloud environment, ecosystem
```

Read [ARCHITECTURE.md](ARCHITECTURE.md) first, then [ADDING_A_FEATURE.md](ADDING_A_FEATURE.md)
when you want to add something. The Pets and Rbow Ore packs and the Enderman override are
generated; they are committed and regenerated with `npm run codegen`. See [CODEGEN.md](CODEGEN.md).

## Working through Claude Code

Sessions in [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) get
this toolchain from a `SessionStart` hook in `.claude/`, which installs Node 24, the npm packages
and the pinned Python side before the session starts. What that hook does, and the network settings
the environment needs, are in [CLOUD_ENVIRONMENT.md](CLOUD_ENVIRONMENT.md).
[ECOSYSTEM.md](ECOSYSTEM.md) evaluates the community and Mojang tooling against this repository's
own, and records the headless Bedrock Dedicated Server runs that led to `npm run test:engine`.

The verification ladder before any change is called done:

```bash
npm run check && npm test && npm run build && npm run test:engine
```

plus `npm run codegen` (and a clean `git status`) when anything under `tools/codegen/` or
`src/features/pets/` changed, and `npm run test:gametest` when scripts changed.

## Not in this version

- No local "deploy to my PC's Minecraft folder" script; the `.mcaddon` is the delivery path.
