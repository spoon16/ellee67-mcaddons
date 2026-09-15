// Entry point of the ElleeDog 67 pets behavior pack; esbuild bundles it into that pack's scripts/main.js.
// Order matters: the polyfill runs first so newer JavaScript helpers exist before any feature code needs them.
// The feature lives in src/features/pets/index.ts; runFeature in src/core/feature.ts plugs it into the engine.
import "../core/polyfills.ts";
import { runFeature } from "../core/feature.ts";
import { pets } from "../features/pets/index.ts";

runFeature(pets);
