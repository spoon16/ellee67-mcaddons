// Entry point of the ElleeDog 67 redstone-guide behavior pack; esbuild bundles it into that pack's scripts/main.js.
// Order matters: the polyfill runs first so newer JavaScript helpers exist before any feature code needs them.
// The feature lives in src/features/redstone-guide/index.ts; runFeature (src/core/feature.ts) plugs it in.
import "../core/polyfills.ts";
import { runFeature } from "../core/feature.ts";
import { redstoneGuide } from "../features/redstone-guide/index.ts";

runFeature(redstoneGuide);
