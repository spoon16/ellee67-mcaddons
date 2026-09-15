import { beforeEach, describe, expect, it } from "vitest";
import { runFeature } from "../../../src/core/feature.ts";
import { COMPONENT_ID, lastUse, redstoneGuide, sessions } from "../../../src/features/redstone-guide/index.ts";
import { loadWorld, registry, reset, startup, system, world } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";

function sizes() {
  return {
    itemUse: world.afterEvents.itemUse.size,
    playerLeave: world.afterEvents.playerLeave.size,
    intervals: system.intervalCount,
  };
}

beforeEach(() => {
  reset();
  ui.reset();
  sessions.clear();
  lastUse.clear();
});

describe("redstone-guide lifecycle", () => {
  it("registers the book component at startup and the fallback use and leave handlers on world load", () => {
    runFeature(redstoneGuide);
    startup();
    expect([...registry.components.keys()]).toEqual([COMPONENT_ID]);
    const before = sizes();
    loadWorld();
    expect(sizes()).toEqual({
      itemUse: before.itemUse + 1,
      playerLeave: before.playerLeave + 1,
      intervals: before.intervals,
    });
  });
});
