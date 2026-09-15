// Entry point of the ElleeDog 67 creeper-mod behavior pack; esbuild bundles it into that pack's scripts/main.js.
import "../core/polyfills.ts";
import { runFeature } from "../core/feature.ts";
import { creeperMod } from "../features/creeper-mod/index.ts";

runFeature(creeperMod);
