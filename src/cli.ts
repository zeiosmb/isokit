#!/usr/bin/env node
// src/cli.ts — the thin Node shell: argv, file I/O, exit codes, xmllint.
// All rendering logic lives behind the pure core; this file only feeds it.
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseYaml } from "./yaml.ts";
import { validate } from "./schema.ts";
import { derive } from "./semantic.ts";
import { IsokitError, formatError } from "./error.ts";
import { out } from "./io.ts";

const args = process.argv.slice(2);
const oi = args.indexOf("-o");
const dest0 = oi !== -1 ? args[oi + 1] : undefined;
const pos = oi === -1 ? args : args.filter((_, i) => i !== oi && i !== oi + 1);
if (pos[0] !== "render" || pos.length !== 2 || (oi !== -1 && !dest0)) {
  console.error("usage: isokit render <file.yaml> [-o out.svg]");
  process.exit(2);
}
const file = pos[1];
try {
  let text: string;
  try { text = fs.readFileSync(file, "utf8"); }
  catch {
    throw new IsokitError({ code: "file-unreadable", section: "cli",
      what: `cannot read "${file}".`, fix: "check the path and permissions" });
  }
  const diagram = validate(parseYaml(text));
  const svg = derive(diagram);
  if (dest0 === undefined) {
    const bad = [...diagram.title].find(ch => ch === "/" || ch === "\\");
    if (bad || diagram.title.startsWith(".")) {
      const offending = bad ?? diagram.title[0];
      throw new IsokitError({ code: "title-not-a-filename", section: "cli",
        what: `title "${diagram.title}" cannot be used as a filename: it contains "${offending}".`,
        fix: 'quote a title without "/" or leading "." — or pass -o to choose the output path' });
    }
  }
  const dest = dest0 ?? out(`${diagram.title}.svg`);
  fs.writeFileSync(dest, svg);
  const ok = spawnSync("xmllint", ["--noout", dest], { stdio: "inherit" }).status === 0;
  console.log(ok ? "valid" : "INVALID", Math.floor(fs.statSync(dest).size / 1024), "KB", dest);
  process.exit(ok ? 0 : 1);
} catch (e) {
  if (e instanceof IsokitError) { process.stderr.write(formatError(e, file)); process.exit(1); }
  throw e;   // a non-IsokitError here is a renderer bug — let it crash loudly
}
