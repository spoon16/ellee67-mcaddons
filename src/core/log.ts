export const LOG_PREFIX = "[ElleeDog 67]";

const warned = new Set<string>();

export const log = {
  info(text: string): void {
    console.info(`${LOG_PREFIX} ${text}`);
  },
  warn(text: string): void {
    console.warn(`${LOG_PREFIX} ${text}`);
  },
  /** Warns once per key until `forget(key)`; use inside per-tick loops so the content log is not flooded. */
  warnOnce(key: string, text: string): void {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`${LOG_PREFIX} ${text}`);
  },
  forget(key: string): void {
    warned.delete(key);
  },
  describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  },
};
