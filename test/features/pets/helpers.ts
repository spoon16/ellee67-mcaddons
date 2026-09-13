// Pets-specific conveniences layered on the shared engine mock. They reproduce what the pack's original
// test double offered (seeded entity properties, a write log, a test pickaxe) without editing test/mocks/.
import { bootstrap } from "../../../src/core/bootstrap.ts";
import { pets } from "../../../src/features/pets/index.ts";
import {
  type Entity,
  entityProperties,
  ItemStack,
  loadWorld,
  Player,
  players,
  registerEntityType,
  runCommand,
  startup,
} from "../../mocks/minecraft-server.ts";
import type { ActionFormData } from "../../mocks/minecraft-server-ui.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";

/** Entity properties declared on the pack's `minecraft:player` override, with the defaults from player.json. */
export const PLAYER_PROPERTY_DEFAULTS: Readonly<Record<string, unknown>> = Object.freeze({
  "pet:debug": false,
  "pet:view": "native",
  "pet:motion": false,
  "pet:hand_height": 0,
  "pet:model_id": 0,
  "pet:armor_fit": false,
  "pet:gear_fit": false,
  "pet:tool_enchanted": false,
  "pet:tool_enchanted_for": 0,
  "pet:carry_main_enchanted": false,
  "pet:carry_main_enchanted_for": 0,
  "pet:main_shield_enchanted": false,
  "pet:carry_off_enchanted": false,
  "pet:carry_off_enchanted_for": 0,
  "pet:off_shield_enchanted": false,
  "pet:seat_lift": 0,
  "pet:seat_kind": 0,
  "pet:armor_lift": 0,
  "pet:armor_scale": 1,
  "elleedog:rbow_armor_count": 0,
});

/** An enchanted, damaged, named tool with lore and one dynamic property: every field `itemSummary` reads. */
export function testItem(typeId = "minecraft:diamond_pickaxe"): ItemStack {
  const item = new ItemStack(typeId, 1);
  item.nameTag = "Test Pick";
  item.setLore(["keep me"]);
  item.dynamic["example:custom"] = "keep";
  item.components["minecraft:durability"] = { damage: 17 };
  item.components["minecraft:enchantable"] = {
    getEnchantments: () => [{ type: { id: "minecraft:unbreaking" }, level: 3 }],
  };
  return item;
}

export class PetPlayer extends Player {
  /** Every `setProperty` call in order, whether or not it has applied yet. */
  writes: Array<[string, unknown]> = [];

  constructor(name: string) {
    super(name);
    this.props = { ...PLAYER_PROPERTY_DEFAULTS };
    this.inventory.items[0] = testItem();
  }

  /** A property the entity does not declare reads as `undefined` ("missing"); only an invalid entity throws. */
  override getProperty(key: string): unknown {
    if (!this.isValid) throw new Error("Entity is not valid");
    return this.props[key];
  }

  override setProperty(key: string, value: unknown): void {
    if (!this.isValid) throw new Error("Entity is not valid");
    if (!(key in this.props)) throw new Error(`Unknown entity property ${key}`);
    this.writes.push([key, value]);
    super.setProperty(key, value);
  }

  get items(): Array<ItemStack | undefined> {
    return this.inventory.items;
  }

  /** Container writes so far, or `undefined` when nothing has touched the inventory. */
  get inventoryWrites(): Array<[number, ItemStack | undefined]> | undefined {
    return this.inventory.writes.length ? this.inventory.writes : undefined;
  }
}

/** An online player carrying the pack's player properties and a test pickaxe in slot 0. */
export function petPlayer(name: string): PetPlayer {
  const player = new PetPlayer(name);
  players.push(player);
  return player;
}

/** Declares the diagnostic prop entities so `Dimension.spawnEntity` seeds their properties. */
export function declarePetEntities(): void {
  entityProperties["pet:diag_cube"] = {};
  entityProperties["pet:diag_model"] = { "pet:model_id": 0 };
  entityProperties["cav:diag_cube"] = {};
  entityProperties["cav:diag_model"] = {};
}

/** The entity the Pets behavior pack declares and the feature probes for after world load. */
export const PROBE_ENTITY = "pet:diag_model";

/** Registers the pets feature with the core and loads a world whose Pets packs are active. */
export function start(): void {
  declarePetEntities();
  bootstrap([pets]);
  startup();
  registerEntityType(PROBE_ENTITY);
  loadWorld();
}

/** Runs `/pet:<name>` as `player` would, returning the command callback's result. */
export function command(name: string, player: unknown, ...args: unknown[]) {
  return runCommand(`pet:${name}`, { sourceEntity: player as Entity }, ...args);
}

export function text(player: Player): string {
  return player.chat.join("\n");
}

export function shownForm(index: number): ActionFormData {
  return ui.forms[index] as ActionFormData;
}

/** Captures `console.warn` lines emitted while `action` runs. */
export async function withLogs(action: () => Promise<void> | void): Promise<string[]> {
  const logs: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };
  try {
    await action();
    return logs;
  } finally {
    console.warn = original;
  }
}

export async function silent(action: () => Promise<void> | void): Promise<void> {
  await withLogs(action);
}

/** Returns the error `action` throws, so tests can inspect fields beyond the message. */
export function thrown(action: () => unknown): any {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the action to throw.");
}
