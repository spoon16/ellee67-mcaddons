import type { Dimension, Entity, Player, System, Vector3, World } from "@minecraft/server";
import { CONFIG } from "./config.ts";
import {
  eligible,
  emptyHands,
  getBlock,
  hasHeadroom,
  nearbyStair,
  readStair,
  removeSeat,
  type SeatManager,
  valid,
} from "./seats.ts";
import { distanceSquared, type StairDescription } from "./stairs.ts";

// Precomputed, nearest-first discovery offsets. Discovery is local and bounded;
// it never loads chunks, places blocks, or replaces a vanilla stair definition.
const RADIUS = Math.ceil(CONFIG.reach + 0.5);
const OFFSETS: Vector3[] = [];
for (let x = -RADIUS; x <= RADIUS; x++)
  for (let y = -RADIUS; y <= RADIUS; y++)
    for (let z = -RADIUS; z <= RADIUS; z++) {
      OFFSETS.push({ x, y, z });
    }
OFFSETS.sort((a, b) => a.x * a.x + a.y * a.y + a.z * a.z - b.x * b.x - b.y * b.y - b.z * b.z);

/** Prefer the chair just vacated, then discover nearest-first as before. */
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

/**
 * Invisible, non-rideable interaction targets make the native touch Sit button
 * available BEFORE a carrier is spawned. Each available stair gets at most one
 * target, shared by nearby players. Carriers remain separate and unchanged.
 */
export class InteractionTargets {
  readonly world: World;
  readonly system: System;
  readonly seats: SeatManager;
  byBlock = new Map<string, TargetRecord>();
  byEntity = new Map<string, TargetRecord>();
  suppressed = new Map<string, number>();
  pausedUntil = -1;
  lastWarning = Number.NEGATIVE_INFINITY;
  constructor(world: World, system: System, seats: SeatManager) {
    this.world = world;
    this.system = system;
    this.seats = seats;
  }
  enabled(player: Player): boolean {
    try {
      return player.getDynamicProperty(CONFIG.buttonProperty) !== false && !player.hasTag(CONFIG.buttonDisabledTag);
    } catch {
      return false;
    }
  }
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
  suppress(key: string, ticks = CONFIG.targetSuppressTicks): void {
    this.suppressed.set(key, this.system.currentTick + ticks);
    this.remove(key);
  }
  pruneOccupied(): void {
    for (const [key] of this.byBlock) if (this.seats.byBlock.has(key)) this.remove(key);
  }
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
      if (own && !nearbyStair(own.stair, stair)) continue;
      if (!hasHeadroom(player.dimension, stair)) continue;
      candidates.push({ stair, dimension: player.dimension });
      if (candidates.length >= CONFIG.maxTargetsPerPlayer) break;
    }
    return candidates;
  }
  refresh(): void {
    const tick = this.system.currentTick;
    for (const [key, until] of this.suppressed) if (until <= tick) this.suppressed.delete(key);
    if (tick < this.pausedUntil) return;
    const wanted = new Map<string, TargetCandidate>();
    for (const player of this.world.getAllPlayers()) {
      if (!this.canRequest(player)) continue;
      try {
        for (const candidate of this.candidates(player)) {
          if (!wanted.has(candidate.stair.key) && wanted.size < CONFIG.maxTargetsTotal)
            wanted.set(candidate.stair.key, candidate);
        }
      } catch {
        /* A disconnected player or unloaded chunk cannot request targets. */
      }
    }
    for (const [key, record] of this.byBlock) {
      const request = wanted.get(key);
      if (
        !request ||
        !valid(record.entity) ||
        record.entity.dimension.id !== record.dimension.id ||
        distanceSquared(record.entity.location, record.anchor) > 0.01 ||
        request.stair.fingerprint !== record.stair.fingerprint
      )
        this.remove(key);
    }
    for (const candidate of wanted.values()) this.ensureTarget(candidate, tick);
  }
  /**
   * Update only the acting player's neighborhood immediately after a sit/move.
   * In particular, restore the vacated chair's button without waiting for the
   * five-tick global discovery pass. Do NOT scan every player on every click.
   */
  refreshForPlayer(player: Player, vacatedStair?: StairDescription): void {
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
      if (
        record &&
        (!valid(record.entity) ||
          record.entity.dimension.id !== dimension.id ||
          distanceSquared(record.entity.location, record.anchor) > 0.01 ||
          record.stair.fingerprint !== stair.fingerprint)
      ) {
        this.remove(key);
        record = undefined;
      }
      if (!record) {
        if (this.byBlock.size >= CONFIG.maxTargetsTotal) return;
        // Keep the approved target hit area and invisible, non-colliding geometry.
        const anchor = { x: stair.location.x + 0.5, y: stair.location.y + 0.5, z: stair.location.z + 0.5 };
        const entity = dimension.spawnEntity(CONFIG.targetEntityId, anchor);
        record = { entity, stair, dimension, anchor, lastHeartbeat: tick };
        this.byBlock.set(key, record);
        this.byEntity.set(entity.id, record);
        entity.triggerEvent("sit:heartbeat");
      } else if (tick - record.lastHeartbeat >= CONFIG.heartbeatInterval) {
        record.entity.triggerEvent("sit:heartbeat");
        record.lastHeartbeat = tick;
      }
    } catch (error) {
      this.remove(key);
      if (tick - this.lastWarning >= CONFIG.sweepInterval) {
        console.warn(`[ElleeDog 67 Sit] Could not refresh Sit targets: ${String(error)}`);
        this.lastWarning = tick;
      }
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
    const dimensions = new Map<string, Dimension>();
    for (const id of ["overworld", "nether", "the_end"]) {
      try {
        const d = this.world.getDimension(id);
        dimensions.set(d.id, d);
      } catch {
        /* Unavailable. */
      }
    }
    for (const player of this.world.getAllPlayers()) dimensions.set(player.dimension.id, player.dimension);
    for (const dimension of dimensions.values()) {
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
