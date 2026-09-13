import { blockPosition } from "./geometry.js";

export const COMMAND_NAME = "elleedog:ender_protect";
export const ACTION_ENUM = "elleedog:ender_protect_action";
export const ACTIONS = ["pos1", "pos2", "name", "list", "remove"];

/** Exact requested syntax, with one additional remove action for undoing a selection.
 * Commands execute in restricted context, so the caller must defer this function.
 */
export function executeProtectionCommand(store, selections, player, action, name, position) {
  store.ensureHealthy();
  if (!["name", "remove"].includes(action) && name !== undefined) {
    throw new Error(`${action} does not accept a name.`);
  }
  switch (action) {
    case "pos1":
    case "pos2": {
      const p = { ...blockPosition(position.location), dimension: position.dimension };
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
      return store.regions.length ? store.regions.map(r =>
        `"${r.name}" — ${r.dimension}; X ${r.minX}..${r.maxX}; Z ${r.minZ}..${r.maxZ}; full height`).join("\n") :
        'No named areas yet. Use pos1, pos2, then name "My House". New player placements are tracked separately.';
    case "remove":
      store.removeRegion(name);
      return `Removed area "${name}". Individually tracked player placements remain protected.`;
    default: throw new Error("Use pos1, pos2, name, list, or remove.");
  }
}

export function registerProtectionCommands(registry, api, getStore, selections, onChanged) {
  registry.registerEnum(ACTION_ENUM, ACTIONS);
  registry.registerCommand({
    name: COMMAND_NAME,
    description: 'Protect builds: pos1, pos2, name "name", list; remove "name" to undo.',
    permissionLevel: api.CommandPermissionLevel.Admin,
    cheatsRequired: false,
    mandatoryParameters: [{ name: ACTION_ENUM, type: api.CustomCommandParamType.Enum }],
    optionalParameters: [{ name: "name", type: api.CustomCommandParamType.String }],
  }, (origin, action, name) => {
    const player = origin.sourceEntity;
    if (!player || player.typeId !== "minecraft:player") {
      return { status: api.CustomCommandStatus.Failure, message: "Run this command as a player with Operator permission." };
    }
    // Take a snapshot now rather than selecting where the player moves next tick.
    const position = { location: { ...player.location }, dimension: player.dimension.id };
    api.system.run(() => {
      try {
        const store = getStore();
        if (!store) throw new Error("Protection is not initialized; check the content log and reload the world.");
        const message = executeProtectionCommand(store, selections, player, action, name, position);
        if (action === "name" || action === "remove") onChanged();
        player.sendMessage(`[67 Ender Mod] ${message}`);
      } catch (error) {
        try { player.sendMessage(`[67 Ender Mod] ${error.message ?? error}`); } catch { /* Player disconnected. */ }
      }
    });
    return { status: api.CustomCommandStatus.Success };
  });
}
