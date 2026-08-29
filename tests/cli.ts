import { spawnSync } from "node:child_process";
import * as fs from "node:fs";

let fail = 0;
function ok(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); fail++; }
}
fs.mkdirSync("tests/out", { recursive: true });
fs.writeFileSync("/tmp/isokit-cli-good.yaml", `isokit: 1
title: "CLI SMOKE"
units:
  a: { shape: box, accent: 2 }
groups:
  g: { label: THE GROUP, units: [a] }
placement:
  groups:
    g: { origin: [3, 3] }
`);
fs.writeFileSync("/tmp/isokit-cli-bad.yaml", 'isokit: 1\ntitle: "X"\nunits:\n  a: { shape: blob }\n');

const good = spawnSync("node", ["src/cli.ts", "render", "/tmp/isokit-cli-good.yaml",
  "-o", "tests/out/cli-smoke.svg"], { encoding: "utf8" });
ok("exit 0", good.status === 0);
ok("stdout reports", good.stdout.includes("tests/out/cli-smoke.svg"));
ok("file written", fs.readFileSync("tests/out/cli-smoke.svg", "utf8").startsWith("<svg"));

const bad = spawnSync("node", ["src/cli.ts", "render", "/tmp/isokit-cli-bad.yaml"], { encoding: "utf8" });
ok("exit 1 on IsokitError", bad.status === 1);
ok("block on stderr", bad.stderr.startsWith("isokit error [enum-invalid]"));
ok("block cites file+line", bad.stderr.includes("/tmp/isokit-cli-bad.yaml line 4"));

const usage = spawnSync("node", ["src/cli.ts"], { encoding: "utf8" });
ok("exit 2 usage", usage.status === 2 && usage.stderr.includes("usage:"));

const missing = spawnSync("node", ["src/cli.ts", "render", "/tmp/isokit-nope.yaml"], { encoding: "utf8" });
ok("missing file is coded error", missing.status === 1 && missing.stderr.includes("[file-unreadable]"));

// title-derived filename must not escape the output dir (path traversal)
fs.writeFileSync("/tmp/isokit-cli-escape.yaml", `isokit: 1
title: "../../ESCAPE"
units:
  a: { shape: box }
groups:
  g: { label: L, units: [a] }
placement:
  groups:
    g: { origin: [3, 3] }
`);
const escape = spawnSync("node", ["src/cli.ts", "render", "/tmp/isokit-cli-escape.yaml"], { encoding: "utf8" });
ok("escape title exit 1", escape.status === 1);
ok("escape title coded error", escape.stderr.startsWith("isokit error [title-not-a-filename]"));
ok("escape title no file created outside out dir", !fs.existsSync("/ESCAPE.svg"));

process.exit(fail ? 1 : 0);
