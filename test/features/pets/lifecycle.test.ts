import { beforeEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../../src/core/bootstrap.ts";
import { disabledMessage } from "../../../src/core/commands.ts";
import { isRunning, setEnabled } from "../../../src/core/features.ts";
import { pets } from "../../../src/features/pets/index.ts";
import {
  CustomCommandStatus,
  loadWorld,
  registry,
  reset,
  runCommand,
  startup,
  step,
  system,
  ticks,
  world,
} from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { command, declarePetEntities, petPlayer, start, withLogs } from "./helpers.ts";

function sizes() {
  return {
    spawn: world.afterEvents.playerSpawn.size,
    leave: world.afterEvents.playerLeave.size,
    dimension: world.afterEvents.playerDimensionChange.size,
    intervals: system.intervalCount,
  };
}

const last = (lines: string[]) => lines[lines.length - 1];

beforeEach(() => {
  reset();
  ui.reset();
});

describe("enable and disable", () => {
  it("returns transformed players to native form while disabled and restores them when re-enabled", async () => {
    declarePetEntities();
    bootstrap([pets]);
    startup();
    const beforeStart = sizes();
    loadWorld();
    const running = sizes();
    expect(running.intervals).toBe(beforeStart.intervals + 2);

    const p = petPlayer("Ellee");
    command("form", p, "casper");
    await ticks(5);
    expect(p.props["pet:model_id"]).toBe(3);
    expect(p.props["pet:armor_fit"]).toBe(true);

    const logs = await withLogs(async () => {
      const result = runCommand("elleedog67:disable", { sourceEntity: p }, "pets");
      expect(result.status).toBe(CustomCommandStatus.Success);
      await ticks(2);
    });
    expect(logs).toEqual([]);
    expect(isRunning("pets")).toBe(false);
    expect(last(p.chat)).toBe("Pets disabled.");
    expect(p.props["pet:model_id"]).toBe(0);
    expect(p.props["pet:armor_fit"]).toBe(false);
    expect(p.props["pet:gear_fit"]).toBe(false);
    expect(p.props["pet:view"]).toBe("native");
    expect(p.props["pet:hand_height"]).toBe(0);
    expect(p.dynamic["pet:preferred_form"]).toBe("casper");

    const refused = command("form", p, "carter");
    expect(refused).toEqual({ status: CustomCommandStatus.Failure, message: disabledMessage(pets) });
    expect(refused.message).toBe("Pets is disabled. An operator can run /elleedog67:enable pets.");
    registry.components.get("pet:open_morpher")?.onUse({ source: p });
    await ticks(3);
    expect(ui.shown).toBe(0);
    expect(p.props["pet:model_id"]).toBe(0);

    const stopped = sizes();
    expect(stopped.leave).toBe(beforeStart.leave);
    expect(stopped.dimension).toBe(beforeStart.dimension);
    expect(stopped.intervals).toBe(beforeStart.intervals);
    // The feature's spawn listener is swapped for the idle join guard, next to the core's book grant.
    expect(stopped.spawn).toBe(running.spawn);

    const q = petPlayer("Joiner");
    q.props["pet:model_id"] = 2;
    q.props["pet:armor_fit"] = true;
    q.props["pet:view"] = "paws";
    q.props["pet:hand_height"] = 2;
    q.dynamic["pet:preferred_form"] = "mochi";
    const joinLogs = await withLogs(async () => {
      world.afterEvents.playerSpawn.emit({ player: q, initialSpawn: true });
      await ticks(2);
    });
    expect(joinLogs).toEqual([]);
    expect(q.messages).toEqual([]);
    expect(q.props["pet:model_id"]).toBe(0);
    expect(q.props["pet:armor_fit"]).toBe(false);
    expect(q.props["pet:view"]).toBe("native");
    expect(q.dynamic["pet:preferred_form"]).toBe("mochi");

    runCommand("elleedog67:enable", { sourceEntity: p }, "pets");
    step(1);
    expect(isRunning("pets")).toBe(true);
    expect(last(p.chat)).toBe("Pets enabled.");
    expect(sizes()).toEqual(running);
    const restoreLogs = await withLogs(() => ticks(21));
    expect(restoreLogs).toEqual([]);
    expect(p.props["pet:model_id"]).toBe(3);
    expect(p.props["pet:armor_fit"]).toBe(true);
    expect(q.props["pet:model_id"]).toBe(2);
    expect(last(p.chat)).toBe("Pets enabled.");
    expect(q.messages).toEqual([]);
  });

  it("still restores the other players when one player's properties cannot be read", async () => {
    start();
    const broken = petPlayer("Broken");
    const healthy = petPlayer("Healthy");
    command("form", broken, "mochi");
    command("form", healthy, "carter");
    await ticks(5);
    expect(broken.props["pet:model_id"]).toBe(2);
    expect(healthy.props["pet:model_id"]).toBe(1);
    delete broken.props["pet:armor_fit"];
    const chatBefore = { broken: broken.chat.length, healthy: healthy.chat.length };

    const logs = await withLogs(async () => {
      setEnabled("pets", false);
      await ticks(2);
    });
    expect(isRunning("pets")).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/Broken.*pet:armor_fit is missing/);
    expect(healthy.props["pet:model_id"]).toBe(0);
    expect(broken.props["pet:model_id"]).toBe(2);
    expect(broken.chat).toHaveLength(chatBefore.broken);
    expect(healthy.chat).toHaveLength(chatBefore.healthy);
  });
});
