import { EntityDamageCause, GameMode, system, world } from "@minecraft/server";
import type { FeatureDefinition } from "../../core/feature.ts";
import { createCreeperHandler } from "./blast.ts";

/**
 * Cancels every vanilla creeper explosion and replaces it with a cosmetic blast that damages and knocks back
 * Survival and Adventure players only. Blocks, items, paintings, pets and other mobs are never touched.
 */
export const creeperMod: FeatureDefinition = {
  id: "creeper-mod",
  title: "Creeper Mod",
  start(ctx) {
    ctx.on(world.beforeEvents.explosion, createCreeperHandler({ world, system, GameMode, EntityDamageCause }));
  },
};
