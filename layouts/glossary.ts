/* Diagram glossary — every part of an isokit diagram, named and pointed at.
Most glossary entries are not units (grid, seam, plane, rim, ...), so this
layout uses direct chip() + legend() calls — the documented escape hatch for
non-unit entries — with the numbering hand-synced between the two lists.
Elevated targets (rim, raised plane) use ground-equivalent coordinates:
iso(x, y, z) projects to the same screen point as iso(x - z, y - z, 0). */
import { configure, out, plane, planeLabel, grid, svgOpen, write,
  box, cyl, store, users, GLYPHS, unit, connect, renderUnits, chip, legend,
  INK, INK2, A2, A3, MONOQ } from "../src/isokit.ts";

configure(46, 440, 48);
const S = svgOpen(1400, 820);
S.push(grid({ x1: 18, y1: 18, clip_h: 820, seam: ["y", 11] }));

S.push(plane(3, 1, 10, 6.5));            // grouping plane
S.push(plane(11, 0, 13, 2, 1.6));        // raised sheet over open ground

unit("svc",   box,   4, 2,  { rim: A2, glyph: GLYPHS["app"] });
unit("db",    cyl,   7, 4,  { rim: A3 });
unit("blob",  store, 10, 8, { rim: A3 });
unit("crowd", users, 3, 12);             // beyond the seam: the "other estate"

S.push(connect("svc", "db", { exit: ["+y", 0.5], enter: ["-x", 0.5],
  via: [[5, 5]] }));
S.push(connect("db", "blob", { exit: ["+y", 0.5], enter: ["-x", 0.5],
  via: [[8, 9]], style: "data" }));

S.push(planeLabel("PLANE LABEL", 3.3, 6.2, "x"));

S.push(renderUnits());

// chips: numbering must match the legend entries below, in order
S.push(chip(1, 14.6, 1.0, [13.6, 2.0]));       // open grid intersection
S.push(chip(2, 4.0, 9.6, [5.2, 11.0]));        // point on the seam line
S.push(chip(3, 1.4, 3.2, [3.0, 4.2]));         // plane's left edge
S.push(chip(4, 10.4, 1.6, [11.4, 0.4]));       // raised sheet south corner (13,2)@z1.6
S.push(chip(5, 5.9, 8.4, [4.7, 6.26]));        // just under the PLANE LABEL glyphs
S.push(chip(6, 6.3, 7.2, [7.4, 6.1]));         // db's plate pad, west of the drum
                                               //   (east pad holds the data flow's origin dot)
S.push(chip(7, 2.2, 0.8, "svc"));              // the unit itself (auto-snap)
S.push(chip(8, 6.4, -0.4, [5, 1]));            // svc's rim east corner (6,2)@z1
S.push(chip(9, 4.9, 6.0, [4.65, 3.7]));        // ON the SW face below the glyph:
                                               //   equiv of face point (4.95,4)@z0.3
S.push(chip(10, 5.2, 6.4, [6, 5]));            // sync route, second segment midpoint
S.push(chip(11, 6.4, 8.6, [8.0, 7.5]));        // data route mid-segment
S.push(chip(12, 6.8, 10.2, [8.0, 9.0]));       // authored via elbow
S.push(chip(13, 12.6, 5.4));                   // a bare chip, pointing at nothing

S.push(legend([
  ["Iso grid",     "ground lattice; units snap to it"],
  ["Ground seam",  "two-tone boundary on a grid line"],
  ["Plane",        "translucent grouping sheet"],
  ["Raised plane", "sheet lifted on posts (z arg)"],
  ["Plane label",  "sheared text lying in the ground"],
  ["Plate",        "white pad marking the footprint"],
  ["Unit",         "named solid, snapped + registered"],
  ["Rim",          "role-colored top-face stroke"],
  ["Glyph",        "flat dark mark on the SW face"],
  ["Sync flow",    "solid axis-locked route"],
  ["Data flow",    "dashed async route"],
  ["Via",          "authored elbow; head lies in-plane"],
  ["Chip",         "numbered pointer pin (this one)"],
], { footer: "this rail is the legend" }));

S.push(`<text x="40" y="52" font-family=${MONOQ} font-size="24" font-weight="700" fill="${INK}">DIAGRAM GLOSSARY</text>`);
S.push(`<text x="40" y="76" font-family=${MONOQ} font-size="12.5" fill="${INK2}">every part of an isokit diagram, named &#183; generator: layouts/glossary.ts</text>`);

write(out("Diagram Glossary.svg"), S);
