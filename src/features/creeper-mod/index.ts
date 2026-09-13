import { EntityDamageCause, GameMode, system, world } from "@minecraft/server";
import type { FeatureDefinition } from "../../core/features.ts";
import { createCreeperHandler } from "./blast.js";

/**
 * Cancels every vanilla creeper explosion and replaces it with a cosmetic blast that damages and knocks back
 * Survival and Adventure players only. Blocks, items, paintings, pets and other mobs are never touched.
 */
export const creeperMod: FeatureDefinition = {
  id: "creeper-mod",
  title: "Creeper Mod",
  summary: "Creeper blasts hurt players only; blocks and other mobs are safe",
  defaultEnabled: true,
  start(ctx) {
    ctx.on(world.beforeEvents.explosion, createCreeperHandler({ world, system, GameMode, EntityDamageCause }));
  },
  stop() {
    // Nothing to restore: dropping the explosion subscription is what brings vanilla creeper blasts back.
  },
};
