# Creeper Mod

Feature id: `creeper-mod`.

Packs: "ElleeDog 67 Creeper Mod" (Behavior Packs, scripts only; no resource pack). The feature is
on exactly when the pack is active.

## What it does

Every creeper explosion is cancelled before the engine runs it. In its place the script plays the
explosion particle and sound, applies damage and knockback to Survival and Adventure players within
range, and removes the creeper with `remove()` rather than `kill()`, so no kill loot or XP appears.
Blocks, paintings, item frames, dropped items, pets, other mobs and nearby creepers are never touched.

Damage falls off with distance and with how much of the player's body is exposed (twelve rays from the
blast origin to the body). A fully covered player takes nothing. Difficulty scales the number. A normal
creeper hurts within 6 blocks, a charged creeper within 12. Creative and Spectator players are skipped.
Damage arrives through `applyDamage` with the `entityExplosion` cause, so armor, enchantments and
effects are still handled by the game.

Killing a creeper the ordinary way is outside the handler and drops loot as usual.

## Commands and data

None. The feature is script only: it subscribes to `world.beforeEvents.explosion` while on and
ships no entities, items, recipes or textures.

## What off means

Deactivate "ElleeDog 67 Creeper Mod" in Edit World and reopen the world. Creeper explosions behave
like vanilla: blocks break, mobs and items take blast damage, and creepers drop kill loot again.
Nothing from this feature stays in the world.

## Known limits

Quoted from the upstream source README:

- Damage is a "scripted approximation, not a promise of identical vanilla numbers, shield interactions,
  death attribution, or armor/enchantment behavior."
- "TNT, beds, end crystals, and other explosion sources are outside this mod's scope." Those explosions
  stay destructive.
- The upstream build was validated with mocks only, "not a Bedrock engine, renderer, command-parser,
  Realm, performance, or achievement test." It has never been run in-game, so the manual checks below
  are the first real evidence.
- The handler deduplicates one explosion per creeper for 200 ticks; a creeper that survives cancellation
  is removed on the next tick regardless.

## Manual in-game checks

Use a copy of the world with "ElleeDog 67 Creeper Mod" active, the Content Log enabled and no other
behavior packs active. Set `mobGriefing` ON so a failure is not masked by the game rule.

1. Build a small display: dirt, glass, a chest with items, a painting, an item frame with an item,
   loose items on the ground, a pet, another mob and a second creeper.
2. Let one creeper detonate next to you. You should take damage and knockback; every display object and
   the second creeper must remain intact. The detonator disappears without kill loot (ignore drops that
   were already on the ground).
3. Repeat with several creepers at once and with a charged creeper (a charged one should reach farther).
4. Stand behind a solid wall and let a creeper detonate on the other side: a fully covered player takes
   no scripted damage. Try partial cover as well.
5. Check shields, armor, Protection and Blast Protection, Resistance, and each difficulty level. The
   numbers follow the tuning above, not vanilla, so judge direction and scale rather than exact values.
6. Switch to Creative, then Adventure, then Spectator: only Survival and Adventure take damage.
7. Kill a creeper normally and confirm ordinary loot still drops.
8. Detonate TNT and an end crystal away from the display: both stay destructive.
9. Deactivate "ElleeDog 67 Creeper Mod" in Edit World, reopen, detonate a creeper and confirm vanilla
   block damage returns; reactivate the pack, reopen and confirm the scripted blast is back.
10. Reload the world and repeat step 2. Then repeat it in multiplayer with two players in range.

Record the Bedrock version, device, pack version, cheats setting, reproduction steps, coordinates,
expected versus actual, and any Content Log errors.
