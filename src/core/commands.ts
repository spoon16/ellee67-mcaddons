import {
  CommandPermissionLevel,
  type CustomCommand,
  type CustomCommandOrigin,
  type CustomCommandParameter,
  CustomCommandParamType,
  type CustomCommandRegistry,
  type CustomCommandResult,
  CustomCommandStatus,
  type ItemComponentRegistry,
  type ItemCustomComponent,
  type Player,
  system,
} from "@minecraft/server";
import { BOOK_TITLE, giveBook, isPlayer } from "./book.ts";
import { NAMESPACE } from "./config.ts";
import {
  FEATURE_IDS,
  type FeatureDefinition,
  type FeatureId,
  featureStatusLines,
  getFeature,
  isEnabled,
  normalizeFeatureId,
  setEnabled,
  type ToggleResult,
} from "./features.ts";
import { log } from "./log.ts";

export type CommandCallback = (origin: CustomCommandOrigin, ...args: any[]) => CustomCommandResult | undefined;

export interface GatedCommandRegistry {
  registerEnum(name: string, values: string[]): void;
  registerCommand(command: CustomCommand, callback: CommandCallback): void;
}

export interface GatedItemComponentRegistry {
  registerCustomComponent(name: string, component: ItemCustomComponent): void;
}

export interface FeatureRegistries {
  commands: GatedCommandRegistry;
  items: GatedItemComponentRegistry;
}

export const FEATURE_ENUM = `${NAMESPACE}:feature`;

export function disabledMessage(feature: FeatureDefinition): string {
  return `${feature.title} is disabled. An operator can run /${NAMESPACE}:enable ${feature.id}.`;
}

/**
 * Wraps the engine registries so a feature's commands refuse politely and its item components do nothing
 * while the feature is disabled. Bedrock cannot unregister commands after startup, so this gate is the toggle.
 */
export function gatedRegistries(
  feature: FeatureDefinition,
  engine: { customCommandRegistry: CustomCommandRegistry; itemComponentRegistry: ItemComponentRegistry },
): FeatureRegistries {
  return {
    commands: {
      registerEnum: (name, values) => engine.customCommandRegistry.registerEnum(name, values),
      registerCommand: (command, callback) =>
        engine.customCommandRegistry.registerCommand(command, (origin, ...args) => {
          if (!isEnabled(feature.id)) return { status: CustomCommandStatus.Failure, message: disabledMessage(feature) };
          return callback(origin, ...args);
        }),
    },
    items: {
      registerCustomComponent: (name, component) => {
        const gated: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(component)) {
          if (typeof value !== "function") {
            gated[key] = value;
            continue;
          }
          gated[key] = (...args: unknown[]) => {
            if (!isEnabled(feature.id)) return undefined;
            return (value as (...inner: unknown[]) => unknown).apply(component, args);
          };
        }
        engine.itemComponentRegistry.registerCustomComponent(name, gated as ItemCustomComponent);
      },
    },
  };
}

export function playerFrom(origin: CustomCommandOrigin): Player | undefined {
  const entity = origin.sourceEntity;
  return isPlayer(entity) ? entity : undefined;
}

/** Registers `/elleedog67:enable|disable|features|book`. Runs during `system.beforeEvents.startup`. */
export function registerCoreCommands(registry: CustomCommandRegistry): void {
  let featureParameter: CustomCommandParameter = { name: FEATURE_ENUM, type: CustomCommandParamType.Enum };
  try {
    registry.registerEnum(FEATURE_ENUM, [...FEATURE_IDS]);
  } catch (error) {
    // Enum value rules are undocumented; hyphenated ids may be rejected. A text parameter still works.
    log.warn(`Feature enum was rejected (${log.describe(error)}). Using a plain text parameter instead.`);
    featureParameter = { name: "feature", type: CustomCommandParamType.String };
  }

  registry.registerCommand(
    {
      name: `${NAMESPACE}:enable`,
      description: "Enable an ElleeDog 67 feature in this world",
      permissionLevel: CommandPermissionLevel.Admin,
      cheatsRequired: false,
      mandatoryParameters: [featureParameter],
    },
    (origin, feature) => toggleCommand(origin, feature, true),
  );
  registry.registerCommand(
    {
      name: `${NAMESPACE}:disable`,
      description: "Disable an ElleeDog 67 feature in this world",
      permissionLevel: CommandPermissionLevel.Admin,
      cheatsRequired: false,
      mandatoryParameters: [featureParameter],
    },
    (origin, feature) => toggleCommand(origin, feature, false),
  );
  registry.registerCommand(
    {
      name: `${NAMESPACE}:features`,
      description: "List ElleeDog 67 features and whether they are enabled",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    () => ({ status: CustomCommandStatus.Success, message: featureStatusLines().join("\n") }),
  );
  registry.registerCommand(
    {
      name: `${NAMESPACE}:book`,
      description: `Give yourself the ${BOOK_TITLE}`,
      permissionLevel: CommandPermissionLevel.Admin,
      cheatsRequired: false,
    },
    (origin) => {
      const player = playerFrom(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Run this command as a player." };
      system.run(() => {
        try {
          giveBook(player);
          player.sendMessage(`${BOOK_TITLE} added to your inventory.`);
        } catch (error) {
          player.sendMessage(log.describe(error));
        }
      });
      return { status: CustomCommandStatus.Success };
    },
  );
}

function toggleCommand(origin: CustomCommandOrigin, rawFeature: unknown, enabled: boolean): CustomCommandResult {
  const id = normalizeFeatureId(String(rawFeature ?? ""));
  if (!id) {
    return {
      status: CustomCommandStatus.Failure,
      message: `Unknown feature "${String(rawFeature)}". Features: ${FEATURE_IDS.join(", ")}.`,
    };
  }
  const player = playerFrom(origin);
  // Command callbacks are read-only; the toggle runs on the next tick.
  system.run(() => {
    const text = describeToggle(id, enabled, setEnabled(id, enabled));
    if (player?.isValid) player.sendMessage(text);
    else log.info(text);
  });
  return { status: CustomCommandStatus.Success };
}

export function describeToggle(id: FeatureId, enabled: boolean, result: ToggleResult): string {
  const feature = getFeature(id);
  const title = feature?.title ?? id;
  const verb = enabled ? "enabled" : "disabled";
  if (result.error) {
    return `${title} could not be ${enabled ? "started" : "stopped"}: ${log.describe(result.error)}. See the content log.`;
  }
  if (!result.changed) return `${title} was already ${verb}.`;
  const note = !enabled && feature?.disabledNote ? ` ${feature.disabledNote}` : "";
  return `${title} ${verb}.${note}`;
}
