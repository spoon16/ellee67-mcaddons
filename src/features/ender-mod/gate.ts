// The decision itself: may this enderman move blocks right now? Pure logic with no engine calls, so the tests can
// feed it positions and ticks directly.
import type { Vector3 } from "@minecraft/server";
import { protectionBox } from "./geometry.ts";
import type { ProtectionStore } from "./store.ts";

/** The entity property the enderman override reads; its block-moving behaviours only run while it is true. */
export const GATE_PROPERTY = "elleedog:may_move_blocks";

/** Where an Enderman was last observed, and the tick until which its block moves stay denied. */
export interface Sighting extends Vector3 {
  dimension: string;
  holdUntil: number;
  /** The block the last evaluation was made for, and the store generation it saw; the scan reuses a match. */
  blockKey?: string;
  generation?: number;
}

export interface MovementGate {
  allowed: boolean;
  holdUntil: number;
}

/** Tick-sampled conservative gating, not a cancellable per-block pickup event.
 * A movement jump gets a two-tick hold after being observed. This does not prove
 * protection against a pickup in the SAME native tick as an unobserved teleport.
 */
export function shouldAllowMovement(
  store: ProtectionStore | undefined,
  position: Vector3,
  dimension: string,
  previous: Sighting | undefined,
  tick: number,
): MovementGate {
  // No store, or a store that hit a storage error, means the protected blocks are unknown: deny everything.
  if (!store || store.faulted) return { allowed: false, holdUntil: tick + 2 };
  // A first sighting is held for one tick, so a freshly loaded enderman is denied until it has been seen twice.
  let holdUntil = previous?.holdUntil ?? tick + 1;
  // Endermen teleport. A jump of more than 1.5 blocks (or a dimension change) since last tick means the position
  // the engine reports may lag the real one, so deny for two ticks while it settles.
  if (
    previous &&
    (previous.dimension !== dimension ||
      Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z) > 1.5)
  ) {
    holdUntil = tick + 2;
  }
  if (tick <= holdUntil) return { allowed: false, holdUntil };
  // The normal case: allowed unless anything protected lies inside the box the enderman could reach.
  return { allowed: !store.intersects(dimension, protectionBox(position)), holdUntil };
}
