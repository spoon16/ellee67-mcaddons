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
    ctx.on(world.afterEvents.entityLoad, (event) => scheduleRecovery(event.entity));
    scanLoadedDrops();
  },
};
