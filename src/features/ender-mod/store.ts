import type { Vector3 } from "@minecraft/server";
import {
  type ProtectionBox,
  type Region,
  type RegionCorner,
  regionFromCorners,
  regionIntersects,
  sectionAddress,
  sectionKey,
  validName,
} from "./geometry.ts";

const REGION_KEY = "elleedog:ender_regions_v1";
const MAX_REGIONS = 64;
const CACHE_LIMIT = 512;

/** The inclusive world-coordinate box around a section's placed blocks, or null for an empty section. */
type SectionBounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null;

function decodeLocal(n: number, sx: number, sy: number, sz: number): { x: number; y: number; z: number } {
  return { x: sx * 16 + (n % 16), y: sy * 16 + Math.floor(n / 256), z: sz * 16 + (Math.floor(n / 16) % 16) };
}

function boundsOf(entries: Set<number>, sx: number, sy: number, sz: number): SectionBounds {
  let bounds: SectionBounds = null;
  for (const n of entries) {
    const p = decodeLocal(n, sx, sy, sz);
    if (!bounds) bounds = { minX: p.x, maxX: p.x, minY: p.y, maxY: p.y, minZ: p.z, maxZ: p.z };
    else {
      bounds.minX = Math.min(bounds.minX, p.x);
      bounds.maxX = Math.max(bounds.maxX, p.x);
      bounds.minY = Math.min(bounds.minY, p.y);
      bounds.maxY = Math.max(bounds.maxY, p.y);
      bounds.minZ = Math.min(bounds.minZ, p.z);
      bounds.maxZ = Math.max(bounds.maxZ, p.z);
    }
  }
  return bounds;
}

/** The dynamic-property surface the store reads and writes; `world` provides it in the game. */
export interface ProtectionStorage {
  getDynamicProperty(identifier: string): unknown;
  setDynamicProperty(identifier: string, value: string | undefined): void;
}

/** World-backed storage. One JSON integer set per 16×16×16 section, under 21 KB
 * even when every block is tracked. Writes are immediate; cache eviction loses no data.
 */
export class ProtectionStore {
  readonly storage: ProtectionStorage;
  cache = new Map<string, Set<number>>();
  /** Per-section bounds, computed once per loaded section and dropped when the section changes. */
  private bounds = new Map<string, SectionBounds>();
  regions: Region[] = [];
  faulted = false;
  /** Moves on with every placement, removal and region change, so readers can tell a stale answer from a fresh one. */
  generation = 0;
  constructor(storage: ProtectionStorage) {
    this.storage = storage;
    try {
      const raw = storage.getDynamicProperty(REGION_KEY);
      if (raw !== undefined) {
        if (typeof raw !== "string") throw new Error("Region data is not text.");
        const data: { version?: unknown; regions?: unknown } = JSON.parse(raw);
        if (data.version !== 1 || !Array.isArray(data.regions) || data.regions.length > MAX_REGIONS) {
          throw new Error("Unsupported or damaged region data.");
        }
        for (const r of data.regions) {
          validName(r.name);
          if (
            typeof r.dimension !== "string" ||
            !r.dimension ||
            r.fullHeight !== true ||
            ![r.minX, r.maxX, r.minZ, r.maxZ].every(Number.isSafeInteger) ||
            r.minX > r.maxX ||
            r.minZ > r.maxZ
          )
            throw new Error("Invalid saved region.");
        }
        this.regions = data.regions;
      }
    } catch (error) {
      this.faulted = true;
      throw error;
    }
  }

  saveRegion(name: string | undefined, first: RegionCorner | undefined, second: RegionCorner | undefined): Region {
    this.ensureHealthy();
    const region = regionFromCorners(name, first, second);
    if (this.regions.some((r) => r.name.toLowerCase() === region.name.toLowerCase())) {
      throw new Error(`An area named "${region.name}" already exists. Remove it first to redefine it.`);
    }
    if (this.regions.length >= MAX_REGIONS) throw new Error(`This test build supports ${MAX_REGIONS} named areas.`);
    this.writeRegions([...this.regions, region]);
    return region;
  }

  removeRegion(name: string | undefined): void {
    this.ensureHealthy();
    const validated = validName(name);
    const next = this.regions.filter((r) => r.name.toLowerCase() !== validated.toLowerCase());
    if (next.length === this.regions.length) throw new Error(`No area named "${validated}".`);
    this.writeRegions(next);
  }

  writeRegions(next: Region[]): void {
    const encoded = JSON.stringify({ version: 1, regions: next });
    // Region names may be Unicode; 8000 UTF-16 units is conservatively below 32767 UTF-8 bytes.
    if (encoded.length > 8000) throw new Error("Area storage is full; shorten names or remove unused areas.");
    try {
      this.storage.setDynamicProperty(REGION_KEY, encoded);
    } catch (error) {
      this.faulted = true;
      throw error;
    }
    this.regions = next;
    this.generation++;
  }

  ensureHealthy(): void {
    if (this.faulted)
      throw new Error("Protection storage needs attention; stealing is suspended. See the content log.");
  }

  loadSection(key: string): Set<number> {
    this.ensureHealthy();
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    try {
      const raw = this.storage.getDynamicProperty(key);
      if (raw !== undefined && typeof raw !== "string") throw new Error("Bad block tracking record.");
      const data: unknown = raw === undefined ? [] : JSON.parse(raw);
      if (!Array.isArray(data) || data.length > 4096 || !data.every((n) => Number.isInteger(n) && n >= 0 && n < 4096)) {
        throw new Error("Damaged block tracking section.");
      }
      const set = new Set<number>(data);
      this.cache.set(key, set);
      if (this.cache.size > CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) {
          this.cache.delete(oldest);
          this.bounds.delete(oldest);
        }
      }
      return set;
    } catch (error) {
      this.faulted = true;
      throw error;
    }
  }

  setPlaced(dimension: string, position: Vector3, placed: boolean): void {
    const { key, local } = sectionAddress(dimension, position);
    const set = this.loadSection(key);
    if (set.has(local) === placed) return;
    const next = new Set(set);
    if (placed) next.add(local);
    else next.delete(local);
    const encoded = next.size ? JSON.stringify([...next].sort((a, b) => a - b)) : undefined;
    try {
      this.storage.setDynamicProperty(key, encoded);
    } catch (error) {
      this.faulted = true;
      throw error;
    }
    this.cache.set(key, next);
    this.bounds.delete(key);
    this.generation++;
  }

  isPlaced(dimension: string, position: Vector3): boolean {
    const { key, local } = sectionAddress(dimension, position);
    return this.loadSection(key).has(local);
  }

  intersects(dimension: string, box: ProtectionBox): boolean {
    this.ensureHealthy();
    if (this.regions.some((r) => regionIntersects(r, dimension, box))) return true;
    for (let sx = Math.floor(box.minX / 16); sx <= Math.floor(box.maxX / 16); sx++) {
      for (let sy = Math.floor(box.minY / 16); sy <= Math.floor(box.maxY / 16); sy++) {
        for (let sz = Math.floor(box.minZ / 16); sz <= Math.floor(box.maxZ / 16); sz++) {
          const key = sectionKey(dimension, sx, sy, sz);
          const entries = this.loadSection(key);
          if (entries.size === 0) continue;
          // A section's bounds reject most queries without touching its entries: a built-up section holds up to
          // 4096 of them, and the scan asks about every loaded enderman.
          let bounds = this.bounds.get(key);
          if (bounds === undefined) {
            bounds = boundsOf(entries, sx, sy, sz);
            this.bounds.set(key, bounds);
          }
          if (
            !bounds ||
            bounds.minX > box.maxX ||
            bounds.maxX < box.minX ||
            bounds.minY > box.maxY ||
            bounds.maxY < box.minY ||
            bounds.minZ > box.maxZ ||
            bounds.maxZ < box.minZ
          )
            continue;
          for (const n of entries) {
            const { x, y, z } = decodeLocal(n, sx, sy, sz);
            if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY && z >= box.minZ && z <= box.maxZ)
              return true;
          }
        }
      }
    }
    return false;
  }
}
