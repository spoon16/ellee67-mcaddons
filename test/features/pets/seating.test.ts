import { beforeEach, describe, expect, it } from "vitest";
import { transitionForm } from "../../../src/features/pets/appearance.js";
import {
  calculateLift,
  refreshSeat,
  resetSeatTrim,
  seatInfo,
  setSeatTrim,
  supportFor,
} from "../../../src/features/pets/seating.js";
import { engine, reset, ticks } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { command, petPlayer, start, text } from "./helpers.ts";

let nextId = 0;

/** A Carter player riding `kind`; `dismount()` drops the riding component like the engine would. */
function mounted(kind = "minecraft:pig", y = 20, playerY = 20.3) {
  const p = petPlayer(`seat-${++nextId}`);
  p.props["pet:model_id"] = 1;
  p.dynamic["pet:preferred_form"] = "carter";
  const m = {
    id: "mount",
    typeId: kind,
    isValid: true,
    location: { x: 0.5, y, z: 0.5 },
    getComponent: () => ({ getSeats: () => [{ position: { x: 0, y: 0.63, z: 0 } }] }),
  };
  p.location = { x: 0.5, y: playerY, z: 0.5 };
  const component = p.getComponent.bind(p);
  let riding: typeof m | undefined = m;
  p.getComponent = (key: string) =>
    key === "minecraft:riding" ? (riding ? { entityRidingOn: riding } : undefined) : component(key);
  return {
    p,
    m,
    dismount: () => {
      riding = undefined;
    },
  };
}

const support = (player: unknown, mount: unknown): Record<string, any> => supportFor(player, mount) ?? {};

beforeEach(() => {
  reset();
  ui.reset();
});

describe("support profiles", () => {
  it("Surface offset converts blocks to model pixels including player scale", () => {
    expect(calculateLift(20.9375, 20)).toBe(16);
    expect(calculateLift(20.9375, 20, 2)).toBe(18);
  });

  it("Non-finite offsets are rejected and extreme values are bounded", () => {
    expect(() => calculateLift(Number.NaN, 0)).toThrow();
    expect(calculateLift(200, 0)).toBe(64);
    expect(calculateLift(-200, 0)).toBe(-64);
  });

  it("Pig targets saddle/back height rather than human seat anchor", () => {
    const { p, m } = mounted();
    const r = support(p, m);
    expect(r.kind).toBe("pig");
    expect(r.surfaceY).toBe(21);
    expect(r.surfaceY).not.toBe(m.location.y + 0.63);
  });

  it("Boat uses interior-floor profile, raft uses its deck profile", () => {
    for (const [type, height] of [
      ["minecraft:boat", 0.1875],
      ["minecraft:chest_boat", 0.1875],
      ["minecraft:bamboo_raft", 0.25],
    ] as const) {
      const { p, m } = mounted(type);
      expect(support(p, m).surfaceY).toBe(20 + height);
    }
  });

  it("Custom stair seat uses lower tread world Y, not seat entity origin", () => {
    const { p, m } = mounted("test:stair_seat", 20.1, 19.6);
    p.dimension = engine({
      id: "minecraft:overworld",
      getBlock: (pos: { x: number; y: number; z: number }) =>
        pos.x === 0 && pos.y === 20 && pos.z === 0
          ? { typeId: "minecraft:red_nether_brick_stairs", permutation: { getState: () => false } }
          : undefined,
    });
    const r = support(p, m);
    expect(r.kind).toBe("stairs");
    expect(r.surfaceY).toBe(20.5);
    expect(r.block).toBe("minecraft:red_nether_brick_stairs");
  });

  it("Upside-down stairs use the full top surface", () => {
    const { p, m } = mounted("test:chair");
    p.dimension = engine({
      getBlock: (pos: { x: number; y: number; z: number }) =>
        pos.x === 0 && pos.y === 20 && pos.z === 0
          ? { typeId: "minecraft:oak_stairs", permutation: { getState: () => true } }
          : undefined,
    });
    expect(support(p, m).surfaceY).toBe(21);
  });

  it("Boat next to stairs stays on boat profile", () => {
    const { p, m } = mounted("minecraft:boat");
    p.dimension = engine({
      getBlock: () => {
        throw new Error("Should not scan blocks for a boat");
      },
    });
    expect(support(p, m).kind).toBe("boat");
  });

  it("Unprofiled mounts use their actual rideable seat as fallback", () => {
    const { p, m } = mounted("minecraft:horse");
    const r = support(p, m);
    expect(r.kind).toBe("other");
    expect(r.surfaceY).toBe(20.63);
  });
});

describe("seat alignment", () => {
  it("Moving mount and rider together preserve the visual offset", async () => {
    const { p, m } = mounted();
    refreshSeat(p);
    await ticks(1);
    const first = p.props["pet:seat_lift"];
    m.location.y += 3;
    p.location.y += 3;
    refreshSeat(p);
    await ticks(1);
    expect(p.props["pet:seat_lift"]).toBe(first);
  });

  it("Dismount clears the lift and no invisible follow entity is created", async () => {
    const { p, dismount } = mounted();
    refreshSeat(p);
    await ticks(1);
    expect(p.props["pet:seat_lift"]).toBeGreaterThan(0);
    dismount();
    refreshSeat(p);
    await ticks(1);
    expect(p.props["pet:seat_lift"]).toBe(0);
    expect(p.props["pet:seat_kind"]).toBe(0);
  });

  it("Switching Player while mounted clears all pet alignment properties", async () => {
    const { p } = mounted();
    refreshSeat(p);
    await ticks(1);
    transitionForm(p, "player");
    await ticks(1);
    refreshSeat(p);
    await ticks(1);
    expect(p.props["pet:seat_lift"]).toBe(0);
    expect(p.props["pet:armor_fit"]).toBe(false);
    expect(p.props["pet:gear_fit"]).toBe(false);
    expect(p.props["pet:view"]).toBe("native");
  });

  it("Seat calibration is per mount kind, not shared across boat and pig", async () => {
    const { p, m } = mounted();
    setSeatTrim(p, 2);
    await ticks(1);
    expect(seatInfo(p).trimPixels).toBe(2);
    m.typeId = "minecraft:boat";
    m.id = "boat";
    refreshSeat(p);
    await ticks(1);
    expect(seatInfo(p).trimPixels).toBe(0);
    m.typeId = "minecraft:pig";
    m.id = "pig";
    refreshSeat(p);
    await ticks(1);
    expect(seatInfo(p).trimPixels).toBe(2);
    resetSeatTrim(p);
    await ticks(1);
    expect(seatInfo(p).trimPixels).toBe(0);
  });

  it("Seat measurement never writes inventory, equipment, player position or mount position", async () => {
    const { p, m } = mounted();
    const items = [...p.items];
    const loc = { ...p.location };
    const mloc = { ...m.location };
    refreshSeat(p);
    await ticks(1);
    expect(p.items).toEqual(items);
    expect(p.location).toEqual(loc);
    expect(m.location).toEqual(mloc);
    expect(p.inventoryWrites).toBeUndefined();
  });

  it("Seat calibration rejects use without a mount or outside bounds", () => {
    const p = petPlayer("p");
    expect(() => setSeatTrim(p, 2)).toThrow();
    expect(() => setSeatTrim(p, 33)).toThrow();
    expect(() => setSeatTrim(p, 1.5)).toThrow();
  });

  it("New diagnostic commands are available through the same self-only handler", async () => {
    start();
    const p = petPlayer("p");
    command("seatinfo", p);
    await ticks(3);
    expect(text(p)).toMatch(/liftPixels/);
  });

  it("A pet selected while already mounted queues the seat height with the form", async () => {
    const { p } = mounted();
    p.props["pet:model_id"] = 0;
    p.dynamic["pet:preferred_form"] = "human";
    const planned = transitionForm(p, "casper");
    expect(planned.properties["pet:seat_kind"]).toBe(2);
    expect(planned.properties["pet:seat_lift"]).toBeGreaterThan(0);
    await ticks(1);
    expect(p.props["pet:model_id"]).toBe(3);
    expect(p.props["pet:seat_lift"]).toBe(planned.properties["pet:seat_lift"]);
  });

  it("Rapid mounted pet -> Player -> pet uses the last form and proper support", async () => {
    const { p } = mounted("minecraft:boat");
    transitionForm(p, "mochi");
    transitionForm(p, "player");
    const last = transitionForm(p, "carter");
    await ticks(1);
    expect(p.props["pet:model_id"]).toBe(1);
    expect(p.props["pet:seat_kind"]).toBe(1);
    expect(p.props["pet:seat_lift"]).toBe(last.properties["pet:seat_lift"]);
  });
});
