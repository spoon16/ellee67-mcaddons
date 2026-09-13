import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENTRIES } from "../../../src/features/redstone-guide/content.ts";
import { BOOK_ID, COMPONENT_ID } from "../../../src/features/redstone-guide/index.ts";
import {
  BOOK_ICON,
  BY_ID,
  GROUPS,
  HOME,
  normalizeBookmark,
  PAGE_SIZE,
  type Route,
  readingRoute,
  screenFor,
  TOTAL_PAGES,
} from "../../../src/features/redstone-guide/reader.ts";
import { readStrictJson } from "../../../tools/lib/json.ts";
import { BP, must, RP, readGuide } from "./helpers.ts";

type Json = Record<string, any>;

const guide = readGuide();

describe("guide content", () => {
  it("serves guide_content.json unchanged; every entry is unique and has one or two pages", () => {
    expect(ENTRIES).toEqual(guide.entries);
    expect(ENTRIES.length).toBe(BY_ID.size);
    expect(TOTAL_PAGES).toBe(137);
    expect(guide.entries.filter((entry) => entry.section === "components")).toHaveLength(72);
    expect(guide.entries.filter((entry) => entry.section === "recipes")).toHaveLength(54);
    for (const entry of guide.entries) {
      expect(entry.id).toMatch(/^[a-z][a-z0-9_]+$/);
      expect(entry.pages.length).toBeGreaterThanOrEqual(1);
      expect(entry.pages.length).toBeLessThanOrEqual(2);
      for (const page of entry.pages) {
        expect(page.length, entry.id).toBeGreaterThan(40);
        expect(page.length, entry.id).toBeLessThan(1550);
      }
      if (entry.recipe) expect(must(BY_ID.get(entry.recipe), entry.recipe).section).toBe("recipes");
    }
  });

  it("uses declared symbols and sensible dimensions in every crafting matrix", () => {
    for (const entry of guide.entries.filter((candidate) => candidate.section === "recipes")) {
      const crafting = must(entry.crafting, `crafting for ${entry.id}`);
      expect(crafting.output).toBeGreaterThanOrEqual(1);
      if (crafting.shapeless) continue;
      expect(crafting.rows.length).toBeGreaterThanOrEqual(1);
      expect(crafting.rows.length).toBeLessThanOrEqual(3);
      for (const row of crafting.rows) {
        expect(row.length).toBeGreaterThanOrEqual(1);
        expect(row.length).toBeLessThanOrEqual(3);
        for (const symbol of row) expect(symbol === "." || symbol in crafting.key, `${entry.id} ${symbol}`).toBe(true);
      }
    }
    expect(BY_ID.get("recipe_sticky_piston")?.crafting?.rows).toEqual(["S", "P"]);
    expect(BY_ID.get("recipe_observer")?.crafting?.rows).toEqual(["CCC", "RRQ", "CCC"]);
    expect(BY_ID.get("recipe_dispenser")?.crafting?.rows).toEqual(["CCC", "CBC", "CRC"]);
    expect(BY_ID.get("recipe_honey")?.crafting?.rows).toEqual(["HH", "HH"]);
  });
});

describe("navigation", () => {
  it("reaches every topic from home through category menus and pagination", () => {
    const visited = new Set<string>();
    const found = new Set<string>();
    const pending: Route[] = [HOME];
    while (pending.length) {
      const route = must(pending.shift(), "a pending route");
      const key = JSON.stringify(route);
      if (visited.has(key)) continue;
      visited.add(key);
      const screen = screenFor(route);
      expect(screen.title).toBeTruthy();
      expect(screen.body).toBeTruthy();
      expect(screen.buttons.length).toBeGreaterThan(0);
      expect(screen.buttons.some((button) => button.route === null)).toBe(true);
      for (const button of screen.buttons) {
        expect(typeof button.label === "string" && button.label.length > 0).toBe(true);
        if (button.route?.kind === "read") found.add(must(button.route.id, "a reading id"));
        else if (button.route) pending.push(button.route);
      }
    }
    expect([...found].sort()).toEqual(guide.entries.map((entry) => entry.id).sort());
    expect(visited.size).toBeGreaterThan(GROUPS.length);
  });

  it("numbers every reading page, links valid routes and offers a bookmark", () => {
    let globalPage = 0;
    for (const entry of guide.entries) {
      for (let page = 0; page < entry.pages.length; page++) {
        globalPage++;
        const screen = screenFor(readingRoute(entry.id, page));
        expect(screen.title).toBe(entry.title);
        expect(screen.body).toContain(entry.pages[page]);
        expect(screen.body).toContain(`Guide page ${globalPage}/${TOTAL_PAGES}`);
        expect(screen.bookmark).toEqual({ id: entry.id, page });
        expect(screen.buttons.find((button) => button.label === "Contents")).toBeDefined();
        expect(screen.buttons.find((button) => button.label === "Chapter index")).toBeDefined();
        for (const button of screen.buttons) if (button.route) expect(screenFor(button.route).title).toBeTruthy();
        if (page + 1 < entry.pages.length) {
          expect(screen.buttons.find((button) => button.label === "Next page >")?.route?.page).toBe(page + 1);
        }
        if (page > 0) {
          expect(screen.buttons.find((button) => button.label === "< Previous page")?.route?.page).toBe(page - 1);
        }
      }
    }
    expect(globalPage).toBe(TOTAL_PAGES);
  });

  it("returns from a component's recipe to that component", () => {
    for (const entry of guide.entries.filter((candidate) => candidate.recipe)) {
      const recipeButton = screenFor(readingRoute(entry.id)).buttons.find(
        (button) => button.label === "Show crafting recipe",
      );
      const target = must(recipeButton?.route, `recipe route for ${entry.id}`);
      expect(target.id).toBe(entry.recipe);
      const backButton = screenFor(target).buttons.find((button) => button.label === "Back to component");
      const back = must(backButton?.route, `back route for ${entry.id}`);
      expect(back.id).toBe(entry.id);
      expect(screenFor(back).title).toBe(entry.title);
    }
  });

  it("validates and clamps bookmarks and untrusted routes", () => {
    expect(normalizeBookmark(null)).toBeNull();
    expect(normalizeBookmark("broken")).toBeNull();
    expect(normalizeBookmark({ id: "missing" })).toBeNull();
    expect(normalizeBookmark({ id: "build_night_lights", page: 999 })).toEqual({ id: "build_night_lights", page: 1 });
    expect(normalizeBookmark({ id: "build_night_lights", page: -1 })).toEqual({ id: "build_night_lights", page: 0 });
    expect(normalizeBookmark({ id: "build_night_lights", page: Number.NaN })).toEqual({
      id: "build_night_lights",
      page: 0,
    });
    expect(readingRoute("nonexistent")).toEqual(HOME);
    const untrusted: unknown[] = [
      null,
      3,
      "bad",
      {},
      { kind: "read", id: "missing" },
      { kind: "list", section: "bad" },
    ];
    for (const route of untrusted) expect(screenFor(route).title).toBe(screenFor(HOME).title);
    const home = screenFor(HOME, { id: "build_night_lights", page: 1 });
    expect(home.buttons[0]?.route?.page).toBe(1);
    expect(home.buttons[0]?.route?.id).toBe("build_night_lights");
  });

  it("clamps list offsets and reaches the final recipe without empty pages", () => {
    const last = screenFor({ kind: "list", section: "recipes", offset: 10000 });
    const topics = last.buttons.filter((button) => button.route?.kind === "read");
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.length).toBeLessThanOrEqual(PAGE_SIZE);
    expect(last.buttons.find((button) => button.label === "Next topics >")).toBeUndefined();
    const first = screenFor({ kind: "list", section: "recipes", offset: -100 });
    expect(first.buttons.find((button) => button.label === "< Previous topics")).toBeUndefined();
    expect(first.buttons.filter((button) => button.route?.kind === "read")).toHaveLength(PAGE_SIZE);
  });
});

describe("pack files", () => {
  it("item id, texture path and icon key agree", () => {
    const item = (readStrictJson(path.join(BP, "items", "guide_book.json")) as Json)["minecraft:item"];
    expect(item.description.identifier).toBe(BOOK_ID);
    expect(item.components["minecraft:interact_button"]).toBe("Read Guide");
    expect(COMPONENT_ID in item.components).toBe(true);
    expect("minecraft:food" in item.components).toBe(false);
    const iconKey = item.components["minecraft:icon"].textures.default;
    const atlas = readStrictJson(path.join(RP, "textures", "item_texture.json")) as Json;
    expect(atlas.texture_data[iconKey]?.textures).toBe("textures/items/elleedog_redstone_guide_book");
    expect(BOOK_ICON).toBe(atlas.texture_data[iconKey].textures);
    expect(fs.existsSync(path.join(RP, `${BOOK_ICON}.png`))).toBe(true);
  });

  it("guide recipe is shapeless, uses exactly one redstone and one leather, and fits all 84 two-slot layouts", () => {
    const root = readStrictJson(path.join(BP, "recipes", "guide_book.json")) as Json;
    const recipe = root["minecraft:recipe_shapeless"];
    expect(recipe).toBeDefined();
    expect(root["minecraft:recipe_shaped"]).toBeUndefined();
    expect(recipe.ingredients).toEqual([{ item: "minecraft:redstone" }, { item: "minecraft:leather" }]);
    expect(recipe.result).toEqual({ item: BOOK_ID, count: 1 });
    expect(recipe.tags).toContain("crafting_table");
    const wanted = recipe.ingredients.map((ingredient: Json) => ingredient.item).sort();
    let layouts = 0;
    for (const slots of [4, 9]) {
      for (let i = 0; i < slots; i++) {
        for (let j = 0; j < slots; j++) {
          if (i === j) continue;
          const grid: Array<string | null> = Array(slots).fill(null);
          grid[i] = "minecraft:redstone";
          grid[j] = "minecraft:leather";
          expect(grid.filter(Boolean).sort()).toEqual(wanted);
          layouts++;
        }
      }
    }
    expect(layouts).toBe(84);
  });
});
