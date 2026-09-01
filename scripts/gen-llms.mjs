#!/usr/bin/env node
// Generates llms.txt — the published, self-contained agent spec: a task
// preamble + SPEC.md + the example YAMLs, one stable URL any AI can be
// pointed at (or have pasted into context). tests/llms.ts guards drift.
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8").trim();

const PREAMBLE = `# isokit — agent authoring spec

You are authoring an isokit diagram: an isometric architecture diagram
(Azure-marketing style) rendered from semantic YAML. The user describes a
topology; you emit the YAML; the isokit renderer does all layout, routing,
and legend derivation.

This file is self-contained: the full format contract (SPEC.md) and two
complete examples follow below. It is generated from the isokit repository
(https://github.com/zeiosmb/isokit) by \`npm run build:llms\` — do not edit
it directly.

## Your output rules

1. Emit exactly one YAML document and nothing else — no prose before or
   after it, no explanation inside it.
2. For a user in Obsidian (the common case), wrap it in an \`\`\`isokit
   code block — that is what the isokit plugin renders in-note. For a user
   running the CLI, a bare .yaml file body is fine.
3. Use only the keys, enums, and structures defined in the format contract
   below. Never invent keys, shapes, glyphs, or themes.
4. Prefer the semantic block alone (units, groups, flows, annotations):
   the renderer derives placement. Reach for the optional \`placement\`
   block only when the user asks for a specific arrangement or a render
   came back with a placement-related error.
5. If the render fails, the user will paste back a structured error block:
   it names an error code, the spec section that defines it, the line in
   your document, what went wrong, and how to fix it. Apply exactly that
   fix and re-emit the full corrected document.
6. Never generate base64, data URIs, or SVG yourself — YAML only; the
   renderer owns the drawing.

The format contract follows, then two worked examples.

---
`;

const body = [
  PREAMBLE,
  read("SPEC.md"),
  "\n---\n\n# Example 1: minimal (semantic block only — placement derived)\n",
  "```yaml\n" + read("examples/minimal.yaml") + "\n```",
  "\n# Example 2: hybrid (two estates, annotations, a placement override)\n",
  "```yaml\n" + read("examples/hybrid.yaml") + "\n```",
  "",
].join("\n");

fs.writeFileSync(path.join(root, "llms.txt"), body);
console.log("wrote llms.txt", Math.round(body.length / 1024), "KB");
