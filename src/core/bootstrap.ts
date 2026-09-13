import { system, world } from "@minecraft/server";
import { installBookGrants, registerBook } from "./book.ts";
import { gatedRegistries, registerCoreCommands } from "./commands.ts";
import { defineFeatures, type FeatureDefinition, startEnabledFeatures } from "./features.ts";
import { log } from "./log.ts";

/**
 * Wires the add-on into the engine: registers commands and item components during startup, then starts the
 * enabled features and hands out books once the world has loaded. `src/main.ts` calls this with every feature.
 */
export function bootstrap(features: readonly FeatureDefinition[]): void {
  defineFeatures(features);

  system.beforeEvents.startup.subscribe((event) => {
    try {
      registerCoreCommands(event.customCommandRegistry);
      registerBook(event.itemComponentRegistry);
    } catch (error) {
      log.warn(`core registration failed: ${log.describe(error)}`);
    }
    for (const feature of features) {
      try {
        feature.register?.(gatedRegistries(feature, event));
      } catch (error) {
        log.warn(`${feature.id} registration failed: ${log.describe(error)}`);
      }
    }
  });

  world.afterEvents.worldLoad.subscribe(() => {
    startEnabledFeatures();
    installBookGrants();
    log.info("loaded");
  });
}
