// Every pet: command exists from startup on: Bedrock accepts registerCommand only inside system.beforeEvents.startup
// and silently ignores anything later, so registration must not wait for the world, a player or the pack probe.
import { beforeEach, describe, expect, it } from "vitest";
import { runFeature } from "../../../src/core/feature.ts";
import { pets } from "../../../src/features/pets/index.ts";
import { INACTIVE_MESSAGE, PET_COMMAND_NAMES, petsActive } from "../../../src/features/pets/main.ts";
import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  EntityTypes,
  loadWorld,
  registerEntityType,
  registry,
  reset,
  startup,
  system,
  ticks,
  world,
} from "../../mocks/minecraft-server.ts";
import { ui } from "../../mocks/minecraft-server-ui.ts";
import { command, petPlayer, text, withLogs } from "./helpers.ts";

/** The commands docs/features/pets.md documents, by name; the registered set must be exactly this. */
const DOCUMENTED = [
  "form",
  "forms",
  "book",
  "menu",
  "settings",
  "view",
  "handheight",
  "handreset",
  "motion",
  "armor",
  "gear",
  "seatinfo",
  "seatheight",
  "seatreset",
  "armorlift",
  "armorscale",
  "armorfitreset",
  "check",
  "rbowcheck",
  "diagnose",
  "clientcheck",
  "debug",
  "ui",
  "probe",
  "cleanup",
  "snapshot",
  "compare",
  "reset",
].map((name) => `pet:${name}`);
const ENUMS = ["pet:form_choice", "pet:debug_choice", "pet:view_choice", "pet:armor_choice", "pet:ui_choice"];
const NAME = /^pet:[a-z][a-z0-9_]*$/;
const PARAMETER = /^[a-z][a-z0-9_]*$/;
const ENUM_VALUE = /^[a-z][a-z0-9_]*$/;
const PARAM_TYPES = new Set(Object.values(CustomCommandParamType));

beforeEach(() => {
  reset();
  ui.reset();
});

describe("pet: command registration", () => {
  it("registers every documented command and enum during startup, with no pack data, player or world", async () => {
    // Nothing is declared: no pet entity types, no players, no world load. Startup is all the feature gets.
    expect(EntityTypes.get("pet:diag_model")).toBeUndefined();
    const logs = await withLogs(() => {
      runFeature(pets);
      startup();
    });
    expect(logs).toEqual([]);
    expect([...registry.commands.keys()].sort()).toEqual([...DOCUMENTED].sort());
    expect([...PET_COMMAND_NAMES].sort()).toEqual([...DOCUMENTED].sort());
    expect([...registry.enums.keys()].sort()).toEqual([...ENUMS].sort());
    expect(registry.namespace).toBe("pet");
    // World load starts the feature; it registers nothing more and nothing less.
    loadWorld();
    await ticks(30);
    expect(registry.commands.size).toBe(DOCUMENTED.length);
    expect(registry.enums.size).toBe(ENUMS.length);
  });

  it("registers only what the engine accepts: enums before use, known parameter types, [a-z0-9_] names", () => {
    runFeature(pets);
    startup();
    for (const [name, values] of registry.enums) {
      expect(name).toMatch(NAME);
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) expect(value, name).toMatch(ENUM_VALUE);
    }
    for (const [name, { definition }] of registry.commands) {
      expect(name).toMatch(NAME);
      expect(definition.name).toBe(name);
      expect(typeof definition.description).toBe("string");
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.permissionLevel).toBe(CommandPermissionLevel.Any);
      expect(definition.cheatsRequired).toBe(false);
      expect(definition.optionalParameters ?? []).toEqual([]);
      for (const parameter of definition.mandatoryParameters ?? []) {
        expect(PARAM_TYPES.has(parameter.type), `${name} ${parameter.name}`).toBe(true);
        if (parameter.type === CustomCommandParamType.Enum) {
          // The mock refuses a command naming an enum that is not registered yet, so reaching here proves the order.
          expect(registry.enums.has(parameter.name), `${name} ${parameter.name}`).toBe(true);
        } else {
          expect(parameter.name, name).toMatch(PARAMETER);
        }
      }
    }
  });

  it("registers from startup even when the engine gives the registry to the feature only once", () => {
    runFeature(pets);
    expect(registry.commands.size).toBe(0);
    startup();
    expect(registry.commands.size).toBe(DOCUMENTED.length);
    // A second startup in the same module life would be the engine's mistake; it must not throw here either.
    expect(system.beforeEvents.startup.size).toBe(1);
  });
});

describe("handlers check the pack instead of the registry", () => {
  it("answers 'Pets is not active' while the pack data is missing and runs the command once it is there", async () => {
    runFeature(pets);
    startup();
    loadWorld();
    const p = petPlayer("p");
    expect(petsActive()).toBe(false);
    const refused = command("form", p, "carter");
    expect(refused.status).toBe(CustomCommandStatus.Failure);
    expect(refused.message).toBe(INACTIVE_MESSAGE);
    expect(refused.message).toMatch(/activating "ElleeDog 67 Pets" \(Behavior Packs\) in Edit World/);
    await ticks(6);
    expect(p.writes).toEqual([]);
    expect(p.messages).toEqual([]);
    registerEntityType("pet:diag_model");
    expect(petsActive()).toBe(true);
    expect(command("form", p, "carter").status).toBe(CustomCommandStatus.Success);
    await ticks(6);
    expect(p.props["pet:model_id"]).toBe(1);
    expect(text(p)).toMatch(/Selected Carter/);
  });

  it("keeps the read-only diagnostics answering without the pack data", async () => {
    runFeature(pets);
    startup();
    loadWorld();
    const p = petPlayer("p");
    for (const name of ["check", "diagnose", "clientcheck", "rbowcheck", "forms"]) {
      expect(command(name, p).status, name).toBe(CustomCommandStatus.Success);
    }
    await ticks(6);
    expect(text(p)).toMatch(/valid properties/);
    expect(text(p)).toMatch(/Available forms/);
    expect(p.writes).toEqual([]);
  });

  it("still refuses a non-player origin first, whatever the pack state", () => {
    runFeature(pets);
    startup();
    loadWorld();
    const console = command("forms", undefined);
    expect(console.status).toBe(CustomCommandStatus.Failure);
    expect(console.message).toBe("Run directly as a player.");
    expect(world.getAllPlayers()).toEqual([]);
  });
});
