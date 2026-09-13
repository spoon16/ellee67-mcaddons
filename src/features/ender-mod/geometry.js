/** Geometry is integer block coordinates, with inclusive boundaries. */
export function blockPosition(position) {
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new Error("A finite block position is required.");
  }
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

export function validName(name) {
  if (typeof name !== "string") throw new Error('Provide a name in quotes, such as "My House".');
  const value = name.trim();
  if (!value || value.length > 64 || /[\u0000-\u001f\u007f§]/u.test(value)) {
    throw new Error("Names must contain 1–64 characters without control or formatting codes.");
  }
  return value;
}

export function regionFromCorners(name, first, second) {
  name = validName(name);
  if (!first || !second) throw new Error("Set both pos1 and pos2 before saving a name.");
  if (first.dimension !== second.dimension) throw new Error("Both corners must be in the same dimension.");
  const a = blockPosition(first), b = blockPosition(second);
  return {
    name, dimension: first.dimension,
    minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
    minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z),
    fullHeight: true,
  };
}

export function regionIntersects(region, dimension, box) {
  return region.dimension === dimension && region.minX <= box.maxX && region.maxX >= box.minX &&
    region.minZ <= box.maxZ && region.maxZ >= box.minZ;
}

/** Native pickup reaches 2 horizontally and 3 vertically. Additional margin covers
 * ordinary movement/property-update latency, NOT arbitrary instantaneous teleports.
 */
export function protectionBox(position) {
  const p = blockPosition(position);
  return { minX: p.x - 4, maxX: p.x + 4, minY: p.y - 2, maxY: p.y + 5,
    minZ: p.z - 4, maxZ: p.z + 4 };
}

export function sectionAddress(dimension, position) {
  const p = blockPosition(position);
  const x = Math.floor(p.x / 16), y = Math.floor(p.y / 16), z = Math.floor(p.z / 16);
  const local = (p.y - y * 16) * 256 + (p.z - z * 16) * 16 + p.x - x * 16;
  return { key: sectionKey(dimension, x, y, z), local };
}

export function sectionKey(dimension, x, y, z) {
  return `elleedog:placed:${encodeURIComponent(dimension)}:${x}:${y}:${z}`;
}
