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
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

export type Pt = [number, number];
type Attrs = Record<string, string | number>;
type Kw = Record<string, any>;

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

// ---- fonts (base64-embedded JetBrains Mono; auto-fetch if /tmp copies gone) ----
const _JBM = "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5/files/jetbrains-mono-latin-{w}-normal.woff2";
function _font(weight: number): string {
  const p = `/tmp/jbm${weight}.woff2`;
  if (!fs.existsSync(p)) execFileSync("curl", ["-sL", "-o", p, _JBM.replace("{w}", String(weight))]);
  return fs.readFileSync(p).toString("base64");
}

let _CANVAS_W = 1400, _CANVAS_H = 700;

export function svgOpen(w = 1400, h = 700): string[] {
  _CANVAS_W = w; _CANVAS_H = h;          // legend() checks its content against this
  _LABELS.length = 0; _FLOWPTS.length = 0;   // new artifact: reset collision registries
  return [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<defs><style>
@font-face {font-family:'JetBrains Mono';font-weight:400;src:url(data:font/woff2;base64,${_font(400)}) format('woff2');}
@font-face {font-family:'JetBrains Mono';font-weight:700;src:url(data:font/woff2;base64,${_font(700)}) format('woff2');}
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

export function planeLabel(txt: string, x: number, y: number, axis: "x" | "y", opts: LabelOpts = {}): string {
  const { size = 15, ls = 2.5, weight = 400, z = 0 } = opts;
  const fill = opts.fill || INK2;      // resolved at call time so setTheme() applies
  const [X, Y] = iso(x, y, z);
  // shear basis: local u along the baseline, local v toward descenders
  const [a, b, c, d] = axis === "x" ? [0.866, 0.5, -0.866, 0.5] : [0.866, -0.5, 0.866, 0.5];
  const m = `matrix(${a},${b},${c},${d},${pyf(X, 1)},${pyf(Y, 1)})`;
  // estimated screen quad for the collision check: monospace advance 0.6em
  // plus letter-spacing per gap; ascent 0.75em, descent 0.2em
  const W = txt.length * size * 0.6 + (txt.length - 1) * ls;
  const asc = 0.75 * size, desc = 0.2 * size;
  const quad: Pt[] = ([[0, -asc], [W, -asc], [W, desc], [0, desc]] as Pt[])
    .map(([u, v]) => [a * u + c * v + X, b * u + d * v + Y]);
  _LABELS.push({ txt, quad });
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
    return [b, poly(tri.map(p => iso(p[0], p[1])), { fill: color })];
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
  const { s = 1.4, cells = null, ...kw } = opts;
  if (!(Number.isInteger(x) && Number.isInteger(y))) {
    throw new Error(`unit '${name}': position must snap to grid cells, got (${x}, ${y})`);
  }
  const [w, d] = (cells ?? [2, 2]) as [number, number];
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

export function connect(a: string, b: string, opts: ConnectOpts = {}): string {
  const { via = null, style = "request", color = null, ...fkw } = opts;
  let { exit, enter } = opts;
  delete (fkw as Kw).exit; delete (fkw as Kw).enter;
  const [ax, ay] = _center(a), [bx, by] = _center(b);
  const dx = bx - ax, dy = by - ay;
  if (exit == null) exit = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "+x" : "-x") : (dy > 0 ? "+y" : "-y");
  if (enter == null) enter = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "-x" : "+x") : (dy > 0 ? "-y" : "+y");
  const p0 = Array.isArray(exit) ? edgePt(a, exit[0], exit[1]) : edgePt(a, exit);
  const p1 = Array.isArray(enter) ? edgePt(b, enter[0], enter[1]) : edgePt(b, enter);
  let pts_: Pt[] = [p0, ...(via ?? []), p1];
  if (via == null && Math.abs(p0[0] - p1[0]) > 1e-9 && Math.abs(p0[1] - p1[1]) > 1e-9) {
    const ex = Array.isArray(exit) ? exit[0] : exit;        // L-route: leave along the exit axis
    pts_ = [p0, (ex === "-x" || ex === "+x") ? [p1[0], p0[1]] : [p0[0], p1[1]], p1];
  }
  const kw: FlowOpts = { ...STYLES[style], ...fkw };
  return flow(pts_, color || (style === "data" ? FLOW2 : FLOW), kw);
}

// ---- narrative ----
// typical unit heights for silhouette estimation (kw "h" overrides)
const _DEF_H: Record<string, number> = {
  box: 0.95, cyl: 1.25, rack: 1.15, building: 2.3,
  padlock: 1.6, users: 1.3, slab: 0.22, panel: 0.12,
  wall: 1.0, queue: 0.5, store: 0.84,
};

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
  const h = kw.h ?? _DEF_H[fn.name] ?? 1.0;
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
along that ray so the tip sits exactly `gap` px off the unit's screen
silhouette (plate + solid), however close or far it was authored. */
export function chip(n: number, x: number, y: number, to: string | Pt | null = null, gap = 5.0): string {
  let [X, Y] = iso(x, y);
  let ext: -1 | 0 | 1 = 0;   // bare chips center the bubble on the point
  const g: string[] = [];
  if (to != null) {
    let TX: number, TY: number;
    if (typeof to === "string") {
      const hull = _collisionHull(to);
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
    const tip: Pt = [TX - ux * gap, TY - uy * gap];
    X = tip[0] - ux * 19; Y = tip[1] - uy * 19;
    ext = ux > 0 ? -1 : 1;   // multi-digit body grows away from the target
    const b1: Pt = [X + 9.5 * Math.cos(a + 0.55), Y + 9.5 * Math.sin(a + 0.55)];
    const b2: Pt = [X + 9.5 * Math.cos(a - 0.55), Y + 9.5 * Math.sin(a - 0.55)];
    g.push(poly([tip, b1, b2], { fill: A1 }));
  }
  g.push(_numShape(n, X, Y, ext));
  return g.join("");
}

// One declaration per annotated unit drives BOTH its numbered chip and its
// legend entry — numbers are assigned in declaration order, so chips and the
// legend can never fall out of sync (they used to be three hand-synced pieces).
const _ANNOTS: [string, string, string, Pt][] = [];

/** Register unit `name` for annotation: chip approaching from grid point
`approach`, legend entry (title, desc). Declaration order = number order. */
export function annotate(name: string, title: string, desc: string, approach: Pt): void {
  if (!_UNITS.has(name)) {
    throw new Error(`annotate '${name}': no such unit — declare unit() first`);
  }
  if (_ANNOTS.some(([n]) => n === name)) {
    throw new Error(`annotate '${name}': unit already annotated`);
  }
  _ANNOTS.push([name, title, desc, approach]);
}

/** Emit every annotated unit's chip plus the matching legend rail. */
export function annotations(opts: { footer?: string | null; x?: number; w?: number } = {}): string {
  const { footer = null, x = 1054, w = 346 } = opts;
  const g = _ANNOTS.map(([name, , , [ax, ay]], i) => chip(i + 1, ax, ay, name));
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
  const g = [`<rect x="${x}" y="0" width="${w}" height="${_CANVAS_H}" fill="${RAIL}"/>`,
    `<text x="${x + 32}" y="48" font-family=${MONOQ} font-size="13" font-weight="700" `
    + `fill="${INK2}" letter-spacing="4">LEGEND</text>`];
  let y = 76;
  for (let i = 0; i < entries.length; i++) {
    const [t, d] = entries[i];
    g.push(_numShape(i + 1, x + edge - 11, y, -1));
    g.push(`<text x="${tx}" y="${y + 4}" font-family=${MONOQ} font-size="13.5" `
      + `font-weight="700" fill="${INK}">${t}</text>`);
    let yy = y + 20;
    for (const ln of wrap(d)) {
      g.push(`<text x="${tx}" y="${yy}" font-family=${MONOQ} font-size="11.5" `
        + `fill="${INK2}">${ln}</text>`); yy += 15;
    }
    y = yy + 20;
  }
  let bottom = y - 20;
  if (footer) {
    bottom = y + 8;
    g.push(`<text x="${x + 32}" y="${bottom}" font-family=${MONOQ} font-size="10.5" `
      + `fill="${INK2}">${footer}</text>`);
  }
  if (bottom > _CANVAS_H - 16) {
    throw new Error(`legend content reaches y=${bottom} on a ${_CANVAS_H}px canvas `
      + "(needs 16px margin) — shorten/drop entries or open a taller canvas");
  }
  return g.join("");
}

// ---- label collision check (Phase 2 step 1) ----
// planeLabel() registers its estimated screen quad and flow() its projected
// route as they are called; checkLabels() (run automatically by write())
// errors if any label intersects a registered unit's silhouette or a flow
// route. Both registries reset per artifact in svgOpen(). Registry units only:
// shapes drawn directly (outside unit()) have no known silhouette.
const _LABELS: { txt: string; quad: Pt[] }[] = [];
const _FLOWPTS: Pt[][] = [];

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

function _segHitsPoly(a: Pt, b: Pt, poly: Pt[]): boolean {
  if (_inConvex(a, poly) || _inConvex(b, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    if (_segsCross(a, b, poly[i], poly[(i + 1) % poly.length])) return true;
  }
  return false;
}

/** Collision hull for a unit — used by BOTH the label collision check and
chip snapping. The naive _silhouette (full footprint at height) false-
positives on cylinders: the drum is only r-wide at the footprint's center,
leaving phantom hull at the corners — labels there are fine and chips
snapped to it float far off the drum. cyl gets plate corners + the drum's
actual screen box; other shapes fill their footprint closely enough that
_silhouette is honest. */
function _collisionHull(name: string): Pt[] {
  const { fn, dx: x, dy: y, s, kw } = _unit(name);
  if (fn.name === "cyl") {
    const r = kw.r ?? 0.5, h = kw.h ?? 1.25;
    const cx = x + s / 2, cy = y + s / 2;
    const [Xc, Yt] = iso(cx, cy, h); const Yb = iso(cx, cy, 0)[1];
    const rx = 1.2247 * r * U, ry = 0.577 * rx;
    const m = PLATE_M;
    return _hull([iso(x - m, y - m), iso(x + s + m, y - m),
      iso(x + s + m, y + s + m), iso(x - m, y + s + m),
      [Xc - rx, Yt - ry], [Xc + rx, Yt - ry], [Xc - rx, Yb + ry], [Xc + rx, Yb + ry]]);
  }
  return _silhouette(name);
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
  }
}

/** Resolve an output path for `name`: $ISOKIT_OUT if set, else the first
`isokit.local` file found walking up from cwd (its first line = output
dir), else ./out. The directory is created if missing. */
export function out(name: string): string {
  let d = process.env.ISOKIT_OUT;
  if (!d) {
    let p = process.cwd();
    while (true) {
      const f = path.join(p, "isokit.local");
      if (fs.existsSync(f)) { d = fs.readFileSync(f, "utf8").trim(); break; }
      const parent = path.dirname(p);
      if (parent === p) break;
      p = parent;
    }
  }
  d = d || path.join(process.cwd(), "out");
  if (d === "~" || d.startsWith("~/")) d = path.join(os.homedir(), d.slice(1));
  fs.mkdirSync(d, { recursive: true });
  return path.join(d, name);
}

export function write(pathOut: string, parts: string[]): void {
  checkLabels();
  fs.writeFileSync(pathOut, parts.concat(["</svg>"]).join("\n"));
  const ok = spawnSync("xmllint", ["--noout", pathOut], { stdio: "inherit" }).status === 0;
  console.log(ok ? "valid" : "INVALID", Math.floor(fs.statSync(pathOut).size / 1024), "KB", pathOut);
}
