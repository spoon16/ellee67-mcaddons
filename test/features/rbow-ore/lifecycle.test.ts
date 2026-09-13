import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap } from "../../../src/core/bootstrap.ts";
import { isRunning, setEnabled } from "../../../src/core/features.ts";
import { rbowOre } from "../../../src/features/rbow-ore/index.ts";
import { resetState } from "../../../src/features/rbow-ore/main.js";
import {
  addPlayer,
  BlockPermutation,
  dimensions,
  ItemStack,
  loadWorld,
  type Player,
  reset,
  ScriptEventSource,
  startup,
  step,
  system,
  world,
} from "../../mocks/minecraft-server.ts";
import { blockAt, boot, legacyDrop, tillingFixture, toolComponent } from "./helpers.ts";

beforeEach(() => {
  reset();
  resetState();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** Breaks an Rbow ore block with an iron pickaxe and returns the drops spawned for it. */
function mineOre(player: Player) {
  const dimension = dimensions.overworld;
  const location = { x: 4, y: -20, z: 4 };
  dimension.setBlock(location, "elleedog:rbow_ore");
  const before = dimension.spawnedItems.length;
  world.afterEvents.playerBreakBlock.emit({
    brokenBlockPermutation: BlockPermutation.resolve("elleedog:rbow_ore"),
    itemStackBeforeBreak: new ItemStack("minecraft:iron_pickaxe"),
    itemStackAfterBreak: new ItemStack("minecraft:iron_pickaxe"),
    player,
    block: blockAt(dimension, location),
    dimension,
  });
  return dimension.spawnedItems.slice(before).map((drop) => `${drop.item.typeId} x${drop.item.amount}`);
}

function runCheck(player: Player): void {
  system.afterEvents.scriptEventReceive.emit({
    id: "elleedog:rbow_check",
    message: "",
    sourceType: ScriptEventSource.Entity,
    sourceEntity: player,
  });
}

describe("rbow-ore lifecycle", () => {
  it("subscribes the tool handlers on start and leaves only the always-on drop handler behind on stop", () => {
    bootstrap([rbowOre]);
    startup();
    const interactBefore = world.beforeEvents.playerInteractWithBlock.size;
    const scriptBefore = system.afterEvents.scriptEventReceive.size;
    const loadBefore = world.afterEvents.entityLoad.size;
    const intervalsBefore = system.intervalCount;
    loadWorld();
    step(1);
    expect(isRunning("rbow-ore")).toBe(true);
    expect(world.beforeEvents.playerInteractWithBlock.size).toBe(interactBefore + 1);
    expect(system.afterEvents.scriptEventReceive.size).toBe(scriptBefore + 1);
    expect(world.afterEvents.entityLoad.size).toBe(loadBefore + 1);
    expect(world.afterEvents.playerBreakBlock.size).toBe(1);
    expect(setEnabled("rbow-ore", false)).toEqual({ changed: true });
    expect(isRunning("rbow-ore")).toBe(false);
    expect(world.beforeEvents.playerInteractWithBlock.size).toBe(interactBefore);
    expect(system.afterEvents.scriptEventReceive.size).toBe(scriptBefore);
    expect(world.afterEvents.entityLoad.size).toBe(loadBefore);
    expect(system.intervalCount).toBe(intervalsBefore);
    expect(world.afterEvents.playerBreakBlock.size).toBe(1);
  });

  it("still drops ore while disabled but stops tool actions, the diagnostic and the tool component", () => {
    boot();
    const player = addPlayer("Ellee");
    expect(setEnabled("rbow-ore", false)).toEqual({ changed: true });

    expect(mineOre(player)).toEqual(["elleedog:raw_rbow_ore x1"]);

    const tilling = tillingFixture("Farmer");
    world.beforeEvents.playerInteractWithBlock.emit(tilling.event);
    step(1);
    expect(tilling.event.cancel).toBe(false);
    expect(tilling.blockType()).toBe("minecraft:dirt");
    expect(tilling.durability.damage).toBe(0);

    runCheck(player);
    expect(player.chat).toEqual([]);

    const combat = { itemStack: new ItemStack("elleedog:rbow_axe"), durabilityDamage: 0 };
    toolComponent().onBeforeDurabilityDamage(combat);
    expect(combat.durabilityDamage).toBe(0);

    expect(setEnabled("rbow-ore", true)).toEqual({ changed: true });
    expect(mineOre(player)).toEqual(["elleedog:raw_rbow_ore x1"]);
    const restored = tillingFixture("Farmer again");
    world.beforeEvents.playerInteractWithBlock.emit(restored.event);
    expect(restored.event.cancel).toBe(true);
    step(1);
    expect(restored.blockType()).toBe("minecraft:farmland");
    expect(restored.durability.damage).toBe(1);
    runCheck(player);
    expect(player.chat).toHaveLength(1);
    expect(player.chat[0]).toMatch(/^67 Rbow Ore Mod 1\.2\.0 \| diagnostic check\n/);
    expect(player.chat[0]).toContain("OK block registration: elleedog:rbow_ore");
    toolComponent().onBeforeDurabilityDamage(combat);
    expect(combat.durabilityDamage).toBe(2);
  });

  it("releases stored stacks from legacy carriers found at start and on later entity loads, but not while disabled", () => {
    bootstrap([rbowOre]);
    startup();
    const dimension = dimensions.overworld;
    const early = legacyDrop(dimension, new ItemStack("elleedog:rbow_ingot", 43), { x: 2, y: 64, z: 3 });
    loadWorld();
    step(1);
    expect(early.isValid, "the start-up scan only queues the carrier").toBe(true);
    expect(dimension.spawnedItems).toEqual([]);
    step(1);
    expect(dimension.spawnedItems.map((drop) => ({ ...drop.item, location: drop.location }))).toMatchObject([
      { typeId: "elleedog:rbow_ingot", amount: 43, location: { x: 2, y: 64, z: 3 } },
    ]);
    expect(early.isValid).toBe(false);

    const later = legacyDrop(dimension, new ItemStack("elleedog:rbow_helmet"), { x: 5, y: 64, z: 5 });
    world.afterEvents.entityLoad.emit({ entity: later });
    step(1);
    expect(dimension.spawnedItems).toHaveLength(2);
    expect(dimension.spawnedItems[1]?.item.typeId).toBe("elleedog:rbow_helmet");
    expect(later.isValid).toBe(false);

    setEnabled("rbow-ore", false);
    const ignored = legacyDrop(dimension, new ItemStack("elleedog:rbow_sword"), { x: 8, y: 64, z: 8 });
    world.afterEvents.entityLoad.emit({ entity: ignored });
    step(1);
    expect(dimension.spawnedItems).toHaveLength(2);
    expect(ignored.isValid).toBe(true);
  });
});
