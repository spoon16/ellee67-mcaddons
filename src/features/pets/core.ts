/** Pure form/state helpers. No global entity transforms or inventory mutations. */
// How Pets works: the vanilla player entity is replaced by one that declares extra entity properties
// (pet:model_id, pet:view and so on). The client's render controllers read those properties and draw the chosen
// pet instead of the player. Changing form is therefore just writing properties; the player's items, health and
// body stay exactly as they were.
//
// Two kinds of property appear throughout the pets modules:
//   entity property    written with setProperty. Declared in the player's JSON, synced to every client, and what
//                      the renderer reads: the live look.
//   dynamic property   written with setDynamicProperty. Free-form storage saved with the player and invisible to
//                      the renderer: the remembered preference, restored on every join.
import type { Dimension, Entity, EquipmentSlot, ItemStack, Player, Vector3 } from "@minecraft/server";
import { BUILD, MAX_WIRE_ID, MODEL_BY_ID, MODEL_BY_WIRE, PETS } from "./catalog.generated.ts";
import { type PropertyValue, requireProperties } from "./property_health.ts";

export { BUILD, MAX_WIRE_ID };
/** The entity property that picks the model: 0 is the ordinary player, otherwise a pet's `wire_id`. */
export const FORM_PROPERTY = "pet:model_id";
/** The saved choice, as a form name such as "carter" or "human". */
export const PREFERENCE = "pet:preferred_form";
export const DEBUG_PROPERTY = "pet:debug";
export const SNAPSHOT = "pet:inventory_snapshot";
// Read-only compatibility keys from 0.1.0-0.1.2. The pack header UUID is unchanged.
export const LEGACY_PREFERENCE = "cav:preferred_form";
export const LEGACY_SNAPSHOT = "cav:inventory_snapshot";
/** Every valid form name: "human" plus each pet id from the catalog. */
export const FORMS: readonly string[] = Object.freeze(["human", ...PETS.map((p) => p.id)]);

/** One catalog entry, as the generated module declares it. */
export type Pet = (typeof PETS)[number];

/** The block surface the scripts read: stair detection for seating and the air check before spawning probes. */
export interface BlockLike {
  readonly typeId: string;
  readonly isAir: boolean;
  readonly permutation: { getState(name: string): unknown };
}

export interface DimensionLike extends Pick<Dimension, "id"> {
  getBlock(location: Vector3): BlockLike | undefined;
}

/**
 * The player surface the pet scripts touch. Engine players satisfy it; property reads are typed `unknown` because
 * every consumer validates what it reads, which is also what the test double returns.
 */
export interface PlayerLike
  extends Pick<
    Player,
    "id" | "typeId" | "isValid" | "location" | "getComponent" | "sendMessage" | "setProperty" | "setDynamicProperty"
  > {
  getProperty(identifier: string): unknown;
  getDynamicProperty(identifier: string): unknown;
  readonly dimension: DimensionLike;
}

/** The item surface the inventory snapshot reads. */
export interface ItemLike extends Pick<ItemStack, "typeId" | "amount" | "nameTag" | "getLore" | "getComponent"> {
  getDynamicPropertyIds?(): string[];
  getDynamicProperty(identifier: string): unknown;
}

export interface ItemSummary {
  type: string;
  amount: number;
  name: string;
  lore: string[];
  damage: number | null;
  enchantments: Array<[string, number]>;
  dynamic: Record<string, unknown>;
}

export interface InventoryCapture {
  items: Array<ItemSummary | null>;
  equipment: Record<string, ItemSummary | null>;
}

export interface SessionGuard {
  /** Starts a new session for the player and returns its generation; every earlier generation is now stale. */
  next(id: string): number;
  /** The player's live generation, so a deferred check can later ask `current(id, generation)`. */
  peek(id: string): number | undefined;
  current(id: string, generation: number): boolean;
  remove(id: string): void;
  /** Forgets every player, for a world reload. */
  clear(): void;
}

/** The renderer wants a number, not a name: the catalog's `wire_id` for a pet, 0 for the ordinary player. */
export function wireId(form: string): number {
  const pet = MODEL_BY_ID[validateForm(form)];
  return pet ? pet.wire_id : 0;
}
export function formFromWire(id: unknown): string {
  return MODEL_BY_WIRE[String(id)]?.id ?? "human";
}
/** The name shown to players: "Player" for the human form, otherwise the pet's display name. */
export function formLabel(form: string): string {
  return form === "human" || form === "player" ? "Player" : (MODEL_BY_ID[form]?.display_name ?? "Player");
}

export function validateForm(value: unknown): string {
  if (typeof value !== "string" || !FORMS.includes(value)) throw new Error(`Expected one of: ${FORMS.join(", ")}.`);
  return value;
}
/** Versions 0.1.x saved the choice under a `cav:` key and called Carter "cavalier"; still read, never written. */
function legacyPreferredForm(player: PlayerLike): string | undefined {
  const value = player.getDynamicProperty(LEGACY_PREFERENCE);
  if (value === "cavalier") return "carter";
  return value === "human" ? "human" : undefined;
}
/** Read-only: diagnostics must never migrate data just by inspecting it. */
export function preferredForm(player: PlayerLike): string {
  const value = player.getDynamicProperty(PREFERENCE);
  // Any explicitly present new value takes precedence, even if invalid.
  // This prevents an old Cavalier preference from resurrecting after a reset.
  if (value !== undefined) {
    return value === "player" ? "human" : typeof value === "string" && FORMS.includes(value) ? value : "human";
  }
  return legacyPreferredForm(player) ?? "human";
}
export function needsPreferenceMigration(player: PlayerLike): boolean {
  return player.getDynamicProperty(PREFERENCE) === undefined && legacyPreferredForm(player) !== undefined;
}
/** A live player: the right type and still in the world (a player who left mid-callback reads `isValid` false). */
export function isPlayer(entity: Pick<Entity, "typeId" | "isValid"> | undefined): entity is Player {
  try {
    return entity?.typeId === "minecraft:player" && entity.isValid !== false;
  } catch {
    return false;
  }
}
export function safeMessage(player: PlayerLike, text: string): void {
  try {
    player.sendMessage(`[ElleeDog 67 Pets ${BUILD}] ${text}`);
  } catch {
    /* Player may have left. */
  }
}

/** The caller runs in writable execution, not a before-event command callback. */
export function applyForm(player: PlayerLike, form: string, persist = true): string {
  validateForm(form);
  if (!isPlayer(player)) throw new Error("The player is no longer connected.");
  const previous = requireProperties(player, [FORM_PROPERTY])[FORM_PROPERTY];
  // setProperty is deferred by Minecraft. Do not assume getProperty changes in this tick.
  player.setProperty(FORM_PROPERTY, wireId(form));
  if (persist) {
    try {
      player.setDynamicProperty(PREFERENCE, form);
    } catch (error) {
      // Saving failed: put the live look back, so what is shown and what is remembered never disagree.
      try {
        if (previous !== undefined) player.setProperty(FORM_PROPERTY, previous);
      } catch {
        /* Original error wins. */
      }
      throw error;
    }
  }
  return form;
}

/** Everything about one item that a form change could conceivably disturb, as plain data for comparison. */
export function itemSummary(item: ItemLike | undefined): ItemSummary | null {
  if (!item) return null;
  const durability = item.getComponent("minecraft:durability");
  const enchantable = item.getComponent("minecraft:enchantable");
  // Sorted so two captures of the same item compare equal whatever order the engine listed things in.
  const enchantments = (enchantable?.getEnchantments() ?? [])
    .map((e): [string, number] => [e.type.id, e.level])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const dynamic: Record<string, unknown> = {};
  for (const key of (item.getDynamicPropertyIds?.() ?? []).slice().sort()) {
    dynamic[key] = item.getDynamicProperty(key);
  }
  return {
    type: item.typeId,
    amount: item.amount,
    name: item.nameTag ?? "",
    lore: item.getLore(),
    damage: durability?.damage ?? null,
    enchantments,
    dynamic,
  };
}

/**
 * A read-only diagnostic comparison, not a full serialization of all native item data.
 * `/pet:snapshot` captures this before a form change and `/pet:compare` proves nothing in it moved.
 */
export function captureInventory(
  player: PlayerLike,
  equipmentSlots: Readonly<Record<string, string>>,
): InventoryCapture {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) throw new Error("Player inventory is not available.");
  const items: Array<ItemSummary | null> = [];
  for (let index = 0; index < inventory.size; index++) items.push(itemSummary(inventory.getItem(index)));
  const equipment: Record<string, ItemSummary | null> = {};
  const equippable = player.getComponent("minecraft:equippable");
  // Slot names are EquipmentSlot values; the diagnostic takes plain strings so callers can pass literal names.
  for (const [label, slot] of Object.entries(equipmentSlots)) {
    equipment[label] = itemSummary(equippable?.getEquipment(slot as EquipmentSlot));
  }
  return { items, equipment };
}
/** The names of every slot that differs between two captures; empty means nothing changed. */
export function compareInventory(before: InventoryCapture, after: InventoryCapture): string[] {
  const changed: string[] = [];
  // Comparing JSON text is a cheap deep-equality check for plain data like this.
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const count = Math.max(before.items.length, after.items.length);
  for (let i = 0; i < count; i++) if (!same(before.items[i], after.items[i])) changed.push(`inventory:${i}`);
  for (const key of new Set([...Object.keys(before.equipment), ...Object.keys(after.equipment)])) {
    if (!same(before.equipment[key], after.equipment[key])) changed.push(`equipment:${key}`);
  }
  return changed;
}

/**
 * Keeps deferred callbacks for a disconnected player from touching a new session.
 * The problem: a check scheduled two ticks after a form change must not act on a player who left and rejoined,
 * or who chose another form meanwhile. Each new session gets a bigger number; a deferred check remembers the
 * number it saw and does nothing if the player's number has moved on.
 */
export function createSessionGuard(): SessionGuard {
  const generation = new Map<string, number>();
  let sequence = 0; // Never reuse an ID after disconnect/reconnect (ABA protection).
  return {
    next(id) {
      const n = ++sequence;
      generation.set(id, n);
      return n;
    },
    peek(id) {
      return generation.get(id);
    },
    current(id, n) {
      return generation.get(id) === n;
    },
    remove(id) {
      generation.delete(id);
    },
    clear() {
      generation.clear();
    },
  };
}

/** Writes an entity property only when it differs, so unchanged frames queue no engine work. */
export function setIfChanged(player: PlayerLike, key: string, value: PropertyValue): void {
  if (player.getProperty(key) !== value) player.setProperty(key, value);
}

/** Reads a dynamic property holding a JSON object; anything missing, malformed or not an object reads as `{}`. */
export function readJsonObject<T extends object = Record<string, unknown>>(player: PlayerLike, key: string): T {
  try {
    const parsed = JSON.parse(String(player.getDynamicProperty(key) ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

export type { PropertyValue };
