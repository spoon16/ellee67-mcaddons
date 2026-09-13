// The trim workshop was removed from Rbow in 1.1.4. These tests hold the line: the runtime never intercepts
// smithing-table use, never loads server-ui and never scans or converts ordinary entities.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { resetState } from "../../../src/features/rbow-ore/main.ts";
import {
  addPlayer,
  dimensions,
  GameMode,
  ItemStack,
  type Player,
  reset,
  system,
  world,
} from "../../mocks/minecraft-server.ts";
import { boot } from "./helpers.ts";

const featureDir = new URL("../../../src/features/rbow-ore/", import.meta.url);
const featureSources = ["index.ts", "main.ts", "rules.ts", "legacy_drops.ts", "legacy_drop_logic.ts"];

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  reset();
  resetState();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function smithingTable() {
  return dimensions.overworld.setBlock({ x: 0, y: 64, z: 0 }, "minecraft:smithing_table");
}

/** A player at the smithing table whose inventory must never be read by the runtime. */
function smith(name: string, crouching: boolean, mode: GameMode): Player {
  const player = addPlayer(name);
  player.isSneaking = crouching;
  player.gameMode = mode;
  player.getComponent = () => {
    throw new Error("Smithing must not edit inventory.");
  };
  return player;
}

describe("rbow-ore trim cleanup", () => {
  it("loads without server-ui or a trim module and subscribes only the expected events", () => {
    boot();
    for (const name of featureSources) {
      expect(readFileSync(new URL(name, featureDir), "utf8"), name).not.toMatch(/server-ui|trim_station/);
    }
    expect(warn).not.toHaveBeenCalled();
    expect(world.beforeEvents.playerInteractWithBlock.size).toBe(1);
    expect(system.intervalCount).toBe(0);
    for (const signal of [world.beforeEvents.explosion, world.beforeEvents.entityHurt, world.afterEvents.entitySpawn]) {
      expect(signal.size).toBe(0);
    }
    expect(world.afterEvents.entityLoad.size).toBe(1);
    expect(world.afterEvents.worldLoad.size).toBe(1);
  });

  const kinds = [
    "rbow_ingot",
    "rbow_helmet",
    "rbow_chestplate",
    "rbow_leggings",
    "rbow_boots",
    "rbow_hoe",
    "rbow_axe",
    "rbow_shovel",
    "rbow_spear",
    "rbow_sword",
  ];
  for (const crouching of [false, true]) {
    for (const kind of kinds) {
      it(`smithing is not intercepted: ${kind}, crouch=${crouching}`, () => {
        boot();
        for (const mode of [GameMode.Survival, GameMode.Creative]) {
          const item = new ItemStack(`elleedog:${kind}`);
          const event = {
            itemStack: item,
            player: smith(`Smith ${mode}`, crouching, mode),
            block: smithingTable(),
            blockFace: "Up",
            cancel: false,
          };
          world.beforeEvents.playerInteractWithBlock.emit(event);
          expect(event.cancel).toBe(false);
          expect(item.amount).toBe(1);
          expect(system.pendingJobCount).toBe(0);
          expect(warn).not.toHaveBeenCalled();
        }
      });
    }
  }

  it("ordinary vanilla material and an empty hand also retain native table interaction", () => {
    boot();
    for (const type of [
      undefined,
      "minecraft:gold_ingot",
      "minecraft:diamond",
      "minecraft:coast_armor_trim_smithing_template",
    ]) {
      const event = {
        itemStack: type ? new ItemStack(type) : undefined,
        player: smith("Smith", true, GameMode.Survival),
        block: smithingTable(),
        blockFace: "Up",
        cancel: false,
      };
      world.beforeEvents.playerInteractWithBlock.emit(event);
      expect(event.cancel, type ?? "empty hand").toBe(false);
    }
    expect(system.pendingJobCount).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not undo a cancellation by another add-on", () => {
    boot();
    const event = {
      itemStack: new ItemStack("elleedog:rbow_ingot"),
      player: smith("Smith", true, GameMode.Survival),
      block: smithingTable(),
      blockFace: "Up",
      cancel: true,
    };
    world.beforeEvents.playerInteractWithBlock.emit(event);
    expect(event.cancel).toBe(true);
    expect(system.pendingJobCount).toBe(0);
  });

  it("native entity loads do not queue conversions or alter their stacks", () => {
    boot();
    for (const typeId of ["minecraft:item", "minecraft:player", "minecraft:armor_stand"]) {
      const entity = dimensions.overworld.spawnEntity(typeId, { x: 0, y: 64, z: 0 });
      entity.getComponent = () => {
        throw new Error("must not read ordinary item stacks");
      };
      world.afterEvents.entityLoad.emit({ entity });
    }
    expect(system.pendingJobCount).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    expect(system.intervalCount).toBe(0);
  });
});
