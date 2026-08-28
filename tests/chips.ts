// Chip numbers must render well 0-9999: a single digit keeps the classic
// circle; more digits widen the shape into a horizontal pill (rounded rect,
// same 22px height) instead of a bigger circle. Alignment invariants:
//  - pointer chips: the tail tip position is number-independent (the pill
//    grows horizontally AWAY from the target, the tip stays put)
//  - bare chips: the pill is centered on the authored point
//  - legend: number shapes share a fixed RIGHT edge so the gap to the text
//    column is constant; the text column itself stays vertically aligned
import { setTheme, configure, svgOpen, resetUnits, iso, chip, legend }
  from "../src/isokit.ts";

setTheme("blueprint");
configure(46, 440, 48);
svgOpen(1400, 1400);
resetUnits();

let fail = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (!cond) { console.error(`${name}: FAIL ${detail}`); fail++; }
}

// mono 12px bold: 0.6em advance per digit; pill keeps the 1-digit side
// padding (circle r11 minus 3.6 half-advance = 7.4)
const halfW = (d: number): number => 3.6 * d + 7.4;

// 1) single digit: still a plain circle r=11, no rect (golden stability)
{
  const svg = chip(7, 5, 5, [8, 5]);
  check("single digit keeps circle", /<circle [^>]*r="11"/.test(svg) && !svg.includes("<rect"));
}

// 2) four digits: a pill (rect rx=11, height 22) wide enough for the text
{
  const svg = chip(9999, 5, 5, [8, 5]);
  const m = svg.match(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" rx="11"/);
  check("four digits render a pill rect", !!m);
  if (m) {
    check("pill width fits 4 digits", Math.abs(+m[3] - 2 * halfW(4)) < 0.6, `width=${m[3]}`);
    check("pill height stays 22", Math.abs(+m[4] - 22) < 0.01);
    // number centered in the pill
    const t = svg.match(/<text x="([-\d.]+)"/);
    check("text centered in pill", !!t && Math.abs(+t[1] - (+m[1] + +m[3] / 2)) < 1, t?.[1]);
  }
}

// 3) tail tip is number-independent: same anchor+target, any digit count
{
  const tipOf = (s: string): [number, number] | null => {
    const m = s.match(/points="([-\d.]+),([-\d.]+)/);
    return m ? [+m[1], +m[2]] : null;
  };
  const t1 = tipOf(chip(1, 5, 5, [8, 5]));
  const t4 = tipOf(chip(9999, 5, 5, [8, 5]));
  check("tip position number-independent", !!t1 && !!t4
    && Math.abs(t1![0] - t4![0]) < 0.01 && Math.abs(t1![1] - t4![1]) < 0.01,
    `${t1} vs ${t4}`);
}

// 4) the pill grows AWAY from the target: for a target to the chip's screen
// right, the pill body must end left of the tail tip (tip stays outside)
{
  const svg = chip(9999, 5, 5, [8, 5]);   // target right of anchor on screen
  const m = svg.match(/<rect x="([-\d.]+)" [^>]*width="([-\d.]+)"/);
  const tip = svg.match(/points="([-\d.]+),([-\d.]+)/);
  check("pill grows away from target", !!m && !!tip && (+m![1] + +m![2]) < +tip![1] + 0.01,
    m && tip ? `pill right=${+m[1] + +m[2]} tip=${tip[1]}` : "parse failed");
}

// 5) bare chip (no target): pill centered on the authored point
{
  const svg = chip(1234, 6, 6);
  const [X] = iso(6, 6);
  const m = svg.match(/<rect x="([-\d.]+)" [^>]*width="([-\d.]+)"/);
  check("bare pill centered on point", !!m && Math.abs((+m![1] + +m![2] / 2) - X) < 0.6,
    m ? `center=${+m[1] + +m[2] / 2} want=${X}` : "no rect");
}

// 6) legend: number shapes share a fixed right edge (x+43, the 1-digit
// circle's right edge); the title text column stays at x+56 for every entry
{
  const LX = 1054;
  const entries: [string, string][] = [];
  for (let i = 1; i <= 12; i++) entries.push([`Entry ${i}`, "d"]);
  const svg = legend(entries, { x: LX });
  const c1 = svg.match(/<circle cx="([-\d.]+)" cy="[-\d.]+" r="11"/);
  check("legend 1-digit circle unchanged", !!c1 && Math.abs(+c1![1] - (LX + 32)) < 0.01, c1?.[1]);
  const rects = [...svg.matchAll(/<rect x="([-\d.]+)" y="[-\d.]+" width="([-\d.]+)" height="22"/g)];
  check("legend 2-digit entries are pills", rects.length === 3, `${rects.length} pills`);
  for (const r of rects) {
    check("legend pill right edge fixed at x+43", Math.abs((+r[1] + +r[2]) - (LX + 43)) < 0.6,
      `right=${+r[1] + +r[2]}`);
  }
  const titles = [...svg.matchAll(/<text x="([-\d.]+)" y="[-\d.]+" font-family=[^>]*font-size="13.5"/g)];
  check("legend text column vertically aligned", titles.length === 12
    && titles.every(t => Math.abs(+t[1] - (LX + 56)) < 0.01));
}

// 7) legend digit-aware margin: with enough entries for 3-digit numbers the
// whole number column shifts right so the widest pill keeps >=10px off the
// rail's left edge — right edges and the text column stay aligned rail-wide
{
  svgOpen(1400, 5700);   // tall enough for 100 rows (height guard)
  const LX = 1054;
  const entries: [string, string][] = [];
  for (let i = 1; i <= 100; i++) entries.push([`E${i}`, "d"]);
  const svg = legend(entries, { x: LX });
  const edge = 10 + 2 * (3.6 * 3 + 7.4);   // margin + widest (3-digit) pill
  const c1 = svg.match(/<circle cx="([-\d.]+)"/);
  check("legend circles shift with digit count", !!c1
    && Math.abs(+c1![1] - (LX + edge - 11)) < 0.6, c1?.[1]);
  const rects = [...svg.matchAll(/<rect x="([-\d.]+)" y="[-\d.]+" width="([-\d.]+)" height="22"/g)];
  check("legend pill margin >= 10px", rects.length > 0
    && rects.every(r => +r[1] >= LX + 9.4), rects.length ? `min x=${Math.min(...rects.map(r => +r[1]))}` : "no pills");
  for (const r of rects) {
    check("legend pill right edges aligned (3-digit rail)",
      Math.abs((+r[1] + +r[2]) - (LX + edge)) < 0.6, `right=${+r[1] + +r[2]}`);
  }
  const titles = [...svg.matchAll(/<text x="([-\d.]+)" y="[-\d.]+" font-family=[^>]*font-size="13.5"/g)];
  check("legend text column follows the shift", titles.length === 100
    && titles.every(t => Math.abs(+t[1] - (LX + edge + 13)) < 0.6));
}

if (fail) process.exit(1);
console.log("chips: all cases ok");
