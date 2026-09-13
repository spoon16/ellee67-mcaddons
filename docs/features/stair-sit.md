# Stair Sitting

Feature id: `stair-sit`. Enabled by default. Ported from ElleeDog 67 Stair Sitting v0.2.1.

## What it does

Players sit on ordinary upright, dry vanilla stairs (`minecraft:*_stairs` with a valid direction and corner
state) and move between nearby stairs while staying seated. There are four ways to sit:

- The native **Sit** button on touch: the script keeps an invisible `sit:target` entity on every free,
  reachable stair near an empty-handed player, so the game shows its own contextual action.
- Empty-hand Use / Interact on the stair block (right-click, controller Interact). The block interaction
  is cancelled and the sit runs on the next writable tick.
- The crouch gesture: look at the stair, crouch for a moment, then uncrouch while still looking at it.
- `/sit:down`, which also works with a held item.

A seated player rides an invisible `sit:seat` carrier spawned at the low tread of the stair, facing the
stair's open side. Selecting another free stair within three blocks and at most one block higher or lower
teleports the same carrier with the rider still on it: no dismount, no remount, no player teleport. The
destination needs two clear blocks above it, space in front and an unobstructed upper-body path; an
occupied, obstructed or distant chair leaves the current seat alone. A burst of clicks is coalesced to the
latest selected stair; there is no cooldown between distinct chairs. Standing is the normal crouch or
dismount control, or `/sit:stand`; a short cooldown then prevents the gesture from sitting the player
straight back down.

Seats and targets are transient with a ten-second lease the script renews while they are in use. They are
swept every 200 ticks and removed when the rider dismounts, takes damage, dies, disconnects, changes
dimension, moves away, or when the stair changes or loses its headroom.

## Commands

Every command is registered with `cheatsRequired: false` and must be run by a player.

| Command | Permission | Parameters | What it does |
| --- | --- | --- | --- |
| `/sit:down` | Any | none | Sit on the aimed stair, or move your seat there while already seated. Works with held items. |
| `/sit:stand` | Any | none | Stand up from your stair seat. |
| `/sit:help` | Any | none | Show the controls in chat. |
| `/sit:gesture` | Any | `enabled: Boolean` | Enable or disable crouch-release sitting for yourself. Default on. |
| `/sit:button` | Any | `enabled: Boolean` | Enable or disable native Sit targets for yourself. Default on. Crouch and command controls are unaffected. |
| `/sit:height` | Any | `offset: Float` | Seat-height adjustment in blocks, from -0.5 to 0.5; 0 resets. Applies to the next sitting session. |
| `/sit:status` | Any | none | Diagnostics: version, preferences, loaded targets, carrier id, current chair, moves this session, input queue delay, aimed block states. |
| `/sit:clear` | Admin | none | Stand up every rider and remove all loaded seat and target helpers. Target discovery pauses for two seconds. |

## Entities and identifiers

| Identifier | Where | Notes |
| --- | --- | --- |
| `sit:seat` | `entities/stair-sit/seat.json`, `entity/stair-sit/seat.entity.json` | The carrier. Player-only single seat at `[0, -0.35, 0]`, family `sit_seat`, 0.01 collision box, no gravity or collision, transient, unthrottled spatial updates. |
| `sit:target` | `entities/stair-sit/target.json`, `entity/stair-sit/target.entity.json` | The Sit prompt. Not rideable; a 0.9 x 0.6 non-colliding hit area whose `minecraft:interact` entry shows `action.interact.sit67` to non-crouching, empty-handed players who are on foot or already riding a `sit_seat`. |
| `geometry.sit_seat`, `controller.render.sit_seat` | `models/entity/stair-sit/seat.geo.json`, `render_controllers/stair-sit/seat.render_controllers.json` | Shared invisible model and renderer for both entities. |
| `textures/entity/sit_seat.png` | resource pack | 16 x 16 fully transparent texture referenced by both client entities. |

Entity events: `sit:heartbeat` renews the `sit:lease` timer group, `sit:expire` adds `sit:remove`
(instant despawn).

Per-player dynamic properties: `sit:gesture` (boolean, `false` turns the crouch gesture off), `sit:height`
(number, clamped to -0.5 to 0.5) and `sit:button` (boolean, `false` turns Sit targets off). The tag
`ed67_sit_no_button` mirrors `sit:button false` so the target's `has_tag` filter can hide the prompt.

Lang keys, under `## stair-sit` in both `texts/en_US.lang` and `texts/en_GB.lang`:
`action.interact.sit67`, `entity.sit:seat.name`, `entity.sit:target.name`.

## Disabled

`/elleedog67:disable stair-sit` stands every rider up (moved to a safe spot next to the stair when one is
free), removes every loaded `sit:seat` and `sit:target`, and stops the gesture, target discovery and sweep
loops. Block and target clicks are no longer intercepted, and every `sit:*` command answers
"Stair Sitting is disabled. An operator can run /elleedog67:enable stair-sit." Nothing from the feature stays
in the world. Per-player settings persist and apply again after enabling; the usual remount cooldown applies
to anyone who was stood up.

## Known limits

Quoted from the upstream README, "Compatibility and deliberate limits":

- "Upside-down, waterlogged, custom third-party stairs, slabs, carpet, and ground sitting are outside this
  build's scope. No stair blocks are replaced or modified."
- "Empty hands are required for automatic/native sitting to avoid taking over held-item use."
- "A stale target hit by an attack, or interacted with while holding an item/crouching, is hidden for two
  seconds. In multiplayer, another nearby empty-handed player may still keep a shared target active; an
  initial click can encounter that target before suppression."
- "Target discovery is capped at 24 nearby candidates per requesting player and 128 active targets
  globally. Dense stair rooms may have some stairs without a prompt."
- "Scale/performance on large servers has not been established by the small deterministic tests."
- The upstream validation ran against Node test doubles only: "No in-game frame timing, client
  interpolation, native UI rendering, or network latency has been measured." The touch button's icon and
  the seated transition are client-side and have to be checked in the game.

## Manual in-game checks

Use a copy of the world with both packs active, the Content Log enabled and experiments off. Confirm the
add-on version with `/elleedog67:features`.

1. `/sit:status` reports version 0.2.1, Native Sit enabled, "Switch cooldown: 0 ticks; input dispatch:
   ASAP".
2. Place two upright oak stairs side by side with two clear blocks above and space in front. Empty both
   hands and do not crouch. Aim at the first stair's seat or back: a **Sit** action appears (not "Board"
   and not a raw key). Press it. The pose matches the approved 0.1.1 build; no helper geometry or nameplate
   is visible.
3. Still seated, aim at the second stair: Sit stays available. Press it without crouching. Watch from third
   person or as a second player: the player moves straight across with no standing pose, mount flash or
   duplicate player. `/sit:status` keeps the same seat helper id and the move count goes up.
4. Move A to B to A quickly, then A to B to C with a third chair at the edge of reach. The vacated chair's
   prompt comes back without a wait. Repeated taps, a held input and a same-chair click spawn no extra
   carriers.
5. Try all four stair directions, inner and outer corners, a diagonal chair, and one block up and down.
   More than three blocks away or more than one block of rise is refused, as is a wall or diagonal corner
   across the path. Head pitch is kept; facing follows the new chair.
6. Crouch gesture: look at a stair, crouch, uncrouch. `/sit:down` with a pickaxe in hand sits and transfers
   without consuming it. Keyboard right-click and controller Interact work; Attack never sits.
7. Multiplayer: a second player on B blocks your move to B and you keep A. Two players selecting B at once
   cannot share it. After you move A to B, the other player can sit on A at once.
8. Rejections: an upside-down, waterlogged, broken, rotated-while-clicking or blocked target is refused
   without replacing blocks, removing water or moving you.
9. Break A after moving to B: you stay on B. Break B: you stand up and the helpers are gone. Dismount, die,
   take damage or disconnect right after requesting a move: nothing puts you back in the seat.
10. Stay seated for at least 30 seconds (lease renewal), then use crouch/dismount and, another time,
    `/sit:stand`. Confirm the short anti-remount pause after standing.
11. Building: equip blocks, a pickaxe and an offhand shield in turn. Prompts stop and nothing is consumed.
    Crouch while building: a stale target may take one click, then retires. Attack an invisible target: it
    retires for two seconds and later mining reaches the stair. Repeat with a nearby empty-handed second
    player, since targets are shared.
12. `/sit:button false` hides your prompt while the gesture, block use and `/sit:down` keep working;
    `/sit:button true` restores it, also after a world reload. `/sit:height 0.125` raises the next session;
    a change made while seated applies only after standing.
13. `/sit:clear` as an operator stands riders, removes helpers and pauses prompts briefly; a guest cannot run
    it. Ordinary boats keep their normal boarding prompt.
14. `/elleedog67:disable stair-sit` while seated: you stand up, helpers vanish, and `/sit:down` refuses with
    the disabled message. `/elleedog67:enable stair-sit` brings prompts and sitting back without a reload.
15. Reload the world: no helper entities persist. With Pets enabled, transformed players keep their model,
    hands, armor and camera; note any ride-pose artefact separately. No script errors, missing assets or
    raw translation keys in the Content Log.

Record the Bedrock version, device and touch scheme, `/sit:status` before and after, a short third-person
clip, and Content Log lines beginning `[ElleeDog 67 Sit]`. When reporting slowness, say whether it happens
before the move starts or as a visible glide afterwards; the input delay diagnostic only measures the
script queue.
