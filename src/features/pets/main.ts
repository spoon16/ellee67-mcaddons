import {
  CommandPermissionLevel,
  type CustomCommandParameter,
  CustomCommandParamType,
  CustomCommandStatus,
  EquipmentSlot,
  type ItemComponentUseEvent,
  type ItemComponentUseOnEvent,
  type Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import type { CommandCallback, GatedCommandRegistry, GatedItemComponentRegistry } from "../../core/commands.ts";
import type { FeatureContext } from "../../core/subscriptions.ts";
import { restoreAppearance, transitionForm } from "./appearance.ts";
import { CATALOG_HASH, MODEL_BY_ID, PETS, RELEASE_VERSION } from "./catalog.generated.ts";
import {
  BUILD,
  captureInventory,
  compareInventory,
  createSessionGuard,
  DEBUG_PROPERTY,
  FORM_PROPERTY,
  formLabel,
  isPlayer,
  LEGACY_SNAPSHOT,
  needsPreferenceMigration,
  type PropertyValue,
  preferredForm,
  SNAPSHOT,
  safeMessage,
  wireId,
} from "./core.ts";
import { BOOK_TITLE, createMorpherMenu, giveMorpher, MORPHER_COMPONENT } from "./morpher.ts";
import { cleanupProbes, spawnProbes } from "./probes.ts";
import { checkLines, forgetFailure, inspectProperties, lastFailure, rememberFailure } from "./property_health.ts";
import { rbowReport } from "./rbow_compat.ts";
import { clearSeatCache, refreshSeat, resetSeatTrim, seatInfo, setSeatTrim } from "./seating.ts";
import {
  ARMOR_FIT_TRIMS,
  ARMOR_LIFT_PROPERTY,
  ARMOR_PROPERTY,
  ARMOR_SCALE_PROPERTY,
  type ArmorFit,
  applyArmor,
  applyGear,
  applyHandHeight,
  applyMotion,
  applyView,
  defaultHandHeight,
  GEAR_PROPERTY,
  HAND_HEIGHT_PROPERTY,
  MOTION_PROPERTY,
  preferredArmor,
  preferredGear,
  preferredHandHeight,
  preferredMotion,
  preferredView,
  resetArmor,
  resetArmorFit,
  resetGear,
  resetHandHeight,
  setArmorLift,
  setArmorScale,
  VIEW_PROPERTY,
} from "./settings.ts";
import { gearRoute, refreshToolGlint } from "./tool_effects.ts";

type CommandAction = (player: Player, ...args: any[]) => void;
interface MenuAction {
  label: string;
  icon?: string;
  run(): void;
}

const sessions = createSessionGuard();
const menus = new Set<string>();
const selectionTickets = new Map<string, number>();
let sequence = 0;
const slots: Readonly<Record<string, EquipmentSlot>> = {
  head: EquipmentSlot.Head,
  chest: EquipmentSlot.Chest,
  legs: EquipmentSlot.Legs,
  feet: EquipmentSlot.Feet,
  offhand: EquipmentSlot.Offhand,
};
const log = (text: string): void => console.warn(`[ElleeDog 67 Pets ${BUILD}] ${text}`);
function fail(player: Player | undefined, error: unknown): void {
  const text = error instanceof Error ? error.message : String(error);
  log(text);
  if (player) {
    rememberFailure(player, error, system.currentTick);
    safeMessage(player, `ERROR: ${text}`);
  }
}
function clientcheck(player: Player): void {
  player.sendMessage({ translate: "pet.diag.rp_052" });
  safeMessage(
    player,
    `Expected resources: ${RELEASE_VERSION}; V52 badge. Server catalog ${CATALOG_HASH.slice(0, 12)}.`,
  );
}
const morpher = createMorpherMenu({
  select,
  reportError: fail,
  wait: (t) => new Promise((resolve) => system.runTimeout(resolve, t)),
});
function select(player: Player, form: string): void {
  morpher.close(player.id);
  sessions.next(player.id);
  const result = transitionForm(player, form);
  const selected = result.form;
  clearSeatCache(player.id);
  const ticket = ++sequence;
  selectionTickets.set(player.id, ticket);
  system.runTimeout(() => {
    if (!isPlayer(player) || selectionTickets.get(player.id) !== ticket) return;
    try {
      const actual = player.getProperty(FORM_PROPERTY);
      if (actual !== wireId(selected)) {
        throw new Error(`Requested ${selected}; pet:model_id=${actual} instead of ${wireId(selected)}.`);
      }
      for (const key of [
        VIEW_PROPERTY,
        MOTION_PROPERTY,
        ARMOR_PROPERTY,
        GEAR_PROPERTY,
        HAND_HEIGHT_PROPERTY,
        ARMOR_LIFT_PROPERTY,
        ARMOR_SCALE_PROPERTY,
      ]) {
        if (player.getProperty(key) !== result.properties[key]) {
          throw new Error(`Form switched but ${key} did not apply. Check matching packs.`);
        }
      }
      safeMessage(player, selected === "human" ? "Selected Player." : `Selected ${formLabel(selected)}.`);
    } catch (error) {
      fail(player, error);
    }
  }, 2);
}
function verify(player: Player, key: string, value: PropertyValue, message: string): void {
  const selection = selectionTickets.get(player.id);
  system.runTimeout(() => {
    if (!isPlayer(player) || selectionTickets.get(player.id) !== selection) return;
    try {
      if (player.getProperty(key) !== value) throw new Error(`Property did not apply: ${key}`);
      safeMessage(player, message);
    } catch (error) {
      fail(player, error);
    }
  }, 2);
}
function playerDefaults(player: Player): void {
  if (preferredForm(player) === "human") restoreAppearance(player);
}
function view(player: Player, value: string): void {
  applyView(player, value);
  playerDefaults(player);
  verify(
    player,
    VIEW_PROPERTY,
    preferredForm(player) === "human" ? "native" : value,
    `First person: ${value}. Camera and targeting unchanged.`,
  );
}
function motion(player: Player, value: string): void {
  const on = value === "on";
  applyMotion(player, on);
  playerDefaults(player);
  verify(
    player,
    MOTION_PROPERTY,
    preferredForm(player) !== "human" && on,
    `Visual movement ${value}; tool actions and player physics remain active.`,
  );
}
function armor(player: Player, value: string): void {
  const fitted = value !== "native";
  if (value === "auto") resetArmor(player);
  else applyArmor(player, fitted);
  playerDefaults(player);
  verify(
    player,
    ARMOR_PROPERTY,
    preferredForm(player) !== "human" && fitted,
    fitted
      ? "Fitted pet armor enabled. Updated crowns and back plates require a visual check."
      : "Native armor presentation selected. Your form is unchanged; choose Player in the book to return to your character.",
  );
}
function gear(player: Player, value: string): void {
  const fitted = value !== "native";
  if (value === "auto") resetGear(player);
  else applyGear(player, fitted);
  playerDefaults(player);
  verify(
    player,
    GEAR_PROPERTY,
    preferredForm(player) !== "human" && fitted,
    fitted
      ? "Single mouth tools, side carry and side/front shields enabled. Unmapped special items use a native fallback."
      : "Native third-person gear presentation restored. First-person item rendering is unchanged.",
  );
}
const fitSummary = (fit: ArmorFit): string => `lift ${fit.lift} pixels, scale ${Math.round(fit.scale * 100)}%`;
function armorlift(player: Player, pixels: number): void {
  const fit = setArmorLift(player, pixels);
  verify(
    player,
    ARMOR_LIFT_PROPERTY,
    fit.lift,
    `${formLabel(preferredForm(player))} fitted armor: ${fitSummary(fit)}. Saved for this pet; /pet:armorfitreset clears it.`,
  );
}
function armorscale(player: Player, percent: number): void {
  const fit = setArmorScale(player, percent);
  verify(
    player,
    ARMOR_SCALE_PROPERTY,
    fit.scale,
    `${formLabel(preferredForm(player))} fitted armor: ${fitSummary(fit)}. Saved for this pet; /pet:armorfitreset clears it.`,
  );
}
function armorfitreset(player: Player): void {
  const form = preferredForm(player);
  resetArmorFit(player);
  verify(player, ARMOR_LIFT_PROPERTY, 0, `${formLabel(form)} fitted armor back to the baked position and size.`);
}
function handheight(player: Player, value: number): void {
  applyHandHeight(player, value);
  playerDefaults(player);
  verify(
    player,
    HAND_HEIGHT_PROPERTY,
    preferredForm(player) === "human" ? 0 : value,
    `Empty-hand height ${value}. Profile default is ${defaultHandHeight(player)}; 0 is neutral. Your explicit setting is preserved across pet changes.`,
  );
}
function listForms(player: Player): void {
  safeMessage(
    player,
    `Available forms: player; ${PETS.map((p) => `${p.id} (${p.display_name}, rig ${p.rig})`).join("; ")}`,
  );
}
function checkedSection<T>(
  read: () => T,
): { status: "ok"; value: T } | { status: "read_error"; value: null; error: string } {
  try {
    return { status: "ok", value: read() };
  } catch (error) {
    return { status: "read_error", value: null, error: String(error) };
  }
}
function check(player: Player): void {
  const { lines } = checkLines(player, system.currentTick);
  safeMessage(player, lines.join("\n"));
}
function diagnose(player: Player): void {
  // Missing properties and read exceptions are retained, not discarded by JSON.stringify.
  const health = inspectProperties(player);
  const pv = (key: string): PropertyValue | null => health.properties[key]?.value ?? null;
  const inventory = checkedSection(() => captureInventory(player, slots));
  const equipment =
    inventory.status === "ok"
      ? Object.fromEntries(Object.entries(inventory.value.equipment).map(([k, v]) => [k, v?.type ?? "empty"]))
      : null;
  const flags = ["isOnGround", "isFlying", "isSprinting", "isSneaking", "isSwimming", "isInWater"] as const;
  const report = {
    build: BUILD,
    catalog: CATALOG_HASH,
    tick: system.currentTick,
    saved: checkedSection(() => preferredForm(player)).value,
    model: health.model,
    modelStatus: health.modelStatus,
    serverForm: health.serverForm,
    propertyStatus: health.status,
    propertyHealth: health,
    lastFailure: lastFailure(player),
    view: pv(VIEW_PROPERTY),
    handHeight: pv(HAND_HEIGHT_PROPERTY),
    motion: pv(MOTION_PROPERTY),
    armorFit: pv(ARMOR_PROPERTY),
    gearFit: pv(GEAR_PROPERTY),
    debug: pv(DEBUG_PROPERTY),
    toolEnchanted: pv("pet:tool_enchanted"),
    dimension: checkedSection(() => player.dimension.id).value,
    equipment,
    mainhand: checkedSection(
      () => player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId ?? "empty",
    ).value,
    gearRoute: health.status === "READY" ? checkedSection(() => gearRoute(player)).value : null,
    seating: checkedSection(() => seatInfo(player)).value,
    sectionErrors: { inventory: inventory.status === "ok" ? null : inventory.error },
    movement: Object.fromEntries(
      flags.map((k) => [k, checkedSection(() => (typeof player[k] === "boolean" ? player[k] : null)).value]),
    ),
  };
  safeMessage(player, JSON.stringify(report));
  log(JSON.stringify(report));
  clientcheck(player);
}
/** Action list and buttons are generated together: adding pets cannot shift handlers incorrectly. */
async function settingsMenu(player: Player): Promise<void> {
  if (!isPlayer(player) || menus.has(player.id)) return;
  const id = player.id;
  menus.add(id);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!isPlayer(player)) return;
      const actions: MenuAction[] = [
        { label: "Client resources: V52 / 0.5.2", icon: "textures/ui/pet_diag_052", run: () => clientcheck(player) },
        { label: "Player", run: () => select(player, "human") },
        ...PETS.map((p) => ({ label: p.display_name, icon: p.menu_icon, run: () => select(player, p.id) })),
        {
          label: `First person: ${preferredView(player)} (toggle)`,
          run: () => view(player, preferredView(player) === "paws" ? "native" : "paws"),
        },
        {
          label: `Motion: ${preferredMotion(player) ? "on" : "off"} (toggle)`,
          run: () => motion(player, preferredMotion(player) ? "off" : "on"),
        },
        {
          label: `Armor: ${preferredArmor(player) ? "fitted" : "native"} (toggle)`,
          run: () => armor(player, preferredArmor(player) ? "native" : "fitted"),
        },
        {
          label: `Gear: ${preferredGear(player) ? "mouth / carry / shield" : "native"} (toggle)`,
          run: () => gear(player, preferredGear(player) ? "native" : "fitted"),
        },
        {
          label: `Empty-hand height: ${preferredHandHeight(player)}: restore default ${defaultHandHeight(player)}`,
          run: () => {
            resetHandHeight(player);
            playerDefaults(player);
            safeMessage(player, `Hand-height profile default restored (${defaultHandHeight(player)}).`);
          },
        },
        { label: "Print diagnostic report", run: () => diagnose(player) },
      ];
      const form = new ActionFormData().title(`ElleeDog 67 Pets ${RELEASE_VERSION}`).body("Choose a form.");
      for (const a of actions) form.button(a.label, a.icon);
      const response = await form.show(player);
      if (!isPlayer(player)) return;
      if (response.canceled) {
        if (response.cancelationReason === FormCancelationReason.UserBusy && attempt < 2) {
          await new Promise<void>((r) => system.runTimeout(r, 10));
          continue;
        }
        return;
      }
      const action = response.selection === undefined ? undefined : actions[response.selection];
      action?.run();
      return;
    }
  } catch (error) {
    fail(player, error);
  } finally {
    menus.delete(id);
  }
}
function restore(player: Player, attempt = 0, generation?: number): void {
  if (!isPlayer(player)) return;
  const id = player.id;
  const gen = generation ?? sessions.next(id);
  if (!sessions.current(id, gen)) return;
  try {
    const migrating = needsPreferenceMigration(player);
    restoreAppearance(player, migrating);
  } catch (error) {
    if (attempt < 3) {
      system.runTimeout(() => restore(player, attempt + 1, gen), 10);
      return;
    }
    // Automatic lifecycle restoration is silent in chat, even on failure: the error stays in the content log, while explicit commands still report to the player.
    rememberFailure(player, error, system.currentTick, "lifecycle");
    fail(undefined, error);
  }
}
function snapshot(player: Player): void {
  const text = JSON.stringify(captureInventory(player, slots));
  if (text.length > 12000) throw new Error("Test inventory too large for snapshot.");
  player.setDynamicProperty(SNAPSHOT, text);
  safeMessage(player, "Snapshot captured. Change form without using/moving gear, then /pet:compare.");
}
function compare(player: Player): void {
  const raw = player.getDynamicProperty(SNAPSHOT) ?? player.getDynamicProperty(LEGACY_SNAPSHOT);
  if (typeof raw !== "string") throw new Error("Run /pet:snapshot first.");
  const changes = compareInventory(JSON.parse(raw), captureInventory(player, slots));
  safeMessage(
    player,
    changes.length
      ? `Changed fields: ${changes.join(", ")}`
      : "PASS: captured inventory/equipment fields unchanged. Not a full native item serialization.",
  );
}
function cleanup(player: Player): void {
  const r = cleanupProbes(world, player.id);
  safeMessage(player, `Removed ${r.removed} of your loaded test props.`);
  if (r.errors.length) throw new Error(r.errors.join("; "));
}
function selfCommand(handler: CommandAction, delay = 1): CommandCallback {
  return (origin, ...args) => {
    const player = origin.sourceEntity;
    if (!isPlayer(player)) return { status: CustomCommandStatus.Failure, message: "Run directly as a player." };
    system.runTimeout(() => {
      if (isPlayer(player)) {
        try {
          handler(player, ...args);
        } catch (error) {
          fail(player, error);
        }
      }
    }, delay);
    return { status: CustomCommandStatus.Success };
  };
}
/** Runs during `system.beforeEvents.startup`; the add-on core hands in its gated command registry. */
export function registerPetCommands(r: GatedCommandRegistry): void {
  try {
    r.registerEnum("pet:form_choice", ["player", ...PETS.map((p) => p.id), "human"]);
    r.registerEnum("pet:debug_choice", ["on", "off"]);
    r.registerEnum("pet:view_choice", ["paws", "native"]);
    r.registerEnum("pet:armor_choice", ["native", "fitted", "auto"]);
    const en = (name: string): CustomCommandParameter => ({ name: `pet:${name}`, type: CustomCommandParamType.Enum });
    const reg = (
      name: string,
      description: string,
      handler: CommandAction,
      params: CustomCommandParameter[] = [],
      delay = 1,
    ): void =>
      r.registerCommand(
        {
          name: `pet:${name}`,
          description,
          permissionLevel: CommandPermissionLevel.Any,
          cheatsRequired: false,
          mandatoryParameters: params,
        },
        selfCommand(handler, delay),
      );
    reg("form", "Choose Player, Carter, Mochi or Casper", select, [en("form_choice")]);
    reg("forms", "List registered pet models", listForms);
    reg("book", "Give yourself the ElleeDog 67 Pet Morpher book", (p) => {
      giveMorpher(p);
      safeMessage(p, `${BOOK_TITLE} added. Put it in your hotbar, select it and use Open Pet Morpher.`);
    });
    reg("menu", "Open the Pet Morpher menu", (p) => morpher.open(p), [], 5);
    reg("settings", "Open advanced pet display settings and diagnostics", settingsMenu, [], 5);
    reg("view", "Choose paws or native first-person view", view, [en("view_choice")]);
    reg("handheight", "Set empty-hand height (-8..12; default 2)", handheight, [
      { name: "height", type: CustomCommandParamType.Integer },
    ]);
    reg("handreset", "Clear calibration and use the selected pet default", (p) => {
      resetHandHeight(p);
      playerDefaults(p);
      safeMessage(p, "Pet default hand height restored (2; Player view stays native).");
    });
    reg("motion", "Enable or pause pet locomotion", motion, [en("debug_choice")]);
    reg("armor", "Choose fitted armor, native presentation or automatic default", armor, [en("armor_choice")]);
    reg("gear", "Choose mouth tools, side carry, shields or native gear", gear, [en("armor_choice")]);
    reg("armorlift", "Raise or lower fitted armor on your pet in model pixels (-16..16)", armorlift, [
      { name: "pixels", type: CustomCommandParamType.Float },
    ]);
    reg("armorscale", "Grow or shrink fitted armor on your pet in percent (50..150)", armorscale, [
      { name: "percent", type: CustomCommandParamType.Integer },
    ]);
    reg("armorfitreset", "Clear the armor lift and scale saved for your pet", armorfitreset);
    reg("seatinfo", "Show mount and seat-height diagnostics", (p) => safeMessage(p, JSON.stringify(seatInfo(p))));
    reg("seatheight", "Adjust current seat category height in model pixels", setSeatTrim, [
      { name: "pixels", type: CustomCommandParamType.Integer },
    ]);
    reg("seatreset", "Reset current seat category calibration", resetSeatTrim);
    reg("check", "Read player property health without changing settings", check);
    reg("rbowcheck", "Read Rbow/Pets compatibility and equipped-item routing", (p) =>
      safeMessage(p, JSON.stringify(rbowReport(p))),
    );
    reg("diagnose", "Print server state and resource check", diagnose);
    reg("clientcheck", "Check resource version", clientcheck);
    reg("debug", "Show pet/version and grip markers", (p, v: string) => p.setProperty(DEBUG_PROPERTY, v === "on"), [
      en("debug_choice"),
    ]);
    reg("probe", "Spawn a temporary stationary version of your selected pet", (p) => {
      const form = preferredForm(p) === "human" ? (PETS[0]?.id ?? "human") : preferredForm(p);
      const pet = MODEL_BY_ID[form];
      if (!pet) throw new Error(`No pet model is registered for ${form}.`);
      const result = spawnProbes(world, p, pet);
      safeMessage(
        p,
        `Spawned ${result.length} test props for ${formLabel(form)}. Not player substitutes. /pet:cleanup removes your loaded props.`,
      );
    });
    reg("cleanup", "Remove your own temporary test props", cleanup);
    reg("snapshot", "Capture read-only inventory comparison", snapshot);
    reg("compare", "Compare captured inventory/equipment fields", compare);
    reg("reset", "Restore Player and default pet settings", (p) => {
      resetHandHeight(p);
      p.setDynamicProperty(ARMOR_FIT_TRIMS, undefined);
      select(p, "human");
      p.setProperty(DEBUG_PROPERTY, false);
      p.setDynamicProperty(SNAPSHOT, undefined);
      p.setDynamicProperty(LEGACY_SNAPSHOT, undefined);
      cleanup(p);
    });
  } catch (error) {
    fail(undefined, error);
  }
}
/** Runs during `system.beforeEvents.startup`; the add-on core hands in its gated item component registry. */
export function registerPetItems(itemRegistry: GatedItemComponentRegistry): void {
  try {
    const open = (e: ItemComponentUseEvent | ItemComponentUseOnEvent) => system.run(() => morpher.open(e.source));
    itemRegistry.registerCustomComponent("pet:open_form_menu", { onUse: open, onUseOn: open });
    itemRegistry.registerCustomComponent(MORPHER_COMPONENT, { onUse: open, onUseOn: open });
  } catch (error) {
    fail(undefined, error);
  }
}
// Load, join/rejoin and respawn restore saved appearance without announcements.
export function restoreAll(): void {
  try {
    for (const player of world.getAllPlayers()) restore(player);
  } catch (error) {
    fail(undefined, error);
  }
}
function closeSessions(id: string): void {
  sessions.remove(id);
  menus.delete(id);
  morpher.close(id);
  selectionTickets.delete(id);
  clearSeatCache(id);
}

// Read only the two equipped hand slots at 5 Hz while transformed. No full inventory scan,
// item creation, equipment replacement, attacks or damage changes.
const glintWarnings = new Set<string>();
function glintLoop(): void {
  for (const player of world.getAllPlayers()) {
    try {
      refreshToolGlint(player);
      glintWarnings.delete(player.id);
    } catch (error) {
      if (!glintWarnings.has(player.id)) {
        glintWarnings.add(player.id);
        log(`Tool glint sync: ${String(error)}`);
      }
    }
  }
}

// Visual-only seat alignment. No teleporting or changes to the mount/seat definitions.
const seatWarnings = new Set<string>();
function seatLoop(): void {
  for (const p of world.getAllPlayers()) {
    try {
      refreshSeat(p);
      seatWarnings.delete(p.id);
    } catch (e) {
      if (!seatWarnings.has(p.id)) {
        seatWarnings.add(p.id);
        log(`Seat alignment: ${String(e)}`);
      }
    }
  }
}

export function startPets(ctx: FeatureContext): void {
  ctx.on(world.afterEvents.playerSpawn, (e) =>
    system.run(() => {
      morpher.close(e.player.id);
      restore(e.player);
    }),
  );
  ctx.on(world.afterEvents.playerLeave, (e) => {
    forgetFailure(e.playerId);
    closeSessions(e.playerId);
    glintWarnings.delete(e.playerId);
    seatWarnings.delete(e.playerId);
  });
  ctx.on(world.afterEvents.playerDimensionChange, (e) =>
    system.run(() => {
      morpher.close(e.player.id);
      restore(e.player);
    }),
  );
  ctx.after(20, restoreAll);
  ctx.every(4, glintLoop);
  ctx.every(2, seatLoop);
}
