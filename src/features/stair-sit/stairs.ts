/** Pure stair geometry helpers. No Minecraft runtime or dependency required. */
import type { Vector3 } from "@minecraft/server";
import { CONFIG } from "./config.ts";

/** Which way a stair's full-height side faces, and the yaw a seated player should take (looking away from it). */
export interface StairFront {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface StairDescription {
  typeId: string;
  direction: number;
  corner: string;
  front: StairFront;
  /** Seat position within the block, on the low tread. */
  local: { x: number; z: number };
  location: Vector3;
  dimensionId: string;
  /** Occupancy key: dimension plus block position. */
  key: string;
  /** Type, facing and corner shape; a change means the chair was rebuilt. */
  fingerprint: string;
}

/** The stair a crouching player was looking at when the crouch began. */
export interface ArmedGesture {
  key: string;
  tick: number;
}

export const FRONT: readonly StairFront[] = Object.freeze([
  Object.freeze({ x: -1, z: 0, yaw: 90 }), // Full-height side east: face west.
  Object.freeze({ x: 1, z: 0, yaw: -90 }), // Full-height side west: face east.
  Object.freeze({ x: 0, z: -1, yaw: 180 }), // Full-height side south: face north.
  Object.freeze({ x: 0, z: 1, yaw: 0 }), // Full-height side north: face south.
]);
const CORNERS: ReadonlySet<string> = new Set(["none", "inner_left", "inner_right", "outer_left", "outer_right"]);

export function blockKey(dimensionId: string, location: Vector3): string {
  return `${dimensionId}|${location.x},${location.y},${location.z}`;
}
export function distanceSquared(a: Vector3, b: Vector3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

/** Recognize actual vanilla stair states, not arbitrary similarly named blocks. */
export function describeStair(
  typeId: string,
  states: Record<string, unknown>,
  location: Vector3,
  dimensionId: string,
): StairDescription | undefined {
  if (!typeId.startsWith("minecraft:") || !typeId.endsWith("_stairs")) return undefined;
  const direction = states.weirdo_direction;
  const upsideDown = states.upside_down_bit;
  if (typeof direction !== "number" || !Number.isInteger(direction) || direction < 0 || direction > 3) return undefined;
  if (upsideDown !== false && upsideDown !== 0) return undefined;
  const corner = states["minecraft:corner"] ?? "none";
  if (typeof corner !== "string" || !CORNERS.has(corner)) return undefined;
  const front = FRONT[direction];
  if (!front) return undefined;
  const left = { x: front.z, z: -front.x };
  // An inner corner has only one low quadrant. Move into that quadrant.
  const lateral = corner === "inner_left" ? 0.25 : corner === "inner_right" ? -0.25 : 0;
  const local = {
    x: 0.5 + front.x * 0.25 + left.x * lateral,
    z: 0.5 + front.z * 0.25 + left.z * lateral,
  };
  return {
    typeId,
    direction,
    corner,
    front,
    local,
    location: { ...location },
    dimensionId,
    key: blockKey(dimensionId, location),
    fingerprint: `${typeId}|${direction}|${corner}`,
  };
}

/** Pick a point on the upper tread, including the small upper outer-corner quadrant. */
export function highTreadPoint(stair: StairDescription): Vector3 {
  const f = stair.front;
  const left = { x: f.z, z: -f.x };
  const side = stair.corner === "outer_left" ? -0.25 : stair.corner === "outer_right" ? 0.25 : 0;
  return {
    x: stair.location.x + 0.5 - f.x * 0.25 + left.x * side,
    y: stair.location.y + 1.01,
    z: stair.location.z + 0.5 - f.z * 0.25 + left.z * side,
  };
}

/** Deliberate crouch press/release; mounting on release avoids immediate dismount. */
export function gestureComplete(armed: ArmedGesture | undefined, tick: number, targetKey: string | undefined): boolean {
  if (!armed || targetKey !== armed.key) return false;
  const held = tick - armed.tick;
  return held >= CONFIG.gestureMinTicks && held <= CONFIG.gestureMaxTicks;
}
