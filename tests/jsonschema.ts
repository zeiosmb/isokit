// tests/jsonschema.ts — TEST-ONLY minimal JSON Schema interpreter. Supports
// exactly the keywords schema/isokit-1.json uses: type, enum, const,
// required, properties, additionalProperties, items, minItems, maxItems,
// maxProperties. It exists so the published schema cannot drift from the
// validator without a test failing; it is not a product surface.
import type { YNode } from "../src/yaml.ts";

export function toPlain(n: YNode): unknown {
  if (n.kind === "scalar") return n.value;
  if (n.kind === "list") return n.items.map(toPlain);
  return Object.fromEntries(n.entries.map(([k, v]) => [k, toPlain(v)]));
}

export function schemaOk(schema: any, v: unknown): boolean {
  if (schema.const !== undefined && schema.const !== v) return false;
  if (schema.enum && !schema.enum.includes(v)) return false;
  if (schema.type) {
    const t = Array.isArray(v) ? "array" : v === null ? "null"
      : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;
    if (schema.type === "number" ? (t !== "number" && t !== "integer") : schema.type !== t) return false;
  }
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && v.length > schema.maxItems) return false;
    if (schema.items && !v.every(x => schemaOk(schema.items, x))) return false;
  } else if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in o)) return false;
    if (schema.maxProperties !== undefined && Object.keys(o).length > schema.maxProperties) return false;
    for (const [k, x] of Object.entries(o)) {
      if (schema.properties && k in schema.properties) {
        if (!schemaOk(schema.properties[k], x)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        if (!schemaOk(schema.additionalProperties, x)) return false;
      }
    }
  }
  return true;
}
