import fs from "node:fs";
import path from "node:path";
import { type Node, type ParseError, parse, parseTree, printParseErrorCode } from "jsonc-parser";

export class JsonFileError extends Error {}

function walk(node: Node | undefined, file: string, errors: string[], trail: string[]): void {
  if (!node) return;
  if (node.type === "object") {
    const seen = new Set<string>();
    for (const property of node.children ?? []) {
      const key = property.children?.[0]?.value as string | undefined;
      if (key === undefined) continue;
      if (seen.has(key)) errors.push(`${file}: duplicate key "${[...trail, key].join(".")}"`);
      seen.add(key);
      walk(property.children?.[1], file, errors, [...trail, key]);
    }
  } else if (node.type === "array") {
    (node.children ?? []).forEach((child, index) => {
      walk(child, file, errors, [...trail, String(index)]);
    });
  }
}

/** Parses JSON strictly: syntax errors and duplicate object keys both fail, matching the engine's content log. */
export function readStrictJson(file: string): unknown {
  const text = fs.readFileSync(file, "utf8");
  const parseErrors: ParseError[] = [];
  const tree = parseTree(text, parseErrors, { allowTrailingComma: false, disallowComments: true });
  const problems = parseErrors.map((error) => `${file}: ${printParseErrorCode(error.error)} at offset ${error.offset}`);
  walk(tree, file, problems, []);
  if (problems.length) throw new JsonFileError(problems.join("\n"));
  return JSON.parse(text);
}

/** Parses JSON that may carry `//` comments (Mojang sample files do). Duplicate keys still fail. */
export function readJsonWithComments(file: string): unknown {
  const text = fs.readFileSync(file, "utf8");
  const parseErrors: ParseError[] = [];
  const tree = parseTree(text, parseErrors, { allowTrailingComma: true, disallowComments: false });
  const problems = parseErrors.map((error) => `${file}: ${printParseErrorCode(error.error)} at offset ${error.offset}`);
  walk(tree, file, problems, []);
  if (problems.length) throw new JsonFileError(problems.join("\n"));
  return parse(text, undefined, { allowTrailingComma: true, disallowComments: false });
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
