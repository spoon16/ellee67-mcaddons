// Test double for @minecraft/server. It models the scheduler, event signals, command registry, players,
// inventories and dimensions that the add-on's scripts touch. It is not the Minecraft engine: nothing here
// proves rendering, networking or real command parsing. Feature tests may mutate the exported objects
// (players, dimensions, registry) but should not edit this file casually; it is shared by every suite.

export class Signal<T = any> {
  callbacks: Array<(event: T) => void> = [];
  /**
   * Whether the engine's `subscribe` for this signal takes an options object. The engine counts arguments at the
   * native boundary, so a second argument (even `undefined`) to a one-argument signal is a TypeError there.
   */
  readonly acceptsOptions: boolean;
  constructor(acceptsOptions = false) {
    this.acceptsOptions = acceptsOptions;
  }
  subscribe(callback: (event: T) => void, ...extra: unknown[]): (event: T) => void {
    if (extra.length > 0 && !this.acceptsOptions) {
      throw new TypeError(`Incorrect number of arguments to function. Expected 1, received ${1 + extra.length}`);
    }
    this.callbacks.push(callback);
    return callback;
  }
  unsubscribe(callback: (event: T) => void): void {
    this.callbacks = this.callbacks.filter((entry) => entry !== callback);
  }
  emit(event: T): void {
    for (const callback of [...this.callbacks]) callback(event);
  }
  get size(): number {
    return this.callbacks.length;
  }
}

export enum CommandPermissionLevel {
  Any = 0,
  GameDirectors = 1,
  Admin = 2,
  Host = 3,
  Owner = 4,
}
export enum CustomCommandParamType {
  BlockType = "BlockType",
  Boolean = "Boolean",
  EntitySelector = "EntitySelector",
  EntityType = "EntityType",
  Enum = "Enum",
  Float = "Float",
  Integer = "Integer",
  ItemType = "ItemType",
  Location = "Location",
  PlayerSelector = "PlayerSelector",
  String = "String",
}
export enum CustomCommandStatus {
  Success = 0,
  Failure = 1,
}
export enum CustomCommandSource {
  Block = "Block",
  Entity = "Entity",
  NPCDialogue = "NPCDialogue",
  Server = "Server",
}
export enum EquipmentSlot {
  Head = "Head",
  Chest = "Chest",
  Legs = "Legs",
  Feet = "Feet",
  Offhand = "Offhand",
  Mainhand = "Mainhand",
  Body = "Body",
}
export enum GameMode {
  Survival = "Survival",
  Creative = "Creative",
  Adventure = "Adventure",
  Spectator = "Spectator",
}
export enum Difficulty {
  Peaceful = "Peaceful",
  Easy = "Easy",
  Normal = "Normal",
  Hard = "Hard",
}
export enum EntityDamageCause {
  entityAttack = "entityAttack",
  entityExplosion = "entityExplosion",
  blockExplosion = "blockExplosion",
  fall = "fall",
  fire = "fire",
  none = "none",
}
export enum ScriptEventSource {
  Block = "Block",
  Entity = "Entity",
  NPCDialogue = "NPCDialogue",
  Server = "Server",
}

// ---------------------------------------------------------------------------------------------------------------
// Scheduler

interface Job {
  id: number;
  fn: () => void;
  due: number;
  interval?: number;
}

let currentTick = 0;
let nextJobId = 1;
let jobs: Job[] = [];
export const requestedDelays: number[] = [];

function schedule(fn: () => void, due: number, interval?: number): number {
  const id = nextJobId++;
  jobs.push({ id, fn, due, interval });
  return id;
}

export const system = {
  get currentTick(): number {
    return currentTick;
  },
  beforeEvents: { startup: new Signal<StartupEvent>() },
  afterEvents: { scriptEventReceive: new Signal<ScriptEventCommandMessageAfterEvent>(true) },
  run(fn: () => void): number {
    return schedule(fn, currentTick + 1);
  },
  runTimeout(fn: () => void, delay = 0): number {
    requestedDelays.push(delay);
    return schedule(fn, currentTick + Math.max(0, delay));
  },
  runInterval(fn: () => void, interval = 1): number {
    const every = Math.max(1, interval);
    return schedule(fn, currentTick + every, every);
  },
  clearRun(id: number): void {
    jobs = jobs.filter((job) => job.id !== id);
  },
  sendScriptEvent(id: string, message: string): void {
    system.afterEvents.scriptEventReceive.emit({ id, message, sourceType: ScriptEventSource.Server });
  },
  /** Count of live intervals; feature tests assert that `stop()` cleared theirs. */
  get intervalCount(): number {
    return jobs.filter((job) => job.interval !== undefined).length;
  },
  get pendingJobCount(): number {
    return jobs.length;
  },
};

/** Runs every one-shot job that is due on the current tick, including jobs those jobs schedule with delay 0. */
export function flushCurrentTick(): void {
  let count = 0;
  for (;;) {
    const index = jobs.findIndex((job) => job.interval === undefined && job.due <= currentTick);
    if (index === -1) return;
    if (++count > 1000) throw new Error("Unbounded callbacks in a single simulated tick");
    const [job] = jobs.splice(index, 1);
    job?.fn();
  }
}

/** Advances the clock: intervals fire first, then due one-shot jobs. */
export function step(n = 1): void {
  for (let i = 0; i < n; i++) {
    currentTick++;
    for (const job of [...jobs]) {
      if (job.interval === undefined || job.due > currentTick) continue;
      if (!jobs.includes(job)) continue;
      job.due += job.interval;
      job.fn();
    }
    flushCurrentTick();
  }
}

/** Like `step` but also drains promise callbacks so async form flows progress. */
export async function ticks(n = 1): Promise<void> {
  for (let i = 0; i < n; i++) {
    step(1);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Type registries: which entity and item definitions the active packs provide. Feature tests register what their
// packs declare so the pack probes (EntityTypes.get / ItemTypes.get) see them; reset() clears everything.

const entityTypes = new Set<string>();
const itemTypes = new Set<string>();

export function registerEntityType(id: string): void {
  entityTypes.add(id);
}

export function registerItemType(id: string): void {
  itemTypes.add(id);
}

export class EntityType {
  constructor(readonly id: string) {}
}

export class ItemType {
  constructor(readonly id: string) {}
}

export const EntityTypes = {
  get(identifier: string): EntityType | undefined {
    return entityTypes.has(identifier) ? new EntityType(identifier) : undefined;
  },
  getAll(): EntityType[] {
    return [...entityTypes].map((id) => new EntityType(id));
  },
};

export const ItemTypes = {
  get(itemId: string): ItemType | undefined {
    return itemTypes.has(itemId) ? new ItemType(itemId) : undefined;
  },
  getAll(): ItemType[] {
    return [...itemTypes].map((id) => new ItemType(id));
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Items, containers, entities, players, dimensions

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export class ItemStack {
  typeId: string;
  amount: number;
  nameTag?: string;
  lore: string[] = [];
  keepOnDeath = false;
  dynamic: Record<string, unknown> = {};
  components: Record<string, unknown> = {};
  constructor(typeId: string, amount = 1) {
    this.typeId = typeId;
    this.amount = amount;
  }
  setLore(lines?: string[]): void {
    this.lore = [...(lines ?? [])];
  }
  getLore(): string[] {
    return [...this.lore];
  }
  getComponent(id: string): any {
    return this.components[id];
  }
  hasComponent(id: string): boolean {
    return id in this.components;
  }
  getDynamicPropertyIds(): string[] {
    return Object.keys(this.dynamic);
  }
  getDynamicProperty(key: string): unknown {
    return this.dynamic[key];
  }
  setDynamicProperty(key: string, value: unknown): void {
    if (value === undefined) delete this.dynamic[key];
    else this.dynamic[key] = value;
  }
  clone(): ItemStack {
    const copy = new ItemStack(this.typeId, this.amount);
    copy.nameTag = this.nameTag;
    copy.lore = [...this.lore];
    copy.dynamic = { ...this.dynamic };
    copy.components = this.components;
    return copy;
  }
  isStackableWith(other: ItemStack): boolean {
    return other.typeId === this.typeId;
  }
}

export class Container {
  items: Array<ItemStack | undefined>;
  writes: Array<[number, ItemStack | undefined]> = [];
  rejectAdd = false;
  constructor(size = 36) {
    this.items = Array(size).fill(undefined);
  }
  get size(): number {
    return this.items.length;
  }
  get emptySlotsCount(): number {
    return this.items.filter((item) => !item).length;
  }
  getItem(slot: number): ItemStack | undefined {
    return this.items[slot];
  }
  setItem(slot: number, item?: ItemStack): void {
    this.items[slot] = item;
    this.writes.push([slot, item]);
  }
  addItem(item: ItemStack): ItemStack | undefined {
    if (this.rejectAdd) return item;
    const slot = this.items.findIndex((entry) => !entry);
    if (slot < 0) return item;
    this.items[slot] = item;
    this.writes.push([slot, item]);
    return undefined;
  }
  find(typeId: string): number {
    return this.items.findIndex((item) => item?.typeId === typeId);
  }
}

let nextEntityId = 1;

const rideableTypes = new Set<string>();

/** Declares that entities of this type carry a `minecraft:rideable` component, as their behavior JSON would. */
export function registerRideableType(typeId: string): void {
  rideableTypes.add(typeId);
}

/** The `minecraft:rideable` component: one seat, riders tracked by identity, counters for the tests. */
export class RideableComponent {
  readonly owner: Entity;
  riders: Entity[] = [];
  addCount = 0;
  ejectCount = 0;
  /** When set, `addRider` refuses every rider, as the engine does for a full or incompatible seat. */
  rejectRiders = false;
  constructor(owner: Entity) {
    this.owner = owner;
  }
  addRider(rider: Entity): boolean {
    this.addCount++;
    if (this.rejectRiders) return false;
    this.riders.push(rider);
    rider.mount = this.owner;
    rider.location = { ...this.owner.location };
    return true;
  }
  ejectRiders(): void {
    this.ejectCount++;
    for (const rider of this.riders) if (rider.mount === this.owner) rider.mount = undefined;
    this.riders = [];
  }
  getRiders(): Entity[] {
    return [...this.riders];
  }
  getSeats(): Array<{ position: Vector3 }> {
    return [{ position: { x: 0, y: 0, z: 0 } }];
  }
}

/**
 * Entity properties seeded onto entities spawned by `Dimension.spawnEntity`, keyed by type id, mirroring the
 * `properties` block of the entity's behavior JSON. Feature tests register what their entities declare.
 */
export const entityProperties: Record<string, Record<string, unknown>> = {};

export class Entity {
  id: string;
  typeId: string;
  isValid = true;
  location: Vector3;
  dimension: Dimension;
  props: Record<string, unknown> = {};
  dynamic: Record<string, unknown> = {};
  tags = new Set<string>();
  components: Record<string, unknown> = {};
  events: string[] = [];
  rotation = { x: 0, y: 0 };
  velocity: Vector3 = { x: 0, y: 0, z: 0 };
  nameTag = "";
  /** The entity this one rides, exposed through the `minecraft:riding` component. */
  mount?: Entity;
  /** Entity property writes land on the next tick, like the engine. */
  deferPropertyWrites = true;
  constructor(typeId: string, location: Vector3, dimension: Dimension) {
    this.id = `${typeId}#${nextEntityId++}`;
    this.typeId = typeId;
    this.location = { ...location };
    this.dimension = dimension;
  }
  getProperty(key: string): unknown {
    if (!this.isValid) throw new Error("Entity is not valid");
    if (!(key in this.props)) throw new Error(`Unknown entity property ${key}`);
    return this.props[key];
  }
  setProperty(key: string, value: unknown): void {
    if (!this.isValid) throw new Error("Entity is not valid");
    if (!(key in this.props)) throw new Error(`Unknown entity property ${key}`);
    if (this.deferPropertyWrites) {
      system.run(() => {
        if (this.isValid) this.props[key] = value;
      });
    } else this.props[key] = value;
  }
  getDynamicProperty(key: string): unknown {
    return this.dynamic[key];
  }
  setDynamicProperty(key: string, value: unknown): void {
    if (value === undefined) delete this.dynamic[key];
    else this.dynamic[key] = value;
  }
  getDynamicPropertyIds(): string[] {
    return Object.keys(this.dynamic);
  }
  addTag(tag: string): boolean {
    const had = this.tags.has(tag);
    this.tags.add(tag);
    return !had;
  }
  removeTag(tag: string): boolean {
    return this.tags.delete(tag);
  }
  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }
  getTags(): string[] {
    return [...this.tags];
  }
  getComponent(id: string): any {
    if (id === "minecraft:riding") return this.mount ? { entityRidingOn: this.mount } : undefined;
    return this.components[id];
  }
  hasComponent(id: string): boolean {
    return id === "minecraft:riding" ? this.mount !== undefined : id in this.components;
  }
  triggerEvent(name: string): void {
    this.events.push(name);
  }
  teleport(location: Vector3, options?: { dimension?: Dimension; rotation?: { x: number; y: number } }): void {
    const previous = this.location;
    this.location = { ...location };
    if (options?.dimension) this.dimension = options.dimension;
    if (options?.rotation) this.rotation = { ...options.rotation };
    // Riders travel with their mount.
    const rideable = this.components["minecraft:rideable"] as RideableComponent | undefined;
    for (const rider of rideable?.riders ?? []) {
      rider.location = {
        x: rider.location.x + location.x - previous.x,
        y: rider.location.y + location.y - previous.y,
        z: rider.location.z + location.z - previous.z,
      };
    }
  }
  getRotation() {
    return { ...this.rotation };
  }
  setRotation(rotation: { x: number; y: number }): void {
    this.rotation = { ...rotation };
  }
  getVelocity(): Vector3 {
    return { ...this.velocity };
  }
  getHeadLocation(): Vector3 {
    return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z };
  }
  getViewDirection(): Vector3 {
    return { x: 0, y: 0, z: 1 };
  }
  remove(): void {
    (this.components["minecraft:rideable"] as RideableComponent | undefined)?.ejectRiders();
    this.isValid = false;
    this.dimension.entities = this.dimension.entities.filter((entity) => entity !== this);
  }
  kill(): boolean {
    this.remove();
    return true;
  }
  applyDamage(): boolean {
    return true;
  }
  applyKnockback(): void {}
  runCommand(command: string): { successCount: number } {
    this.dimension.commands.push(command);
    return { successCount: 1 };
  }
}

export class Player extends Entity {
  name: string;
  commandPermissionLevel: CommandPermissionLevel = CommandPermissionLevel.Any;
  messages: unknown[] = [];
  actionBar: string[] = [];
  inventory: Container;
  equipment: Partial<Record<EquipmentSlot, ItemStack | undefined>> = {};
  selectedSlotIndex = 0;
  gameMode: GameMode = GameMode.Survival;
  isSneaking = false;
  isSprinting = false;
  isOnGround = true;
  isFlying = false;
  isGliding = false;
  isSwimming = false;
  isSleeping = false;
  isInWater = false;
  isEmoting = false;
  failPersistence = false;
  onScreenDisplay = {
    setActionBar: (text: string) => {
      this.actionBar.push(text);
    },
    setTitle: () => {},
  };
  constructor(name = "Steve", dimension: Dimension = dimensions.overworld, inventorySize = 36) {
    super("minecraft:player", { x: 0, y: 64, z: 0 }, dimension);
    this.id = `player:${name}:${nextEntityId++}`;
    this.name = name;
    this.inventory = new Container(inventorySize);
    this.components["minecraft:inventory"] = { container: this.inventory };
    this.components["minecraft:equippable"] = {
      getEquipment: (slot: EquipmentSlot) =>
        slot === EquipmentSlot.Mainhand ? this.inventory.getItem(this.selectedSlotIndex) : this.equipment[slot],
      setEquipment: (slot: EquipmentSlot, ...rest: [ItemStack?]) => {
        // The engine's optional parameters are counted, not typed: `setEquipment(slot, undefined)` is refused
        // at the native boundary. Clearing a slot is the one-argument call.
        if (rest.length > 0 && rest[0] === undefined) {
          throw new TypeError("Native optional type conversion failed: pass one argument to clear the slot");
        }
        const item = rest[0];
        if (slot === EquipmentSlot.Mainhand) this.inventory.setItem(this.selectedSlotIndex, item);
        else this.equipment[slot] = item;
        return true;
      },
    };
    this.components["minecraft:health"] = { currentValue: 20, effectiveMax: 20 };
  }
  override setDynamicProperty(key: string, value: unknown): void {
    if (this.failPersistence) throw new Error("persistence failed");
    super.setDynamicProperty(key, value);
  }
  sendMessage(message: unknown): void {
    this.messages.push(message);
  }
  /** Chat lines as plain strings (RawMessage objects are JSON-encoded). */
  get chat(): string[] {
    return this.messages.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)));
  }
  getGameMode(): GameMode {
    return this.gameMode;
  }
  setGameMode(mode: GameMode): void {
    this.gameMode = mode;
  }
  getBlockFromViewDirection(): { block: Block } | undefined {
    return undefined;
  }
  playSound(): void {}
}

/**
 * A handle to one position, like the engine's: `typeId`, the states and `isWaterlogged` read the dimension's
 * current block every time, so a block placed after the handle was taken is what the handle reports.
 */
export class Block {
  location: Vector3;
  dimension: Dimension;
  private readonly fallback: { typeId: string; states: Record<string, unknown> };
  constructor(typeId: string, location: Vector3, dimension: Dimension, states: Record<string, unknown> = {}) {
    this.location = { x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) };
    this.dimension = dimension;
    this.fallback = { typeId, states };
  }
  private get entry(): BlockEntry {
    return this.dimension.blocks.get(blockKey(this.location)) ?? this.fallback;
  }
  get typeId(): string {
    return this.entry.typeId;
  }
  get states(): Record<string, unknown> {
    return this.entry.states;
  }
  get isAir(): boolean {
    return this.typeId === "minecraft:air";
  }
  get isLiquid(): boolean {
    return this.typeId === "minecraft:water" || this.typeId === "minecraft:lava";
  }
  get isSolid(): boolean {
    return !this.isAir && !this.isLiquid;
  }
  get isWaterlogged(): boolean {
    return this.entry.waterlogged === true;
  }
  /** Mock only: the engine's `isWaterlogged` is read-only, so tests flood a block through this setter. */
  set isWaterlogged(flag: boolean) {
    this.dimension.blocks.set(blockKey(this.location), { ...this.entry, waterlogged: flag });
  }
  get permutation(): BlockPermutation {
    return BlockPermutation.resolve(this.typeId, this.states);
  }
  get x(): number {
    return this.location.x;
  }
  get y(): number {
    return this.location.y;
  }
  get z(): number {
    return this.location.z;
  }
  above(steps = 1): Block | undefined {
    return this.dimension.getBlock({ ...this.location, y: this.location.y + steps });
  }
  below(steps = 1): Block | undefined {
    return this.dimension.getBlock({ ...this.location, y: this.location.y - steps });
  }
  setPermutation(permutation: BlockPermutation): void {
    this.dimension.setBlock(this.location, permutation.type.id, permutation.getAllStates());
  }
  setType(typeId: string): void {
    this.dimension.setBlock(this.location, typeId, {});
  }
}

export class BlockPermutation {
  type: { id: string };
  private readonly states: Record<string, unknown>;
  private constructor(typeId: string, states: Record<string, unknown>) {
    this.type = { id: typeId };
    this.states = { ...states };
  }
  static resolve(typeId: string, states: Record<string, unknown> = {}): BlockPermutation {
    return new BlockPermutation(typeId, states);
  }
  getState(name: string): unknown {
    return this.states[name];
  }
  getAllStates(): Record<string, unknown> {
    return { ...this.states };
  }
  withState(name: string, value: unknown): BlockPermutation {
    return new BlockPermutation(this.type.id, { ...this.states, [name]: value });
  }
  matches(typeId: string, states?: Record<string, unknown>): boolean {
    if (typeId !== this.type.id) return false;
    if (!states) return true;
    return Object.entries(states).every(([key, value]) => this.states[key] === value);
  }
}

function blockKey(location: Vector3): string {
  return `${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
}

interface BlockEntry {
  typeId: string;
  states: Record<string, unknown>;
  waterlogged?: boolean;
}

/** The face a ray entered a block through, from the axis the ray mostly travels along. */
function entryFace(direction: Vector3): { face: string; axis: "x" | "y" | "z"; at: 0 | 1 } {
  const ax = Math.abs(direction.x);
  const ay = Math.abs(direction.y);
  const az = Math.abs(direction.z);
  if (ay >= ax && ay >= az)
    return direction.y < 0 ? { face: "Up", axis: "y", at: 1 } : { face: "Down", axis: "y", at: 0 };
  if (ax >= az) return direction.x < 0 ? { face: "East", axis: "x", at: 1 } : { face: "West", axis: "x", at: 0 };
  return direction.z < 0 ? { face: "South", axis: "z", at: 1 } : { face: "North", axis: "z", at: 0 };
}

export class Dimension {
  id: string;
  entities: Entity[] = [];
  blocks = new Map<string, BlockEntry>();
  commands: string[] = [];
  sounds: string[] = [];
  particles: string[] = [];
  spawnedItems: Array<{ item: ItemStack; location: Vector3 }> = [];
  spawnFailAt = 0;
  spawnCount = 0;
  constructor(id: string) {
    this.id = id;
  }
  getEntities(
    options: { type?: string; location?: Vector3; maxDistance?: number; families?: string[] } = {},
  ): Entity[] {
    return this.entities.filter((entity) => {
      if (!entity.isValid) return false;
      if (options.type && entity.typeId !== options.type) return false;
      if (options.location && options.maxDistance !== undefined) {
        const dx = entity.location.x - options.location.x;
        const dy = entity.location.y - options.location.y;
        const dz = entity.location.z - options.location.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) > options.maxDistance) return false;
      }
      return true;
    });
  }
  getPlayers(options: { location?: Vector3; maxDistance?: number } = {}): Player[] {
    return this.getEntities({ type: "minecraft:player", ...options }) as Player[];
  }
  spawnEntity(typeId: string, location: Vector3): Entity {
    this.spawnCount++;
    if (this.spawnFailAt === this.spawnCount) throw new Error("mock spawn failure");
    return this.adopt(new Entity(typeId, location, this));
  }
  /** Seeds a freshly constructed entity with its type's properties and components and lists it. */
  adopt<T extends Entity>(entity: T): T {
    entity.props = { ...(entityProperties[entity.typeId] ?? {}) };
    if (rideableTypes.has(entity.typeId)) entity.components["minecraft:rideable"] = new RideableComponent(entity);
    this.entities.push(entity);
    return entity;
  }
  spawnItem(item: ItemStack, location: Vector3): Entity {
    this.spawnedItems.push({ item, location: { ...location } });
    const entity = new Entity("minecraft:item", location, this);
    this.entities.push(entity);
    return entity;
  }
  setBlock(location: Vector3, typeId: string, states: Record<string, unknown> = {}): Block {
    this.blocks.set(blockKey(location), { typeId, states });
    return new Block(typeId, location, this, states);
  }
  getBlock(location: Vector3): Block | undefined {
    const entry = this.blocks.get(blockKey(location));
    return new Block(entry?.typeId ?? "minecraft:air", location, this, entry?.states ?? {});
  }
  /**
   * Marches the ray in small steps and reports the first block whose face it crosses: a block the origin already
   * sits inside is never a hit, since no face was entered. `faceLocation` is relative to the block, with the
   * crossed coordinate snapped to the face, and `face` names the side entered.
   */
  getBlockFromRay(
    origin: Vector3,
    direction: Vector3,
    options: { maxDistance?: number; includeLiquidBlocks?: boolean; includePassableBlocks?: boolean } = {},
  ): { block: Block; face: string; faceLocation: Vector3 } | undefined {
    const max = options.maxDistance ?? 16;
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const unit = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
    const step = 0.05;
    const startKey = blockKey(origin);
    const entered = entryFace(direction);
    for (let distance = step; distance <= max + 1e-9; distance += step) {
      const point = {
        x: origin.x + unit.x * distance,
        y: origin.y + unit.y * distance,
        z: origin.z + unit.z * distance,
      };
      if (blockKey(point) === startKey) continue;
      const block = this.getBlock(point) as Block;
      if (block.isAir) continue;
      if (block.isLiquid && !options.includeLiquidBlocks) continue;
      const faceLocation = {
        x: point.x - block.location.x,
        y: point.y - block.location.y,
        z: point.z - block.location.z,
      };
      faceLocation[entered.axis] = entered.at;
      return { block, face: entered.face, faceLocation };
    }
    return undefined;
  }
  playSound(id: string): void {
    this.sounds.push(id);
  }
  spawnParticle(id: string): void {
    this.particles.push(id);
  }
  runCommand(command: string): { successCount: number } {
    this.commands.push(command);
    return { successCount: 1 };
  }
}

export type DimensionKey = "overworld" | "nether" | "the_end";
export const DIMENSION_KEYS: DimensionKey[] = ["overworld", "nether", "the_end"];
export const dimensions: Record<DimensionKey, Dimension> = {
  overworld: new Dimension("minecraft:overworld"),
  nether: new Dimension("minecraft:nether"),
  the_end: new Dimension("minecraft:the_end"),
};

/**
 * Casts a mock object to the engine type a `src/` function expects, for example `openManual(engine(player))`.
 * The runtime object is the mock; only the static type changes.
 */
export function engine(value: unknown): any {
  return value;
}

// ---------------------------------------------------------------------------------------------------------------
// World

export const players: Player[] = [];
export const worldMessages: unknown[] = [];
const DEFAULT_GAME_RULES = { doTileDrops: true, recipesUnlock: true, showRecipeMessages: true };
let worldDynamic: Record<string, unknown> = {};
let difficulty: Difficulty = Difficulty.Normal;

export const world = {
  beforeEvents: {
    explosion: new Signal(),
    itemUse: new Signal(),
    playerInteractWithBlock: new Signal(),
    playerInteractWithEntity: new Signal(),
    playerBreakBlock: new Signal(true),
    entityHurt: new Signal(true),
  },
  afterEvents: {
    worldLoad: new Signal(),
    playerSpawn: new Signal(),
    playerLeave: new Signal(),
    playerDimensionChange: new Signal(),
    playerPlaceBlock: new Signal(true),
    playerBreakBlock: new Signal(true),
    playerInteractWithBlock: new Signal(),
    playerInteractWithEntity: new Signal(),
    entitySpawn: new Signal(),
    entityLoad: new Signal(),
    entityRemove: new Signal(true),
    entityHitEntity: new Signal(true),
    entityDie: new Signal(true),
    entityHurt: new Signal(true),
    itemUse: new Signal(),
    explosion: new Signal(),
  },
  gameRules: { ...DEFAULT_GAME_RULES },
  getAllPlayers(): Player[] {
    return players.filter((player) => player.isValid);
  },
  getPlayers(options: { name?: string } = {}): Player[] {
    return world.getAllPlayers().filter((player) => !options.name || player.name === options.name);
  },
  getDimension(id: string): Dimension {
    const key = id.replace("minecraft:", "") as DimensionKey;
    const dimension = dimensions[key];
    if (!dimension) throw new Error(`Unknown dimension ${id}`);
    return dimension;
  },
  getDynamicProperty(key: string): unknown {
    return worldDynamic[key];
  },
  setDynamicProperty(key: string, value: unknown): void {
    if (value === undefined) delete worldDynamic[key];
    else worldDynamic[key] = value;
  },
  getDynamicPropertyIds(): string[] {
    return Object.keys(worldDynamic);
  },
  clearDynamicProperties(): void {
    worldDynamic = {};
  },
  getDifficulty(): Difficulty {
    return difficulty;
  },
  setDifficulty(value: Difficulty): void {
    difficulty = value;
  },
  sendMessage(message: unknown): void {
    worldMessages.push(message);
  },
  getEntity(id: string): Entity | undefined {
    for (const dimension of Object.values(dimensions)) {
      const entity = dimension.entities.find((candidate) => candidate.id === id && candidate.isValid);
      if (entity) return entity;
    }
    return undefined;
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Startup registries

export interface RegisteredCommand {
  definition: any;
  callback: (origin: any, ...args: any[]) => any;
}

export const registry = {
  enums: new Map<string, string[]>(),
  commands: new Map<string, RegisteredCommand>(),
  components: new Map<string, Record<string, any>>(),
  /** When set, `registerEnum` rejects any value matching the pattern (simulates engine name rules). */
  rejectEnumValues: undefined as RegExp | undefined,
  /** The one namespace this script module's commands and enums share; the engine fixes it at the first registration. */
  namespace: undefined as string | undefined,
  claimNamespace(name: string): void {
    if (!name.includes(":")) throw new Error(`${name} needs a namespace`);
    const namespace = name.slice(0, name.indexOf(":"));
    if (this.namespace === undefined) this.namespace = namespace;
    else if (namespace !== this.namespace) {
      throw new Error(
        `Custom Command Enum namespaces must match. Namespace '${namespace}' does not match existing namespace '${this.namespace}'.`,
      );
    }
  },
  registerEnum(name: string, values: string[]): void {
    this.claimNamespace(name);
    if (this.enums.has(name)) throw new Error(`Duplicate enum ${name}`);
    if (this.rejectEnumValues && values.some((value) => this.rejectEnumValues?.test(value))) {
      throw new Error(`Enum value rejected for ${name}`);
    }
    this.enums.set(name, [...values]);
  },
  registerCommand(definition: any, callback: (origin: any, ...args: any[]) => any): void {
    this.claimNamespace(definition.name);
    for (const parameter of [...(definition.mandatoryParameters ?? []), ...(definition.optionalParameters ?? [])]) {
      if (parameter.type === CustomCommandParamType.Enum && !this.enums.has(parameter.name)) {
        throw new Error(`Enum ${parameter.name} is not registered`);
      }
    }
    if (this.commands.has(definition.name)) throw new Error(`Duplicate command ${definition.name}`);
    this.commands.set(definition.name, { definition, callback });
  },
  registerCustomComponent(name: string, component: Record<string, any>): void {
    if (this.components.has(name)) throw new Error(`Duplicate custom component ${name}`);
    this.components.set(name, component);
  },
};

export interface StartupEvent {
  customCommandRegistry: typeof registry;
  itemComponentRegistry: typeof registry;
  blockComponentRegistry: typeof registry;
}

export interface ScriptEventCommandMessageAfterEvent {
  id: string;
  message: string;
  sourceType: ScriptEventSource;
  sourceEntity?: Entity;
}

/** Fires `system.beforeEvents.startup` with the mock registries. */
export function startup(): void {
  system.beforeEvents.startup.emit({
    customCommandRegistry: registry,
    itemComponentRegistry: registry,
    blockComponentRegistry: registry,
  });
}

/** Fires `world.afterEvents.worldLoad`. */
export function loadWorld(): void {
  world.afterEvents.worldLoad.emit({});
}

/** Invokes a registered command exactly as the engine would, returning the callback's result. */
export function runCommand(
  name: string,
  origin: { sourceEntity?: Entity; sourceType?: CustomCommandSource },
  ...args: unknown[]
) {
  const command = registry.commands.get(name);
  if (!command) throw new Error(`Command ${name} is not registered`);
  return command.callback({ sourceType: CustomCommandSource.Entity, ...origin }, ...args);
}

export function addPlayer(name = "Steve", dimension: Dimension = dimensions.overworld): Player {
  const player = new Player(name, dimension);
  players.push(player);
  dimension.entities.push(player);
  return player;
}

export function joinPlayer(name = "Steve", initialSpawn = true): Player {
  const player = addPlayer(name);
  world.afterEvents.playerSpawn.emit({ player, initialSpawn });
  return player;
}

export function leavePlayer(player: Player): void {
  world.afterEvents.playerLeave.emit({ playerId: player.id, playerName: player.name });
  player.isValid = false;
  const index = players.indexOf(player);
  if (index >= 0) players.splice(index, 1);
  player.dimension.entities = player.dimension.entities.filter((entity) => entity !== player);
}

/** Clears every piece of state so a test starts from an empty world with nothing registered. */
export function reset(): void {
  currentTick = 0;
  jobs = [];
  requestedDelays.length = 0;
  players.length = 0;
  worldMessages.length = 0;
  worldDynamic = {};
  difficulty = Difficulty.Normal;
  Object.assign(world.gameRules, DEFAULT_GAME_RULES);
  for (const key of DIMENSION_KEYS) dimensions[key] = new Dimension(`minecraft:${key}`);
  for (const signal of [...Object.values(world.beforeEvents), ...Object.values(world.afterEvents)])
    signal.callbacks = [];
  system.beforeEvents.startup.callbacks = [];
  system.afterEvents.scriptEventReceive.callbacks = [];
  registry.enums.clear();
  registry.commands.clear();
  registry.components.clear();
  registry.rejectEnumValues = undefined;
  registry.namespace = undefined;
  for (const key of Object.keys(entityProperties)) delete entityProperties[key];
  entityTypes.clear();
  itemTypes.clear();
}
