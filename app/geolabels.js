// Cyclic Labs — Geometry numbers on the realistic 3D view
// A toolbar button (next to "⧉ Overlay a bike") draws the frame's geometry as dimension lines + number tags that float on
// the 3D bike: they are 3D points projected every frame, so they turn with the bike when you orbit, pan or zoom.
// The ⚙ button attached to it picks which numbers are shown. Everything for this feature lives in this file; the only
// hooks elsewhere are two lines in bike3d.js (update() keeps the last state in S.lastSt, render() calls
// FrameGeoLabels.draw() on each new view), page.html/index.html load this file, and the build scripts list it.
//
// Settings (kept in this browser, frameBench.geoLabels.v1): on, lines (measuring lines on/off), show {key: true/false}.
// Points come from the same geometry the 3D model is built from (result.model.geo: BB at 0,0; x forward, y up, z = 0 is the
// bike's centre plane), so the numbers always match what's drawn and change live as the design is edited.
(function (root) {
  "use strict";
  const LS = "frameBench.geoLabels.v1";
  const GROUPS = [["frame", "Frame", "#ff8a1f"], ["bike", "Whole bike", "#1aa3ff"], ["fit", "Where you sit and hold on", "#22c55e"]];
  // key, label (short tag text), group, on by default, longer name for the settings list
  const DIMS = [
    ["reach", "Reach", "frame", 1], ["stack", "Stack", "frame", 1], ["headAngle", "Head angle", "frame", 1], ["seatAngle", "Seat angle", "frame", 1],
    ["headTube", "Head tube", "frame", 1], ["seatTube", "Seat tube", "frame", 0], ["ett", "Eff. top tube", "frame", 0, "Effective top tube"],
    ["chainstay", "Chainstay", "frame", 1], ["bbDrop", "BB drop", "frame", 1],
    ["wheelbase", "Wheelbase", "bike", 1], ["frontCentre", "Front centre", "bike", 0], ["bbHeight", "BB height", "bike", 0], ["trail", "Trail", "bike", 1],
    ["forkA2C", "Fork A-C", "bike", 0, "Fork axle-to-crown"], ["forkOffset", "Fork offset", "bike", 0],
    ["saddleHeight", "Saddle height", "fit", 0, "Saddle height (BB to saddle top)"], ["saddleSetback", "Saddle setback", "fit", 0, "Saddle behind BB (sit bones)"],
    ["saddleToBar", "Saddle to bar", "fit", 0, "Saddle to bar (reach)"], ["barDrop", "Saddle–bar drop", "fit", 0, "Saddle above bar (drop)"]
  ];
  const defShow = () => Object.fromEntries(DIMS.map(d => [d[0], !!d[3]]));
  const O = { on: false, lines: true, show: defShow() };
  try { const v = JSON.parse(localStorage.getItem(LS) || "{}"); if (v && typeof v === "object") { if ("on" in v) O.on = !!v.on; if ("lines" in v) O.lines = !!v.lines; if (v.show) Object.assign(O.show, v.show); } } catch (e) {}
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(O)); } catch (e) {} };
  const S = { btn: null, gear: null, pop: null, layer: null, svg: null, tags: null, cache: null, cacheKey: null, last: null };
  const B3 = () => root.FrameBike3D, GL = () => root.Bike3DGL;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d) => (v === "" || v == null || !isFinite(+v)) ? d : +v;
  const D2R = Math.PI / 180;

  // ---------------------------------------------------------------- 2D helpers (frame side view, mm)
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
  const len = a => Math.hypot(a[0], a[1]), unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; }, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const xy = p => [p[0], p[1]];
  // Each dimension = { key, text, grp, segs: [[a, b, kind]], at: tag anchor }. kind: "dim" (the measured line, with end ticks),
  // "ext" (thin dashed: extension/reference lines), "arc" (angle arc, no ticks).
  function aligned(a, b, off, ticks) {   // a→b moved sideways by the 2D vector off, with extension lines back to a and b
    const a2 = add(a, off), b2 = add(b, off), segs = [];
    if (len(off) > 1) { segs.push([a, add(a2, mul(unit(off), 8)), "ext"]); segs.push([b, add(b2, mul(unit(off), 8)), "ext"]); }
    segs.push([a2, b2, ticks === false ? "line" : "dim"]);
    return { segs, at: mid(a2, b2) };
  }
  function arc(c, r, a0, a1, n) { const out = []; n = n || 16; for (let i = 0; i < n; i++) { const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n; out.push([add(c, [r * Math.cos(t0), r * Math.sin(t0)]), add(c, [r * Math.cos(t1), r * Math.sin(t1)]), "arc"]); } return out; }
  const perp = (d, wantY) => { const n = [-d[1], d[0]]; return (wantY < 0 ? n[1] > 0 : n[1] < 0) ? [-n[0], -n[1]] : n; };   // unit normal on the side wanted (wantY: -1 below / +1 above)

  function compute(st, built) {
    const res = st.result, des = st.design, geo = res && res.model && res.model.geo;
    if (!geo || !geo.P || !des) return [];
    const g = des.geometry, P = geo.P, info = geo.info || {}, ha = g.headAngle * D2R, sa = g.seatAngle * D2R;
    const uHT = xy(geo.uHT || [Math.cos(ha), -Math.sin(ha)]), nF = xy(geo.nF || [Math.sin(ha), Math.cos(ha)]), uSTv = xy(geo.uSTv || [-Math.cos(sa), Math.sin(sa)]);
    const BB = [0, 0], HTt = xy(P.HTtop), HTb = xy(P.HTbot), Crown = xy(P.Crown), AF = xy(P.AxleF), AR = xy(P.AxleR), STt = xy(P.STtop);
    const R = num(info.rearTyreR, g.tireDiameter / 2), Rf = num(info.frontTyreR, R), gR = AR[1] - R, gF = AF[1] - Rf;
    const mm = v => isFinite(v) ? Math.round(v) + "" : "—", deg = v => isFinite(v) ? (+v).toFixed(1) + "°" : "—";
    const out = [], put = (key, val, d) => { const def = DIMS.find(x => x[0] === key); out.push(Object.assign({ key, grp: def[2], text: def[1], val }, d)); };

    // reach / stack: the classic box from the BB to the head-tube top
    put("reach", mm(g.reach), { segs: [[[0, g.stack], HTt, "dim"], [BB, [0, g.stack + 8], "ext"]], at: [g.reach / 2, g.stack] });
    put("stack", mm(g.stack), { segs: [[[g.reach, 0], HTt, "dim"], [BB, [g.reach + 8, 0], "ext"]], at: [g.reach, g.stack / 2] });
    // effective top tube: level line from the seat-angle line to the head-tube top, lifted clear of the reach line
    { const ett = num(info.effectiveTopTube, NaN), x0 = g.reach - ett, lift = 55, a = [x0, g.stack], d = aligned(a, HTt, [0, lift]);
      d.segs.push([BB, a, "ext"]); put("ett", mm(ett), d); }
    // head angle: arc at the head-tube bottom between level-forward and the steering axis
    { const segs = [[HTt, add(HTb, mul(uHT, 70)), "ext"], [HTb, add(HTb, [110, 0]), "ext"]].concat(arc(HTb, 75, 0, -ha));
      put("headAngle", deg(g.headAngle), { segs, at: add(HTb, [118 * Math.cos(-ha / 2), 118 * Math.sin(-ha / 2)]) }); }
    // seat angle (effective): arc at the BB between level-rearward and the line BB → saddle
    { const top = mul(uSTv, num(g.saddleHeight, g.seatTube + 150)), a1 = Math.atan2(uSTv[1], uSTv[0]);
      const segs = [[BB, top, "ext"], [BB, [-130, 0], "ext"]].concat(arc(BB, 105, Math.PI, a1));
      put("seatAngle", deg(g.seatAngle), { segs, at: add(BB, [160 * Math.cos((Math.PI + a1) / 2), 160 * Math.sin((Math.PI + a1) / 2)]) }); }
    // head tube: alongside the tube, in front of it
    put("headTube", mm(g.headTube), aligned(HTt, HTb, mul(nF, 48)));
    // seat tube: BB → top of the seat tube (as built, follows a bent tube's top), behind it
    { const d = unit(sub(STt, BB)), n = [-d[1], d[0]], back = n[0] < 0 ? n : mul(n, -1); put("seatTube", mm(g.seatTube), aligned(BB, STt, mul(back, 48))); }
    // chainstay: BB → rear axle, below the stay
    put("chainstay", mm(g.chainstay), aligned(BB, AR, mul(perp(unit(sub(AR, BB)), -1), 46)));
    // BB drop: axle line vs BB, measured just in front of the BB
    { const x = 70; put("bbDrop", mm(g.bbDrop), { segs: [[[x, 0], [x, g.bbDrop], "dim"], [AR, [x + 8, g.bbDrop], "ext"], [BB, [x + 8, 0], "ext"]], at: [x + 28, g.bbDrop / 2] }); }
    // wheelbase / front centre: under the floor line, like a geometry chart
    { const y = Math.min(gR, gF) - 45; put("wheelbase", mm(info.wheelbase), { segs: [[[AR[0], y], [AF[0], y], "dim"], [AR, [AR[0], y - 8], "ext"], [AF, [AF[0], y - 8], "ext"]], at: [(AR[0] + AF[0]) / 2, y] }); }
    { const y = Math.min(gR, gF) - 100; put("frontCentre", mm(info.frontCentre), { segs: [[[0, y], [AF[0], y], "dim"], [BB, [0, y - 8], "ext"], [AF, [AF[0], y - 8], "ext"]], at: [AF[0] / 2, y] }); }
    // BB height: BB straight down to the floor
    { const x = -60; put("bbHeight", mm(info.bbHeight), { segs: [[[x, 0], [x, gR], "dim"], [BB, [x - 8, 0], "ext"], [[30, gR], [x - 40, gR], "ext"]], at: [x, gR / 2] }); }
    // trail: on the floor, from where the steering axis meets it back to the tyre's contact point
    { const t = (gF - HTt[1]) / uHT[1], G = add(HTt, mul(uHT, t)), C = [AF[0], gF], y = gF - 22;
      put("trail", mm(info.trail), { segs: [[HTb, G, "ext"], [AF, [AF[0], y - 8], "ext"], [G, [G[0], y - 8], "ext"], [[C[0], y], [G[0], y], "dim"]], at: [(C[0] + G[0]) / 2, y - 26] }); }
    // fork axle-to-crown (straight line, crown race to axle) and offset (axle ahead of the steering axis, square to it)
    put("forkA2C", mm(g.forkA2C), aligned(Crown, AF, mul(nF, 70)));
    { const F = add(Crown, mul(uHT, (AF[0] - Crown[0]) * uHT[0] + (AF[1] - Crown[1]) * uHT[1]));
      put("forkOffset", mm(g.forkOffset), { segs: [[Crown, add(F, mul(uHT, 30)), "ext"], [F, AF, "dim"]], at: add(mid(F, AF), mul(uHT, 34)) }); }
    // fit: saddle height along the seat-angle line; sit-bone point and bar-clamp centre (same points the overlay compares)
    { const top = mul(uSTv, num(g.saddleHeight, 0)), d = uSTv, n = [-d[1], d[0]], back = n[0] < 0 ? n : mul(n, -1); put("saddleHeight", mm(g.saddleHeight), aligned(BB, top, mul(back, 95))); }
    const sit = P.Sit ? xy(P.Sit) : P.Saddle ? xy(P.Saddle) : null, barP = built && built.focus && (built.focus.bar || built.focus.cockpit), bar = barP ? xy(barP) : null;
    if (sit) { const y = sit[1] + 40; put("saddleSetback", mm(-sit[0]), { segs: [[[sit[0], y], [0, y], "dim"], [sit, [sit[0], y + 8], "ext"], [BB, [0, y + 8], "ext"]], at: [sit[0] / 2, y] }); }
    if (sit && bar) {
      const y = Math.max(sit[1], bar[1]) + 95;
      put("saddleToBar", mm(bar[0] - sit[0]), { segs: [[[sit[0], y], [bar[0], y], "dim"], [sit, [sit[0], y + 8], "ext"], [bar, [bar[0], y + 8], "ext"]], at: [(sit[0] + bar[0]) / 2, y] });
      const x = bar[0] + 70;
      put("barDrop", mm(sit[1] - bar[1]), { segs: [[[x, bar[1]], [x, sit[1]], "dim"], [bar, [x + 8, bar[1]], "ext"], [sit, [x + 8, sit[1]], "ext"]], at: [x + 10, (sit[1] + bar[1]) / 2] });
    }
    return out;
  }

  // ---------------------------------------------------------------- drawing (called by bike3d.js render on every new view)
  const NS = "http://www.w3.org/2000/svg";
  function draw(B, model, cam) {
    S.last = { B, model, cam };
    const L = S.layer; if (!L) return;
    const st = B && B.lastSt, built = B && B.built;
    const vis = !!(O.on && st && built && B.on && !(st.shown && st.shown.anim));
    L.hidden = !vis; if (!vis) return;
    const ck = [st.result, built];
    if (!S.cacheKey || S.cacheKey[0] !== ck[0] || S.cacheKey[1] !== ck[1]) { try { S.cache = compute(st, built); } catch (e) { S.cache = []; if (root.console) console.warn("geometry labels:", e); } S.cacheKey = ck; }
    const W = L.clientWidth || 1, H = L.clientHeight || 1, M4 = GL().M4, PV = M4.mul(cam.VP, model);
    const proj = p => { const x = p[0], y = p[1], z = p[2] || 0, w = PV[3] * x + PV[7] * y + PV[11] * z + PV[15];
      if (w <= 1e-6) return null;
      return [((PV[0] * x + PV[4] * y + PV[8] * z + PV[12]) / w * 0.5 + 0.5) * W, (0.5 - (PV[1] * x + PV[5] * y + PV[9] * z + PV[13]) / w * 0.5) * H]; };
    // seen edge-on (from the front / back) the dimensions all fall on one line: fade them out
    const dz = cam.eye && cam.tgt ? Math.abs(cam.eye[2] - cam.tgt[2]) / (Math.hypot(cam.eye[0] - cam.tgt[0], cam.eye[1] - cam.tgt[1], cam.eye[2] - cam.tgt[2]) || 1) : 1;
    const fade = Math.max(0, Math.min(1, (dz - 0.18) / 0.3));
    L.style.opacity = fade.toFixed(3); if (fade <= 0) return;
    const col = Object.fromEntries(GROUPS.map(g => [g[0], g[2]]));
    let paths = "";
    const shown = S.cache.filter(d => O.show[d.key]);
    if (O.lines) for (const d of shown) {
      let p = "", t = "";
      for (const [a, b, kind] of d.segs) {
        const A = proj(a), Bp = proj(b); if (!A || !Bp) continue;
        const seg = `M${A[0].toFixed(1)} ${A[1].toFixed(1)}L${Bp[0].toFixed(1)} ${Bp[1].toFixed(1)}`;
        if (kind === "ext") t += seg; else p += seg;
        if (kind === "dim") {   // little end ticks, square to the line on screen
          const dx = Bp[0] - A[0], dy = Bp[1] - A[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 5, ny = dx / l * 5;
          for (const Q of [A, Bp]) p += `M${(Q[0] - nx).toFixed(1)} ${(Q[1] - ny).toFixed(1)}L${(Q[0] + nx).toFixed(1)} ${(Q[1] + ny).toFixed(1)}`;
        }
      }
      const c = col[d.grp];
      if (t) paths += `<path class="gx" d="${t}" stroke="${c}"/>`;
      if (p) paths += `<path class="gh" d="${p}"/><path class="gl" d="${p}" stroke="${c}"/>`;
    }
    S.svg.innerHTML = paths;
    // tags: projected anchor, nudged so they don't sit on top of each other
    const placed = [], html = [];
    for (const d of shown) {
      const A = proj(d.at); if (!A) continue;
      const w = 9 + (d.text.length + d.val.length + 1) * 6.4, h = 20;
      let x = A[0], y = A[1];
      for (let k = 0; k < 8; k++) { const hit = placed.find(r => Math.abs(r[0] - x) < (r[2] + w) / 2 + 2 && Math.abs(r[1] - y) < h + 1); if (!hit) break; y = hit[1] + (y >= hit[1] ? h + 2 : -(h + 2)); }
      placed.push([x, y, w]);
      if (x < -60 || y < -30 || x > W + 60 || y > H + 30) continue;
      html.push(`<span class="gtag" data-key="${d.key}" style="transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%);--c:${col[d.grp]}"><b>${esc(d.text)}</b> ${esc(d.val)}</span>`);
    }
    S.tags.innerHTML = html.join("");
  }
  // redraw with the last view (settings changed) — no 3D re-render needed
  function redraw() { if (S.last) draw(S.last.B, S.last.model, S.last.cam); else if (B3()) B3().update(); }

  // ---------------------------------------------------------------- UI
  const css = `
.geo-pair { display: inline-flex; position: relative; }
.geo-pair > button:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.geo-pair > button.geo-gear { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: -1px; padding: 6px 8px; }
#btnGeoNums[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #fff); }
.geo-gear[aria-expanded="true"] { border-color: var(--accent); background: var(--bg, var(--panel)); }
.geo-pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 40; width: 330px; max-width: calc(100vw - 32px); background: var(--panel); color: var(--ink);
  border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.22); padding: 10px 12px; font-size: 13px; }
.geo-pop[hidden] { display: none; }
.geo-pop h5 { margin: 8px 0 4px; font: 600 11px var(--font-body); color: var(--muted); text-transform: uppercase; letter-spacing: .05em; display: flex; align-items: center; gap: 6px; }
.geo-pop h5 i { width: 14px; height: 4px; border-radius: 2px; display: inline-block; }
.geo-pop .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; }
.geo-pop label { display: flex; align-items: center; gap: 6px; padding: 2px 0; cursor: pointer; font-weight: 400; }
.geo-pop input[type=checkbox] { accent-color: var(--accent); margin: 0; }
.geo-pop .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; }
.geo-pop .row button { padding: 4px 8px; font-size: 12px; }
.geo-pop .note { color: var(--muted); font-size: 11.5px; margin: 8px 0 0; }
.geo-layer { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; transition: opacity .15s; }
.geo-layer[hidden], .viewer:not(.real) .geo-layer { display: none !important; }
.geo-layer svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.geo-layer path { fill: none; stroke-linecap: round; }
.geo-layer path.gh { stroke: rgba(0,0,0,.45); stroke-width: 3.6; }
.geo-layer path.gl { stroke-width: 1.7; }
.geo-layer path.gx { stroke-width: 1; stroke-dasharray: 4 4; opacity: .75; }
.geo-layer .gtag { position: absolute; left: 0; top: 0; white-space: nowrap; font: 600 12px/1 var(--font-body); font-variant-numeric: tabular-nums; color: #fff;
  background: rgba(18,20,24,.82); border: 1px solid var(--c); border-left-width: 3px; border-radius: 5px; padding: 4px 6px; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
.geo-layer .gtag b { font-weight: 500; color: rgba(255,255,255,.72); }`;

  function popHtml() {
    const groups = GROUPS.map(([gk, gname, c]) => `<h5><i style="background:${c}"></i>${esc(gname)}</h5><div class="grid">${
      DIMS.filter(d => d[2] === gk).map(d => `<label title="${esc(d[4] || d[1])}"><input type="checkbox" data-k="${d[0]}"${O.show[d[0]] ? " checked" : ""}>${esc(d[4] && d[4].length < 22 ? d[4] : d[1])}</label>`).join("")}</div>`).join("");
    return `<div style="display:flex;justify-content:space-between;align-items:center"><b>Geometry numbers to show</b><button type="button" data-a="close" aria-label="Close" style="padding:2px 7px">✕</button></div>${groups}
      <label style="margin-top:8px"><input type="checkbox" data-lines${O.lines ? " checked" : ""}>Measuring lines (off = number tags only)</label>
      <div class="row"><button type="button" data-a="all">All</button><button type="button" data-a="none">None</button><button type="button" data-a="def">Defaults</button></div>
      <p class="note">mm unless °. The numbers follow the bike as you turn it and update as you edit the design. Fit numbers: saddle = where you sit (sit bones), bar = centre of the bar clamp.</p>`;
  }
  function setOn(on) {
    O.on = !!on; save(); sync();
    if (O.on && root.CyclicLabsApp && B3() && !B3()._state.on && root.CyclicLabsApp.setReal) root.CyclicLabsApp.setReal(true);
    redraw();
  }
  function sync() {
    if (!S.btn) return;
    S.btn.setAttribute("aria-pressed", String(O.on));
    S.btn.title = O.on ? "Geometry numbers are on: click to hide them (⚙ picks which ones)" : "Show the geometry numbers on the 3D bike (⚙ picks which ones)";
    if (S.layer && !O.on) S.layer.hidden = true;
  }
  function openPop(open) {
    const p = S.pop; if (!p) return;
    p.hidden = !open; S.gear.setAttribute("aria-expanded", String(open));
    if (!open) return;
    p.innerHTML = popHtml();
    // keep it on screen: start under the button, slide left/right if it would poke out
    p.style.left = "0px"; const r = p.getBoundingClientRect(), vw = document.documentElement.clientWidth || innerWidth;
    let dx = 0; if (r.right > vw - 8) dx = vw - 8 - r.right; if (r.left + dx < 8) dx = 8 - r.left;
    p.style.left = dx + "px";
  }
  function mount() {
    const tools = document.getElementById("realTools"), wrap = document.getElementById("cwrap");
    if (!tools || !wrap || S.btn) return;
    const st = document.createElement("style"); st.id = "geoLabelsCss"; st.textContent = css; document.head.appendChild(st);
    const pair = document.createElement("span"); pair.className = "geo-pair";
    pair.innerHTML = `<button type="button" id="btnGeoNums">📐 Geometry numbers</button><button type="button" class="geo-gear" id="btnGeoGear" aria-haspopup="true" aria-expanded="false" title="Pick which geometry numbers to show" aria-label="Geometry number settings">⚙</button><div class="geo-pop" role="dialog" aria-label="Geometry numbers to show" hidden></div>`;
    tools.insertBefore(pair, document.getElementById("btnFull") || null);
    S.btn = pair.children[0]; S.gear = pair.children[1]; S.pop = pair.children[2];
    const layer = document.createElement("div"); layer.className = "geo-layer"; layer.hidden = true; layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = `<svg xmlns="${NS}"></svg><div class="tags"></div>`;
    wrap.appendChild(layer); S.layer = layer; S.svg = layer.firstChild; S.tags = layer.lastChild;
    S.btn.addEventListener("click", () => setOn(!O.on));
    S.gear.addEventListener("click", e => { e.stopPropagation(); openPop(S.pop.hidden); });
    S.pop.addEventListener("click", e => {
      e.stopPropagation();
      const a = e.target.closest("[data-a]"); if (!a) return;
      const k = a.dataset.a;
      if (k === "close") { openPop(false); return; }
      if (k === "all") DIMS.forEach(d => O.show[d[0]] = true);
      if (k === "none") DIMS.forEach(d => O.show[d[0]] = false);
      if (k === "def") O.show = defShow();
      save(); openPop(true); if (k !== "none" && !O.on) setOn(true); else redraw();
    });
    S.pop.addEventListener("change", e => {
      const t = e.target;
      if (t.dataset.k) O.show[t.dataset.k] = t.checked;
      if ("lines" in t.dataset) O.lines = t.checked;
      save(); if (t.checked && !O.on) setOn(true); else redraw();
    });
    document.addEventListener("click", e => { if (!S.pop.hidden && !e.target.closest(".geo-pair")) openPop(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !S.pop.hidden) { openPop(false); S.gear.focus(); } });
    sync();
  }

  // ---------------------------------------------------------------- design chat: "show geometry numbers", "hide the trail label", "show all labels"
  const NAMES = { reach: /\breach\b/, stack: /\bstack\b/, headAngle: /\bhead ?(tube )?angle\b|\bha\b/, seatAngle: /\bseat ?(tube )?angle\b/, headTube: /\bhead ?tube( length)?\b(?! angle)/,
    seatTube: /\bseat ?tube( length)?\b(?! angle)/, ett: /\b(effective )?top ?tube\b|\bett\b/, chainstay: /\bchain ?stays?\b|\bcs\b/, bbDrop: /\bbb drop\b/, wheelbase: /\bwheel ?base\b|\bwb\b/,
    frontCentre: /\bfront cent(re|er)\b/, bbHeight: /\bbb height\b/, trail: /\btrail\b/, forkA2C: /\baxle[- ]to[- ]crown\b|\ba2c\b/, forkOffset: /\b(fork )?offset\b|\brake\b/,
    saddleHeight: /\bsaddle height\b/, saddleSetback: /\bsetback\b/, saddleToBar: /\bsaddle to bar\b/, barDrop: /\bbar drop\b|\bsaddle[- ]bar drop\b/ };
  function chat(raw, text) {
    const t = String(text || raw).toLowerCase().trim();
    if (!/\b(labels?|dimensions?|dims|measurements? on|geometry (numbers|labels|tags)|numbers on the (bike|model|3d|frame)|geo (numbers|labels))\b/.test(t)) return null;
    const offW = /\b(hide|off|remove|no|stop|clear|without)\b/.test(t);
    const keys = Object.keys(NAMES).filter(k => NAMES[k].test(t));
    if (/\ball\b|\bevery\b/.test(t)) DIMS.forEach(d => O.show[d[0]] = !offW);
    else if (keys.length) keys.forEach(k => O.show[k] = !offW);
    else if (/\bdefaults?\b|\breset\b/.test(t)) O.show = defShow();
    else { setOn(!offW); return offW ? "Geometry numbers off." : "Geometry numbers on: " + DIMS.filter(d => O.show[d[0]]).map(d => d[1].toLowerCase()).join(", ") + ". Use ⚙ next to the button to pick others."; }
    save();
    if (!offW) setOn(true); else redraw();
    const on = DIMS.filter(d => O.show[d[0]]).map(d => d[1].toLowerCase());
    return (keys.length ? (offW ? "Hidden: " : "Showing: ") + keys.map(k => DIMS.find(d => d[0] === k)[1].toLowerCase()).join(", ") + ". " : "") + (on.length ? "On the bike now: " + on.join(", ") + "." : "No geometry numbers are picked now.");
  }

  root.FrameGeoLabels = { draw, redraw, compute, settings: O, DIMS, setOn, chat, _S: S };
  if (root.FrameChat) (root.FrameChat.extra = root.FrameChat.extra || []).push(chat);
  try {   // a tip in the guided tours, right after the overlay tip
    const T = root.FrameTour && root.FrameTour.TOURS;
    const step = { sel: "#btnGeoNums", title: "Geometry numbers on the bike", before: () => { try { if (!root.CyclicLabsApp.isReal()) root.CyclicLabsApp.setReal(true); } catch (e) {} },
      text: "Turns on reach, stack, angles and the other geometry numbers right on the 3D bike. They turn with it as you orbit and change as you edit. The ⚙ next to it picks which numbers you see." };
    for (const k of ["basics", "refine"]) if (T && Array.isArray(T[k])) { const i = T[k].map(x => x.sel).lastIndexOf("#btnOverlay"); if (i >= 0) T[k].splice(i + 1, 0, Object.assign({}, step)); }
  } catch (e) {}
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})(typeof window !== "undefined" ? window : globalThis);
