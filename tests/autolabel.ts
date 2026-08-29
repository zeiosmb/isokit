// Phase 2 step 2: auto label placement. autoLabel(txt, planeRect) finds a
// clear anchor along the plane's edges — top edge first (exemplar caption
// convention), then left, bottom, right — using the SAME collision
// predicates as checkLabels() (unit hulls, flow routes) plus labels already
// placed, so a successful placement always survives write(). No clear spot
// is a hard error; planeLabel() remains the manual override.
import { setTheme, configure, svgOpen, resetUnits, unit, box, cyl, store, flow,
  plane, planeLabel, autoLabel, checkLabels, iso, A2, A3 } from "../src/isokit.ts";

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

// anchor of an emitted label: the translate part of its shear matrix,
// inverted back to grid coords
function anchorOf(svg: string): [number, number] {
  const m = svg.match(/matrix\([^)]*,([-\d.]+),([-\d.]+)\)/);
  if (!m) throw new Error("no matrix in label svg");
  const u = (+m[1] - 440) / (0.866 * 46), v = (+m[2] - 48) / (0.5 * 46);
  return [(u + v) / 2, (v - u) / 2];
}
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.03;

// 1) empty plane: canonical spot — top edge, 0.3 in from the NW corner
{
  svgOpen(1400, 700); resetUnits();
  const svg = autoLabel("TIER", [3, 1, 10, 6.5]);
  const [gx, gy] = anchorOf(svg);
  check("empty plane takes the canonical top-left spot",
    near(gx, 3.3) && near(gy, 1.3), `got (${gx}, ${gy})`);
  check("canonical spot uses the x shear basis", svg.includes("matrix(0.866,0.5,-0.866"));
}

// 2) unit over the canonical spot: slides along the top edge, stays legal
{
  svgOpen(1400, 700); resetUnits();
  unit("blk", box, 3, 1, { rim: A2 });    // footprint (3,1)-(5,3)
  const svg = autoLabel("TIER", [3, 1, 10, 6.5]);
  const [gx, gy] = anchorOf(svg);
  check("obstacle shifts the label along the top edge",
    gx > 3.31 && near(gy, 1.3), `got (${gx}, ${gy})`);
  check("shifted placement survives checkLabels",
    (() => { try { checkLabels(); return true; } catch { return false; } })());
}

// 3) a second auto label avoids the first (label-label avoidance)
{
  svgOpen(1400, 700); resetUnits();
  const a = anchorOf(autoLabel("ALPHA", [3, 1, 10, 6.5]));
  const b = anchorOf(autoLabel("BETA", [3, 1, 10, 6.5]));
  check("second auto label picks a different spot",
    Math.abs(a[0] - b[0]) > 0.2 || Math.abs(a[1] - b[1]) > 0.2,
    `a=(${a}), b=(${b})`);
}

// 4) a flow across the whole top edge pushes the label off that edge
{
  svgOpen(1400, 700); resetUnits();
  flow([[2, 1.3], [11, 1.3]], A2);
  const svg = autoLabel("TIER", [3, 1, 10, 6.5]);
  const [, gy] = anchorOf(svg);
  check("flow along the top edge forces another edge", gy > 1.6, `gy=${gy}`);
  check("flow-avoiding placement survives checkLabels",
    (() => { try { checkLabels(); return true; } catch { return false; } })());
}

// 5) plane covered by a unit AND walled in on all four sides (so the
// outside fallback ring is blocked too): no clear spot is a hard error
{
  svgOpen(1400, 700); resetUnits();
  unit("wall2", box, 5, 5, { rim: A2 });   // footprint (5,5)-(7,7)
  unit("wallW", box, 3, 5, { rim: A2 });
  unit("wallE", box, 7, 5, { rim: A2 });
  unit("wallN", box, 5, 3, { rim: A2 });
  unit("wallS", box, 5, 7, { rim: A2 });
  expectThrow("walled-in plane errors", () => autoLabel("X", [5, 5, 7, 7]),
    "no clear position");
}

// 6) label longer than every edge: fit error, not a bad placement
{
  svgOpen(1400, 700); resetUnits();
  expectThrow("oversize label errors",
    () => autoLabel("MUCH TOO LONG A LABEL FOR THIS PLANE", [3, 3, 5, 5]),
    "does not fit");
}

// 7) never a stroke-kisser: this scene (the gauntlet's data tier) has no
// honest inside spot — every inside candidate penetrates a hull within
// checkLabels' 3px em-box slack, so the ink would sit on an outline stroke.
// The outside fallback ring must take over: the label floats in the air
// west of the plane (the gauntlet's hand-tuned DATA TIER placement).
{
  svgOpen(1400, 700); resetUnits();
  unit("db",   cyl,   5, 6, { rim: A2 });
  unit("blob", store, 9, 6, { rim: A3 });
  const svg = autoLabel("DATA TIER", [4.6, 5.6, 11.4, 8.4]);
  const [gx, gy] = anchorOf(svg);
  check("crowded plane falls back to the outside ring, not a kisser",
    gx < 4.6 || gy < 5.6 || gy > 8.4, `got (${gx}, ${gy})`);
  check("outside placement survives checkLabels",
    (() => { try { checkLabels(); return true; } catch { return false; } })());
}

// 8) plane edges running off the canvas: nothing collides out there, so
// without a bounds check the canonical spot "wins" and the label renders
// off-screen (shipped once: hybrid's ON-PREMISES lost all but "…ES")
{
  svgOpen(1400, 700); resetUnits();
  const svg = autoLabel("EDGE CASE", [-8, 10, 4, 14]);
  const [gx, gy] = anchorOf(svg);
  const screenX = 440 + (gx - gy) * 0.866 * 46;
  check("label stays on the canvas", screenX >= 0 && screenX <= 1400,
    `anchor (${gx}, ${gy}) -> screen X ${screenX}`);
}

// 9) arrowheads are collision objects, not just their centerline: the head
// flares to a 0.21-cell half-width (~8px a side), so a label can clear the
// route polyline yet sit on the head's ink. This quad sits west of the
// centerline without ever touching it and eats into the flare.
{
  svgOpen(1400, 700); resetUnits();
  flow([[5, 7], [5, 5]], A2);
  planeLabel("AB", 4.5, 5.4, "x");
  expectThrow("label on a head flare errors", checkLabels, "arrowhead");
}

if (fail) process.exit(1);
console.log("autolabel: all cases ok");
