import type { Vector3 } from "@minecraft/server";

/** A selected corner: a block position in a named dimension. */
export interface RegionCorner extends Vector3 {
  dimension: string;
}

/** Inclusive X/Z extent. */
export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Inclusive block box around a query position. */
export interface ProtectionBox extends Footprint {
  minY: number;
  maxY: number;
}

/** A named area saved by operators; it always spans the dimension's full height. */
export interface Region extends Footprint {
  name: string;
  dimension: string;
  fullHeight: true;
}

/** The dynamic property holding a 16x16x16 section's placed-block set, and the block's index within it. */
export interface SectionAddress {
  key: string;
  local: number;
}

/** Geometry is integer block coordinates, with inclusive boundaries. */
export function blockPosition(position: Vector3 | undefined): Vector3 {
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new Error("A finite block position is required.");
  }
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

export function validName(name: string | undefined): string {
  if (typeof name !== "string") throw new Error('Provide a name in quotes, such as "My House".');
  const value = name.trim();
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the range exists to reject control codes in names
  if (!value || value.length > 64 || /[\u0000-\u001f\u007f§]/u.test(value)) {
    throw new Error("Names must contain 1 to 64 characters without control or formatting codes.");
  }
  return value;
}

export function regionFromCorners(
  name: string | undefined,
  first: RegionCorner | undefined,
  second: RegionCorner | undefined,
): Region {
  const validated = validName(name);
  if (!first || !second) throw new Error("Set both pos1 and pos2 before saving a name.");
  if (first.dimension !== second.dimension) throw new Error("Both corners must be in the same dimension.");
  const a = blockPosition(first);
  const b = blockPosition(second);
  return {
    name: validated,
    dimension: first.dimension,
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minZ: Math.min(a.z, b.z),
    maxZ: Math.max(a.z, b.z),
    fullHeight: true,
  };
}

/** Regions span full height, so only the box's X/Z extent takes part. */
export function regionIntersects(region: Region, dimension: string, box: Footprint | ProtectionBox): boolean {
  return (
    region.dimension === dimension &&
    region.minX <= box.maxX &&
    region.maxX >= box.minX &&
    region.minZ <= box.maxZ &&
    region.maxZ >= box.minZ
  );
}

/** Native pickup reaches 2 horizontally and 3 vertically. Additional margin covers
 * ordinary movement/property-update latency, NOT arbitrary instantaneous teleports.
 */
export function protectionBox(position: Vector3): ProtectionBox {
  const p = blockPosition(position);
  return { minX: p.x - 4, maxX: p.x + 4, minY: p.y - 2, maxY: p.y + 5, minZ: p.z - 4, maxZ: p.z + 4 };
}

export function sectionAddress(dimension: string, position: Vector3): SectionAddress {
  const p = blockPosition(position);
  const x = Math.floor(p.x / 16);
  const y = Math.floor(p.y / 16);
  const z = Math.floor(p.z / 16);
  const local = (p.y - y * 16) * 256 + (p.z - z * 16) * 16 + p.x - x * 16;
  return { key: sectionKey(dimension, x, y, z), local };
}

export function sectionKey(dimension: string, x: number, y: number, z: number): string {
  return `elleedog:placed:${encodeURIComponent(dimension)}:${x}:${y}:${z}`;
}
