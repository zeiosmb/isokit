# Chip hover tooltips + legend collapsed by default

Status: designed 2026-09-01, not started. Tracked in [ROADMAP.md](../../../ROADMAP.md) §Planned.

## Goal

Hovering a numbered chip in an interactive render shows that annotation's legend entry (title + description) as a styled tooltip, and the interactive legend starts collapsed. The tooltips carry the information, so the rail stops earning its default screen share — the two changes only make sense shipped together.

## Single source of truth

Tooltip content and visual styling both live in the renderer (`src/isokit.ts`), generated once into the SVG. Each runtime adds only a ~10-line show/hide hover handler — the same deliberate two-runtime duplication the pan/zoom/legend-collapse viewBox math already lives with (see CLAUDE.md "Parallel implementations to keep in sync").

## Renderer side (`src/isokit.ts`)

- Wrap each chip's output (currently bare `<circle>`/`<rect>` + `<text>` + tail polygon in `chip()`) in `<g class="isokit-chip" data-n="3" style="cursor:default">`, giving runtimes a hover target covering the whole bubble and tail.
- For each annotation, `annotations()` emits a pre-rendered, hidden tooltip group: `<g class="isokit-tip" data-for="3" visibility="hidden">` containing a rounded rect plus the entry's title and word-wrapped description — reusing the existing `wrap()` helper and the legend's typography and colors, positioned adjacent to its chip and clamped to the canvas at generation time. Because the tooltip is drawn by the core, it automatically matches the diagram's style and stays consistent between the two runtimes with zero styling code in either.
- Hidden tooltips are exempt from collision checks: overlaying the diagram is the point of a tooltip.

## Runtime side (both files, kept in sync)

- `src/interactive.ts` (RUNTIME_JS): `pointerover`/`pointerout` on each `.isokit-chip`, toggling the matching `.isokit-tip`'s visibility and re-appending it so it paints last (SVG paint order). Optionally counter-scale with zoom using the same HUD re-anchoring trick the control buttons use.
- `obsidian/main.ts` (`addInteraction()`): the same handler. Obsidian never executes SVG-embedded scripts (the SVG arrives via DOMParser + appendChild), so the plugin cannot ride on RUNTIME_JS — both runtimes need the handler.

## Legend collapsed by default

In both runtimes, extract the current legend-toggle body into an `applyLegend(hidden)` function and call it once with `hidden = true` at init: legend `display: none`, `base = collapsed`, SVG width minus `RAIL_W`, button glyph `«`. The existing toggle button then expands it on demand.

## Degradation

Static SVG with no JS (GitHub preview, image export, any non-script host): tooltips stay hidden, legend stays visible — byte-for-byte the same *visual* result as today. There is no other way to read the annotations in those contexts, so the legend must remain expanded there.

## Costs and workflow

- Every golden SVG changes bytes (chip `<g>` wrappers + embedded tooltip groups): deliberate golden regeneration, visual verification first, per the golden policy.
- Rebuild `examples/interactive/` and the Obsidian bundle; copy `obsidian/main.js` + `obsidian/styles.css` into the live vault.
- New/extended tests: tooltip groups present and hidden in rendered output, chip wrapper structure, and the runtime toggle logic in `tests/obsidian.ts`'s unit-tested viewBox math where applicable.
