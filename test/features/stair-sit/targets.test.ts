import { beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../../../src/features/stair-sit/config.ts";
import { readStair as readStairModule, SeatManager } from "../../../src/features/stair-sit/seats.ts";
import { InteractionTargets } from "../../../src/features/stair-sit/targets.ts";
import { engine, reset } from "../../mocks/minecraft-server.ts";
import { FakeDimension, FakePlayer, fixture } from "./fakes.ts";

const readStair = (block: unknown): any => readStairModule(engine(block));

function setup() {
  const f = fixture();
  const players = [f.player];
  f.world.getAllPlayers = () => players;
  const m: any = new SeatManager(engine(f.world), engine(f.system));
  const targets: any = new InteractionTargets(engine(f.world), engine(f.system), m);
  return { ...f, players, m, targets };
}

beforeEach(() => reset());

describe("interaction targets", () => {
  it("native interaction target exists before sitting, without creating a rideable carrier", () => {
    const f = setup();
    f.targets.refresh();
    expect(f.targets.byBlock.size).toBe(1);
    expect(f.targets.byEntity.size).toBe(1);
    const target = f.dimension.getEntities({ type: CONFIG.targetEntityId })[0];
    expect(target).toBeTruthy();
    expect(target?.getComponent("minecraft:rideable")).toBeUndefined();
    expect(f.dimension.getEntities({ type: CONFIG.entityId }).length).toBe(0);
    expect(f.player.mount).toBeUndefined();
    expect(target?.location).toEqual({ x: 0.5, y: 64.5, z: 0.5 });
  });

  it("nearby discovery supports tapping a stair off-center instead of only current aim", () => {
    const f = setup();
    const other = f.dimension.stair({ x: 0, y: 64, z: 1 });
    f.targets.refresh();
    expect(f.player.target).toBe(f.stair);
    expect(f.targets.byBlock.has(readStair(other).key)).toBe(true);
    expect(f.targets.byBlock.size).toBe(2);
  });

  it("multiple players share one target per stair and refreshes reuse the same IDs", () => {
    const f = setup();
    f.players.push(new FakePlayer(f.dimension));
    f.targets.refresh();
    const original = [...f.targets.byEntity.keys()];
    f.targets.refresh();
    expect([...f.targets.byEntity.keys()]).toEqual(original);
    expect(f.targets.byBlock.size).toBe(1);
  });

  for (const state of [
    "held",
    "offhand",
    "sneaking",
    "flying",
    "gliding",
    "swimming",
    "sleeping",
    "spectator",
    "dead",
    "disabled",
    "disabled-tag",
    "boat",
    "cooldown",
  ]) {
    it(`target discovery does not engage for ${state}`, () => {
      const f = setup();
      if (state === "held") f.player.mainHand = { typeId: "minecraft:stone" };
      if (state === "offhand") f.player.offHand = { typeId: "minecraft:shield" };
      if (state === "sneaking") f.player.isSneaking = true;
      if (state === "flying") f.player.isFlying = true;
      if (state === "gliding") f.player.isGliding = true;
      if (state === "swimming") f.player.isSwimming = true;
      if (state === "sleeping") f.player.isSleeping = true;
      if (state === "spectator") f.player.mode = "Spectator";
      if (state === "dead") f.player.health = 0;
      if (state === "disabled") f.player.setDynamicProperty(CONFIG.buttonProperty, false);
      if (state === "disabled-tag") f.player.addTag(CONFIG.buttonDisabledTag);
      if (state === "boat") f.player.mount = { id: "boat", typeId: "minecraft:boat" };
      if (state === "cooldown") f.m.cooldowns.set(f.player.id, f.system.currentTick + 30);
      f.targets.refresh();
      expect(f.targets.byBlock.size).toBe(0);
    });
  }

  it("seated players get neighboring targets, not their own occupied chair or a distant chair", () => {
    const f = setup();
    const next = f.dimension.stair({ x: 0, y: 64, z: 1 });
    const distant = f.dimension.stair({ x: 0, y: 64, z: 4 });
    f.m.sit(f.player, f.stair);
    f.targets.refresh();
    expect(f.targets.byBlock.has(readStair(next).key)).toBe(true);
    expect(f.targets.byBlock.has(readStair(f.stair).key)).toBe(false);
    expect(f.targets.byBlock.has(readStair(distant).key)).toBe(false);
  });

  it("occupied target retires immediately, and the source becomes targetable after a move", () => {
    const f = setup();
    const next = f.dimension.stair({ x: 0, y: 64, z: 1 });
    f.targets.refresh();
    const oldTarget = f.targets.byBlock.get(readStair(f.stair).key).entity;
    f.m.sit(f.player, f.stair);
    f.targets.pruneOccupied();
    expect(oldTarget.isValid).toBe(false);
    f.m.sit(f.player, next);
    f.targets.pruneOccupied();
    f.targets.refresh();
    expect(f.targets.byBlock.has(readStair(f.stair).key)).toBe(true);
    expect(f.targets.byBlock.has(readStair(next).key)).toBe(false);
  });

  for (const change of ["broken", "waterlogged", "blocked", "walk-away", "leave", "equip", "crouch"]) {
    it(`targets are cleaned up after ${change}`, () => {
      const f = setup();
      f.targets.refresh();
      const entity = [...f.targets.byEntity.values()][0].entity;
      if (change === "broken") f.dimension.put(f.stair.location, "minecraft:air");
      if (change === "waterlogged") f.stair.isWaterlogged = true;
      if (change === "blocked") f.dimension.put({ x: 0, y: 65, z: 0 }, "minecraft:stone");
      if (change === "walk-away") f.player.location.x = 100;
      if (change === "leave") f.players.length = 0;
      if (change === "equip") f.player.mainHand = { typeId: "minecraft:diamond_pickaxe" };
      if (change === "crouch") f.player.isSneaking = true;
      f.targets.refresh();
      expect(f.targets.byBlock.size).toBe(0);
      expect(f.targets.byEntity.size).toBe(0);
      expect(entity.isValid).toBe(false);
    });
  }

  it("one requester leaving does not remove another player's target", () => {
    const f = setup();
    f.players.push(new FakePlayer(f.dimension));
    f.targets.refresh();
    const id = [...f.targets.byEntity.keys()][0];
    f.players.shift();
    f.targets.refresh();
    expect(f.targets.byEntity.has(id)).toBe(true);
  });

  it("rotation changes and externally displaced helpers are replaced", () => {
    const f = setup();
    f.targets.refresh();
    const original = [...f.targets.byEntity.values()][0].entity;
    f.dimension.stair(f.stair.location, 1);
    f.targets.refresh();
    expect(original.isValid).toBe(false);
    const second = [...f.targets.byEntity.values()][0].entity;
    second.location.x += 1;
    f.targets.refresh();
    expect(second.isValid).toBe(false);
    expect(f.targets.byBlock.size).toBe(1);
  });

  it("target leases are renewed without respawning", () => {
    const f = setup();
    f.targets.refresh();
    const target = [...f.targets.byEntity.values()][0].entity;
    expect(target.events.filter((e: string) => e === "sit:heartbeat").length).toBe(1);
    f.system.currentTick += CONFIG.heartbeatInterval;
    f.targets.refresh();
    expect(target.events.filter((e: string) => e === "sit:heartbeat").length).toBe(2);
    expect(f.targets.byBlock.size).toBe(1);
  });

  it("build/attack suppression removes targets temporarily, then allows rediscovery", () => {
    const f = setup();
    f.targets.refresh();
    const key = readStair(f.stair).key;
    f.targets.suppress(key);
    f.targets.refresh();
    expect(f.targets.byBlock.size).toBe(0);
    f.system.currentTick += CONFIG.targetSuppressTicks;
    f.targets.refresh();
    expect(f.targets.byBlock.size).toBe(1);
    expect(f.targets.suppressed.size).toBe(0);
  });

  it("clear only removes our target entities and pauses rediscovery", () => {
    const f = setup();
    f.targets.refresh();
    const target = [...f.targets.byEntity.values()][0].entity;
    const cow = f.dimension.spawnEntity("minecraft:cow", { x: 0, y: 64, z: 0 });
    f.dimension.spawnEntity(CONFIG.targetEntityId, { x: 100, y: 64, z: 0 }); // orphan
    expect(f.targets.sweep(true)).toBe(2);
    expect(target.isValid).toBe(false);
    expect(cow.isValid).toBe(true);
    f.targets.refresh();
    expect(f.targets.byBlock.size).toBe(0);
    f.system.currentTick += CONFIG.targetSuppressTicks;
    f.targets.refresh();
    expect(f.targets.byBlock.size).toBe(1);
  });

  it("orphan sweep preserves live targets and removes unknown target entities", () => {
    const f = setup();
    f.targets.refresh();
    const id = [...f.targets.byEntity.keys()][0];
    f.dimension.spawnEntity(CONFIG.targetEntityId, { x: 100, y: 64, z: 0 });
    expect(f.targets.sweep()).toBe(1);
    expect(f.targets.byEntity.has(id)).toBe(true);
  });

  it("helper spawn failure leaves no stale reservations", () => {
    const f = setup();
    f.dimension.failSpawn = true;
    f.targets.refresh();
    expect(f.targets.byBlock.size).toBe(0);
    expect(f.targets.byEntity.size).toBe(0);
    f.dimension.failSpawn = false;
    f.targets.refresh();
    expect(f.targets.byBlock.size).toBe(1);
  });

  it("missing or unloaded blocks never become Sit targets", () => {
    const f = setup();
    f.dimension.getBlock = () => {
      throw new Error("unloaded");
    };
    f.targets.refresh();
    expect(f.targets.byBlock.size).toBe(0);
  });

  it("target identities are isolated by dimension", () => {
    const f = setup();
    const nether = new FakeDimension("minecraft:nether");
    nether.stair();
    const other = new FakePlayer(nether);
    f.players.push(other);
    f.targets.refresh();
    expect(f.targets.byBlock.size).toBe(2);
    expect(new Set([...f.targets.byBlock.values()].map((t: any) => t.dimension.id)).size).toBe(2);
  });

  it("discovery respects per-player and global target caps in a dense stair field", () => {
    const f = setup();
    f.players.length = 0;
    for (let i = 0; i < 8; i++) {
      const player = new FakePlayer(f.dimension);
      player.location = { x: i * 20 + 0.5, y: 64, z: 0.5 };
      f.players.push(player);
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) f.dimension.stair({ x: i * 20 + x, y: 64, z });
      expect(f.targets.candidates(player).length).toBe(CONFIG.maxTargetsPerPlayer);
    }
    f.targets.refresh();
    expect(f.targets.byBlock.size).toBe(CONFIG.maxTargetsTotal);
    expect(f.dimension.getEntities({ type: CONFIG.targetEntityId }).length).toBe(CONFIG.maxTargetsTotal);
  });

  it("immediate refresh restores the vacated chair without a global scan or tick advance", () => {
    const f = setup();
    const next = f.dimension.stair({ x: 0, y: 64, z: 1 });
    f.targets.refresh();
    f.m.sit(f.player, f.stair);
    f.targets.refreshForPlayer(f.player);
    const oldDestinationTarget = f.targets.byBlock.get(readStair(next).key).entity;
    const result = f.m.sit(f.player, next);
    const tick = f.system.currentTick;
    let globalScans = 0;
    f.world.getAllPlayers = () => {
      globalScans++;
      return f.players;
    };
    f.targets.refreshForPlayer(f.player, result.vacatedStair);
    expect(globalScans).toBe(0);
    expect(f.system.currentTick).toBe(tick);
    expect(f.targets.byBlock.has(readStair(f.stair).key)).toBe(true);
    expect(oldDestinationTarget.isValid).toBe(false);
    expect(f.targets.byBlock.size).toBe(1);
    expect(f.targets.byEntity.size).toBe(1);
  });

  it("immediate local discovery preserves the IDs of still-available targets", () => {
    const f = setup();
    f.dimension.stair({ x: 0, y: 64, z: 1 });
    f.targets.refreshForPlayer(f.player);
    const ids = [...f.targets.byEntity.keys()];
    for (let i = 0; i < 10; i++) f.targets.refreshForPlayer(f.player);
    expect([...f.targets.byEntity.keys()]).toEqual(ids);
  });

  for (const reason of ["paused", "suppressed", "disabled", "held", "sneaking", "blocked", "broken", "occupied"]) {
    it(`immediate refresh cannot bypass ${reason} rules`, () => {
      const f = setup();
      const next = f.dimension.stair({ x: 0, y: 64, z: 1 });
      f.m.sit(f.player, f.stair);
      const result = f.m.sit(f.player, next);
      const oldKey = readStair(f.stair).key;
      if (reason === "paused") f.targets.sweep(true);
      if (reason === "suppressed") f.targets.suppress(oldKey);
      if (reason === "disabled") f.player.setDynamicProperty(CONFIG.buttonProperty, false);
      if (reason === "held") f.player.mainHand = { typeId: "minecraft:stone" };
      if (reason === "sneaking") f.player.isSneaking = true;
      if (reason === "blocked") f.dimension.put({ x: 0, y: 65, z: 0 }, "minecraft:stone");
      if (reason === "broken") f.dimension.put(f.stair.location, "minecraft:air");
      if (reason === "occupied") expect(f.m.sit(new FakePlayer(f.dimension), f.stair).ok).toBe(true);
      f.targets.refreshForPlayer(f.player, result.vacatedStair);
      expect(f.targets.byBlock.has(oldKey)).toBe(false);
    });
  }

  it("immediate helper spawn failure does not undo the already completed carrier move", () => {
    const f = setup();
    const next = f.dimension.stair({ x: 0, y: 64, z: 1 });
    f.m.sit(f.player, f.stair);
    const carrier = f.player.mount;
    const result = f.m.sit(f.player, next);
    expect(result.ok).toBe(true);
    f.dimension.failSpawn = true;
    f.targets.refreshForPlayer(f.player, result.vacatedStair);
    expect(f.player.mount).toBe(carrier);
    expect(carrier.ejectCount).toBe(0);
    expect(f.m.get(f.player.id).stair.key).toBe(readStair(next).key);
    expect(f.targets.byBlock.size).toBe(0);
    expect(f.targets.byEntity.size).toBe(0);
  });

  it("immediate local discovery retains the global cap and prioritizes the vacated chair", () => {
    const f = setup();
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) f.dimension.stair({ x, y: 64, z });
    f.m.sit(f.player, f.stair);
    const next = f.dimension.getBlock({ x: 0, y: 64, z: 1 });
    // Fill the other target slots with helpers requested in remote neighborhoods.
    for (let i = 0; i < CONFIG.maxTargetsTotal - 1; i++) {
      const block = f.dimension.stair({ x: 100 + i, y: 64, z: 0 });
      f.targets.ensureTarget({ stair: readStair(block), dimension: f.dimension });
    }
    f.targets.ensureTarget({ stair: readStair(next), dimension: f.dimension });
    expect(f.targets.byBlock.size).toBe(CONFIG.maxTargetsTotal);
    const result = f.m.sit(f.player, next);
    f.targets.refreshForPlayer(f.player, result.vacatedStair);
    expect(f.targets.byBlock.size).toBe(CONFIG.maxTargetsTotal);
    expect(f.targets.byEntity.size).toBe(CONFIG.maxTargetsTotal);
    expect(f.targets.byBlock.has(readStair(f.stair).key)).toBe(true);
    expect(f.targets.byBlock.has(readStair(next).key)).toBe(false);
  });

  it("a preferred chair from a different dimension is not used for local discovery", () => {
    const f = setup();
    const other = new FakeDimension("minecraft:nether").stair({ x: 2, y: 64, z: 0 });
    const candidates = f.targets.candidates(f.player, readStair(other));
    expect(candidates.every((c: any) => c.stair.dimensionId === f.dimension.id)).toBe(true);
    expect(candidates.length).toBe(1);
  });
});
