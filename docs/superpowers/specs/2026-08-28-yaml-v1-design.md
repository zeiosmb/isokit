# isokit YAML v1 — Design Spec

Status: approved design, pre-implementation. This is the internal design document; the public format contract it describes will live in `SPEC.md` at the repo root (written as part of implementation, derived from the sections below).

## Goal

A semantic, versioned YAML format that lets an AI agent (primary author) or a human (editor) produce a legal, decent isokit diagram with no coordinates in the common case. Ships with: an in-repo YAML subset parser, a strict validator, a layout-derivation layer over the existing Phase 2 engine, a pure `render()` core, a thin Node CLI, structured self-correction-ready errors, a published JSON Schema, and `SPEC.md` as the format contract.

## Non-goals (v1)

- Full auto-layout of arbitrary compositions. Groups carry layout; loose units require pins.
- Exemplar parity. The hand-tuned TS layouts (raised sheets, free-drawn zrect boxes, per-flow exit/enter edges, authored label anchors) are not expressible in v1. Each such feature has a named future semantic concept (see "Deferred vocabulary") so nothing is orphaned as local-only.
- The web app, URL encoding, and the Obsidian plugin. v1 only guarantees the pure core they will bundle.
- Full YAML. The parser accepts a strict subset (below); everything else is a precise error.

## Architecture

New modules, all zero-dependency:

- `src/yaml.ts` — YAML subset parser. `parseYaml(text): unknown` producing plain objects/arrays/strings/numbers/booleans, with a source line attached per node (for error locations). Knows nothing about diagrams.
- `src/schema.ts` — validator. `validate(doc): Diagram` returning a typed semantic model, or throwing `IsokitError`. Enforces structure (keys, types, enums) and references (names resolve, no duplicates, group/pin exclusivity, version gate). Unknown keys anywhere are errors.
- `src/semantic.ts` — derivation. `derive(diagram): string` maps the semantic model onto the existing engine API (`unit`, `group`, `connect`, `annotate`, `plane`, `autoLabel`, `grid`, `legend`, `annotations`) in the order given under "Layout derivation," and returns the SVG string via the existing pipeline (all `write()`-time guards run via an exported check entry point, since the pure core does not write files).
- `src/fonts.ts` — generated module: the two JetBrains Mono woff2 files as base64 string constants, produced by `scripts/gen-fonts.ts` from the font files. `svgOpen()` switches from `fs.readFileSync` to importing these constants. Must be byte-identical in output (all nine existing goldens unchanged).
- `src/render.ts` — the platform-free composition: `render(yamlText: string): string` = parse → validate → derive → SVG string. No `node:` imports anywhere in its module graph. This is the function the web app and Obsidian plugin bundle.
- `src/cli.ts` — everything Node: argv parsing (`render <file> [-o out.svg]`), file read, `out()` path resolution (filename from `title` unless `-o`), `xmllint` check, exit codes (0 success, 1 error), error block to stderr. `package.json` gains `"bin": { "isokit": "src/cli.ts" }`.
- `schema/isokit-1.json` — published JSON Schema mirroring the structural layer of the validator. Not used by the renderer; exists for editor tooling and as a machine-readable enumeration of v1. A drift-guard test replays validator fixtures through it.
- `SPEC.md` — the format contract: schema reference, enums, quoting rules, derivation behavior, examples, and the error table (every error code, one row each).

The existing `src/isokit.ts` engine is unchanged except: `svgOpen` font sourcing (fonts.ts) and, if needed, exporting the `write()`-time check sequence as a callable (`runChecks()`) so `render()` can enforce the quality floor without touching the filesystem.

## File format

```yaml
isokit: 1                      # required; unknown major = hard error citing the spec
title: "HYBRID: ON-PREM TO AZURE"
theme: azure                   # blueprint | azure (default blueprint)

estates:                       # optional; at most 2 in v1 (light + dark ground)
  cloud: {}
  on-prem: { tone: dark }      # exactly one estate may declare tone: dark

units:                         # name -> what it is (never where)
  vpngw: { shape: box, glyph: gw }
  fw:    { shape: wall }
  sql:   { shape: cyl, accent: 3 }
  hq:    { shape: building }

groups:                        # membership carries layout; plane + caption derived
  app-subnet:  { label: APP SUBNET,  units: [app1, app2] }
  data-subnet: { label: DATA SUBNET, units: [sql, queue, blob] }
  on-prem:     { label: ON-PREMISES, units: [hq, dc, staff], estate: on-prem }

flows:
  - { from: hq,  to: vpngw, style: sync }   # request | data | sync (default request)
  - { from: app1, to: sql }

annotations:                   # declaration order = chip numbering
  vpngw: { title: VPN Gateway, note: site-to-site tunnel terminates the private link. }

placement:                     # optional; anything pinned stays pinned
  groups:
    app-subnet: { origin: [10, 1], cols: 2 }   # gap and pad also accepted
  units:
    entra: [1, 1]              # pin for a loose unit (not in any group)
  flows:
    - { from: fw, to: app1, via: [[6.5, 2.0]] }
```

### Keys and enums

- `isokit` (required, int): format major version. v1 renderer accepts exactly `1`.
- `title` (required, string): diagram heading; also the default output filename.
- `theme` (optional): `blueprint` (default) | `azure`.
- `estates` (optional, map, max 2 entries): names referenced by groups. At most one entry has `tone: dark`; `{}` means the default ground. Zero or one estate declared = no ground split.
- `units` (required, map): per unit — `shape` (required; enum below), `glyph` (optional; enum below, only meaningful on glyph-bearing shapes — validator warns via error if the shape ignores glyphs), `accent` (optional; `1 | 2 | 3`, mapping to the theme's A1/A2/A3 rim roles; default per current engine behavior).
- `groups` (optional, map): per group — `label` (required, string; the derived caption), `units` (required, list of unit names), `estate` (optional, estate name).
- `flows` (optional, list): `from`, `to` (required unit names), `style` (optional enum), `label` deferred to v2.
- `annotations` (optional, map keyed by unit name): `title` and `note` (both required strings). Presence = a chip + legend entry, numbered by declaration order.
- `placement` (optional): `groups` (map: `origin: [x, y]` required if present; `cols`, `gap`, `pad` optional ints/number), `units` (map: `[x, y]`), `flows` (list: `from`/`to` identifying the flow, `via`: list of `[x, y]`; a placement entry not matching a declared flow is an error).

Shape enum (v1): `box`, `cyl`, `rack`, `building`, `wall`, `queue`, `store`, `slab`, `panel`, `padlock`, `users`, `laptop`, `monitor`, `phone`, `browser`. (`person` is a screen-space primitive, excluded.)

Glyph enum (v1): `gw`, `app`, `entra`, `kv`, `fn`, `doc`, `shield`.

### Validation rules (beyond structure)

- Unknown keys anywhere are hard errors naming the key and the valid set.
- Every name reference resolves: flow endpoints, group members, annotation keys, estate references, placement targets. Errors name both sides ("flows[2].from: 'gwx' is not a declared unit").
- No duplicate names within a namespace; unit and group namespaces are separate but a name collision between them is also an error (flows reference units; ambiguity is banned preemptively).
- Every unit is in exactly one group XOR pinned in `placement.units`. Both = error (ambiguous authority). Neither = error.
- A pinned group origin plus `estate` straddle checks happen at derivation, not validation (they need geometry).
- Strings containing `:`, `#`, or leading YAML specials must be quoted; the parser error says exactly that.

## YAML subset (parser contract)

Accepted: UTF-8; 2-space indentation (tabs are an error); block maps and lists; inline (flow-style) maps `{k: v, ...}` and lists `[a, b]` one level deep (no nesting inside inline collections beyond lists of lists for `via`); scalars — plain (no `:` or leading specials), single- and double-quoted strings, integers, floats, booleans `true|false`; comments (`#` to end of line); blank lines.

Rejected with precise errors: anchors/aliases (`&`, `*`), tags (`!`), multi-document (`---`), block scalars (`|`, `>`), flow-style nesting beyond the above, tabs, duplicate keys in one map, unquoted scalars that parse ambiguously.

Every parsed node records its source line; the validator and derivation reuse it for error locations.

## Layout derivation

Order, reusing Phase 2 machinery end to end:

1. **Group packing** — each group packs members row-major via the existing `group()` (blocks from shape `cells`, `cols`/`gap`/`pad` from placement hints, defaults as today). Plane + caption derive from the returned rect; captions via `autoLabel` (all collision rules apply).
2. **Group origins** — pinned origins win verbatim. Unpinned groups auto-place in declaration order: groups in the same estate stack top-left to bottom-right (reading direction), one group-width gap; the dark estate is placed lower-left of the default estate, separated along the boundary axis. Deliberately basic; pins are the corrective, and pin frequency informs the v2 placer.
3. **Estate boundary** — after origins resolve, find an integer grid line separating dark-estate group rects (and their members' pins) from everything else, trying y then x; render the two-tone ground (`grid({seam})`). No separating line = hard error naming the straddling groups.
4. **Loose units** — placed at their pins through `unit()` (snap/overlap guards apply).
5. **Flows** — `connect()` with autoVia; placement `via` passes through verbatim (axis-lock still enforced); exit/enter edges auto-picked.
6. **Annotations** — `annotate()` with auto approach; legend order = declaration order.
7. **Canvas** — derived from the bounding extent of all content plus margins, floored at 1400×700. No canvas coordinates in the YAML.

Every existing hard error (snap, overlap, label/chip/plane collisions, no-route, walled-in, legend overflow) surfaces through the structured error format. The YAML layer adds no leniency.

## Error format

All errors — parse, validation, derivation, engine guards — emit one shape:

```
isokit error [flow-unknown-unit] (spec: flows)
  at diagram.yaml line 24 (flows[2].from)
  "gwx" is not a declared unit. Declared units: hq, vpngw, fw, app1, sql.
  fix: change "from" to one of the declared names, or add "gwx" under units:.
```

Fixed parts: stable kebab-case **code**; **spec section** name; **location** (line + YAML path when known; engine-guard errors may omit the line and cite the derivation step instead); **what** (with the actual offending value; valid options enumerated whenever the set is closed); **fix** (one concrete corrective action). Implementation: an `IsokitError` class carrying `{code, section, line?, path?, what, fix}`; the CLI formats the block; `render()` throws it for embedders to format.

Engine guards are wrapped at the derivation boundary: existing message text becomes the "what," and the wrapper adds code/section/fix. Engine code is not rewritten.

## Testing

- `tests/yaml.ts` — subset round-trips (nested maps, lists, inline collections, quoted strings, comments); out-of-subset constructs fail with line-numbered spec-referencing errors; line-number accuracy asserted.
- `tests/validate.ts` — one fixture per error code; cross-checks: every code in code exists in SPEC.md's error table, every section named by an error exists as a SPEC.md heading; JSON Schema drift-guard (valid fixtures pass / structurally-invalid fixtures fail `schema/isokit-1.json` under a minimal in-repo JSON Schema interpreter, test-only code covering only the features the schema file uses).
- `tests/semantic.ts` — auto-stack origin policy positions; pins win verbatim; estate boundary on the separating line; straddle error names groups; loose units hit snap/overlap guards; placement entries matching no declared flow error.
- Goldens — `examples/minimal.yaml` (few units, one group, one flow) and `examples/hybrid.yaml` (semantic hybrid remake with estates; the "legal and decent first render" benchmark, not expected to match the hand-tuned TS hybrid). Rendered through pure `render()`, visually verified at 2x before locking, then byte-compared in the golden harness.
- Purity — all nine existing goldens byte-identical after the fonts.ts refactor; a test asserts the `render()` module graph contains no `node:` imports.
- `tests/cli.ts` — spawn the CLI: success writes SVG and exits 0; bad input exits 1 with the structured block on stderr.

## Deferred vocabulary (named v2 concepts, so nothing is local-only forever)

- **Sub-groups** (azure_lob's availability-set boxes): one level of group nesting.
- **Overlays** (hybrid's raised LOB sheet): a callout flag on a group; geometry derived.
- **Flow labels** and per-flow exit/enter edge hints.
- **Estate labels** (today's ON-PREMISES caption is a group label; a label for the estate itself may be wanted).
- **Richer origin auto-placement** (flow-aware ordering) once v1 pin patterns show what to derive.

## Decisions log

- Groups carry layout; full auto-layout deferred (user-approved).
- In-repo YAML subset parser; zero deps preserved (user-approved).
- v1 scope = semantic core + estates; decoration returns as semantic concepts, never coordinates (user-approved; "estate" terminology adopted repo-wide 2026-08-28, replacing "ground seam" in user-facing text).
- Versioned format, strict validator, published JSON Schema with drift-guard test (user-approved).
- Pure `render()` core + thin CLI; fonts to generated module; Obsidian/web bundle the core (user-approved).
