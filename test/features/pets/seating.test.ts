import { beforeEach, describe, expect, it } from "vitest";
import { transitionForm } from "../../../src/features/pets/appearance.ts";
import { MODEL_BY_ID, PETS, SEAT_KINDS, SEAT_TRIM_BAKE } from "../../../src/features/pets/catalog.generated.ts";
import {
  bakedForward,
  bakedTrim,
  calculateLift,
  refreshSeat,
  resetSeatTrim,
  seatInfo,
  setSeatTrim,
  supportFor,
} from "../../../src/features/pets/seating.ts";
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

const support = (player: unknown, mount: unknown): Record<string, any> =>
  supportFor(engine(player), engine(mount)) ?? {};

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
    const { p, m } = mounted("minecraft:camel");
    const r = support(p, m);
    expect(r.kind).toBe("other");
    expect(r.surfaceY).toBe(20.63);
    expect(r.source).toMatch(/unprofiled mount/);
  });

  for (const [type, kind] of [
    ["minecraft:horse", "horse"],
    ["minecraft:donkey", "horse"],
    ["minecraft:mule", "horse"],
    ["minecraft:skeleton_horse", "horse"],
    ["minecraft:zombie_horse", "horse"],
    ["minecraft:strider", "strider"],
    ["minecraft:happy_ghast", "happy_ghast"],
  ] as const) {
    it(`${type} is its own kind (${kind}) at the rider anchor, where "other" used to put it`, () => {
      const { p, m } = mounted(type);
      const r = support(p, m);
      expect(r.kind).toBe(kind);
      expect(r.surfaceY).toBe(20.63);
      expect(r.source).toMatch(/rideable seat anchor/);
    });
  }

  it("A named mount without a readable seat falls back to its origin, still under its own kind", () => {
    const { p, m } = mounted("minecraft:strider");
    m.getComponent = () => undefined as never;
    const r = support(p, m);
    expect(r.kind).toBe("strider");
    expect(r.surfaceY).toBe(20);
    expect(r.source).toMatch(/mount origin fallback/);
  });

  it("A custom seat inside a cushion block is the cushion kind, measured at the seat anchor", () => {
    const { p, m } = mounted("furniture:seat", 20.1, 19.6);
    p.dimension = engine({
      id: "minecraft:overworld",
      getBlock: (pos: { x: number; y: number; z: number }) =>
        pos.x === 0 && pos.y === 20 && pos.z === 0
          ? { typeId: "furniture:red_cushion", permutation: { getState: () => false } }
          : undefined,
    });
    const r = support(p, m);
    expect(r.kind).toBe("cushion");
    expect(r.block).toBe("furniture:red_cushion");
    expect(r.blockPosition).toEqual({ x: 0, y: 20, z: 0 });
    expect(r.surfaceY).toBeCloseTo(20.1 + 0.63);
    expect(r.source).toMatch(/cushion seat/);
  });

  it("A stair seat is still the stairs kind when a cushion sits further away", () => {
    const { p, m } = mounted("test:stair_seat", 20.1, 19.6);
    p.dimension = engine({
      id: "minecraft:overworld",
      getBlock: (pos: { x: number; y: number; z: number }) => {
        if (pos.x === 0 && pos.y === 20 && pos.z === 0)
          return { typeId: "minecraft:oak_stairs", permutation: { getState: () => false } };
        if (pos.x === 1 && pos.y === 20 && pos.z === 0)
          return { typeId: "deco:cushion", permutation: { getState: () => false } };
        return undefined;
      },
    });
    const r = support(p, m);
    expect(r.kind).toBe("stairs");
    expect(r.surfaceY).toBe(20.5);
  });

  it("Vanilla mounts never scan blocks, so a horse in a cushion shop is still a horse", () => {
    const { p, m } = mounted("minecraft:horse");
    p.dimension = engine({
      getBlock: () => {
        throw new Error("Should not scan blocks for a vanilla mount");
      },
    });
    expect(support(p, m).kind).toBe("horse");
  });

  it("Every kind has a distinct wire value in pet:seat_kind and the original five keep theirs", async () => {
    const values = new Map<string, number>();
    for (const [type, kind] of [
      ["minecraft:boat", "boat"],
      ["minecraft:pig", "pig"],
      ["minecraft:camel", "other"],
      ["minecraft:horse", "horse"],
      ["minecraft:strider", "strider"],
      ["minecraft:happy_ghast", "happy_ghast"],
    ] as const) {
      const { p } = mounted(type);
      refreshSeat(p);
      await ticks(1);
      values.set(kind, p.props["pet:seat_kind"] as number);
    }
    expect(values.get("boat")).toBe(1);
    expect(values.get("pig")).toBe(2);
    expect(values.get("other")).toBe(4);
    expect(new Set(values.values()).size).toBe(values.size);
    for (const value of values.values()) expect(value).toBeGreaterThan(0);
  });
});

describe("baked seat trims", () => {
  const TRIMS = "pet:seat_height_trims";
  const stored = (p: { dynamic: Record<string, unknown> }) => JSON.parse(String(p.dynamic[TRIMS]));

  it("Carter's catalog carries the measured trims per kind and the cats bake nothing", () => {
    const kinds = MODEL_BY_ID.carter?.seating.kinds;
    expect(Object.fromEntries(Object.entries(kinds ?? {}).map(([k, v]) => [k, v.trim]))).toEqual({
      boat: 0,
      stairs: 0,
      pig: -2,
      horse: 4,
      strider: 1,
      happy_ghast: 3,
      cushion: 1,
      other: 0,
    });
    for (const pet of PETS) {
      expect(Object.keys(pet.seating.kinds)).toEqual(SEAT_KINDS.slice(1));
      if (pet.id !== "carter") for (const kind of Object.values(pet.seating.kinds)) expect(kind.trim).toBe(0);
    }
    expect(bakedTrim(MODEL_BY_ID.carter, "pig")).toBe(-2);
    expect(bakedTrim(MODEL_BY_ID.mochi, "pig")).toBe(0);
    expect(bakedTrim(undefined, "pig")).toBe(0);
  });

  it("Carter sits one pixel forward on a strider; the clip applies it, the scripts only report it", async () => {
    expect(bakedForward(MODEL_BY_ID.carter, "strider")).toBe(1);
    expect(bakedForward(MODEL_BY_ID.carter, "pig")).toBe(0);
    expect(bakedForward(MODEL_BY_ID.mochi, "strider")).toBe(0);
    expect(bakedForward(undefined, "strider")).toBe(0);
    const { p } = mounted("minecraft:strider");
    refreshSeat(p);
    await ticks(1);
    expect(seatInfo(p)).toMatchObject({ kind: "strider", bakedPixels: 1, forwardPixels: 1 });
    // The forward offset never reaches pet:seat_lift; the vertical trim alone does.
    expect(p.props["pet:seat_lift"]).toBe(calculateLift(20.63, 20.3, 1));
    expect(Object.keys(p.props).filter((k) => k.startsWith("pet:seat"))).toEqual(["pet:seat_lift", "pet:seat_kind"]);
  });

  it("The baked trim is part of the lift and reported apart from the live one", async () => {
    const { p } = mounted("minecraft:pig");
    refreshSeat(p);
    await ticks(1);
    expect(p.props["pet:seat_lift"]).toBe(calculateLift(21, 20.3, -2));
    expect(seatInfo(p)).toMatchObject({ kind: "pig", bakedPixels: -2, trimPixels: 0 });
    setSeatTrim(p, 3);
    await ticks(1);
    expect(p.props["pet:seat_lift"]).toBe(calculateLift(21, 20.3, 1));
    expect(seatInfo(p)).toMatchObject({ bakedPixels: -2, trimPixels: 3 });
    expect(text(p)).toMatch(/pig seat adjustment: 3 pixels, on top of Carter's baked -2/);
    resetSeatTrim(p);
    await ticks(1);
    expect(p.props["pet:seat_lift"]).toBe(calculateLift(21, 20.3, -2));
    expect(text(p)).toMatch(/Carter's baked -2 stays/);
  });

  it("The baked trim follows the pet: Mochi on the same pig gets none, Carter on a horse gets four", async () => {
    const cat = mounted("minecraft:pig");
    cat.p.props["pet:model_id"] = 2;
    cat.p.dynamic["pet:preferred_form"] = "mochi";
    refreshSeat(cat.p);
    await ticks(1);
    expect(cat.p.props["pet:seat_lift"]).toBe(calculateLift(21, 20.3, 0));
    expect(seatInfo(cat.p).bakedPixels).toBe(0);
    const horse = mounted("minecraft:horse");
    refreshSeat(horse.p);
    await ticks(1);
    expect(horse.p.props["pet:seat_lift"]).toBe(calculateLift(20.63, 20.3, 4));
    expect(seatInfo(horse.p)).toMatchObject({ kind: "horse", bakedPixels: 4 });
  });

  it("A new bake drops the live trims of the profiled kinds once and keeps other", async () => {
    const { p } = mounted("minecraft:pig");
    p.dynamic[TRIMS] = JSON.stringify({ pig: 5, horse: 2, boat: 1, other: 3 });
    refreshSeat(p);
    await ticks(1);
    expect(stored(p)).toEqual({ bake: SEAT_TRIM_BAKE, other: 3 });
    expect(seatInfo(p).trimPixels).toBe(0);
    expect(p.props["pet:seat_lift"]).toBe(calculateLift(21, 20.3, -2));
    // Stamped trims are left alone from now on, and a new trim keeps the stamp.
    setSeatTrim(p, 4);
    await ticks(1);
    const writes = p.dynamicWrites;
    refreshSeat(p);
    refreshSeat(p);
    await ticks(1);
    expect(p.dynamicWrites).toBe(writes);
    expect(stored(p)).toEqual({ bake: SEAT_TRIM_BAKE, other: 3, pig: 4 });
  });

  it("A trim saved against the current bake is kept as it is", async () => {
    const { p } = mounted("minecraft:pig");
    p.dynamic[TRIMS] = JSON.stringify({ bake: SEAT_TRIM_BAKE, pig: 5 });
    refreshSeat(p);
    await ticks(1);
    expect(seatInfo(p).trimPixels).toBe(5);
    expect(p.props["pet:seat_lift"]).toBe(calculateLift(21, 20.3, 3));
  });

  it("Choosing a pet while mounted queues that pet's baked trim with the form", () => {
    const { p } = mounted("minecraft:pig");
    p.props["pet:model_id"] = 0;
    p.dynamic["pet:preferred_form"] = "human";
    expect(transitionForm(p, "carter").properties["pet:seat_lift"]).toBe(calculateLift(21, 20.3, -2));
    expect(transitionForm(p, "mochi").properties["pet:seat_lift"]).toBe(calculateLift(21, 20.3, 0));
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

  it("Seat calibration is per mount kind for the new kinds too", async () => {
    const { p, m } = mounted("minecraft:strider");
    setSeatTrim(p, 3);
    await ticks(1);
    expect(seatInfo(p).kind).toBe("strider");
    expect(seatInfo(p).trimPixels).toBe(3);
    expect(text(p)).toMatch(/strider seat adjustment: 3 pixels/);
    m.typeId = "minecraft:horse";
    m.id = "horse";
    refreshSeat(p);
    await ticks(1);
    expect(seatInfo(p).kind).toBe("horse");
    expect(seatInfo(p).trimPixels).toBe(0);
    setSeatTrim(p, -2);
    await ticks(1);
    expect(JSON.parse(String(p.dynamic["pet:seat_height_trims"]))).toMatchObject({ strider: 3, horse: -2 });
    resetSeatTrim(p);
    await ticks(1);
    expect(seatInfo(p).trimPixels).toBe(0);
    expect(JSON.parse(String(p.dynamic["pet:seat_height_trims"]))).toMatchObject({ strider: 3 });
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
