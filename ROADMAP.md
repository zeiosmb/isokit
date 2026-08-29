# isokit — Goals, End State, and Path

Status of this document: the near-term goals and sequencing are settled; the end state is a working theory, not a commitment. Decision signals for firming it up are listed at the bottom. Last updated 2026-08-28.

## Goals

1. **Primary (today):** generate deliverable-grade Azure-style isometric architecture diagrams via an AI agent conversation. The human describes topology and critiques renders; the agent authors layout scripts against this library. The current mode of use — and it stays supported in every future.
2. **Quality is enforced, not documented.** Every rule that makes a diagram look right should be a hard generation error when violated (grid snap, footprint overlap, axis-locked flows, chip/legend sync, legend overflow — all shipped). The renderer owns the quality floor so output quality does not depend on who or what is driving.
3. **Forward-looking:** other people can produce and share diagrams without cloning source or having a specific AI setup.

## End state (working theory)

A **mermaid.live-style static web app** plus a **published spec written for AI agents**:

- **Agent-authored, human-editable text format** — a semantic YAML (units, groups, flows, annotations; no coordinates in the common case). The primary author is an AI agent working from the published spec; the format stays simple enough that a human can read and tweak it the way humans edit mermaid, but hand-authoring from scratch is a supported fallback, not the design center.
- **Shareable by URL** — the diagram definition is deflate+base64 encoded in the URL *fragment* (never sent to a server), so the link is simultaneously the document, the render, and the share. No backend, no accounts, no storage.
- **Static, in-browser rendering** — the TypeScript renderer runs natively in the browser as a small JS bundle (no WASM, no Pyodide, instant load). Hostable anywhere static files can live; nothing to install.
- **Published agent spec** — a single stable-URL document (llms.txt-style: format spec, invariants, few-shot exemplars, common failure modes) so any AI agent, pointed at one link, can author a valid diagram. Renderer errors are written as one turn in a conversation with an arbitrary LLM: precise, copyable, self-correction-ready.
- **Agent rule:** agents output plain YAML only; the page does encode-to-URL. LLMs must never generate the base64 themselves (they hallucinate bytes).

Why this shape: agent quality varies a lot. The design absorbs that by (a) shrinking the decision surface — a semantic-only format asks the agent for reading comprehension, not the eight rounds of visual refinement a hand-tuned layout takes; (b) hard errors that a blind agent can act on; (c) all placement taste living in the renderer, where it is versioned and enforced.

## The load-bearing prerequisite: auto-placement

The text format stands or falls on this, whoever authors it. Today's layouts are ~70% hand-derived coordinates (cell positions, via waypoints, label anchors, chip approaches); coordinates are exactly what agents hallucinate, and no human wants to hand-edit them either — publishing a coordinate-heavy format would produce mostly-broken output from its primary (agent) authors. The format can only ship once pure-semantic input yields a *legal and decent* first render, with optional placement overrides preserving the hand-tuned craft ceiling.

Auto-placement pays off in **every** future, including the AI-only one (it collapses the agent's render-inspect-fix loop), which is why it is the next investment regardless of whether the web theory survives.

## Steps

Phase 1 — repo and package (done 2026-08-28):

- Own repo, Apache-2.0, plain layout scripts in `layouts/`, output dir via `$ISOKIT_OUT` / `isokit.local`, grammar + rules in `STYLE.md`.

Phase 1.5 — TypeScript port (done 2026-08-28):

- Ported the Python prototype 1:1 to `src/isokit.ts` (Node ≥ 23.6 native TS, zero runtime deps), verified **byte-identical** against Python-generated golden masters (`tests/golden/`, permanent regression fixtures) plus guard-behavior tests (`tests/errors.ts`), then deleted the Python. Prototype recoverable from git history at commit `2f46dd2` (`src/isokit/__init__.py`). Rationale: the port was measured small (680 lines, pure stdlib, monospace font = trivial text metrics) and *replacing* rather than duplicating preserves the single-codebase ratchet; done before Phase 2 so auto-placement is written once, in the language the web future needs.

Phase 2 — auto-placement, incremental (done 2026-08-28; each step shipped useful on its own):

1. **Label collision check** (done 2026-08-28) — hard error when an authored label intersects a unit's screen silhouette or a flow route, run automatically at `write()` time. Immediately caught two real collisions in the shipped hybrid layout (a label tail grazing the store's corner, a dashed flow running through "ENTRA ID") — both fixed, hybrid golden regenerated and visually verified. Extended same day: arrowhead triangles are obstacles in their own right for both `checkLabels()` and `autoLabel` — the route check only covers the centerline, and the 0.21-cell flare is ~8px of ink a label can sit on while clearing every segment; the new check's first run caught a shipped azure_lob caption reaching into an arrowhead. Plane outlines followed the same day (`checkPlanes()`): a head's base edge within 4px of a ground plane's line is a hard error (the ≥0.6 flow-crossed-margin rule, previously STYLE.md-only, three layouts shipped violations of), and a plane line running lengthwise under a label's ink errors while iso-angle crossings and mid-head boundary crossings stay legal.
2. **Auto label placement** (done 2026-08-28) — `autoLabel(txt, planeRect)` walks candidate anchors along the plane's edges (canonical top-left corner first, per the exemplar convention; a fallback ring floats the label in the air just outside a crowded plane, the collision gauntlet's hand-tuned DATA TIER move) and takes the first spot that clears every unit hull, flow route, and prior label by an honest 4px — strictly tighter than `checkLabels()`, whose ~3px em-box slack plus unhulled outline strokes would otherwise let auto-placed ink sit exactly on a plate line. No clear spot is a hard error; `planeLabel()` stays as the authored override. Locked by `tests/autolabel.ts` and the `AutoLabel Demo` golden. Adopted in the shipped layouts the same day (goldens regenerated after visual verification): 8 captions auto-placed, 3 kept authored — one correctly hard-errored (azure_lob's drum-filled availability box), two sat under chip balloons because chips aren't collision objects yet (the step 3 prerequisite below). Adoption also surfaced and fixed a real bug: a plane running off-canvas let its caption render off-screen (labels now require an 8px canvas margin).
3. **Auto chip approach** (done 2026-08-28) — two halves, shipped together. (a) Chip balloons are collision objects: every `chip()` registers its balloon footprint (bubble + pointer tail) and `checkChips()` runs at `write()` time — a balloon overlapping a unit hull, flow route, label, another chip, or the canvas edge is a hard error. Point-target chips (the authored escape hatch, aimed at arbitrary exhibit geometry as in the glossary) are only checked against other chips and the canvas. `autoLabel`/`_labelSpotClear` see chips too, which let hybrid's ENTRA ID and azure_lob's app-pair AVAILABILITY SET captions return to auto placement. (b) `annotate()`'s approach point is now optional: `_autoApproach` casts rays through the unit's body centroid in a screen-horizontal-first direction order, simulates the exact balloon `chip()` would draw, and takes the first direction whose balloon clears everything including the legend rail; none clear is a hard error. (c) Chip tips snap to the unit's **body silhouette** (`_bodyHull`: footprint at ground + declared height, or a declared tighter `body` — cyl's drum, wall's inset brick slab), not the plate-inclusive collision hull, whose side edges slant to the plate's ground corners: hybrid's chip 1 — the "always been off" defect the user flagged — pointed at the estate boundary floating in that slant air 26px off the building's tower wall. Chasing those 26px also uncovered that the unit registry hulled and centered a phantom 1.4 footprint around the building's 1.1 drawing (shape-default `s` was never declared to the registry) — fixed declaratively with `ShapeProps.defS`, and `unit()` now passes `s` through so an authored footprint override actually renders. Locked by `tests/autochip.ts`; three shipped chips converted to auto (hybrid hq + entra, azure_lob app2), five goldens regenerated after visual verification (every name-target chip moved tighter to its body).
4. **Group packing** (done 2026-08-28) — `group(origin, members, {cols, gap, pad})` packs member units row-major into whole-cell blocks on the snapped grid (block size from each member's `cells`, integer gaps, rows advance past the deepest block) and returns the enclosing rect, so the grouping `plane()` and its `autoLabel()` caption are derived rather than authored. Placement goes through `unit()`, keeping every guard (grid snap, footprint overlap — including against units outside the group) and leaving members addressable by name for `connect()`/`annotate()`. Explicit `unit()` remains the authored override for irregular arrangements. Locked by `tests/group.ts` and the `Group Pack Demo` golden (two packed tiers + one hand-placed unit; captions and all three chips auto-placed).
5. **Auto flow routing** (done 2026-08-28) — `connect()` with no `via` now routes instead of drawing the old blind L-elbow: A* on the Hanan grid of every unit's cell rect expanded by a clearance margin (0.45 cells), minimizing length then bends, with exit/enter stubs stepping off the chosen edges (refined same day: stubs extend to a full cell when clear, so the final bend never chokes the 0.42-cell arrowhead at the bare margin). A clear straight line stays the plain two-point segment it always was (byte-compat: all straight-route goldens unchanged), blocked lines detour, and no-route is a hard error naming both units (`autoVia()` is exported for direct use; authored `via` remains the override). Equal-cost detours tie-break toward the screen-front lane (higher x+y) via a cost bias too small to ever outweigh a real length or bend difference — the first demo render showed why: the symmetric detour otherwise picked the back lane and vanished behind the blocker's top faces under isometric occlusion. Flush exit edges (no stub room, e.g. inside a `gap: 0` group) and walled-in targets both error rather than draw through a neighbour. Locked by `tests/autoroute.ts` and the `AutoRoute Demo` golden (four flows, zero authored waypoints); adoption rerouted one shipped flow — hybrid's hq→vpngw, whose authored-free L had always dipped through the ground in a V — and left every other no-via flow byte-identical.

Ongoing (orthogonal to the phases): **grow the shape vocabulary substantially.** The collision engine is shape-agnostic and shape properties are declarative (done 2026-08-28): a new shape declares `defH` (and optionally a tight `hull`) on the shape function itself — no engine edits, no `fn.name` lookups (minification-safe for the Phase 4 web bundle) — and must draw inside its footprint × height box unless it declares that tighter hull, as `cyl` does for its drum.

Phase 3 — the semantic format (done 2026-08-28; only started after Phase 2 made it honest):

- YAML schema (done): required semantic block (units, groups, flows, annotations, theme, title), optional placement block (anything pinned stays pinned; everything else derived). In-repo YAML subset parser (`src/yaml.ts`), strict validator (`src/schema.ts`), derivation over the Phase 2 engine (`src/semantic.ts`), a pure `render()` core with no `node:` imports, and a published JSON Schema (`schema/isokit-1.json`) with a drift-guard test.
- `isokit render diagram.yaml` CLI (done, `src/cli.ts`). All existing guards apply to hand-authored YAML identically, wrapped as `engine-guard` errors.
- Renderer error messages rewritten for the agent self-correction loop, with spec section references (done) — every error is `{code, section, line?, path?, what, fix}`, documented row-by-row in [SPEC.md](SPEC.md).
- The format contract, including every deferred v2 vocabulary item (sub-groups, overlays, flow labels, per-flow exit/enter, estate labels, richer auto-placement), lives in [SPEC.md](SPEC.md) §"Deferred to v2" — nothing from the hand-tuned exemplar layouts is orphaned undocumented.

Phase 4 — the web app + spec (the theory; commit only if the signals below hold):

- Static page: YAML editor, live in-browser render (the renderer is already browser-compatible JS after the TS port — only `out`/`write` are Node-specific), download SVG, share-link generation (deflate+base64 URL fragment).
- Machine-readable render report (errors, warnings, fallbacks) designed to be pasted back to whatever agent authored the YAML — the substitute for the agent having eyes.
- The published agent spec document, derived from `STYLE.md` + the YAML schema.
- Hosting decision: public static host vs. work-internal — decide before the repo/app goes public.

## Decision signals

These gate **Phase 4 only** — whether the web app earns its keep. The direction through Phase 3 is settled: the YAML ships, and its primary author is an AI agent (human editing is a property of the format, not the plan's driver).

- People ask to **tweak** diagrams they received → the web app (or a drag-to-adjust surface) earns its keep; proceed with Phase 4.
- People only **consume** SVGs and occasionally ask their own agent → the AI-native mode was the end state all along; stop after Phase 3 (or even Phase 2) at no loss.
- Text authoring feels coordinate-heavy even after Phase 2 → consider a visual manipulation surface (minimal drag-editor over the snap grid, or FossFLOW/Isoflow interop) instead of more text ergonomics.

## Explicitly rejected / deferred

- **Coordinate-heavy YAML now** — rejected: the YAML's primary authors are agents, and coordinates are exactly what agents get wrong (and what Phase 2 auto-placement exists to derive) — freezing them into the schema ships mostly-broken diagrams. That humans don't want to hand-edit coordinates either is a second strike, not the reason.
- **JS/TypeScript port** — ~~deferred indefinitely~~ **reversed and completed 2026-08-28**: the original objection ("forks every ratcheted rule into two codebases") assumed dual maintenance; porting-and-replacing keeps one codebase while unlocking instant no-WASM web rendering and a trivial Obsidian plugin path. The Python implementation was deleted after byte-identical verification, not kept in parallel.
- **Obsidian plugin** — deferred: the current model (SVGs generated externally, embedded via `![[...]]`) already delivers most of the value; a code-block plugin can now reuse the TS renderer directly (no WASM bundle needed).
- **Agents generating share-URLs directly** — rejected: agents emit YAML text only; encoding is the page's job.
