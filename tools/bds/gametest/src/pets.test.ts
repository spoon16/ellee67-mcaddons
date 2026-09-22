import { GameMode } from "@minecraft/server";
import { defineTest, FLOOR, inventoryHas, run, STAND } from "./harness.ts";

const MORPHER_BOOK = "pet:morpher_book";

// /pet:book puts the Pet Morpher in a Survival player's inventory.
defineTest("pets_book", FLOOR, 200, (test) => {
  const player = test.spawnSimulatedPlayer({ x: 3, y: STAND, z: 3 }, "Ellee", GameMode.Survival);
  test.runAfterDelay(10, () => run(player, "pet:book"));
  test.succeedWhen(() =>
    test.assert(inventoryHas(player, MORPHER_BOOK), "the Pet Morpher book should be in the inventory"),
  );
});

// /pet:ui writes the inventory-preview experiment's mode to the player property the client's Molang reads.
defineTest("pets_ui_mode", FLOOR, 200, (test) => {
  const player = test.spawnSimulatedPlayer({ x: 3, y: STAND, z: 3 }, "Ellee", GameMode.Survival);
  test.runAfterDelay(10, () => run(player, "pet:ui pet_static"));
  test.succeedWhen(() =>
    test.assert(player.getProperty("pet:ui_mode") === 2, "pet:ui_mode should hold pet_static's wire value 2"),
  );
});
