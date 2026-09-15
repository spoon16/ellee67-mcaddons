// Every tuning number for Stair Sitting in one place. Times are in ticks (20 per second), distances in blocks.
// `Object.freeze` makes the object read-only, so a slip like `CONFIG.reach = 5` fails loudly instead of quietly
// changing behaviour.
export const CONFIG = Object.freeze({
  version: "0.2.1",
  /** The invisible entity a player rides while seated (behavior_packs/elleedog67_stair_sit/entities/seat.json). */
  entityId: "sit:seat",
  /** The invisible entity that gives a free stair its Sit button prompt (entities/target.json). */
  targetEntityId: "sit:target",
  /** The player's Sit button preference; the tag below mirrors it for the target entity's interaction filter. */
  buttonProperty: "sit:button",
  buttonDisabledTag: "ed67_sit_no_button",
  /** How often the target scan looks for free stairs near each player. */
  targetScanInterval: 5,
  /** A standing player's target discovery is reused until this many ticks pass or a block changes nearby. */
  targetCacheTicks: 40,
  maxTargetsPerPlayer: 24,
  maxTargetsTotal: 128,
  /** After a target intercepts a click that was not a sit, its stair gets no target for this long. */
  targetSuppressTicks: 40,
  /** While seated, a player may move to another stair only within this many blocks and one block up or down. */
  transferReach: 3,
  transferMaxRise: 1,
  /** How far a player may aim to pick a stair. */
  reach: 3.5,
  /** The gesture loop runs every tick: a crouch can last only a few ticks. */
  tickInterval: 1,
  /** After standing up, sitting is refused for this long, so a dismount cannot instantly re-seat the player. */
  cooldownTicks: 30,
  /** A crouch held shorter or longer than this window (in ticks) is not the sit gesture. */
  gestureMinTicks: 2,
  gestureMaxTicks: 120,
  /** How often the sweep removes helper entities nobody is using. */
  sweepInterval: 200,
  /** How often a helper in use is sent `sit:heartbeat`; its own timer removes it if the beats stop. */
  heartbeatInterval: 40,
  gestureProperty: "sit:gesture",
  heightProperty: "sit:height",
  minHeightOffset: -0.5,
  maxHeightOffset: 0.5,
  // Keep the seating geometry from the user-approved v0.1.1 build.
  // /sit:height changes the per-player adjustment without editing the pack.
  seatSurfaceY: 0.5,
});
