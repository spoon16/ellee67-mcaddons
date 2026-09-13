import { beforeEach, describe, expect, it } from "vitest";
import {
  defineFeatures,
  featurePropertyKey,
  featureStatusLines,
  isEnabled,
  isRunning,
  normalizeFeatureId,
  setEnabled,
  startEnabledFeatures,
  startFeature,
  stopFeature,
} from "../../src/core/features.ts";
import { reset, step, system, world } from "../mocks/minecraft-server.ts";
import { fakeFeature } from "./helpers.ts";

beforeEach(() => reset());

describe("feature registry", () => {
  it("starts default-enabled features on world load and leaves the others stopped", () => {
    const on = fakeFeature("pets");
    const off = fakeFeature("creeper-mod", { defaultEnabled: false });
    defineFeatures([on.definition, off.definition]);
    startEnabledFeatures();
    expect(on.log.starts).toBe(1);
    expect(off.log.starts).toBe(0);
    expect(isRunning("pets")).toBe(true);
    expect(isRunning("creeper-mod")).toBe(false);
    expect(featureStatusLines()).toEqual(["pets: enabled", "creeper-mod: disabled"]);
  });

  it("honours a stored world setting over the default", () => {
    const pets = fakeFeature("pets");
    defineFeatures([pets.definition]);
    world.setDynamicProperty(featurePropertyKey("pets"), false);
    startEnabledFeatures();
    expect(pets.log.starts).toBe(0);
    expect(isEnabled("pets")).toBe(false);
  });

  it("persists toggles and calls stop() then start() exactly once each", () => {
    const pets = fakeFeature("pets");
    defineFeatures([pets.definition]);
    startEnabledFeatures();
    expect(setEnabled("pets", false)).toEqual({ changed: true });
    expect(world.getDynamicProperty(featurePropertyKey("pets"))).toBe(false);
    expect(pets.log.stops).toBe(1);
    expect(isRunning("pets")).toBe(false);
    expect(setEnabled("pets", false)).toEqual({ changed: false });
    expect(setEnabled("pets", true)).toEqual({ changed: true });
    expect(pets.log.starts).toBe(2);
    expect(startFeature("pets")).toEqual({ changed: false });
  });

  it("disposes every subscription and interval the feature registered through its context", () => {
    let fired = 0;
    const pets = fakeFeature("pets", {
      onStart(ctx) {
        ctx.on(world.afterEvents.playerLeave, () => fired++);
        ctx.every(1, () => fired++);
      },
    });
    defineFeatures([pets.definition]);
    startEnabledFeatures();
    step(1);
    world.afterEvents.playerLeave.emit({ playerId: "x" });
    expect(fired).toBe(2);
    expect(system.intervalCount).toBe(1);
    stopFeature("pets");
    step(2);
    world.afterEvents.playerLeave.emit({ playerId: "x" });
    expect(fired).toBe(2);
    expect(system.intervalCount).toBe(0);
    expect(world.afterEvents.playerLeave.size).toBe(0);
  });

  it("reports a start failure, cleans up partial subscriptions and stays stopped", () => {
    const broken = fakeFeature("ender-mod", {
      failStart: true,
      onStart(ctx) {
        ctx.on(world.afterEvents.playerLeave, () => {});
      },
    });
    defineFeatures([broken.definition]);
    const result = startFeature("ender-mod");
    expect(result.changed).toBe(false);
    expect(String(result.error)).toContain("ender-mod exploded");
    expect(isRunning("ender-mod")).toBe(false);
    expect(world.afterEvents.playerLeave.size).toBe(0);
  });

  it("runs alwaysOn once at world load and keeps it alive across disable", () => {
    let dropHandlers = 0;
    const ore = fakeFeature("rbow-ore", { defaultEnabled: false });
    ore.definition.alwaysOn = (ctx) => {
      ctx.on(world.afterEvents.playerBreakBlock, () => dropHandlers++);
    };
    defineFeatures([ore.definition]);
    startEnabledFeatures();
    expect(ore.log.starts).toBe(0);
    world.afterEvents.playerBreakBlock.emit({});
    expect(dropHandlers).toBe(1);
    setEnabled("rbow-ore", true);
    setEnabled("rbow-ore", false);
    world.afterEvents.playerBreakBlock.emit({});
    expect(dropHandlers).toBe(2);
    expect(world.afterEvents.playerBreakBlock.size).toBe(1);
  });

  it("normalises feature ids typed by players", () => {
    defineFeatures([fakeFeature("stair-sit").definition]);
    expect(normalizeFeatureId("stair-sit")).toBe("stair-sit");
    expect(normalizeFeatureId("Stair_Sit")).toBe("stair-sit");
    expect(normalizeFeatureId(" STAIR-SIT ")).toBe("stair-sit");
    expect(normalizeFeatureId("pets")).toBeUndefined();
  });

  it("shows the disabled note only while disabled", () => {
    defineFeatures([fakeFeature("rbow-ore", { disabledNote: "Ore stays in the world." }).definition]);
    startEnabledFeatures();
    expect(featureStatusLines()).toEqual(["rbow-ore: enabled"]);
    setEnabled("rbow-ore", false);
    expect(featureStatusLines()).toEqual(["rbow-ore: disabled (Ore stays in the world.)"]);
  });
});
