// Obsidian plugin harness: build the real bundle, load it with a stubbed
// "obsidian" module, and drive the registered code-block processor through
// the success and error paths. No Obsidian install required.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";

let fail = 0;
function ok(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); fail++; }
}

// build the bundle exactly the way a release would
const build = spawnSync("node", ["obsidian/esbuild.config.mjs"], { encoding: "utf8" });
ok("bundle builds", build.status === 0);
if (build.status !== 0) { console.error(build.stderr); process.exit(1); }

const js = fs.readFileSync("obsidian/main.js", "utf8");
ok("bundle has no node: requires", !/require\("node:|from "node:/.test(js));

// load main.js as CJS with a stub obsidian module. The plugin must never
// assign innerHTML (Obsidian review hard-errors on it): the SVG arrives via
// DOMParser + appendChild, the error block via Obsidian's createEl helper.
// The stubs model exactly that surface — an innerHTML write would throw.
ok("bundle never assigns innerHTML", !/\.innerHTML\s*=/.test(js));

interface StubNode { tag: string; cls?: string; text?: string; raw?: string }
type Processor = (source: string, el: StubEl) => void;
interface StubEl {
  children: StubNode[];
  classList: { add(c: string): void };
  appendChild(n: StubNode): void;
  createEl(tag: string, o?: { cls?: string; text?: string }): StubNode;
  querySelector(sel: string): null;
}
class StubDOMParser {
  parseFromString(s: string, _type: string): { documentElement: StubNode } {
    return { documentElement: { tag: "svg", raw: s } };
  }
}
(globalThis as Record<string, unknown>).DOMParser = StubDOMParser;

const registered: { lang: string; fn: Processor }[] = [];
class Plugin {
  registerMarkdownCodeBlockProcessor(lang: string, fn: Processor): void {
    registered.push({ lang, fn });
  }
}
const stubRequire = (id: string): unknown => {
  if (id === "obsidian") return { Plugin };
  throw new Error(`unexpected require: ${id}`);
};
const mod = { exports: {} as Record<string, unknown> };
new Function("require", "module", "exports", js)(stubRequire, mod, mod.exports);
const PluginClass = (mod.exports.default ?? mod.exports) as new () => { onload(): void };
new PluginClass().onload();

ok("registers the isokit language", registered.length === 1 && registered[0].lang === "isokit");
const proc = registered[0]?.fn;

function el(): StubEl {
  const classes: string[] = [];
  const children: StubNode[] = [];
  return {
    children,
    classList: { add: (c: string) => { classes.push(c); } },
    appendChild: (n: StubNode) => { children.push(n); },
    createEl: (tag: string, o?: { cls?: string; text?: string }) => {
      const n: StubNode = { tag, cls: o?.cls, text: o?.text };
      children.push(n);
      return n;
    },
    querySelector: () => null,   // headless: the interaction wiring no-ops
  };
}

// success path: a legal document renders to inline SVG
const GOOD = `isokit: 1
title: "OBSIDIAN SMOKE"
units:
  web: { shape: box, glyph: app, accent: 1 }
  db: { shape: cyl, accent: 3 }
groups:
  tier: { label: TIER, units: [web, db] }
flows:
  - { from: web, to: db }
`;
const good = el();
proc?.(GOOD, good);
ok("good block appends a parsed svg node", good.children[0]?.tag === "svg" && (good.children[0]?.raw ?? "").startsWith("<svg"));
ok("svg is self-contained (fonts embedded)", (good.children[0]?.raw ?? "").includes("@font-face"));

// legend rail is addressable for the collapse toggle
const ANNOT = GOOD + `annotations:
  web: { title: Web tier, note: serves the front end. }
`;
const annot = el();
proc?.(ANNOT, annot);
ok("legend rail carries the toggle class", (annot.children[0]?.raw ?? "").includes('<g class="isokit-legend">'));
ok("plain diagram has no legend group", !(good.children[0]?.raw ?? "").includes("isokit-legend"));

// collapsedViewBox: the pure half of the toggle
const cvb = (mod.exports as { collapsedViewBox?: (vb: string) => string | null }).collapsedViewBox;
ok("collapsedViewBox exported", typeof cvb === "function");
ok("collapsedViewBox drops the rail", cvb?.("0 0 1746 700") === "0 0 1400 700");
ok("collapsedViewBox rejects junk", cvb?.("garbage") === null);

// pan & zoom: the pure viewBox math
interface VB { x: number; y: number; w: number; h: number }
const px = mod.exports as {
  parseVB?: (s: string) => VB | null;
  fmtVB?: (v: VB) => string;
  zoomVB?: (v: VB, factor: number, cx: number, cy: number, base: VB) => VB;
  panVB?: (v: VB, dx: number, dy: number, base: VB) => VB;
};
const BASE: VB = { x: 0, y: 0, w: 1400, h: 700 };
ok("parseVB parses", JSON.stringify(px.parseVB?.("0 0 1400 700")) === JSON.stringify(BASE));
ok("parseVB rejects junk", px.parseVB?.("garbage") === null);
ok("fmtVB round-trips", px.fmtVB?.(BASE) === "0 0 1400 700");

// zoom in 2x around the center: half the size, same center
const zin = px.zoomVB?.(BASE, 0.5, 700, 350, BASE);
ok("zoom in centers on cursor", JSON.stringify(zin) === JSON.stringify({ x: 350, y: 175, w: 700, h: 350 }));
// zooming out at base clamps to base
const zout = px.zoomVB?.(BASE, 2, 700, 350, BASE);
ok("zoom out clamps at base", JSON.stringify(zout) === JSON.stringify(BASE));
// zoom-in floor: never tighter than base/16
const zfloor = px.zoomVB?.(BASE, 1e-9, 700, 350, BASE);
ok("zoom in clamps at 16x", zfloor !== undefined && zfloor !== null && Math.round(zfloor.w) === Math.round(1400 / 16));

// pan stays within the base bounds
const panned = px.panVB?.({ x: 350, y: 175, w: 700, h: 350 }, 10000, 10000, BASE);
ok("pan clamps to base edge", JSON.stringify(panned) === JSON.stringify({ x: 700, y: 350, w: 700, h: 350 }));
const panned2 = px.panVB?.({ x: 350, y: 175, w: 700, h: 350 }, -10000, -10000, BASE);
ok("pan clamps to base origin", JSON.stringify(panned2) === JSON.stringify({ x: 0, y: 0, w: 700, h: 350 }));

// error path: a structured IsokitError becomes a <pre> built with createEl
const BAD = 'isokit: 1\ntitle: "X"\nunits:\n  a: { shape: blob }\n';
const bad = el();
proc?.(BAD, bad);
ok("bad block shows error pre", bad.children[0]?.tag === "pre" && bad.children[0]?.cls === "isokit-error");
ok("error block carries code + line", (bad.children[0]?.text ?? "").includes("[enum-invalid]") && (bad.children[0]?.text ?? "").includes("line 4"));

// error text quoting raw <markup> travels as text (createEl sets textContent
// — the DOM escapes it; there is no innerHTML for it to inject into)
const INJ = "isokit: 1\ntitle: <script>\n";
const inj = el();
proc?.(INJ, inj);
ok("injected markup lands as text, not markup",
  inj.children[0]?.tag === "pre" && typeof inj.children[0]?.text === "string" && inj.children[0]?.raw === undefined);

process.exit(fail ? 1 : 0);
