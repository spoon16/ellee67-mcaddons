import { beforeEach, describe, expect, it } from "vitest";
import { HANDHELD_INDEX } from "../../../src/features/pets/catalog.generated.ts";
import {
  applyGear,
  preferredArmor,
  preferredGear,
  resetArmor,
  resetGear,
  restoreSettings,
} from "../../../src/features/pets/settings.ts";
import { refreshToolGlint, toolGlintState } from "../../../src/features/pets/tool_effects.ts";
import { reset, ticks } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { petPlayer, testItem } from "./helpers.ts";

beforeEach(() => {
  reset();
  ui.reset();
});

describe("armor and gear preferences", () => {
  it("Absent armor preference uses fitted, without persisting a forced choice", async () => {
    const p = petPlayer("p");
    expect(preferredArmor(p)).toBe(true);
    restoreSettings(p);
    await ticks(2);
    expect(p.props["pet:armor_fit"]).toBe(true);
    expect(p.dynamic["pet:fitted_armor_preference"]).toBeUndefined();
  });

  it("Explicit old native armor preference survives upgrade and restoration", async () => {
    const p = petPlayer("p");
    p.dynamic["pet:fitted_armor_preference"] = false;
    restoreSettings(p);
    await ticks(2);
    expect(preferredArmor(p)).toBe(false);
    expect(p.props["pet:armor_fit"]).toBe(false);
  });

  it("Armor auto clears only armor override", async () => {
    const p = petPlayer("p");
    p.dynamic["pet:fitted_armor_preference"] = false;
    p.dynamic["pet:hand_height_preference"] = 2;
    p.dynamic["other:keep"] = 7;
    resetArmor(p);
    await ticks(2);
    expect(p.props["pet:armor_fit"]).toBe(true);
    expect(p.dynamic["pet:fitted_armor_preference"]).toBeUndefined();
    expect(p.dynamic["pet:hand_height_preference"]).toBe(2);
    expect(p.dynamic["other:keep"]).toBe(7);
  });

  it("Gear default is fitted, with an explicit native rollback", async () => {
    const p = petPlayer("p");
    expect(preferredGear(p)).toBe(true);
    applyGear(p, false);
    await ticks(2);
    expect(preferredGear(p)).toBe(false);
    resetGear(p);
    await ticks(2);
    expect(preferredGear(p)).toBe(true);
  });

  it("Gear toggle leaves hand height and real equipment untouched", async () => {
    const p = petPlayer("p");
    const item = p.items[0];
    p.dynamic["pet:hand_height_preference"] = 2;
    applyGear(p, false);
    await ticks(2);
    expect(p.items[0]).toBe(item);
    expect(p.dynamic["pet:hand_height_preference"]).toBe(2);
  });

  it("Armor persistence failure rolls back pending presentation", async () => {
    const p = petPlayer("p");
    p.props["pet:armor_fit"] = false;
    p.dynamic["pet:fitted_armor_preference"] = false;
    p.failPersistence = true;
    expect(() => resetArmor(p)).toThrow();
    await ticks(2);
    expect(p.props["pet:armor_fit"]).toBe(false);
    expect(p.dynamic["pet:fitted_armor_preference"]).toBe(false);
  });
});

describe("tool glint", () => {
  it("Glint catalog contains 35 native and 6 Rbow tools/weapons", () => {
    const index: Readonly<Record<string, number>> = HANDHELD_INDEX;
    expect(Object.keys(index)).toHaveLength(41);
    expect(index["minecraft:bow"]).toBeUndefined();
    expect(index["minecraft:shield"]).toBeUndefined();
  });

  it("Glint sampling only observes real item components", () => {
    const item = testItem();
    const before = JSON.stringify(item);
    expect(toolGlintState(item).enchanted).toBe(true);
    expect(JSON.stringify(item)).toBe(before);
  });

  it("Glint synchronization ignores Human form", () => {
    const p = petPlayer("p");
    expect(refreshToolGlint(p)).toBe(false);
    expect(p.writes).toHaveLength(0);
  });

  it("Glint synchronization is per-subject and write-on-change", async () => {
    const a = petPlayer("a");
    const b = petPlayer("b");
    a.props["pet:model_id"] = 1;
    b.props["pet:model_id"] = 2;
    b.items[0] = undefined;
    refreshToolGlint(a);
    refreshToolGlint(b);
    await ticks(2);
    expect(a.props["pet:tool_enchanted"]).toBe(true);
    expect(b.props["pet:tool_enchanted"]).toBe(false);
    const n = a.writes.length;
    refreshToolGlint(a);
    expect(a.writes).toHaveLength(n);
  });

  it("Glint clears when switching to an empty hand", async () => {
    const p = petPlayer("p");
    p.props["pet:model_id"] = 1;
    refreshToolGlint(p);
    await ticks(2);
    p.items[0] = undefined;
    refreshToolGlint(p);
    await ticks(2);
    expect(p.props["pet:tool_enchanted"]).toBe(false);
    expect(p.props["pet:tool_enchanted_for"]).toBe(0);
  });

  it("A sword visual flag cannot masquerade as a pickaxe flag", () => {
    expect(HANDHELD_INDEX["minecraft:diamond_sword"]).not.toBe(HANDHELD_INDEX["minecraft:diamond_pickaxe"]);
  });
});
