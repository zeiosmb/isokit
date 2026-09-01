// llms.txt drift guard: the published agent spec is generated from SPEC.md
// + the example YAMLs (scripts/gen-llms.mjs). If any source changes without
// regenerating, or the file loses its agent framing, this fails.
import * as fs from "node:fs";

let fail = 0;
function ok(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); fail++; }
}

const llms = fs.readFileSync("llms.txt", "utf8");
const spec = fs.readFileSync("SPEC.md", "utf8");
const minimal = fs.readFileSync("examples/minimal.yaml", "utf8");
const hybrid = fs.readFileSync("examples/hybrid.yaml", "utf8");

// generated content is verbatim-inlined — any source edit shows up as drift
ok("llms.txt inlines SPEC.md verbatim", llms.includes(spec.trim()));
ok("llms.txt inlines minimal.yaml verbatim", llms.includes(minimal.trim()));
ok("llms.txt inlines hybrid.yaml verbatim", llms.includes(hybrid.trim()));

// the agent framing the preamble must carry
ok("tells the agent to emit an ```isokit code block", llms.includes("```isokit"));
ok("tells the agent YAML only / no invented keys", llms.includes("Never invent keys"));
ok("tells the agent about the error self-correction loop", llms.includes("re-emit"));
ok("identifies itself for regeneration", llms.includes("npm run build:llms"));

process.exit(fail ? 1 : 0);
