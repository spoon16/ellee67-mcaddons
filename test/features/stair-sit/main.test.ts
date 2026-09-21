// Ports the upstream entry-point tests. Upstream rewrote main.js's imports to point at its own runtime double;
// here the feature runs through `runFeature` against the shared engine mock, so the same events, commands and
// deferred callbacks go through the engine's command registry and the mock scheduler.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runFeature } from "../../../src/core/feature.ts";
import { stairSit } from "../../../src/features/stair-sit/index.ts";
import {
  type Block,
  CommandPermissionLevel,
  CustomCommandStatus,
  flushCurrentTick,
  loadWorld,
  requestedDelays,
  reset,
  startup,
  step,
  system,
  world,
} from "../../mocks/minecraft-server.ts";
import type { FakePlayer, FakeSeat } from "./fakes.ts";
import { boot, installDimension, runtime, shutdown, sitCommand, sitCommands } from "./harness.ts";

function nativeTargetAt(stair: Block): FakeSeat | undefined {
  return runtime.dimension
    .getEntities({ type: "sit:target" })
    .find(
      (e) =>
        e.location.x === stair.location.x + 0.5 &&
        e.location.y === stair.location.y + 0.5 &&
        e.location.z === stair.location.z + 0.5,
    );
}

function interactTarget(player: FakePlayer, target: FakeSeat | undefined, extra: Record<string, unknown> = {}) {
  const event = { player, target, cancel: false, itemStack: undefined, ...extra };
  world.beforeEvents.playerInteractWithEntity.emit(event);
  return event;
}

function interactBlock(player: FakePlayer, block: Block) {
  const event = { player, block, isFirstEvent: true, cancel: false };
  world.beforeEvents.playerInteractWithBlock.emit(event);
  return event;
}

function mountNow(player: FakePlayer): void {
  sitCommand("sit:down").callback({ sourceEntity: player });
  flushCurrentTick();
  expect(player.mount?.typeId).toBe("sit:seat");
}

beforeEach(() => reset());
afterEach(() => shutdown());

describe("stair-sit entry point", () => {
  beforeEach(() => boot());

  it("entrypoint registers eight commands, personal commands need no cheats", () => {
    const commands = sitCommands();
    expect(commands.length).toBe(8);
    // Short names become engine aliases shared with vanilla and every other pack; `help` and `clear` once clashed.
    expect(commands.map(({ definition }) => definition.name).sort()).toEqual([
      "sit:button",
      "sit:controls",
      "sit:down",
      "sit:gesture",
      "sit:height",
      "sit:stand",
      "sit:status",
      "sit:sweep",
    ]);
    for (const { definition } of commands) expect(definition.cheatsRequired).toBe(false);
    expect(sitCommand("sit:sweep").definition.permissionLevel).toBe(CommandPermissionLevel.Admin);
    expect(sitCommand("sit:down").definition.permissionLevel).toBe(CommandPermissionLevel.Any);
  });

  it("block interaction schedules mutation and deduplicates held use events", () => {
    const p = runtime.makePlayer();
    const event = { player: p, block: p.target, isFirstEvent: true, itemStack: undefined, cancel: false };
    world.beforeEvents.playerInteractWithBlock.emit(event);
    expect(event.cancel).toBe(true);
    expect(p.mount).toBeUndefined();
    world.beforeEvents.playerInteractWithBlock.emit({ ...event, cancel: false });
    step();
    expect(p.mount?.typeId).toBe("sit:seat");
    expect(runtime.dimension.getEntities({ type: "sit:seat" }).length).toBe(1);
  });

  it("before event leaves held items and other canceled interactions alone", () => {
    const p = runtime.makePlayer();
    const event = {
      player: p,
      block: p.target,
      isFirstEvent: true,
      itemStack: { typeId: "minecraft:stone" },
      cancel: false,
    };
    world.beforeEvents.playerInteractWithBlock.emit(event);
    expect(event.cancel).toBe(false);
    world.beforeEvents.playerInteractWithBlock.emit({ ...event, itemStack: undefined, cancel: true });
    step();
    expect(p.mount).toBeUndefined();
  });

  it("touch crouch-release mounts once, dismount crouch does not immediately remount", () => {
    const p = runtime.makePlayer();
    step();
    p.isSneaking = true;
    step(3);
    p.isSneaking = false;
    step();
    expect(p.mount?.typeId).toBe("sit:seat");
    p.mount.rideable.ejectRiders();
    p.isSneaking = true;
    step(3);
    p.isSneaking = false;
    step();
    expect(p.mount).toBeUndefined();
  });

  for (const scenario of ["disabled", "held", "changed"]) {
    it(`gesture cancelled by ${scenario}: setting, held equipment or different aim`, () => {
      const p = runtime.makePlayer();
      step();
      if (scenario === "disabled") p.setDynamicProperty("sit:gesture", false);
      if (scenario === "held") p.mainHand = { typeId: "minecraft:stone" };
      p.isSneaking = true;
      step(3);
      if (scenario === "changed") p.target = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
      p.isSneaking = false;
      step();
      expect(p.mount).toBeUndefined();
    });
  }

  it("crouching on another mount never arms the gesture", () => {
    const p = runtime.makePlayer();
    step();
    p.mount = { id: "boat", typeId: "minecraft:boat" };
    p.isSneaking = true;
    step(3);
    p.mount = undefined;
    p.isSneaking = false;
    step();
    expect(p.mount).toBeUndefined();
  });

  it("command works with tools and stand command defers its mutations", () => {
    const p = runtime.makePlayer();
    p.mainHand = { typeId: "minecraft:diamond_pickaxe" };
    sitCommand("sit:down").callback({ sourceEntity: p });
    expect(p.mount).toBeUndefined();
    step();
    expect(p.mount?.typeId).toBe("sit:seat");
    sitCommand("sit:stand").callback({ sourceEntity: p });
    expect(p.mount).toBeTruthy();
    step();
    expect(p.mount).toBeUndefined();
  });

  for (const event of ["entityHurt", "entityDie", "playerLeave"] as const) {
    it(`${event} cleans active helper entities`, () => {
      const p = runtime.makePlayer();
      sitCommand("sit:down").callback({ sourceEntity: p });
      step();
      expect(p.mount).toBeTruthy();
      world.afterEvents[event].emit({ hurtEntity: p, damage: 1, deadEntity: p, playerId: p.id });
      expect(runtime.dimension.getEntities({ type: "sit:seat" }).length).toBe(0);
    });
  }

  it("non-player command origins are rejected and diagnostics are available", () => {
    const c = sitCommand("sit:down");
    expect(c.callback({}).status).toBe(CustomCommandStatus.Failure);
    const p = runtime.makePlayer();
    sitCommand("sit:status").callback({ sourceEntity: p });
    step();
    expect(p.chat.some((m) => m.includes("Version 0.2.1"))).toBe(true);
  });

  it("native Sit target click defers mounting and repeated events mount only once", () => {
    const p = runtime.makePlayer();
    step(5);
    const target = nativeTargetAt(p.target);
    expect(target).toBeTruthy();
    expect(interactTarget(p, target).cancel).toBe(true);
    expect(p.mount).toBeUndefined();
    interactTarget(p, target);
    step();
    expect(p.mount?.typeId).toBe("sit:seat");
    expect(p.mount.addCount).toBe(1);
    expect(target?.isValid).toBe(false);
  });

  it("native Sit moves to the actually tapped neighboring target, not the center-view block", () => {
    const p = runtime.makePlayer();
    const old = p.target;
    const neighbor = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    sitCommand("sit:down").callback({ sourceEntity: p });
    step(5);
    const seat = p.mount;
    const target = nativeTargetAt(neighbor);
    expect(target).toBeTruthy();
    expect(p.target).toBe(old);
    interactTarget(p, target);
    step();
    expect(p.mount).toBe(seat);
    expect(seat.location.z).toBe(1.5);
    expect(seat.addCount).toBe(1);
    expect(seat.ejectCount).toBe(0);
  });

  it("direct block interaction also transfers an existing seated player", () => {
    const p = runtime.makePlayer();
    sitCommand("sit:down").callback({ sourceEntity: p });
    step();
    const seat = p.mount;
    const next = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    world.beforeEvents.playerInteractWithBlock.emit({ player: p, block: next, isFirstEvent: true, cancel: false });
    expect(seat.location.z).toBe(0.5);
    step();
    expect(p.mount).toBe(seat);
    expect(seat.location.z).toBe(1.5);
  });

  it("/sit:down while already seated transfers, including with tools equipped", () => {
    const p = runtime.makePlayer();
    sitCommand("sit:down").callback({ sourceEntity: p });
    step();
    const seat = p.mount;
    p.target = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    p.mainHand = { typeId: "minecraft:diamond_pickaxe" };
    sitCommand("sit:down").callback({ sourceEntity: p });
    step();
    expect(p.mount).toBe(seat);
    expect(seat.location.z).toBe(1.5);
    expect(seat.ejectCount).toBe(0);
  });

  it("non-target entities and already-canceled interactions are not hijacked", () => {
    const p = runtime.makePlayer();
    step(5);
    const cow = runtime.dimension.spawnEntity("minecraft:cow", p.location);
    expect(interactTarget(p, cow).cancel).toBe(false);
    interactTarget(p, nativeTargetAt(p.target), { cancel: true });
    step();
    expect(p.mount).toBeUndefined();
  });

  it("stale native targets clicked with a block are retired without mounting or consuming items", () => {
    const p = runtime.makePlayer();
    step(5);
    const target = nativeTargetAt(p.target);
    p.mainHand = { typeId: "minecraft:stone" };
    expect(interactTarget(p, target, { itemStack: p.mainHand }).cancel).toBe(false);
    step();
    expect(target?.isValid).toBe(false);
    expect(p.mount).toBeUndefined();
    expect(p.mainHand?.typeId).toBe("minecraft:stone");
  });

  it("attack/mining input on a helper suppresses it instead of sitting", () => {
    const p = runtime.makePlayer();
    step(45);
    const target = nativeTargetAt(p.target);
    expect(target).toBeTruthy();
    world.afterEvents.entityHitEntity.emit({ damagingEntity: p, hitEntity: target });
    expect(target?.isValid).toBe(false);
    step(5);
    expect(nativeTargetAt(p.target)).toBeUndefined();
    expect(p.mount).toBeUndefined();
  });

  it("button preference toggles the native filter tag without disabling legacy controls", () => {
    const p = runtime.makePlayer();
    step(45);
    sitCommand("sit:button").callback({ sourceEntity: p }, false);
    step();
    expect(p.getDynamicProperty("sit:button")).toBe(false);
    expect(p.hasTag("ed67_sit_no_button")).toBe(true);
    expect(nativeTargetAt(p.target)).toBeUndefined();
    sitCommand("sit:down").callback({ sourceEntity: p });
    step();
    expect(p.mount).toBeTruthy();
    sitCommand("sit:button").callback({ sourceEntity: p }, true);
    step();
    expect(p.getDynamicProperty("sit:button")).toBe(true);
    expect(p.hasTag("ed67_sit_no_button")).toBe(false);
  });

  for (const interruption of ["leave", "spawn", "death", "damage", "change-stair", "native-dismount", "dimension"]) {
    it(`queued transfer cannot override ${interruption}`, () => {
      const p = runtime.makePlayer();
      sitCommand("sit:down").callback({ sourceEntity: p });
      step();
      const seat = p.mount;
      const next = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
      world.beforeEvents.playerInteractWithBlock.emit({ player: p, block: next, isFirstEvent: true, cancel: false });
      if (interruption === "leave") world.afterEvents.playerLeave.emit({ playerId: p.id });
      if (interruption === "spawn") world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: false });
      if (interruption === "death") world.afterEvents.entityDie.emit({ deadEntity: p });
      if (interruption === "damage") world.afterEvents.entityHurt.emit({ hurtEntity: p, damage: 1 });
      if (interruption === "change-stair") runtime.dimension.stair(next.location, 1);
      if (interruption === "native-dismount") seat.rideable.ejectRiders();
      if (interruption === "dimension") p.dimension = { id: "minecraft:nether", getBlock: () => undefined } as any;
      step();
      expect(seat.teleports.length).toBe(0);
    });
  }

  it("diagnostics show stable helper identity and number of moves in the sitting session", () => {
    const p = runtime.makePlayer();
    sitCommand("sit:down").callback({ sourceEntity: p });
    step();
    const id = p.mount.id;
    p.target = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    sitCommand("sit:down").callback({ sourceEntity: p });
    step();
    sitCommand("sit:status").callback({ sourceEntity: p });
    step();
    expect(p.chat.some((m) => m.includes(`Seat helper: ${id}; moves this session: 1`))).toBe(true);
  });

  it("ASAP dispatch is deferred safely but needs no tick increment in the model", () => {
    const p = runtime.makePlayer();
    const tick = system.currentTick;
    interactBlock(p, p.target);
    expect(p.mount).toBeUndefined();
    expect(runtime.oneShotJobs).toBe(1);
    expect(requestedDelays).toEqual([0]);
    flushCurrentTick();
    expect(p.mount?.typeId).toBe("sit:seat");
    expect(system.currentTick).toBe(tick);
    expect(runtime.oneShotJobs).toBe(0);
  });

  it("native button round trip does not wait for periodic discovery or a switch cooldown", () => {
    const p = runtime.makePlayer();
    const original = p.target;
    const neighbor = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    mountNow(p);
    const carrier = p.mount;
    const tick = system.currentTick;
    const out = nativeTargetAt(neighbor);
    expect(out).toBeTruthy();
    expect(nativeTargetAt(original)).toBeUndefined();
    interactTarget(p, out);
    expect(carrier.location.z).toBe(0.5);
    flushCurrentTick();
    expect(carrier.location.z).toBe(1.5);
    const back = nativeTargetAt(original);
    expect(back).toBeTruthy();
    expect(out?.isValid).toBe(false);
    interactTarget(p, back);
    flushCurrentTick();
    expect(carrier.location.z).toBe(0.5);
    expect(p.mount).toBe(carrier);
    expect(carrier.teleports.length).toBe(2);
    expect(carrier.ejectCount).toBe(0);
    expect(carrier.addCount).toBe(1);
    expect(system.currentTick).toBe(tick);
    expect(runtime.oneShotJobs).toBe(0);
  });

  it("newly reachable next chair gets a target immediately after a move", () => {
    const p = runtime.makePlayer();
    const second = runtime.dimension.stair({ x: 0, y: 64, z: 3 });
    const third = runtime.dimension.stair({ x: 0, y: 64, z: 4 });
    mountNow(p);
    expect(nativeTargetAt(third)).toBeUndefined();
    interactTarget(p, nativeTargetAt(second));
    flushCurrentTick();
    expect(nativeTargetAt(third)).toBeTruthy();
  });

  it("a burst of 100 duplicate native clicks queues only one transfer", () => {
    const p = runtime.makePlayer();
    const next = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    mountNow(p);
    const carrier = p.mount;
    const target = nativeTargetAt(next);
    for (let i = 0; i < 100; i++) interactTarget(p, target);
    expect(runtime.oneShotJobs).toBe(1);
    flushCurrentTick();
    expect(carrier.teleports.length).toBe(1);
    expect(runtime.oneShotJobs).toBe(0);
    expect(carrier.ejectCount).toBe(0);
  });

  it("latest selected stair wins a pending burst instead of dropping the newer click", () => {
    const p = runtime.makePlayer();
    const second = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    const third = runtime.dimension.stair({ x: 0, y: 64, z: 2 });
    mountNow(p);
    const carrier = p.mount;
    interactTarget(p, nativeTargetAt(second));
    interactTarget(p, nativeTargetAt(third));
    expect(runtime.oneShotJobs).toBe(1);
    flushCurrentTick();
    expect(carrier.location.z).toBe(2.5);
    expect(carrier.teleports.length).toBe(1);
    expect(carrier.ejectCount).toBe(0);
  });

  it("latest block click also replaces a pending entity click without adding another callback", () => {
    const p = runtime.makePlayer();
    const second = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    const third = runtime.dimension.stair({ x: 0, y: 64, z: 2 });
    mountNow(p);
    const carrier = p.mount;
    interactTarget(p, nativeTargetAt(second));
    interactBlock(p, third);
    expect(runtime.oneShotJobs).toBe(1);
    flushCurrentTick();
    expect(carrier.location.z).toBe(2.5);
    expect(carrier.teleports.length).toBe(1);
  });

  it("selecting current chair before callback cancels the pending move as a no-op", () => {
    const p = runtime.makePlayer();
    const original = p.target;
    const next = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    mountNow(p);
    const carrier = p.mount;
    interactBlock(p, next);
    interactBlock(p, original);
    flushCurrentTick();
    expect(carrier.teleports.length).toBe(0);
    expect(p.mount).toBe(carrier);
  });

  it("a superseded destination is not used when the newest stair changes before dispatch", () => {
    const p = runtime.makePlayer();
    const second = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    const third = runtime.dimension.stair({ x: 0, y: 64, z: 2 });
    mountNow(p);
    const carrier = p.mount;
    interactBlock(p, second);
    interactBlock(p, third);
    runtime.dimension.stair(third.location, 1);
    flushCurrentTick();
    expect(carrier.teleports.length).toBe(0);
    expect(p.mount).toBe(carrier);
  });

  it("latest-input replacement remains cancelable by damage before dispatch", () => {
    const p = runtime.makePlayer();
    const second = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    const third = runtime.dimension.stair({ x: 0, y: 64, z: 2 });
    mountNow(p);
    const carrier = p.mount;
    interactBlock(p, second);
    interactBlock(p, third);
    world.afterEvents.entityHurt.emit({ hurtEntity: p, damage: 1 });
    flushCurrentTick();
    expect(carrier.teleports.length).toBe(0);
    expect(p.mount).toBeUndefined();
  });

  it("the click snapshot is independent of mutable event block references", () => {
    const p = runtime.makePlayer();
    const next = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    mountNow(p);
    const carrier = p.mount;
    const event = interactBlock(p, next);
    event.block = p.target;
    flushCurrentTick();
    expect(carrier.location.z).toBe(1.5);
  });

  it("repeated same-chair clicks do not teleport, recreate targets or add a timed wait", () => {
    const p = runtime.makePlayer();
    runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    mountNow(p);
    const carrier = p.mount;
    const entityCount = runtime.dimension.entities.length;
    for (let i = 0; i < 20; i++) {
      interactBlock(p, p.target);
      flushCurrentTick();
    }
    expect(carrier.teleports.length).toBe(0);
    expect(runtime.dimension.entities.length).toBe(entityCount);
    expect(runtime.oneShotJobs).toBe(0);
  });

  it("fast switching still respects the original cooldown after actually standing", () => {
    const p = runtime.makePlayer();
    const next = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    mountNow(p);
    interactBlock(p, next);
    flushCurrentTick();
    sitCommand("sit:stand").callback({ sourceEntity: p });
    flushCurrentTick();
    expect(p.mount).toBeUndefined();
    interactBlock(p, p.target);
    flushCurrentTick();
    expect(p.mount).toBeUndefined();
  });

  it("diagnostics distinguish simulated input queue ticks from client visual latency", () => {
    const p = runtime.makePlayer();
    const next = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    mountNow(p);
    interactBlock(p, next);
    flushCurrentTick();
    sitCommand("sit:status").callback({ sourceEntity: p });
    flushCurrentTick();
    expect(p.chat.some((m) => m.includes("Last attempt: ok"))).toBe(true);
    expect(
      p.chat.some((m) => m.includes("Last button/block input delay: 0 server ticks (not client display latency)")),
    ).toBe(true);
  });

  it("diagnostic reports actual queue delay when the simulated scheduler is delayed", () => {
    const p = runtime.makePlayer();
    const next = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    mountNow(p);
    // The mock cannot advance its clock without draining due jobs, so a late dispatch is modelled by
    // scheduling this one request three ticks out and stepping up to it.
    const runTimeout = system.runTimeout;
    system.runTimeout = (fn, delay = 0) => runTimeout.call(system, fn, delay + 3);
    try {
      interactBlock(p, next);
    } finally {
      system.runTimeout = runTimeout;
    }
    step(3);
    sitCommand("sit:status").callback({ sourceEntity: p });
    flushCurrentTick();
    expect(p.chat.some((m) => m.includes("Last button/block input delay: 3 server ticks"))).toBe(true);
  });
});

describe("stair-sit lifecycle", () => {
  it("subscribes the interaction handlers and three loops on world load", () => {
    installDimension();
    runFeature(stairSit);
    startup();
    const before = {
      block: world.beforeEvents.playerInteractWithBlock.size,
      entity: world.beforeEvents.playerInteractWithEntity.size,
      intervals: system.intervalCount,
    };
    loadWorld();
    step();
    expect(world.beforeEvents.playerInteractWithBlock.size).toBe(before.block + 1);
    expect(world.beforeEvents.playerInteractWithEntity.size).toBe(before.entity + 1);
    expect(system.intervalCount).toBe(before.intervals + 3);

    const p = runtime.makePlayer();
    const next = runtime.dimension.stair({ x: 0, y: 64, z: 1 });
    mountNow(p);
    expect(nativeTargetAt(next)).toBeTruthy();
    expect(runtime.dimension.getEntities({ type: "sit:seat" }).length).toBe(1);
  });
});
