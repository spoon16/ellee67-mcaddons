// The guard is a pure function of the before-event, so these tests hand it small event objects rather than the
// shared engine mock: what matters is which fields it reads and which one it writes.
import { describe, expect, it } from "vitest";
import { createCreeperGuard } from "../../../src/features/creeper-mod/guard.ts";
import { engine } from "../../mocks/minecraft-server.ts";

interface FakeEvent {
  source?: { typeId: string };
  cancel: boolean;
  impacted: unknown[];
  getImpactedBlocks(): unknown[];
  setImpactedBlocks(blocks: unknown[]): void;
  writes: number;
}

function explosion(typeId: string | undefined, blocks: unknown[] = ["stone", "dirt"]): FakeEvent {
  const event: FakeEvent = {
    source: typeId === undefined ? undefined : { typeId },
    cancel: false,
    impacted: [...blocks],
    writes: 0,
    getImpactedBlocks() {
      return this.impacted;
    },
    setImpactedBlocks(next) {
      this.writes++;
      this.impacted = [...next];
    },
  };
  return event;
}

function guard(warnings: string[] = []) {
  return createCreeperGuard({ warn: (message) => warnings.push(message) });
}

describe("creeper guard", () => {
  it("empties the impacted blocks of a creeper explosion and cancels nothing", () => {
    const event = explosion("minecraft:creeper");
    guard()(engine(event));
    expect(event.impacted).toEqual([]);
    expect(event.writes).toBe(1);
    expect(event.cancel).toBe(false);
  });

  it("treats a charged creeper the same way: it is the same entity type", () => {
    const event = explosion("minecraft:creeper", ["a", "b", "c"]);
    guard()(engine(event));
    expect(event.getImpactedBlocks()).toEqual([]);
  });

  for (const source of [
    undefined,
    "minecraft:tnt",
    "minecraft:end_crystal",
    "minecraft:wither_skull",
    "other:creeper",
  ]) {
    it(`leaves an explosion from ${source ?? "no entity"} exactly as the engine planned it`, () => {
      const event = explosion(source);
      guard()(engine(event));
      expect(event.impacted).toEqual(["stone", "dirt"]);
      expect(event.writes).toBe(0);
      expect(event.cancel).toBe(false);
    });
  }

  it("reports a block list the engine refuses and lets the explosion go on", () => {
    const warnings: string[] = [];
    const event = explosion("minecraft:creeper");
    event.setImpactedBlocks = () => {
      throw new Error("read-only");
    };
    expect(() => guard(warnings)(engine(event))).not.toThrow();
    expect(warnings).toEqual(["A creeper explosion kept its blocks: read-only"]);
    expect(event.cancel).toBe(false);
  });

  it("reads nothing but the source type: no dimension, location, players or components", () => {
    const touched: string[] = [];
    const source = new Proxy(
      { typeId: "minecraft:creeper" },
      {
        get: (t, k) => {
          touched.push(String(k));
          return (t as any)[k];
        },
      },
    );
    const event = explosion("minecraft:creeper");
    event.source = source;
    guard()(engine(event));
    expect(touched).toEqual(["typeId"]);
  });
});
