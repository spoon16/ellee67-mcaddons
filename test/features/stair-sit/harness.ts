// Runs the ported entry-point tests against the shared engine mock. The upstream runtime.js owned its own
// scheduler; here the mock's `step`/`flushCurrentTick` drive the clock and this file only adds what that
// harness exposed on top of it: the fake dimension, fake players and the pending one-shot job count.
import { runFeature } from "../../../src/core/feature.ts";
import { shutdownStairSit, stairSit } from "../../../src/features/stair-sit/index.ts";
import {
  type Dimension,
  dimensions,
  loadWorld,
  type Player,
  players,
  type RegisteredCommand,
  registry,
  startup,
  step,
  system,
} from "../../mocks/minecraft-server.ts";
import { type FakeBlock, FakeDimension, FakePlayer } from "./fakes.ts";

export type AimingPlayer = FakePlayer & { target: FakeBlock };

export const runtime = {
  /** The fake overworld installed by `installDimension()`; `world.getDimension("overworld")` returns it. */
  dimension: new FakeDimension(),
  /** A player next to a fresh stair at the origin, visible to `world.getAllPlayers()`. */
  makePlayer(): AimingPlayer {
    const player = new FakePlayer(runtime.dimension) as AimingPlayer;
    player.target = runtime.dimension.stair();
    players.push(player as unknown as Player);
    return player;
  },
  /** One-shot jobs waiting in the scheduler, which the upstream harness exposed as `system.jobs.length`. */
  get oneShotJobs(): number {
    return system.pendingJobCount - system.intervalCount;
  },
};

/** Replaces the mock overworld with a fresh fake dimension. Call after `reset()`. */
export function installDimension(): FakeDimension {
  runtime.dimension = new FakeDimension();
  dimensions.overworld = runtime.dimension as unknown as Dimension;
  return runtime.dimension;
}

/** Runs the Stair Sitting pack's scripts, loads the world and runs the first tick so the start-up sweep is done. */
export function boot(): void {
  installDimension();
  runFeature(stairSit);
  startup();
  loadWorld();
  step();
}

/** Clears the feature's module-level seat and target state so it cannot leak into the next test. */
export function shutdown(): void {
  shutdownStairSit();
}

export function sitCommand(name: string): RegisteredCommand {
  const command = registry.commands.get(name);
  if (!command) throw new Error(`Command ${name} is not registered`);
  return command;
}

export function sitCommands(): RegisteredCommand[] {
  return [...registry.commands.entries()].filter(([name]) => name.startsWith("sit:")).map(([, command]) => command);
}
