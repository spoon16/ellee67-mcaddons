import { beforeEach, describe, expect, it } from "vitest";
import { CustomCommandStatus, reset, ticks, world } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { command, petPlayer, start, text } from "./helpers.ts";

const TRIMS = "pet:armor_fit_trims";

beforeEach(() => {
  reset();
  ui.reset();
  start();
});

describe("fitted armor calibration", () => {
  it("saves lift and scale per pet and reapplies them when that pet is chosen again", async () => {
    const p = petPlayer("p");
    command("form", p, "carter");
    await ticks(6);
    expect(command("armorlift", p, 2.5).status).toBe(CustomCommandStatus.Success);
    await ticks(6);
    expect(p.props["pet:armor_lift"]).toBe(2.5);
    expect(p.props["pet:armor_scale"]).toBe(1);
    expect(text(p)).toContain("Carter fitted armor: lift 2.5 pixels, scale 100%");
    command("armorscale", p, 90);
    await ticks(6);
    expect(p.props["pet:armor_scale"]).toBe(0.9);
    expect(text(p)).toContain("lift 2.5 pixels, scale 90%");
    expect(JSON.parse(p.dynamic[TRIMS] as string)).toEqual({ carter: { lift: 2.5, scale: 0.9 } });

    command("form", p, "mochi");
    await ticks(6);
    expect(p.props["pet:armor_lift"]).toBe(0);
    expect(p.props["pet:armor_scale"]).toBe(1);
    command("form", p, "carter");
    await ticks(6);
    expect(p.props["pet:armor_lift"]).toBe(2.5);
    expect(p.props["pet:armor_scale"]).toBe(0.9);
    expect(text(p)).not.toContain("ERROR");
  });

  it("is neutral for Player and refuses calibration until a pet is chosen", async () => {
    const p = petPlayer("p");
    command("armorlift", p, 3);
    await ticks(6);
    expect(text(p)).toContain("ERROR: Choose a pet first");
    expect(p.props["pet:armor_lift"]).toBe(0);
    expect(p.dynamic[TRIMS]).toBeUndefined();
    command("form", p, "casper");
    await ticks(6);
    command("armorlift", p, -1.25);
    await ticks(6);
    command("form", p, "player");
    await ticks(6);
    expect(p.props["pet:armor_lift"]).toBe(0);
    expect(p.props["pet:armor_scale"]).toBe(1);
    expect(JSON.parse(p.dynamic[TRIMS] as string)).toEqual({ casper: { lift: -1.25, scale: 1 } });
  });

  it("rejects values outside the property ranges without touching the saved numbers", async () => {
    const p = petPlayer("p");
    command("form", p, "mochi");
    await ticks(6);
    command("armorlift", p, 4);
    await ticks(6);
    for (const [name, value] of [
      ["armorlift", 16.5],
      ["armorlift", Number.NaN],
      ["armorscale", 49],
      ["armorscale", 151],
      ["armorscale", 90.5],
    ] as const) {
      command(name, p, value);
    }
    await ticks(6);
    expect(text(p).match(/ERROR: Armor lift must be a number from -16 to 16/g)).toHaveLength(2);
    expect(text(p).match(/ERROR: Armor scale must be a whole percentage from 50 to 150/g)).toHaveLength(3);
    expect(p.props["pet:armor_lift"]).toBe(4);
    expect(p.props["pet:armor_scale"]).toBe(1);
    expect(JSON.parse(p.dynamic[TRIMS] as string)).toEqual({ mochi: { lift: 4, scale: 1 } });
  });

  it("clears one pet with /pet:armorfitreset and every pet with /pet:reset", async () => {
    const p = petPlayer("p");
    command("form", p, "carter");
    await ticks(6);
    command("armorscale", p, 110);
    await ticks(6);
    command("form", p, "mochi");
    await ticks(6);
    command("armorlift", p, 1);
    await ticks(6);
    command("armorfitreset", p);
    await ticks(6);
    expect(text(p)).toContain("Mochi fitted armor back to the baked position and size.");
    expect(p.props["pet:armor_lift"]).toBe(0);
    expect(JSON.parse(p.dynamic[TRIMS] as string)).toEqual({ carter: { lift: 0, scale: 1.1 } });
    command("reset", p);
    await ticks(6);
    expect(p.dynamic[TRIMS]).toBeUndefined();
    expect(p.props["pet:model_id"]).toBe(0);
    expect(p.props["pet:armor_scale"]).toBe(1);
  });

  it("survives an explicit form selection, like hand height, and is restored on rejoin", async () => {
    const p = petPlayer("p");
    command("form", p, "casper");
    await ticks(6);
    command("armorlift", p, 0.5);
    await ticks(6);
    command("view", p, "native");
    await ticks(6);
    command("form", p, "casper");
    await ticks(6);
    expect(p.props["pet:view"]).toBe("paws");
    expect(p.props["pet:armor_lift"]).toBe(0.5);
    p.props["pet:armor_lift"] = 0;
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
    await ticks(12);
    expect(p.props["pet:armor_lift"]).toBe(0.5);
  });
});
