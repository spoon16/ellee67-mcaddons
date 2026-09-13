import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKMARK_KEY, lastUse, sessions } from "../../../src/features/redstone-guide/index.ts";
import {
  addPlayer,
  dimensions,
  leavePlayer,
  requestedDelays,
  reset,
  step,
  ticks,
} from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { boot, busy, closed, component, fallbackUse, must, pick, shownForms, useBook, useBookOn } from "./helpers.ts";

const PREFIX = "§6[Redstone Guide]§r";
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  reset();
  ui.reset();
  sessions.clear();
  lastUse.clear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  boot();
});

afterEach(() => {
  warn.mockRestore();
});

describe("opening the book", () => {
  it("registers both use paths at startup and does not retry a deliberate close", async () => {
    const player = addPlayer("Steve");
    expect(typeof component()?.onUse).toBe("function");
    expect(typeof component()?.onUseOn).toBe("function");
    useBook(player);
    await ticks(2);
    expect(ui.shown).toBe(1);
    expect(shownForms()[0]?.titleText).toMatch(/Redstone Guide/);
    expect(sessions.size).toBe(0);
    expect(player.chat).toEqual([]);
  });

  it("shows one form for duplicate component and fallback use events", async () => {
    const player = addPlayer("Steve");
    useBook(player);
    useBook(player);
    fallbackUse(player);
    useBookOn(player);
    await ticks(2);
    expect(ui.shown).toBe(1);
  });

  it("ignores unrelated items on the fallback path and non-player sources", async () => {
    const player = addPlayer("Steve");
    const pig = dimensions.overworld.spawnEntity("minecraft:pig", { x: 0, y: 64, z: 0 });
    fallbackUse(player, "minecraft:book");
    useBook(pig);
    await ticks(2);
    expect(ui.shown).toBe(0);
    fallbackUse(player);
    await ticks(2);
    expect(ui.shown).toBe(1);
  });

  it("reads independent sessions for two players at once", async () => {
    const alex = addPlayer("Alex");
    const steve = addPlayer("Steve");
    const seen: string[] = [];
    const closeFor = (_form: unknown, player: unknown) => {
      seen.push((player as { name: string }).name);
      return closed;
    };
    ui.responses.push(closeFor, closeFor);
    useBook(alex);
    useBook(steve);
    await ticks(2);
    expect([...seen].sort()).toEqual(["Alex", "Steve"]);
    expect(sessions.size).toBe(0);
  });

  it("cleans all state when the player leaves before the deferred open, without showing a form", async () => {
    const player = addPlayer("Steve");
    useBook(player);
    leavePlayer(player);
    await ticks(2);
    expect(ui.shown).toBe(0);
    expect(sessions.size).toBe(0);
    expect(lastUse.size).toBe(0);
  });
});

describe("busy screens", () => {
  it("retries four ticks apart and gives up after ten attempts with an actionable message", async () => {
    const player = addPlayer("Steve");
    ui.responses.push(...Array.from({ length: 12 }, () => busy));
    useBook(player);
    await ticks(40);
    expect(ui.shown).toBe(10);
    expect(requestedDelays.filter((delay) => delay === 4)).toHaveLength(9);
    expect(sessions.size).toBe(0);
    expect(player.chat).toEqual([`${PREFIX} Close the other screen, then use Read Guide again.`]);
    await ticks(10);
    expect(ui.shown).toBe(10);
  });

  it("retries a transient busy response once and respects the next close", async () => {
    const player = addPlayer("Steve");
    ui.responses.push(busy, closed);
    useBook(player);
    await ticks(10);
    expect(ui.shown).toBe(2);
    expect(player.chat).toEqual([]);
    expect(sessions.size).toBe(0);
  });

  it("does not bookmark a page that never appeared", async () => {
    const player = addPlayer("Steve");
    // Home -> Three builds -> Night lights, whose page is never displayed.
    ui.responses.push(pick(2), pick(0), ...Array.from({ length: 10 }, () => busy));
    useBook(player);
    await ticks(45);
    expect(ui.shown).toBe(12);
    expect(player.getDynamicProperty(BOOKMARK_KEY)).toBeUndefined();
  });
});

describe("bookmarks", () => {
  it("persists the exact page read from the menus and offers Resume on reopening", async () => {
    const player = addPlayer("Steve");
    // Home -> Three builds -> Night lights -> second page -> close.
    ui.responses.push(pick(2), pick(0), pick(0), closed);
    useBook(player);
    await ticks(8);
    expect(ui.shown).toBe(4);
    expect(JSON.parse(String(player.getDynamicProperty(BOOKMARK_KEY)))).toEqual({ id: "build_night_lights", page: 1 });
    step(10);
    useBook(player);
    await ticks(2);
    const forms = shownForms();
    const home = must(forms[forms.length - 1], "the reopened home screen");
    expect(home.buttons[0]?.label).toMatch(/Resume reading/);
    expect(home.buttons[0]?.label).toMatch(/night lights/i);
  });

  it("reads on despite a corrupt bookmark and denied persistence", async () => {
    const player = addPlayer("Steve");
    player.setDynamicProperty(BOOKMARK_KEY, "{broken json");
    player.failPersistence = true;
    ui.responses.push(pick(2), pick(0), closed);
    useBook(player);
    await ticks(8);
    expect(ui.shown).toBe(3);
    expect(warn).not.toHaveBeenCalled();
    expect(player.chat).toEqual([]);
  });
});

describe("failures and repeats", () => {
  it("catches a thrown form, releases the session and recovers on the next use", async () => {
    const player = addPlayer("Steve");
    ui.responses.push(() => {
      throw new Error("mock show failure");
    });
    useBook(player);
    await ticks(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(player.chat).toEqual([`${PREFIX} Could not open the guide. Close other screens and try again.`]);
    expect(sessions.size).toBe(0);
    step(10);
    useBook(player);
    await ticks(2);
    expect(ui.shown).toBe(2);
  });

  it("exits safely on an invalid selection and suppresses immediate repeated use with the cooldown", async () => {
    const player = addPlayer("Steve");
    ui.responses.push(pick(9999));
    useBook(player);
    await ticks(2);
    expect(ui.shown).toBe(1);
    expect(sessions.size).toBe(0);
    useBook(player);
    await ticks(2);
    expect(ui.shown).toBe(1);
    step(10);
    useBook(player);
    await ticks(2);
    expect(ui.shown).toBe(2);
  });
});
