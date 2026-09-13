import { beforeEach, describe, expect, it } from "vitest";
import { SIDE_CARRY_INDEX } from "../../../src/features/pets/catalog.generated.js";
import { carryState, classifyHand, gearRoute, refreshToolGlint } from "../../../src/features/pets/tool_effects.js";
import { EquipmentSlot, engine, reset, ticks } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { petPlayer, testItem } from "./helpers.ts";

/** A bare item stack with no components, as an unenchanted vanilla item reads to the scripts. */
const empty = (typeId: string) => engine({ typeId, getComponent: () => undefined });

beforeEach(() => {
  reset();
  ui.reset();
});

describe("hand classification", () => {
  it("Every mapped ordinary item classifies as side-carried without changing it", () => {
    for (const id of Object.keys(SIDE_CARRY_INDEX)) {
      const item = empty(id);
      expect(classifyHand(item)).toBe("side");
      expect(classifyHand(item, "off")).toBe("side");
      expect(item.typeId).toBe(id);
    }
  });

  it("Tools, shield, empty slot, and unmapped renderers are distinct", () => {
    expect(classifyHand(undefined)).toBe("empty");
    expect(classifyHand(empty("minecraft:diamond_pickaxe"))).toBe("mouth");
    expect(classifyHand(empty("minecraft:shield"))).toBe("shield");
    expect(classifyHand(empty("minecraft:filled_map"))).toBe("native-unmapped");
    expect(classifyHand(empty("mod:pickaxe"))).toBe("native-unmapped");
  });

  it("Glint on side-carry icons is read from the real item", () => {
    const book = testItem("minecraft:book");
    expect(carryState(book).enchanted).toBe(true);
    expect(carryState(empty("minecraft:book")).enchanted).toBe(false);
    expect(carryState(empty("minecraft:enchanted_book")).enchanted).toBe(true);
  });

  it("Shield glint does not depend on the mainhand tool", () => {
    expect(carryState(testItem("minecraft:shield")).shieldEnchanted).toBe(true);
    expect(carryState(empty("minecraft:shield")).shieldEnchanted).toBe(false);
  });
});

describe("gear routing", () => {
  it("Pair-level diagnostic explains the unsupported-hand fallback", () => {
    const p = petPlayer("p");
    p.props["pet:model_id"] = 1;
    p.equipment[EquipmentSlot.Offhand] = empty("minecraft:filled_map");
    const route = gearRoute(p);
    expect(route.main).toBe("mouth");
    expect(route.off).toBe("native-unmapped");
    expect(route.thirdPersonReplacement).toBe(false);
  });

  it("Known boat plus shield enables expected replacement routing", () => {
    const p = petPlayer("p");
    p.props["pet:model_id"] = 2;
    // A transformed player has fitted gear on; the player.json default (off) only applies before any transition.
    p.props["pet:gear_fit"] = true;
    p.items[0] = empty("minecraft:oak_boat");
    p.equipment[EquipmentSlot.Offhand] = empty("minecraft:shield");
    expect([gearRoute(p).main, gearRoute(p).off, gearRoute(p).thirdPersonReplacement]).toEqual([
      "side",
      "shield",
      true,
    ]);
  });

  it("Native gear override and Human form do not expect replacements", () => {
    const p = petPlayer("p");
    expect(gearRoute(p).thirdPersonReplacement).toBe(false);
    p.props["pet:model_id"] = 1;
    p.props["pet:gear_fit"] = false;
    expect(gearRoute(p).thirdPersonReplacement).toBe(false);
  });
});

describe("visual metadata sync", () => {
  it("Visual metadata sync preserves item identity and all inventory fields", async () => {
    const p = petPlayer("p");
    p.props["pet:model_id"] = 1;
    const main = testItem("minecraft:book");
    const off = testItem("minecraft:shield");
    p.items[0] = main;
    p.equipment[EquipmentSlot.Offhand] = off;
    const before = JSON.stringify([p.items, p.equipment]);
    refreshToolGlint(p);
    await ticks(1);
    expect(JSON.stringify([p.items, p.equipment])).toBe(before);
    expect(p.items[0]).toBe(main);
    expect(p.equipment[EquipmentSlot.Offhand]).toBe(off);
    expect(p.props["pet:carry_main_enchanted"]).toBe(true);
    expect(p.props["pet:off_shield_enchanted"]).toBe(true);
  });

  it("Repeated metadata sync emits no new unchanged-property writes", async () => {
    const p = petPlayer("p");
    p.props["pet:model_id"] = 1;
    refreshToolGlint(p);
    await ticks(1);
    const count = p.writes.length;
    refreshToolGlint(p);
    expect(p.writes).toHaveLength(count);
  });

  it("Changing to empty hands clears their glint state", async () => {
    const p = petPlayer("p");
    p.props["pet:model_id"] = 2;
    p.equipment[EquipmentSlot.Offhand] = testItem("minecraft:shield");
    refreshToolGlint(p);
    await ticks(1);
    p.items[0] = undefined;
    p.equipment[EquipmentSlot.Offhand] = undefined;
    refreshToolGlint(p);
    await ticks(1);
    expect(p.props["pet:tool_enchanted"]).toBe(false);
    expect(p.props["pet:off_shield_enchanted"]).toBe(false);
    expect(p.props["pet:carry_main_enchanted_for"]).toBe(0);
  });
});
