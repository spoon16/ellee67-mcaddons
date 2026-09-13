import { world } from "@minecraft/server";
import type { FeatureRegistries } from "./commands.ts";
import { FEATURE_PROPERTY_PREFIX } from "./config.ts";
import { log } from "./log.ts";
import { FeatureContext } from "./subscriptions.ts";

export const FEATURE_IDS = ["pets", "stair-sit", "creeper-mod", "ender-mod", "redstone-guide", "rbow-ore"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export interface FeatureDefinition {
  id: FeatureId;
  /** Human name used in chat and menus, for example "Stair Sitting". */
  title: string;
  /** One line shown in `/elleedog67:features` and the book. */
  summary: string;
  defaultEnabled: boolean;
  /** Shown after disabling, for features whose data-driven parts keep working (rbow-ore). */
  disabledNote?: string;
  /** Runs once during `system.beforeEvents.startup`, whether or not the feature is enabled. */
  register?(registries: FeatureRegistries): void;
  /**
   * Runs once after world load whether or not the feature is enabled, and is never disposed. Only for
   * handlers that must keep working while the feature is off (rbow-ore keeps ore drops working).
   */
  alwaysOn?(ctx: FeatureContext): void;
  /** Subscribes events and intervals through `ctx`; also performs any load-time work directly. */
  start(ctx: FeatureContext): void;
  /**
   * Restores the closest thing to vanilla; `ctx` is disposed right after this returns. Also called once at world
   * load when the feature is disabled, so it must work without a preceding `start()`.
   */
  stop(ctx: FeatureContext): void;
}

export interface ToggleResult {
  changed: boolean;
  error?: unknown;
}

interface FeatureState {
  definition: FeatureDefinition;
  context?: FeatureContext;
}

const registry = new Map<FeatureId, FeatureState>();

export function defineFeatures(definitions: readonly FeatureDefinition[]): void {
  registry.clear();
  for (const definition of definitions) {
    if (registry.has(definition.id)) throw new Error(`Feature ${definition.id} is defined twice.`);
    registry.set(definition.id, { definition });
  }
}

export function listFeatures(): FeatureDefinition[] {
  return [...registry.values()].map((state) => state.definition);
}

export function getFeature(id: FeatureId): FeatureDefinition | undefined {
  return registry.get(id)?.definition;
}

/** Accepts "stair-sit", "stair_sit", "Stair-Sit" and returns the registered id, or undefined. */
export function normalizeFeatureId(text: string): FeatureId | undefined {
  const id = text.trim().toLowerCase().replace(/_/g, "-");
  return registry.has(id as FeatureId) ? (id as FeatureId) : undefined;
}

export function featurePropertyKey(id: FeatureId): string {
  return `${FEATURE_PROPERTY_PREFIX}${id}`;
}

/** Reads the world setting; only valid after `worldLoad`. Falls back to the feature default. */
export function isEnabled(id: FeatureId): boolean {
  const state = mustGet(id);
  const stored = world.getDynamicProperty(featurePropertyKey(id));
  return typeof stored === "boolean" ? stored : state.definition.defaultEnabled;
}

export function isRunning(id: FeatureId): boolean {
  return registry.get(id)?.context !== undefined;
}

/** Persists the setting and starts or stops the feature. Call from a writable context (`system.run`). */
export function setEnabled(id: FeatureId, enabled: boolean): ToggleResult {
  world.setDynamicProperty(featurePropertyKey(id), enabled);
  return enabled ? startFeature(id) : stopFeature(id);
}

export function startFeature(id: FeatureId): ToggleResult {
  const state = mustGet(id);
  if (state.context) return { changed: false };
  const context = new FeatureContext(id);
  try {
    state.definition.start(context);
    state.context = context;
    log.info(`${id} started`);
    return { changed: true };
  } catch (error) {
    context.dispose();
    log.warn(`${id} failed to start: ${log.describe(error)}`);
    return { changed: false, error };
  }
}

export function stopFeature(id: FeatureId): ToggleResult {
  const state = mustGet(id);
  const context = state.context;
  if (!context) return { changed: false };
  state.context = undefined;
  let error: unknown;
  try {
    state.definition.stop(context);
  } catch (caught) {
    error = caught;
    log.warn(`${id} failed to stop cleanly: ${log.describe(caught)}`);
  } finally {
    context.dispose();
  }
  log.info(`${id} stopped`);
  return error === undefined ? { changed: true } : { changed: true, error };
}

/** Called once from `worldLoad`. */
export function startEnabledFeatures(): void {
  for (const definition of listFeatures()) {
    if (definition.alwaysOn) {
      try {
        definition.alwaysOn(new FeatureContext(`${definition.id}:always-on`));
      } catch (error) {
        log.warn(`${definition.id} always-on setup failed: ${log.describe(error)}`);
      }
    }
    if (isEnabled(definition.id)) startFeature(definition.id);
    else settleDisabled(definition);
  }
}

/**
 * A feature that loads disabled still gets `stop()` once, so anything it does to keep the world vanilla-like
 * while off (Ender's property reset, Pets forcing native form) is in place from the first tick. `stop()` must
 * therefore tolerate never having been started.
 */
function settleDisabled(definition: FeatureDefinition): void {
  const context = new FeatureContext(definition.id);
  try {
    definition.stop(context);
  } catch (error) {
    log.warn(`${definition.id} failed to settle while disabled: ${log.describe(error)}`);
  } finally {
    context.dispose();
  }
}

export function featureStatusLines(): string[] {
  return listFeatures().map((definition) => {
    const state = isEnabled(definition.id) ? "enabled" : "disabled";
    const note = !isEnabled(definition.id) && definition.disabledNote ? ` (${definition.disabledNote})` : "";
    return `${definition.id}: ${state}${note}`;
  });
}

function mustGet(id: FeatureId): FeatureState {
  const state = registry.get(id);
  if (!state) throw new Error(`Feature ${id} is not defined.`);
  return state;
}
