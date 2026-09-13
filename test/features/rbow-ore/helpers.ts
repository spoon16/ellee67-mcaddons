import { bootstrap } from "../../../src/core/bootstrap.ts";
import { rbowOre } from "../../../src/features/rbow-ore/index.ts";
import { LEGACY_TYPE } from "../../../src/features/rbow-ore/legacy_drop_logic.ts";
import {
  addPlayer,
  type Block,
  Container,
  type Dimension,
  dimensions,
  type Entity,
  entityProperties,
  ItemStack,
  loadWorld,
  type Player,
  registerEntityType,
  registry,
  startup,
  step,
  type Vector3,
} from "../../mocks/minecraft-server.ts";

export interface Durability {
  damage: number;
  maxDurability: number;
  unbreakable: boolean;
}

/** The entity the Rbow Ore behavior pack declares and the feature probes for after world load. */
export const PROBE_ENTITY = "elleedog:rbow_drop";

/** Boots the add-on with only rbow-ore, its packs active, and runs the tick on which start() scans for legacy drops. */
export function boot(): void {
  bootstrap([rbowOre]);
  startup();
  registerEntityType(PROBE_ENTITY);
  loadWorld();
  step(1);
}

/** An Rbow item carrying the durability and (empty) enchantment components the runtime reads on engine items. */
export function tool(typeId: string, damage = 0, maxDurability = 2032): { item: ItemStack; durability: Durability } {
  const durability: Durability = { damage, maxDurability, unbreakable: false };
  const item = new ItemStack(typeId);
  item.components["minecraft:durability"] = durability;
  item.components["minecraft:enchantable"] = { getEnchantment: () => undefined };
  return { item, durability };
}

/** A Survival player whose selected hotbar slot holds `item`. */
export function holding(name: string, item: ItemStack): Player {
  const player = addPlayer(name);
  player.inventory.setItem(player.selectedSlotIndex, item);
  return player;
}

export function blockAt(dimension: Dimension, location: Vector3): Block {
  const block = dimension.getBlock(location);
  if (!block) throw new Error(`No block at ${JSON.stringify(location)}`);
  return block;
}

/** The `elleedog:rbow_tool` component as the engine received it at startup, gate included. */
export function toolComponent(): Record<string, any> {
  const component = registry.components.get("elleedog:rbow_tool");
  if (!component) throw new Error("elleedog:rbow_tool is not registered");
  return component;
}

/** A player holding an Rbow hoe who clicks the top of a dirt block with air above it. */
export function tillingFixture(name = "Farmer") {
  const { item, durability } = tool("elleedog:rbow_hoe");
  const player = holding(name, item);
  const dimension = dimensions.overworld;
  const location = { x: 1, y: 2, z: 3 };
  dimension.setBlock(location, "minecraft:dirt");
  const event = { player, itemStack: item, block: blockAt(dimension, location), blockFace: "Up", cancel: false };
  return {
    player,
    item,
    durability,
    dimension,
    location,
    event,
    blockType: () => dimension.getBlock(location)?.typeId,
  };
}

/** A carrier entity saved by Rbow 1.1.3 or 1.1.4 with one stored stack, declared like `entities/rbow_drop.json`. */
export function legacyDrop(dimension: Dimension, stack: ItemStack, location: Vector3): Entity {
  entityProperties[LEGACY_TYPE] = { "elleedog:drop_art": 0 };
  const entity = dimension.spawnEntity(LEGACY_TYPE, location);
  const container = new Container(1);
  container.setItem(0, stack);
  entity.components["minecraft:inventory"] = { container };
  return entity;
}
