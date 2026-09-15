/** Per-player preferences. No item, camera or physical entity state is changed. */
// Each setting has two names: the entity property the renderer reads right now (`*_PROPERTY`) and the dynamic
// property that remembers the choice across sessions (`*_PREFERENCE`). `apply` writes both; the `preferred*`
// readers return the remembered choice with a sensible default when nothing was ever saved.
import { DEFAULT_HAND_HEIGHT, MODEL_BY_ID } from "./catalog.generated.ts";
import { isPlayer, type PlayerLike, preferredForm, readJsonObject } from "./core.ts";
import { type PropertyValue, requireProperties } from "./property_health.ts";

/** First-person view: the pet's paws or the ordinary player hands. */
export const VIEW_PROPERTY = "pet:view";
export const VIEW_PREFERENCE = "pet:first_person_view";
/** Whether the pet animates its walk, or holds still while the player moves. */
export const MOTION_PROPERTY = "pet:motion";
export const MOTION_PREFERENCE = "pet:motion_enabled";
/** How high the empty-hand paws sit in first person, in model pixels. */
export const HAND_HEIGHT_PROPERTY = "pet:hand_height";
export const HAND_HEIGHT_PREFERENCE = "pet:hand_height_preference";
/** Whether held items are drawn in the pet's mouth and on its side (fitted) or as on a human (native). */
export const GEAR_PROPERTY = "pet:gear_fit";
export const GEAR_PREFERENCE = "pet:fitted_gear_preference";
/** Whether armor is drawn shaped to the pet (fitted) or as on a human (native). */
export const ARMOR_PROPERTY = "pet:armor_fit";
export const ARMOR_PREFERENCE = "pet:fitted_armor_preference";
/** Live nudges to fitted armor: pixels up or down, and a size factor; saved per pet in `ARMOR_FIT_TRIMS`. */
export const ARMOR_LIFT_PROPERTY = "pet:armor_lift";
export const ARMOR_SCALE_PROPERTY = "pet:armor_scale";
export const ARMOR_FIT_TRIMS = "pet:armor_fit_trims";

export interface ArmorFit {
  lift: number;
  scale: number;
}
/** Per-pet trims as stored in the dynamic property; the numbers are validated on every read. */
type StoredArmorTrims = Record<string, Partial<Record<keyof ArmorFit, unknown>> | undefined>;

const NEUTRAL_ARMOR_FIT: ArmorFit = Object.freeze({ lift: 0, scale: 1 });

/** Each pet's catalog default for the paw height, since a spaniel and a larger dog hold their paws differently. */
export function defaultHandHeight(player: PlayerLike): number {
  return MODEL_BY_ID[preferredForm(player)]?.first_person.default_hand_height ?? DEFAULT_HAND_HEIGHT;
}
export function validateHandHeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -8 || value > 12) {
    throw new Error(
      "Hand height must be an integer from -8 to 12. Default is 2; 0 is neutral. /pet:handreset restores the profile default.",
    );
  }
  return value;
}
export function preferredHandHeight(player: PlayerLike): number {
  const v = player.getDynamicProperty(HAND_HEIGHT_PREFERENCE);
  return typeof v === "number" && Number.isInteger(v) && v >= -8 && v <= 12 ? v : defaultHandHeight(player);
}
export function preferredView(player: PlayerLike): "paws" | "native" {
  return player.getDynamicProperty(VIEW_PREFERENCE) === "native" ? "native" : "paws";
}
// The three booleans default to on: `!== false` treats "never saved" the same as "saved true".
export function preferredMotion(player: PlayerLike): boolean {
  return player.getDynamicProperty(MOTION_PREFERENCE) !== false;
}
export function preferredGear(player: PlayerLike): boolean {
  return player.getDynamicProperty(GEAR_PREFERENCE) !== false;
}
export function preferredArmor(player: PlayerLike): boolean {
  return player.getDynamicProperty(ARMOR_PREFERENCE) !== false;
}
/** Writes the live property and, with `persist`, the remembered one; a failed save puts the live value back. */
function apply(player: PlayerLike, property: string, key: string, value: PropertyValue, persist: boolean): void {
  if (!isPlayer(player)) throw new Error("The player is no longer connected.");
  const before = requireProperties(player, [property])[property];
  player.setProperty(property, value);
  if (persist) {
    try {
      player.setDynamicProperty(key, value);
    } catch (error) {
      try {
        if (before !== undefined) player.setProperty(property, before);
      } catch {
        /* Original error wins. */
      }
      throw error;
    }
  }
}
export function applyView(player: PlayerLike, value: unknown, persist = true): void {
  if (value !== "paws" && value !== "native") throw new Error("Expected paws or native.");
  apply(player, VIEW_PROPERTY, VIEW_PREFERENCE, value, persist);
}
export function applyMotion(player: PlayerLike, value: unknown, persist = true): void {
  if (typeof value !== "boolean") throw new Error("Motion must be a boolean.");
  apply(player, MOTION_PROPERTY, MOTION_PREFERENCE, value, persist);
}
export function applyArmor(player: PlayerLike, value: unknown, persist = true): void {
  if (typeof value !== "boolean") throw new Error("Armor selection must be a boolean.");
  apply(player, ARMOR_PROPERTY, ARMOR_PREFERENCE, value, persist);
}
export function applyHandHeight(player: PlayerLike, value: unknown, persist = true): void {
  apply(player, HAND_HEIGHT_PROPERTY, HAND_HEIGHT_PREFERENCE, validateHandHeight(value), persist);
}
/** Back to the pet's default: the saved preference is removed (undefined clears a dynamic property). */
export function resetHandHeight(player: PlayerLike): void {
  const old = player.getProperty(HAND_HEIGHT_PROPERTY);
  applyHandHeight(player, defaultHandHeight(player), false);
  try {
    player.setDynamicProperty(HAND_HEIGHT_PREFERENCE, undefined);
  } catch (error) {
    try {
      if (typeof old === "number") player.setProperty(HAND_HEIGHT_PROPERTY, old);
    } catch {
      /* Original error wins. */
    }
    throw error;
  }
}
/** Puts every remembered setting back onto the live properties, for a player who has just joined. */
export function restoreSettings(player: PlayerLike): void {
  applyView(player, preferredView(player), false);
  applyMotion(player, preferredMotion(player), false);
  applyHandHeight(player, preferredHandHeight(player), false);
  applyArmor(player, preferredArmor(player), false);
  applyGear(player, preferredGear(player), false);
  applyArmorFit(player);
}
const armorTrims = (player: PlayerLike): StoredArmorTrims => readJsonObject<StoredArmorTrims>(player, ARMOR_FIT_TRIMS);
/** Live fitted-armor calibration for one pet: lift in model pixels and a scale factor, applied on top of the
 * pre-scale baked into that pet's armor meshes. Saved per pet so switching forms keeps each pet's numbers. */
export function armorFitFor(player: PlayerLike, form: string): ArmorFit {
  if (form === "human") return NEUTRAL_ARMOR_FIT;
  const t = armorTrims(player)[form];
  const lift = typeof t?.lift === "number" && t.lift >= -16 && t.lift <= 16 ? t.lift : 0;
  const scale = typeof t?.scale === "number" && t.scale >= 0.5 && t.scale <= 1.5 ? t.scale : 1;
  return { lift, scale };
}
export function applyArmorFit(player: PlayerLike, form = preferredForm(player)): ArmorFit {
  if (!isPlayer(player)) throw new Error("The player is no longer connected.");
  const fit = armorFitFor(player, form);
  requireProperties(player, [ARMOR_LIFT_PROPERTY, ARMOR_SCALE_PROPERTY]);
  player.setProperty(ARMOR_LIFT_PROPERTY, fit.lift);
  player.setProperty(ARMOR_SCALE_PROPERTY, fit.scale);
  return fit;
}
/** Changes the current pet's saved trims through `change`, applies them, and restores the old trims on failure. */
function writeArmorFit(player: PlayerLike, change: (fit: ArmorFit) => ArmorFit | undefined): ArmorFit {
  const form = preferredForm(player);
  if (form === "human") throw new Error("Choose a pet first; armor calibration is saved per pet.");
  const trims = armorTrims(player);
  const previous = trims[form];
  trims[form] = change(armorFitFor(player, form));
  if (trims[form] === undefined) delete trims[form];
  player.setDynamicProperty(ARMOR_FIT_TRIMS, Object.keys(trims).length ? JSON.stringify(trims) : undefined);
  try {
    return applyArmorFit(player, form);
  } catch (error) {
    if (previous === undefined) delete trims[form];
    else trims[form] = previous;
    try {
      player.setDynamicProperty(ARMOR_FIT_TRIMS, Object.keys(trims).length ? JSON.stringify(trims) : undefined);
    } catch {
      /* Original error wins. */
    }
    throw error;
  }
}
export function setArmorLift(player: PlayerLike, pixels: unknown): ArmorFit {
  if (typeof pixels !== "number" || !Number.isFinite(pixels) || pixels < -16 || pixels > 16) {
    throw new Error(
      "Armor lift must be a number from -16 to 16 model pixels; positive raises the armor. 0 is the baked position.",
    );
  }
  return writeArmorFit(player, (fit) => ({ ...fit, lift: Math.round(pixels * 100) / 100 }));
}
export function setArmorScale(player: PlayerLike, percent: unknown): ArmorFit {
  if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 50 || percent > 150) {
    throw new Error("Armor scale must be a whole percentage from 50 to 150. 100 is the baked size.");
  }
  return writeArmorFit(player, (fit) => ({ ...fit, scale: percent / 100 }));
}
export function resetArmorFit(player: PlayerLike): ArmorFit {
  return writeArmorFit(player, () => undefined);
}

/** Clear only the user's armor override. An absent preference means fitted. */
export function resetArmor(player: PlayerLike): void {
  const previous = player.getProperty(ARMOR_PROPERTY);
  applyArmor(player, true, false);
  try {
    player.setDynamicProperty(ARMOR_PREFERENCE, undefined);
  } catch (error) {
    try {
      if (typeof previous === "boolean") player.setProperty(ARMOR_PROPERTY, previous);
    } catch {
      /* Original error wins. */
    }
    throw error;
  }
}

export function applyGear(player: PlayerLike, value: unknown, persist = true): void {
  if (typeof value !== "boolean") throw new Error("Gear selection must be a boolean.");
  apply(player, GEAR_PROPERTY, GEAR_PREFERENCE, value, persist);
}
export function resetGear(player: PlayerLike): void {
  const old = player.getProperty(GEAR_PROPERTY);
  applyGear(player, true, false);
  try {
    player.setDynamicProperty(GEAR_PREFERENCE, undefined);
  } catch (error) {
    try {
      if (typeof old === "boolean") player.setProperty(GEAR_PROPERTY, old);
    } catch {
      /* Original error wins. */
    }
    throw error;
  }
}
