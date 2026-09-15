// Entry point of the ElleeDog 67 pets behavior pack; esbuild bundles it into that pack's scripts/main.js.
import "../core/polyfills.ts";
import { runFeature } from "../core/feature.ts";
import { pets } from "../features/pets/index.ts";

runFeature(pets);
