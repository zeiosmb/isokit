// src/semantic.ts — maps the validated Diagram onto the engine in a fixed
// derivation order (SPEC.md "layout derivation"): group packing, origins,
// estate boundary, loose units, flows, annotations, canvas. Every engine
// guard fires through here wrapped as an IsokitError. Pure: no node: imports.
import { IsokitError } from "./error.ts";
import type { Diagram, GroupDef, ShapeName } from "./schema.ts";
import {
  setTheme, configure, resetUnits, unit, group, plane, autoLabel, connect,
  grid, svgOpen, renderUnits, runChecks, annotate, annotations, iso,
  MONOQ, INK, A1, A2, A3, GLYPHS,
  box, slab, panel, cyl, rack, building, wall, queue, store, users,
  laptop, phone, browser, padlock, monitor,
  tiers, crate, dashboard, docs, die, cluster,
} from "./isokit.ts";
import type { Kw } from "./isokit.ts";

type ShapeFn = (x: number, y: number, kw?: Kw) => string;
const SHAPES: Record<ShapeName, ShapeFn> = {
  box, slab, panel, cyl, rack, building, wall, queue, store, users,
  laptop, phone, browser, padlock, monitor,
  tiers, crate, dashboard, docs, die, cluster,
};

function guarded<T>(fn: () => T, line: number | undefined, path: string, fix: string): T {
  try { return fn(); }
  catch (e) {
    if (e instanceof IsokitError) throw e;
    throw new IsokitError({ code: "engine-guard", section: "layout-derivation",
      line, path, what: e instanceof Error ? e.message : String(e), fix });
  }
}

// mirror of group()'s packing math, without placing: [width, depth] in cells
export function packExtent(n: number, cols: number, gap: number): [number, number] {
  let cx = 0, cy = 0, rowD = 0, x1 = 0, y1 = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0 && i % cols === 0) { cx = 0; cy += rowD + gap; rowD = 0; }
    x1 = Math.max(x1, cx + 2); y1 = Math.max(y1, cy + 2);   // v1 units are all 2x2 cells
    cx += 2 + gap; rowD = Math.max(rowD, 2);
  }
  return [x1, y1];
}

interface GroupPlan { name: string; g: GroupDef; origin: [number, number];
  cols: number; gap: number; pad: number; rect?: [number, number, number, number] }

type Rect = [number, number, number, number];
const GROUP_GAP = 2;   // cells between auto-placed groups' cell rects (row and flow placement alike)

/** Flow-aware origins for every UNPINNED group (SPEC.md "Layout
derivation", step 2), or null when the document has no flow between two
different groups (row placement then applies unchanged). Unpinned groups
stack their members in one column (cols 1, gap 1) so a flow arriving from
the left reaches any member straight. Columns: each group sits one column
right of the groups feeding it (longest-path layering over group-level
flows; cycles broken at their first back-edge by a declaration-order DFS).
Rows: each group shifts so the member its first placed feeder flows into
sits level with that feeder; groups that would overlap anything already
placed (auto, pinned, or loose pins) push down to clear it by GROUP_GAP. */
export function flowOrigins(d: Diagram): Map<string, [number, number]> | null {
  const owner = new Map<string, string>();
  for (const [gn, g] of d.groups) for (const u of g.units) owner.set(u, gn);
  const names = [...d.groups.keys()];
  const auto = names.filter(n => !d.placeGroups.has(n));
  const edges = d.flows.map(f => [owner.get(f.from), owner.get(f.to)] as const)
    .filter((e): e is readonly [string, string] => !!e[0] && !!e[1] && e[0] !== e[1]);
  if (!edges.length || !auto.length) return null;

  const succ = new Map(names.map(n => [n, [] as string[]]));
  for (const [a, b] of edges) if (!succ.get(a)!.includes(b)) succ.get(a)!.push(b);
  const state = new Map<string, 1 | 2>();
  const back = new Set<string>();
  const dfs = (n: string): void => {
    state.set(n, 1);
    for (const m of succ.get(n)!) {
      if (state.get(m) === 1) back.add(`${n}\0${m}`);
      else if (!state.has(m)) dfs(m);
    }
    state.set(n, 2);
  };
  for (const n of names) if (!state.has(n)) dfs(n);
  const layer = new Map(names.map(n => [n, 0]));
  for (let i = 0; i < names.length; i++) {          // longest path; a DAG settles in n passes
    for (const [a, b] of edges) {
      if (!back.has(`${a}\0${b}`)) layer.set(b, Math.max(layer.get(b)!, layer.get(a)! + 1));
    }
  }

  // member cell offsets inside a packed group (mirror of group()'s packing)
  const colsOf = (n: string) => d.placeGroups.get(n)?.cols ?? (d.placeGroups.has(n) ? Math.ceil(Math.sqrt(d.groups.get(n)!.units.length)) : 1);
  const gapOf = (n: string) => d.placeGroups.get(n)?.gap ?? 1;
  const offset = (gn: string, unit: string): [number, number] => {
    const i = d.groups.get(gn)!.units.indexOf(unit), c = colsOf(gn), step = 2 + gapOf(gn);
    return [(i % c) * step, Math.floor(i / c) * step];
  };
  const extent = (gn: string) => packExtent(d.groups.get(gn)!.units.length, colsOf(gn), gapOf(gn));

  const origin = new Map<string, [number, number]>();
  for (const [n, p] of d.placeGroups) if (d.groups.has(n)) origin.set(n, p.origin);
  const occupied: Rect[] = [];
  for (const [n, o] of origin) { const [w, h] = extent(n); occupied.push([o[0], o[1], o[0] + w, o[1] + h]); }
  for (const [, pin] of d.placeUnits) occupied.push([pin.at[0], pin.at[1], pin.at[0] + 2, pin.at[1] + 2]);
  const unitPos = (u: string): [number, number] | null => {
    const g = owner.get(u);
    if (g === undefined) { const p = d.placeUnits.get(u); return p ? p.at : null; }
    const o = origin.get(g);
    if (!o) return null;
    const [ox, oy] = offset(g, u);
    return [o[0] + ox, o[1] + oy];
  };

  const maxLayer = Math.max(...auto.map(n => layer.get(n)!));
  const colX: number[] = [1];
  for (let l = 0; l < maxLayer; l++) {
    const w = Math.max(2, ...auto.filter(n => layer.get(n) === l).map(n => extent(n)[0]));
    colX.push(colX[l] + w + GROUP_GAP);
  }
  const order = auto.slice().sort((a, b) => layer.get(a)! - layer.get(b)! || names.indexOf(a) - names.indexOf(b));
  for (const n of order) {
    const [w, h] = extent(n);
    const x = colX[layer.get(n)!];
    let y = 1;
    for (const f of d.flows) {
      if (owner.get(f.to) !== n || owner.get(f.from) === n) continue;
      const src = unitPos(f.from);
      if (src) { y = src[1] - offset(n, f.to)[1]; break; }
    }
    for (let moved = true; moved;) {
      moved = false;
      for (const r of occupied) {
        if (x < r[2] + GROUP_GAP && r[0] < x + w + GROUP_GAP && y < r[3] + GROUP_GAP && r[1] < y + h + GROUP_GAP) {
          y = r[3] + GROUP_GAP; moved = true;
        }
      }
    }
    origin.set(n, [x, y]);
    occupied.push([x, y, x + w, y + h]);
  }
  const autoOrigins = new Map(auto.map(n => [n, origin.get(n)!] as [string, [number, number]]));
  const minY = Math.min(...[...autoOrigins.values()].map(o => o[1]));
  if (minY < 1) for (const o of autoOrigins.values()) o[1] += 1 - minY;
  return autoOrigins;
}

/** Render a validated diagram. Flow-aware placement is tried first when it
applies; if that layout trips any guard (estate seam, off-canvas, engine
collision), derivation reruns with row placement — so every document that
rendered under row placement still renders. `flowAware: false` forces rows. */
export function derive(d: Diagram, opts: { flowAware?: boolean } = {}): string {
  const fo = opts.flowAware === false ? null : flowOrigins(d);
  if (fo) {
    try { return deriveWith(d, fo); }
    catch (e) { if (!(e instanceof IsokitError)) throw e; }
  }
  return deriveWith(d, null);
}

function deriveWith(d: Diagram, flow: Map<string, [number, number]> | null): string {
  setTheme(d.theme);
  configure(46, 440, 48);
  resetUnits();

  // --- plan group origins: pinned origins win verbatim; unpinned groups are
  // auto-placed in declaration order, split by estate into two rows (Task 10
  // derivation policy, normative — see SPEC.md "layout derivation") ---
  const plans: GroupPlan[] = [];
  const darkNames = new Set([...d.estates].filter(([, e]) => e.dark).map(([n]) => n));
  const isDark = (g: GroupDef) => g.estate !== undefined && darkNames.has(g.estate);
  const defaultRow: GroupPlan[] = [];
  const darkRow: GroupPlan[] = [];
  for (const [name, g] of d.groups) {
    const p = d.placeGroups.get(name);
    const fo = flow?.get(name);
    const cols = p?.cols ?? (fo ? 1 : Math.ceil(Math.sqrt(g.units.length)));
    const gap = p?.gap ?? 1, pad = p?.pad ?? 0.6;
    const pl: GroupPlan = { name, g, origin: p?.origin ?? fo ?? [0, 0], cols, gap, pad };
    plans.push(pl);
    if (!p && !fo) (isDark(g) ? darkRow : defaultRow).push(pl);
  }
  const place = (row: GroupPlan[], y: number, x0: number): void => {
    let cx = x0;
    for (const pl of row) {
      pl.origin = [cx, y];
      cx += packExtent(pl.g.units.length, pl.cols, pl.gap)[0] + 2;
    }
  };
  place(defaultRow, 1, 1);
  // extent of everything in the default estate: auto-placed + pinned groups,
  // plus default-estate loose unit pins (loose pins belong to the default
  // estate per policy step 6)
  const cellRect = (pl: GroupPlan): [number, number, number, number] =>
    [pl.origin[0], pl.origin[1],
      pl.origin[0] + packExtent(pl.g.units.length, pl.cols, pl.gap)[0],
      pl.origin[1] + packExtent(pl.g.units.length, pl.cols, pl.gap)[1]];
  let maxY = 0;
  for (const pl of plans) if (!isDark(pl.g)) maxY = Math.max(maxY, Math.ceil(cellRect(pl)[3]));
  for (const [, pin] of d.placeUnits) maxY = Math.max(maxY, pin.at[1] + 2);
  place(darkRow, maxY + 3, 1);

  // --- estate boundary: the first integer grid line (y scanned before x)
  // that puts every default-estate cell rect (incl. loose pins) on one side
  // and every dark-estate cell rect on the other (policy step 5). Derived
  // from planned origins alone (mirrors group()'s packing math), so a
  // straddling pin is reported as estate-straddle before it can also trip
  // the engine's own unit-overlap guard below. ---
  let seam: ["x" | "y", number] | null = null;
  const darkPlans = plans.filter(pl => isDark(pl.g));
  if (darkPlans.length) {
    const defaultPlans = plans.filter(pl => !isDark(pl.g));
    const loosePinsY = [...d.placeUnits.values()].map(p => p.at[1] + 2);   // loose pins are default estate
    const loosePinsX = [...d.placeUnits.values()].map(p => p.at[0] + 2);

    const defaultBottomsY = defaultPlans.map(pl => cellRect(pl)[3]);
    const darkTopsY = darkPlans.map(pl => cellRect(pl)[1]);
    // policy step 5: the scan starts one past the deepest default-estate
    // bottom (maxY + 1), never AT it — a seam at maxY would run under the
    // default row's 0.6-cell plane pad, letting dark ground bleed through.
    const yLo = Math.max(0, ...defaultBottomsY, ...loosePinsY) + 1;
    const yHi = Math.max(...defaultBottomsY, ...loosePinsY, ...darkTopsY);
    for (let b = yLo; b <= yHi && !seam; b++) {
      const ok = defaultBottomsY.every(y1 => y1 <= b)
        && loosePinsY.every(y => y <= b)
        && darkTopsY.every(y0 => y0 >= b);
      if (ok) seam = ["y", b];
    }

    if (!seam) {
      const defaultRightsX = defaultPlans.map(pl => cellRect(pl)[2]);
      const darkLeftsX = darkPlans.map(pl => cellRect(pl)[0]);
      // mirror of the y-scan floor: one past the rightmost default-estate
      // edge, so the seam clears the plane pad on the x axis too.
      const xLo = Math.max(0, ...defaultRightsX, ...loosePinsX) + 1;
      const xHi = Math.max(...defaultRightsX, ...loosePinsX, ...darkLeftsX);
      for (let b = xLo; b <= xHi && !seam; b++) {
        const ok = defaultRightsX.every(x1 => x1 <= b)
          && loosePinsX.every(x => x <= b)
          && darkLeftsX.every(x0 => x0 >= b);
        if (ok) seam = ["x", b];
      }
    }

    if (!seam) {
      const bad = darkPlans.map(pl => pl.name).join(", ");
      throw new IsokitError({ code: "estate-straddle", section: "estates",
        line: darkPlans[0].g.line, path: "estates",
        what: `no integer grid line separates the dark estate (${bad}) from the rest of the diagram on either axis.`,
        fix: "move the pinned origins so the dark-estate groups sit fully below (greater y) or fully to the right (greater x) of everything else" });
    }
  }

  // --- canvas: project every cell rect's corners; grow past the floor only
  // (origins are already planned above — this is pure origin+packExtent
  // math, so it can run before any engine registration) ---
  const rects: [number, number, number, number][] = [];
  const rectOwners: { name: string; line?: number; path: string }[] = [];
  for (const pl of plans) {
    const [w, dep] = packExtent(pl.g.units.length, pl.cols, pl.gap);
    rects.push([pl.origin[0], pl.origin[1], pl.origin[0] + w, pl.origin[1] + dep]);
    rectOwners.push({ name: pl.name, line: pl.g.line, path: `groups.${pl.name}` });
  }
  for (const [uname, pin] of d.placeUnits) {
    rects.push([pin.at[0], pin.at[1], pin.at[0] + 2, pin.at[1] + 2]);
    rectOwners.push({ name: uname, line: pin.line, path: `placement.units.${uname}` });
  }
  let mx = 0, my = 0, maxCellX = 0, maxCellY = 0;
  let mnx = Infinity, mny = Infinity;
  let offender: { name: string; line?: number; path: string } | undefined;
  for (let ri = 0; ri < rects.length; ri++) {
    const [x0, y0, x1, y1] = rects[ri];
    maxCellX = Math.max(maxCellX, x1); maxCellY = Math.max(maxCellY, y1);
    for (const [px, py] of [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1), iso(x1, y1, 2)]) {
      mx = Math.max(mx, px); my = Math.max(my, py);
      if (px < mnx) { mnx = px; offender = rectOwners[ri]; }
      if (py < mny) { mny = py; offender = offender ?? rectOwners[ri]; }
    }
  }
  if (Math.floor(mnx) < 0 || Math.floor(mny) < 0) {
    const axis = Math.floor(mnx) < 0 ? "x" : "y";
    const coord = axis === "x" ? mnx : mny;
    throw new IsokitError({ code: "content-off-canvas", section: "layout-derivation",
      line: offender?.line, path: offender?.path,
      what: `"${offender?.name ?? "content"}" projects to a negative screen ${axis} `
        + `coordinate (${Math.round(coord)}) and would render off-canvas.`,
      fix: "shift pins so every unit projects on-canvas — reduce y or increase x on the leftmost content" });
  }
  const railW = d.annotations.length ? 346 : 0;
  const W = Math.max(1400, Math.ceil(mx) + 60 + railW);
  const H = Math.max(700, Math.ceil(my) + 40);

  // --- register units: groups first (declaration order), then loose pins ---
  // (registration must precede connect()/autoLabel() emission below, but
  // must follow svgOpen(), which resets the label/plane/chip registries) ---
  const kwFor = (uname: string): Kw => {
    const u = d.units.get(uname)!;
    const kw: Kw = {};
    if (u.accent) kw.rim = [A1, A2, A3][u.accent - 1];
    if (u.glyph) kw.glyph = GLYPHS[u.glyph];
    if (u.label !== undefined) kw.label = u.label;
    return kw;
  };

  // --- emit in visual order ---
  const S = svgOpen(W, H);
  for (const pl of plans) {
    pl.rect = guarded(() => group(pl.origin,
      pl.g.units.map(m => [m, SHAPES[d.units.get(m)!.shape], kwFor(m)] as [string, ShapeFn, Kw]),
      { cols: pl.cols, gap: pl.gap, pad: pl.pad }),
      pl.g.line, `groups.${pl.name}`,
      "move the group origin, reduce cols, or unpin a colliding unit");
  }
  for (const [uname, pin] of d.placeUnits) {
    guarded(() => unit(uname, SHAPES[d.units.get(uname)!.shape], pin.at[0], pin.at[1], kwFor(uname)),
      pin.line, `placement.units.${uname}`,
      "move the pin to a free integer cell");
  }

  S.push(grid({
    x1: Math.max(18, maxCellX + 3), y1: Math.max(16, maxCellY + 3),
    clip_w: W - railW, clip_h: H, seam,
  }));
  const labelAt: number[] = [];   // S index right after each group's plane
  for (const pl of plans) {
    S.push(guarded(() => plane(...pl.rect!), pl.g.line, `groups.${pl.name}`,
      "adjust the group origin or pad"));
    labelAt.push(S.length);
  }
  for (const f of d.flows) {
    const pfi = d.placeFlows.findIndex(p => p.from === f.from && p.to === f.to);
    const pf = pfi !== -1 ? d.placeFlows[pfi] : undefined;
    const via = pf?.via ?? null;
    const line = pf ? pf.line : f.line;
    const path = pf ? `placement.flows[${pfi}]` : `flows (${f.from} -> ${f.to})`;
    const fix = pf ? "make each via segment axis-aligned with its neighbors"
      : "add via waypoints under placement.flows, or move the units apart";
    S.push(guarded(() => connect(f.from, f.to, via ? { style: f.style, via } : { style: f.style }),
      line, path, fix));
  }
  // captions are PLACED after every flow is declared (autoLabel can only
  // avoid what already exists — STYLE.md), but their markup stays beside
  // each plane in paint order; splice back-to-front so indices hold
  const labels = plans.map(pl => guarded(() => autoLabel(pl.g.label, pl.rect!), pl.g.line,
    `groups.${pl.name}.label`, "shorten the label or enlarge the group"));
  for (let i = plans.length - 1; i >= 0; i--) S.splice(labelAt[i], 0, labels[i]);
  S.push(renderUnits());
  if (d.annotations.length) {
    for (const a of d.annotations) {
      guarded(() => annotate(a.unit, a.title, a.note), a.line, `annotations.${a.unit}`,
        "shorten the note, or resolve the collision the message describes");
    }
    S.push(guarded(() => annotations({ x: W - 346 }), d.annotations[0].line, "annotations",
      "fewer/shorter annotations, or unpin crowded units"));
  }
  S.push(`<text x="40" y="52" font-family=${MONOQ} font-size="24" font-weight="700" fill="${INK}">${d.title}</text>`);

  guarded(() => runChecks(), undefined, "$",
    "a collision guard fired; adjust pins or shorten labels per the message");
  return S.concat(["</svg>"]).join("\n");
}
