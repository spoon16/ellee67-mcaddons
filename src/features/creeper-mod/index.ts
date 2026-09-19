import { world } from "@minecraft/server";
import type { FeatureDefinition } from "../../core/feature.ts";
import { featureLog } from "../../core/log.ts";
import { createCreeperGuard } from "./guard.ts";

const log = featureLog("Creeper Mod");

/**
 * Creeper explosions happen as in vanilla, blast, sound, damage and knockback included, but break no blocks: the
 * before-event's impacted-block list is emptied and nothing else about the explosion is touched.
 */
export const creeperMod: FeatureDefinition = {
  id: "creeper-mod",
  title: "Creeper Mod",
  start(ctx) {
    log.reset();
    ctx.on(world.beforeEvents.explosion, createCreeperGuard({ warn: (text) => log.warnOnce("impacted-blocks", text) }));
  },
};
