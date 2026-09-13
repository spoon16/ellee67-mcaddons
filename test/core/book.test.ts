import { beforeEach, describe, expect, it } from "vitest";
import { BOOK_ID, BOOK_LORE, BOOK_TITLE, hasBook, isBookHolder } from "../../src/core/book.ts";
import { bootstrap } from "../../src/core/bootstrap.ts";
import { isEnabled, isRunning } from "../../src/core/features.ts";
import { openManual } from "../../src/core/manual.ts";
import { packs } from "../../src/core/packs.ts";
import {
  addPlayer,
  CommandPermissionLevel,
  CustomCommandStatus,
  EntityTypes,
  engine,
  ItemStack,
  joinPlayer,
  loadWorld,
  registerEntityType,
  registry,
  reset,
  runCommand,
  startup,
  step,
  ticks,
} from "../mocks/minecraft-server.ts";
import { type ActionFormData, ui } from "../mocks/minecraft-server-ui.ts";
import { fakeFeature } from "./helpers.ts";

function boot(features: ReturnType<typeof fakeFeature>[]) {
  bootstrap(features.map((entry) => entry.definition));
  startup();
  loadWorld();
}

function form(index: number): ActionFormData {
  return ui.forms[index] as ActionFormData;
}

function labels(index: number): string[] {
  return form(index).buttons.map((button) => String(button.label));
}

/** Queues a press of the button whose label matches, resolved against the form when it is shown. */
function press(label: string): void {
  ui.responses.push((shown) => {
    const selection = (shown as ActionFormData).buttons.findIndex((button) => String(button.label) === label);
    if (selection === -1) throw new Error(`No button "${label}" on ${(shown as ActionFormData).titleText}`);
    return { canceled: false, selection };
  });
}

/** Advances ticks until the manual session ends (switches wait a tick for `system.run`). */
async function drive(session: Promise<void>): Promise<void> {
  let done = false;
  session.then(() => {
    done = true;
  });
  for (let i = 0; i < 20 && !done; i++) await ticks(1);
  expect(done).toBe(true);
}

function manualFeatures() {
  return [
    fakeFeature("pets", {
      kind: "pack",
      packs: ["pets", "pets-resources"],
      installed: () => true,
      manual: { commands: ["/pet:form player|carter|mochi|casper", "/pet:book"] },
    }),
    fakeFeature("stair-sit", { manual: { commands: ["/sit:down and /sit:stand"] } }),
    fakeFeature("creeper-mod", { defaultEnabled: false }),
    fakeFeature("rbow-ore", { kind: "pack", packs: ["rbow-ore", "rbow-ore-resources"], installed: () => false }),
  ];
}

beforeEach(() => {
  reset();
  ui.reset();
});

describe("who gets the book", () => {
  it("matches ElleeDog handles regardless of case, spaces and suffixes", () => {
    for (const name of ["ElleeDog", "elleedog", "ElleeDog67", "ElleeDog 67", "ELLEEDOG_Plays"]) {
      expect(isBookHolder({ name }), name).toBe(true);
    }
    for (const name of ["Steve", "Dog", "MyElleeDog", "Ellee"]) {
      expect(isBookHolder({ name }), name).toBe(false);
    }
  });

  it("hands the book to ElleeDog on first spawn and never duplicates it", async () => {
    boot([fakeFeature("pets")]);
    const ellee = joinPlayer("ElleeDog 67");
    const steve = joinPlayer("Steve");
    step(1);
    expect(hasBook(engine(ellee))).toBe(true);
    expect(ellee.inventory.getItem(0)?.nameTag).toBe(BOOK_TITLE);
    expect(ellee.inventory.getItem(0)?.getLore()).toEqual([BOOK_LORE]);
    expect(hasBook(engine(steve))).toBe(false);
    joinPlayer("ElleeDog 67", false);
    step(1);
    expect(ellee.inventory.items.filter((item) => item?.typeId === BOOK_ID)).toHaveLength(1);
  });

  it("gives players already online a book when the world loads", async () => {
    bootstrap([fakeFeature("pets").definition]);
    startup();
    const ellee = addPlayer("ElleeDog");
    loadWorld();
    expect(hasBook(engine(ellee))).toBe(true);
  });

  it("gives operators a book through /elleedog67:book", async () => {
    boot([fakeFeature("pets")]);
    const op = addPlayer("Op");
    expect(runCommand("elleedog67:book", { sourceEntity: op }).status).toBe(CustomCommandStatus.Success);
    step(1);
    expect(hasBook(engine(op))).toBe(true);
    expect(op.chat).toEqual([`${BOOK_TITLE} added to your inventory.`]);
    expect(runCommand("elleedog67:book", {}).status).toBe(CustomCommandStatus.Failure);
  });
});

describe("the manual", () => {
  it("lists every feature on the home page with its state marker", async () => {
    boot(manualFeatures());
    const stranger = addPlayer("Steve");
    ui.responses.push({ canceled: true });
    await openManual(engine(stranger));
    expect(ui.shown).toBe(1);
    expect(form(0).titleText).toBe("ElleeDog 67");
    expect(form(0).bodyText).toContain("manual");
    expect(form(0).elements[0]).toEqual({ kind: "header", text: "Features" });
    expect(labels(0)).toEqual([
      "[ACTIVE] Pets",
      "[ON] Stair Sit",
      "[OFF] Creeper Mod",
      "[PACKS OFF] Rbow Ore",
      "Setup and packs",
      "Commands",
    ]);
  });

  it("marks a pack feature active only when the probe finds its data", async () => {
    const ore = fakeFeature("rbow-ore", {
      kind: "pack",
      packs: ["rbow-ore", "rbow-ore-resources"],
      installed: () => EntityTypes.get("elleedog:rbow_drop") !== undefined,
    });
    bootstrap([ore.definition]);
    startup();
    registerEntityType("elleedog:rbow_drop");
    loadWorld();
    const stranger = addPlayer("Steve");
    ui.responses.push({ canceled: true });
    await openManual(engine(stranger));
    expect(labels(0)[0]).toBe("[ACTIVE] Rbow Ore");
  });

  it("lets a stranger read a feature page without offering a switch", async () => {
    const features = manualFeatures();
    boot(features);
    const stranger = addPlayer("Steve");
    press("[ON] Stair Sit");
    ui.responses.push({ canceled: true });
    await openManual(engine(stranger));
    expect(ui.shown).toBe(2);
    expect(form(1).titleText).toBe("Stair Sit");
    expect(form(1).bodyText).toContain("stair-sit about");
    expect(form(1).bodyText).toContain("Now: Stair Sit is on.");
    expect(form(1).bodyText).toContain("/elleedog67:enable stair-sit and /elleedog67:disable stair-sit");
    expect(form(1).bodyText).toContain("While off: stair-sit while off");
    expect(form(1).bodyText).not.toContain("button below");
    expect(labels(1)).toEqual(["Back"]);
    expect(stranger.chat).toEqual([]);
    expect(isEnabled("stair-sit")).toBe(true);
  });

  it("lets ElleeDog switch a feature off from its page and shows the new state", async () => {
    const features = manualFeatures();
    boot(features);
    const stairSit = features[1];
    const ellee = addPlayer("ElleeDog");
    press("[ON] Stair Sit");
    press("Turn off");
    press("Back");
    ui.responses.push({ canceled: true });
    await drive(openManual(engine(ellee)));
    expect(ui.shown).toBe(4);
    expect(form(1).bodyText).toContain("Turn it on or off with the button below");
    expect(labels(1)).toEqual(["Turn off", "Back"]);
    expect(isRunning("stair-sit")).toBe(false);
    expect(isEnabled("stair-sit")).toBe(false);
    expect(stairSit?.log.stops).toBe(1);
    expect(ellee.chat).toEqual(["Stair Sit disabled."]);
    expect(form(2).titleText).toBe("Stair Sit");
    expect(form(2).bodyText).toContain("Now: Stair Sit is off.");
    expect(labels(2)).toEqual(["Turn on", "Back"]);
    expect(form(3).titleText).toBe("ElleeDog 67");
    expect(labels(3)[1]).toBe("[OFF] Stair Sit");
  });

  it("lets an operator switch a feature on", async () => {
    boot(manualFeatures());
    const op = addPlayer("Alex");
    op.commandPermissionLevel = CommandPermissionLevel.Admin;
    press("[OFF] Creeper Mod");
    press("Turn on");
    ui.responses.push({ canceled: true });
    await drive(openManual(engine(op)));
    expect(isEnabled("creeper-mod")).toBe(true);
    expect(isRunning("creeper-mod")).toBe(true);
    expect(op.chat).toEqual(["Creeper Mod enabled."]);
    expect(labels(2)).toEqual(["Turn off", "Back"]);
  });

  it("names the packs on a pack feature page and never offers a switch", async () => {
    boot(manualFeatures());
    const ellee = addPlayer("ElleeDog");
    press("[ACTIVE] Pets");
    ui.responses.push({ canceled: true });
    await openManual(engine(ellee));
    expect(form(1).titleText).toBe("Pets");
    expect(form(1).text).toContain("Now: Pets is active.");
    expect(form(1).text).toContain(
      'Pets is turned on by activating "ElleeDog 67 Pets" (Behavior Packs) in Edit World.',
    );
    expect(form(1).text).toContain('"ElleeDog 67 Pets Resources"');
    expect(form(1).text).toContain("Pets is turned off by deactivating");
    expect(form(1).text).toContain("While off: pets while off");
    expect(labels(1)).toEqual(["Back"]);
  });

  it("explains an absent pack feature by its packs", async () => {
    boot(manualFeatures());
    const stranger = addPlayer("Steve");
    press("[PACKS OFF] Rbow Ore");
    ui.responses.push({ canceled: true });
    await openManual(engine(stranger));
    expect(form(1).bodyText).toContain("Now: Rbow Ore is off because its packs are not active in this world.");
    expect(form(1).bodyText).toContain('"ElleeDog 67 Rbow Ore" (Behavior Packs)');
    expect(form(1).bodyText).toContain('"ElleeDog 67 Rbow Ore Resources" (Resource Packs)');
  });

  it("lists every pack and the ordering rules on the setup page", async () => {
    boot(manualFeatures());
    const stranger = addPlayer("Steve");
    press("Setup and packs");
    press("Back");
    ui.responses.push({ canceled: true });
    await openManual(engine(stranger));
    expect(form(1).titleText).toBe("Setup and packs");
    for (const pack of packs) {
      expect(form(1).text, pack.id).toContain(pack.title);
      expect(form(1).text, pack.id).toContain(pack.description);
    }
    expect(form(1).text).toContain(
      'Keep "ElleeDog 67 Pets Resources" above "ElleeDog 67 Rbow Ore Resources" in the resource pack list.',
    );
    expect(form(1).text).toContain("goes below the ElleeDog 67 packs, or is removed");
    expect(form(1).text).toContain('"ElleeDog 67 (Behavior)" automatically');
    expect(form(1).text).toContain("version is higher");
    expect(labels(1)).toEqual(["Back"]);
    expect(form(2).titleText).toBe("ElleeDog 67");
  });

  it("lists the core commands and each feature's commands on the commands page", async () => {
    boot(manualFeatures());
    const stranger = addPlayer("Steve");
    press("Commands");
    ui.responses.push({ canceled: true });
    await openManual(engine(stranger));
    expect(form(1).titleText).toBe("Commands");
    expect(form(1).bodyText).toContain("/elleedog67:features (anyone)");
    expect(form(1).bodyText).toContain(
      "/elleedog67:enable <feature> and /elleedog67:disable <feature> (operators, switch features only)",
    );
    expect(form(1).bodyText).toContain("/elleedog67:book (operators)");
    expect(form(1).bodyText).toContain("Pets\n/pet:form player|carter|mochi|casper\n/pet:book");
    expect(form(1).bodyText).toContain("Stair Sit\n/sit:down and /sit:stand");
    expect(form(1).bodyText).not.toContain("Creeper Mod");
    expect(labels(1)).toEqual(["Back"]);
  });

  it("opens from the book item and retries once when the player is busy", async () => {
    boot([fakeFeature("pets")]);
    const ellee = addPlayer("ElleeDog");
    ui.responses.push({ canceled: true, cancelationReason: "UserBusy" as never });
    press("[ON] Pets");
    press("Turn off");
    ui.responses.push({ canceled: true });
    const component = registry.components.get("elleedog67:open_feature_menu");
    component?.onUse({ source: ellee, itemStack: new ItemStack(BOOK_ID) });
    await ticks(1);
    expect(ui.shown).toBe(1);
    await ticks(10);
    expect(ui.shown).toBe(2);
    for (let i = 0; i < 10 && ui.shown < 4; i++) await ticks(1);
    expect(ui.shown).toBe(4);
    expect(isEnabled("pets")).toBe(false);
    expect(ellee.chat).toEqual(["Pets disabled."]);
  });

  it("ignores a second use while the manual is already open", async () => {
    boot([fakeFeature("pets")]);
    const ellee = addPlayer("ElleeDog");
    ui.responses.push({ canceled: true });
    const first = openManual(engine(ellee));
    const second = openManual(engine(ellee));
    await Promise.all([first, second]);
    expect(ui.shown).toBe(1);
  });
});
