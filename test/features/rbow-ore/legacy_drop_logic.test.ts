// Upgrade transaction unit tests. Opaque metadata models retained stack data; nothing here asserts that
// Minecraft serializes a specific component correctly.
import { describe, expect, it } from "vitest";
import { LEGACY_TYPE, releaseLegacyDrop } from "../../../src/features/rbow-ore/legacy_drop_logic.ts";

class Stack {
  typeId: string;
  amount: number;
  metadata: Record<string, unknown>;
  constructor(typeId = "elleedog:rbow_sword", amount = 1, metadata: Record<string, unknown> = {}) {
    this.typeId = typeId;
    this.amount = amount;
    this.metadata = structuredClone(metadata);
  }
  clone(): Stack {
    return new Stack(this.typeId, this.amount, this.metadata);
  }
}

interface Failures {
  inventory?: boolean;
  clear?: boolean;
  spawn?: boolean;
  rollback?: boolean;
  remove?: boolean;
}

interface Drop {
  typeId: string;
  item: Stack;
  location: { x: number; y: number; z: number };
  gone: boolean;
  remove(): void;
}

interface Carrier {
  getItem(slot: number): Stack | undefined;
  setItem?(slot: number, item?: Stack): void;
}

function fixture(stack: Stack | undefined = new Stack(), fail: Failures = {}) {
  let stored: Stack | undefined = stack?.clone();
  let gone = false;
  const calls: string[] = [];
  const spawned: Drop[] = [];
  const properties: Record<string, unknown> = {};
  const entity = {
    typeId: LEGACY_TYPE,
    id: "legacy",
    isValid: true,
    location: { x: 2, y: 64, z: 3 },
    getDynamicProperty: (key: string) => properties[key],
    setDynamicProperty: (key: string, value: unknown) => {
      properties[key] = value;
    },
    getComponent(key: string): { container: Carrier } | undefined {
      expect(key).toBe("minecraft:inventory");
      if (fail.inventory) return undefined;
      return {
        container: {
          getItem(slot) {
            expect(slot).toBe(0);
            return stored?.clone();
          },
          setItem(slot, item) {
            expect(slot).toBe(0);
            calls.push("clear");
            if (fail.clear) throw new Error("clear failed");
            stored = item?.clone();
          },
        },
      };
    },
    remove() {
      calls.push("remove legacy");
      if (fail.remove) throw new Error("remove legacy failed");
      gone = true;
    },
    dimension: {
      spawnItem(item: Stack, location: { x: number; y: number; z: number }): Drop {
        calls.push("spawn native");
        if (fail.spawn) throw new Error("spawn failed");
        const drop: Drop = {
          typeId: "minecraft:item",
          item: item.clone(),
          location: { ...location },
          gone: false,
          remove() {
            calls.push("rollback native");
            if (fail.rollback) throw new Error("rollback failed");
            this.gone = true;
          },
        };
        spawned.push(drop);
        return drop;
      },
    },
  };
  return { entity, calls, spawned, properties, stored: () => stored, gone: () => gone };
}

function thrownBy(fn: () => unknown): any {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

describe("legacy drop release", () => {
  it("does not inspect, mutate or rewrap ordinary dropped items", () => {
    const entity = {
      typeId: "minecraft:item",
      getComponent() {
        throw new Error("ordinary item untouched");
      },
    };
    expect(releaseLegacyDrop(entity)).toEqual({ status: "ignored" });
  });

  it("moves the full stack to a native drop before removing the empty carrier", () => {
    const f = fixture(new Stack("elleedog:rbow_ingot", 43));
    expect(releaseLegacyDrop(f.entity)).toEqual({ status: "released", typeId: "elleedog:rbow_ingot", amount: 43 });
    expect(f.calls).toEqual(["spawn native", "clear", "remove legacy"]);
    expect(f.stored()).toBeUndefined();
    expect(f.gone()).toBe(true);
    expect(f.spawned[0]?.typeId).toBe("minecraft:item");
    expect(f.spawned[0]?.item.amount).toBe(43);
    expect(f.spawned[0]?.location).toEqual({ x: 2, y: 64, z: 3 });
  });

  it("preserves arbitrary cloneable item metadata, including a native trim payload", () => {
    const metadata = {
      name: "Favorite helmet",
      damage: 129,
      enchantments: ["mending", "protection:4"],
      lore: ["original"],
      nativeTrim: { pattern: "coast", material: "gold" },
      dynamic: { "other:field": true },
    };
    const f = fixture(new Stack("elleedog:rbow_helmet", 1, metadata));
    releaseLegacyDrop(f.entity);
    expect(f.spawned[0]?.item.metadata).toEqual(metadata);
    expect(f.spawned[0]?.item.typeId).toBe("elleedog:rbow_helmet");
  });

  it("stack clone is independent of the original object", () => {
    const stack = new Stack("elleedog:rbow_sword", 1, { name: "Original" });
    const f = fixture(stack);
    releaseLegacyDrop(f.entity);
    stack.metadata.name = "Changed outside";
    expect(f.spawned[0]?.item.metadata.name).toBe("Original");
  });

  it("failed native spawn leaves the stored stack intact and does not remove the carrier", () => {
    const f = fixture(new Stack(), { spawn: true });
    expect(() => releaseLegacyDrop(f.entity)).toThrow(/spawn failed/);
    expect(f.stored()).toBeDefined();
    expect(f.gone()).toBe(false);
    expect(f.spawned).toHaveLength(0);
  });

  it("failed source clear removes the spawned copy and retains the original", () => {
    const f = fixture(new Stack(), { clear: true });
    expect(() => releaseLegacyDrop(f.entity)).toThrow(/clear failed/);
    expect(f.stored()).toBeDefined();
    expect(f.gone()).toBe(false);
    expect(f.spawned[0]?.gone).toBe(true);
    expect(f.calls).toEqual(["spawn native", "clear", "rollback native"]);
  });

  it("double write/rollback failure is blocked from making repeated copies", () => {
    const f = fixture(new Stack(), { clear: true, rollback: true });
    const error = thrownBy(() => releaseLegacyDrop(f.entity));
    expect(error).toBeInstanceOf(Error);
    expect(error.retryable).toBe(false);
    expect(releaseLegacyDrop(f.entity)).toEqual({ status: "blocked" });
    expect(f.spawned).toHaveLength(1);
    expect(f.stored()).toBeDefined();
  });

  it("failed legacy removal after transfer leaves an empty shell and no stored duplicate", () => {
    const f = fixture(new Stack(), { remove: true });
    expect(releaseLegacyDrop(f.entity).status).toBe("released");
    expect(f.stored()).toBeUndefined();
    expect(f.spawned).toHaveLength(1);
    expect(f.spawned[0]?.gone).toBe(false);
    expect(() => releaseLegacyDrop(f.entity)).toThrow(/remove legacy failed/);
    expect(f.spawned).toHaveLength(1);
  });

  it("empty old carrier is removed without spawning an item", () => {
    const f = fixture();
    f.entity.getComponent = () => ({ container: { getItem: () => undefined } });
    expect(releaseLegacyDrop(f.entity)).toEqual({ status: "empty" });
    expect(f.gone()).toBe(true);
    expect(f.spawned).toHaveLength(0);
  });

  it("missing inventory is reported without destroying the carrier", () => {
    const f = fixture(new Stack(), { inventory: true });
    expect(() => releaseLegacyDrop(f.entity)).toThrow(/inventory unavailable/);
    expect(f.spawned).toHaveLength(0);
    expect(f.gone()).toBe(false);
    expect(f.stored()).toBeDefined();
  });

  it("repeated callbacks after a successful transfer cannot duplicate the stored stack", () => {
    const f = fixture(new Stack("elleedog:rbow_block", 64));
    releaseLegacyDrop(f.entity);
    releaseLegacyDrop(f.entity);
    expect(f.spawned).toHaveLength(1);
    expect(f.spawned[0]?.item.amount).toBe(64);
  });
});
