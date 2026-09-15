/** Coordinated form transitions. Presentation only: no inventory, armor-stack or camera writes.
 * Minecraft defers setProperty. Compute the entire target from the requested form,
 * not from same-tick getProperty(model_id), and queue it in one writable callback.
 *
 * A form change touches a dozen properties at once (the model, the first-person view, motion, armor, gear, hand
 * height, seat lift and the glint flags). `appearanceFor` works out all of them from the requested form and the
 * player's saved preferences; `transitionForm` writes them together and can undo the lot if a write fails.
 */
import { system } from "@minecraft/server";
import { DEFAULT_HAND_HEIGHT, MODEL_BY_ID } from "./catalog.generated.ts";
import {
  FORM_PROPERTY,
  isPlayer,
  MAX_WIRE_ID,
  type PlayerLike,
  PREFERENCE,
  type PropertyValue,
  preferredForm,
  validateForm,
  wireId,
} from "./core.ts";
import { requireProperties } from "./property_health.ts";
import { initialSeatProperties } from "./seating.ts";
import {
  ARMOR_LIFT_PROPERTY,
  ARMOR_PREFERENCE,
  ARMOR_PROPERTY,
  ARMOR_SCALE_PROPERTY,
  armorFitFor,
  GEAR_PREFERENCE,
  GEAR_PROPERTY,
  HAND_HEIGHT_PREFERENCE,
  HAND_HEIGHT_PROPERTY,
  MOTION_PREFERENCE,
  MOTION_PROPERTY,
  preferredArmor,
  preferredGear,
  preferredMotion,
  preferredView,
  VIEW_PREFERENCE,
  VIEW_PROPERTY,
} from "./settings.ts";

/** Every entity property a form transition writes, keyed by property name. */
export interface AppearanceTarget extends Record<string, PropertyValue> {
  [FORM_PROPERTY]: number;
}

export interface TransitionOptions {
  /** Save the form as the player's preference (a deliberate choice) or not (a restore on join). */
  persist?: boolean;
  /** Reset the view, motion, armor and gear toggles to their defaults, as a fresh choice from the book does. */
  defaults?: boolean;
}

const RESETTABLE: readonly string[] = [VIEW_PREFERENCE, MOTION_PREFERENCE, ARMOR_PREFERENCE, GEAR_PREFERENCE];
/**
 * The target written for each player this tick. A property read in the same tick still returns the old value, so
 * a second transition in one tick must roll back to what was just queued, not to what the engine reports.
 * A WeakMap lets the engine forget the entry with the player object.
 */
const pending = new WeakMap<PlayerLike, { tick: number; target: AppearanceTarget }>();
/** Players say "player"; the code says "human". */
export function normalizeForm(form: string): string {
  return validateForm(form === "player" ? "human" : form);
}
export function publicForm(form: string): string {
  return form === "human" ? "player" : form;
}

/** The complete set of properties for `form`, from the catalog and the player's saved preferences. */
export function appearanceFor(player: PlayerLike, form: string, defaults = false): AppearanceTarget {
  const normalized = normalizeForm(form);
  const pet = normalized !== "human";
  const calibrated = player.getDynamicProperty(HAND_HEIGHT_PREFERENCE);
  const height =
    typeof calibrated === "number" && Number.isInteger(calibrated) && calibrated >= -8 && calibrated <= 12
      ? calibrated
      : (MODEL_BY_ID[normalized]?.first_person.default_hand_height ?? DEFAULT_HAND_HEIGHT);
  const fit = armorFitFor(player, normalized);
  // For the human form every pet-only property goes back to neutral, whatever the preferences say.
  const target: AppearanceTarget = {
    [FORM_PROPERTY]: wireId(normalized),
    [VIEW_PROPERTY]: pet ? (defaults ? "paws" : preferredView(player)) : "native",
    [MOTION_PROPERTY]: pet && (defaults || preferredMotion(player)),
    [ARMOR_PROPERTY]: pet && (defaults || preferredArmor(player)),
    [GEAR_PROPERTY]: pet && (defaults || preferredGear(player)),
    [HAND_HEIGHT_PROPERTY]: pet ? height : 0,
    [ARMOR_LIFT_PROPERTY]: fit.lift,
    [ARMOR_SCALE_PROPERTY]: fit.scale,
    "pet:tool_enchanted": false,
    "pet:tool_enchanted_for": 0,
    "pet:seat_lift": 0,
    "pet:seat_kind": 0,
  };
  for (const hand of ["main", "off"]) {
    target[`pet:carry_${hand}_enchanted`] = false;
    target[`pet:carry_${hand}_enchanted_for`] = 0;
    target[`pet:${hand}_shield_enchanted`] = false;
  }
  if (pet) Object.assign(target, initialSeatProperties(player));
  return target;
}

/** Explicit selection resets diagnostic overrides; lifecycle restore preserves them.
 * Hand and armor calibration and unrelated add-on settings are never cleared.
 * Rollback is best effort on engine errors; not a claim of a network transaction.
 */
export function transitionForm(
  player: PlayerLike,
  form: string,
  { persist = true, defaults = true }: TransitionOptions = {},
): { form: string; properties: AppearanceTarget } {
  if (!isPlayer(player)) throw new Error("The player is no longer connected.");
  const normalized = normalizeForm(form);
  const desired = appearanceFor(player, normalized, defaults);
  // Reading every property first proves the player definition is the right one before anything is written.
  const current = requireProperties(player, Object.keys(desired));
  const model = current[FORM_PROPERTY];
  if (typeof model !== "number" || !Number.isInteger(model) || model < 0 || model > MAX_WIRE_ID) {
    throw new Error("Invalid pet:model_id; check matching packs.");
  }
  const previousPending = pending.get(player);
  const before = previousPending?.tick === system.currentTick ? { ...current, ...previousPending.target } : current;
  const changedPrefs = persist ? [PREFERENCE, ...(defaults ? RESETTABLE : [])] : [];
  const oldPrefs = Object.fromEntries(changedPrefs.map((k) => [k, player.getDynamicProperty(k)]));
  try {
    // Queue dependent state before the model selection; all target the same entity tick.
    for (const [key, value] of Object.entries(desired)) if (key !== FORM_PROPERTY) player.setProperty(key, value);
    player.setProperty(FORM_PROPERTY, desired[FORM_PROPERTY]);
    if (persist) {
      if (defaults) for (const key of RESETTABLE) player.setDynamicProperty(key, undefined);
      player.setDynamicProperty(PREFERENCE, normalized);
    }
    pending.set(player, { tick: system.currentTick, target: desired });
  } catch (error) {
    // Put back every property and preference that was captured above, then let the caller see the error.
    for (const [key, value] of Object.entries(before)) {
      try {
        player.setProperty(key, value);
      } catch {
        /* Best-effort rollback. */
      }
    }
    for (const [key, value] of Object.entries(oldPrefs)) {
      try {
        player.setDynamicProperty(key, value);
      } catch {
        /* Best-effort rollback. */
      }
    }
    throw error;
  }
  return { form: normalized, properties: desired };
}
/** Re-applies the saved form, for a join, respawn or dimension change; it never resets the player's toggles. */
export function restoreAppearance(
  player: PlayerLike,
  persistMigration = false,
): { form: string; properties: AppearanceTarget } {
  return transitionForm(player, preferredForm(player), { persist: persistMigration, defaults: false });
}
