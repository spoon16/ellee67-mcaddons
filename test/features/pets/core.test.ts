import { beforeEach, describe, expect, it } from "vitest";
import { MODEL_BY_ID, MODEL_BY_WIRE, PETS } from "../../../src/features/pets/catalog.generated.ts";
import {
  applyForm,
  captureInventory,
  compareInventory,
  createSessionGuard,
  FORMS,
  formFromWire,
  itemSummary,
  needsPreferenceMigration,
  preferredForm,
  validateForm,
  wireId,
} from "../../../src/features/pets/core.ts";
import {
  applyArmor,
  applyHandHeight,
  applyMotion,
  applyView,
  preferredArmor,
  preferredHandHeight,
  resetHandHeight,
  restoreSettings,
} from "../../../src/features/pets/settings.ts";
import { reset, ticks } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { petPlayer, testItem } from "./helpers.ts";

beforeEach(() => {
  reset();
  ui.reset();
});

describe("catalog forms", () => {
  for (const p of PETS) {
    it(`${p.id}: catalog drives public choice and permanent wire ID`, () => {
      expect(FORMS.includes(p.id)).toBe(true);
      expect(validateForm(p.id)).toBe(p.id);
      expect(wireId(p.id)).toBe(p.wire_id);
      expect(formFromWire(p.wire_id)).toBe(p.id);
      expect(MODEL_BY_ID[p.id]).toBe(MODEL_BY_WIRE[p.wire_id]);
    });
    it(`${p.id}: deferred sync preserves a string preference`, async () => {
      const a = petPlayer("a");
      applyForm(a, p.id);
      expect(a.props["pet:model_id"]).toBe(0);
      expect(a.dynamic["pet:preferred_form"]).toBe(p.id);
      await ticks();
      expect(a.props["pet:model_id"]).toBe(p.wire_id);
    });
    it(`${p.id}: inventory survives form and equipment-presentation changes`, async () => {
      const a = petPlayer("a");
      const before = captureInventory(a, { head: "Head" });
      applyForm(a, p.id);
      applyArmor(a, true);
      applyView(a, "paws");
      await ticks();
      expect(compareInventory(before, captureInventory(a, { head: "Head" }))).toEqual([]);
    });
    it(`${p.id}: absent hand preference is 2`, () => {
      const a = petPlayer("a");
      a.dynamic["pet:preferred_form"] = p.id;
      expect(preferredHandHeight(a)).toBe(2);
    });
  }

  it("Human is zero, unknown wire IDs safely resolve Human", () => {
    expect(wireId("human")).toBe(0);
    for (const x of [null, undefined, -1, 9999]) expect(formFromWire(x)).toBe("human");
  });

  it("Unknown commands cannot create a phantom pet", () => {
    for (const x of [null, 0, "", "wolf", "Carter", "human;kill"]) expect(() => validateForm(x)).toThrow();
  });

  it("Two players retain independent choices", async () => {
    const a = petPlayer("a");
    const b = petPlayer("b");
    applyForm(a, "carter");
    applyForm(b, "mochi");
    await ticks();
    expect(a.props["pet:model_id"]).toBe(1);
    expect(b.props["pet:model_id"]).toBe(2);
    expect(preferredForm(a)).toBe("carter");
    expect(preferredForm(b)).toBe("mochi");
  });
});

describe("form persistence", () => {
  it("Missing model property fails before persistence", () => {
    const a = petPlayer("a");
    delete a.props["pet:model_id"];
    expect(() => applyForm(a, "carter")).toThrow(/missing/);
    expect(a.dynamic["pet:preferred_form"]).toBeUndefined();
  });

  it("Persistence failure rolls back presentation", async () => {
    const a = petPlayer("a");
    a.failPersistence = true;
    expect(() => applyForm(a, "mochi")).toThrow(/persistence/);
    await ticks();
    expect(a.props["pet:model_id"]).toBe(0);
  });

  it("Read-only restore does not rewrite stored preference", async () => {
    const a = petPlayer("a");
    a.failPersistence = true;
    applyForm(a, "mochi", false);
    await ticks();
    expect(a.props["pet:model_id"]).toBe(2);
  });

  it("Legacy Cavalier migrates to Carter without read-side writes", () => {
    const a = petPlayer("a");
    a.dynamic["cav:preferred_form"] = "cavalier";
    expect(preferredForm(a)).toBe("carter");
    expect(needsPreferenceMigration(a)).toBe(true);
    expect(a.writes).toHaveLength(0);
  });

  it("Explicit Human defeats an old Cavalier preference", () => {
    const a = petPlayer("a");
    a.dynamic["cav:preferred_form"] = "cavalier";
    a.dynamic["pet:preferred_form"] = "human";
    expect(preferredForm(a)).toBe("human");
    expect(needsPreferenceMigration(a)).toBe(false);
  });

  it("Unavailable pet safely falls back without erasing its saved name", () => {
    const a = petPlayer("a");
    a.dynamic["pet:preferred_form"] = "retired_pet";
    expect(preferredForm(a)).toBe("human");
    expect(a.dynamic["pet:preferred_form"]).toBe("retired_pet");
  });

  it("Invalid new preference does not resurrect a legacy pet", () => {
    const a = petPlayer("a");
    a.dynamic["cav:preferred_form"] = "cavalier";
    a.dynamic["pet:preferred_form"] = 42;
    expect(preferredForm(a)).toBe("human");
  });
});

describe("hand height calibration", () => {
  for (const value of [-8, 0, 2, 4, 12]) {
    it(`Saved hand calibration ${value} is preserved`, async () => {
      const a = petPlayer("a");
      a.dynamic["pet:hand_height_preference"] = value;
      restoreSettings(a);
      await ticks();
      expect(a.props["pet:hand_height"]).toBe(value);
      expect(preferredHandHeight(a)).toBe(value);
    });
  }

  it("Invalid hand values fall back to 2, not 0", () => {
    const a = petPlayer("a");
    for (const value of [null, 1.2, 99, -9, "2", Number.NaN]) {
      a.dynamic["pet:hand_height_preference"] = value;
      expect(preferredHandHeight(a)).toBe(2);
      expect(() => applyHandHeight(a, value)).toThrow();
    }
  });

  it("Hand reset clears only that override and restores 2", async () => {
    const a = petPlayer("a");
    a.dynamic["pet:hand_height_preference"] = 7;
    a.dynamic["other:keep"] = true;
    resetHandHeight(a);
    await ticks();
    expect(a.props["pet:hand_height"]).toBe(2);
    expect(a.dynamic["pet:hand_height_preference"]).toBeUndefined();
    expect(a.dynamic["other:keep"]).toBe(true);
  });

  it("Hand reset failure preserves previous calibration", async () => {
    const a = petPlayer("a");
    a.props["pet:hand_height"] = 7;
    a.dynamic["pet:hand_height_preference"] = 7;
    a.failPersistence = true;
    expect(() => resetHandHeight(a)).toThrow();
    await ticks();
    expect(a.props["pet:hand_height"]).toBe(7);
    expect(a.dynamic["pet:hand_height_preference"]).toBe(7);
  });
});

describe("presentation setters and diagnostics", () => {
  it("Fitted armor is the default", () => {
    const a = petPlayer("a");
    expect(preferredArmor(a)).toBe(true);
    a.dynamic["pet:fitted_armor_preference"] = true;
    expect(preferredArmor(a)).toBe(true);
  });

  it("Presentation setters reject disconnected players", () => {
    const a = petPlayer("a");
    a.isValid = false;
    for (const fn of [
      () => applyForm(a, "mochi"),
      () => applyArmor(a, true),
      () => applyView(a, "paws"),
      () => applyMotion(a, true),
      () => applyHandHeight(a, 2),
    ]) {
      expect(fn).toThrow();
    }
  });

  it("Snapshot observes durability, enchantments and lore without mutation", () => {
    const item = testItem();
    const before = JSON.stringify(item);
    const summary = itemSummary(item);
    expect(summary?.damage).toBe(17);
    expect(summary?.enchantments).toEqual([["minecraft:unbreaking", 3]]);
    expect(JSON.stringify(item)).toBe(before);
  });

  it("Inventory comparison identifies changed item fields", () => {
    const a = petPlayer("a");
    const before = captureInventory(a, {});
    const durability = a.items[0]?.getComponent("minecraft:durability");
    durability.damage++;
    expect(compareInventory(before, captureInventory(a, {}))).toEqual(["inventory:0"]);
  });

  it("Session generations never reuse stale reconnect tokens", () => {
    const g = createSessionGuard();
    const old = g.next("a");
    g.remove("a");
    const fresh = g.next("a");
    expect(fresh).not.toBe(old);
    expect(g.current("a", old)).toBe(false);
  });
});
