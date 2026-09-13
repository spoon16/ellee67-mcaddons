import type { FeatureDefinition, FeatureId } from "../../src/core/features.ts";
import type { FeatureContext } from "../../src/core/subscriptions.ts";

export interface FakeFeatureLog {
  starts: number;
  stops: number;
  lastContext?: FeatureContext;
}

/** A feature whose start/stop are observable and whose start can be made to throw. */
export function fakeFeature(
  id: FeatureId,
  options: {
    kind?: FeatureDefinition["kind"];
    packs?: readonly string[];
    installed?: () => boolean;
    manual?: Partial<FeatureDefinition["manual"]>;
    defaultEnabled?: boolean;
    failStart?: boolean;
    onStart?: (ctx: FeatureContext) => void;
    onStop?: (ctx: FeatureContext) => void;
    register?: FeatureDefinition["register"];
  } = {},
): { definition: FeatureDefinition; log: FakeFeatureLog } {
  const log: FakeFeatureLog = { starts: 0, stops: 0 };
  const definition: FeatureDefinition = {
    id,
    title: id
      .split("-")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" "),
    summary: `${id} summary`,
    kind: options.kind ?? "switch",
    packs: options.packs,
    installed: options.installed,
    defaultEnabled: options.defaultEnabled ?? true,
    manual: { about: `${id} about`, whileOff: `${id} while off`, ...options.manual },
    register: options.register,
    start(ctx) {
      log.starts++;
      log.lastContext = ctx;
      if (options.failStart) throw new Error(`${id} exploded`);
      options.onStart?.(ctx);
    },
    stop(ctx) {
      log.stops++;
      options.onStop?.(ctx);
    },
  };
  return { definition, log };
}
