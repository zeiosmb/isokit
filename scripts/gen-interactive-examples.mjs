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
  const names = fs.readdirSync(staging).sort();
  for (const name of names) {
    const svg = fs.readFileSync(path.join(staging, name), "utf8");
    fs.writeFileSync(path.join(outDir, name), withControls(svg));
    console.log("wrote", path.join("examples", "interactive", name));
  }

  // Gallery index. Thumbnails use <img> (scripts don't run there — static
  // render only); the link opens the SVG as its own document, where the
  // embedded pan/zoom/legend controls are live.
  const cards = names.map(n => {
    const title = n.replace(/\.svg$/, "");
    return `    <a class="card" href="./${encodeURIComponent(n)}">
      <img src="./${encodeURIComponent(n)}" alt="${title}" loading="lazy">
      <span>${title}</span>
    </a>`;
  }).join("\n");
  fs.writeFileSync(path.join(outDir, "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>isokit — interactive examples</title>
<style>
  body { margin: 0; padding: 24px; background: #101623; color: #dbe4f0;
         font-family: ui-monospace, "JetBrains Mono", monospace; }
  h1 { font-size: 18px; letter-spacing: 2px; margin: 0 0 4px; }
  p  { margin: 0 0 20px; color: #8fa1bb; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
  .card { display: block; text-decoration: none; color: inherit; background: #182236;
          border: 1px solid #263450; border-radius: 8px; overflow: hidden; }
  .card:hover { border-color: #4f7ec4; }
  .card img { width: 100%; height: auto; display: block; background: #0d1420; }
  .card span { display: block; padding: 8px 12px; font-size: 13px; }
</style>
</head>
<body>
<h1>ISOKIT — INTERACTIVE EXAMPLES</h1>
<p>Click a diagram to open it standalone: +/− or ctrl/cmd+scroll to zoom, drag to pan,
double-click to reset, »/« to collapse the legend. (Thumbnails are static — the
controls only run when the SVG is its own document.)</p>
<div class="grid">
${cards}
</div>
</body>
</html>
`);
  console.log("wrote", path.join("examples", "interactive", "index.html"));
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
