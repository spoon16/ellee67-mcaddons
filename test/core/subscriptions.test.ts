import { beforeEach, describe, expect, it } from "vitest";
import { FeatureContext } from "../../src/core/subscriptions.ts";
import { registry, reset, Signal, step, system, world } from "../mocks/minecraft-server.ts";

beforeEach(() => reset());

describe("FeatureContext", () => {
  it("subscribes a one-argument signal with exactly one argument (the engine rejects a second, even undefined)", () => {
    const ctx = new FeatureContext("demo");
    expect(() => ctx.on(world.beforeEvents.explosion, () => {})).not.toThrow();
    expect(() => ctx.on(world.afterEvents.playerSpawn, () => {})).not.toThrow();
    expect(world.beforeEvents.explosion.size).toBe(1);
    expect(world.afterEvents.playerSpawn.size).toBe(1);
  });

  it("forwards options only to signals that were given some", () => {
    const seen: unknown[][] = [];
    const signal = new Signal(true);
    const original = signal.subscribe.bind(signal);
    signal.subscribe = ((callback: (event: unknown) => void, ...extra: unknown[]) => {
      seen.push(extra);
      return original(callback, ...extra);
    }) as typeof signal.subscribe;
    const ctx = new FeatureContext("demo");
    ctx.on(signal, () => {});
    ctx.on(signal, () => {}, { entityTypes: ["minecraft:creeper"] });
    expect(seen).toEqual([[], [{ entityTypes: ["minecraft:creeper"] }]]);
  });

  it("undoes every subscription, interval, timeout and cleanup on dispose", () => {
    const order: string[] = [];
    const ctx = new FeatureContext("demo");
    const intervals = system.intervalCount;
    ctx.on(world.afterEvents.playerLeave, () => {});
    ctx.every(5, () => order.push("tick"));
    ctx.after(100, () => order.push("late"));
    ctx.onDispose(() => order.push("cleanup"));
    expect(ctx.size).toBe(4);
    step(5);
    expect(order).toEqual(["tick"]);
    ctx.dispose();
    expect(ctx.size).toBe(0);
    expect(world.afterEvents.playerLeave.size).toBe(0);
    expect(system.intervalCount).toBe(intervals);
    step(200);
    expect(order).toEqual(["tick", "cleanup"]);
  });
});

describe("engine rules the mock enforces", () => {
  it("rejects a second argument to a one-argument signal the way the engine does", () => {
    expect(() => (world.beforeEvents.explosion as Signal).subscribe(() => {}, undefined)).toThrow(
      "Incorrect number of arguments to function. Expected 1, received 2",
    );
    expect(() => (world.afterEvents.entityHurt as Signal).subscribe(() => {}, undefined)).not.toThrow();
  });

  it("holds every command and enum of one script module to the namespace of the first registration", () => {
    registry.registerEnum("pet:form_choice", ["player"]);
    expect(() => registry.registerEnum("sit:mode", ["on"])).toThrow(
      "Custom Command Enum namespaces must match. Namespace 'sit' does not match existing namespace 'pet'.",
    );
    expect(() =>
      registry.registerCommand(
        { name: "elleedog:ender_protect", description: "", permissionLevel: 0 },
        () => undefined,
      ),
    ).toThrow("does not match existing namespace 'pet'");
    expect(() =>
      registry.registerCommand({ name: "pet:form", description: "", permissionLevel: 0 }, () => undefined),
    ).not.toThrow();
  });
});
