import type {
  CommandPermissionLevel,
  CustomCommandOrigin,
  CustomCommandParamType,
  CustomCommandResult,
  CustomCommandStatus,
  Entity,
  Player,
  System,
  Vector3,
} from "@minecraft/server";
import type { CommandRegistry } from "../../core/feature.ts";
import { blockPosition, type RegionCorner } from "./geometry.ts";
import type { ProtectionStore } from "./store.ts";

export const COMMAND_NAME = "elleedog:ender_protect";
export const ACTION_ENUM = "elleedog:ender_protect_action";
export const ACTIONS = ["pos1", "pos2", "name", "list", "remove"];

/** One player's in-progress corner selection. */
export interface ProtectionSelection {
  pos1?: RegionCorner;
  pos2?: RegionCorner;
}

/** Where the command was run, captured before the callback is deferred. */
export interface CommandPosition {
  location: Vector3;
  dimension: string;
}

/** The engine objects the command needs, passed in so tests can substitute plain values. */
export interface ProtectionCommandApi {
  system: System;
  CommandPermissionLevel: typeof CommandPermissionLevel;
  CustomCommandParamType: typeof CustomCommandParamType;
  CustomCommandStatus: typeof CustomCommandStatus;
}

/** Exact requested syntax, with one additional remove action for undoing a selection.
 * Commands execute in restricted context, so the caller must defer this function.
 */
export function executeProtectionCommand(
  store: ProtectionStore,
  selections: Map<string, ProtectionSelection>,
  player: Pick<Entity, "id">,
  action: string,
  name: string | undefined,
  position: CommandPosition,
): string {
  store.ensureHealthy();
  if (!["name", "remove"].includes(action) && name !== undefined) {
    throw new Error(`${action} does not accept a name.`);
  }
  switch (action) {
    case "pos1":
    case "pos2": {
      const p: RegionCorner = { ...blockPosition(position.location), dimension: position.dimension };
      const selection = selections.get(player.id) ?? {};
      selection[action] = p;
      selections.set(player.id, selection);
      return `${action}: ${p.x}, ${p.y}, ${p.z} (${p.dimension}). Areas use X/Z and protect full height.`;
    }
    case "name": {
      const selection = selections.get(player.id) ?? {};
      const r = store.saveRegion(name, selection.pos1, selection.pos2);
      selections.delete(player.id);
      return `Saved "${r.name}": X ${r.minX}..${r.maxX}, Z ${r.minZ}..${r.maxZ}, full height (${r.dimension}).`;
    }
    case "list":
      return store.regions.length
        ? store.regions
            .map((r) => `"${r.name}": ${r.dimension}; X ${r.minX}..${r.maxX}; Z ${r.minZ}..${r.maxZ}; full height`)
            .join("\n")
        : 'No named areas yet. Use pos1, pos2, then name "My House". New player placements are tracked separately.';
    case "remove":
      store.removeRegion(name);
      return `Removed area "${name}". Individually tracked player placements remain protected.`;
    default:
      throw new Error("Use pos1, pos2, name, list, or remove.");
  }
}

export function registerProtectionCommands(
  registry: CommandRegistry,
  api: ProtectionCommandApi,
  getStore: () => ProtectionStore | undefined,
  selections: Map<string, ProtectionSelection>,
  onChanged: () => void,
): void {
  registry.registerEnum(ACTION_ENUM, ACTIONS);
  registry.registerCommand(
    {
      name: COMMAND_NAME,
      description: 'Protect builds: pos1, pos2, name "name", list; remove "name" to undo.',
      permissionLevel: api.CommandPermissionLevel.Admin,
      cheatsRequired: false,
      mandatoryParameters: [{ name: ACTION_ENUM, type: api.CustomCommandParamType.Enum }],
      optionalParameters: [{ name: "name", type: api.CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, action: string, name?: string): CustomCommandResult => {
      const entity = origin.sourceEntity;
      if (entity?.typeId !== "minecraft:player") {
        return {
          status: api.CustomCommandStatus.Failure,
          message: "Run this command as a player with Operator permission.",
        };
      }
      // An entity whose typeId is minecraft:player is a Player; the origin type does not narrow it.
      const player = entity as Player;
      // Take a snapshot now rather than selecting where the player moves next tick.
      const position: CommandPosition = { location: { ...player.location }, dimension: player.dimension.id };
      api.system.run(() => {
        try {
          const store = getStore();
          if (!store) throw new Error("Protection is not initialized; check the content log and reload the world.");
          const message = executeProtectionCommand(store, selections, player, action, name, position);
          if (action === "name" || action === "remove") onChanged();
          player.sendMessage(`[67 Ender Mod] ${message}`);
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          try {
            player.sendMessage(`[67 Ender Mod] ${text}`);
          } catch {
            /* Player disconnected. */
          }
        }
      });
      return { status: api.CustomCommandStatus.Success };
    },
  );
}
