# Pets

Feature id `pets`, enabled by default. Ported from ElleeDog 67 Pets 0.5.2 (Rbow companion build).

## What it does

Players can become one of three pets and switch back at any time:

| Form | Wire id | Owner | Rig |
|---|---|---|---|
| Player | 0 | | native |
| Carter (Cavalier King Charles Spaniel) | 1 | ElleeDog | spaniel_v1 |
| Mochi (street cat) | 2 | warspoon17 | cat |
| Casper (white cat, Mochi variant) | 3 | Casper201312 | cat |

The player stays `minecraft:player`. There is no invisible mount, replacement mob, teleporting or
inventory clone. The pack's `minecraft:player` override declares entity properties (model id, view,
motion, armor and gear fitting, hand height, glint and seat alignment) and the resource pack renders
the pet from them. The scripts only queue property writes: item stacks, slots, durability and
enchantments are never rewritten by a form change.

The chosen form and the display settings are player dynamic properties (`pet:preferred_form`,
`pet:first_person_view`, `pet:motion_enabled`, `pet:fitted_armor_preference`,
`pet:fitted_gear_preference`, `pet:hand_height_preference`, `pet:seat_height_trims`). World load,
join, respawn and dimension change restore the saved form silently: no chat line, no menu, no
content-log entry unless the restore fails after four attempts. A preference saved by the 0.1.x
`cav:` pack (`cav:preferred_form`) is migrated on the next join.

While transformed, two loops keep the visuals in sync: every 4 ticks the glint flags for the two
hand slots (`pet:tool_enchanted`, `pet:carry_*_enchanted`, `pet:*_shield_enchanted`), every 2 ticks
the seat lift and kind for a mounted pet (`pet:seat_lift`, `pet:seat_kind`). Both are write-on-change
and read only the equipped items and the riding component.

## Commands

All 24 commands are `pet:*`, permission level Any, `cheatsRequired: false`, and run only for the
player who typed them ("Run directly as a player." otherwise). They reply in chat with the
`[ElleeDog 67 Pets 0.5.2-native-armor-isolation]` prefix. While the feature is disabled every one of
them answers "Pets is disabled. An operator can run /elleedog67:enable pets."

| Command | Parameters | Effect |
|---|---|---|
| `/pet:form <choice>` | `pet:form_choice`: `player`, `carter`, `mochi`, `casper`, `human` | Choose a form. `human` is the legacy alias for `player`. |
| `/pet:forms` | | List registered pets with rig names. |
| `/pet:book` | | Give yourself the Pet Morpher book. |
| `/pet:menu` | | Open the Pet Morpher menu without the book. |
| `/pet:settings` | | Open the display settings and diagnostics menu. |
| `/pet:view <choice>` | `pet:view_choice`: `paws`, `native` | First-person paws or native hands. Camera and targeting are unchanged. |
| `/pet:handheight <height>` | Integer -8..12 | Calibrate the empty-hand height. Default 2, 0 is neutral. Kept across pet changes. |
| `/pet:handreset` | | Drop the calibration and use the pet's default. |
| `/pet:motion <choice>` | `pet:debug_choice`: `on`, `off` | Enable or pause the pet locomotion clips. Player physics keep running. |
| `/pet:armor <choice>` | `pet:armor_choice`: `native`, `fitted`, `auto` | Fitted pet armor, native armor presentation, or clear the override. Never moves items. |
| `/pet:gear <choice>` | `pet:armor_choice` | Mouth tools, side carry and shields, or native gear. `auto` clears the override. |
| `/pet:seatinfo` | | Print the mount and seat-height measurement as JSON. |
| `/pet:seatheight <pixels>` | Integer -16..32 | Trim the seat height for the current mount kind (boat, pig, stairs, other). |
| `/pet:seatreset` | | Drop the trim for the current mount kind. |
| `/pet:check` | | Read-only property health summary (READY 17/17 when the override is loaded). |
| `/pet:rbowcheck` | | Rbow/Pets compatibility: `elleedog:rbow_armor_count`, Rbow item registrations, gear routing. |
| `/pet:diagnose` | | Full JSON report to chat and content log, then the client resource check. |
| `/pet:clientcheck` | | Asks the client to translate `pet.diag.rp_052`; proves the resource pack language file loaded. |
| `/pet:debug <choice>` | `pet:debug_choice` | Show the version and grip marker overlay (`pet:debug`). |
| `/pet:probe` | | Spawn two stationary test props (`pet:diag_cube`, `pet:diag_model`) 3.5 blocks ahead. |
| `/pet:cleanup` | | Remove your own loaded test props, including legacy `cav:` ones. |
| `/pet:snapshot` | | Capture a read-only summary of inventory and equipment fields. |
| `/pet:compare` | | Compare the current inventory with the snapshot and list changed fields. |
| `/pet:reset` | | Player form, default hand height, debug off, snapshots cleared, props removed. |

Every property write is confirmed two ticks later; if the engine did not apply it the command
reports `ERROR: ...` and the failure is kept for `/pet:check` until the player leaves.

## Items and entities

| Identifier | Component | Notes |
|---|---|---|
| `pet:morpher_book` | `pet:open_morpher` | "ElleeDog 67 Pet Morpher". Unstackable, has a use cooldown. Given by `/pet:book` only; never consumed. Registered for side carry so holding it does not trigger the unmapped-item fallback. |
| `pet:paw_token` | `pet:open_form_menu` | "ElleeDog 67 Pets - Paw Menu". Craftable (`recipes/pets/paw_token.json`); opens the same Morpher menu. |
| `cav:paw_token` | `pet:open_form_menu` | Legacy 0.1.x token kept so old stacks still open the menu. |
| `pet:diag_cube`, `pet:diag_model` | | Summonable test props owned by the player who ran `/pet:probe` (dynamic property `pet:probe_owner`). `pet:diag_model` carries `pet:model_id`. |
| `cav:diag_cube`, `cav:diag_model` | | Legacy props; only `/pet:cleanup` touches them. |

The Morpher menu is one `ActionFormData` per step: Player, Carter, Mochi, Casper, then a biography
page with "Become X" and "Back". One session per player; a late response after leaving, changing
dimension, respawning or choosing by command is discarded. A busy client is retried three times.

## Player override and property budget

`behavior_packs/elleedog67/entities/overrides/player.json` replaces `minecraft:player`. It declares
18 entity properties, all `client_sync: true` except the last:

- `pet:model_id` (int 0..4095), `pet:view` (enum paws/native), `pet:motion`, `pet:armor_fit`,
  `pet:gear_fit`, `pet:debug` (bool), `pet:hand_height` (int -8..12)
- `pet:tool_enchanted`, `pet:tool_enchanted_for`, `pet:carry_main_enchanted`,
  `pet:carry_main_enchanted_for`, `pet:main_shield_enchanted`, `pet:carry_off_enchanted`,
  `pet:carry_off_enchanted_for`, `pet:off_shield_enchanted`
- `pet:seat_lift` (float -64..64), `pet:seat_kind` (int 0..4)
- `elleedog:rbow_armor_count` (int 0..4, server only) for the Rbow Ore companion

Bedrock allows one `minecraft:player` override per world and a fixed number of properties per
entity, so every feature that needs a player property must add it to this file and to
`src/features/pets/property_schema.generated.js` (the diagnostic contract behind `/pet:check`, which
expects exactly the 17 `pet:*` keys). Removing or renaming a property changes what old worlds
report as MISSING or INVALID.

## What "disabled" means

`/elleedog67:disable pets` (or the book menu) does the following on the next tick:

- Every online player currently in a pet form is returned to native form with
  `transitionForm(player, "human", { persist: false, defaults: false })`: model 0, native view,
  motion, armor and gear off, hand height 0, glint and seat flags cleared. Saved preferences are not
  touched, so `/elleedog67:enable pets` restores the chosen form about one second later.
- Open Morpher sessions, settings menus and pending confirmations are dropped.
- The spawn, leave and dimension-change listeners and both sync loops are removed.
- A single idle listener stays subscribed to `playerSpawn`: a player who joins in a saved pet form
  is forced native the same way, silently.
- All `pet:*` commands refuse with the disabled message; the book and token do nothing.

What stays in the world regardless: the player override and its properties, both items, the recipe,
the test prop entities and the resource pack. A world that loads with Pets already disabled has no
listeners at all until the feature is enabled once; players who saved a pet form in such a world keep
it until then.

## Known limits

From the 0.5.2 release notes:

- Seated pose: the generated ride clip is emitted in Bedrock's rotation sign (negative X raises the
  chest, as in vanilla `animation.cat.sit`). Pets sit on their rear with the body raised, front legs
  vertical with paws on the seat plane, hind legs folded forward and paws flat, tail resting behind.
  Earlier builds emitted right-handed signs and drew the pose nose-down.
- Fitted armor meshes are pre-scaled by the player's render scale (0.9375) because the armor
  attachables rebuild their bone matrices without it; the client showed pet-shaped armor that
  followed the pet but floated evenly a little high. The shield attachable was left as it was
  (its placement is locked as user-confirmed); if the armor now lands correctly, the shield should
  get the same treatment.
- Previously unsupported held items still use the unmodified native fallback and can appear at
  normal human-hand height in pet form.
- Fitted dye, trims, glint, Persona and Character Creator outfits, simultaneous viewers and armor
  binding still require Minecraft tests. Each armor adapter adds one render pass per registered pet;
  the iPad performance cost has not been measured.
- No Minecraft client, iPad, Realm, actual armor binding or cache behaviour, multiplayer rendering,
  dye/trim/glint appearance or device performance was tested by the automated suites. The native armor
  pass with a separate fixed pet geometry is a structural fix candidate, not an engine-confirmed
  correction.

Port-specific:

- A settings menu that is already open when Pets is disabled still applies the button the player
  presses next; Bedrock cannot close a form from script.
- The `/pet:check` count of 17 is the `pet:*` schema; `elleedog:rbow_armor_count` is reported by
  `/pet:rbowcheck` instead.

## Manual in-game checks

Use a copy of the world with the add-on imported. The book is the intended interface; use commands
only where the step says so. Record NOT RUN, PASS, FAIL or BLOCKED per line with a screenshot.

1. Join as a fresh player. No chat line, no menu and no content-log entry appears. `/pet:check`
   prints `READY | 17/17 valid properties` and `pet:model_id=0`.
2. `/pet:book`, hold the Pet Morpher, use it. Choose Carter, read the biography, press Become Carter.
   Chat says "Selected Carter." Walk, run, stop, sneak, jump and look around from front, side and
   rear; ears and tail animate. Repeat for Mochi and Casper.
3. Choose Player in the book. Skin, cape and first-person hands return. No detail page is shown for
   Player.
4. While Player, equip a full iron or diamond set (in the equipment slots, not the hotbar). Choose
   Carter, then Player. The native armor lines up with the body without re-equipping or relogging.
   Repeat with Mochi and Casper; walk, turn, crouch and swing after returning to Player. Do this
   unmounted first, then mounted.
5. Repeat step 4 with Rbow armor and a mixed native/Rbow set. Pets keep their fitted shapes and paw
   height 2. `/pet:rbowcheck` reports READY.
6. Hold a pickaxe, sword, shield, boat and a filled map as a pet. Tools sit in the mouth, mapped
   items on the side, the shield beside the torso and in front while sneaking or blocking. Enchanted
   items glint; the map uses the native fallback.
7. First person: paws show with an empty hand. `/pet:handheight 6` moves them, `/pet:handreset`
   returns to 2, `/pet:view native` shows native hands. Pick another pet: the calibration persists,
   the view override resets.
8. While Player, `/pet:armor native` changes nothing visible and keeps the form. While a pet, the same
   command keeps the pet body and shows native armor; the next book choice restores fitted armor.
9. Ride a boat, a pig and a stair seat as a pet. The pet sits on the surface, `/pet:seatinfo` names
   the kind, `/pet:seatheight 4` and `/pet:seatreset` move and restore only that kind. Dismounting
   clears the lift.
10. `/pet:snapshot`, switch forms with the book only, `/pet:compare` prints PASS.
11. Leave and rejoin, die and respawn, travel to the Nether and back: the pet form returns each time
    with no chat line. A second player with a different pet sees both forms correctly.
12. `/pet:probe` spawns a cube and a static model of your pet 3.5 blocks ahead; `/pet:cleanup`
    removes only yours.
13. `/elleedog67:disable pets` while transformed: you return to Player at once, `/pet:form carter`
    is refused, the book does nothing, and a player who joins now is Player. `/elleedog67:enable
    pets`: your pet returns within a second without a chat line.
14. Watch the content log for the whole session: only explicit command errors may appear.

If a step fails, send one screenshot taken after choosing Player, the `/pet:diagnose` output and the
active pack list. Do not count re-equipping a piece or relogging as a passing transition.
