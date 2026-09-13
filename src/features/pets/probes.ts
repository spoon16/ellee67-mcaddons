/** Explicitly requested stationary test props. Not substitutes for the player. */
import type { Entity, Player, Vector3 } from "@minecraft/server";
import type { DimensionLike, Pet, PlayerLike } from "./core.ts";

export const PROBE_TYPES = Object.freeze(["pet:diag_cube", "pet:diag_model"] as const);
export const OWNER_KEY = "pet:probe_owner";
// Loaded diagnostic props created by earlier builds can still be cleaned up safely.
export const LEGACY_PROBE_TYPES = Object.freeze(["cav:diag_cube", "cav:diag_model"] as const);
export const LEGACY_OWNER_KEY = "cav:probe_owner";
const DIMENSIONS = ["overworld", "nether", "the_end"];

/** What a spawned prop needs to expose: ownership, naming, the model property and removal. */
export type ProbeEntity = Pick<
  Entity,
  "id" | "nameTag" | "setProperty" | "setDynamicProperty" | "setRotation" | "remove"
> & {
  getDynamicProperty(identifier: string): unknown;
};
export interface ProbeDimension extends DimensionLike {
  spawnEntity(identifier: string, location: Vector3): ProbeEntity;
  getEntities(options: { type?: string }): ReadonlyArray<Pick<ProbeEntity, "getDynamicProperty" | "remove">>;
}
export interface ProbeWorld {
  getDimension(id: string): ProbeDimension;
}
export type ProbeSubject = PlayerLike &
  Pick<Player, "getViewDirection" | "getRotation"> & { readonly dimension: ProbeDimension };
export interface ProbeRecord {
  id: string;
  type: string;
  location: Vector3;
}

export function positionsFor(player: ProbeSubject): [Vector3, Vector3] {
  const p = player.location;
  const v = player.getViewDirection();
  const length = Math.hypot(v.x, v.z);
  if (!Number.isFinite(length) || length < 0.05) {
    throw new Error("Look horizontally across open, level ground, then retry /pet:probe.");
  }
  const forward = { x: v.x / length, z: v.z / length };
  const right = { x: -forward.z, z: forward.x };
  const beside = (side: number): Vector3 => ({
    x: p.x + forward.x * 3.5 + right.x * 1.0 * side,
    y: p.y + 0.05,
    z: p.z + forward.z * 3.5 + right.z * 1.0 * side,
  });
  return [beside(-1), beside(1)];
}

export function cleanupProbes(world: ProbeWorld, playerId: string): { removed: number; errors: string[] } {
  let removed = 0;
  const errors: string[] = [];
  const targets = [
    ...PROBE_TYPES.map((type) => ({ type, ownerKey: OWNER_KEY })),
    ...LEGACY_PROBE_TYPES.map((type) => ({ type, ownerKey: LEGACY_OWNER_KEY })),
  ];
  for (const dimensionId of DIMENSIONS) {
    try {
      const dimension = world.getDimension(dimensionId);
      for (const { type, ownerKey } of targets) {
        for (const entity of dimension.getEntities({ type })) {
          try {
            if (entity.getDynamicProperty(ownerKey) === playerId) {
              entity.remove();
              removed++;
            }
          } catch (error) {
            errors.push(String(error));
          }
        }
      }
    } catch (error) {
      errors.push(`${dimensionId}: ${String(error)}`);
    }
  }
  return { removed, errors };
}

export function spawnProbes(world: ProbeWorld, player: ProbeSubject, pet: Pet): ProbeRecord[] {
  const positions = positionsFor(player);
  // No force-loading or editing blocks. Abort before spawning if the target space is occupied.
  for (const pos of positions) {
    for (const dx of [-0.5, 0.5]) {
      for (const dz of [-0.75, 0.75]) {
        for (const dy of [0.0, 0.8, 1.3]) {
          const block = player.dimension.getBlock({
            x: Math.floor(pos.x + dx),
            y: Math.floor(pos.y + dy),
            z: Math.floor(pos.z + dz),
          });
          if (!block?.isAir) {
            throw new Error(
              "The probe area is not clear. Stand on open, level ground with at least five clear blocks ahead.",
            );
          }
        }
      }
    }
  }
  const clean = cleanupProbes(world, player.id);
  if (clean.errors.length) throw new Error(`Could not safely clear the old probe pair: ${clean.errors.join("; ")}`);
  const plan: Array<[string, Vector3]> = [
    [PROBE_TYPES[0], positions[0]],
    [PROBE_TYPES[1], positions[1]],
  ];
  const made: ProbeEntity[] = [];
  const records: ProbeRecord[] = [];
  try {
    plan.forEach(([type, location], i) => {
      const entity = player.dimension.spawnEntity(type, location);
      made.push(entity); // Track immediately, so a later assignment error still gets cleaned up.
      entity.setDynamicProperty(OWNER_KEY, player.id);
      entity.nameTag = i === 0 ? "Pets R8 cube" : `${pet.display_name} - static test model`;
      if (i === 1) entity.setProperty("pet:model_id", pet.wire_id);
      entity.setRotation({ x: 0, y: player.getRotation().y + 180 });
      records.push({ id: entity.id, type, location });
    });
    return records;
  } catch (error) {
    for (const e of made) {
      try {
        e.remove();
      } catch {
        /* Native expiry timer remains a backup. */
      }
    }
    throw error;
  }
}
