export const CONFIG = Object.freeze({
  version: "0.2.1",
  entityId: "sit:seat",
  targetEntityId: "sit:target",
  /** The player's Sit button preference; the tag below mirrors it for the target entity's interaction filter. */
  buttonProperty: "sit:button",
  buttonDisabledTag: "ed67_sit_no_button",
  targetScanInterval: 5,
  /** A standing player's target discovery is reused until this many ticks pass or a block changes nearby. */
  targetCacheTicks: 40,
  maxTargetsPerPlayer: 24,
  maxTargetsTotal: 128,
  targetSuppressTicks: 40,
  transferReach: 3,
  transferMaxRise: 1,
  reach: 3.5,
  tickInterval: 1,
  cooldownTicks: 30,
  /** A crouch held shorter or longer than this window (in ticks) is not the sit gesture. */
  gestureMinTicks: 2,
  gestureMaxTicks: 120,
  sweepInterval: 200,
  heartbeatInterval: 40,
  gestureProperty: "sit:gesture",
  heightProperty: "sit:height",
  minHeightOffset: -0.5,
  maxHeightOffset: 0.5,
  // Keep the seating geometry from the user-approved v0.1.1 build.
  // /sit:height changes the per-player adjustment without editing the pack.
  seatSurfaceY: 0.5,
});
