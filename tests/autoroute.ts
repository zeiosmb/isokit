// Phase 2 step 5: auto flow routing. autoVia(a, b, exit, enter) returns the
// axis-locked waypoint list connect() uses when no `via` is authored: an
// orthogonal route on the Hanan grid of unit rects expanded by a clearance
// margin, minimizing length then bends. Straight stays straight (byte-compat
// with the old blind default); blocked paths detour; no path is a hard error.
import { setTheme, configure, svgOpen, resetUnits, unit, group, box,
  autoVia, connect, A2, type Pt } from "../src/isokit.ts";

setTheme("blueprint");
configure(46, 440, 48);
svgOpen(1400, 700);

let fail = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (!cond) { console.error(`${name}: FAIL ${detail}`); fail++; }
}
function expectThrow(name: string, fn: () => unknown, needle: string): void {
  try { fn(); console.error(`${name}: did not throw`); fail++; }
  catch (e) { if (!String(e).includes(needle)) { console.error(`${name}: wrong message: ${e}`); fail++; } }
}

const CLEAR = 0.45;   // the router's clearance margin around unit cell rects

function axisLocked(pts: Pt[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i][0] - pts[i - 1][0]) > 1e-9
      && Math.abs(pts[i][1] - pts[i - 1][1]) > 1e-9) return false;
  }
  return true;
}
// does any interior of the polyline enter the rect expanded by the clearance?
function entersRect(pts: Pt[], r: [number, number, number, number]): boolean {
  const [x0, y0, x1, y1] = [r[0] - CLEAR + 1e-6, r[1] - CLEAR + 1e-6,
    r[2] + CLEAR - 1e-6, r[3] + CLEAR - 1e-6];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1
      || Math.max(ay, by) < y0 || Math.min(ay, by) > y1) continue;
    return true;
  }
  return false;
}
const eq = (a: Pt, b: Pt): boolean =>
  Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

// 1) clear line of sight: the route is the plain straight segment the old
// blind default emitted (golden compatibility)
{
  resetUnits();
  unit("a", box, 5, 6, { rim: A2 });
  unit("b", box, 5, 3, { rim: A2 });
  const pts = autoVia("a", "b", "-y", "+y");
  check("clear straight route stays two points",
    pts.length === 2 && eq(pts[0], [6, 6]) && eq(pts[1], [6, 5]),
    JSON.stringify(pts));
}

// 2) a unit sitting on the straight line forces a detour that clears every
// expanded rect and stays axis-locked
{
  resetUnits();
  unit("a", box, 2, 2, { rim: A2 });
  unit("wall_", box, 5, 2, { rim: A2 });
  unit("b", box, 8, 2, { rim: A2 });
  const pts = autoVia("a", "b", "+x", "-x");
  check("detour starts and ends on the edges",
    eq(pts[0], [4, 3]) && eq(pts[pts.length - 1], [8, 3]), JSON.stringify(pts));
  check("detour is axis-locked", axisLocked(pts), JSON.stringify(pts));
  check("detour clears the blocker", !entersRect(pts, [5, 2, 7, 4]), JSON.stringify(pts));
  check("detour is economical", pts.length <= 6, `${pts.length} points`);
  // on a length tie, take the screen-FRONT lane (higher x+y): the north/west
  // lane runs behind the blocker's top face and the flow disappears there
  check("detour prefers the visible front lane",
    pts.every(p => p[1] >= 3 - 1e-9), JSON.stringify(pts));
}

// 2b) the arrival neck: the arrowhead is 0.42 cells long, so a final bend at
// the 0.45 clearance margin chokes the head (~1px of visible shaft). When
// there is room, the router must land the last bend a full stub back.
{
  resetUnits();
  unit("a", box, 2, 4, { rim: A2 });
  unit("wall_", box, 5, 4, { rim: A2 });
  unit("b", box, 10, 4, { rim: A2 });
  const pts = autoVia("a", "b", "+x", "-x");
  const [lx, ly] = pts[pts.length - 2], [ex, ey] = pts[pts.length - 1];
  check("last bend leaves a visible neck before the head",
    Math.abs(lx - ex) + Math.abs(ly - ey) >= 0.85, JSON.stringify(pts));
  check("neck route clears the blocker", !entersRect(pts, [5, 4, 7, 6]), JSON.stringify(pts));
}

// 3) determinism: the same route twice, point for point
{
  resetUnits();
  unit("a", box, 2, 2, { rim: A2 });
  unit("wall_", box, 5, 2, { rim: A2 });
  unit("b", box, 8, 2, { rim: A2 });
  const r1 = JSON.stringify(autoVia("a", "b", "+x", "-x"));
  const r2 = JSON.stringify(autoVia("a", "b", "+x", "-x"));
  check("routing is deterministic", r1 === r2, `${r1} vs ${r2}`);
}

// 4) connect() with no via uses the router: the emitted flow detours (more
// than the blind L-elbow's three points, and it renders without the
// diagonal-segment guard firing)
{
  resetUnits();
  unit("a", box, 2, 2, { rim: A2 });
  unit("wall_", box, 5, 4, { rim: A2 });   // sits exactly on the old L-elbow corner
  unit("b", box, 8, 4, { rim: A2 });
  const svg = connect("a", "b");
  check("connect auto-routes around units", svg.includes("<polyline"));
}

// 5) an exit edge flush against a neighbour has no stub room: hard error,
// not a flow drawn through the neighbour
{
  resetUnits();
  group([2, 2], [["a", box, { rim: A2 }], ["n", box, { rim: A2 }]], { gap: 0 });
  unit("b", box, 8, 2, { rim: A2 });
  expectThrow("flush exit edge errors",
    () => autoVia("a", "b", "+x", "-x"), "no clear route");
}

// 6) a fully walled-in target is a hard error naming both units
{
  resetUnits();
  unit("a", box, 1, 5, { rim: A2 });
  unit("b", box, 8, 5, { rim: A2 });
  unit("w1", box, 6, 3, { rim: A2 });
  unit("w2", box, 8, 3, { rim: A2 });
  unit("w3", box, 10, 3, { rim: A2 });
  unit("w4", box, 6, 5, { rim: A2 });
  unit("w5", box, 10, 5, { rim: A2 });
  unit("w6", box, 6, 7, { rim: A2 });
  unit("w7", box, 8, 7, { rim: A2 });
  unit("w8", box, 10, 7, { rim: A2 });
  expectThrow("walled-in target errors",
    () => autoVia("a", "b", "+x", "-x"), "no clear route");
}

if (fail) process.exit(1);
console.log("autoroute: all cases ok");
