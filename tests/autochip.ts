// Phase 2 step 3: chips as collision objects + auto chip approach.
// Part A: every chip() registers its balloon footprint (bubble + tail);
// checkChips() — run at write() time — hard-errors when a balloon overlaps
// a unit hull, flow route, label quad, another chip, or the canvas edge.
// Part B: annotate() without an approach point picks one automatically.
import { setTheme, configure, svgOpen, resetUnits, unit, box, building, wall, users, cyl,
  flow, planeLabel, chip, checkChips, annotate, annotations, iso,
  A2, type Pt } from "../src/isokit.ts";

setTheme("blueprint");
configure(46, 440, 48);

let fail = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (!cond) { console.error(`${name}: FAIL ${detail}`); fail++; }
}
function expectThrow(name: string, fn: () => unknown, needle: string): void {
  try { fn(); console.error(`${name}: did not throw`); fail++; }
  catch (e) { if (!String(e).includes(needle)) { console.error(`${name}: wrong message: ${e}`); fail++; } }
}
function ok(name: string, fn: () => unknown): void {
  try { fn(); } catch (e) { console.error(`${name}: threw: ${e}`); fail++; }
}

// A1) a bare chip sitting on a label is a hard error naming both
{
  svgOpen(1400, 700); resetUnits();
  planeLabel("HELLO WORLD", 5, 5, "x");
  chip(1, 5.5, 5);
  expectThrow("chip on a label errors", checkChips, "chip 1");
}

// A2) the designed hug — pointer tip 5px off its unit's hull — stays legal
{
  svgOpen(1400, 700); resetUnits();
  unit("b", box, 5, 5, { rim: A2 });
  chip(1, 8.5, 6, "b");
  ok("hugging pointer chip passes", checkChips);
}

// A3) a flow running through a chip bubble is a hard error
{
  svgOpen(1400, 700); resetUnits();
  flow([[4, 5], [6, 5]], A2);
  chip(2, 5, 5);
  expectThrow("flow through a chip errors", checkChips, "chip 2");
}

// A4) two chips on the same spot collide
{
  svgOpen(1400, 700); resetUnits();
  chip(1, 5, 5);
  chip(2, 5.1, 5.1);
  expectThrow("overlapping chips error", checkChips, "chip 2");
}

// A4b) a POINT-target chip may sit in dense exhibit space (the glossary
// points chips at label text, unit faces, and flow midpoints): only other
// chips and the canvas apply
{
  svgOpen(1400, 700); resetUnits();
  flow([[4, 5], [8, 5]], A2);
  chip(1, 5, 6, [6, 5]);   // aimed at the route's midpoint, bubble near it
  ok("point-target chip beside a flow passes", checkChips);
}

// A5) a chip hanging off the canvas is a hard error
{
  svgOpen(1400, 700); resetUnits();
  chip(3, 0, 12);   // screen X ~ -38
  expectThrow("off-canvas chip errors", checkChips, "chip 3");
}

// bubble center of the first chip in an annotations() svg
function bubbleOf(svg: string): [number, number] {
  const m = svg.match(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="11"/);
  if (!m) throw new Error("no chip bubble in svg");
  return [+m[1], +m[2]];
}

// pointer tail tip: first vertex of the first tail polygon in the svg
function tipOf(svg: string): [number, number] {
  const m = svg.match(/<polygon points="([\d.-]+),([\d.-]+)/);
  if (!m) throw new Error("no chip tail in svg");
  return [+m[1], +m[2]];
}

// A6) the pointer tip snaps to the unit's BODY silhouette, not the convex
// hull whose side edges slant out to the plate's ground corners — on a tall
// building that slant is ~15px of mid-height air, and hybrid's chip 1
// shipped pointing at the estate boundary floating in it
{
  svgOpen(1400, 700); resetUnits();
  unit("hq", building, 8, 8);
  annotate("hq", "Building", "a tall unit.");
  const svg = annotations({ footer: null });
  const [tx] = tipOf(svg);
  const bodyWest = iso(8, 9.1)[0];   // tower west wall (s = 1.1)
  check("tip hugs the tower wall, not the hull slant",
    Math.abs(tx - (bodyWest - 5)) < 1.5, `tip x=${tx} wall=${bodyWest}`);
  ok("body-snapped chip survives checkChips", checkChips);
}

// distance from a point to a closed polygon's boundary
function distToPoly(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / (vx * vx + vy * vy)));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * vx), p[1] - (ay + t * vy)));
  }
  return best;
}

// A7) inset shapes: the wall's brick slab fills only 1.30 x 0.40 of its 1.4
// footprint — the tip must stop `gap` px off the SLAB's silhouette, not the
// footprint box (hybrid's chip 3 floated ~35px of air short of the bricks)
{
  svgOpen(1400, 700); resetUnits();
  unit("fw", wall, 5, 3);
  const svg = chip(3, 3.8, 4.4, "fw");   // hybrid's authored approach
  const [tx, ty] = tipOf(svg);
  // slab silhouette hexagon: shape draws at dx=5.3, dy=3.3 (1.4 centered in
  // 2x2 cells); slab = (dx+0.05, dy+0.50) + 1.30 x 0.40, h = 1.0
  const bx = 5.35, by = 3.8, sx = 1.30, sy = 0.40, h = 1.0;
  const hex: Pt[] = [iso(bx, by, h), iso(bx + sx, by, h), iso(bx + sx, by, 0),
    iso(bx + sx, by + sy, 0), iso(bx, by + sy, 0), iso(bx, by + sy, h)];
  const d = distToPoly([tx, ty], hex);
  check("tip hugs the brick slab, not the footprint box",
    d > 3.5 && d < 6.5, `dist=${d.toFixed(1)} tip=(${tx},${ty})`);
}

// A9) round shapes on a diagonal approach: cyl's body was the drum's screen
// bounding BOX, whose corners overshoot the elliptical silhouette by ~9px —
// hybrid's chip 5, authored from the lower-left, stopped in that corner air
// near the plate instead of at the drum's arc
{
  svgOpen(1400, 700); resetUnits();
  unit("d", cyl, 8, 8);
  const svg = chip(5, 10.4, 12.8, "d");   // hybrid chip 5's approach offset
  const [tx, ty] = tipOf(svg);
  // true drum silhouette, sampled: side walls + top/bottom ellipse arcs
  // (shape draws at dx=8.3 — 1.4 centered in 2x2 cells — so center is 9.0)
  const cx = 9.0, cy = 9.0, h = 1.25, r = 0.5;
  const [Xc, Yt] = iso(cx, cy, h); const Yb = iso(cx, cy, 0)[1];
  const rx = 1.2247 * r * 46, ry = 0.577 * rx;
  const sil: Pt[] = [];
  for (let i = 0; i <= 16; i++) {   // top arc, right to left
    const t = (i / 16) * Math.PI;
    sil.push([Xc + rx * Math.cos(t), Yt - ry * Math.sin(t)]);
  }
  for (let i = 0; i <= 16; i++) {   // bottom arc, left to right
    const t = Math.PI - (i / 16) * Math.PI;
    sil.push([Xc - rx * Math.cos(t), Yb + ry * Math.sin(t)]);
  }
  const d = distToPoly([tx, ty], sil);
  check("diagonal tip hugs the drum arc, not the box corner",
    d > 3.5 && d < 8, `dist=${d.toFixed(1)} tip=(${tx},${ty})`);
}

// A8) ensemble shapes: users draws a person + laptop + phone all inset in
// the 1.4 footprint — the tip must stop `gap` px off the ENSEMBLE's convex
// hull, not the footprint box (group pack demo's chip 1 floated in the air
// west of the person)
{
  svgOpen(1400, 700); resetUnits();
  unit("u", users, 4, 4);
  annotate("u", "End users", "an ensemble unit.");
  const svg = annotations({ footer: null });
  const [tx, ty] = tipOf(svg);
  // ensemble body points: shape draws at dx=4.3, dy=4.3 (1.4 centered in 2x2)
  const dx = 4.3, dy = 4.3;
  const pts: Pt[] = [];
  const [Xp, Yp] = iso(dx + 0.40, dy + 0.40);   // person billboard: head + torso
  pts.push([Xp - 7.5, Yp - 63.5], [Xp + 7.5, Yp - 63.5],
    [Xp - 11, Yp - 51], [Xp + 11, Yp - 51], [Xp - 11, Yp], [Xp + 11, Yp]);
  const px_ = dx + 1.02, py_ = dy + 0.16;       // phone slab 0.34 x 0.10 x 0.72
  for (const [gx, gy] of [[px_, py_], [px_ + 0.34, py_], [px_ + 0.34, py_ + 0.10], [px_, py_ + 0.10]] as Pt[])
    for (const z of [0, 0.72]) pts.push(iso(gx, gy, z));
  const lx = dx + 0.16, ly = dy + 0.70;         // laptop base 0.95 x 0.60 + screen
  for (const [gx, gy] of [[lx, ly], [lx + 0.95, ly], [lx + 0.95, ly + 0.60], [lx, ly + 0.60]] as Pt[])
    for (const z of [0, 0.07]) pts.push(iso(gx, gy, z));
  pts.push(iso(lx + 0.03, ly - 0.10, 0.71), iso(lx + 0.92, ly - 0.10, 0.71));
  // convex hull (monotone chain) so distToPoly sees the ensemble outline
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (arr: Pt[]): Pt[] => {
    const h: Pt[] = [];
    for (const p of arr) {
      while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    return h;
  };
  const hull = [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
  const d = distToPoly([tx, ty], hull);
  check("tip hugs the person/laptop ensemble, not the footprint box",
    d > 3.5 && d < 6.5, `dist=${d.toFixed(1)} tip=(${tx},${ty})`);
  ok("ensemble-snapped chip survives checkChips", checkChips);
}

// B1) annotate without an approach point: picks a clear side automatically
// (screen-horizontal preferred — the ray hits the unit's body, not its
// plate ring) and the result survives checkChips
{
  svgOpen(1400, 700); resetUnits();
  unit("b", box, 8, 8, { rim: A2 });
  annotate("b", "Box", "a lone unit.");
  const svg = annotations({ footer: null });
  const [cx] = bubbleOf(svg);
  check("auto chip takes the preferred west side", cx < 367, `cx=${cx}`);
  ok("auto approach survives checkChips", checkChips);
}

// B2) west side blocked by an adjacent unit: auto picks the east side
{
  svgOpen(1400, 700); resetUnits();
  unit("a", box, 6, 8, { rim: A2 });
  unit("b", box, 8, 8, { rim: A2 });
  annotate("b", "Box", "west neighbour blocks the preferred side.");
  const svg = annotations({ footer: null });
  const [cx] = bubbleOf(svg);
  check("blocked west side falls to east", cx > 513, `cx=${cx}`);
  ok("fallback side survives checkChips", checkChips);
}

// B3) nowhere clear (unit renders off a tiny canvas): hard error, not a
// silently misplaced chip
{
  svgOpen(220, 220); resetUnits();
  unit("b", box, 8, 8, { rim: A2 });
  annotate("b", "Box", "no room anywhere.");
  expectThrow("no clear approach errors", () => annotations({ footer: null }),
    "no clear chip approach");
}

if (fail) process.exit(1);
console.log("autochip: all cases ok");
