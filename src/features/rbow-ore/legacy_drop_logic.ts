// Ported from Rbow Ore 1.2.0 behavior_pack/scripts/legacy_drop_logic.js (sha256 a345162a25a706c078d6deb41db0aff06470fd2bbec55352e524227e8006c4e9); test/features/rbow-ore/pinned_sources.test.ts checks the upstream copy still matches.
/** Upgrade-only transaction. New drops never pass through this function.
 * Mocks test rollback, not Minecraft persistence or crash consistency.
 *
 * The problem this solves: moving an item from the old entity to the ground takes two engine calls (spawn the
 * copy, then clear the original), and either can fail. Done naively, a failure between them would duplicate the
 * item or lose it. So the steps run in the safe order, a failed second step undoes the first, and a double failure
 * marks the entity as blocked so no automatic retry can ever create a second copy.
 */
export const LEGACY_TYPE = "elleedog:rbow_drop";
/** Dynamic property set on an entity whose recovery went wrong twice; a blocked entity is left for a human. */
const BLOCKED = "elleedog:legacy_release_blocked";

interface Location {
  x: number;
  y: number;
  z: number;
}

interface StoredStack {
  typeId: string;
  amount: number;
  clone(): StoredStack;
}

interface LegacyInventory {
  getItem(slot: number): StoredStack | undefined;
  setItem(slot: number, stack?: StoredStack): void;
}

/** What the transaction touches on a carrier entity; the engine's Entity provides all of it. */
export interface LegacyCarrier {
  typeId: string;
  location: Location;
  dimension: { spawnItem(stack: StoredStack, location: Location): { remove(): void } | undefined };
  getDynamicProperty(identifier: string): unknown;
  setDynamicProperty(identifier: string, value: boolean): void;
  getComponent(componentId: "minecraft:inventory"): { container?: LegacyInventory } | undefined;
  remove(): void;
}

export type ReleaseResult =
  | { status: "ignored" | "blocked" | "empty" }
  | { status: "released"; typeId: string; amount: number };

// The type id is the whole contract: only the legacy drop entity is touched, and its shape is not re-checked.
function isLegacyCarrier(entity: { typeId: string }): entity is LegacyCarrier {
  return entity.typeId === LEGACY_TYPE;
}

export function releaseLegacyDrop(entity: { typeId: string }): ReleaseResult {
  if (!isLegacyCarrier(entity)) return { status: "ignored" };
  if (entity.getDynamicProperty(BLOCKED)) return { status: "blocked" };
  const inventory = entity.getComponent("minecraft:inventory")?.container;
  if (!inventory) throw new Error("Legacy inventory unavailable; stored item was not changed.");
  const stack = inventory.getItem(0);
  if (!stack) {
    // Nothing inside (a shell left by an earlier partial run): just remove it.
    entity.remove();
    return { status: "empty" };
  }
  // Clone the whole stack: keep count, damage, name, enchantments and native trims.
  // No JSON reconstruction, no player-inventory writes and no survival resource cost.
  // Step 1: spawn the copy first. If this fails, the original is still safe inside the entity.
  const dropped = entity.dimension.spawnItem(stack.clone(), { ...entity.location });
  if (!dropped) throw new Error("Native drop spawn failed; stored item was not changed.");
  // Step 2: clear the original. A failure here would leave two copies, so undo step 1.
  try {
    inventory.setItem(0, undefined);
  } catch (error) {
    // The source is still intact. Undo the spawned copy before permitting a retry.
    try {
      dropped.remove();
    } catch (rollbackError) {
      // Extremely unusual double failure: stop automatic retries to avoid repeated copies.
      try {
        entity.setDynamicProperty(BLOCKED, true);
      } catch {}
      const failure: Error & { retryable?: boolean } = new Error(
        `Legacy release and rollback failed; inspect the backed-up world: ${error}; ${rollbackError}`,
      );
      failure.retryable = false;
      throw failure;
    }
    throw error;
  }
  // Removal failing after a successful transfer leaves an EMPTY legacy entity,
  // never a second stored stack. A later load can remove that empty shell safely.
  try {
    entity.remove();
  } catch {}
  return { status: "released", typeId: stack.typeId, amount: stack.amount };
}
