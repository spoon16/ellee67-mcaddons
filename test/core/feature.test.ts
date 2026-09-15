import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FeatureDefinition, runFeature } from "../../src/core/feature.ts";
import type { FeatureContext } from "../../src/core/subscriptions.ts";
import { loadWorld, registry, reset, runCommand, startup, system, world } from "../mocks/minecraft-server.ts";

interface Log {
  registered: number;
  starts: number;
  context?: FeatureContext;
}

function feature(id: string, hooks: { register?: (log: Log) => void; start?: (ctx: FeatureContext) => void } = {}) {
  const log: Log = { registered: 0, starts: 0 };
  const definition: FeatureDefinition = {
    id,
    title: id,
    register(registries) {
      log.registered++;
      registries.commands.registerCommand(
        { name: `${id}:ping`, description: "ping", permissionLevel: 0, cheatsRequired: false },
        () => ({ status: 0, message: "pong" }),
      );
      hooks.register?.(log);
    },
    start(ctx) {
      log.starts++;
      log.context = ctx;
      hooks.start?.(ctx);
    },
  };
  return { definition, log };
}

beforeEach(() => reset());
afterEach(() => vi.restoreAllMocks());

describe("runFeature", () => {
  it("registers at startup with the engine registries and starts once the world has loaded", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { definition, log } = feature("demo", { start: (ctx) => ctx.on(world.beforeEvents.explosion, () => {}) });
    runFeature(definition);
    expect(log.registered).toBe(0);
    startup();
    expect(log.registered).toBe(1);
    expect(registry.commands.has("demo:ping")).toBe(true);
    expect(runCommand("demo:ping", {}).message).toBe("pong");
    expect(log.starts).toBe(0);
    loadWorld();
    expect(log.starts).toBe(1);
    expect(world.beforeEvents.explosion.size).toBe(1);
    expect(info).toHaveBeenCalledWith("[ElleeDog 67] demo loaded");
  });

  it("logs a throwing register() and still starts the feature", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { definition, log } = feature("demo", {
      register: () => {
        throw new Error("no enums today");
      },
    });
    runFeature(definition);
    startup();
    loadWorld();
    expect(warn).toHaveBeenCalledWith("[ElleeDog 67] demo registration failed: no enums today");
    expect(log.starts).toBe(1);
  });

  it("logs a throwing start() and disposes what it subscribed before throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const intervals = system.intervalCount;
    const { definition } = feature("demo", {
      start: (ctx) => {
        ctx.on(world.afterEvents.playerSpawn, () => {});
        ctx.every(20, () => {});
        throw new Error("boom");
      },
    });
    runFeature(definition);
    startup();
    loadWorld();
    expect(warn).toHaveBeenCalledWith("[ElleeDog 67] demo failed to start: boom");
    expect(world.afterEvents.playerSpawn.size).toBe(0);
    expect(system.intervalCount).toBe(intervals);
  });

  it("gives every feature its own context", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const a = feature("aa");
    const b = feature("bb");
    runFeature(a.definition);
    runFeature(b.definition);
    // Two features in one script module would share a namespace; the mock enforces that, so give them one here.
    registry.namespace = undefined;
    startup();
    loadWorld();
    expect(a.log.context).not.toBe(b.log.context);
    expect(a.log.context?.featureId).toBe("aa");
  });
});
