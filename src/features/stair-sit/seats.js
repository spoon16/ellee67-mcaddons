import { CONFIG } from "./config.js";
import { blockKey, describeStair, distanceSquared, highTreadPoint } from "./stairs.js";

const BAD_SUPPORT = new Set([
  "minecraft:magma", "minecraft:cactus", "minecraft:campfire", "minecraft:soul_campfire",
  "minecraft:fire", "minecraft:soul_fire", "minecraft:lava", "minecraft:flowing_lava",
  "minecraft:water", "minecraft:flowing_water", "minecraft:powder_snow",
  "minecraft:sweet_berry_bush", "minecraft:wither_rose", "minecraft:pointed_dripstone",
]);

export function valid(entity) {
  try { return !!entity?.isValid; } catch { return false; }
}
export function ridingEntity(player) {
  try { return player.getComponent("minecraft:riding")?.entityRidingOn; } catch { return undefined; }
}
export function emptyHands(player) {
  try {
    const equipment = player.getComponent("minecraft:equippable");
    if (!equipment) return false;
    return !equipment.getEquipment("Mainhand") && !equipment.getEquipment("Offhand");
  } catch { return false; }
}
export function readStair(block) {
  try {
    if (!block || block.isWaterlogged) return undefined;
    return describeStair(block.typeId, block.permutation.getAllStates(), block.location, block.dimension.id);
  } catch { return undefined; }
}
export function aimedBlock(player) {
  try {
    return player.getBlockFromViewDirection({
      maxDistance: CONFIG.reach,
      includeLiquidBlocks: true,
      includePassableBlocks: false,
    })?.block;
  } catch { return undefined; }
}
export function getBlock(dimension, pos) {
  try { return dimension.getBlock(pos); } catch { return undefined; }
}
function isAir(dimension, pos) {
  return getBlock(dimension, pos)?.isAir === true;
}
export function hasHeadroom(dimension, stair) {
  const p = stair.location;
  // Conservative: keep two entire blocks above the chair clear. Do not use
  // Block.isSolid: that property is not part of the targeted stable API.
  return isAir(dimension, { x: p.x, y: p.y + 1, z: p.z }) &&
    isAir(dimension, { x: p.x, y: p.y + 2, z: p.z }) &&
    isAir(dimension, { x: p.x + stair.front.x, y: p.y + 1, z: p.z + stair.front.z });
}
export function eligible(player, ownSeat) {
  try {
    if (!valid(player)) return "Player is not ready yet.";
    if ((player.getComponent("minecraft:health")?.currentValue ?? 1) <= 0) return "You cannot sit while respawning.";
    if (player.getGameMode() === "Spectator") return "Leave Spectator mode before sitting.";
    if (player.isFlying || player.isGliding || player.isSwimming || player.isSleeping) {
      return "Land and leave swimming, flying, gliding, or sleeping before sitting.";
    }
    const mount = ridingEntity(player);
    if (mount && mount.id !== ownSeat?.id) return "Dismount your current vehicle first.";
    if (player.isSneaking) return "Release crouch first, then use /sit:down.";
    return undefined;
  } catch { return "Player is not ready yet."; }
}
export function removeSeat(entity) {
  if (!valid(entity)) return;
  try { entity.remove(); } catch {
    try { entity.triggerEvent("sit:expire"); } catch { /* Already unloaded. */ }
  }
}
function safeSupport(block) {
  return block && !block.isAir && !block.isLiquid && !block.isWaterlogged && !BAD_SUPPORT.has(block.typeId);
}

/** Only choose integer-height, empty-body-space exits; let the engine handle the rest. */
export function safeExit(dimension, stair, entry) {
  const candidates = [highTreadPoint(stair)];
  const f = stair.front;
  for (const [dx, dz] of [[f.x, f.z], [-f.z, f.x], [f.z, -f.x], [-f.x, -f.z]]) {
    for (const dy of [0, 1, -1]) {
      candidates.push({ x: stair.location.x + dx + 0.5, y: stair.location.y + dy + 0.01, z: stair.location.z + dz + 0.5 });
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
      for (const dx of [-0.3, 0.3]) for (const dz of [-0.3, 0.3]) {
        for (const dy of [0.05, 0.95, 1.79]) {
          if (!isAir(dimension, { x: Math.floor(p.x + dx), y: Math.floor(p.y + dy), z: Math.floor(p.z + dz) })) clear = false;
        }
      }
      if (clear) return p;
    } catch { /* Try another loaded candidate. */ }
  }
  return undefined;
}


/** Transfers stay local: neighboring/nearby chairs, not a long-range teleport. */
export function nearbyStair(from, to) {
  return from.dimensionId === to.dimensionId &&
    Math.abs(from.location.y - to.location.y) <= CONFIG.transferMaxRise &&
    distanceSquared(from.location, to.location) <= CONFIG.transferReach ** 2;
}

/**
 * Conservative swept upper-body clearance, including the player's width.
 * Use the higher chair's clearance level when the chairs differ by one block.
 * No blocks are modified and no unloaded positions are treated as empty.
 */
export function clearTransferPath(dimension, from, to) {
  const a = { x: from.location.x + from.local.x, z: from.location.z + from.local.z };
  const b = { x: to.location.x + to.local.x, z: to.location.z + to.local.z };
  const y = Math.max(from.location.y, to.location.y) + 1;
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    for (const dx of [-0.3, 0.3]) for (const dz of [-0.3, 0.3]) {
      const x = Math.floor(a.x + (b.x - a.x) * t + dx);
      const z = Math.floor(a.z + (b.z - a.z) * t + dz);
      if (!isAir(dimension, { x, y, z }) || !isAir(dimension, { x, y: y + 1, z })) return false;
    }
  }
  return true;
}

export class SeatManager {
  constructor(world, system) {
    this.world = world;
    this.system = system;
    this.byPlayer = new Map();
    this.byBlock = new Map();
    this.cooldowns = new Map();
  }
  message(player, text) {
    try { player.sendMessage(`§b[ElleeDog 67 Sit]§r ${text}`); } catch { /* Disconnected. */ }
  }
  onCooldown(playerId) { return (this.cooldowns.get(playerId) ?? -1) > this.system.currentTick; }
  get(playerId) { return this.byPlayer.get(playerId); }
  height(player) {
    const value = player.getDynamicProperty(CONFIG.heightProperty);
    return typeof value === "number" && Number.isFinite(value) ?
      Math.max(CONFIG.minHeightOffset, Math.min(CONFIG.maxHeightOffset, value)) : 0;
  }
  sit(player, block, requireEmpty = true) {
    const failure = (error) => ({ ok: false, error });
    if (this.byPlayer.has(player.id)) return this.transfer(player, block, requireEmpty);
    if (this.onCooldown(player.id)) return failure("Pause briefly after standing, then try again.");
    const reason = eligible(player);
    if (reason) return failure(reason);
    if (requireEmpty && !emptyHands(player)) return failure("Select an empty hotbar slot and empty your offhand first.");
    const stair = readStair(block);
    if (!stair) return failure("Look at a dry, upright vanilla stair within 3.5 blocks.");
    if (stair.dimensionId !== player.dimension.id) return failure("The stair is in another dimension.");
    const target = { x: stair.location.x + 0.5, y: stair.location.y + 0.5, z: stair.location.z + 0.5 };
    if (distanceSquared(player.location, target) > (CONFIG.reach + 0.5) ** 2) return failure("Move closer to the stair.");
    if (!hasHeadroom(player.dimension, stair)) return failure("The stair needs two clear blocks above it and space in front.");
    const occupied = this.byBlock.get(stair.key);
    if (occupied) return failure("Someone is already sitting on that stair.");

    let seat;
    let previousRotation;
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
      if (!rideable || !rideable.addRider(player)) throw new Error("The rideable component rejected the rider");
      player.setRotation({ x: 0, y: stair.front.yaw });
      const record = {
        seat, player, playerId: player.id, dimension: player.dimension,
        stair, anchor, entry, born: this.system.currentTick, transfers: 0, lastTransfer: -Infinity,
      };
      this.byPlayer.set(player.id, record);
      this.byBlock.set(stair.key, record);
      try { player.onScreenDisplay.setActionBar("Sitting • Use another nearby stair to move • Crouch / Dismount to stand"); } catch { /* Optional UI. */ }
      return { ok: true };
    } catch (error) {
      try { seat?.getComponent("minecraft:rideable")?.ejectRiders(); } catch { /* Nothing mounted. */ }
      removeSeat(seat);
      if (previousRotation && valid(player)) {
        try { player.setRotation(previousRotation); } catch { /* Disconnected. */ }
      }
      console.warn(`[ElleeDog 67 Sit] Could not mount: ${String(error)}`);
      return failure("Could not create the seat. Check that BOTH packs are active and inspect the Content Log.");
    }
  }
  /**
   * Move the SAME carrier while its rider remains mounted. The normal path never
   * calls ejectRiders, addRider, player.teleport, release, or spawnEntity.
   * A destination is reserved before movement and committed only on success.
   */
  transfer(player, block, requireEmpty = true) {
    const failure = (error) => ({ ok: false, error });
    const record = this.get(player.id);
    if (!record) return failure("Sit on a stair first.");
    const { seat, dimension } = record;
    if (!valid(player) || !valid(seat) || player.dimension.id !== dimension.id ||
        ridingEntity(player)?.id !== seat.id || distanceSquared(player.location, record.anchor) > 16 ||
        distanceSquared(seat.location, record.anchor) > 0.09) {
      return failure("Your original seat is no longer active.");
    }
    const reason = eligible(player, seat);
    if (reason) return failure(reason);
    if (requireEmpty && !emptyHands(player)) return failure("Select an empty hotbar slot and empty your offhand first.");
    const current = readStair(getBlock(dimension, record.stair.location));
    if (!current || current.fingerprint !== record.stair.fingerprint || !hasHeadroom(dimension, current)) {
      return failure("Your original stair changed; stand before sitting again.");
    }
    const stair = readStair(block);
    if (!stair) return failure("Choose a dry, upright stair nearby.");
    if (stair.key === record.stair.key) return { ok: true, alreadyThere: true };
    if (!nearbyStair(record.stair, stair)) return failure("Choose a stair within 3 blocks and no more than one block higher or lower.");
    if (!hasHeadroom(dimension, stair)) return failure("That stair needs two clear blocks above it and space in front.");
    if (this.byBlock.has(stair.key)) return failure("Someone is already sitting on that stair.");
    if (!clearTransferPath(dimension, record.stair, stair)) return failure("The space between these chairs is obstructed.");
    // No inter-chair cooldown. Every accepted request commits in this call;
    // main.js coalesces pending duplicate input instead of making the rider wait.

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
      try { player.setRotation({ x: previous.rotation.x, y: stair.front.yaw }); } catch { /* Optional orientation only. */ }
      try { seat.triggerEvent("sit:heartbeat"); } catch { /* Regular heartbeat will retry. */ }
      return { ok: true, transferred: true, vacatedStair: previous.stair };
    } catch (error) {
      this.byBlock.delete(stair.key);
      // Roll back a failed operation, but never retrieve a player who has moved
      // dimensions, gone away, or boarded a different vehicle in the meantime.
      try {
        const mount = ridingEntity(player);
        if (valid(player) && valid(seat) && player.dimension.id === dimension.id &&
            distanceSquared(player.location, anchor) <= 16 && (!mount || mount.id === seat.id)) {
          seat.teleport(previous.anchor, { checkForBlocks: false, keepVelocity: false, rotation: { x: 0, y: previous.stair.front.yaw } });
          // Emergency recovery only; never used during a successful transfer.
          if (!ridingEntity(player)) seat.getComponent("minecraft:rideable")?.addRider(player);
          player.setRotation(previous.rotation);
        }
      } catch { /* Normal tick cleanup handles an irrecoverable helper. */ }
      console.warn(`[ElleeDog 67 Sit] Could not transfer: ${String(error)}`);
      return failure("Could not move the seat. Check /sit:status and the Content Log.");
    }
  }
  release(playerId, reposition = false, message) {
    const record = this.byPlayer.get(playerId);
    if (!record) return false;
    this.byPlayer.delete(playerId);
    this.byBlock.delete(record.stair.key);
    this.cooldowns.set(playerId, this.system.currentTick + CONFIG.cooldownTicks);
    const { player, seat, dimension, stair, entry } = record;
    let destination;
    const currentMount = ridingEntity(player);
    const ownMount = currentMount?.id === seat.id;
    // Never pull someone back from another dimension, a teleport, or a new vehicle.
    const nearby = valid(player) && player.dimension.id === dimension.id &&
      distanceSquared(player.location, record.anchor) < 16;
    if (reposition && nearby && (!currentMount || ownMount)) destination = safeExit(dimension, stair, entry);
    try { if (valid(seat)) seat.getComponent("minecraft:rideable")?.ejectRiders(); } catch { /* Native dismount already occurred. */ }
    removeSeat(seat);
    if (destination && valid(player)) {
      try { player.teleport(destination, { dimension, checkForBlocks: true }); } catch { /* Keep native dismount position. */ }
    }
    if (message && valid(player)) this.message(player, message);
    return true;
  }
  tick() {
    for (const [id, record] of this.byPlayer) {
      try {
        const { player, seat, dimension, stair } = record;
        if (!valid(player) || !valid(seat)) { this.release(id); continue; }
        if (player.dimension.id !== dimension.id || distanceSquared(seat.location, record.anchor) > 0.09 ||
            distanceSquared(player.location, record.anchor) > 16) { this.release(id); continue; }
        const riders = seat.getComponent("minecraft:rideable")?.getRiders() ?? [];
        if (!riders.some((rider) => rider.id === id)) { this.release(id); continue; }
        const actual = readStair(getBlock(dimension, stair.location));
        if (!actual || actual.fingerprint !== stair.fingerprint || !hasHeadroom(dimension, actual)) {
          this.release(id, true, "The stair changed or became obstructed, so you stood up.");
          continue;
        }
        if (player.getGameMode() === "Spectator" || player.isSwimming || player.isFlying || player.isGliding) {
          this.release(id, true); continue;
        }
        if (this.system.currentTick % CONFIG.heartbeatInterval === 0) seat.triggerEvent("sit:heartbeat");
      } catch { this.release(id); }
    }
    for (const [id, until] of this.cooldowns) {
      if (until <= this.system.currentTick) this.cooldowns.delete(id);
    }
  }
  forget(playerId) {
    this.release(playerId);
    this.cooldowns.delete(playerId);
  }
  /** Sweep only this add-on's helper entities in loaded dimensions/chunks. */
  sweep(clearAll = false) {
    let removed = 0;
    const dimensions = new Map();
    for (const id of ["overworld", "nether", "the_end"]) {
      try { const d = this.world.getDimension(id); dimensions.set(d.id, d); } catch { /* Not available. */ }
    }
    for (const player of this.world.getAllPlayers()) dimensions.set(player.dimension.id, player.dimension);
    if (clearAll) {
      for (const id of [...this.byPlayer.keys()]) if (this.release(id, true)) removed++;
    }
    const active = new Set([...this.byPlayer.values()].map((record) => record.seat.id));
    for (const dimension of dimensions.values()) {
      try {
        for (const seat of dimension.getEntities({ type: CONFIG.entityId })) {
          if (!active.has(seat.id)) { removeSeat(seat); removed++; }
        }
      } catch { /* Unavailable dimension. */ }
    }
    return removed;
  }
}
