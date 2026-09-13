import type { FeatureDefinition } from "../core/features.ts";
import { creeperMod } from "./creeper-mod/index.ts";
import { enderMod } from "./ender-mod/index.ts";
import { pets } from "./pets/index.ts";
import { rbowOre } from "./rbow-ore/index.ts";
import { redstoneGuide } from "./redstone-guide/index.ts";
import { stairSit } from "./stair-sit/index.ts";

/** Every feature shipped in the add-on, in the order they appear in menus and `/elleedog67:features`. */
export const features: readonly FeatureDefinition[] = [pets, stairSit, creeperMod, enderMod, redstoneGuide, rbowOre];
