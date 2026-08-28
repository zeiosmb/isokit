/* Hybrid on-prem-to-Azure diagram — Azure theme stress test for isokit.
Exercises: setTheme, two-tone ground seam as the on-prem/cloud boundary,
wall (firewall) + queue shapes, raised plane, registry connect-by-name. */
import { setTheme, configure, out, plane, planeLabel, grid, svgOpen,
  write, box, cyl, wall, queue, store, rack, building, users,
  unit, connect, renderUnits, annotate, annotations, GLYPHS, MONOQ } from "../src/isokit.ts";
// theme tokens are live bindings — import the module namespace so values
// read AFTER setTheme("azure") below (a static `import { INK }` would also
// stay live, but the namespace makes the dependency explicit)
import * as T from "../src/isokit.ts";

setTheme("azure");

configure(46, 440, 48);
const S = svgOpen(1400, 700);
S.push(grid({ seam: ["y", 9] }));        // ground drops darker: on-premises

S.push(plane(4.6, 0.4, 15.2, 8.4));     // Azure VNet
S.push(plane(9.8, 0.8, 15.0, 4.2));     // app subnet
S.push(plane(8.8, 4.8, 15.0, 7.2));     // data subnet
S.push(plane(0.8, 1.0, 3.6, 3.8));      // Entra (SaaS, outside the VNet)
S.push(plane(0.6, 9.6, 8.4, 14.4));     // on-premises estate

S.push(planeLabel("AZURE VNET", 4.95, 0.72, "x"));
S.push(planeLabel("APP SUBNET", 12.3, 1.06, "x", { size: 12 }));
S.push(planeLabel("DATA SUBNET", 8.55, 7.75, "y", { size: 12 }));
S.push(planeLabel("ENTRA ID", 0.95, 4.05, "x", { size: 11, ls: 1.8 }));
S.push(planeLabel("ON-PREMISES", 4.6, 14.65, "x", { size: 13 }));

// units — cloud
unit("vpngw", box, 5, 6, { rim: T.A2, glyph: GLYPHS["gw"] });
unit("fw",    wall, 5, 3, { rim: T.A2 });
unit("app1",  box, 10, 1, { rim: T.A2, glyph: GLYPHS["app"] });
unit("app2",  box, 13, 2, { rim: T.A2, glyph: GLYPHS["app"] });
unit("sql",   cyl, 11, 5, { rim: T.A3 });
unit("queue", queue, 13, 5, { rim: T.A2 });
unit("blob",  store, 9, 5, { rim: T.A3 });
unit("entra", box, 1, 1, { rim: T.A1, glyph: GLYPHS["entra"] });
// units — on-premises
unit("hq",    building, 1, 10);
unit("dc",    rack, 4, 11, { rim: T.A3 });
unit("staff", users, 6, 12);

// flows
S.push(connect("hq", "vpngw", { exit: ["+x", 0.3], enter: ["+y", 0.5],
  style: "sync" }));                      // S2S tunnel over the boundary
S.push(connect("vpngw", "fw"));           // into the firewall
S.push(connect("fw", "app1", { exit: ["-y", 0.75], enter: ["-x", 0.5],
  via: [[6.5, 2.0]] }));      // inspected traffic to app tier
S.push(connect("app1", "sql", { exit: ["+y", 0.5], enter: ["-y", 0.5],
  via: [[11.0, 4.4], [12.0, 4.4]] }));
S.push(connect("app2", "queue", { exit: ["+y", 0.5], enter: ["-y", 0.5],
  style: "data" }));
S.push(connect("app1", "blob", { exit: ["+y", 0.25], enter: ["-y", 0.25],
  via: [[10.5, 4.0], [9.5, 4.0]], style: "data" }));
S.push(connect("dc", "entra", { exit: ["-x", 0.35], enter: ["+y", 0.5],
  via: [[3.4, 11.7], [3.4, 4.6], [2.0, 4.6]], style: "data" }));    // Entra Connect sync
S.push(connect("staff", "vpngw", { exit: ["-y", 0.25], enter: ["+y", 0.75],
  style: "data" }));

S.push(renderUnits());

// raised tier sheet floating over the app pair (reference-style)
S.push(plane(9.9, 0.9, 15.1, 4.1, 1.75));
S.push(planeLabel("LOB APPLICATION", 10.35, 1.22, "x", { size: 12, z: 1.75 }));

// one declaration per unit: chip number, chip approach, and legend entry
// all come from here, numbered in declaration order
annotate("hq",    "On-premises",    "HQ, domain controllers, and staff behind the corporate edge.", [3.0, 12.6]);
annotate("vpngw", "VPN Gateway",    "site-to-site tunnel terminates the private link.", [3.6, 7.7]);
annotate("fw",    "Azure Firewall", "inspects all traffic entering the VNet.", [3.8, 4.4]);
annotate("app1",  "App tier",       "LOB application pair in the app subnet.", [11.1, -0.7]);
annotate("sql",   "Azure SQL",      "system of record in the data subnet.", [13.4, 9.8]);
annotate("queue", "Service Bus",    "queue decouples async work.", [15.9, 7.2]);
annotate("entra", "Entra ID",       "hybrid identity synced from on-prem AD.", [4.4, 2.5]);
annotate("blob",  "Blob Storage",   "files and artifacts in the storage account.", [8.2, 4.0]);

S.push(`<text x="40" y="52" font-family=${MONOQ} font-size="24" font-weight="700" fill="${T.INK}">HYBRID: ON-PREM TO AZURE</text>`);
S.push(`<text x="40" y="76" font-family=${MONOQ} font-size="12.5" fill="${T.INK2}">isometric &#183; Azure theme &#183; generator: layouts/hybrid_onprem_azure.ts</text>`);

S.push(annotations({ footer: "darker ground = on-premises &#183; lighter = Azure" }));

write(out("Hybrid OnPrem Azure.svg"), S);
