// src/render.ts — the pure core: YAML text in, SVG text out. No node:
// imports in this module graph (enforced by tests/semantic.ts); this is the
// function the web app and the Obsidian plugin bundle.
import { parseYaml } from "./yaml.ts";
import { validate } from "./schema.ts";
import { derive } from "./semantic.ts";

export function render(yamlText: string): string {
  return derive(validate(parseYaml(yamlText)));
}
