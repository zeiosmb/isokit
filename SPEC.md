# isokit format, version 1

This is the format contract for `isokit:`-versioned YAML diagrams: the keys a
document may use, what each means, how they derive into a rendered isometric
diagram, and every error the renderer can raise. It is written for both an AI
agent authoring a diagram from a topology description and a human hand-editing
one.

`STYLE.md` documents the underlying TypeScript layout grammar (`src/isokit.ts`)
for hand-authored layout scripts; this document is the YAML contract layered
on top of it.

Versioning policy: the `isokit:` key names the format's major version. A
renderer accepts exactly the majors it implements — this document describes
major `1`. An unrecognized major is a hard error (`version-unsupported`)
naming the version the renderer accepts. Minor, non-breaking additions land
without bumping the major; breaking changes bump it and get their own SPEC.md
revision.

## Format

Top-level keys:

| key | required | type | default | notes |
| --- | --- | --- | --- | --- |
| `isokit` | yes | int | — | format major version; must be `1` |
| `title` | yes | string | — | diagram heading; also the default output filename |
| `theme` | no | enum | `blueprint` | `blueprint` \| `azure` |
| `estates` | no | map (max 2) | none | zero or one estate = no ground split |
| `units` | yes | map | — | at least one unit |
| `groups` | no | map | none | membership carries layout |
| `flows` | no | list | none | connections between units |
| `annotations` | no | map | none | chip + legend entries |
| `placement` | no | map | none | `groups`, `units`, `flows` overrides |

Unknown keys anywhere in the document are a hard error (`key-unknown`) naming
the offending key and the valid set for that position. Missing required keys
are `key-missing`. Wrong types are `type-mismatch`.

## YAML subset

The parser (`src/yaml.ts`) accepts a strict subset of YAML — enough for this
format, no more. Every parsed node records its source line; errors below cite
it.

Accepted:

- UTF-8 text, one document per file (no `---` document separators).
- 2-space indentation for block maps and lists.
- Block maps and lists.
- Inline (flow-style) maps `{k: v, ...}` and lists `[a, b]`, one level deep —
  the only nesting allowed inside an inline collection is a list of lists
  (used by `placement.flows[].via`).
- Scalars: plain strings (no `:`, `#`, or leading specials), single- and
  double-quoted strings, integers, floats, booleans (`true`/`false`).
- Comments: `#` to end of line.
- Blank lines.

Rejected, each with a precise, line-numbered error:

- Tabs for indentation (`yaml-tab-indent`).
- A second document separator (`yaml-multidoc`).
- Anchors/aliases (`&`, `*`), tags (`!`), and other unsupported sigils
  (`yaml-unsupported-syntax`).
- Block scalars (`|`, `>`) — not supported (`yaml-unsupported-syntax`).
- Ambiguous plain scalars that YAML would parse unpredictably
  (`yaml-ambiguous-scalar`).
- Strings containing `:`, `#`, `{`, `}`, `[`, `]`, or `,` that are not quoted
  (`yaml-quote-required`) — quote them.
- Duplicate keys within one map (`yaml-duplicate-key`).
- Bad indentation, i.e. a line indented more than its parent expects without a
  new block context (`yaml-bad-indent`).
- A line that looks like a key but is not `key: value` shaped
  (`yaml-bad-key`).
- A key with no value (`yaml-missing-value`).
- An unterminated quoted string (`yaml-unterminated-string`).
- An unterminated inline `{...}` or `[...]` (`yaml-unterminated-flow`).
- Extra content after a value ends on the same line (`yaml-trailing-content`).
- A `- item` block-list entry that isn't a scalar or an inline collection
  (`yaml-block-list-item`).
- An empty file (`yaml-empty`).

Quoting rule, stated once for reference throughout this document: any string
value containing `:`, `#`, or a leading YAML special character must be quoted
(single or double); the parser's `yaml-quote-required` error names exactly
this rule.

## Estates

An estate is a named ground zone. `estates:` accepts at most two entries
(`estate-too-many` if more). Each entry is `{}` (the default, light ground) or
`{ tone: dark }`. At most one estate may declare `tone: dark`
(`estate-multiple-dark` if more than one does). Zero or one estate declared
means no ground split at all — the grid renders as a single tone.

Groups reference an estate by name via `groups.<name>.estate`; an unknown
name is `estate-unknown`.

The boundary between the two estates is derived, not authored: it must land
on an integer grid line (see "Layout derivation" — estate boundary). If no
such line separates every dark-estate group (and any pins) from everything
else on either axis, that is `estate-straddle`, naming the straddling groups.

## Units

Every unit has a `shape` (required) and may have a `glyph` and an `accent`.

Shape enum (v1, 15 shapes): `box`, `cyl`, `rack`, `building`, `wall`, `queue`,
`store`, `slab`, `panel`, `padlock`, `users`, `laptop`, `monitor`, `phone`,
`browser`.

(`person` is a screen-space primitive used internally by `users`; it is not a
standalone shape in this format.)

Glyph enum (v1, 7 glyphs): `gw`, `app`, `entra`, `kv`, `fn`, `doc`, `shield`.

Only glyph-bearing shapes accept a `glyph`: `box` and `slab`. Declaring a
glyph on any other shape is `glyph-unsupported-shape`, naming the shape and
the glyph-bearing set.

`accent` is an optional integer `1`, `2`, or `3`, mapping to the active
theme's rim roles: `1` → A1, `2` → A2, `3` → A3. Any other value is
`enum-invalid`. Omitting `accent` uses the shape's default rim.

## Groups

A group's `units` list carries its layout: members pack row-major into
whole-cell blocks (see "Layout derivation"). `label` becomes the group's
derived caption, placed automatically along the enclosing plane. `estate`
(optional) assigns the group to a declared estate name.

Every unit must be in exactly one group **or** pinned under
`placement.units` — never both, never neither. Both is
`unit-doubly-placed`; neither is `unit-unplaced`. A group with an empty
`units` list is `group-empty`. A group member naming an undeclared unit is
`group-unknown-unit`.

Unit and group names share a validation namespace: reusing a unit's name as a
group name (or vice versa) is `name-collision`, since flows and other
references resolve unit names and an ambiguous name would be unsafe to
resolve.

## Flows

Each flow entry is `{ from, to, style? }`, both `from` and `to` naming
declared units (`flow-unknown-unit` if either does not resolve).

Style table:

| style | line | weight | notes |
| --- | --- | --- | --- |
| `request` (default) | solid, single head | 2.5 | control/request flow |
| `data` | dashed, single head, origin dot | 1.8 | data run |
| `sync` | solid, double head | 1.6 | bidirectional control |

Flows auto-route: with no `via` override, the derivation layer finds an
orthogonal path around every unit's cell rect (see `STYLE.md`'s auto-routing
rule for the underlying algorithm); a clear straight line stays a straight
segment. `placement.flows[].via` passes explicit waypoints through verbatim —
still axis-locked (every segment, including `via` waypoints, must run along
exactly one grid axis).

## Annotations

`annotations:` is keyed by unit name; each entry requires `title` and `note`.
Presence of an entry means that unit gets a numbered pointer chip plus a
matching legend rail entry — the two can never desync because both come from
one declaration. Numbering follows declaration order in the YAML document,
top to bottom. An annotation naming an undeclared unit is
`annotation-unknown-unit`.

## Placement

`placement:` is entirely optional; anything pinned there stays pinned exactly
as authored, and everything unpinned is derived (see "Layout derivation").

- `placement.groups.<name>`: `origin: [x, y]` (required if the group is
  listed at all), plus optional `cols`, `gap` (integers), `pad` (number).
  Naming an undeclared group is `placement-unknown-group`.
- `placement.units.<name>`: `[x, y]`, a pin for a loose unit not in any
  group. Naming an undeclared unit is `placement-unknown-unit`.
- `placement.flows`: a list of `{ from, to, via }`, matching a declared flow
  by its endpoints; `via` is a list of `[x, y]` waypoints. An entry matching
  no declared flow is `placement-unknown-flow`.

Placement coordinates are integers. Sign is unrestricted — negative
coordinates are valid; the engine grid begins at −2. A non-integer coordinate
in any pin or origin is `pin-off-grid`. Negative grid coordinates are valid
only while all content still projects onto the canvas — a pin or origin that
pushes any cell rect's projected screen position negative is
`content-off-canvas` (see "Layout derivation").

Pins always win: a pinned group origin or unit position is never adjusted by
auto-placement, only validated for the guards above and the engine's own
overlap/snap checks at derivation time.

## Layout derivation

Derivation (`src/semantic.ts`) maps the validated document onto the existing
engine (`unit`, `group`, `connect`, `annotate`, `plane`, `autoLabel`, `grid`,
`legend`, `annotations`) in this fixed order:

1. **Group packing** — each group packs its members row-major into whole-cell
   blocks via the engine's `group()` (block sizing from `cells`, `cols`/`gap`/
   `pad` from `placement.groups` hints, defaults otherwise). The enclosing
   plane rect and its derived caption (via `autoLabel`, all collision rules
   applying) come from the packed extent.

2. **Group origins** — pinned origins win verbatim. Unpinned groups auto-place
   in declaration order: the default estate's unpinned groups fill a row
   starting at `(1, 1)`, each next group's origin `x` set to the previous
   group's right edge + 2. The dark estate's unpinned groups fill a second row
   starting at `(1, maxY + 3)`, where `maxY` is the deepest bottom edge among
   all default-estate cell rects, including loose pins that belong to the
   default estate (see step 4 below).

3. **Estate boundary** — after every origin is resolved, find the first
   integer grid line that separates the two estates, scanning `y` ascending
   from `maxY + 1` first, then (if no `y` line works) `x` ascending from the
   default estate's rightmost edge + 1: every default-estate cell rect ends at
   or before the line, and every dark-estate cell rect starts at or after it.
   Loose pins belong to the default estate for this test. The two-tone ground
   seam (`grid({seam})`) is only emitted when the dark estate has content. If
   neither axis produces a separating line, that is `estate-straddle`, naming
   the straddling groups — this is a derivation-time error since it needs
   resolved geometry, not a validation-time one.

4. **Loose units** — units not in any group are placed at their
   `placement.units` pins via the engine's `unit()` (grid-snap and overlap
   guards apply as they do everywhere else).

5. **Flows** — each flow renders via `connect()`, letting the router pick a
   path unless `placement.flows` supplies `via` waypoints, which pass through
   verbatim (still axis-locked). Exit/enter edges are auto-picked.

6. **Annotations** — each declared annotation renders via `annotate()`
   letting the renderer pick a clear approach automatically; the legend rail
   lists entries in declaration order.

7. **Canvas** — the canvas is derived, never authored. Every cell rect's
   corners (including the top face at `z = 2`) are projected; the canvas
   width is `max(1400, ceil(maxX) + 60 + railW)`, where `railW` is `346` only
   when the document has at least one annotation (otherwise `0`); the height
   is `max(700, ceil(maxY) + 40)`. When present, the legend rail sits at
   `x = W − 346`.

Every existing engine hard error (grid snap, footprint overlap, axis-lock,
no-route, walled-in target, label/chip/plane collisions, legend overflow)
still fires during derivation, wrapped as an `engine-guard` error (see
"Errors"). The YAML layer adds no leniency beyond what `src/isokit.ts`
already enforces.

## CLI

Invocation: `isokit render <file.yaml> [-o out.svg]` (or, before the package
is linked, `node src/cli.ts render <file.yaml> [-o out.svg]`).

Output path resolution: `-o out.svg` if given; otherwise the filename is
derived from the document's `title`, resolved through the same
`$ISOKIT_OUT` / `isokit.local` search `STYLE.md`'s layout scripts use.

Exit codes:

| code | meaning |
| --- | --- |
| `0` | success — output written, `xmllint --noout` passed |
| `1` | a rendering error (parse, validate, derive, or engine guard), or output written but `xmllint` reported it invalid |
| `2` | usage error — wrong or missing CLI arguments |

On error, the CLI writes the structured error block (below) to stderr and
exits `1`.

## Errors

All errors — parse, validation, derivation, and wrapped engine guards — share
one block shape:

```
isokit error [flow-unknown-unit] (spec: flows)
  at diagram.yaml line 24 (flows[2].from)
  "gwx" is not a declared unit. Declared units: hq, vpngw, fw, app1, sql.
  fix: change "from" to one of the declared names, or add "gwx" under units:.
```

Fixed parts: a stable kebab-case **code**; the **spec section** name (one of
the headings in this document); the **location** (source line and YAML path
when known — engine-guard errors may omit the line and cite the derivation
step instead); **what** went wrong, naming the actual offending value and
enumerating valid options whenever the set is closed; and **fix**, one
concrete corrective action. Engine-guard fix hints vary in specificity: most
name the concrete corrective (move a pin, shorten a label); a few — notably
`label-crosses-flow-route`-shaped collisions surfaced from deep inside the
engine — carry a more generic "adjust pins or shorten labels per the message"
hint, because the wrapper cannot always infer which of several existing
objects to move. Engine message text itself is not rewritten by the YAML
layer; the wrapper only adds code/section/fix around it.

For codes raised inside a section walk (`type-mismatch`, `enum-invalid`,
`text-unsupported-char`), the block's `(spec: ...)` cites the enclosing
section passed down the walk (e.g. `groups`), not necessarily the section
named in this table's nominal row for that code — those two codes' table
rows above name `format` as a representative section, but the section
actually reported varies with where in the document the value appears.

Every code below, one row each:

| code | section | meaning |
| --- | --- | --- |
| `yaml-tab-indent` | yaml-subset | a line uses a tab for indentation; only spaces are accepted |
| `yaml-multidoc` | yaml-subset | a `---` document separator appeared; one document per file only |
| `yaml-unsupported-syntax` | yaml-subset | an anchor, alias, tag, or block scalar was used; none are supported |
| `yaml-ambiguous-scalar` | yaml-subset | a plain scalar parses ambiguously; quote it to disambiguate |
| `yaml-quote-required` | yaml-subset | a string contains `:`, `#`, or a leading special character and must be quoted |
| `yaml-duplicate-key` | yaml-subset | the same key appears twice in one map |
| `yaml-bad-indent` | yaml-subset | a line's indentation doesn't match any open block context |
| `yaml-bad-key` | yaml-subset | a line looks like a key but is not `key: value` shaped |
| `yaml-missing-value` | yaml-subset | a key has no value after the colon |
| `yaml-unterminated-string` | yaml-subset | a quoted string has no closing quote |
| `yaml-unterminated-flow` | yaml-subset | an inline `{...}` or `[...]` has no closing bracket |
| `yaml-trailing-content` | yaml-subset | extra content follows a value on the same line |
| `yaml-block-list-item` | yaml-subset | a `- item` entry is not a scalar or inline collection |
| `yaml-empty` | yaml-subset | the file has no content |
| `doc-not-map` | format | the document's top level is not a map |
| `version-missing` | format | the `isokit:` key is absent |
| `version-unsupported` | format | the `isokit:` value names a major this renderer does not implement |
| `key-unknown` | format | an undeclared key appears; the valid set is named |
| `key-missing` | format | a required key is absent |
| `type-mismatch` | format | a value's type doesn't match what the key expects |
| `enum-invalid` | format | a value isn't one of a key's closed set of options |
| `text-unsupported-char` | format | a string value contains an XML-unsafe character (`&`, `<`, `>`) |
| `units-empty` | units | `units:` has no entries; every diagram needs at least one unit |
| `name-collision` | units | a unit name and a group name collide |
| `estate-too-many` | estates | more than two estates are declared |
| `estate-multiple-dark` | estates | more than one estate declares `tone: dark` |
| `estate-unknown` | groups | a group's `estate` names an undeclared estate |
| `estate-straddle` | estates | no integer grid line separates the dark estate from the rest on either axis |
| `glyph-unsupported-shape` | units | a `glyph` is declared on a shape that doesn't carry glyphs |
| `group-unknown-unit` | groups | a group's `units` list names an undeclared unit |
| `group-empty` | groups | a group's `units` list is empty |
| `flow-unknown-unit` | flows | a flow's `from` or `to` names an undeclared unit |
| `annotation-unknown-unit` | annotations | an annotation key names an undeclared unit |
| `unit-unplaced` | units | a unit is in no group and has no pin |
| `unit-doubly-placed` | groups | a unit is both in a group and pinned, or in two groups |
| `placement-unknown-group` | placement | `placement.groups` names an undeclared group |
| `placement-unknown-unit` | placement | `placement.units` names an undeclared unit |
| `placement-unknown-flow` | placement | `placement.flows` matches no declared flow |
| `pin-off-grid` | placement | a pin or origin coordinate is not an integer |
| `content-off-canvas` | layout-derivation | a group or pinned unit projects to a negative screen coordinate and would render off-canvas |
| `engine-guard` | layout-derivation | an underlying engine hard error fired during derivation (see the message text for specifics) |
| `file-unreadable` | cli | the input file could not be read |
| `title-not-a-filename` | cli | the title contains a path separator or a leading `.` and cannot be used as an output filename without `-o` |

## JSON Schema

`schema/isokit-1.json` is a published JSON Schema mirroring the structural
layer of the validator: required/optional keys, types, and enums. It is not
consulted by the renderer — it exists for editor tooling (inline validation,
autocomplete) and as a machine-readable enumeration of the format.

What it checks: structure — required keys present, correct types, enum
membership, closed value sets.

What it does not check: references — it cannot know whether a flow's `from`
resolves to a declared unit, whether a unit is doubly-placed, or whether an
estate boundary exists. Those are the validator's job (`src/schema.ts`) and
only surface as the referential error codes above, never as a schema
failure. A document can be structurally schema-valid and still be a
referential error at validation time.

A drift-guard test (`tests/validate.ts`) replays validator fixtures through
this schema to keep the two in sync: every structurally-invalid fixture must
also fail the schema, and the reverse.

## Deferred to v2

The following are intentionally out of scope for v1 — named here so nothing
described only in a hand-tuned TypeScript layout becomes an orphaned,
undocumented concept:

- **Sub-groups** — one level of group nesting (e.g. availability-set boxes
  inside a subnet group).
- **Overlays** — a callout flag on a group producing a raised, depth-layered
  sheet, with geometry derived rather than authored.
- **Flow labels** and per-flow exit/enter edge hints.
- **Estate labels** — a caption for the estate itself, distinct from any
  group's label.
- **Richer auto-placement** — flow-aware origin ordering, once v1 pin
  patterns show what's worth deriving automatically.
