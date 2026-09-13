import { beforeEach, describe, expect, it } from "vitest";
import { appearanceFor, restoreAppearance, transitionForm } from "../../../src/features/pets/appearance.js";
import { captureInventory, compareInventory } from "../../../src/features/pets/core.js";
import { EquipmentSlot, reset, ticks } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { type PetPlayer, petPlayer, testItem } from "./helpers.ts";

const forms = ["player", "carter", "mochi", "casper"] as const;
const wire = { player: 0, carter: 1, mochi: 2, casper: 3 };

function check(p: PetPlayer, form: keyof typeof wire, height = 2) {
  const pet = form !== "player";
  expect(p.props["pet:model_id"]).toBe(wire[form]);
  expect(p.props["pet:view"]).toBe(pet ? "paws" : "native");
  for (const key of ["armor_fit", "gear_fit", "motion"]) expect(p.props[`pet:${key}`], key).toBe(pet);
  expect(p.props["pet:hand_height"]).toBe(pet ? height : 0);
}

beforeEach(() => {
  reset();
  ui.reset();
});

describe("every form pair", () => {
  for (const from of forms) {
    for (const to of forms) {
      it(`${from} -> ${to}: complete appearance with equipped items unchanged`, async () => {
        const p = petPlayer(`${from}-${to}`);
        p.equipment[EquipmentSlot.Head] = testItem("minecraft:diamond_helmet");
        p.equipment[EquipmentSlot.Chest] = testItem("minecraft:diamond_chestplate");
        p.equipment[EquipmentSlot.Offhand] = testItem("minecraft:shield");
        p.dynamic["other:keep"] = "keep";
        p.dynamic["pet:hand_height_preference"] = 2;
        const slots = { head: "Head", chest: "Chest", off: "Offhand" };
        const before = captureInventory(p, slots);
        transitionForm(p, from);
        await ticks(2);
        check(p, from);
        // Simulate a native-gear diagnostic override: selecting ANY form must reset it.
        p.dynamic["pet:fitted_armor_preference"] = false;
        p.dynamic["pet:fitted_gear_preference"] = false;
        p.dynamic["pet:first_person_view"] = "native";
        p.dynamic["pet:motion_enabled"] = false;
        const plan = transitionForm(p, to);
        await ticks(2);
        check(p, to);
        expect(p.dynamic["pet:fitted_armor_preference"]).toBeUndefined();
        expect(p.dynamic["pet:fitted_gear_preference"]).toBeUndefined();
        expect(p.dynamic["pet:hand_height_preference"]).toBe(2);
        expect(p.dynamic["other:keep"]).toBe("keep");
        expect(compareInventory(before, captureInventory(p, slots))).toEqual([]);
        expect(p.inventoryWrites).toBeUndefined();
        expect(plan.form).toBe(to === "player" ? "human" : to);
      });
    }
  }
});

describe("transitions", () => {
  it("A pet-specific height is restored after native Player uses zero offset", async () => {
    const p = petPlayer("p");
    p.dynamic["pet:hand_height_preference"] = 4;
    transitionForm(p, "casper");
    await ticks(2);
    check(p, "casper", 4);
    transitionForm(p, "player");
    await ticks(2);
    check(p, "player");
    transitionForm(p, "mochi");
    await ticks(2);
    check(p, "mochi", 4);
  });

  it("Rapid pet/player/pet selections compute from requested target, not deferred model reads", async () => {
    const p = petPlayer("p");
    transitionForm(p, "casper");
    transitionForm(p, "player");
    transitionForm(p, "carter");
    await ticks(2);
    check(p, "carter");
  });

  it("Rapid final Player selection clears all pet presentation", async () => {
    const p = petPlayer("p");
    transitionForm(p, "casper");
    transitionForm(p, "player");
    await ticks(2);
    check(p, "player");
  });

  it("Preflight catches missing dependent state before writing any field", () => {
    const p = petPlayer("p");
    delete p.props["pet:armor_fit"];
    expect(() => transitionForm(p, "casper")).toThrow(/armor_fit is missing/);
    expect(p.writes).toHaveLength(0);
    expect(p.dynamic).toEqual({});
  });

  it("Persistence failure restores every previous presentation field", async () => {
    const p = petPlayer("p");
    transitionForm(p, "carter");
    await ticks(2);
    const before = { ...p.props };
    p.failPersistence = true;
    expect(() => transitionForm(p, "casper")).toThrow(/persistence/);
    await ticks(2);
    expect(p.props).toEqual(before);
    expect(p.dynamic["pet:preferred_form"]).toBe("carter");
  });

  it("Failed second same-tick switch does not undo a successfully queued first switch", async () => {
    const p = petPlayer("p");
    transitionForm(p, "carter");
    p.failPersistence = true;
    expect(() => transitionForm(p, "casper")).toThrow();
    await ticks(2);
    check(p, "carter");
  });

  it("Partial preference write failure rolls back cleared overrides", async () => {
    const p = petPlayer("p");
    p.dynamic = {
      "pet:preferred_form": "carter",
      "pet:first_person_view": "native",
      "pet:fitted_armor_preference": false,
    };
    const beforeProps = { ...p.props };
    const beforePrefs = { ...p.dynamic };
    const setter = p.setDynamicProperty.bind(p);
    let count = 0;
    p.setDynamicProperty = (key, value) => {
      if (++count === 3) throw new Error("partial failure");
      setter(key, value);
    };
    expect(() => transitionForm(p, "casper")).toThrow(/partial/);
    await ticks(2);
    expect(p.props).toEqual(beforeProps);
    expect(p.dynamic).toEqual(beforePrefs);
  });

  it("A transition resets stale visual glint without modifying item enchantments", async () => {
    const p = petPlayer("p");
    p.props["pet:tool_enchanted"] = true;
    p.props["pet:tool_enchanted_for"] = 5;
    const item = p.items[0];
    transitionForm(p, "player");
    await ticks(2);
    expect(p.props["pet:tool_enchanted"]).toBe(false);
    expect(p.items[0]).toBe(item);
  });

  it("Invalid forms are rejected without writes or item access", () => {
    const p = petPlayer("p");
    expect(() => transitionForm(p, "not_a_pet")).toThrow();
    expect(p.writes).toHaveLength(0);
  });

  it("Appearance planning itself is read-only", () => {
    const p = petPlayer("p");
    const target = appearanceFor(p, "casper", true);
    expect(target["pet:armor_fit"]).toBe(true);
    expect(p.writes).toHaveLength(0);
    expect(p.dynamic).toEqual({});
  });
});

describe("lifecycle restore", () => {
  it("Lifecycle restore keeps intentional in-session display overrides for pets", async () => {
    const p = petPlayer("p");
    p.dynamic = {
      "pet:preferred_form": "casper",
      "pet:first_person_view": "native",
      "pet:fitted_armor_preference": false,
      "pet:hand_height_preference": 6,
    };
    restoreAppearance(p);
    await ticks(2);
    expect(p.props["pet:model_id"]).toBe(3);
    expect(p.props["pet:armor_fit"]).toBe(false);
    expect(p.props["pet:view"]).toBe("native");
    expect(p.props["pet:hand_height"]).toBe(6);
  });

  it("Lifecycle restore of Player cannot inherit a pet armor or paw flag", async () => {
    const p = petPlayer("p");
    p.dynamic = {
      "pet:preferred_form": "human",
      "pet:first_person_view": "paws",
      "pet:fitted_armor_preference": true,
      "pet:fitted_gear_preference": true,
    };
    restoreAppearance(p);
    await ticks(2);
    check(p, "player");
  });

  for (const saved of [undefined, "human", "player"]) {
    it(`Legacy Player alias and absent preference restore native state (${saved ?? "absent"})`, async () => {
      const p = petPlayer("p");
      if (saved) p.dynamic["pet:preferred_form"] = saved;
      restoreAppearance(p);
      await ticks(2);
      check(p, "player");
    });
  }
});
