// src/io.ts — everything in the render pipeline that touches the machine:
// output-path resolution and file writing. src/isokit.ts stays free of
// node: imports so render() can run in browsers and Obsidian.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { runChecks } from "./isokit.ts";

/** Resolve an output path for `name`: $ISOKIT_OUT if set, else the first
`isokit.local` file found walking up from cwd (its first line = output
dir), else ./out. The directory is created if missing. */
export function out(name: string): string {
  let d = process.env.ISOKIT_OUT;
  if (!d) {
    let p = process.cwd();
    while (true) {
      const f = path.join(p, "isokit.local");
      if (fs.existsSync(f)) { d = fs.readFileSync(f, "utf8").trim(); break; }
      const parent = path.dirname(p);
      if (parent === p) break;
      p = parent;
    }
  }
  d = d || path.join(process.cwd(), "out");
  if (d === "~" || d.startsWith("~/")) d = path.join(os.homedir(), d.slice(1));
  fs.mkdirSync(d, { recursive: true });
  return path.join(d, name);
}

export function write(pathOut: string, parts: string[]): void {
  runChecks();
  fs.writeFileSync(pathOut, parts.concat(["</svg>"]).join("\n"));
  const ok = spawnSync("xmllint", ["--noout", pathOut], { stdio: "inherit" }).status === 0;
  console.log(ok ? "valid" : "INVALID", Math.floor(fs.statSync(pathOut).size / 1024), "KB", pathOut);
}
