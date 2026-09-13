import {
  CommandPermissionLevel,
  type Entity,
  type ItemComponentRegistry,
  ItemStack,
  type Player,
  system,
  world,
} from "@minecraft/server";
import { FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { BOOK_HOLDER_HANDLES, NAMESPACE } from "./config.ts";
import { type FeatureDefinition, isEnabled, listFeatures, setEnabled } from "./features.ts";
import { log } from "./log.ts";

export const BOOK_ID = `${NAMESPACE}:feature_book`;
export const BOOK_COMPONENT = `${NAMESPACE}:open_feature_menu`;
export const BOOK_TITLE = "ElleeDog 67 Book";
export const MENU_TITLE = "ElleeDog 67 Features";
export const NOT_ALLOWED_MESSAGE = "Only ElleeDog or an operator can use this book.";

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
  book.setLore(["Turn ElleeDog 67 features on or off."]);
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

export function toggleLabel(feature: FeatureDefinition): string {
  return feature.disabledNote ? `${feature.title} (${feature.summary})` : feature.title;
}

const openMenus = new Set<string>();

async function showWithRetry(form: ModalFormData, player: Player) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!isPlayer(player)) return undefined;
    const response = await form.show(player);
    if (response.canceled && response.cancelationReason === FormCancelationReason.UserBusy && attempt < 2) {
      await new Promise<void>((resolve) => system.runTimeout(resolve, 10));
      continue;
    }
    return response;
  }
  return undefined;
}

/** Opens the toggle menu. Resolves to true when the player submitted the form. */
export async function openFeatureMenu(player: Player): Promise<boolean> {
  if (!isPlayer(player) || openMenus.has(player.id)) return false;
  if (!mayUseBook(player)) {
    player.sendMessage(NOT_ALLOWED_MESSAGE);
    return false;
  }
  openMenus.add(player.id);
  try {
    const features = listFeatures();
    const form = new ModalFormData().title(MENU_TITLE);
    for (const feature of features) form.toggle(toggleLabel(feature), { defaultValue: isEnabled(feature.id) });
    form.submitButton("Apply");
    const response = await showWithRetry(form, player);
    if (!response || response.canceled || !response.formValues || !isPlayer(player)) return false;
    const values = response.formValues;
    const wanted = features.map((feature, index) => ({ feature, enabled: Boolean(values[index]) }));
    system.run(() => applyMenu(player, wanted));
    return true;
  } catch (error) {
    log.warn(`${BOOK_TITLE} menu failed for ${player.name}: ${log.describe(error)}`);
    return false;
  } finally {
    openMenus.delete(player.id);
  }
}

function applyMenu(player: Player, wanted: Array<{ feature: FeatureDefinition; enabled: boolean }>): void {
  const enabled: string[] = [];
  const disabled: string[] = [];
  const failed: string[] = [];
  for (const { feature, enabled: shouldEnable } of wanted) {
    if (isEnabled(feature.id) === shouldEnable) continue;
    const result = setEnabled(feature.id, shouldEnable);
    if (result.error) failed.push(`${feature.title} (${log.describe(result.error)})`);
    else (shouldEnable ? enabled : disabled).push(feature.title);
  }
  const parts: string[] = [];
  if (enabled.length) parts.push(`Enabled: ${enabled.join(", ")}.`);
  if (disabled.length) parts.push(`Disabled: ${disabled.join(", ")}.`);
  if (failed.length) parts.push(`Failed: ${failed.join(", ")}. See the content log.`);
  if (!parts.length) parts.push("No changes.");
  if (isPlayer(player)) player.sendMessage(parts.join(" "));
}

/** Registers the book's item component. Runs during `system.beforeEvents.startup`. */
export function registerBook(registry: ItemComponentRegistry): void {
  const open = (source: Entity | undefined) => {
    if (isPlayer(source)) system.run(() => void openFeatureMenu(source));
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
