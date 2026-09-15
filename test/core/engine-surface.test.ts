// Checks the mock and the tooling against the installed engine typings and packages, so an engine bump cannot
// leave a hand-maintained table behind.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BDS_VERSION } from "../../tools/bds/setup.ts";
import { REPO_ROOT } from "../../tools/lib/paths.ts";
import { MIN_ENGINE_VERSION, SCRIPT_MODULE_VERSIONS } from "../../tools/manifests.ts";
import { system, world } from "../mocks/minecraft-server.ts";

const SERVER_DTS = fs.readFileSync(path.join(REPO_ROOT, "node_modules/@minecraft/server/index.d.ts"), "utf8");

/**
 * Whether each `*EventSignal` class's `subscribe` takes an options argument, read from the typings. The class name
 * is the event name with `Signal` appended, so `PlayerBreakBlockAfterEventSignal` maps to the world's
 * `afterEvents.playerBreakBlock`.
 */
function signalArity(): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const classes = SERVER_DTS.split(/^export class /m).slice(1);
  for (const body of classes) {
    const name = /^(\w+EventSignal)\b/.exec(body)?.[1];
    if (!name) continue;
    // From `subscribe(` to the return type `): (arg0`; the parameter list in between names `options` or not.
    const subscribe = /subscribe\(([\s\S]*?)\): \(arg0/.exec(body)?.[1] ?? "";
    result.set(name, /\boptions\??:/.test(subscribe));
  }
  return result;
}

function signalClassName(kind: "before" | "after", event: string): string {
  const suffix = kind === "before" ? "BeforeEventSignal" : "AfterEventSignal";
  return `${event[0]?.toUpperCase()}${event.slice(1)}${suffix}`;
}

describe("the engine mock against @minecraft/server's typings", () => {
  const arity = signalArity();

  it("reads a plausible number of signal classes from the typings", () => {
    expect(arity.size).toBeGreaterThan(60);
    expect(arity.get("PlayerBreakBlockAfterEventSignal")).toBe(true);
    expect(arity.get("PlayerSpawnAfterEventSignal")).toBe(false);
  });

  it("flags every world signal it exposes exactly as the typings do", () => {
    const checked: string[] = [];
    for (const [kind, signals] of [
      ["before", world.beforeEvents],
      ["after", world.afterEvents],
    ] as const) {
      for (const [event, signal] of Object.entries(signals)) {
        const className = signalClassName(kind, event);
        expect(arity.has(className), `${className} is not in the typings`).toBe(true);
        expect(signal.acceptsOptions, `${className} acceptsOptions`).toBe(arity.get(className));
        checked.push(className);
      }
    }
    expect(system.afterEvents.scriptEventReceive.acceptsOptions).toBe(
      arity.get("ScriptEventCommandMessageAfterEventSignal"),
    );
    expect(checked.length).toBeGreaterThan(15);
  });
});

describe("engine versions agree across the repo", () => {
  it("declares in every manifest the @minecraft module versions that are installed", () => {
    for (const [name, version] of Object.entries(SCRIPT_MODULE_VERSIONS)) {
      const installed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "node_modules", name, "package.json"), "utf8"));
      expect(installed.version, name).toBe(version);
    }
  });

  it("gives the GameTest pack the same module versions and engine floor as the shipped packs", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tools/bds/gametest/manifest.json"), "utf8"));
    expect(manifest.header.min_engine_version).toEqual(MIN_ENGINE_VERSION);
    const declared = new Map<string, string>(
      manifest.dependencies.map((d: { module_name: string; version: string }) => [d.module_name, d.version]),
    );
    for (const [name, version] of Object.entries(SCRIPT_MODULE_VERSIONS))
      expect(declared.get(name), name).toBe(version);
    // The beta module is not installed (tools/bds/gametest/src/server-gametest.d.ts declares the slice used).
    expect(declared.get("@minecraft/server-gametest")).toMatch(/^\d+\.\d+\.\d+-beta$/);
  });

  it("runs a Bedrock Dedicated Server at least as new as the packs' minimum engine version", () => {
    const server = BDS_VERSION.split(".").map(Number);
    const [major, minor, patch] = MIN_ENGINE_VERSION as [number, number, number];
    const newer =
      (server[0] as number) > major ||
      ((server[0] as number) === major &&
        ((server[1] as number) > minor || ((server[1] as number) === minor && (server[2] as number) >= patch)));
    expect(newer, `BDS ${BDS_VERSION} vs min_engine_version ${MIN_ENGINE_VERSION.join(".")}`).toBe(true);
  });
});
