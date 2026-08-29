// src/error.ts — the one error shape every isokit failure uses: a stable
// kebab-case code, the SPEC.md section it belongs to, where in the source
// file it happened, what went wrong (with valid options when the set is
// closed), and one concrete fix. Agents self-correct from these blocks.
export interface ErrInfo {
  code: string; section: string; line?: number; path?: string;
  what: string; fix: string;
}

export class IsokitError extends Error {
  code: string; section: string; line?: number; yamlPath?: string;
  what: string; fix: string;
  constructor(info: ErrInfo) {
    super(`[${info.code}] ${info.what}`);
    this.code = info.code; this.section = info.section;
    this.line = info.line; this.yamlPath = info.path;
    this.what = info.what; this.fix = info.fix;
  }
}

export function formatError(e: IsokitError, file: string): string {
  let at = `  at ${file}`;
  if (e.line !== undefined) at += ` line ${e.line}`;
  if (e.yamlPath) at += ` (${e.yamlPath})`;
  return [`isokit error [${e.code}] (spec: ${e.section})`, at, `  ${e.what}`, `  fix: ${e.fix}`]
    .join("\n") + "\n";
}
