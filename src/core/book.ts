import {
  CommandPermissionLevel,
  type Entity,
  type ItemComponentRegistry,
  ItemStack,
  type Player,
  system,
  world,
} from "@minecraft/server";
import { BOOK_HOLDER_HANDLES, NAMESPACE } from "./config.ts";
import { log } from "./log.ts";
import { openManual } from "./manual.ts";

export const BOOK_ID = `${NAMESPACE}:feature_book`;
export const BOOK_COMPONENT = `${NAMESPACE}:open_feature_menu`;
export const BOOK_TITLE = "ElleeDog 67 Manual";
export const BOOK_LORE = "The ElleeDog 67 manual.";
export const NOT_ALLOWED_MESSAGE = "Only ElleeDog or an operator can turn features on or off from this book.";

export function isPlayer(entity: Entity | undefined): entity is Player {
  return entity !== undefined && entity.typeId === "minecraft:player" && entity.isValid;
}

export function normalizeHandle(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

export function isBookHolder(player: Pick<Player, "name">): boolean {
  const name = normalizeHandle(player.name);
  return BOOK_HOLDER_HANDLES.some((handle) => name.startsWith(normalizeHandle(handle)));
}

/** Anyone holding the book may read the manual; only these players see and use its switch buttons. */
export function mayUseBook(player: Pick<Player, "name" | "commandPermissionLevel">): boolean {
  return isBookHolder(player) || player.commandPermissionLevel >= CommandPermissionLevel.Admin;
}

export function hasBook(player: Player): boolean {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return false;
  for (let slot = 0; slot < container.size; slot++) {
    if (container.getItem(slot)?.typeId === BOOK_ID) return true;
  }
  return false;
}

/** Adds one book to the player's inventory. Throws with a player-readable message when it cannot. */
export function giveBook(player: Player): void {
  if (!isPlayer(player)) throw new Error("The player is no longer connected.");
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) throw new Error("Player inventory is not available.");
  if (container.emptySlotsCount < 1) throw new Error(`Inventory full. Free one slot, then run /${NAMESPACE}:book.`);
  const book = new ItemStack(BOOK_ID, 1);
  book.nameTag = BOOK_TITLE;
  book.setLore([BOOK_LORE]);
  if (container.addItem(book))
    throw new Error(`Could not add the ${BOOK_TITLE}. Free one inventory slot and try again.`);
}

/** Gives the book to a matching player who does not already carry one. Returns true when a book was given. */
export function grantBookIfEntitled(player: Player): boolean {
  if (!isPlayer(player) || !isBookHolder(player) || hasBook(player)) return false;
  try {
    giveBook(player);
    return true;
  } catch (error) {
    log.warn(`Could not give ${player.name} the ${BOOK_TITLE}: ${log.describe(error)}`);
    return false;
  }
}

/** Registers the book's item component. Runs during `system.beforeEvents.startup`. */
export function registerBook(registry: ItemComponentRegistry): void {
  const open = (source: Entity | undefined) => {
    if (isPlayer(source)) system.run(() => void openManual(source));
  };
  registry.registerCustomComponent(BOOK_COMPONENT, {
    onUse: (event) => open(event.source),
    onUseOn: (event) => open(event.source),
  });
}

/** Hands the book to entitled players on join and to anyone already online. Call from `worldLoad`. */
export function installBookGrants(): void {
  world.afterEvents.playerSpawn.subscribe((event) => {
    if (event.initialSpawn) system.run(() => void grantBookIfEntitled(event.player));
  });
  for (const player of world.getAllPlayers()) grantBookIfEntitled(player);
}
