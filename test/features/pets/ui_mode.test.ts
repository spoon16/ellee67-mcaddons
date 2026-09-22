// /pet:ui, the inventory-preview experiment. Each mode is one value of the player property the client's Molang
// reads; the scripts only set it, save it per player, restore it on join and clear it on reset. What a device shows
// per mode is the experiment itself (docs/features/pets.md), and the compiler's test_paperdoll.py holds what each
// mode changes in the emitted Molang.
import { beforeEach, describe, expect, it } from "vitest";
import { PROPERTY_SCHEMA } from "../../../src/features/pets/property_schema.generated.ts";
import { UI_MODE_PREFERENCE, UI_MODE_PROPERTY, UI_MODES } from "../../../src/features/pets/settings.ts";
import { registry, reset, ticks, world } from "../../mocks/minecraft-server.ts";
import { command, petPlayer, start, text } from "./helpers.ts";

beforeEach(() => {
  reset();
  start();
});

describe("/pet:ui", () => {
  it("The choices are the modes in wire order and the property's range covers exactly them", () => {
    expect(registry.enums.get("pet:ui_choice")).toEqual([...UI_MODES]);
    expect(UI_MODES[0]).toBe("player");
    expect(PROPERTY_SCHEMA[UI_MODE_PROPERTY]).toEqual({
      type: "int",
      range: [0, UI_MODES.length - 1],
      default: 0,
      client_sync: true,
    });
  });

  it("Each mode writes its wire value, saves it and says what to look for", async () => {
    const p = petPlayer("ui");
    command("form", p, "carter");
    await ticks(6);
    for (const [wire, mode] of UI_MODES.entries()) {
      command("ui", p, mode);
      await ticks(6);
      expect(p.props[UI_MODE_PROPERTY]).toBe(wire);
      expect(p.dynamic[UI_MODE_PREFERENCE]).toBe(wire);
      expect(text(p)).toContain(`Preview mode ${mode}`);
    }
    expect(text(p)).not.toContain("ERROR");
  });

  it("The mode survives a form change and a rejoin", async () => {
    const p = petPlayer("keep");
    command("ui", p, "pet_static");
    await ticks(3);
    command("form", p, "mochi");
    await ticks(6);
    expect(p.props[UI_MODE_PROPERTY]).toBe(2);
    expect(p.props["pet:model_id"]).toBe(2);
    p.props[UI_MODE_PROPERTY] = 0;
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
    await ticks(6);
    expect(p.props[UI_MODE_PROPERTY]).toBe(2);
    expect(p.props["pet:model_id"]).toBe(2);
  });

  it("Reset clears the mode and its preference", async () => {
    const p = petPlayer("reset");
    command("ui", p, "no_player");
    await ticks(3);
    expect(p.props[UI_MODE_PROPERTY]).toBe(4);
    command("reset", p);
    await ticks(6);
    expect(p.props[UI_MODE_PROPERTY]).toBe(0);
    expect(p.dynamic[UI_MODE_PREFERENCE]).toBeUndefined();
  });

  it("A choice outside the list is refused without a write", async () => {
    const p = petPlayer("bad");
    const writes = p.writes.length;
    command("ui", p, "pet_native");
    await ticks(3);
    expect(text(p)).toContain("ERROR");
    expect(p.writes.length).toBe(writes);
    expect(p.props[UI_MODE_PROPERTY]).toBe(0);
    expect(p.dynamic[UI_MODE_PREFERENCE]).toBeUndefined();
  });
});
