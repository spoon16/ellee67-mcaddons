// Every custom command's short name (the part after the colon) becomes an engine alias, and the engine warns on the
// player's screen at every world load when that alias is already taken: by vanilla (`sit:help`, `sit:clear`) or by
// another pack of this add-on (`sit:cleanup` against `pet:cleanup`). `npm run test:engine` fails on the notice; this
// catches the clash before a server boots. The vanilla list is Bedrock's documented command set, and the engine is
// the authority where the two disagree.
import { describe, expect, it } from "vitest";
import { type FeatureDefinition, runFeature } from "../../src/core/feature.ts";
import { creeperMod } from "../../src/features/creeper-mod/index.ts";
import { enderMod } from "../../src/features/ender-mod/index.ts";
import { pets } from "../../src/features/pets/index.ts";
import { rbowOre } from "../../src/features/rbow-ore/index.ts";
import { redstoneGuide } from "../../src/features/redstone-guide/index.ts";
import { stairSit } from "../../src/features/stair-sit/index.ts";
import { registry, reset, startup } from "../mocks/minecraft-server.ts";

const FEATURES: FeatureDefinition[] = [pets, rbowOre, enderMod, redstoneGuide, stairSit, creeperMod];

const VANILLA_COMMANDS = new Set(
  `ability aimassist allowlist alwaysday camera camerashake changesetting clear clearspawnpoint clone connect
   controlscheme damage daylock deop dialogue difficulty effect enchant event execute fill fog function gamemode
   gamerule gametest give help hud immutableworld inputpermission kick kill list locate loot me mobevent msg music
   op ops particle permission place playanimation playsound recipe reload replaceitem ride save say schedule
   scoreboard script scriptevent sendshowstoreoffer setblock setmaxplayers setworldspawn spawnpoint spreadplayers
   stop stopsound structure summon tag teleport tell tellraw testfor testforblock testforblocks tickingarea time
   title titleraw toggledownfall tp transfer volumearea w weather whitelist worldbuilder wsserver xp`
    .trim()
    .split(/\s+/),
);

/** The command names one feature registers during startup, on a fresh mock: one script module at a time. */
function commandNames(feature: FeatureDefinition): string[] {
  reset();
  runFeature(feature);
  startup();
  return [...registry.commands.keys()];
}

describe("custom command short names", () => {
  it("are unique across the add-on and never a vanilla command, because each becomes an engine alias", () => {
    const owners = new Map<string, string>();
    for (const feature of FEATURES) {
      for (const name of commandNames(feature)) {
        const short = name.slice(name.indexOf(":") + 1);
        expect(VANILLA_COMMANDS.has(short), `${name} takes vanilla's /${short}`).toBe(false);
        expect(owners.get(short), `${name} shares its short name with ${owners.get(short)}`).toBeUndefined();
        owners.set(short, name);
      }
    }
    // Pets, Stair Sitting and Ender Mod register commands; the other three packs have none.
    expect(owners.size).toBe(27 + 8 + 1);
  });
});
