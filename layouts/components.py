#!/usr/bin/env python3
"""Isometric component sheet — the isokit shape vocabulary on plates,
mirroring the SlideModel components sheet. Blueprint theme."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from isokit import (configure, out, iso, plane, plane_label, grid, svg_open, write,
                    flow, plate, box, slab, panel, cyl, rack, building, monitor,
                    laptop, phone, person, person_device, browser, padlock,
                    wall, queue, store, users, GLYPHS, INK, INK2, A1, A2, A3, MONO)

configure(u=46, ox=720, oy=150)
S = svg_open(1400, 1050)
S.append(grid(x0=-8, y0=-8, x1=24, y1=26, clip_w=1400, clip_h=1050))

def pos(c, r):
    u = c * 6.0 - 9.0; v = r * 6.2 + 2.0
    return (u + v) / 2 - 0.7, (v - u) / 2 - 0.7

def caption(txt, x, y, s=1.4):
    n = len(txt) * 8.2                     # rough centering along the iso axis
    return plane_label(txt, x + 0.7 - n / 2 / 39.84, y + s + 0.55, "x", size=11.5, ls=2)

def flows_demo(x, y):
    return (flow([(x - 0.2, y + 0.15), (x + 0.75, y + 0.15), (x + 0.75, y + 0.8), (x + 1.7, y + 0.8)],
                 A3, width=1.6, heads="both", hl=0.3, hw=0.15) +
            flow([(x - 0.2, y + 1.15), (x + 1.7, y + 1.15)],
                 A2, width=1.6, dashed=True, dot=True, hl=0.3, hw=0.15))

SHEET = []
def slot(c, r, body, label):
    x, y = pos(c, r)
    SHEET.append((x + y, body(x, y) + caption(label, x, y)))

slot(0, 0, lambda x, y: box(x, y, A3, GLYPHS["app"]),   "SERVICE CUBE")
slot(1, 0, lambda x, y: cyl(x, y, A2),                  "DATABASE")
slot(2, 0, lambda x, y: building(x, y),                 "ENTERPRISE")
slot(3, 0, lambda x, y: rack(x, y, A2),                 "SERVER RACK")

slot(0, 1, lambda x, y: slab(x, y, A3, GLYPHS["gw"]),   "SERVICE TILE")
slot(1, 1, lambda x, y: panel(x, y, A3),                "DATA GRID")
slot(2, 1, lambda x, y: box(x, y, A1, GLYPHS["entra"]), "IDENTITY")
slot(3, 1, lambda x, y: box(x, y, A1, GLYPHS["kv"]),    "KEY VAULT")

slot(0, 2, lambda x, y: plate(x, y) + monitor(x + 0.06, y + 0.28),               "MONITOR")
slot(1, 2, lambda x, y: plate(x, y) + laptop(x + 0.22, y + 0.42),                "LAPTOP")
slot(2, 2, lambda x, y: plate(x, y) + phone(x + 0.48, y + 0.5, w=0.44, d=0.12, h=0.95), "PHONE")
slot(3, 2, lambda x, y: plate(x, y) + browser(x + 0.08, y + 0.5),                "BROWSER")

slot(0, 3, lambda x, y: padlock(x, y, A1),                                       "PADLOCK")
slot(1, 3, lambda x, y: plate(x, y) + person_device(*iso(x + 0.6, y + 0.7)),     "END USER")
slot(2, 3, lambda x, y: users(x, y),                                             "END USERS")
slot(3, 3, lambda x, y: flows_demo(x, y),                                        "FLOWS")

slot(0, 4, lambda x, y: wall(x, y, A1),                                          "FIREWALL")
slot(1, 4, lambda x, y: queue(x, y, A3),                                         "QUEUE")
slot(2, 4, lambda x, y: box(x, y, A1, GLYPHS["shield"]),                         "SECURITY")
slot(3, 4, lambda x, y: (plate(x, y) +
                         plane(x - 0.15, y - 0.15, x + 1.55, y + 1.55, z=0.85)), "RAISED PLANE")

slot(0, 5, lambda x, y: store(x, y, A2),                                         "BLOB STORE")

for _, body in sorted(SHEET, key=lambda t: t[0]):   # painter's order
    S.append(body)

S.append(f'<text x="40" y="52" font-family={MONO!r} font-size="24" font-weight="700" fill="{INK}">ISOMETRIC COMPONENT SHEET</text>')
S.append(f'<text x="40" y="76" font-family={MONO!r} font-size="12.5" fill="{INK2}">isokit shape vocabulary &#183; Blueprint theme &#183; generator: layouts/components.py</text>')

write(out("Isometric Components.svg"), S)
