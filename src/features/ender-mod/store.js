import { regionFromCorners, regionIntersects, sectionAddress, sectionKey, validName } from "./geometry.js";

const REGION_KEY = "elleedog:ender_regions_v1";
const MAX_REGIONS = 64;
const CACHE_LIMIT = 512;

/** World-backed storage. One JSON integer set per 16×16×16 section, under 21 KB
 * even when every block is tracked. Writes are immediate; cache eviction loses no data.
 */
export class ProtectionStore {
  constructor(storage) {
    this.storage = storage;
    this.cache = new Map();
    this.regions = [];
    this.faulted = false;
    try {
      const raw = storage.getDynamicProperty(REGION_KEY);
      if (raw !== undefined) {
        if (typeof raw !== "string") throw new Error("Region data is not text.");
        const data = JSON.parse(raw);
        if (data.version !== 1 || !Array.isArray(data.regions) || data.regions.length > MAX_REGIONS) {
          throw new Error("Unsupported or damaged region data.");
        }
        for (const r of data.regions) {
          validName(r.name);
          if (typeof r.dimension !== "string" || !r.dimension || r.fullHeight !== true ||
              ![r.minX, r.maxX, r.minZ, r.maxZ].every(Number.isSafeInteger) ||
              r.minX > r.maxX || r.minZ > r.maxZ) throw new Error("Invalid saved region.");
        }
        this.regions = data.regions;
      }
    } catch (error) { this.faulted = true; throw error; }
  }

  saveRegion(name, first, second) {
    this.ensureHealthy();
    const region = regionFromCorners(name, first, second);
    if (this.regions.some(r => r.name.toLowerCase() === region.name.toLowerCase())) {
      throw new Error(`An area named "${region.name}" already exists. Remove it first to redefine it.`);
    }
    if (this.regions.length >= MAX_REGIONS) throw new Error(`This test build supports ${MAX_REGIONS} named areas.`);
    this.writeRegions([...this.regions, region]);
    return region;
  }

  removeRegion(name) {
    this.ensureHealthy();
    name = validName(name);
    const next = this.regions.filter(r => r.name.toLowerCase() !== name.toLowerCase());
    if (next.length === this.regions.length) throw new Error(`No area named "${name}".`);
    this.writeRegions(next);
  }

  writeRegions(next) {
    const encoded = JSON.stringify({ version: 1, regions: next });
    // Region names may be Unicode; 8000 UTF-16 units is conservatively below 32767 UTF-8 bytes.
    if (encoded.length > 8000) throw new Error("Area storage is full; shorten names or remove unused areas.");
    try { this.storage.setDynamicProperty(REGION_KEY, encoded); }
    catch (error) { this.faulted = true; throw error; }
    this.regions = next;
  }

  ensureHealthy() {
    if (this.faulted) throw new Error("Protection storage needs attention; stealing is suspended. See the content log.");
  }

  loadSection(key) {
    this.ensureHealthy();
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key); this.cache.set(key, value);
      return value;
    }
    try {
      const raw = this.storage.getDynamicProperty(key);
      if (raw !== undefined && typeof raw !== "string") throw new Error("Bad block tracking record.");
      const data = raw === undefined ? [] : JSON.parse(raw);
      if (!Array.isArray(data) || data.length > 4096 ||
          !data.every(n => Number.isInteger(n) && n >= 0 && n < 4096)) {
        throw new Error("Damaged block tracking section.");
      }
      const set = new Set(data);
      this.cache.set(key, set);
      if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value);
      return set;
    } catch (error) { this.faulted = true; throw error; }
  }

  setPlaced(dimension, position, placed) {
    const { key, local } = sectionAddress(dimension, position);
    const set = this.loadSection(key);
    if (set.has(local) === placed) return;
    const next = new Set(set);
    if (placed) next.add(local); else next.delete(local);
    const encoded = next.size ? JSON.stringify([...next].sort((a, b) => a - b)) : undefined;
    try { this.storage.setDynamicProperty(key, encoded); }
    catch (error) { this.faulted = true; throw error; }
    this.cache.set(key, next);
  }

  isPlaced(dimension, position) {
    const { key, local } = sectionAddress(dimension, position);
    return this.loadSection(key).has(local);
  }

  intersects(dimension, box) {
    this.ensureHealthy();
    if (this.regions.some(r => regionIntersects(r, dimension, box))) return true;
    for (let sx = Math.floor(box.minX / 16); sx <= Math.floor(box.maxX / 16); sx++) {
      for (let sy = Math.floor(box.minY / 16); sy <= Math.floor(box.maxY / 16); sy++) {
        for (let sz = Math.floor(box.minZ / 16); sz <= Math.floor(box.maxZ / 16); sz++) {
          const entries = this.loadSection(sectionKey(dimension, sx, sy, sz));
          for (const n of entries) {
            const x = sx * 16 + n % 16;
            const y = sy * 16 + Math.floor(n / 256);
            const z = sz * 16 + Math.floor(n / 16) % 16;
            if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY &&
                z >= box.minZ && z <= box.maxZ) return true;
          }
        }
      }
    }
    return false;
  }
}
