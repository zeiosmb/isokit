#!/usr/bin/env python3
"""isokit — shared shape library for Azure-isometric gold-standard SVGs.

Geometry model: grid coords (x right-down, y left-down, z up), iso projection
X = OX + (x-y)*0.866*U ; Y = OY + (x+y)*0.5*U - z*U.
Visible faces of an iso solid: top, SW (y-max, faces lower-left),
SE (x-max, faces lower-right). Plane-lying text/glyphs use full affine shears:
  ground/top plane, baseline along +x:  matrix(0.866, 0.5,-0.866,0.5, X,Y)
  ground plane, baseline along -y:      matrix(0.866,-0.5, 0.866,0.5, X,Y)
  SW face (no mirror):                  matrix(0.866, 0.5, 0,    1,   X,Y)
  SE face (mirrored basis, rects only): matrix(-0.866,0.5, 0,    1,   X,Y)
Shape anatomy per SlideModel sheet: light solids + colored top rims, flat dark
glyphs ON the shape, white diamond base plates, devices as real slab shapes.
"""
import base64, math, os, subprocess

# ---- themes ----
# set_theme(name) swaps every token; layouts must call it BEFORE from-importing
# color names (from-import binds values at import time):
#   from isokit import set_theme; set_theme("azure")
#   from isokit import INK, A1, GLYPHS, ...
MONO = "'JetBrains Mono',Menlo,monospace"
THEMES = {
 "blueprint": dict(
    GROUND="#282a3d", SEAM="#202233", RAIL="#1d1f2e",
    INK="#edf2f4", INK2="#8d99ae",
    A1="#ef233c", A2="#8d99ae", A3="#f5d547",
    FLOW="#f5d547", FLOW2="#8d99ae",                       # request / data run
    TOPF="#e9ecf1", SWF="#cdd3dc", SEF="#a6adbd", EDGE="#5d6579",
    GLY="#333a4d", BEZ="#3a4152", SCR="#eef3f7",
    CYLTOP="#ced5de", CYLG=("#e2e6ec", "#c9cfd9", "#99a1b1"),
    RACK_SW="#494f63", RACK_SE="#3b4152", RACK_TOP="#5a617a",
    FIN_SW="#8b93a8", FIN_SE="#6d7488",
    KEYS="#bcc3cf", BBAR="#7f8798", BLINE="#b9c0cc",
    SWMID="#8b93a8", SWLIT="#bfc7d4",
    FW1="#9e4a44", FW2="#c05c52",                          # firewall brick / lit brick
 ),
 "azure": dict(                                            # Azure-marketing blues
    GROUND="#3070b8", SEAM="#265b9e", RAIL="#1c4d8b",
    INK="#ffffff", INK2="#cfe0f4",
    A1="#76b83f", A2="#ffb900", A3="#f2f7fb",
    FLOW="#a3d977", FLOW2="#d8e9f8",                       # pale-green arrows like the reference
    TOPF="#f4f6f9", SWF="#d6dde6", SEF="#aab5c6", EDGE="#5a6a85",
    GLY="#2f3f5c", BEZ="#3a4b66", SCR="#eef4fa",
    CYLTOP="#d3dae3", CYLG=("#e8ecf1", "#ccd3dd", "#9aa5b6"),
    RACK_SW="#44536e", RACK_SE="#37455e", RACK_TOP="#556685",
    FIN_SW="#8fa0bd", FIN_SE="#71809c",
    KEYS="#c0c8d4", BBAR="#8290a6", BLINE="#bcc5d4",
    SWMID="#8b93a8", SWLIT="#bfc7d4",
    FW1="#c0504b", FW2="#d8746c",
 ),
}

def set_theme(name):
    globals().update(THEMES[name])
    global GLYPHS
    GLYPHS = _build_glyphs()

# ---- projection (configure() per artifact) ----
U = 46; CXu = 0.866 * U; CYu = 0.5 * U; OX = 440; OY = 48

def configure(u=46, ox=440, oy=48):
    global U, CXu, CYu, OX, OY
    U = u; CXu = 0.866 * U; CYu = 0.5 * U; OX = ox; OY = oy

def iso(x, y, z=0.0): return (OX + (x - y) * CXu, OY + (x + y) * CYu - z * U)
def pts(l): return " ".join(f"{x:.1f},{y:.1f}" for x, y in l)
def poly(l, **kw):
    at = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<polygon points="{pts(l)}" {at}/>'
def pline(l, **kw):
    at = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<polyline points="{pts(l)}" fill="none" {at}/>'
def zrect(x0, y0, x1, y1, z=0): return [iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)]
def inset(quad, t):
    cx = sum(p[0] for p in quad) / 4; cy = sum(p[1] for p in quad) / 4
    return [(px + (cx - px) * t, py + (cy - py) * t) for px, py in quad]

# ---- fonts (base64-embedded JetBrains Mono; auto-fetch if /tmp copies gone) ----
_JBM = "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5/files/jetbrains-mono-latin-{w}-normal.woff2"
def _font(weight):
    p = f"/tmp/jbm{weight}.woff2"
    if not os.path.exists(p):
        subprocess.run(["curl", "-sL", "-o", p, _JBM.format(w=weight)], check=True)
    return base64.b64encode(open(p, "rb").read()).decode()

def svg_open(w=1400, h=700):
    global _CANVAS_W, _CANVAS_H
    _CANVAS_W, _CANVAS_H = w, h          # legend() checks its content against this
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">',
            f'''<defs><style>
@font-face {{font-family:'JetBrains Mono';font-weight:400;src:url(data:font/woff2;base64,{_font(400)}) format('woff2');}}
@font-face {{font-family:'JetBrains Mono';font-weight:700;src:url(data:font/woff2;base64,{_font(700)}) format('woff2');}}
</style>
<linearGradient id="cylg" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="{CYLG[0]}"/><stop offset="0.55" stop-color="{CYLG[1]}"/><stop offset="1" stop-color="{CYLG[2]}"/>
</linearGradient></defs>''',
            f'<rect width="{w}" height="{h}" fill="{GROUND}"/>']

def grid(x0=-2, y0=-2, x1=16, y1=15, clip_w=1054, clip_h=700, seam=None):
    """Ground grid. seam=("x"|"y", coord) drops the ground to a darker tone
    beyond that grid line (Azure-style two-tone ground with a crisp edge);
    grid lines draw over both tones so the seam reads as one continuous floor."""
    g = [f'<g clip-path="url(#gclip)"><clipPath id="gclip"><rect x="0" y="0" width="{clip_w}" height="{clip_h}"/></clipPath>']
    if seam:
        ax, at = seam
        if not float(at).is_integer():
            raise ValueError(f"seam coordinate must be an integer grid line, got {at}")
        r = zrect(at, y0, x1, y1) if ax == "x" else zrect(x0, at, x1, y1)
        g.append(poly(r, fill=SEAM))
    for i in range(x0, x1 + 1): g.append(pline([iso(i, y0), iso(i, y1)], stroke=INK2, stroke_width=0.6, opacity=0.22))
    for j in range(y0, y1 + 1): g.append(pline([iso(x0, j), iso(x1, j)], stroke=INK2, stroke_width=0.6, opacity=0.22))
    return "".join(g) + "</g>"

def plane(x0, y0, x1, y1, z=0, posts=True):
    """Translucent grouping sheet. z>0 floats it (reference-style raised tier);
    posts drops dashed corner ties to the ground so the height reads."""
    g = [poly(zrect(x0, y0, x1, y1, z), fill=INK, opacity=0.07),
         poly(zrect(x0, y0, x1, y1, z), fill="none", stroke=INK, stroke_width=1, opacity=0.45)]
    if z > 0 and posts:
        for cx_, cy_ in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
            g.append(pline([iso(cx_, cy_, z), iso(cx_, cy_, 0)],
                           stroke=INK, stroke_width=1, opacity=0.3, stroke_dasharray="3 4"))
    return "".join(g)

def plane_label(txt, x, y, axis, size=15, ls=2.5, fill=None, weight=400, z=0):
    fill = fill or INK2          # resolved at call time so set_theme() applies
    X, Y = iso(x, y, z)
    m = (f"matrix(0.866,0.5,-0.866,0.5,{X:.1f},{Y:.1f})" if axis == "x"
         else f"matrix(0.866,-0.5,0.866,0.5,{X:.1f},{Y:.1f})")
    return (f'<text x="0" y="0" font-family={MONO!r} font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" letter-spacing="{ls}" transform="{m}">{txt}</text>')

# Flow with in-plane arrowhead(s): shaft shortened, head = grid-space triangle
# lying in the ground plane, tip exactly at the given end point.
# heads="end"|"both"; dot=True puts a round origin dot (data-run style).
def flow(points, color, width=2.5, dashed=False, hl=0.42, hw=0.21, heads="end", dot=False):
    for (x0, y0), (x1, y1) in zip(points, points[1:]):   # axis lock: every segment
        if abs(x1 - x0) > 1e-9 and abs(y1 - y0) > 1e-9:  # must follow one grid axis
            raise ValueError(f"flow segment ({x0}, {y0}) -> ({x1}, {y1}) is diagonal; "
                             "route via axis-aligned waypoints")
    def head_at(tip, prev):
        dx, dy = tip[0] - prev[0], tip[1] - prev[1]
        L = (dx * dx + dy * dy) ** 0.5
        ux, uy = dx / L, dy / L
        px, py = -uy, ux
        b = (tip[0] - ux * hl, tip[1] - uy * hl)
        tri = [tip, (b[0] + px * hw, b[1] + py * hw), (b[0] - px * hw, b[1] - py * hw)]
        return b, poly([iso(*p) for p in tri], fill=color)
    pts_ = list(points); out = []
    b_end, h_end = head_at(pts_[-1], pts_[-2]); out.append(h_end); pts_[-1] = b_end
    if heads == "both":
        b0, h0 = head_at(pts_[0], pts_[1]); out.append(h0); pts_[0] = b0
    elif dot:
        X, Y = iso(*pts_[0])
        out.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="{width + 1.6:.1f}" fill="{color}"/>')
    kw = dict(stroke=color, stroke_width=width)
    if dashed: kw["stroke_dasharray"] = "7 5"
    return pline([iso(*p) for p in pts_], **kw) + "".join(out)

def plate(x, y, s=1.4):
    return poly(zrect(x - 0.22, y - 0.22, x + s + 0.22, y + s + 0.22),
                fill="none", stroke=INK, stroke_width=2.2, opacity=0.95)

# ---- flat dark glyphs in a local 40x40 box, sheared onto faces ----
# Bold strokes only (>=3.5) — thin marks turn to scribble under the shear.
# Built per-theme (they bake GLY in); set_theme() rebuilds the dict.
def _build_glyphs():
    return {
 "gw":    (f'<line x1="4" y1="13.5" x2="29" y2="13.5" stroke="{GLY}" stroke-width="3.8"/>'
           f'<polygon points="37,13.5 28,8.5 28,18.5" fill="{GLY}"/>'
           f'<line x1="36" y1="27.5" x2="11" y2="27.5" stroke="{GLY}" stroke-width="3.8"/>'
           f'<polygon points="3,27.5 12,22.5 12,32.5" fill="{GLY}"/>'),
 "app":   (f'<circle cx="20" cy="20" r="13.5" fill="none" stroke="{GLY}" stroke-width="2.6"/>'
           f'<ellipse cx="20" cy="20" rx="13.5" ry="5.2" fill="none" stroke="{GLY}" stroke-width="2.2"/>'
           f'<ellipse cx="20" cy="20" rx="5.2" ry="13.5" fill="none" stroke="{GLY}" stroke-width="2.2"/>'),
 "entra": (f'<circle cx="20" cy="14.5" r="8.5" fill="{GLY}"/>'
           f'<polygon points="16.4,21 23.6,21 27.5,36 12.5,36" fill="{GLY}"/>'),
 "kv":    (f'<circle cx="11.5" cy="20" r="6.8" fill="none" stroke="{GLY}" stroke-width="4.4"/>'
           f'<rect x="17.6" y="17.9" width="19.5" height="4.2" fill="{GLY}"/>'
           f'<rect x="27.5" y="22" width="3.4" height="6" fill="{GLY}"/>'
           f'<rect x="33.2" y="22" width="3.4" height="8" fill="{GLY}"/>'),
 "fn":    (f'<text x="20" y="27" font-family={MONO!r} font-size="22" font-weight="700" '
           f'fill="{GLY}" text-anchor="middle">&#402;</text>'),
 "doc":   (f'<path d="M 12 6 L 24 6 L 30 12 L 30 34 L 12 34 Z" fill="none" stroke="{GLY}" stroke-width="3"/>'
           f'<line x1="16" y1="16" x2="26" y2="16" stroke="{GLY}" stroke-width="2.6"/>'
           f'<line x1="16" y1="21" x2="26" y2="21" stroke="{GLY}" stroke-width="2.6"/>'
           f'<line x1="16" y1="26" x2="22" y2="26" stroke="{GLY}" stroke-width="2.6"/>'),
 "shield": (f'<path d="M 20 4 L 34 9.5 L 34 21 Q 34 31.5 20 36.5 Q 6 31.5 6 21 L 6 9.5 Z" '
            f'fill="{GLY}"/>'
            f'<path d="M 13.5 19.5 L 18.5 24.5 L 27 15" fill="none" stroke="{TOPF}" '
            f'stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>'),
    }

set_theme("blueprint")

# ---- solids ----
def box(x, y, rim, glyph=None, s=1.4, h=0.95, gk=0.85, with_plate=True, sx=None, sy=None):
    sx = sx if sx is not None else s; sy = sy if sy is not None else s
    g = [plate(x, y, s)] if with_plate else []
    top = [iso(x, y, h), iso(x + sx, y, h), iso(x + sx, y + sy, h), iso(x, y + sy, h)]
    sw = [iso(x, y + sy, h), iso(x + sx, y + sy, h), iso(x + sx, y + sy, 0), iso(x, y + sy, 0)]
    se = [iso(x + sx, y, h), iso(x + sx, y + sy, h), iso(x + sx, y + sy, 0), iso(x + sx, y, 0)]
    g.append(poly(sw, fill=SWF, stroke=EDGE, stroke_width=0.5, opacity=0.98))
    g.append(poly(se, fill=SEF, stroke=EDGE, stroke_width=0.5, opacity=0.98))
    g.append(poly(top, fill=TOPF, stroke=rim, stroke_width=2.5))
    if glyph:
        Tx, Ty = iso(x, y + sy, h)                  # SW face top-left corner
        gx = sx * U / 2 - 20 * gk; gy = h * U / 2 - 20 * gk
        g.append(f'<g transform="matrix(0.866,0.5,0,1,{Tx:.1f},{Ty:.1f})">'
                 f'<g transform="translate({gx:.1f},{gy:.1f}) scale({gk})">{glyph}</g></g>')
    return "".join(g)

# thin extruded service tile, glyph lying flat on the TOP face
def slab(x, y, rim, glyph=None, s=1.4, h=0.22, gk=1.1):
    g = [box(x, y, rim, None, s=s, h=h)]
    if glyph:
        Tx, Ty = iso(x, y, h)                       # top face far corner
        gx = s * U / 2 - 20 * gk; gy = s * U / 2 - 20 * gk
        g.append(f'<g transform="matrix(0.866,0.5,-0.866,0.5,{Tx:.1f},{Ty:.1f})">'
                 f'<g transform="translate({gx:.1f},{gy:.1f}) scale({gk})">{glyph}</g></g>')
    return "".join(g)

# flat tile whose top face is a colored data grid (the reference's table panel)
def panel(x, y, rim, s=1.4, h=0.12, n=4):
    g = [box(x, y, rim, None, s=s, h=h)]
    m = 0.16
    for i in range(n + 1):
        t = x + m + (s - 2 * m) * i / n
        g.append(pline([iso(t, y + m, h), iso(t, y + s - m, h)], stroke=rim, stroke_width=1.6, opacity=0.9))
        t = y + m + (s - 2 * m) * i / n
        g.append(pline([iso(x + m, t, h), iso(x + s - m, t, h)], stroke=rim, stroke_width=1.6, opacity=0.9))
    return "".join(g)

# solid iso cylinder: gradient body, colored rim ring, dark label on body front
def cyl(x, y, rim, label="SQL", s=1.4, r=0.5, h=1.25):
    g = [plate(x, y, s)]
    cx, cy = x + s / 2, y + s / 2
    Xc, Yt = iso(cx, cy, h); _, Yb = iso(cx, cy, 0)
    rx = 1.2247 * r * U; ry = 0.577 * rx  # true iso ellipse: ry/rx = tan(30 deg)
    g.append(f'<path d="M {Xc-rx:.1f} {Yt:.1f} L {Xc-rx:.1f} {Yb:.1f} '
             f'A {rx:.1f} {ry:.1f} 0 0 0 {Xc+rx:.1f} {Yb:.1f} L {Xc+rx:.1f} {Yt:.1f} Z" '
             f'fill="url(#cylg)" stroke="{EDGE}" stroke-width="0.5"/>')
    g.append(f'<ellipse cx="{Xc:.1f}" cy="{Yt:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" '
             f'fill="{CYLTOP}" stroke="{rim}" stroke-width="2.5"/>')
    if label:
        # painted around the drum: each glyph at its own azimuth theta
        # (theta=0 faces the viewer). Screen pos (Xc + rx*sin t, Yc0 + ry*cos t);
        # per-glyph matrix(cos t, -(ry/rx)*sin t, 0, 1, ...) foreshortens the
        # glyph and slopes its baseline along the ellipse tangent while
        # vertical strokes stay parallel to the cylinder axis.
        fs = 13; adv = fs * 0.6          # JetBrains Mono advance
        th_c = -math.pi / 4              # centered facing SW: tangent here matches the SW-face shear
        Yc0 = (Yt + Yb) / 2 - ry * 0.4
        n = len(label); k = ry / rx
        for i, ch in enumerate(label):
            t = th_c + (i - (n - 1) / 2) * adv / rx
            ct, st = math.cos(t), math.sin(t)
            Xi = Xc + rx * st; Yi = Yc0 + ry * ct
            g.append(f'<g transform="matrix({ct:.3f},{-k*st:.3f},0,1,{Xi:.1f},{Yi:.1f})">'
                     f'<text x="0" y="0" font-family={MONO!r} font-size="{fs}" '
                     f'font-weight="700" fill="{GLY}" text-anchor="middle">{ch}</text></g>')
    return "".join(g)

# dark server rack: fins striped across both visible faces
def rack(x, y, rim, s=1.4, h=1.15, fins=4):
    g = [plate(x, y, s)]
    sw = [iso(x, y + s, h), iso(x + s, y + s, h), iso(x + s, y + s, 0), iso(x, y + s, 0)]
    se = [iso(x + s, y, h), iso(x + s, y + s, h), iso(x + s, y + s, 0), iso(x + s, y, 0)]
    top = [iso(x, y, h), iso(x + s, y, h), iso(x + s, y + s, h), iso(x, y + s, h)]
    g.append(poly(sw, fill=RACK_SW, stroke=EDGE, stroke_width=0.5))
    g.append(poly(se, fill=RACK_SE, stroke=EDGE, stroke_width=0.5))
    g.append(poly(top, fill=RACK_TOP, stroke=rim, stroke_width=2.5))
    Tsw = iso(x, y + s, h); Tse = iso(x + s, y, h)
    fw = s * U
    for i in range(fins):
        fy = h * U * (0.14 + 0.20 * i)
        g.append(f'<g transform="matrix(0.866,0.5,0,1,{Tsw[0]:.1f},{Tsw[1]:.1f})">'
                 f'<rect x="4" y="{fy:.1f}" width="{fw-8:.1f}" height="5.5" rx="2" fill="{FIN_SW}"/></g>')
        g.append(f'<g transform="matrix(-0.866,0.5,0,1,{Tse[0]:.1f},{Tse[1]:.1f})">'
                 f'<rect x="4" y="{fy:.1f}" width="{fw-8:.1f}" height="5.5" rx="2" fill="{FIN_SE}"/></g>')
    return "".join(g)

# tall enterprise building: window grids sheared onto both visible faces
def building(x, y, rim=None, s=1.1, h=2.3, cols=4, rows=7):
    g = [plate(x, y, s)]
    g.append(box(x, y, rim or EDGE, None, s=s, h=h, with_plate=False))
    fw = s * U; fh = h * U
    win = []
    for c in range(cols):
        for r_ in range(rows):
            wx = fw * (0.10 + 0.82 * c / cols) + 1.5
            wy = fh * (0.06 + 0.90 * r_ / rows) + 1.5
            win.append((wx, wy, fw * 0.82 / cols - 4, fh * 0.90 / rows - 5))
    Tsw = iso(x, y + s, h); Tse = iso(x + s, y, h)
    for wx, wy, ww, wh in win:
        g.append(f'<g transform="matrix(0.866,0.5,0,1,{Tsw[0]:.1f},{Tsw[1]:.1f})">'
                 f'<rect x="{wx:.1f}" y="{wy:.1f}" width="{ww:.1f}" height="{wh:.1f}" fill="{GLY}" opacity="0.75"/></g>')
        g.append(f'<g transform="matrix(-0.866,0.5,0,1,{Tse[0]:.1f},{Tse[1]:.1f})">'
                 f'<rect x="{wx:.1f}" y="{wy:.1f}" width="{ww:.1f}" height="{wh:.1f}" fill="{GLY}" opacity="0.55"/></g>')
    return "".join(g)

# firewall: brick wall — narrow tall slab, brick courses with staggered joints
# on both visible faces, light coping on top (the classic Azure firewall shape)
def wall(x, y, rim=None, s=1.4, h=1.0):
    g = [plate(x, y, s)]
    bx, by, sx, sy = x + 0.05, y + 0.50, 1.30, 0.40
    top = [iso(bx, by, h), iso(bx + sx, by, h), iso(bx + sx, by + sy, h), iso(bx, by + sy, h)]
    sw = [iso(bx, by + sy, h), iso(bx + sx, by + sy, h), iso(bx + sx, by + sy, 0), iso(bx, by + sy, 0)]
    se = [iso(bx + sx, by, h), iso(bx + sx, by + sy, h), iso(bx + sx, by + sy, 0), iso(bx + sx, by, 0)]
    g.append(poly(sw, fill=FW1, stroke=EDGE, stroke_width=0.5))
    g.append(poly(se, fill=FW1, stroke=EDGE, stroke_width=0.5))
    g.append(poly(se, fill="#000000", opacity=0.22))            # SE shading pass
    g.append(poly(top, fill=TOPF, stroke=rim or A1, stroke_width=2.5))
    rows = 4; fh_ = h * U; rh = fh_ / rows
    Tsw = iso(bx, by + sy, h); Tse = iso(bx + sx, by, h)
    # each face's pattern is clipped to that face's own width: the long SW
    # face gets full bond, the narrow SE end gets courses only
    for (Tx, Ty), basis, fw_, joints in ((Tsw, "0.866", sx * U, True),
                                         (Tse, "-0.866", sy * U, False)):
        m = []
        for r_ in range(1, rows):                               # courses
            m.append(f'<line x1="0" y1="{r_ * rh:.1f}" x2="{fw_:.1f}" y2="{r_ * rh:.1f}" '
                     f'stroke="{FW2}" stroke-width="2"/>')
        if joints:
            bw_ = fw_ / 3.5
            for r_ in range(rows):                              # staggered joints
                jx = bw_ / 2 if r_ % 2 else bw_
                while jx < fw_ - 1:
                    m.append(f'<line x1="{jx:.1f}" y1="{r_ * rh:.1f}" x2="{jx:.1f}" '
                             f'y2="{(r_ + 1) * rh:.1f}" stroke="{FW2}" stroke-width="2"/>')
                    jx += bw_
        g.append(f'<g transform="matrix({basis},0.5,0,1,{Tx:.1f},{Ty:.1f})">{"".join(m)}</g>')
    return "".join(g)

# message queue: low long solid split into segments (dividers cross the top
# face and run down the SW face so the segmentation reads in 3D)
def queue(x, y, rim, s=1.4, h=0.5, segs=4):
    by, sy = y + 0.45, 0.5
    g = [plate(x, y, s), box(x, by, rim, None, sx=s, sy=sy, h=h, with_plate=False)]
    for i in range(1, segs):
        t = x + s * i / segs
        g.append(pline([iso(t, by, h), iso(t, by + sy, h)], stroke=SEF, stroke_width=1.8))
        g.append(pline([iso(t, by + sy, h), iso(t, by + sy, 0)], stroke=SEF, stroke_width=1.8))
    return "".join(g)

# blob/file storage (Azure Storage Account, S3-style bucket role): a stack of
# equal layers with seam lines between them — reads as "layered object store"
def store(x, y, rim, s=1.4, layers=3, lh=0.28):
    g = [plate(x, y, s)]
    for i in range(layers):
        z0, z1 = i * lh, (i + 1) * lh
        top = [iso(x, y, z1), iso(x + s, y, z1), iso(x + s, y + s, z1), iso(x, y + s, z1)]
        sw = [iso(x, y + s, z1), iso(x + s, y + s, z1), iso(x + s, y + s, z0), iso(x, y + s, z0)]
        se = [iso(x + s, y, z1), iso(x + s, y + s, z1), iso(x + s, y + s, z0), iso(x + s, y, z0)]
        g.append(poly(sw, fill=SWF, stroke=EDGE, stroke_width=0.5, opacity=0.98))
        g.append(poly(se, fill=SEF, stroke=EDGE, stroke_width=0.5, opacity=0.98))
        if i < layers - 1:   # seam: front top edges of this layer stay visible
            g.append(pline([iso(x, y + s, z1), iso(x + s, y + s, z1), iso(x + s, y, z1)],
                           stroke=EDGE, stroke_width=1.4, opacity=0.85))
        else:
            g.append(poly(top, fill=TOPF, stroke=rim, stroke_width=2.5))
    return "".join(g)

# ---- devices & people (billboard-ish real shapes) ----
def person(X, Y):
    return (f'<circle cx="{X:.1f}" cy="{Y-56:.1f}" r="7.5" fill="{INK}"/>'
            f'<path d="M {X-11:.1f} {Y-45:.1f} Q {X:.1f} {Y-51:.1f} {X+11:.1f} {Y-45:.1f} '
            f'L {X+11:.1f} {Y-24:.1f} Q {X+11:.1f} {Y-20:.1f} {X+7:.1f} {Y-20:.1f} '
            f'L {X+7:.1f} {Y:.1f} L {X+2:.1f} {Y:.1f} L {X+2:.1f} {Y-16:.1f} '
            f'L {X-2:.1f} {Y-16:.1f} L {X-2:.1f} {Y:.1f} L {X-7:.1f} {Y:.1f} '
            f'L {X-7:.1f} {Y-20:.1f} Q {X-11:.1f} {Y-20:.1f} {X-11:.1f} {Y-24:.1f} Z" fill="{INK}"/>')

# person holding a phone out (billboard, like the reference device-holders)
def person_device(X, Y):
    return (person(X, Y) +
            f'<path d="M {X+9:.1f} {Y-42:.1f} L {X+23:.1f} {Y-33:.1f}" stroke="{INK}" '
            f'stroke-width="5" stroke-linecap="round" fill="none"/>'
            f'<rect x="{X+20:.1f}" y="{Y-50:.1f}" width="9.5" height="15.5" rx="1.5" '
            f'fill="{SCR}" stroke="{BEZ}" stroke-width="1.6"/>')

def laptop(x, y, w=0.95, d=0.60, hb=0.07, hs=0.64):
    g = []
    sw = [iso(x, y + d, hb), iso(x + w, y + d, hb), iso(x + w, y + d, 0), iso(x, y + d, 0)]
    se = [iso(x + w, y, hb), iso(x + w, y + d, hb), iso(x + w, y + d, 0), iso(x + w, y, 0)]
    g.append(poly(sw, fill=SWF, stroke=EDGE, stroke_width=0.5))
    g.append(poly(se, fill=SEF, stroke=EDGE, stroke_width=0.5))
    g.append(poly(zrect(x, y, x + w, y + d, hb), fill=TOPF, stroke=EDGE, stroke_width=0.5))
    g.append(poly(zrect(x + 0.08, y + 0.10, x + w - 0.08, y + d - 0.12, hb), fill=KEYS))
    scr = [iso(x + 0.03, y + 0.05, hb), iso(x + w - 0.03, y + 0.05, hb),
           iso(x + w - 0.03, y - 0.10, hb + hs), iso(x + 0.03, y - 0.10, hb + hs)]
    g.append(poly(scr, fill=BEZ, stroke=EDGE, stroke_width=0.5))
    g.append(poly(inset(scr, 0.13), fill=SCR))
    return "".join(g)

# thin upright slab with screen on the SW face; z0 lifts it (monitor panels)
def screen_slab(x, y, w=0.34, d=0.10, h=0.72, z0=0.0, it=0.16):
    g = []
    sw = [iso(x, y + d, z0 + h), iso(x + w, y + d, z0 + h), iso(x + w, y + d, z0), iso(x, y + d, z0)]
    se = [iso(x + w, y, z0 + h), iso(x + w, y + d, z0 + h), iso(x + w, y + d, z0), iso(x + w, y, z0)]
    g.append(poly(se, fill=SEF, stroke=EDGE, stroke_width=0.5))
    g.append(poly(sw, fill=BEZ, stroke=EDGE, stroke_width=0.5))
    g.append(poly(zrect(x, y, x + w, y + d, z0 + h), fill=TOPF, stroke=EDGE, stroke_width=0.5))
    g.append(poly(inset(sw, it), fill=SCR))
    return "".join(g)

def phone(x, y, w=0.34, d=0.10, h=0.72):
    return screen_slab(x, y, w, d, h)

# upright browser-window billboard: bezel slab + title bar with dots + page lines
def browser(x, y, w=1.25, d=0.09, h=0.88):
    g = [screen_slab(x, y, w=w, d=d, h=h, it=0.06)]
    bar = [iso(x + 0.02, y + d, h - 0.03), iso(x + w - 0.02, y + d, h - 0.03),
           iso(x + w - 0.02, y + d, h - 0.17), iso(x + 0.02, y + d, h - 0.17)]
    g.append(poly(bar, fill=BBAR))
    for i in range(3):
        Dx, Dy = iso(x + 0.10 + i * 0.11, y + d, h - 0.10)
        g.append(f'<circle cx="{Dx:.1f}" cy="{Dy:.1f}" r="2.2" fill="{SCR}"/>')
    for z0, x1 in ((0.62, w - 0.14), (0.48, w - 0.30), (0.34, w - 0.50)):
        ln = [iso(x + 0.12, y + d, z0), iso(x + x1, y + d, z0),
              iso(x + x1, y + d, z0 - 0.07), iso(x + 0.12, y + d, z0 - 0.07)]
        g.append(poly(ln, fill=BLINE))
    return "".join(g)

# standalone 3D padlock: wide shallow body (not a cube — a cube reads as a
# building), then the shackle drawn ON TOP — it lives entirely above the body
# so nothing occludes it, and its legs must land visibly on the top face.
# Shackle depth is faked by sweeping the arch along the +y offset in layered
# passes (dark back copy -> mid sweep -> light front face) — a single flat
# stroke reads as 2D.
def padlock(x, y, rim, s=1.4):
    g = [plate(x, y, s)]
    bx, by, bw_, bd, bh = x + 0.20, y + 0.45, 1.0, 0.5, 0.78
    g.append(box(bx, by, rim, GLYPHS["entra"], sx=bw_, sy=bd, h=bh, gk=0.6, with_plate=False))
    sw_ = 0.66                                    # shackle span (grid units)
    th = 0.14                                     # extrusion depth along +y
    zt = bh + 0.62                                # arch top; legs end at body top
    yc = by + bd / 2 - th / 2                     # back plane of the swept bar
    Ax, Ay = iso(bx + (bw_ - sw_) / 2, yc, zt)
    W = sw_ * U; R = (W - 13) / 2; SH = 0.62 * U
    arch = (f'M 6.5 {SH:.0f} L 6.5 {R + 4:.0f} A {R:.0f} {R:.0f} 0 0 1 {W - 6.5:.0f} {R + 4:.0f} '
            f'L {W - 6.5:.0f} {SH:.0f}')
    dX, dY = -0.866 * th * U, 0.5 * th * U        # screen sweep vector for +y
    passes = ([(0.0, "#5d6579", 9.0)] +                                   # back edge
              [(i / 10, "#8b93a8", 8.5) for i in range(11)] +             # solid sweep
              [(1.0, "#bfc7d4", 6.5)])                                    # lit front face
    for t, col, wd in passes:
        g.append(f'<g transform="translate({dX * t:.1f},{dY * t:.1f})">'
                 f'<g transform="matrix(0.866,0.5,0,1,{Ax:.1f},{Ay:.1f})">'
                 f'<path d="{arch}" fill="none" stroke="{col}" stroke-width="{wd}"/></g></g>')
    return "".join(g)

def monitor(x, y):
    # screen, neck, and foot share one iso center axis (u = x-y constant)
    g = [screen_slab(x + 0.06, y + 0.16, w=1.16, d=0.08, h=0.78, z0=0.34, it=0.12)]
    g.append(box(x + 0.67, y + 0.23, EDGE, None, s=0.22, h=0.36, with_plate=False))
    g.append(box(x + 0.75, y + 0.31, EDGE, None, s=0.5, h=0.06, with_plate=False))
    return "".join(g)

# end users: person silhouette + laptop + phone sharing one plate
def users(x, y, s=1.4):
    g = [plate(x, y, s)]
    Xp, Yp = iso(x + 0.40, y + 0.40)
    g.append(person(Xp, Yp))
    g.append(phone(x + 1.02, y + 0.16))
    g.append(laptop(x + 0.16, y + 0.70))
    return "".join(g)

# ---- unit registry: place by name on whole grid cells, connect by name ----
# Units SNAP to the grid: positions are integer cell coords and every unit
# occupies a whole-cell footprint (default 2x2; `cells=(w,d)` overrides).
# The shape is centered inside its cell block, overlapping footprints are a
# hard error, and flow endpoints land exactly on grid lines.
# Edge names are grid axes: "-x" (screen upper-left edge), "+x" (lower-right),
# "-y" (upper-right), "+y" (lower-left).
_UNITS = {}
PLATE_M = 0.22          # plate outer-edge margin beyond the unit footprint

def reset_units(): _UNITS.clear()

def unit(name, fn, x, y, s=1.4, cells=None, **kw):
    if not (float(x).is_integer() and float(y).is_integer()):
        raise ValueError(f"unit {name!r}: position must snap to grid cells, got ({x}, {y})")
    w, d = cells or (2, 2)
    if s + 2 * PLATE_M > min(w, d):
        raise ValueError(f"unit {name!r}: shape (s={s} + plate) exceeds its {w}x{d} cells")
    rect = (int(x), int(y), int(x) + w, int(y) + d)
    for other, (_, _, _, _, _, r) in _UNITS.items():
        if not (rect[2] <= r[0] or r[2] <= rect[0] or rect[3] <= r[1] or r[3] <= rect[1]):
            raise ValueError(f"unit {name!r} at {rect} overlaps {other!r} at {r}")
    dx = x + (w - s) / 2; dy = y + (d - s) / 2      # shape centered in its cells
    _UNITS[name] = (fn, dx, dy, s, kw, rect)

def render_units():
    return "".join(fn(x, y, **kw)
                   for fn, x, y, s, kw, _ in sorted(_UNITS.values(), key=lambda u: u[1] + u[2]))

def edge_pt(name, side, t=0.5):
    _, _, _, _, _, (x0, y0, x1, y1) = _UNITS[name]  # cell rect: endpoints on grid lines
    if side == "-x": return (x0, y0 + (y1 - y0) * t)
    if side == "+x": return (x1, y0 + (y1 - y0) * t)
    if side == "-y": return (x0 + (x1 - x0) * t, y0)
    if side == "+y": return (x0 + (x1 - x0) * t, y1)
    raise ValueError(side)

def _center(name):
    _, _, _, _, _, (x0, y0, x1, y1) = _UNITS[name]
    return ((x0 + x1) / 2, (y0 + y1) / 2)

STYLES = {"request": dict(width=2.5),
          "data":    dict(width=1.8, dashed=True, dot=True),
          "sync":    dict(width=1.6, heads="both")}

def connect(a, b, exit=None, enter=None, via=None, style="request", color=None, **fkw):
    (ax, ay), (bx, by) = _center(a), _center(b)
    dx, dy = bx - ax, by - ay
    if exit is None:  exit = ("+x" if dx > 0 else "-x") if abs(dx) >= abs(dy) else ("+y" if dy > 0 else "-y")
    if enter is None: enter = ("-x" if dx > 0 else "+x") if abs(dx) >= abs(dy) else ("-y" if dy > 0 else "+y")
    p0 = edge_pt(a, *exit) if isinstance(exit, tuple) else edge_pt(a, exit)
    p1 = edge_pt(b, *enter) if isinstance(enter, tuple) else edge_pt(b, enter)
    pts_ = [p0] + list(via or []) + [p1]
    if via is None and abs(p0[0] - p1[0]) > 1e-9 and abs(p0[1] - p1[1]) > 1e-9:
        ex = exit[0] if isinstance(exit, tuple) else exit          # L-route: leave along the exit axis
        pts_ = [p0, ((p1[0], p0[1]) if ex in ("-x", "+x") else (p0[0], p1[1])), p1]
    kw = dict(STYLES[style]); kw.update(fkw)
    return flow(pts_, color or (FLOW2 if style == "data" else FLOW), **kw)

# ---- narrative ----
# typical unit heights for silhouette estimation (kw "h" overrides)
_DEF_H = {"box": 0.95, "cyl": 1.25, "rack": 1.15, "building": 2.3,
          "padlock": 1.6, "users": 1.3, "slab": 0.22, "panel": 0.12,
          "wall": 1.0, "queue": 0.5, "store": 0.84}

def _hull(points):
    pts_ = sorted(set(points))
    def half(ps):
        h = []
        for p in ps:
            while len(h) >= 2 and ((h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) -
                                   (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0])) <= 0:
                h.pop()
            h.append(p)
        return h
    lo = half(pts_); hi = half(pts_[::-1])
    return lo[:-1] + hi[:-1]

def _silhouette(name):
    """Screen-space convex outline of a unit: plate corners on the ground plus
    footprint corners at the unit's height — what the shape visually occupies,
    which is far more than its ground rect for tall shapes."""
    fn, x, y, s, kw, _ = _UNITS[name]
    h = kw.get("h", _DEF_H.get(fn.__name__, 1.0))
    m = PLATE_M
    return _hull([iso(x - m, y - m), iso(x + s + m, y - m),
                  iso(x + s + m, y + s + m), iso(x - m, y + s + m),
                  iso(x, y, h), iso(x + s, y, h), iso(x + s, y + s, h), iso(x, y + s, h)])

def chip(n, x, y, to=None, gap=5.0):
    """Numbered marker. to = unit name or (gx, gy): grows a pointer tail
    from the circle toward what it labels (Azure-style pin, not a bare dot).
    The authored position sets only the approach direction; the chip slides
    along that ray so the tip sits exactly `gap` px off the unit's screen
    silhouette (plate + solid), however close or far it was authored."""
    X, Y = iso(x, y)
    g = []
    if to is not None:
        if isinstance(to, str):
            hull = _silhouette(to)
            TX = sum(p[0] for p in hull) / len(hull)
            TY = sum(p[1] for p in hull) / len(hull)
            dx, dy = TX - X, TY - Y
            t_hit = None                    # first crossing of ray A->centroid with the hull
            for i in range(len(hull)):
                (px, py), (qx, qy) = hull[i], hull[(i + 1) % len(hull)]
                ex, ey = qx - px, qy - py
                den = dx * ey - dy * ex     # cross(d, e)
                if abs(den) < 1e-9: continue
                t_ = ((px - X) * ey - (py - Y) * ex) / den   # cross(P-A, e)/cross(d, e)
                s_ = ((px - X) * dy - (py - Y) * dx) / den   # cross(P-A, d)/cross(d, e)
                if t_ > 1e-9 and -1e-6 <= s_ <= 1 + 1e-6:
                    if t_hit is None or t_ < t_hit: t_hit = t_
            t_hit = t_hit if t_hit is not None else 1.0
            TX, TY = X + dx * t_hit, Y + dy * t_hit
        else:
            TX, TY = iso(*to)
        dx, dy = TX - X, TY - Y
        L = (dx * dx + dy * dy) ** 0.5 or 1.0
        ux, uy = dx / L, dy / L
        a = math.atan2(uy, ux)
        # auto-snap: authored position sets only the DIRECTION; the chip
        # slides along that ray so the tip sits exactly `gap` px off the edge
        tip = (TX - ux * gap, TY - uy * gap)
        X, Y = tip[0] - ux * 19, tip[1] - uy * 19
        b1 = (X + 9.5 * math.cos(a + 0.55), Y + 9.5 * math.sin(a + 0.55))
        b2 = (X + 9.5 * math.cos(a - 0.55), Y + 9.5 * math.sin(a - 0.55))
        g.append(poly([tip, b1, b2], fill=A1))
    g.append(f'<circle cx="{X:.0f}" cy="{Y:.0f}" r="11" fill="{A1}"/>')
    g.append(f'<text x="{X:.0f}" y="{Y + 4:.0f}" font-family={MONO!r} font-size="12" font-weight="700" '
             f'fill="#ffffff" text-anchor="middle">{n}</text>')
    return "".join(g)

# One declaration per annotated unit drives BOTH its numbered chip and its
# legend entry — numbers are assigned in declaration order, so chips and the
# legend can never fall out of sync (they used to be three hand-synced pieces).
_ANNOTS = []

def annotate(name, title, desc, approach):
    """Register unit `name` for annotation: chip approaching from grid point
    `approach`, legend entry (title, desc). Declaration order = number order."""
    if name not in _UNITS:
        raise ValueError(f"annotate {name!r}: no such unit — declare unit() first")
    if any(n == name for n, *_ in _ANNOTS):
        raise ValueError(f"annotate {name!r}: unit already annotated")
    _ANNOTS.append((name, title, desc, approach))

def annotations(footer=None, x=1054, w=346):
    """Emit every annotated unit's chip plus the matching legend rail."""
    g = [chip(i, ax, ay, to=name)
         for i, (name, _, _, (ax, ay)) in enumerate(_ANNOTS, 1)]
    g.append(legend([(t, d) for _, t, d, _ in _ANNOTS], footer=footer, x=x, w=w))
    return "".join(g)

def wrap(s, w=34):
    out, line = [], ""
    for word in s.split():
        if len(line) + len(word) + 1 > w: out.append(line); line = word
        else: line = (line + " " + word).strip()
    out.append(line); return out

# Numbered legend rail down the right edge. Layout is computed here, and the
# content extent is checked against the canvas height captured by svg_open() —
# an entry that would render past the bottom is a hard error, not a silent clip.
def legend(entries, footer=None, x=1054, w=346):
    g = [f'<rect x="{x}" y="0" width="{w}" height="{_CANVAS_H}" fill="{RAIL}"/>',
         f'<text x="{x + 32}" y="48" font-family={MONO!r} font-size="13" font-weight="700" '
         f'fill="{INK2}" letter-spacing="4">LEGEND</text>']
    y = 76
    for i, (t, d) in enumerate(entries, 1):
        g.append(f'<circle cx="{x + 32}" cy="{y}" r="11" fill="{A1}"/>')
        g.append(f'<text x="{x + 32}" y="{y + 4}" font-family={MONO!r} font-size="12" '
                 f'font-weight="700" fill="#ffffff" text-anchor="middle">{i}</text>')
        g.append(f'<text x="{x + 56}" y="{y + 4}" font-family={MONO!r} font-size="13.5" '
                 f'font-weight="700" fill="{INK}">{t}</text>')
        yy = y + 20
        for ln in wrap(d):
            g.append(f'<text x="{x + 56}" y="{yy}" font-family={MONO!r} font-size="11.5" '
                     f'fill="{INK2}">{ln}</text>'); yy += 15
        y = yy + 20
    bottom = y - 20
    if footer:
        bottom = y + 8
        g.append(f'<text x="{x + 32}" y="{bottom}" font-family={MONO!r} font-size="10.5" '
                 f'fill="{INK2}">{footer}</text>')
    if bottom > _CANVAS_H - 16:
        raise ValueError(f"legend content reaches y={bottom} on a {_CANVAS_H}px canvas "
                         "(needs 16px margin) — shorten/drop entries or open a taller canvas")
    return "".join(g)

def out(name):
    """Resolve an output path for `name`: $ISOKIT_OUT if set, else the first
    `isokit.local` file found walking up from cwd (its first line = output
    dir), else ./out. The directory is created if missing."""
    d = os.environ.get("ISOKIT_OUT")
    if not d:
        p = os.getcwd()
        while True:
            f = os.path.join(p, "isokit.local")
            if os.path.exists(f):
                d = open(f).read().strip(); break
            parent = os.path.dirname(p)
            if parent == p: break
            p = parent
    d = os.path.expanduser(d or os.path.join(os.getcwd(), "out"))
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, name)

def write(path, parts):
    open(path, "w").write("\n".join(parts + ["</svg>"]))
    ok = subprocess.run(["xmllint", "--noout", path]).returncode == 0
    print("valid" if ok else "INVALID", os.path.getsize(path) // 1024, "KB", path)
