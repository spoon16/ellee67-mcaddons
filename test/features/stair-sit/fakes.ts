// Stair Sitting's test conveniences on top of the shared engine mock: a dimension that can place stairs and fail
// a spawn, a seat carrier with fault-injection knobs, and a player who aims at a block. Every object here IS a mock
// engine object (a subclass), so the seat modules take them as the `Dimension`, `Entity` and `Player` they are.
import {
  type Block,
  Dimension,
  Entity,
  type GameMode,
  ItemStack,
  Player,
  type RideableComponent,
  registerRideableType,
  type Vector3,
} from "../../mocks/minecraft-server.ts";

registerRideableType("sit:seat");

export class FakeDimension extends Dimension {
  /** Every `spawnEntity` throws while set, like a dimension whose chunk is not loaded. */
  failSpawn = false;
  /** Every carrier spawned refuses its rider, like a seat the engine will not fill. */
  rejectMount = false;
  constructor(id = "minecraft:overworld") {
    super(id);
  }
  put(location: Vector3, typeId: string, states: Record<string, unknown> = {}): Block {
    return this.setBlock(location, typeId, states);
  }
  stair(location: Vector3 = { x: 0, y: 64, z: 0 }, direction = 0, corner = "none"): Block {
    return this.put(location, "minecraft:oak_stairs", {
      weirdo_direction: direction,
      upside_down_bit: false,
      "minecraft:corner": corner,
    });
  }
  override spawnEntity(typeId: string, location: Vector3): FakeSeat {
    if (this.failSpawn) throw new Error("simulated spawn failure");
    return this.adopt(new FakeSeat(typeId, location, this));
  }
  override getEntities(options: Parameters<Dimension["getEntities"]>[0] = {}): FakeSeat[] {
    return super.getEntities(options) as FakeSeat[];
  }
}

/** Any helper entity the scripts spawn: seat carriers, interaction targets and bystander mobs alike. */
export class FakeSeat extends Entity {
  teleports: Array<{ location: Vector3; options: Record<string, unknown> }> = [];
  removeCount = 0;
  throwTeleportOnce = false;
  noopTeleportOnce = false;
  dropRiderOnce = false;
  throwAfterMoveOnce = false;
  /** The carrier's `minecraft:rideable` component, or undefined for a Sit target. */
  get rideable(): RideableComponent {
    return this.components["minecraft:rideable"] as RideableComponent;
  }
  get riders(): Entity[] {
    return this.rideable.riders;
  }
  get addCount(): number {
    return this.rideable.addCount;
  }
  get ejectCount(): number {
    return this.rideable.ejectCount;
  }
  override getComponent(id: string): any {
    const component = super.getComponent(id);
    if (id === "minecraft:rideable" && component && (this.dimension as FakeDimension).rejectMount)
      (component as RideableComponent).rejectRiders = true;
    return component;
  }
  override triggerEvent(event: string): void {
    super.triggerEvent(event);
    if (event === "sit:expire") this.remove();
  }
  override remove(): void {
    this.removeCount++;
    super.remove();
  }
  override teleport(location: Vector3, options: Record<string, unknown> = {}): void {
    this.teleports.push({ location: { ...location }, options: { ...options } });
    if (this.throwTeleportOnce) {
      this.throwTeleportOnce = false;
      throw new Error("simulated teleport failure");
    }
    if (this.noopTeleportOnce) {
      this.noopTeleportOnce = false;
      return;
    }
    super.teleport(location, options);
    if (this.dropRiderOnce) {
      this.dropRiderOnce = false;
      this.rideable.ejectRiders();
    }
    if (this.throwAfterMoveOnce) {
      this.throwAfterMoveOnce = false;
      throw new Error("simulated partial teleport failure");
    }
  }
}

export class FakePlayer extends Player {
  /** The seat carrier, or a stand-in such as `{ id: "boat" }` for another vehicle. Untyped for the stand-ins. */
  declare mount?: any;
  /** What `getBlockFromViewDirection` answers with. */
  target?: Block;
  /** Set by `teleport`, so a test can prove the scripts never moved the player. */
  teleported?: boolean;
  constructor(dimension: FakeDimension, name = `player-${nextPlayer++}`) {
    super(name, dimension);
    this.location = { x: -1, y: 64, z: 0.5 };
    this.rotation = { x: 15, y: 0 };
  }
  get mainHand(): ItemStack | undefined {
    return this.inventory.getItem(this.selectedSlotIndex);
  }
  set mainHand(item: { typeId: string } | undefined) {
    this.inventory.setItem(this.selectedSlotIndex, item ? new ItemStack(item.typeId) : undefined);
  }
  get offHand(): ItemStack | undefined {
    return this.equipment.Offhand;
  }
  set offHand(item: { typeId: string } | undefined) {
    this.equipment.Offhand = item ? new ItemStack(item.typeId) : undefined;
  }
  get health(): number {
    return (this.components["minecraft:health"] as { currentValue: number }).currentValue;
  }
  set health(value: number) {
    (this.components["minecraft:health"] as { currentValue: number }).currentValue = value;
  }
  get mode(): GameMode {
    return this.gameMode;
  }
  set mode(mode: GameMode | `${GameMode}`) {
    this.gameMode = mode as GameMode;
  }
  override getBlockFromViewDirection(): { block: Block } | undefined {
    return this.target ? { block: this.target } : undefined;
  }
  override teleport(location: Vector3, options?: { dimension?: Dimension }): void {
    super.teleport(location, options);
    this.teleported = true;
  }
}

let nextPlayer = 1;

/**
 * One player next to one stair at the origin, plus the two slices of the engine the seat modules read (`SeatWorld`
 * and `SeatClock` in seats.ts) as plain objects with a settable tick. Tests hand them over through `engine()`, the
 * repo's one cast from mock objects to the engine types `src/` is written against.
 */
export function fixture() {
  const dimension = new FakeDimension();
  const player = new FakePlayer(dimension);
  const stair = dimension.stair();
  player.target = stair;
  const world = { getAllPlayers: () => [player] as Player[], getDimension: () => dimension as Dimension };
  const system = { currentTick: 100 };
  return { dimension, player, stair, world, system };
}
