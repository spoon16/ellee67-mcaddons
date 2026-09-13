// Exercises the runtime handlers through the real bootstrap against the shared engine mock. Nothing here runs
// Minecraft or establishes engine event ordering.
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { resetState } from "../../../src/features/rbow-ore/main.js";
import {
  addPlayer,
  BlockPermutation,
  dimensions,
  type Entity,
  GameMode,
  ItemStack,
  registry,
  reset,
  step,
  system,
  world,
} from "../../mocks/minecraft-server.ts";
import { blockAt, boot, holding, tillingFixture, tool, toolComponent } from "./helpers.ts";

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  reset();
  resetState();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("rbow-ore runtime", () => {
  it("registers only the Rbow tool component and subscribes the break and interact handlers", () => {
    boot();
    const featureComponents = [...registry.components.keys()].filter((name) => !name.startsWith("elleedog67:"));
    expect(featureComponents).toEqual(["elleedog:rbow_tool"]);
    expect(warn).not.toHaveBeenCalled();
    expect(world.afterEvents.playerBreakBlock.size).toBe(1);
    expect(world.beforeEvents.playerInteractWithBlock.size).toBe(1);
  });

  it("leaves explosions, entity damage and item spawns to the engine", () => {
    boot();
    const untouched = [
      world.beforeEvents.explosion,
      world.beforeEvents.entityHurt,
      world.afterEvents.entityHurt,
      world.afterEvents.entitySpawn,
    ];
    for (const signal of untouched) expect(signal.size).toBe(0);
    expect(system.intervalCount).toBe(0);
  });

  it("mines with the pre-break item and honours doTileDrops", () => {
    boot();
    const dimension = dimensions.overworld;
    const location = { x: 10, y: -50, z: 5 };
    dimension.setBlock(location, "elleedog:rbow_ore");
    const event = {
      brokenBlockPermutation: BlockPermutation.resolve("elleedog:rbow_ore"),
      itemStackBeforeBreak: new ItemStack("minecraft:iron_pickaxe"),
      itemStackAfterBreak: undefined,
      player: addPlayer("Miner"),
      block: blockAt(dimension, location),
      dimension,
    };
    world.afterEvents.playerBreakBlock.emit(event);
    expect(dimension.spawnedItems.map((drop) => ({ ...drop.item, location: drop.location }))).toMatchObject([
      { typeId: "elleedog:raw_rbow_ore", amount: 1, location: { x: 10.5, y: -49.5, z: 5.5 } },
    ]);
    world.gameRules.doTileDrops = false;
    world.afterEvents.playerBreakBlock.emit(event);
    expect(dimension.spawnedItems).toHaveLength(1);
  });

  it("wears the held tool on mining, one point for a pickaxe and two for the sword", () => {
    boot();
    for (const [kind, expected] of [
      ["pickaxe", 1],
      ["sword", 2],
    ] as const) {
      const { item, durability } = tool(`elleedog:rbow_${kind}`);
      const player = holding(`Miner ${kind}`, item);
      toolComponent().onMineBlock({ source: player, itemStack: item });
      expect(durability.damage, kind).toBe(expected);
      expect(player.inventory.getItem(0)).toBe(item);
    }
  });

  it("breaks the held tool at the configured maximum durability", () => {
    boot();
    const { item } = tool("elleedog:rbow_pickaxe", 2031);
    const player = holding("Miner", item);
    toolComponent().onMineBlock({ source: player, itemStack: item });
    expect(player.inventory.getItem(0)).toBeUndefined();
    expect(dimensions.overworld.sounds).toEqual(["random.break"]);
  });

  it("does not consume gear for creative, unbreakable, non-player or changed-tool mining events", () => {
    boot();
    for (const change of ["creative", "unbreakable", "nonplayer", "changed"]) {
      const { item, durability } = tool("elleedog:rbow_pickaxe");
      const player = holding(`Miner ${change}`, item);
      let source: Entity = player;
      if (change === "creative") player.gameMode = GameMode.Creative;
      if (change === "unbreakable") durability.unbreakable = true;
      if (change === "nonplayer") source = dimensions.overworld.spawnEntity("minecraft:zombie", player.location);
      if (change === "changed") player.inventory.setItem(0, new ItemStack("minecraft:stick"));
      toolComponent().onMineBlock({ source, itemStack: item });
      expect(durability.damage, change).toBe(0);
    }
  });

  it("charges one combat durability point for sword and hoe and two for the other tools", () => {
    boot();
    for (const [kind, expected] of [
      ["sword", 1],
      ["hoe", 1],
      ["axe", 2],
      ["pickaxe", 2],
      ["shovel", 2],
    ] as const) {
      const event = { itemStack: new ItemStack(`elleedog:rbow_${kind}`), durabilityDamage: 0 };
      toolComponent().onBeforeDurabilityDamage(event);
      expect(event.durabilityDamage, kind).toBe(expected);
    }
  });

  it("cancels the native hoe interaction and performs exactly one validated delayed edit", () => {
    boot();
    const f = tillingFixture();
    world.beforeEvents.playerInteractWithBlock.emit(f.event);
    world.beforeEvents.playerInteractWithBlock.emit(f.event);
    expect(f.event.cancel).toBe(true);
    expect(system.pendingJobCount).toBe(1);
    expect(f.blockType()).toBe("minecraft:dirt");
    step(1);
    expect(f.blockType()).toBe("minecraft:farmland");
    expect(f.durability.damage).toBe(1);
    expect(f.dimension.sounds).toEqual(["use.gravel"]);
    expect(warn).not.toHaveBeenCalled();
  });

  for (const change of ["slot", "item", "block", "mode", "space", "valid"]) {
    it(`refuses the delayed edit when the ${change} changed in between`, () => {
      boot();
      const f = tillingFixture();
      world.beforeEvents.playerInteractWithBlock.emit(f.event);
      if (change === "slot") f.player.selectedSlotIndex = 1;
      if (change === "item") f.player.inventory.setItem(0, new ItemStack("minecraft:stick"));
      if (change === "block") f.dimension.setBlock(f.location, "minecraft:diamond_block");
      if (change === "mode") f.player.gameMode = GameMode.Creative;
      if (change === "space") f.dimension.setBlock({ ...f.location, y: f.location.y + 1 }, "minecraft:stone");
      if (change === "valid") f.player.isValid = false;
      step(1);
      expect(f.durability.damage).toBe(0);
      expect(f.blockType()).not.toBe("minecraft:farmland");
      expect(warn).not.toHaveBeenCalled();
    });
  }

  it("logs a runtime error once instead of swallowing or repeating it", () => {
    boot();
    const event = {
      get brokenBlockPermutation(): never {
        throw new Error("simulated failure");
      },
    };
    world.afterEvents.playerBreakBlock.emit(event);
    world.afterEvents.playerBreakBlock.emit(event);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/simulated failure/);
  });
});
