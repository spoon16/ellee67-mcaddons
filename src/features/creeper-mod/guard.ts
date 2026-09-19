import type { ExplosionBeforeEvent } from "@minecraft/server";
import { entityId } from "../../core/vanilla.ts";

/** What the guard needs from its surroundings, passed in so tests can run it without Minecraft. */
export interface CreeperGuardOptions {
  /** Reports a block list the engine refused to change. The feature logs it once per world load. */
  warn: (message: string) => void;
}

/**
 * Keeps a creeper's explosion and takes the blocks out of it. The before-event is the engine's own explosion about
 * to happen: the blast, its sound, the damage and the knockback stay vanilla for every entity in range, and an empty
 * impacted-block list leaves the terrain as it was. Nothing is cancelled, scheduled or scripted, so there is no
 * replacement damage model and no player-only rule: animals, item frames, paintings and other creepers are hurt as
 * they are in vanilla. Every other explosion source (TNT, beds, crystals, respawn anchors) is left alone.
 */
export function createCreeperGuard({ warn }: CreeperGuardOptions): (event: ExplosionBeforeEvent) => void {
  return function onExplosion(event: ExplosionBeforeEvent): void {
    if (event.source?.typeId !== entityId("minecraft:creeper")) return;
    try {
      event.setImpactedBlocks([]);
    } catch (error) {
      warn(`A creeper explosion kept its blocks: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
