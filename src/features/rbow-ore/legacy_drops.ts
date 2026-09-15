/** Compatibility loader for items saved inside the old 1.1.3/1.1.4 drop entities.
 * No new custom entities, damage handlers, collection loop or ordinary-item scan.
 * Retained for old chunks that may not be visited until a future play session.
 *
 * Background: Rbow 1.1.x stored a mined item inside a small custom entity instead of dropping it on the ground.
 * Such entities can still sit in chunks nobody has visited since. When one loads, the item is taken out and dropped
 * as a normal item, and the entity is removed. legacy_drop_logic.ts does the careful part; this file decides when
 * to run it and retries a failure a couple of times.
 */
import { type Entity, system, world } from "@minecraft/server";
import { loadedDimensions } from "../../core/dimensions.ts";
import { LEGACY_TYPE, releaseLegacyDrop } from "./legacy_drop_logic.ts";
import { log } from "./main.ts";

/** Entity ids with a recovery attempt scheduled, so a chunk that loads twice does not queue the same entity twice. */
const queued = new Set<string>();
export function scheduleRecovery(entity: Entity): void {
  if (entity.typeId !== LEGACY_TYPE || queued.has(entity.id)) return;
  const id = entity.id;
  queued.add(id);
  function attempt(number: number): void {
    if (!entity.isValid) {
      queued.delete(id);
      return;
    }
    try {
      const result = releaseLegacyDrop(entity);
      if (result.status === "blocked")
        log.warn(
          "legacy item recovery is blocked after a write/rollback error. Inspect the backup; no automatic copies will be made.",
        );
      queued.delete(id);
    } catch (error) {
      // Up to three tries, a second apart; an error marked not retryable (see legacy_drop_logic.ts) stops at once.
      if (number < 2 && (error as { retryable?: boolean }).retryable !== false) {
        system.runTimeout(() => attempt(number + 1), 20);
      } else {
        queued.delete(id);
        log.warn(`legacy item recovery: ${log.describe(error)}. Reloading its chunk can retry a transient failure.`);
      }
    }
  }
  // The entityLoad event is read-only, so even the first attempt waits for the next writable moment.
  system.run(() => attempt(0));
}
/** One pass over the entities already loaded when the world starts; later ones arrive through entityLoad. */
export function scanLoadedDrops(): void {
  system.run(() => {
    for (const dimension of loadedDimensions(world).values()) {
      try {
        for (const entity of dimension.getEntities({ type: LEGACY_TYPE })) scheduleRecovery(entity);
      } catch (error) {
        log.warn(`legacy load scan: ${log.describe(error)}`);
      }
    }
  });
}
