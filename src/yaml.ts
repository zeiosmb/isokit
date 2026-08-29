// src/yaml.ts — strict YAML-subset parser. Block maps; block lists whose
// items are single-line values; inline {...}/[...] (Task 5); plain, single-
// and double-quoted scalars; comments. Everything outside the subset is a
// line-numbered IsokitError — never a guess. Zero deps, no node: imports.
import { IsokitError } from "./error.ts";

export type YScalar = { kind: "scalar"; line: number; value: string | number | boolean };
export type YMap = { kind: "map"; line: number; entries: [string, YNode][]; keyLines: Map<string, number> };
export type YList = { kind: "list"; line: number; items: YNode[] };
export type YNode = YScalar | YMap | YList;

function fail(code: string, line: number, what: string, fix: string): never {
  throw new IsokitError({ code, section: "yaml-subset", line, what, fix });
}
const sc = (line: number, value: string | number | boolean): YScalar => ({ kind: "scalar", line, value });

interface Line { indent: number; text: string; n: number }

// strip "#"-to-EOL when the "#" is outside quotes and preceded by start/space
function stripComment(s: string, n: number): string {
  let q: '"' | "'" | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === '"') { if (c === "\\") i++; else if (c === '"') q = null; }
    else if (q === "'") { if (c === "'") q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || s[i - 1] === " ")) return s.slice(0, i);
  }
  if (q) fail("yaml-unterminated-string", n,
    "a quoted string has no closing quote on its line.",
    "close the quote; the subset has no multi-line strings");
  return s;
}

function lex(text: string): Line[] {
  const out: Line[] = [];
  text.split("\n").forEach((raw, i) => {
    const n = i + 1;
    if (raw.trim() === "---") fail("yaml-multidoc", n,
      'multi-document YAML ("---") is outside the isokit subset.',
      "keep one document per file and delete the --- line");
    const ws = raw.match(/^\s*/)![0];
    if (ws.includes("\t")) fail("yaml-tab-indent", n,
      "indentation contains a tab character.", "indent with spaces (2 per level)");
    const body = stripComment(raw, n).trimEnd();
    if (body.trim() === "") return;
    out.push({ indent: ws.length, text: body.slice(ws.length), n });
  });
  return out;
}

const AMBIG = /^(yes|no|on|off|null|~|nan|inf|\.inf|\.nan|true|false)$/i;

function plainScalar(tok: string, line: number): YScalar {
  if (tok === "true") return sc(line, true);
  if (tok === "false") return sc(line, false);
  if (/^-?\d+$/.test(tok)) return sc(line, parseInt(tok, 10));
  if (/^-?\d+\.\d+$/.test(tok)) return sc(line, parseFloat(tok));
  if (AMBIG.test(tok)) fail("yaml-ambiguous-scalar", line,
    `"${tok}" reads as a boolean/null in YAML; the isokit subset refuses to guess.`,
    `quote it: "${tok}", or use true/false`);
  if (/^[&*!|>%@`]/.test(tok)) fail("yaml-unsupported-syntax", line,
    `"${tok[0]}" introduces a YAML feature (anchor, alias, tag, or block scalar) outside the isokit subset.`,
    "remove it, or quote the string if it is literal text");
  if (/[:#{}[\],]/.test(tok)) fail("yaml-quote-required", line,
    `plain scalar "${tok}" contains YAML punctuation.`, `quote it: "${tok}"`);
  return sc(line, tok);
}

class Cur {
  i = 0;
  s: string;
  line: number;
  constructor(s: string, line: number) { this.s = s; this.line = line; }
  peek(): string { return this.s[this.i] ?? ""; }
  ws(): void { while (this.s[this.i] === " ") this.i++; }
}

function quoted(c: Cur): string {
  const q = c.s[c.i++]; let out = "";
  while (c.i < c.s.length) {
    const ch = c.s[c.i++];
    if (q === '"' && ch === "\\") { const e = c.s[c.i++]; out += e === "n" ? "\n" : e; continue; }
    if (ch === q) {
      if (q === "'" && c.s[c.i] === "'") { out += "'"; c.i++; continue; }
      return out;
    }
    out += ch;
  }
  return fail("yaml-unterminated-string", c.line,
    "a quoted string has no closing quote on its line.",
    "close the quote; the subset has no multi-line strings");
}

function readKey(c: Cur): string {
  c.ws();
  if (c.peek() === '"' || c.peek() === "'") return quoted(c);
  const m = c.s.slice(c.i).match(/^[A-Za-z0-9_.-]+/);
  if (!m) fail("yaml-bad-key", c.line,
    `expected a map key at "${c.s.slice(c.i, c.i + 12)}".`,
    "keys are letters/digits/_-. or quoted strings");
  c.i += m[0].length;
  return m[0];
}

const MAX_DEPTH = 32;
function checkDepth(depth: number, line: number): void {
  if (depth > MAX_DEPTH) fail("yaml-unsupported-syntax", line,
    "nesting deeper than 32 levels.", "flatten the document");
}

function parseValueText(rest: string, line: number): YNode {
  const c = new Cur(rest, line);
  const v = parseInline(c, 0);
  c.ws();
  if (c.i < rest.length) fail("yaml-trailing-content", line,
    `unexpected trailing content "${rest.slice(c.i)}".`,
    "one value per key; quote strings that contain punctuation");
  return v;
}

function parseInline(c: Cur, depth: number): YNode {
  c.ws();
  const ch = c.peek();
  if (ch === "{") return inlineMap(c, depth + 1);
  if (ch === "[") return inlineList(c, depth + 1);
  if (ch === '"' || ch === "'") return sc(c.line, quoted(c));
  let j = c.i;
  while (j < c.s.length && !",}]".includes(c.s[j])) j++;
  const tok = c.s.slice(c.i, j).trim();
  c.i = j;
  if (!tok) fail("yaml-missing-value", c.line, "expected a value here.",
    "add a scalar, a {...} map, or a [...] list");
  return plainScalar(tok, c.line);
}

function inlineMap(c: Cur, depth: number): YMap {
  checkDepth(depth, c.line);
  const m: YMap = { kind: "map", line: c.line, entries: [], keyLines: new Map() };
  c.i++; c.ws();
  if (c.peek() === "}") { c.i++; return m; }
  for (;;) {
    const key = readKey(c);
    c.ws();
    if (c.peek() !== ":") fail("yaml-bad-key", c.line,
      `expected ":" after key "${key}" in an inline map.`, "write { key: value, ... }");
    c.i++;
    addEntry(m, key, parseInline(c, depth), c.line);
    c.ws();
    if (c.peek() === ",") { c.i++; c.ws(); continue; }
    if (c.peek() === "}") { c.i++; return m; }
    fail("yaml-unterminated-flow", c.line, 'an inline map is missing its closing "}".',
      "close the { ... } on the same line");
  }
}

function inlineList(c: Cur, depth: number): YList {
  checkDepth(depth, c.line);
  const l: YList = { kind: "list", line: c.line, items: [] };
  c.i++; c.ws();
  if (c.peek() === "]") { c.i++; return l; }
  for (;;) {
    l.items.push(parseInline(c, depth));
    c.ws();
    if (c.peek() === ",") { c.i++; c.ws(); continue; }
    if (c.peek() === "]") { c.i++; return l; }
    fail("yaml-unterminated-flow", c.line, 'an inline list is missing its closing "]".',
      "close the [ ... ] on the same line");
  }
}

function addEntry(m: YMap, key: string, v: YNode, line: number): void {
  if (m.keyLines.has(key)) fail("yaml-duplicate-key", line,
    `key "${key}" already appeared on line ${m.keyLines.get(key)}.`,
    "remove one of the duplicates");
  m.keyLines.set(key, line);
  m.entries.push([key, v]);
}

function parseBlock(ls: Line[], pos: { i: number }, indent: number, depth = 0): YNode {
  const t = ls[pos.i].text;
  return (t === "-" || t.startsWith("- ")) ? blockList(ls, pos, indent, depth) : blockMap(ls, pos, indent, depth);
}

function blockMap(ls: Line[], pos: { i: number }, indent: number, depth = 0): YMap {
  checkDepth(depth, ls[pos.i].n);
  const m: YMap = { kind: "map", line: ls[pos.i].n, entries: [], keyLines: new Map() };
  while (pos.i < ls.length) {
    const L = ls[pos.i];
    if (L.indent < indent) break;
    if (L.indent > indent) fail("yaml-bad-indent", L.n,
      `indent ${L.indent} does not match this block's indent ${indent}.`,
      "align with the surrounding keys, or nest under a key that ends in ':'");
    if (L.text === "-" || L.text.startsWith("- ")) break;
    const c = new Cur(L.text, L.n);
    const key = readKey(c);
    c.ws();
    if (c.peek() !== ":") fail("yaml-bad-key", L.n,
      `expected ":" after key "${key}".`, "write key: value");
    c.i++;
    const rest = c.s.slice(c.i).trim();
    pos.i++;
    let v: YNode;
    if (rest !== "") v = parseValueText(rest, L.n);
    else {
      if (pos.i >= ls.length || ls[pos.i].indent <= indent)
        fail("yaml-missing-value", L.n, `key "${key}" has no value.`,
          "add a value on the same line, or an indented block below (use {} for an empty map)");
      v = parseBlock(ls, pos, ls[pos.i].indent, depth + 1);
      v.line = L.n;
    }
    addEntry(m, key, v, L.n);
  }
  return m;
}

function blockList(ls: Line[], pos: { i: number }, indent: number, depth = 0): YList {
  checkDepth(depth, ls[pos.i].n);
  const l: YList = { kind: "list", line: ls[pos.i].n, items: [] };
  while (pos.i < ls.length) {
    const L = ls[pos.i];
    if (L.indent !== indent || !(L.text === "-" || L.text.startsWith("- "))) break;
    const rest = L.text.slice(1).trim();
    pos.i++;
    if (rest === "") fail("yaml-block-list-item", L.n,
      "multi-line list items are outside the isokit subset.",
      "write the item inline: - { key: value, ... }");
    if (!/^[{["']/.test(rest) && /: /.test(rest)) fail("yaml-block-list-item", L.n,
      "block-style map list items are outside the isokit subset.",
      "write the item inline: - { key: value, ... }");
    l.items.push(parseValueText(rest, L.n));
  }
  return l;
}

export function parseYaml(text: string): YNode {
  const ls = lex(text);
  if (!ls.length) fail("yaml-empty", 1, "the file has no content.",
    'start with: isokit: 1 and a quoted title:');
  if (ls[0].indent !== 0) fail("yaml-bad-indent", ls[0].n,
    "the document must start at column 0.", "remove the leading indentation");
  const pos = { i: 0 };
  const node = parseBlock(ls, pos, 0);
  if (pos.i < ls.length) fail("yaml-bad-indent", ls[pos.i].n,
    `unexpected content after the document (indent ${ls[pos.i].indent}).`,
    "align every top-level key at column 0");
  return node;
}
