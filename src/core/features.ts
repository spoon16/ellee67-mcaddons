import { world } from "@minecraft/server";
import type { FeatureRegistries } from "./commands.ts";
import { FEATURE_PROPERTY_PREFIX } from "./config.ts";
import { log } from "./log.ts";
import { activationHint } from "./packs.ts";
import { FeatureContext } from "./subscriptions.ts";

export const FEATURE_IDS = ["pets", "stair-sit", "creeper-mod", "ender-mod", "redstone-guide", "rbow-ore"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

/**
 * "switch": script-only; on or off per world from the manual or `/elleedog67:enable|disable`.
 * "pack": carries data the game cannot unload; on exactly when its packs are active in the world settings.
 */
export type FeatureKind = "switch" | "pack";

export interface FeatureManual {
  /** A few sentences on what the feature does. */
  about: string;
  /** Commands the feature adds, for the manual's Commands page. */
  commands?: string[];
  /** What keeps working, or what is lost, while the feature is off. */
  whileOff: string;
}

export interface FeatureDefinition {
  id: FeatureId;
  /** Human name used in chat and menus, for example "Stair Sitting". */
  title: string;
  /** One line shown in `/elleedog67:features` and the book. */
  summary: string;
  kind: FeatureKind;
  /** Pack ids from packs.json that provide the feature; required for kind "pack". */
  packs?: readonly string[];
  /** Kind "pack": returns true when the feature's data is present (EntityTypes.get / ItemTypes.get probe). */
  installed?(): boolean;
  /** Kind "switch": state for a world that has never toggled it. */
  defaultEnabled?: boolean;
  manual: FeatureManual;
  /** Runs once during `system.beforeEvents.startup`, whether or not the feature is active. */
  register?(registries: FeatureRegistries): void;
  /**
   * Runs once after world load whether or not the feature is active, and is never disposed. Only for
   * handlers that must keep working while the feature is off (rbow-ore keeps ore drops working).
   */
  alwaysOn?(ctx: FeatureContext): void;
  /** Subscribes events and intervals through `ctx`; also performs any load-time work directly. */
  start(ctx: FeatureContext): void;
  /**
   * Switch features: restores the closest thing to vanilla; `ctx` is disposed right after this returns. Also called
   * once at world load when the feature is off, so it must work without a preceding `start()`. Pack features are
   * never stopped at runtime (their packs are simply not active), so their `stop()` is a no-op.
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
  installed?: boolean;
}

const registry = new Map<FeatureId, FeatureState>();

export function defineFeatures(definitions: readonly FeatureDefinition[]): void {
  registry.clear();
  for (const definition of definitions) {
    if (registry.has(definition.id)) throw new Error(`Feature ${definition.id} is defined twice.`);
    if (definition.kind === "pack" && (!definition.packs?.length || !definition.installed)) {
      throw new Error(`Feature ${definition.id} is pack-backed and needs packs and installed().`);
    }
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

/** Switch features: the world setting, falling back to the default. Pack features: always true (see isInstalled). */
export function isEnabled(id: FeatureId): boolean {
  const state = mustGet(id);
  if (state.definition.kind === "pack") return true;
  const stored = world.getDynamicProperty(featurePropertyKey(id));
  return typeof stored === "boolean" ? stored : (state.definition.defaultEnabled ?? true);
}

/** Pack features: whether their packs are active, probed once after world load. Switch features: always true. */
export function isInstalled(id: FeatureId): boolean {
  const state = mustGet(id);
  if (state.definition.kind !== "pack") return true;
  if (state.installed === undefined) {
    try {
      state.installed = state.definition.installed?.() ?? false;
    } catch (error) {
      log.warn(`${id}: pack probe failed: ${log.describe(error)}`);
      state.installed = false;
    }
  }
  return state.installed;
}

/** True when the feature should be doing its job right now. */
export function isActive(id: FeatureId): boolean {
  return isInstalled(id) && isEnabled(id);
}

export function isRunning(id: FeatureId): boolean {
  return registry.get(id)?.context !== undefined;
}

/** The sentence telling a player how to turn a pack feature on or off. */
export function packHint(id: FeatureId, turnOn: boolean): string {
  const definition = mustGet(id).definition;
  return activationHint(definition.title, definition.packs ?? [], turnOn);
}

/** Persists the setting and starts or stops a switch feature. Call from a writable context (`system.run`). */
export function setEnabled(id: FeatureId, enabled: boolean): ToggleResult {
  const definition = mustGet(id).definition;
  if (definition.kind === "pack") return { changed: false, error: new Error(packHint(id, enabled)) };
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

/** Called once from `worldLoad`. Probes pack features, starts what is active, settles switch features that are off. */
export function startEnabledFeatures(): void {
  for (const definition of listFeatures()) {
    const state = mustGet(definition.id);
    state.installed = undefined;
    if (definition.alwaysOn) {
      try {
        definition.alwaysOn(new FeatureContext(`${definition.id}:always-on`));
      } catch (error) {
        log.warn(`${definition.id} always-on setup failed: ${log.describe(error)}`);
      }
    }
    if (definition.kind === "pack") {
      // Older builds stored a switch for these; the packs decide now.
      if (world.getDynamicProperty(featurePropertyKey(definition.id)) !== undefined) {
        world.setDynamicProperty(featurePropertyKey(definition.id), undefined);
      }
      if (isInstalled(definition.id)) startFeature(definition.id);
      else log.info(`${definition.id}: packs not active`);
      continue;
    }
    if (isEnabled(definition.id)) startFeature(definition.id);
    else settleDisabled(definition);
  }
}

/**
 * A switch feature that loads disabled still gets `stop()` once, so anything it does to keep the world vanilla-like
 * while off is in place from the first tick. `stop()` must therefore tolerate never having been started.
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

/** One word per feature for `/elleedog67:features` and the manual's home page. */
export function featureState(id: FeatureId): "on" | "off" | "active" | "packs off" {
  const definition = mustGet(id).definition;
  if (definition.kind === "pack") return isInstalled(id) ? "active" : "packs off";
  return isEnabled(id) ? "on" : "off";
}

export function featureStatusLines(): string[] {
  return listFeatures().map((definition) => {
    const state = featureState(definition.id);
    const hint = state === "packs off" ? ` (${packHint(definition.id, true)})` : "";
    return `${definition.id}: ${state}${hint}`;
  });
}

function mustGet(id: FeatureId): FeatureState {
  const state = registry.get(id);
  if (!state) throw new Error(`Feature ${id} is not defined.`);
  return state;
}
