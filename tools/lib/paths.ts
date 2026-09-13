import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const DIST = path.join(REPO_ROOT, "dist");
export const SCRIPT_ENTRY = path.join(REPO_ROOT, "src", "main.ts");
export const PACKS_FILE = path.join(REPO_ROOT, "packs.json");
