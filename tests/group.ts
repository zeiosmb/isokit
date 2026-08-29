// Phase 2 step 4: group packing. group(origin, members, opts) lays member
// units into rows/columns on the snapped grid — row-major, whole-cell blocks,
// integer gaps — via unit(), so every placement guard (snap, overlap) still
// applies. It returns the enclosing plane rect (cells + pad) ready for
// plane() and autoLabel(). Explicit unit() remains the authored override.
import { setTheme, configure, svgOpen, resetUnits, unit, group, edgePt,
  box, cyl, connect, A2 } from "../src/isokit.ts";

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

// cell rect of a placed unit, read back through the public edge API
function rectOf(name: string): [number, number, number, number] {
  const [x0, y0] = edgePt(name, "-x", 0);
  const [x1, y1] = edgePt(name, "+x", 1);
  return [x0, y0, x1, y1];
}
const eq = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

// 1) two members side by side: 2x2 blocks, default gap 1, rect pads 0.6
{
  resetUnits();
  const r = group([4, 4], [["a", box, { rim: A2 }], ["b", box, { rim: A2 }]]);
  check("first block at the origin", eq(rectOf("a"), [4, 4, 6, 6]), `${rectOf("a")}`);
  check("second block one gap east", eq(rectOf("b"), [7, 4, 9, 6]), `${rectOf("b")}`);
  check("plane rect hugs the cells", eq(r, [3.4, 3.4, 9.6, 6.6]), `${r}`);
}

// 2) cols: 1 stacks members down the y axis
{
  resetUnits();
  group([4, 4], [["a", box, { rim: A2 }], ["b", box, { rim: A2 }]], { cols: 1 });
  check("cols 1 stacks south", eq(rectOf("b"), [4, 7, 6, 9]), `${rectOf("b")}`);
}

// 3) row-major wrap: third of three (cols 2) starts row two at the origin x
{
  resetUnits();
  const r = group([4, 4], [["a", box, { rim: A2 }], ["b", box, { rim: A2 }],
    ["c", cyl, { rim: A2 }]], { cols: 2 });
  check("third block wraps to row two", eq(rectOf("c"), [4, 7, 6, 9]), `${rectOf("c")}`);
  check("wrapped rect covers both rows", eq(r, [3.4, 3.4, 9.6, 9.6]), `${r}`);
}

// 4) mixed cells: a wide member advances the cursor by its own width, and
// the row below starts under the row's deepest member
{
  resetUnits();
  group([2, 2], [["wide", box, { rim: A2, cells: [4, 2], s: 1.4 }],
    ["a", box, { rim: A2 }], ["b", box, { rim: A2 }]], { cols: 2 });
  check("wide block keeps its cells", eq(rectOf("wide"), [2, 2, 6, 4]), `${rectOf("wide")}`);
  check("next block clears the wide one", eq(rectOf("a"), [7, 2, 9, 4]), `${rectOf("a")}`);
  check("row two starts under row one", eq(rectOf("b"), [2, 5, 4, 7]), `${rectOf("b")}`);
}

// 5) gap 0 packs blocks flush (touching edges are legal); pad is tunable
{
  resetUnits();
  const r = group([5, 4], [["a", cyl, { rim: A2 }], ["b", cyl, { rim: A2 }]],
    { cols: 1, gap: 0, pad: 1 });
  check("gap 0 stacks flush", eq(rectOf("b"), [5, 6, 7, 8]), `${rectOf("b")}`);
  check("pad widens the plane rect", eq(r, [4, 3, 8, 9]), `${r}`);
}

// 6) members connect by name like any other unit
{
  resetUnits();
  group([4, 4], [["a", box, { rim: A2 }], ["b", box, { rim: A2 }]]);
  check("grouped units connect by name", connect("a", "b").includes("<polyline"));
}

// 7) guards: empty group, fractional origin/gap, and the overlap error
// unit() already enforces all pass through with the member's name
{
  resetUnits();
  expectThrow("empty group errors", () => group([4, 4], []), "no members");
  expectThrow("fractional origin errors", () => group([4.5, 4], [["a", box, { rim: A2 }]]),
    "must snap to grid cells");
  expectThrow("fractional gap errors",
    () => group([4, 4], [["a", box, { rim: A2 }]], { gap: 0.5 }),
    "gap must be a whole number of cells");
  resetUnits();
  unit("solo", box, 6, 4, { rim: A2 });
  expectThrow("packing over an existing unit errors",
    () => group([4, 4], [["a", box, { rim: A2 }], ["b", box, { rim: A2 }]]),
    "overlaps 'solo'");
}

if (fail) process.exit(1);
console.log("group: all cases ok");
