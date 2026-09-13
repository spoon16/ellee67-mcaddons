import path from "node:path";
import { bootstrap } from "../../../src/core/bootstrap.ts";
import { BOOK_ID, COMPONENT_ID, redstoneGuide } from "../../../src/features/redstone-guide/index.ts";
import type { GuideEntry } from "../../../src/features/redstone-guide/reader.js";
import { readStrictJson } from "../../../tools/lib/json.ts";
import { REPO_ROOT } from "../../../tools/lib/paths.ts";
import { type Entity, ItemStack, loadWorld, registry, startup, world } from "../../mocks/minecraft-server.ts";
import { FormCancelationReason, type QueuedResponse, ui } from "../../mocks/minecraft-server-ui.ts";

export const FEATURE_DIR = path.join(REPO_ROOT, "src", "features", "redstone-guide");
export const BP = path.join(REPO_ROOT, "behavior_packs", "elleedog67");
export const RP = path.join(REPO_ROOT, "resource_packs", "elleedog67");

export interface GuideDocument {
  version: string;
  entries: GuideEntry[];
}

/** The editable guide as it sits on disk, parsed strictly (duplicate keys fail like the engine's content log). */
export function readGuide(): GuideDocument {
  return readStrictJson(path.join(FEATURE_DIR, "guide_content.json")) as GuideDocument;
}

export const closed: QueuedResponse = { canceled: true, cancelationReason: FormCancelationReason.UserClosed };
export const busy: QueuedResponse = { canceled: true, cancelationReason: FormCancelationReason.UserBusy };
export const pick = (selection: number): QueuedResponse => ({ canceled: false, selection });

export interface ShownForm {
  titleText: string;
  bodyText: string;
  buttons: Array<{ label: unknown; icon?: string }>;
}

export function shownForms(): ShownForm[] {
  return ui.forms as ShownForm[];
}

/** Boots the add-on with only this feature, through startup and world load. */
export function boot(): void {
  bootstrap([redstoneGuide]);
  startup();
  loadWorld();
}

export function component() {
  return registry.components.get(COMPONENT_ID);
}

/** What the engine does when the player uses the book in the air. */
export function useBook(source: Entity): void {
  component()?.onUse({ source, itemStack: new ItemStack(BOOK_ID) });
}

/** What the engine does when the player uses the book on a block. */
export function useBookOn(source: Entity): void {
  component()?.onUseOn({ source, itemStack: new ItemStack(BOOK_ID) });
}

/** The plain `itemUse` after-event the feature keeps as a fallback path. */
export function fallbackUse(source: Entity, typeId = BOOK_ID): void {
  world.afterEvents.itemUse.emit({ source, itemStack: new ItemStack(typeId) });
}

export function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`Expected ${what}`);
  return value;
}
