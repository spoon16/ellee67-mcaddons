import { beforeEach, describe, expect, it } from "vitest";
import { runFeature } from "../../../src/core/feature.ts";
import { pets } from "../../../src/features/pets/index.ts";
import { loadWorld, registry, reset, startup, system, world } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { declarePetEntities } from "./helpers.ts";

function sizes() {
  return {
    spawn: world.afterEvents.playerSpawn.size,
    leave: world.afterEvents.playerLeave.size,
    dimension: world.afterEvents.playerDimensionChange.size,
    intervals: system.intervalCount,
  };
}

beforeEach(() => {
  reset();
  ui.reset();
});

describe("pets lifecycle", () => {
  it("registers every pet: command and the Morpher book component at startup", () => {
    declarePetEntities();
    runFeature(pets);
    startup();
    const names = [...registry.commands.keys()];
    expect(names.length).toBeGreaterThan(20);
    expect(names.every((name) => name.startsWith("pet:"))).toBe(true);
    expect([...registry.enums.keys()].every((name) => name.startsWith("pet:"))).toBe(true);
    expect([...registry.components.keys()]).toEqual(["pet:open_morpher"]);
  });

  it("subscribes the player handlers and one refresh loop on world load", () => {
    declarePetEntities();
    runFeature(pets);
    startup();
    const before = sizes();
    loadWorld();
    expect(sizes()).toEqual({
      spawn: before.spawn + 1,
      leave: before.leave + 1,
      dimension: before.dimension + 1,
      intervals: before.intervals + 1,
    });
  });
});
