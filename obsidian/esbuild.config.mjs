// Bundle the plugin for Obsidian: one CJS main.js next to manifest.json.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(here, "main.ts")],
  outfile: path.join(here, "main.js"),
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2020",
  logLevel: "warning",
});
