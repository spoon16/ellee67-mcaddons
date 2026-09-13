// Mocked API regression tests. No assertions of Bedrock pack loading or rendering.
import { beforeEach, describe, expect, it } from "vitest";
import { transitionForm } from "../../../src/features/pets/appearance.js";
import {
  checkLines,
  inspectProperties,
  lastFailure,
  PROPERTY_KEYS,
  requireProperties,
} from "../../../src/features/pets/property_health.js";
import { leavePlayer, registry, reset, ticks, world } from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { command, type PetPlayer, petPlayer, silent, start, thrown } from "./helpers.ts";

function reportFrom(p: PetPlayer) {
  const line = p.chat.find((entry) => entry.includes('"propertyHealth":'));
  if (!line) throw new Error("The diagnostic report was not sent.");
  return JSON.parse(line.slice(line.indexOf("{")));
}

beforeEach(() => {
  reset();
  ui.reset();
  start();
});

describe("property inspection", () => {
  it("Model zero and false property values are valid, not missing", () => {
    const p = petPlayer("p");
    for (const key of PROPERTY_KEYS) if (typeof p.props[key] === "boolean") p.props[key] = false;
    const h = inspectProperties(p);
    expect(h.status).toBe("READY");
    expect(h.model).toBe(0);
    expect(h.serverForm).toBe("player");
    expect(h.validCount).toBe(19);
  });

  for (const [id, name] of [
    [1, "carter"],
    [2, "mochi"],
    [3, "casper"],
  ] as const) {
    it(`Actual ${name} model read is not inferred from saved preference`, () => {
      const p = petPlayer("p");
      p.props["pet:model_id"] = id;
      p.dynamic["pet:preferred_form"] = "human";
      expect(inspectProperties(p).serverForm).toBe(name);
    });
  }

  it("Missing model is retained as null plus missing status in serialized report", () => {
    const p = petPlayer("p");
    delete p.props["pet:model_id"];
    const h = JSON.parse(JSON.stringify(inspectProperties(p)));
    expect(h.model).toBeNull();
    expect(h.modelStatus).toBe("missing");
    expect(h.serverForm).toBeNull();
    expect(h.status).toBe("PARTIAL_DEFINITION");
    expect(h.properties["pet:model_id"].status).toBe("missing");
    expect(h.missing).toEqual(["pet:model_id"]);
  });

  it("All missing properties produce MISSING_DEFINITION, not Player", () => {
    const p = petPlayer("p");
    p.props = {};
    p.dynamic["pet:preferred_form"] = "carter";
    const h = inspectProperties(p);
    expect(h.status).toBe("MISSING_DEFINITION");
    expect(h.validCount).toBe(0);
    expect(h.missing).toHaveLength(19);
    expect(h.serverForm).toBeNull();
  });

  it("Enum/string model is INVALID_VALUES, not a missing data claim", () => {
    const p = petPlayer("p");
    p.props["pet:model_id"] = "carter";
    const h = inspectProperties(p);
    expect(h.status).toBe("INVALID_VALUES");
    expect(h.model).toBe("carter");
    expect(h.modelStatus).toBe("invalid");
    expect(h.serverForm).toBeNull();
    expect(h.missing).toEqual([]);
  });

  it("Unknown reserved numeric ID is not mislabeled Player", () => {
    const p = petPlayer("p");
    p.props["pet:model_id"] = 37;
    const h = inspectProperties(p);
    expect(h.status).toBe("UNREGISTERED_MODEL");
    expect(h.model).toBe(37);
    expect(h.serverForm).toBeNull();
  });

  it("Read exception is not mislabeled missing", () => {
    const p = petPlayer("p");
    p.getProperty = () => {
      throw new Error("entity loading");
    };
    const h = inspectProperties(p);
    expect(h.status).toBe("READ_ERROR");
    expect(h.readErrors).toHaveLength(19);
    expect(h.missing).toEqual([]);
    expect(h.properties["pet:model_id"]?.error).toBe("entity loading");
  });

  it("Non-finite values remain explicit invalid after JSON serialization", () => {
    const p = petPlayer("p");
    p.props["pet:seat_lift"] = Number.NaN;
    const h = JSON.parse(JSON.stringify(inspectProperties(p)));
    expect(h.status).toBe("INVALID_VALUES");
    expect(h.properties["pet:seat_lift"].value).toBeNull();
    expect(h.properties["pet:seat_lift"].status).toBe("invalid");
  });

  it("Inspection never mutates inventory, preferences or properties", () => {
    const p = petPlayer("p");
    p.getComponent = () => {
      throw new Error("must not inspect inventory");
    };
    const before = structuredClone(p.dynamic);
    inspectProperties(p);
    checkLines(p, 1);
    requireProperties(p);
    expect(p.writes).toHaveLength(0);
    expect(p.dynamic).toEqual(before);
  });

  it("Missing-property form preflight does not manufacture values or change saved form", () => {
    const p = petPlayer("p");
    p.dynamic["pet:preferred_form"] = "mochi";
    delete p.props["pet:model_id"];
    const error = thrown(() => transitionForm(p, "carter"));
    expect(error.propertyReport.modelStatus).toBe("missing");
    expect(error.message).toContain("/pet:check");
    expect(error.message).not.toContain("Activate both");
    expect(p.writes).toHaveLength(0);
    expect(p.dynamic["pet:preferred_form"]).toBe("mochi");
  });

  it("Partial missing newer seat property is listed separately from healthy model", () => {
    const p = petPlayer("p");
    delete p.props["pet:seat_lift"];
    const h = inspectProperties(p);
    expect(h.model).toBe(0);
    expect(h.serverForm).toBe("player");
    expect(h.missing).toEqual(["pet:seat_lift"]);
    expect(h.validCount).toBe(18);
  });

  it("Property check reports a missing model even with a present saved preference", () => {
    const p = petPlayer("p");
    delete p.props["pet:model_id"];
    p.dynamic["pet:preferred_form"] = "casper";
    const c = checkLines(p, 77);
    expect(c.lines.join("\n")).toMatch(/pet:model_id=MISSING/);
    expect(c.lines.join("\n")).toMatch(/observed form=UNAVAILABLE/);
  });
});

describe("diagnostic commands", () => {
  it("/pet:check is self-only, read-only and does not request cheats", async () => {
    const p = petPlayer("check-p");
    const q = petPlayer("check-q");
    command("check", p);
    await ticks(4);
    expect(p.chat[0]).toMatch(/READY.*19\/19/);
    expect(p.chat[0]).toMatch(/pet:model_id=0/);
    expect(q.messages).toHaveLength(0);
    expect(p.writes).toHaveLength(0);
    expect(registry.commands.get("pet:check")?.definition.cheatsRequired).toBe(false);
  });

  it("/pet:diagnose retains missing fields rather than producing normal-looking fallback JSON", async () => {
    const p = petPlayer("json-missing");
    delete p.props["pet:model_id"];
    delete p.props["pet:armor_fit"];
    await silent(async () => {
      command("diagnose", p);
      await ticks(4);
    });
    const h = reportFrom(p);
    expect(h.model).toBeNull();
    expect(h.armorFit).toBeNull();
    expect(h.serverForm).toBeNull();
    expect(h.modelStatus).toBe("missing");
    expect(h.propertyHealth.validCount).toBe(17);
    expect(p.writes).toHaveLength(0);
  });

  it("Auxiliary inventory error cannot prevent property diagnosis", async () => {
    const p = petPlayer("bad-inventory");
    p.getComponent = () => {
      throw new Error("inventory unavailable");
    };
    await silent(async () => {
      command("diagnose", p);
      await ticks(4);
    });
    const h = reportFrom(p);
    expect(h.propertyStatus).toBe("READY");
    expect(h.sectionErrors.inventory).toMatch(/inventory unavailable/);
  });

  it("Failure snapshot distinguishes earlier missing data from current healthy reads", async () => {
    const p = petPlayer("later-ready");
    delete p.props["pet:model_id"];
    await silent(async () => {
      command("form", p, "carter");
      await ticks(4);
    });
    expect(lastFailure(p)?.modelStatus).toBe("missing");
    p.props["pet:model_id"] = 0;
    p.messages = [];
    command("check", p);
    await ticks(4);
    expect(p.chat[0]).toMatch(/READY/);
    expect(p.chat[0]).toMatch(/Last failure.*missing/);
    expect(p.writes).toHaveLength(0);
  });

  it("Lifecycle failure remains silent and is available on an explicit diagnostic", async () => {
    const p = petPlayer("silent-missing");
    delete p.props["pet:model_id"];
    await silent(async () => {
      world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: true });
      await ticks(60);
    });
    expect(p.messages).toHaveLength(0);
    expect(lastFailure(p)?.source).toBe("lifecycle");
    command("check", p);
    await ticks(3);
    expect(p.chat[0]).toMatch(/PARTIAL_DEFINITION/);
  });

  it("Failure records do not leak between players and are removed on leave", async () => {
    const p = petPlayer("failure-a");
    const q = petPlayer("failure-b");
    delete p.props["pet:model_id"];
    await silent(async () => {
      command("form", p, "carter");
      await ticks(4);
    });
    expect(lastFailure(p)).not.toBeNull();
    expect(lastFailure(q)).toBeNull();
    leavePlayer(p);
    expect(lastFailure(p)).toBeNull();
  });
});
