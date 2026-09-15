// Rbow Ore's engine glue: the event handlers and the custom item component. The decisions (what drops, what a tool
// does to a block, how much a tool wears) live in rules.ts as pure functions; this file reads the engine, asks
// rules.ts, then applies the answer.
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
import { featureLog } from "../../core/log.ts";
import { entityId } from "../../core/vanilla.ts";
import { BLOCKS, durabilityLoss, enchantment, GEAR, miningDrop, NS, toolAction } from "./rules.ts";

/**
 * A block's permutation is its type plus its states (which way it faces, whether a campfire is lit, and so on).
 * The API types the state methods against vanilla state names only, so this narrower view lets them be called
 * with any name.
 */
interface PermutationStates {
  getState(name: string): boolean | number | string | undefined;
  withState(name: string, value: boolean | number | string): BlockPermutation;
}

export const log = featureLog("Rbow Ore");
function warnOnce(label: string, error: unknown): void {
  log.warnOnce(label, `${label}: ${log.describe(error)}`);
}
// Engine callbacks hand over live entities, so validity is not re-checked here.
function isPlayer(entity: Entity | undefined): entity is Player {
  return entity?.typeId === entityId("minecraft:player");
}
function survivalMode(player: Player): boolean {
  return [GameMode.Survival, GameMode.Adventure].includes(player.getGameMode());
}
/** Wears the held tool by `amount` points. Durability counts damage up; at the maximum the tool breaks. */
function consumeDurability(player: Player, expectedId: string, amount: number): void {
  if (!survivalMode(player)) return;
  const equipment = player.getComponent("minecraft:equippable");
  const item = equipment?.getEquipment(EquipmentSlot.Mainhand);
  // The player may have switched slots since the event; only wear the tool that was actually used.
  if (!equipment || !item || item.typeId !== expectedId) return;
  const durability = item.getComponent("minecraft:durability");
  if (!durability || durability.unbreakable) return;
  const loss = durabilityLoss(amount, enchantment(item, "unbreaking"));
  if (!loss) return;
  if (durability.damage + loss >= durability.maxDurability) {
    // One argument clears the slot; an explicit undefined is refused at the native boundary.
    equipment.setEquipment(EquipmentSlot.Mainhand);
    player.dimension.playSound("random.break", player.location);
  } else {
    // An ItemStack read from a slot is a copy: change it, then write it back.
    durability.damage += loss;
    equipment.setEquipment(EquipmentSlot.Mainhand, item);
  }
}

/**
 * A custom item component: the Rbow tools' JSON lists `elleedog:rbow_tool`, and this object supplies its behaviour.
 * The engine calls `onMineBlock` after a block is mined with the tool and `onBeforeDurabilityDamage` before it
 * applies wear from hitting something.
 */
export function registerToolComponent(registry: ItemRegistry): void {
  registry.registerCustomComponent("elleedog:rbow_tool", {
    // Custom diggers require explicit mining wear. Combat wear is still handled
    // by the engine, so it is NOT also charged by a global hit callback.
    onMineBlock(event) {
      try {
        if (!isPlayer(event.source) || !event.itemStack) return;
        // A sword is not meant for digging, so it wears twice as fast when used that way, as in vanilla.
        const amount = event.itemStack.typeId === `${NS}rbow_sword` ? 2 : 1;
        consumeDurability(event.source, event.itemStack.typeId, amount);
      } catch (error) {
        warnOnce("Tool mining durability", error);
      }
    },
    onBeforeDurabilityDamage(event) {
      // Vanilla wear per hit: swords and hoes lose 1, the other tools 2.
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
    // Items stack to 64 at most, so a larger drop is spawned as several stacks at the block's centre.
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
//
// The shape of this handler is a pattern used all over the add-on. A before-event fires before the game acts and
// may cancel it, but it may not change the world. So: decide and cancel now, remember exactly what was seen, and
// schedule the change with `system.run`. When that runs a tick later, re-check that nothing moved (same tool in
// hand, same block still there) before writing, so a stale decision never lands on a changed world.
/** Players with a change already scheduled, so a burst of clicks cannot queue the same change twice. */
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
    // Already in the wanted state (a campfire that is out): nothing to do, let vanilla handle the click.
    if (action.state && (original as PermutationStates).getState(action.state) === action.value) return;
    event.cancel = true;
    const key = player.id;
    if (pending.has(key)) return;
    pending.add(key);
    // Snapshot plain values, never the event or block objects, which are only valid during the callback.
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
          // Stripping a log keeps its orientation: copy over every state the new block also has.
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
// `/scriptevent <id> <message>` is a vanilla command that hands its text to scripts, which is a cheap way to add a
// check command without registering a custom one.
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
      // Creating an ItemStack of an id proves the item is registered; an unknown id throws.
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
  // From the console there is no player to answer, so the report goes to the log instead.
  if (isPlayer(event.sourceEntity)) event.sourceEntity.sendMessage(output);
  else log.info(output);
}

/** Clears module state between world loads and tests. */
export function resetState(): void {
  pending.clear();
  log.reset();
}
