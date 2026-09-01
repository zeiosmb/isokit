/* isokit — shared shape library for Azure-isometric gold-standard SVGs.

Geometry model: grid coords (x right-down, y left-down, z up), iso projection
X = OX + (x-y)*0.866*U ; Y = OY + (x+y)*0.5*U - z*U.
Visible faces of an iso solid: top, SW (y-max, faces lower-left),
SE (x-max, faces lower-right). Plane-lying text/glyphs use full affine shears:
  ground/top plane, baseline along +x:  matrix(0.866, 0.5,-0.866,0.5, X,Y)
  ground plane, baseline along -y:      matrix(0.866,-0.5, 0.866,0.5, X,Y)
  SW face (no mirror):                  matrix(0.866, 0.5, 0,    1,   X,Y)
  SE face (mirrored basis, rects only): matrix(-0.866,0.5, 0,    1,   X,Y)
Shape anatomy per SlideModel sheet: light solids + colored top rims, flat dark
glyphs ON the shape, white diamond base plates, devices as real slab shapes.

Ported 1:1 from the Python prototype (src/isokit/__init__.py at commit
2f46dd2); output is byte-identical — see tests/golden/. */
import { JBM400, JBM700 } from "./fonts.ts";

export type Pt = [number, number];
// null/undefined serialize via the same template interpolation as before —
// widening the type changes no bytes, only makes the flows checkable
type Attrs = Record<string, string | number | null | undefined>;

/** Shape keyword args: the union of every shape's optional keys. Shapes
read the subset they use (Python **kw style); new shapes add keys here
rather than widening the type. */
export interface Kw {
  rim?: string | null;
  glyph?: string | null;
  label?: string;
  s?: number; sx?: number; sy?: number;
  h?: number; r?: number; gk?: number;
  with_plate?: boolean;
  n?: number; fins?: number; cols?: number; rows?: number; segs?: number;
  layers?: number; lh?: number;
  w?: number; d?: number; hb?: number; hs?: number; z0?: number; it?: number;
  cells?: [number, number] | null;
}

// ---- Python-compatible float formatting ----
// Exact equivalent of Python f"{x:.{nd}f}" for finite doubles: exact decimal
// rounding of the IEEE-754 value, round-half-even, sign taken from the sign
// bit (so anything negative that rounds to zero prints "-0.0", as CPython does).
// JS toFixed rounds ties away from zero and drops the sign of -0, and iso
// coords DO land on exact ties (e.g. 88.25), so this is load-bearing.
export function pyf(x: number, nd: number): string {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const bits = dv.getBigUint64(0);
  const neg = bits >> 63n === 1n;
  const rawExp = Number((bits >> 52n) & 0x7ffn);
  let mant = bits & 0xfffffffffffffn;
  let exp: number;
  if (rawExp === 0x7ff) return String(x); // inf/nan — not produced by layouts
  if (rawExp === 0) exp = -1074;
  else { mant |= 0x10000000000000n; exp = rawExp - 1075; }
  const scale = 10n ** BigInt(nd);
  let num: bigint, den: bigint;
  if (exp >= 0) { num = (mant * scale) << BigInt(exp); den = 1n; }
  else { num = mant * scale; den = 1n << BigInt(-exp); }
  let q = num / den;
  const twiceR = (num - q * den) * 2n;
  if (twiceR > den || (twiceR === den && (q & 1n) === 1n)) q += 1n;
  const s = q.toString().padStart(nd + 1, "0");
  const body = nd ? `${s.slice(0, -nd)}.${s.slice(-nd)}` : s;
  return neg ? `-${body}` : body;
}

// ---- themes ----
// setTheme(name) swaps every token. Unlike the Python original (module
// globals frozen at from-import time), these are ESM live bindings: importers
// always see the current theme, so call order no longer matters.
export const MONO = "'JetBrains Mono',Menlo,monospace";
export const MONOQ = `"${MONO}"`; // Python {MONO!r} — repr with double quotes
const THEMES = {
  blueprint: {
    GROUND: "#282a3d", SEAM: "#202233", RAIL: "#1d1f2e",
    INK: "#edf2f4", INK2: "#8d99ae",
    A1: "#ef233c", A2: "#8d99ae", A3: "#f5d547",
    FLOW: "#f5d547", FLOW2: "#8d99ae",                     // request / data run
    TOPF: "#e9ecf1", SWF: "#cdd3dc", SEF: "#a6adbd", EDGE: "#5d6579",
    GLY: "#333a4d", BEZ: "#3a4152", SCR: "#eef3f7",
    CYLTOP: "#ced5de", CYLG: ["#e2e6ec", "#c9cfd9", "#99a1b1"] as const,
    RACK_SW: "#494f63", RACK_SE: "#3b4152", RACK_TOP: "#5a617a",
    FIN_SW: "#8b93a8", FIN_SE: "#6d7488",
    KEYS: "#bcc3cf", BBAR: "#7f8798", BLINE: "#b9c0cc",
    SWMID: "#8b93a8", SWLIT: "#bfc7d4",
    FW1: "#9e4a44", FW2: "#c05c52",                        // firewall brick / lit brick
  },
  azure: {                                                 // Azure-marketing blues
    GROUND: "#3070b8", SEAM: "#265b9e", RAIL: "#1c4d8b",
    INK: "#ffffff", INK2: "#cfe0f4",
    A1: "#76b83f", A2: "#ffb900", A3: "#f2f7fb",
    FLOW: "#a3d977", FLOW2: "#d8e9f8",                     // pale-green arrows like the reference
    TOPF: "#f4f6f9", SWF: "#d6dde6", SEF: "#aab5c6", EDGE: "#5a6a85",
    GLY: "#2f3f5c", BEZ: "#3a4b66", SCR: "#eef4fa",
    CYLTOP: "#d3dae3", CYLG: ["#e8ecf1", "#ccd3dd", "#9aa5b6"] as const,
    RACK_SW: "#44536e", RACK_SE: "#37455e", RACK_TOP: "#556685",
    FIN_SW: "#8fa0bd", FIN_SE: "#71809c",
    KEYS: "#c0c8d4", BBAR: "#8290a6", BLINE: "#bcc5d4",
    SWMID: "#8b93a8", SWLIT: "#bfc7d4",
    FW1: "#c0504b", FW2: "#d8746c",
  },
};

export let GROUND = "", SEAM = "", RAIL = "", INK = "", INK2 = "";
export let A1 = "", A2 = "", A3 = "", FLOW = "", FLOW2 = "";
export let TOPF = "", SWF = "", SEF = "", EDGE = "", GLY = "", BEZ = "", SCR = "";
export let CYLTOP = "";
export let CYLG: readonly [string, string, string] = ["", "", ""];
export let RACK_SW = "", RACK_SE = "", RACK_TOP = "", FIN_SW = "", FIN_SE = "";
export let KEYS = "", BBAR = "", BLINE = "", SWMID = "", SWLIT = "", FW1 = "", FW2 = "";
export let GLYPHS: Record<string, string> = {};

export function setTheme(name: keyof typeof THEMES): void {
  const t = THEMES[name];
  GROUND = t.GROUND; SEAM = t.SEAM; RAIL = t.RAIL; INK = t.INK; INK2 = t.INK2;
  A1 = t.A1; A2 = t.A2; A3 = t.A3; FLOW = t.FLOW; FLOW2 = t.FLOW2;
  TOPF = t.TOPF; SWF = t.SWF; SEF = t.SEF; EDGE = t.EDGE; GLY = t.GLY;
  BEZ = t.BEZ; SCR = t.SCR; CYLTOP = t.CYLTOP; CYLG = t.CYLG;
  RACK_SW = t.RACK_SW; RACK_SE = t.RACK_SE; RACK_TOP = t.RACK_TOP;
  FIN_SW = t.FIN_SW; FIN_SE = t.FIN_SE; KEYS = t.KEYS; BBAR = t.BBAR;
  BLINE = t.BLINE; SWMID = t.SWMID; SWLIT = t.SWLIT; FW1 = t.FW1; FW2 = t.FW2;
  GLYPHS = _buildGlyphs();
}

// ---- projection (configure() per artifact) ----
export let U = 46, CXu = 0.866 * U, CYu = 0.5 * U, OX = 440, OY = 48;

export function configure(u = 46, ox = 440, oy = 48): void {
  U = u; CXu = 0.866 * U; CYu = 0.5 * U; OX = ox; OY = oy;
}

export function iso(x: number, y: number, z = 0.0): Pt {
  return [OX + (x - y) * CXu, OY + (x + y) * CYu - z * U];
}
export function pts(l: Pt[]): string {
  return l.map(([x, y]) => `${pyf(x, 1)},${pyf(y, 1)}`).join(" ");
}
function attrs(kw: Attrs): string {
  return Object.entries(kw).map(([k, v]) => `${k.replaceAll("_", "-")}="${v}"`).join(" ");
}
export function poly(l: Pt[], kw: Attrs = {}): string {
  return `<polygon points="${pts(l)}" ${attrs(kw)}/>`;
}
export function pline(l: Pt[], kw: Attrs = {}): string {
  return `<polyline points="${pts(l)}" fill="none" ${attrs(kw)}/>`;
}
export function zrect(x0: number, y0: number, x1: number, y1: number, z = 0): Pt[] {
  return [iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)];
}
export function inset(quad: Pt[], t: number): Pt[] {
  const cx = quad.reduce((a, p) => a + p[0], 0) / 4;
  const cy = quad.reduce((a, p) => a + p[1], 0) / 4;
  return quad.map(([px, py]) => [px + (cx - px) * t, py + (cy - py) * t]);
}

// ---- fonts (base64-embedded JetBrains Mono from src/fonts.ts) ----

let _CANVAS_W = 1400, _CANVAS_H = 700;

export function svgOpen(w = 1400, h = 700): string[] {
  _CANVAS_W = w; _CANVAS_H = h;          // legend() checks its content against this
  _LABELS.length = 0; _FLOWPTS.length = 0; _FLOWHEADS.length = 0; _PLANES.length = 0;   // new artifact: reset collision registries
  _CHIPS.length = 0; _ANNOTS.length = 0;
  return [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<defs><style>
@font-face {font-family:'JetBrains Mono';font-weight:400;src:url(data:font/woff2;base64,${JBM400}) format('woff2');}
@font-face {font-family:'JetBrains Mono';font-weight:700;src:url(data:font/woff2;base64,${JBM700}) format('woff2');}
</style>
<linearGradient id="cylg" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${CYLG[0]}"/><stop offset="0.55" stop-color="${CYLG[1]}"/><stop offset="1" stop-color="${CYLG[2]}"/>
</linearGradient></defs>`,
    `<rect width="${w}" height="${h}" fill="${GROUND}"/>`];
}

export interface GridOpts {
  x0?: number; y0?: number; x1?: number; y1?: number;
  clip_w?: number; clip_h?: number; seam?: ["x" | "y", number] | null;
}

/** Ground grid. seam=("x"|"y", coord) drops the ground to a darker tone
beyond that grid line (Azure-style two-tone ground with a crisp edge);
grid lines draw over both tones so the seam reads as one continuous floor. */
export function grid(opts: GridOpts = {}): string {
  const { x0 = -2, y0 = -2, x1 = 16, y1 = 15, clip_w = 1054, clip_h = 700, seam = null } = opts;
  const g = [`<g clip-path="url(#gclip)"><clipPath id="gclip"><rect x="0" y="0" width="${clip_w}" height="${clip_h}"/></clipPath>`];
  if (seam) {
    const [ax, at] = seam;
    if (!Number.isInteger(at)) {
      throw new Error(`seam coordinate must be an integer grid line, got ${at}`);
    }
    const r = ax === "x" ? zrect(at, y0, x1, y1) : zrect(x0, at, x1, y1);
    g.push(poly(r, { fill: SEAM }));
  }
  for (let i = x0; i <= x1; i++) g.push(pline([iso(i, y0), iso(i, y1)], { stroke: INK2, stroke_width: 0.6, opacity: 0.22 }));
  for (let j = y0; j <= y1; j++) g.push(pline([iso(x0, j), iso(x1, j)], { stroke: INK2, stroke_width: 0.6, opacity: 0.22 }));
  return g.join("") + "</g>";
}

/** Translucent grouping sheet. z>0 floats it (reference-style raised tier);
posts drops dashed corner ties to the ground so the height reads. */
export function plane(x0: number, y0: number, x1: number, y1: number, z = 0, posts = true): string {
  // ground planes register their outline as a collision object (checkPlanes);
  // raised planes are depth-layered sheets — screen overlap there is
  // occlusion, not touching, so they stay out of the registry
  if (z === 0) _PLANES.push(zrect(x0, y0, x1, y1, 0));
  const g = [poly(zrect(x0, y0, x1, y1, z), { fill: INK, opacity: 0.07 }),
    poly(zrect(x0, y0, x1, y1, z), { fill: "none", stroke: INK, stroke_width: 1, opacity: 0.45 })];
  if (z > 0 && posts) {
    for (const [cx_, cy_] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Pt[]) {
      g.push(pline([iso(cx_, cy_, z), iso(cx_, cy_, 0)],
        { stroke: INK, stroke_width: 1, opacity: 0.3, stroke_dasharray: "3 4" }));
    }
  }
  return g.join("");
}

export interface LabelOpts { size?: number; ls?: number; fill?: string | null; weight?: number; z?: number; }

/** Estimated screen quad of a plane label — the monospace em-box (0.6em
advance + letter-spacing per gap, 0.75em ascent, 0.2em descent) pushed
through the axis' shear basis. Shared by planeLabel() registration and
autoLabel() candidate testing so the two can never disagree. */
function _labelQuad(txt: string, x: number, y: number, axis: "x" | "y",
  size: number, ls: number, z = 0): Pt[] {
  const [X, Y] = iso(x, y, z);
  const [a, b, c, d] = axis === "x" ? [0.866, 0.5, -0.866, 0.5] : [0.866, -0.5, 0.866, 0.5];
  const W = txt.length * size * 0.6 + (txt.length - 1) * ls;
  const asc = 0.75 * size, desc = 0.2 * size;
  return ([[0, -asc], [W, -asc], [W, desc], [0, desc]] as Pt[])
    .map(([u, v]) => [a * u + c * v + X, b * u + d * v + Y]);
}

export function planeLabel(txt: string, x: number, y: number, axis: "x" | "y", opts: LabelOpts = {}): string {
  const { size = 15, ls = 2.5, weight = 400, z = 0 } = opts;
  const fill = opts.fill || INK2;      // resolved at call time so setTheme() applies
  const [X, Y] = iso(x, y, z);
  // shear basis: local u along the baseline, local v toward descenders
  const [a, b, c, d] = axis === "x" ? [0.866, 0.5, -0.866, 0.5] : [0.866, -0.5, 0.866, 0.5];
  const m = `matrix(${a},${b},${c},${d},${pyf(X, 1)},${pyf(Y, 1)})`;
  _LABELS.push({ txt, quad: _labelQuad(txt, x, y, axis, size, ls, z) });
  return `<text x="0" y="0" font-family=${MONOQ} font-size="${size}" font-weight="${weight}" `
    + `fill="${fill}" letter-spacing="${ls}" transform="${m}">${txt}</text>`;
}

// Flow with in-plane arrowhead(s): shaft shortened, head = grid-space triangle
// lying in the ground plane, tip exactly at the given end point.
// heads="end"|"both"; dot=true puts a round origin dot (data-run style).
export interface FlowOpts {
  width?: number; dashed?: boolean; hl?: number; hw?: number;
  heads?: "end" | "both"; dot?: boolean;
}

export function flow(points: Pt[], color: string, opts: FlowOpts = {}): string {
  const { width = 2.5, dashed = false, hl = 0.42, hw = 0.21, heads = "end", dot = false } = opts;
  for (let i = 0; i < points.length - 1; i++) {          // axis lock: every segment
    const [x0, y0] = points[i], [x1, y1] = points[i + 1]; // must follow one grid axis
    if (Math.abs(x1 - x0) > 1e-9 && Math.abs(y1 - y0) > 1e-9) {
      throw new Error(`flow segment (${x0}, ${y0}) -> (${x1}, ${y1}) is diagonal; `
        + "route via axis-aligned waypoints");
    }
  }
  function headAt(tip: Pt, prev: Pt): [Pt, string] {
    const dx = tip[0] - prev[0], dy = tip[1] - prev[1];
    const L = (dx * dx + dy * dy) ** 0.5;
    const ux = dx / L, uy = dy / L;
    const px = -uy, py = ux;
    const b: Pt = [tip[0] - ux * hl, tip[1] - uy * hl];
    const tri: Pt[] = [tip, [b[0] + px * hw, b[1] + py * hw], [b[0] - px * hw, b[1] - py * hw]];
    const scr = tri.map(p => iso(p[0], p[1]));
    _FLOWHEADS.push(scr);   // the flare is ink ~8px either side of the centerline
    return [b, poly(scr, { fill: color })];
  }
  _FLOWPTS.push(points.map(p => iso(p[0], p[1])));  // full route (shaft + head span) for the label collision check
  const pts_ = points.slice(); const out: string[] = [];
  const [bEnd, hEnd] = headAt(pts_[pts_.length - 1], pts_[pts_.length - 2]);
  out.push(hEnd); pts_[pts_.length - 1] = bEnd;
  if (heads === "both") {
    const [b0, h0] = headAt(pts_[0], pts_[1]); out.push(h0); pts_[0] = b0;
  } else if (dot) {
    const [X, Y] = iso(pts_[0][0], pts_[0][1]);
    out.push(`<circle cx="${pyf(X, 1)}" cy="${pyf(Y, 1)}" r="${pyf(width + 1.6, 1)}" fill="${color}"/>`);
  }
  const kw: Attrs = { stroke: color, stroke_width: width };
  if (dashed) kw.stroke_dasharray = "7 5";
  return pline(pts_.map(p => iso(p[0], p[1])), kw) + out.join("");
}

export function plate(x: number, y: number, s = 1.4): string {
  return poly(zrect(x - 0.22, y - 0.22, x + s + 0.22, y + s + 0.22),
    { fill: "none", stroke: INK, stroke_width: 2.2, opacity: 0.95 });
}

// ---- flat dark glyphs in a local 40x40 box, sheared onto faces ----
// Bold strokes only (>=3.5) — thin marks turn to scribble under the shear.
// Built per-theme (they bake GLY in); setTheme() rebuilds the dict.
function _buildGlyphs(): Record<string, string> {
  return {
    gw: `<line x1="4" y1="13.5" x2="29" y2="13.5" stroke="${GLY}" stroke-width="3.8"/>`
      + `<polygon points="37,13.5 28,8.5 28,18.5" fill="${GLY}"/>`
      + `<line x1="36" y1="27.5" x2="11" y2="27.5" stroke="${GLY}" stroke-width="3.8"/>`
      + `<polygon points="3,27.5 12,22.5 12,32.5" fill="${GLY}"/>`,
    app: `<circle cx="20" cy="20" r="13.5" fill="none" stroke="${GLY}" stroke-width="2.6"/>`
      + `<ellipse cx="20" cy="20" rx="13.5" ry="5.2" fill="none" stroke="${GLY}" stroke-width="2.2"/>`
      + `<ellipse cx="20" cy="20" rx="5.2" ry="13.5" fill="none" stroke="${GLY}" stroke-width="2.2"/>`,
    entra: `<circle cx="20" cy="14.5" r="8.5" fill="${GLY}"/>`
      + `<polygon points="16.4,21 23.6,21 27.5,36 12.5,36" fill="${GLY}"/>`,
    kv: `<circle cx="11.5" cy="20" r="6.8" fill="none" stroke="${GLY}" stroke-width="4.4"/>`
      + `<rect x="17.6" y="17.9" width="19.5" height="4.2" fill="${GLY}"/>`
      + `<rect x="27.5" y="22" width="3.4" height="6" fill="${GLY}"/>`
      + `<rect x="33.2" y="22" width="3.4" height="8" fill="${GLY}"/>`,
    fn: `<text x="20" y="27" font-family=${MONOQ} font-size="22" font-weight="700" `
      + `fill="${GLY}" text-anchor="middle">&#402;</text>`,
    doc: `<path d="M 12 6 L 24 6 L 30 12 L 30 34 L 12 34 Z" fill="none" stroke="${GLY}" stroke-width="3"/>`
      + `<line x1="16" y1="16" x2="26" y2="16" stroke="${GLY}" stroke-width="2.6"/>`
      + `<line x1="16" y1="21" x2="26" y2="21" stroke="${GLY}" stroke-width="2.6"/>`
      + `<line x1="16" y1="26" x2="22" y2="26" stroke="${GLY}" stroke-width="2.6"/>`,
    shield: `<path d="M 20 4 L 34 9.5 L 34 21 Q 34 31.5 20 36.5 Q 6 31.5 6 21 L 6 9.5 Z" `
      + `fill="${GLY}"/>`
      + `<path d="M 13.5 19.5 L 18.5 24.5 L 27 15" fill="none" stroke="${TOPF}" `
      + `stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  };
}

setTheme("blueprint");

// ---- solids ----
// Shape functions share the signature (x, y, kw) so the unit registry can
// invoke any of them with stored kwargs, exactly like Python's fn(x, y, **kw).
export function box(x: number, y: number, kw: Kw = {}): string {
  const { rim, glyph = null, s = 1.4, h = 0.95, gk = 0.85, with_plate = true } = kw;
  const sx = kw.sx ?? s, sy = kw.sy ?? s;
  const g: string[] = with_plate ? [plate(x, y, s)] : [];
  const top = [iso(x, y, h), iso(x + sx, y, h), iso(x + sx, y + sy, h), iso(x, y + sy, h)];
  const sw = [iso(x, y + sy, h), iso(x + sx, y + sy, h), iso(x + sx, y + sy, 0), iso(x, y + sy, 0)];
  const se = [iso(x + sx, y, h), iso(x + sx, y + sy, h), iso(x + sx, y + sy, 0), iso(x + sx, y, 0)];
  g.push(poly(sw, { fill: SWF, stroke: EDGE, stroke_width: 0.5, opacity: 0.98 }));
  g.push(poly(se, { fill: SEF, stroke: EDGE, stroke_width: 0.5, opacity: 0.98 }));
  g.push(poly(top, { fill: TOPF, stroke: rim, stroke_width: 2.5 }));
  if (glyph) {
    const [Tx, Ty] = iso(x, y + sy, h);                 // SW face top-left corner
    const gx = sx * U / 2 - 20 * gk, gy = h * U / 2 - 20 * gk;
    g.push(`<g transform="matrix(0.866,0.5,0,1,${pyf(Tx, 1)},${pyf(Ty, 1)})">`
      + `<g transform="translate(${pyf(gx, 1)},${pyf(gy, 1)}) scale(${gk})">${glyph}</g></g>`);
  }
  return g.join("");
}

// thin extruded service tile, glyph lying flat on the TOP face
export function slab(x: number, y: number, kw: Kw = {}): string {
  const { rim, glyph = null, s = 1.4, h = 0.22, gk = 1.1 } = kw;
  const g = [box(x, y, { rim, s, h })];
  if (glyph) {
    const [Tx, Ty] = iso(x, y, h);                      // top face far corner
    const gx = s * U / 2 - 20 * gk, gy = s * U / 2 - 20 * gk;
    g.push(`<g transform="matrix(0.866,0.5,-0.866,0.5,${pyf(Tx, 1)},${pyf(Ty, 1)})">`
      + `<g transform="translate(${pyf(gx, 1)},${pyf(gy, 1)}) scale(${gk})">${glyph}</g></g>`);
  }
  return g.join("");
}

// flat tile whose top face is a colored data grid (the reference's table panel)
export function panel(x: number, y: number, kw: Kw = {}): string {
  const { rim, s = 1.4, h = 0.12, n = 4 } = kw;
  const g = [box(x, y, { rim, s, h })];
  const m = 0.16;
  for (let i = 0; i <= n; i++) {
    let t = x + m + (s - 2 * m) * i / n;
    g.push(pline([iso(t, y + m, h), iso(t, y + s - m, h)], { stroke: rim, stroke_width: 1.6, opacity: 0.9 }));
    t = y + m + (s - 2 * m) * i / n;
    g.push(pline([iso(x + m, t, h), iso(x + s - m, t, h)], { stroke: rim, stroke_width: 1.6, opacity: 0.9 }));
  }
  return g.join("");
}

// solid iso cylinder: gradient body, colored rim ring, dark label on body front
export function cyl(x: number, y: number, kw: Kw = {}): string {
  const { rim, label = "SQL", s = 1.4, r = 0.5, h = 1.25 } = kw;
  const g = [plate(x, y, s)];
  const cx = x + s / 2, cy = y + s / 2;
  const [Xc, Yt] = iso(cx, cy, h); const Yb = iso(cx, cy, 0)[1];
  const rx = 1.2247 * r * U, ry = 0.577 * rx;  // true iso ellipse: ry/rx = tan(30 deg)
  g.push(`<path d="M ${pyf(Xc - rx, 1)} ${pyf(Yt, 1)} L ${pyf(Xc - rx, 1)} ${pyf(Yb, 1)} `
    + `A ${pyf(rx, 1)} ${pyf(ry, 1)} 0 0 0 ${pyf(Xc + rx, 1)} ${pyf(Yb, 1)} L ${pyf(Xc + rx, 1)} ${pyf(Yt, 1)} Z" `
    + `fill="url(#cylg)" stroke="${EDGE}" stroke-width="0.5"/>`);
  g.push(`<ellipse cx="${pyf(Xc, 1)}" cy="${pyf(Yt, 1)}" rx="${pyf(rx, 1)}" ry="${pyf(ry, 1)}" `
    + `fill="${CYLTOP}" stroke="${rim}" stroke-width="2.5"/>`);
  if (label) {
    // painted around the drum: each glyph at its own azimuth theta
    // (theta=0 faces the viewer). Screen pos (Xc + rx*sin t, Yc0 + ry*cos t);
    // per-glyph matrix(cos t, -(ry/rx)*sin t, 0, 1, ...) foreshortens the
    // glyph and slopes its baseline along the ellipse tangent while
    // vertical strokes stay parallel to the cylinder axis.
    const fs = 13, adv = fs * 0.6;   // JetBrains Mono advance
    const th_c = -Math.PI / 4;       // centered facing SW: tangent here matches the SW-face shear
    const Yc0 = (Yt + Yb) / 2 - ry * 0.4;
    const n = label.length, k = ry / rx;
    for (let i = 0; i < n; i++) {
      const ch = label[i];
      const t = th_c + (i - (n - 1) / 2) * adv / rx;
      const ct = Math.cos(t), st = Math.sin(t);
      const Xi = Xc + rx * st, Yi = Yc0 + ry * ct;
      g.push(`<g transform="matrix(${pyf(ct, 3)},${pyf(-k * st, 3)},0,1,${pyf(Xi, 1)},${pyf(Yi, 1)})">`
        + `<text x="0" y="0" font-family=${MONOQ} font-size="${fs}" `
        + `font-weight="700" fill="${GLY}" text-anchor="middle">${ch}</text></g>`);
    }
  }
  return g.join("");
}

// dark server rack: fins striped across both visible faces
export function rack(x: number, y: number, kw: Kw = {}): string {
  const { rim, s = 1.4, h = 1.15, fins = 4 } = kw;
  const g = [plate(x, y, s)];
  const sw = [iso(x, y + s, h), iso(x + s, y + s, h), iso(x + s, y + s, 0), iso(x, y + s, 0)];
  const se = [iso(x + s, y, h), iso(x + s, y + s, h), iso(x + s, y + s, 0), iso(x + s, y, 0)];
  const top = [iso(x, y, h), iso(x + s, y, h), iso(x + s, y + s, h), iso(x, y + s, h)];
  g.push(poly(sw, { fill: RACK_SW, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(se, { fill: RACK_SE, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(top, { fill: RACK_TOP, stroke: rim, stroke_width: 2.5 }));
  const Tsw = iso(x, y + s, h), Tse = iso(x + s, y, h);
  const fw = s * U;
  for (let i = 0; i < fins; i++) {
    const fy = h * U * (0.14 + 0.20 * i);
    g.push(`<g transform="matrix(0.866,0.5,0,1,${pyf(Tsw[0], 1)},${pyf(Tsw[1], 1)})">`
      + `<rect x="4" y="${pyf(fy, 1)}" width="${pyf(fw - 8, 1)}" height="5.5" rx="2" fill="${FIN_SW}"/></g>`);
    g.push(`<g transform="matrix(-0.866,0.5,0,1,${pyf(Tse[0], 1)},${pyf(Tse[1], 1)})">`
      + `<rect x="4" y="${pyf(fy, 1)}" width="${pyf(fw - 8, 1)}" height="5.5" rx="2" fill="${FIN_SE}"/></g>`);
  }
  return g.join("");
}

// tall enterprise building: window grids sheared onto both visible faces
export function building(x: number, y: number, kw: Kw = {}): string {
  const { rim = null, s = 1.1, h = 2.3, cols = 4, rows = 7 } = kw;
  const g = [plate(x, y, s)];
  g.push(box(x, y, { rim: rim || EDGE, s, h, with_plate: false }));
  const fw = s * U, fh = h * U;
  const win: [number, number, number, number][] = [];
  for (let c = 0; c < cols; c++) {
    for (let r_ = 0; r_ < rows; r_++) {
      const wx = fw * (0.10 + 0.82 * c / cols) + 1.5;
      const wy = fh * (0.06 + 0.90 * r_ / rows) + 1.5;
      win.push([wx, wy, fw * 0.82 / cols - 4, fh * 0.90 / rows - 5]);
    }
  }
  const Tsw = iso(x, y + s, h), Tse = iso(x + s, y, h);
  for (const [wx, wy, ww, wh] of win) {
    g.push(`<g transform="matrix(0.866,0.5,0,1,${pyf(Tsw[0], 1)},${pyf(Tsw[1], 1)})">`
      + `<rect x="${pyf(wx, 1)}" y="${pyf(wy, 1)}" width="${pyf(ww, 1)}" height="${pyf(wh, 1)}" fill="${GLY}" opacity="0.75"/></g>`);
    g.push(`<g transform="matrix(-0.866,0.5,0,1,${pyf(Tse[0], 1)},${pyf(Tse[1], 1)})">`
      + `<rect x="${pyf(wx, 1)}" y="${pyf(wy, 1)}" width="${pyf(ww, 1)}" height="${pyf(wh, 1)}" fill="${GLY}" opacity="0.55"/></g>`);
  }
  return g.join("");
}

// firewall: brick wall — narrow tall slab, brick courses with staggered joints
// on both visible faces, light coping on top (the classic Azure firewall shape)
export function wall(x: number, y: number, kw: Kw = {}): string {
  const { rim = null, s = 1.4, h = 1.0 } = kw;
  const g = [plate(x, y, s)];
  const bx = x + 0.05, by = y + 0.50, sx = 1.30, sy = 0.40;
  const top = [iso(bx, by, h), iso(bx + sx, by, h), iso(bx + sx, by + sy, h), iso(bx, by + sy, h)];
  const sw = [iso(bx, by + sy, h), iso(bx + sx, by + sy, h), iso(bx + sx, by + sy, 0), iso(bx, by + sy, 0)];
  const se = [iso(bx + sx, by, h), iso(bx + sx, by + sy, h), iso(bx + sx, by + sy, 0), iso(bx + sx, by, 0)];
  g.push(poly(sw, { fill: FW1, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(se, { fill: FW1, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(se, { fill: "#000000", opacity: 0.22 }));           // SE shading pass
  g.push(poly(top, { fill: TOPF, stroke: rim || A1, stroke_width: 2.5 }));
  const rows = 4; const fh_ = h * U; const rh = fh_ / rows;
  const Tsw = iso(bx, by + sy, h), Tse = iso(bx + sx, by, h);
  // each face's pattern is clipped to that face's own width: the long SW
  // face gets full bond, the narrow SE end gets courses only
  const faces: [[number, number], string, number, boolean][] = [
    [Tsw, "0.866", sx * U, true],
    [Tse, "-0.866", sy * U, false],
  ];
  for (const [[Tx, Ty], basis, fw_, joints] of faces) {
    const m: string[] = [];
    for (let r_ = 1; r_ < rows; r_++) {                             // courses
      m.push(`<line x1="0" y1="${pyf(r_ * rh, 1)}" x2="${pyf(fw_, 1)}" y2="${pyf(r_ * rh, 1)}" `
        + `stroke="${FW2}" stroke-width="2"/>`);
    }
    if (joints) {
      const bw_ = fw_ / 3.5;
      for (let r_ = 0; r_ < rows; r_++) {                           // staggered joints
        let jx = r_ % 2 ? bw_ / 2 : bw_;
        while (jx < fw_ - 1) {
          m.push(`<line x1="${pyf(jx, 1)}" y1="${pyf(r_ * rh, 1)}" x2="${pyf(jx, 1)}" `
            + `y2="${pyf((r_ + 1) * rh, 1)}" stroke="${FW2}" stroke-width="2"/>`);
          jx += bw_;
        }
      }
    }
    g.push(`<g transform="matrix(${basis},0.5,0,1,${pyf(Tx, 1)},${pyf(Ty, 1)})">${m.join("")}</g>`);
  }
  return g.join("");
}

// message queue: low long solid split into segments (dividers cross the top
// face and run down the SW face so the segmentation reads in 3D)
export function queue(x: number, y: number, kw: Kw = {}): string {
  const { rim, s = 1.4, h = 0.5, segs = 4 } = kw;
  const by = y + 0.45, sy = 0.5;
  const g = [plate(x, y, s), box(x, by, { rim, sx: s, sy, h, with_plate: false })];
  for (let i = 1; i < segs; i++) {
    const t = x + s * i / segs;
    g.push(pline([iso(t, by, h), iso(t, by + sy, h)], { stroke: SEF, stroke_width: 1.8 }));
    g.push(pline([iso(t, by + sy, h), iso(t, by + sy, 0)], { stroke: SEF, stroke_width: 1.8 }));
  }
  return g.join("");
}

// blob/file storage (Azure Storage Account, S3-style bucket role): a stack of
// equal layers with seam lines between them — reads as "layered object store"
export function store(x: number, y: number, kw: Kw = {}): string {
  const { rim, s = 1.4, layers = 3, lh = 0.28 } = kw;
  const g = [plate(x, y, s)];
  for (let i = 0; i < layers; i++) {
    const z0 = i * lh, z1 = (i + 1) * lh;
    const top = [iso(x, y, z1), iso(x + s, y, z1), iso(x + s, y + s, z1), iso(x, y + s, z1)];
    const sw = [iso(x, y + s, z1), iso(x + s, y + s, z1), iso(x + s, y + s, z0), iso(x, y + s, z0)];
    const se = [iso(x + s, y, z1), iso(x + s, y + s, z1), iso(x + s, y + s, z0), iso(x + s, y, z0)];
    g.push(poly(sw, { fill: SWF, stroke: EDGE, stroke_width: 0.5, opacity: 0.98 }));
    g.push(poly(se, { fill: SEF, stroke: EDGE, stroke_width: 0.5, opacity: 0.98 }));
    if (i < layers - 1) {  // seam: front top edges of this layer stay visible
      g.push(pline([iso(x, y + s, z1), iso(x + s, y + s, z1), iso(x + s, y, z1)],
        { stroke: EDGE, stroke_width: 1.4, opacity: 0.85 }));
    } else {
      g.push(poly(top, { fill: TOPF, stroke: rim, stroke_width: 2.5 }));
    }
  }
  return g.join("");
}

// ---- devices & people (billboard-ish real shapes) ----
export function person(X: number, Y: number): string {
  return `<circle cx="${pyf(X, 1)}" cy="${pyf(Y - 56, 1)}" r="7.5" fill="${INK}"/>`
    + `<path d="M ${pyf(X - 11, 1)} ${pyf(Y - 45, 1)} Q ${pyf(X, 1)} ${pyf(Y - 51, 1)} ${pyf(X + 11, 1)} ${pyf(Y - 45, 1)} `
    + `L ${pyf(X + 11, 1)} ${pyf(Y - 24, 1)} Q ${pyf(X + 11, 1)} ${pyf(Y - 20, 1)} ${pyf(X + 7, 1)} ${pyf(Y - 20, 1)} `
    + `L ${pyf(X + 7, 1)} ${pyf(Y, 1)} L ${pyf(X + 2, 1)} ${pyf(Y, 1)} L ${pyf(X + 2, 1)} ${pyf(Y - 16, 1)} `
    + `L ${pyf(X - 2, 1)} ${pyf(Y - 16, 1)} L ${pyf(X - 2, 1)} ${pyf(Y, 1)} L ${pyf(X - 7, 1)} ${pyf(Y, 1)} `
    + `L ${pyf(X - 7, 1)} ${pyf(Y - 20, 1)} Q ${pyf(X - 11, 1)} ${pyf(Y - 20, 1)} ${pyf(X - 11, 1)} ${pyf(Y - 24, 1)} Z" fill="${INK}"/>`;
}

// person holding a phone out (billboard, like the reference device-holders)
export function personDevice(X: number, Y: number): string {
  return person(X, Y)
    + `<path d="M ${pyf(X + 9, 1)} ${pyf(Y - 42, 1)} L ${pyf(X + 23, 1)} ${pyf(Y - 33, 1)}" stroke="${INK}" `
    + `stroke-width="5" stroke-linecap="round" fill="none"/>`
    + `<rect x="${pyf(X + 20, 1)}" y="${pyf(Y - 50, 1)}" width="9.5" height="15.5" rx="1.5" `
    + `fill="${SCR}" stroke="${BEZ}" stroke-width="1.6"/>`;
}

export function laptop(x: number, y: number, kw: Kw = {}): string {
  const { w = 0.95, d = 0.60, hb = 0.07, hs = 0.64 } = kw;
  const g: string[] = [];
  const sw = [iso(x, y + d, hb), iso(x + w, y + d, hb), iso(x + w, y + d, 0), iso(x, y + d, 0)];
  const se = [iso(x + w, y, hb), iso(x + w, y + d, hb), iso(x + w, y + d, 0), iso(x + w, y, 0)];
  g.push(poly(sw, { fill: SWF, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(se, { fill: SEF, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(zrect(x, y, x + w, y + d, hb), { fill: TOPF, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(zrect(x + 0.08, y + 0.10, x + w - 0.08, y + d - 0.12, hb), { fill: KEYS }));
  const scr = [iso(x + 0.03, y + 0.05, hb), iso(x + w - 0.03, y + 0.05, hb),
    iso(x + w - 0.03, y - 0.10, hb + hs), iso(x + 0.03, y - 0.10, hb + hs)];
  g.push(poly(scr, { fill: BEZ, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(inset(scr, 0.13), { fill: SCR }));
  return g.join("");
}

// thin upright slab with screen on the SW face; z0 lifts it (monitor panels)
export function screenSlab(x: number, y: number, kw: Kw = {}): string {
  const { w = 0.34, d = 0.10, h = 0.72, z0 = 0.0, it = 0.16 } = kw;
  const g: string[] = [];
  const sw = [iso(x, y + d, z0 + h), iso(x + w, y + d, z0 + h), iso(x + w, y + d, z0), iso(x, y + d, z0)];
  const se = [iso(x + w, y, z0 + h), iso(x + w, y + d, z0 + h), iso(x + w, y + d, z0), iso(x + w, y, z0)];
  g.push(poly(se, { fill: SEF, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(sw, { fill: BEZ, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(zrect(x, y, x + w, y + d, z0 + h), { fill: TOPF, stroke: EDGE, stroke_width: 0.5 }));
  g.push(poly(inset(sw, it), { fill: SCR }));
  return g.join("");
}

export function phone(x: number, y: number, kw: Kw = {}): string {
  const { w = 0.34, d = 0.10, h = 0.72 } = kw;
  return screenSlab(x, y, { w, d, h });
}

// upright browser-window billboard: bezel slab + title bar with dots + page lines
export function browser(x: number, y: number, kw: Kw = {}): string {
  const { w = 1.25, d = 0.09, h = 0.88 } = kw;
  const g = [screenSlab(x, y, { w, d, h, it: 0.06 })];
  const bar = [iso(x + 0.02, y + d, h - 0.03), iso(x + w - 0.02, y + d, h - 0.03),
    iso(x + w - 0.02, y + d, h - 0.17), iso(x + 0.02, y + d, h - 0.17)];
  g.push(poly(bar, { fill: BBAR }));
  for (let i = 0; i < 3; i++) {
    const [Dx, Dy] = iso(x + 0.10 + i * 0.11, y + d, h - 0.10);
    g.push(`<circle cx="${pyf(Dx, 1)}" cy="${pyf(Dy, 1)}" r="2.2" fill="${SCR}"/>`);
  }
  for (const [z0, x1] of [[0.62, w - 0.14], [0.48, w - 0.30], [0.34, w - 0.50]] as Pt[]) {
    const ln = [iso(x + 0.12, y + d, z0), iso(x + x1, y + d, z0),
      iso(x + x1, y + d, z0 - 0.07), iso(x + 0.12, y + d, z0 - 0.07)];
    g.push(poly(ln, { fill: BLINE }));
  }
  return g.join("");
}

// standalone 3D padlock: wide shallow body (not a cube — a cube reads as a
// building), then the shackle drawn ON TOP — it lives entirely above the body
// so nothing occludes it, and its legs must land visibly on the top face.
// Shackle depth is faked by sweeping the arch along the +y offset in layered
// passes (dark back copy -> mid sweep -> light front face) — a single flat
// stroke reads as 2D.
export function padlock(x: number, y: number, kw: Kw = {}): string {
  const { rim, s = 1.4 } = kw;
  const g = [plate(x, y, s)];
  const bx = x + 0.20, by = y + 0.45, bw_ = 1.0, bd = 0.5, bh = 0.78;
  g.push(box(bx, by, { rim, glyph: GLYPHS["entra"], sx: bw_, sy: bd, h: bh, gk: 0.6, with_plate: false }));
  const sw_ = 0.66;                             // shackle span (grid units)
  const th = 0.14;                              // extrusion depth along +y
  const zt = bh + 0.62;                         // arch top; legs end at body top
  const yc = by + bd / 2 - th / 2;              // back plane of the swept bar
  const [Ax, Ay] = iso(bx + (bw_ - sw_) / 2, yc, zt);
  const W = sw_ * U; const R = (W - 13) / 2; const SH = 0.62 * U;
  const arch = `M 6.5 ${pyf(SH, 0)} L 6.5 ${pyf(R + 4, 0)} A ${pyf(R, 0)} ${pyf(R, 0)} 0 0 1 ${pyf(W - 6.5, 0)} ${pyf(R + 4, 0)} `
    + `L ${pyf(W - 6.5, 0)} ${pyf(SH, 0)}`;
  const dX = -0.866 * th * U, dY = 0.5 * th * U; // screen sweep vector for +y
  // stroke widths carry Python str(float) spelling ("9.0", not "9")
  const passes: [number, string, string][] = [[0.0, "#5d6579", "9.0"]];
  for (let i = 0; i <= 10; i++) passes.push([i / 10, "#8b93a8", "8.5"]);  // solid sweep
  passes.push([1.0, "#bfc7d4", "6.5"]);                                   // lit front face
  for (const [t, col, wd] of passes) {
    g.push(`<g transform="translate(${pyf(dX * t, 1)},${pyf(dY * t, 1)})">`
      + `<g transform="matrix(0.866,0.5,0,1,${pyf(Ax, 1)},${pyf(Ay, 1)})">`
      + `<path d="${arch}" fill="none" stroke="${col}" stroke-width="${wd}"/></g></g>`);
  }
  return g.join("");
}

export function monitor(x: number, y: number): string {
  // screen, neck, and foot share one iso center axis (u = x-y constant)
  const g = [screenSlab(x + 0.06, y + 0.16, { w: 1.16, d: 0.08, h: 0.78, z0: 0.34, it: 0.12 })];
  g.push(box(x + 0.67, y + 0.23, { rim: EDGE, s: 0.22, h: 0.36, with_plate: false }));
  g.push(box(x + 0.75, y + 0.31, { rim: EDGE, s: 0.5, h: 0.06, with_plate: false }));
  return g.join("");
}

// end users: person silhouette + laptop + phone sharing one plate
export function users(x: number, y: number, kw: Kw = {}): string {
  const { s = 1.4 } = kw;
  const g = [plate(x, y, s)];
  const [Xp, Yp] = iso(x + 0.40, y + 0.40);
  g.push(person(Xp, Yp));
  g.push(phone(x + 1.02, y + 0.16));
  g.push(laptop(x + 0.16, y + 0.70));
  return g.join("");
}

// ---- unit registry: place by name on whole grid cells, connect by name ----
// Units SNAP to the grid: positions are integer cell coords and every unit
// occupies a whole-cell footprint (default 2x2; `cells: [w, d]` overrides).
// The shape is centered inside its cell block, overlapping footprints are a
// hard error, and flow endpoints land exactly on grid lines.
// Edge names are grid axes: "-x" (screen upper-left edge), "+x" (lower-right),
// "-y" (upper-right), "+y" (lower-left).
type ShapeFn = (x: number, y: number, kw: Kw) => string;
interface UnitRec {
  fn: ShapeFn; dx: number; dy: number; s: number; kw: Kw;
  rect: [number, number, number, number];
}
const _UNITS = new Map<string, UnitRec>();
export const PLATE_M = 0.22;    // plate outer-edge margin beyond the unit footprint

export function resetUnits(): void { _UNITS.clear(); }

export function unit(name: string, fn: ShapeFn, x: number, y: number, opts: Kw = {}): void {
  // s: authored override > the shape's declared default > the generic 1.4.
  // It stays in kw so the shape draws the same footprint the registry
  // centers and hulls (they diverged once — see ShapeProps.defS).
  const { cells = null, ...kw } = opts;
  const s = kw.s ?? _shapeProps(fn).defS ?? 1.4;
  kw.s = s;
  if (!(Number.isInteger(x) && Number.isInteger(y))) {
    throw new Error(`unit '${name}': position must snap to grid cells, got (${x}, ${y})`);
  }
  const [w, d] = cells ?? [2, 2];
  if (s + 2 * PLATE_M > Math.min(w, d)) {
    throw new Error(`unit '${name}': shape (s=${s} + plate) exceeds its ${w}x${d} cells`);
  }
  const rect: [number, number, number, number] = [x, y, x + w, y + d];
  for (const [other, u] of _UNITS) {
    const r = u.rect;
    if (!(rect[2] <= r[0] || r[2] <= rect[0] || rect[3] <= r[1] || r[3] <= rect[1])) {
      throw new Error(`unit '${name}' at (${rect.join(", ")}) overlaps '${other}' at (${r.join(", ")})`);
    }
  }
  const dx = x + (w - s) / 2, dy = y + (d - s) / 2;   // shape centered in its cells
  _UNITS.set(name, { fn, dx, dy, s, kw, rect });
}

/** Pack member units into rows/columns on the snapped grid and return the
enclosing plane rect. Members place row-major from `origin` (an integer
cell): each takes its whole-cell block (`cells` in its kw, default 2x2),
the cursor advances by block width + `gap` cells, and a new row starts
below the deepest block of the row above. Placement goes through unit(),
so every guard applies — grid snap, footprint overlap (including against
units placed outside the group) — and members connect/annotate by name
like any hand-placed unit. Explicit unit() remains the authored override
for irregular arrangements. The returned rect (cells + `pad`) feeds
plane() and autoLabel() so the grouping sheet is derived, not authored. */
export function group(origin: Pt, members: [string, ShapeFn, Kw?][],
  opts: { cols?: number; gap?: number; pad?: number } = {}): [number, number, number, number] {
  const { cols = Math.ceil(Math.sqrt(members.length)), gap = 1, pad = 0.6 } = opts;
  if (members.length === 0) throw new Error("group: no members to pack");
  if (!Number.isInteger(gap) || gap < 0) {
    throw new Error(`group: gap must be a whole number of cells, got ${gap}`);
  }
  if (!Number.isInteger(cols) || cols < 1) {
    throw new Error(`group: cols must be a positive integer, got ${cols}`);
  }
  const [ox, oy] = origin;
  let cx = ox, cy = oy, rowD = 0;
  let x1 = ox, y1 = oy;
  members.forEach(([name, fn, kw = {}], i) => {
    if (i > 0 && i % cols === 0) { cx = ox; cy += rowD + gap; rowD = 0; }
    const [w, d] = kw.cells ?? [2, 2];
    unit(name, fn, cx, cy, kw);
    x1 = Math.max(x1, cx + w); y1 = Math.max(y1, cy + d);
    cx += w + gap; rowD = Math.max(rowD, d);
  });
  return [ox - pad, oy - pad, x1 + pad, y1 + pad];
}

export function renderUnits(): string {
  return Array.from(_UNITS.values())
    .sort((a, b) => (a.dx + a.dy) - (b.dx + b.dy))
    .map(u => u.fn(u.dx, u.dy, u.kw))
    .join("");
}

function _unit(name: string): UnitRec {
  const u = _UNITS.get(name);
  if (!u) throw new Error(`no such unit: '${name}'`);
  return u;
}

export function edgePt(name: string, side: string, t = 0.5): Pt {
  const [x0, y0, x1, y1] = _unit(name).rect;  // cell rect: endpoints on grid lines
  if (side === "-x") return [x0, y0 + (y1 - y0) * t];
  if (side === "+x") return [x1, y0 + (y1 - y0) * t];
  if (side === "-y") return [x0 + (x1 - x0) * t, y0];
  if (side === "+y") return [x0 + (x1 - x0) * t, y1];
  throw new Error(String(side));
}

function _center(name: string): Pt {
  const [x0, y0, x1, y1] = _unit(name).rect;
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

export const STYLES: Record<string, FlowOpts> = {
  request: { width: 2.5 },
  data: { width: 1.8, dashed: true, dot: true },
  sync: { width: 1.6, heads: "both" },
};

export type Edge = string | [string, number];

export interface ConnectOpts extends FlowOpts {
  exit?: Edge; enter?: Edge; via?: Pt[]; style?: string; color?: string;
}

// ---- auto flow routing ----
const _ROUTE_CLEAR = 0.45;   // route clearance around unit cell rects, in cells

function _sideDir(side: string): Pt {
  if (side === "+x") return [1, 0];
  if (side === "-x") return [-1, 0];
  if (side === "+y") return [0, 1];
  if (side === "-y") return [0, -1];
  throw new Error(String(side));
}

/** Orthogonal route between two units' edge points, used by connect() when
no `via` is authored. Routes on the Hanan grid of every unit's cell rect
expanded by the clearance margin (A*, shortest length, 0.75-cell penalty
per bend, deterministic tie-breaking), so flows detour around units instead
of the old blind L-elbow. A clear straight line stays the plain two-point
segment it always was. Exit/enter stubs step off the edge before routing
begins — a full 1.0-cell stub when there is room (the arrowhead is 0.42
cells long, and a bend at the bare clearance margin chokes the head with
~1px of visible shaft), falling back to `clearance`; an edge flush against
a neighbour has no stub room at all and errors rather than drawing through
it. No route at all is a hard error: add authored `via` waypoints.
Equal-cost detours break toward the screen-front lane (higher x+y): in
isometric projection a back lane runs behind the blocker's top face and
the flow disappears there. */
export function autoVia(a: string, b: string, exit: Edge, enter: Edge): Pt[] {
  const C = _ROUTE_CLEAR, STUB = 1.0, EPS = 1e-9;
  const p0 = Array.isArray(exit) ? edgePt(a, exit[0], exit[1]) : edgePt(a, exit);
  const p1 = Array.isArray(enter) ? edgePt(b, enter[0], enter[1]) : edgePt(b, enter);
  const d0 = _sideDir(Array.isArray(exit) ? exit[0] : exit);
  const d1 = _sideDir(Array.isArray(enter) ? enter[0] : enter);
  const rects = Array.from(_UNITS.values(), u => u.rect);
  const noRoute = (): never => {
    throw new Error(`connect '${a}' -> '${b}': no clear route between the units — `
      + "add via waypoints");
  };
  // an axis-aligned segment is blocked when its box overlaps the OPEN
  // expanded rect — running exactly on the clearance boundary is legal
  const blocked = (u: Pt, v: Pt): boolean => rects.some(r =>
    Math.min(u[0], v[0]) < r[2] + C - EPS && Math.max(u[0], v[0]) > r[0] - C + EPS
    && Math.min(u[1], v[1]) < r[3] + C - EPS && Math.max(u[1], v[1]) > r[1] - C + EPS);
  // stub run beyond the own-margin boundary must be clear of every margin
  const stubOk = (p: Pt, d: Pt, L: number): boolean =>
    !blocked([p[0] + d[0] * C, p[1] + d[1] * C], [p[0] + d[0] * L, p[1] + d[1] * L]);
  // longer enter stub preferred over longer exit: the head is at the enter end
  for (const [L0, L1] of [[STUB, STUB], [C, STUB], [STUB, C], [C, C]]) {
    if (!stubOk(p0, d0, L0) || !stubOk(p1, d1, L1)) continue;
    const pts = _route(p0, p1, [p0[0] + d0[0] * L0, p0[1] + d0[1] * L0],
      [p1[0] + d1[0] * L1, p1[1] + d1[1] * L1], d0, d1, rects, blocked);
    if (pts) return pts;
  }
  return noRoute();
}

function _route(p0: Pt, p1: Pt, q0: Pt, q1: Pt, d0: Pt, d1: Pt,
  rects: [number, number, number, number][],
  blocked: (u: Pt, v: Pt) => boolean): Pt[] | null {
  const C = _ROUTE_CLEAR, BEND = 0.75, EPS = 1e-9;
  // Hanan grid: expanded rect boundaries + both stub points
  const uniq = (vals: number[]): number[] =>
    [...new Map(vals.map(v => [v.toFixed(6), v])).values()].sort((m, n) => m - n);
  const xs = uniq([q0[0], q1[0], ...rects.flatMap(r => [r[0] - C, r[2] + C])]);
  const ys = uniq([q0[1], q1[1], ...rects.flatMap(r => [r[1] - C, r[3] + C])]);
  const xi = (v: number): number => xs.findIndex(x => Math.abs(x - v) < 1e-6);
  const yi = (v: number): number => ys.findIndex(y => Math.abs(y - v) < 1e-6);
  // tie-break bias: prefer front lanes (higher x+y). Orders of magnitude
  // below the smallest real length/bend difference, so it only decides ties.
  const FRONT = xs[xs.length - 1] + ys[ys.length - 1];
  const TIE = 1e-5;
  const DIRS: Pt[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const di = (d: Pt): number => DIRS.findIndex(e => e[0] === d[0] && e[1] === d[1]);
  // A* over (grid node, incoming direction); h = Manhattan distance to q1
  const W = xs.length;
  const key = (i: number, j: number, k: number): number => (j * W + i) * 4 + k;
  const best = new Map<number, number>();
  const from = new Map<number, number>();
  const h = (i: number, j: number): number =>
    Math.abs(xs[i] - q1[0]) + Math.abs(ys[j] - q1[1]);
  const start = key(xi(q0[0]), yi(q0[1]), di(d0));
  best.set(start, 0);
  const open: [number, number][] = [[h(xi(q0[0]), yi(q0[1])), start]];   // [f, key]
  const goalI = xi(q1[0]), goalJ = yi(q1[1]);
  let goalKey = -1;
  while (open.length) {
    let m = 0;   // deterministic min-extract: smallest f, then smallest key
    for (let n = 1; n < open.length; n++) {
      if (open[n][0] < open[m][0] - EPS
        || (Math.abs(open[n][0] - open[m][0]) <= EPS && open[n][1] < open[m][1])) m = n;
    }
    const [, cur] = open.splice(m, 1)[0];
    const k = cur % 4, i = ((cur - k) / 4) % W, j = ((cur - k) / 4 - i) / W;
    const g = best.get(cur)!;
    if (i === goalI && j === goalJ) {
      // arriving opposite the final stub would double back onto it
      if (DIRS[k][0] === d1[0] && DIRS[k][1] === d1[1]) continue;
      goalKey = cur; break;
    }
    for (let nk = 0; nk < 4; nk++) {
      const ni = i + DIRS[nk][0], nj = j + DIRS[nk][1];
      if (ni < 0 || ni >= W || nj < 0 || nj >= ys.length) continue;
      const u: Pt = [xs[i], ys[j]], v: Pt = [xs[ni], ys[nj]];
      if (blocked(u, v)) continue;
      const len = Math.abs(v[0] - u[0]) + Math.abs(v[1] - u[1]);
      const ng = g + len + (nk === k ? 0 : BEND)
        + TIE * len * (FRONT - (u[0] + u[1] + v[0] + v[1]) / 2);
      const nkey = key(ni, nj, nk);
      if (ng < (best.get(nkey) ?? Infinity) - EPS) {
        best.set(nkey, ng); from.set(nkey, cur);
        open.push([ng + h(ni, nj), nkey]);
      }
    }
  }
  if (goalKey < 0) return null;
  const rev: Pt[] = [];
  for (let cur: number | undefined = goalKey; cur !== undefined; cur = from.get(cur)) {
    const k = cur % 4, i = ((cur - k) / 4) % W, j = ((cur - k) / 4 - i) / W;
    rev.push([xs[i], ys[j]]);
  }
  const pts = [p0, ...rev.reverse(), p1];
  const out_: Pt[] = [pts[0]];   // collapse duplicates and collinear runs
  for (let n = 1; n < pts.length - 1; n++) {
    const [px, py] = out_[out_.length - 1], [cx_, cy_] = pts[n], [nx, ny] = pts[n + 1];
    if (Math.abs(cx_ - px) < EPS && Math.abs(cy_ - py) < EPS) continue;
    if ((Math.abs(px - cx_) < EPS && Math.abs(cx_ - nx) < EPS)
      || (Math.abs(py - cy_) < EPS && Math.abs(cy_ - ny) < EPS)) continue;
    out_.push(pts[n]);
  }
  out_.push(pts[pts.length - 1]);
  return out_;
}

export function connect(a: string, b: string, opts: ConnectOpts = {}): string {
  const { via = null, style = "request", color = null, exit: exit0, enter: enter0, ...fkw } = opts;
  let exit = exit0, enter = enter0;
  const [ax, ay] = _center(a), [bx, by] = _center(b);
  const dx = bx - ax, dy = by - ay;
  if (exit == null) exit = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "+x" : "-x") : (dy > 0 ? "+y" : "-y");
  if (enter == null) enter = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "-x" : "+x") : (dy > 0 ? "-y" : "+y");
  const p0 = Array.isArray(exit) ? edgePt(a, exit[0], exit[1]) : edgePt(a, exit);
  const p1 = Array.isArray(enter) ? edgePt(b, enter[0], enter[1]) : edgePt(b, enter);
  // authored via wins; otherwise route around every unit automatically
  const pts_: Pt[] = via != null ? [p0, ...via, p1] : autoVia(a, b, exit, enter);
  const kw: FlowOpts = { ...STYLES[style], ...fkw };
  return flow(pts_, color || (style === "data" ? FLOW2 : FLOW), kw);
}

// ---- narrative ----
/** Per-shape collision properties, declared ON the shape function itself —
never looked up by fn.name (name lookups break under minification and force
engine edits for every new shape). `defH` is the typical silhouette height
(kw "h" overrides per unit; 1.0 if undeclared). `hull` (optional) returns a
screen hull tighter than the footprint box, for shapes much slimmer than
their cells — cyl's drum is the exemplar. `defS` is the shape's default
footprint size, needed by the unit registry whenever it differs from the
generic 1.4 (building's 1.1 went undeclared once: the registry centered
and hulled a 1.4 footprint around a 1.1 drawing, 12px of phantom air).
`body` (optional) returns the
solid's own silhouette — no plate ring — used only for chip tip snapping
(see _bodyHull); the default footprint-at-height hull is right for boxy
shapes. New shapes: declare defH; add hull/body only when the defaults
carry phantom air that labels or chips care about. */
export interface ShapeProps {
  defH?: number;
  defS?: number;
  hull?: (x: number, y: number, s: number, kw: Kw) => Pt[];
  body?: (x: number, y: number, s: number, kw: Kw) => Pt[];
}
const _shapeProps = (fn: unknown): ShapeProps => fn as ShapeProps;

/** cyl's tight hull: plate corners + the drum's actual screen box. The
footprint box has ~28px of phantom air beside the drum — labels there are
fine, and chips snapped to it would float far off the drum. */
function _cylHull(x: number, y: number, s: number, kw: Kw): Pt[] {
  const r = kw.r ?? 0.5, h = kw.h ?? 1.25;
  const cx = x + s / 2, cy = y + s / 2;
  const [Xc, Yt] = iso(cx, cy, h); const Yb = iso(cx, cy, 0)[1];
  const rx = 1.2247 * r * U, ry = 0.577 * rx;
  const m = PLATE_M;
  return _hull([iso(x - m, y - m), iso(x + s + m, y - m),
    iso(x + s + m, y + s + m), iso(x - m, y + s + m),
    [Xc - rx, Yt - ry], [Xc + rx, Yt - ry], [Xc - rx, Yb + ry], [Xc + rx, Yb + ry]]);
}

/** cyl's body for chip snapping: the drum's screen silhouette alone — the
ground footprint corners are plate-adjacent air the tip must not stop in.
Sampled arc points, not the drum's bounding box: the box corners overshoot
the elliptical caps by ~9px and a diagonal-approach tip stops in that air
(hybrid's chip 5 pointed at the plate instead of the drum's lower arc). */
function _cylBody(x: number, y: number, s: number, kw: Kw): Pt[] {
  const r = kw.r ?? 0.5, h = kw.h ?? 1.25;
  const cx = x + s / 2, cy = y + s / 2;
  const [Xc, Yt] = iso(cx, cy, h); const Yb = iso(cx, cy, 0)[1];
  const rx = 1.2247 * r * U, ry = 0.577 * rx;
  const pts: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * Math.PI;
    pts.push([Xc + rx * Math.cos(t), Yt - ry * Math.sin(t)]);   // top cap arc
    pts.push([Xc + rx * Math.cos(t), Yb + ry * Math.sin(t)]);   // bottom cap arc
  }
  return pts;
}

/** wall's body for chip snapping: the brick slab it actually draws — a
1.30 x 0.40 sliver of the 1.4 footprint (offsets mirror wall()). */
function _wallBody(x: number, y: number, s: number, kw: Kw): Pt[] {
  const h = kw.h ?? 1.0;
  const bx = x + 0.05, by = y + 0.50, sx = 1.30, sy = 0.40;
  return [iso(bx, by, h), iso(bx + sx, by, h), iso(bx + sx, by + sy, h),
    iso(bx, by + sy, h), iso(bx, by), iso(bx + sx, by),
    iso(bx + sx, by + sy), iso(bx, by + sy)];
}

/** users' body for chip snapping: the person + laptop + phone ensemble it
actually draws (offsets mirror users()) — the footprint box is mostly the
empty plate around them. The person is a screen-space billboard: head circle
(r 7.5, top at anchor−63.5) over an anchor±11 torso. */
function _usersBody(x: number, y: number, _s: number, _kw: Kw): Pt[] {
  const [Xp, Yp] = iso(x + 0.40, y + 0.40);
  const pts: Pt[] = [[Xp - 7.5, Yp - 63.5], [Xp + 7.5, Yp - 63.5],
    [Xp - 11, Yp - 51], [Xp + 11, Yp - 51], [Xp - 11, Yp], [Xp + 11, Yp]];
  const px_ = x + 1.02, py_ = y + 0.16;   // phone slab 0.34 x 0.10 x 0.72
  for (const [gx, gy] of [[px_, py_], [px_ + 0.34, py_],
    [px_ + 0.34, py_ + 0.10], [px_, py_ + 0.10]] as Pt[])
    for (const z of [0, 0.72]) pts.push(iso(gx, gy, z));
  const lx = x + 0.16, ly = y + 0.70;     // laptop base 0.95 x 0.60 + screen
  for (const [gx, gy] of [[lx, ly], [lx + 0.95, ly],
    [lx + 0.95, ly + 0.60], [lx, ly + 0.60]] as Pt[])
    for (const z of [0, 0.07]) pts.push(iso(gx, gy, z));
  pts.push(iso(lx + 0.03, ly - 0.10, 0.71), iso(lx + 0.92, ly - 0.10, 0.71));
  return pts;
}

Object.assign(box,      { defH: 0.95 });
Object.assign(cyl,      { defH: 1.25, hull: _cylHull, body: _cylBody });
Object.assign(rack,     { defH: 1.15 });
Object.assign(building, { defH: 2.3, defS: 1.1 });
Object.assign(padlock,  { defH: 1.6 });
Object.assign(users,    { defH: 1.3, body: _usersBody });
Object.assign(slab,     { defH: 0.22 });
Object.assign(panel,    { defH: 0.12 });
Object.assign(wall,     { defH: 1.0, body: _wallBody });
Object.assign(queue,    { defH: 0.5 });
Object.assign(store,    { defH: 0.84 });

function _hull(points: Pt[]): Pt[] {
  const seen = new Set<string>();
  const uniq: Pt[] = [];
  for (const p of points) {
    const k = `${p[0]},${p[1]}`;
    if (!seen.has(k)) { seen.add(k); uniq.push(p); }
  }
  const pts_ = uniq.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  function half(ps: Pt[]): Pt[] {
    const h: Pt[] = [];
    for (const p of ps) {
      while (h.length >= 2 && ((h[h.length - 1][0] - h[h.length - 2][0]) * (p[1] - h[h.length - 2][1])
        - (h[h.length - 1][1] - h[h.length - 2][1]) * (p[0] - h[h.length - 2][0])) <= 0) {
        h.pop();
      }
      h.push(p);
    }
    return h;
  }
  const lo = half(pts_); const hi = half(pts_.slice().reverse());
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/** Screen-space convex outline of a unit: plate corners on the ground plus
footprint corners at the unit's height — what the shape visually occupies,
which is far more than its ground rect for tall shapes. */
function _silhouette(name: string): Pt[] {
  const { fn, dx: x, dy: y, s, kw } = _unit(name);
  const h = kw.h ?? _shapeProps(fn).defH ?? 1.0;
  const m = PLATE_M;
  return _hull([iso(x - m, y - m), iso(x + s + m, y - m),
    iso(x + s + m, y + s + m), iso(x - m, y + s + m),
    iso(x, y, h), iso(x + s, y, h), iso(x + s, y + s, h), iso(x, y + s, h)]);
}

/** Number bubble shared by chips and legend rows: one digit keeps the classic
r=11 circle; more digits widen it into a horizontal pill (same 22px height,
0.6em advance per digit, 1-digit side padding preserved) — numbers stay
readable to 9999 without ballooning into a bigger circle. `ext` sets the
anchor semantics: 0 = shape centered on (cx, cy); -1/+1 = (cx, cy) is the
end-cap center and the body grows in that screen-x direction — pointer chips
grow away from their target so the tail tip never moves with digit count,
and the legend grows left so every row's number shares one right edge. */
function _numShape(n: number, cx: number, cy: number, ext: -1 | 0 | 1): string {
  const d = String(n).length;
  const hw = 3.6 * d + 7.4;               // half-width; 11 when d = 1
  const c = cx + ext * (hw - 11);          // pill (and text) center
  const shape = d === 1
    ? `<circle cx="${pyf(cx, 0)}" cy="${pyf(cy, 0)}" r="11" fill="${A1}"/>`
    : `<rect x="${pyf(c - hw, 0)}" y="${pyf(cy - 11, 0)}" width="${pyf(2 * hw, 0)}" `
      + `height="22" rx="11" fill="${A1}"/>`;
  return shape + `<text x="${pyf(c, 0)}" y="${pyf(cy + 4, 0)}" font-family=${MONOQ} `
    + `font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle">${n}</text>`;
}

/** Numbered marker. to = unit name or [gx, gy]: grows a pointer tail
from the circle toward what it labels (Azure-style pin, not a bare dot).
The authored position sets only the approach direction; the chip slides
along that ray so the tip sits exactly `gap` px off the unit's BODY
silhouette (the solid alone — see _bodyHull), however close or far it was
authored. */
// registered screen footprint of every chip balloon, checked by checkChips()
// at write() time. `strict` chips (bare, or aimed at a unit by name) are
// checked against units and labels too; point-target chips are the authored
// escape hatch that deliberately aims into things (label text, a unit face),
// so they register bubble-only and skip those two checks.
const _CHIPS: { n: number; poly: Pt[]; strict: boolean; target?: string }[] = [];

export function chip(n: number, x: number, y: number, to: string | Pt | null = null, gap = 5.0): string {
  let [X, Y] = iso(x, y);
  let ext: -1 | 0 | 1 = 0;   // bare chips center the bubble on the point
  let tip: Pt | null = null;
  const g: string[] = [];
  if (to != null) {
    let TX: number, TY: number;
    if (typeof to === "string") {
      const hull = _bodyHull(to);
      TX = hull.reduce((a, p) => a + p[0], 0) / hull.length;
      TY = hull.reduce((a, p) => a + p[1], 0) / hull.length;
      const dx = TX - X, dy = TY - Y;
      let tHit: number | null = null;    // first crossing of ray A->centroid with the hull
      for (let i = 0; i < hull.length; i++) {
        const [px, py] = hull[i], [qx, qy] = hull[(i + 1) % hull.length];
        const ex = qx - px, ey = qy - py;
        const den = dx * ey - dy * ex;   // cross(d, e)
        if (Math.abs(den) < 1e-9) continue;
        const t_ = ((px - X) * ey - (py - Y) * ex) / den;   // cross(P-A, e)/cross(d, e)
        const s_ = ((px - X) * dy - (py - Y) * dx) / den;   // cross(P-A, d)/cross(d, e)
        if (t_ > 1e-9 && -1e-6 <= s_ && s_ <= 1 + 1e-6) {
          if (tHit === null || t_ < tHit) tHit = t_;
        }
      }
      const th = tHit ?? 1.0;
      TX = X + dx * th; TY = Y + dy * th;
    } else {
      [TX, TY] = iso(to[0], to[1]);
    }
    const dx = TX - X, dy = TY - Y;
    const L = (dx * dx + dy * dy) ** 0.5 || 1.0;
    const ux = dx / L, uy = dy / L;
    const a = Math.atan2(uy, ux);
    // auto-snap: authored position sets only the DIRECTION; the chip
    // slides along that ray so the tip sits exactly `gap` px off the edge
    tip = [TX - ux * gap, TY - uy * gap];
    X = tip[0] - ux * 19; Y = tip[1] - uy * 19;
    ext = ux > 0 ? -1 : 1;   // multi-digit body grows away from the target
    const b1: Pt = [X + 9.5 * Math.cos(a + 0.55), Y + 9.5 * Math.sin(a + 0.55)];
    const b2: Pt = [X + 9.5 * Math.cos(a - 0.55), Y + 9.5 * Math.sin(a - 0.55)];
    g.push(poly([tip, b1, b2], { fill: A1 }));
  }
  g.push(_numShape(n, X, Y, ext));
  const strict = to == null || typeof to === "string";
  const d = String(n).length, hw = 3.6 * d + 7.4, c = X + ext * (hw - 11);
  const corners: Pt[] = [[c - hw, Y - 11], [c + hw, Y - 11], [c + hw, Y + 11], [c - hw, Y + 11]];
  _CHIPS.push({ n, strict, poly: _hull(strict && tip ? [...corners, tip] : corners),
    target: typeof to === "string" ? to : undefined });
  return g.join("");
}

/** Hard error when any chip balloon overlaps a unit hull, a flow route, a
label, another chip, or hangs off the canvas — run automatically at write()
time. Point-target chips (the authored aim-into-things escape hatch: label
text, unit faces, flow midpoints) are only checked against other chips and
the canvas — their placement is eyeball-verified by definition. */
export function checkChips(): void {
  for (let i = 0; i < _CHIPS.length; i++) {
    const { n, poly: p, strict, target } = _CHIPS[i];
    for (const [px, py] of p) {
      if (px < 8 || px > _CANVAS_W - 8 || py < 8 || py > _CANVAS_H - 8) {
        throw new Error(`chip ${n}: balloon runs off the ${_CANVAS_W}x${_CANVAS_H} canvas — move its approach point`);
      }
    }
    if (strict) {
      // the chip's own target is exempt: the tip deliberately hugs its body,
      // inside the plate-inclusive collision hull
      for (const name of _UNITS.keys()) {
        if (name === target) continue;
        if (_polysOverlap(p, _collisionHull(name))) {
          throw new Error(`chip ${n}: balloon overlaps unit '${name}' — move its approach point`);
        }
      }
      for (const l of _LABELS) {
        if (_polysOverlap(p, l.quad)) {
          throw new Error(`chip ${n}: balloon overlaps label "${l.txt}" — move its approach point`);
        }
      }
      for (const route of _FLOWPTS) {
        for (let s = 0; s < route.length - 1; s++) {
          if (_segHitsPoly(route[s], route[s + 1], p)) {
            throw new Error(`chip ${n}: a flow route runs through its balloon — move its approach point`);
          }
        }
      }
    }
    for (let j = 0; j < i; j++) {
      if (_polysOverlap(p, _CHIPS[j].poly)) {
        throw new Error(`chip ${n}: balloon overlaps chip ${_CHIPS[j].n} — move an approach point`);
      }
    }
  }
}

// One declaration per annotated unit drives BOTH its numbered chip and its
// legend entry — numbers are assigned in declaration order, so chips and the
// legend can never fall out of sync (they used to be three hand-synced pieces).
const _ANNOTS: [string, string, string, Pt | null][] = [];

/** Register unit `name` for annotation: chip approaching from grid point
`approach` — or, when omitted, from a clear side picked automatically at
annotations() time. Legend entry (title, desc). Declaration order = number
order. */
export function annotate(name: string, title: string, desc: string, approach: Pt | null = null): void {
  if (!_UNITS.has(name)) {
    throw new Error(`annotate '${name}': no such unit — declare unit() first`);
  }
  if (_ANNOTS.some(([n]) => n === name)) {
    throw new Error(`annotate '${name}': unit already annotated`);
  }
  _ANNOTS.push([name, title, desc, approach]);
}

// would this chip balloon be legal where it stands? Same battery as
// checkChips' strict path; used to pick auto approaches before emitting
function _chipSpotClear(p: Pt[], target?: string): boolean {
  for (const [px, py] of p) {
    if (px < 8 || px > _CANVAS_W - 8 || py < 8 || py > _CANVAS_H - 8) return false;
  }
  for (const name of _UNITS.keys()) {
    if (name === target) continue;
    if (_polysOverlap(p, _collisionHull(name))) return false;
  }
  for (const l of _LABELS) {
    if (_polysOverlap(p, l.quad)) return false;
  }
  for (const route of _FLOWPTS) {
    for (let s = 0; s < route.length - 1; s++) {
      if (_segHitsPoly(route[s], route[s + 1], p)) return false;
    }
  }
  for (const ch of _CHIPS) {
    if (_polysOverlap(p, ch.poly)) return false;
  }
  return true;
}

// pick a clear approach anchor for chip `n` on unit `name`: cast rays
// through the BODY hull centroid (the same hull chip() snaps the tip to) —
// screen-horizontal first so the balloon sits beside the solid, then the
// iso-grid diagonals, then steeper, verticals last. First direction whose
// balloon clears everything wins; the returned grid point feeds chip()
// unchanged.
function _autoApproach(n: number, name: string, railX: number): Pt {
  const hull = _bodyHull(name);
  const cx = hull.reduce((a, p) => a + p[0], 0) / hull.length;
  const cy = hull.reduce((a, p) => a + p[1], 0) / hull.length;
  const d = String(n).length, hw = 3.6 * d + 7.4;
  for (const deg of [0, 180, 30, 150, 330, 210, 60, 120, 300, 240, 90, 270]) {
    const th = deg * Math.PI / 180;
    const ux = Math.cos(th), uy = Math.sin(th);   // pointing direction, toward the unit
    let tExit: number | null = null;              // centroid -> boundary along -u
    for (let i = 0; i < hull.length; i++) {
      const [px, py] = hull[i], [qx, qy] = hull[(i + 1) % hull.length];
      const ex = qx - px, ey = qy - py;
      const den = -ux * ey + uy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t_ = ((px - cx) * ey - (py - cy) * ex) / den;
      const s_ = (-(px - cx) * uy + (py - cy) * ux) / den;
      if (t_ > 1e-9 && -1e-6 <= s_ && s_ <= 1 + 1e-6) {
        if (tExit === null || t_ < tExit) tExit = t_;
      }
    }
    if (tExit === null) continue;
    const H: Pt = [cx - ux * tExit, cy - uy * tExit];
    const tip: Pt = [H[0] - ux * 5, H[1] - uy * 5];
    const X = tip[0] - ux * 19, Y = tip[1] - uy * 19;
    const c = X + (ux > 0 ? -1 : 1) * (hw - 11);
    const p = _hull([[c - hw, Y - 11], [c + hw, Y - 11], [c + hw, Y + 11], [c - hw, Y + 11], tip]);
    if (p.some(pt => pt[0] > railX - 8)) continue;   // stay clear of the legend rail
    if (!_chipSpotClear(p, name)) continue;
    const AX = H[0] - ux * 70, AY = H[1] - uy * 70;  // any ray point past the bubble
    const u_ = (AX - OX) / CXu, v_ = (AY - OY) / CYu;
    return [(u_ + v_) / 2, (v_ - u_) / 2];
  }
  throw new Error(`annotate '${name}': no clear chip approach around the unit — `
    + "pass an explicit approach point");
}

/** Emit every annotated unit's chip plus the matching legend rail. */
export function annotations(opts: { footer?: string | null; x?: number; w?: number } = {}): string {
  const { footer = null, x = 1054, w = 346 } = opts;
  const g = _ANNOTS.map(([name, , , appr], i) => {
    const [ax, ay] = appr ?? _autoApproach(i + 1, name, x);
    return chip(i + 1, ax, ay, name);
  });
  g.push(legend(_ANNOTS.map(([, t, d]) => [t, d] as [string, string]), { footer, x, w }));
  return g.join("");
}

export function wrap(s: string, w = 34): string[] {
  const out: string[] = []; let line = "";
  for (const word of s.split(/\s+/).filter(Boolean)) {
    if (line.length + word.length + 1 > w) { out.push(line); line = word; }
    else line = (line + " " + word).trim();
  }
  out.push(line); return out;
}

/** Numbered legend rail down the right edge. Layout is computed here, and the
content extent is checked against the canvas height captured by svgOpen() —
an entry that would render past the bottom is a hard error, not a silent clip. */
export function legend(entries: [string, string][], opts: { footer?: string | null; x?: number; w?: number } = {}): string {
  const { footer = null, x = 1054, w = 346 } = opts;
  // number column geometry is digit-aware: every row's bubble shares one
  // right edge, placed so the rail's WIDEST pill keeps >=10px off the rail's
  // left edge. One- and two-digit rails resolve to the classic edge at x+43
  // (existing renders byte-stable); the whole column (and the text column,
  // a constant 13px after it) shifts right only when wider pills exist.
  const dMax = String(entries.length).length;
  const edge = Math.max(43, 10 + 2 * (3.6 * dMax + 7.4));
  const tx = x + edge + 13;
  // width guard, mirroring the height guard below: monospace em-box advance
  // (0.6em) against the rail's right edge — overflow is a hard error, not a
  // silent clip past the rail (shipped twice as clipped footers)
  const guardW = (s: string, sx: number, size: number): void => {
    // measure rendered glyphs: an XML entity (&#183; etc.) is one glyph
    const glyphs = s.replace(/&#\d+;|&[a-z]+;/gi, "x").length;
    const right = sx + glyphs * size * 0.6;
    if (right > x + w - 16) {
      throw new Error(`legend text "${s}" reaches x=${pyf(right, 0)} but the rail ends at `
        + `x=${x + w} (needs 16px margin) — shorten it or widen the rail`);
    }
  };
  const g = [`<rect x="${x}" y="0" width="${w}" height="${_CANVAS_H}" fill="${RAIL}"/>`,
    `<text x="${x + 32}" y="48" font-family=${MONOQ} font-size="13" font-weight="700" `
    + `fill="${INK2}" letter-spacing="4">LEGEND</text>`];
  let y = 76;
  for (let i = 0; i < entries.length; i++) {
    const [t, d] = entries[i];
    g.push(_numShape(i + 1, x + edge - 11, y, -1));
    guardW(t, tx, 13.5);
    g.push(`<text x="${tx}" y="${y + 4}" font-family=${MONOQ} font-size="13.5" `
      + `font-weight="700" fill="${INK}">${t}</text>`);
    let yy = y + 20;
    for (const ln of wrap(d)) {
      guardW(ln, tx, 11.5);
      g.push(`<text x="${tx}" y="${yy}" font-family=${MONOQ} font-size="11.5" `
        + `fill="${INK2}">${ln}</text>`); yy += 15;
    }
    y = yy + 20;
  }
  let bottom = y - 20;
  if (footer) {
    bottom = y + 8;
    guardW(footer, x + 32, 10.5);
    g.push(`<text x="${x + 32}" y="${bottom}" font-family=${MONOQ} font-size="10.5" `
      + `fill="${INK2}">${footer}</text>`);
  }
  if (bottom > _CANVAS_H - 16) {
    throw new Error(`legend content reaches y=${bottom} on a ${_CANVAS_H}px canvas `
      + "(needs 16px margin) — shorten/drop entries or open a taller canvas");
  }
  // class hook: embedders (the Obsidian plugin) address the rail to collapse it
  return `<g class="isokit-legend">${g.join("")}</g>`;
}

// ---- label collision check (Phase 2 step 1) ----
// planeLabel() registers its estimated screen quad and flow() its projected
// route as they are called; checkLabels() (run automatically by write())
// errors if any label intersects a registered unit's silhouette or a flow
// route. Both registries reset per artifact in svgOpen(). Registry units only:
// shapes drawn directly (outside unit()) have no known silhouette.
const _LABELS: { txt: string; quad: Pt[] }[] = [];
const _FLOWPTS: Pt[][] = [];
// arrowhead triangles (projected): _FLOWPTS only covers the centerline, but
// the head flares 0.21 cells (~8px) either side — ink a label can sit on
// while clearing every route segment
const _FLOWHEADS: Pt[][] = [];
// projected outlines of ground planes (z=0 only) — checked against arrowhead
// extremities and label quads by checkPlanes()/checkLabels()
const _PLANES: Pt[][] = [];

function _project(poly: Pt[], ax: Pt): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const [px, py] of poly) {
    const v = px * ax[0] + py * ax[1];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

// convex-convex intersection via separating axis theorem. The label quad is
// an em-box ESTIMATE overshooting real glyph ink by ~2px (advance/ascent/
// descender slack), so penetration shallower than EPS counts as clear —
// a sub-pixel graze of a plate corner is not a collision, ink meeting
// visible geometry is. Larger clearances are auto-placement's job (a scoring
// preference), not this error floor.
const _EPS_PX = 3;
function _polysOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [px, py] = poly[i], [qx, qy] = poly[(i + 1) % poly.length];
      const [dx, dy] = [qx - px, qy - py];
      const len = (dx * dx + dy * dy) ** 0.5;
      if (len === 0) continue;
      const ax: Pt = [-dy / len, dx / len];   // unit normal so EPS is in px
      const [alo, ahi] = _project(a, ax), [blo, bhi] = _project(b, ax);
      if (ahi - blo < _EPS_PX || bhi - alo < _EPS_PX) return false;
    }
  }
  return true;
}

function _inConvex(p: Pt, poly: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [px, py] = poly[i], [qx, qy] = poly[(i + 1) % poly.length];
    const cr = (qx - px) * (p[1] - py) - (qy - py) * (p[0] - px);
    if (cr === 0) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function _segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const cr = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function _segPtDist(a: Pt, b: Pt, p: Pt): number {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(p[0] - (a[0] + t * ex), p[1] - (a[1] + t * ey));
}

function _segSegDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (_segsCross(a, b, c, d)) return 0;
  return Math.min(_segPtDist(a, b, c), _segPtDist(a, b, d),
    _segPtDist(c, d, a), _segPtDist(c, d, b));
}

function _segHitsPoly(a: Pt, b: Pt, poly: Pt[]): boolean {
  if (_inConvex(a, poly) || _inConvex(b, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    if (_segsCross(a, b, poly[i], poly[(i + 1) % poly.length])) return true;
  }
  return false;
}

/** Collision hull for a unit — used by BOTH the label collision check and
chip snapping. A shape that declares a tight `hull` (see ShapeProps) gets
it; every other shape fills its footprint closely enough that _silhouette
(footprint box at declared height) is honest. */
function _collisionHull(name: string): Pt[] {
  const { fn, dx: x, dy: y, s, kw } = _unit(name);
  const tight = _shapeProps(fn).hull;
  return tight ? tight(x, y, s, kw) : _silhouette(name);
}

/** Body silhouette for a unit — the solid alone, no plate ring. Chip tips
snap to THIS: the collision hull's side edges slant out to the plate's
ground corners, and a tip stopped 5px off that slant floats in mid-height
air (a tall building put hybrid's chip 1 on the estate boundary ~15px off the
tower wall). Default: footprint corners at ground and declared height. */
function _bodyHull(name: string): Pt[] {
  const { fn, dx: x, dy: y, s, kw } = _unit(name);
  const body = _shapeProps(fn).body;
  if (body) return _hull(body(x, y, s, kw));
  const h = kw.h ?? _shapeProps(fn).defH ?? 1.0;
  return _hull([iso(x, y), iso(x + s, y), iso(x + s, y + s), iso(x, y + s),
    iso(x, y, h), iso(x + s, y, h), iso(x + s, y + s, h), iso(x, y + s, h)]);
}

/** Error if any registered label's screen extent intersects a unit's
collision hull or a flow route. write() runs this automatically. */
export function checkLabels(): void {
  for (const { txt, quad } of _LABELS) {
    for (const name of _UNITS.keys()) {
      if (_polysOverlap(quad, _collisionHull(name))) {
        throw new Error(`label "${txt}" intersects unit '${name}' silhouette — `
          + "move the label clear or shorten it");
      }
    }
    for (const route of _FLOWPTS) {
      for (let i = 0; i < route.length - 1; i++) {
        if (_segHitsPoly(route[i], route[i + 1], quad)) {
          throw new Error(`label "${txt}" crosses a flow route — `
            + "move the label clear or reroute the flow");
        }
      }
    }
    for (const head of _FLOWHEADS) {
      if (_polysOverlap(quad, head)) {
        throw new Error(`label "${txt}" sits on a flow arrowhead — `
          + "move the label clear or reroute the flow");
      }
    }
    if (!_quadClearOfPlaneStrokes(quad)) {
      throw new Error(`label "${txt}" sits on a plane outline — `
        + "move the label clear of the line");
    }
  }
}

// length of the portion of segment a-b lying inside convex poly
function _chordInPoly(a: Pt, b: Pt, poly: Pt[]): number {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const s = area > 0 ? 1 : -1;   // orient so "inside" is a consistent side
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const nx = s * (p[1] - q[1]), ny = s * (q[0] - p[0]);   // inward normal
    const fa = nx * (a[0] - p[0]) + ny * (a[1] - p[1]);
    const d = nx * dx + ny * dy;
    if (Math.abs(d) < 1e-12) { if (fa < 0) return 0; continue; }
    const t = -fa / d;
    if (d > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return 0;
  }
  return (t1 - t0) * Math.hypot(dx, dy);
}

// A plane line CROSSING a label at the iso angle cuts a short chord through
// the em box (~1.2x its thickness at 60 deg) — the benign shipped look. A
// line running ALONG the label lies under the ink for a long stretch — the
// desync defect that shipped a caption on its plane's edge. The boundary is
// chord > 1.8x the quad's short side; the test is exact (unpadded) because
// the canonical caption spot hugs its own plane's line with ~2px of air.
function _quadClearOfPlaneStrokes(quad: Pt[]): boolean {
  let thick = Infinity;
  for (let i = 0; i < quad.length; i++) {
    const [x1, y1] = quad[i], [x2, y2] = quad[(i + 1) % quad.length];
    thick = Math.min(thick, Math.hypot(x2 - x1, y2 - y1));
  }
  for (const pl of _PLANES) {
    for (let i = 0; i < pl.length; i++) {
      if (_chordInPoly(pl[i], pl[(i + 1) % pl.length], quad) > 1.8 * thick) return false;
    }
  }
  return true;
}

// ---- auto label placement (Phase 2 step 2) ----

// is this label quad clear of every obstacle checkLabels() knows about,
// plus labels already placed? Same predicates as checkLabels, so a
// successful placement always survives write().
function _labelSpotClear(quad: Pt[]): boolean {
  for (const [px, py] of quad) {   // a plane can run off-canvas; its label can't
    if (px < 8 || px > _CANVAS_W - 8 || py < 8 || py > _CANVAS_H - 8) return false;
  }
  for (const name of _UNITS.keys()) {
    if (_polysOverlap(quad, _collisionHull(name))) return false;
  }
  for (const route of _FLOWPTS) {
    for (let i = 0; i < route.length - 1; i++) {
      if (_segHitsPoly(route[i], route[i + 1], quad)) return false;
    }
  }
  for (const head of _FLOWHEADS) {
    if (_polysOverlap(quad, head)) return false;
  }
  for (const l of _LABELS) {
    if (_polysOverlap(quad, l.quad)) return false;
  }
  return true;
}

// offset every edge outward by exactly `pad` px, beveled corners (two offset
// points per vertex) — a centroid scale barely widens a long thin quad's
// short sides, and mitered corners overshoot at this quad's 60-degree corners
function _inflate(quad: Pt[], pad: number): Pt[] {
  if (!pad) return quad;
  const n = quad.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = quad[i], [x2, y2] = quad[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const s = area > 0 ? 1 : -1;
  const nor = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [s * dy / L, -s * dx / L];
  };
  return quad.flatMap((p, i) => {
    const n1 = nor(quad[(i + n - 1) % n], p), n2 = nor(p, quad[(i + 1) % n]);
    return [[p[0] + pad * n1[0], p[1] + pad * n1[1]],
            [p[0] + pad * n2[0], p[1] + pad * n2[1]]] as Pt[];
  });
}

/** Auto-placed plane label: finds a clear anchor for `txt` along the
plane's edges — top edge first (the exemplar caption convention), then
left, bottom, right — walking each edge in 0.25-grid steps from its
canonical corner, 0.3 inside the outline. If no inside spot is clear, a
fallback ring walks the SAME edges 0.45 OUTSIDE the plane (the exemplar's
crowded-plane move: the gauntlet's DATA TIER floats in the air beside its
plane). Candidates are tested against every unit's collision hull, every
flow route, and every label already placed, inflated by 4px — never the
bare predicate: checkLabels() tolerates ~3px of em-box slack and outline
strokes aren't hulled, so an unpadded test would ship ink kissing a plate
line. No fitting edge or no clear spot is a hard error. Call it AFTER
declaring units and flows — it can only avoid what already exists.
planeLabel() remains the manual override for authored placement. */
export function autoLabel(txt: string, rect: [number, number, number, number],
  opts: LabelOpts = {}): string {
  const [x0, y0, x1, y1] = rect;
  const size = opts.size ?? 15, ls = opts.ls ?? 2.5;
  const len = (txt.length * size * 0.6 + (txt.length - 1) * ls) / U;  // grid units
  const M = 0.3, STEP = 0.25;
  const spanX = (x1 - x0) - 2 * M - len;
  const spanY = (y1 - y0) - 2 * M - len;
  const cands: [number, number, "x" | "y"][] = [];
  if (spanX >= 0) for (let t = 0; t <= spanX + 1e-9; t += STEP) cands.push([x0 + M + t, y0 + M, "x"]);
  if (spanY >= 0) for (let t = 0; t <= spanY + 1e-9; t += STEP) cands.push([x0 + M, y1 - M - t, "y"]);
  if (spanX >= 0) for (let t = 0; t <= spanX + 1e-9; t += STEP) cands.push([x0 + M + t, y1 - M, "x"]);
  if (spanY >= 0) for (let t = 0; t <= spanY + 1e-9; t += STEP) cands.push([x1 - M, y1 - M - t, "y"]);
  const OUT = 0.45;   // outside fallback ring: left, bottom, right, top
  if (spanY >= 0) for (let t = 0; t <= spanY + 1e-9; t += STEP) cands.push([x0 - OUT, y1 - M - t, "y"]);
  if (spanX >= 0) for (let t = 0; t <= spanX + 1e-9; t += STEP) cands.push([x0 + M + t, y1 + OUT, "x"]);
  if (spanY >= 0) for (let t = 0; t <= spanY + 1e-9; t += STEP) cands.push([x1 + OUT, y1 - M - t, "y"]);
  if (spanX >= 0) for (let t = 0; t <= spanX + 1e-9; t += STEP) cands.push([x0 + M + t, y0 - OUT, "x"]);
  if (!cands.length) {
    throw new Error(`autoLabel "${txt}": label is ${pyf(len, 2)} grid units long and does `
      + `not fit any edge of plane (${x0}, ${y0})-(${x1}, ${y1}) with 0.3 margin — `
      + "shorten it, shrink the type, or enlarge the plane");
  }
  // PAD 4 nets ~1px of true em-box clearance past checkLabels' 3px slack,
  // and the em box itself overstates the ink — never test unpadded
  const PAD = 4;
  for (const [ax, ay, axis] of cands) {
    const quad = _labelQuad(txt, ax, ay, axis, size, ls);
    // plane strokes are tested UNPADDED: inside candidates legally hug their
    // own plane's line (~2px of air past the em box), so the 4px pad that is
    // right for hulls/flows would reject every inside spot — the raw test
    // matches checkLabels exactly, which is all survivability needs
    if (_labelSpotClear(_inflate(quad, PAD)) && _quadClearOfPlaneStrokes(quad)) {
      return planeLabel(txt, ax, ay, axis, opts);
    }
  }
  throw new Error(`autoLabel "${txt}": no clear position on plane (${x0}, ${y0})-(${x1}, ${y1}) `
    + `(${cands.length} candidates tried) — enlarge the plane, shorten the label, `
    + "or place it manually with planeLabel()");
}

// a plane line within this of a head's tip or base reads as touching; a
// compliant 0.6 margin leaves ~7px, the shipped 0.4-margin defect left 0
const _TOUCH_PX = 4;

/** Error if a flow arrowhead's BASE edge touches a ground plane's outline.
write() runs this automatically. The line passing MID-head is legal — an
intentional boundary crossing (hybrid's fw->app1 head straddles the
app-subnet line) — and so is the TIP landing on a line: tips land on the
target's cell rect, and a plane edge flush with that rect is the exemplar's
"arrow enters the tier" look (azure_lob's users->gw). The defect is the
base sitting on the line, i.e. a plane margin equal to the 0.42-cell head
length. Enforces STYLE.md's >= 0.6 flow-crossed-edge rule mechanically. */
export function checkPlanes(): void {
  for (const tri of _FLOWHEADS) {
    const b1 = tri[1], b2 = tri[2];
    for (const pl of _PLANES) {
      for (let i = 0; i < pl.length; i++) {
        const a = pl[i], b = pl[(i + 1) % pl.length];
        if (_segSegDist(a, b, b1, b2) < _TOUCH_PX) {
          throw new Error("flow arrowhead touches a plane outline — widen the plane "
            + "margin (>= 0.6 on any edge a flow crosses) or reroute the flow");
        }
      }
    }
  }
}

/** The full write()-time guard battery, callable without touching the
filesystem — the pure render() core runs this before returning its SVG. */
export function runChecks(): void {
  checkLabels();
  checkChips();
  checkPlanes();
}
