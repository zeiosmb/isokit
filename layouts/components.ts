/* Isometric component sheet — the isokit shape vocabulary on plates,
mirroring the SlideModel components sheet. Blueprint theme. */
import { configure, iso, plane, planeLabel, grid, svgOpen,
  flow, plate, box, slab, panel, cyl, rack, building, monitor,
  laptop, phone, personDevice, browser, padlock,
  wall, queue, store, users, GLYPHS, INK, INK2, A1, A2, A3, MONOQ } from "../src/isokit.ts";
import { out, write } from "../src/io.ts";

configure(46, 720, 150);
const S = svgOpen(1400, 1050);
S.push(grid({ x0: -8, y0: -8, x1: 24, y1: 26, clip_w: 1400, clip_h: 1050 }));

function pos(c: number, r: number): [number, number] {
  const u = c * 6.0 - 9.0, v = r * 6.2 + 2.0;
  return [(u + v) / 2 - 0.7, (v - u) / 2 - 0.7];
}

function caption(txt: string, x: number, y: number, s = 1.4): string {
  const n = txt.length * 8.2;            // rough centering along the iso axis
  return planeLabel(txt, x + 0.7 - n / 2 / 39.84, y + s + 0.55, "x", { size: 11.5, ls: 2 });
}

function flowsDemo(x: number, y: number): string {
  return flow([[x - 0.2, y + 0.15], [x + 0.75, y + 0.15], [x + 0.75, y + 0.8], [x + 1.7, y + 0.8]],
    A3, { width: 1.6, heads: "both", hl: 0.3, hw: 0.15 })
    + flow([[x - 0.2, y + 1.15], [x + 1.7, y + 1.15]],
      A2, { width: 1.6, dashed: true, dot: true, hl: 0.3, hw: 0.15 });
}

const SHEET: [number, string][] = [];
function slot(c: number, r: number, body: (x: number, y: number) => string, label: string): void {
  const [x, y] = pos(c, r);
  SHEET.push([x + y, body(x, y) + caption(label, x, y)]);
}

slot(0, 0, (x, y) => box(x, y, { rim: A3, glyph: GLYPHS["app"] }),   "SERVICE CUBE");
slot(1, 0, (x, y) => cyl(x, y, { rim: A2 }),                         "DATABASE");
slot(2, 0, (x, y) => building(x, y),                                 "ENTERPRISE");
slot(3, 0, (x, y) => rack(x, y, { rim: A2 }),                        "SERVER RACK");

slot(0, 1, (x, y) => slab(x, y, { rim: A3, glyph: GLYPHS["gw"] }),   "SERVICE TILE");
slot(1, 1, (x, y) => panel(x, y, { rim: A3 }),                       "DATA GRID");
slot(2, 1, (x, y) => box(x, y, { rim: A1, glyph: GLYPHS["entra"] }), "IDENTITY");
slot(3, 1, (x, y) => box(x, y, { rim: A1, glyph: GLYPHS["kv"] }),    "KEY VAULT");

slot(0, 2, (x, y) => plate(x, y) + monitor(x + 0.06, y + 0.28),                        "MONITOR");
slot(1, 2, (x, y) => plate(x, y) + laptop(x + 0.22, y + 0.42),                         "LAPTOP");
slot(2, 2, (x, y) => plate(x, y) + phone(x + 0.48, y + 0.5, { w: 0.44, d: 0.12, h: 0.95 }), "PHONE");
slot(3, 2, (x, y) => plate(x, y) + browser(x + 0.08, y + 0.5),                         "BROWSER");

slot(0, 3, (x, y) => padlock(x, y, { rim: A1 }),                                       "PADLOCK");
slot(1, 3, (x, y) => plate(x, y) + personDevice(...iso(x + 0.6, y + 0.7)),             "END USER");
slot(2, 3, (x, y) => users(x, y),                                                      "END USERS");
slot(3, 3, (x, y) => flowsDemo(x, y),                                                  "FLOWS");

slot(0, 4, (x, y) => wall(x, y, { rim: A1 }),                                          "FIREWALL");
slot(1, 4, (x, y) => queue(x, y, { rim: A3 }),                                         "QUEUE");
slot(2, 4, (x, y) => box(x, y, { rim: A1, glyph: GLYPHS["shield"] }),                  "SECURITY");
slot(3, 4, (x, y) => plate(x, y)
  + plane(x - 0.15, y - 0.15, x + 1.55, y + 1.55, 0.85),                               "RAISED PLANE");

slot(0, 5, (x, y) => store(x, y, { rim: A2 }),                                         "BLOB STORE");

for (const [, body] of SHEET.slice().sort((a, b) => a[0] - b[0])) {   // painter's order
  S.push(body);
}

S.push(`<text x="40" y="52" font-family=${MONOQ} font-size="24" font-weight="700" fill="${INK}">ISOMETRIC COMPONENT SHEET</text>`);
S.push(`<text x="40" y="76" font-family=${MONOQ} font-size="12.5" fill="${INK2}">isokit shape vocabulary &#183; Blueprint theme &#183; generator: layouts/components.ts</text>`);

write(out("Isometric Components.svg"), S);
