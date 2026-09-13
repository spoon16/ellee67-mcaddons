import { describe, expect, it } from "vitest";
import {
  BLOCKS,
  canHarvest,
  durabilityLoss,
  fortuneCount,
  GEAR,
  ITEMS,
  miningDrop,
  NS,
  toolAction,
} from "../../../src/features/rbow-ore/rules.js";

function item(typeId: string, levels: Record<string, number> = {}, tags: string[] = []) {
  return {
    typeId,
    hasTag: (tag: string) => tags.includes(tag),
    getComponent: (name: string) =>
      name === "minecraft:enchantable"
        ? { getEnchantment: (enchant: string) => (levels[enchant] ? { level: levels[enchant] } : undefined) }
        : undefined,
  };
}
const pick = item(`${NS}rbow_pickaxe`);

describe("rbow-ore rules", () => {
  it("runtime allowlists contain exactly the registered material set", () => {
    expect(ITEMS.size).toBe(16);
    expect(BLOCKS.size).toBe(3);
    expect(GEAR.size).toBe(10);
    expect([...ITEMS].every((id) => id.startsWith(NS) && !id.includes("rboe") && !id.includes("rainbow"))).toBe(true);
  });

  for (const type of ["iron", "diamond", "netherite"]) {
    it(`${type} pickaxe can harvest`, () => expect(canHarvest(item(`minecraft:${type}_pickaxe`))).toBe(true));
  }
  for (const type of ["wooden", "stone", "golden", "copper"]) {
    it(`${type} pickaxe cannot harvest`, () => expect(canHarvest(item(`minecraft:${type}_pickaxe`))).toBe(false));
  }

  it("Rbow pickaxe and properly tier-tagged third-party pickaxes harvest", () => {
    expect(canHarvest(pick)).toBe(true);
    expect(canHarvest(item("other:pick", {}, ["minecraft:is_pickaxe", "minecraft:iron_tier"]))).toBe(true);
    expect(canHarvest(item("other:pick", {}, ["minecraft:is_pickaxe"]))).toBe(false);
    expect(canHarvest(item("other:sword", {}, ["minecraft:netherite_tier"]))).toBe(false);
    expect(canHarvest(undefined)).toBe(false);
  });

  for (const ore of ["rbow_ore", "deepslate_rbow_ore"]) {
    it(`${ore} ordinary drop is one raw ore`, () => {
      expect(miningDrop(NS + ore, pick, "Survival", true, () => 0.2)).toEqual({
        typeId: `${NS}raw_rbow_ore`,
        amount: 1,
      });
    });
    it(`${ore} Silk Touch takes precedence over Fortune`, () => {
      const silk = item(pick.typeId, { silk_touch: 1, fortune: 3 });
      expect(miningDrop(NS + ore, silk, "Survival", true, () => 0.99)).toEqual({ typeId: NS + ore, amount: 1 });
    });
    it(`${ore} Fortune III can give four raw`, () => {
      expect(miningDrop(NS + ore, item(pick.typeId, { fortune: 3 }), "Survival", true, () => 0.99)?.amount).toBe(4);
    });
  }

  it("storage block drops itself rather than multiplied ingots", () => {
    expect(miningDrop(`${NS}rbow_block`, item(pick.typeId, { fortune: 3 }), "Survival")).toEqual({
      typeId: `${NS}rbow_block`,
      amount: 1,
    });
  });

  it("Creative, Spectator, wrong tool, unrelated block and disabled drops produce nothing", () => {
    for (const mode of ["Creative", "Spectator", "creative"])
      expect(miningDrop(`${NS}rbow_ore`, pick, mode)).toBeUndefined();
    expect(miningDrop(`${NS}rbow_ore`, pick, "Survival", false)).toBeUndefined();
    expect(miningDrop(`${NS}rbow_ore`, item("minecraft:wooden_pickaxe"), "Survival")).toBeUndefined();
    expect(miningDrop("minecraft:diamond_ore", pick, "Survival")).toBeUndefined();
  });

  it("survival casing and authorized Adventure block breaks preserve drops", () => {
    for (const mode of ["survival", "Survival", "Adventure", "adventure"]) {
      expect(miningDrop(`${NS}rbow_ore`, pick, mode)?.amount).toBe(1);
    }
  });

  it("Fortune zero always one; Fortune three has expected 2:1:1:1 bucket weights", () => {
    for (let i = 0; i < 100; i++) expect(fortuneCount(0, () => i / 100)).toBe(1);
    expect([0.1, 0.3, 0.5, 0.7, 0.9].map((x) => fortuneCount(3, () => x))).toEqual([1, 1, 2, 3, 4]);
  });

  it("Fortune and tool-wear random boundaries are clamped", () => {
    expect(fortuneCount(3, () => 1)).toBe(4);
    expect(fortuneCount(-10, () => 0.9)).toBe(1);
    expect(fortuneCount(999, () => 1)).toBe(256);
    expect(durabilityLoss(2, 0, () => 0.99)).toBe(2);
    expect(durabilityLoss(2, 3, () => 0.9)).toBe(0);
    expect(durabilityLoss(2, 3, () => 0.1)).toBe(2);
  });

  for (const block of ["dirt", "grass_block", "grass_path"]) {
    it(`hoe tills ${block}`, () => {
      expect(toolAction(`${NS}rbow_hoe`, `minecraft:${block}`, true, "Up")?.block).toBe("minecraft:farmland");
    });
  }

  it("hoe converts coarse and rooted dirt in stages", () => {
    expect(toolAction(`${NS}rbow_hoe`, "minecraft:coarse_dirt", true, "Up")?.block).toBe("minecraft:dirt");
    expect(toolAction(`${NS}rbow_hoe`, "minecraft:dirt_with_roots", true, "Up")?.extra).toBe("minecraft:hanging_roots");
  });

  it("soil actions require clear space above and no underside click", () => {
    for (const kind of ["hoe", "shovel"]) {
      expect(toolAction(`${NS}rbow_${kind}`, "minecraft:dirt", false, "Up")).toBeUndefined();
      expect(toolAction(`${NS}rbow_${kind}`, "minecraft:dirt", true, "down")).toBeUndefined();
    }
  });

  it("shovel paths soil and extinguishes both campfire types", () => {
    expect(toolAction(`${NS}rbow_shovel`, "minecraft:podzol", true, "Up")?.block).toBe("minecraft:grass_path");
    for (const fire of ["campfire", "soul_campfire"]) {
      expect(toolAction(`${NS}rbow_shovel`, `minecraft:${fire}`, false, "Down")).toEqual({
        state: "extinguished",
        value: true,
        sound: "random.fizz",
      });
    }
  });

  it("axe preserves state semantics while stripping recognized log families", () => {
    for (const type of ["oak_log", "spruce_wood", "crimson_stem", "warped_hyphae", "bamboo_block", "pale_oak_log"]) {
      const action = toolAction(`${NS}rbow_axe`, `minecraft:${type}`, false, "North");
      expect(action?.block).toBe(`minecraft:stripped_${type}`);
      expect(action?.keepStates).toBe(true);
    }
  });

  it("tool actions never rewrite already stripped blocks or another add-on's blocks", () => {
    for (const type of ["minecraft:stripped_oak_log", "minecraft:stone", "other:oak_log"]) {
      expect(toolAction(`${NS}rbow_axe`, type, true, "Up")).toBeUndefined();
    }
    expect(toolAction("minecraft:diamond_hoe", "minecraft:dirt", true, "Up")).toBeUndefined();
  });
});
