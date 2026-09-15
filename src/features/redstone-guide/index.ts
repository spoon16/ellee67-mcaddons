import { type Entity, type Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import type { FeatureDefinition } from "../../core/feature.ts";
import { log } from "../../core/log.ts";
import { type Bookmark, HOME, normalizeBookmark, type Route, type Screen, screenFor } from "./reader.ts";

export const BOOK_ID = "elleedog_redstone:guide_book";
export const COMPONENT_ID = "elleedog_redstone:open_guide";
export const BOOKMARK_KEY = "elleedog_redstone:bookmark_v1";
/** A busy UI is retried this many times, `BUSY_RETRY_TICKS` apart; a deliberate close is never retried. */
export const BUSY_ATTEMPTS = 10;
export const BUSY_RETRY_TICKS = 4;
/** Use events within this many ticks of an accepted one are ignored (touch double-activation, fallback duplicates). */
export const USE_COOLDOWN_TICKS = 6;

/** Open reading sessions by player id; the token tells a reader whether it still owns the session. Exported for tests. */
export const sessions = new Map<string, object>();
/** Tick of each player's last accepted use. Exported for tests. */
export const lastUse = new Map<string, number>();

const wait = (ticks: number) => new Promise<void>((resolve) => system.runTimeout(resolve, ticks));

function isPlayer(entity: Entity | undefined): entity is Player {
  return entity !== undefined && entity.typeId === "minecraft:player";
}

function message(player: Player, text: string): void {
  try {
    player.sendMessage(`§6[Redstone Guide]§r ${text}`);
  } catch {
    // The player may have disconnected.
  }
}

function loadBookmark(player: Player): Bookmark | null {
  try {
    const raw = player.getDynamicProperty(BOOKMARK_KEY);
    return typeof raw === "string" ? normalizeBookmark(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveBookmark(player: Player, bookmark: Bookmark): void {
  try {
    player.setDynamicProperty(BOOKMARK_KEY, JSON.stringify(bookmark));
  } catch {
    // Reading still works when persistence is unavailable.
  }
}

/** Shows one screen and resolves to the chosen button index, or null when the player closed it or gave up. */
async function showScreen(
  player: Player,
  screen: Screen,
  token: object,
  onPresented: () => void,
): Promise<number | null> {
  for (let attempt = 0; attempt < BUSY_ATTEMPTS; attempt++) {
    if (sessions.get(player.id) !== token) return null;
    const form = new ActionFormData().title(screen.title).body(screen.body);
    for (const button of screen.buttons) {
      if (button.icon) form.button(button.label, button.icon);
      else form.button(button.label);
    }
    const result = await form.show(player);
    if (sessions.get(player.id) !== token) return null;
    // UserBusy means the form was never displayed; do not persist an unseen page.
    if (!result.canceled || result.cancelationReason !== FormCancelationReason.UserBusy) onPresented();
    if (!result.canceled) {
      const selection = result.selection;
      return typeof selection === "number" && Number.isInteger(selection) ? selection : null;
    }
    if (result.cancelationReason !== FormCancelationReason.UserBusy) return null;
    if (attempt < BUSY_ATTEMPTS - 1) await wait(BUSY_RETRY_TICKS);
  }
  message(player, "Close the other screen, then use Read Guide again.");
  return null;
}

async function readBook(player: Player, token: object): Promise<void> {
  let route: Route | null = HOME;
  let bookmark = loadBookmark(player);
  while (route && sessions.get(player.id) === token) {
    const screen = screenFor(route, bookmark);
    const selection = await showScreen(player, screen, token, () => {
      // Remember displayed pages, including a page the player deliberately closes.
      if (screen.bookmark) {
        bookmark = screen.bookmark;
        saveBookmark(player, bookmark);
      }
    });
    const button = selection === null ? undefined : screen.buttons[selection];
    if (!button) return;
    route = button.route;
    // Yield one tick between forms so touch releases do not double-activate a page.
    if (route) await wait(1);
  }
}

function requestOpen(source: Entity | undefined): void {
  if (!isPlayer(source)) return;
  const player = source;
  const id = player.id;
  if (sessions.has(id)) return;
  const now = system.currentTick;
  if (now - (lastUse.get(id) ?? -100) < USE_COOLDOWN_TICKS) return;
  lastUse.set(id, now);
  const token = {};
  sessions.set(id, token);
  // Item component callbacks may run in read-only mode; the form opens on the next tick.
  system.run(() => {
    if (sessions.get(id) !== token) return;
    readBook(player, token)
      .catch((error) => {
        log.warn(`Redstone Guide: reader failed for ${player.name}: ${log.describe(error)}`);
        message(player, "Could not open the guide. Close other screens and try again.");
      })
      .finally(() => {
        if (sessions.get(id) === token) sessions.delete(id);
      });
  });
}

/**
 * A craftable, reusable guide book (1 redstone dust + 1 leather) read through native action forms: component
 * reference, crafting recipes, three builds, and a per-player bookmark. The item and recipe are data; this feature
 * owns the reader.
 */
export const redstoneGuide: FeatureDefinition = {
  id: "redstone-guide",
  title: "Redstone Guide",
  register({ items }) {
    items.registerCustomComponent(COMPONENT_ID, {
      onUse: (event) => requestOpen(event.source),
      onUseOn: (event) => requestOpen(event.source),
    });
  },
  start(ctx) {
    // The plain item-use event is kept as a fallback for the same book; the session guard removes duplicates.
    ctx.on(world.afterEvents.itemUse, (event) => {
      if (event.itemStack?.typeId === BOOK_ID) requestOpen(event.source);
    });
    ctx.on(world.afterEvents.playerLeave, (event) => {
      sessions.delete(event.playerId);
      lastUse.delete(event.playerId);
    });
  },
};
