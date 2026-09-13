// rules.js and legacy_drop_logic.js ship byte-for-byte as pinned by the Rbow 1.2.0 integration; the codegen
// refuses to run if the pinned inputs drift, so the copies under src/ must match them exactly.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repo = (path: string) => new URL(`../../../${path}`, import.meta.url);
const pinned: Record<string, string> = JSON.parse(
  readFileSync(repo("tools/codegen/pets/integration/RBOW_INPUT_SHA256.json"), "utf8"),
);
const vendored = (name: string) => repo(`tools/codegen/pets/integration/rbow_1.2.0/behavior_pack/scripts/${name}`);

describe("rbow-ore pinned sources", () => {
  for (const name of ["rules.js", "legacy_drop_logic.js"]) {
    const shipped = readFileSync(repo(`src/features/rbow-ore/${name}`));

    it(`${name} matches the sha256 pinned by the Rbow integration`, () => {
      expect(createHash("sha256").update(shipped).digest("hex")).toBe(pinned[`behavior_pack/scripts/${name}`]);
    });

    it(`${name} is byte-identical to the vendored Rbow 1.2.0 copy`, () => {
      expect(shipped.equals(readFileSync(vendored(name)))).toBe(true);
    });
  }
});
