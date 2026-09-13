import { beforeEach, describe, expect, it } from "vitest";
import {
  BOOK_ID,
  BOOK_TITLE,
  hasBook,
  isBookHolder,
  MENU_TITLE,
  NOT_ALLOWED_MESSAGE,
  openFeatureMenu,
} from "../../src/core/book.ts";
import { bootstrap } from "../../src/core/bootstrap.ts";
import { isEnabled, isRunning } from "../../src/core/features.ts";
import {
  addPlayer,
  CommandPermissionLevel,
  CustomCommandStatus,
  engine,
  ItemStack,
  joinPlayer,
  loadWorld,
  registry,
  reset,
  runCommand,
  startup,
  step,
  ticks,
} from "../mocks/minecraft-server.ts";
import { ui } from "../mocks/minecraft-server-ui.ts";
import { fakeFeature } from "./helpers.ts";

function boot(features: ReturnType<typeof fakeFeature>[]) {
  bootstrap(features.map((entry) => entry.definition));
  startup();
  loadWorld();
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

describe("the feature menu", () => {
  it("refuses a stranger who found a dropped book but allows an operator", async () => {
    boot([fakeFeature("pets")]);
    const stranger = addPlayer("Steve");
    expect(await openFeatureMenu(engine(stranger))).toBe(false);
    expect(stranger.chat).toEqual([NOT_ALLOWED_MESSAGE]);
    expect(ui.shown).toBe(0);
    const op = addPlayer("Alex");
    op.commandPermissionLevel = CommandPermissionLevel.Admin;
    ui.responses.push({ canceled: true });
    expect(await openFeatureMenu(engine(op))).toBe(false);
    expect(ui.shown).toBe(1);
  });

  it("shows one toggle per feature with the current state and applies only the changes", async () => {
    const pets = fakeFeature("pets");
    const creeper = fakeFeature("creeper-mod", { defaultEnabled: false });
    const ore = fakeFeature("rbow-ore", { disabledNote: "Ore stays in the world." });
    boot([pets, creeper, ore]);
    const ellee = addPlayer("ElleeDog");
    ui.responses.push({ canceled: false, formValues: [false, true, true] });
    expect(await openFeatureMenu(engine(ellee))).toBe(true);
    const form = ui.forms[0] as {
      titleText: string;
      submitText: string;
      controls: Array<{ label: string; defaultValue: unknown }>;
    };
    expect(form.titleText).toBe(MENU_TITLE);
    expect(form.submitText).toBe("Apply");
    expect(form.controls.map((control) => [control.label, control.defaultValue])).toEqual([
      ["Pets", true],
      ["Creeper Mod", false],
      ["Rbow Ore (rbow-ore summary)", true],
    ]);
    expect(isRunning("pets")).toBe(true);
    step(1);
    expect(isEnabled("pets")).toBe(false);
    expect(isRunning("pets")).toBe(false);
    expect(isEnabled("creeper-mod")).toBe(true);
    expect(creeper.log.starts).toBe(1);
    expect(ore.log.stops).toBe(0);
    expect(ellee.chat).toEqual(["Enabled: Creeper Mod. Disabled: Pets."]);
  });

  it("changes nothing when the form is cancelled or resubmitted unchanged", async () => {
    const pets = fakeFeature("pets");
    boot([pets]);
    const ellee = addPlayer("ElleeDog");
    ui.responses.push({ canceled: true, cancelationReason: "UserClosed" as never });
    expect(await openFeatureMenu(engine(ellee))).toBe(false);
    ui.responses.push({ canceled: false, formValues: [true] });
    expect(await openFeatureMenu(engine(ellee))).toBe(true);
    step(1);
    expect(pets.log.stops).toBe(0);
    expect(ellee.chat).toEqual(["No changes."]);
  });

  it("opens from the book item and retries once when the player is busy", async () => {
    boot([fakeFeature("pets")]);
    const ellee = addPlayer("ElleeDog");
    ui.responses.push(
      { canceled: true, cancelationReason: "UserBusy" as never },
      { canceled: false, formValues: [false] },
    );
    const component = registry.components.get("elleedog67:open_feature_menu");
    component?.onUse({ source: ellee, itemStack: new ItemStack(BOOK_ID) });
    await ticks(1);
    expect(ui.shown).toBe(1);
    await ticks(10);
    expect(ui.shown).toBe(2);
    await ticks(1);
    expect(isEnabled("pets")).toBe(false);
    expect(ellee.chat).toEqual(["Disabled: Pets."]);
  });
});
