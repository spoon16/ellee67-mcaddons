import type { FeatureDefinition } from "../core/features.ts";
import { creeperMod } from "./creeper-mod/index.ts";
import { enderMod } from "./ender-mod/index.ts";

/** Every feature shipped in the add-on, in the order they appear in menus and `/elleedog67:features`. */
export const features: readonly FeatureDefinition[] = [creeperMod, enderMod];
