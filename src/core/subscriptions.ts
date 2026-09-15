import { system } from "@minecraft/server";
import { log } from "./log.ts";

/** The shape shared by every Bedrock event signal (`world.afterEvents.*`, `world.beforeEvents.*`, `system.afterEvents.*`). */
export interface Signal<TEvent, TOptions = unknown> {
  subscribe(callback: (event: TEvent) => void, options?: TOptions): (event: TEvent) => void;
  unsubscribe(callback: (event: TEvent) => void): void;
}

/**
 * Tracks everything a feature subscribes to while it runs so `dispose()` can undo all of it.
 * A feature's `start(ctx)` uses `ctx.on` and `ctx.every` instead of calling `subscribe`/`runInterval` directly.
 */
export class FeatureContext {
  readonly featureId: string;
  private disposers: Array<() => void> = [];

  constructor(featureId: string) {
    this.featureId = featureId;
  }

  on<TEvent, TOptions>(signal: Signal<TEvent, TOptions>, callback: (event: TEvent) => void, options?: TOptions): void {
    // The engine counts arguments at the native boundary: most signals take exactly one, and passing an undefined
    // second argument is a TypeError there. Only forward options when the caller gave some.
    if (options === undefined) signal.subscribe(callback);
    else signal.subscribe(callback, options);
    this.disposers.push(() => signal.unsubscribe(callback));
  }

  every(ticks: number, callback: () => void): number {
    const id = system.runInterval(callback, ticks);
    this.disposers.push(() => system.clearRun(id));
    return id;
  }

  after(ticks: number, callback: () => void): number {
    const id = system.runTimeout(callback, ticks);
    this.disposers.push(() => system.clearRun(id));
    return id;
  }

  onDispose(cleanup: () => void): void {
    this.disposers.push(cleanup);
  }

  get size(): number {
    return this.disposers.length;
  }

  dispose(): void {
    const pending = this.disposers.reverse();
    this.disposers = [];
    for (const cleanup of pending) {
      try {
        cleanup();
      } catch (error) {
        log.warn(`${this.featureId}: cleanup failed: ${log.describe(error)}`);
      }
    }
  }
}
