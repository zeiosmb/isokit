// src/schema.ts — the validator IS the format's source of truth. It walks
// the parsed YNode tree, rejects anything outside v1 with a coded error
// (unknown keys are errors, valid sets are enumerated in the message), and
// returns the typed Diagram the derivation layer consumes. The published
// schema/isokit-1.json mirrors only the structural half of this file.
import { IsokitError } from "./error.ts";
import type { YNode, YMap, YList } from "./yaml.ts";

export const SHAPE_NAMES = ["box", "slab", "panel", "cyl", "rack", "building", "wall",
  "queue", "store", "users", "laptop", "phone", "browser", "padlock", "monitor"] as const;
export const GLYPH_NAMES = ["gw", "app", "entra", "kv", "fn", "doc", "shield"] as const;
const THEME_NAMES = ["blueprint", "azure"] as const;
const STYLE_NAMES = ["request", "data", "sync"] as const;

export type ShapeName = typeof SHAPE_NAMES[number];
export type GlyphName = typeof GLYPH_NAMES[number];

export interface UnitDef { shape: ShapeName; glyph?: GlyphName; accent?: 1 | 2 | 3; line: number }
export interface GroupDef { label: string; units: string[]; estate?: string; line: number }
export interface FlowDef { from: string; to: string; style: "request" | "data" | "sync"; line: number }
export interface AnnotationDef { unit: string; title: string; note: string; line: number }
export interface GroupPlacement { origin: [number, number]; cols?: number; gap?: number; pad?: number; line: number }
export interface Diagram {
  title: string; theme: "blueprint" | "azure";
  estates: Map<string, { dark: boolean; line: number }>;
  units: Map<string, UnitDef>;
  groups: Map<string, GroupDef>;
  flows: FlowDef[];
  annotations: AnnotationDef[];
  placeGroups: Map<string, GroupPlacement>;
  placeUnits: Map<string, { at: [number, number]; line: number }>;
  placeFlows: { from: string; to: string; via: [number, number][]; line: number }[];
}

function err(code: string, section: string, node: { line: number } | number,
  path: string, what: string, fix: string): never {
  const line = typeof node === "number" ? node : node.line;
  throw new IsokitError({ code, section, line, path, what, fix });
}

function asMap(n: YNode, section: string, path: string): YMap {
  if (n.kind !== "map") err("type-mismatch", section, n, path,
    `expected a map here, got a ${n.kind}.`, "write key: value pairs (or {} for empty)");
  return n;
}
function asList(n: YNode, section: string, path: string): YList {
  if (n.kind !== "list") err("type-mismatch", section, n, path,
    `expected a list here, got a ${n.kind}.`, "write a [...] list or - items");
  return n;
}
function asStr(n: YNode, section: string, path: string): string {
  if (n.kind !== "scalar" || typeof n.value !== "string")
    err("type-mismatch", section, n, path, "expected a string here.", "quote the value if needed");
  if (/[&<>]/.test(n.value)) err("text-unsupported-char", section, n, path,
    `text "${n.value}" contains &, <, or > which v1 cannot embed in SVG safely.`,
    "rephrase without &, <, or >");
  return n.value;
}
function asNum(n: YNode, section: string, path: string): number {
  if (n.kind !== "scalar" || typeof n.value !== "number")
    err("type-mismatch", section, n, path, "expected a number here.", "write a plain number");
  return n.value;
}
function asInt(n: YNode, section: string, path: string): number {
  const v = asNum(n, section, path);
  if (!Number.isInteger(v)) err("type-mismatch", section, n, path,
    `expected an integer, got ${v}.`, "use a whole number");
  return v;
}
function asEnum<T extends string>(n: YNode, values: readonly T[], section: string, path: string): T {
  const v = asStr(n, section, path);
  if (!(values as readonly string[]).includes(v)) err("enum-invalid", section, n, path,
    `"${v}" is not valid here. Valid options: ${values.join(", ")}.`,
    `use one of: ${values.join(", ")}`);
  return v as T;
}
function asPair(n: YNode, section: string, path: string): [number, number] {
  const l = asList(n, section, path);
  if (l.items.length !== 2) err("type-mismatch", section, n, path,
    `expected [x, y], got ${l.items.length} item(s).`, "write a two-number pair like [4, 2]");
  return [asNum(l.items[0], section, path + "[0]"), asNum(l.items[1], section, path + "[1]")];
}
function get(m: YMap, key: string): YNode | undefined {
  return m.entries.find(([k]) => k === key)?.[1];
}
function need(m: YMap, key: string, section: string, path: string): YNode {
  const v = get(m, key);
  if (v === undefined) err("key-missing", section, m, path,
    `required key "${key}" is missing.`, `add ${key}: ...`);
  return v;
}
function noUnknown(m: YMap, allowed: readonly string[], section: string, path: string): void {
  for (const [k] of m.entries) {
    if (!allowed.includes(k)) err("key-unknown", section, m.keyLines.get(k)!, `${path}.${k}`,
      `unknown key "${k}". Valid keys: ${allowed.join(", ")}.`,
      `remove "${k}" or fix the spelling`);
  }
}

export function validate(doc: YNode): Diagram {
  if (doc.kind !== "map") throw new IsokitError({ code: "doc-not-map", section: "format",
    line: doc.line, path: "$", what: "the document root must be a map of top-level keys.",
    fix: "start the file with isokit: 1" });
  const ver = get(doc, "isokit");
  if (!ver) throw new IsokitError({ code: "version-missing", section: "format", line: doc.line,
    path: "isokit", what: 'the required version key "isokit" is missing.', fix: "add: isokit: 1" });
  if (ver.kind !== "scalar" || ver.value !== 1)
    err("version-unsupported", "format", ver, "isokit",
      `this renderer implements isokit format version 1; the file declares ${ver.kind === "scalar" ? ver.value : "a non-scalar"}.`,
      "set isokit: 1, or upgrade the renderer");
  noUnknown(doc, ["isokit", "title", "theme", "estates", "units", "groups",
    "flows", "annotations", "placement"], "format", "$");

  const title = asStr(need(doc, "title", "format", "title"), "format", "title");
  const theme = get(doc, "theme")
    ? asEnum(get(doc, "theme")!, THEME_NAMES, "format", "theme") : "blueprint";

  const estates = new Map<string, { dark: boolean; line: number }>();
  const eNode = get(doc, "estates");
  if (eNode) for (const [name, v] of asMap(eNode, "estates", "estates").entries) {
    const em = asMap(v, "estates", `estates.${name}`);
    noUnknown(em, ["tone"], "estates", `estates.${name}`);
    const tone = get(em, "tone");
    estates.set(name, { dark: tone ? asEnum(tone, ["dark"] as const, "estates",
      `estates.${name}.tone`) === "dark" : false, line: em.line });
  }

  const units = new Map<string, UnitDef>();
  const uNode = asMap(need(doc, "units", "units", "units"), "units", "units");
  if (uNode.entries.length === 0) err("units-empty", "units", uNode, "units",
    "units has no entries; every diagram needs at least one unit.",
    "add at least one unit under units:");
  for (const [name, v] of uNode.entries) {
    const um = asMap(v, "units", `units.${name}`);
    noUnknown(um, ["shape", "glyph", "accent"], "units", `units.${name}`);
    const u: UnitDef = {
      shape: asEnum(need(um, "shape", "units", `units.${name}.shape`), SHAPE_NAMES,
        "units", `units.${name}.shape`),
      line: um.line,
    };
    const g = get(um, "glyph");
    if (g) u.glyph = asEnum(g, GLYPH_NAMES, "units", `units.${name}.glyph`);
    const a = get(um, "accent");
    if (a) {
      const n = asInt(a, "units", `units.${name}.accent`);
      if (n < 1 || n > 3) err("enum-invalid", "units", a, `units.${name}.accent`,
        `accent ${n} is not valid. Valid options: 1, 2, 3.`, "use accent 1, 2, or 3");
      u.accent = n as 1 | 2 | 3;
    }
    units.set(name, u);
  }

  const groups = new Map<string, GroupDef>();
  const gNode = get(doc, "groups");
  if (gNode) for (const [name, v] of asMap(gNode, "groups", "groups").entries) {
    const gm = asMap(v, "groups", `groups.${name}`);
    noUnknown(gm, ["label", "units", "estate"], "groups", `groups.${name}`);
    const label = asStr(need(gm, "label", "groups", `groups.${name}.label`),
      "groups", `groups.${name}.label`);
    const unitsList = asList(need(gm, "units", "groups", `groups.${name}.units`),
      "groups", `groups.${name}.units`);
    const g: GroupDef = {
      label,
      units: unitsList.items.map((it, i) => asStr(it, "groups", `groups.${name}.units[${i}]`)),
      line: gm.line,
    };
    const estate = get(gm, "estate");
    if (estate) g.estate = asStr(estate, "groups", `groups.${name}.estate`);
    groups.set(name, g);
  }

  const flows: FlowDef[] = [];
  const fNode = get(doc, "flows");
  if (fNode) {
    const fl = asList(fNode, "flows", "flows");
    fl.items.forEach((v, i) => {
      const fm = asMap(v, "flows", `flows[${i}]`);
      noUnknown(fm, ["from", "to", "style"], "flows", `flows[${i}]`);
      const from = asStr(need(fm, "from", "flows", `flows[${i}].from`), "flows", `flows[${i}].from`);
      const to = asStr(need(fm, "to", "flows", `flows[${i}].to`), "flows", `flows[${i}].to`);
      const styleNode = get(fm, "style");
      const style = styleNode ? asEnum(styleNode, STYLE_NAMES, "flows", `flows[${i}].style`) : "request";
      flows.push({ from, to, style, line: fm.line });
    });
  }

  const annotations: AnnotationDef[] = [];
  const anNode = get(doc, "annotations");
  if (anNode) for (const [unit, v] of asMap(anNode, "annotations", "annotations").entries) {
    const am = asMap(v, "annotations", `annotations.${unit}`);
    noUnknown(am, ["title", "note"], "annotations", `annotations.${unit}`);
    const title = asStr(need(am, "title", "annotations", `annotations.${unit}.title`),
      "annotations", `annotations.${unit}.title`);
    const note = asStr(need(am, "note", "annotations", `annotations.${unit}.note`),
      "annotations", `annotations.${unit}.note`);
    annotations.push({ unit, title, note, line: am.line });
  }

  const placeGroups = new Map<string, GroupPlacement>();
  const placeUnits = new Map<string, { at: [number, number]; line: number }>();
  const placeFlows: { from: string; to: string; via: [number, number][]; line: number }[] = [];
  const plNode = get(doc, "placement");
  if (plNode) {
    const pm = asMap(plNode, "placement", "placement");
    noUnknown(pm, ["groups", "units", "flows"], "placement", "placement");

    const pgNode = get(pm, "groups");
    if (pgNode) for (const [name, v] of asMap(pgNode, "placement", "placement.groups").entries) {
      const gm = asMap(v, "placement", `placement.groups.${name}`);
      noUnknown(gm, ["origin", "cols", "gap", "pad"], "placement", `placement.groups.${name}`);
      const origin = asPair(need(gm, "origin", "placement", `placement.groups.${name}.origin`),
        "placement", `placement.groups.${name}.origin`);
      const p: GroupPlacement = { origin, line: gm.line };
      const cols = get(gm, "cols");
      if (cols) p.cols = asInt(cols, "placement", `placement.groups.${name}.cols`);
      const gap = get(gm, "gap");
      if (gap) p.gap = asInt(gap, "placement", `placement.groups.${name}.gap`);
      const pad = get(gm, "pad");
      if (pad) p.pad = asInt(pad, "placement", `placement.groups.${name}.pad`);
      placeGroups.set(name, p);
    }

    const puNode = get(pm, "units");
    if (puNode) for (const [name, v] of asMap(puNode, "placement", "placement.units").entries) {
      const at = asPair(v, "placement", `placement.units.${name}`);
      placeUnits.set(name, { at, line: v.line });
    }

    const pfNode = get(pm, "flows");
    if (pfNode) {
      const pfl = asList(pfNode, "placement", "placement.flows");
      pfl.items.forEach((v, i) => {
        const fm = asMap(v, "placement", `placement.flows[${i}]`);
        noUnknown(fm, ["from", "to", "via"], "placement", `placement.flows[${i}]`);
        const from = asStr(need(fm, "from", "placement", `placement.flows[${i}].from`),
          "placement", `placement.flows[${i}].from`);
        const to = asStr(need(fm, "to", "placement", `placement.flows[${i}].to`),
          "placement", `placement.flows[${i}].to`);
        const viaList = asList(need(fm, "via", "placement", `placement.flows[${i}].via`),
          "placement", `placement.flows[${i}].via`);
        const via = viaList.items.map((it, j) =>
          asPair(it, "placement", `placement.flows[${i}].via[${j}]`));
        placeFlows.push({ from, to, via, line: fm.line });
      });
    }
  }

  const GLYPH_SHAPES = new Set(["box", "slab"]);   // the only shapes that read kw.glyph
  for (const [name, u] of units) {
    if (u.glyph && !GLYPH_SHAPES.has(u.shape))
      err("glyph-unsupported-shape", "units", u, `units.${name}.glyph`,
        `shape "${u.shape}" does not render a glyph; only box and slab do.`,
        "remove the glyph, or use shape box or slab");
    if (groups.has(name)) err("name-collision", "units", u, `units.${name}`,
      `"${name}" names both a unit and a group; flows reference units by name, so this is ambiguous.`,
      "rename one of them");
  }
  if (estates.size > 2) err("estate-too-many", "estates", eNode!, "estates",
    `${estates.size} estates declared; v1 supports at most 2 (one light, one dark).`,
    "merge estates until at most one has tone: dark and at most one is default");
  const darks = [...estates.values()].filter(e => e.dark);
  if (darks.length > 1) err("estate-multiple-dark", "estates", darks[1], "estates",
    "more than one estate declares tone: dark; the ground has exactly one darker zone.",
    "keep tone: dark on a single estate");
  const owner = new Map<string, string>();          // unit -> group
  for (const [gname, g] of groups) {
    if (g.units.length === 0) err("group-empty", "groups", g, `groups.${gname}.units`,
      `group "${gname}" has no members.`, "add at least one unit, or delete the group");
    if (g.estate !== undefined && !estates.has(g.estate))
      err("estate-unknown", "groups", g, `groups.${gname}.estate`,
        `"${g.estate}" is not a declared estate. Declared: ${[...estates.keys()].join(", ") || "(none)"}.`,
        "declare it under estates:, or fix the spelling");
    for (const m of g.units) {
      if (!units.has(m)) err("group-unknown-unit", "groups", g, `groups.${gname}.units`,
        `"${m}" is not a declared unit. Declared units: ${[...units.keys()].join(", ")}.`,
        `add "${m}" under units:, or fix the spelling`);
      if (owner.has(m)) err("unit-doubly-placed", "groups", g, `groups.${gname}.units`,
        `unit "${m}" is already a member of group "${owner.get(m)}"; a unit lives in exactly one group.`,
        "remove it from one of the groups");
      owner.set(m, gname);
    }
  }
  for (const [name, p] of placeUnits) {
    if (!units.has(name)) err("placement-unknown-unit", "placement", p, `placement.units.${name}`,
      `"${name}" is not a declared unit. Declared units: ${[...units.keys()].join(", ")}.`,
      "fix the name, or declare the unit");
    if (owner.has(name)) err("unit-doubly-placed", "placement", p, `placement.units.${name}`,
      `unit "${name}" is a member of group "${owner.get(name)}" AND pinned; membership already places it.`,
      "remove the pin, or take the unit out of the group");
    if (!Number.isInteger(p.at[0]) || !Number.isInteger(p.at[1]))
      err("pin-off-grid", "placement", p, `placement.units.${name}`,
        `pin (${p.at[0]}, ${p.at[1]}) is not on integer grid cells.`,
        "units snap to whole-number cells; round the pin");
  }
  for (const name of units.keys()) {
    if (!owner.has(name) && !placeUnits.has(name)) {
      err("unit-unplaced", "units", units.get(name)!, `units.${name}`,
        `unit "${name}" is in no group and has no pin; every unit needs exactly one of the two.`,
        `add "${name}" to a group's units list, or pin it under placement.units`);
    }
  }
  for (const f of flows) {
    for (const end of ["from", "to"] as const) {
      if (!units.has(f[end])) err("flow-unknown-unit", "flows", f, `flows[].${end}`,
        `"${f[end]}" is not a declared unit. Declared units: ${[...units.keys()].join(", ")}.`,
        `change "${end}" to a declared name, or add "${f[end]}" under units:`);
    }
  }
  for (const a of annotations) {
    if (!units.has(a.unit)) err("annotation-unknown-unit", "annotations", a,
      `annotations.${a.unit}`,
      `"${a.unit}" is not a declared unit. Declared units: ${[...units.keys()].join(", ")}.`,
      "annotations are keyed by unit name; fix the key");
  }
  for (const [gname, p] of placeGroups) {
    if (!groups.has(gname)) err("placement-unknown-group", "placement", p,
      `placement.groups.${gname}`,
      `"${gname}" is not a declared group. Declared groups: ${[...groups.keys()].join(", ")}.`,
      "fix the name, or declare the group");
    if (!Number.isInteger(p.origin[0]) || !Number.isInteger(p.origin[1]))
      err("pin-off-grid", "placement", p, `placement.groups.${gname}.origin`,
        `origin (${p.origin[0]}, ${p.origin[1]}) is not on integer grid cells.`,
        "group origins snap to whole-number cells; round the origin");
  }
  for (const pf of placeFlows) {
    if (!flows.some(f => f.from === pf.from && f.to === pf.to))
      err("placement-unknown-flow", "placement", pf, "placement.flows",
        `no declared flow matches ${pf.from} -> ${pf.to}.`,
        "placement.flows entries must match a flows: entry by from/to");
  }

  return { title, theme, estates, units, groups, flows, annotations,
    placeGroups, placeUnits, placeFlows };
}
