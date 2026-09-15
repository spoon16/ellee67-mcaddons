/** Read-only mount measurement; only visual entity properties are written.
 * Never teleports/ejects riders, edits blocks, replaces gear, or changes cameras.
 * Native mount skins and third-party seat implementations still require client tests.
 *
 * The problem: a dog-shaped player riding a boat, a pig or a stair seat is drawn at human hip height and floats
 * above the seat. `pet:seat_lift` tells the renderer how many model pixels to move the pet down (or up) so it
 * sits on the surface, and `pet:seat_kind` which kind of seat it is. This module measures where that surface is.
 */
import { type Entity, type Seat, system, type Vector3 } from "@minecraft/server";
import { MODEL_BY_WIRE } from "./catalog.generated.ts";
import { FORM_PROPERTY, isPlayer, type PlayerLike, readJsonObject, safeMessage, setIfChanged } from "./core.ts";

export type SeatKind = "boat" | "pig" | "stairs" | "other";

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
  liftPixels: number;
  trimPixels: unknown;
}
/** `/pet:seatinfo`: the cached report while mounted, otherwise the bare lift the entity currently carries. */
export interface SeatInfo extends Partial<Omit<SeatReport, "kind" | "mount" | "liftPixels">> {
  kind: "none" | SeatKind;
  mount: string | null;
  liftPixels: unknown;
  note?: string;
}
interface StairCandidate {
  y: number;
  block: string;
  position: Vector3;
  score: number;
}

/** The pet models are drawn at 0.9375 scale, so one block is 16 / 0.9375 model pixels rather than 16. */
const SCALE = 0.9375;
const PIXELS = 16 / SCALE;
/** Per-seat-kind adjustments the player made with `/pet:seatheight`, as JSON on the player. */
const TRIM_KEY = "pet:seat_height_trims";
/** Player id -> the last measurement, so a still mount is not re-measured every pass. */
const cache = new Map<string, SeatReport>();
/** The renderer gets the kind as a number; the property is an int. */
const KINDS: Readonly<Record<"none" | SeatKind, number>> = { none: 0, boat: 1, pig: 2, stairs: 3, other: 4 };
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const round = (x: number): number => Math.round(x * 10000) / 10000;
const trims = (player: PlayerLike): Record<string, unknown> => readJsonObject(player, TRIM_KEY);
/** The entity the player is riding, or undefined. */
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
/** Finds the stair block under a custom seat entity (Stair Sitting's, say), since the entity itself has no height. */
function stairSurface(player: PlayerLike, mount: Entity): StairCandidate | undefined {
  // Local column search only for non-native seats. Checking a nearby stair does
  // not make a standing pet sit: a live riding component is always required.
  const candidates: StairCandidate[] = [];
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
          if (!b?.typeId.endsWith("_stairs")) continue;
          let upside = false;
          try {
            upside = !!b.permutation.getState("upside_down_bit");
          } catch {
            /* Unreadable state reads as a normal stair. */
          }
          // The low step of an upright stair is half a block up; an upside-down stair's is a full block.
          const y = pos.y + (upside ? 1 : 0.5);
          const distance = Math.hypot(mount.location.x - (pos.x + 0.5), mount.location.z - (pos.z + 0.5));
          if (distance > 0.85) continue;
          candidates.push({
            y,
            block: b.typeId,
            position: pos,
            score: distance + Math.abs(y - mount.location.y) * 0.2,
          });
        }
      }
    }
  }
  // The best candidate is the closest one, with a small penalty for being far above or below the mount.
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
}
/** Where the surface of this mount is, by a profile per mount kind; measured by hand for boats and pigs. */
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
  if (!id.startsWith("minecraft:")) {
    const stair = stairSurface(player, mount);
    if (stair) {
      return {
        ...result,
        kind: "stairs",
        surfaceY: stair.y,
        source: "measured stair tread",
        block: stair.block,
        blockPosition: stair.position,
      };
    }
  }
  // Anything else: trust the mount's own seat position, or its origin when it declares none.
  const seat = ss.find((s) => Number.isFinite(s.position?.y));
  return {
    ...result,
    kind: "other",
    surfaceY: p.y + (seat?.position.y ?? 0),
    source: seat ? "rideable seat anchor (unprofiled mount)" : "mount origin fallback",
  };
}
/** Surface height minus the player's height, in model pixels, plus the player's trim; clamped and rounded to 1/64. */
export function calculateLift(surfaceY: number, playerY: number, trim = 0): number {
  if (![surfaceY, playerY, trim].every(Number.isFinite)) throw new Error("Seat measurement is not finite.");
  return Math.round(clamp((surfaceY - playerY) * PIXELS + trim, -64, 64) * 64) / 64;
}
function finiteTrim(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
/** Read-only initial alignment for a requested pet form, before its model property
 * has become readable. Transient unloaded mounts fall back to zero; polling retries.
 */
export function initialSeatProperties(player: PlayerLike): { "pet:seat_lift": number; "pet:seat_kind": number } {
  const empty = { "pet:seat_lift": 0, "pet:seat_kind": 0 };
  try {
    const mount = ride(player);
    if (!mount) return empty;
    const r = supportFor(player, mount);
    if (!r) return empty;
    const t = trims(player)[r.kind] ?? 0;
    return {
      "pet:seat_lift": calculateLift(r.surfaceY, player.location.y, finiteTrim(t)),
      "pet:seat_kind": KINDS[r.kind],
    };
  } catch {
    return empty;
  }
}
/** Called every other tick from main.ts: measures the seat under a mounted pet and updates the two properties. */
export function refreshSeat(player: PlayerLike): boolean {
  if (!isPlayer(player)) return false;
  // Only a pet form needs a lift; a human-shaped player sits correctly on their own.
  const mount = MODEL_BY_WIRE[String(player.getProperty(FORM_PROPERTY))] ? ride(player) : undefined;
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
    // A boat or pig that moved carries its surface with it; a stair does not move.
    measurement = { ...measurement, surfaceY: measurement.surfaceY + (mount.location.y - measurement.mountY) };
  }
  const trim = trims(player)[measurement.kind] ?? 0;
  const lift = calculateLift(measurement.surfaceY, player.location.y, finiteTrim(trim));
  const report: SeatReport = {
    ...measurement,
    mountY: mount.location.y,
    playerY: player.location.y,
    liftPixels: lift,
    trimPixels: trim,
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
/** `/pet:seatheight`: saves a per-kind nudge (boats, pigs and stairs each remember their own). */
export function setSeatTrim(player: PlayerLike, pixels: number): void {
  if (!Number.isInteger(pixels) || pixels < -16 || pixels > 32) {
    throw new Error("Seat adjustment must be an integer from -16 to 32.");
  }
  refreshSeat(player);
  const r = cache.get(player.id);
  if (!r) throw new Error("Ride a boat, pig, or stair seat in pet form first.");
  const t = trims(player);
  t[r.kind] = pixels;
  player.setDynamicProperty(TRIM_KEY, JSON.stringify(t));
  refreshSeat(player);
  safeMessage(player, `${r.kind} seat adjustment: ${pixels} pixels.`);
}
export function resetSeatTrim(player: PlayerLike): void {
  refreshSeat(player);
  const r = cache.get(player.id);
  if (!r) throw new Error("Ride a seat in pet form first.");
  const t = trims(player);
  delete t[r.kind];
  player.setDynamicProperty(TRIM_KEY, JSON.stringify(t));
  refreshSeat(player);
  safeMessage(player, `${r.kind} seat adjustment reset.`);
}
export function clearSeatCache(id: string): void {
  cache.delete(id);
}
