// tests/semantic.ts — derivation policy: what geometry a semantic doc gets.
// Asserts on the Diagram->SVG behavior, not on exact bytes (goldens do that).
import * as fs from "node:fs";
import * as path from "node:path";
import { parseYaml } from "../src/yaml.ts";
import { validate } from "../src/schema.ts";
import { derive } from "../src/semantic.ts";
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
