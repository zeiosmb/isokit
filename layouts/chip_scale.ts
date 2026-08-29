/* Chip number scale — regression fixture for 0-9999 chip rendering.
Left: four chips with screen-horizontal rays at targets on one screen-vertical
line (x - y = 4) — tips must align vertically while the pills grow left.
Around the unit: a snapped single-digit chip, a 45-degree screen-diagonal
approach, and a bare pill centered on its point. Legend: 12 rows crossing the
9 -> 10 digit boundary — number bubbles share one right edge, text column
stays vertical — plus a mock block showing the digit-aware column shift a
4-digit rail would get (a real rail can't reach 4 digits: the height guard
caps it ~15 rows). */
import { setTheme, configure, grid, svgOpen, box, GLYPHS,
  unit, renderUnits, chip, legend, A1, INK, INK2, MONOQ }
  from "../src/isokit.ts";
import { out, write } from "../src/io.ts";

setTheme("blueprint");
configure(46, 440, 48);
const S = svgOpen(1400, 940);
S.push(grid({ x1: 18, y1: 18, clip_h: 940 }));

unit("core", box, 9, 7, { glyph: GLYPHS["app"] });

// tips-aligned column: each anchor shares x+y with its target -> horizontal
// screen ray; targets share x-y=4 -> one vertical screen line of tips
S.push(chip(7,    3, 5, [6, 2]));
S.push(chip(42,   4, 6, [7, 3]));
S.push(chip(358,  5, 7, [8, 4]));
S.push(chip(9999, 6, 8, [9, 5]));

S.push(renderUnits());
S.push(chip(0, 12.5, 6.2, "core"));      // unit-snapped, single digit
S.push(chip(9999, 14.67, 8.9, "core"));  // 45-degree screen-diagonal approach
S.push(chip(1234, 5, 11));               // bare pill, centered on its point

S.push(legend([
  ["Row one",    "single digit, circle"],
  ["Row two",    "single digit, circle"],
  ["Row three",  "single digit, circle"],
  ["Row four",   "single digit, circle"],
  ["Row five",   "single digit, circle"],
  ["Row six",    "single digit, circle"],
  ["Row seven",  "single digit, circle"],
  ["Row eight",  "single digit, circle"],
  ["Row nine",   "last of the circles"],
  ["Row ten",    "two digits, pill grows left"],
  ["Row eleven", "right edges stay aligned"],
  ["Row twelve", "text column stays vertical"],
]));

// mock mini-rail: what rows look like IF a rail reached 4 digits — the
// number column is digit-aware, so the whole rail shifts right to keep the
// widest pill >=10px off the rail edge; right edges + text stay aligned.
// Geometry replicated from legend()'s dMax=4 case.
{
  const x = 1054;
  const edge = 10 + 2 * (3.6 * 4 + 7.4);   // 53.6: 4-digit right edge
  const tx = x + edge + 13;
  const y0 = 76 + 12 * 55 + 18;
  S.push(`<text x="${x + 32}" y="${y0}" font-family=${MONOQ} font-size="10.5" `
    + `fill="${INK2}" letter-spacing="2">IF A RAIL REACHED 9999&#8230;</text>`);
  const row = (n: string, cy: number, title: string, desc: string): string => {
    const hw = 3.6 * n.length + 7.4;
    const bubble = n.length === 1
      ? `<circle cx="${x + edge - 11}" cy="${cy}" r="11" fill="${A1}"/>`
      : `<rect x="${x + edge - 2 * hw}" y="${cy - 11}" width="${2 * hw}" height="22" rx="11" fill="${A1}"/>`;
    return bubble
      + `<text x="${x + edge - hw}" y="${cy + 4}" font-family=${MONOQ} font-size="12" font-weight="700" `
      + `fill="#ffffff" text-anchor="middle">${n}</text>`
      + `<text x="${tx}" y="${cy + 4}" font-family=${MONOQ} font-size="13.5" `
      + `font-weight="700" fill="${INK}">${title}</text>`
      + `<text x="${tx}" y="${cy + 20}" font-family=${MONOQ} font-size="11.5" `
      + `fill="${INK2}">${desc}</text>`;
  };
  S.push(row("8", y0 + 34, "Row 8", "circle, shifted with its rail"));
  S.push(row("9999", y0 + 89, "Row 9999", "widest pill, 10px off the edge"));
}

S.push(`<text x="40" y="52" font-family=${MONOQ} font-size="24" font-weight="700" fill="${INK}">CHIP NUMBER SCALE</text>`);
S.push(`<text x="40" y="76" font-family=${MONOQ} font-size="12.5" fill="${INK2}">0-9999 &#183; pills grow away from the target &#183; tips stay put</text>`);

write(out("Chip Scale Demo.svg"), S);
