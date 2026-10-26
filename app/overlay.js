// Cyclic Labs — Bike overlay (realistic 3D view)
// Draws a second bike on top of the open design so the two can be compared in 3D: e.g. "my current bike" as a
// see-through ghost over the new design. Everything for this feature lives in this file; the only hooks
// elsewhere are: bike3d.js update() calls FrameOverlay.key() / FrameOverlay.build(), bike3d-gl.js draws items
// that carry .xf (own placement) and mat.ghost/opacity, chat.js runs FrameChat.extra handlers, page.html loads this file.
//
// Settings (kept in this browser): on, id (design to overlay), style "ghost" | "solid", color, opacity, align, frameOnly.
// "Quick bikes" = bikes typed in from a geometry chart (stored under frameBench.overlayBikes.v1), listed with the designs.
(function (root) {
  "use strict";
  const LS = "frameBench.overlay.v1", LSB = "frameBench.overlayBikes.v1";
  const COLORS = [["#1aa3ff", "Blue"], ["#ff8a1f", "Orange"], ["#22c55e", "Green"], ["#ff3d8b", "Pink"], ["#e8e8e8", "White"]];
  const ALIGN = [
    ["bbFloor", "Bottom brackets", "Both bikes on the floor, bottom brackets lined up front-to-back"],
    ["rearFloor", "Rear axles", "Both bikes on the floor, rear axles on top of each other"],
    ["frontFloor", "Front axles", "Both bikes on the floor, front axles on top of each other"],
    ["bb", "Fit (BB on BB)", "Bottom brackets exactly on top of each other: compares where your feet, hands and seat are. Wheels may sink into or float above the floor."]
  ];
  const O = { on: false, id: "", style: "ghost", color: "#1aa3ff", opacity: 0.35, align: "bbFloor", frameOnly: false };
  try { const v = JSON.parse(localStorage.getItem(LS) || "{}"); if (v && typeof v === "object") Object.assign(O, v); } catch (e) {}
  const S = { items: [], cache: new Map(), err: "", bikes: [], diff: null, names: null, card: null, btn: null };
  try { const b = JSON.parse(localStorage.getItem(LSB) || "[]"); if (Array.isArray(b)) S.bikes = b; } catch (e) {}
  const saveO = () => { try { localStorage.setItem(LS, JSON.stringify(O)); } catch (e) {} };
  const saveBikes = () => { try { localStorage.setItem(LSB, JSON.stringify(S.bikes)); return true; } catch (e) { return false; } };
  const App = () => root.CyclicLabsApp, FEA = () => root.FrameFEA, B3 = () => root.FrameBike3D, GL = () => root.Bike3DGL;
  const num = (v, d) => (v === "" || v == null || !isFinite(+v)) ? d : +v;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------------------------------------------------------------- designs that can be overlaid
  function designs() {
    const A = App(), F = FEA(), out = A ? A.allDesigns().map(d => Object.assign({}, d)) : [];
    for (const b of S.bikes) out.push({ id: b.id, name: b.name, notes: b.notes || "", quick: true, design: F.deepMerge(root.FRAME_DEFAULTS, b.design) });
    return out;
  }
  const find = id => designs().find(d => d.id === id) || null;
  // The "Overlay" dropdown lists the same bikes as "Your bikes" (saved bikes, same order) plus bikes typed in from a chart,
  // not every built-in example. Built-in examples only show when nothing is saved yet, and the one already
  // being overlaid stays in the list so the choice isn't lost. (Chat "overlay <name>" still searches everything.)
  function pickable() {
    const all = designs(), mine = all.filter(d => !d.preset);
    const out = mine.length ? mine : all.slice();
    if (O.id && !out.some(d => d.id === O.id)) { const cur = all.find(d => d.id === O.id); if (cur) out.unshift(cur); }
    return out;
  }
  function resultFor(d) {
    const k = JSON.stringify(d.design), hit = S.cache.get(d.id);
    if (hit && hit.k === k) { if (hit.err) throw new Error(hit.err); return hit.r; }
    let r = null, err = "";
    try { r = FEA().analyze(d.design); } catch (e) { err = e.message; }
    S.cache.set(d.id, { k, r, err });
    if (err) throw new Error(err);
    return r;
  }

  // ---------------------------------------------------------------- hooks called by bike3d.js
  // Anything here that changes the meshes must be in the key (look-only settings — colour, fade, style — are not:
  // they're applied to the already-built items by look()).
  function key() {
    if (!O.on || !O.id) return 0;
    const d = find(O.id);
    return JSON.stringify([O.id, O.align, O.frameOnly, d ? d.design : null]);
  }
  function ghostMat(mat) {
    const G = GL(), solid = O.style === "solid";
    return { base: G.hex2lin(O.color), metal: 0, rough: solid ? 0.42 : 0.5, clear: solid ? 0.3 : 0, map: mat.map, alphaTest: mat.alphaTest, twoSided: true,
      ghost: 1, opacity: solid ? 1 : O.opacity, noShadow: !solid };
  }
  function build(R, built, st, buildBike, dark) {
    S.items = []; S.err = ""; S.diff = null; S.names = null;
    if (!O.on || !O.id || !built) { refreshCard(); return; }
    try {
      const d = find(O.id);
      if (!d) { S.err = "That design isn't in this browser any more. Pick another one."; refreshCard(); return; }
      let res; try { res = resultFor(d); } catch (e) { S.err = `Couldn't build “${d.name}”: ${e.message}`; refreshCard(); return; }
      const proxy = {
        texture: c => R.texture(c),
        add: (mesh, mat) => { if (!mat || mat.ground || mat.decal) return null; const it = R.add(mesh, ghostMat(mat)); if (it) S.items.push(it); return it; }
      };
      const off = { wheels: false, rotors: false, fork: false, cockpit: false, post: false, drive: false };
      const gb = buildBike(proxy, { result: res, design: d.design, shown: null, partShow: O.frameOnly ? off : Object.assign({}, st.partShow || {}), mode: "paint" }, dark);
      // placement: each bike stands on its own wheels (its tilt about the rear contact point), then the overlay is slid so the chosen points line up
      const M4 = GL().M4, Mm = M4.rotZ(-built.tilt, built.pivot[0], built.pivot[1]), Mg = M4.rotZ(-gb.tilt, gb.pivot[0], gb.pivot[1]);
      const ap = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[12], M[1] * p[0] + M[5] * p[1] + M[13]];
      const ref = { bbFloor: "crank", bb: "crank", rearFloor: "hubR", frontFloor: "hubF" }[O.align] || "crank";
      const a1 = ap(Mm, built.focus[ref]), a2 = ap(Mg, gb.focus[ref]);
      const dx = a1[0] - a2[0], dy = O.align === "bb" ? a1[1] - a2[1] : built.pivot[1] - gb.pivot[1];
      const xf = Float32Array.from(Mg); xf[12] += dx; xf[13] += dy;
      for (const it of S.items) it.xf = xf;
      const b = built.bbox, g = gb.bbox;
      built.bbox = { x0: Math.min(b.x0, g.x0 + dx), x1: Math.max(b.x1, g.x1 + dx), y0: Math.min(b.y0, g.y0 + dy), y1: Math.max(b.y1, g.y1 + dy), z: Math.max(b.z, g.z) };
      S.diff = differences(st.result, st.design, built, res, d.design, gb);
      S.names = [App() ? App().designName() : "This design", d.name];
    } catch (e) { S.err = "Couldn't draw the overlay: " + e.message; S.items = []; if (root.console) console.error(e); }
    refreshCard();
  }
  // colour / fade / ghost-vs-solid without rebuilding
  function look() {
    for (const it of S.items) Object.assign(it.mat, ghostMat(it.mat));
    const st = B3() && B3()._state; if (st && st.R) st.R.shadowDirty = true;
    if (B3()) B3().update();
  }
  function rebuild() { if (!O.on) dropItems(); if (B3()) B3().update(); refreshCard(); }

  // ---------------------------------------------------------------- numbers: this design vs the overlay
  // Contact points come from the drawn bikes (BB at 0,0; x forward, y up): saddle = sit-bone point, bar = bar clamp centre.
  function points(res, des, bb) {
    const F = FEA(), g = des.geometry, P = res.model.geo.P, info = F.buildGeometry(g, des.tubes).info;
    const sit = P.Sit || P.Saddle, bar = bb.focus.bar || bb.focus.cockpit;
    return {
      reach: g.reach, stack: g.stack, headAngle: g.headAngle, seatAngle: g.seatAngle, headTube: g.headTube, seatTube: g.seatTube,
      chainstay: g.chainstay, bbDrop: g.bbDrop, bbHeight: info.bbHeight, wheelbase: info.wheelbase, frontCentre: info.frontCentre, trail: info.trail,
      ett: info.effectiveTopTube, forkA2C: g.forkA2C, forkOffset: g.forkOffset, tyre: g.tireDiameter, saddleHeight: g.saddleHeight,
      saddleSetback: -sit[0], barReachBB: bar[0], barHeightBB: bar[1], saddleToBar: bar[0] - sit[0], barDrop: sit[1] - bar[1]
    };
  }
  const ROWS = [
    ["Frame", [["reach", "Reach"], ["stack", "Stack"], ["headAngle", "Head angle", "°"], ["seatAngle", "Seat angle", "°"], ["headTube", "Head tube"], ["seatTube", "Seat tube"],
      ["chainstay", "Chainstay"], ["bbDrop", "BB drop"], ["ett", "Effective top tube"]]],
    ["Whole bike", [["wheelbase", "Wheelbase"], ["frontCentre", "Front centre"], ["bbHeight", "BB height"], ["trail", "Trail"], ["forkA2C", "Fork axle-to-crown"], ["forkOffset", "Fork offset"], ["tyre", "Tyre diameter"]]],
    ["Where you sit and hold on", [["saddleHeight", "Saddle height (from BB)"], ["saddleSetback", "Saddle behind BB"], ["barReachBB", "Bar ahead of BB"], ["barHeightBB", "Bar above BB"],
      ["saddleToBar", "Saddle to bar (reach)"], ["barDrop", "Saddle above bar (drop)"]]]
  ];
  function differences(r1, d1, b1, r2, d2, b2) {
    const a = points(r1, d1, b1), b = points(r2, d2, b2);
    return ROWS.map(([grp, rows]) => [grp, rows.map(([k, label, unit]) => ({ k, label, unit: unit || "mm", a: a[k], b: b[k] }))]);
  }
  const fmtN = (v, u) => !isFinite(v) ? "—" : u === "°" ? v.toFixed(1) + "°" : Math.round(v) + "";
  const fmtD = (d, u) => { if (!isFinite(d)) return ""; const r = u === "°" ? Math.round(d * 10) / 10 : Math.round(d); if (r === 0) return "same"; return (r > 0 ? "+" : "−") + Math.abs(r) + (u === "°" ? "°" : ""); };
  // one line for the panel: the biggest few differences
  function headline() {
    if (!S.diff) return "";
    const all = [].concat(...S.diff.map(g => g[1])).map(r => ({ r, d: r.a - r.b })).filter(x => fmtD(x.d, x.r.unit) !== "same" && isFinite(x.d));
    if (!all.length) return "— same shape and fit";
    const pick = ["reach", "stack", "headAngle", "wheelbase", "chainstay", "saddleToBar", "barDrop"].map(k => all.find(x => x.r.k === k)).filter(Boolean);
    const list = (pick.length ? pick : all).slice(0, 5);
    return "— " + list.map(x => `${x.r.label.toLowerCase()} ${fmtD(x.d, x.r.unit)}`).join(", ") + (all.length > list.length ? " …" : "");
  }
  // plain text for the chat
  function diffText() {
    if (!S.diff) return O.on ? (S.err || "Open the realistic view to see the overlay numbers.") : "No overlay is on.";
    const [n1, n2] = S.names, lines = [`**${n1}** compared with the overlay **${n2}** (mm unless °; + means ${n1} is bigger / further):`];
    for (const [grp, rows] of S.diff) {
      const ch = rows.filter(r => fmtD(r.a - r.b, r.unit) !== "same" && fmtD(r.a - r.b, r.unit) !== "");
      lines.push(`**${grp}**: ` + (ch.length ? ch.map(r => `${r.label} ${fmtN(r.a, r.unit)} vs ${fmtN(r.b, r.unit)} (${fmtD(r.a - r.b, r.unit)})`).join(" · ") : "all the same"));
    }
    return lines.join("\n");
  }

  // ---------------------------------------------------------------- quick bike from a geometry chart
  const QF = [
    ["Frame (from the geometry chart)", [["g", "reach", "Reach", "mm"], ["g", "stack", "Stack", "mm"], ["g", "headAngle", "Head angle", "°"], ["g", "seatAngle", "Seat angle (effective)", "°"],
      ["g", "chainstay", "Chainstay", "mm"], ["g", "bbDrop", "BB drop", "mm"], ["g", "headTube", "Head tube length", "mm"], ["g", "seatTube", "Seat tube length", "mm"],
      ["g", "forkA2C", "Fork axle-to-crown", "mm"], ["g", "forkOffset", "Fork offset", "mm"], ["g", "tireDiameter", "Tyre outside diameter", "mm"]]],
    ["How it's set up (optional)", [["g", "saddleHeight", "Saddle height (BB to saddle top)", "mm"], ["g", "crankLength", "Crank length", "mm"], ["c", "stemLength", "Stem length", "mm"],
      ["c", "stemRise", "Stem angle", "°"], ["c", "spacers", "Spacers under the stem", "mm"], ["c", "barWidth", "Bar width", "mm"], ["c", "barRise", "Bar rise", "mm"]]]
  ];
  function cockpitOf(des) {
    const PL = root.FramePartLib, FP = root.FrameParts || {}, o = Object.assign({}, FP.DEFAULTS || {}, des.parts || {});
    const ck = PL ? PL.resolve(des).cockpit : o;
    return { stemLength: num(ck.stemLength, 50), stemRise: num(ck.stemRise, 0), spacers: num(ck.spacers, num(o.spacers, 10)), barWidth: num(ck.barWidth, 760), barRise: num(ck.barRise, 20), barType: ck.barType || "flat",
      backsweep: num(ck.backsweep, 8), upsweep: num(ck.upsweep, 5) };
  }
  function makeQuick(base, vals) {
    const F = FEA(), d = JSON.parse(JSON.stringify(base)), g = d.geometry, g0 = base.geometry;
    for (const [k, v] of Object.entries(vals.g)) if (isFinite(v)) g[k] = v;
    // keep the tube junctions sensible for the new sizes (the chart doesn't give them)
    if (g.seatTube !== g0.seatTube && g0.seatTube > 0) { const f = g.seatTube / g0.seatTube; g.ttAtSeatTube = Math.min(g0.ttAtSeatTube * f, g.seatTube - 10); g.ssBelowTt = Math.min(g0.ssBelowTt, Math.max(0, g.ttAtSeatTube - 110)); }
    if (g.ttBelowHtTop + g.dtAboveHtBottom >= g.headTube - 20) { const f = (g.headTube - 30) / (g.ttBelowHtTop + g.dtAboveHtBottom); g.ttBelowHtTop *= f; g.dtAboveHtBottom *= f; }
    if (g.saddleHeight - g.seatTube < 80) g.saddleHeight = g.seatTube + 80;
    d.parts = d.parts || {}; const ck = Object.assign(cockpitOf(base), vals.c);
    Object.assign(d.parts, ck);
    if (d.parts.sel) { d.parts.sel = Object.assign({}, d.parts.sel); delete d.parts.sel.cockpit; }   // use these numbers, not a library stem/bar
    F.validate(d);   // throws a plain-language message if the numbers can't make a bike
    return d;
  }

  // ---------------------------------------------------------------- UI
  const css = `
.ovl-card { border-bottom: 1px solid var(--line); padding: 10px 14px; font-size: 13px; display: flex; flex-direction: column; gap: 8px; }
.viewer:not(.real) .ovl-card, .ovl-card[hidden] { display: none !important; }
.ovl-card .top { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.ovl-card .grp { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
.ovl-card .grp.pick { flex: 1 1 300px; }
.ovl-card .grp.pick select { flex: 1; min-width: 0; }
.ovl-card .lbl { color: var(--muted); white-space: nowrap; }
.ovl-card .seg button { padding: 5px 9px; }
.ovl-card .seg button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent, #fff); }
.ovl-card .sw { display: inline-flex; gap: 5px; }
.ovl-card .sw button { width: 22px; height: 22px; padding: 0; border-radius: 50%; border: 2px solid var(--line); }
.ovl-card .sw button[aria-pressed="true"] { border-color: var(--ink); box-shadow: 0 0 0 2px var(--panel) inset; }
.ovl-card input[type=range] { width: 110px; accent-color: var(--accent); }
.ovl-card .grp.align select { width: auto; }
.ovl-card .btns { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.ovl-card .btns button { padding: 5px 9px; font-size: 12.5px; }
.ovl-card .sub { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: center; }
.ovl-card .legend { display: inline-flex; flex-wrap: wrap; gap: 4px 14px; }
.ovl-card .legend span { display: inline-flex; align-items: center; gap: 6px; }
.ovl-card .legend i { flex: none; width: 16px; height: 9px; border-radius: 3px; }
.ovl-card .note { color: var(--muted); font-size: 12px; margin: 0; }
.ovl-card .err { color: var(--bad); font-size: 12.5px; margin: 0; }
.ovl-card details > summary { cursor: pointer; font-weight: 600; }
.ovl-card .tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 4px 22px; margin-top: 4px; }
.ovl-card table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.ovl-card caption { text-align: left; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; padding: 6px 0 2px; }
.ovl-card th, .ovl-card td { padding: 3px 4px; text-align: right; border-bottom: 1px solid var(--line); white-space: nowrap; font-variant-numeric: tabular-nums; }
.ovl-card th { color: var(--muted); font-weight: 600; font-size: 11.5px; }
.ovl-card th:first-child, .ovl-card td:first-child { text-align: left; white-space: normal; }
.ovl-card td.d { font-weight: 700; }
.ovl-card td.same { color: var(--muted); font-weight: 400; }
.ovl-card .qform { border: 1px solid var(--accent); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.ovl-card .qform .qhead { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.ovl-card .qform .qhead input { width: 220px; }
.ovl-card .qform .qhead select { width: auto; max-width: 100%; }
.ovl-card .qform h5 { margin: 4px 0 0; font: 600 11px var(--font-body); color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.ovl-card .qgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 5px 20px; }
.ovl-card .qgrid label { display: grid; grid-template-columns: minmax(0, 1fr) 84px; gap: 8px; align-items: center; }
#btnOverlay[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #fff); }`;

  function mount() {
    const tools = document.getElementById("realTools");
    if (!tools || S.card) return;
    const st = document.createElement("style"); st.id = "overlayCss"; st.textContent = css; document.head.appendChild(st);
    const btn = document.createElement("button"); btn.type = "button"; btn.id = "btnOverlay"; btn.textContent = "⧉ Overlay a bike";
    btn.title = "Draw another bike on top of this one (e.g. your current bike) to compare them in 3D";
    const full = document.getElementById("btnFull"); tools.insertBefore(btn, full || null);
    // docked under the 3D toolbar (not on the picture, so it never hides part of the bikes)
    const card = document.createElement("section"); card.className = "ovl-card"; card.setAttribute("aria-label", "Bike overlay"); card.hidden = true;
    tools.parentNode.insertBefore(card, tools.nextSibling);
    S.card = card; S.btn = btn;
    // the toolbar button is the overlay's on/off switch (the panel's "Hide panel" only tucks the controls away)
    btn.addEventListener("click", () => {
      if (O.on) { card.hidden = true; off(); }
      else { card.hidden = false; if (!O.id || !find(O.id)) O.id = defaultId(); if (O.id) { O.on = true; saveO(); rebuild(); } }
      refreshCard();
    });
    if (O.on && O.id) card.hidden = false;
    refreshCard();
  }
  // first time: the latest typed-in bike, else the first design that's shaped differently from the open one
  function defaultId() {
    const list = pickable(), A = App(), cur = A ? A.currentId() : "", g = A ? JSON.stringify(A.design().geometry) : "";
    const q = list.filter(d => d.quick); if (q.length) return q[q.length - 1].id;
    const diff = list.find(d => d.id !== cur && JSON.stringify(d.design.geometry) !== g);
    return (diff || list.find(d => d.id !== cur) || {}).id || "";
  }
  let qName = "My current bike";
  let quickOpen = false, quickMsg = "", quickBase = "", showNums = false, chart = null, chartSize = 0, chartText = "", chartMsg = "", chartOpen = false;
  function refreshCard() {
    const card = S.card; if (!card) return;
    if (S.btn) { S.btn.setAttribute("aria-pressed", String(!!O.on)); S.btn.title = O.on ? "Overlay is on: click to turn it off" : "Draw another bike on top of this one (e.g. your current bike) to compare them in 3D"; }
    if (card.hidden) return;
    const A = App(), list = designs(), pick = pickable(), cur = A ? A.currentId() : "";
    const opt = d => `<option value="${esc(d.id)}"${d.id === O.id ? " selected" : ""}>${d.garage ? "🏠 " : ""}${esc(d.name)}${d.preset ? " (example)" : d.id === cur ? " (saved version of this one)" : ""}</option>`;
    const grp = (items, label) => !items.length ? "" : `<optgroup label="${esc(label)}">${items.map(opt).join("")}</optgroup>`;
    const typed = pick.filter(d => d.quick), rest = pick.filter(d => !d.quick);
    const opts = (O.id ? "" : `<option value="">Pick a bike…</option>`) + (typed.length ? grp(rest, "Your bikes") + grp(typed, "Typed in from a chart") : rest.map(opt).join(""));
    const sel = find(O.id), solid = O.style === "solid";
    const table = S.diff ? `<details ${showNums ? "open" : ""} data-nums><summary>Numbers: this design vs the overlay <span class="lbl" style="font-weight:400">${esc(headline())}</span></summary><div class="tabs">${
      S.diff.map(([grp, rows]) => `<table><caption>${esc(grp)}</caption><thead><tr><th></th><th>This</th><th>Overlay</th><th>Diff.</th></tr></thead><tbody>` + rows.map(r => { const dd = fmtD(r.a - r.b, r.unit); return `<tr><td>${esc(r.label)}</td><td>${fmtN(r.a, r.unit)}</td><td>${fmtN(r.b, r.unit)}</td><td class="d${dd === "same" ? " same" : ""}">${dd}</td></tr>`; }).join("") + `</tbody></table>`).join("")
    }</div><p class="note">mm unless °. Diff. = this design minus the overlay (+ = bigger, further forward or higher on this design). Saddle = where you sit (sit bones); bar = centre of the bar clamp.</p></details>` : "";
    const qb = quickBase || cur;
    const qBaseDes = (find(qb) || {}).design || (A && A.design());
    const qck = qBaseDes ? cockpitOf(qBaseDes) : {};
    const fromChart = chart ? root.FrameGeoImport.pickSize(chart, chartSize).values : {};
    const qval = (t, k) => { if (t === "g" && fromChart["geometry." + k] != null) return fromChart["geometry." + k]; if (!qBaseDes) return ""; const v = t === "g" ? qBaseDes.geometry[k] : qck[k]; return v == null ? "" : Math.round(v * 10) / 10; };
    const quick = quickOpen ? `<div class="qform" data-q>
        <div class="qhead"><b>Add a bike from its geometry chart</b><label class="grp"><span class="lbl">Name</span><input type="text" data-qname value="${esc(qName)}" aria-label="Name for this bike"></label>
          <label class="grp"><span class="lbl">Start from</span><select data-qbase aria-label="Start from">${list.filter(d => !d.quick).map(d => `<option value="${esc(d.id)}"${d.id === qb ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label></div>
        ${root.FrameGeoImport ? `<details data-chart ${chartOpen ? "open" : ""}><summary>Paste the maker's geometry chart (quicker)</summary>
          <p class="note">On the maker's website select the whole geometry table (all sizes), copy it, paste it here and press Read. Then pick your size.</p>
          <textarea data-chartText rows="5" style="width:100%" aria-label="Geometry chart">${esc(chartText)}</textarea>
          <div class="btns"><button type="button" data-act="chartRead">Read chart</button>${chart && chart.sizes.length ? `<label class="grp"><span class="lbl">Size</span><select data-chartSize aria-label="Size">${chart.sizes.map((z, k) => `<option value="${k}"${k === chartSize ? " selected" : ""}>${esc(z)}</option>`).join("")}</select></label>` : ""}</div>
          ${chartMsg ? `<p class="note">${esc(chartMsg)}</p>` : ""}</details>` : ""}
        ${QF.map(([h, fs]) => `<h5>${esc(h)}</h5><div class="qgrid">` + fs.map(([t, k, l, u]) => `<label><span>${esc(l)} <span class="lbl">${u}</span></span><input type="number" step="any" data-qt="${t}" data-qk="${k}" value="${qval(t, k)}"></label>`).join("") + `</div>`).join("")}
        <p class="note">Copy the numbers from the bike's geometry chart (maker's website). Anything you leave as it is comes from the design you started from. Tube sizes don't matter here: this is only for comparing shape and fit.</p>
        ${quickMsg ? `<p class="err">${esc(quickMsg)}</p>` : ""}
        <div class="btns"><button type="button" class="primary" data-act="qsave">Add &amp; overlay it</button><button type="button" data-act="qcancel">Cancel</button></div></div>` : "";
    card.innerHTML = `<div class="top">
        <label class="grp pick"><span class="lbl">Overlay</span><select data-k="id" aria-label="Bike to overlay">${opts}</select></label>
        <span class="grp seg" role="group" aria-label="Show it as"><button type="button" data-style="ghost" aria-pressed="${!solid}">See-through</button><button type="button" data-style="solid" aria-pressed="${solid}">Solid colour</button></span>
        <span class="grp sw" role="group" aria-label="Colour">${COLORS.map(([c, n]) => `<button type="button" data-color="${c}" title="${n}" aria-label="${n}" aria-pressed="${c === O.color}" style="background:${c}"></button>`).join("")}</span>
        ${solid ? "" : `<label class="grp" title="How solid the see-through bike looks"><span class="lbl">Fade</span><input type="range" min="0.1" max="0.9" step="0.05" value="${O.opacity}" data-k="opacity" aria-label="How solid the see-through bike looks"></label>`}
        <label class="grp align" title="${esc((ALIGN.find(a => a[0] === O.align) || ALIGN[0])[2])}"><span class="lbl">Line up</span><select data-k="align" aria-label="Line the bikes up at">${ALIGN.map(([v, l]) => `<option value="${v}"${v === O.align ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <span class="grp seg" role="group" aria-label="Overlay shows"><button type="button" data-frame="0" aria-pressed="${!O.frameOnly}">Whole bike</button><button type="button" data-frame="1" aria-pressed="${O.frameOnly}">Frame only</button></span>
        <span class="btns"><button type="button" data-act="toggle">${O.on ? "Overlay off" : "Overlay on"}</button><button type="button" data-act="swap" ${sel && !sel.quick ? "" : "disabled"} title="Open the overlaid design and overlay this one instead">⇄ Swap</button>${quickOpen ? "" : `<button type="button" data-act="quick" title="Type in your current bike's geometry chart">+ Add my current bike</button>`}${sel && sel.quick ? `<button type="button" data-act="qdel" title="Remove this typed-in bike">Remove</button>` : ""}<button type="button" data-act="close" title="Hide these controls (the overlay stays on; the ⧉ Overlay a bike button turns it off)">Hide panel</button></span>
      </div>
      ${S.err ? `<p class="err">${esc(S.err)}</p>` : ""}
      ${O.on && S.names ? `<div class="sub"><span class="legend"><span><i style="background:var(--accent)"></i>Solid: ${esc(S.names[0])}</span><span><i style="background:${esc(O.color)};opacity:${solid ? 1 : 0.6}"></i>${solid ? "Colour" : "See-through"}: ${esc(S.names[1])}</span></span><p class="note">${esc((ALIGN.find(a => a[0] === O.align) || ALIGN[0])[2].replace(/\.?$/, "."))}</p></div>` : ""}
      ${quick}
      ${O.on ? table : ""}`;
    wire(card);
  }
  function wire(card) {
    const q = s => card.querySelectorAll(s);
    q('[data-k="id"]').forEach(s => s.onchange = () => { O.id = s.value; O.on = true; saveO(); rebuild(); });
    q('[data-k="align"]').forEach(s => s.onchange = () => { O.align = s.value; saveO(); rebuild(); });
    q('[data-k="opacity"]').forEach(s => s.oninput = () => { O.opacity = +s.value; saveO(); look(); });
    q("[data-style]").forEach(b => b.onclick = () => { O.style = b.dataset.style; saveO(); look(); refreshCard(); });
    q("[data-color]").forEach(b => b.onclick = () => { O.color = b.dataset.color; saveO(); look(); refreshCard(); });
    q("[data-frame]").forEach(b => b.onclick = () => { O.frameOnly = b.dataset.frame === "1"; saveO(); rebuild(); });
    q("[data-act]").forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === "close") { card.hidden = true; refreshCard(); if (S.btn) S.btn.setAttribute("aria-pressed", String(O.on)); App() && App().toast("Overlay controls hidden. The overlay stays on: click ⧉ Overlay a bike to turn it off."); }
      else if (a === "toggle") { if (O.on) off(); else { O.on = true; saveO(); rebuild(); } }
      else if (a === "swap") { const r = swap(); if (r && App()) App().toast(r); }
      else if (a === "quick") { quickOpen = true; quickMsg = ""; refreshCard(); const f = card.querySelector("[data-q]"); if (f) f.scrollIntoView({ block: "nearest" }); }
      else if (a === "qcancel") { quickOpen = false; quickMsg = ""; chart = null; chartText = ""; chartMsg = ""; refreshCard(); }
      else if (a === "chartRead") {
        chartText = card.querySelector("[data-chartText]").value; chartOpen = true;
        try { chart = root.FrameGeoImport.parseChart(chartText); } catch (e) { chart = null; }
        if (!chart || !chart.rows.length) { chart = null; chartMsg = "Couldn't find any geometry numbers in that. Copy the whole table including the row names (Reach, Stack, Head angle …)."; }
        else { chartSize = Math.min(chartSize, chart.sizes.length - 1); chartMsg = `Found ${chart.found.length} numbers for ${chart.sizes.length} size${chart.sizes.length === 1 ? "" : "s"}. Check them below, then press Add.` + (chart.unknown.length ? ` Not used: ${chart.unknown.slice(0, 6).join(", ")}.` : ""); }
        refreshCard();
      }
      else if (a === "qdel") { removeQuick(O.id); }
      else if (a === "qsave") {
        const vals = { g: {}, c: {} }; q("[data-qk]").forEach(i => { if (i.value !== "" && isFinite(+i.value)) vals[i.dataset.qt][i.dataset.qk] = +i.value; });
        const name = (card.querySelector("[data-qname]").value || "My current bike").trim();
        const r = addQuick(name, quickBase || (App() && App().currentId()), vals);
        if (r.error) { quickMsg = r.error; refreshCard(); } else { quickOpen = false; quickMsg = ""; quickBase = ""; chart = null; chartText = ""; chartMsg = ""; App() && App().toast(`Added “${name}” and put it on as the overlay.`); }
      }
    });
    q("[data-qbase]").forEach(s => s.onchange = () => { quickBase = s.value; refreshCard(); });
    q("[data-qname]").forEach(i => i.oninput = () => { qName = i.value; });
    q("[data-nums]").forEach(d => d.ontoggle = () => { showNums = d.open; });
    q("[data-chartSize]").forEach(s => s.onchange = () => { chartSize = +s.value; chartText = card.querySelector("[data-chartText]").value; refreshCard(); });
    q("[data-chart]").forEach(d => d.ontoggle = () => { chartOpen = d.open; });
  }

  // ---------------------------------------------------------------- actions (used by the panel and the chat)
  function setOverlay(id) {
    if (id) O.id = id; O.on = !!O.id; saveO();
    if (App() && B3() && !B3()._state.on) App().setReal(true);
    if (S.card) S.card.hidden = false;
    rebuild();
  }
  // Off = remove the overlay bike from the graphics card right away and force a full redraw, so no tint can be left
  // behind even if the normal refresh is skipped (e.g. while the analysis is re-running or the 3D view is hidden).
  function dropItems() {
    const st = B3() && B3()._state, R = st && st.R;
    if (R && R.items) {
      const gl = R.gl;
      R.items = R.items.filter(it => {
        if (!(it.mat && it.mat.ghost) && !it.xf) return true;
        try { gl.deleteVertexArray(it.vao); for (const b of it.bufs) gl.deleteBuffer(b); } catch (e) {}
        return false;
      });
      R.shadowDirty = true;
    }
    if (st) { st.key = ""; st.acc = 0; st.done = false; }   // next update() rebuilds the scene from scratch
    S.items = []; S.diff = null; S.names = null;
  }
  function off() { O.on = false; saveO(); dropItems(); rebuild(); }
  function swap() {
    const A = App(), d = find(O.id); if (!A || !d) return "Pick a design to overlay first.";
    if (d.quick) return "A typed-in bike can't be opened as a design. Use “Start from” + Save as in the main panel to make a full design instead.";
    if (A.diff && A.diff().length) return "Save or undo your changes to this design first, then swap.";
    const was = A.currentId(); A.openDesign(d.id); O.id = was; O.on = true; saveO(); rebuild();
    return `Swapped: now showing **${d.name}**, with the previous design as the overlay.`;
  }
  function addQuick(name, baseId, vals) {
    const base = find(baseId) || (App() ? { design: App().design() } : null);
    if (!base) return { error: "No design to start from." };
    let d; try { d = makeQuick(base.design, vals); } catch (e) { return { error: "Those numbers don't make a bike yet: " + e.message }; }
    const id = "quick-" + Date.now().toString(36);
    S.bikes.push({ id, name: name || "My current bike", notes: "Typed in from a geometry chart (overlay)", design: d });
    const ok = saveBikes();
    setOverlay(id);
    return { id, ok };
  }
  function removeQuick(id) { S.bikes = S.bikes.filter(b => b.id !== id); saveBikes(); if (O.id === id) { O.id = ""; O.on = false; saveO(); } rebuild(); }

  // ---------------------------------------------------------------- design chat commands (chat.js runs FrameChat.extra handlers)
  const words = s => String(s).toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim().split(/\s+/).filter(Boolean);
  function matchName(q) {
    const STOPW = new Set(["the", "a", "my", "on", "top", "of", "it", "this", "over", "with", "as", "bike", "design", "show", "overlay", "ghost", "put"]);
    const qt = words(q).filter(w => !STOPW.has(w)); if (!qt.length) return null;
    let best = null, bs = 0;
    for (const d of designs()) { const nt = words(d.name); const s = qt.filter(w => nt.some(n => n === w || (w.length > 3 && n.startsWith(w)))).length / qt.length + (d.name.toLowerCase().includes(qt.join(" ")) ? 0.5 : 0); if (s > bs) { bs = s; best = d; } }
    return bs >= 0.5 ? best : null;
  }
  function chat(raw, text) {
    const t = String(text || raw).toLowerCase().trim();
    if (!/\b(overlay|overlaid|ghost|line (them |it )?up|fit view|on top of each other)\b/.test(t)) return null;
    let m;
    if (/\b(off|hide|remove|no|stop|clear)\b.*\boverlay\b|\boverlay\b.*\b(off|hide|none|nothing|stop)\b/.test(t) && !/\bwhole|frame\b/.test(t)) { off(); return "Overlay off."; }
    if (/\bswap\b/.test(t)) return swap();
    if (/\b(differences?|numbers|compare|how (does|do) (it|they) compare)\b/.test(t)) return diffText();
    const did = [];
    if (/\bsee[- ]?through|\bghost\b|transparent|x-?ray/.test(t)) { O.style = "ghost"; did.push("see-through"); }
    if (/\bsolid\b/.test(t)) { O.style = "solid"; did.push("solid colour"); }
    for (const [c, n] of COLORS) if (new RegExp("\\b" + n.toLowerCase() + "\\b").test(t)) { O.color = c; did.push(n.toLowerCase()); }
    if ((m = t.match(/\b(?:fade|opacity|see[- ]?through|transparency|solidness)\D{0,12}(\d{1,3})\s*%?/))) { let v = +m[1] / 100; if (/transparen/.test(t)) v = 1 - v; O.opacity = Math.max(0.1, Math.min(0.9, v)); O.style = "ghost"; did.push(`see-through at ${Math.round(O.opacity * 100)}%`); }
    let rebuildNeeded = false;
    if (/\bfit view\b|\bbb on bb\b|\bbottom brackets? on top\b/.test(t)) { O.align = "bb"; did.push("fit view (BBs on top of each other)"); rebuildNeeded = true; }
    else if (/\bline\b.*\b(rear|back) (axle|wheel)/.test(t) || /\b(rear|back) axles?\b/.test(t)) { O.align = "rearFloor"; did.push("lined up at the rear axles"); rebuildNeeded = true; }
    else if (/\bline\b.*\bfront (axle|wheel)/.test(t) || /\bfront axles?\b/.test(t)) { O.align = "frontFloor"; did.push("lined up at the front axles"); rebuildNeeded = true; }
    else if (/\bline\b.*\b(bb|bottom bracket|crank)/.test(t)) { O.align = "bbFloor"; did.push("lined up at the bottom brackets"); rebuildNeeded = true; }
    if (/\bframe only\b|\bjust the frame\b/.test(t)) { O.frameOnly = true; did.push("frame only"); rebuildNeeded = true; }
    if (/\bwhole bike\b|\bfull bike\b/.test(t)) { O.frameOnly = false; did.push("whole bike"); rebuildNeeded = true; }
    // a design name: "overlay my current bike", "overlay the example as a ghost"
    const nameQ = t.replace(/\b(overlay|overlaid|on top|see[- ]?through|ghost|solid|transparent|in|as|a|an|colou?r|blue|orange|green|pink|white|fade|opacity|\d+\s*%?|frame only|whole bike|line (them |it )?up|at|the|bbs?|bottom brackets?|rear|front|axles?|fit view|and|with|show|put|please)\b/g, " ");
    const d = words(nameQ).length ? matchName(nameQ) : null;
    if (d) { O.id = d.id; did.unshift(`overlaying **${d.name}**`); rebuildNeeded = true; }
    else if (words(nameQ).length && !did.length) return `I couldn't find a bike called “${nameQ.trim()}” to overlay. Bikes: ${designs().map(x => x.name).join(" · ")}`;
    if (!O.id || !find(O.id)) { O.id = defaultId(); const first = find(O.id); if (first) did.unshift(`overlaying **${first.name}**`); }
    O.on = true; saveO();
    setOverlay(O.id);
    if (!rebuildNeeded) look();
    return did.length ? "Overlay: " + did.join(", ") + "." : "Overlay on.";
  }

  // ---------------------------------------------------------------- start
  root.FrameOverlay = { key, build, look, settings: O, designs, setOverlay, off, swap, addQuick, removeQuick, diffText, chat, get diff() { return S.diff; }, get error() { return S.err; }, _S: S };
  if (root.FrameChat) (root.FrameChat.extra = root.FrameChat.extra || []).push(chat);
  // a tip in the guided tours (tour.js): after the 3D-view tip (basics) / the parts tip (refine), else at the end
  try {
    const T = root.FrameTour && root.FrameTour.TOURS;
    const step = { sel: "#btnOverlay", title: "Overlay another bike", before: () => { try { if (!App().isReal()) App().setReal(true); } catch (e) {} },
      text: "Draw a second bike over this one in 3D: e.g. the bike you ride now as a see-through ghost over your new design. Line them up at the bottom brackets, the axles, or BB on BB for fit, and read the differences in mm. “+ Add my current bike” takes the numbers from its geometry chart." };
    for (const k of ["basics", "refine"]) if (T && Array.isArray(T[k])) { const i = T[k].map(x => x.sel).lastIndexOf(k === "refine" ? "#realPanel" : ".modeseg"); T[k].splice(i >= 0 ? i + 1 : T[k].length, 0, Object.assign({}, step)); }
  } catch (e) {}
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})(typeof window !== "undefined" ? window : globalThis);
