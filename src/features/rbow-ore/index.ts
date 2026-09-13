import { system, world } from "@minecraft/server";
import type { FeatureDefinition } from "../../core/features.ts";
import { scanLoadedDrops, scheduleRecovery } from "./legacy_drops.js";
import {
  onPlayerBreakBlock,
  onPlayerInteractWithBlock,
  onScriptEvent,
  registerToolComponent,
  resetState,
} from "./main.js";

/**
 * The 67 Rbow Ore Mod runtime: scripted ore drops, mining wear for Rbow tools, hoe, shovel and axe actions,
 * the `/scriptevent elleedog:rbow_check` diagnostic and recovery of items stored in legacy drop entities.
 */
export const rbowOre: FeatureDefinition = {
  id: "rbow-ore",
  title: "Rbow Ore",
  summary: "tools only; ore stays",
  defaultEnabled: true,
  disabledNote:
    "Rbow ore, items, recipes and world generation stay in the world and ore still drops; only Rbow tool behaviours and legacy-drop recovery are off.",
  register({ items }) {
    registerToolComponent(items);
  },
  alwaysOn(ctx) {
    // The ore's loot table is intentionally empty, so this scripted drop must keep working while the feature is off.
    ctx.on(world.afterEvents.playerBreakBlock, onPlayerBreakBlock);
  },
  start(ctx) {
    ctx.on(world.beforeEvents.playerInteractWithBlock, onPlayerInteractWithBlock);
    ctx.on(system.afterEvents.scriptEventReceive, onScriptEvent);
    ctx.on(world.afterEvents.entityLoad, (event) => scheduleRecovery(event.entity));
    scanLoadedDrops();
  },
  stop() {
    resetState();
  },
};
