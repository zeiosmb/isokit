# TypeScript Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the isokit renderer (680-line pure-stdlib Python) to TypeScript with byte-identical output verified by golden-master tests, then delete the Python implementation.

**Architecture:** One-to-one port: a single `src/isokit.ts` module mirroring `src/isokit/__init__.py` function-for-function, three layout scripts ported to `.ts`, run directly by Node ≥ 23.6 native type stripping (no build step, no runtime deps). Golden masters are generated from the Python implementation *before* deletion; the TS port must reproduce them byte-for-byte. Guard (error-path) behavior is covered by a separate test since golden masters only exercise successful renders.

**Tech Stack:** TypeScript (erasable syntax only — Node type stripping), Node 24, `typescript` as the only devDependency (typecheck only), `xmllint` (system) for output validation.

**Spec:** `src/isokit/__init__.py` at commit `2f46dd2` — the Python file IS the spec for the port. `STYLE.md` documents the grammar. This plan lists every known Python↔JS semantic divergence; the port is otherwise a literal translation.

## Global Constraints

- **NO git commits at any point.** User reviews all changes themself (global CLAUDE.md rule). The Python prototype is already recoverable from commit `2f46dd2`.
- Byte-identical SVG output vs. Python golden masters is the acceptance bar for the renderer.
- Every `raise ValueError(...)` guard in the Python must exist in TS (`throw new Error(...)`) with equivalent message text; all guards covered by `tests/errors.ts`.
- No runtime npm dependencies. `typescript` devDependency only.
- Node native TS: `"type": "module"`, imports use explicit `.ts` extensions, erasable syntax only (no enums, no namespaces, no parameter properties).
- Golden masters live in `tests/golden/` and stay in the repo as permanent regression fixtures after the Python is deleted.
- Never write to the user's real output dir (`isokit.local` → Obsidian). All test renders use `ISOKIT_OUT` pointed inside `tests/`.

## Known Python↔JS divergences (the actual hard part)

1. **`f"{x:.1f}"` rounds half-to-even; JS `toFixed` rounds ties away.** Ties are real: iso Y coords land on exact quarters (e.g. `88.25` → Python `88.2`, JS `88.3`). Fix: `pyf(x, nd)` — exact BigInt decimal rounding of the IEEE double with round-half-even (code in Task 2).
2. **Negative zero:** Python `f"{-0.0:.1f}"` → `-0.0`; JS `(-0).toFixed(1)` → `0.0`. Occurs in `padlock` (`dX * t` with `t = 0.0`). `pyf` takes sign from the double's sign bit.
3. **`{MONO!r}`** (Python repr) → the literal string `"'JetBrains Mono',Menlo,monospace"` **with double quotes** since the value contains single quotes. Port as constant `MONOQ`.
4. **Dict insertion order / stable sort:** `_UNITS` → `Map`; `render_units()` sorts by `dx+dy` — JS sort is stable, Map preserves insertion; equivalent.
5. **`sorted(set(points))`** in `_hull` → dedupe exact `(x, y)` pairs, lexicographic sort (x then y, numeric).
6. **kwargs → options objects.** Attribute emission order = object key insertion order (matches Python kwargs order). Keep `stroke_width`-style keys; `_`→`-` replacement as in Python.
7. **Bare `{v}` interpolation of numbers** (attr values): all actual values are literals like `0.5`, `2.5`, `1` where `String(v)` matches Python `str()`. (Divergence only for whole-number floats like `1.0` — not present.)
8. **libm differences** (`**0.5`/pow, cos, sin, atan2 — V8 vs. macOS libm) can differ in the last ulp. Formatting at 1–3 decimals absorbs this except at razor-edge rounding boundaries. Not pre-fixable; the golden byte-diff is the detector. If a diff appears, inspect whether it is a tie-adjacent ulp and resolve case-by-case.
9. **Theme globals:** Python mutates module globals via `globals().update(...)` (hence "set_theme before from-import"). TS uses ESM **live bindings**: `export let INK = ...`, reassigned by `setTheme()` — importers always see current values; the Python ordering gotcha disappears.
10. **`float(at).is_integer()`** → `Number.isInteger(at)`.
11. **`subprocess curl`** (font fetch) → Node `fetch` + `fs.writeFileSync` to the same `/tmp/jbm{400,700}.woff2` cache paths (byte-identical base64 given identical files). **`xmllint --noout`** → `spawnSync("xmllint", ...)` unchanged.
12. **`print("valid", size // 1024, "KB", path)`** → `console.log` with `Math.floor(size / 1024)`.

## File Structure

- Create: `package.json`, `tsconfig.json` — scaffold (Task 1)
- Create: `src/isokit.ts` — the entire renderer, mirroring `src/isokit/__init__.py` top-to-bottom (Tasks 2–3)
- Create: `layouts/azure_lob.ts`, `layouts/components.ts`, `layouts/hybrid_onprem_azure.ts` — 1:1 ports (Task 4)
- Create: `tests/golden/*.svg` (from Python, Task 1), `tests/pyfmt.ts` (Task 2), `tests/errors.ts` (Task 5), `tests/check-golden.sh` (Task 4)
- Delete: `src/isokit/__init__.py`, `src/isokit/` dir, `layouts/*.py`, `pyproject.toml` (Task 6)
- Modify: `README.md`, `ROADMAP.md`, `STYLE.md` — usage commands, generator references, and the now-reversed "JS port: deferred indefinitely" decision (Task 6)

### Task 1: Golden masters + scaffold

**Files:** Create `tests/golden/` (3 SVGs), `package.json`, `tsconfig.json`.

- [ ] **Step 1: Generate golden masters from Python (MUST happen before any deletion)**

```bash
cd /Users/micahburnett/code/zeiosmb/isokit
ISOKIT_OUT=$PWD/tests/golden python3 layouts/azure_lob.py
ISOKIT_OUT=$PWD/tests/golden python3 layouts/components.py
ISOKIT_OUT=$PWD/tests/golden python3 layouts/hybrid_onprem_azure.py
```

Expected: three lines starting `valid`, three SVGs in `tests/golden/`.

- [ ] **Step 2: Capture Python formatting oracle for pyf tests**

Run a Python one-liner emitting `value:.Nf` expectations for tie cases, `-0.0`, and representative coords (e.g. `88.25→88.2`, `88.75→88.8`, `288.5:.0f→288`, `289.5:.0f→290`, `-0.04:.1f→-0.0`, `-0.0:.3f→-0.000`); paste the table into `tests/pyfmt.ts` in Task 2.

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "isokit",
  "version": "0.1.0",
  "type": "module",
  "license": "Apache-2.0",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node tests/pyfmt.ts && node tests/errors.ts && bash tests/check-golden.sh"
  },
  "devDependencies": { "typescript": "^5.7.0" }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "erasableSyntaxOnly": true,
    "strict": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "layouts/**/*.ts", "tests/**/*.ts"]
}
```

(Add `@types/node` devDependency if `tsc` needs it; `npm install` once.)

### Task 2: `pyf` — Python-compatible float formatting

**Files:** Create `src/isokit.ts` (formatting section only), `tests/pyfmt.ts`.

**Interfaces — Produces:** `pyf(x: number, nd: number): string` — exact equivalent of Python `f"{x:.{nd}f}"` for finite doubles (round-half-even, sign bit preserved for `-0.0`-class results).

- [ ] **Step 1: Write failing test `tests/pyfmt.ts`** — the Python-oracle table from Task 1 Step 2, plus a random-sweep section if desired:

```ts
import { pyf } from "../src/isokit.ts";
const cases: [number, number, string][] = [
  [88.25, 1, "88.2"], [88.75, 1, "88.8"], [0.05, 1, "0.1"],
  [288.5, 0, "288"], [289.5, 0, "290"],
  [-0.04, 1, "-0.0"], [-0.0, 1, "-0.0"], [-0.0, 3, "-0.000"],
  [1.25, 1, "1.2"], [1.35, 1, "1.4"],  // note: 1.35 is not an exact tie in binary — verify against oracle
  [39.836, 1, "39.8"], [463.0, 1, "463.0"],
];
let fail = 0;
for (const [x, nd, want] of cases) {
  const got = pyf(x, nd);
  if (got !== want) { console.error(`pyf(${x}, ${nd}) = ${got}, want ${want}`); fail++; }
}
if (fail) process.exit(1);
console.log(`pyfmt: ${cases.length} cases ok`);
```

(Replace/extend the table with actual oracle output — every `want` must come from Python, not from intuition.)

- [ ] **Step 2: Run to verify it fails** — `node tests/pyfmt.ts` → module/function not found.

- [ ] **Step 3: Implement `pyf` in `src/isokit.ts`**

```ts
export function pyf(x: number, nd: number): string {
  // Python f"{x:.{nd}f}": exact decimal rounding of the IEEE-754 double,
  // round-half-even, sign taken from the sign bit (so -0.0-class -> "-0.0").
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const bits = dv.getBigUint64(0);
  const neg = bits >> 63n === 1n;
  const rawExp = Number((bits >> 52n) & 0x7ffn);
  let mant = bits & 0xfffffffffffffn;
  let exp: number;
  if (rawExp === 0) exp = -1074;
  else { mant |= 0x10000000000000n; exp = rawExp - 1075; }
  const scale = 10n ** BigInt(nd);
  let num: bigint, den: bigint;
  if (exp >= 0) { num = mant * scale << BigInt(exp); den = 1n; }
  else { num = mant * scale; den = 1n << BigInt(-exp); }
  let q = num / den;
  const twiceR = (num - q * den) * 2n;
  if (twiceR > den || (twiceR === den && (q & 1n) === 1n)) q += 1n;
  const s = q.toString().padStart(nd + 1, "0");
  const body = nd ? `${s.slice(0, -nd)}.${s.slice(-nd)}` : s;
  return neg ? `-${body}` : body;
}
```

- [ ] **Step 4: Run test** — `node tests/pyfmt.ts` → all cases ok.

### Task 3: Port the renderer (`src/isokit.ts`)

**Files:** Extend `src/isokit.ts` to the full library.

**Interfaces — Produces (used by layouts and tests):** `setTheme(name)`, `configure({u, ox, oy})`, `iso(x, y, z?)`, `pts`, `poly`, `pline`, `zrect`, `inset`, `svgOpen(w, h)`, `grid(opts)`, `plane`, `planeLabel`, `flow`, `plate`, live-bound theme tokens (`INK`, `INK2`, `A1`, `A2`, `A3`, `MONO`, `MONOQ`, …), `GLYPHS`, shapes (`box`, `slab`, `panel`, `cyl`, `rack`, `building`, `wall`, `queue`, `store`, `person`, `personDevice`, `laptop`, `screenSlab`, `phone`, `browser`, `padlock`, `monitor`, `users`), registry (`resetUnits`, `unit`, `renderUnits`, `edgePt`, `connect`), narrative (`chip`, `annotate`, `annotations`, `wrap`, `legend`), IO (`out`, `write`).

Naming: exported API camelCase; keep option keys identical to Python kwargs (`with_plate`, `stroke_width`, `heads`, `dot`, …) so attribute order and layout-script translation stay mechanical.

- [ ] **Step 1: Port section-by-section, top-to-bottom, preserving order and string templates exactly.** Python line ranges → sections: themes (l.22–57), projection+primitives (l.60–77), fonts+svg_open (l.80–98), grid/plane/plane_label (l.100–132), flow/plate (l.137–163), glyphs (l.168–195), solids (l.198–363), devices/people (l.366–467), unit registry (l.476–526), narrative (l.530–657), out/write (l.659–681). Every `f"...{v:.1f}..."` becomes `${pyf(v, 1)}`; every `{v:.3f}` → `${pyf(v, 3)}`; `{v:.0f}` → `${pyf(v, 0)}`; bare `{v}` → `${v}`. All divergences list items 3–12 apply.
- [ ] **Step 2: Typecheck** — `npm run typecheck` → clean.
- [ ] **Step 3: Smoke render** — minimal inline script exercising `svgOpen` + one `box` + `write`; confirm `valid` output via xmllint.

### Task 4: Port the three layouts + golden harness

**Files:** Create `layouts/azure_lob.ts`, `layouts/components.ts`, `layouts/hybrid_onprem_azure.ts`, `tests/check-golden.sh`.

- [ ] **Step 1: Port each layout 1:1** (imports become `import { ... } from "../src/isokit.ts"`; `set_theme("azure")` → `setTheme("azure")` — live bindings make ordering moot; `lambda` slots → arrow functions; keep every literal identical).
- [ ] **Step 2: Write `tests/check-golden.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf tests/out && mkdir -p tests/out
for f in layouts/*.ts; do ISOKIT_OUT=$PWD/tests/out node "$f"; done
fail=0
for g in tests/golden/*.svg; do
  if cmp -s "$g" "tests/out/$(basename "$g")"; then echo "IDENTICAL $(basename "$g")";
  else echo "DIFFERS   $(basename "$g")"; fail=1; fi
done
exit $fail
```

- [ ] **Step 3: Run to verify current state** — expect DIFFERS or crashes on first run.
- [ ] **Step 4: Iterate until all three print IDENTICAL.** Debug protocol for a DIFFERS: `diff <(fold -w120 golden) <(fold -w120 out) | head` to localize; classify each diff as (a) port bug — fix the port, or (b) libm ulp at a rounding boundary (divergence #8) — document and decide (acceptable only if visually identical AND recorded in the plan; goal remains zero).

### Task 5: Error-path (guard) tests

**Files:** Create `tests/errors.ts`.

- [ ] **Step 1: Write `tests/errors.ts`** asserting every guard throws, message checked by substring:
  1. `grid({seam: ["y", 9.5]})` → `seam coordinate must be an integer grid line`
  2. `flow` diagonal segment → `is diagonal; route via axis-aligned waypoints`
  3. `unit` non-integer position → `position must snap to grid cells`
  4. `unit` shape too big for cells → `exceeds its`
  5. `unit` overlap → `overlaps`
  6. `edgePt` bad side → throws
  7. `annotate` unknown unit → `no such unit`
  8. `annotate` duplicate → `already annotated`
  9. `legend` overflow (tiny canvas via `svgOpen(1400, 200)` + long entries) → `legend content reaches`

Harness pattern:

```ts
import { setTheme, configure, svgOpen, grid, flow, unit, resetUnits, annotate, edgePt, legend, A2, box } from "../src/isokit.ts";
let fail = 0;
function expectThrow(name: string, fn: () => unknown, needle: string) {
  try { fn(); console.error(`${name}: did not throw`); fail++; }
  catch (e) { if (!String(e).includes(needle)) { console.error(`${name}: wrong message: ${e}`); fail++; } }
}
// ...one expectThrow per guard, resetUnits() between registry cases...
if (fail) process.exit(1);
console.log("errors: all guards ok");
```

- [ ] **Step 2: Run** — `node tests/errors.ts` → all guards ok. Fix any guard the port missed.

### Task 6: Delete Python, update docs

**Files:** Delete `src/isokit/`, `layouts/*.py`, `pyproject.toml`. Modify `README.md`, `ROADMAP.md`, `STYLE.md`, `.gitignore` (if it lists Python artifacts).

- [ ] **Step 1: Pre-deletion gate** — re-run full suite (`npm run test`): pyfmt ok, guards ok, three IDENTICAL. Confirm `git ls-tree -r HEAD` still lists the Python files (recoverable). Only then delete.
- [ ] **Step 2: Delete** `src/isokit/__init__.py` + dir, the three `.py` layouts, `pyproject.toml`.
- [ ] **Step 3: README.md** — usage `python3 layouts/x.py` → `node layouts/x.ts`; "plain-Python layout scripts" wording; layouts table `.py` → `.ts`; note Node ≥ 23.6 requirement.
- [ ] **Step 4: ROADMAP.md** — record the reversal: TS is now the implementation (Python prototype in commit `2f46dd2`); Phase 4 no longer needs Pyodide (drop the ~10 MB caveat; rendering is a small JS bundle); Obsidian plugin de-risked; update "Explicitly rejected / deferred" entry for the JS port and the "Agents author plain-Python scripts" phrasing where it appears. Keep decision history honest — state it was reversed 2026-08-28 and why (port cost measured small; Python had no intrinsic advantage; single codebase preserved by replacement, not duplication).
- [ ] **Step 5: STYLE.md** — scan for `python`/`.py`/`isokit.py` references and update to the TS equivalents (grammar/geometry content is language-neutral and stays).
- [ ] **Step 6: Final verification** — `npm run test` green; `git status` reviewed; **no commit** (user reviews).

## Self-Review Notes

- Spec coverage: every Python def is assigned to a Task 3 section; guards enumerated in Task 5 match every `raise` in the source (grid seam, flow diagonal, unit snap/size/overlap, edge_pt side, annotate ×2, legend overflow — 9 total ✓).
- Types consistent: `pyf` defined Task 2, consumed Task 3; layout imports match Task 3's export list.
- The literal port body is not inlined here by design: the pinned Python source is the spec and a full transcription would duplicate it; the divergence list is the part that needs a plan.
