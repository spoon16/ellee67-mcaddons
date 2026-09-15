// The slice of the beta @minecraft/server-gametest module the tests use. The published typings track the beta
// @minecraft/server and do not match the stable 2.9.0 typings this repository checks against, so the few members
// needed are declared here; add to this file when a test needs more.
declare module "@minecraft/server-gametest" {
  import type { Block, Entity, GameMode, Player, Vector3 } from "@minecraft/server";

  export interface SimulatedPlayer extends Player {
    lookAtBlock(blockLocation: Vector3): void;
    lookAtLocation(location: Vector3): void;
    interactWithBlock(blockLocation: Vector3): boolean;
    moveToBlock(blockLocation: Vector3): void;
  }

  /** Every location is relative to the test's structure block. */
  export class Test {
    assert(condition: boolean, message: string): void;
    assertBlockPresent(blockType: string, blockLocation: Vector3, isPresent?: boolean): void;
    assertEntityPresent(entityType: string, blockLocation: Vector3, searchDistance?: number, isPresent?: boolean): void;
    assertEntityPresentInArea(entityType: string, isPresent?: boolean): void;
    fail(message: string): void;
    getBlock(blockLocation: Vector3): Block;
    print(text: string): void;
    runAfterDelay(delayTicks: number, callback: () => void): void;
    spawn(entityType: string, blockLocation: Vector3): Entity;
    spawnSimulatedPlayer(blockLocation: Vector3, name?: string, gameMode?: GameMode): SimulatedPlayer;
    succeed(): void;
    succeedWhen(callback: () => void): void;
    worldLocation(relativeLocation: Vector3): Vector3;
  }

  export interface RegistrationBuilder {
    structureName(name: string): RegistrationBuilder;
    maxTicks(ticks: number): RegistrationBuilder;
    tag(tag: string): RegistrationBuilder;
  }

  export function register(
    testClassName: string,
    testName: string,
    testFunction: (test: Test) => void,
  ): RegistrationBuilder;
}
