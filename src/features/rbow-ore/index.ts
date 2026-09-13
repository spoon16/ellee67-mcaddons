import { EntityTypes, system, world } from "@minecraft/server";
import type { FeatureDefinition } from "../../core/features.ts";
import { scanLoadedDrops, scheduleRecovery } from "./legacy_drops.ts";
import {
  onPlayerBreakBlock,
  onPlayerInteractWithBlock,
  onScriptEvent,
  registerToolComponent,
  resetState,
} from "./main.ts";

/**
 * The 67 Rbow Ore Mod runtime: scripted ore drops, mining wear for Rbow tools, hoe, shovel and axe actions,
 * the `/scriptevent elleedog:rbow_check` diagnostic and recovery of items stored in legacy drop entities.
 */
export const rbowOre: FeatureDefinition = {
  id: "rbow-ore",
  title: "Rbow Ore",
  summary: "tools only; ore stays",
  kind: "pack",
  packs: ["rbow-ore", "rbow-ore-resources"],
  installed: () => EntityTypes.get("elleedog:rbow_drop") !== undefined,
  manual: {
    about:
      "Rbow ore generates underground in new chunks (deepslate too), smelts into Rbow ingots, and crafts a full tool set, a spear and armor whose pieces add knockback resistance.",
    commands: ["/scriptevent elleedog:rbow_check (diagnostics)", "/function elleedog/rbow_test_kit (test items)"],
    whileOff:
      "No new ore generates and the Rbow tools and armor lose their behaviours. Ore already placed, items in chests and the recipes need the packs active to keep working, so activate Rbow Ore before opening a world that ever used it.",
  },
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
