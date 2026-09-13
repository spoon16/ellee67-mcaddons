import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap } from "../../../src/core/bootstrap.ts";
import { isRunning } from "../../../src/core/features.ts";
import { rbowOre } from "../../../src/features/rbow-ore/index.ts";
import { resetState } from "../../../src/features/rbow-ore/main.ts";
import {
  addPlayer,
  BlockPermutation,
  dimensions,
  ItemStack,
  loadWorld,
  type Player,
  registerEntityType,
  reset,
  runCommand,
  ScriptEventSource,
  startup,
  step,
  system,
  world,
} from "../../mocks/minecraft-server.ts";
import { blockAt, legacyDrop, PROBE_ENTITY, tillingFixture, toolComponent } from "./helpers.ts";

const PACK_TITLE = "ElleeDog 67 Rbow Ore";

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

function sizes() {
  return {
    interact: world.beforeEvents.playerInteractWithBlock.size,
    script: system.afterEvents.scriptEventReceive.size,
    load: world.afterEvents.entityLoad.size,
    intervals: system.intervalCount,
  };
}

function featuresReport(): string {
  return String(runCommand("elleedog67:features", {}).message);
}

describe("rbow-ore lifecycle", () => {
  it("subscribes the tool handlers on start next to the always-on drop handler", () => {
    bootstrap([rbowOre]);
    startup();
    registerEntityType(PROBE_ENTITY);
    const before = sizes();
    loadWorld();
    step(1);
    expect(isRunning("rbow-ore")).toBe(true);
    expect(sizes()).toEqual({
      interact: before.interact + 1,
      script: before.script + 1,
      load: before.load + 1,
      intervals: before.intervals,
    });
    expect(world.afterEvents.playerBreakBlock.size).toBe(1);
    expect(featuresReport()).toContain("rbow-ore: active");
  });

  it("releases stored stacks from legacy carriers found at start and on later entity loads", () => {
    bootstrap([rbowOre]);
    startup();
    registerEntityType(PROBE_ENTITY);
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
  });

  it("without the packs it still drops ore but never starts: no tool actions, diagnostic, component or recovery", () => {
    bootstrap([rbowOre]);
    startup();
    const before = sizes();
    const dimension = dimensions.overworld;
    const carrier = legacyDrop(dimension, new ItemStack("elleedog:rbow_ingot", 43), { x: 2, y: 64, z: 3 });
    loadWorld();
    step(2);
    expect(isRunning("rbow-ore")).toBe(false);
    expect(sizes()).toEqual(before);
    expect(world.afterEvents.playerBreakBlock.size).toBe(1);
    expect(carrier.isValid).toBe(true);
    expect(dimension.spawnedItems).toEqual([]);

    const player = addPlayer("Ellee");
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

    const later = legacyDrop(dimension, new ItemStack("elleedog:rbow_sword"), { x: 8, y: 64, z: 8 });
    world.afterEvents.entityLoad.emit({ entity: later });
    step(1);
    expect(later.isValid).toBe(true);
    expect(dimension.spawnedItems.map((drop) => drop.item.typeId)).toEqual(["elleedog:raw_rbow_ore"]);

    const report = featuresReport();
    expect(report).toContain("rbow-ore: packs off");
    expect(report).toContain(PACK_TITLE);
  });
});
