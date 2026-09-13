// Small deterministic test doubles ported from the upstream stair-sitting tests. They are NOT the Minecraft
// engine: blocks are a map, rays only look straight down at full-block surfaces, and seats record what the
// scripts asked of them. The seats and targets modules take the engine types, so tests hand these doubles over
// through the mock's `engine()` cast.

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

let nextId = 1;

export class FakeBlock {
  dimension: FakeDimension;
  location: Vector3;
  typeId: string;
  permutation: { getAllStates: () => Record<string, unknown> };
  isAir: boolean;
  isLiquid: boolean;
  isWaterlogged = false;
  constructor(
    dimension: FakeDimension,
    location: Vector3,
    typeId = "minecraft:air",
    states: Record<string, unknown> = {},
  ) {
    this.dimension = dimension;
    this.location = { ...location };
    this.typeId = typeId;
    this.permutation = { getAllStates: () => ({ ...states }) };
    this.isAir = typeId === "minecraft:air";
    this.isLiquid = ["minecraft:water", "minecraft:lava"].includes(typeId);
  }
}

export class FakeDimension {
  id: string;
  blocks = new Map<string, FakeBlock>();
  entities: FakeSeat[] = [];
  failSpawn = false;
  rejectMount = false;
  constructor(id = "minecraft:overworld") {
    this.id = id;
  }
  key(p: Vector3): string {
    return `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
  }
  put(p: Vector3, typeId: string, states: Record<string, unknown> = {}): FakeBlock {
    const b = new FakeBlock(this, p, typeId, states);
    this.blocks.set(this.key(p), b);
    return b;
  }
  stair(p: Vector3 = { x: 0, y: 64, z: 0 }, direction = 0, corner = "none"): FakeBlock {
    return this.put(p, "minecraft:oak_stairs", {
      weirdo_direction: direction,
      upside_down_bit: false,
      "minecraft:corner": corner,
    });
  }
  getBlock(p: Vector3): FakeBlock {
    return (
      this.blocks.get(this.key(p)) ??
      new FakeBlock(this, { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) })
    );
  }
  getBlockFromRay(origin: Vector3, _direction: Vector3, options: { maxDistance: number }) {
    // Tests need only downward support rays and full-block surfaces. The actual
    // client collision shapes and dismount placement are in the manual test plan.
    for (let y = Math.floor(origin.y); y >= Math.floor(origin.y - options.maxDistance); y--) {
      const b = this.getBlock({ x: origin.x, y, z: origin.z });
      if (!b.isAir && y + 1 <= origin.y && origin.y - (y + 1) <= options.maxDistance) {
        return { block: b, face: "Up", faceLocation: { x: origin.x % 1, y: 1, z: origin.z % 1 } };
      }
    }
    return undefined;
  }
  getEntities({ type }: { type?: string } = {}): FakeSeat[] {
    return this.entities.filter((e) => e.isValid && (!type || e.typeId === type));
  }
  spawnEntity(typeId: string, location: Vector3): FakeSeat {
    if (this.failSpawn) throw new Error("simulated spawn failure");
    const e = new FakeSeat(this, typeId, location);
    this.entities.push(e);
    return e;
  }
}

export interface FakeRideable {
  addRider(player: FakePlayer): boolean;
  ejectRiders(): void;
  getRiders(): FakePlayer[];
}

export interface FakeTeleportOptions {
  dimension?: FakeDimension;
  rotation?: { x: number; y: number };
  checkForBlocks?: boolean;
  keepVelocity?: boolean;
}

/** Any helper entity the scripts spawn: seat carriers, interaction targets and bystander mobs alike. */
export class FakeSeat {
  dimension: FakeDimension;
  typeId: string;
  location: Vector3;
  id: string;
  isValid = true;
  events: string[] = [];
  riders: FakePlayer[] = [];
  rotation = { x: 0, y: 0 };
  teleports: Array<{ location: Vector3; options: FakeTeleportOptions }> = [];
  addCount = 0;
  ejectCount = 0;
  removeCount = 0;
  throwTeleportOnce = false;
  noopTeleportOnce = false;
  dropRiderOnce = false;
  throwAfterMoveOnce = false;
  rideable: FakeRideable;
  constructor(dimension: FakeDimension, typeId: string, location: Vector3) {
    this.dimension = dimension;
    this.typeId = typeId;
    this.location = { ...location };
    this.id = `seat-${nextId++}`;
    this.rideable = {
      addRider: (player) => {
        this.addCount++;
        if (dimension.rejectMount) return false;
        this.riders.push(player);
        player.mount = this;
        player.location = { ...this.location };
        return true;
      },
      ejectRiders: () => {
        this.ejectCount++;
        for (const p of this.riders) if (p.mount === this) p.mount = undefined;
        this.riders = [];
      },
      getRiders: () => [...this.riders],
    };
  }
  getComponent(id: string): FakeRideable | undefined {
    return id === "minecraft:rideable" && this.typeId !== "sit:target" ? this.rideable : undefined;
  }
  getRotation() {
    return { ...this.rotation };
  }
  setRotation(rotation: { x: number; y: number }): void {
    this.rotation = { ...rotation };
  }
  teleport(location: Vector3, options: FakeTeleportOptions = {}): void {
    this.teleports.push({ location: { ...location }, options: { ...options } });
    if (this.throwTeleportOnce) {
      this.throwTeleportOnce = false;
      throw new Error("simulated teleport failure");
    }
    if (this.noopTeleportOnce) {
      this.noopTeleportOnce = false;
      return;
    }
    const previous = this.location;
    this.location = { ...location };
    if (options.dimension) this.dimension = options.dimension;
    if (options.rotation) this.rotation = { ...options.rotation };
    for (const p of this.riders) {
      p.location = {
        x: p.location.x + location.x - previous.x,
        y: p.location.y + location.y - previous.y,
        z: p.location.z + location.z - previous.z,
      };
    }
    if (this.dropRiderOnce) {
      this.dropRiderOnce = false;
      this.rideable.ejectRiders();
    }
    if (this.throwAfterMoveOnce) {
      this.throwAfterMoveOnce = false;
      throw new Error("simulated partial teleport failure");
    }
  }
  triggerEvent(event: string): void {
    this.events.push(event);
    if (event === "sit:expire") this.remove();
  }
  remove(): void {
    this.removeCount++;
    this.rideable.ejectRiders();
    this.isValid = false;
  }
}

export class FakePlayer {
  dimension: FakeDimension;
  id: string;
  /** The core's book grant reads a name on spawn; the upstream double had none. */
  name: string;
  typeId = "minecraft:player";
  location: Vector3 = { x: -1, y: 64, z: 0.5 };
  rotation = { x: 15, y: 0 };
  isValid = true;
  isSneaking = false;
  isFlying = false;
  isGliding = false;
  isSwimming = false;
  isSleeping = false;
  tags = new Set<string>();
  mode = "Survival";
  health = 20;
  props = new Map<string, unknown>();
  messages: string[] = [];
  mainHand?: { typeId: string };
  offHand?: { typeId: string };
  /** The seat carrier, or a stand-in such as `{ id: "boat" }` for another vehicle. */
  mount?: any;
  target?: FakeBlock;
  teleported?: boolean;
  actionBar?: string;
  onScreenDisplay = {
    setActionBar: (s: string) => {
      this.actionBar = s;
    },
  };
  constructor(dimension: FakeDimension, id = `player-${nextId++}`) {
    this.dimension = dimension;
    this.id = id;
    this.name = id;
  }
  getComponent(id: string): any {
    if (id === "minecraft:equippable") {
      return { getEquipment: (slot: string) => (slot === "Mainhand" ? this.mainHand : this.offHand) };
    }
    if (id === "minecraft:health") return { currentValue: this.health };
    if (id === "minecraft:riding") return this.mount ? { entityRidingOn: this.mount } : undefined;
    return undefined;
  }
  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }
  addTag(tag: string): boolean {
    this.tags.add(tag);
    return true;
  }
  removeTag(tag: string): boolean {
    return this.tags.delete(tag);
  }
  getGameMode(): string {
    return this.mode;
  }
  getRotation() {
    return { ...this.rotation };
  }
  setRotation(rotation: { x: number; y: number }): void {
    this.rotation = { ...rotation };
  }
  getDynamicProperty(key: string): unknown {
    return this.props.get(key);
  }
  setDynamicProperty(key: string, value: unknown): void {
    this.props.set(key, value);
  }
  getBlockFromViewDirection(): { block: FakeBlock } | undefined {
    return this.target ? { block: this.target } : undefined;
  }
  sendMessage(message: string): void {
    this.messages.push(message);
  }
  teleport(position: Vector3, { dimension }: { dimension: FakeDimension }): void {
    this.location = { ...position };
    this.dimension = dimension;
    this.teleported = true;
  }
}

/** One player next to one stair at the origin, with the injectable `world` and `system` the seat modules expect. */
export function fixture() {
  const dimension = new FakeDimension();
  const player = new FakePlayer(dimension);
  const stair = dimension.stair();
  player.target = stair;
  const world = { getAllPlayers: () => [player], getDimension: () => dimension };
  const system = { currentTick: 100 };
  return { dimension, player, stair, world, system };
}
