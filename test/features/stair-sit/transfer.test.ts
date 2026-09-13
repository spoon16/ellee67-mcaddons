import { beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../../../src/features/stair-sit/config.ts";
import {
  clearTransferPath,
  nearbyStair,
  readStair as readStairModule,
  SeatManager,
} from "../../../src/features/stair-sit/seats.ts";
import { engine, reset } from "../../mocks/minecraft-server.ts";
import { FakeDimension, FakePlayer, fixture } from "./fakes.ts";

const readStair = (block: unknown): any => readStairModule(engine(block));

function setup() {
  const f = fixture();
  const m: any = new SeatManager(engine(f.world), engine(f.system));
  const next = f.dimension.stair({ x: 0, y: 64, z: 1 });
  expect(m.sit(f.player, f.stair).ok).toBe(true);
  return { ...f, m, next, carrier: f.player.mount };
}

function remains(f: ReturnType<typeof setup>): void {
  expect(f.player.mount).toBe(f.carrier);
  expect(f.m.get(f.player.id).stair.key).toBe(readStair(f.stair).key);
  expect(f.m.byBlock.size).toBe(1);
  expect(f.m.byPlayer.size).toBe(1);
  expect(f.carrier.riders[0]).toBe(f.player);
}

beforeEach(() => reset());

describe("seated transfer", () => {
  it("seated transfer reuses the carrier without eject, remount, player teleport or spawn", () => {
    const f = setup();
    const { player, m, carrier, next, dimension } = f;
    const original = { ...carrier.location };
    const id = carrier.id;
    expect(m.sit(player, next).transferred).toBe(true);
    expect(player.mount.id).toBe(id);
    expect(dimension.getEntities({ type: CONFIG.entityId }).length).toBe(1);
    expect(carrier.addCount).toBe(1);
    expect(carrier.ejectCount).toBe(0);
    expect(carrier.removeCount).toBe(0);
    expect(player.teleported).toBeUndefined();
    expect(carrier.teleports.length).toBe(1);
    expect(carrier.location).toEqual({ ...original, z: original.z + 1 });
    expect(m.get(player.id).transfers).toBe(1);
    expect(m.onCooldown(player.id)).toBe(false);
    expect(m.byBlock.has(readStair(f.stair).key)).toBe(false);
    expect(m.byBlock.has(readStair(next).key)).toBe(true);
    m.tick();
    expect(m.get(player.id)?.seat).toBe(carrier);
  });

  it("successful transfer preserves height calibration and look pitch, aligns to destination yaw", () => {
    const f = fixture();
    const m: any = new SeatManager(engine(f.world), engine(f.system));
    f.player.setDynamicProperty(CONFIG.heightProperty, 0.125);
    m.sit(f.player, f.stair);
    f.player.setRotation({ x: 27, y: -30 });
    f.player.setDynamicProperty(CONFIG.heightProperty, -0.25); // Takes effect only on a new sitting session.
    const next = f.dimension.stair({ x: 0, y: 64, z: 1 }, 1);
    expect(m.sit(f.player, next).ok).toBe(true);
    expect(f.player.mount.location.y).toBe(64.625);
    expect(f.player.rotation).toEqual({ x: 27, y: -90 });
  });

  for (let direction = 0; direction < 4; direction++) {
    for (const corner of ["none", "inner_left", "inner_right", "outer_left", "outer_right"]) {
      it(`transfer fits destination orientation ${direction}, ${corner}`, () => {
        const f = setup();
        const next = f.dimension.stair(f.next.location, direction, corner);
        expect(f.m.sit(f.player, next).ok).toBe(true);
        const stair = readStair(next);
        expect(f.carrier.location.x).toBe(stair.location.x + stair.local.x);
        expect(f.carrier.location.z).toBe(stair.location.z + stair.local.z);
        expect(f.carrier.rotation.y).toBe(stair.front.yaw);
        expect(f.carrier.ejectCount).toBe(0);
      });
    }
  }

  it("nearby includes diagonal chairs and one-block rises, but not distant/other-dimension chairs", () => {
    const f = setup();
    const from = readStair(f.stair);
    expect(nearbyStair(from, readStair(f.dimension.stair({ x: 1, y: 64, z: 1 })))).toBe(true);
    expect(nearbyStair(from, readStair(f.dimension.stair({ x: 0, y: 65, z: 1 })))).toBe(true);
    expect(nearbyStair(from, readStair(f.dimension.stair({ x: 0, y: 64, z: 3 })))).toBe(true);
    expect(nearbyStair(from, readStair(f.dimension.stair({ x: 1, y: 64, z: 3 })))).toBe(false);
    expect(nearbyStair(from, readStair(f.dimension.stair({ x: 0, y: 66, z: 1 })))).toBe(false);
    expect(nearbyStair(from, readStair(new FakeDimension("minecraft:nether").stair()))).toBe(false);
  });

  it("one block up and down preserve the same rider", () => {
    const f = setup();
    const up = f.dimension.stair({ x: 0, y: 65, z: 1 });
    expect(f.m.sit(f.player, up).ok).toBe(true);
    expect(f.carrier.location.y).toBe(65.5);
    f.system.currentTick += CONFIG.transferCooldownTicks;
    expect(f.m.sit(f.player, f.stair).ok).toBe(true);
    expect(f.carrier.location.y).toBe(64.5);
    expect(f.carrier.ejectCount).toBe(0);
    expect(f.carrier.addCount).toBe(1);
  });

  it("moving to the current stair is an idempotent no-op", () => {
    const f = setup();
    expect(f.m.sit(f.player, f.stair).alreadyThere).toBe(true);
    remains(f);
    expect(f.carrier.teleports.length).toBe(0);
    expect(f.m.get(f.player.id).transfers).toBe(0);
  });

  it("distinct chair selections can commit consecutively in the same tick without waiting", () => {
    const f = setup();
    const third = f.dimension.stair({ x: 0, y: 64, z: 2 });
    const tick = f.system.currentTick;
    expect(CONFIG.transferCooldownTicks).toBe(0);
    expect(f.m.sit(f.player, f.next).ok).toBe(true);
    expect(f.m.sit(f.player, f.next).alreadyThere).toBe(true);
    expect(f.m.sit(f.player, third).ok).toBe(true);
    expect(f.m.sit(f.player, f.stair).ok).toBe(true);
    expect(f.system.currentTick).toBe(tick);
    expect(f.carrier.teleports.length).toBe(3);
    expect(f.m.get(f.player.id).transfers).toBe(3);
    expect(f.carrier.ejectCount).toBe(0);
    expect(f.carrier.addCount).toBe(1);
  });

  it("100 immediate alternating transfers use one carrier and one teleport per change", () => {
    const f = setup();
    const tick = f.system.currentTick;
    for (let i = 0; i < 100; i++) {
      const destination = i % 2 ? f.stair : f.next;
      const previous = f.m.get(f.player.id).stair;
      const result = f.m.sit(f.player, destination);
      expect(result.ok).toBe(true);
      expect(result.vacatedStair.key).toBe(previous.key);
      expect(f.m.byBlock.size).toBe(1);
      expect(f.m.byPlayer.size).toBe(1);
      expect(f.player.mount).toBe(f.carrier);
    }
    expect(f.carrier.teleports.length).toBe(100);
    expect(f.carrier.ejectCount).toBe(0);
    expect(f.carrier.addCount).toBe(1);
    expect(f.carrier.removeCount).toBe(0);
    expect(f.player.teleported).toBeUndefined();
    expect(f.system.currentTick).toBe(tick);
  });

  it("old chair becomes available immediately while destination is reserved", () => {
    const f = setup();
    const other = new FakePlayer(f.dimension);
    expect(f.m.sit(f.player, f.next).ok).toBe(true);
    expect(f.m.sit(other, f.next).ok).toBe(false);
    expect(f.m.sit(other, f.stair).ok).toBe(true);
    expect(f.m.byPlayer.size).toBe(2);
    expect(f.m.byBlock.size).toBe(2);
  });

  it("two seated players cannot simultaneously claim the same third chair", () => {
    const f = setup();
    const other = new FakePlayer(f.dimension);
    other.location.z = 2;
    const third = f.dimension.stair({ x: 0, y: 64, z: 2 });
    f.m.sit(other, third);
    const originalOtherSeat = other.mount;
    expect(f.m.sit(f.player, f.next).ok).toBe(true);
    expect(f.m.sit(other, f.next).ok).toBe(false);
    expect(other.mount).toBe(originalOtherSeat);
    expect(f.m.byBlock.size).toBe(2);
    expect(originalOtherSeat.ejectCount).toBe(0);
  });

  for (const scenario of [
    "waterlogged",
    "upside-down",
    "not-stair",
    "headroom",
    "distant",
    "rise",
    "dimension",
    "held",
    "offhand",
    "sneaking",
    "dead",
    "spectator",
    "source-changed",
  ]) {
    it(`rejected ${scenario} destination/state leaves the current seat intact`, () => {
      const f = setup();
      let target = f.next;
      if (scenario === "waterlogged") target.isWaterlogged = true;
      if (scenario === "upside-down") {
        target = f.dimension.put(target.location, "minecraft:oak_stairs", {
          weirdo_direction: 0,
          upside_down_bit: true,
        });
      }
      if (scenario === "not-stair") target = f.dimension.put(target.location, "minecraft:stone");
      if (scenario === "headroom") f.dimension.put({ x: 0, y: 66, z: 1 }, "minecraft:stone");
      if (scenario === "distant") target = f.dimension.stair({ x: 0, y: 64, z: 4 });
      if (scenario === "rise") target = f.dimension.stair({ x: 0, y: 66, z: 1 });
      if (scenario === "dimension") target = new FakeDimension("minecraft:nether").stair();
      if (scenario === "held") f.player.mainHand = { typeId: "minecraft:stone" };
      if (scenario === "offhand") f.player.offHand = { typeId: "minecraft:shield" };
      if (scenario === "sneaking") f.player.isSneaking = true;
      if (scenario === "dead") f.player.health = 0;
      if (scenario === "spectator") f.player.mode = "Spectator";
      if (scenario === "source-changed") f.dimension.put(f.stair.location, "minecraft:air");
      expect(f.m.sit(f.player, target).ok).toBe(false);
      remains(f);
      expect(f.carrier.teleports.length).toBe(0);
    });
  }

  it("command-style transfer can intentionally keep tools equipped", () => {
    const f = setup();
    f.player.mainHand = { typeId: "minecraft:diamond_pickaxe" };
    expect(f.m.sit(f.player, f.next, false).ok).toBe(true);
    expect(f.player.mainHand.typeId).toBe("minecraft:diamond_pickaxe");
  });

  it("wall in the path blocks movement even when the destination has headroom", () => {
    const f = setup();
    const target = f.dimension.stair({ x: 0, y: 64, z: 2 });
    f.dimension.put({ x: 0, y: 65, z: 1 }, "minecraft:stone");
    expect(clearTransferPath(engine(f.dimension), readStair(f.stair), readStair(target))).toBe(false);
    expect(f.m.sit(f.player, target).ok).toBe(false);
    remains(f);
  });

  it("swept-body test catches a diagonal wall corner rather than squeezing through it", () => {
    const f = setup();
    const target = f.dimension.stair({ x: 1, y: 64, z: 1 });
    f.dimension.put({ x: 1, y: 65, z: 0 }, "minecraft:stone");
    expect(f.m.sit(f.player, target).ok).toBe(false);
    remains(f);
  });

  it("unloaded passage is not treated as air", () => {
    const f = setup();
    const target = f.dimension.stair({ x: 0, y: 64, z: 2 });
    const get = f.dimension.getBlock.bind(f.dimension);
    f.dimension.getBlock = (pos) => {
      if (pos.z === 1 && pos.y === 65) throw new Error("unloaded");
      return get(pos);
    };
    expect(f.m.sit(f.player, target).ok).toBe(false);
    remains(f);
  });

  for (const property of ["throwTeleportOnce", "noopTeleportOnce", "throwAfterMoveOnce", "dropRiderOnce"] as const) {
    it(`failed carrier move ${property} rolls back and frees the destination`, () => {
      const f = setup();
      const anchor = { ...f.carrier.location };
      f.carrier[property] = true;
      expect(f.m.sit(f.player, f.next).ok).toBe(false);
      remains(f);
      expect(f.carrier.location).toEqual(anchor);
      expect(f.m.get(f.player.id).transfers).toBe(0);
      const other = new FakePlayer(f.dimension);
      expect(f.m.sit(other, f.next).ok).toBe(true);
    });
  }

  it("a dismounted or externally moved rider is never grabbed back by transfer", () => {
    const f = setup();
    f.carrier.rideable.ejectRiders();
    expect(f.m.sit(f.player, f.next).ok).toBe(false);
    expect(f.player.mount).toBeUndefined();
    expect(f.carrier.teleports.length).toBe(0);
  });

  it("transfer does not interfere with a boat, external teleport, or changed dimension", () => {
    for (const kind of ["boat", "teleport", "dimension"]) {
      const f = setup();
      if (kind === "boat") f.player.mount = { id: "boat", typeId: "minecraft:boat" };
      if (kind === "teleport") f.player.location.x = 100;
      if (kind === "dimension") f.player.dimension = new FakeDimension("minecraft:nether");
      expect(f.m.sit(f.player, f.next).ok).toBe(false);
      expect(f.carrier.teleports.length).toBe(0);
    }
  });

  it("breaking the new stair after transfer triggers normal cleanup, not the old stair", () => {
    const f = setup();
    f.m.sit(f.player, f.next);
    f.dimension.put(f.stair.location, "minecraft:air");
    f.m.tick();
    expect(f.m.get(f.player.id)).toBeTruthy();
    f.dimension.put(f.next.location, "minecraft:air");
    f.m.tick();
    expect(f.m.get(f.player.id)).toBeUndefined();
    expect(f.player.mount).toBeUndefined();
  });

  it("standing after transfers cleans the final occupancy and applies the original remount cooldown", () => {
    const f = setup();
    f.m.sit(f.player, f.next);
    f.m.release(f.player.id, true);
    expect(f.m.byBlock.size).toBe(0);
    expect(f.m.byPlayer.size).toBe(0);
    expect(f.player.mount).toBeUndefined();
    expect(f.m.onCooldown(f.player.id)).toBe(true);
    expect(f.carrier.isValid).toBe(false);
  });
});
