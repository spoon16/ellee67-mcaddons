import { beforeEach, describe, expect, it } from "vitest";
import { PETS } from "../../../src/features/pets/catalog.generated.js";
import { cleanupProbes, spawnProbes } from "../../../src/features/pets/probes.js";
import {
  CustomCommandStatus,
  dimensions,
  engine,
  registry,
  reset,
  ticks,
  world,
} from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { command, petPlayer, shownForm, start, text } from "./helpers.ts";

/** Fills the block the probe preflight checks in front of a player standing at the origin facing +z. */
function blockProbeArea() {
  dimensions.overworld.setBlock({ x: 0, y: 64, z: 2 }, "minecraft:stone");
}

beforeEach(() => {
  reset();
  ui.reset();
  start();
});

describe("command registration", () => {
  it("All command choices are generated from catalog and use pet namespace", () => {
    expect(registry.enums.get("pet:form_choice")).toEqual(["player", ...PETS.map((p) => p.id), "human"]);
    const names = [...registry.commands.keys()];
    expect(names.filter((name) => name.startsWith("pet:"))).toHaveLength(24);
    expect(names.filter((name) => !name.startsWith("pet:"))).toEqual([
      "elleedog67:enable",
      "elleedog67:disable",
      "elleedog67:features",
      "elleedog67:book",
    ]);
    expect(registry.commands.size).toBe(28);
  });

  it("Commands are self-only and do not require cheats", () => {
    for (const [name, { definition }] of registry.commands) {
      if (!name.startsWith("pet:")) continue;
      expect(definition.permissionLevel, name).toBe(0);
      expect(definition.cheatsRequired, name).toBe(false);
    }
    expect(command("form", engine({ typeId: "minecraft:pig" }), "carter").status).toBe(CustomCommandStatus.Failure);
  });
});

describe("form commands", () => {
  it("Queued commands do not modify a disconnected player", async () => {
    const p = petPlayer("p");
    command("form", p, "mochi");
    p.isValid = false;
    await ticks(6);
    expect(p.writes).toHaveLength(0);
  });

  it("Carter/Mochi simultaneous commands are independent", async () => {
    const a = petPlayer("a");
    const b = petPlayer("b");
    command("form", a, "carter");
    command("form", b, "mochi");
    await ticks(6);
    expect(a.props["pet:model_id"]).toBe(1);
    expect(b.props["pet:model_id"]).toBe(2);
  });

  it("Rapid selections report only the latest result", async () => {
    const p = petPlayer("rapid");
    command("form", p, "carter");
    command("form", p, "mochi");
    await ticks(6);
    expect(p.props["pet:model_id"]).toBe(2);
    expect(text(p)).not.toContain("ERROR");
    expect(text(p)).toContain("Mochi");
  });

  it("Explicit form selection resets view override but preserves calibration", async () => {
    const p = petPlayer("p");
    command("view", p, "native");
    command("handheight", p, 2);
    command("form", p, "mochi");
    await ticks(6);
    expect(p.props["pet:view"]).toBe("paws");
    expect(p.props["pet:hand_height"]).toBe(2);
  });

  it("Fitted armor changes a presentation flag only", async () => {
    const p = petPlayer("p");
    const item = p.items[0];
    command("form", p, "carter");
    await ticks(5);
    command("armor", p, "fitted");
    await ticks(6);
    expect(p.props["pet:armor_fit"]).toBe(true);
    expect(p.items[0]).toBe(item);
    command("armor", p, "native");
    await ticks(6);
    expect(p.props["pet:armor_fit"]).toBe(false);
  });

  it("Snapshot/transform/compare is non-destructive", async () => {
    const p = petPlayer("p");
    command("snapshot", p);
    await ticks(3);
    command("form", p, "mochi");
    await ticks(5);
    command("compare", p);
    await ticks(3);
    expect(text(p)).toContain("PASS: captured");
  });

  it("Reset restores defaults without destroying unrelated state", async () => {
    const p = petPlayer("reset");
    p.dynamic["other:keep"] = "yes";
    p.dynamic["pet:hand_height_preference"] = 8;
    command("reset", p);
    await ticks(6);
    expect(p.props["pet:model_id"]).toBe(0);
    expect(p.props["pet:hand_height"]).toBe(0);
    expect(p.props["pet:armor_fit"]).toBe(false);
    expect(p.dynamic["other:keep"]).toBe("yes");
  });
});

describe("lifecycle restore", () => {
  it("Existing 0.2.1 settings and calibration survive upgrade", async () => {
    const p = petPlayer("upgrade");
    p.dynamic = {
      "pet:preferred_form": "carter",
      "pet:hand_height_preference": 2,
      "pet:first_person_view": "paws",
      "other:untouched": 17,
    };
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
    await ticks(6);
    expect(p.props["pet:model_id"]).toBe(1);
    expect(p.props["pet:hand_height"]).toBe(2);
    expect(p.dynamic["other:untouched"]).toBe(17);
  });

  it("Legacy preference migration does not alter the inventory", async () => {
    const p = petPlayer("legacy");
    const item = p.items[0];
    p.dynamic["cav:preferred_form"] = "cavalier";
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
    await ticks(6);
    expect(p.dynamic["pet:preferred_form"]).toBe("carter");
    expect(p.items[0]).toBe(item);
  });

  it("Respawn restores Mochi and custom height", async () => {
    const p = petPlayer("respawn");
    p.dynamic["pet:preferred_form"] = "mochi";
    p.dynamic["pet:hand_height_preference"] = 4;
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: false });
    await ticks(6);
    expect(p.props["pet:model_id"]).toBe(2);
    expect(p.props["pet:hand_height"]).toBe(4);
  });

  it("Dimension change resynchronizes preferences", async () => {
    const p = petPlayer("dimension");
    p.dynamic["pet:preferred_form"] = "mochi";
    world.afterEvents.playerDimensionChange.emit({ player: p });
    await ticks(6);
    expect(p.props["pet:model_id"]).toBe(2);
  });

  it("Missing property restore retries are bounded", async () => {
    const p = petPlayer("missing");
    delete p.props["pet:model_id"];
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: false });
    await ticks(60);
    expect(p.dynamic["pet:preferred_form"]).toBeUndefined();
    expect(p.messages).toHaveLength(0);
  });
});

describe("diagnostics and menus", () => {
  it("Clientcheck asks client to translate a version key; does not fabricate success", async () => {
    const p = petPlayer("p");
    command("clientcheck", p);
    await ticks(3);
    expect(p.messages[0]).toEqual({ translate: "pet.diag.rp_052" });
    expect(p.writes).toHaveLength(0);
  });

  it("Diagnostic command is read-only", async () => {
    const p = petPlayer("p");
    command("diagnose", p);
    await ticks(3);
    expect(p.writes).toHaveLength(0);
    expect(text(p)).toContain("serverForm");
  });

  for (const [i, pet] of PETS.entries()) {
    it(`Menu is catalog-generated with a matching handler for ${pet.display_name}`, async () => {
      const p = petPlayer(`menu-${i}`);
      ui.responses = [
        { canceled: false, selection: 1 + i },
        { canceled: false, selection: 0 },
      ];
      command("menu", p);
      await ticks(10);
      expect(p.props["pet:model_id"]).toBe(pet.wire_id);
      expect(shownForm(0).buttons.some((b) => String(b.label).startsWith(pet.display_name))).toBe(true);
    });
  }

  it("Player menu entry restores native Player", async () => {
    const p = petPlayer("menu-human");
    p.props["pet:model_id"] = 2;
    ui.responses = [{ canceled: false, selection: 0 }];
    command("menu", p);
    await ticks(10);
    expect(p.props["pet:model_id"]).toBe(0);
  });

  it("Menu retry stops after three busy responses", async () => {
    const p = petPlayer("busy");
    ui.responses = Array(3).fill({ canceled: true, cancelationReason: "UserBusy" });
    command("menu", p);
    await ticks(50);
    expect(ui.shown).toBe(3);
  });

  it("Token opens the same catalog menu", async () => {
    const p = petPlayer("token");
    ui.responses = [
      { canceled: false, selection: 2 },
      { canceled: false, selection: 0 },
    ];
    registry.components.get("pet:open_form_menu")?.onUse({ source: p });
    await ticks(8);
    expect(p.props["pet:model_id"]).toBe(2);
  });
});

describe("test props", () => {
  it("Probes use the chosen model ID without changing the player", async () => {
    const p = petPlayer("probe");
    spawnProbes(world, p, PETS[1]);
    await ticks();
    expect(dimensions.overworld.entities[1]?.props["pet:model_id"]).toBe(2);
    expect(p.props["pet:model_id"]).toBe(0);
  });

  it("Probe cleanup respects ownership", () => {
    const a = petPlayer("a");
    const b = petPlayer("b");
    spawnProbes(world, a, PETS[0]);
    spawnProbes(world, b, PETS[1]);
    expect(cleanupProbes(world, a.id).removed).toBe(2);
    expect(dimensions.overworld.entities.filter((e) => e.isValid)).toHaveLength(2);
  });

  it("Probe blocked terrain fails without spawning", () => {
    const p = petPlayer("p");
    blockProbeArea();
    expect(() => spawnProbes(world, p, PETS[0])).toThrow(/not clear/);
    expect(dimensions.overworld.spawnCount).toBe(0);
  });

  it("Partial probe failure removes already-created props", () => {
    const p = petPlayer("p");
    dimensions.overworld.spawnFailAt = 2;
    expect(() => spawnProbes(world, p, PETS[0])).toThrow();
    expect(dimensions.overworld.entities.filter((e) => e.isValid)).toHaveLength(0);
  });
});
