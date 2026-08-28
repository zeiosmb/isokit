#!/usr/bin/env python3
"""Azure Isometric exemplar diagram — Blueprint theme, gold-standard grammar.
Shape library and geometry rules live in isokit.py; this file is the layout.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from isokit import (configure, out, iso, plane, plane_label, grid,
                    svg_open, write, poly, zrect, box, cyl, users, GLYPHS,
                    unit, connect, render_units, annotate, annotations,
                    INK, INK2, A1, A2, A3, MONO)

configure(u=46, ox=440, oy=48)
S = svg_open(1400, 700)
S.append(grid(seam=("y", 13)))   # ground drops darker past the identity tier

S.append(plane(7, -0.4, 13.8, 5.4))        # app tier
S.append(plane(4.4, 3.4, 11, 8.6))    # data tier
S.append(plane(1.6, 7.6, 8, 11.9))    # identity & secrets

S.append(plane_label("APP TIER", 7.35, -0.1, "x"))
S.append(plane_label("DATA TIER", 4.15, 8.35, "y"))
S.append(plane_label("IDENTITY + SECRETS", 1.35, 11.4, "y", size=13))

S.append(poly(zrect(9.85, -0.15, 12.15, 5.15), fill="none", stroke=INK, stroke_width=1, opacity=0.6))
S.append(plane_label("AVAILABILITY SET", 12.4, 4.9, "y", size=11, ls=1.8))
S.append(poly(zrect(4.85, 3.85, 7.15, 8.15), fill="none", stroke=INK, stroke_width=1, opacity=0.6))
S.append(plane_label("AVAILABILITY SET", 7.4, 7.9, "y", size=11, ls=1.8))

# units — manual grid positions, named for connection
unit("users", users, 2, 2)
unit("gw",    box, 7, 1, rim=A3, glyph=GLYPHS["gw"])
unit("app1",  box, 10, 0, rim=A3, glyph=GLYPHS["app"])
unit("app2",  box, 10, 3, rim=A3, glyph=GLYPHS["app"])
unit("sql1",  cyl, 5, 4, rim=A2)
unit("sql2",  cyl, 5, 6, rim=A2)
unit("entra", box, 2, 8, rim=A1, glyph=GLYPHS["entra"])
unit("kv",    box, 5, 9, rim=A1, glyph=GLYPHS["kv"])

# flows by name — endpoints land on plate edges automatically
S.append(connect("users", "gw", exit=("+x", 0.5), enter=("-x", 0.66),
                 via=[(4.6, 3.0), (4.6, 2.32)]))
S.append(connect("gw", "app1", exit=("+x", 0.5), enter=("-x", 0.75),
                 via=[(9.5, 2.0), (9.5, 1.5)]))
S.append(connect("app2", "sql1", exit=("-x", 0.72), enter=("+x", 0.5),
                 via=[(8.5, 4.44), (8.5, 5.0)]))
S.append(connect("app2", "entra", exit=("+y", 0.5), enter=("+x", 0.55),
                 via=[(11.0, 9.1)], style="data"))
S.append(connect("app2", "kv", exit=("+y", 0.94), enter=("+x", 0.55),
                 via=[(11.88, 10.1)], style="data"))

S.append(render_units())   # painter's order handled by the registry

# one declaration per unit: chip number, chip approach, and legend entry
annotate("users", "End users",           "reach the workload over HTTPS from any device.", (1.6, 4.4))
annotate("gw",    "Application Gateway", "WAF terminates TLS and routes requests to the app tier.", (6.5, 3.05))
annotate("app2",  "App Services",        "availability pair serves the LOB application.", (13.5, 5.3))
annotate("sql1",  "Azure SQL",           "primary plus readable replica in an availability set.", (3.9, 5.1))
annotate("entra", "Entra ID",            "validates OIDC tokens for every app-tier request.", (2.0, 6.8))
annotate("kv",    "Key Vault",           "supplies connection secrets at runtime; none in config.", (7.1, 11.6))

S.append(f'<text x="40" y="52" font-family={MONO!r} font-size="24" font-weight="700" fill="{INK}">AZURE LOB WORKLOAD</text>')
S.append(f'<text x="40" y="76" font-family={MONO!r} font-size="12.5" fill="{INK2}">isometric exemplar &#183; Blueprint theme &#183; gold-standard grammar (STYLE.md)</text>')

S.append(annotations())

write(out("Azure Isometric.svg"), S)
