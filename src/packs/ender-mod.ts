// Entry point of the ElleeDog 67 ender-mod behavior pack; esbuild bundles it into that pack's scripts/main.js.
import "../core/polyfills.ts";
import { runFeature } from "../core/feature.ts";
import { enderMod } from "../features/ender-mod/index.ts";

runFeature(enderMod);
