import { protectionBox } from "./geometry.js";
export const GATE_PROPERTY = "elleedog:may_move_blocks";

/** Tick-sampled conservative gating, not a cancellable per-block pickup event.
 * A movement jump gets a two-tick hold after being observed. This does not prove
 * protection against a pickup in the SAME native tick as an unobserved teleport.
 */
export function shouldAllowMovement(store, position, dimension, previous, tick) {
  if (!store || store.faulted) return { allowed: false, holdUntil: tick + 2 };
  let holdUntil = previous?.holdUntil ?? tick + 1;
  if (previous && (previous.dimension !== dimension ||
      Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z) > 1.5)) {
    holdUntil = tick + 2;
  }
  if (tick <= holdUntil) return { allowed: false, holdUntil };
  return { allowed: !store.intersects(dimension, protectionBox(position)), holdUntil };
}
