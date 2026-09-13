import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const PACK_NAME = "elleedog67";
export const BP_SOURCE = path.join(REPO_ROOT, "behavior_packs", PACK_NAME);
export const RP_SOURCE = path.join(REPO_ROOT, "resource_packs", PACK_NAME);
export const DIST = path.join(REPO_ROOT, "dist");
export const DIST_BP = path.join(DIST, "behavior_pack");
export const DIST_RP = path.join(DIST, "resource_pack");
export const SCRIPT_ENTRY = path.join(REPO_ROOT, "src", "main.ts");
