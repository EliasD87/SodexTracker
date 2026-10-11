/**
 * Bundles the publisher (and the site's store code it uses) into one file for
 * the VPS, with no dependencies: `node collector/publisher/build.mjs`.
 * Output: collector/publisher/dist/publisher.mjs
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const out = path.join(here, "dist", "publisher.mjs");

const args = [
  "--yes",
  "esbuild@0.25.10",
  path.relative(root, path.join(here, "publish.ts")),
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node22",
  "--tsconfig=tsconfig.json",
  `--outfile=${path.relative(root, out)}`,
  "--log-level=warning",
];
// Windows needs a shell to run npx.cmd; paths are relative to the project, so
// the spaces in its folder name never reach the command line.
execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", args, { stdio: "inherit", cwd: root, shell: process.platform === "win32" });
console.log(`built ${path.relative(root, out)}`);
