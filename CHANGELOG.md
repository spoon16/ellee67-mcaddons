# Changelog

## 0.3.1

Quieter in the game, cheaper per tick, a few real bugs closed, and a Creeper Mod icon you can see.

- Creeper Mod's pack icon is the ElleeDog artwork (`tools/art/sources/creeper_mod.webp`, resized by
  `tools/art/pack_icons.py`). The drawn blast star looked blank at the size the pack list shows.
  A pack icon is cached per version, which is why this ships as a release rather than a patch on
  `main`.

- Chat: no feature speaks unprompted any more. Stair Sitting's join hint and its two action-bar
  texts are gone, a Sit button press or crouch gesture that is refused says nothing (the reason is
  in `/sit:status`), and standing up because a stair changed is silent. Commands still answer.
- Stair Sitting: a seat check that threw stood the player up silently every tick; it now logs the
  reason once. `/sit:button` is stored once (the dynamic property) and the filter tag only mirrors
  it. Target discovery for a player standing still is cached for two seconds, existing targets are
  re-read against their stair every pass, and the crouch-gesture window comes from `CONFIG`.
- Ender Mod: an enderman that has not left its block is not re-checked every tick, sections know
  the bounds of their placed blocks, and a placement re-evaluates only the endermen next to it.
- Pets: one refresh loop instead of two, one session counter instead of two, the small helpers
  (`setIfChanged`, JSON dynamic properties) live in `core.ts`, every `pet:` command registers on its
  own so one bad entry cannot take the rest down, and the state resets on a world reload.
- Rbow Ore clears a broken tool with the one-argument `setEquipment(slot)`; the mock now refuses an
  explicit `undefined` there, and `CLAUDE.md` names `setDynamicProperty(key, undefined)` as the
  one documented clear.
- Core: `featureLog(title)` (with `warnOnce` and `throttled`) replaces five hand-rolled warning
  guards, `loadedDimensions(world)` replaces five copies of the same loop, and `runFeature` disposes
  the previous context when `worldLoad` fires again in the same module.
- Redstone Guide's screen builder is one function per route kind.
- Tooling: the server runner reports a binary that cannot start instead of hanging; the engine smoke
  test fails on a timeout, a non-zero exit or a missing content log and clears old content logs
  first; `packs.json` rejects a repeated uuid, module uuid or folder name; a checkout path with a
  space no longer makes the CLI entry points do nothing; `jsonc-parser` parses commented JSON.
- Tests: the validator's rules are proven by breaking them; the mock's signal arity flags are checked
  against the engine typings; module versions must agree with the installed packages and the
  GameTest manifest; every bundle stays under 160 KB with no `@minecraft/vanilla-data` enums;
  the mock restores every game rule between tests.
- CI: read-only token, cancelled superseded runs, job timeouts, actions pinned to commits, and the
  server download cached by version rather than by the setup file's hash.

## 0.3.0

Breaking: the two core packs are gone. Every feature is now its own behavior pack with its own
scripts, and activating the pack is the only switch.

- Removed "ElleeDog 67 (Behavior)" and "ElleeDog 67 (Resources)", the ElleeDog 67 Manual book, the
  `/elleedog67:enable|disable|features|book` commands and the per-world feature flags. Worlds on
  0.2.x deactivate the two core packs by hand; see [docs/RELEASING.md](docs/RELEASING.md).
- New packs "ElleeDog 67 Stair Sitting" (with its resource pack) and "ElleeDog 67 Creeper Mod",
  which used to live inside the core. Pets, Rbow Ore, Ender Mod and Redstone Guide keep their uuids
  and gain a script module each. Ten packs in the `.mcaddon`.
- Fixed: no feature started in the real game. `FeatureContext.on` passed an `undefined` second
  argument to `subscribe`, which the engine rejects on the signals that take one. Found by booting
  the packs in Bedrock Dedicated Server.
- Fixed: every `pet:`, `sit:` and `elleedog:` command was missing in the real game. The engine
  allows one command namespace per script module, and the shared core registered `elleedog67:`
  first. Splitting the scripts per pack restores them.
- Pets: the "Paw Menu" token (`pet:paw_token`, its recipe and the legacy `cav:paw_token`) is gone;
  the Pet Morpher book (`/pet:book`) is the way into the menu.
- `npm run test:engine` boots every pack in Bedrock Dedicated Server headlessly, checks the pack
  stack, the script load lines, the Content Log and one command per namespace; CI runs it. The
  engine mock now enforces the one-namespace and subscribe-arity rules, so both fixes above are
  unit tests too.
- The manual artwork script `tools/art/manual_book.py` went with the book; `tools/art/pack_icons.py`
  draws the Stair Sitting and Creeper Mod pack icons.
- The README is now the owner's guide (packs, order, commands, working through Claude Code);
  the developer reference moved to `docs/DEVELOPING.md`.
- `npm run test:gametest` runs GameTests with simulated players inside the server: `/pet:book`
  gives the Morpher, `/sit:down` seats a player on a stair, a creeper blast hurts only the player.
  The test pack lives in `tools/bds/gametest/` and is never shipped.
- Vanilla entity, block and item ids in every feature but Pets are checked against
  `@minecraft/vanilla-data` at compile time (`entityId`, `blockId`, `itemId` in `src/core/vanilla.ts`,
  no runtime cost); `@minecraft/bedrock-schemas` validates the pack JSON in VS Code; `CLAUDE.md`
  guides Claude Code sessions and `.claude/settings.json` pre-approves the verification commands.

## 0.2.3

- New ElleeDog 67 Manual artwork, drawn as pixel art from the concept cover: a red leather book with
  gold corners and gems, the black cat, the bearded man, Carter in his shades and the white cat on a
  grass strip, the "ElleeDog 67" logo and a MANUAL banner. It is the book's item texture and, at
  256x256, the icon of the two core packs, so the manual and the core packs match in Edit World.
  `tools/art/manual_book.py` draws it.

## 0.2.2

- The book is called the ElleeDog 67 Manual and has its own icon (replaced in 0.2.3).

## 0.2.1

No gameplay changes. Every script is TypeScript now: the feature modules that 0.1.0 carried over as
JavaScript from the original packs are ported with the same behaviour and exports, checked by the
same tests. The Pets compiler still receives plain JavaScript, transpiled from the TypeScript modules
by `npm run codegen`. The Rbow rule modules are ports rather than byte copies; their header comments
cite the upstream sha256 and a test fails if the vendored Rbow 1.2.0 copy drifts from it.

## 0.2.0

Not yet run in Minecraft; see [docs/TESTING.md](docs/TESTING.md).

- The add-on is nine packs in one `.mcaddon`. The two core packs, "ElleeDog 67 (Behavior)" and
  "ElleeDog 67 (Resources)", keep their 0.1.0 uuids and carry the book, Stair Sitting, Creeper Mod
  and every script. Pets, Rbow Ore, Ender Mod and Redstone Guide each ship in their own behavior
  pack (and a resource pack where they need one) and are turned on by activating those packs in
  Edit World. The optional packs are off until activated.
- The ElleeDog 67 Book is a manual: a Home page with every feature and its state, a page per
  feature, a Setup and packs page and a Commands page. Anyone holding a book can read it;
  ElleeDog and operators see the Turn on and Turn off buttons for the two switch features. Its lore
  line reads "The ElleeDog 67 manual."
- Features come in two kinds. Switch features (Stair Sitting, Creeper Mod) keep their world flag,
  the manual buttons and `/elleedog67:enable|disable`. Pack features (Pets, Rbow Ore, Ender Mod,
  Redstone Guide) are active exactly when their packs are: after world load the scripts probe for a
  definition only the packs provide (`pet:diag_model`, `elleedog:rbow_drop`,
  `elleedog:ender_mod_marker`, `elleedog_redstone:guide_book`).
- `/elleedog67:enable` and `/elleedog67:disable` on a pack feature reply with the packs to activate
  or deactivate and change nothing. `/elleedog67:features` prints on, off, active or packs off per
  feature, with the pack hint for inactive ones. Gated commands and item components reply with the
  same hint while the packs are absent.
- The runtime disable paths of the four pack features are removed: forcing players back to native
  form, restoring Endermen, the idle listeners and the Rbow "partial toggle". Their `stop()` is a
  no-op; the packs are the switch. The `elleedog67:feature:<id>` world properties that 0.1.0 wrote
  for these four features are deleted on the next world load.
- Rbow Ore alone renders as Rbow 1.2.0 did: the Rbow Ore resource pack carries the standalone
  Rbow 1.2.0 player armor and spear attachables. The Pets resource pack keeps the pet-aware versions
  of the same identifiers, which win when it sits above Rbow Ore Resources.
- Each pack owns its own lang files and texture atlases; the core keeps only the book and Stair
  Sitting keys. Manifests are generated from `packs.json` (`npm run manifests`, also run by
  `npm run codegen` and the version hook). `npm run package` writes one `.mcaddon` and
  `SHA256SUMS.txt`; the per-pack `.mcpack` files are gone.
- Migration, in full in [docs/RELEASING.md](docs/RELEASING.md): coming from the six standalone
  packs, deactivate old Pets before old Rbow (old Pets depends on old Rbow); identifiers are
  unchanged, so pet preferences, seats, ore and items carry over once the matching companion is
  active. Coming from 0.1.0, the core packs update in place; activate the companions you want, and
  activate Rbow Ore before opening any world that ever had Rbow ore.
- Pets: the fitted-armor pre-scale is set per pet in the catalog. Mochi and Casper keep 0.9375, which
  rests the armor on the cats; Carter is back to 1.0 because at 0.9375 his armor drew inside his body.
  `/pet:armorlift <pixels>` and `/pet:armorscale <percent>` move and resize the fitted armor live
  (saved per pet, cleared with `/pet:armorfitreset`), so the right numbers for each pet can be found in
  one session and then baked into the catalog.

## 0.1.0

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
