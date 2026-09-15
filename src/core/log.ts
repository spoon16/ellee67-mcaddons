export const LOG_PREFIX = "[ElleeDog 67]";

/**
 * A feature's view of the Content Log. Every line carries the feature title so a reader can tell which pack wrote
 * it. Nothing here reaches players: chat and action bars are the feature's own decision, and they are kept rare.
 */
export interface FeatureLog {
  info(text: string): void;
  warn(text: string): void;
  /** Warns once per key until `forget(key)`; use inside per-tick loops so the log is not flooded. */
  warnOnce(key: string, text: string): void;
  /** Warns at most once per `ticks` for the key; `tick` is the caller's clock, usually `system.currentTick`. */
  throttled(key: string, tick: number, ticks: number, text: string): void;
  forget(key: string): void;
  /** Clears every once/throttle key, for tests and for a feature that restarts on a world reload. */
  reset(): void;
  describe(error: unknown): string;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function featureLog(title: string): FeatureLog {
  const prefix = `${LOG_PREFIX} ${title}:`;
  const warned = new Set<string>();
  const lastWarning = new Map<string, number>();
  return {
    info(text) {
      console.info(`${prefix} ${text}`);
    },
    warn(text) {
      console.warn(`${prefix} ${text}`);
    },
    warnOnce(key, text) {
      if (warned.has(key)) return;
      warned.add(key);
      console.warn(`${prefix} ${text}`);
    },
    throttled(key, tick, ticks, text) {
      const last = lastWarning.get(key);
      if (last !== undefined && tick - last < ticks) return;
      lastWarning.set(key, tick);
      console.warn(`${prefix} ${text}`);
    },
    forget(key) {
      warned.delete(key);
      lastWarning.delete(key);
    },
    reset() {
      warned.clear();
      lastWarning.clear();
    },
    describe: describeError,
  };
}

/** The runtime's own log, for lines about features rather than from them. */
export const log = {
  info(text: string): void {
    console.info(`${LOG_PREFIX} ${text}`);
  },
  warn(text: string): void {
    console.warn(`${LOG_PREFIX} ${text}`);
  },
  describe: describeError,
};
