/* Auto label placement demo — regression fixture for autoLabel().
Both tier captions are auto-placed. The ingest plane's canonical top-left
spot is clear, so INGEST TIER lands there (the exemplar convention). The
data plane has NO honest inside spot — every inside candidate would put ink
within checkLabels' 3px em-box slack of a hull, i.e. on an outline stroke —
so DATA TIER exercises the outside fallback ring, floating in the air along
the plane's west edge (the same spot the collision gauntlet's hand-tuned
DATA TIER uses). If candidate ordering, the clearance pad, or the outside
ring change, this golden moves. */
import { setTheme, configure, plane, grid, svgOpen, box, cyl,
  store, GLYPHS, unit, connect, renderUnits, autoLabel, INK, INK2, MONOQ,
  A2, A3 } from "../src/isokit.ts";
import { out, write } from "../src/io.ts";

setTheme("blueprint");
configure(46, 440, 48);
const S = svgOpen(1400, 700);
S.push(grid());

// ONE rect per tier, shared by plane() and autoLabel(): a caption placed
// against a different rect than the drawn plane can put ink on the line
const ingestRect: [number, number, number, number] = [2.6, 0.6, 11.4, 4.4];
// top margin 0.6 (the app->db arrowhead crosses that edge); bottom stays 0.4
// so the plane is still too crowded for an inside caption — this fixture
// exists to exercise the outside fallback ring
const dataRect: [number, number, number, number] = [4.6, 5.4, 11.4, 8.4];
S.push(plane(...ingestRect));
S.push(plane(...dataRect));

unit("gw",   box,   3, 2, { rim: A2, glyph: GLYPHS["gw"] });
unit("app",  box,   9, 1, { rim: A3, glyph: GLYPHS["app"] });
unit("db",   cyl,   5, 6, { rim: A2 });
unit("blob", store, 9, 6, { rim: A3 });

S.push(connect("gw", "app", { exit: ["+x", 0.5], enter: ["-x", 0.5], via: [[7, 3], [7, 2]] }));
S.push(connect("app", "db", { exit: ["+y", 0.25], enter: ["-y", 0.5], via: [[9.5, 5.0], [6.0, 5.0]] }));
S.push(renderUnits());

// after units and flows — autoLabel can only avoid what already exists
S.push(autoLabel("INGEST TIER", ingestRect));
S.push(autoLabel("DATA TIER", dataRect));

S.push(`<text x="40" y="52" font-family=${MONOQ} font-size="24" font-weight="700" fill="${INK}">AUTO LABEL DEMO</text>`);
S.push(`<text x="40" y="76" font-family=${MONOQ} font-size="12.5" fill="${INK2}">both tier captions placed by autoLabel() &#183; generator: layouts/auto_label_demo.ts</text>`);

write(out("AutoLabel Demo.svg"), S);
