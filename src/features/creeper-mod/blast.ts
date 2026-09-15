// Creeper Mod, the blast itself. Minecraft fires `world.beforeEvents.explosion` just before a creeper explodes.
// The handler here cancels that explosion, so no blocks break and no animals die, then does its own smaller
// version of the damage to players only. The maths is a simplified copy of the vanilla formula, tuned by hand.
import type {
  Dimension,
  EntityDamageCause,
  ExplosionBeforeEvent,
  GameMode,
  Player,
  System,
  Vector3,
  VectorXZ,
  World,
} from "@minecraft/server";
import { entityId } from "../../core/vanilla.ts";

/** A creeper's explosion power: the vanilla values, 3 normally and 6 once lightning has charged it. */
const NORMAL_POWER = 3;
const CHARGED_POWER = 6;
/** How long, in ticks, a creeper's id is remembered so one detonation is never handled twice. */
const DEDUPE_TICKS = 200;
/** Rays cast per player when checking for cover: 2 across x 2 deep x 3 heights. */
const RAYS_PER_PLAYER = 12;

/**
 * Pure damage tuning for the player-only replacement blast. Health points, not hearts (2 points = 1 heart).
 * This deliberately approximates, rather than promises parity with, vanilla explosions.
 *
 * `distance` is from the blast centre to the player's body and `exposure` is how much of the player is not
 * hidden behind blocks (0 to 1). Damage fades with distance: full at the centre, nothing at the radius.
 */
export function blastDamage(power: number, distance: number, exposure: number, difficulty = "Normal"): number {
  if (![power, distance, exposure].every(Number.isFinite) || power <= 0 || distance < 0) return 0;
  const radius = power * 2;
  if (distance >= radius || exposure <= 0) return 0;
  // `impact` runs from 1 (at the centre, fully exposed) down to 0 (at the edge, or fully covered).
  const impact = (1 - distance / radius) * Math.min(1, exposure);
  const raw = Math.floor((impact * impact + impact) * 7 * power + 1);
  // The same difficulty scaling vanilla applies to mob damage.
  switch (String(difficulty).toLowerCase()) {
    case "peaceful":
      return 0;
    case "easy":
      return Math.min(raw, Math.floor(raw / 2 + 1));
    case "hard":
      return Math.floor(raw * 1.5);
    default:
      return raw;
  }
}

/**
 * How much of a player the blast can "see", from 0 (fully behind blocks) to 1 (out in the open).
 * Twelve rays run from the blast centre to points spread over the player's body; each ray that arrives without
 * hitting a block counts as visible. An unreadable ray counts as covered, which is the safer guess.
 */
export function exposureAt(dimension: Dimension, origin: Vector3, feet: Vector3, headY: number): number {
  const top = Math.max(feet.y + 0.2, headY - 0.05);
  const heights = [feet.y + 0.1, (feet.y + top) / 2, top];
  let visible = 0;
  for (const dx of [-0.23, 0.23])
    for (const dz of [-0.23, 0.23])
      for (const y of heights) {
        const delta = { x: feet.x + dx - origin.x, y: y - origin.y, z: feet.z + dz - origin.z };
        const length = Math.hypot(delta.x, delta.y, delta.z);
        if (length < 0.05) {
          // The sample point is on top of the blast centre: nothing could be in the way.
          visible++;
          continue;
        }
        const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
        try {
          // Stop the ray just short of the sample point so the player's own block never counts as cover.
          const hit = dimension.getBlockFromRay(origin, direction, {
            maxDistance: Math.max(0.01, length - 0.04),
            includeLiquidBlocks: false,
            includePassableBlocks: false,
          });
          if (!hit) visible++;
        } catch {
          /* An unloaded/unreadable ray is not proof of exposure. */
        }
      }
  return visible / RAYS_PER_PLAYER;
}

/** The engine objects the handler touches, passed in so tests can run it without Minecraft. */
export interface CreeperHandlerDependencies {
  world: World;
  system: System;
  GameMode: typeof GameMode;
  EntityDamageCause: typeof EntityDamageCause;
  warn?: (message: string) => void;
}

/** A player sampled at detonation time; damage and knockback are applied on the next tick. */
interface BlastSnapshot {
  player: Player;
  damage: number;
  horizontal: VectorXZ;
  vertical: number;
}

/**
 * Builds the explosion handler. The engine objects it needs are passed in rather than imported (this is called
 * dependency injection), so the tests can hand in fakes and run the whole handler without Minecraft.
 * Only getPlayers() is used for blast targets; no entity-damage sweep is performed.
 */
export function createCreeperHandler({
  world,
  system,
  GameMode: gameMode,
  EntityDamageCause: damageCause,
  warn = console.warn,
}: CreeperHandlerDependencies): (event: ExplosionBeforeEvent) => void {
  /** Creeper id -> the tick its explosion was handled, so a repeat event for the same creeper is ignored. */
  const processed = new Map<string, number>();
  return function onExplosion(event: ExplosionBeforeEvent): void {
    const source = event.source;
    // TNT, beds, crystals and every other explosion stay vanilla; only creepers are replaced.
    if (source?.typeId !== entityId("minecraft:creeper")) return;

    // Cancel first. Emptying the block list alone DOES NOT protect items and mobs.
    event.cancel = true;
    const tick = system.currentTick;
    // Forget creepers whose blast is long over, so the map cannot grow forever on a busy server.
    for (const [id, at] of processed) if (tick - at > DEDUPE_TICKS) processed.delete(id);
    if (processed.has(source.id)) return;
    processed.set(source.id, tick);

    // Phase 1, this tick and read-only: a before-event may not change the world, so only measure each player now
    // and remember the result. Phase 2 below applies it once the engine allows writes again.
    let dimension: Dimension | undefined;
    let origin: Vector3 | undefined;
    const snapshots: BlastSnapshot[] = [];
    try {
      dimension = source.dimension;
      const feet = source.location;
      // The blast centre sits at the creeper's chest rather than its feet.
      origin = { x: feet.x, y: feet.y + 0.8, z: feet.z };
      const power = source.getComponent("minecraft:is_charged") ? CHARGED_POWER : NORMAL_POWER;
      const radius = power * 2;
      const difficulty = world.getDifficulty();
      // getPlayers measures to a player's feet while the check below uses the body centre, so search a bit wider.
      for (const player of dimension.getPlayers({ location: origin, maxDistance: radius + 2 })) {
        try {
          const mode = player.getGameMode();
          if (mode !== gameMode.Survival && mode !== gameMode.Adventure) continue;
          const feet = player.location;
          const head = player.getHeadLocation();
          const body = { x: feet.x, y: (feet.y + head.y) / 2, z: feet.z };
          const delta = { x: body.x - origin.x, y: body.y - origin.y, z: body.z - origin.z };
          const distance = Math.hypot(delta.x, delta.y, delta.z);
          if (distance >= radius) continue;
          const exposure = exposureAt(dimension, origin, feet, head.y);
          const damage = blastDamage(power, distance, exposure, difficulty);
          if (damage <= 0) continue;
          // Knockback pushes straight away from the blast, harder when closer and more exposed; it always lifts a
          // little so a player standing right on the creeper is still thrown.
          const impact = Math.max(0, 1 - distance / radius) * exposure;
          const horizontalLength = Math.hypot(delta.x, delta.z);
          snapshots.push({
            player,
            damage,
            horizontal:
              horizontalLength < 0.001
                ? { x: 0, z: 0 }
                : {
                    x: (delta.x / horizontalLength) * impact * 0.8,
                    z: (delta.z / horizontalLength) * impact * 0.8,
                  },
            vertical: Math.max(0.05, impact * 0.35),
          });
        } catch (error) {
          warn(`Cannot sample player: ${error}`);
        }
      }
    } catch (error) {
      // Leave the native explosion cancelled even when sampling fails.
      warn(`Explosion cancelled; sampling failed: ${error}`);
    }

    // Phase 2, the next writable moment: `system.run` schedules a callback for the earliest tick the engine lets a
    // script change the world again. Everything it uses was captured above; the event object itself is not kept.
    system.run(() => {
      // remove(), not kill(): no kill-induced loot, XP, or chain damage.
      // The native fuse may already have consumed the creeper despite cancellation.
      try {
        if (source.isValid) source.remove();
      } catch (error) {
        warn(`Detonator cleanup: ${error}`);
      }
      if (!dimension || !origin) return;
      // The look and sound of a vanilla explosion, without any of its effects.
      try {
        dimension.spawnParticle("minecraft:huge_explosion_emitter", origin);
      } catch (error) {
        warn(`Visual effect: ${error}`);
      }
      try {
        dimension.playSound("random.explode", origin, { volume: 1, pitch: 1 });
      } catch (error) {
        warn(`Sound effect: ${error}`);
      }
      for (const hit of snapshots) {
        try {
          const player = hit.player;
          // A tick has passed: make sure the player is still here and still in a mode that takes damage.
          if (!player.isValid || player.dimension.id !== dimension.id) continue;
          const mode = player.getGameMode();
          if (mode !== gameMode.Survival && mode !== gameMode.Adventure) continue;
          const hurt = player.applyDamage(hit.damage, { cause: damageCause.entityExplosion });
          if (hurt) player.applyKnockback(hit.horizontal, hit.vertical);
        } catch (error) {
          warn(`Player damage: ${error}`);
        }
      }
    });
  };
}
