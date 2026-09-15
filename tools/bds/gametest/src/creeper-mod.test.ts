import { GameMode } from "@minecraft/server";
import { blockId, entityId } from "../../../../src/core/vanilla.ts";
import { defineTest, FLOOR, GROUND, STAND } from "./harness.ts";

// A forced creeper blast hurts the Survival player beside it and leaves the stone floor intact.
defineTest("creeper_blast", FLOOR, 300, (test) => {
  const player = test.spawnSimulatedPlayer({ x: 3, y: STAND, z: 1 }, "Bystander", GameMode.Survival);
  const creeper = test.spawn(entityId("minecraft:creeper"), { x: 3, y: STAND, z: 3 });
  test.runAfterDelay(20, () => creeper.triggerEvent("minecraft:start_exploding_forced"));
  test.succeedWhen(() => {
    test.assertEntityPresentInArea(entityId("minecraft:creeper"), false);
    test.assertBlockPresent(blockId("minecraft:stone"), { x: 3, y: GROUND, z: 3 }, true);
    const health = player.getComponent("minecraft:health");
    test.assert(
      health !== undefined && health.currentValue < health.effectiveMax,
      "the player should have taken blast damage",
    );
  });
});
