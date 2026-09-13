import { beforeEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../../src/core/bootstrap.ts";
import { disabledMessage } from "../../../src/core/commands.ts";
import { isRunning } from "../../../src/core/features.ts";
import { pets } from "../../../src/features/pets/index.ts";
import {
  CustomCommandStatus,
  loadWorld,
  registerEntityType,
  registry,
  reset,
  runCommand,
  startup,
  system,
  ticks,
  world,
} from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { command, declarePetEntities, PROBE_ENTITY, petPlayer, withLogs } from "./helpers.ts";

const PACK_TITLE = "ElleeDog 67 Pets";

/** The core also listens to playerSpawn for book grants, so that signal is not a clean measure of the feature. */
function sizes() {
  return {
    leave: world.afterEvents.playerLeave.size,
    dimension: world.afterEvents.playerDimensionChange.size,
    intervals: system.intervalCount,
  };
}

function featuresReport(): string {
  return String(runCommand("elleedog67:features", {}).message);
}

beforeEach(() => {
  reset();
  ui.reset();
});

describe("pets pack presence", () => {
  it("starts on world load when the Pets packs are active", () => {
    declarePetEntities();
    bootstrap([pets]);
    startup();
    registerEntityType(PROBE_ENTITY);
    const before = sizes();
    loadWorld();
    expect(isRunning("pets")).toBe(true);
    expect(sizes()).toEqual({
      leave: before.leave + 1,
      dimension: before.dimension + 1,
      intervals: before.intervals + 2,
    });
    expect(featuresReport()).toContain("pets: active");
  });

  it("never starts without the packs and refuses its commands and items with the pack hint", async () => {
    declarePetEntities();
    bootstrap([pets]);
    startup();
    const before = sizes();
    const p = petPlayer("Ellee");
    p.dynamic["pet:preferred_form"] = "casper";
    const logs = await withLogs(async () => {
      loadWorld();
      world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
      await ticks(25);
    });
    expect(logs).toEqual([]);
    expect(isRunning("pets")).toBe(false);
    expect(sizes()).toEqual(before);
    expect(p.writes).toEqual([]);
    expect(p.props["pet:model_id"]).toBe(0);

    const refused = command("form", p, "casper");
    expect(refused).toEqual({ status: CustomCommandStatus.Failure, message: disabledMessage(pets) });
    expect(refused.message).toContain(PACK_TITLE);
    expect(refused.message).not.toContain("/elleedog67:enable");
    registry.components.get("pet:open_morpher")?.onUse({ source: p });
    registry.components.get("pet:open_form_menu")?.onUse({ source: p });
    await ticks(3);
    expect(ui.shown).toBe(0);
    expect(p.writes).toEqual([]);

    const report = featuresReport();
    expect(report).toContain("pets: packs off");
    expect(report).toContain(PACK_TITLE);
  });
});
