import { beforeEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../../src/core/bootstrap.ts";
import { isRunning, setEnabled } from "../../../src/core/features.ts";
import { lastUse, redstoneGuide, sessions } from "../../../src/features/redstone-guide/index.ts";
import { addPlayer, loadWorld, reset, startup, system, ticks, world } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { boot, busy, fallbackUse, useBook, useBookOn } from "./helpers.ts";

beforeEach(() => {
  reset();
  ui.reset();
  sessions.clear();
  lastUse.clear();
});

describe("redstone-guide lifecycle", () => {
  it("does nothing while disabled, leaves no subscriptions behind and works again once re-enabled", async () => {
    bootstrap([redstoneGuide]);
    startup();
    const before = {
      itemUse: world.afterEvents.itemUse.size,
      playerLeave: world.afterEvents.playerLeave.size,
      intervals: system.intervalCount,
    };
    loadWorld();
    expect(isRunning("redstone-guide")).toBe(true);
    expect(world.afterEvents.itemUse.size).toBe(before.itemUse + 1);
    expect(world.afterEvents.playerLeave.size).toBe(before.playerLeave + 1);

    const player = addPlayer("Steve");
    expect(setEnabled("redstone-guide", false)).toEqual({ changed: true });
    useBook(player);
    useBookOn(player);
    fallbackUse(player);
    await ticks(3);
    expect(ui.shown).toBe(0);
    expect(sessions.size).toBe(0);
    expect(lastUse.size).toBe(0);
    expect(world.afterEvents.itemUse.size).toBe(before.itemUse);
    expect(world.afterEvents.playerLeave.size).toBe(before.playerLeave);
    expect(system.intervalCount).toBe(before.intervals);

    expect(setEnabled("redstone-guide", true)).toEqual({ changed: true });
    useBook(player);
    await ticks(2);
    expect(ui.shown).toBe(1);
  });

  it("abandons an open reading session when disabled mid-read", async () => {
    boot();
    const player = addPlayer("Steve");
    ui.responses.push(...Array.from({ length: 12 }, () => busy));
    useBook(player);
    await ticks(6);
    expect(ui.shown).toBe(2);
    setEnabled("redstone-guide", false);
    await ticks(40);
    expect(ui.shown).toBe(2);
    expect(sessions.size).toBe(0);
    expect(player.chat).toEqual([]);
  });
});
