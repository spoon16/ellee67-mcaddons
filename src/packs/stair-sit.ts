// Entry point of the ElleeDog 67 stair-sit behavior pack; esbuild bundles it into that pack's scripts/main.js.
import "../core/polyfills.ts";
import { runFeature } from "../core/feature.ts";
import { stairSit } from "../features/stair-sit/index.ts";

runFeature(stairSit);
