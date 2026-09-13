/** Pure stair geometry helpers. No Minecraft runtime or dependency required. */
export const FRONT = Object.freeze([
  Object.freeze({ x: -1, z: 0, yaw: 90 }),   // Full-height side east: face west.
  Object.freeze({ x: 1, z: 0, yaw: -90 }),   // Full-height side west: face east.
  Object.freeze({ x: 0, z: -1, yaw: 180 }),  // Full-height side south: face north.
  Object.freeze({ x: 0, z: 1, yaw: 0 }),     // Full-height side north: face south.
]);
const CORNERS = new Set(["none", "inner_left", "inner_right", "outer_left", "outer_right"]);

export function blockKey(dimensionId, location) {
  return `${dimensionId}|${location.x},${location.y},${location.z}`;
}
export function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

/** Recognize actual vanilla stair states, not arbitrary similarly named blocks. */
export function describeStair(typeId, states, location, dimensionId) {
  if (!typeId.startsWith("minecraft:") || !typeId.endsWith("_stairs")) return undefined;
  const direction = states.weirdo_direction;
  const upsideDown = states.upside_down_bit;
  if (!Number.isInteger(direction) || direction < 0 || direction > 3) return undefined;
  if (upsideDown !== false && upsideDown !== 0) return undefined;
  const corner = states["minecraft:corner"] ?? "none";
  if (!CORNERS.has(corner)) return undefined;
  const front = FRONT[direction];
  const left = { x: front.z, z: -front.x };
  // An inner corner has only one low quadrant. Move into that quadrant.
  const lateral = corner === "inner_left" ? 0.25 : corner === "inner_right" ? -0.25 : 0;
  const local = {
    x: 0.5 + front.x * 0.25 + left.x * lateral,
    z: 0.5 + front.z * 0.25 + left.z * lateral,
  };
  return {
    typeId, direction, corner, front, local,
    location: { ...location }, dimensionId,
    key: blockKey(dimensionId, location),
    fingerprint: `${typeId}|${direction}|${corner}`,
  };
}

/** Pick a point on the upper tread, including the small upper outer-corner quadrant. */
export function highTreadPoint(stair) {
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
export function gestureComplete(armed, tick, targetKey) {
  if (!armed || targetKey !== armed.key) return false;
  const held = tick - armed.tick;
  return held >= 2 && held <= 120;
}
