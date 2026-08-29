// tests/yaml.ts — IsokitError contract + YAML subset parser coverage.
import { IsokitError, formatError } from "../src/error.ts";

let fail = 0;
function ok(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); fail++; }
}
function expectErr(name: string, fn: () => unknown, code: string, line?: number): void {
  try { fn(); console.error(`FAIL ${name}: did not throw`); fail++; }
  catch (e) {
    if (!(e instanceof IsokitError)) { console.error(`FAIL ${name}: not IsokitError: ${e}`); fail++; return; }
    if (e.code !== code) { console.error(`FAIL ${name}: code ${e.code} != ${code}`); fail++; }
    if (line !== undefined && e.line !== line) { console.error(`FAIL ${name}: line ${e.line} != ${line}`); fail++; }
  }
}

const e = new IsokitError({ code: "flow-unknown-unit", section: "flows", line: 24,
  path: "flows[2].from", what: '"gwx" is not a declared unit.', fix: 'change "from" to a declared name.' });
ok("error message carries code", e.message.includes("[flow-unknown-unit]"));
const block = formatError(e, "diagram.yaml");
ok("block line 1", block.startsWith("isokit error [flow-unknown-unit] (spec: flows)"));
ok("block location", block.includes("  at diagram.yaml line 24 (flows[2].from)"));
ok("block what", block.includes('  "gwx" is not a declared unit.'));
ok("block fix", block.includes("  fix: change"));
const e2 = new IsokitError({ code: "engine-guard", section: "layout-derivation",
  what: "unit overlap.", fix: "move the pin." });
ok("no-line location omits line", formatError(e2, "d.yaml").includes("  at d.yaml\n"));

import { parseYaml, type YMap, type YList, type YScalar, type YNode } from "../src/yaml.ts";

function get(m: YNode, key: string): YNode {
  const hit = (m as YMap).entries.find(([k]) => k === key);
  if (!hit) throw new Error(`missing key ${key}`);
  return hit[1];
}
const scalar = (n: YNode) => (n as YScalar).value;

const doc = parseYaml([
  "isokit: 1                # version",
  'title: "HYBRID: ON-PREM"',
  "theme: azure",
  "",
  "units:",
  "  vpngw:",
  "    shape: box",
  "    glyph: gw",
  "flows:",
  "  - 12",
  "  - hello",
].join("\n"));
ok("root is map", doc.kind === "map");
ok("int scalar", scalar(get(doc, "isokit")) === 1);
ok("quoted string keeps colon", scalar(get(doc, "title")) === "HYBRID: ON-PREM");
ok("comment stripped", scalar(get(doc, "theme")) === "azure");
ok("nested map", scalar(get(get(get(doc, "units"), "vpngw"), "shape")) === "box");
ok("nested map line", get(get(doc, "units"), "vpngw").line === 6);
const fl = get(doc, "flows") as YList;
ok("block list", fl.items.length === 2 && scalar(fl.items[0]) === 12 && scalar(fl.items[1]) === "hello");
ok("declaration order", (doc as YMap).entries.map(([k]) => k).join(",") === "isokit,title,theme,units,flows");

expectErr("tab indent", () => parseYaml("a: 1\n\tb: 2"), "yaml-tab-indent", 2);
expectErr("multidoc", () => parseYaml("---\na: 1"), "yaml-multidoc", 1);
expectErr("duplicate key", () => parseYaml("a: 1\na: 2"), "yaml-duplicate-key", 2);
expectErr("missing value", () => parseYaml("a: 1\nb:"), "yaml-missing-value", 2);
expectErr("bad indent", () => parseYaml("a: 1\n   b: 2"), "yaml-bad-indent", 2);
expectErr("empty doc", () => parseYaml("# just a comment\n"), "yaml-empty");
expectErr("unquoted colon", () => parseYaml("title: HYBRID: ON-PREM"), "yaml-quote-required", 1);
expectErr("ambiguous scalar", () => parseYaml("a: yes"), "yaml-ambiguous-scalar", 1);
expectErr("anchor", () => parseYaml("a: &x 1"), "yaml-unsupported-syntax", 1);
expectErr("block scalar", () => parseYaml("a: |"), "yaml-unsupported-syntax", 1);
expectErr("unterminated string", () => parseYaml('a: "oops'), "yaml-unterminated-string", 1);

expectErr("capitalized True", () => parseYaml("a: True"), "yaml-ambiguous-scalar", 1);
expectErr("capitalized FALSE", () => parseYaml("a: FALSE"), "yaml-ambiguous-scalar", 1);

const doc2 = parseYaml([
  "estates:",
  "  cloud: {}",
  "units:",
  '  vpngw: { shape: box, glyph: gw, label: "a, b" }',
  "flows:",
  "  - { from: hq, to: vpngw, style: sync }",
  "placement:",
  "  units:",
  "    entra: [1, 1]",
  "  flows:",
  "    - { from: fw, to: app1, via: [[6.5, 2.0], [6.5, 4]] }",
].join("\n"));
ok("empty inline map", (get(get(doc2, "estates"), "cloud") as YMap).entries.length === 0);
const vg = get(get(doc2, "units"), "vpngw") as YMap;
ok("inline map values", scalar(get(vg, "shape")) === "box" && scalar(get(vg, "glyph")) === "gw");
ok("quoted comma survives inline", scalar(get(vg, "label")) === "a, b");
const f0 = (get(doc2, "flows") as YList).items[0] as YMap;
ok("inline map in block list", scalar(get(f0, "from")) === "hq" && scalar(get(f0, "style")) === "sync");
const pin = get(get(get(doc2, "placement"), "units"), "entra") as YList;
ok("inline list of ints", pin.items.length === 2 && scalar(pin.items[0]) === 1);
const via = get((get(get(doc2, "placement"), "flows") as YList).items[0] as YMap, "via") as YList;
ok("nested inline lists", (via.items[0] as YList).items.length === 2
  && scalar((via.items[0] as YList).items[0]) === 6.5);
ok("inline node lines", f0.line === 6 && via.line === 11);

expectErr("unterminated inline map", () => parseYaml("a: { b: 1"), "yaml-unterminated-flow", 1);
expectErr("unterminated inline list", () => parseYaml("a: [1, 2"), "yaml-unterminated-flow", 1);
expectErr("trailing content", () => parseYaml("a: [1] extra"), "yaml-trailing-content", 1);
expectErr("dup key inline", () => parseYaml("a: { b: 1, b: 2 }"), "yaml-duplicate-key", 1);
expectErr("empty inline value", () => parseYaml("a: { b: , c: 1 }"), "yaml-missing-value", 1);

// deep nesting must be a coded error, not a stack-overflowing crash
{
  let deepInline = "a: ";
  for (let i = 0; i < 40; i++) deepInline += "{ b: ";
  deepInline += "1";
  for (let i = 0; i < 40; i++) deepInline += " }";
  expectErr("40-deep inline map", () => parseYaml(deepInline), "yaml-unsupported-syntax");
}
{
  const lines: string[] = [];
  for (let i = 0; i < 40; i++) lines.push("  ".repeat(i) + `k${i}:` + (i === 39 ? " 1" : ""));
  expectErr("40-deep block map", () => parseYaml(lines.join("\n")), "yaml-unsupported-syntax");
}

process.exit(fail ? 1 : 0);
