import { beforeEach, describe, expect, it } from "vitest";
import { PETS } from "../../../src/features/pets/catalog.generated.ts";
import type { Pet } from "../../../src/features/pets/core.ts";
import { BOOK_ID, BOOK_TITLE, giveMorpher, morpherChoices, petBiography } from "../../../src/features/pets/morpher.ts";
import { classifyHand } from "../../../src/features/pets/tool_effects.ts";
import { leavePlayer, players, registry, reset, ticks, world } from "../../mocks/minecraft-server.ts";
import { type QueuedResponse, ui } from "../../mocks/minecraft-server-ui.ts";
import { command, petPlayer, shownForm, start, testItem, text } from "./helpers.ts";

beforeEach(() => {
  reset();
  ui.reset();
  start();
});

describe("book contents", () => {
  it("Four labels and stable ordering are exactly as requested", () => {
    expect(morpherChoices().map((c) => c.label)).toEqual(["Player", "Carter", "Mochi", "Casper"]);
  });

  it("Biographies contain the supplied owners and sentences", () => {
    expect(petBiography(PETS[0] as Pet)).toBe("Owner: ElleeDog\nThe softest and also laziest pet you ever met.");
    expect(petBiography(PETS[1] as Pet)).toBe(
      "Owner: warspoon17\nA feisty street cat that will cuddle and purr and then bite.",
    );
    expect(petBiography(PETS[2] as Pet)).toBe(
      "Owner: Casper201312\nCasper is an indoor cat, super cuddly and is always trying to sneak outside.",
    );
  });

  it("Morpher itself is side-carried and does not trigger the unsupported-item fallback", () => {
    expect(classifyHand({ typeId: BOOK_ID })).toBe("side");
  });
});

describe("book grant", () => {
  it("Book grant adds exactly one named book without changing existing slots or selection", () => {
    const p = petPlayer("p");
    const original = p.items[0];
    giveMorpher(p);
    expect(p.items[1]?.typeId).toBe(BOOK_ID);
    expect(p.items[1]?.nameTag).toBe(BOOK_TITLE);
    expect(p.items[1]?.amount).toBe(1);
    expect(p.items[0]).toBe(original);
    expect(p.inventoryWrites).toHaveLength(1);
    expect(p.props["pet:model_id"]).toBe(0);
  });

  it("Each explicit grant gives one unstackable book", () => {
    const p = petPlayer("p");
    giveMorpher(p);
    giveMorpher(p);
    expect(p.items.filter((i) => i?.typeId === BOOK_ID)).toHaveLength(2);
  });

  it("Full inventory rejects the grant without overwriting or dropping anything", () => {
    const p = petPlayer("p");
    p.items.fill(testItem());
    const old = [...p.items];
    expect(() => giveMorpher(p)).toThrow(/Inventory full/);
    expect(p.items).toEqual(old);
    expect(p.inventoryWrites).toBeUndefined();
  });

  it("Unexpected inventory refusal does not claim successful delivery", () => {
    const p = petPlayer("p");
    p.inventory.rejectAdd = true;
    expect(() => giveMorpher(p)).toThrow(/Could not add/);
    expect(p.inventoryWrites).toBeUndefined();
  });

  it("Disconnected grant is rejected", () => {
    const p = petPlayer("p");
    p.isValid = false;
    expect(() => giveMorpher(p)).toThrow();
  });

  it("Book command grants to the invoking player only and works without cheats flag", async () => {
    const a = petPlayer("a");
    const b = petPlayer("b");
    command("book", a);
    await ticks(4);
    expect(a.items[1]?.typeId).toBe(BOOK_ID);
    expect(b.items[1]).toBeUndefined();
    expect(registry.commands.get("pet:book")?.definition.cheatsRequired).toBe(false);
  });

  it("Book command reports full inventory with no false added confirmation", async () => {
    const p = petPlayer("full");
    p.items.fill(testItem());
    command("book", p);
    await ticks(4);
    expect(text(p)).toMatch(/Inventory full/);
    expect(text(p)).not.toMatch(/Pet Morpher added/);
  });
});

describe("book menu", () => {
  for (const [i, pet] of PETS.entries()) {
    it(`Book -> ${pet.display_name}: description then coordinated transform, without consuming book`, async () => {
      const p = petPlayer(`book-${pet.id}`);
      giveMorpher(p);
      const book = p.items[1];
      ui.responses = [
        { canceled: false, selection: i + 1 },
        { canceled: false, selection: 0 },
      ];
      registry.components.get("pet:open_morpher")?.onUse({ source: p, itemStack: book });
      await ticks(12);
      expect(p.props["pet:model_id"]).toBe(pet.wire_id);
      expect(p.props["pet:armor_fit"]).toBe(true);
      expect(p.items[1]).toBe(book);
      expect(book?.amount).toBe(1);
      expect(shownForm(0).titleText).toBe(BOOK_TITLE);
      expect(shownForm(0).buttons.map((b) => b.label)).toEqual(["Player", "Carter", "Mochi", "Casper"]);
      expect(shownForm(1).bodyText).toContain(petBiography(pet));
    });
  }

  it("Player selection restores all native presentation immediately without a pet detail page", async () => {
    const p = petPlayer("player");
    command("form", p, "casper");
    await ticks(5);
    ui.responses = [{ canceled: false, selection: 0 }];
    command("menu", p);
    await ticks(10);
    expect(ui.forms).toHaveLength(1);
    expect(p.props["pet:model_id"]).toBe(0);
    expect(p.props["pet:armor_fit"]).toBe(false);
    expect(p.props["pet:gear_fit"]).toBe(false);
    expect(p.props["pet:view"]).toBe("native");
  });

  for (const name of ["player", "human"]) {
    it(`New /pet:form ${name} restores the same native profile as the legacy alias`, async () => {
      const p = petPlayer(`alias-${name}`);
      command("form", p, "casper");
      await ticks(5);
      command("form", p, name);
      await ticks(5);
      expect(p.props["pet:model_id"]).toBe(0);
      expect(p.props["pet:armor_fit"]).toBe(false);
      expect(text(p)).toMatch(/Selected Player/);
    });
  }

  it("Back returns to choices without changing form", async () => {
    const p = petPlayer("back");
    ui.responses = [{ canceled: false, selection: 1 }, { canceled: false, selection: 1 }, { canceled: true }];
    command("menu", p);
    await ticks(16);
    expect(ui.forms).toHaveLength(3);
    expect(p.props["pet:model_id"]).toBe(0);
  });

  it("Closing a description makes no changes", async () => {
    const p = petPlayer("cancel");
    ui.responses = [{ canceled: false, selection: 3 }, { canceled: true }];
    command("menu", p);
    await ticks(10);
    expect(p.writes).toHaveLength(0);
  });

  it("onUseOn opens the same menu", async () => {
    const p = petPlayer("useon");
    ui.responses = [
      { canceled: false, selection: 3 },
      { canceled: false, selection: 0 },
    ];
    registry.components.get("pet:open_morpher")?.onUseOn({ source: p });
    await ticks(12);
    expect(p.props["pet:model_id"]).toBe(3);
  });

  it("Double use events do not open two menus", async () => {
    const p = petPlayer("double");
    let resolve: (response: QueuedResponse) => void = () => {};
    const pending = new Promise<QueuedResponse>((r) => {
      resolve = r;
    });
    ui.responses = [() => pending];
    const component = registry.components.get("pet:open_morpher");
    component?.onUse({ source: p });
    component?.onUseOn({ source: p });
    await ticks(3);
    expect(ui.shown).toBe(1);
    resolve({ canceled: true });
    await ticks(3);
  });

  it("Busy UI retries at most three times", async () => {
    const p = petPlayer("busy-book");
    // The original kept this player offline so the 20-tick bootstrap restore could not count as a write.
    players.length = 0;
    ui.responses = Array(3).fill({ canceled: true, cancelationReason: "UserBusy" });
    command("menu", p);
    await ticks(45);
    expect(ui.shown).toBe(3);
    expect(p.writes).toHaveLength(0);
  });

  it("Late response after leaving cannot transform a new session", async () => {
    const p = petPlayer("late");
    let resolve: (response: QueuedResponse) => void = () => {};
    const pending = new Promise<QueuedResponse>((r) => {
      resolve = r;
    });
    ui.responses = [() => pending];
    command("menu", p);
    await ticks(6);
    leavePlayer(p);
    resolve({ canceled: false, selection: 3 });
    await ticks(5);
    expect(p.writes).toHaveLength(0);
  });

  it("Choosing by command invalidates a pending book response", async () => {
    const p = petPlayer("stale");
    let resolve: (response: QueuedResponse) => void = () => {};
    const pending = new Promise<QueuedResponse>((r) => {
      resolve = r;
    });
    ui.responses = [() => pending];
    command("menu", p);
    await ticks(6);
    command("form", p, "carter");
    await ticks(5);
    resolve({ canceled: false, selection: 0 });
    await ticks(4);
    expect(p.props["pet:model_id"]).toBe(1);
  });

  it("Casper preference survives respawn and dimension change", async () => {
    const p = petPlayer("restore-casper");
    command("form", p, "casper");
    await ticks(5);
    p.props["pet:model_id"] = 0;
    world.afterEvents.playerSpawn.emit({ player: p, initialSpawn: false });
    await ticks(5);
    expect(p.props["pet:model_id"]).toBe(3);
    p.props["pet:armor_fit"] = false;
    world.afterEvents.playerDimensionChange.emit({ player: p });
    await ticks(5);
    expect(p.props["pet:armor_fit"]).toBe(true);
  });

  it("Direct /pet:menu remains available when a book is not selected", async () => {
    const p = petPlayer("nobook");
    command("menu", p);
    await ticks(8);
    expect(shownForm(0).titleText).toBe(BOOK_TITLE);
    expect(p.items.some((i) => i?.typeId === BOOK_ID)).toBe(false);
  });
});
