// Keeps package.json and every pack manifest on the same version.
//   npm run bump -- 0.2.0        runs `npm version 0.2.0`, which commits, tags and (via the "version" hook) rewrites the manifests
//   tsx tools/set-version.ts --from-package   rewrites the manifests from package.json (what the hook runs)
import { execFileSync } from "node:child_process";
import { REPO_ROOT } from "./lib/paths.ts";
import { writeManifests } from "./manifests.ts";

const argument = process.argv[2];
if (argument === "--from-package") {
  const files = writeManifests();
  console.log(`manifests rewritten: ${files.length}`);
} else if (argument) {
  if (!/^\d+\.\d+\.\d+$/.test(argument)) {
    console.error(`version must be MAJOR.MINOR.PATCH, got ${argument}`);
    process.exit(2);
  }
  execFileSync("npm", ["version", argument], { cwd: REPO_ROOT, stdio: "inherit" });
} else {
  console.error("usage: npm run bump -- <major.minor.patch>");
  process.exit(2);
}
