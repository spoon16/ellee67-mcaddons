import {
  type Block,
  type Dimension,
  type Entity,
  EquipmentSlot,
  GameMode,
  type Player,
  type System,
  type Vector2,
  type Vector3,
  type World,
} from "@minecraft/server";
import { loadedDimensions } from "../../core/dimensions.ts";
import { blockId } from "../../core/vanilla.ts";
import { CONFIG } from "./config.ts";
import { log } from "./log.ts";
import { describeStair, distanceSquared, highTreadPoint, type StairDescription } from "./stairs.ts";

const BAD_SUPPORT: ReadonlySet<string> = new Set<string>([
  blockId("minecraft:magma"),
  blockId("minecraft:cactus"),
  blockId("minecraft:campfire"),
  blockId("minecraft:soul_campfire"),
  blockId("minecraft:fire"),
  blockId("minecraft:soul_fire"),
  blockId("minecraft:lava"),
  blockId("minecraft:flowing_lava"),
  blockId("minecraft:water"),
  blockId("minecraft:flowing_water"),
  blockId("minecraft:powder_snow"),
  blockId("minecraft:sweet_berry_bush"),
  blockId("minecraft:wither_rose"),
  blockId("minecraft:pointed_dripstone"),
]);

/** One seated player: the invisible carrier entity, the stair it sits on and where the player came from. */
export interface SeatRecord {
  seat: Entity;
  player: Player;
  playerId: string;
  dimension: Dimension;
  stair: StairDescription;
  anchor: Vector3;
  entry: Vector3;
  born: number;
  transfers: number;
  lastTransfer: number;
  /** Set by the entry point for /sit:status: server ticks between the input and the sit it produced. */
  lastInputDelayTicks?: number;
}

export type SitResult =
  | { ok: true; alreadyThere?: boolean; transferred?: boolean; vacatedStair?: StairDescription }
  | { ok: false; error: string };

export function valid(entity: Entity | undefined): boolean {
  try {
    return !!entity?.isValid;
  } catch {
    return false;
  }
}
export function ridingEntity(player: Player): Entity | undefined {
  try {
    return player.getComponent("minecraft:riding")?.entityRidingOn;
  } catch {
    return undefined;
  }
}
export function emptyHands(player: Player): boolean {
  try {
    const equipment = player.getComponent("minecraft:equippable");
    if (!equipment) return false;
    return !equipment.getEquipment(EquipmentSlot.Mainhand) && !equipment.getEquipment(EquipmentSlot.Offhand);
  } catch {
    return false;
  }
}
export function readStair(block: Block | undefined): StairDescription | undefined {
  try {
    if (!block || block.isWaterlogged) return undefined;
    return describeStair(block.typeId, block.permutation.getAllStates(), block.location, block.dimension.id);
  } catch {
    return undefined;
  }
}
export function aimedBlock(player: Player): Block | undefined {
  try {
    return player.getBlockFromViewDirection({
      maxDistance: CONFIG.reach,
      includeLiquidBlocks: true,
      includePassableBlocks: false,
    })?.block;
  } catch {
    return undefined;
  }
}
export function getBlock(dimension: Dimension, pos: Vector3): Block | undefined {
  try {
    return dimension.getBlock(pos);
  } catch {
    return undefined;
  }
}
function isAir(dimension: Dimension, pos: Vector3): boolean {
  return getBlock(dimension, pos)?.isAir === true;
}
export function hasHeadroom(dimension: Dimension, stair: StairDescription): boolean {
  const p = stair.location;
  // Conservative: keep two entire blocks above the chair clear. Do not use
  // Block.isSolid: that property is not part of the targeted stable API.
  return (
    isAir(dimension, { x: p.x, y: p.y + 1, z: p.z }) &&
    isAir(dimension, { x: p.x, y: p.y + 2, z: p.z }) &&
    isAir(dimension, { x: p.x + stair.front.x, y: p.y + 1, z: p.z + stair.front.z })
  );
}
export function eligible(player: Player, ownSeat?: Entity): string | undefined {
  try {
    if (!valid(player)) return "Player is not ready yet.";
    if ((player.getComponent("minecraft:health")?.currentValue ?? 1) <= 0) return "You cannot sit while respawning.";
    if (player.getGameMode() === GameMode.Spectator) return "Leave Spectator mode before sitting.";
    if (player.isFlying || player.isGliding || player.isSwimming || player.isSleeping) {
      return "Land and leave swimming, flying, gliding, or sleeping before sitting.";
    }
    const mount = ridingEntity(player);
    if (mount && mount.id !== ownSeat?.id) return "Dismount your current vehicle first.";
    if (player.isSneaking) return "Release crouch first, then use /sit:down.";
    return undefined;
  } catch {
    return "Player is not ready yet.";
  }
}
export function removeSeat(entity: Entity | undefined): void {
  if (!valid(entity) || !entity) return;
  try {
    entity.remove();
  } catch {
    try {
      entity.triggerEvent("sit:expire");
    } catch {
      /* Already unloaded. */
    }
  }
}
function safeSupport(block: Block | undefined): boolean {
  return !!block && !block.isAir && !block.isLiquid && !block.isWaterlogged && !BAD_SUPPORT.has(block.typeId);
}

/** Only choose integer-height, empty-body-space exits; let the engine handle the rest. */
export function safeExit(dimension: Dimension, stair: StairDescription, entry?: Vector3): Vector3 | undefined {
  const candidates: Vector3[] = [highTreadPoint(stair)];
  const f = stair.front;
  for (const [dx, dz] of [
    [f.x, f.z],
    [-f.z, f.x],
    [f.z, -f.x],
    [-f.x, -f.z],
  ] as const) {
    for (const dy of [0, 1, -1]) {
      candidates.push({
        x: stair.location.x + dx + 0.5,
        y: stair.location.y + dy + 0.01,
        z: stair.location.z + dz + 0.5,
      });
    }
  }
  if (entry && distanceSquared(entry, stair.location) < 36) candidates.push(entry);
  for (const candidate of candidates) {
    try {
      // Raycasting detects actual support, including stair quarters. It avoids
      // treating non-solid decorations as a safe full block underneath a player.
      const hit = dimension.getBlockFromRay(
        { x: candidate.x, y: candidate.y + 0.2, z: candidate.z },
        { x: 0, y: -1, z: 0 },
        { maxDistance: 0.5, includeLiquidBlocks: true, includePassableBlocks: false },
      );
      if (!hit || String(hit.face).toLowerCase() !== "up" || !safeSupport(hit.block)) continue;
      const surface = hit.block.location.y + hit.faceLocation.y;
      // Fractional slab/fence exits are left to native dismount placement. Avoid
      // claiming exact AABB support for arbitrary custom collision geometry.
      if (Math.abs(surface - Math.round(surface)) > 0.005) continue;
      const p = { x: candidate.x, y: surface + 0.01, z: candidate.z };
      let clear = true;
      for (const dx of [-0.3, 0.3])
        for (const dz of [-0.3, 0.3]) {
          for (const dy of [0.05, 0.95, 1.79]) {
            if (!isAir(dimension, { x: Math.floor(p.x + dx), y: Math.floor(p.y + dy), z: Math.floor(p.z + dz) }))
              clear = false;
          }
        }
      if (clear) return p;
    } catch {
      /* Try another loaded candidate. */
    }
  }
  return undefined;
}

/** Transfers stay local: neighboring/nearby chairs, not a long-range teleport. */
export function nearbyStair(from: StairDescription, to: StairDescription): boolean {
  return (
    from.dimensionId === to.dimensionId &&
    Math.abs(from.location.y - to.location.y) <= CONFIG.transferMaxRise &&
    distanceSquared(from.location, to.location) <= CONFIG.transferReach ** 2
  );
}

/**
 * Conservative swept upper-body clearance, including the player's width.
 * Use the higher chair's clearance level when the chairs differ by one block.
 * No blocks are modified and no unloaded positions are treated as empty.
 */
export function clearTransferPath(dimension: Dimension, from: StairDescription, to: StairDescription): boolean {
  const a = { x: from.location.x + from.local.x, z: from.location.z + from.local.z };
  const b = { x: to.location.x + to.local.x, z: to.location.z + to.local.z };
  const y = Math.max(from.location.y, to.location.y) + 1;
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    for (const dx of [-0.3, 0.3])
      for (const dz of [-0.3, 0.3]) {
        const x = Math.floor(a.x + (b.x - a.x) * t + dx);
        const z = Math.floor(a.z + (b.z - a.z) * t + dz);
        if (!isAir(dimension, { x, y, z }) || !isAir(dimension, { x, y: y + 1, z })) return false;
      }
  }
  return true;
}

/** The slices of the engine the seat modules read; tests inject plain objects with a settable clock. */
export type SeatWorld = Pick<World, "getAllPlayers" | "getDimension">;
export type SeatClock = Pick<System, "currentTick">;

export class SeatManager {
  readonly world: SeatWorld;
  readonly system: SeatClock;
  byPlayer = new Map<string, SeatRecord>();
  byBlock = new Map<string, SeatRecord>();
  cooldowns = new Map<string, number>();
  constructor(world: SeatWorld, system: SeatClock) {
    this.world = world;
    this.system = system;
  }
  message(player: Player, text: string): void {
    try {
      player.sendMessage(`§b[ElleeDog 67 Sit]§r ${text}`);
    } catch {
      /* Disconnected. */
    }
  }
  onCooldown(playerId: string): boolean {
    return (this.cooldowns.get(playerId) ?? -1) > this.system.currentTick;
  }
  get(playerId: string): SeatRecord | undefined {
    return this.byPlayer.get(playerId);
  }
  height(player: Player): number {
    const value = player.getDynamicProperty(CONFIG.heightProperty);
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(CONFIG.minHeightOffset, Math.min(CONFIG.maxHeightOffset, value))
      : 0;
  }
  sit(player: Player, block: Block | undefined, requireEmpty = true): SitResult {
    const failure = (error: string): SitResult => ({ ok: false, error });
    if (this.byPlayer.has(player.id)) return this.transfer(player, block, requireEmpty);
    if (this.onCooldown(player.id)) return failure("Pause briefly after standing, then try again.");
    const reason = eligible(player);
    if (reason) return failure(reason);
    if (requireEmpty && !emptyHands(player))
      return failure("Select an empty hotbar slot and empty your offhand first.");
    const stair = readStair(block);
    if (!stair) return failure("Look at a dry, upright vanilla stair within 3.5 blocks.");
    if (stair.dimensionId !== player.dimension.id) return failure("The stair is in another dimension.");
    const target = { x: stair.location.x + 0.5, y: stair.location.y + 0.5, z: stair.location.z + 0.5 };
    if (distanceSquared(player.location, target) > (CONFIG.reach + 0.5) ** 2)
      return failure("Move closer to the stair.");
    if (!hasHeadroom(player.dimension, stair))
      return failure("The stair needs two clear blocks above it and space in front.");
    const occupied = this.byBlock.get(stair.key);
    if (occupied) return failure("Someone is already sitting on that stair.");

    let seat: Entity | undefined;
    let previousRotation: Vector2 | undefined;
    try {
      const anchor = {
        x: stair.location.x + stair.local.x,
        y: stair.location.y + CONFIG.seatSurfaceY + this.height(player),
        z: stair.location.z + stair.local.z,
      };
      const entry = { ...player.location };
      previousRotation = player.getRotation();
      // Script callbacks execute serially. Reserving the block before returning
      // to the engine prevents two players from taking the same chair.
      seat = player.dimension.spawnEntity(CONFIG.entityId, anchor);
      seat.setRotation({ x: 0, y: stair.front.yaw });
      seat.triggerEvent("sit:heartbeat");
      const rideable = seat.getComponent("minecraft:rideable");
      if (!rideable?.addRider(player)) throw new Error("The rideable component rejected the rider");
      player.setRotation({ x: 0, y: stair.front.yaw });
      const record: SeatRecord = {
        seat,
        player,
        playerId: player.id,
        dimension: player.dimension,
        stair,
        anchor,
        entry,
        born: this.system.currentTick,
        transfers: 0,
        lastTransfer: Number.NEGATIVE_INFINITY,
      };
      this.byPlayer.set(player.id, record);
      this.byBlock.set(stair.key, record);
      return { ok: true };
    } catch (error) {
      try {
        seat?.getComponent("minecraft:rideable")?.ejectRiders();
      } catch {
        /* Nothing mounted. */
      }
      removeSeat(seat);
      if (previousRotation && valid(player)) {
        try {
          player.setRotation(previousRotation);
        } catch {
          /* Disconnected. */
        }
      }
      log.warn(`could not mount: ${log.describe(error)}`);
      return failure("Could not create the seat. Check that both Stair Sitting packs are active.");
    }
  }
  /**
   * Move the SAME carrier while its rider remains mounted. The normal path never
   * calls ejectRiders, addRider, player.teleport, release, or spawnEntity.
   * A destination is reserved before movement and committed only on success.
   */
  transfer(player: Player, block: Block | undefined, requireEmpty = true): SitResult {
    const failure = (error: string): SitResult => ({ ok: false, error });
    const record = this.get(player.id);
    if (!record) return failure("Sit on a stair first.");
    const { seat, dimension } = record;
    if (
      !valid(player) ||
      !valid(seat) ||
      player.dimension.id !== dimension.id ||
      ridingEntity(player)?.id !== seat.id ||
      distanceSquared(player.location, record.anchor) > 16 ||
      distanceSquared(seat.location, record.anchor) > 0.09
    ) {
      return failure("Your original seat is no longer active.");
    }
    const reason = eligible(player, seat);
    if (reason) return failure(reason);
    if (requireEmpty && !emptyHands(player))
      return failure("Select an empty hotbar slot and empty your offhand first.");
    const current = readStair(getBlock(dimension, record.stair.location));
    if (!current || current.fingerprint !== record.stair.fingerprint || !hasHeadroom(dimension, current)) {
      return failure("Your original stair changed; stand before sitting again.");
    }
    const stair = readStair(block);
    if (!stair) return failure("Choose a dry, upright stair nearby.");
    if (stair.key === record.stair.key) return { ok: true, alreadyThere: true };
    if (!nearbyStair(record.stair, stair))
      return failure("Choose a stair within 3 blocks and no more than one block higher or lower.");
    if (!hasHeadroom(dimension, stair))
      return failure("That stair needs two clear blocks above it and space in front.");
    if (this.byBlock.has(stair.key)) return failure("Someone is already sitting on that stair.");
    if (!clearTransferPath(dimension, record.stair, stair))
      return failure("The space between these chairs is obstructed.");
    // No inter-chair cooldown. Every accepted request commits in this call;
    // the entry point coalesces pending duplicate input instead of making the rider wait.

    const previous = { stair: record.stair, anchor: record.anchor, rotation: player.getRotation() };
    // Preserve the exact, already-calibrated height throughout this sitting session.
    const anchor = {
      x: stair.location.x + stair.local.x,
      y: stair.location.y + (record.anchor.y - record.stair.location.y),
      z: stair.location.z + stair.local.z,
    };
    this.byBlock.set(stair.key, record);
    try {
      seat.teleport(anchor, { checkForBlocks: false, keepVelocity: false, rotation: { x: 0, y: stair.front.yaw } });
      const riders = seat.getComponent("minecraft:rideable")?.getRiders() ?? [];
      if (!riders.some((rider) => rider.id === player.id) || distanceSquared(seat.location, anchor) > 0.01) {
        throw new Error("Carrier teleport did not preserve the rider and destination");
      }
      record.stair = stair;
      record.anchor = anchor;
      record.lastTransfer = this.system.currentTick;
      record.transfers++;
      this.byBlock.delete(previous.stair.key);
      // Facing changes once to match the new chair; pitch and riding pose remain.
      try {
        player.setRotation({ x: previous.rotation.x, y: stair.front.yaw });
      } catch {
        /* Optional orientation only. */
      }
      try {
        seat.triggerEvent("sit:heartbeat");
      } catch {
        /* Regular heartbeat will retry. */
      }
      return { ok: true, transferred: true, vacatedStair: previous.stair };
    } catch (error) {
      this.byBlock.delete(stair.key);
      this.restoreSeat(record, previous, anchor);
      log.warn(`could not transfer: ${log.describe(error)}`);
      return failure("Could not move the seat; /sit:status has the details.");
    }
  }
  /**
   * Rolls back a failed transfer, but never retrieves a player who has moved dimensions, gone away or boarded a
   * different vehicle in the meantime. Emergency recovery only; a successful transfer never comes here.
   */
  private restoreSeat(
    record: SeatRecord,
    previous: { stair: StairDescription; anchor: Vector3; rotation: Vector2 },
    attempted: Vector3,
  ): void {
    const { player, seat, dimension } = record;
    try {
      const mount = ridingEntity(player);
      if (
        !valid(player) ||
        !valid(seat) ||
        player.dimension.id !== dimension.id ||
        distanceSquared(player.location, attempted) > 16 ||
        (mount && mount.id !== seat.id)
      )
        return;
      seat.teleport(previous.anchor, {
        checkForBlocks: false,
        keepVelocity: false,
        rotation: { x: 0, y: previous.stair.front.yaw },
      });
      if (!ridingEntity(player)) seat.getComponent("minecraft:rideable")?.addRider(player);
      player.setRotation(previous.rotation);
    } catch {
      /* Normal tick cleanup handles an irrecoverable helper. */
    }
  }
  release(playerId: string, reposition = false): boolean {
    const record = this.byPlayer.get(playerId);
    if (!record) return false;
    this.byPlayer.delete(playerId);
    this.byBlock.delete(record.stair.key);
    this.cooldowns.set(playerId, this.system.currentTick + CONFIG.cooldownTicks);
    const { player, seat, dimension, stair, entry } = record;
    let destination: Vector3 | undefined;
    const currentMount = ridingEntity(player);
    const ownMount = currentMount?.id === seat.id;
    // Never pull someone back from another dimension, a teleport, or a new vehicle.
    const nearby =
      valid(player) && player.dimension.id === dimension.id && distanceSquared(player.location, record.anchor) < 16;
    if (reposition && nearby && (!currentMount || ownMount)) destination = safeExit(dimension, stair, entry);
    try {
      if (valid(seat)) seat.getComponent("minecraft:rideable")?.ejectRiders();
    } catch {
      /* Native dismount already occurred. */
    }
    removeSeat(seat);
    if (destination && valid(player)) {
      try {
        player.teleport(destination, { dimension, checkForBlocks: true });
      } catch {
        /* Keep native dismount position. */
      }
    }
    return true;
  }
  tick(): void {
    for (const [id, record] of this.byPlayer) {
      try {
        const { player, seat, dimension, stair } = record;
        if (!valid(player) || !valid(seat)) {
          this.release(id);
          continue;
        }
        if (
          player.dimension.id !== dimension.id ||
          distanceSquared(seat.location, record.anchor) > 0.09 ||
          distanceSquared(player.location, record.anchor) > 16
        ) {
          this.release(id);
          continue;
        }
        const riders = seat.getComponent("minecraft:rideable")?.getRiders() ?? [];
        if (!riders.some((rider) => rider.id === id)) {
          this.release(id);
          continue;
        }
        const actual = readStair(getBlock(dimension, stair.location));
        if (!actual || actual.fingerprint !== stair.fingerprint || !hasHeadroom(dimension, actual)) {
          this.release(id, true);
          continue;
        }
        if (player.getGameMode() === GameMode.Spectator || player.isSwimming || player.isFlying || player.isGliding) {
          this.release(id, true);
          continue;
        }
        if (this.system.currentTick % CONFIG.heartbeatInterval === 0) seat.triggerEvent("sit:heartbeat");
      } catch (error) {
        // Stand the player up rather than keep a seat the engine can no longer describe, and say why once: a
        // silent release every tick is the hardest symptom to trace in the Content Log.
        log.warnOnce(`tick:${id}`, `seat check failed for ${id}, standing the player up: ${log.describe(error)}`);
        this.release(id);
      }
    }
    for (const [id, until] of this.cooldowns) {
      if (until <= this.system.currentTick) this.cooldowns.delete(id);
    }
  }
  forget(playerId: string): void {
    this.release(playerId);
    this.cooldowns.delete(playerId);
    log.forget(`tick:${playerId}`);
  }
  /** Drops every record and cooldown without touching entities; `sweep` handles those. */
  reset(): void {
    this.byPlayer.clear();
    this.byBlock.clear();
    this.cooldowns.clear();
  }
  /** Sweep only this add-on's helper entities in loaded dimensions/chunks. */
  sweep(clearAll = false): number {
    let removed = 0;
    const dimensions = loadedDimensions(this.world);
    if (clearAll) {
      for (const id of [...this.byPlayer.keys()]) if (this.release(id, true)) removed++;
    }
    const active = new Set([...this.byPlayer.values()].map((record) => record.seat.id));
    for (const dimension of dimensions.values()) {
      try {
        for (const seat of dimension.getEntities({ type: CONFIG.entityId })) {
          if (!active.has(seat.id)) {
            removeSeat(seat);
            removed++;
          }
        }
      } catch {
        /* Unavailable dimension. */
      }
    }
    return removed;
  }
}
