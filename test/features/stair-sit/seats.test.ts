import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyHands,
  hasHeadroom,
  readStair as readStairModule,
  SeatManager,
  safeExit,
} from "../../../src/features/stair-sit/seats.ts";
import { engine, reset } from "../../mocks/minecraft-server.ts";
import { FakeDimension, FakePlayer, fixture } from "./fakes.ts";

const readStair = (block: unknown): any => readStairModule(engine(block));

function setup() {
  const f = fixture();
  const m: any = new SeatManager(engine(f.world), engine(f.system));
  return { ...f, m };
}

beforeEach(() => reset());

describe("seat manager", () => {
  it("mounts one player, aligns yaw and removes helper on stand", () => {
    const { m, player, stair, dimension } = setup();
    expect(m.sit(player, stair).ok).toBe(true);
    expect(m.byPlayer.size).toBe(1);
    expect(m.byBlock.size).toBe(1);
    expect(player.rotation.y).toBe(90);
    expect(m.release(player.id, true)).toBe(true);
    expect(m.byPlayer.size).toBe(0);
    expect(m.byBlock.size).toBe(0);
    expect(dimension.getEntities({ type: "sit:seat" }).length).toBe(0);
    expect(player.mount).toBeUndefined();
  });

  it("one seat per stair, including simultaneous requests", () => {
    const { m, player, stair, dimension } = setup();
    const other = new FakePlayer(dimension);
    expect(m.sit(player, stair).ok).toBe(true);
    expect(m.sit(other, stair).error).toMatch(/already sitting/);
    expect(dimension.getEntities({ type: "sit:seat" }).length).toBe(1);
  });

  it("multiple players can sit on different stairs", () => {
    const { m, player, stair, dimension } = setup();
    const other = new FakePlayer(dimension);
    const second = dimension.stair({ x: 0, y: 64, z: 2 });
    other.location.z = 2.5;
    expect(m.sit(player, stair).ok).toBe(true);
    expect(m.sit(other, second).ok).toBe(true);
    expect(m.byPlayer.size).toBe(2);
  });

  it("holding an item does not hijack block placement; commands can intentionally sit", () => {
    const { m, player, stair } = setup();
    player.mainHand = { typeId: "minecraft:stone" };
    expect(emptyHands(engine(player))).toBe(false);
    expect(m.sit(player, stair).ok).toBe(false);
    expect(m.sit(player, stair, false).ok).toBe(true);
  });

  it("offhand equipment also prevents automatic sitting", () => {
    const { m, player, stair } = setup();
    player.offHand = { typeId: "minecraft:shield" };
    expect(m.sit(player, stair).ok).toBe(false);
  });

  for (const state of ["isSneaking", "isFlying", "isGliding", "isSwimming", "isSleeping"] as const) {
    it(`reject player state ${state}`, () => {
      const { m, player, stair } = setup();
      player[state] = true;
      expect(m.sit(player, stair).ok).toBe(false);
    });
  }

  it("reject spectator, dead player, occupied mount and distant player", () => {
    const { m, player, stair } = setup();
    player.mode = "Spectator";
    expect(m.sit(player, stair).ok).toBe(false);
    player.mode = "Survival";
    player.health = 0;
    expect(m.sit(player, stair).ok).toBe(false);
    player.health = 20;
    player.mount = { id: "boat" };
    expect(m.sit(player, stair).ok).toBe(false);
    player.mount = undefined;
    player.location.x = 100;
    expect(m.sit(player, stair).ok).toBe(false);
  });

  it("waterlogged stair is rejected without modifying water state", () => {
    const { m, player, stair } = setup();
    stair.isWaterlogged = true;
    expect(readStair(stair)).toBeUndefined();
    expect(m.sit(player, stair).ok).toBe(false);
    expect(stair.isWaterlogged).toBe(true);
  });

  it("blocked headroom rejects a chair and never changes the obstructing block", () => {
    const { m, player, stair, dimension } = setup();
    dimension.put({ x: 0, y: 65, z: 0 }, "minecraft:stone");
    expect(hasHeadroom(engine(dimension), readStair(stair))).toBe(false);
    expect(m.sit(player, stair).ok).toBe(false);
    expect(dimension.getBlock({ x: 0, y: 65, z: 0 }).typeId).toBe("minecraft:stone");
  });

  it("support removal ejects rider and deletes occupancy", () => {
    const { m, player, stair, dimension } = setup();
    m.sit(player, stair);
    dimension.put(stair.location, "minecraft:air");
    m.tick();
    expect(m.get(player.id)).toBeUndefined();
    expect(player.mount).toBeUndefined();
  });

  it("stair rotation or corner change ejects rider", () => {
    const { m, player, stair, dimension } = setup();
    m.sit(player, stair);
    dimension.stair(stair.location, 1, "inner_left");
    m.tick();
    expect(m.byPlayer.size).toBe(0);
  });

  it("new head obstruction releases the seat", () => {
    const { m, player, stair, dimension } = setup();
    m.sit(player, stair);
    dimension.put({ x: 0, y: 65, z: 0 }, "minecraft:stone");
    m.tick();
    expect(m.byPlayer.size).toBe(0);
  });

  it("native dismount cleans helper without teleporting the player", () => {
    const { m, player, stair, system } = setup();
    m.sit(player, stair);
    player.mount.rideable.ejectRiders();
    m.tick();
    expect(m.byPlayer.size).toBe(0);
    expect(player.teleported).toBeUndefined();
    expect(m.sit(player, stair).ok).toBe(false);
    system.currentTick += 31;
    expect(m.sit(player, stair).ok).toBe(true);
  });

  it("dimension change never pulls a player back", () => {
    const { m, player, stair } = setup();
    m.sit(player, stair);
    player.dimension = new FakeDimension("minecraft:nether");
    m.tick();
    expect(m.byPlayer.size).toBe(0);
    expect(player.dimension.id).toBe("minecraft:nether");
    expect(player.teleported).toBeUndefined();
  });

  it("teleporting far away releases seat without position rollback", () => {
    const { m, player, stair } = setup();
    m.sit(player, stair);
    player.location = { x: 100, y: 70, z: 100 };
    m.tick();
    expect(m.byPlayer.size).toBe(0);
    expect(player.location.x).toBe(100);
    expect(player.teleported).toBeUndefined();
  });

  it("disconnect clears maps and cooldown", () => {
    const { m, player, stair } = setup();
    m.sit(player, stair);
    player.isValid = false;
    m.forget(player.id);
    expect(m.byPlayer.size).toBe(0);
    expect(m.byBlock.size).toBe(0);
    expect(m.cooldowns.size).toBe(0);
  });

  it("helper moved by external script releases the chair", () => {
    const { m, player, stair } = setup();
    m.sit(player, stair);
    player.mount.location.x += 2;
    m.tick();
    expect(m.byPlayer.size).toBe(0);
  });

  it("orphan sweep removes only sit:seat, never other entities or occupied helpers", () => {
    const { m, player, stair, dimension } = setup();
    m.sit(player, stair);
    const orphan = dimension.spawnEntity("sit:seat", { x: 4, y: 64, z: 4 });
    const other = dimension.spawnEntity("minecraft:armor_stand", { x: 5, y: 64, z: 5 });
    expect(m.sweep()).toBe(1);
    expect(orphan.isValid).toBe(false);
    expect(other.isValid).toBe(true);
    expect(m.byPlayer.size).toBe(1);
    expect(m.sweep(true)).toBe(1);
    expect(m.byPlayer.size).toBe(0);
    expect(other.isValid).toBe(true);
  });

  it("failed spawn or refused rider leaves no helper or reservation", () => {
    const { m, player, stair, dimension } = setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      dimension.failSpawn = true;
      expect(m.sit(player, stair).ok).toBe(false);
      dimension.failSpawn = false;
      dimension.rejectMount = true;
      expect(m.sit(player, stair).ok).toBe(false);
      expect(m.byPlayer.size).toBe(0);
      expect(m.byBlock.size).toBe(0);
      expect(dimension.getEntities({ type: "sit:seat" }).length).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

  it("height adjustment is bounded and applied only to anchor", () => {
    const { m, player, stair } = setup();
    player.props.set("sit:height", 0.125);
    expect(m.sit(player, stair).ok).toBe(true);
    expect(m.get(player.id).anchor.y).toBe(64.625);
    expect(stair.typeId).toBe("minecraft:oak_stairs");
    player.props.set("sit:height", Number.POSITIVE_INFINITY);
    expect(m.height(player)).toBe(0);
    player.props.set("sit:height", 999);
    expect(m.height(player)).toBe(0.5);
  });

  it("active lease watchdog is renewed at heartbeat interval", () => {
    const { m, player, stair, system } = setup();
    m.sit(player, stair);
    const seat = player.mount;
    system.currentTick = 120;
    m.tick();
    expect(seat.events.filter((e: string) => e === "sit:heartbeat").length).toBe(2);
  });

  it("safe exit avoids hazard, blocked body space and missing support", () => {
    const { dimension, stair } = setup();
    const desc = readStair(stair);
    expect(safeExit(engine(dimension), desc)).toBeTruthy();
    dimension.put(stair.location, "minecraft:magma");
    expect(safeExit(engine(dimension), desc)).toBeUndefined();
    dimension.put(stair.location, "minecraft:stone");
    dimension.put({ x: 0, y: 65, z: 0 }, "minecraft:stone");
    expect(safeExit(engine(dimension), desc)).toBeUndefined();
    dimension.put(stair.location, "minecraft:air");
    expect(safeExit(engine(dimension), desc)).toBeUndefined();
  });
});
