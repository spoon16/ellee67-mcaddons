// Everything a feature hooks into the engine goes through a FeatureContext, so all of it can be undone in one call.
//
// Two engine words that appear all over the code:
//   tick    Minecraft's heartbeat. The server updates the world 20 times a second; each update is one tick, so
//           20 ticks is one second and `system.currentTick` counts them since the world loaded.
//   signal  Something that fires events, such as `world.afterEvents.playerLeave`. `subscribe(callback)` asks to be
//           called each time it fires; `unsubscribe(callback)` stops that.
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
  /** One "undo this" function per subscription, timer or custom cleanup, in the order they were added. */
  private disposers: Array<() => void> = [];

  constructor(featureId: string) {
    this.featureId = featureId;
  }

  /** Listens to a signal until `dispose()`. Some signals take options (a filter, for example); most take none. */
  on<TEvent, TOptions>(signal: Signal<TEvent, TOptions>, callback: (event: TEvent) => void, options?: TOptions): void {
    // The engine counts arguments at the native boundary: most signals take exactly one, and passing an undefined
    // second argument is a TypeError there. Only forward options when the caller gave some.
    if (options === undefined) signal.subscribe(callback);
    else signal.subscribe(callback, options);
    this.disposers.push(() => signal.unsubscribe(callback));
  }

  /** Runs `callback` every `ticks` ticks until `dispose()`; `every(20, fn)` is once a second. */
  every(ticks: number, callback: () => void): number {
    const id = system.runInterval(callback, ticks);
    this.disposers.push(() => system.clearRun(id));
    return id;
  }

  /** Runs `callback` once, `ticks` ticks from now. `after(0, fn)` runs at the engine's next chance, not on a timer. */
  after(ticks: number, callback: () => void): number {
    const id = system.runTimeout(callback, ticks);
    this.disposers.push(() => system.clearRun(id));
    return id;
  }

  /** Adds cleanup for state the feature keeps outside the engine, such as a Map of players it is tracking. */
  onDispose(cleanup: () => void): void {
    this.disposers.push(cleanup);
  }

  /** How many things are registered; tests use it to prove nothing was subscribed twice. */
  get size(): number {
    return this.disposers.length;
  }

  /** Undoes everything, newest first, the way a stack unwinds. A cleanup that throws does not stop the others. */
  dispose(): void {
    const pending = this.disposers.reverse();
    // Empty the list before running anything, so a cleanup that throws is never retried on the next dispose.
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
