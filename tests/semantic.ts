// tests/semantic.ts — derivation policy: what geometry a semantic doc gets.
// Asserts on the Diagram->SVG behavior, not on exact bytes (goldens do that).
import * as fs from "node:fs";
import * as path from "node:path";
import { parseYaml } from "../src/yaml.ts";
import { validate } from "../src/schema.ts";
import { derive, flowOrigins } from "../src/semantic.ts";
import { IsokitError } from "../src/error.ts";
import { iso, poly } from "../src/isokit.ts";
import { render as pureRender } from "../src/render.ts";

let fail = 0;
function ok(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); fail++; }
}
function render(y: string): string { return derive(validate(parseYaml(y))); }

const PINNED = `isokit: 1
title: "PINNED CORE"
units:
  web: { shape: box, glyph: app, accent: 1 }
  db: { shape: cyl, accent: 3 }
  blob: { shape: store }
groups:
  tier: { label: APP TIER, units: [web, db] }
flows:
  - { from: web, to: db }
  - { from: db, to: blob, style: data }
placement:
  groups:
    tier: { origin: [3, 3], cols: 2 }
  units:
    blob: [10, 4]
`;
const svg = render(PINNED);
ok("is complete svg", svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>"));
ok("fixed floor canvas", svg.includes('viewBox="0 0 1400 700"'));
ok("title drawn", svg.includes(">PINNED CORE</text>"));
ok("caption derived", svg.includes("APP TIER"));
ok("plane drawn", (svg.match(/<polygon/g) || []).length > 10);
ok("dashed data flow", svg.includes("stroke-dasharray"));
ok("deterministic", render(PINNED) === svg);

// theme reaches the ground
ok("azure ground", render(PINNED.replace('title: "PINNED CORE"', 'title: "T"\ntheme: azure'))
  .includes('fill="#3070b8"'));

// engine guards surface as IsokitError with code engine-guard
const OVERLAP = `isokit: 1
title: "T"
units:
  a: { shape: box }
  b: { shape: box }
groups:
  g: { label: L, units: [a] }
placement:
  groups:
    g: { origin: [3, 3] }
  units:
    b: [4, 4]
`;
try { render(OVERLAP); console.error("FAIL overlap: did not throw"); fail++; }
catch (e) {
  ok("engine guard wrapped", e instanceof IsokitError && e.code === "engine-guard");
  ok("guard keeps engine message", String((e as IsokitError).what).includes("overlaps"));
  ok("guard carries yaml line", (e as IsokitError).line !== undefined);
}

const AUTO = `isokit: 1
title: "AUTO"
estates:
  cloud: {}
  onprem: { tone: dark }
units:
  a: { shape: box }
  b: { shape: box }
  c: { shape: box }
groups:
  g1: { label: G ONE, units: [a] }
  g2: { label: G TWO, units: [b], estate: cloud }
  g3: { label: G THREE, units: [c], estate: onprem }
`;
const autoSvg = render(AUTO);
ok("auto renders", autoSvg.includes("G THREE"));
// default estate: g1 at (1,1) 2x2 cells; g2 next at x = 3 + 2 = 5.
// dark row: maxY = 3 -> rowY = 6; boundary first integer in (3..6) = 4.
// seam polygon fill uses the SEAM token; blueprint SEAM = #202233.
ok("seam drawn for dark estate", autoSvg.includes("#202233"));
ok("no seam without estates", !render(PINNED).includes("#202233"));
// the boundary scan must start one past maxY (=3), i.e. b=4, not AT maxY
// (b=3 would run the seam under the default row's 0.6-cell plane pad).
// grid()'s default x0/y1 are -2/16; the seam polygon markup is exact.
const seamAt = (b: number) => poly(
  [iso(-2, b), iso(18, b), iso(18, 16), iso(-2, 16)], { fill: "#202233" });
ok("boundary clears the pad at y=4, not y=3",
  autoSvg.includes(seamAt(4)) && !autoSvg.includes(seamAt(3)));

// pinned origin wins over auto row
const AUTOPIN = AUTO + "placement:\n  groups:\n    g2: { origin: [8, 1] }\n";
ok("pin wins", render(AUTOPIN).includes("G TWO"));

// straddle: pin the dark group into the default row -> no separating line
const STRADDLE = AUTO + "placement:\n  groups:\n    g3: { origin: [5, 1] }\n";
try { render(STRADDLE); console.error("FAIL straddle: did not throw"); fail++; }
catch (e) {
  ok("straddle code", e instanceof IsokitError && (e as IsokitError).code === "estate-straddle");
  ok("straddle names groups", String((e as IsokitError).what).includes("g3"));
}

const ANNOT = PINNED + `annotations:
  web: { title: Web tier, note: serves the front end. }
  db: { title: Database, note: relational store. }
`;
const aSvg = render(ANNOT);
ok("chips numbered in declaration order", aSvg.indexOf(">1<") !== -1 && aSvg.indexOf(">2<") !== -1);
ok("legend entries", aSvg.includes("Web tier") && aSvg.includes("relational store."));

// content past the 1400x700 floor grows the canvas
const WIDE = `isokit: 1
title: "WIDE"
units:
  a: { shape: box }
  b: { shape: box }
groups:
  g: { label: L, units: [a] }
placement:
  groups:
    g: { origin: [2, 2] }
  units:
    b: [24, -6]
`;
const wsvg = render(WIDE);
const vb = wsvg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
ok("canvas grew horizontally", parseInt(vb[1], 10) > 1400);
ok("floor holds vertically", parseInt(vb[2], 10) === 700);

// a diagonal via segment must be attributed to the placement.flows entry
// that supplied it, not to the flows: entry
const VIADIAG = `isokit: 1
title: "VIA"
units:
  a: { shape: box }
  b: { shape: box }
groups:
  g: { label: L, units: [a, b] }
flows:
  - { from: a, to: b }
placement:
  groups:
    g: { origin: [1, 1], cols: 2 }
  flows:
    - { from: a, to: b, via: [[3.5, 2.5]] }
`;
try { render(VIADIAG); console.error("FAIL via-diagonal: did not throw"); fail++; }
catch (e) {
  const ie = e as IsokitError;
  ok("via-diagonal code", e instanceof IsokitError && ie.code === "engine-guard");
  ok("via-diagonal line is placement.flows entry's line", ie.line === 14);
  ok("via-diagonal fix mentions via/axis", /via|axis/i.test(ie.fix));
  ok("via-diagonal fix does not say add via waypoints", !ie.fix.includes("add via waypoints"));
}

// content that projects off-canvas (negative screen x) must be a hard error,
// not a silently-vanishing render
const OFFCANVAS = `isokit: 1
title: "OFF"
units:
  a: { shape: box }
placement:
  units:
    a: [0, 24]
`;
try { render(OFFCANVAS); console.error("FAIL off-canvas: did not throw"); fail++; }
catch (e) {
  ok("off-canvas code", e instanceof IsokitError && (e as IsokitError).code === "content-off-canvas");
}

// new primitives render and annotate through YAML; glyph-bearing ones carry
// their glyph; a cyl label replaces the default SQL drum text
const PRIMS = `isokit: 1
title: "PRIMS"
units:
  t: { shape: tiers, glyph: sparkle, accent: 2 }
  c: { shape: crate, accent: 1 }
  d: { shape: dashboard, accent: 1 }
  k: { shape: docs }
  m: { shape: die, glyph: vector, accent: 3 }
  n: { shape: cluster, accent: 2 }
  v: { shape: cyl, label: VEC }
groups:
  g: { label: PRIMITIVES, units: [t, c, d, k, m, n, v] }
annotations:
  t: { title: Tiers, note: layered. }
  c: { title: Crate, note: container. }
  d: { title: Dashboard, note: screen. }
  k: { title: Docs, note: sheets. }
  m: { title: Die, note: chip. }
  n: { title: Cluster, note: nodes. }
  v: { title: Vectors, note: drum label. }
`;
let primSvg = "";
try { primSvg = render(PRIMS); } catch (e) { console.error(`FAIL primitives render: ${e}`); fail++; }
ok("all seven chips drawn", primSvg.includes(">7</text>"));
ok("cyl label reaches the drum", primSvg.includes(">V</text>") && primSvg.includes(">E</text>"));
ok("default SQL text replaced", !primSvg.includes(">Q</text>"));
ok("vector glyph drawn on die", primSvg.includes('cx="27" cy="22" r="4.4"'));
ok("default cyl still says SQL", render(PINNED).includes(">Q</text>"));

// group captions must be placed AFTER flows exist (STYLE.md: autoLabel can
// only avoid what is already declared) — a flow entering a group across its
// canonical caption spot must push the caption elsewhere, not hard-error
const CAPTION_VS_FLOW = `isokit: 1
title: "CAP"
units:
  t: { shape: box }
  a: { shape: box }
  m: { shape: die }
groups:
  app: { label: APPLICATION, units: [t, a] }
  models: { label: MODELS, units: [m] }
flows:
  - { from: a, to: m }
placement:
  groups:
    app: { origin: [5, 1], cols: 1 }
    models: { origin: [10, 4] }
`;
try { ok("caption dodges a flow", render(CAPTION_VS_FLOW).includes("APPLICATION")); }
catch (e) { console.error(`FAIL caption dodges a flow: ${e}`); fail++; }

// --- flow-aware auto-placement (SPEC.md "Layout derivation" step 2) ---
const dg = (y: string) => validate(parseYaml(y));
const og = (y: string) => {
  const m = flowOrigins(dg(y));
  return m ? Object.fromEntries([...m].map(([k, v]) => [k, v.join(",")])) : null;
};
// a left-to-right pipeline with NO placement block derives the staircase that
// examples/pipeline.yaml used to pin by hand: each group one column right of
// its feeder, shifted so the fed member sits level with the feeding member
// (every inter-group flow runs straight)
const PIPE = `isokit: 1
title: "PIPE"
units:
  files: { shape: docs }
  orders: { shape: cyl }
  events: { shape: box }
  spark: { shape: cluster }
  lake: { shape: tiers }
  dw: { shape: cyl }
  bi: { shape: dashboard }
groups:
  sources: { label: SOURCES, units: [files, orders] }
  ingest: { label: INGEST, units: [events, spark] }
  lakehouse: { label: LAKEHOUSE, units: [lake, dw] }
  reporting: { label: BI, units: [bi] }
flows:
  - { from: files, to: events }
  - { from: orders, to: spark, style: data }
  - { from: events, to: spark }
  - { from: spark, to: lake }
  - { from: lake, to: dw, style: data }
  - { from: dw, to: bi }
`;
const po = og(PIPE);
ok("flow-aware: staircase origins", JSON.stringify(po) === JSON.stringify(
  { sources: "1,1", ingest: "5,1", lakehouse: "9,4", reporting: "13,7" }));
ok("flow-aware: pipeline renders", render(PIPE).includes("LAKEHOUSE"));
ok("flow-aware: differs from row placement", derive(dg(PIPE)) !== derive(dg(PIPE), { flowAware: false }));

// two groups fed by the same member land in one column; the second stacks
// below the first with the same 2-cell gap the row placement uses
const FORK = `isokit: 1
title: "FORK"
units:
  s: { shape: box }
  a: { shape: box }
  b: { shape: box }
groups:
  src: { label: SRC, units: [s] }
  ga: { label: GA, units: [a] }
  gb: { label: GB, units: [b] }
flows:
  - { from: s, to: a }
  - { from: s, to: b }
`;
ok("flow-aware: same-column groups stack", JSON.stringify(og(FORK)) === JSON.stringify(
  { src: "1,1", ga: "5,1", gb: "5,5" }));

// cycles break at the first back-edge (declaration-order DFS): deterministic, terminates
const CYCLE = `isokit: 1
title: "CYC"
units:
  a: { shape: box }
  b: { shape: box }
groups:
  g1: { label: G1, units: [a] }
  g2: { label: G2, units: [b] }
flows:
  - { from: a, to: b }
  - { from: b, to: a }
`;
ok("flow-aware: cycle layered deterministically", JSON.stringify(og(CYCLE)) === JSON.stringify(
  { g1: "1,1", g2: "5,1" }));

// pins win; auto groups route around a pinned group's cells
const PINNED_MIX = FORK + "placement:\n  groups:\n    ga: { origin: [5, 1] }\n";
ok("flow-aware: pinned group kept, auto group avoids it",
  JSON.stringify(og(PINNED_MIX)) === JSON.stringify({ src: "1,1", gb: "5,5" }));

// upstream misalignment never pushes content to y < 1: auto groups shift down together
const DEEP = `isokit: 1
title: "DEEP"
units:
  s: { shape: box }
  x: { shape: box }
  y: { shape: box }
groups:
  src: { label: SRC, units: [s] }
  dst: { label: DST, units: [x, y] }
flows:
  - { from: s, to: y }
`;
ok("flow-aware: shifted on-grid when alignment goes negative",
  JSON.stringify(og(DEEP)) === JSON.stringify({ src: "1,4", dst: "5,1" }));

// no flows between groups -> today's row placement, byte-for-byte
ok("flow-aware: off without inter-group flows", og(PINNED) === null && og(AUTO) === null);

// a flow-aware layout the guards reject (a dark estate upstream has no
// separating seam) falls back to row placement rather than erroring
const DARK_UP = `isokit: 1
title: "DARK"
estates:
  cloud: {}
  onprem: { tone: dark }
units:
  h: { shape: building }
  v: { shape: box }
groups:
  op: { label: OP, units: [h], estate: onprem }
  gw: { label: GW, units: [v], estate: cloud }
flows:
  - { from: h, to: v }
`;
let darkSvg = "";
try { darkSvg = render(DARK_UP); } catch (e) { console.error(`FAIL dark-upstream fallback: ${e}`); fail++; }
ok("flow-aware: guard failure falls back to rows",
  darkSvg !== "" && darkSvg === derive(dg(DARK_UP), { flowAware: false }));

// purity: render() core has no node: imports in module graph
ok("render() equals derive pipeline", pureRender(PINNED) === svg);

// purity: no node: imports anywhere in render()'s module graph
const seen = new Set<string>();
const queue = [path.resolve("src/render.ts")];
while (queue.length) {
  const f = queue.pop()!;
  if (seen.has(f)) continue;
  seen.add(f);
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/from\s+"([^"]+)"/g)) {
    const spec = m[1];
    if (spec.startsWith("node:")) { console.error(`FAIL purity: ${f} imports ${spec}`); fail++; }
    else if (spec.startsWith(".")) queue.push(path.resolve(path.dirname(f), spec));
  }
}
ok("graph covered isokit.ts", [...seen].some(f => f.endsWith("isokit.ts")));

process.exit(fail ? 1 : 0);
