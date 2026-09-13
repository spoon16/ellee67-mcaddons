import { beforeEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../src/core/bootstrap.ts";
import { disabledMessage, FEATURE_ENUM, gatedRegistries } from "../../src/core/commands.ts";
import { defineFeatures, isEnabled, isRunning, startEnabledFeatures } from "../../src/core/features.ts";
import {
  addPlayer,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  loadWorld,
  registry,
  reset,
  runCommand,
  startup,
  step,
} from "../mocks/minecraft-server.ts";
import { fakeFeature } from "./helpers.ts";

function boot(features: ReturnType<typeof fakeFeature>[]) {
  bootstrap(features.map((entry) => entry.definition));
}

beforeEach(() => reset());

describe("core commands", () => {
  it("registers the enum, the four core commands and the book component at startup", async () => {
    boot([fakeFeature("pets")]);
    startup();
    expect(registry.enums.get(FEATURE_ENUM)).toEqual([
      "pets",
      "stair-sit",
      "creeper-mod",
      "ender-mod",
      "redstone-guide",
      "rbow-ore",
    ]);
    for (const name of ["elleedog67:enable", "elleedog67:disable", "elleedog67:features", "elleedog67:book"]) {
      expect(registry.commands.has(name), name).toBe(true);
    }
    const enable = registry.commands.get("elleedog67:enable")?.definition;
    expect(enable.permissionLevel).toBe(CommandPermissionLevel.Admin);
    expect(enable.cheatsRequired).toBe(false);
    expect(enable.mandatoryParameters).toEqual([{ name: FEATURE_ENUM, type: CustomCommandParamType.Enum }]);
    expect(registry.commands.get("elleedog67:features")?.definition.permissionLevel).toBe(CommandPermissionLevel.Any);
    expect(registry.components.has("elleedog67:open_feature_menu")).toBe(true);
  });

  it("falls back to a text parameter when the engine rejects the enum values", async () => {
    boot([fakeFeature("stair-sit")]);
    registry.rejectEnumValues = /-/;
    startup();
    expect(registry.enums.has(FEATURE_ENUM)).toBe(false);
    const enable = registry.commands.get("elleedog67:enable")?.definition;
    expect(enable.mandatoryParameters).toEqual([{ name: "feature", type: CustomCommandParamType.String }]);
    loadWorld();
    const player = addPlayer("Op");
    expect(runCommand("elleedog67:disable", { sourceEntity: player }, "stair_sit").status).toBe(
      CustomCommandStatus.Success,
    );
    step(1);
    expect(isEnabled("stair-sit")).toBe(false);
  });

  it("toggles a feature on the next tick and tells the player what happened", async () => {
    const pets = fakeFeature("pets");
    boot([pets]);
    startup();
    loadWorld();
    expect(pets.log.starts).toBe(1);
    const player = addPlayer("Op");
    const result = runCommand("elleedog67:disable", { sourceEntity: player }, "pets");
    expect(result.status).toBe(CustomCommandStatus.Success);
    expect(isRunning("pets")).toBe(true);
    step(1);
    expect(isRunning("pets")).toBe(false);
    expect(pets.log.stops).toBe(1);
    expect(player.chat).toEqual(["Pets disabled."]);
    runCommand("elleedog67:disable", { sourceEntity: player }, "pets");
    step(1);
    expect(player.chat[player.chat.length - 1]).toBe("Pets was already disabled.");
    runCommand("elleedog67:enable", { sourceEntity: player }, "PETS");
    step(1);
    expect(player.chat[player.chat.length - 1]).toBe("Pets enabled.");
    expect(pets.log.starts).toBe(2);
  });

  it("rejects unknown feature names without touching state", async () => {
    boot([fakeFeature("pets")]);
    startup();
    loadWorld();
    const result = runCommand("elleedog67:enable", {}, "dragons");
    expect(result.status).toBe(CustomCommandStatus.Failure);
    expect(result.message).toContain('Unknown feature "dragons"');
    expect(result.message).toContain("pets, stair-sit");
  });

  it("lists every feature with its state and the pack hint for absent packs", async () => {
    let present = true;
    boot([
      fakeFeature("pets", { kind: "pack", packs: ["pets", "pets-resources"], installed: () => present }),
      fakeFeature("creeper-mod", { defaultEnabled: false }),
      fakeFeature("stair-sit"),
    ]);
    startup();
    loadWorld();
    expect(runCommand("elleedog67:features", {}).message).toBe("pets: active\ncreeper-mod: off\nstair-sit: on");
    present = false;
    loadWorld();
    const result = runCommand("elleedog67:features", {});
    expect(result.status).toBe(CustomCommandStatus.Success);
    expect(result.message).toBe(
      'pets: packs off (Pets is turned on by activating "ElleeDog 67 Pets" (Behavior Packs) in Edit World. Its resource pack is added automatically.)\ncreeper-mod: off\nstair-sit: on',
    );
  });

  it("refuses to switch a pack feature and points at its packs instead", async () => {
    const pets = fakeFeature("pets", { kind: "pack", packs: ["pets", "pets-resources"], installed: () => false });
    boot([pets]);
    startup();
    loadWorld();
    const player = addPlayer("Op");
    const enable = runCommand("elleedog67:enable", { sourceEntity: player }, "pets");
    expect(enable.status).toBe(CustomCommandStatus.Failure);
    expect(enable.message).toBe(
      'Pets is turned on by activating "ElleeDog 67 Pets" (Behavior Packs) in Edit World. Its resource pack is added automatically.',
    );
    const disable = runCommand("elleedog67:disable", { sourceEntity: player }, "pets");
    expect(disable.status).toBe(CustomCommandStatus.Failure);
    expect(disable.message).toBe(
      'Pets is turned off by deactivating "ElleeDog 67 Pets" (Behavior Packs) and "ElleeDog 67 Pets Resources" (Resource Packs) in Edit World.',
    );
    step(1);
    expect(pets.log.starts).toBe(0);
    expect(player.chat).toEqual([]);
  });

  it("keeps registering the other features when one feature's register() throws", async () => {
    const good = fakeFeature("pets", {
      register({ commands }) {
        commands.registerCommand(
          { name: "pet:hello", description: "hi", permissionLevel: CommandPermissionLevel.Any },
          () => ({ status: CustomCommandStatus.Success }),
        );
      },
    });
    const bad = fakeFeature("ender-mod", {
      register() {
        throw new Error("boom");
      },
    });
    const later = fakeFeature("stair-sit", {
      register({ commands }) {
        commands.registerCommand(
          { name: "sit:hello", description: "hi", permissionLevel: CommandPermissionLevel.Any },
          () => ({ status: CustomCommandStatus.Success }),
        );
      },
    });
    boot([good, bad, later]);
    startup();
    expect(registry.commands.has("pet:hello")).toBe(true);
    expect(registry.commands.has("sit:hello")).toBe(true);
  });
});

describe("gated registries", () => {
  it("refuses a feature command while the feature is disabled and passes it through otherwise", () => {
    const pets = fakeFeature("pets", { defaultEnabled: false });
    defineFeatures([pets.definition]);
    let calls = 0;
    const gated = gatedRegistries(pets.definition, {
      customCommandRegistry: registry,
      itemComponentRegistry: registry,
    });
    gated.commands.registerCommand(
      { name: "pet:form", description: "x", permissionLevel: CommandPermissionLevel.Any },
      () => {
        calls++;
        return { status: CustomCommandStatus.Success, message: "ok" };
      },
    );
    loadWorld();
    const refused = runCommand("pet:form", {});
    expect(refused).toEqual({ status: CustomCommandStatus.Failure, message: disabledMessage(pets.definition) });
    expect(refused.message).toBe("Pets is disabled. An operator can run /elleedog67:enable pets.");
    expect(calls).toBe(0);
    pets.definition.defaultEnabled = true;
    expect(runCommand("pet:form", {}).message).toBe("ok");
    expect(calls).toBe(1);
  });

  it("refuses a pack feature's command with the pack hint until the probe finds its packs", () => {
    let present = false;
    const pets = fakeFeature("pets", { kind: "pack", packs: ["pets", "pets-resources"], installed: () => present });
    defineFeatures([pets.definition]);
    let calls = 0;
    const gated = gatedRegistries(pets.definition, {
      customCommandRegistry: registry,
      itemComponentRegistry: registry,
    });
    gated.commands.registerCommand(
      { name: "pet:form", description: "x", permissionLevel: CommandPermissionLevel.Any },
      () => {
        calls++;
        return { status: CustomCommandStatus.Success, message: "ok" };
      },
    );
    startEnabledFeatures();
    const refused = runCommand("pet:form", {});
    expect(refused.status).toBe(CustomCommandStatus.Failure);
    expect(refused.message).toBe(
      'Pets is not active. Pets is turned on by activating "ElleeDog 67 Pets" (Behavior Packs) in Edit World. Its resource pack is added automatically.',
    );
    expect(calls).toBe(0);
    present = true;
    startEnabledFeatures();
    expect(runCommand("pet:form", {}).message).toBe("ok");
    expect(calls).toBe(1);
  });

  it("silences item component callbacks while disabled and keeps non-function fields", () => {
    const guide = fakeFeature("redstone-guide", { defaultEnabled: false });
    defineFeatures([guide.definition]);
    const gated = gatedRegistries(guide.definition, {
      customCommandRegistry: registry,
      itemComponentRegistry: registry,
    });
    let uses = 0;
    gated.items.registerCustomComponent("elleedog_redstone:open_guide", {
      onUse: () => {
        uses++;
      },
    });
    const component = registry.components.get("elleedog_redstone:open_guide");
    component?.onUse({});
    expect(uses).toBe(0);
    guide.definition.defaultEnabled = true;
    component?.onUse({});
    expect(uses).toBe(1);
  });
});
