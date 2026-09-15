// Entry point of the ElleeDog 67 rbow-ore behavior pack; esbuild bundles it into that pack's scripts/main.js.
import "../core/polyfills.ts";
import { runFeature } from "../core/feature.ts";
import { rbowOre } from "../features/rbow-ore/index.ts";

runFeature(rbowOre);
