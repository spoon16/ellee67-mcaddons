import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const DIST = path.join(REPO_ROOT, "dist");
/** One entry file per behavior pack, named after its feature: src/packs/<feature>.ts. */
export const PACK_ENTRIES = path.join(REPO_ROOT, "src", "packs");
export const PACKS_FILE = path.join(REPO_ROOT, "packs.json");
