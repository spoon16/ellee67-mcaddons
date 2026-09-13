import { beforeEach, describe, expect, it } from "vitest";
import {
  blockKey,
  describeStair,
  FRONT,
  gestureComplete,
  highTreadPoint,
} from "../../../src/features/stair-sit/stairs.ts";
import { reset } from "../../mocks/minecraft-server.ts";

const p = { x: 10, y: 64, z: -12 };
const describeAt = (d: number, c = "none"): any =>
  describeStair(
    "minecraft:oak_stairs",
    { weirdo_direction: d, upside_down_bit: false, "minecraft:corner": c },
    p,
    "minecraft:overworld",
  );

beforeEach(() => reset());

describe("stair geometry", () => {
  for (let direction = 0; direction < 4; direction++) {
    it(`orientation ${direction}: low tread and facing opposite high side`, () => {
      const s = describeAt(direction);
      const f: any = FRONT[direction];
      expect(s.front.yaw).toBe([90, -90, 180, 0][direction]);
      expect((s.local.x - 0.5) * f.x + (s.local.z - 0.5) * f.z).toBe(0.25);
      const high = highTreadPoint(s);
      expect((high.x - p.x - 0.5) * f.x + (high.z - p.z - 0.5) * f.z).toBe(-0.25);
      expect(high.y).toBe(65.01);
    });
    for (const corner of ["inner_left", "inner_right", "outer_left", "outer_right"]) {
      it(`direction ${direction} / ${corner}: stays inside stair and on low side`, () => {
        const s = describeAt(direction, corner);
        expect([0.25, 0.5, 0.75]).toContain(s.local.x);
        expect([0.25, 0.5, 0.75]).toContain(s.local.z);
        expect((s.local.x - 0.5) * s.front.x + (s.local.z - 0.5) * s.front.z).toBe(0.25);
        if (corner.startsWith("inner")) {
          const side = (s.local.x - 0.5) * s.front.z + (s.local.z - 0.5) * -s.front.x;
          expect(side).toBe(corner === "inner_left" ? 0.25 : -0.25);
        }
        const h = highTreadPoint(s);
        expect(h.x > p.x && h.x < p.x + 1).toBe(true);
        expect(h.z > p.z && h.z < p.z + 1).toBe(true);
      });
    }
  }

  it("every vanilla material with stair states is accepted, without a stale material whitelist", () => {
    for (const material of [
      "oak",
      "pale_oak",
      "bamboo",
      "cherry",
      "waxed_oxidized_cut_copper",
      "polished_tuff",
      "nether_brick",
      "quartz",
      "resin_brick",
    ]) {
      expect(
        describeStair(
          `minecraft:${material}_stairs`,
          { weirdo_direction: 2, upside_down_bit: false },
          p,
          "minecraft:overworld",
        ),
      ).toBeTruthy();
    }
  });

  it("reject upside-down, non-stairs, third-party lookalikes and invalid state values", () => {
    for (const [id, states] of [
      ["minecraft:oak_stairs", { weirdo_direction: 0, upside_down_bit: true }],
      ["minecraft:oak_stairs", { weirdo_direction: 7, upside_down_bit: false }],
      ["minecraft:oak_stairs", { weirdo_direction: "0", upside_down_bit: false }],
      ["minecraft:oak_stairs", { weirdo_direction: 0 }],
      ["minecraft:oak_stairs", { weirdo_direction: 0, upside_down_bit: false, "minecraft:corner": "unknown" }],
      ["minecraft:stone", { weirdo_direction: 0, upside_down_bit: false }],
      ["other:oak_stairs", { weirdo_direction: 0, upside_down_bit: false }],
    ] as const) {
      expect(describeStair(id, states, p, "overworld")).toBeUndefined();
    }
  });

  it("same position in different dimensions has distinct occupancy keys", () => {
    expect(blockKey("overworld", p)).not.toBe(blockKey("nether", p));
  });

  it("crouch gesture requires the same target and intentional press duration", () => {
    expect(gestureComplete({ key: "a", tick: 10 }, 12, "a")).toBe(true);
    expect(gestureComplete({ key: "a", tick: 10 }, 130, "a")).toBe(true);
    expect(gestureComplete({ key: "a", tick: 10 }, 11, "a")).toBe(false);
    expect(gestureComplete({ key: "a", tick: 10 }, 131, "a")).toBe(false);
    expect(gestureComplete({ key: "a", tick: 10 }, 20, "b")).toBe(false);
    expect(gestureComplete(undefined, 20, "a")).toBe(false);
  });
});
