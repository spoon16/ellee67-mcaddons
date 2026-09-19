# Creeper Mod

Feature id: `creeper-mod`.

Packs: "ElleeDog 67 Creeper Mod" (Behavior Packs, scripts only; no resource pack). The feature is
on exactly when the pack is active.

## What it does

A creeper explosion happens exactly as in vanilla, except that it breaks no blocks. The script
subscribes to `world.beforeEvents.explosion`, and when the source is a `minecraft:creeper` it calls
`event.setImpactedBlocks([])` and nothing else: the event is not cancelled, so the engine goes on to
play the blast and its sound, hurt and knock back every entity in range with its own damage model,
and remove the creeper the way it always does. Players, animals, villagers, item frames, paintings,
dropped items and other creepers are all treated as vanilla treats them; only the terrain is spared.
A charged creeper is the same entity type and is guarded the same way.

Every other explosion source (TNT, end crystals, beds, respawn anchors, wither skulls, fireballs)
is left to the engine, blocks included.

## Commands and data

None. The feature is script only: one before-event subscription while on, no entities, items,
recipes or textures, no scheduled work and no per-tick cost.

## What off means

Deactivate "ElleeDog 67 Creeper Mod" in Edit World and reopen the world. Creeper explosions behave
like vanilla and break blocks again. Nothing from this feature stays in the world.

## Known limits

- Damage is vanilla's own, so it follows the game's difficulty, armor, Blast Protection, shields
  and cover rules. There is no tuning knob: making creepers weaker or player-only again means a
  scripted blast, which 0.3.x had and dropped because it left animals untouched.
- The `mobGriefing` game rule still applies on top: with it off, the vanilla explosion would break
  no blocks anyway.
- Up to 0.3.1 the feature cancelled the explosion and scripted a player-only blast; a creeper
  could not hurt a pet, a cow or another creeper. That is the behaviour this one replaces.
- The engine mock proves the subscription and the block-list write, and the GameTest
  `ed67:creeper_blast` proves a forced blast hurts the player beside it, kills a pig two blocks
  away and leaves the stone floor whole. Neither is a Bedrock client on a device; run the checks
  below on a real world.

## Manual in-game checks

Use a copy of the world with "ElleeDog 67 Creeper Mod" active, the Content Log enabled and no other
behavior packs active. Set `mobGriefing` ON so a failure is not masked by the game rule.

1. Build a small display: dirt, glass, a chest with items, a painting, an item frame with an item,
   loose items on the ground, a pig or cow, another mob and a second creeper.
2. Let one creeper detonate next to you. You take damage and knockback as in vanilla; the pig, the
   other mob and the second creeper are hurt or killed as in vanilla (a creeper hit by the blast can
   itself explode, as it does without the pack); the painting and item frame may break, as in
   vanilla. The dirt, glass and chest are intact and the chest still holds its items.
3. Repeat with several creepers at once and with a charged creeper: bigger blast, same intact
   terrain.
4. Stand behind a solid wall and let a creeper detonate on the other side: vanilla cover rules
   apply, and the wall stays.
5. Switch to Creative and let a creeper detonate: no damage (Creative is immune in vanilla), blocks
   intact.
6. Kill a creeper normally and confirm ordinary loot still drops.
7. Detonate TNT and an end crystal away from the display: both still break blocks.
8. Deactivate "ElleeDog 67 Creeper Mod" in Edit World, reopen, detonate a creeper and confirm
   vanilla block damage returns; reactivate the pack, reopen and confirm the terrain is spared again.
9. Reload the world and repeat step 2. Then repeat it in multiplayer with two players in range.
10. Watch the Content Log for the whole session: it must show `[ElleeDog 67] creeper-mod loaded` and
    nothing else from this feature.

Record the Bedrock version, device, pack version, cheats setting, reproduction steps, coordinates,
expected versus actual, and any Content Log errors.
