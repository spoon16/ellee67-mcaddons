// The Sit button. On touch screens and controllers Minecraft shows a "Sit" prompt when the player looks at a
// rideable entity, but the seat entity only exists once someone is sitting. So this module parks a second
// invisible entity, `sit:target`, on every free stair near a player. Tapping one is caught in index.ts and turned
// into a real sit; the target itself cannot be ridden. Targets are shared between nearby players, capped in
// number, re-checked against their stair every pass, and removed as soon as nobody could use them.
import type { Dimension, Entity, Player, Vector3 } from "@minecraft/server";
import { loadedDimensions } from "../../core/dimensions.ts";
import { CONFIG } from "./config.ts";
import { log } from "./log.ts";
import {
  eligible,
  emptyHands,
  getBlock,
  hasHeadroom,
  nearbyStair,
  readStair,
  removeSeat,
  type SeatClock,
  type SeatManager,
  type SeatWorld,
  valid,
} from "./seats.ts";
import { distanceSquared, type StairDescription } from "./stairs.ts";

// Precomputed, nearest-first discovery offsets. Discovery is local and bounded;
// it never loads chunks, places blocks, or replaces a vanilla stair definition.
// Only offsets whose block centre can be within reach of some point in the player's block are kept, so the scan
// visits a sphere of about 480 blocks rather than the 729-block cube.
const RADIUS = Math.ceil(CONFIG.reach + 0.5);
const MAX_OFFSET_DISTANCE = CONFIG.reach + 0.5 + Math.sqrt(3) / 2;
const OFFSETS: Vector3[] = [];
for (let x = -RADIUS; x <= RADIUS; x++)
  for (let y = -RADIUS; y <= RADIUS; y++)
    for (let z = -RADIUS; z <= RADIUS; z++) {
      if (Math.hypot(x, y, z) <= MAX_OFFSET_DISTANCE) OFFSETS.push({ x, y, z });
    }
// Nearest first, so the per-player cap keeps the closest stairs when a room has more than it allows.
OFFSETS.sort((a, b) => a.x * a.x + a.y * a.y + a.z * a.z - b.x * b.x - b.y * b.y - b.z * b.z);

/** 0.1 blocks, squared: a target nudged further than this off its stair's centre is stale and gets replaced. */
const MAX_TARGET_DRIFT_SQUARED = 0.01;

/**
 * Prefer the chair just vacated, then discover nearest-first as before.
 * A generator (`function*`) hands out one position at a time with `yield`, so the caller can stop early once it
 * has enough candidates instead of building the whole list.
 */
function* discoveryPositions(center: Vector3, preferred: Vector3 | undefined): Generator<Vector3> {
  if (preferred) yield preferred;
  for (const offset of OFFSETS) {
    const pos = { x: center.x + offset.x, y: center.y + offset.y, z: center.z + offset.z };
    if (preferred && pos.x === preferred.x && pos.y === preferred.y && pos.z === preferred.z) continue;
    yield pos;
  }
}

/** An available stair that should carry a Sit target, and the dimension to spawn it in. */
export interface TargetCandidate {
  stair: StairDescription;
  dimension: Dimension;
}

/** A spawned `sit:target` helper and the stair it stands for. */
export interface TargetRecord extends TargetCandidate {
  entity: Entity;
  anchor: Vector3;
  lastHeartbeat: number;
}

/** One player's last discovery pass, reused while nothing that could change its result has changed. */
interface DiscoveryCache {
  signature: string;
  tick: number;
  candidates: TargetCandidate[];
}

/**
 * Invisible, non-rideable interaction targets make the native touch Sit button
 * available BEFORE a carrier is spawned. Each available stair gets at most one
 * target, shared by nearby players. Carriers remain separate and unchanged.
 */
export class InteractionTargets {
  readonly world: SeatWorld;
  readonly system: SeatClock;
  readonly seats: SeatManager;
  byBlock = new Map<string, TargetRecord>();
  byEntity = new Map<string, TargetRecord>();
  /** Stair key -> the tick until which that stair gets no target (after a click that was not a sit). */
  suppressed = new Map<string, number>();
  /** After `/sit:clear`, no target is made until this tick. */
  pausedUntil = -1;
  /** Bumped whenever the world around a standing player may have changed: a block placed or broken, a seat taken. */
  generation = 0;
  private discovery = new Map<string, DiscoveryCache>();
  constructor(world: SeatWorld, system: SeatClock, seats: SeatManager) {
    this.world = world;
    this.system = system;
    this.seats = seats;
  }
  /**
   * The Sit button preference. The dynamic property is the source of truth; the tag only mirrors it because the
   * `sit:target` entity's interaction filter can read tags but not dynamic properties, and `refresh` re-syncs it.
   */
  enabled(player: Player): boolean {
    try {
      return player.getDynamicProperty(CONFIG.buttonProperty) !== false;
    } catch {
      return false;
    }
  }
  setEnabled(player: Player, enabled: boolean): void {
    player.setDynamicProperty(CONFIG.buttonProperty, enabled);
    this.syncButtonTag(player);
    this.blocksChanged();
    this.refresh();
  }
  private syncButtonTag(player: Player): void {
    try {
      const enabled = this.enabled(player);
      if (enabled && player.hasTag(CONFIG.buttonDisabledTag)) player.removeTag(CONFIG.buttonDisabledTag);
      else if (!enabled && !player.hasTag(CONFIG.buttonDisabledTag)) player.addTag(CONFIG.buttonDisabledTag);
    } catch {
      /* Disconnected. */
    }
  }
  /** Invalidates every player's cached discovery; the next refresh scans again. */
  blocksChanged(): void {
    this.generation++;
  }
  forget(playerId: string): void {
    this.discovery.delete(playerId);
  }
  /** Drops every record, suppression and cache without touching entities; `sweep` handles those. */
  reset(): void {
    this.byBlock.clear();
    this.byEntity.clear();
    this.suppressed.clear();
    this.discovery.clear();
    this.pausedUntil = -1;
    this.generation = 0;
  }
  /** Could this player sit right now? If not, no target near them is worth having. */
  canRequest(player: Player): boolean {
    try {
      const seat = this.seats.get(player.id);
      return (
        this.enabled(player) && emptyHands(player) && !this.seats.onCooldown(player.id) && !eligible(player, seat?.seat)
      );
    } catch {
      return false;
    }
  }
  get(entityId: string): TargetRecord | undefined {
    return this.byEntity.get(entityId);
  }
  remove(key: string): boolean {
    const record = this.byBlock.get(key);
    if (!record) return false;
    this.byBlock.delete(key);
    this.byEntity.delete(record.entity.id);
    removeSeat(record.entity);
    return true;
  }
  /** Removes a stair's target and keeps it away for a while, so a target cannot keep stealing a player's clicks. */
  suppress(key: string, ticks = CONFIG.targetSuppressTicks): void {
    this.suppressed.set(key, this.system.currentTick + ticks);
    this.remove(key);
  }
  /** A stair someone just sat on needs no prompt. */
  pruneOccupied(): void {
    for (const [key] of this.byBlock) if (this.seats.byBlock.has(key)) this.remove(key);
  }
  /** The free, reachable stairs around one player, nearest first, up to the per-player cap. */
  candidates(player: Player, preferredStair?: StairDescription): TargetCandidate[] {
    const origin = player.location;
    const center = { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) };
    const own = this.seats.get(player.id);
    const candidates: TargetCandidate[] = [];
    const preferred = preferredStair?.dimensionId === player.dimension.id ? preferredStair.location : undefined;
    for (const pos of discoveryPositions(center, preferred)) {
      if (distanceSquared(origin, { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 }) > (CONFIG.reach + 0.5) ** 2)
        continue;
      const stair = readStair(getBlock(player.dimension, pos));
      if (
        !stair ||
        this.seats.byBlock.has(stair.key) ||
        (this.suppressed.get(stair.key) ?? -1) > this.system.currentTick
      )
        continue;
      // A seated player only gets prompts for stairs they could actually move to.
      if (own && !nearbyStair(own.stair, stair)) continue;
      if (!hasHeadroom(player.dimension, stair)) continue;
      candidates.push({ stair, dimension: player.dimension });
      if (candidates.length >= CONFIG.maxTargetsPerPlayer) break;
    }
    return candidates;
  }
  /**
   * The periodic pass: drop stale targets, work out which stairs anyone online could sit on, remove targets that
   * nobody wants any more and create or renew the rest.
   */
  refresh(): void {
    const tick = this.system.currentTick;
    for (const [key, until] of this.suppressed) if (until <= tick) this.suppressed.delete(key);
    if (tick < this.pausedUntil) return;
    // Stale helpers first: a stair that is gone or changed invalidates every cached discovery, so the scan below
    // sees the world as it is now and a rotated chair gets its new prompt in the same pass.
    for (const [key, record] of this.byBlock) {
      if (this.stillValid(record)) continue;
      this.remove(key);
      this.blocksChanged();
    }
    const wanted = new Map<string, TargetCandidate>();
    const online = new Set<string>();
    for (const player of this.world.getAllPlayers()) {
      online.add(player.id);
      this.syncButtonTag(player);
      if (!this.canRequest(player)) {
        this.discovery.delete(player.id);
        continue;
      }
      try {
        for (const candidate of this.cachedCandidates(player, tick)) {
          if (!wanted.has(candidate.stair.key) && wanted.size < CONFIG.maxTargetsTotal)
            wanted.set(candidate.stair.key, candidate);
        }
      } catch {
        /* A disconnected player or unloaded chunk cannot request targets. */
      }
    }
    for (const id of this.discovery.keys()) if (!online.has(id)) this.discovery.delete(id);
    for (const [key] of this.byBlock) if (!wanted.has(key)) this.remove(key);
    for (const candidate of wanted.values()) this.ensureTarget(candidate, tick);
  }
  /**
   * Whether a spawned target still stands where it should for the stair it stands for. The stair itself is
   * re-read every pass: a cached discovery can be a few ticks old, and a chair broken by a piston or flooded by
   * water must lose its prompt at once, not when the cache expires.
   */
  private stillValid(record: TargetRecord): boolean {
    if (
      !valid(record.entity) ||
      record.entity.dimension.id !== record.dimension.id ||
      distanceSquared(record.entity.location, record.anchor) > MAX_TARGET_DRIFT_SQUARED
    )
      return false;
    const actual = readStair(getBlock(record.dimension, record.stair.location));
    return !!actual && actual.fingerprint === record.stair.fingerprint && hasHeadroom(record.dimension, actual);
  }
  /**
   * A player who has not moved to another block, whose seat is unchanged and around whom no block has changed
   * keeps the result of the last scan for `targetCacheTicks`. Standing still in a stairless room costs nothing.
   */
  private cachedCandidates(player: Player, tick: number): TargetCandidate[] {
    const origin = player.location;
    const own = this.seats.get(player.id);
    // The signature is everything the scan's result depends on, joined into one string for a cheap comparison.
    const signature = [
      player.dimension.id,
      Math.floor(origin.x),
      Math.floor(origin.y),
      Math.floor(origin.z),
      own?.stair.key ?? "",
      this.generation,
      this.seats.byBlock.size,
      this.suppressed.size,
    ].join("|");
    const cached = this.discovery.get(player.id);
    if (cached && cached.signature === signature && tick - cached.tick < CONFIG.targetCacheTicks) {
      return cached.candidates;
    }
    const candidates = this.candidates(player);
    this.discovery.set(player.id, { signature, tick, candidates });
    return candidates;
  }
  /**
   * Update only the acting player's neighborhood immediately after a sit/move.
   * In particular, restore the vacated chair's button without waiting for the
   * five-tick global discovery pass. Do NOT scan every player on every click.
   */
  refreshForPlayer(player: Player, vacatedStair?: StairDescription): void {
    this.discovery.delete(player.id);
    this.pruneOccupied();
    if (this.system.currentTick < this.pausedUntil || !this.canRequest(player)) return;
    try {
      for (const candidate of this.candidates(player, vacatedStair)) this.ensureTarget(candidate);
    } catch {
      /* Target discovery must not undo an already successful sit/move. */
    }
  }
  /** Shared, bounded, idempotent target creation and renewal. */
  ensureTarget({ stair, dimension }: TargetCandidate, tick = this.system.currentTick): void {
    const key = stair.key;
    if (tick < this.pausedUntil || this.seats.byBlock.has(key) || (this.suppressed.get(key) ?? -1) > tick) return;
    let record = this.byBlock.get(key);
    try {
      // An existing target that no longer matches its stair is replaced rather than trusted.
      if (
        record &&
        (!valid(record.entity) ||
          record.entity.dimension.id !== dimension.id ||
          distanceSquared(record.entity.location, record.anchor) > MAX_TARGET_DRIFT_SQUARED ||
          record.stair.fingerprint !== stair.fingerprint)
      ) {
        this.remove(key);
        record = undefined;
      }
      if (!record) {
        if (this.byBlock.size >= CONFIG.maxTargetsTotal) return;
        // A candidate can come from a cached discovery; the block is what counts.
        const actual = readStair(getBlock(dimension, stair.location));
        if (!actual || actual.fingerprint !== stair.fingerprint || !hasHeadroom(dimension, actual)) {
          this.blocksChanged();
          return;
        }
        // Keep the approved target hit area and invisible, non-colliding geometry.
        const anchor = { x: stair.location.x + 0.5, y: stair.location.y + 0.5, z: stair.location.z + 0.5 };
        const entity = dimension.spawnEntity(CONFIG.targetEntityId, anchor);
        record = { entity, stair, dimension, anchor, lastHeartbeat: tick };
        this.byBlock.set(key, record);
        this.byEntity.set(entity.id, record);
        entity.triggerEvent("sit:heartbeat");
      } else if (tick - record.lastHeartbeat >= CONFIG.heartbeatInterval) {
        // Keep a wanted target alive; without heartbeats its own timer despawns it.
        record.entity.triggerEvent("sit:heartbeat");
        record.lastHeartbeat = tick;
      }
    } catch (error) {
      this.remove(key);
      log.throttled("targets", tick, CONFIG.sweepInterval, `could not refresh Sit targets: ${log.describe(error)}`);
    }
  }
  /** Remove only this pack's interaction helpers, never vanilla or other packs' entities. */
  sweep(clearAll = false): number {
    let count = 0;
    if (clearAll) {
      this.pausedUntil = this.system.currentTick + CONFIG.targetSuppressTicks;
      for (const key of [...this.byBlock.keys()]) if (this.remove(key)) count++;
      this.suppressed.clear();
    }
    // Any target entity not in the records is an orphan from a crash or reload.
    for (const dimension of loadedDimensions(this.world).values()) {
      try {
        for (const entity of dimension.getEntities({ type: CONFIG.targetEntityId })) {
          if (!this.byEntity.has(entity.id)) {
            removeSeat(entity);
            count++;
          }
        }
      } catch {
        /* Unavailable dimension. */
      }
    }
    return count;
  }
}
