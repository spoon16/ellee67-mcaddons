import { beforeEach, describe, expect, it } from "vitest";
import { transitionForm } from "../../../src/features/pets/appearance.js";
import { RBOW_COUNT, RBOW_GEAR, rbowReport } from "../../../src/features/pets/rbow_compat.js";
import { classifyHand, toolGlintState } from "../../../src/features/pets/tool_effects.js";
import { EquipmentSlot, registry, reset, ticks } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { command, petPlayer, start, testItem } from "./helpers.ts";

beforeEach(() => {
  reset();
  ui.reset();
  start();
});

describe("Rbow items", () => {
  for (const name of ["sword", "pickaxe", "axe", "shovel", "hoe", "spear"]) {
    it(`Rbow ${name}: mouth route uses original stack`, () => {
      const item = testItem(`elleedog:rbow_${name}`);
      expect(classifyHand(item)).toBe("mouth");
      expect(toolGlintState(item).index).toBeGreaterThan(35);
      expect(item.typeId).toBe(`elleedog:rbow_${name}`);
    });
  }

  for (const form of ["carter", "mochi", "casper"]) {
    it(`${form}: Rbow equipment unchanged through Player/pet/Player switching`, async () => {
      const p = petPlayer(`rbow-${form}`);
      p.props[RBOW_COUNT] = 4;
      p.items[0] = testItem("elleedog:rbow_pickaxe");
      p.items[1] = testItem("elleedog:rbow_spear");
      p.equipment = {
        [EquipmentSlot.Head]: testItem("elleedog:rbow_helmet"),
        [EquipmentSlot.Chest]: testItem("elleedog:rbow_chestplate"),
        [EquipmentSlot.Legs]: testItem("elleedog:rbow_leggings"),
        [EquipmentSlot.Feet]: testItem("elleedog:rbow_boots"),
      };
      const stacks = [...p.items];
      const equipped = { ...p.equipment };
      transitionForm(p, form);
      await ticks(2);
      expect(p.props["pet:armor_fit"]).toBe(true);
      transitionForm(p, "player");
      await ticks(2);
      expect(p.props["pet:armor_fit"]).toBe(false);
      expect(p.props["pet:gear_fit"]).toBe(false);
      expect(p.props[RBOW_COUNT]).toBe(4);
      expect(p.items).toEqual(stacks);
      expect(p.equipment).toEqual(equipped);
      for (let i = 0; i < stacks.length; i++) expect(p.items[i]).toBe(stacks[i]);
    });
  }

  it("Mixed player forms do not share Rbow flags", async () => {
    const a = petPlayer("a");
    const b = petPlayer("b");
    a.props[RBOW_COUNT] = 2;
    b.props[RBOW_COUNT] = 4;
    transitionForm(a, "carter");
    transitionForm(b, "player");
    await ticks(2);
    expect(a.props["pet:armor_fit"]).toBe(true);
    expect(b.props["pet:armor_fit"]).toBe(false);
    expect(a.props[RBOW_COUNT]).toBe(2);
    expect(b.props[RBOW_COUNT]).toBe(4);
  });
});

describe("integration report", () => {
  it("Integration command is self-only, explicit and read-only", async () => {
    const p = petPlayer("p");
    p.props[RBOW_COUNT] = 0;
    const writes = p.writes.length;
    command("rbowcheck", p);
    await ticks(3);
    expect(p.writes).toHaveLength(writes);
    expect(p.chat.some((m) => m.includes("rbowGameplayBase"))).toBe(true);
    expect(registry.commands.get("pet:rbowcheck")?.definition.cheatsRequired).toBe(false);
  });

  it("Missing Rbow player component is explicit even when Pets is ready", () => {
    const p = petPlayer("p");
    // The player override declares the count; a world without the Rbow property is the case under test.
    delete p.props[RBOW_COUNT];
    const r = rbowReport(p);
    expect(r.status).toBe("INCOMPLETE");
    expect(r.rbowArmorCount.status).toBe("missing");
    expect(r.rbowArmorCount.value).toBeNull();
  });

  it("Integration report accepts valid count zero", () => {
    const p = petPlayer("p");
    p.props[RBOW_COUNT] = 0;
    const r = rbowReport(p);
    expect(r.status).toBe("READY");
    expect(r.rbowArmorCount.value).toBe(0);
    expect(RBOW_GEAR).toHaveLength(10);
  });

  it("Invalid armor count cannot produce READY", () => {
    const p = petPlayer("p");
    for (const bad of [-1, 5, "0", false]) {
      p.props[RBOW_COUNT] = bad;
      expect(rbowReport(p).status).toBe("INCOMPLETE");
    }
  });
});
