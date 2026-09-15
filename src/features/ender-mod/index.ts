import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  type Entity,
  type PlayerBreakBlockAfterEvent,
  type PlayerLeaveAfterEvent,
  type PlayerPlaceBlockAfterEvent,
  system,
  world,
} from "@minecraft/server";
import { loadedDimensions } from "../../core/dimensions.ts";
import type { FeatureDefinition } from "../../core/feature.ts";
import { featureLog } from "../../core/log.ts";
import { entityId } from "../../core/vanilla.ts";
import { type ProtectionSelection, registerProtectionCommands } from "./commands.ts";
import { GATE_PROPERTY, type Sighting, shouldAllowMovement } from "./gate.ts";
import { ProtectionStore } from "./store.ts";

const ENDERMAN = entityId("minecraft:enderman");
const WARN_INTERVAL = 200;

const log = featureLog("Ender Mod");
let store: ProtectionStore | undefined;
const selections = new Map<string, ProtectionSelection>();
const previous = new Map<string, Sighting>();

function warn(error: unknown): void {
  log.throttled("scan", system.currentTick, WARN_INTERVAL, (error as Error)?.stack ?? String(error));
}

function loadedEndermen(): Entity[] {
  const found: Entity[] = [];
  for (const dimension of loadedDimensions(world).values()) {
    try {
      found.push(...dimension.getEntities({ type: ENDERMAN }));
    } catch (error) {
      warn(error);
    }
  }
  return found;
}

/** The floored block an enderman stands in, which is all the protection query depends on. */
function blockKey(position: { x: number; y: number; z: number }, dimension: string): string {
  return `${dimension}:${Math.floor(position.x)}:${Math.floor(position.y)}:${Math.floor(position.z)}`;
}

/**
 * Re-evaluates one enderman. The protection query reads only the enderman's block and the store, so an enderman
 * still in the same block past its hold, with the store unchanged, has the answer it had last tick and is skipped
 * unless `force`. A step inside one block cannot register as the 1.5-block jump the gate watches for, so skipping
 * the check there loses nothing.
 */
function evaluate(entity: Entity, tick: number, generation: number, force: boolean): void {
  try {
    const position = entity.location;
    const dimension = entity.dimension.id;
    const seen = previous.get(entity.id);
    const key = blockKey(position, dimension);
    if (!force && seen && seen.blockKey === key && seen.generation === generation && tick > seen.holdUntil) {
      seen.x = position.x;
      seen.y = position.y;
      seen.z = position.z;
      return;
    }
    const state = shouldAllowMovement(store, position, dimension, seen, tick);
    const current = entity.getProperty(GATE_PROPERTY);
    if (typeof current !== "boolean") {
      throw new Error("Enderman override is not active. Check for another behavior pack replacing minecraft:enderman.");
    }
    if (current !== state.allowed) entity.setProperty(GATE_PROPERTY, state.allowed);
    previous.set(entity.id, {
      ...position,
      dimension,
      holdUntil: state.holdUntil,
      blockKey: key,
      // A held enderman is re-evaluated when the hold ends, whatever the store did meanwhile.
      generation: tick > state.holdUntil ? generation : -1,
    });
  } catch (error) {
    try {
      entity.setProperty(GATE_PROPERTY, false);
    } catch {
      // Missing override or unloaded entity.
    }
    warn(error);
  }
}

function updateAll(): void {
  const alive = new Set<string>();
  const tick = system.currentTick;
  const generation = store?.generation ?? -1;
  for (const entity of loadedEndermen()) {
    alive.add(entity.id);
    evaluate(entity, tick, generation, false);
  }
  for (const id of previous.keys()) if (!alive.has(id)) previous.delete(id);
}

/** After a placement, only the endermen whose protection box can hold the block need a fresh answer this tick. */
function updateNear(dimensionId: string, block: { x: number; y: number; z: number }): void {
  const tick = system.currentTick;
  const generation = store?.generation ?? -1;
  let endermen: Entity[];
  try {
    endermen = world.getDimension(dimensionId).getEntities({ type: ENDERMAN });
  } catch (error) {
    warn(error);
    return;
  }
  for (const entity of endermen) {
    const p = entity.location;
    // protectionBox spans x/z ±4 and y -2..+5 around the enderman's block; one block of slack covers flooring.
    if (Math.abs(p.x - block.x) > 5 || Math.abs(p.z - block.z) > 5 || block.y < p.y - 3 || block.y > p.y + 6) continue;
    evaluate(entity, tick, generation, true);
  }
}

function setEveryEnderman(mayMoveBlocks: boolean): void {
  for (const entity of loadedEndermen()) {
    try {
      entity.setProperty(GATE_PROPERTY, mayMoveBlocks);
    } catch (error) {
      warn(error);
    }
  }
}

function onPlace(event: PlayerPlaceBlockAfterEvent): void {
  try {
    if (!store) throw new Error("Block placed before protection storage initialized.");
    store.setPlaced(event.block.dimension.id, event.block.location, true);
    // Deny the endermen next to the new block now rather than a tick later; everyone else waits for the scan.
    updateNear(event.block.dimension.id, event.block.location);
  } catch (error) {
    warn(error);
  }
}

function onBreak(event: PlayerBreakBlockAfterEvent): void {
  try {
    if (store) store.setPlaced(event.block.dimension.id, event.block.location, false);
  } catch (error) {
    warn(error);
  }
}

function onLoaded(event: { entity: Entity }): void {
  const entity = event.entity;
  if (entity.typeId !== ENDERMAN) return;
  try {
    entity.setProperty(GATE_PROPERTY, false);
    previous.delete(entity.id);
  } catch (error) {
    warn(error);
  }
}

function onLeave(event: PlayerLeaveAfterEvent): void {
  selections.delete(event.playerId);
}

export const enderMod: FeatureDefinition = {
  id: "ender-mod",
  title: "Ender Mod",
  register({ commands }) {
    registerProtectionCommands(
      commands,
      { system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus },
      () => store,
      selections,
      updateAll,
    );
  },
  start(ctx) {
    log.reset();
    selections.clear();
    previous.clear();
    try {
      store = new ProtectionStore(world);
    } catch (error) {
      store = undefined;
      warn(error);
    }
    setEveryEnderman(false);
    ctx.on(world.afterEvents.playerPlaceBlock, onPlace);
    ctx.on(world.afterEvents.playerBreakBlock, onBreak);
    ctx.on(world.afterEvents.entitySpawn, onLoaded);
    ctx.on(world.afterEvents.entityLoad, onLoaded);
    ctx.on(world.afterEvents.playerLeave, onLeave);
    ctx.every(1, updateAll);
  },
};
