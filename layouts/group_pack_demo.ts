/* Group packing demo — Phase 2 step 4 exemplar.
Both tiers are group() declarations: member units pack row-major on the
snapped grid and the grouping plane + caption are DERIVED from the returned
rect (no authored plane geometry). The users unit shows the override path:
explicit unit() placement still composes with packed groups. */
import { setTheme, configure, plane, autoLabel, grid, svgOpen,
  box, cyl, store, users, unit, group, connect, renderUnits,
  annotate, annotations, GLYPHS, MONOQ, INK, INK2, A2, A3 } from "../src/isokit.ts";
import { out, write } from "../src/io.ts";

setTheme("blueprint");
configure(46, 440, 48);
const S = svgOpen(1400, 700);
S.push(grid());

// packed tiers: positions and plane rects all derive from the group origin
const appRect = group([6, 1], [
  ["gw",   box, { rim: A3, glyph: GLYPHS["gw"] }],
  ["app1", box, { rim: A3, glyph: GLYPHS["app"] }],
  ["app2", box, { rim: A3, glyph: GLYPHS["app"] }],
], { cols: 3 });

const dataRect = group([7, 6], [
  ["sql",  cyl, { rim: A2 }],
  ["blob", store, { rim: A2 }],
], { cols: 2 });

// authored override: irregular placements still mix with packed groups
unit("users", users, 1, 2);

S.push(plane(...appRect));
S.push(plane(...dataRect));

S.push(connect("users", "gw", { exit: ["+x", 0.5], enter: ["-x", 0.5],
  via: [[4.5, 3.0], [4.5, 2.0]] }));
S.push(connect("gw", "app1"));
S.push(connect("app1", "sql", { exit: ["+y", 0.5], enter: ["-y", 0.5],
  via: [[10.0, 4.5], [8.0, 4.5]] }));
S.push(connect("app2", "blob", { exit: ["+y", 0.5], enter: ["-y", 0.5],
  via: [[13.0, 4.8], [11.0, 4.8]], style: "data" }));

S.push(renderUnits());

// captions on the derived rects — placement is auto against everything above
S.push(autoLabel("APP TIER", appRect));
S.push(autoLabel("DATA TIER", dataRect));

annotate("users", "End users", "reach the app tier over HTTPS.");
annotate("gw",    "Gateway",   "first packed cell of the app tier group.");
annotate("sql",   "Azure SQL", "packed beside blob storage in the data tier.");

S.push(`<text x="40" y="52" font-family=${MONOQ} font-size="24" font-weight="700" fill="${INK}">GROUP PACK DEMO</text>`);
S.push(`<text x="40" y="76" font-family=${MONOQ} font-size="12.5" fill="${INK2}">packed tiers &#183; derived planes + captions &#183; generator: layouts/group_pack_demo.ts</text>`);

S.push(annotations({ footer: "tier planes and captions derive from group()" }));

write(out("Group Pack Demo.svg"), S);
