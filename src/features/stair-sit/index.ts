// Stair Sitting: the engine glue. Minecraft has no "sit" for players, so the feature borrows riding: it spawns an
// invisible, tiny, rideable entity (`sit:seat`) at the stair and puts the player on it, as if on a boat.
//
// The pieces:
//   seats.ts    SeatManager: creates the seat entity, mounts the player, moves a seated player between stairs,
//               stands them up, and checks every tick that the seat is still sound.
//   targets.ts  InteractionTargets: the Sit button on touch and controllers only appears for a rideable entity,
//               and the seat does not exist until the player sits. So a second invisible entity (`sit:target`) is
//               placed on each free stair near a player, purely to show the prompt. Tapping it becomes a sit.
//   stairs.ts   Pure geometry: is this block a stair, where is its seat, which way does a sitter face.
//   this file   Three ways to sit (Sit button, crouch-release gesture, `/sit:down`), the `/sit:*` commands, and
//               the events that stand a player up.
// Both helper entities expire on their own unless the script keeps sending them `sit:heartbeat`, so a crash or a
// removed pack leaves nothing behind.
import {
  CommandPermissionLevel,
  type CustomCommandOrigin,
  type CustomCommandParameter,
  CustomCommandParamType,
  CustomCommandStatus,
  type Player,
  system,
  world,
} from "@minecraft/server";
import type { FeatureDefinition, FeatureRegistries } from "../../core/feature.ts";
import type { FeatureContext } from "../../core/subscriptions.ts";
import { entityId } from "../../core/vanilla.ts";
import { CONFIG } from "./config.ts";
import { log } from "./log.ts";
import { aimedBlock, emptyHands, readStair, ridingEntity, SeatManager, type SitResult, valid } from "./seats.ts";
import { gestureComplete, type StairDescription } from "./stairs.ts";
import { InteractionTargets } from "./targets.ts";

/** One player's crouch gesture: whether they were crouching last tick, and the stair they aimed at when it began. */
interface GestureState {
  crouching: boolean;
  armed?: { key: string; tick: number };
}

/** A sit that has been asked for but not yet done, as plain values that stay valid after the event ends. */
interface StairRequest {
  position: { x: number; y: number; z: number };
  dimensionId: string;
  fingerprint: string;
  requestedTick: number;
}

/** A pending sit for one player; `sourceSeat` is the seat they were on when asked, so a stale request is ignored. */
interface PendingToken {
  sourceSeat: string | undefined;
  request: StairRequest;
}

type CommandAction = (player: Player, ...args: any[]) => void;

const manager = new SeatManager(world, system);
const targets = new InteractionTargets(world, system, manager);
const gestures = new Map<string, GestureState>();
const pending = new Map<string, PendingToken>();
/** The outcome of each player's latest sit attempt, for `/sit:status` and the GameTests. */
const lastResults = new Map<string, { ok: boolean; error?: string }>();

/** What the scripts know about one player's sitting state. Read by the GameTests and free for `/sit:status`. */
export function stairSitDiagnostics(playerId: string): {
  seated: boolean;
  onCooldown: boolean;
  lastResult?: { ok: boolean; error?: string };
} {
  return {
    seated: manager.get(playerId) !== undefined,
    onCooldown: manager.onCooldown(playerId),
    lastResult: lastResults.get(playerId),
  };
}

/**
 * Records a sit attempt and refreshes the player's targets after a success. Only an explicit command reports a
 * refusal in chat: the Sit button and the crouch gesture are implicit, and a chat line for every near miss (a
 * held item, a stair one block too far) is noise. The reason still lands in `/sit:status`.
 */
function showResult(player: Player, result: SitResult, explicit: boolean): void {
  lastResults.set(player.id, result.ok ? { ok: true } : { ok: false, error: result.error });
  if (!result.ok) {
    if (explicit) manager.message(player, result.error);
    return;
  }
  if (!result.alreadyThere) targets.refreshForPlayer(player, result.vacatedStair);
}

/** Runs a command's action on the next tick, since a command callback itself may not change the world. */
function deferred(player: Player, action: () => void): void {
  // World mutations are illegal inside before-event and command callbacks.
  // Capture values before scheduling; never retain mutable event objects.
  system.runTimeout(() => {
    if (!valid(player)) return;
    try {
      action();
    } catch (error) {
      log.warn(`command failed: ${log.describe(error)}`);
      manager.message(player, "That did not work; the Content Log has the reason.");
    }
  }, 0);
}

/**
 * Coalesce an input burst to its LATEST selected stair, without a time cooldown.
 * Exactly one non-recursive ASAP callback per pending player/session. Mutations
 * still happen outside before-events' restricted execution, never inline.
 *
 * In plain words: a touch screen can send several taps in one tick. Rather than sit, stand and sit again, the
 * first tap schedules the work and every later tap in the same burst just replaces which stair it will use.
 */
function queueStair(player: Player, stair: StairDescription): void {
  const playerId = player.id;
  const sourceSeat: string | undefined = manager.get(playerId)?.seat.id;
  const request: StairRequest = {
    position: { ...stair.location },
    dimensionId: stair.dimensionId,
    fingerprint: stair.fingerprint,
    requestedTick: system.currentTick,
  };
  const existing = pending.get(playerId);
  if (existing && existing.sourceSeat === sourceSeat && existing.request.dimensionId === request.dimensionId) {
    existing.request = request;
    return;
  }
  const token: PendingToken = { sourceSeat, request };
  pending.set(playerId, token);
  // 0 = current tick / earliest available writable callback, not a timed wait.
  // Do not self-schedule here: zero-delay recursive callbacks can starve a tick.
  system.runTimeout(() => {
    // A newer token means this request was superseded; the newer callback will handle it.
    if (pending.get(playerId) !== token) return;
    pending.delete(playerId);
    const { position, dimensionId, fingerprint, requestedTick } = token.request;
    if (!valid(player) || player.dimension.id !== dimensionId || manager.get(playerId)?.seat.id !== sourceSeat) return;
    try {
      const block = player.dimension.getBlock(position);
      const actual = readStair(block);
      // The stair changed between the click and this tick; the next click reads the new one.
      if (!actual || actual.fingerprint !== fingerprint) return;
      const result = manager.sit(player, block, true);
      if (result.ok) {
        const record = manager.get(playerId);
        if (record) record.lastInputDelayTicks = Math.max(0, system.currentTick - requestedTick);
      }
      showResult(player, result, false);
    } catch (error) {
      log.warn(`queued sit failed: ${log.describe(error)}`);
    }
  }, 0);
}

/**
 * Runs every tick. Drives the seat checks and the crouch-release gesture, which is a small state machine per
 * player: crouch starts while aiming at a stair -> "armed"; crouch ends while still aiming at the same stair,
 * after a deliberate hold -> sit. Anything else disarms it.
 */
function tickGestures(): void {
  manager.tick();
  const online = new Set<string>();
  for (const player of world.getAllPlayers()) {
    online.add(player.id);
    try {
      const tick = system.currentTick;
      const crouching = player.isSneaking;
      const previous = gestures.get(player.id);
      const state: GestureState = { crouching, armed: previous?.armed };
      gestures.set(player.id, state);
      // Gesture turned off, already seated, just stood up, or riding something else: nothing to arm.
      if (
        player.getDynamicProperty(CONFIG.gestureProperty) === false ||
        manager.get(player.id) ||
        manager.onCooldown(player.id) ||
        ridingEntity(player)
      ) {
        state.armed = undefined;
        continue;
      }
      if (crouching && !previous?.crouching) {
        // Crouch just began: remember the stair being looked at, if any.
        const stair = emptyHands(player) ? readStair(aimedBlock(player)) : undefined;
        state.armed = stair ? { key: stair.key, tick } : undefined;
      } else if (!crouching && previous?.crouching) {
        // Crouch just ended: sit if it was the gesture, then disarm either way.
        const block = aimedBlock(player);
        const stair = emptyHands(player) ? readStair(block) : undefined;
        if (gestureComplete(previous.armed, tick, stair?.key))
          showResult(player, manager.sit(player, block, true), false);
        state.armed = undefined;
      }
    } catch (error) {
      log.throttled(
        `gesture:${player.id}`,
        system.currentTick,
        CONFIG.sweepInterval,
        `gesture failed: ${log.describe(error)}`,
      );
      gestures.delete(player.id);
    }
  }
  for (const id of gestures.keys()) if (!online.has(id)) gestures.delete(id);
}

/** Drops everything remembered about a player who left, died or respawned. */
function forgetPlayer(playerId: string): void {
  manager.forget(playerId);
  targets.forget(playerId);
  gestures.delete(playerId);
  pending.delete(playerId);
  lastResults.delete(playerId);
}

function registerCommands({ commands }: FeatureRegistries): void {
  // A small helper so each command below is one call: it checks the sender is a player and defers the action.
  function register(
    name: string,
    description: string,
    action: CommandAction,
    parameters: CustomCommandParameter[] = [],
    permissionLevel: CommandPermissionLevel = CommandPermissionLevel.Any,
  ): void {
    commands.registerCommand(
      {
        name,
        description,
        permissionLevel,
        cheatsRequired: false,
        ...(parameters.length ? { mandatoryParameters: parameters } : {}),
      },
      (origin: CustomCommandOrigin, ...args: any[]) => {
        const player = origin.sourceEntity;
        if (player?.typeId !== entityId("minecraft:player")) {
          return { status: CustomCommandStatus.Failure, message: "Run this command as a player in the world." };
        }
        deferred(player as Player, () => action(player as Player, ...args));
        return { status: CustomCommandStatus.Success };
      },
    );
  }
  register("sit:down", "Sit on, or move your seat to, the nearby stair you are looking at", (player) => {
    showResult(player, manager.sit(player, aimedBlock(player), false), true);
  });
  register("sit:stand", "Stand up from your stair seat", (player) => {
    if (!manager.release(player.id, true)) manager.message(player, "You are not sitting on one of these stair seats.");
  });
  register("sit:help", "Show stair sitting controls", (player) => {
    manager.message(
      player,
      [
        `Stair Sitting ${CONFIG.version}`,
        "Empty hands: look at a dry, upright stair and press Sit / Use / Interact.",
        "While seated, use a nearby free stair to move there without standing.",
        "Touch fallback: look at the stair, crouch, then uncrouch to sit.",
        "Crouch / Dismount to stand, or /sit:stand.",
        "/sit:down also moves between chairs and works with held items.",
        "/sit:button false disables Sit targets for you; true enables them.",
        "/sit:gesture false disables crouch-to-sit; true enables it.",
        "/sit:height 0 resets your seat-height adjustment.",
        "/sit:status shows diagnostics. /sit:clear is operator-only.",
      ].join("\n"),
    );
  });
  // Per-player settings are dynamic properties on the player, so they survive leaving and rejoining.
  register(
    "sit:gesture",
    "Enable or disable crouch-release sitting for yourself",
    (player, enabled: boolean) => {
      player.setDynamicProperty(CONFIG.gestureProperty, enabled);
      gestures.delete(player.id);
      manager.message(player, `Crouch-release sitting is ${enabled ? "enabled" : "disabled"}.`);
    },
    [{ name: "enabled", type: CustomCommandParamType.Boolean }],
  );
  register(
    "sit:button",
    "Enable or disable native Sit interaction targets for yourself",
    (player, enabled: boolean) => {
      targets.setEnabled(player, enabled);
      manager.message(player, `Native Sit button is ${enabled ? "enabled" : "disabled"}.`);
    },
    [{ name: "enabled", type: CustomCommandParamType.Boolean }],
  );
  register(
    "sit:height",
    "Adjust your seat height in blocks, from -0.5 to 0.5",
    (player, offset: number) => {
      if (!Number.isFinite(offset) || offset < CONFIG.minHeightOffset || offset > CONFIG.maxHeightOffset) {
        manager.message(player, "Use a number between -0.5 and 0.5. Zero resets the adjustment.");
        return;
      }
      player.setDynamicProperty(CONFIG.heightProperty, offset);
      manager.message(player, `Seat-height adjustment: ${offset} blocks. It takes effect the next time you sit.`);
    },
    [{ name: "offset", type: CustomCommandParamType.Float }],
  );
  register("sit:status", "Show stair sitting diagnostics", (player) => {
    const block = aimedBlock(player);
    const stair = readStair(block);
    const seat = manager.get(player.id);
    const last = lastResults.get(player.id);
    let states = "none";
    try {
      if (block) states = JSON.stringify(block.permutation.getAllStates());
    } catch {
      /* Diagnostic only. */
    }
    manager.message(
      player,
      [
        `Version ${CONFIG.version}; target Bedrock 26.40+; server API 2.9.0`,
        `Seated: ${!!seat}; active seats: ${manager.byPlayer.size}`,
        `Native Sit: ${targets.enabled(player)}; loaded targets: ${targets.byBlock.size}`,
        `Seat helper: ${seat?.seat.id ?? "none"}; moves this session: ${seat?.transfers ?? 0}`,
        `Current chair: ${seat?.stair.key ?? "none"}; transfer limit: ${CONFIG.transferReach} blocks`,
        `Last attempt: ${last ? (last.ok ? "ok" : last.error) : "none"}`,
        `Last button/block input delay: ${seat?.lastInputDelayTicks ?? "n/a"} server ticks (not client display latency)`,
        `Gesture: ${player.getDynamicProperty(CONFIG.gestureProperty) !== false}; height: ${manager.height(player)}`,
        `Target: ${block?.typeId ?? "none"}; valid dry upright stair: ${!!stair}`,
        `States: ${states}`,
      ].join("\n"),
    );
  });
  register(
    "sit:clear",
    "Stand up all riders and remove loaded stair-seat helpers",
    (player) => {
      const count = manager.sweep(true) + targets.sweep(true);
      manager.message(
        player,
        `Removed ${count} loaded seat/interaction helper(s). Sit targets pause for two seconds. Stairs and other entities were not changed.`,
      );
    },
    [],
    CommandPermissionLevel.Admin,
  );
}

function subscribe(ctx: FeatureContext): void {
  // Using a stair block directly: the Use button on a computer, or a tap on touch when no target is present.
  ctx.on(world.beforeEvents.playerInteractWithBlock, (event) => {
    try {
      // `isFirstEvent`: one click can fire for both hands; only the first counts.
      if (event.cancel || !event.isFirstEvent || event.itemStack) return;
      const player = event.player;
      if (player.isSneaking || !emptyHands(player) || manager.onCooldown(player.id)) return;
      const stair = readStair(event.block);
      if (!stair) return;
      // Cancel so the engine does not also treat the click as, say, opening a door behind the stair.
      event.cancel = true;
      queueStair(player, stair);
    } catch (error) {
      log.warnOnce("interact-block", `block interaction failed: ${log.describe(error)}`);
    }
  });

  // Using one of the helper entities: the Sit button lands here.
  ctx.on(world.beforeEvents.playerInteractWithEntity, (event) => {
    try {
      if (event.cancel) return;
      // Carriers are managed exclusively by the script, not native second-vehicle boarding.
      if (event.target.typeId === CONFIG.entityId) {
        event.cancel = true;
        return;
      }
      if (event.target.typeId !== CONFIG.targetEntityId) return;
      const record = targets.get(event.target.id);
      const player = event.player;
      if (!record) {
        event.cancel = true;
        return;
      }
      if (event.itemStack || player.isSneaking || !emptyHands(player) || !targets.enabled(player)) {
        // Leave non-sitting interactions uncanceled; retire a stale hit target so
        // it cannot repeatedly intercept building/mining. Mutation is deferred.
        const key = record.stair.key;
        system.run(() => targets.suppress(key));
        return;
      }
      event.cancel = true;
      if (manager.onCooldown(player.id)) return;
      // Use the actual clicked target, NOT center-screen aim. Essential for touch
      // modes where the player taps a neighboring stair away from the crosshair.
      queueStair(player, record.stair);
    } catch (error) {
      log.warnOnce("interact-entity", `target interaction failed: ${log.describe(error)}`);
    }
  });

  // Hitting a target (mining or attacking through it) means the player wants the block, not a seat.
  ctx.on(world.afterEvents.entityHitEntity, ({ hitEntity }) => {
    try {
      if (hitEntity.typeId !== CONFIG.targetEntityId) return;
      const record = targets.get(hitEntity.id);
      if (record) targets.suppress(record.stair.key);
    } catch {
      /* Target expired during the attack. */
    }
  });

  // A stair placed or broken next to a standing player must show up without the player moving.
  ctx.on(world.afterEvents.playerPlaceBlock, () => targets.blocksChanged());
  ctx.on(world.afterEvents.playerBreakBlock, () => targets.blocksChanged());

  // Three timers at three speeds: every tick for gestures and seat checks, often for target discovery, and
  // rarely for the sweep that removes orphaned helpers.
  ctx.every(CONFIG.tickInterval, tickGestures);
  ctx.every(CONFIG.targetScanInterval, () => targets.refresh());
  ctx.every(CONFIG.sweepInterval, () => {
    manager.sweep();
    targets.sweep();
  });

  ctx.on(world.afterEvents.playerLeave, ({ playerId }) => forgetPlayer(playerId));
  ctx.on(world.afterEvents.playerSpawn, ({ player }) => forgetPlayer(player.id));
  // Dying or taking damage stands the player up, so a seated player is never stuck in a fight.
  ctx.on(world.afterEvents.entityDie, ({ deadEntity }) => {
    if (deadEntity.typeId === entityId("minecraft:player")) {
      pending.delete(deadEntity.id);
      manager.release(deadEntity.id);
    }
  });
  ctx.on(world.afterEvents.entityHurt, ({ hurtEntity, damage }) => {
    if (damage > 0 && hurtEntity.typeId === entityId("minecraft:player")) {
      pending.delete(hurtEntity.id);
      manager.release(hurtEntity.id, true);
    }
  });
  // Native dismount is the primary control. Explicit jump support is deliberately
  // not added: jump differs by touch/control scheme and must not affect other mounts.
}

/**
 * Sit on vanilla stairs with the native Sit button, a crouch-release gesture or `/sit:down`, and move between
 * nearby stairs while seated. Invisible `sit:seat` carriers and `sit:target` interaction helpers are transient and
 * swept while the feature runs. Deactivating the pack removes both entity definitions with it. The feature says
 * nothing in chat on its own: `/sit:help` is the way to learn the controls.
 */
export const stairSit: FeatureDefinition = {
  id: "stair-sit",
  title: "Stair Sitting",
  register: registerCommands,
  start(ctx) {
    resetState();
    subscribe(ctx);
    // Helpers left over from before the reload are removed once the world is writable.
    system.run(() => {
      manager.sweep();
      targets.sweep();
    });
  },
};

/** Clears the module state so a second world load (or the next test) starts clean. Helpers are swept by `start`. */
function resetState(): void {
  manager.reset();
  targets.reset();
  gestures.clear();
  pending.clear();
  lastResults.clear();
  log.reset();
}

/** Stands every rider up, removes every helper and clears the module state. Tests call it between worlds. */
export function shutdownStairSit(): void {
  manager.sweep(true);
  targets.sweep(true);
  resetState();
}
