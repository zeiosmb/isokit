// src/interactive.ts: verifies withControls() is a pure additive transform
// (strips back to the original render) and that it wires up correctly for
// both legend and non-legend diagrams.
import { withControls } from "../src/interactive.ts";
import { render } from "../src/render.ts";

let fail = 0;
function ok(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); fail++; }
}

const PLAIN = `isokit: 1
title: "PLAIN"
units:
  web: { shape: box }
  db: { shape: cyl }
groups:
  g: { label: G, units: [web, db] }
flows:
  - { from: web, to: db }
`;
const plain = render(PLAIN);
const plainCtl = withControls(plain);
ok("plain: additive only (strip reproduces original)",
  plainCtl.replace(/<g class="isokit-controls"[\s\S]*<\/svg>\s*$/, "</svg>") === plain);
ok("plain: has zoom buttons", plainCtl.includes('id="isokit-zoom-in"') && plainCtl.includes('id="isokit-zoom-out"'));
ok("plain: no legend toggle", !plainCtl.includes('id="isokit-legend-toggle"'));
ok("plain: script embedded", plainCtl.includes("<script>"));
ok("plain: still valid — no nested <svg> or unclosed tags introduced", plainCtl.endsWith("</svg>"));

// HUD: the controls group is anchored to the view's bottom-right corner via a
// transform the runtime re-derives on every view change, so buttons stay
// visible under zoom/pan and after legend collapse.
const vbm = plain.match(/viewBox="0 0 (\d+) (\d+)"/)!;
ok("plain: controls anchored to bottom-right corner",
  plainCtl.includes(`<g class="isokit-controls" transform="translate(${vbm[1]} ${vbm[2]})">`));
ok("plain: runtime repositions controls on view change", plainCtl.includes('ctrls.setAttribute("transform"'));
ok("plain: buttons drawn at corner-relative (negative) coords", plainCtl.includes('cx="-21"'));

// Grab cursor when zoomed/pannable (parity with the Obsidian plugin's CSS).
ok("plain: runtime sets grab cursor", plainCtl.includes('"grab"') && plainCtl.includes('"grabbing"'));

// Responsive sizing: standalone documents get sizing CSS baked in, since no
// host stylesheet exists when a raw .svg is opened in a browser tab. Scoped
// to :root so it's inert if the file is ever inlined into an HTML page.
ok("plain: responsive sizing style embedded",
  plainCtl.includes("<style>svg:root{max-width:100%;height:auto}</style>"));

const ANNOT = PLAIN + `annotations:
  web: { title: Web, note: serves requests. }
`;
const annot = render(ANNOT);
const annotCtl = withControls(annot);
ok("annotated: strip reproduces original",
  annotCtl.replace(/<g class="isokit-controls"[\s\S]*<\/svg>\s*$/, "</svg>") === annot);
ok("annotated: has legend toggle", annotCtl.includes('id="isokit-legend-toggle"'));

process.exit(fail ? 1 : 0);
