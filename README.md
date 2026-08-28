# isokit

A guarded generator for Azure-marketing-style isometric architecture diagrams, rendered as self-contained SVG (embedded fonts, no runtime dependencies).

Diagrams are plain-Python layout scripts against a declarative registry: place named units on a snapped grid, connect them by name, annotate them once — the library derives plate edges, flow routes, arrowheads, numbered pointer chips, and the legend rail. Invariants that make diagrams look right are *enforced*, not documented: violating one fails generation instead of shipping a subtly broken render.

## Usage

```bash
python3 layouts/hybrid_onprem_azure.py
```

Each layout script writes one SVG. Output directory resolution: `$ISOKIT_OUT` if set, else the first `isokit.local` file found walking up from the working directory (first line = output dir), else `./out/`.

A minimal layout:

```python
from isokit import set_theme; set_theme("azure")   # BEFORE from-importing color names
from isokit import (configure, out, grid, svg_open, write, box, cyl, GLYPHS,
                    unit, connect, annotate, annotations, render_units, A2, A3)

configure(u=46, ox=440, oy=48)
S = svg_open(1400, 700)
S.append(grid())

unit("app", box, 5, 2, rim=A2, glyph=GLYPHS["app"])   # integer cell coords; 2x2 cells
unit("db",  cyl, 5, 6, rim=A3)
S.append(connect("app", "db"))                         # auto edge points + L-route
S.append(render_units())

annotate("app", "App Service", "serves the workload.", (3.5, 1.5))
annotate("db",  "Azure SQL",   "system of record.",    (3.5, 7.5))
S.append(annotations())

write(out("Minimal.svg"), S)
```

## What's enforced

- Unit positions snap to integer grid cells; every unit owns a whole-cell footprint (default 2×2, `cells=(w, d)` to override); overlapping footprints are an error.
- Flow routes are axis-locked — any diagonal segment (including hand-authored `via` waypoints) is an error, because it renders at a non-isometric angle.
- Ground-seam coordinates must land exactly on a grid line.
- Chips and legend come from one `annotate()` declaration per unit — they cannot desync.
- Legend content is measured against the canvas and errors instead of clipping.

## Layout vocabulary

Shapes: `box` (service cube with face glyph), `cyl` (database drum with curved label), `rack`, `building`, `wall` (brick firewall), `queue`, `store` (layered blob storage), `slab`, `panel`, `padlock`, `users`, plus device billboards (`laptop`, `monitor`, `phone`, `browser`, `person`). Grouping: translucent `plane()` sheets (optionally raised on posts with `z=`), two-tone ground seam, plane-projected labels. Themes: `blueprint` (dark navy) and `azure` (marketing blues); `set_theme()` swaps every token.

The full grammar — projection math, face shears, shape anatomy, and every hard-won rule — lives in [STYLE.md](STYLE.md). Read it before writing or modifying a layout; corrections get ratcheted into it (and into enforcement code where possible), never applied as one-offs.

Project goals, the candidate end state (mermaid.live-style static web app with URL-encoded diagrams and a published agent spec), and the phased path there are in [ROADMAP.md](ROADMAP.md).

## Layouts in this repo

| Script | Output | Notes |
| --- | --- | --- |
| `layouts/azure_lob.py` | Azure Isometric.svg | Gold-standard exemplar, Blueprint theme |
| `layouts/hybrid_onprem_azure.py` | Hybrid OnPrem Azure.svg | Azure theme, on-prem boundary via ground seam |
| `layouts/components.py` | Isometric Components.svg | The full shape vocabulary on plates |
