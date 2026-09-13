/** Read-only visual metadata. Native item stacks are never replaced or edited.
 * Selection/visibility uses live client item queries; only glint is synchronized.
 */
import { EquipmentSlot, type ItemStack } from "@minecraft/server";
import { HANDHELD_INDEX, MODEL_BY_WIRE, SIDE_CARRY_INDEX } from "./catalog.generated.ts";
import { FORM_PROPERTY, isPlayer, type PlayerLike } from "./core.ts";

/** What a hand slot needs to expose for glint and routing: the id, and the enchantable component when present. */
export type HeldItem = Pick<ItemStack, "typeId" | "getComponent">;
export type HandRoute = "empty" | "shield" | "mouth" | "side" | "native-unmapped";

export interface GlintState {
  index: number;
  enchanted: boolean;
}
export interface CarryState extends GlintState {
  shieldEnchanted: boolean;
}
export interface GearRoute {
  main: HandRoute;
  off: HandRoute;
  thirdPersonReplacement: boolean;
  note: string;
}

const handhelds: Readonly<Record<string, number>> = HANDHELD_INDEX;
const sideCarry: Readonly<Record<string, number>> = SIDE_CARRY_INDEX;

function enchanted(item: HeldItem | undefined): boolean {
  return (
    !!item &&
    (item.typeId === "minecraft:enchanted_book" ||
      (item.getComponent("minecraft:enchantable")?.getEnchantments() ?? []).length > 0)
  );
}
export function toolGlintState(item: HeldItem | undefined): GlintState {
  const index = item ? (handhelds[item.typeId] ?? 0) : 0;
  return { index, enchanted: index > 0 && enchanted(item) };
}
export function carryState(item: HeldItem | undefined): CarryState {
  const index = item ? (sideCarry[item.typeId] ?? 0) : 0;
  return {
    index,
    enchanted: index > 0 && enchanted(item),
    shieldEnchanted: item?.typeId === "minecraft:shield" && enchanted(item),
  };
}
export function classifyHand(item: Pick<ItemStack, "typeId"> | undefined, hand = "main"): HandRoute {
  if (!item) return "empty";
  if (item.typeId === "minecraft:shield") return "shield";
  if (hand === "main" && handhelds[item.typeId]) return "mouth";
  if (sideCarry[item.typeId]) return "side";
  return "native-unmapped";
}
export function gearRoute(player: PlayerLike): GearRoute {
  const eq = player.getComponent("minecraft:equippable");
  const main = classifyHand(eq?.getEquipment(EquipmentSlot.Mainhand));
  const off = classifyHand(eq?.getEquipment(EquipmentSlot.Offhand), "off");
  const enabled =
    !!MODEL_BY_WIRE[String(player.getProperty(FORM_PROPERTY))] && player.getProperty("pet:gear_fit") !== false;
  return {
    main,
    off,
    thirdPersonReplacement: enabled && main !== "native-unmapped" && off !== "native-unmapped",
    note: "Expected third-person routing; the server cannot observe client rendering.",
  };
}
function setIfChanged(player: PlayerLike, key: string, value: boolean | number): void {
  if (player.getProperty(key) !== value) player.setProperty(key, value);
}
export function refreshToolGlint(player: PlayerLike): boolean {
  if (!isPlayer(player) || !MODEL_BY_WIRE[String(player.getProperty(FORM_PROPERTY))]) return false;
  const eq = player.getComponent("minecraft:equippable");
  const main = eq?.getEquipment(EquipmentSlot.Mainhand);
  const off = eq?.getEquipment(EquipmentSlot.Offhand);
  const tool = toolGlintState(main);
  setIfChanged(player, "pet:tool_enchanted_for", tool.index);
  setIfChanged(player, "pet:tool_enchanted", tool.enchanted);
  const hands: Array<[string, ItemStack | undefined]> = [
    ["main", main],
    ["off", off],
  ];
  for (const [hand, item] of hands) {
    const state = carryState(item);
    setIfChanged(player, `pet:carry_${hand}_enchanted_for`, state.index);
    setIfChanged(player, `pet:carry_${hand}_enchanted`, state.enchanted);
    setIfChanged(player, `pet:${hand}_shield_enchanted`, !!state.shieldEnchanted);
  }
  return true;
}
