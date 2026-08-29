// tests/validate.ts — one fixture per validator error code, plus the happy
// path. Fixtures tagged "structural" also drive the JSON Schema drift-guard
// (Task 8); "referential" failures are validator-only by design.
import * as fs from "node:fs";
import { parseYaml } from "../src/yaml.ts";
import { validate } from "../src/schema.ts";
import { IsokitError } from "../src/error.ts";
import { schemaOk, toPlain } from "./jsonschema.ts";

let fail = 0;
function ok(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); fail++; }
}
export const CODES_SEEN = new Set<string>();
function expectErr(name: string, yaml: string, code: string): void {
  try { validate(parseYaml(yaml)); console.error(`FAIL ${name}: did not throw`); fail++; }
  catch (e) {
    if (!(e instanceof IsokitError) || e.code !== code) {
      console.error(`FAIL ${name}: ${e instanceof IsokitError ? e.code : e} != ${code}`); fail++;
    } else CODES_SEEN.add(e.code);
  }
}

const GOOD = `isokit: 1
title: "T"
theme: azure
estates:
  cloud: {}
  on-prem: { tone: dark }
units:
  a: { shape: box, glyph: gw, accent: 1 }
  b: { shape: cyl }
groups:
  g1: { label: G ONE, units: [a], estate: cloud }
  g2: { label: G TWO, units: [b], estate: on-prem }
flows:
  - { from: a, to: b, style: data }
annotations:
  a: { title: Unit A, note: does the thing. }
placement:
  groups:
    g1: { origin: [2, 2], cols: 1 }
`;
const d = validate(parseYaml(GOOD));
ok("title", d.title === "T");
ok("theme", d.theme === "azure");
ok("dark estate", d.estates.get("on-prem")!.dark === true && d.estates.get("cloud")!.dark === false);
ok("unit parsed", d.units.get("a")!.shape === "box" && d.units.get("a")!.accent === 1);
ok("default flow style", validate(parseYaml(
  'isokit: 1\ntitle: "T"\nunits:\n  a: { shape: box }\n  b: { shape: box }\ngroups:\n  g: { label: L, units: [a, b] }\nflows:\n  - { from: a, to: b }\n'
)).flows[0].style === "request");
ok("default theme", validate(parseYaml(
  'isokit: 1\ntitle: "T"\nunits:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\n'
)).theme === "blueprint");
ok("annotation carries unit + order", d.annotations[0].unit === "a" && d.annotations[0].title === "Unit A");
ok("placement origin", d.placeGroups.get("g1")!.origin[0] === 2);

// structural errors
const BASE = 'isokit: 1\ntitle: "T"\n';
const UNKNOWN_TOP_KEY = 'isokit: 1\ntitle: "T"\nbogus: 1\nunits:\n  a: { shape: box }\n';
const BAD_SHAPE = 'isokit: 1\ntitle: "T"\nunits:\n  a: { shape: blob }\n';
const BAD_THEME = 'isokit: 1\ntitle: "T"\ntheme: neon\nunits:\n  a: { shape: box }\n';
const TITLE_MISSING = "isokit: 1\nunits:\n  a: { shape: box }\n";
const VERSION_WRONG = 'isokit: 2\ntitle: "T"\nunits:\n  a: { shape: box }\n';
const ORIGIN_NOT_PAIR = 'isokit: 1\ntitle: "T"\nunits:\n  a: { shape: box }\nplacement:\n  groups:\n    g: { origin: [1] }\n';
const GROUP_EMPTY = BASE + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [] }\nplacement:\n  units:\n    a: [1, 1]\n";

expectErr("doc not map", "- 1", "doc-not-map");
expectErr("version missing", 'title: "T"\nunits:\n  a: { shape: box }\n', "version-missing");
expectErr("version unsupported", VERSION_WRONG, "version-unsupported");
expectErr("title missing", TITLE_MISSING, "key-missing");
expectErr("unknown top key", UNKNOWN_TOP_KEY, "key-unknown");
expectErr("unknown unit key", 'isokit: 1\ntitle: "T"\nunits:\n  a: { shape: box, size: 3 }\n', "key-unknown");
expectErr("bad shape", BAD_SHAPE, "enum-invalid");
expectErr("bad theme", BAD_THEME, "enum-invalid");
expectErr("bad accent", 'isokit: 1\ntitle: "T"\nunits:\n  a: { shape: box, accent: 4 }\n', "enum-invalid");
expectErr("bad style", 'isokit: 1\ntitle: "T"\nunits:\n  a: { shape: box }\nflows:\n  - { from: a, to: a, style: laser }\n', "enum-invalid");
expectErr("type mismatch", 'isokit: 1\ntitle: 7\nunits:\n  a: { shape: box }\n', "type-mismatch");
expectErr("units missing", 'isokit: 1\ntitle: "T"\n', "key-missing");
expectErr("origin not a pair", ORIGIN_NOT_PAIR, "type-mismatch");
expectErr("xml char in text", 'isokit: 1\ntitle: "A & B"\nunits:\n  a: { shape: box }\n', "text-unsupported-char");

// referential errors
expectErr("flow unknown unit", BASE
  + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\nflows:\n  - { from: a, to: zz }\n",
  "flow-unknown-unit");
expectErr("group unknown unit", BASE
  + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a, zz] }\n",
  "group-unknown-unit");
expectErr("annotation unknown unit", BASE
  + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\nannotations:\n  zz: { title: X, note: y. }\n",
  "annotation-unknown-unit");
expectErr("unit unplaced", BASE + "units:\n  a: { shape: box }\n  b: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\n",
  "unit-unplaced");
expectErr("unit in two groups", BASE
  + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\n  h: { label: M, units: [a] }\n",
  "unit-doubly-placed");
expectErr("unit grouped and pinned", BASE
  + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\nplacement:\n  units:\n    a: [4, 4]\n",
  "unit-doubly-placed");
expectErr("estate too many", BASE + "estates:\n  x: {}\n  y: {}\n  z: {}\nunits:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\n",
  "estate-too-many");
expectErr("two dark estates", BASE + "estates:\n  x: { tone: dark }\n  y: { tone: dark }\nunits:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\n",
  "estate-multiple-dark");
expectErr("estate unknown", BASE + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a], estate: nowhere }\n",
  "estate-unknown");
expectErr("glyph on glyphless shape", BASE + "units:\n  a: { shape: cyl, glyph: gw }\ngroups:\n  g: { label: L, units: [a] }\n",
  "glyph-unsupported-shape");
expectErr("name collision", BASE + "units:\n  a: { shape: box }\ngroups:\n  a: { label: L, units: [a] }\n",
  "name-collision");
expectErr("placement unknown group", BASE + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\nplacement:\n  groups:\n    zz: { origin: [1, 1] }\n",
  "placement-unknown-group");
expectErr("placement unknown unit", BASE + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\nplacement:\n  units:\n    zz: [1, 1]\n",
  "placement-unknown-unit");
expectErr("placement unknown flow", BASE
  + "units:\n  a: { shape: box }\n  b: { shape: box }\ngroups:\n  g: { label: L, units: [a, b] }\nflows:\n  - { from: a, to: b }\nplacement:\n  flows:\n    - { from: b, to: a, via: [[1, 1]] }\n",
  "placement-unknown-flow");
expectErr("pin off grid", BASE + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\nplacement:\n  units:\n    b: [1.5, 2]\n",
  "placement-unknown-unit");  // unknown fires first; the off-grid case:
expectErr("pin off grid 2", BASE + "units:\n  a: { shape: box }\n  b: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\nplacement:\n  units:\n    b: [1.5, 2]\n",
  "pin-off-grid");
expectErr("origin off grid", BASE + "units:\n  a: { shape: box }\ngroups:\n  g: { label: L, units: [a] }\nplacement:\n  groups:\n    g: { origin: [1.5, 1] }\n",
  "pin-off-grid");
expectErr("units empty", BASE + "units: {}\n", "units-empty");

// STRUCTURAL fixtures: [name, yamlText, validAgainstValidator]
// (referential failures — unknown names, exclusivity — legally PASS the
// JSON Schema; keep them out of this list)
const STRUCTURAL: [string, string, boolean][] = [
  ["good doc", GOOD, true],
  ["unknown top key", UNKNOWN_TOP_KEY, false],
  ["bad shape", BAD_SHAPE, false],
  ["bad theme", BAD_THEME, false],
  ["title missing", TITLE_MISSING, false],
  ["version wrong", VERSION_WRONG, false],
  ["origin not pair", ORIGIN_NOT_PAIR, false],
  ["group empty", GROUP_EMPTY, false],
];
const schema = JSON.parse(fs.readFileSync(new URL("../schema/isokit-1.json", import.meta.url), "utf8"));
for (const [name, yaml, valid] of STRUCTURAL) {
  const verdict = schemaOk(schema, toPlain(parseYaml(yaml)));
  ok(`drift-guard: ${name}`, verdict === valid);
}

// every code raised anywhere must have a row in SPEC.md's error table, and
// every section cited must be a SPEC.md heading. Codes come from the union
// of: codes seen in this run, plus a static grep of the source for
// code: "..." literals (so codes only reachable at derivation are covered).
const spec = fs.readFileSync(new URL("../SPEC.md", import.meta.url), "utf8");
const tableCodes = new Set([...spec.matchAll(/^\| `([a-z0-9-]+)`/gm)].map(m => m[1]));
const srcCodes = new Set<string>();
for (const f of ["error.ts", "yaml.ts", "schema.ts", "semantic.ts", "cli.ts"]) {
  const src = fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  for (const m of src.matchAll(/(?:code:|fail\(|err\()\s*"([a-z0-9-]+)"/g)) srcCodes.add(m[1]);
}
for (const c of new Set([...CODES_SEEN, ...srcCodes])) {
  ok(`SPEC.md documents code ${c}`, tableCodes.has(c));
}
const headings = new Set([...spec.matchAll(/^#+ (.+)$/gm)].map(m => m[1].trim().toLowerCase()));
for (const s of ["format", "estates", "units", "groups", "flows", "annotations",
  "placement", "yaml-subset", "layout-derivation", "cli"]) {
  ok(`SPEC.md has section ${s}`, [...headings].some(h => h.includes(s.replace("-", " ")) || h.includes(s)));
}

process.exit(fail ? 1 : 0);
