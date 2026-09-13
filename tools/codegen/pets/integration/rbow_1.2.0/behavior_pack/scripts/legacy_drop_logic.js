/** Upgrade-only transaction. New drops never pass through this function.
 * Mocks test rollback, not Minecraft persistence or crash consistency.
 */
export const LEGACY_TYPE = 'elleedog:rbow_drop';
const BLOCKED = 'elleedog:legacy_release_blocked';
export function releaseLegacyDrop(entity) {
  if (entity.typeId !== LEGACY_TYPE) return {status:'ignored'};
  if (entity.getDynamicProperty(BLOCKED)) return {status:'blocked'};
  const inventory = entity.getComponent('minecraft:inventory')?.container;
  if (!inventory) throw new Error('Legacy inventory unavailable; stored item was not changed.');
  const stack = inventory.getItem(0);
  if (!stack) {
    entity.remove();
    return {status:'empty'};
  }
  // Clone the whole stack: keep count, damage, name, enchantments and native trims.
  // No JSON reconstruction, no player-inventory writes and no survival resource cost.
  const dropped = entity.dimension.spawnItem(stack.clone(), {...entity.location});
  if (!dropped) throw new Error('Native drop spawn failed; stored item was not changed.');
  try {
    inventory.setItem(0, undefined);
  } catch (error) {
    // The source is still intact. Undo the spawned copy before permitting a retry.
    try { dropped.remove(); }
    catch (rollbackError) {
      // Extremely unusual double failure: stop automatic retries to avoid repeated copies.
      try { entity.setDynamicProperty(BLOCKED, true); } catch {}
      const failure = new Error(`Legacy release and rollback failed; inspect the backed-up world: ${error}; ${rollbackError}`);
      failure.retryable = false;
      throw failure;
    }
    throw error;
  }
  // Removal failing after a successful transfer leaves an EMPTY legacy entity,
  // never a second stored stack. A later load can remove that empty shell safely.
  try { entity.remove(); } catch {}
  return {status:'released', typeId:stack.typeId, amount:stack.amount};
}
