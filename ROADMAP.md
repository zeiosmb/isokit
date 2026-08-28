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
- **Static, in-browser rendering** — the TypeScript renderer runs natively in the browser as a small JS bundle (no WASM, no Pyodide, instant load). Hostable anywhere static files can live; nothing to install.
- **Published agent spec** — a single stable-URL document (llms.txt-style: format spec, invariants, few-shot exemplars, common failure modes) so any AI agent, pointed at one link, can author a valid diagram. Renderer errors are written as one turn in a conversation with an arbitrary LLM: precise, copyable, self-correction-ready.
- **Agent rule:** agents output plain YAML only; the page does encode-to-URL. LLMs must never generate the base64 themselves (they hallucinate bytes).

Why this shape: agent quality varies a lot. The design absorbs that by (a) shrinking the decision surface — a semantic-only format asks the agent for reading comprehension, not the eight rounds of visual refinement a hand-tuned layout takes; (b) hard errors that a blind agent can act on; (c) all placement taste living in the renderer, where it is versioned and enforced.

## The load-bearing prerequisite: auto-placement

A human-authorable format stands or falls on this. Today's layouts are ~70% hand-derived coordinates (cell positions, via waypoints, label anchors, chip approaches); no human wants to author that in text, and publishing a coordinate-heavy format would produce mostly-broken URLs from weak agents. The format can only ship once pure-semantic input yields a *legal and decent* first render, with optional placement overrides preserving the hand-tuned craft ceiling.

Auto-placement pays off in **every** future, including the AI-only one (it collapses the agent's render-inspect-fix loop), which is why it is the next investment regardless of whether the web theory survives.

## Steps

Phase 1 — repo and package (done 2026-08-28):

- Own repo, Apache-2.0, plain layout scripts in `layouts/`, output dir via `$ISOKIT_OUT` / `isokit.local`, grammar + rules in `STYLE.md`.

Phase 1.5 — TypeScript port (done 2026-08-28):

- Ported the Python prototype 1:1 to `src/isokit.ts` (Node ≥ 23.6 native TS, zero runtime deps), verified **byte-identical** against Python-generated golden masters (`tests/golden/`, permanent regression fixtures) plus guard-behavior tests (`tests/errors.ts`), then deleted the Python. Prototype recoverable from git history at commit `2f46dd2` (`src/isokit/__init__.py`). Rationale: the port was measured small (680 lines, pure stdlib, monospace font = trivial text metrics) and *replacing* rather than duplicating preserves the single-codebase ratchet; done before Phase 2 so auto-placement is written once, in the language the web future needs.

Phase 2 — auto-placement, incremental (next; each step useful on its own):

1. **Label collision check** (done 2026-08-28) — hard error when an authored label intersects a unit's screen silhouette or a flow route, run automatically at `write()` time. Immediately caught two real collisions in the shipped hybrid layout (a label tail grazing the store's corner, a dashed flow running through "ENTRA ID") — both fixed, hybrid golden regenerated and visually verified.
2. **Auto label placement** — score candidate positions along a plane's edges against silhouettes and flows; author override stays possible.
3. **Auto chip approach** — pick a clear approach ray automatically; `annotate()` drops its coordinate in the common case.
4. **Group packing** — a plane lays out its member units into rows/columns on the snapped grid; explicit cells become the override, not the default.
5. **Auto flow routing** — orthogonal routing around occupied cells (well-trodden algorithms; the snap grid and axis-lock make it tractable), replacing most hand-authored `via` waypoints.

Ongoing (orthogonal to the phases): **grow the shape vocabulary substantially.** The collision engine is already shape-agnostic — a new shape inherits the generic footprint × height hull automatically; it only needs a `_DEF_H` entry and must draw inside its footprint box (or declare a tighter hull, as `cyl` does for its drum). If bespoke hulls multiply, promote the tight-hull description to a declarative per-shape property instead of branches in `_collisionHull`.

Phase 3 — the semantic format (only after Phase 2 makes it honest):

- YAML schema: required semantic block (units, groups, flows, annotations, theme, title), optional placement block (anything pinned stays pinned; everything else derived).
- `isokit render diagram.yaml` CLI. All existing guards apply to hand-authored YAML identically.
- Renderer error messages rewritten for the agent self-correction loop, with spec section references.

Phase 4 — the web app + spec (the theory; commit only if the signals below hold):

- Static page: YAML editor, live in-browser render (the renderer is already browser-compatible JS after the TS port — only `out`/`write` are Node-specific), download SVG, share-link generation (deflate+base64 URL fragment).
- Machine-readable render report (errors, warnings, fallbacks) designed to be pasted back to whatever agent authored the YAML — the substitute for the agent having eyes.
- The published agent spec document, derived from `STYLE.md` + the YAML schema.
- Hosting decision: public static host vs. work-internal — decide before the repo/app goes public.

## Decision signals

- People ask to **tweak** diagrams they received → the web app (or a drag-to-adjust surface) earns its keep; proceed with Phase 4.
- People only **consume** SVGs and occasionally ask their own agent → the AI-native mode was the end state all along; stop after Phase 3 (or even Phase 2) at no loss.
- Text authoring feels coordinate-heavy even after Phase 2 → consider a visual manipulation surface (minimal drag-editor over the snap grid, or FossFLOW/Isoflow interop) instead of more text ergonomics.

## Explicitly rejected / deferred

- **Coordinate-heavy YAML now** — rejected: freezes a schema no human wants to author and no weak agent can produce reliably.
- **JS/TypeScript port** — ~~deferred indefinitely~~ **reversed and completed 2026-08-28**: the original objection ("forks every ratcheted rule into two codebases") assumed dual maintenance; porting-and-replacing keeps one codebase while unlocking instant no-WASM web rendering and a trivial Obsidian plugin path. The Python implementation was deleted after byte-identical verification, not kept in parallel.
- **Obsidian plugin** — deferred: the current model (SVGs generated externally, embedded via `![[...]]`) already delivers most of the value; a code-block plugin can now reuse the TS renderer directly (no WASM bundle needed).
- **Agents generating share-URLs directly** — rejected: agents emit YAML text only; encoding is the page's job.
