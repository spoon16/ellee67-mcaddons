import {
  BlockPermutation,
  type Entity,
  EquipmentSlot,
  GameMode,
  ItemStack,
  type Player,
  type PlayerBreakBlockAfterEvent,
  type PlayerInteractWithBlockBeforeEvent,
  type ScriptEventCommandMessageAfterEvent,
  system,
  world,
} from "@minecraft/server";
import type { ItemRegistry } from "../../core/feature.ts";
import { BLOCKS, durabilityLoss, enchantment, GEAR, miningDrop, NS, toolAction } from "./rules.ts";

/** The state methods as the engine accepts them; the API types them against vanilla state names only. */
interface PermutationStates {
  getState(name: string): boolean | number | string | undefined;
  withState(name: string, value: boolean | number | string): BlockPermutation;
}

const warned = new Set<string>();
function warnOnce(label: string, error: unknown): void {
  if (warned.has(label)) return;
  warned.add(label);
  console.warn(`[67 Rbow Ore Mod] ${label}: ${String(error)}`);
}
// Engine callbacks hand over live entities, so validity is not re-checked here.
function isPlayer(entity: Entity | undefined): entity is Player {
  return entity?.typeId === "minecraft:player";
}
function survivalMode(player: Player): boolean {
  return [GameMode.Survival, GameMode.Adventure].includes(player.getGameMode());
}
function consumeDurability(player: Player, expectedId: string, amount: number): void {
  if (!survivalMode(player)) return;
  const equipment = player.getComponent("minecraft:equippable");
  const item = equipment?.getEquipment(EquipmentSlot.Mainhand);
  if (!equipment || !item || item.typeId !== expectedId) return;
  const durability = item.getComponent("minecraft:durability");
  if (!durability || durability.unbreakable) return;
  const loss = durabilityLoss(amount, enchantment(item, "unbreaking"));
  if (!loss) return;
  if (durability.damage + loss >= durability.maxDurability) {
    equipment.setEquipment(EquipmentSlot.Mainhand, undefined);
    player.dimension.playSound("random.break", player.location);
  } else {
    durability.damage += loss;
    equipment.setEquipment(EquipmentSlot.Mainhand, item);
  }
}

export function registerToolComponent(registry: ItemRegistry): void {
  registry.registerCustomComponent("elleedog:rbow_tool", {
    // Custom diggers require explicit mining wear. Combat wear is still handled
    // by the engine, so it is NOT also charged by a global hit callback.
    onMineBlock(event) {
      try {
        if (!isPlayer(event.source) || !event.itemStack) return;
        const amount = event.itemStack.typeId === `${NS}rbow_sword` ? 2 : 1;
        consumeDurability(event.source, event.itemStack.typeId, amount);
      } catch (error) {
        warnOnce("Tool mining durability", error);
      }
    },
    onBeforeDurabilityDamage(event) {
      const type = event.itemStack?.typeId;
      if (type !== undefined && GEAR.has(type))
        event.durabilityDamage = [`${NS}rbow_sword`, `${NS}rbow_hoe`].includes(type) ? 1 : 2;
    },
  });
}

// The block loot tables are intentionally empty to avoid duplicate drops.
// The pre-break tool snapshot preserves Silk Touch/Fortune on a final tool use.
export function onPlayerBreakBlock(event: PlayerBreakBlockAfterEvent): void {
  try {
    const id = event.brokenBlockPermutation.type.id;
    if (!BLOCKS.has(id)) return;
    const drop = miningDrop(id, event.itemStackBeforeBreak, event.player.getGameMode(), world.gameRules.doTileDrops);
    if (!drop) return;
    const location = event.block.location;
    // Keep each spawned stack valid even when a nonstandard Fortune level is used.
    for (let remaining = drop.amount; remaining > 0; remaining -= 64)
      event.dimension.spawnItem(new ItemStack(drop.typeId, Math.min(64, remaining)), {
        x: location.x + 0.5,
        y: location.y + 0.5,
        z: location.z + 0.5,
      });
  } catch (error) {
    warnOnce("Rbow mining loot", error);
  }
}

// Tool use is intercept-and-verify: only recognized block/tool combinations,
// never a general command, and never a delayed write over a changed block.
const pending = new Set<string>();
export function onPlayerInteractWithBlock(event: PlayerInteractWithBlockBeforeEvent): void {
  try {
    const player = event.player;
    const tool = event.itemStack;
    if (!tool || ![`${NS}rbow_hoe`, `${NS}rbow_shovel`, `${NS}rbow_axe`].includes(tool.typeId)) return;
    const mode = player.getGameMode();
    if (![GameMode.Survival, GameMode.Creative].includes(mode)) return;
    const block = event.block;
    const original = block.permutation;
    const above = block.above();
    const action = toolAction(tool.typeId, block.typeId, !!above?.isAir, event.blockFace);
    if (!action) return;
    if (action.state && (original as PermutationStates).getState(action.state) === action.value) return;
    event.cancel = true;
    const key = player.id;
    if (pending.has(key)) return;
    pending.add(key);
    const dimension = block.dimension;
    const position = { ...block.location };
    const slot = player.selectedSlotIndex;
    system.run(() => {
      try {
        if (!player.isValid || player.selectedSlotIndex !== slot || player.getGameMode() !== mode) return;
        const current = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
        if (current?.typeId !== tool.typeId) return;
        const target = dimension.getBlock(position);
        if (!target?.permutation.matches(original.type.id, original.getAllStates())) return;
        if (!action.state && [`${NS}rbow_hoe`, `${NS}rbow_shovel`].includes(tool.typeId) && !target.above()?.isAir)
          return;
        let replacement: BlockPermutation;
        if (action.state) replacement = (target.permutation as PermutationStates).withState(action.state, action.value);
        else {
          replacement = BlockPermutation.resolve(action.block);
          if (action.keepStates)
            for (const [name, value] of Object.entries(original.getAllStates())) {
              if (Object.hasOwn(replacement.getAllStates(), name))
                replacement = (replacement as PermutationStates).withState(name, value);
            }
        }
        target.setPermutation(replacement);
        dimension.playSound(action.sound, position);
        if (action.extra && world.gameRules.doTileDrops)
          dimension.spawnItem(new ItemStack(action.extra), {
            x: position.x + 0.5,
            y: position.y + 1,
            z: position.z + 0.5,
          });
        consumeDurability(player, tool.typeId, 1);
      } catch (error) {
        warnOnce("Rbow tool use", error);
      } finally {
        pending.delete(key);
      }
    });
  } catch (error) {
    warnOnce("Rbow tool interaction", error);
  }
}

// Optional diagnostics: /scriptevent elleedog:rbow_check
// This is not necessary to play, and never changes game rules or player gear.
export function onScriptEvent(event: ScriptEventCommandMessageAfterEvent): void {
  if (event.id !== "elleedog:rbow_check") return;
  const lines = ["67 Rbow Ore Mod 1.2.0 | diagnostic check"];
  for (const type of [
    "sword",
    "pickaxe",
    "axe",
    "shovel",
    "hoe",
    "spear",
    "helmet",
    "chestplate",
    "leggings",
    "boots",
  ]) {
    try {
      const actual = new ItemStack(`${NS}rbow_${type}`).getComponent("minecraft:durability")?.maxDurability;
      const vanilla = new ItemStack(`minecraft:netherite_${type}`).getComponent("minecraft:durability")?.maxDurability;
      lines.push(`${actual === undefined ? "FAIL" : "OK"} ${type}: Rbow durability ${actual}; native ${vanilla}`);
    } catch (error) {
      lines.push(`${type}: ${String(error)}`);
    }
  }
  for (const id of BLOCKS) {
    try {
      const block = BlockPermutation.resolve(id);
      lines.push(`${block.type.id === id ? "OK" : "FAIL"} block registration: ${id}`);
    } catch (error) {
      lines.push(`FAIL block ${id}: ${String(error)}`);
    }
  }
  lines.push("Native drops enabled; no scripted explosion or item-damage interception.");
  lines.push(
    `Recipe discovery: recipesUnlock=${world.gameRules.recipesUnlock}; showRecipeMessages=${world.gameRules.showRecipeMessages}`,
  );
  lines.push("This checks registrations/components, not client icons or manual equip/place behavior.");
  const output = lines.join("\n");
  if (isPlayer(event.sourceEntity)) event.sourceEntity.sendMessage(output);
  else console.warn(output);
}

export function resetState(): void {
  pending.clear();
  warned.clear();
}
