/**
 * Builds the VPS upload: deploy/sodex-vps.tar.gz, unpacking to ~/sodex.
 *   node deploy/build-vps.mjs
 *
 * Contents: the collector (plain Node, no dependencies), the publisher bundled
 * into one file, systemd services, install/status scripts, the Supabase SQL
 * and the setup guide. Never the local database, logs or any .env.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const stage = path.join(here, ".build");
const app = path.join(stage, "sodex");
const out = path.join(here, "sodex-vps.tar.gz");

execFileSync(process.execPath, [path.join(root, "collector", "publisher", "build.mjs")], { stdio: "inherit" });

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(app, "collector"), { recursive: true });
fs.mkdirSync(path.join(app, "publisher"), { recursive: true });

fs.cpSync(path.join(root, "collector", "src"), path.join(app, "collector", "src"), {
  recursive: true,
  // The *-test.mjs checks are for the dev machine (one needs the site's source).
  filter: (p) => !p.endsWith(".lock") && !path.basename(p).startsWith(".tmp") && !p.endsWith("-test.mjs"),
});
for (const f of ["README.md", "DATA_NEEDS.md"]) fs.copyFileSync(path.join(root, "collector", f), path.join(app, "collector", f));
fs.copyFileSync(path.join(root, "collector", "publisher", "dist", "publisher.mjs"), path.join(app, "publisher", "publisher.mjs"));
fs.cpSync(path.join(here, "vps"), app, { recursive: true });

// Unix line endings for the shell scripts and services.
for (const f of [
  "install.sh",
  "status.sh",
  "trim-logs.sh",
  "env.example",
  "systemd/sodex-collector.service",
  "systemd/sodex-publisher.service",
  "systemd/sodex-logtrim.service",
  "systemd/sodex-logtrim.timer",
]) {
  const p = path.join(app, f);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
}

fs.rmSync(out, { force: true });
execFileSync("tar", ["-czf", path.relative(stage, out), "sodex"], { cwd: stage, stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });
console.log(`built ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
