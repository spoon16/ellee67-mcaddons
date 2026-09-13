import { beforeEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../../src/core/bootstrap.ts";
import { isRunning } from "../../../src/core/features.ts";
import { BOOK_ID, lastUse, redstoneGuide, sessions } from "../../../src/features/redstone-guide/index.ts";
import {
  addPlayer,
  loadWorld,
  registerItemType,
  reset,
  runCommand,
  startup,
  system,
  ticks,
  world,
} from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { fallbackUse, useBook, useBookOn } from "./helpers.ts";

const PACK_TITLE = "ElleeDog 67 Redstone Guide";

function sizes() {
  return {
    itemUse: world.afterEvents.itemUse.size,
    playerLeave: world.afterEvents.playerLeave.size,
    intervals: system.intervalCount,
  };
}

function featuresReport(): string {
  return String(runCommand("elleedog67:features", {}).message);
}

beforeEach(() => {
  reset();
  ui.reset();
  sessions.clear();
  lastUse.clear();
});

describe("redstone-guide lifecycle", () => {
  it("subscribes the fallback use and leave handlers on world load when the packs are active", () => {
    bootstrap([redstoneGuide]);
    startup();
    registerItemType(BOOK_ID);
    const before = sizes();
    loadWorld();
    expect(isRunning("redstone-guide")).toBe(true);
    expect(sizes()).toEqual({
      itemUse: before.itemUse + 1,
      playerLeave: before.playerLeave + 1,
      intervals: before.intervals,
    });
    expect(featuresReport()).toContain("redstone-guide: active");
  });

  it("never starts without the packs, so the book component and fallback use open nothing", async () => {
    bootstrap([redstoneGuide]);
    startup();
    const before = sizes();
    loadWorld();
    expect(isRunning("redstone-guide")).toBe(false);
    expect(sizes()).toEqual(before);

    const player = addPlayer("Steve");
    useBook(player);
    useBookOn(player);
    fallbackUse(player);
    await ticks(3);
    expect(ui.shown).toBe(0);
    expect(sessions.size).toBe(0);
    expect(lastUse.size).toBe(0);
    expect(player.chat).toEqual([]);

    const report = featuresReport();
    expect(report).toContain("redstone-guide: packs off");
    expect(report).toContain(PACK_TITLE);
  });
});
