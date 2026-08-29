/* Collision gauntlet — regression fixture for the label collision check.
The four numbered labels below are deliberately tuned 1-3 0.05-grid steps
inside the pass/fail boundary of checkLabels() (boundaries found by sweeping
each label against this exact scene; the step count above one is where
boundary-cell ink visually kissed a plate outline — the hull excludes stroke
width). If the collision geometry changes — hull construction, em-box
estimate, EPS tolerance — this layout starts erroring; the looser direction
is locked by the must-still-fail cases in tests/collisions.ts. Each label
exercises a different geometry path. */
import { configure, plane, planeLabel, grid, svgOpen,
  box, cyl, store, rack, GLYPHS, unit, connect, renderUnits,
  annotate, annotations, INK, INK2, A1, A2, A3, MONOQ } from "../src/isokit.ts";
import { out, write } from "../src/io.ts";

configure(46, 440, 48);
const S = svgOpen(1400, 700);
S.push(grid());

S.push(plane(2.4, 0.4, 11.6, 4.6));     // pipeline tier
S.push(plane(4.4, 5.4, 11.6, 8.6));     // data tier

unit("gw",   box,   3, 2,  { rim: A2, glyph: GLYPHS["gw"] });
unit("app",  box,   9, 1,  { rim: A3, glyph: GLYPHS["app"] });
unit("db",   cyl,   5, 6,  { rim: A2 });
unit("blob", store, 9, 6,  { rim: A3 });
unit("ops",  rack,  13, 4, { rim: A1 });

// vias make the last segment perpendicular to the entered face — the auto
// L-route arrived running ALONG app's -x face, arrowhead pointing past it
S.push(connect("gw", "app",  { exit: ["+x", 0.5],  enter: ["-x", 0.5],
  via: [[7.0, 3.0], [7.0, 2.0]] }));
S.push(connect("app", "db",  { exit: ["+y", 0.25], enter: ["-y", 0.5],
  via: [[9.5, 5.0], [6.0, 5.0]] }));
S.push(connect("app", "blob", { exit: ["+y", 0.75], enter: ["-y", 0.5],
  via: [[10.5, 5.2], [10.0, 5.2]], style: "data" }));
S.push(connect("ops", "app", { exit: ["-y", 0.5], enter: ["+x", 0.5],
  via: [[14.0, 2.0]], style: "data" }));

// the gauntlet — each comment records the measured boundary (0.05 closer trips)
// 1. drum-tight cylinder hull: label in the phantom air beside db's drum,
//    inside the naive full-footprint silhouette; boundary x=4.20
S.push(planeLabel("DATA TIER", 4.15, 8.35, "y"));
// ordinary tier caption, NOT a gauntlet exhibit: 0.3 inside the plane's top
// edge (exemplar convention). Its old spot grazed gw's plate between two
// outline strokes with no room for ink; the silhouette-graze path is
// exercised by STANDBY below.
S.push(planeLabel("INGEST TIER", 2.9, 0.9, "x"));
// 2. flow-corridor squeeze between the pipeline plane's edge (y=4.4) and the
//    app->db route at grid y=5.0; boundary y=4.95
S.push(planeLabel("SYNC PATH", 6.9, 4.9, "x", { size: 11, ls: 1.8 }));
// 3. store slant-edge hull axis: label along blob's near face; boundary x=8.45
S.push(planeLabel("COLD STORE", 8.4, 8.75, "y", { size: 12 }));
// 4. plate-edge graze under the rack, centered along the plate edge;
//    boundary y=6.05 (at 6.10 the plate outline's stroke crossed the first
//    glyphs — outline width isn't hulled)
S.push(planeLabel("STANDBY", 13.38, 6.2, "x", { size: 11, ls: 1.8 }));

S.push(renderUnits());

annotate("gw",   "Gateway",    "ingress edge of the pipeline tier.", [2.0, 0.6]);
annotate("app",  "App tier",   "processes and fans out to the data tier.", [11.6, 0.2]);
// approach from above the NW so the ray's first hull crossing is the DRUM
// rim, not a plate corner — the chip visibly hugs the drum. West rays cross
// the DATA TIER label's line; south rays stop at the plate's south corner.
annotate("db",   "Database",   "drum hull keeps the air beside it labelable.", [3.4, 5.2]);
annotate("blob", "Cold store", "slant-edge hull bounds the near face.", [12.2, 7.6]);
annotate("ops",  "Ops rack",   "plate corners bound the ground graze.", [15.7, 5.2]);

S.push(`<text x="40" y="52" font-family=${MONOQ} font-size="24" font-weight="700" fill="${INK}">COLLISION GAUNTLET</text>`);
S.push(`<text x="40" y="76" font-family=${MONOQ} font-size="12.5" fill="${INK2}">labels tuned to the collision-check boundary &#183; regression fixture &#183; generator: layouts/collision_gauntlet.ts</text>`);

S.push(annotations({ footer: "labels sit at the check's boundary" }));

write(out("Collision Gauntlet.svg"), S);
