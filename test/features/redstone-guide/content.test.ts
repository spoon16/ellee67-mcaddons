import { describe, expect, it } from "vitest";
import { readGuide } from "./helpers.ts";

// The checks package_addon.py ran before it would write content.js and package the add-on.
describe("guide_content.json", () => {
  const { entries } = readGuide();

  it("gives every entry a unique id", () => {
    const ids = entries.map((entry) => entry.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it("gives every entry one or two pages", () => {
    const wrong = entries.filter((entry) => entry.pages.length < 1 || entry.pages.length > 2).map((entry) => entry.id);
    expect(wrong).toEqual([]);
  });

  it("resolves every recipe cross-reference to an existing entry", () => {
    const ids = new Set(entries.map((entry) => entry.id));
    const dangling = entries
      .filter((entry) => entry.recipe && !ids.has(entry.recipe))
      .map((entry) => `${entry.id} -> ${entry.recipe}`);
    expect(dangling).toEqual([]);
  });
});
