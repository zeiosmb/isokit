// Phase 2 step 1: label collision check.
// A planeLabel whose screen-space extent intersects a unit's silhouette or a
// flow route must be a hard generation error at checkLabels() time (write()
// runs it automatically); clear layouts must pass untouched.
import { setTheme, configure, svgOpen, resetUnits, unit, box, cyl, store,
  planeLabel, flow, checkLabels, chip, iso, U, PLATE_M, A2 } from "../src/isokit.ts";

setTheme("blueprint");
configure(46, 440, 48);

let fail = 0;
function expectThrow(name: string, fn: () => unknown, needle: string): void {
  try {
    fn();
    console.error(`${name}: did not throw`);
    fail++;
  } catch (e) {
    if (!String(e).includes(needle)) {
      console.error(`${name}: wrong message: ${e}`);
      fail++;
    }
  }
}
function expectOk(name: string, fn: () => unknown): void {
  try { fn(); } catch (e) {
    console.error(`${name}: threw unexpectedly: ${e}`);
    fail++;
  }
}

// label running straight through a unit's footprint → error naming both
svgOpen(1400, 700);
resetUnits();
unit("sql", box, 5, 5, { rim: A2 });
planeLabel("DATA TIER", 5.5, 6.5, "x");
expectThrow("label through unit silhouette", () => checkLabels(), `label "DATA TIER" intersects unit 'sql'`);

// label lying along an active flow route → error naming the label
svgOpen(1400, 700);
resetUnits();
flow([[2, 2], [8, 2]], A2);
planeLabel("REQUEST PATH", 4, 2, "x");
expectThrow("label across flow route", () => checkLabels(), `label "REQUEST PATH" crosses a flow route`);

// clear layout: label, unit, and flow all separated → no error
svgOpen(1400, 700);
resetUnits();
unit("app", box, 10, 10, { rim: A2 });
flow([[2, 6], [8, 6]], A2);
planeLabel("APP TIER", 2, 1, "x");
expectOk("clear layout passes", () => checkLabels());

// cylinder collision hull is drum-tight: a label in the empty air beside the
// drum (inside the naive full-footprint box hull, outside the actual drum)
// is NOT a collision — this is the azure_lob "DATA TIER" / sql2 geometry
svgOpen(1400, 700);
resetUnits();
unit("db", cyl, 5, 5, { rim: A2 });
planeLabel("DATA TIER", 4.15, 7.35, "y");
expectOk("label beside cylinder drum passes", () => checkLabels());

// but a label through the cylinder's footprint is still a collision
svgOpen(1400, 700);
resetUnits();
unit("db", cyl, 5, 5, { rim: A2 });
planeLabel("THROUGH", 5.5, 6.5, "x");
expectThrow("label through cylinder", () => checkLabels(), `label "THROUGH" intersects unit 'db'`);

// must-still-fail boundary locks: these penetrations sit just past the EPS
// tolerance. If a future change loosens the check (bigger EPS, smaller
// em-box), these catch it — the layouts/collision_gauntlet.ts golden locks
// the pass side of the same boundaries.
// 5.66px em-box graze of a store's near corner — the shipped hybrid layout
// collision the check caught on its first run (label tail ~2px off the ink)
svgOpen(1400, 700);
resetUnits();
unit("blob", store, 9, 5, { rim: A2 });
planeLabel("DATA SUBNET", 8.55, 7.75, "y", { size: 12 });
expectThrow("shallow store-corner graze past tolerance", () => checkLabels(), `label "DATA SUBNET" intersects unit 'blob'`);

// one 0.05-grid step past the drum-hull boundary beside a cylinder
// (gauntlet's "DATA TIER" passes at x 4.15; the boundary cell is 4.20)
svgOpen(1400, 700);
resetUnits();
unit("db", cyl, 5, 6, { rim: A2 });
planeLabel("DATA TIER", 4.25, 8.35, "y");
expectThrow("one step past the drum-hull boundary", () => checkLabels(), `label "DATA TIER" intersects unit 'db'`);

// chip snapping must use the same drum-tight hull as the collision check: a
// chip approaching a cylinder from the phantom-air side should stop 5px off
// the DRUM, not ~30px out at the naive full-footprint silhouette
{
  svgOpen(1400, 700);
  resetUnits();
  unit("db", cyl, 5, 5, { rim: A2 });
  const svg = chip(1, 3.9, 5.1, "db");
  const m = svg.match(/points="([-\d.]+),([-\d.]+)/);
  if (!m) { console.error("chip snap: no tail polygon in chip svg"); fail++; }
  else {
    const tip: [number, number] = [+m[1], +m[2]];
    // drum-tight hull, replicated from the documented cyl geometry
    const r = 0.5, h = 1.25, s = 2, mm = PLATE_M;
    const [Xc, Yt] = iso(6, 6, h); const Yb = iso(6, 6, 0)[1];
    const rx = 1.2247 * r * U, ry = 0.577 * rx;
    const hull: [number, number][] = [iso(5 - mm, 5 - mm), iso(7 + mm, 5 - mm),
      iso(7 + mm, 7 + mm), iso(5 - mm, 7 + mm),
      [Xc - rx, Yt - ry], [Xc + rx, Yt - ry], [Xc - rx, Yb + ry], [Xc + rx, Yb + ry]];
    const segDist = (p: [number, number], a: [number, number], b: [number, number]): number => {
      const [px, py] = p, [ax, ay] = a, [bx, by] = b;
      const ex = bx - ax, ey = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey)));
      return Math.hypot(px - (ax + t * ex), py - (ay + t * ey));
    };
    let d = Infinity;   // min distance to any hull edge (hull order is convex-ish enough for a bound)
    for (let i = 0; i < hull.length; i++) {
      for (let j = i + 1; j < hull.length; j++) d = Math.min(d, segDist(tip, hull[i], hull[j]));
    }
    if (!(d < 8)) {
      console.error(`chip snap: tail tip is ${d.toFixed(1)}px off the drum-tight hull (want ~5)`);
      fail++;
    }
  }
}

// svgOpen starts a new artifact: stale labels/flows must not leak into it
svgOpen(1400, 700);
resetUnits();
expectOk("registries reset by svgOpen", () => checkLabels());

if (fail) process.exit(1);
console.log("collisions: all cases ok");
