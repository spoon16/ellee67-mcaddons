// The runner that plugs one feature into Minecraft. Every behavior pack's bundle calls `runFeature` exactly once
// (see src/packs/<feature>.ts), so this is the first add-on code to run when a pack loads.
//
// Minecraft starts a script in two steps, and a feature maps onto them:
//   1. `system.beforeEvents.startup`: the engine is still booting. A script may register custom commands and item
//      components here and nothing else, because the world does not exist yet. That step is `register`.
//   2. `world.afterEvents.worldLoad`: the world is ready. Now a feature can listen for events, start timers and read
//      or change blocks, entities and players. That step is `start`.
import {
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type ItemComponentRegistry,
  system,
  world,
} from "@minecraft/server";
import { log } from "./log.ts";
import { FeatureContext } from "./subscriptions.ts";

// `Pick` keeps only the methods features call, so a test can hand in a small fake instead of the whole engine object.
export type CommandRegistry = Pick<CustomCommandRegistry, "registerEnum" | "registerCommand">;
export type ItemRegistry = Pick<ItemComponentRegistry, "registerCustomComponent">;
/** A custom command handler: who ran the command first, then its arguments in the order the command declared them. */
export type CommandCallback = (origin: CustomCommandOrigin, ...args: any[]) => CustomCommandResult | undefined;

/** The engine registries a feature receives during `system.beforeEvents.startup`. */
export interface FeatureRegistries {
  commands: CommandRegistry;
  items: ItemRegistry;
}

/**
 * One feature, shipped as one behavior pack whose script bundle calls `runFeature` with it. The pack's presence in
 * the world is the switch: active pack, running feature. There is no runtime toggle and nothing to stop.
 */
export interface FeatureDefinition {
  /** Lowercase, hyphenated; also the entry name under `src/packs/`. */
  id: string;
  /** Human name used in chat and logs, for example "Stair Sitting". */
  title: string;
  /**
   * Runs once during `system.beforeEvents.startup` (early execution, no world access): commands and item components.
   * Every command and enum a pack registers must share one namespace; the engine refuses a second one.
   */
  register?(registries: FeatureRegistries): void;
  /** Runs once after world load. Subscribes through `ctx` and does any load-time work directly. */
  start(ctx: FeatureContext): void;
}

/**
 * Wires one feature into the engine. A throwing `register` or `start` is logged and leaves the rest untouched.
 * `worldLoad` can fire more than once in a script module's life (the engine keeps the module across some reloads),
 * so the previous context is disposed before `start` runs again: no handler or loop is ever subscribed twice.
 */
export function runFeature(feature: FeatureDefinition): void {
  // The context from the latest `worldLoad`, remembered so the next one can undo everything it subscribed.
  let live: FeatureContext | undefined;
  system.beforeEvents.startup.subscribe((event) => {
    try {
      // A feature with no commands or items simply has no `register`; `?.` skips the call instead of crashing.
      feature.register?.({ commands: event.customCommandRegistry, items: event.itemComponentRegistry });
    } catch (error) {
      // Log and carry on: a bad command registration must not stop the feature's `start` from running later.
      log.warn(`${feature.id} registration failed: ${log.describe(error)}`);
    }
  });
  world.afterEvents.worldLoad.subscribe(() => {
    live?.dispose();
    const context = new FeatureContext(feature.id);
    live = context;
    try {
      feature.start(context);
      log.info(`${feature.id} loaded`);
    } catch (error) {
      // Half-started is worse than not started: undo whatever `start` managed to subscribe before it threw.
      context.dispose();
      live = undefined;
      log.warn(`${feature.id} failed to start: ${log.describe(error)}`);
    }
  });
}
