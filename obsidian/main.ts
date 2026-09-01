// isokit Obsidian plugin — renders ```isokit code blocks through the pure
// render() core. The bundle carries the whole renderer (fonts included);
// nothing is fetched and nothing touches the filesystem.
import { Plugin } from "obsidian";
import { render } from "../src/render.ts";
import { IsokitError, formatError } from "../src/error.ts";

const RAIL_W = 346;    // legend rail width reserved by the renderer's canvas
const MAX_ZOOM = 16;   // tightest view: base width / 16

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---- viewBox math (pure, unit-tested via tests/obsidian.ts) ----

export interface VB { x: number; y: number; w: number; h: number }

export function parseVB(s: string): VB | null {
  const m = s.trim().match(/^(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)$/);
  if (!m) return null;
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}

export function fmtVB(v: VB): string {
  const n = (x: number) => String(Math.round(x * 100) / 100);
  return `${n(v.x)} ${n(v.y)} ${n(v.w)} ${n(v.h)}`;
}

/** Scale the view by `factor` keeping viewBox point (cx, cy) fixed under the
cursor. Clamped between the full base view and base/MAX_ZOOM. */
export function zoomVB(v: VB, factor: number, cx: number, cy: number, base: VB): VB {
  const w = Math.min(base.w, Math.max(base.w / MAX_ZOOM, v.w * factor));
  const f = w / v.w;
  const h = v.h * f;
  return panVB({ x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f, w, h }, 0, 0, base);
}

/** Shift the view by (dx, dy) in viewBox units, kept inside the base bounds. */
export function panVB(v: VB, dx: number, dy: number, base: VB): VB {
  const clamp = (val: number, lo: number, hi: number) => Math.min(Math.max(val, lo), hi);
  return {
    x: clamp(v.x + dx, base.x, base.x + base.w - v.w),
    y: clamp(v.y + dy, base.y, base.y + base.h - v.h),
    w: v.w, h: v.h,
  };
}

/** viewBox with the legend rail's width removed; null if it doesn't parse. */
export function collapsedViewBox(vb: string): string | null {
  const v = parseVB(vb);
  return v ? fmtVB({ ...v, w: v.w - RAIL_W }) : null;
}

// ---- DOM wiring ----

function addInteraction(el: HTMLElement): void {
  const svg = el.querySelector("svg");
  const expanded = parseVB(svg?.getAttribute("viewBox") ?? "");
  const expandedW = parseInt(svg?.getAttribute("width") ?? "", 10);
  if (!svg || !expanded || !Number.isFinite(expandedW)) return;

  let base = expanded;
  const view = (): VB => parseVB(svg.getAttribute("viewBox") ?? "") ?? base;
  const setView = (v: VB): void => {
    svg.setAttribute("viewBox", fmtVB(v));
    svg.classList.toggle("isokit-zoomed", v.w < base.w - 0.5);
  };

  // pan & zoom: ctrl/cmd+wheel (and trackpad pinch) zooms around the cursor,
  // drag pans once zoomed, double-click resets
  const toVBPoint = (e: MouseEvent): [number, number] => {
    const r = svg.getBoundingClientRect();
    const v = view();
    return [v.x + ((e.clientX - r.left) / r.width) * v.w,
      v.y + ((e.clientY - r.top) / r.height) * v.h];
  };
  svg.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const [cx, cy] = toVBPoint(e);
    setView(zoomVB(view(), Math.exp(e.deltaY * 0.002), cx, cy, base));
  }, { passive: false });
  let last: { x: number; y: number } | null = null;
  svg.addEventListener("pointerdown", (e) => {
    if (view().w >= base.w - 0.5) return;   // nothing to pan at base zoom
    last = { x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener("pointermove", (e) => {
    if (!last) return;
    const r = svg.getBoundingClientRect();
    const v = view();
    setView(panVB(v, ((last.x - e.clientX) / r.width) * v.w,
      ((last.y - e.clientY) / r.height) * v.h, base));
    last = { x: e.clientX, y: e.clientY };
  });
  const end = (): void => { last = null; };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("dblclick", () => setView(base));

  // control cluster, overlaid on the diagram's bottom-right via CSS
  const controls = document.createElement("div");
  controls.className = "isokit-controls";
  const button = (label: string, title: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.className = "isokit-btn";
    b.textContent = label;
    b.title = title;
    b.onclick = onClick;
    controls.appendChild(b);
    return b;
  };
  const zoomStep = (factor: number): void => {
    const v = view();
    setView(zoomVB(v, factor, v.x + v.w / 2, v.y + v.h / 2, base));
  };
  button("+", "Zoom in (ctrl+scroll)", () => zoomStep(1 / 1.5));
  button("−", "Zoom out (double-click resets)", () => zoomStep(1.5));

  // legend collapse: swaps the base view and resets pan/zoom to it
  const legend = svg.querySelector<SVGGElement>(".isokit-legend");
  if (legend) {
    const collapsed: VB = { ...expanded, w: expanded.w - RAIL_W };
    let hidden = false;
    const btn = button("»", "Collapse legend", () => {
      hidden = !hidden;
      legend.style.display = hidden ? "none" : "";
      base = hidden ? collapsed : expanded;
      svg.setAttribute("width", String(hidden ? expandedW - RAIL_W : expandedW));
      setView(base);
      btn.textContent = hidden ? "«" : "»";
      btn.title = hidden ? "Expand legend" : "Collapse legend";
    });
  }
  el.appendChild(controls);
}

export default class IsokitPlugin extends Plugin {
  onload(): void {
    this.registerMarkdownCodeBlockProcessor("isokit", (source, el) => {
      el.classList.add("isokit-block");
      try {
        // render() output is injection-safe: the validator rejects & < > in
        // every user string before any SVG is emitted.
        el.innerHTML = render(source);
        addInteraction(el);
      } catch (e) {
        const text = e instanceof IsokitError
          ? formatError(e, "isokit block")
          : `isokit renderer bug (please report): ${String(e)}`;
        el.innerHTML = `<pre class="isokit-error">${esc(text)}</pre>`;
        if (!(e instanceof IsokitError)) console.error("isokit:", e);
      }
    });
  }
}
