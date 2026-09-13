import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GATE_PROPERTY,
  GATED_GOALS,
  gateFilter,
  generateEnderman,
  OUTPUT_FILE,
  UPSTREAM_FILE,
} from "../../../tools/codegen/enderman/inject.ts";
import { readJsonWithComments, readStrictJson, writeJson } from "../../../tools/lib/json.ts";

type Json = Record<string, any>;

const PROPERTY = { type: "bool", default: false, client_sync: false };
const PROVENANCE_FILE = path.join(path.dirname(UPSTREAM_FILE), "..", "PROVENANCE.json");

let scratch: string;

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ender-codegen-"));
});

afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe("enderman override codegen", () => {
  it("differs from the upstream snapshot in exactly the property and the two goal filters", () => {
    const entity = readStrictJson(OUTPUT_FILE) as Json;
    const before = readJsonWithComments(UPSTREAM_FILE) as Json;
    const e = entity["minecraft:entity"];
    expect(e.description.properties).toEqual({ [GATE_PROPERTY]: PROPERTY });
    for (const [goalId, field] of GATED_GOALS) {
      expect(e.components[goalId][field]).toEqual(gateFilter());
      delete e.components[goalId][field];
    }
    delete e.description.properties;
    expect(entity).toEqual(before);
  });

  it("retains the vanilla pickup material list, chances and carried-block placement", () => {
    const e = (readStrictJson(OUTPUT_FILE) as Json)["minecraft:entity"].components;
    expect(e["minecraft:behavior.take_block"].blocks).toContain("dirt");
    expect(e["minecraft:behavior.take_block"].chance).toBe(0.05);
    expect(e["minecraft:behavior.place_block"].chance).toBe(0.0005);
    expect(e["minecraft:behavior.place_block"].randomly_placeable_blocks).toBeUndefined();
  });

  it("is exactly what the injector produces from the snapshot, with 2-space indent and a trailing newline", () => {
    const output = path.join(scratch, "enderman.json");
    generateEnderman(UPSTREAM_FILE, output);
    const text = fs.readFileSync(output, "utf8");
    expect(text).toBe(fs.readFileSync(OUTPUT_FILE, "utf8"));
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "minecraft:entity": {\n    "description": {');
    expect(text).not.toContain("//");
  });

  it("wraps an existing filter in all_of and reaches goals housed in component groups", () => {
    const input = path.join(scratch, "upstream.json");
    const output = path.join(scratch, "out.json");
    writeJson(input, {
      format_version: "1.26.10",
      "minecraft:entity": {
        description: { identifier: "minecraft:enderman" },
        component_groups: {
          "minecraft:calm": {
            "minecraft:behavior.take_block": { priority: 11, can_take: { test: "is_daytime", value: false } },
          },
        },
        components: { "minecraft:behavior.place_block": { priority: 10 } },
      },
    });
    generateEnderman(input, output);
    const e = (readStrictJson(output) as Json)["minecraft:entity"];
    expect(e.description.properties).toEqual({ [GATE_PROPERTY]: PROPERTY });
    expect(e.component_groups["minecraft:calm"]["minecraft:behavior.take_block"]).toEqual({
      priority: 11,
      can_take: { all_of: [{ test: "is_daytime", value: false }, gateFilter()] },
    });
    expect(e.components["minecraft:behavior.place_block"]).toEqual({ priority: 10, can_place: gateFilter() });
  });

  it("fails loudly and writes nothing when a gated goal is missing", () => {
    const input = path.join(scratch, "upstream.json");
    const output = path.join(scratch, "out.json");
    writeJson(input, {
      format_version: "1.26.10",
      "minecraft:entity": {
        description: { identifier: "minecraft:enderman" },
        components: { "minecraft:behavior.take_block": { priority: 11 } },
      },
    });
    expect(() => generateEnderman(input, output)).toThrow(/minecraft:behavior\.place_block is missing/);
    expect(fs.existsSync(output)).toBe(false);
  });

  it("ships the snapshot its provenance record describes", () => {
    const provenance = readStrictJson(PROVENANCE_FILE) as Json;
    const bytes = fs.readFileSync(UPSTREAM_FILE);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(provenance.local_sha256);
    const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    expect(blob).toBe(provenance.git_blob_sha1);
    expect(provenance.tag).toBe("v1.26.40.05");
  });
});
