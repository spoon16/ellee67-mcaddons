import { EntityTypes } from "@minecraft/server";
import type { FeatureDefinition } from "../../core/features.ts";
import { registerPetCommands, registerPetItems, startPets } from "./main.ts";

/**
 * Lets players become Carter, Mochi or Casper through the Pet Morpher book or `/pet:form`. The chosen form,
 * first-person paws, fitted armor and gear are entity properties on the `minecraft:player` override; the
 * scripts only queue property writes and never touch inventories or equipment stacks.
 */
export const pets: FeatureDefinition = {
  id: "pets",
  title: "Pets",
  summary: "Become Carter, Mochi or Casper with the Pet Morpher book",
  kind: "pack",
  packs: ["pets", "pets-resources"],
  installed: () => EntityTypes.get("pet:diag_model") !== undefined,
  manual: {
    about:
      "Become Carter, Mochi or Casper with the Pet Morpher book (/pet:book gives you one). Fitted armor, mouth-carried tools, side-carried items and shields follow the pet. Choose Player in the book to return to your normal character.",
    commands: [
      "/pet:form player|carter|mochi|casper, /pet:book, /pet:menu, /pet:settings, /pet:forms",
      "/pet:armor native|fitted|auto, /pet:gear native|fitted|auto, /pet:view paws|native, /pet:motion on|off",
      "/pet:handheight <-8 to 12>, /pet:handreset, /pet:seatheight <pixels>, /pet:seatinfo, /pet:seatreset",
      "/pet:armorlift <-16 to 16 pixels>, /pet:armorscale <50 to 150 percent>, /pet:armorfitreset",
      "/pet:check, /pet:diagnose, /pet:clientcheck, /pet:rbowcheck, /pet:debug on|off, /pet:probe, /pet:cleanup, /pet:snapshot, /pet:compare, /pet:reset",
    ],
    whileOff:
      "Players render as themselves and the pet commands refuse. Pet items already in inventories turn into unknown items until the packs are active again; saved pet choices come back when they are.",
  },
  register({ commands, items }) {
    registerPetCommands(commands);
    registerPetItems(items);
  },
  start(ctx) {
    startPets(ctx);
  },
  stop() {
    // pack feature: never stopped at runtime
  },
};
