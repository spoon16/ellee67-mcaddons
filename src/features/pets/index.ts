import type { FeatureDefinition } from "../../core/feature.ts";
import { registerPetCommands, registerPetItems, startPets } from "./main.ts";

/**
 * Lets players become Carter, Mochi or Casper through the Pet Morpher book or `/pet:form`. The chosen form,
 * first-person paws, fitted armor and gear are entity properties on the `minecraft:player` override; the
 * scripts only queue property writes and never touch inventories or equipment stacks.
 */
export const pets: FeatureDefinition = {
  id: "pets",
  title: "Pets",
  register({ commands, items }) {
    registerPetCommands(commands);
    registerPetItems(items);
  },
  start(ctx) {
    startPets(ctx);
  },
};
