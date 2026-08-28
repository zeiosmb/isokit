# isokit — Isometric Diagram Grammar

The authoritative rules for generating diagrams with this library. Written for both humans and AI agents authoring layouts. Corrections to visual output get ratcheted into this file — and into enforcement code in `src/isokit.ts` where possible — never applied as one-off fixes.

## The target grammar

The style is the **Azure isometric blueprint / marketing style** (canonical references: SlideModel's Azure isometric sheet and Microsoft's 2015 Azure 3D blueprint art):

- Isometric projection on a gridded ground; components sit on the grid as extruded tiles/cubes.
- Tiers/zones as overlapping *translucent* planes — depth via stacked-glass layering, not borders.
- Zone boundaries as thin light diamond outlines; zone labels set along the iso axes.
- Flow arrows route along grid axes only (iso right angles), one hue per flow type.
- Numbered pointer chips in a single accent color keyed to a high-contrast legend rail *outside* the canvas — narrative lives in the rail, not in-diagram clutter.
- Restraint: roughly two grounds + white + one or two accents does everything.

## Machinery

The library is `src/isokit.ts` (projection, planes, flows, plates, glyphs, and shapes: box/slab/panel/cyl/rack/building/padlock/wall (brick firewall)/queue/store (layered blob/object storage)/browser/monitor/laptop/phone/person/personDevice/users). It is **themeable**: `THEMES` holds full token sets ("blueprint" dark-navy, "azure" marketing-blue with gold rims + pale-green flows); `setTheme(name)` swaps every token and rebuilds `GLYPHS`. Theme tokens are ESM live bindings, so import order relative to `setTheme()` does not matter (the Python prototype's from-import ordering gotcha is gone) — but isokit functions still must not use theme tokens as declaration-time default values (they freeze the theme; use null sentinels resolved at call time — shipped once). `plane(..., z=H)` floats a grouping sheet with dashed corner posts (reference-style raised tier).

New diagrams = a layout script using the **unit registry**: `unit(name, shapeFn, x, y, {...kw})` places components by name — positions **snap to the grid** (integer cell coords enforced with a hard error), every unit occupies a whole-cell footprint (default 2×2, `cells: [w, d]` overrides), the shape is auto-centered inside its cell block, and **overlapping footprints are a hard error** (touching edges are fine). `connect(a, b, {exit, enter, via: [...], style: "request"|"data"|"sync"})` draws flows by name — endpoints land on the cell rect, i.e. exactly on grid lines (`edgePt`, sides `"-x"/"+x"/"-y"/"+y"` with an optional `t` along the edge, auto-picked from the dominant center delta when omitted), with an axis-aligned L-route when no `via` is given and the in-plane arrowhead computed; `renderUnits()` emits everything in painter's order. Mermaid's connect-by-name ergonomics with grid-snapped positioning, no string DSL — layouts stay plain TypeScript.

Flow semantics follow the reference's two-weight system: solid single-head = request/control (`style="request"`), thin double-headed = bidirectional control (`style="sync"`), dashed with origin dot = data run (`style="data"`).

Exemplar layouts: `layouts/azure_lob.ts` (Blueprint theme, gold standard), `layouts/hybrid_onprem_azure.ts` (Azure theme, hybrid on-prem topology, ground seam as network boundary), `layouts/components.ts` (full shape vocabulary).

## Projection model

Grid coords (x right-down, y left-down, z up); `X = OX + (x−y)·0.866·U`, `Y = OY + (x+y)·0.5·U − z·U`. Plane-lying text/glyphs use full affine shears:

- ground/top plane, baseline along +x: `matrix(0.866, 0.5, -0.866, 0.5, X, Y)`
- ground plane, baseline along −y: `matrix(0.866, -0.5, 0.866, 0.5, X, Y)`
- SW face (no mirror): `matrix(0.866, 0.5, 0, 1, X, Y)`
- SE face (mirrored basis, rects only): `matrix(-0.866, 0.5, 0, 1, X, Y)`

## Hard-won rules

- Plane-lying text needs the full affine shear, NOT a screen rotation.
- With this projection, the **visible faces of an iso cube are top + y-max + x-max**. Drawing a min-coordinate (back) face instead produces an L-shaped shell that reads as a hollow "L platform" — units must be closed solids (shipped once).
- Iso cylinder ellipse: `rx = 1.2247·r·U`, `ry = 0.577·rx` (tan 30°) — halving ry looks subtly squashed.
- Arrowheads must lie **in the ground plane**: build the head as a grid-space triangle at the flow's end (tip on the target edge, base at tip−dir·0.42, half-width 0.21), project through `iso()`, and shorten the shaft to the head base. SVG `marker` elements are screen-space and always look wrong.
- Icon decal on a cube's y-max face: `<g transform="matrix(0.866,0.5,0,1,Tx,Ty)">` anchored at `iso(x, y+s, h)`. The x-max face would need a mirrored basis — use the y-max face for glyphs.
- **Shape anatomy:** solids are LIGHT gray (near-white top, mid SW, darker SE) with the role-colored rim stroking the *top face only* — dark solids read as generic boxes, light-with-rim reads as Azure. Shape marks are flat dark glyphs drawn ON the shape, never full-color product icons pasted on faces — those read as stickers. Cylinder: gradient body, thick rim ring, ~square silhouette (r=0.5, h=1.25 tiles). Devices are real shapes (laptop = base slab + tilted screen slab; phone = thin upright slab); people = flat light-ink silhouettes. Glyphs must survive the shear at face size — use bold strokes (≥3.5 in a 40-box) and big heads; thin zigzags turn to scribble.
- Text/labels on a shape face must be projected into the surface, never left screen-flat. On a **curved** surface a single flat shear is also wrong: wrap it per-glyph. Cylinder recipe: glyph i at azimuth `t` (t=0 faces viewer), screen anchor `(Xc + rx·sin t, Yc0 + ry·cos t)`, transform `matrix(cos t, −(ry/rx)·sin t, 0, 1, X, Y)`; advance per char along the surface = `font-size·0.6` (JetBrains Mono); center the run at `t = −π/4`, the azimuth whose tangent equals the SW-face shear — so cylinder labels face SW like every box-face glyph. `t = 0` reads as inconsistent; an arbitrary off-center t reads as left-aligned.
- Ground grid lines must survive the translucent grouping planes laid over them: line opacity 0.22 (0.12 vanished under a 0.07 plane fill). The ground can carry a **two-tone seam** (`grid({seam: ["x"|"y", coord]})`); the seam coordinate must be an **integer** so the edge lands exactly on a grid line — enforced with a hard error.
- Chips and legend come from ONE declaration: `annotate(unit, title, desc, [x, y])` once per unit, then `annotations({footer})` emits every chip AND the legend rail, numbered in declaration order. Never author chip numbers or legend entries separately — desync is silent. Unknown unit or double annotation is a hard error.
- Legend rails come from `legend(entries, {footer})` (used by `annotations()`; direct use only for non-unit entries), never hand-rolled: it owns spacing metrics, wraps descriptions, and checks content extent against the canvas height captured by `svgOpen()` — overflow is a hard error instead of a silent clip.
- Flows are axis-locked and `flow()` enforces it: every segment (including `via` waypoints) must run along exactly one grid axis or it is a hard error. A grid diagonal renders at a non-isometric screen angle (a `(1,−1)` diagonal comes out screen-horizontal) and breaks the projection illusion.
- Units snap to the grid — integer cell coordinates, whole-cell footprints (default 2×2, `cells: [w, d]` for bigger shapes), shape auto-centered in its block. Overlapping footprints are a hard error (touching edges are fine). Flow endpoints computed from the cell rect land exactly on grid lines.
- Numbered chips are pointers, not dots: `chip(n, x, y, to="unit")` (authored via `annotate()`, not called directly) draws a pin tail aimed at the unit. The authored position sets only the approach direction — the chip auto-slides along that ray so the tip stops a consistent 5px off the unit's **screen silhouette** (convex hull of plate corners + top-face corners at the unit's height). Author the approach from a side clear of *other* units; the snap only knows the target's silhouette.
- Draw units in painter's order sorted by `x+y`; route flow lanes and place labels clear of cube *screen projections* (tops occlude far more than their footprint).
- SE-face decals (rack fins, building windows) use the mirrored basis anchored at `iso(x+s, y, h)` — local x stays POSITIVE; negating it detaches the decal into mid-air (shipped once). Text can't use this face (it would mirror); rects are fine. Each face's pattern must be sized to **that face's own width** — reusing the long face's width on a narrow end face spills strays past the silhouette (firewall bricks shipped this way once).
- Fake extrusion for in-plane stroked shapes (padlock shackle, any bar/pipe/arc): sweep the same path in dense steps (~11) along the screen-projected normal offset `(-0.866·t·U, 0.5·t·U)` in a mid tone, then a dark back-edge pass and a lighter front-face pass. A single flat stroke reads as 2D; coarse steps read as comb teeth. Anything mounted on another solid draws AFTER the body if it lives entirely above it, with contact points landing visibly on the face.
- Verify by rendering with headless Chromium (`--headless=new --screenshot=... --window-size=WxH file://...`) and reading the PNG. When a placement looks wrong, **measure pixels or render a debug frame** before "fixing" it — a correctly sheared decal was nearly broken twice on eyeball evidence.
