import { type Player, system } from "@minecraft/server";
import { ActionFormData, type ActionFormResponse, FormCancelationReason } from "@minecraft/server-ui";
import { isPlayer, mayUseBook, NOT_ALLOWED_MESSAGE } from "./book.ts";
import { NAMESPACE } from "./config.ts";
import {
  type FeatureDefinition,
  type FeatureId,
  featureState,
  getFeature,
  isEnabled,
  listFeatures,
  packHint,
  setEnabled,
} from "./features.ts";
import { log } from "./log.ts";
import { type PackInfo, packs, packTitle } from "./packs.ts";

export const MANUAL_TITLE = "ElleeDog 67";
export const MANUAL_INTRO =
  "The ElleeDog 67 manual: what each feature does, how to turn it on or off, and how the packs fit together.";
export const FEATURES_HEADER = "Features";
export const SETUP_TITLE = "Setup and packs";
export const COMMANDS_TITLE = "Commands";
export const BACK_BUTTON = "Back";

type Route =
  | { page: "home" }
  | { page: "feature"; id: FeatureId }
  | { page: "setup" }
  | { page: "commands" }
  | { page: "close" };

type Handler = () => Route | Promise<Route>;

/** A form plus one handler per button, so `response.selection` (a button index) picks the right handler. */
class Page {
  readonly form = new ActionFormData();
  readonly handlers: Handler[] = [];
  button(label: string, handler: Handler): this {
    this.form.button(label);
    this.handlers.push(handler);
    return this;
  }
}

const openManuals = new Set<string>();

/** Shows the manual until the player closes it. Anyone holding the book may read; switches need `mayUseBook`. */
export async function openManual(player: Player): Promise<void> {
  if (!isPlayer(player) || openManuals.has(player.id)) return;
  openManuals.add(player.id);
  try {
    let route: Route = { page: "home" };
    while (route.page !== "close" && isPlayer(player)) {
      const page = buildPage(route, player);
      const response = await showWithRetry(page.form, player);
      if (!response || response.canceled || response.selection === undefined) return;
      const handler = page.handlers[response.selection];
      if (!handler) return;
      route = await handler();
    }
  } catch (error) {
    log.warn(`manual failed for ${player.name}: ${log.describe(error)}`);
  } finally {
    openManuals.delete(player.id);
  }
}

async function showWithRetry(form: ActionFormData, player: Player): Promise<ActionFormResponse | undefined> {
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

function buildPage(route: Route, player: Player): Page {
  switch (route.page) {
    case "feature":
      return featurePage(route.id, player);
    case "setup":
      return setupPage();
    case "commands":
      return commandsPage();
    default:
      return homePage();
  }
}

export function stateMarker(id: FeatureId): string {
  return `[${featureState(id).toUpperCase()}]`;
}

function homePage(): Page {
  const page = new Page();
  page.form.title(MANUAL_TITLE).body(MANUAL_INTRO).header(FEATURES_HEADER);
  for (const feature of listFeatures()) {
    page.button(`${stateMarker(feature.id)} ${feature.title}`, () => ({ page: "feature", id: feature.id }));
  }
  page.button(SETUP_TITLE, () => ({ page: "setup" }));
  page.button(COMMANDS_TITLE, () => ({ page: "commands" }));
  return page;
}

export function stateSentence(feature: FeatureDefinition): string {
  switch (featureState(feature.id)) {
    case "on":
      return `${feature.title} is on.`;
    case "off":
      return `${feature.title} is off.`;
    case "active":
      return `${feature.title} is active.`;
    default:
      return `${feature.title} is off because its packs are not active in this world.`;
  }
}

function switchHowTo(feature: FeatureDefinition, maySwitch: boolean): string {
  const commands = `/${NAMESPACE}:enable ${feature.id} and /${NAMESPACE}:disable ${feature.id}`;
  if (maySwitch) return `Turn it on or off with the button below, or with ${commands} (operators).`;
  return `ElleeDog or an operator can turn it on or off from this book, or with ${commands}.`;
}

export function featurePageBody(feature: FeatureDefinition, maySwitch: boolean): string {
  const howTo =
    feature.kind === "pack"
      ? `${packHint(feature.id, true)}\n${packHint(feature.id, false)}`
      : switchHowTo(feature, maySwitch);
  return [feature.manual.about, `Now: ${stateSentence(feature)}`, howTo, `While off: ${feature.manual.whileOff}`].join(
    "\n\n",
  );
}

function featurePage(id: FeatureId, player: Player): Page {
  const feature = getFeature(id);
  if (!feature) return homePage();
  const maySwitch = feature.kind === "switch" && mayUseBook(player);
  const page = new Page();
  page.form.title(feature.title).body(featurePageBody(feature, maySwitch));
  if (maySwitch) {
    const enabled = isEnabled(id);
    page.button(enabled ? "Turn off" : "Turn on", () => switchFeature(player, feature, !enabled));
  }
  page.button(BACK_BUTTON, () => ({ page: "home" }));
  return page;
}

/** Runs the switch on the next tick (form continuations are not writable) and reopens the page with the new state. */
function switchFeature(player: Player, feature: FeatureDefinition, enabled: boolean): Promise<Route> {
  return new Promise((resolve) => {
    system.run(() => {
      if (!mayUseBook(player)) {
        if (isPlayer(player)) player.sendMessage(NOT_ALLOWED_MESSAGE);
        resolve({ page: "feature", id: feature.id });
        return;
      }
      const result = setEnabled(feature.id, enabled);
      const verb = enabled ? "enabled" : "disabled";
      const text = result.error
        ? `${feature.title} could not be ${enabled ? "started" : "stopped"}: ${log.describe(result.error)}. See the content log.`
        : result.changed
          ? `${feature.title} ${verb}.`
          : `${feature.title} was already ${verb}.`;
      if (isPlayer(player)) player.sendMessage(text);
      resolve({ page: "feature", id: feature.id });
    });
  });
}

function packSection(pack: PackInfo): string {
  return `${pack.kind === "resources" ? "Resource Packs" : "Behavior Packs"}: ${pack.title}\n${pack.description}`;
}

export function setupRules(): string[] {
  return [
    `Activating any other ElleeDog 67 behavior pack adds its resource pack, when it has one, and "${packTitle("elleedog67")}" automatically.`,
    "Pets and Rbow Ore can be used in any combination.",
    `Keep "${packTitle("pets-resources")}" above "${packTitle("rbow-ore-resources")}" in the resource pack list.`,
    "Any other pack that replaces the player or Endermen goes below the ElleeDog 67 packs, or is removed.",
    "To update, import the newer version and confirm the newer pack is the active one. The game only replaces a pack when the version is higher.",
  ];
}

export function setupPageBody(): string {
  return [...packs.map(packSection), setupRules().join("\n\n")].join("\n\n");
}

function setupPage(): Page {
  const page = new Page();
  page.form.title(SETUP_TITLE).body(setupPageBody());
  page.button(BACK_BUTTON, () => ({ page: "home" }));
  return page;
}

export function coreCommandLines(): string[] {
  return [
    `/${NAMESPACE}:features (anyone)`,
    `/${NAMESPACE}:enable <feature> and /${NAMESPACE}:disable <feature> (operators, switch features only)`,
    `/${NAMESPACE}:book (operators)`,
  ];
}

export function commandsPageBody(): string {
  const sections = [`${MANUAL_TITLE}\n${coreCommandLines().join("\n")}`];
  for (const feature of listFeatures()) {
    const commands = feature.manual.commands;
    if (commands?.length) sections.push(`${feature.title}\n${commands.join("\n")}`);
  }
  return sections.join("\n\n");
}

function commandsPage(): Page {
  const page = new Page();
  page.form.title(COMMANDS_TITLE).body(commandsPageBody());
  page.button(BACK_BUTTON, () => ({ page: "home" }));
  return page;
}
