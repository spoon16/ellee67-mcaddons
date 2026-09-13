// Ports the upstream 67 Creeper Mod handler tests. The handler takes its engine objects by injection, so these
// tests build their own tiny fixtures instead of the shared engine mock; the assertions are the upstream ones.
import { beforeEach, describe, expect, it } from "vitest";
import { blastDamage, createCreeperHandler, exposureAt } from "../../../src/features/creeper-mod/blast.ts";
import { engine, reset } from "../../mocks/minecraft-server.ts";

const GameMode = { Survival: "Survival", Adventure: "Adventure", Creative: "Creative", Spectator: "Spectator" };
const EntityDamageCause = { entityExplosion: "entityExplosion" };

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface FakePlayer {
  id: string;
  typeId: string;
  isValid: boolean;
  dimension: { id: string };
  location: Vector3;
  mode: string;
  getGameMode(): string;
  getHeadLocation(): Vector3;
  applyDamage: (amount: number, options: { cause: string }) => boolean;
  applyKnockback: (horizontal: { x: number; z: number }, vertical: number) => void;
  hits: Array<[number, { cause: string }]>;
  knocks: Array<[{ x: number; z: number }, number]>;
}

function fixture({ charged = false, difficulty = "Normal", blocked = false } = {}) {
  const queue: Array<() => void> = [];
  const warnings: string[] = [];
  const effects: Array<[string, string, Vector3]> = [];
  const players: FakePlayer[] = [];
  const dimension = {
    id: "minecraft:overworld",
    getPlayers: () => players,
    getEntities: () => expect.unreachable("Non-player entities must never be queried as blast targets"),
    getBlockFromRay: () => (blocked ? { block: {} } : undefined),
    spawnParticle: (id: string, position: Vector3) => effects.push(["particle", id, position]),
    playSound: (id: string, position: Vector3) => effects.push(["sound", id, position]),
    createExplosion: () => expect.unreachable("Replacement must not create a destructive engine explosion"),
  };
  let removes = 0;
  const source = {
    id: "creeper-1",
    typeId: "minecraft:creeper",
    isValid: true,
    dimension,
    location: { x: 0, y: 65, z: 0 },
    getComponent: (id: string) => (charged && id === "minecraft:is_charged" ? {} : undefined),
    remove: () => {
      removes++;
      source.isValid = false;
    },
    kill: () => expect.unreachable("Detonation must not use kill()"),
  };
  const system = { currentTick: 1, run: (callback: () => void) => queue.push(callback) };
  const world = { getDifficulty: () => difficulty };
  const event: { source: unknown; cancel: boolean } = { source, cancel: false };
  const handler = createCreeperHandler(
    engine({ world, system, GameMode, EntityDamageCause, warn: (message: string) => warnings.push(message) }),
  ) as (event: unknown) => void;
  function addPlayer(mode = GameMode.Survival, x = 1): FakePlayer {
    const hits: FakePlayer["hits"] = [];
    const knocks: FakePlayer["knocks"] = [];
    const player: FakePlayer = {
      id: `p${players.length}`,
      typeId: "minecraft:player",
      isValid: true,
      dimension,
      location: { x, y: 65, z: 0 },
      mode,
      getGameMode() {
        return this.mode;
      },
      getHeadLocation() {
        return { ...this.location, y: this.location.y + 1.62 };
      },
      applyDamage: (amount, options) => {
        hits.push([amount, options]);
        return true;
      },
      applyKnockback: (horizontal, vertical) => {
        knocks.push([horizontal, vertical]);
      },
      hits,
      knocks,
    };
    players.push(player);
    return player;
  }
  function flush() {
    for (const callback of queue.splice(0)) callback();
  }
  return {
    queue,
    warnings,
    effects,
    players,
    source,
    dimension,
    event,
    handler,
    system,
    addPlayer,
    flush,
    removes: () => removes,
  };
}

beforeEach(() => reset());

describe("creeper handler", () => {
  for (const cause of [undefined, "minecraft:tnt", "minecraft:end_crystal", "other:creeper"]) {
    it(`ignores non-vanilla-creeper source ${cause}`, () => {
      const f = fixture();
      f.event.source = cause ? { typeId: cause } : undefined;
      f.handler(f.event);
      expect(f.event.cancel).toBe(false);
      expect(f.queue.length).toBe(0);
    });
  }

  it("cancels the entire native explosion immediately; mutations are deferred", () => {
    const f = fixture();
    const p = f.addPlayer();
    f.handler(f.event);
    expect(f.event.cancel).toBe(true);
    expect(p.hits.length).toBe(0);
    expect(f.removes()).toBe(0);
    f.flush();
    expect(p.hits.length).toBe(1);
    expect(f.removes()).toBe(1);
  });

  it("only Survival and Adventure players receive damage and knockback", () => {
    const f = fixture();
    const s = f.addPlayer();
    const a = f.addPlayer(GameMode.Adventure);
    const c = f.addPlayer(GameMode.Creative);
    const v = f.addPlayer(GameMode.Spectator);
    f.handler(f.event);
    f.flush();
    for (const p of [s, a]) {
      expect(p.hits.length).toBe(1);
      expect(p.knocks.length).toBe(1);
      expect(p.hits[0]?.[1].cause).toBe("entityExplosion");
    }
    for (const p of [c, v]) {
      expect(p.hits.length).toBe(0);
      expect(p.knocks.length).toBe(0);
    }
  });

  it("fully covered players take no replacement damage", () => {
    const f = fixture({ blocked: true });
    const p = f.addPlayer();
    f.handler(f.event);
    f.flush();
    expect(p.hits.length).toBe(0);
  });

  it("distant players are unharmed", () => {
    const f = fixture();
    const p = f.addPlayer(GameMode.Survival, 20);
    f.handler(f.event);
    f.flush();
    expect(p.hits.length).toBe(0);
  });

  it("charged blast reaches farther than an ordinary one", () => {
    const a = fixture();
    const b = fixture({ charged: true });
    const p = a.addPlayer(GameMode.Survival, 8);
    const q = b.addPlayer(GameMode.Survival, 8);
    a.handler(a.event);
    b.handler(b.event);
    a.flush();
    b.flush();
    expect(p.hits.length).toBe(0);
    expect(q.hits.length).toBe(1);
  });

  it("duplicate events for a detonator do not double damage", () => {
    const f = fixture();
    const p = f.addPlayer();
    f.handler(f.event);
    f.handler(f.event);
    f.flush();
    expect(p.hits.length).toBe(1);
    expect(f.removes()).toBe(1);
  });

  it("cleanup tolerates a creeper already removed by the engine", () => {
    const f = fixture();
    const p = f.addPlayer();
    f.handler(f.event);
    f.source.isValid = false;
    f.flush();
    expect(p.hits.length).toBe(1);
    expect(f.removes()).toBe(0);
  });

  it("does not damage a player who switches dimensions before deferred application", () => {
    const f = fixture();
    const p = f.addPlayer();
    f.handler(f.event);
    p.dimension = { id: "minecraft:the_end" };
    f.flush();
    expect(p.hits.length).toBe(0);
  });

  it("does not damage a player who switches to Creative before application", () => {
    const f = fixture();
    const p = f.addPlayer();
    f.handler(f.event);
    p.mode = GameMode.Creative;
    f.flush();
    expect(p.hits.length).toBe(0);
  });

  it("particle failures do not prevent player damage", () => {
    const f = fixture();
    const p = f.addPlayer();
    f.dimension.spawnParticle = () => {
      throw Error("missing particle");
    };
    f.handler(f.event);
    f.flush();
    expect(p.hits.length).toBe(1);
    expect(f.warnings.length).toBe(1);
  });

  it("no knockback is applied after a rejected damage application", () => {
    const f = fixture();
    const p = f.addPlayer();
    p.applyDamage = () => false;
    f.handler(f.event);
    f.flush();
    expect(p.knocks.length).toBe(0);
  });

  it("sampling failure keeps native explosion cancelled and still removes detonator", () => {
    const f = fixture();
    f.source.getComponent = () => {
      throw Error("test");
    };
    f.handler(f.event);
    f.flush();
    expect(f.event.cancel).toBe(true);
    expect(f.removes()).toBe(1);
  });
});

describe("blastDamage", () => {
  for (const [power, distance, exposure] of [
    [0, 0, 1],
    [3, -1, 1],
    [3, 6, 1],
    [3, 1, 0],
    [Number.NaN, 1, 1],
    [3, Number.POSITIVE_INFINITY, 1],
  ] as const) {
    it(`invalid or zero-impact damage is zero: ${power}/${distance}/${exposure}`, () => {
      expect(blastDamage(power, distance, exposure)).toBe(0);
    });
  }

  it("difficulty scaling and distance falloff", () => {
    expect(blastDamage(3, 0, 1, "Peaceful")).toBe(0);
    expect(blastDamage(3, 0, 1, "Easy") < blastDamage(3, 0, 1, "Normal")).toBe(true);
    expect(blastDamage(3, 0, 1, "Hard") > blastDamage(3, 0, 1, "Normal")).toBe(true);
    expect(blastDamage(3, 1, 1) > blastDamage(3, 4, 1)).toBe(true);
    expect(blastDamage(6, 1, 1) > blastDamage(3, 1, 1)).toBe(true);
  });

  it("partial exposure decreases damage", () => {
    expect(blastDamage(3, 1, 0.5) < blastDamage(3, 1, 1)).toBe(true);
  });
});

describe("exposureAt", () => {
  it("exposure samples all twelve body rays", () => {
    let n = 0;
    const dimension = { getBlockFromRay: () => (++n <= 6 ? undefined : { block: {} }) };
    expect(exposureAt(engine(dimension), { x: 0, y: 65, z: 0 }, { x: 2, y: 65, z: 0 }, 66.62)).toBe(0.5);
    expect(n).toBe(12);
  });

  it("unreadable exposure rays count as cover", () => {
    const dimension = {
      getBlockFromRay: () => {
        throw Error("unloaded");
      },
    };
    expect(exposureAt(engine(dimension), { x: 0, y: 65, z: 0 }, { x: 2, y: 65, z: 0 }, 66.62)).toBe(0);
  });
});
