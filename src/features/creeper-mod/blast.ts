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

/** Pure damage tuning for the player-only replacement blast. Health points, not hearts.
 * This deliberately approximates, rather than promises parity with, vanilla explosions.
 */
export function blastDamage(power: number, distance: number, exposure: number, difficulty = "Normal"): number {
  if (![power, distance, exposure].every(Number.isFinite) || power <= 0 || distance < 0) return 0;
  const radius = power * 2;
  if (distance >= radius || exposure <= 0) return 0;
  const impact = (1 - distance / radius) * Math.min(1, exposure);
  const raw = Math.floor((impact * impact + impact) * 7 * power + 1);
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

/** Twelve rays sample a player's body; an unreadable ray counts as covered. */
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
          visible++;
          continue;
        }
        const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
        try {
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
  return visible / 12;
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
 * Dependency injection allows the actual event handler to be tested without Minecraft.
 * Only getPlayers() is used for blast targets; no entity-damage sweep is performed.
 */
export function createCreeperHandler({
  world,
  system,
  GameMode: gameMode,
  EntityDamageCause: damageCause,
  warn = console.warn,
}: CreeperHandlerDependencies): (event: ExplosionBeforeEvent) => void {
  const processed = new Map<string, number>();
  return function onExplosion(event: ExplosionBeforeEvent): void {
    const source = event.source;
    if (source?.typeId !== "minecraft:creeper") return;

    // Cancel first. Emptying the block list alone DOES NOT protect items and mobs.
    event.cancel = true;
    const tick = system.currentTick;
    for (const [id, at] of processed) if (tick - at > 200) processed.delete(id);
    if (processed.has(source.id)) return;
    processed.set(source.id, tick);

    let dimension: Dimension | undefined;
    let origin: Vector3 | undefined;
    const snapshots: BlastSnapshot[] = [];
    try {
      dimension = source.dimension;
      const feet = source.location;
      origin = { x: feet.x, y: feet.y + 0.8, z: feet.z };
      const power = source.getComponent("minecraft:is_charged") ? 6 : 3;
      const difficulty = world.getDifficulty();
      for (const player of dimension.getPlayers({ location: origin, maxDistance: power * 2 + 2 })) {
        try {
          const mode = player.getGameMode();
          if (mode !== gameMode.Survival && mode !== gameMode.Adventure) continue;
          const feet = player.location;
          const head = player.getHeadLocation();
          const body = { x: feet.x, y: (feet.y + head.y) / 2, z: feet.z };
          const delta = { x: body.x - origin.x, y: body.y - origin.y, z: body.z - origin.z };
          const distance = Math.hypot(delta.x, delta.y, delta.z);
          if (distance >= power * 2) continue;
          const exposure = exposureAt(dimension, origin, feet, head.y);
          const damage = blastDamage(power, distance, exposure, difficulty);
          if (damage <= 0) continue;
          const impact = Math.max(0, 1 - distance / (power * 2)) * exposure;
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
          warn(`[67 Creeper Mod] Cannot sample player: ${error}`);
        }
      }
    } catch (error) {
      // Leave the native explosion cancelled even when sampling fails.
      warn(`[67 Creeper Mod] Explosion cancelled; sampling failed: ${error}`);
    }

    system.run(() => {
      // remove(), not kill(): no kill-induced loot, XP, or chain damage.
      // The native fuse may already have consumed the creeper despite cancellation.
      try {
        if (source.isValid) source.remove();
      } catch (error) {
        warn(`[67 Creeper Mod] Detonator cleanup: ${error}`);
      }
      if (!dimension || !origin) return;
      try {
        dimension.spawnParticle("minecraft:huge_explosion_emitter", origin);
      } catch (error) {
        warn(`[67 Creeper Mod] Visual effect: ${error}`);
      }
      try {
        dimension.playSound("random.explode", origin, { volume: 1, pitch: 1 });
      } catch (error) {
        warn(`[67 Creeper Mod] Sound effect: ${error}`);
      }
      for (const hit of snapshots) {
        try {
          const player = hit.player;
          if (!player.isValid || player.dimension.id !== dimension.id) continue;
          const mode = player.getGameMode();
          if (mode !== gameMode.Survival && mode !== gameMode.Adventure) continue;
          const hurt = player.applyDamage(hit.damage, { cause: damageCause.entityExplosion });
          if (hurt) player.applyKnockback(hit.horizontal, hit.vertical);
        } catch (error) {
          warn(`[67 Creeper Mod] Player damage: ${error}`);
        }
      }
    });
  };
}
