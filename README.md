# isokit

A guarded generator for Azure-marketing-style isometric architecture diagrams, rendered as self-contained SVG (embedded fonts, no runtime dependencies).

Designed to be driven by an AI agent in conversation: you describe the architecture and critique the renders; the agent authors the layout script against the in-repo grammar ([STYLE.md](STYLE.md)). Published specs — a stable-URL document any agent can be pointed at — are coming ([ROADMAP.md](ROADMAP.md), Phase 4) so agents can cleanly and sensibly generate diagrams from the user's instructions without cloning this repo.

Diagrams are plain-TypeScript layout scripts against a declarative registry: place named units on a snapped grid, connect them by name, annotate them once — the library derives plate edges, flow routes, arrowheads, numbered pointer chips, and the legend rail. Invariants that make diagrams look right are *enforced*, not documented: violating one fails generation instead of shipping a subtly broken render.

## Why an agent, not another auto-layout DSL?

Auto-layout tools solve topology legibility — don't overlap nodes, route edges sanely — which is why their output all looks the same. isokit targets a presentation-grade visual style where quality lives in placement judgment: which side an annotation should approach from, where a label reads clearly, how a flow should enter a face. No layout algorithm optimizes for that, but an agent reading a style guide can, and a human can direct it by critique ("this arrow points along the shape, not at it") instead of by learning a DSL. The renderer's job is everything *checkable*: hard errors on grid violations, collisions, and overflow give the agent a floor it cannot fall through, and error messages are written as turns in a conversation so it can self-correct without eyes. Auto-placement ([ROADMAP.md](ROADMAP.md), Phase 2) keeps raising that floor; the judgment loop stays.

## Usage

Requires Node ≥ 23.6 (runs TypeScript directly via native type stripping — no build step).

```bash
node layouts/hybrid_onprem_azure.ts
```

Each layout script writes one SVG. Output directory resolution: `$ISOKIT_OUT` if set, else the first `isokit.local` file found walking up from the working directory (first line = output dir), else `./out/`.

A minimal layout:

```typescript
import { setTheme, configure, out, grid, svgOpen, write, box, cyl, GLYPHS,
         unit, connect, annotate, annotations, renderUnits, A2, A3 } from "../src/isokit.ts";
setTheme("azure");   // theme tokens are live bindings — order vs. imports doesn't matter

configure(46, 440, 48);
const S = svgOpen(1400, 700);
S.push(grid());

unit("app", box, 5, 2, { rim: A2, glyph: GLYPHS["app"] });  // integer cell coords; 2x2 cells
unit("db",  cyl, 5, 6, { rim: A3 });
S.push(connect("app", "db"));                               // auto edge points + L-route
S.push(renderUnits());

annotate("app", "App Service", "serves the workload.", [3.5, 1.5]);
annotate("db",  "Azure SQL",   "system of record.",    [3.5, 7.5]);
S.push(annotations());

write(out("Minimal.svg"), S);
```

## What's enforced

- Unit positions snap to integer grid cells; every unit owns a whole-cell footprint (default 2×2, `cells: [w, d]` to override); overlapping footprints are an error.
- Flow routes are axis-locked — any diagonal segment (including hand-authored `via` waypoints) is an error, because it renders at a non-isometric angle.
- Ground-seam coordinates must land exactly on a grid line.
- Chips and legend come from one `annotate()` declaration per unit — they cannot desync.
- Legend content is measured against the canvas and errors instead of clipping.
- Plane labels are collision-checked: a label whose text intersects a unit's screen silhouette or a flow route fails generation instead of shipping overlapping ink.

## Layout vocabulary

Shapes: `box` (service cube with face glyph), `cyl` (database drum with curved label), `rack`, `building`, `wall` (brick firewall), `queue`, `store` (layered blob storage), `slab`, `panel`, `padlock`, `users`, plus device billboards (`laptop`, `monitor`, `phone`, `browser`, `person`). Grouping: translucent `plane()` sheets (optionally raised on posts with a `z` argument), two-tone ground seam, plane-projected labels. Themes: `blueprint` (dark navy) and `azure` (marketing blues); `setTheme()` swaps every token.

The full grammar — projection math, face shears, shape anatomy, and every hard-won rule — lives in [STYLE.md](STYLE.md). Read it before writing or modifying a layout; corrections get ratcheted into it (and into enforcement code where possible), never applied as one-offs.

Project goals, the candidate end state (mermaid.live-style static web app with URL-encoded diagrams and a published agent spec), and the phased path there are in [ROADMAP.md](ROADMAP.md).

## Tests

```bash
npm test
```

Runs four suites: `tests/pyfmt.ts` (float formatting vs. a CPython oracle), `tests/errors.ts` (every enforced guard), `tests/collisions.ts` (the label collision check and chip-snap geometry), and `tests/check-golden.sh` (byte-compares every layout's render against `tests/golden/`).

Golden policy: the goldens' job is to make every rendering change *deliberate*, not to freeze output. Unintended byte drift (a refactor that changes formatting, a theme-token accident) fails loudly; when output changes on purpose (new enforcement, renderer fixes, layout edits), the affected goldens are regenerated after visual verification and the diff is the review artifact. They began as Python-prototype output (commit `2f46dd2`) that verified the TypeScript port byte-identical.

## Layouts in this repo

| Script | Output | Notes |
| --- | --- | --- |
| `layouts/azure_lob.ts` | Azure Isometric.svg | Gold-standard exemplar, Blueprint theme |
| `layouts/hybrid_onprem_azure.ts` | Hybrid OnPrem Azure.svg | Azure theme, on-prem boundary via ground seam |
| `layouts/components.ts` | Isometric Components.svg | The full shape vocabulary on plates |
| `layouts/collision_gauntlet.ts` | Collision Gauntlet.svg | Every label tuned steps inside the collision-check boundary — regression fixture for the check's geometry |
| `layouts/glossary.ts` | Diagram Glossary.svg | Every part of a diagram, named and pointed at (uses direct `chip()`/`legend()` for non-unit entries) |
| `layouts/chip_scale.ts` | Chip Scale Demo.svg | Chip numbers 0–9999: pill growth, tip alignment, legend column alignment — regression fixture |

## History

isokit was prototyped in Python (~680 lines, pure stdlib) and ported 1:1 to TypeScript on 2026-08-28 — the port was verified byte-identical via the golden masters before the Python was removed. The prototype lives at commit `2f46dd2` (`src/isokit/__init__.py`).
