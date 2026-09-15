/** Compatibility loader for items saved inside the old 1.1.3/1.1.4 drop entities.
 * No new custom entities, damage handlers, collection loop or ordinary-item scan.
 * Retained for old chunks that may not be visited until a future play session.
 */
import { type Entity, system, world } from "@minecraft/server";
import { loadedDimensions } from "../../core/dimensions.ts";
import { LEGACY_TYPE, releaseLegacyDrop } from "./legacy_drop_logic.ts";
import { log } from "./main.ts";

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
      if (number < 2 && (error as { retryable?: boolean }).retryable !== false) {
        system.runTimeout(() => attempt(number + 1), 20);
      } else {
        queued.delete(id);
        log.warn(`legacy item recovery: ${log.describe(error)}. Reloading its chunk can retry a transient failure.`);
      }
    }
  }
  system.run(() => attempt(0));
}
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
