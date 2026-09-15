import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const DIST = path.join(REPO_ROOT, "dist");
/** One entry file per behavior pack, named after its feature: src/packs/<feature>.ts. */
export const PACK_ENTRIES = path.join(REPO_ROOT, "src", "packs");
export const PACKS_FILE = path.join(REPO_ROOT, "packs.json");

/**
 * Whether the module at `moduleUrl` (`import.meta.url`) is the script Node was started with, so a tool can double
 * as a library. Both sides go through the filesystem path: comparing against `URL.pathname` breaks on any checkout
 * whose path needs percent-encoding, such as one with a space in it.
 */
export function isMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return !!entry && path.resolve(entry) === fileURLToPath(moduleUrl);
}
