#!/usr/bin/env python3
"""Hybrid on-prem-to-Azure diagram — Azure theme stress test for isokit.
Exercises: set_theme, two-tone ground seam as the on-prem/cloud boundary,
wall (firewall) + queue shapes, raised plane, registry connect-by-name."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from isokit import set_theme
set_theme("azure")
from isokit import (configure, out, plane, plane_label, grid, svg_open,
                    write, box, cyl, wall, queue, store, rack, building, users,
                    unit, connect, render_units, annotate, annotations, GLYPHS,
                    INK, INK2, A1, A2, A3, MONO)

configure(u=46, ox=440, oy=48)
S = svg_open(1400, 700)
S.append(grid(seam=("y", 9)))            # ground drops darker: on-premises

S.append(plane(4.6, 0.4, 15.2, 8.4))     # Azure VNet
S.append(plane(9.8, 0.8, 15.0, 4.2))     # app subnet
S.append(plane(8.8, 4.8, 15.0, 7.2))     # data subnet
S.append(plane(0.8, 1.0, 3.6, 3.8))      # Entra (SaaS, outside the VNet)
S.append(plane(0.6, 9.6, 8.4, 14.4))     # on-premises estate

S.append(plane_label("AZURE VNET", 4.95, 0.72, "x"))
S.append(plane_label("APP SUBNET", 12.3, 1.06, "x", size=12))
S.append(plane_label("DATA SUBNET", 8.55, 7.75, "y", size=12))
S.append(plane_label("ENTRA ID", 0.95, 4.05, "x", size=11, ls=1.8))
S.append(plane_label("ON-PREMISES", 4.6, 14.65, "x", size=13))

# units — cloud
unit("vpngw", box, 5, 6, rim=A2, glyph=GLYPHS["gw"])
unit("fw",    wall, 5, 3, rim=A2)
unit("app1",  box, 10, 1, rim=A2, glyph=GLYPHS["app"])
unit("app2",  box, 13, 2, rim=A2, glyph=GLYPHS["app"])
unit("sql",   cyl, 11, 5, rim=A3)
unit("queue", queue, 13, 5, rim=A2)
unit("blob",  store, 9, 5, rim=A3)
unit("entra", box, 1, 1, rim=A1, glyph=GLYPHS["entra"])
# units — on-premises
unit("hq",    building, 1, 10)
unit("dc",    rack, 4, 11, rim=A3)
unit("staff", users, 6, 12)

# flows
S.append(connect("hq", "vpngw", exit=("+x", 0.3), enter=("+y", 0.5),
                 style="sync"))                        # S2S tunnel over the boundary
S.append(connect("vpngw", "fw"))                       # into the firewall
S.append(connect("fw", "app1", exit=("-y", 0.75), enter=("-x", 0.5),
                 via=[(6.5, 2.0)]))        # inspected traffic to app tier
S.append(connect("app1", "sql", exit=("+y", 0.5), enter=("-y", 0.5),
                 via=[(11.0, 4.4), (12.0, 4.4)]))
S.append(connect("app2", "queue", exit=("+y", 0.5), enter=("-y", 0.5),
                 style="data"))
S.append(connect("app1", "blob", exit=("+y", 0.25), enter=("-y", 0.25),
                 via=[(10.5, 4.0), (9.5, 4.0)], style="data"))
S.append(connect("dc", "entra", exit=("-x", 0.35), enter=("+y", 0.5),
                 via=[(3.4, 11.7), (3.4, 4.6), (2.0, 4.6)], style="data"))    # Entra Connect sync
S.append(connect("staff", "vpngw", exit=("-y", 0.25), enter=("+y", 0.75),
                 style="data"))

S.append(render_units())

# raised tier sheet floating over the app pair (reference-style)
S.append(plane(9.9, 0.9, 15.1, 4.1, z=1.75))
S.append(plane_label("LOB APPLICATION", 10.35, 1.22, "x", size=12, z=1.75))

# one declaration per unit: chip number, chip approach, and legend entry
# all come from here, numbered in declaration order
annotate("hq",    "On-premises",    "HQ, domain controllers, and staff behind the corporate edge.", (3.0, 12.6))
annotate("vpngw", "VPN Gateway",    "site-to-site tunnel terminates the private link.", (3.6, 7.7))
annotate("fw",    "Azure Firewall", "inspects all traffic entering the VNet.", (3.8, 4.4))
annotate("app1",  "App tier",       "LOB application pair in the app subnet.", (11.1, -0.7))
annotate("sql",   "Azure SQL",      "system of record in the data subnet.", (13.4, 9.8))
annotate("queue", "Service Bus",    "queue decouples async work.", (15.9, 7.2))
annotate("entra", "Entra ID",       "hybrid identity synced from on-prem AD.", (4.4, 2.5))
annotate("blob",  "Blob Storage",   "files and artifacts in the storage account.", (8.2, 4.0))

S.append(f'<text x="40" y="52" font-family={MONO!r} font-size="24" font-weight="700" fill="{INK}">HYBRID: ON-PREM TO AZURE</text>')
S.append(f'<text x="40" y="76" font-family={MONO!r} font-size="12.5" fill="{INK2}">isometric &#183; Azure theme &#183; generator: layouts/hybrid_onprem_azure.py</text>')

S.append(annotations(footer="darker ground = on-premises &#183; lighter = Azure"))

write(out("Hybrid OnPrem Azure.svg"), S)
