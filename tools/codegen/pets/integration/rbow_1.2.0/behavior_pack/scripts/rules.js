/** Pure gameplay decisions; imported unchanged by the runtime and Node tests. */
export const NS = 'elleedog:';
export const ORES = new Set([NS + 'rbow_ore', NS + 'deepslate_rbow_ore']);
export const BLOCKS = new Set([...ORES, NS + 'rbow_block']);
export const GEAR = new Set(['sword','pickaxe','axe','shovel','hoe','spear','helmet','chestplate','leggings','boots'].map(x => NS + 'rbow_' + x));
export const ITEMS = new Set([...BLOCKS, ...GEAR, NS + 'raw_rbow_ore', NS + 'rbow_ingot', NS + 'rbow_nug']);
const PICKAXES = new Set(['minecraft:iron_pickaxe','minecraft:diamond_pickaxe','minecraft:netherite_pickaxe', NS+'rbow_pickaxe']);

export function canHarvest(item) {
  if (!item) return false;
  if (PICKAXES.has(item.typeId)) return true;
  return !!item.hasTag?.('minecraft:is_pickaxe') && ['iron','diamond','netherite'].some(t => item.hasTag?.(`minecraft:${t}_tier`));
}
export function enchantment(item, name) {
  return item?.getComponent?.('minecraft:enchantable')?.getEnchantment(name)?.level ?? 0;
}
export function fortuneCount(level, random = Math.random) {
  const n = Math.max(0, Math.min(255, Math.floor(level)));
  return Math.max(1, Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, random())) * (n + 2)));
}
export function miningDrop(blockId, item, mode, tileDrops = true, random = Math.random) {
  if (!BLOCKS.has(blockId) || !['survival','adventure'].includes(String(mode).toLowerCase()) || !tileDrops || !canHarvest(item)) return undefined;
  if (blockId === NS + 'rbow_block' || enchantment(item, 'silk_touch') > 0) return {typeId: blockId, amount: 1};
  return {typeId: NS + 'raw_rbow_ore', amount: fortuneCount(enchantment(item, 'fortune'), random)};
}
export function durabilityLoss(amount, unbreaking, random = Math.random) {
  let lost = 0;
  for (let i = 0; i < amount; ++i) if (random() < 1 / (Math.max(0,unbreaking) + 1)) lost++;
  return lost;
}
export function toolAction(tool, type, aboveAir, face) {
  const down = String(face).toLowerCase() === 'down';
  if (tool === NS+'rbow_hoe' && !down && aboveAir) {
    if (['minecraft:dirt','minecraft:grass_block','minecraft:grass','minecraft:grass_path'].includes(type)) return {block:'minecraft:farmland',sound:'use.gravel'};
    if (type === 'minecraft:coarse_dirt') return {block:'minecraft:dirt',sound:'use.gravel'};
    if (type === 'minecraft:dirt_with_roots') return {block:'minecraft:dirt',sound:'use.gravel',extra:'minecraft:hanging_roots'};
  }
  if (tool === NS+'rbow_shovel') {
    if (!down && aboveAir && ['minecraft:dirt','minecraft:grass_block','minecraft:grass','minecraft:coarse_dirt','minecraft:podzol','minecraft:mycelium','minecraft:dirt_with_roots'].includes(type)) return {block:'minecraft:grass_path',sound:'use.gravel'};
    if (['minecraft:campfire','minecraft:soul_campfire'].includes(type)) return {state:'extinguished',value:true,sound:'random.fizz'};
  }
  if (tool === NS+'rbow_axe') {
    const short=type.replace('minecraft:','');
    if (!type.startsWith('minecraft:') || short.startsWith('stripped_')) return undefined;
    // Only strip recognized vanilla logs/woods; do not rewrite another pack's blocks.
    const woods=['oak','spruce','birch','jungle','acacia','dark_oak','mangrove','cherry','pale_oak'];
    if (woods.some(w=>short===w+'_log'||short===w+'_wood') || ['crimson_stem','warped_stem','crimson_hyphae','warped_hyphae','bamboo_block'].includes(short)) return {block:'minecraft:stripped_'+short,keepStates:true,sound:'use.wood'};
  }
  return undefined;
}
