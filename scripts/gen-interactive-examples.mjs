#!/usr/bin/env node
// Renders every layout/example that has a golden and writes an interactive
// twin (pan/zoom + legend-collapse, self-contained via <script>) into
// examples/interactive/. Mirrors tests/check-golden.sh's render list.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "examples", "interactive");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const staging = fs.mkdtempSync(path.join(root, "tests", "out", ".interactive-"));
try {
  for (const f of fs.readdirSync(path.join(root, "layouts")).filter(f => f.endsWith(".ts"))) {
    execFileSync("node", [path.join("layouts", f)], { cwd: root, env: { ...process.env, ISOKIT_OUT: staging } });
  }
  execFileSync("node", ["src/cli.ts", "render", "examples/minimal.yaml", "-o", path.join(staging, "Minimal.svg")], { cwd: root });
  execFileSync("node", ["src/cli.ts", "render", "examples/hybrid.yaml", "-o", path.join(staging, "Hybrid Semantic.svg")], { cwd: root });

  const { withControls } = await import(path.join(root, "src", "interactive.ts"));
  for (const name of fs.readdirSync(staging)) {
    const svg = fs.readFileSync(path.join(staging, name), "utf8");
    fs.writeFileSync(path.join(outDir, name), withControls(svg));
    console.log("wrote", path.join("examples", "interactive", name));
  }
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
