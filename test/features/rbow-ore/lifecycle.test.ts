import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runFeature } from "../../../src/core/feature.ts";
import { rbowOre } from "../../../src/features/rbow-ore/index.ts";
import { resetState } from "../../../src/features/rbow-ore/main.ts";
import { dimensions, ItemStack, loadWorld, reset, startup, step, system, world } from "../../mocks/minecraft-server.ts";
import { legacyDrop } from "./helpers.ts";

beforeEach(() => {
  reset();
  resetState();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function sizes() {
  return {
    drop: world.afterEvents.playerBreakBlock.size,
    interact: world.beforeEvents.playerInteractWithBlock.size,
    script: system.afterEvents.scriptEventReceive.size,
    load: world.afterEvents.entityLoad.size,
    intervals: system.intervalCount,
  };
}

describe("rbow-ore lifecycle", () => {
  it("subscribes the drop, tool, diagnostic and recovery handlers on world load", () => {
    runFeature(rbowOre);
    startup();
    const before = sizes();
    loadWorld();
    step(1);
    expect(sizes()).toEqual({
      drop: before.drop + 1,
      interact: before.interact + 1,
      script: before.script + 1,
      load: before.load + 1,
      intervals: before.intervals,
    });
  });

  it("releases stored stacks from legacy carriers found at start and on later entity loads", () => {
    runFeature(rbowOre);
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
  });
});
