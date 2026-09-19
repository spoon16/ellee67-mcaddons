import { GameMode } from "@minecraft/server";
import { blockId, entityId } from "../../../../src/core/vanilla.ts";
import { defineTest, FLOOR, GROUND, STAND } from "./harness.ts";

// A forced creeper blast is the engine's own explosion: it hurts the Survival player beside it, kills the pig on the
// other side, and leaves the stone floor under the creeper intact because the guard emptied its block list.
defineTest("creeper_blast", FLOOR, 300, (test) => {
  const player = test.spawnSimulatedPlayer({ x: 3, y: STAND, z: 1 }, "Bystander", GameMode.Survival);
  test.spawn(entityId("minecraft:pig"), { x: 5, y: STAND, z: 3 });
  const creeper = test.spawn(entityId("minecraft:creeper"), { x: 3, y: STAND, z: 3 });
  test.runAfterDelay(20, () => creeper.triggerEvent("minecraft:start_exploding_forced"));
  test.succeedWhen(() => {
    test.assertEntityPresentInArea(entityId("minecraft:creeper"), false);
    test.assertEntityPresentInArea(entityId("minecraft:pig"), false);
    test.assertBlockPresent(blockId("minecraft:stone"), { x: 3, y: GROUND, z: 3 }, true);
    test.assertBlockPresent(blockId("minecraft:stone"), { x: 4, y: GROUND, z: 3 }, true);
    const health = player.getComponent("minecraft:health");
    test.assert(
      health !== undefined && health.currentValue < health.effectiveMax,
      "the player should have taken blast damage",
    );
  });
});
