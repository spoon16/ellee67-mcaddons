/** Read-only mount measurement; only visual entity properties are written.
 * Never teleports/ejects riders, edits blocks, replaces gear, or changes cameras.
 * Native mount skins and third-party seat implementations still require client tests.
 */
import { type Entity, type Seat, system, type Vector3 } from "@minecraft/server";
import { MODEL_BY_ID, MODEL_BY_WIRE, SEAT_KINDS, SEAT_TRIM_BAKE } from "./catalog.generated.ts";
import {
  FORM_PROPERTY,
  formLabel,
  isPlayer,
  type Pet,
  type PlayerLike,
  preferredForm,
  readJsonObject,
  safeMessage,
  setIfChanged,
} from "./core.ts";

/**
 * What a mounted pet is sitting on. Each kind carries its own saved trim and its own wire value in
 * `pet:seat_kind` (the index in the compiler's `SEAT_KINDS`, 0 being "none"), so the client can pose per kind.
 * Boats, pigs, stairs and unprofiled mounts are the original four; horses (with donkeys, mules and the undead
 * horses), striders, happy ghasts and cushions (a seat entity inside or on a block named cushion) were split out
 * of "other" so each can be trimmed on its own.
 */
export type SeatKind = "boat" | "pig" | "stairs" | "other" | "horse" | "strider" | "happy_ghast" | "cushion";

/** The measured support under a mounted pet: which profile applied and where its surface sits. */
export interface SeatSupport {
  mount: string;
  mountY: number;
  playerY: number;
  seats: Vector3[];
  kind: SeatKind;
  surfaceY: number;
  source: string;
  block?: string;
  blockPosition?: Vector3;
}
interface SeatMeasurement extends SeatSupport {
  mountId: string;
  positionKey: string;
  tick: number;
}
export interface SeatReport extends SeatMeasurement {
  /** What `pet:seat_lift` carries: the measured surface offset plus the baked and the live trim. */
  liftPixels: number;
  /** The player's own `/pet:seatheight` trim for this kind, in model pixels. */
  trimPixels: number;
  /** The catalog's trim for this pet and kind, in model pixels, applied before the live trim. */
  bakedPixels: number;
}
/** `/pet:seatinfo`: the cached report while mounted, otherwise the bare lift the entity currently carries. */
export interface SeatInfo extends Partial<Omit<SeatReport, "kind" | "mount" | "liftPixels">> {
  kind: "none" | SeatKind;
  mount: string | null;
  liftPixels: unknown;
  note?: string;
}
/** A block near the seat that names what the player sits on: a stair (with its tread height) or a cushion. */
interface BlockCandidate {
  kind: "stairs" | "cushion";
  y: number;
  block: string;
  position: Vector3;
  score: number;
}

const SCALE = 0.9375;
const PIXELS = 16 / SCALE;
const TRIM_KEY = "pet:seat_height_trims";
/** Key inside the saved trims naming the catalog bake they were measured against. */
const BAKE_STAMP = "bake";
const cache = new Map<string, SeatReport>();
/** Wire value per kind, from the generated list so the scripts, the property range and the client agree. */
const KINDS: Readonly<Record<"none" | SeatKind, number>> = Object.fromEntries(
  SEAT_KINDS.map((kind, index) => [kind, index]),
) as Record<"none" | SeatKind, number>;
/** The saddle family: the rider sits on the back, at the mount's rideable seat anchor. */
const HORSES: ReadonlySet<string> = new Set([
  "minecraft:horse",
  "minecraft:donkey",
  "minecraft:mule",
  "minecraft:skeleton_horse",
  "minecraft:zombie_horse",
]);
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const round = (x: number): number => Math.round(x * 10000) / 10000;
function finiteTrim(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
/** The catalog's trim for this pet on this kind of mount, in model pixels; zero for the player and unknown kinds. */
export function bakedTrim(pet: Pet | undefined, kind: SeatKind): number {
  return pet ? finiteTrim(pet.seating.kinds[kind]?.trim) : 0;
}
/**
 * The saved live trims, brought up to the current catalog bake. A live trim for a profiled kind was measured on top
 * of the bake in force at the time, so a new bake drops those once, keeps "other" (never baked) and stamps the
 * object; the caller persists the result when it changed. Reading alone never writes.
 */
function liveTrims(player: PlayerLike): { trims: Record<string, unknown>; changed: boolean } {
  const stored = readJsonObject(player, TRIM_KEY);
  if (stored[BAKE_STAMP] === SEAT_TRIM_BAKE) return { trims: stored, changed: false };
  const kept: Record<string, unknown> = { [BAKE_STAMP]: SEAT_TRIM_BAKE };
  for (const [kind, value] of Object.entries(stored)) {
    if (kind !== BAKE_STAMP && (kind === "other" || !(SEAT_KINDS as readonly string[]).includes(kind)))
      kept[kind] = value;
  }
  return { trims: kept, changed: true };
}
function saveTrims(player: PlayerLike, trims: Record<string, unknown>): void {
  player.setDynamicProperty(TRIM_KEY, JSON.stringify(trims));
}
/** The live trim for one kind, persisting the bake migration when this read caused one. */
function liveTrim(player: PlayerLike, kind: SeatKind): number {
  const { trims, changed } = liveTrims(player);
  if (changed) saveTrims(player, trims);
  return finiteTrim(trims[kind]);
}
function ride(player: PlayerLike): Entity | undefined {
  try {
    return player.getComponent("minecraft:riding")?.entityRidingOn;
  } catch {
    return undefined;
  }
}
function seats(mount: Entity): Seat[] {
  try {
    return mount.getComponent("minecraft:rideable")?.getSeats() ?? [];
  } catch {
    return [];
  }
}
function seatBlock(player: PlayerLike, mount: Entity): BlockCandidate | undefined {
  // Local column search only for non-native seats. Checking a nearby stair does
  // not make a standing pet sit: a live riding component is always required.
  const candidates: BlockCandidate[] = [];
  const centers = [mount.location, player.location];
  const visited = new Set<string>();
  for (const p of centers) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          const pos = { x: Math.floor(p.x) + dx, y: Math.floor(p.y) + dy, z: Math.floor(p.z) + dz };
          const key = `${pos.x},${pos.y},${pos.z}`;
          if (visited.has(key)) continue;
          visited.add(key);
          let b: ReturnType<PlayerLike["dimension"]["getBlock"]>;
          try {
            b = player.dimension.getBlock(pos);
          } catch {
            continue;
          }
          if (!b) continue;
          const distance = Math.hypot(mount.location.x - (pos.x + 0.5), mount.location.z - (pos.z + 0.5));
          if (distance > 0.85) continue;
          if (b.typeId.toLowerCase().includes("cushion")) {
            // The block only names the kind; the seat entity's anchor is the surface, as for any custom seat.
            candidates.push({ kind: "cushion", y: pos.y, block: b.typeId, position: pos, score: distance });
            continue;
          }
          if (!b.typeId.endsWith("_stairs")) continue;
          let upside = false;
          try {
            upside = !!b.permutation.getState("upside_down_bit");
          } catch {
            /* Unreadable state reads as a normal stair. */
          }
          const y = pos.y + (upside ? 1 : 0.5);
          candidates.push({
            kind: "stairs",
            y,
            block: b.typeId,
            position: pos,
            score: distance + Math.abs(y - mount.location.y) * 0.2,
          });
        }
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
}
export function supportFor(player: PlayerLike, mount: Entity | undefined): SeatSupport | null {
  if (!mount || mount.isValid === false) return null;
  const id = mount.typeId;
  const p = mount.location;
  const ss = seats(mount);
  const result = {
    mount: id,
    mountY: p.y,
    playerY: player.location.y,
    seats: ss.map((s) => ({ x: s.position.x, y: s.position.y, z: s.position.z })),
  };
  if (
    id === "minecraft:boat" ||
    id === "minecraft:chest_boat" ||
    (id.startsWith("minecraft:") && /_boat$|_raft$/.test(id))
  ) {
    // Visual interior floor, not the human hip/rider anchor. Rafts are higher.
    const raft = id.endsWith("_raft");
    return {
      ...result,
      kind: "boat",
      surfaceY: p.y + (raft ? 0.25 : 0.1875),
      source: raft ? "raft deck profile" : "boat interior floor profile",
    };
  }
  if (id === "minecraft:pig")
    return { ...result, kind: "pig", surfaceY: p.y + 1.0, source: "adult pig saddle/back profile" };
  const seat = ss.find((s) => Number.isFinite(s.position?.y));
  // The named mounts sit the pet at the mount's own rider anchor, exactly where "other" put them before they
  // had a kind of their own, so a trim measured against the old placement keeps its meaning.
  const anchored = (kind: SeatKind, label: string, extra: Partial<SeatSupport> = {}): SeatSupport => ({
    ...result,
    kind,
    surfaceY: p.y + (seat?.position.y ?? 0),
    source: seat ? `rideable seat anchor (${label})` : `mount origin fallback (${label})`,
    ...extra,
  });
  if (HORSES.has(id)) return anchored("horse", "horse profile");
  if (id === "minecraft:strider") return anchored("strider", "strider profile");
  if (id === "minecraft:happy_ghast") return anchored("happy_ghast", "happy ghast profile");
  if (!id.startsWith("minecraft:")) {
    const block = seatBlock(player, mount);
    if (block?.kind === "stairs") {
      return {
        ...result,
        kind: "stairs",
        surfaceY: block.y,
        source: "measured stair tread",
        block: block.block,
        blockPosition: block.position,
      };
    }
    if (block) return anchored("cushion", "cushion seat", { block: block.block, blockPosition: block.position });
  }
  return anchored("other", "unprofiled mount");
}
export function calculateLift(surfaceY: number, playerY: number, trim = 0): number {
  if (![surfaceY, playerY, trim].every(Number.isFinite)) throw new Error("Seat measurement is not finite.");
  return Math.round(clamp((surfaceY - playerY) * PIXELS + trim, -64, 64) * 64) / 64;
}
/** Read-only initial alignment for a requested pet form, before its model property
 * has become readable. Transient unloaded mounts fall back to zero; polling retries.
 */
export function initialSeatProperties(
  player: PlayerLike,
  pet: Pet | undefined,
): { "pet:seat_lift": number; "pet:seat_kind": number } {
  const empty = { "pet:seat_lift": 0, "pet:seat_kind": 0 };
  try {
    const mount = ride(player);
    if (!mount) return empty;
    const r = supportFor(player, mount);
    if (!r) return empty;
    const live = finiteTrim(liveTrims(player).trims[r.kind]);
    return {
      "pet:seat_lift": calculateLift(r.surfaceY, player.location.y, bakedTrim(pet, r.kind) + live),
      "pet:seat_kind": KINDS[r.kind],
    };
  } catch {
    return empty;
  }
}
export function refreshSeat(player: PlayerLike): boolean {
  if (!isPlayer(player)) return false;
  const pet = MODEL_BY_WIRE[String(player.getProperty(FORM_PROPERTY))];
  const mount = pet ? ride(player) : undefined;
  if (!mount) {
    if (player.getProperty("pet:seat_lift") !== undefined) setIfChanged(player, "pet:seat_lift", 0);
    if (player.getProperty("pet:seat_kind") !== undefined) setIfChanged(player, "pet:seat_kind", 0);
    cache.delete(player.id);
    return false;
  }
  let measurement: SeatMeasurement | undefined = cache.get(player.id);
  // Recheck the tread at 2 Hz and immediately on seat changes. Moving mounts use
  // live relative height every update; stair switches do not wait for this cache.
  const positionKey = `${round(mount.location.x)},${round(mount.location.y)},${round(mount.location.z)}`;
  if (
    !measurement ||
    measurement.mountId !== mount.id ||
    measurement.positionKey !== positionKey ||
    system.currentTick - measurement.tick >= 10
  ) {
    const support = supportFor(player, mount);
    // A mount that despawned this tick has no surface to measure; the lift calculation reports the same way.
    if (!support) throw new Error("Seat measurement is not finite.");
    measurement = { ...support, mountId: mount.id, positionKey, tick: system.currentTick };
  } else if (measurement.kind !== "stairs") {
    measurement = { ...measurement, surfaceY: measurement.surfaceY + (mount.location.y - measurement.mountY) };
  }
  const trim = liveTrim(player, measurement.kind);
  const baked = bakedTrim(pet, measurement.kind);
  const lift = calculateLift(measurement.surfaceY, player.location.y, baked + trim);
  const report: SeatReport = {
    ...measurement,
    mountY: mount.location.y,
    playerY: player.location.y,
    liftPixels: lift,
    trimPixels: trim,
    bakedPixels: baked,
  };
  cache.set(player.id, report);
  setIfChanged(player, "pet:seat_lift", lift);
  setIfChanged(player, "pet:seat_kind", KINDS[report.kind]);
  return true;
}
export function seatInfo(player: PlayerLike): SeatInfo {
  const r = cache.get(player.id);
  return r
    ? { ...r, note: "Measured support/profile calculation; actual client pixels require checking." }
    : { kind: "none", mount: ride(player)?.typeId ?? null, liftPixels: player.getProperty("pet:seat_lift") ?? 0 };
}
export function setSeatTrim(player: PlayerLike, pixels: number): void {
  if (!Number.isInteger(pixels) || pixels < -16 || pixels > 32) {
    throw new Error("Seat adjustment must be an integer from -16 to 32.");
  }
  refreshSeat(player);
  const r = cache.get(player.id);
  if (!r) throw new Error("Ride a boat, pig, or stair seat in pet form first.");
  const { trims } = liveTrims(player);
  trims[r.kind] = pixels;
  saveTrims(player, trims);
  refreshSeat(player);
  const baked = bakedTrim(MODEL_BY_ID[preferredForm(player)], r.kind);
  safeMessage(
    player,
    `${r.kind} seat adjustment: ${pixels} pixels, on top of ${formLabel(preferredForm(player))}'s baked ${baked}.`,
  );
}
export function resetSeatTrim(player: PlayerLike): void {
  refreshSeat(player);
  const r = cache.get(player.id);
  if (!r) throw new Error("Ride a seat in pet form first.");
  const { trims } = liveTrims(player);
  delete trims[r.kind];
  saveTrims(player, trims);
  refreshSeat(player);
  const baked = bakedTrim(MODEL_BY_ID[preferredForm(player)], r.kind);
  safeMessage(player, `${r.kind} seat adjustment reset; ${formLabel(preferredForm(player))}'s baked ${baked} stays.`);
}
export function clearSeatCache(id: string): void {
  cache.delete(id);
}
