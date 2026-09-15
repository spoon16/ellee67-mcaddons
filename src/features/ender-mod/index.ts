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
import type { FeatureDefinition } from "../../core/feature.ts";
import { type ProtectionSelection, registerProtectionCommands } from "./commands.ts";
import { GATE_PROPERTY, type Sighting, shouldAllowMovement } from "./gate.ts";
import { ProtectionStore } from "./store.ts";

const ENDERMAN = "minecraft:enderman";
const DIMENSIONS = ["overworld", "nether", "the_end"];

let store: ProtectionStore | undefined;
const selections = new Map<string, ProtectionSelection>();
const previous = new Map<string, Sighting>();
let lastWarning = -10000;

function warn(error: unknown): void {
  if (system.currentTick - lastWarning >= 200) {
    lastWarning = system.currentTick;
    console.warn(`[67 Ender Mod] ${(error as Error)?.stack ?? error}`);
  }
}

function loadedEndermen(): Entity[] {
  const found: Entity[] = [];
  for (const id of DIMENSIONS) {
    try {
      found.push(...world.getDimension(id).getEntities({ type: ENDERMAN }));
    } catch (error) {
      warn(error);
    }
  }
  return found;
}

function updateAll(): void {
  const alive = new Set<string>();
  for (const entity of loadedEndermen()) {
    try {
      alive.add(entity.id);
      const position = entity.location;
      const dimension = entity.dimension.id;
      const state = shouldAllowMovement(store, position, dimension, previous.get(entity.id), system.currentTick);
      const current = entity.getProperty(GATE_PROPERTY);
      if (typeof current !== "boolean") {
        throw new Error(
          "Enderman override is not active. Check for another behavior pack replacing minecraft:enderman.",
        );
      }
      if (current !== state.allowed) entity.setProperty(GATE_PROPERTY, state.allowed);
      previous.set(entity.id, { ...position, dimension, holdUntil: state.holdUntil });
    } catch (error) {
      try {
        entity.setProperty(GATE_PROPERTY, false);
      } catch {
        // Missing override or unloaded entity.
      }
      warn(error);
    }
  }
  for (const id of previous.keys()) if (!alive.has(id)) previous.delete(id);
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
    // Reevaluate immediately; don't wait for the next periodic scan after construction.
    updateAll();
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
    try {
      store = new ProtectionStore(world);
    } catch (error) {
      warn(error);
    }
    previous.clear();
    setEveryEnderman(false);
    ctx.on(world.afterEvents.playerPlaceBlock, onPlace);
    ctx.on(world.afterEvents.playerBreakBlock, onBreak);
    ctx.on(world.afterEvents.entitySpawn, onLoaded);
    ctx.on(world.afterEvents.entityLoad, onLoaded);
    ctx.on(world.afterEvents.playerLeave, onLeave);
    ctx.every(1, updateAll);
  },
};
