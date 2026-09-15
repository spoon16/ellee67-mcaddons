// Entry point of the ElleeDog 67 rbow-ore behavior pack; esbuild bundles it into that pack's scripts/main.js.
// Order matters: the polyfill runs first so newer JavaScript helpers exist before any feature code needs them.
// The feature lives in src/features/rbow-ore/index.ts; runFeature in src/core/feature.ts plugs it into the engine.
import "../core/polyfills.ts";
import { runFeature } from "../core/feature.ts";
import { rbowOre } from "../features/rbow-ore/index.ts";

runFeature(rbowOre);
