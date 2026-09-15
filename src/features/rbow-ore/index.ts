// Rbow Ore: the feature definition. Most of Rbow Ore is data in the generated pack (the blocks, items, recipes and
// where the ore spawns). The scripts add what Bedrock data alone cannot do: what mining the ore drops, how the
// custom tools wear out, what the hoe, shovel and axe do to blocks, and recovery of items left inside the old
// 1.1.x drop entities.
import { system, world } from "@minecraft/server";
import type { FeatureDefinition } from "../../core/feature.ts";
import { scanLoadedDrops, scheduleRecovery } from "./legacy_drops.ts";
import { onPlayerBreakBlock, onPlayerInteractWithBlock, onScriptEvent, registerToolComponent } from "./main.ts";

/**
 * The 67 Rbow Ore Mod runtime: scripted ore drops, mining wear for Rbow tools, hoe, shovel and axe actions,
 * the `/scriptevent elleedog:rbow_check` diagnostic and recovery of items stored in legacy drop entities.
 */
export const rbowOre: FeatureDefinition = {
  id: "rbow-ore",
  title: "Rbow Ore",
  register({ items }) {
    registerToolComponent(items);
  },
  start(ctx) {
    // The ore's loot table is intentionally empty; this scripted drop is what makes mining Rbow ore yield anything.
    ctx.on(world.afterEvents.playerBreakBlock, onPlayerBreakBlock);
    ctx.on(world.beforeEvents.playerInteractWithBlock, onPlayerInteractWithBlock);
    ctx.on(system.afterEvents.scriptEventReceive, onScriptEvent);
    // Old drop entities are handled as their chunks load, plus one pass over whatever is already loaded.
    ctx.on(world.afterEvents.entityLoad, (event) => scheduleRecovery(event.entity));
    scanLoadedDrops();
  },
};
