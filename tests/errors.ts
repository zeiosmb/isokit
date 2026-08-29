// Guard coverage: every hard generation error the renderer enforces.
// Golden masters only exercise successful renders; the guards are half the
// product (they are what makes agent self-correction work), so each one is
// asserted here with a message substring check.
import { setTheme, configure, svgOpen, grid, flow, unit, resetUnits,
  annotate, annotations, edgePt, box, legend, A1, A2 } from "../src/isokit.ts";

setTheme("blueprint");
configure(46, 440, 48);
svgOpen(1400, 700);

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

expectThrow("grid seam off-grid",
  () => grid({ seam: ["y", 9.5] }),
  "seam coordinate must be an integer grid line");

expectThrow("flow diagonal segment",
  () => flow([[0, 0], [2, 2]], A2),
  "is diagonal; route via axis-aligned waypoints");

expectThrow("flow diagonal via waypoint",
  () => flow([[0, 0], [2, 0], [3, 3]], A2),
  "is diagonal; route via axis-aligned waypoints");

resetUnits();
expectThrow("unit off-grid position",
  () => unit("a", box, 2.5, 3, { rim: A2 }),
  "position must snap to grid cells");

resetUnits();
expectThrow("unit shape exceeds cells",
  () => unit("a", box, 2, 3, { rim: A2, s: 1.8 }),
  "exceeds its 2x2 cells");

resetUnits();
unit("a", box, 2, 2, { rim: A2 });
expectThrow("unit footprint overlap",
  () => unit("b", box, 3, 3, { rim: A2 }),
  "overlaps 'a'");

expectThrow("edgePt unknown side",
  () => edgePt("a", "+z"),
  "+z");

expectThrow("connect unknown unit",
  () => edgePt("nope", "+x"),
  "no such unit");

expectThrow("annotate unknown unit",
  () => annotate("ghost", "T", "d", [0, 0]),
  "no such unit");

annotate("a", "Title", "desc.", [0, 0]);
expectThrow("annotate duplicate",
  () => annotate("a", "Again", "desc.", [0, 0]),
  "already annotated");

// legend overflow: tiny canvas, a single annotation forces overflow with a
// canvas shorter than one entry (svgOpen resets the annotation registry, so
// the entry is re-declared for this artifact)
svgOpen(1400, 80);
resetUnits();
unit("a", box, 2, 2, { rim: A2 });
annotate("a", "Title", "desc.", [0, 0]);
expectThrow("legend overflow",
  () => annotations(),
  "legend content reaches");

// legend WIDTH overflow: height only was guarded originally; a long title,
// an unbreakable desc word, or a long footer ran past the rail's right edge
// as a silent clip (shipped twice as clipped footers)
svgOpen(1400, 700);
expectThrow("legend title too wide",
  () => legend([["A far too long legend entry title indeed", "d"]]),
  "but the rail ends at");
expectThrow("legend desc word too wide",
  () => legend([["T", "an unbreakable-word-far-longer-than-the-rail-allows"]]),
  "but the rail ends at");
expectThrow("legend footer too wide",
  () => legend([["T", "d"]], { footer: "a footer far too long to fit inside the legend rail" }),
  "but the rail ends at");

if (fail) process.exit(1);
console.log("errors: all guards ok");
