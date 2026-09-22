import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPacks } from "../../tools/build.ts";
import { readStrictJson } from "../../tools/lib/json.ts";
import { distDir, loadPacks, scriptEntry } from "../../tools/lib/packs.ts";
import { REPO_ROOT } from "../../tools/lib/paths.ts";
import { expectedManifest } from "../../tools/manifests.ts";
import { packageArchives } from "../../tools/package.ts";
import { distRoots, validateBuild } from "../../tools/validate.ts";

const PACK_COUNT = 10;
const SCRIPT_PACKS = ["pets", "rbow-ore", "ender-mod", "redstone-guide", "stair-sit", "creeper-mod"];

function bundleOf(id: string): string {
  return fs.readFileSync(path.join(distDir(id), "scripts", "main.js"), "utf8");
}

function importsOf(bundle: string): Set<string> {
  return new Set(
    [...bundle.matchAll(/^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm)].map((match) => match[1] as string),
  );
}

// Builds the real packs once and checks what a player would install. Slow-ish (esbuild + hundreds of JSON files),
// which is why it lives in its own file.
let scratch: string;

// One build for both suites in this file: the validator's negative cases read dist/ too, and another worker
// rebuilding it underneath them would race.
beforeAll(async () => {
  await buildPacks();
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "elleedog67-validate-"));
}, 60_000);

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

// Several cases build or validate every pack more than once, at over a second each; the default 5 s is a coin toss
// under a parallel run.
describe("built packs", { timeout: 20_000 }, () => {
  it("pass structural validation", () => {
    const report = validateBuild();
    expect(report.errors).toEqual([]);
    expect(report.counts.packs).toBe(PACK_COUNT);
    expect(report.counts["minecraft:item"]).toBeGreaterThan(0);
  });

  it("carry one manifest per pack, generated from packs.json, with every feature self-contained", () => {
    const packs = loadPacks();
    expect(packs).toHaveLength(PACK_COUNT);
    for (const pack of packs) {
      const manifest = readStrictJson(path.join(distDir(pack.id), "manifest.json"));
      expect(manifest, pack.id).toEqual(expectedManifest(pack));
    }
    for (const pack of packs) {
      if (pack.kind === "resources") {
        expect(pack.dependsOn, pack.id).toEqual([]);
        continue;
      }
      // A behavior pack depends on its own resource pack (if any) and on nothing else: no shared core.
      const own = packs.filter((candidate) => candidate.feature === pack.feature && candidate.kind === "resources");
      expect(new Set(pack.dependsOn), pack.id).toEqual(new Set(own.map((resource) => resource.id)));
    }
    expect(packs.filter((pack) => scriptEntry(pack)).map((pack) => pack.id)).toEqual(SCRIPT_PACKS);
  });

  it("bundle one script per behavior pack that imports exactly the engine modules its manifest declares", () => {
    for (const pack of loadPacks()) {
      const scripts = path.join(distDir(pack.id), "scripts");
      if (!scriptEntry(pack)) {
        expect(fs.existsSync(scripts), pack.id).toBe(false);
        continue;
      }
      const bundle = bundleOf(pack.id);
      expect(importsOf(bundle), pack.id).toEqual(new Set(pack.scriptModules));
      // Object.hasOwn is ES2022; the guarded polyfill in src/core/polyfills.ts must come before any feature code.
      const polyfill = bundle.indexOf('Object.defineProperty(Object, "hasOwn"');
      expect(polyfill, pack.id).toBeGreaterThan(-1);
      const firstUse = bundle.indexOf("Object.hasOwn(");
      if (firstUse !== -1) expect(polyfill, pack.id).toBeLessThan(firstUse);
      expect(bundle, pack.id).toContain(`id: "${pack.feature}"`);
    }
  });

  it("keep every bundle small and free of @minecraft/vanilla-data's runtime enums", () => {
    // src/core/vanilla.ts uses the package's types only; a value import would inline about 250 KB of enum objects
    // per bundle, and esbuild would leave no import statement behind for the validator to see.
    const ceiling = 160 * 1024;
    for (const pack of loadPacks()) {
      if (!scriptEntry(pack)) continue;
      const bundle = bundleOf(pack.id);
      expect(bundle.length, `${pack.id} bundle is ${bundle.length} bytes`).toBeLessThan(ceiling);
      for (const name of ["MinecraftBlockTypes", "MinecraftEntityTypes", "MinecraftItemTypes"])
        expect(bundle, `${pack.id} inlines ${name}`).not.toContain(`${name} = `);
    }
  });

  it("keep every bundle to its own feature: no controller leftovers and no other pack's commands", () => {
    // The engine holds every command and enum one script module registers to a single namespace; a stray command
    // from another feature would refuse the whole registration (the mock and the engine smoke test both check the
    // rule itself). Here: no `elleedog67:` controller commands remain, and no bundle carries a neighbour's names.
    const foreign: Record<string, string[]> = {
      pets: ["sit:down", "elleedog:ender_protect", "elleedog_redstone:"],
      "stair-sit": ["pet:form", "elleedog:ender_protect"],
      "ender-mod": ["pet:form", "sit:down"],
      "creeper-mod": ["pet:", "sit:", "elleedog:ender_protect"],
    };
    for (const pack of loadPacks()) {
      if (!scriptEntry(pack)) continue;
      const bundle = bundleOf(pack.id);
      expect(bundle, pack.id).not.toContain("elleedog67:");
      for (const name of foreign[pack.id] ?? []) expect(bundle, `${pack.id} carries ${name}`).not.toContain(name);
    }
  });

  it("ship a pack icon that is opaque and visibly drawn, not a blank square", () => {
    // The game shows icons at about 48 px, where a pale drawing reads as no icon at all; the Creeper Mod icon
    // was exactly that. Require some contrast from every icon and full artwork from the ones that have it.
    for (const pack of loadPacks()) {
      const png = PNG.sync.read(fs.readFileSync(path.join(distDir(pack.id), "pack_icon.png")));
      const luminance: number[] = [];
      const colors = new Set<number>();
      for (let i = 0; i < png.data.length; i += 4) {
        const r = png.data[i] as number;
        const g = png.data[i + 1] as number;
        const b = png.data[i + 2] as number;
        expect(png.data[i + 3], `${pack.id} has a transparent pixel`).toBe(255);
        luminance.push(0.299 * r + 0.587 * g + 0.114 * b);
        colors.add((r << 16) | (g << 8) | b);
      }
      const mean = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
      const spread = Math.sqrt(luminance.reduce((sum, value) => sum + (value - mean) ** 2, 0) / luminance.length);
      expect(spread, `${pack.id} icon is nearly uniform`).toBeGreaterThan(30);
      if (pack.feature !== "stair-sit") expect(colors.size, `${pack.id} icon is not artwork`).toBeGreaterThan(1000);
    }
  });

  it("carry the license and notices in every pack", () => {
    for (const pack of loadPacks()) {
      expect(fs.existsSync(path.join(distDir(pack.id), "LICENSE")), pack.id).toBe(true);
      expect(fs.existsSync(path.join(distDir(pack.id), "THIRD_PARTY_NOTICES.md")), pack.id).toBe(true);
    }
  });

  it("ship the player override identically in Pets and Rbow Ore, and Rbow's standalone attachables", () => {
    const pets = fs.readFileSync(path.join(distDir("pets"), "entities", "overrides", "player.json"));
    const rbow = fs.readFileSync(path.join(distDir("rbow-ore"), "entities", "overrides", "player.json"));
    expect(pets.equals(rbow)).toBe(true);
    for (const name of ["rbow_helmet.player.json", "rbow_boots.player.json", "rbow_spear_native.json"]) {
      expect(fs.existsSync(path.join(distDir("rbow-ore-resources"), "attachables", name)), name).toBe(true);
      expect(fs.existsSync(path.join(distDir("pets-resources"), "attachables", name)), name).toBe(true);
    }
  });

  it("no longer ship the Paw Menu token or the ElleeDog 67 Manual", () => {
    expect(fs.existsSync(path.join(distDir("pets"), "items", "paw_token.json"))).toBe(false);
    expect(fs.existsSync(path.join(distDir("pets"), "recipes", "paw_token.json"))).toBe(false);
    expect(bundleOf("pets")).not.toContain("open_form_menu");
    for (const pack of loadPacks()) expect(pack.title, pack.id).not.toContain("(Behavior)");
  });

  it("agree with package.json on the version", () => {
    const version = (readStrictJson(path.join(REPO_ROOT, "package.json")) as { version: string }).version;
    for (const pack of loadPacks()) {
      const manifest = readStrictJson(path.join(distDir(pack.id), "manifest.json")) as {
        header: { version: number[] };
      };
      expect(manifest.header.version.join("."), pack.id).toBe(version);
    }
  });

  it("package every pack into one deterministic .mcaddon", () => {
    const [first] = packageArchives();
    const bytes = fs.readFileSync(first as string);
    const folders = new Set(Object.keys(unzipSync(bytes)).map((entry) => entry.split("/")[0]));
    expect(folders).toEqual(new Set(loadPacks().map((pack) => pack.archiveDir)));
    const [second] = packageArchives();
    expect(bytes.equals(fs.readFileSync(second as string))).toBe(true);
  });
});

// The validator's rules, proven by breaking them: each case copies one built pack into a scratch folder, doctors
// it, and checks the validator names the problem.
/** A fresh copy of one pack's build output under the scratch folder, wired into the roots the validator reads. */
function doctored(packId: string, edit: (root: string) => void): string[] {
  const root = path.join(scratch, `${packId}-${Math.random().toString(36).slice(2)}`);
  fs.cpSync(distDir(packId), root, { recursive: true });
  edit(root);
  const roots = distRoots();
  roots.set(packId, root);
  return validateBuild({ roots }).errors;
}

const write = (root: string, relative: string, value: unknown) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
};
const readJson = (root: string, relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

describe("validateBuild rejects", { timeout: 20_000 }, () => {
  it("a missing pack folder", () => {
    const roots = distRoots();
    roots.set("creeper-mod", path.join(scratch, "nowhere"));
    expect(validateBuild({ roots }).errors).toEqual([
      expect.stringMatching(/^creeper-mod: missing at /),
      "creeper-mod/manifest.json is missing or invalid",
    ]);
  });

  it("a manifest that drifted from packs.json", () => {
    const errors = doctored("creeper-mod", (root) => {
      const manifest = readJson(root, "manifest.json");
      manifest.header.description = "edited by hand";
      write(root, "manifest.json", manifest);
    });
    expect(errors).toEqual(["creeper-mod/manifest.json differs from packs.json; run `npm run manifests`"]);
  });

  it("invalid JSON and duplicate keys, the way the content log would", () => {
    const errors = doctored("creeper-mod", (root) => {
      write(root, "entities/broken.json", '{"format_version": "1.20.0", "format_version": "1.21.0"}');
      write(root, "entities/syntax.json", "{ not json");
    });
    expect(errors.some((error) => /entities\/broken\.json: duplicate key "format_version"/.test(error))).toBe(true);
    expect(errors.some((error) => /entities\/syntax\.json: /.test(error))).toBe(true);
  });

  it("a missing or wrongly sized pack icon", () => {
    expect(doctored("creeper-mod", (root) => fs.rmSync(path.join(root, "pack_icon.png")))).toEqual([
      "creeper-mod/pack_icon.png is missing",
    ]);
    const errors = doctored("creeper-mod", (root) => {
      fs.copyFileSync(
        path.join(distDir("stair-sit-resources"), "textures/entity/sit_seat.png"),
        path.join(root, "pack_icon.png"),
      );
    });
    expect(errors).toEqual(["creeper-mod/pack_icon.png must be 256x256, got 16x16"]);
  });

  it("a bundle missing where packs.json declares a script module, and scripts where it declares none", () => {
    expect(doctored("creeper-mod", (root) => fs.rmSync(path.join(root, "scripts"), { recursive: true }))).toEqual([
      "creeper-mod: scripts/main.js was not bundled",
    ]);
    expect(
      doctored("creeper-mod", (root) => write(root, "scripts/main.js", 'import "@minecraft/server-ui";\n')),
    ).toEqual([
      "creeper-mod/scripts/main.js imports undeclared module @minecraft/server-ui",
      "creeper-mod: packs.json declares @minecraft/server but scripts/main.js never imports it",
    ]);
    expect(doctored("stair-sit-resources", (root) => write(root, "scripts/main.js", "export {};\n"))).toEqual([
      "stair-sit-resources: carries scripts but declares no script module in packs.json",
    ]);
  });

  it("a vanilla identifier outside overrides/, or in a pack that may not override", () => {
    const creeper = {
      format_version: "1.21.0",
      "minecraft:entity": { description: { identifier: "minecraft:creeper" } },
    };
    expect(doctored("creeper-mod", (root) => write(root, "entities/creeper.json", creeper))).toEqual([
      "creeper-mod/entities/creeper.json: pack creeper-mod may not replace vanilla identifier minecraft:creeper",
    ]);
    expect(doctored("ender-mod", (root) => write(root, "entities/creeper.json", creeper))).toEqual([
      "ender-mod/entities/creeper.json: vanilla identifier minecraft:creeper must live under an overrides/ folder",
    ]);
    const custom = { format_version: "1.21.0", "minecraft:entity": { description: { identifier: "elleedog:extra" } } };
    expect(doctored("ender-mod", (root) => write(root, "entities/overrides/extra.json", custom))).toEqual([
      "ender-mod/entities/overrides/extra.json: lives under overrides/ but replaces no vanilla identifier",
    ]);
  });

  it("a replaced vanilla render controller file that drops one of its controllers", () => {
    // The file replaces vanilla's outright, so a controller it stops defining stops existing for every player.
    const file = "render_controllers/overrides/player.render_controllers.json";
    const errors = doctored("pets-resources", (root) => {
      const document = readJson(root, file);
      delete document.render_controllers["controller.render.player.map"];
      delete document.render_controllers["controller.render.player.third_person_spectator"];
      write(root, file, document);
    });
    expect(errors).toEqual([
      `pets-resources/${file}: replaces the vanilla file but no longer defines controller.render.player.third_person_spectator`,
      `pets-resources/${file}: replaces the vanilla file but no longer defines controller.render.player.map`,
    ]);
    const persona = "render_controllers/overrides/persona.render_controllers.json";
    expect(
      doctored("pets-resources", (root) => {
        const document = readJson(root, persona);
        delete document.render_controllers["controller.render.player.map.persona"];
        write(root, persona, document);
      }),
    ).toEqual([
      `pets-resources/${persona}: replaces the vanilla file but no longer defines controller.render.player.map.persona`,
    ]);
  });

  it("a function that gives an item its pack cannot be sure exists", () => {
    // The engine parses every function when the world opens and warns on screen for each line it cannot parse.
    const file = "functions/pet/kit.mcfunction";
    const errors = doctored("pets", (root) => {
      write(
        root,
        file,
        [
          "# vanilla, the pack's own item and a dependency's are fine; another pack's and a typo are not",
          "give @s minecraft:shield 1",
          "give @s pet:morpher_book",
          "give @s nether_brick 16",
          "give @s elleedog:rbow_helmet",
          "give @s minecraft:not_an_item",
          "",
        ].join("\n"),
      );
    });
    expect(errors).toEqual([
      `pets/${file}:5: gives elleedog:rbow_helmet, which neither pets nor a pack it depends on defines`,
      `pets/${file}:6: gives minecraft:not_an_item, which vanilla does not define`,
    ]);
  });

  it("the same identifier defined by two packs unless the pair is documented as shared", () => {
    const errors = doctored("creeper-mod", (root) => {
      write(root, "entities/target.json", {
        format_version: "1.21.0",
        "minecraft:entity": { description: { identifier: "sit:target" } },
      });
    });
    expect(errors).toEqual([expect.stringMatching(/^duplicate minecraft:entity identifier sit:target in /)]);
  });

  it("a player override that differs between Pets and Rbow Ore", () => {
    const errors = doctored("rbow-ore", (root) => {
      const player = readJson(root, "entities/overrides/player.json");
      player["minecraft:entity"].description.is_spawnable = true;
      write(root, "entities/overrides/player.json", player);
    });
    expect(errors).toEqual(["pets and rbow-ore must ship byte-identical entities/overrides/player.json"]);
  });

  it("lang files that disagree with languages.json or repeat a key", () => {
    expect(doctored("stair-sit-resources", (root) => write(root, "texts/fr_FR.lang", "a=b\n"))).toEqual([
      "stair-sit-resources/texts/languages.json does not list fr_FR",
    ]);
    expect(
      doctored("stair-sit-resources", (root) => write(root, "texts/languages.json", ["en_US", "en_GB", "de_DE"])),
    ).toEqual(["stair-sit-resources/texts/de_DE.lang is missing"]);
    const errors = doctored("stair-sit-resources", (root) => {
      const file = path.join(root, "texts/en_US.lang");
      fs.appendFileSync(file, "\nentity.sit:seat.name=Twice\nno equals sign here\n");
    });
    expect(errors).toEqual([
      "stair-sit-resources/texts/en_US.lang: duplicate key entity.sit:seat.name",
      expect.stringMatching(/^stair-sit-resources\/texts\/en_US\.lang:\d+: expected key=value$/),
    ]);
  });

  it("textures and item icons that point at nothing", () => {
    const errors = doctored("stair-sit-resources", (root) => {
      const entity = readJson(root, "entity/seat.entity.json");
      entity["minecraft:client_entity"].description.textures.default = "textures/entity/pets/nope";
      write(root, "entity/seat.entity.json", entity);
      write(root, "textures/item_texture.json", {
        resource_pack_name: "x",
        texture_name: "atlas.items",
        texture_data: { ghost: { textures: "textures/items/ghost" } },
      });
    });
    expect(errors).toEqual([
      "stair-sit-resources/textures/item_texture.json: ghost points at missing textures/items/ghost",
      "stair-sit-resources/entity/seat.entity.json: texture default points at missing textures/entity/pets/nope",
    ]);
    const icon = doctored("creeper-mod", (root) => {
      write(root, "items/thing.json", {
        format_version: "1.21.0",
        "minecraft:item": {
          description: { identifier: "elleedog:thing" },
          components: { "minecraft:icon": "no_such_icon" },
        },
      });
    });
    expect(icon).toEqual(["creeper-mod/items/thing.json: icon no_such_icon is not in any item_texture.json"]);
  });

  it("a ui folder in a resource pack", () => {
    expect(doctored("stair-sit-resources", (root) => write(root, "ui/hud_screen.json", {}))).toEqual([
      "stair-sit-resources/ui must not exist (no UI overrides)",
    ]);
  });
});
