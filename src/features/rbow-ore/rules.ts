// Ported from Rbow Ore 1.2.0 behavior_pack/scripts/rules.js (sha256 eb0a2d569ff887e9deffe73b122fa6cd37f2b11769fbcbb83f2671824ee0f777); test/features/rbow-ore/pinned_sources.test.ts checks the upstream copy still matches.
/** Pure gameplay decisions; imported unchanged by the runtime and Node tests. */
export const NS = "elleedog:";
export const ORES = new Set([`${NS}rbow_ore`, `${NS}deepslate_rbow_ore`]);
export const BLOCKS = new Set([...ORES, `${NS}rbow_block`]);
export const GEAR = new Set(
  ["sword", "pickaxe", "axe", "shovel", "hoe", "spear", "helmet", "chestplate", "leggings", "boots"].map(
    (x) => `${NS}rbow_${x}`,
  ),
);
export const ITEMS = new Set([...BLOCKS, ...GEAR, `${NS}raw_rbow_ore`, `${NS}rbow_ingot`, `${NS}rbow_nug`]);
const PICKAXES = new Set([
  "minecraft:iron_pickaxe",
  "minecraft:diamond_pickaxe",
  "minecraft:netherite_pickaxe",
  `${NS}rbow_pickaxe`,
]);

interface EnchantableLike {
  getEnchantment(name: string): { level?: number } | undefined;
}

/** What the rules read from a held item; an ItemStack satisfies it and tests pass plain objects. */
export interface ToolLike {
  typeId: string;
  hasTag?(tag: string): boolean;
  getComponent?(name: "minecraft:enchantable"): EnchantableLike | undefined;
}

export interface MiningDrop {
  typeId: string;
  amount: number;
}

interface BlockAction {
  block: string;
  sound: string;
  keepStates?: boolean;
  extra?: string;
  state?: undefined;
  value?: undefined;
}

interface StateAction {
  state: "extinguished";
  value: boolean;
  sound: string;
  block?: undefined;
  keepStates?: undefined;
  extra?: undefined;
}

/** A block replacement (optionally keeping states or dropping an extra item) or a single state change. */
export type ToolAction = BlockAction | StateAction;

export function canHarvest(item: ToolLike | undefined): boolean {
  if (!item) return false;
  if (PICKAXES.has(item.typeId)) return true;
  return (
    !!item.hasTag?.("minecraft:is_pickaxe") &&
    ["iron", "diamond", "netherite"].some((t) => item.hasTag?.(`minecraft:${t}_tier`))
  );
}
export function enchantment(item: ToolLike | undefined, name: string): number {
  return item?.getComponent?.("minecraft:enchantable")?.getEnchantment(name)?.level ?? 0;
}
export function fortuneCount(level: number, random: () => number = Math.random): number {
  const n = Math.max(0, Math.min(255, Math.floor(level)));
  return Math.max(1, Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, random())) * (n + 2)));
}
export function miningDrop(
  blockId: string,
  item: ToolLike | undefined,
  mode: string,
  tileDrops = true,
  random: () => number = Math.random,
): MiningDrop | undefined {
  if (
    !BLOCKS.has(blockId) ||
    !["survival", "adventure"].includes(String(mode).toLowerCase()) ||
    !tileDrops ||
    !canHarvest(item)
  )
    return undefined;
  if (blockId === `${NS}rbow_block` || enchantment(item, "silk_touch") > 0) return { typeId: blockId, amount: 1 };
  return { typeId: `${NS}raw_rbow_ore`, amount: fortuneCount(enchantment(item, "fortune"), random) };
}
export function durabilityLoss(amount: number, unbreaking: number, random: () => number = Math.random): number {
  let lost = 0;
  for (let i = 0; i < amount; ++i) if (random() < 1 / (Math.max(0, unbreaking) + 1)) lost++;
  return lost;
}
export function toolAction(tool: string, type: string, aboveAir: boolean, face: string): ToolAction | undefined {
  const down = String(face).toLowerCase() === "down";
  if (tool === `${NS}rbow_hoe` && !down && aboveAir) {
    if (["minecraft:dirt", "minecraft:grass_block", "minecraft:grass", "minecraft:grass_path"].includes(type))
      return { block: "minecraft:farmland", sound: "use.gravel" };
    if (type === "minecraft:coarse_dirt") return { block: "minecraft:dirt", sound: "use.gravel" };
    if (type === "minecraft:dirt_with_roots")
      return { block: "minecraft:dirt", sound: "use.gravel", extra: "minecraft:hanging_roots" };
  }
  if (tool === `${NS}rbow_shovel`) {
    if (
      !down &&
      aboveAir &&
      [
        "minecraft:dirt",
        "minecraft:grass_block",
        "minecraft:grass",
        "minecraft:coarse_dirt",
        "minecraft:podzol",
        "minecraft:mycelium",
        "minecraft:dirt_with_roots",
      ].includes(type)
    )
      return { block: "minecraft:grass_path", sound: "use.gravel" };
    if (["minecraft:campfire", "minecraft:soul_campfire"].includes(type))
      return { state: "extinguished", value: true, sound: "random.fizz" };
  }
  if (tool === `${NS}rbow_axe`) {
    const short = type.replace("minecraft:", "");
    if (!type.startsWith("minecraft:") || short.startsWith("stripped_")) return undefined;
    // Only strip recognized vanilla logs/woods; do not rewrite another pack's blocks.
    const woods = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak"];
    if (
      woods.some((w) => short === `${w}_log` || short === `${w}_wood`) ||
      ["crimson_stem", "warped_stem", "crimson_hyphae", "warped_hyphae", "bamboo_block"].includes(short)
    )
      return { block: `minecraft:stripped_${short}`, keepStates: true, sound: "use.wood" };
  }
  return undefined;
}
