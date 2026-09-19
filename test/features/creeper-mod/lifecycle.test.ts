import { beforeEach, describe, expect, it } from "vitest";
import { runFeature } from "../../../src/core/feature.ts";
import { creeperMod } from "../../../src/features/creeper-mod/index.ts";
import {
  addPlayer,
  type Block,
  dimensions,
  type Entity,
  engine,
  GameMode,
  loadWorld,
  reset,
  startup,
  step,
  system,
  world,
} from "../../mocks/minecraft-server.ts";

/** The before-event the engine sends: its source, the blocks it is about to break, and the cancel flag. */
interface Explosion {
  source: Entity | undefined;
  cancel: boolean;
  getImpactedBlocks(): Block[];
  setImpactedBlocks(blocks: Block[]): void;
}

/** Fires `world.beforeEvents.explosion` for `source` with `blocks` about to break, as the engine would. */
function detonate(source: Entity | undefined, blocks: Block[]): Explosion {
  let impacted = blocks;
  const event: Explosion = {
    source,
    cancel: false,
    getImpactedBlocks: () => impacted,
    setImpactedBlocks(next) {
      impacted = next;
    },
  };
  world.beforeEvents.explosion.emit(event);
  return event;
}

function floor(): Block[] {
  const blocks: Block[] = [];
  for (const x of [-1, 0, 1]) {
    dimensions.overworld.setBlock({ x, y: 64, z: 0 }, "minecraft:stone");
    blocks.push(dimensions.overworld.getBlock({ x, y: 64, z: 0 }) as Block);
  }
  return blocks;
}

function boot(): void {
  runFeature(creeperMod);
  startup();
  loadWorld();
}

beforeEach(() => reset());

describe("creeper-mod lifecycle", () => {
  it("subscribes to the explosion before-event on world load and runs no interval", () => {
    runFeature(creeperMod);
    startup();
    const explosionsBefore = world.beforeEvents.explosion.size;
    const intervalsBefore = system.intervalCount;
    loadWorld();
    expect(world.beforeEvents.explosion.size).toBe(explosionsBefore + 1);
    expect(system.intervalCount).toBe(intervalsBefore);
  });

  it("keeps a creeper explosion and removes every block from it", () => {
    boot();
    const creeper = dimensions.overworld.spawnEntity("minecraft:creeper", { x: 0, y: 65, z: 0 });
    const player = addPlayer("Steve");
    player.gameMode = GameMode.Survival;
    let scripted = 0;
    engine(player).applyDamage = () => {
      scripted++;
      return true;
    };
    const event = detonate(creeper, floor());
    expect(event.cancel).toBe(false);
    expect(event.getImpactedBlocks()).toEqual([]);
    step(5);
    // The engine's explosion goes on to hurt whoever is in range; the script neither damages nor removes anything.
    expect(scripted).toBe(0);
    expect(creeper.isValid).toBe(true);
    expect(dimensions.overworld.particles).toEqual([]);
    expect(dimensions.overworld.sounds).toEqual([]);
    expect(system.intervalCount).toBe(0);
  });

  it("leaves explosions from other sources to the engine, blocks included", () => {
    boot();
    const tnt = dimensions.overworld.spawnEntity("minecraft:tnt", { x: 0, y: 65, z: 0 });
    const blocks = floor();
    const event = detonate(tnt, blocks);
    expect(event.cancel).toBe(false);
    expect(event.getImpactedBlocks()).toEqual(blocks);
    expect(detonate(undefined, blocks).getImpactedBlocks()).toEqual(blocks);
  });

  it("guards every creeper, not one per 200 ticks: there is no deduplication to get in the way", () => {
    boot();
    const creeper = dimensions.overworld.spawnEntity("minecraft:creeper", { x: 0, y: 65, z: 0 });
    for (let i = 0; i < 3; i++) expect(detonate(creeper, floor()).getImpactedBlocks()).toEqual([]);
  });
});
