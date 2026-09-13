# Changelog

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
