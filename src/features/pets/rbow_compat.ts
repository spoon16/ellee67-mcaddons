/** Explicit, read-only integration diagnostics; no startup announcements. */
// `/pet:rbowcheck`: are the Rbow Ore packs present, and how would the equipped items be drawn on a pet? The two
// add-ons share nothing at runtime, so this is the only place Pets even looks for Rbow's ids.
import { EquipmentSlot, ItemStack } from "@minecraft/server";
import type { PlayerLike } from "./core.ts";
import { inspectProperties, type Observation, observeProperty, type PropertyValue } from "./property_health.ts";
import { type GearRoute, gearRoute } from "./tool_effects.ts";

export interface RbowReport {
  status: "READY" | "INCOMPLETE";
  petsVersion: string;
  rbowCompanion: string;
  rbowGameplayBase: string;
  petProperties: string;
  model: PropertyValue | null;
  form: string | null;
  rbowArmorCount: Observation;
  registeredItems: Record<string, boolean>;
  wornArmor: Record<string, string | null>;
  gearRoute: GearRoute;
  note: string;
}

export const RBOW_COUNT = "elleedog:rbow_armor_count";
export const RBOW_GEAR: readonly string[] = Object.freeze(
  ["helmet", "chestplate", "leggings", "boots", "sword", "pickaxe", "axe", "shovel", "hoe", "spear"].map(
    (s) => `elleedog:rbow_${s}`,
  ),
);
export function rbowReport(player: PlayerLike): RbowReport {
  const pets = inspectProperties(player);
  const count = observeProperty(player, RBOW_COUNT);
  const validCount =
    count.status === "ok" &&
    typeof count.value === "number" &&
    Number.isInteger(count.value) &&
    count.value >= 0 &&
    count.value <= 4;
  // Creating an ItemStack of an id proves the item exists; an unknown id throws, which reads as "not registered".
  const registrations = Object.fromEntries(
    RBOW_GEAR.map((id): [string, boolean] => {
      try {
        return [id, new ItemStack(id, 1).typeId === id];
      } catch {
        return [id, false];
      }
    }),
  );
  const equippable = player.getComponent("minecraft:equippable");
  const armorSlots: Array<[string, EquipmentSlot]> = [
    ["head", EquipmentSlot.Head],
    ["chest", EquipmentSlot.Chest],
    ["legs", EquipmentSlot.Legs],
    ["feet", EquipmentSlot.Feet],
  ];
  const armor = Object.fromEntries(
    armorSlots.map(([label, slot]): [string, string | null] => [label, equippable?.getEquipment(slot)?.typeId ?? null]),
  );
  const ready = pets.status === "READY" && validCount && Object.values(registrations).every(Boolean);
  return {
    status: ready ? "READY" : "INCOMPLETE",
    petsVersion: "0.5.2",
    rbowCompanion: "1.2.3",
    rbowGameplayBase: "1.2.0",
    petProperties: `${pets.validCount}/${pets.expected}`,
    model: pets.model,
    form: pets.serverForm,
    rbowArmorCount: count,
    registeredItems: registrations,
    wornArmor: armor,
    gearRoute: gearRoute(player),
    note: "Server definitions and registrations only; not client render verification.",
  };
}
