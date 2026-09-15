import { GameMode } from "@minecraft/server";
import { stairSitDiagnostics } from "../../../../src/features/stair-sit/index.ts";
import { defineTest, run, STAIR, STAND } from "./harness.ts";

const SEAT = "sit:seat";

// An empty-handed player looking at the stair who runs /sit:down ends up riding a sit:seat carrier. The command is
// repeated every 20 ticks until then: right after spawning, a simulated player can still be settling onto the floor
// and looking at nothing, and a first /sit:down then refuses (the reason goes to chat, which the log never shows).
defineTest("sit_down", STAIR, 300, (test) => {
  const player = test.spawnSimulatedPlayer({ x: 3, y: STAND, z: 1 }, "Sitter", GameMode.Survival);
  test.runAfterDelay(10, () => player.lookAtBlock({ x: 3, y: STAND, z: 3 }));
  for (let tick = 30; tick <= 250; tick += 20) {
    test.runAfterDelay(tick, () => {
      const before = stairSitDiagnostics(player.id);
      if (!before.seated) run(player, "sit:down");
    });
    test.runAfterDelay(tick + 5, () => {
      const after = stairSitDiagnostics(player.id);
      if (!after.seated) console.warn(`[gametest] sit_down tick ${tick + 5}: ${JSON.stringify(after)}`);
    });
  }
  test.runAfterDelay(260, () => {
    // Diagnostics for a failing run, printed only when the test has not succeeded by now.
    const stair = test.getBlock({ x: 3, y: STAND, z: 3 });
    const aimed = player.getBlockFromViewDirection({ maxDistance: 3.5 })?.block;
    const around = [
      { x: 3, y: STAND + 1, z: 3 },
      { x: 3, y: STAND + 2, z: 3 },
      { x: 3, y: STAND + 1, z: 2 },
      { x: 3, y: STAND + 1, z: 4 },
    ]
      .map((at) => {
        const block = test.getBlock(at);
        return `${at.x},${at.y},${at.z}=${block.typeId}/${block.isAir}@${JSON.stringify(block.location)}`;
      })
      .join(" ");
    console.warn(`[gametest] sit_down headroom: ${around} stairWorld=${JSON.stringify(stair.location)}`);
    console.warn(
      `[gametest] sit_down: stair=${stair.typeId} ${JSON.stringify(stair.permutation.getAllStates())} aimed=${aimed?.typeId ?? "none"} at=${JSON.stringify(player.location)} riding=${player.getComponent("minecraft:riding")?.entityRidingOn?.typeId ?? "none"} sneaking=${player.isSneaking} onGround=${player.isOnGround}`,
    );
  });
  test.succeedWhen(() => {
    test.assertEntityPresentInArea(SEAT, true);
    const riding = player.getComponent("minecraft:riding")?.entityRidingOn?.typeId;
    test.assert(riding === SEAT, `the player should be riding the seat, not ${riding ?? "nothing"}`);
  });
});
