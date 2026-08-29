/* Auto flow routing demo — Phase 2 step 5 exemplar.
NO flow in this layout has authored via waypoints: every route comes from
the Hanan-grid router (clearance margin around every unit's cells, fewest
bends). The center row of units forces real detours; the aligned pair shows
a clear straight line staying straight. */
import { setTheme, configure, plane, autoLabel, grid, svgOpen,
  box, cyl, queue, unit, group, connect, renderUnits,
  annotate, annotations, GLYPHS, MONOQ, INK, INK2, A2, A3 } from "../src/isokit.ts";
import { out, write } from "../src/io.ts";

setTheme("blueprint");
configure(46, 440, 48);
const S = svgOpen(1400, 700);
S.push(grid());

// a wall of workers between the gateway and the stores: routes must detour
const rowRect = group([5, 4], [
  ["w1", box, { rim: A3, glyph: GLYPHS["app"] }],
  ["w2", box, { rim: A3, glyph: GLYPHS["app"] }],
  ["w3", box, { rim: A3, glyph: GLYPHS["app"] }],
], { cols: 3, gap: 0 });

unit("gw",  box, 1, 4, { rim: A2, glyph: GLYPHS["gw"] });
unit("sql", cyl, 13, 4, { rim: A2 });
unit("bus", queue, 5, 9, { rim: A2 });

S.push(plane(...rowRect));

S.push(connect("gw", "w1"));                    // aligned + clear: straight
S.push(connect("gw", "sql"));                   // straight line blocked: routed
S.push(connect("w2", "bus", { style: "data" })); // off-axis: routed, no elbow math
S.push(connect("sql", "bus", { style: "data" }));

S.push(renderUnits());

S.push(autoLabel("WORKER ROW", rowRect));

annotate("gw",  "Gateway",  "fans out around the worker row.");
annotate("sql", "Azure SQL", "reached by a routed detour, not an authored one.");
annotate("bus", "Service Bus", "collects async work from the row.");

S.push(`<text x="40" y="52" font-family=${MONOQ} font-size="24" font-weight="700" fill="${INK}">AUTO ROUTE DEMO</text>`);
S.push(`<text x="40" y="76" font-family=${MONOQ} font-size="12.5" fill="${INK2}">zero authored waypoints &#183; router detours around units &#183; generator: layouts/auto_route_demo.ts</text>`);

S.push(annotations({ footer: "every flow here is machine-routed" }));

write(out("AutoRoute Demo.svg"), S);
