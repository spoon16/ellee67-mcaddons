// Quiet lifecycle regression tests. Mocks exercise callbacks, not a Realm or client.
import { beforeEach, describe, expect, it } from "vitest";
import { PETS } from "../../../src/features/pets/catalog.generated.js";
import { registerPetCommands, registerPetItems } from "../../../src/features/pets/main.js";
import { leavePlayer, players, reset, system, ticks, world } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { command, petPlayer, start, text, withLogs } from "./helpers.ts";

beforeEach(() => {
  reset();
  ui.reset();
});

describe("quiet startup", () => {
  it("Existing-player script bootstrap restores saved form without chat or success logs", async () => {
    const p = petPlayer("bootstrap");
    p.dynamic["pet:preferred_form"] = "casper";
    // Importing the scripts registers nothing; every subscription waits for the core to start the feature.
    expect(system.intervalCount).toBe(0);
    expect(world.afterEvents.playerSpawn.size).toBe(0);
    const logs = await withLogs(async () => {
      start();
      await ticks(25);
    });
    expect(p.props["pet:model_id"]).toBe(3);
    expect(p.props["pet:armor_fit"]).toBe(true);
    expect(p.props["pet:hand_height"]).toBe(2);
    expect(p.messages).toEqual([]);
    expect(logs).toEqual([]);
    expect(ui.shown).toBe(0);
  });

  for (const form of [{ id: "human", wire_id: 0 }, ...PETS]) {
    it(`Initial join restores ${form.id} silently and retains calibration/inventory`, async () => {
      start();
      const p = petPlayer(`join-${form.id}`);
      const item = p.items[0];
      p.dynamic = { "pet:preferred_form": form.id, "pet:hand_height_preference": 2, "other:setting": 17 };
      world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
      await ticks(12);
      expect(p.props["pet:model_id"]).toBe(form.wire_id);
      expect(p.props["pet:armor_fit"]).toBe(form.wire_id !== 0);
      expect(p.props["pet:view"]).toBe(form.wire_id === 0 ? "native" : "paws");
      expect(p.props["pet:hand_height"]).toBe(form.wire_id === 0 ? 0 : 2);
      expect(p.dynamic["other:setting"]).toBe(17);
      expect(p.items[0]).toBe(item);
      expect(p.inventoryWrites).toBeUndefined();
      expect(p.messages).toEqual([]);
      expect(ui.shown).toBe(0);
    });
  }

  it("Simultaneous multiplayer joins do not announce to either player", async () => {
    start();
    const a = petPlayer("realm-a");
    const b = petPlayer("realm-b");
    a.dynamic["pet:preferred_form"] = "carter";
    b.dynamic["pet:preferred_form"] = "mochi";
    for (const player of [a, b]) world.afterEvents.playerSpawn.emit({ player, initialSpawn: true });
    await ticks(12);
    expect(a.props["pet:model_id"]).toBe(1);
    expect(b.props["pet:model_id"]).toBe(2);
    expect(a.messages).toEqual([]);
    expect(b.messages).toEqual([]);
    expect(ui.shown).toBe(0);
  });

  it("Leaving and rejoining restores the returning player without a welcome banner", async () => {
    start();
    const old = petPlayer("rejoin");
    old.dynamic["pet:preferred_form"] = "mochi";
    world.afterEvents.playerSpawn.emit({ player: old, initialSpawn: true });
    await ticks(5);
    leavePlayer(old);
    const p = petPlayer("rejoin");
    p.dynamic = { ...old.dynamic };
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
    await ticks(12);
    expect(p.props["pet:model_id"]).toBe(2);
    expect(p.messages).toEqual([]);
    expect(old.messages).toEqual([]);
  });

  it("Respawn and dimension restoration are also silent", async () => {
    start();
    const p = petPlayer("lifecycle");
    p.dynamic["pet:preferred_form"] = "carter";
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: false });
    await ticks(5);
    world.afterEvents.playerDimensionChange.emit({ player: p });
    await ticks(8);
    expect(p.props["pet:model_id"]).toBe(1);
    expect(p.messages).toEqual([]);
    expect(ui.shown).toBe(0);
  });

  it("Legacy-form migration on join does not print a migration or welcome notice", async () => {
    start();
    const p = petPlayer("legacy-quiet");
    p.dynamic["cav:preferred_form"] = "cavalier";
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
    await ticks(6);
    expect(p.dynamic["pet:preferred_form"]).toBe("carter");
    expect(p.messages).toEqual([]);
  });

  it("Automatic restore failure logs once after bounded retries but never prints in chat", async () => {
    start();
    const p = petPlayer("bad-restore");
    delete p.props["pet:model_id"];
    // Keep this player out of the periodic services to isolate the restore callback.
    players.length = 0;
    const logs = await withLogs(async () => {
      world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
      await ticks(60);
    });
    expect(p.messages).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/pet:model_id.*missing/);
    expect(ui.shown).toBe(0);
  });

  it("Startup registration errors remain in the content log, not player chat", async () => {
    const p = petPlayer("registration");
    const logs = await withLogs(async () => {
      registerPetCommands({
        registerEnum() {
          throw new Error("Simulated registration failure");
        },
        registerCommand() {},
      });
      registerPetItems({ registerCustomComponent() {} });
      await ticks(3);
    });
    expect(p.messages).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/Simulated registration failure/);
  });
});

describe("explicit commands after a quiet join", () => {
  it("Explicit book, form and diagnostic commands still reply after a silent join", async () => {
    start();
    const p = petPlayer("commands");
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
    await ticks(5);
    expect(p.messages).toEqual([]);
    command("book", p);
    await ticks(4);
    expect(p.items[1]?.typeId).toBe("pet:morpher_book");
    expect(text(p)).toMatch(/Pet Morpher added/);
    p.messages = [];
    command("form", p, "carter");
    await ticks(6);
    expect(text(p)).toMatch(/Selected Carter/);
    p.messages = [];
    command("diagnose", p);
    await ticks(4);
    expect(p.chat.some((m) => m.includes("serverForm"))).toBe(true);
    expect(p.messages.some((m) => (m as { translate?: string })?.translate === "pet.diag.rp_052")).toBe(true);
  });

  it("An explicit failed command still gives actionable feedback", async () => {
    start();
    const p = petPlayer("explicit-error");
    delete p.props["pet:model_id"];
    await withLogs(async () => {
      command("form", p, "carter");
      await ticks(4);
    });
    expect(p.messages).toHaveLength(1);
    expect(p.chat[0]).toMatch(/ERROR:.*pet:model_id/);
  });

  it("The Morpher stays player-invoked, not automatically opened on load", async () => {
    start();
    const p = petPlayer("manual-menu");
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
    await ticks(8);
    expect(ui.shown).toBe(0);
    ui.responses = [{ canceled: true }];
    command("menu", p);
    await ticks(8);
    expect(ui.shown).toBe(1);
    expect(p.messages).toEqual([]);
  });
});
