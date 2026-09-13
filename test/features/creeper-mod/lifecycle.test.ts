import { beforeEach, describe, expect, it } from "vitest";
import { bootstrap } from "../../../src/core/bootstrap.ts";
import { isRunning, setEnabled } from "../../../src/core/features.ts";
import { creeperMod } from "../../../src/features/creeper-mod/index.ts";
import {
  addPlayer,
  CustomCommandStatus,
  dimensions,
  type Entity,
  EntityDamageCause,
  engine,
  GameMode,
  loadWorld,
  type Player,
  reset,
  runCommand,
  startup,
  step,
  system,
  world,
} from "../../mocks/minecraft-server.ts";

interface Hit {
  amount: number;
  cause: EntityDamageCause;
}

/** A Survival player standing next to the blast origin who records every scripted hit. */
function bystander(name = "Steve"): { player: Player; hits: Hit[] } {
  const hits: Hit[] = [];
  const player = addPlayer(name);
  player.gameMode = GameMode.Survival;
  engine(player).applyDamage = (amount: number, options: { cause: EntityDamageCause }) => {
    hits.push({ amount, cause: options.cause });
    return true;
  };
  return { player, hits };
}

function detonate(source: Entity): { source: Entity; cancel: boolean } {
  const event = { source, cancel: false };
  world.beforeEvents.explosion.emit(event);
  return event;
}

function boot(): void {
  bootstrap([creeperMod]);
  startup();
  loadWorld();
}

beforeEach(() => reset());

describe("creeper-mod lifecycle", () => {
  it("subscribes to the explosion before-event on start and leaves nothing behind on stop", () => {
    bootstrap([creeperMod]);
    startup();
    const explosionsBefore = world.beforeEvents.explosion.size;
    const intervalsBefore = system.intervalCount;
    loadWorld();
    expect(isRunning("creeper-mod")).toBe(true);
    expect(world.beforeEvents.explosion.size).toBe(explosionsBefore + 1);
    expect(system.intervalCount).toBe(intervalsBefore);
    expect(setEnabled("creeper-mod", false)).toEqual({ changed: true });
    expect(isRunning("creeper-mod")).toBe(false);
    expect(world.beforeEvents.explosion.size).toBe(explosionsBefore);
    expect(system.intervalCount).toBe(intervalsBefore);
  });

  it("cancels a creeper explosion and hurts a nearby Survival player on the next tick", () => {
    boot();
    const creeper = dimensions.overworld.spawnEntity("minecraft:creeper", { x: 0, y: 65, z: 0 });
    const { hits } = bystander();
    const event = detonate(creeper);
    expect(event.cancel).toBe(true);
    expect(hits).toEqual([]);
    expect(creeper.isValid).toBe(true);
    step(1);
    expect(hits.length).toBe(1);
    expect(hits[0]?.amount).toBeGreaterThan(0);
    expect(hits[0]?.cause).toBe(EntityDamageCause.entityExplosion);
    expect(creeper.isValid).toBe(false);
    expect(dimensions.overworld.entities).not.toContain(creeper);
    expect(dimensions.overworld.particles).toEqual(["minecraft:huge_explosion_emitter"]);
    expect(dimensions.overworld.sounds).toEqual(["random.explode"]);
  });

  it("leaves explosions from other sources to the engine", () => {
    boot();
    const tnt = dimensions.overworld.spawnEntity("minecraft:tnt", { x: 0, y: 65, z: 0 });
    const { hits } = bystander();
    const event = detonate(tnt);
    step(1);
    expect(event.cancel).toBe(false);
    expect(hits).toEqual([]);
    expect(tnt.isValid).toBe(true);
  });

  it("lets creeper explosions through once disabled and takes them over again when re-enabled", () => {
    boot();
    setEnabled("creeper-mod", false);
    const first = dimensions.overworld.spawnEntity("minecraft:creeper", { x: 0, y: 65, z: 0 });
    const { hits } = bystander();
    const vanilla = detonate(first);
    step(1);
    expect(vanilla.cancel).toBe(false);
    expect(hits).toEqual([]);
    expect(first.isValid).toBe(true);

    const operator = addPlayer("Op");
    expect(runCommand("elleedog67:enable", { sourceEntity: operator }, "creeper-mod").status).toBe(
      CustomCommandStatus.Success,
    );
    step(1);
    expect(operator.chat).toEqual(["Creeper Mod enabled."]);
    const second = dimensions.overworld.spawnEntity("minecraft:creeper", { x: 0, y: 65, z: 0 });
    const scripted = detonate(second);
    step(1);
    expect(scripted.cancel).toBe(true);
    expect(hits.length).toBe(1);
    expect(second.isValid).toBe(false);
  });
});
