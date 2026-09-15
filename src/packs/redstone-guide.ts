// Entry point of the ElleeDog 67 redstone-guide behavior pack; esbuild bundles it into that pack's scripts/main.js.
import "../core/polyfills.ts";
import { runFeature } from "../core/feature.ts";
import { redstoneGuide } from "../features/redstone-guide/index.ts";

runFeature(redstoneGuide);
