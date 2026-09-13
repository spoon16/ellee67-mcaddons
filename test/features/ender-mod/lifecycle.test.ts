import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap } from "../../../src/core/bootstrap.ts";
import { disabledMessage } from "../../../src/core/commands.ts";
import { isRunning, setEnabled } from "../../../src/core/features.ts";
import { enderMod } from "../../../src/features/ender-mod/index.ts";
import {
  addPlayer,
  CustomCommandStatus,
  type Dimension,
  dimensions,
  type Entity,
  entityProperties,
  loadWorld,
  type Player,
  reset,
  runCommand,
  startup,
  step,
  system,
  world,
} from "../../mocks/minecraft-server.ts";

const GATE = "elleedog:may_move_blocks";
const COMMAND = "elleedog:ender_protect";

/** Spawns an Enderman carrying the override's property and announces it the way the engine does. */
function spawnEnderman(x: number, z: number, y = 64, dimension: Dimension = dimensions.overworld): Entity {
  const entity = dimension.spawnEntity("minecraft:enderman", { x, y, z });
  world.afterEvents.entitySpawn.emit({ entity, cause: "Spawned" });
  return entity;
}

function placeBlock(x: number, z: number, y = 64): void {
  const block = dimensions.overworld.setBlock({ x, y, z }, "minecraft:dirt");
  world.afterEvents.playerPlaceBlock.emit({ block });
}

function breakBlock(x: number, z: number, y = 64): void {
  const block = dimensions.overworld.getBlock({ x, y, z });
  world.afterEvents.playerBreakBlock.emit({ block });
}

function protect(operator: Player, ...args: unknown[]): void {
  const result = runCommand(COMMAND, { sourceEntity: operator }, ...args);
  expect(result.status).toBe(CustomCommandStatus.Success);
}

function boot(): void {
  bootstrap([enderMod]);
  startup();
  loadWorld();
}

function subscriptionCounts() {
  return {
    place: world.afterEvents.playerPlaceBlock.size,
    break: world.afterEvents.playerBreakBlock.size,
    spawn: world.afterEvents.entitySpawn.size,
    load: world.afterEvents.entityLoad.size,
    leave: world.afterEvents.playerLeave.size,
    intervals: system.intervalCount,
  };
}

beforeEach(() => {
  reset();
  entityProperties["minecraft:enderman"] = { [GATE]: false };
});

afterEach(() => vi.restoreAllMocks());

describe("ender-mod lifecycle", () => {
  it("denies a spawned Enderman first, then allows it once it has been observed in the wilderness", () => {
    boot();
    const enderman = spawnEnderman(0, 0);
    expect(enderman.getProperty(GATE)).toBe(false);
    step(3);
    expect(enderman.getProperty(GATE)).toBe(false);
    step(1);
    expect(enderman.getProperty(GATE)).toBe(true);
  });

  it("sweeps Endermen that were already loaded to denied when the world loads", () => {
    bootstrap([enderMod]);
    startup();
    const enderman = dimensions.overworld.spawnEntity("minecraft:enderman", { x: 0, y: 64, z: 0 });
    enderman.props[GATE] = true;
    loadWorld();
    step(1);
    expect(enderman.getProperty(GATE)).toBe(false);
  });

  it("denies an Enderman as soon as a player places a block within reach, and frees it when the block breaks", () => {
    boot();
    const enderman = spawnEnderman(0, 0);
    step(4);
    expect(enderman.getProperty(GATE)).toBe(true);
    placeBlock(2, 2);
    step(1);
    expect(enderman.getProperty(GATE)).toBe(false);
    step(10);
    expect(enderman.getProperty(GATE)).toBe(false);
    breakBlock(2, 2);
    step(2);
    expect(enderman.getProperty(GATE)).toBe(true);
  });

  it("holds an Enderman for two ticks after an observed teleport before re-evaluating", () => {
    boot();
    const enderman = spawnEnderman(0, 0);
    step(4);
    expect(enderman.getProperty(GATE)).toBe(true);
    enderman.teleport({ x: 30, y: 64, z: 30 });
    step(2);
    expect(enderman.getProperty(GATE)).toBe(false);
    step(3);
    expect(enderman.getProperty(GATE)).toBe(true);
  });

  it("protects a named area at every height until it is removed", () => {
    boot();
    const operator = addPlayer("Op");
    operator.location = { x: 10, y: 64, z: 10 };
    protect(operator, "pos1");
    operator.location = { x: 20, y: 64, z: 20 };
    protect(operator, "pos2");
    protect(operator, "name", "House");
    protect(operator, "list");
    step(1);
    expect(operator.chat).toEqual([
      "[67 Ender Mod] pos1: 10, 64, 10 (minecraft:overworld). Areas use X/Z and protect full height.",
      "[67 Ender Mod] pos2: 20, 64, 20 (minecraft:overworld). Areas use X/Z and protect full height.",
      '[67 Ender Mod] Saved "House": X 10..20, Z 10..20, full height (minecraft:overworld).',
      expect.stringContaining('"House"'),
    ]);
    const inside = spawnEnderman(15, 15);
    const high = spawnEnderman(15, 15, 250);
    const nether = spawnEnderman(15, 15, 64, dimensions.nether);
    const outside = spawnEnderman(15, 40);
    step(10);
    expect(inside.getProperty(GATE)).toBe(false);
    expect(high.getProperty(GATE)).toBe(false);
    expect(nether.getProperty(GATE)).toBe(true);
    expect(outside.getProperty(GATE)).toBe(true);
    protect(operator, "remove", "House");
    step(1);
    expect(operator.chat[operator.chat.length - 1]).toBe(
      '[67 Ender Mod] Removed area "House". Individually tracked player placements remain protected.',
    );
    step(2);
    expect(inside.getProperty(GATE)).toBe(true);
    expect(high.getProperty(GATE)).toBe(true);
  });

  it("refuses the command for anything but a player", () => {
    boot();
    const result = runCommand(COMMAND, {}, "list");
    expect(result.status).toBe(CustomCommandStatus.Failure);
    expect(result.message).toBe("Run this command as a player with Operator permission.");
  });

  it("restores vanilla Endermen while disabled and resumes gating when re-enabled", () => {
    bootstrap([enderMod]);
    startup();
    const before = subscriptionCounts();
    loadWorld();
    expect(subscriptionCounts()).toEqual({
      place: before.place + 1,
      break: before.break + 1,
      spawn: before.spawn + 1,
      load: before.load + 1,
      leave: before.leave + 1,
      intervals: before.intervals + 1,
    });
    const operator = addPlayer("Op");
    const nearBuild = spawnEnderman(0, 0);
    placeBlock(1, 1);
    step(2);
    expect(nearBuild.getProperty(GATE)).toBe(false);
    protect(operator, "list");

    expect(setEnabled("ender-mod", false)).toEqual({ changed: true });
    expect(isRunning("ender-mod")).toBe(false);
    expect(subscriptionCounts()).toEqual({ ...before, spawn: before.spawn + 1, load: before.load + 1 });
    step(1);
    expect(nearBuild.getProperty(GATE)).toBe(true);
    const wilderness = spawnEnderman(50, 50);
    step(1);
    expect(wilderness.getProperty(GATE)).toBe(true);
    step(20);
    expect(nearBuild.getProperty(GATE)).toBe(true);
    expect(wilderness.getProperty(GATE)).toBe(true);
    const refused = runCommand(COMMAND, { sourceEntity: operator }, "list");
    expect(refused).toEqual({ status: CustomCommandStatus.Failure, message: disabledMessage(enderMod) });
    expect(refused.message).toBe("Ender Mod is disabled. An operator can run /elleedog67:enable ender-mod.");
    placeBlock(51, 51);

    expect(setEnabled("ender-mod", true)).toEqual({ changed: true });
    expect(subscriptionCounts()).toEqual({
      place: before.place + 1,
      break: before.break + 1,
      spawn: before.spawn + 1,
      load: before.load + 1,
      leave: before.leave + 1,
      intervals: before.intervals + 1,
    });
    step(1);
    expect(nearBuild.getProperty(GATE)).toBe(false);
    expect(wilderness.getProperty(GATE)).toBe(false);
    step(3);
    expect(nearBuild.getProperty(GATE)).toBe(false);
    expect(wilderness.getProperty(GATE)).toBe(true);
    protect(operator, "list");
  });

  it("warns at most once per 200 ticks when the Enderman override is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    boot();
    delete entityProperties["minecraft:enderman"];
    const vanilla = spawnEnderman(0, 0);
    expect(() => vanilla.getProperty(GATE)).toThrow();
    step(250);
    const first = warn.mock.calls.length;
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(2);
    expect(warn.mock.calls.every(([line]) => String(line).startsWith("[67 Ender Mod] "))).toBe(true);
    step(200);
    expect(warn.mock.calls.length).toBe(first + 1);
  });
});
