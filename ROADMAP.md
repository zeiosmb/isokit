# isokit — Goals, End State, and Path

Status of this document: the near-term goals and sequencing are settled; the end state is a working theory, not a commitment. Decision signals for firming it up are listed at the bottom. Last updated 2026-08-28.

## Goals

1. **Primary (today):** generate deliverable-grade Azure-style isometric architecture diagrams via an AI agent conversation. The human describes topology and critiques renders; the agent authors layout scripts against this library. The current mode of use — and it stays supported in every future.
2. **Quality is enforced, not documented.** Every rule that makes a diagram look right should be a hard generation error when violated (grid snap, footprint overlap, axis-locked flows, chip/legend sync, legend overflow — all shipped). The renderer owns the quality floor so output quality does not depend on who or what is driving.
3. **Forward-looking:** other people can produce and share diagrams without cloning source or having a specific AI setup.

## End state (working theory)

A **mermaid.live-style static web app** plus a **published spec written for AI agents**:

- **Human-authorable text format** — a semantic YAML (units, groups, flows, annotations; no coordinates in the common case). A human can edit it the way humans edit mermaid; AI makes it easier but is not required.
- **Shareable by URL** — the diagram definition is deflate+base64 encoded in the URL *fragment* (never sent to a server), so the link is simultaneously the document, the render, and the share. No backend, no accounts, no storage.
- **Static, in-browser rendering** — the Python renderer runs client-side via Pyodide/WASM. Hostable anywhere static files can live; nothing to install.
- **Published agent spec** — a single stable-URL document (llms.txt-style: format spec, invariants, few-shot exemplars, common failure modes) so any AI agent, pointed at one link, can author a valid diagram. Renderer errors are written as one turn in a conversation with an arbitrary LLM: precise, copyable, self-correction-ready.
- **Agent rule:** agents output plain YAML only; the page does encode-to-URL. LLMs must never generate the base64 themselves (they hallucinate bytes).

Why this shape: agent quality varies a lot. The design absorbs that by (a) shrinking the decision surface — a semantic-only format asks the agent for reading comprehension, not the eight rounds of visual refinement a hand-tuned layout takes; (b) hard errors that a blind agent can act on; (c) all placement taste living in the renderer, where it is versioned and enforced.

## The load-bearing prerequisite: auto-placement

A human-authorable format stands or falls on this. Today's layouts are ~70% hand-derived coordinates (cell positions, via waypoints, label anchors, chip approaches); no human wants to author that in text, and publishing a coordinate-heavy format would produce mostly-broken URLs from weak agents. The format can only ship once pure-semantic input yields a *legal and decent* first render, with optional placement overrides preserving the hand-tuned craft ceiling.

Auto-placement pays off in **every** future, including the AI-only one (it collapses the agent's render-inspect-fix loop), which is why it is the next investment regardless of whether the web theory survives.

## Steps

Phase 1 — repo and package (done 2026-08-28):

- Own repo, Apache-2.0, `src/isokit/` package layout, `pyproject.toml`, plain-python layout scripts in `layouts/`, output dir via `$ISOKIT_OUT` / `isokit.local`, grammar + rules in `STYLE.md`.

Phase 2 — auto-placement, incremental (next; each step useful on its own):

1. **Label collision check** — error when an authored label intersects a unit's screen silhouette or a flow route (the machinery already computes silhouettes for chip snapping). Cheapest step; would have caught every label collision hit so far.
2. **Auto label placement** — score candidate positions along a plane's edges against silhouettes and flows; author override stays possible.
3. **Auto chip approach** — pick a clear approach ray automatically; `annotate()` drops its coordinate in the common case.
4. **Group packing** — a plane lays out its member units into rows/columns on the snapped grid; explicit cells become the override, not the default.
5. **Auto flow routing** — orthogonal routing around occupied cells (well-trodden algorithms; the snap grid and axis-lock make it tractable), replacing most hand-authored `via` waypoints.

Phase 3 — the semantic format (only after Phase 2 makes it honest):

- YAML schema: required semantic block (units, groups, flows, annotations, theme, title), optional placement block (anything pinned stays pinned; everything else derived).
- `isokit render diagram.yaml` CLI. All existing guards apply to hand-authored YAML identically.
- Renderer error messages rewritten for the agent self-correction loop, with spec section references.

Phase 4 — the web app + spec (the theory; commit only if the signals below hold):

- Static page: YAML editor, live Pyodide render, download SVG, share-link generation (deflate+base64 URL fragment). Verify Pyodide load weight is acceptable (~10 MB first load, cached after).
- Machine-readable render report (errors, warnings, fallbacks) designed to be pasted back to whatever agent authored the YAML — the substitute for the agent having eyes.
- The published agent spec document, derived from `STYLE.md` + the YAML schema.
- Hosting decision: public static host vs. work-internal — decide before the repo/app goes public.

## Decision signals

- People ask to **tweak** diagrams they received → the web app (or a drag-to-adjust surface) earns its keep; proceed with Phase 4.
- People only **consume** SVGs and occasionally ask their own agent → the AI-native mode was the end state all along; stop after Phase 3 (or even Phase 2) at no loss.
- Text authoring feels coordinate-heavy even after Phase 2 → consider a visual manipulation surface (minimal drag-editor over the snap grid, or FossFLOW/Isoflow interop) instead of more text ergonomics.

## Explicitly rejected / deferred

- **Coordinate-heavy YAML now** — rejected: freezes a schema no human wants to author and no weak agent can produce reliably.
- **JS/TypeScript port** — deferred indefinitely: forks every ratcheted rule into two codebases; only worth it if this becomes a real multi-user product needing a native Obsidian plugin or instant web rendering without WASM.
- **Obsidian plugin** — deferred: the current model (SVGs generated externally, embedded via `![[...]]`) already delivers most of the value; a code-block plugin could later reuse the Phase 4 Pyodide bundle.
- **Agents generating share-URLs directly** — rejected: agents emit YAML text only; encoding is the page's job.
