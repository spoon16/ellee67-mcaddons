import type { Dimension, World } from "@minecraft/server";

/** The three dimensions every world has; `world.getDimension` accepts these short names. */
export const VANILLA_DIMENSIONS: readonly string[] = Object.freeze(["overworld", "nether", "the_end"]);

/**
 * The dimensions a feature can reach right now: the three vanilla ones that resolve, plus whichever dimension each
 * online player is in. Keyed by the full id (`minecraft:overworld`), so a player's dimension is never listed twice.
 */
export function loadedDimensions(world: Pick<World, "getDimension" | "getAllPlayers">): Map<string, Dimension> {
  const found = new Map<string, Dimension>();
  for (const id of VANILLA_DIMENSIONS) {
    try {
      const dimension = world.getDimension(id);
      found.set(dimension.id, dimension);
    } catch {
      /* Not available in this world. */
    }
  }
  for (const player of world.getAllPlayers()) {
    try {
      found.set(player.dimension.id, player.dimension);
    } catch {
      /* The player is leaving. */
    }
  }
  return found;
}
