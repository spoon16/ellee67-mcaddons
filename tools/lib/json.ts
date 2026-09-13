import fs from "node:fs";
import { type Node, type ParseError, parseTree, printParseErrorCode } from "jsonc-parser";

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
  return JSON.parse(stripComments(text));
}

function stripComments(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    const next = text[i + 1];
    if (inString) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        i++;
      } else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else out += char;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(require_dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function require_dirname(file: string): string {
  return file.slice(0, Math.max(0, file.lastIndexOf("/")));
}
