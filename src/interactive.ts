// Embeds the Obsidian plugin's pan/zoom/legend-collapse controls directly
// into an SVG's own markup via <script>, so opening the file in a browser
// tab (or any <object>/<iframe> host that executes SVG scripts) is
// interactive on its own — no plugin required. The viewBox math mirrors
// obsidian/main.ts's parseVB/fmtVB/zoomVB/panVB exactly; keep the two in
// sync if either changes.
const RAIL_W = 346;
const MAX_ZOOM = 16;

const RUNTIME_JS = `(function(svg){
  var RAIL_W=${RAIL_W}, MAX_ZOOM=${MAX_ZOOM};
  function parseVB(s){var m=s.trim().match(/^(-?[\\d.]+) (-?[\\d.]+) ([\\d.]+) ([\\d.]+)$/);
    return m?{x:+m[1],y:+m[2],w:+m[3],h:+m[4]}:null;}
  function fmtVB(v){function n(x){return String(Math.round(x*100)/100);}
    return n(v.x)+" "+n(v.y)+" "+n(v.w)+" "+n(v.h);}
  function clamp(val,lo,hi){return Math.min(Math.max(val,lo),hi);}
  function panVB(v,dx,dy,base){return {x:clamp(v.x+dx,base.x,base.x+base.w-v.w),
    y:clamp(v.y+dy,base.y,base.y+base.h-v.h),w:v.w,h:v.h};}
  function zoomVB(v,factor,cx,cy,base){
    var w=Math.min(base.w,Math.max(base.w/MAX_ZOOM,v.w*factor));
    var f=w/v.w, h=v.h*f;
    return panVB({x:cx-(cx-v.x)*f,y:cy-(cy-v.y)*f,w:w,h:h},0,0,base);}
  var expanded=parseVB(svg.getAttribute("viewBox")||"");
  var expandedW=parseInt(svg.getAttribute("width"),10);
  if(!expanded||!isFinite(expandedW)) return;
  var base=expanded;
  var ctrls=svg.querySelector(".isokit-controls");
  var last=null;
  function view(){return parseVB(svg.getAttribute("viewBox")||"")||base;}
  function setView(v){
    svg.setAttribute("viewBox",fmtVB(v));
    var r=view();
    if(ctrls) ctrls.setAttribute("transform",
      "translate("+(r.x+r.w)+" "+(r.y+r.h)+") scale("+(r.w/base.w)+")");
    svg.style.cursor=r.w<base.w-0.5?(last?"grabbing":"grab"):"";
  }
  function toVBPoint(e){var r=svg.getBoundingClientRect();var v=view();
    return [v.x+((e.clientX-r.left)/r.width)*v.w, v.y+((e.clientY-r.top)/r.height)*v.h];}
  svg.addEventListener("wheel",function(e){
    if(!e.ctrlKey&&!e.metaKey) return; e.preventDefault();
    var p=toVBPoint(e);
    setView(zoomVB(view(),Math.exp(e.deltaY*0.002),p[0],p[1],base));
  },{passive:false});
  svg.addEventListener("pointerdown",function(e){
    if(view().w>=base.w-0.5) return;
    last={x:e.clientX,y:e.clientY}; svg.setPointerCapture(e.pointerId); e.preventDefault();
    svg.style.cursor="grabbing";
  });
  svg.addEventListener("pointermove",function(e){
    if(!last) return; var r=svg.getBoundingClientRect(); var v=view();
    setView(panVB(v,((last.x-e.clientX)/r.width)*v.w,((last.y-e.clientY)/r.height)*v.h,base));
    last={x:e.clientX,y:e.clientY};
  });
  function end(){last=null; setView(view());}
  svg.addEventListener("pointerup",end); svg.addEventListener("pointercancel",end);
  svg.addEventListener("dblclick",function(){setView(base);});
  function zoomStep(factor){var v=view();
    setView(zoomVB(v,factor,v.x+v.w/2,v.y+v.h/2,base));}
  var zin=svg.getElementById("isokit-zoom-in");
  if(zin) zin.addEventListener("click",function(){zoomStep(1/1.5);});
  var zout=svg.getElementById("isokit-zoom-out");
  if(zout) zout.addEventListener("click",function(){zoomStep(1.5);});
  var legend=svg.querySelector(".isokit-legend");
  var toggle=svg.getElementById("isokit-legend-toggle");
  var label=svg.getElementById("isokit-legend-toggle-label");
  if(legend&&toggle){
    var collapsed={x:expanded.x,y:expanded.y,w:expanded.w-RAIL_W,h:expanded.h};
    var hidden=false;
    toggle.addEventListener("click",function(){
      hidden=!hidden;
      legend.style.display=hidden?"none":"";
      base=hidden?collapsed:expanded;
      svg.setAttribute("width",String(hidden?expandedW-RAIL_W:expandedW));
      setView(base);
      if(label) label.textContent=hidden?"\\u00AB":"\\u00BB";
    });
  }
})(document.currentScript.closest("svg"));`;

function button(id: string, cx: number, cy: number, label: string, labelId?: string): string {
  return `<g id="${id}" class="isokit-ctrl-btn" style="cursor:pointer">`
    + `<circle cx="${cx}" cy="${cy}" r="11" fill="#000" fill-opacity="0.3"/>`
    + `<text ${labelId ? `id="${labelId}" ` : ""}x="${cx}" y="${cy + 4}" text-anchor="middle" `
    + `font-family="monospace" font-size="13" fill="#fff" fill-opacity="0.75" `
    + `style="user-select:none">${label}</text></g>`;
}

/** Append interactive pan/zoom (+ legend-collapse, if present) controls to a
rendered SVG, self-contained via an inline <script>. Pure text transform —
does not touch src/isokit.ts's static output or the golden masters. */
export function withControls(svg: string): string {
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!vb) return svg;   // not a shape this transform understands; leave as-is
  const w = parseInt(vb[1], 10), h = parseInt(vb[2], 10);
  const hasLegend = svg.includes('class="isokit-legend"');
  // Buttons are drawn at coordinates relative to the view's bottom-right
  // corner; the group's transform anchors that corner and is re-derived by
  // the runtime on every view change (HUD — zoom/pan/collapse can't move
  // the buttons off-screen). The static transform below is the base view.
  const cy = -21;
  let controls = button("isokit-zoom-in", -21 - (hasLegend ? 56 : 28), cy, "+")
    + button("isokit-zoom-out", -21 - (hasLegend ? 28 : 0), cy, "−");
  if (hasLegend) {
    controls += button("isokit-legend-toggle", -21, cy, "»", "isokit-legend-toggle-label");
  }
  // The <style> makes a standalone document shrink with its window — when a
  // raw .svg is the top-level document no host stylesheet exists to do it.
  const overlay = `<g class="isokit-controls" transform="translate(${w} ${h})">${controls}</g>`
    + `<style>svg:root{max-width:100%;height:auto}</style>`
    + `<script><![CDATA[${RUNTIME_JS}]]></script>`;
  return svg.replace(/<\/svg>\s*$/, `${overlay}</svg>`);
}
