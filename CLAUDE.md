# isokit — agent instructions

Guarded generator for Azure-style isometric architecture diagrams (self-contained SVG). Read [README.md](README.md) for orientation, [STYLE.md](STYLE.md) before writing or modifying any layout, [SPEC.md](SPEC.md) for the YAML format contract, [ROADMAP.md](ROADMAP.md) for direction and what's been rejected/deferred.

## Commands

```bash
npm run typecheck                    # tsc --noEmit
npm test                             # full chain: unit suites + golden byte-compare
npm run build:obsidian               # bundle the Obsidian plugin (obsidian/main.js)
npm run build:interactive-examples   # regenerate examples/interactive/ (SVGs + index.html)
node layouts/<name>.ts               # render one TS layout
node src/cli.ts render <file>.yaml   # render a YAML diagram
```

Node ≥ 23.6, native TS type stripping — no build step for the library itself.

## Golden policy (the load-bearing rule)

`tests/golden/*.svg` are byte-compared on every `npm test`. Their job is to make every rendering change *deliberate*: unintended byte drift fails loudly. When output changes on purpose, visually verify the new renders first (headless Brave screenshots work well), then regenerate the affected goldens — the diff is the review artifact. Never regenerate to silence a failure you can't explain.

## Architecture invariants

- `src/render.ts` is a **pure** core (`render(yamlText): string`, no `node:` imports) — it must stay browser-compatible; `tests/semantic.ts` walks its import graph to enforce this. Node-specific I/O lives in `src/cli.ts` / `write()`.
- Quality rules are **enforced, not documented**: anything that makes a diagram look right should be a hard generation error when violated. Corrections get ratcheted into STYLE.md and into enforcement code — never applied as one-offs.
- Shape specifics stay **declarative** (`defH`, optional tight `hull`, `defS` on the shape function — no engine branches, no `fn.name` lookups); the shape vocabulary is expected to grow a lot.
- Error messages are turns in a conversation with a blind agent: `{code, section, line?, path?, what, fix}`, documented row-by-row in SPEC.md, with a drift-guard test.

## Parallel implementations to keep in sync

The pan/zoom/legend-collapse viewBox math exists twice, deliberately:

- `obsidian/main.ts` — TypeScript, HTML buttons outside the SVG, CSS-positioned (`obsidian/styles.css`).
- `src/interactive.ts` — the same math as vanilla JS in `RUNTIME_JS`, embedded via `<script>` with SVG-native HUD buttons re-anchored on every view change.

A behavior change in one almost always belongs in the other. After changing either: `npm run build:obsidian` and copy `obsidian/main.js` + `obsidian/styles.css` into the live vault at `/Users/micahburnett/Syncthing/Obsidian/Work/.obsidian/plugins/isokit/`; regenerate `examples/interactive/` (the generator wipes and rebuilds that whole directory — never hand-edit files in it).

## Workflow

- TDD: failing test first, watch it fail, then implement. Suites are plain scripts (`node tests/<name>.ts`, exit code = verdict); new suites get wired into `package.json`'s `test` chain.
- Never git commit — the user reviews and commits themselves.
