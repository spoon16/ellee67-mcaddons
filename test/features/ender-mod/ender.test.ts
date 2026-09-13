// Ports the upstream 67 Ender Mod tests for geometry, the protection store, the command handler and the gate.
// These modules take storage and engine objects by injection, so a Map-backed storage and a tiny command
// registry double stand in for the engine; the assertions are the upstream ones.
import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTIONS,
  COMMAND_NAME,
  executeProtectionCommand,
  registerProtectionCommands,
} from "../../../src/features/ender-mod/commands.js";
import { shouldAllowMovement } from "../../../src/features/ender-mod/gate.js";
import {
  blockPosition,
  protectionBox,
  regionFromCorners,
  regionIntersects,
  sectionAddress,
} from "../../../src/features/ender-mod/geometry.js";
import { ProtectionStore } from "../../../src/features/ender-mod/store.js";
import { reset } from "../../mocks/minecraft-server.ts";

const D = "minecraft:overworld";
const REGION_KEY = "elleedog:ender_regions_v1";

function storage() {
  const data = new Map<string, unknown>();
  return {
    data,
    getDynamicProperty: (key: string) => data.get(key),
    setDynamicProperty: (key: string, value: unknown) => {
      if (value === undefined) data.delete(key);
      else data.set(key, value);
    },
  };
}

const pos = (x = 0, z = 0, y = 64, dimension = D) => ({ x, y, z, dimension });
const at = (x = 0, z = 0, y = 64, dimension = D) => ({ location: { x, y, z }, dimension });
const player = { id: "alice" };

beforeEach(() => reset());

describe("geometry", () => {
  it("floors negative coordinates instead of rounding toward zero", () => {
    expect(blockPosition({ x: -0.1, y: -64.1, z: 15.9 })).toEqual({ x: -1, y: -65, z: 15 });
  });

  it("rejects NaN coordinates", () => {
    expect(() => blockPosition({ x: Number.NaN, y: 0, z: 0 })).toThrow();
  });

  it("normalises reversed corners and uses full height", () => {
    const r = regionFromCorners("House", pos(10, 20, 80), pos(-10, -20, 60));
    expect(r.minX).toBe(-10);
    expect(r.maxZ).toBe(20);
    expect(r.fullHeight).toBe(true);
    expect(regionIntersects(r, D, { minX: 0, maxX: 0, minY: -200, maxY: -199, minZ: 0, maxZ: 0 })).toBe(true);
  });

  it("treats region boundaries as inclusive", () => {
    const r = regionFromCorners("One", pos(), pos());
    expect(regionIntersects(r, D, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 })).toBe(true);
    expect(regionIntersects(r, D, { minX: 1, maxX: 1, minZ: 0, maxZ: 0 })).toBe(false);
  });

  it("does not protect the same coordinates in another dimension", () => {
    const r = regionFromCorners("One", pos(), pos());
    expect(regionIntersects(r, "minecraft:nether", { minX: 0, maxX: 0, minZ: 0, maxZ: 0 })).toBe(false);
  });

  it("refuses corners from different dimensions", () => {
    expect(() => regionFromCorners("a", pos(), pos(0, 0, 64, "minecraft:nether"))).toThrow(/same dimension/);
  });

  it("refuses to save with a missing corner", () => {
    expect(() => regionFromCorners("a", undefined, pos())).toThrow(/both pos1 and pos2/);
  });

  for (const name of [undefined, "", "\n", "x".repeat(65), "§cBad"]) {
    it(`rejects the invalid area name ${JSON.stringify(name)}`, () => {
      expect(() => regionFromCorners(name, pos(), pos())).toThrow();
    });
  }

  it("preserves names containing spaces", () => {
    expect(regionFromCorners("My House", pos(), pos()).name).toBe("My House");
  });
});

describe("protection store", () => {
  it("persists new placement tracking through a fresh store instance", () => {
    const backend = storage();
    const a = new ProtectionStore(backend);
    a.setPlaced(D, pos(2, 4), true);
    const b = new ProtectionStore(backend);
    expect(b.isPlaced(D, pos(2, 4))).toBe(true);
    expect(b.isPlaced(D, pos(3, 4))).toBe(false);
  });

  it("removes the individual tracking record when a block is broken", () => {
    const backend = storage();
    const a = new ProtectionStore(backend);
    a.setPlaced(D, pos(), true);
    a.setPlaced(D, pos(), false);
    expect(new ProtectionStore(backend).isPlaced(D, pos())).toBe(false);
    expect(backend.data.size).toBe(0);
  });

  it("keeps block records dimension-specific", () => {
    const a = new ProtectionStore(storage());
    a.setPlaced(D, pos(), true);
    expect(a.isPlaced("minecraft:nether", pos())).toBe(false);
  });

  it("persists negative section coordinates and edge blocks without collisions", () => {
    const a = new ProtectionStore(storage());
    const positions = [
      pos(-1, -1, -1),
      pos(-16, -16, -16),
      pos(-17, -17, -17),
      pos(0, 0, 0),
      pos(15, 15, 15),
      pos(16, 16, 16),
    ];
    const addresses = positions.map((p) => sectionAddress(D, p));
    expect(new Set(addresses.map((address) => `${address.key}:${address.local}`)).size).toBe(positions.length);
    for (const p of positions) a.setPlaced(D, p, true);
    for (const p of positions) expect(a.isPlaced(D, p)).toBe(true);
  });

  it("does not block wilderness activity in an empty world", () => {
    expect(new ProtectionStore(storage()).intersects(D, protectionBox(pos()))).toBe(false);
  });

  it("catches protected blocks within native reaching distance", () => {
    const a = new ProtectionStore(storage());
    a.setPlaced(D, pos(2, 2, 67), true);
    expect(a.intersects(D, protectionBox(pos()))).toBe(true);
  });

  it("conservatively protects nearby natural terrain too", () => {
    const a = new ProtectionStore(storage());
    a.setPlaced(D, pos(4, 4, 69), true);
    expect(a.intersects(D, protectionBox(pos()))).toBe(true);
  });

  it("lets blocks outside the protection query keep wilderness pickup", () => {
    const a = new ProtectionStore(storage());
    a.setPlaced(D, pos(8, 0, 64), true);
    expect(a.intersects(D, protectionBox(pos()))).toBe(false);
  });

  it("handles a query crossing a negative chunk boundary", () => {
    const a = new ProtectionStore(storage());
    a.setPlaced(D, pos(-17, -17, 63), true);
    expect(a.intersects(D, protectionBox(pos(-15, -15, 64)))).toBe(true);
  });

  it("persists named regions", () => {
    const backend = storage();
    const a = new ProtectionStore(backend);
    a.saveRegion("House", pos(-2, -2), pos(2, 2));
    const b = new ProtectionStore(backend);
    expect(b.regions[0].name).toBe("House");
    expect(b.intersects(D, protectionBox(pos(0, 0, 250)))).toBe(true);
  });

  it("does not let a duplicate area name overwrite existing protection", () => {
    const a = new ProtectionStore(storage());
    a.saveRegion("House", pos(), pos());
    expect(() => a.saveRegion("house", pos(99, 99), pos(100, 100))).toThrow(/already exists/);
    expect(a.regions[0].minX).toBe(0);
  });

  it("preserves individually placed blocks when an area is removed", () => {
    const a = new ProtectionStore(storage());
    a.saveRegion("House", pos(), pos());
    a.setPlaced(D, pos(), true);
    a.removeRegion("House");
    expect(a.regions.length).toBe(0);
    expect(a.isPlaced(D, pos())).toBe(true);
  });

  it("never discards saved block records through cache eviction", () => {
    const backend = storage();
    const a = new ProtectionStore(backend);
    for (let n = 0; n < 530; n++) a.setPlaced(D, pos(n * 16, 0), true);
    expect(a.cache.size).toBeLessThanOrEqual(512);
    expect(a.isPlaced(D, pos())).toBe(true);
    expect(new ProtectionStore(backend).isPlaced(D, pos())).toBe(true);
  });

  it("fits a completely full section in one dynamic string property", () => {
    const backend = storage();
    const a = new ProtectionStore(backend);
    const key = sectionAddress(D, pos(0, 0, 0)).key;
    backend.setDynamicProperty(key, JSON.stringify(Array.from({ length: 4096 }, (_, n) => n)));
    expect((backend.getDynamicProperty(key) as string).length).toBeLessThan(32767);
    expect(a.isPlaced(D, pos(15, 15, 15))).toBe(true);
    a.setPlaced(D, pos(15, 15, 15), false);
    expect(a.isPlaced(D, pos(15, 15, 15))).toBe(false);
  });

  it("does not silently discard corrupt region storage", () => {
    const backend = storage();
    backend.setDynamicProperty(REGION_KEY, "NOT JSON");
    expect(() => new ProtectionStore(backend)).toThrow();
    expect(backend.getDynamicProperty(REGION_KEY)).toBe("NOT JSON");
  });

  it("fails closed on corrupt placement storage", () => {
    const backend = storage();
    const a = new ProtectionStore(backend);
    backend.setDynamicProperty(sectionAddress(D, pos()).key, "[-1]");
    expect(() => a.isPlaced(D, pos())).toThrow();
    expect(a.faulted).toBe(true);
    expect(shouldAllowMovement(a, pos(), D, { ...pos(), holdUntil: 0 }, 10).allowed).toBe(false);
  });

  it("faults the store on a failed write rather than falsely confirming persistence", () => {
    const backend = storage();
    const a = new ProtectionStore(backend);
    backend.setDynamicProperty = () => {
      throw new Error("disk");
    };
    expect(() => a.setPlaced(D, pos(), true)).toThrow();
    expect(a.faulted).toBe(true);
  });
});

describe("protection command", () => {
  it("runs the four requested actions with per-player selections", () => {
    const a = new ProtectionStore(storage());
    const selections = new Map<string, any>();
    executeProtectionCommand(a, selections, player, "pos1", undefined, at(10, 20));
    executeProtectionCommand(a, selections, player, "pos2", undefined, at(30, 40));
    expect(executeProtectionCommand(a, selections, player, "name", "My House", at())).toMatch(/Saved/);
    expect(executeProtectionCommand(a, selections, player, "list", undefined, at())).toMatch(/My House/);
    expect(selections.size).toBe(0);
  });

  it("does not let one player's selection complete another player's area", () => {
    const a = new ProtectionStore(storage());
    const selections = new Map<string, any>();
    executeProtectionCommand(a, selections, { id: "a" }, "pos1", undefined, at());
    executeProtectionCommand(a, selections, { id: "b" }, "pos2", undefined, at());
    expect(() => executeProtectionCommand(a, selections, { id: "a" }, "name", "House", at())).toThrow(
      /both pos1 and pos2/,
    );
  });

  it("offers remove for correcting areas", () => {
    const a = new ProtectionStore(storage());
    a.saveRegion("House", pos(), pos());
    expect(executeProtectionCommand(a, new Map(), player, "remove", "House", at())).toMatch(/Removed/);
    expect(a.regions.length).toBe(0);
  });

  it("rejects extra arguments to pos1", () => {
    expect(() =>
      executeProtectionCommand(new ProtectionStore(storage()), new Map(), player, "pos1", "oops", at()),
    ).toThrow();
  });

  it("registers elleedog:ender_protect with the action enum, Admin permission and no cheats requirement", () => {
    let definition: any;
    let callback: any;
    let enumName: string | undefined;
    let enumValues: string[] | undefined;
    const queue: Array<() => void> = [];
    const api = {
      system: { run: (fn: () => void) => queue.push(fn) },
      CommandPermissionLevel: { Admin: 2 },
      CustomCommandParamType: { Enum: "Enum", String: "String" },
      CustomCommandStatus: { Success: 0, Failure: 1 },
    };
    const registry = {
      registerEnum: (name: string, values: string[]) => {
        enumName = name;
        enumValues = values;
      },
      registerCommand: (def: any, cb: any) => {
        definition = def;
        callback = cb;
      },
    };
    const a = new ProtectionStore(storage());
    const selections = new Map<string, any>();
    registerProtectionCommands(
      registry,
      api,
      () => a,
      selections,
      () => {},
    );
    expect(definition.name).toBe("elleedog:ender_protect");
    expect(COMMAND_NAME).toBe(definition.name);
    // Bedrock identifiers allow only lowercase letters, digits and underscores on each side of the colon.
    expect(COMMAND_NAME).toMatch(/^[a-z0-9_]+:[a-z0-9_]+$/);
    expect(definition.cheatsRequired).toBe(false);
    expect(definition.permissionLevel).toBe(2);
    expect(definition.mandatoryParameters[0].name).toBe(enumName);
    expect(enumValues).toEqual(ACTIONS);
    const p = {
      id: "alice",
      typeId: "minecraft:player",
      location: { x: 10, y: 65, z: 20 },
      dimension: { id: D },
      sendMessage: () => {},
    };
    expect(callback({ sourceEntity: p }, "pos1").status).toBe(0);
    expect(selections.size).toBe(0);
    p.location.x = 999;
    queue.shift()?.();
    expect(selections.get(p.id).pos1.x).toBe(10);
    expect(callback({ sourceEntity: undefined }, "pos1").status).toBe(1);
  });
});

describe("gate", () => {
  it("denies newly seen or unloaded Endermen until evaluated", () => {
    const a = new ProtectionStore(storage());
    expect(shouldAllowMovement(a, pos(), D, undefined, 1).allowed).toBe(false);
    expect(shouldAllowMovement(undefined, pos(), D, undefined, 1).allowed).toBe(false);
  });

  it("lets evaluated wilderness Endermen take and place natively", () => {
    const a = new ProtectionStore(storage());
    expect(shouldAllowMovement(a, pos(), D, { ...pos(), holdUntil: 0 }, 10).allowed).toBe(true);
  });

  it("denies evaluated Endermen near builds", () => {
    const a = new ProtectionStore(storage());
    a.saveRegion("House", pos(-1, -1), pos(1, 1));
    expect(shouldAllowMovement(a, pos(), D, { ...pos(), holdUntil: 0 }, 10).allowed).toBe(false);
  });

  it("answers an observed large teleport with a cooldown, not invisible block simulation", () => {
    const a = new ProtectionStore(storage());
    const state = shouldAllowMovement(a, pos(30, 30), D, { ...pos(), holdUntil: 0 }, 10);
    expect(state.allowed).toBe(false);
    expect(state.holdUntil).toBe(12);
  });
});
