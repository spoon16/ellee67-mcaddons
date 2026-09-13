// rules.ts and legacy_drop_logic.ts are TypeScript ports of the Rbow 1.2.0 scripts vendored under tools/codegen/pets and
// hash-pinned by that integration, whose codegen refuses to run if the pinned inputs drift. Each port's header cites the
// sha256 of the script it was ported from; if the pin or the vendored copy stops matching that citation, upstream has
// moved and the port must be re-reviewed against it.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repo = (path: string) => new URL(`../../../${path}`, import.meta.url);
const pinned: Record<string, string> = JSON.parse(
  readFileSync(repo("tools/codegen/pets/integration/RBOW_INPUT_SHA256.json"), "utf8"),
);
const vendored = (name: string) => repo(`tools/codegen/pets/integration/rbow_1.2.0/behavior_pack/scripts/${name}`);
const sha256 = (path: URL) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** The hash cited by `// Ported from Rbow Ore 1.2.0 behavior_pack/scripts/<name>.js (sha256 <hex>); ...` in the port. */
function citedHash(name: string): string | undefined {
  const port = readFileSync(repo(`src/features/rbow-ore/${name}.ts`), "utf8");
  const header = new RegExp(
    `^// Ported from Rbow Ore 1\\.2\\.0 behavior_pack/scripts/${name}\\.js \\(sha256 ([0-9a-f]{64})\\);`,
    "m",
  );
  return header.exec(port)?.[1];
}

describe("rbow-ore pinned sources", () => {
  for (const name of ["rules", "legacy_drop_logic"]) {
    const cited = citedHash(name);

    it(`${name}.ts cites the sha256 pinned by the Rbow integration for ${name}.js`, () => {
      expect(cited).toBeDefined();
      expect(cited).toBe(pinned[`behavior_pack/scripts/${name}.js`]);
    });

    it(`${name}.ts cites the sha256 of the vendored Rbow 1.2.0 ${name}.js`, () => {
      expect(cited).toBe(sha256(vendored(`${name}.js`)));
    });
  }
});
