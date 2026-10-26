// ============================================================================
//  NEW PROJECT WALKTHROUGH (newbike.js)
//  Click-through set-up for a new bike:
//    welcome → kind of bike → wheel size → widest tyre to fit → "do you know your geometry?"
//      (no: pick a size · start from a bike-fit report (Retül PDF, fitreport.js) · type it ·
//       copy a brand's geometry chart · load a BikeCAD file · scan a builder's drawing)
//    → check the numbers (picture explains each one) → about you → build.
//  It starts from a clean generic template (templates.js), never from anyone's
//  own bike. Needs: templates.js, geoimport.js, fea.js and CyclicLabsApp hooks.
//  To add a step or a question, add a case to render() below.
// ============================================================================
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = `
  dialog.nb { width: min(980px, calc(100vw - 24px)); max-width: none; max-height: calc(100vh - 24px); padding: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--ink); }
  dialog.nb::backdrop { background: rgba(10, 12, 16, .55); }
  .nb-wrap { display: flex; flex-direction: column; max-height: calc(100vh - 26px); }
  .nb-head { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .nb-head h2 { font-size: 20px; flex: 1 1 200px; }
  .nb-steps { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--muted); flex-wrap: wrap; }
  .nb-steps span { padding: 2px 9px; border-radius: 99px; border: 1px solid var(--line); }
  .nb-steps span.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .nb-steps span.done { color: var(--accent); border-color: var(--accent); }
  .nb-body { padding: 18px; overflow: auto; display: flex; flex-direction: column; gap: 14px; }
  .nb-body h3 { font-size: 22px; }
  .nb-body .lead { color: var(--muted); max-width: 70ch; }
  .nb-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .nb-card { text-align: left; display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: 10px; border: 1.5px solid var(--line); background: var(--bg); font: inherit; color: var(--ink); cursor: pointer; }
  .nb-card:hover, .nb-card:focus-visible { border-color: var(--accent); background: var(--accent-soft); }
  .nb-card[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
  .nb-card b { font: 600 18px var(--font-display); }
  .nb-card small { color: var(--muted); font-size: 13px; line-height: 1.35; }
  .nb-card svg { width: 100%; height: 70px; color: var(--ink); }
  .nb-foot { display: flex; gap: 8px; align-items: center; padding: 12px 18px; border-top: 1px solid var(--line); flex-wrap: wrap; }
  .nb-foot .grow { flex: 1; }
  .nb-num { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 1.1fr); gap: 18px; align-items: start; }
  @media (max-width: 760px) { .nb-num { grid-template-columns: minmax(0, 1fr); } }
  .nb-fields { display: flex; flex-direction: column; gap: 6px; }
  .nb-f { display: grid; grid-template-columns: minmax(0, 1fr) 90px 26px; gap: 8px; align-items: center; font-size: 14px; padding: 3px 6px; border-radius: 6px; border-left: 3px solid transparent; }
  .nb-f.from { border-left-color: var(--ok); }
  .nb-f.focus { background: var(--accent-soft); }
  .nb-f small { display: block; color: var(--muted); font-size: 11.5px; }
  .nb-f input { font-family: var(--font-data); font-size: 13px; text-align: right; width: 100%; }
  .nb-f .u { color: var(--muted); font: 12px var(--font-data); }
  .nb-pic { position: sticky; top: 0; display: flex; flex-direction: column; gap: 8px; }
  .nb-pic svg { width: 100%; height: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; }
  .nb-pic .explain { font-size: 13.5px; min-height: 3.2em; }
  .nb-checks { display: flex; flex-direction: column; gap: 5px; font-size: 13.5px; }
  .nb-checks .ck { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .nb-paste textarea { width: 100%; min-height: 170px; font: 12.5px/1.4 var(--font-data); }
  .nb-sizes { display: flex; gap: 8px; flex-wrap: wrap; }
  .nb-sizes button { min-width: 64px; padding: 10px 14px; font-size: 15px; }
  .nb-sizes button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .nb-drop { border: 2px dashed var(--line); border-radius: 12px; padding: 28px 18px; text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; }
  .nb-drop.over { border-color: var(--accent); background: var(--accent-soft); }
  .nb-you { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px 18px; max-width: 760px; }
  .nb-you label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
  .nb-you .row { display: flex; gap: 6px; }
  .nb-you .row input { flex: 1; }
  .nb-list { margin: 0; padding-left: 18px; font-size: 14px; }
  .nb-warn { color: var(--warn); font-size: 13.5px; margin: 0; }
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  // little side-view icons for the bike kinds
  const ICON = {
    road: `<svg viewBox="0 0 160 70" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="32" cy="46" r="21"/><circle cx="128" cy="46" r="21"/><path d="M32 46 62 46 54 20 108 22 62 46M54 20 32 46M108 22 128 46M105 14l3 8M50 15h10M104 14c6-2 12 0 12 6 0 4-4 5-6 3"/></svg>`,
    gravel: `<svg viewBox="0 0 160 70" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="32" cy="46" r="20" stroke-width="5" stroke-dasharray="2 3"/><circle cx="128" cy="46" r="20" stroke-width="5" stroke-dasharray="2 3"/><path d="M32 46 62 46 54 20 106 20 62 46M54 20 32 46M106 20 128 46M104 12l2 8M50 15h10M102 12c6-2 12 0 12 6 0 4-4 5-6 3"/></svg>`,
    mtb: `<svg viewBox="0 0 160 70" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="30" cy="45" r="22" stroke-width="6" stroke-dasharray="3 3"/><circle cx="130" cy="45" r="22" stroke-width="6" stroke-dasharray="3 3"/><path d="M30 45 64 48 52 24 104 18 64 48M52 24 30 45M104 18 130 45M100 8l4 10M46 14h12M94 8h18"/></svg>`
  };
  const SOURCES = [
    ["size", "Not yet: start from a typical size", "Pick S, M, L or XL. You can change every number later."],
    ["fit", "Start from my bike fit (Retül)", "Upload the PDF from your bike fit. Your saddle and handlebar position become the frame's reach, stack and seat angle: the best starting point there is."],
    ["type", "Yes: I'll type the numbers", "Reach, stack, angles and so on, from a bike you like or your builder's spec."],
    ["chart", "Copy a geometry chart", "Copy the geometry table from a bike brand's website (or a spreadsheet) and paste it in."],
    ["bcad", "Load a BikeCAD file", "A .bcad file saved from BikeCAD. Read on this computer; no internet needed."],
    ["scan", "Scan a builder's drawing", "A PDF, picture or photo of a frame drawing. The scanner reads the numbers off it."],
    ["typed", "Type the numbers off a frame drawing", "Each number as the builder prints it (stack, reach, fork length, tube positions…), with a numbered picture; the drawing's own totals are cross-checked."]
  ];
  const SIZE_HINT = { S: "about 160–170 cm (5'3\"–5'7\") riders", M: "about 170–178 cm (5'7\"–5'10\")", L: "about 178–186 cm (5'10\"–6'1\")", XL: "about 186–196 cm (6'1\"–6'5\")" };
  // the numbers asked for, with plain-language explanations shown next to the picture
  const MAIN = [
    ["geometry.reach", "Reach", "mm", "Straight forward from the middle of the cranks (BB) to the top of the head tube. Longer = more stretched out and stable."],
    ["geometry.stack", "Stack", "mm", "Straight up from the BB to the top of the head tube. Higher = more upright position."],
    ["geometry.headAngle", "Head angle", "°", "Angle of the steering tube to the ground. Lower (slacker) = calmer on steep ground; higher (steeper) = quicker steering."],
    ["geometry.seatAngle", "Seat angle", "°", "Angle of the seat tube to the ground. Steeper puts you more over the cranks for climbing."],
    ["geometry.chainstay", "Chainstay", "mm", "BB to the rear axle. Shorter = livelier; longer = more stable and more tyre room."],
    ["geometry.bbDrop", "BB drop", "mm", "How far the BB sits below the wheel axles. More drop = lower, more planted bike."],
    ["geometry.headTube", "Head tube length", "mm", "Length of the tube the fork steerer runs through."],
    ["geometry.seatTube", "Seat tube length", "mm", "BB to the top of the seat tube (centre-to-top)."],
    ["geometry.forkA2C", "Fork axle-to-crown", "mm", "Fork length: front axle up to the bottom of the fork crown. From the fork maker's chart."],
    ["geometry.forkOffset", "Fork offset (rake)", "mm", "How far the front axle sits ahead of the steering line. With the head angle it sets the trail."]
  ];
  const MORE = [
    ["geometry.saddleHeight", "Saddle height (from BB)", "mm", "BB centre to the top of the saddle, measured along the seat tube."],
    ["geometry.tireWidth", "Tyre width", "mm", "Widest tyre you'll fit (sets the clearance checks)."],
    ["geometry.crankLength", "Crank length", "mm", "Crank arm length."]
  ];
  const CHECK_LABEL = { "check.wheelbase": "Wheelbase", "check.frontCentre": "Front centre", "check.ett": "Effective top tube", "check.trail": "Trail", "check.bbHeight": "BB height" };
  // numbers that the fit report sets but that aren't in the boxes above (shown in "Also read from …")
  const XLABEL = { "geometry.saddleSetback": "Sit bones behind seatpost clamp", "parts.stemLength": "Stem length", "parts.stemRise": "Stem angle", "parts.spacers": "Spacers under the stem", "parts.barWidth": "Handlebar width" };
  const STEPS = [["type", "Bike"], ["wheels", "Wheels"], ["tyres", "Tyres"], ["geo", "Geometry"], ["you", "You"]];

  let dlg = null, S = null;
  const T = () => window.FrameTemplates, FEA = () => window.FrameFEA, FR = () => window.FrameFitReport, GI = () => window.FrameGeoImport, App = () => window.CyclicLabsApp;

  function open(opts) {
    opts = opts || {};
    if (!dlg) {
      dlg = document.createElement("dialog"); dlg.className = "nb"; dlg.setAttribute("aria-label", "New bike");
      document.body.appendChild(dlg);
    }
    S = { step: opts.step || "welcome", type: null, wheel: null, tyre: null, size: "M", source: null, values: {}, src: {}, notes: [], warnings: [], chart: null, chartSize: 1,
      useTubes: true, kg: 75, lb: false, condition: null, name: "", focus: null, file: null, showMore: false, firstRun: !!opts.firstRun, garage: !!opts.garage };   // garage: a bike you own → FrameGarage, not a new design
    // presets from the Start step ("help me figure out what I want" and the start cards): FrameJourney
    if (opts.type && T().TYPES[opts.type]) S.type = opts.type;
    if (opts.wheel && S.type) { const rw = T().resolveWheel(S.type, opts.wheel); if (T().TYPES[S.type].wheels[rw.key]) { S.wheel = rw.key; if (rw.tyre) S.tyre = rw.tyre; } }
    if (+opts.tyre > 0) S.tyre = +opts.tyre;
    if (opts.size) S.size = opts.size;
    if (opts.condition != null) S.condition = opts.condition;
    if (opts.kg) S.kg = opts.kg;
    if (opts.discovered) S.discovered = opts.discovered;
    if (opts.source) { S.presetSource = opts.source; if (opts.step && opts.step !== "type") { S.source = opts.source; S.presetSource = null; } }
    if (opts.bcadText) { if (!loadBcad(opts.bcadText, opts.fileName)) return; }
    render();
    if (!dlg.open) dlg.showModal();
  }
  const close = () => { if (dlg && dlg.open) dlg.close(); };

  // ----------------------------------------------------------------- building the design
  function template() { return T().build(S.type || "mtb", S.wheel || T().wheelOptions(S.type || "mtb")[0][0], S.size || "M", S.tyre); }
  // the widest tyre the frame must clear (S.tyre), or the wheel's typical one
  const tyreNow = () => +S.tyre > 0 ? +S.tyre : ((T().tyreOptions(S.type, S.wheel) || {}).typical || 0);
  function setPath(o, path, v) { const k = path.split("."); let x = o; for (let i = 0; i < k.length - 1; i++) x = x[k[i]] = x[k[i]] || {}; x[k[k.length - 1]] = v; }
  function getPath(o, path) { return path.split(".").reduce((x, k) => x == null ? x : x[k], o); }
  function buildDesign() {
    const tpl = template(), FE = FEA();
    const d = FE.deepMerge(window.FRAME_DEFAULTS, tpl.changes);
    const tplST = d.geometry.seatTube, tplTT = d.geometry.ttAtSeatTube, tplSaddleGap = d.geometry.saddleHeight - d.geometry.seatTube;
    for (const [p, v] of Object.entries(S.values)) {
      if (p.startsWith("check.") || v === "" || v == null || !isFinite(v)) continue;
      if (p.startsWith("tubes.") && !S.useTubes) continue;
      setPath(d, p, +v);
    }
    const g = d.geometry, has = p => S.values[p] != null && S.values[p] !== "";
    // keep the joints sensible when the seat tube changed and the file/chart didn't say where the top tube joins
    if (!has("geometry.ttAtSeatTube")) g.ttAtSeatTube = Math.max(150, g.seatTube - (tplST - tplTT));
    if (!has("geometry.saddleHeight") && g.saddleHeight - g.seatTube < 120) g.saddleHeight = Math.round(g.seatTube + Math.max(120, Math.min(tplSaddleGap, 300)));
    if (g.ttBelowHtTop + g.dtAboveHtBottom >= g.headTube - 10) { const k = (g.headTube - 14) / (g.ttBelowHtTop + g.dtAboveHtBottom); g.ttBelowHtTop = Math.round(g.ttBelowHtTop * k); g.dtAboveHtBottom = Math.round(g.dtAboveHtBottom * k); }
    if (has("geometry.tireWidth")) { d.parts.tyreWidth = g.tireWidth; d.parts.sel.tyres = T().genericTyre(g.tireWidth); }
    // charts and BikeCAD files rarely give the fork length: work it out so the bike stands level (stack, head angle,
    // head tube and BB drop fix where the front axle has to be)
    S.autoA2C = false;
    if ((S.source === "chart" || S.source === "bcad") && !has("geometry.forkA2C")) {
      try { for (let k = 0; k < 3; k++) { const info = FE.buildGeometry(g, d.tubes).info, fa = info.frontAxleHeight - info.frontAxleTarget;
        if (Math.abs(fa) < 0.3) break; g.forkA2C = Math.round((g.forkA2C + fa / Math.sin(g.headAngle * Math.PI / 180)) * 2) / 2; }
        S.autoA2C = true; } catch (e) {}
    }
    if (+d.use.forkTravel > 0) g.forkBaseA2C = g.forkA2C - d.use.forkTravel;
    d.rider.riderKg = Math.round(S.kg * 10) / 10;
    // shoe size for the toe-overlap check (toe.js); blank = the typical size for this frame size
    const TOE = window.FrameToe;
    if (TOE) { d.fit = Object.assign({}, d.fit || {}); const eu = S.shoe != null && S.shoe !== "" ? TOE.toEU(S.shoe, S.shoeSys) : ({ S: 40, M: 42, L: 44, XL: 46 })[S.size] || 43;
      if (isFinite(eu) && eu > 30 && eu < 57) d.fit.shoeEU = Math.round(eu * 10) / 10; d.fit.shoeSys = S.shoeSys || "eu";
      if (+S.tip > 30 && +S.tip < 250) { d.fit.mTip = +S.tip; d.fit.shoeSource = "shoe"; } }
    if (S.condition != null) d.use.condition = S.condition;
    // from a bike fit: the stem / spacers chosen on the fit screen are this bike's own (not a library cockpit's),
    // and the fit numbers travel with the design (no personal details: FrameFitReport.keep)
    if (S.source === "fit" && S.fit && FR()) {
      // "" (not delete): deleting lets the shipped defaults' own cockpit part come back when the design is merged
      if (d.parts.sel) d.parts.sel.cockpit = "";
      d.fit = Object.assign({}, d.fit || {}, { report: FR().keep(S.fit) });
    }
    return { d, tpl };
  }

  // ----------------------------------------------------------------- imports
  function loadBcad(text, fileName) {
    let r;
    try { if (!GI().isBcad(text)) throw new Error("That doesn't look like a BikeCAD (.bcad) file."); r = GI().parseBcad(text); }
    catch (e) { App().toast(e.message || "Couldn't read that BikeCAD file."); return false; }
    S.source = "bcad"; S.file = fileName || "BikeCAD file";
    S.values = r.values; S.src = r.src; S.notes = r.notes; S.warnings = r.warnings;
    if (!S.type) S.type = r.guess.type || "mtb";
    if (!S.wheel) S.wheel = guessWheel(S.type, r.values);
    if (!S.tyre && +r.values["geometry.tireWidth"] > 0) S.tyre = +r.values["geometry.tireWidth"];
    S.step = "numbers";
    return true;
  }
  function guessWheel(type, v) {
    const W = T().TYPES[type].wheels, bsd = v["geometry.rimBSD"], bsdF = v["geometry.rimBSDFront"];
    let best = Object.keys(W)[0], err = Infinity;
    for (const [k, w] of Object.entries(W)) {
      const e = Math.abs((bsd || 622) - w.rear.bsd) + Math.abs((bsdF || bsd || 622) - (w.front || w.rear).bsd) + (v["geometry.tireWidth"] ? Math.abs(v["geometry.tireWidth"] - w.rear.width) / 10 : 0);
      if (e < err) { err = e; best = k; }
    }
    return best;
  }

  // ----------------------------------------------------------------- picture of the numbers
  function picture(d, focus) {
    let P, info, gg;
    try { gg = FEA().buildGeometry(d.geometry, d.tubes); P = gg.P; info = gg.info; } catch (e) { return `<svg viewBox="0 0 10 5"></svg>`; }
    const g = d.geometry, Rr = g.tireDiameter / 2, Rf = info.frontTyreR || Rr;
    const x0 = P.AxleR[0] - Rr - 40, x1 = P.AxleF[0] + Rf + 40, yTop = Math.max(P.HTtop[1], P.STtop[1], P.Saddle[1]) + 70, yBot = P.AxleR[1] - Rr - 30;
    const X = x => (x - x0), Y = y => (yTop - y), Wd = x1 - x0, Ht = yTop - yBot;
    const L = (a, b, w, cls) => `<line x1="${X(a[0]).toFixed(1)}" y1="${Y(a[1]).toFixed(1)}" x2="${X(b[0]).toFixed(1)}" y2="${Y(b[1]).toFixed(1)}" stroke-width="${w}" class="${cls || ""}"/>`;
    const lab = (p, t, anchor) => `<text x="${X(p[0]).toFixed(1)}" y="${Y(p[1]).toFixed(1)}" text-anchor="${anchor || "middle"}" class="dl">${esc(t)}</text>`;
    const on = id => focus === id;
    let s = `<svg viewBox="0 0 ${Wd.toFixed(0)} ${Ht.toFixed(0)}" role="img" aria-label="Side view of the frame with the number being edited highlighted">
      <style>line{stroke:currentColor;stroke-linecap:round} .fr{stroke:var(--ink)} .wh{stroke:var(--muted);opacity:.55} .dim{stroke:var(--accent)} .gh{stroke:var(--muted);opacity:.5;stroke-dasharray:8 8}
      text.dl{fill:var(--accent);font:600 30px var(--font-body)} circle{fill:none} polyline.fr{fill:none;stroke-linecap:round;stroke-linejoin:round}</style>`;
    s += `<circle cx="${X(P.AxleR[0])}" cy="${Y(P.AxleR[1])}" r="${Rr}" stroke="var(--muted)" stroke-width="14" opacity=".35"/>`;
    s += `<circle cx="${X(P.AxleF[0])}" cy="${Y(P.AxleF[1])}" r="${Rf}" stroke="var(--muted)" stroke-width="14" opacity=".35"/>`;
    s += L([x0, P.AxleR[1] - Rr], [x1, P.AxleF[1] - Rf], 2, "gh");
    // frame centrelines (bent tubes drawn bent)
    const fr = [gg.seatTubeLine, [P.TTst, P.TTht], gg.downTubeLine, [P.HTtop, P.HTbot], gg.chainstayLine, gg.seatStayLine];
    for (const pl of fr) s += `<polyline points="${pl.map(q => X(q[0]).toFixed(1) + "," + Y(q[1]).toFixed(1)).join(" ")}" stroke-width="12" class="fr"/>`;
    s += L(P.HTbot, P.Crown, 8, "wh") + L(P.Crown, P.AxleF, 8, "wh");
    // the focused number's dimension
    const off = (a, b, k) => { const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1; return [[a[0] - dy / n * k, a[1] + dx / n * k], [b[0] - dy / n * k, b[1] + dx / n * k]]; };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ha = g.headAngle * Math.PI / 180, sa = g.seatAngle * Math.PI / 180;
    const dims = {
      "geometry.reach": () => { const y = P.HTtop[1] + 40; return L([0, y], [P.HTtop[0], y], 5, "dim") + L([0, 0], [0, y], 2, "gh") + lab([P.HTtop[0] / 2, y + 12], "reach"); },
      "geometry.stack": () => { const x = P.HTtop[0] + 50; return L([x, 0], [x, P.HTtop[1]], 5, "dim") + L(P.BB, [x, 0], 2, "gh") + L(P.HTtop, [x, P.HTtop[1]], 2, "gh") + lab([x + 12, P.HTtop[1] / 2], "stack", "start"); },
      "geometry.headAngle": () => { const c = P.HTbot, r = 120, gy = c[1] - Math.sin(ha) * 140; const base = [c[0] + Math.cos(ha) * 140, gy];
        return L([base[0] - 160, gy], [base[0] + 60, gy], 3, "dim") + L(c, base, 3, "dim") + lab([base[0] - 90, gy - 18], g.headAngle + "°"); },
      "geometry.seatAngle": () => { const top = [-Math.cos(sa) * 260, Math.sin(sa) * 260]; return L([-260, 0], [120, 0], 3, "dim") + L(P.BB, top, 5, "dim") + lab([-150, -38], g.seatAngle + "°"); },
      "geometry.chainstay": () => { const [a, b] = off(P.AxleR, P.BB, -45); return L(a, b, 5, "dim") + lab(mid(a, b).map((v, i) => i ? v - 40 : v), "chainstay"); },
      "geometry.bbDrop": () => L([P.AxleR[0], P.AxleR[1]], [60, P.AxleR[1]], 2, "gh") + L([60, P.AxleR[1]], [60, 0], 5, "dim") + lab([90, P.AxleR[1] / 2 - 10], "drop", "start"),
      "geometry.headTube": () => { const [a, b] = off(P.HTbot, P.HTtop, -45); return L(a, b, 5, "dim") + lab([b[0] + 70, mid(a, b)[1]], "head tube", "start"); },
      "geometry.seatTube": () => { const [a, b] = off(P.BB, P.STtop, 45); return L(a, b, 5, "dim") + lab([mid(a, b)[0] - 30, mid(a, b)[1]], "seat tube", "end"); },
      "geometry.forkA2C": () => { const [a, b] = off(P.Crown, [P.Crown[0] + Math.cos(ha) * g.forkA2C, P.Crown[1] - Math.sin(ha) * g.forkA2C], -60); return L(a, b, 5, "dim") + lab([b[0] + 60, mid(a, b)[1]], "axle-to-crown", "start"); },
      "geometry.forkOffset": () => { const foot = [P.Crown[0] + Math.cos(ha) * g.forkA2C, P.Crown[1] - Math.sin(ha) * g.forkA2C];
        return L(P.Crown, [foot[0] + Math.cos(ha) * 60, foot[1] - Math.sin(ha) * 60], 2, "gh") + L(foot, P.AxleF, 6, "dim") + lab([P.AxleF[0] + 30, P.AxleF[1] + 60], "offset", "start"); },
      "geometry.saddleHeight": () => { const [a, b] = off(P.BB, P.Saddle, -60); return L(a, b, 5, "dim") + lab([b[0] + 20, b[1] + 20], "saddle height", "start"); },
      "geometry.tireWidth": () => lab([P.AxleR[0], P.AxleR[1] + Rr + 20], "tyre"), "geometry.crankLength": () => L(P.BB, [P.BB[0] + Math.cos(-1.1) * g.crankLength, Math.sin(-1.1) * g.crankLength], 7, "dim")
    };
    if (focus && dims[focus]) s += dims[focus]();
    return s + `</svg>`;
  }

  // ----------------------------------------------------------------- checks under the numbers
  function checksHtml() {
    const { d } = buildDesign(), FE = FEA(); const rows = [];
    try {
      const info = FE.buildGeometry(d.geometry, d.tubes).info;
      const pill = (ok, t) => `<span class="pill ${ok ? "ok" : "warn"}">${ok ? "✓" : "check"} ${esc(t)}</span>`;
      const cmp = (key, mine, tol) => { const v = S.values[key]; if (v == null) return; const dl = mine - v;
        rows.push(`<div class="ck">${pill(Math.abs(dl) <= tol, CHECK_LABEL[key])}<span>${mine.toFixed(0)} mm from these numbers vs ${v} in your ${S.source === "chart" ? "chart" : "file"} (${dl >= 0 ? "+" : ""}${dl.toFixed(0)})</span></div>`); };
      cmp("check.wheelbase", info.wheelbase, 6); cmp("check.frontCentre", info.frontCentre, 6); cmp("check.ett", info.effectiveTopTube, 8); cmp("check.trail", info.trail, 4);
      if (S.values["check.wheelbase"] == null) rows.push(`<div class="ck"><span class="pill">Wheelbase</span><span>${info.wheelbase.toFixed(0)} mm · trail ${info.trail.toFixed(0)} mm · BB height ${info.bbHeight.toFixed(0)} mm</span></div>`);
      if (S.source === "fit" && S.fitResult && S.fitResult.target && FR()) {
        const b = FR().barOf(d.geometry, d.parts), tg = S.fitResult.target, dx = b[0] - tg[0], dy = b[1] - tg[1], off = Math.hypot(dx, dy);
        rows.push(`<div class="ck">${pill(off <= 5, "Handlebar position")}<span>${off <= 5 ? `Bars land where your fit puts them (within ${off.toFixed(0)} mm).` : `Bars are ${Math.abs(dx).toFixed(0)} mm ${dx > 0 ? "further away" : "closer"} and ${Math.abs(dy).toFixed(0)} mm ${dy > 0 ? "higher" : "lower"} than your fit${S.fitResult.frame && S.fitResult.frame.high ? " (some of that is the shortest possible head tube)" : ""}.`}</span></div>`);
      }
      const fa = info.frontAxleHeight - info.frontAxleTarget;
      if (Math.abs(fa) > 4) {
        const dA = fa / Math.sin(d.geometry.headAngle * Math.PI / 180);
        rows.push(`<div class="ck">${pill(false, "Front axle height")}<span>The front axle sits ${Math.abs(fa).toFixed(0)} mm ${fa > 0 ? "higher" : "lower"} than the wheels need to stand level. Usually the fork length is off: about ${(d.geometry.forkA2C + dA).toFixed(0)} mm axle-to-crown would level it.</span><button type="button" data-level="${(d.geometry.forkA2C + dA).toFixed(0)}">Use ${(d.geometry.forkA2C + dA).toFixed(0)} mm</button></div>`);
      } else rows.push(`<div class="ck">${pill(true, "Bike stands level")}<span>Front and rear axles line up.</span></div>`);
      try { FE.validate(d); rows.push(`<div class="ck">${pill(true, "Ready")}<span>Cyclic Labs can build this bike.</span></div>`); }
      catch (e) { rows.push(`<div class="ck"><span class="pill bad">Fix</span><span>${esc(e.message)}</span></div>`); }
    } catch (e) { rows.push(`<div class="ck"><span class="pill bad">Fix</span><span>${esc(e.message || e)}</span></div>`); }
    return `<div class="sub-h" style="margin:0">Does it add up?</div>` + rows.join("");
  }

  // ----------------------------------------------------------------- screens
  function stepsBar() {
    const order = STEPS.map(s => s[0]), cur = { welcome: -1, type: 0, wheels: 1, tyres: 2, geo: 3, fit32: 3, fit: 3, size: 3, numbers: 3, chart: 3, bcad: 3, you: 4, done: 5 }[S.step];
    return `<div class="nb-steps" aria-label="Steps">${STEPS.map(([k, l], i) => `<span class="${i === cur ? "on" : i < cur ? "done" : ""}">${i + 1}. ${l}</span>`).join("")}</div>`;
  }
  function frame(title, body, foot) {
    dlg.innerHTML = `<div class="nb-wrap"><div class="nb-head"><h2>${S.garage ? "🏠 Add to your garage · " : ""}${esc(title)}</h2>${S.step !== "welcome" && S.step !== "done" ? stepsBar() : ""}<button type="button" data-x>Close</button></div>
      <div class="nb-body">${body}</div>${foot ? `<div class="nb-foot">${foot}</div>` : ""}</div>`;
    dlg.querySelector("[data-x]").onclick = close;
    const back = dlg.querySelector("[data-back]"); if (back) back.onclick = () => { S.step = back.dataset.back; render(); };
  }
  const go = step => { S.step = step; render(); };

  function render() {
    const TY = T().TYPES;
    switch (S.step) {
      case "welcome": {
        frame(S.firstRun ? "Welcome to Cyclic Labs" : "New bike",
          `<h3>${S.firstRun ? "Hi! Let's set up your first bike." : "Let's start a new bike."}</h3>
           <p class="lead">A few quick choices and Cyclic Labs builds a starting model you can look at in 3D. Then you can fine-tune it: parts, tube sizes, stays and the rest. Nothing leaves this computer.</p>
           <ol class="nb-list"><li>What kind of bike</li><li>Wheel size</li><li>The biggest tyre you want it to fit</li><li>Geometry: pick a size, upload your bike-fit report (Retül), type it in, paste a brand's chart, load a BikeCAD file or scan a drawing</li><li>A little about you (weight, shoe size, where you ride)</li></ol>`,
          `<span class="grow"></span>${S.firstRun ? `<button type="button" data-tour>Just show me around</button>` : ""}<button type="button" class="primary" data-go>Let's start</button>`);
        dlg.querySelector("[data-go]").onclick = () => go("type");
        const tb = dlg.querySelector("[data-tour]"); if (tb) tb.onclick = () => { close(); window.FrameTour && window.FrameTour.start("basics"); };
        break;
      }
      case "type": {
        frame("What kind of bike?", `<p class="lead">This sets sensible starting numbers, tubes, parts and the lab tests used. You can change anything later.</p>
          <div class="nb-cards">${Object.entries(TY).map(([k, t]) => `<button type="button" class="nb-card" data-type="${k}" aria-pressed="${S.type === k}">${ICON[k] || ""}<b>${esc(t.label)}</b><small>${esc(t.blurb)}</small></button>`).join("")}</div>`,
          `<button type="button" data-back="welcome">Back</button>`);
        dlg.querySelectorAll("[data-type]").forEach(b => b.onclick = () => { if (S.type !== b.dataset.type) { S.wheel = null; S.tyre = null; S.condition = null; } S.type = b.dataset.type; go("wheels"); });
        break;
      }
      case "wheels": {
        const opts = T().wheelOptions(S.type);
        frame("Which wheel size?", `<p class="lead">Just the wheel (rim) size. You pick the tyre on the next screen.</p>
          <div class="nb-cards">${opts.map(([k, l, n]) => `<button type="button" class="nb-card" data-wheel="${esc(k)}" aria-pressed="${S.wheel === k}"><b>${esc(l)}</b><small>${esc(n)}</small></button>`).join("")}</div>`,
          `<button type="button" data-back="type">Back</button>`);
        dlg.querySelectorAll("[data-wheel]").forEach(b => b.onclick = () => { if (S.wheel !== b.dataset.wheel) S.tyre = null; S.wheel = b.dataset.wheel; go("tyres"); });
        break;
      }
      case "tyres": {
        const o = T().tyreOptions(S.type, S.wheel) || { choices: [], typical: 0, min: 20, max: 90 }, now = tyreNow(), lbl = w => T().tyreLabel(S.type, w, S.wheel);
        const wheelLbl = (TY[S.type].wheels[S.wheel] || {}).label || "";
        const custom = now && !o.choices.includes(now);
        frame("Biggest tyre you want to fit?", `<p class="lead">Pick the widest tyre this frame should take on ${esc(wheelLbl)} wheels. Cyclic Labs sets ${TY[S.type].tyreGrow && TY[S.type].tyreGrow.forkA2C && !(TY[S.type].wheels[S.wheel] || {}).fixedFork ? "the chainstay length, the space between the stays and the fork length" : "the chainstay length and the space between the stays"} so that tyre fits with room to spare (about 6 mm all round). Narrower tyres will fit too.${+(TY[S.type].use || {}).forkTravel > 0 ? " Check that your suspension fork is rated for that tyre too." : ""}</p>
          ${o.note ? `<p class="hint">${esc(o.note)}</p>` : ""}
          <div class="nb-cards">${o.choices.map(w => `<button type="button" class="nb-card" data-tyre="${w}" aria-pressed="${now === w}"><b>${esc(lbl(w))}</b><small>${w === o.typical ? "Typical for this kind of bike" : w < o.typical ? "Narrower: a slightly shorter, quicker back end" : "Wider: more grip and comfort; a little longer chainstay"}</small></button>`).join("")}</div>
          <label class="hint" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">Or type your own width: <input id="nbTyre" type="number" step="1" min="${o.min}" max="${o.max}" style="width:90px" value="${custom ? now : ""}" placeholder="${o.typical}"> mm${o.inch ? ` <span>(inches × 25.4: 2.4" = 61 mm)</span>` : ""}</label>`,
          `<button type="button" data-back="wheels">Back</button><span class="grow"></span><button type="button" class="primary" id="nbTyreNext">Next</button>`);
        const next = () => { if (S.presetSource) { const k = S.presetSource; S.presetSource = null; pickSource(k); } else go("geo"); };
        dlg.querySelectorAll("[data-tyre]").forEach(b => b.onclick = () => { S.tyre = +b.dataset.tyre; next(); });
        const inp = dlg.querySelector("#nbTyre");
        dlg.querySelector("#nbTyreNext").onclick = () => {
          const v = +inp.value;
          if (inp.value !== "") {
            if (!(v >= o.min && v <= o.max)) { App().toast(`Type a width between ${o.min} and ${o.max} mm for these wheels.`); inp.focus(); return; }
            S.tyre = v;
          } else if (!S.tyre) S.tyre = o.typical;
          next();
        };
        inp.onkeydown = e => { if (e.key === "Enter") dlg.querySelector("#nbTyreNext").click(); };
        break;
      }
      case "geo": {
        const fit32 = is32() ? [["fit32", "Match a bike I already ride (recommended for 32\")", "Type the stack, reach and stem of your 29er / 700c bike. The 32er fit solver works out the frame and cockpit that put your hands in the same place, and checks toe overlap."]] : [];
        frame("Do you know the geometry you want?", `<p class="lead">Geometry is the bike's shape: reach, stack, angles, stays. Choose how to start.</p>
          <div class="nb-cards">${fit32.concat(SOURCES).filter(([k]) => !(k === "fit" && S.garage)).map(([k, l, n]) => `<button type="button" class="nb-card" data-src="${k}"><b>${esc(l)}</b><small>${esc(n)}</small></button>`).join("")}</div>`,
          `<button type="button" data-back="tyres">Back</button>`);
        dlg.querySelectorAll("[data-src]").forEach(b => b.onclick = () => pickSource(b.dataset.src));
        break;
      }
      case "size": {
        frame("Pick a size", `<p class="lead">Typical ${esc(TY[S.type].label.toLowerCase())} geometry for each size. Rider heights are only a rough guide.</p>
          <div class="nb-cards">${T().SIZE_LIST.map(z => { const g = TY[S.type].sizes[z]; return `<button type="button" class="nb-card" data-size="${z}" aria-pressed="${S.size === z}"><b>${z}</b><small>${SIZE_HINT[z]}<br>reach ${g.reach} · stack ${g.stack}</small></button>`; }).join("")}</div>`,
          `<button type="button" data-back="geo">Back</button>`);
        dlg.querySelectorAll("[data-size]").forEach(b => b.onclick = () => { S.size = b.dataset.size; S.values = {}; go("you"); });
        break;
      }
      case "chart": {
        const c = S.chart;
        frame("Copy a geometry chart", `<p class="lead">On the bike brand's website, select the whole geometry table (size names along the top, numbers like reach and stack down the side), copy it, and paste it here. Spreadsheet rows and CSV work too.</p>
          <div class="nb-paste"><textarea id="nbPaste" spellcheck="false" placeholder="Size        S     M     L     XL\nReach       425   450   475   500\nStack       610   620   630   640\nHead angle  65.5  65.5  65.5  65.5\n…">${esc(S.pasted || "")}</textarea></div>
          <div id="nbChartOut">${c ? chartSummary(c) : ""}</div>`,
          `<button type="button" data-back="geo">Back</button><span class="grow"></span><button type="button" class="primary" id="nbChartNext" ${c && c.rows.length ? "" : "disabled"}>Use this size</button>`);
        const ta = dlg.querySelector("#nbPaste");
        const parse = () => { S.pasted = ta.value; S.chart = ta.value.trim() ? GI().parseChart(ta.value) : null; if (S.chart && S.chartSize >= S.chart.sizes.length) S.chartSize = 0;
          dlg.querySelector("#nbChartOut").innerHTML = S.chart ? chartSummary(S.chart) : ""; dlg.querySelector("#nbChartNext").disabled = !(S.chart && S.chart.rows.length); bindChart(); };
        ta.addEventListener("input", parse);
        bindChart();
        dlg.querySelector("#nbChartNext").onclick = () => { const r = GI().pickSize(S.chart, S.chartSize); S.values = r.values; S.src = r.src; S.notes = r.notes; S.warnings = [];
          const missing = MAIN.filter(([p]) => S.values[p] == null).map(m => m[1].toLowerCase());
          if (missing.length) S.warnings.push(`The chart has no ${missing.join(", ")}: typical values are filled in (shown without a green bar). Check them.`);
          if (S.values["geometry.bbDrop"] == null && S.values["check.bbHeight"] != null) { const { d } = buildDesign(); S.values["geometry.bbDrop"] = Math.round(d.geometry.tireDiameter / 2 - S.values["check.bbHeight"]); S.src["geometry.bbDrop"] = "from the BB height and the tyre size"; }
          S.size = nearestSize(); go("numbers"); };
        break;
      }
      case "bcad": {
        frame("Load a BikeCAD file", `<div class="nb-drop" id="nbDrop"><b style="font:600 18px var(--font-display)">Drop the .bcad file here</b>
            <p class="hint" style="max-width:52ch">In BikeCAD use File → Save to get a .bcad file. Cyclic Labs reads the geometry, wheel and tube sizes from it, right here on this computer. (For a BikeCAD PDF or picture, use "Scan a builder's drawing" instead.)</p>
            <button type="button" class="primary" id="nbPick">Choose a file…</button><input type="file" id="nbFile" accept=".bcad,.xml,text/xml" hidden></div>`,
          `<button type="button" data-back="geo">Back</button>`);
        const fi = dlg.querySelector("#nbFile"), drop = dlg.querySelector("#nbDrop");
        dlg.querySelector("#nbPick").onclick = () => fi.click();
        const take = f => { const rd = new FileReader(); rd.onload = () => { const keepType = S.type, keepWheel = S.wheel; if (loadBcad(String(rd.result), f.name)) { S.type = keepType || S.type; S.wheel = keepWheel || S.wheel; S.size = nearestSize(); render(); } }; rd.readAsText(f); };
        fi.onchange = () => fi.files[0] && take(fi.files[0]);
        drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
        drop.addEventListener("dragleave", () => drop.classList.remove("over"));
        drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) take(f); });
        break;
      }
      case "fit": renderFit(); break;
      case "numbers": renderNumbers(); break;
      case "fit32": renderFit32(); break;
      case "you": renderYou(); break;
      case "done": renderDone(); break;
    }
  }
  function pickSource(k) {
    if (k !== S.source) { S.values = {}; S.src = {}; S.notes = []; S.warnings = []; S.chart = null; S.fitResult = null; }
    S.source = k;
    if (k === "size") go("size");
    else if (k === "type") { prefill(); go("numbers"); }
    else if (k === "chart") go("chart");
    else if (k === "fit") { S.fit = S.fit || null; go("fit"); }
    else if (k === "bcad") go("bcad");
    else if (k === "scan") startScan();
    else if (k === "typed") startTyped();
    else if (k === "fit32") go("fit32");
  }
  // 32" wheels (gravel "32in" or MTB "32"): the 32er fit solver (fit32.js) is offered at the Geometry step
  const is32 = () => !!window.FrameFit32 && (S.wheel === "32in" || S.wheel === "32");
  let fit32 = null;
  function renderFit32() {
    const { d } = buildDesign();
    frame("Match a bike you already ride", `<div id="nbFit32"></div>`,
      `<button type="button" data-back="geo">Back</button><span class="hint" id="nbFitSum"></span><span class="grow"></span><button type="button" class="primary" id="nbFitNext">Use these numbers</button>`);
    let designs = []; try { designs = App().allDesigns(); } catch (e) {}
    fit32 = window.FrameFit32.mount(dlg.querySelector("#nbFit32"), { base: d, modes: ["frame", "cockpit"], mode: S.fit32Mode || "frame", designs,
      onChange: R => { S.fit32Mode = R.mode; const b = dlg.querySelector("#nbFitNext"); if (b) b.disabled = R.mode === "cockpit" ? !R.cockpit : !R.ok; } });
    dlg.querySelector("#nbFitNext").onclick = () => {
      const R = fit32 && fit32.result(); if (!R) return;
      const v = window.FrameFit32.values(R, d);
      S.values = Object.assign({}, v); S.src = {};
      for (const p of Object.keys(v)) if (p.startsWith("geometry.")) S.src[p] = "the 32er fit solver";
      S.source = "fit32"; S.notes = [R.mode === "frame" ? `Frame stack, reach and head tube from the 32er fit solver (stem ${R.cockpit.stemLength} mm at ${R.cockpit.stemRise}°, ${R.cockpit.spacers} mm spacers).` : `Cockpit from the 32er fit solver: ${R.cockpit.stemLength} mm stem at ${R.cockpit.stemRise}°, ${R.cockpit.spacers} mm spacers.`];
      S.warnings = R.toe === "fail" ? ["Toe overlap: your toe will touch the front tyre in slow turns with this frame (see the solver)."] : [];
      S.size = nearestSize(); go("numbers");
    };
  }
  function chartSummary(c) {
    if (!c.rows.length) return `<p class="nb-warn">No numbers recognised yet. Make sure the size names and the row names (Reach, Stack, Head angle …) are included.</p>`;
    const names = [...new Set(c.rows.map(r => (GI().LABELS[r.id] || (r.id === "geometry.seatAngleEff" ? "Seat angle (effective)" : r.id))))];
    return `<div class="sub-h">Which size?</div><div class="nb-sizes">${c.sizes.map((z, k) => `<button type="button" data-cs="${k}" aria-pressed="${k === S.chartSize}">${esc(z)}</button>`).join("")}</div>
      <p class="hint">Found: ${esc(names.join(", "))}.${c.unknown.length ? ` Not used: ${esc(c.unknown.slice(0, 8).join(", "))}.` : ""}</p>`;
  }
  function bindChart() { dlg.querySelectorAll("[data-cs]").forEach(b => b.onclick = () => { S.chartSize = +b.dataset.cs; dlg.querySelector("#nbChartOut").innerHTML = chartSummary(S.chart); bindChart(); }); }
  // the template size whose reach is closest (so the parts and anything not given suit the bike)
  function nearestSize() {
    const sz = T().TYPES[S.type].sizes, r = S.values["geometry.reach"]; if (r == null) return S.size || "M";
    return Object.keys(sz).reduce((a, b) => Math.abs(sz[b].reach - r) < Math.abs(sz[a].reach - r) ? b : a, "M");
  }
  function prefill() {
    if (Object.keys(S.values).length) return;
    const { d } = buildDesign();
    for (const [p] of MAIN.concat(MORE)) S.values[p] = getPath(d, p);
    S.src = {}; S.typed = true;
  }

  function renderNumbers() {
    const { d } = buildDesign();
    const fromSrc = S.source === "chart" ? "the chart" : S.source === "bcad" ? (S.file || "the file") : S.source === "fit32" ? "the 32er fit solver" : S.source === "fit" ? "your fit report" : null;
    const row = ([p, l, u, help]) => {
      const v = S.values[p] != null ? S.values[p] : getPath(d, p), from = S.src[p];
      const auto = p === "geometry.forkA2C" && S.autoA2C && !from;
      return `<label class="nb-f${from ? " from" : ""}${S.focus === p ? " focus" : ""}" data-p="${p}"><span>${esc(l)}${from ? `<small>from ${esc(from)}</small>` : auto ? `<small>worked out so the bike stands level</small>` : ""}</span><input type="number" step="any" value="${v == null ? "" : +(+v).toFixed(2)}" aria-label="${esc(l)}"><span class="u">${u}</span></label>`;
    };
    const extra = Object.keys(S.values).filter(p => !MAIN.some(m => m[0] === p) && !MORE.some(m => m[0] === p) && !p.startsWith("check.") && !p.startsWith("parts."));
    const tubesFound = extra.filter(p => p.startsWith("tubes."));
    const T0 = T().TYPES[S.type];
    frame("Check your numbers", `
      <p class="lead">${fromSrc ? `Numbers read from ${esc(fromSrc)} have a green bar; the rest are typical for a ${esc(T0.label.toLowerCase())} bike. ` : "Type your numbers over the typical ones. "}Click a box to see what the number means on the picture.</p>
      ${S.warnings.map(w => `<p class="nb-warn">${esc(w)}</p>`).join("")}${S.notes.map(w => `<p class="hint">${esc(w)}</p>`).join("")}
      <div class="nb-num">
        <div class="nb-fields">${MAIN.map(row).join("")}
          <details${S.showMore ? " open" : ""} id="nbMore"><summary>More numbers (optional)</summary><div class="nb-fields" style="margin-top:6px">${MORE.map(row).join("")}</div></details>
          ${extra.length ? `<details><summary>Also read from ${esc(fromSrc || "the file")} (${extra.length})</summary><ul class="nb-list">${extra.map(p => `<li>${esc(XLABEL[p] || GI().LABELS[p] || p)}: <b>${S.values[p]}</b>${S.src[p] ? ` <span class="hint">(${esc(S.src[p])})</span>` : ""}</li>`).join("")}</ul></details>` : ""}
          ${tubesFound.length ? `<label class="hint" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="nbTubes"${S.useTubes ? " checked" : ""}> Use the tube sizes from the file (otherwise ordinary titanium sizes)</label>` : ""}
        </div>
        <div class="nb-pic"><div id="nbPic">${picture(d, S.focus)}</div><div class="explain" id="nbExplain">${explain(S.focus)}</div><div class="nb-checks" id="nbChecks">${checksHtml()}</div></div>
      </div>`,
      `<button type="button" data-back="${S.source === "fit32" ? "fit32" : S.source === "fit" ? "fit" : "geo"}">Back</button><span class="hint">Wheels: ${esc(T0.wheels[S.wheel] ? T0.wheels[S.wheel].label : "")}${S.wheel ? `, tyres up to ${esc(T().tyreLabel(S.type, tyreNow(), S.wheel))}` : ""}</span><span class="grow"></span><button type="button" class="primary" id="nbNext">Next</button>`);
    const refresh = () => { const { d: d2 } = buildDesign(); dlg.querySelector("#nbPic").innerHTML = picture(d2, S.focus); dlg.querySelector("#nbExplain").innerHTML = explain(S.focus); dlg.querySelector("#nbChecks").innerHTML = checksHtml(); bindLevel(); };
    dlg.querySelectorAll(".nb-f").forEach(lb => {
      const p = lb.dataset.p, inp = lb.querySelector("input");
      inp.addEventListener("focus", () => { S.focus = p; dlg.querySelectorAll(".nb-f").forEach(x => x.classList.toggle("focus", x === lb)); refresh(); });
      inp.addEventListener("input", () => { const v = parseFloat(inp.value); if (isFinite(v)) { S.values[p] = v; if (S.src[p]) { S.src[p] = "you"; } refresh(); } });
    });
    const md = dlg.querySelector("#nbMore"); if (md) md.addEventListener("toggle", () => S.showMore = md.open);
    const tb = dlg.querySelector("#nbTubes"); if (tb) tb.onchange = () => { S.useTubes = tb.checked; refresh(); };
    const bindLevel = () => dlg.querySelectorAll("[data-level]").forEach(b => b.onclick = () => { S.values["geometry.forkA2C"] = +b.dataset.level; S.src["geometry.forkA2C"] = "levelled"; renderNumbers(); });
    bindLevel();
    dlg.querySelector("#nbNext").onclick = () => { try { FEA().validate(buildDesign().d); go("you"); } catch (e) { App().toast("Fix this first: " + e.message); } };
  }
  // ----------------------------------------------------------------- bike-fit report (fitreport.js)
  // Upload (or paste, or type) the fit → check the numbers it read → choose the stem / spacers for the new bike →
  // the frame that puts the saddle and bars in the same place → the usual "Check your numbers" screen.
  const FIT_MAIN = ["saddleHeight", "esta", "crank", "barStack", "barReach"];
  const FIT_COCKPIT = ["stemLen", "stemRise", "spacers", "barWidth"];
  function fitCtx() {
    const sizes = T().TYPES[S.type].sizes, V = S.fit.values;
    if (+V.saddleHeight > 0) S.size = FR().sizeFor(+V.saddleHeight, sizes);
    const d = FEA().deepMerge(window.FRAME_DEFAULTS, template().changes);
    const o = S.fitOpts || (S.fitOpts = {});
    return { type: S.type, g: d.geometry, sizes, parts: d.parts, stem: o.stem, rise: o.rise, spacers: o.spacers, relax: !!o.relax };
  }
  function fitSolve() {
    try { const ctx = fitCtx(), r = FR().toGeometry(S.fit, ctx); r.target = r.bar ? (ctx.relax ? [r.bar[0] - 10, r.bar[1] + 15] : r.bar) : null; r.g = ctx.g; return r; }
    catch (e) { return { error: e.message }; }
  }
  // contact points (saddle, bars) and the frame that reaches them
  function fitPicture(r) {
    if (!r || r.error) return "";
    const V = S.fit.values, SH = +V.saddleHeight, es = (r.seat.esta) * Math.PI / 180;
    const sad = [-SH * Math.cos(es), SH * Math.sin(es)], bar = r.target, fr = r.frame, ha = r.g.headAngle * Math.PI / 180;
    const pts = [sad, [0, 0], bar || [400, 600], fr ? [fr.reach, fr.stack] : [0, 0]];
    const x0 = Math.min(...pts.map(p => p[0])) - 90, x1 = Math.max(...pts.map(p => p[0])) + 110, yT = Math.max(...pts.map(p => p[1])) + 70, yB = -Math.max(190, +V.crank || 172) - 30;
    const X = x => (x - x0).toFixed(1), Y = y => (yT - y).toFixed(1);
    const ln = (a, b, cls) => `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" class="${cls}"/>`;
    const dot = (p, cls) => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="14" class="${cls}"/>`;
    const tx = (p, t, a) => `<text x="${X(p[0])}" y="${Y(p[1])}" text-anchor="${a || "middle"}">${esc(t)}</text>`;
    let s = `<svg viewBox="0 0 ${(x1 - x0).toFixed(0)} ${(yT - yB).toFixed(0)}" role="img" aria-label="Where your saddle and handlebars are, and the frame that reaches them">
      <style>line{stroke-linecap:round} .fr{stroke:var(--ink);stroke-width:12} .gh{stroke:var(--muted);stroke-width:3;stroke-dasharray:10 10;opacity:.7} .ck{stroke:var(--muted);stroke-width:9}
      .tg{fill:var(--accent);stroke:none} .bb{fill:var(--ink)} text{fill:var(--ink);font:600 28px var(--font-body)} text.m{fill:var(--muted);font-weight:400}</style>`;
    s += `<circle cx="${X(0)}" cy="${Y(0)}" r="${(+V.crank || 172).toFixed(0)}" fill="none" class="gh" stroke="var(--muted)"/>`;
    s += ln([0, 0], sad, "gh") + dot([0, 0], "bb") + dot(sad, "tg") + tx([sad[0], sad[1] + 34], "saddle");
    if (fr) {
      const top = [fr.reach, fr.stack], bot = [top[0] + Math.cos(ha) * fr.headTube, top[1] - Math.sin(ha) * fr.headTube];
      s += ln([0, 0], [fr.reach, 0], "gh") + ln([fr.reach, 0], top, "gh") + ln(top, bot, "fr") + ln([0, 0], bot, "fr") + ln([0, 0], [sad[0] * 0.72, sad[1] * 0.72], "fr") + ln([sad[0] * 0.72, sad[1] * 0.72], top, "fr");
      s += ln(top, bar, "ck") + tx([fr.reach / 2, -28], `reach ${fr.reach}`) + tx([fr.reach + 16, fr.stack / 2], `stack ${fr.stack}`, "start");
    }
    if (bar) s += dot(bar, "tg") + tx([bar[0], bar[1] + 34], "bars");
    s += tx([0, yB + 40], "BB", "middle");
    return s + `</svg>`;
  }
  function renderFit() {
    if (!FR()) { App().toast("The fit-report reader (fitreport.js) is missing from the app folder."); go("geo"); return; }
    if (!S.fit) {
      frame("Start from your bike fit", `<p class="lead">A bike fit measures where your saddle and handlebars should be, measured from the cranks. That doesn't depend on the frame, so it's the best starting point for a new one. Load the PDF report your fitter sent you (Retül is the most common; other fit reports with the same numbers work too).</p>
        <div class="nb-drop" id="nbDrop"><b style="font:600 18px var(--font-display)">Drop your fit report (PDF) here</b>
          <p class="hint" style="max-width:56ch">Read right here on this computer; nothing is uploaded anywhere. Only the bike numbers are kept: your name, contact details and the fitter's details are ignored.</p>
          <button type="button" class="primary" id="nbPick">Choose the PDF…</button><input type="file" id="nbFile" accept=".pdf,application/pdf,.txt,text/plain" hidden>
          <p class="nb-warn" id="nbFitErr" role="alert" style="display:none"></p></div>
        <details><summary>Or paste the report's text</summary><div class="nb-paste" style="margin-top:6px"><textarea id="nbFitPaste" spellcheck="false" placeholder="Saddle Height: 777 mm\nEff. Seat Tube Angle: 75 °\nHandlebar Stack: 690 mm\nHandlebar Reach: 457 mm\nBB to center of bar\n…"></textarea></div>
          <button type="button" id="nbFitRead" style="margin-top:6px">Read this text</button></details>`,
        `<button type="button" data-back="geo">Back</button><span class="grow"></span><button type="button" id="nbFitType">No report file? Type the numbers</button>`);
      const fi = dlg.querySelector("#nbFile"), drop = dlg.querySelector("#nbDrop"), err = dlg.querySelector("#nbFitErr");
      const fail = m => { err.textContent = m; err.style.display = ""; };
      const got = (r, name) => {
        if (!r || !r.ok) { fail(`Couldn't find a saddle height in ${name || "that"}. If it's a fit report, type the numbers in instead (button below).`); return; }
        S.fit = r; S.fitFile = name || ""; S.fitOpts = {}; render();
      };
      const take = f => { err.style.display = "none"; drop.querySelector("b").textContent = "Reading " + f.name + "…";
        FR().readFile(f).then(r => got(r, f.name)).catch(e => { drop.querySelector("b").textContent = "Drop your fit report (PDF) here"; fail(e.message || String(e)); }); };
      dlg.querySelector("#nbPick").onclick = () => fi.click();
      fi.onchange = () => fi.files[0] && take(fi.files[0]);
      drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) take(f); });
      dlg.querySelector("#nbFitRead").onclick = () => got(FR().parseText(dlg.querySelector("#nbFitPaste").value), "the pasted text");
      dlg.querySelector("#nbFitType").onclick = () => { S.fit = { values: {}, bike: {}, cockpit: {}, raw: [], typed: true, system: "bike fit" }; S.fitFile = ""; S.fitOpts = {}; render(); };
      return;
    }
    const F = FR().FIELDS, V = S.fit.values, typ = T().TYPES[S.type], mtb = S.type === "mtb", o = S.fitOpts || (S.fitOpts = {});
    const r = fitSolve(), bk = S.fit.bike || {};
    const fld = id => `<label class="nb-f${V[id] != null && !S.fit.typed ? " from" : ""}" data-fit="${id}" title="${esc(F[id][2])}"><span>${esc(F[id][0])}<small>${esc(F[id][2])}</small></span><input type="number" step="any" value="${V[id] == null ? "" : V[id]}" aria-label="${esc(F[id][0])}"><span class="u">${F[id][1]}</span></label>`;
    const others = Object.keys(F).filter(id => !FIT_MAIN.includes(id) && !FIT_COCKPIT.includes(id) && V[id] != null);
    const ck = r.cockpit || {};
    const cockpitNew = mtb ? "" : `<div class="sub-h" style="margin:0">Cockpit on the new bike</div>
      <p class="hint" style="margin:0">The frame is worked out around these. Start with what you were fitted on; a shorter stem gives a longer frame and the same hand position.</p>
      <div class="nb-fields">
        <label class="nb-f"><span>Stem length</span><input id="nbFitStem" type="number" step="10" min="30" max="140" value="${ck.stem != null ? ck.stem : ""}"><span class="u">mm</span></label>
        <label class="nb-f"><span>Stem angle<small>−6 is the usual road/gravel stem; −17 slammed; +6 flipped up</small></span><input id="nbFitRise" type="number" step="1" min="-25" max="25" value="${ck.rise != null ? ck.rise : ""}"><span class="u">°</span></label>
        <label class="nb-f"><span>Spacers under the stem<small>10–20 mm leaves room to adjust later</small></span><input id="nbFitSp" type="number" step="5" min="0" max="50" value="${ck.spacers != null ? ck.spacers : ""}"><span class="u">mm</span></label>
      </div>
      <label class="hint" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="nbFitRelax"${o.relax ? " checked" : ""}> A touch more relaxed than the fit: bars 15 mm higher and 10 mm closer${bk.type && /road/i.test(bk.type) && S.type === "gravel" ? " (common when a road fit goes onto a gravel bike)" : ""}</label>`;
    const result = r.error ? `<p class="nb-warn">${esc(r.error)}</p>` : `
      <div class="sub-h" style="margin:0">Your new frame</div>
      <div class="nb-checks">
        ${r.frame ? `<div class="ck"><span class="pill ok">Reach ${r.frame.reach} mm</span><span class="pill ok">Stack ${r.frame.stack} mm</span><span class="pill ok">Head tube ${r.frame.headTube} mm</span></div>` : ""}
        <div class="ck"><span class="pill ok">Seat angle ${r.seat.sa}°</span><span class="pill ok">Saddle height ${r.seat.shFrame} mm</span><span class="pill">Crank ${r.values["geometry.crankLength"]} mm</span><span class="pill">Size ${esc(r.size)} parts</span></div>
        <div class="hint">Head angle ${r.g.headAngle}°, fork ${r.g.forkA2C} mm, BB drop ${r.g.bbDrop} mm: typical for a ${esc(typ.label.toLowerCase())} bike; change them on the next screen.</div>
      </div>
      ${is32() ? `<p class="hint" style="margin:0">32" wheels: toe overlap comes up easily on these. Cyclic Labs checks it in step 3 (Check → Toe overlap); the "Match a bike I already ride" option on the Geometry screen also searches for frames without it.</p>` : ""}
      ${r.warnings.map(w => `<p class="nb-warn">${esc(w)}</p>`).join("")}${r.notes.map(w => `<p class="hint" style="margin:0">${esc(w)}</p>`).join("")}`;
    frame("Start from your bike fit", `
      <p class="lead">${S.fit.typed ? "Type the numbers from your fit sheet." : `Read from ${esc(S.fitFile || "your report")}${S.fit.system && S.fit.system !== "bike fit" ? ` (${esc(S.fit.system)}${S.fit.date ? ", " + esc(S.fit.date) : ""})` : ""}${bk.model || bk.type ? `, fitted on ${esc([bk.year, bk.model, bk.type && `(${bk.type})`].filter(Boolean).join(" "))}` : ""}. Numbers with a green bar came from the report: check them against the PDF.`} Hover a number to see what it means.</p>
      <div class="nb-num">
        <div class="nb-fields">
          <div class="sub-h" style="margin:0">Where you sit and where your hands go</div>
          ${FIT_MAIN.map(fld).join("")}
          <details${S.fit.typed ? " open" : ""}><summary>The cockpit you were fitted on</summary><div class="nb-fields" style="margin-top:6px">${FIT_COCKPIT.map(fld).join("")}</div></details>
          ${others.length ? `<details><summary>Also in the report (${others.length}, for reference)</summary><ul class="nb-list">${others.map(id => `<li>${esc(F[id][0])}: <b>${V[id]}</b> ${F[id][1]}</li>`).join("")}</ul></details>` : ""}
          ${cockpitNew}
        </div>
        <div class="nb-pic"><div id="nbFitPic">${fitPicture(r)}</div>${result}</div>
      </div>`,
      `<button type="button" data-back="geo">Back</button><button type="button" id="nbFitAgain">Use a different report</button><span class="grow"></span><button type="button" class="primary" id="nbFitRepNext"${r.error ? " disabled" : ""}>Next: check the numbers</button>`);
    // typing re-solves shortly after you stop (scheduleFit) and keeps the cursor in the box
    dlg.querySelectorAll("[data-fit]").forEach(lb => { const id = lb.dataset.fit, inp = lb.querySelector("input");
      inp.addEventListener("input", () => { const v = parseFloat(inp.value); if (inp.value.trim() === "") delete V[id]; else if (isFinite(v)) V[id] = v; else return; lb.classList.remove("from"); scheduleFit(); }); });
    const num = (sel, key) => { const el = dlg.querySelector(sel); if (el) el.addEventListener("input", () => { const v = parseFloat(el.value); if (el.value.trim() === "") delete o[key]; else if (isFinite(v)) o[key] = v; else return; scheduleFit(); }); };
    num("#nbFitStem", "stem"); num("#nbFitRise", "rise"); num("#nbFitSp", "spacers");
    const rl = dlg.querySelector("#nbFitRelax"); if (rl) rl.onchange = () => { o.relax = rl.checked; renderFit(); };
    dlg.querySelector("#nbFitAgain").onclick = () => { S.fit = null; S.fitOpts = {}; render(); };
    dlg.querySelector("#nbFitRepNext").onclick = () => {
      const rr = fitSolve(); if (rr.error) { App().toast(rr.error); return; }
      S.fitResult = rr; S.values = Object.assign({}, rr.values); S.src = {};
      const how = S.fit.typed ? "your fit numbers" : "your fit report";
      for (const p of Object.keys(rr.values)) S.src[p] = p.startsWith("parts.") ? "your choice of cockpit" : how;
      S.notes = rr.notes.slice(); S.warnings = rr.warnings.slice();
      go("numbers");
    };
  }
  // re-solve shortly after typing stops: rebuild the right-hand column only
  let fitTimer = null;
  function scheduleFit() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      if (!dlg || S.step !== "fit" || !S.fit) return;
      const focusId = document.activeElement && document.activeElement.id, focusFit = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-fit]");
      const fk = focusFit ? focusFit.dataset.fit : null, sel = document.activeElement && document.activeElement.selectionStart;
      renderFit();
      const el = focusId ? dlg.querySelector("#" + focusId) : fk ? dlg.querySelector(`[data-fit="${fk}"] input`) : null;
      if (el) { el.focus(); try { if (sel != null) el.setSelectionRange(sel, sel); } catch (e) {} }
    }, 350);
  }

  function explain(p) {
    const f = MAIN.concat(MORE).find(m => m[0] === p);
    return f ? `<b>${esc(f[1])}.</b> ${esc(f[3])}` : `<span class="hint">Click any number to see it on the picture.</span>`;
  }

  function renderYou() {
    const FE = FEA(), T0 = T().TYPES[S.type], tpl = template();
    if (S.condition == null) S.condition = T0.use.condition;
    if (!S.name && S.source === "bcad" && S.file) S.name = S.file.replace(/\.(bcad|xml)$/i, "");
    if (!S.name) S.name = S.source === "fit" ? tpl.name.replace(/, size \w+$/, "") + ", built around my fit" : S.source === "chart" || S.source === "bcad" || S.source === "type" ? tpl.name.replace(/, size \w+$/, "") : tpl.name;
    const conds = Object.entries(FE.CONDITIONS);
    frame("A little about you", `<p class="lead">Used for the strength and comfort checks behind the scenes. Change them any time.</p>
      <div class="nb-you">
        <label>Name this bike${S.garage ? ` <span class="hint">(e.g. “My Stumpjumper” or “2019 Crux, size 56”)</span>` : ""}<input id="nbName" value="${esc(S.name)}"></label>
        <label>Your weight (with riding kit)<span class="row"><input id="nbKg" type="number" step="1" value="${S.lb ? Math.round(S.kg / 0.4536) : Math.round(S.kg)}"><select id="nbUnit" style="width:auto"><option value="kg">kg</option><option value="lb"${S.lb ? " selected" : ""}>lb</option></select></span></label>
        <label>Shoe size <span class="hint">(for the toe-overlap check; blank = typical for the size)</span><span class="row"><input id="nbShoe" type="number" step="0.5" placeholder="${({ S: 40, M: 42, L: 44, XL: 46 })[S.size] || 43}" value="${S.shoe == null ? "" : S.shoe}"><select id="nbShoeSys" style="width:auto">${[["eu", "EU"], ["usm", "US men's"], ["usw", "US women's"], ["uk", "UK"]].map(([k, l]) => `<option value="${k}"${k === (S.shoeSys || "eu") ? " selected" : ""}>${l}</option>`).join("")}</select></span></label>
        <label>Shoe tip to cleat centre <span class="hint">(optional, mm: shoe off, sole up, ruler across the tip to the middle of the cleat. Makes the toe-overlap check exact, which matters most on small frames, fat tyres and 32" wheels)</span><input id="nbTip" type="number" step="1" placeholder="estimate from shoe size" value="${S.tip == null ? "" : S.tip}"></label>
        <label>Where you'll ride it<select id="nbCond">${conds.map(([k, c]) => `<option value="${k}"${+k === +S.condition ? " selected" : ""}>${esc(c.name.replace(/^Condition \d – /, ""))}</option>`).join("")}</select></label>
      </div>`,
      `<button type="button" data-back="${S.source === "size" ? "size" : "numbers"}">Back</button><span class="grow"></span><button type="button" class="primary" id="nbBuild">${S.garage ? "Put it in my garage" : "Build my bike"}</button>`);
    const kg = dlg.querySelector("#nbKg"), un = dlg.querySelector("#nbUnit");
    const readKg = () => { const v = parseFloat(kg.value); if (isFinite(v) && v > 20) S.kg = S.lb ? v * 0.4536 : v; };
    kg.oninput = readKg; un.onchange = () => { readKg(); S.lb = un.value === "lb"; kg.value = S.lb ? Math.round(S.kg / 0.4536) : Math.round(S.kg); };
    dlg.querySelector("#nbCond").onchange = e => S.condition = +e.target.value;
    dlg.querySelector("#nbShoe").oninput = e => { const v = e.target.value.trim(); S.shoe = v === "" ? null : +v; };
    dlg.querySelector("#nbShoeSys").onchange = e => { S.shoeSys = e.target.value; dlg.querySelector("#nbShoe").placeholder = window.FrameToe ? String(Math.round(window.FrameToe.fromEU(({ S: 40, M: 42, L: 44, XL: 46 })[S.size] || 43, S.shoeSys) * 2) / 2) : ""; };
    dlg.querySelector("#nbTip").oninput = e => { const v = e.target.value.trim(); S.tip = v === "" ? null : +v; };
    dlg.querySelector("#nbName").oninput = e => S.name = e.target.value;
    dlg.querySelector("#nbBuild").onclick = build;
  }

  function build() {
    const { d, tpl } = buildDesign(), FE = FEA();
    try { FE.validate(d); } catch (e) { App().toast("Fix this first: " + e.message); return; }
    const how = { size: `typical size ${S.size}`, type: "numbers typed in", chart: `a pasted geometry chart (size ${S.chart ? S.chart.sizes[S.chartSize] : "?"})`, bcad: `the BikeCAD file ${S.file || ""}`, fit: `a bike-fit report (${S.fit ? FR().keep(S.fit).system + (S.fit.date ? " " + S.fit.date : "") : "typed in"}): saddle and handlebar position kept, frame worked out around a ${S.fitResult ? `${S.fitResult.cockpit.stem} mm ${S.fitResult.cockpit.rise}° stem on ${S.fitResult.cockpit.spacers} mm of spacers` : "stem"}` , fit32: "the 32er fit solver (matched to a bike the rider already rides)" }[S.source] || "a template";
    const notes = (S.discovered ? `Suggested by “Help me figure out what I want”: ${S.discovered}. ` : "") + (S.source === "size" ? tpl.notes : `${tpl.notes} Geometry from ${how}; ${S.source === "fit" ? "the rest" : "numbers not given"} were filled from the size-${S.size} template${S.autoA2C ? " (fork length worked out so the bike stands level)" : ""}.`);
    if (S.garage && window.FrameGarage) { close(); window.FrameGarage.addBuilt((S.name || tpl.name).trim(), notes, d, { type: S.type, size: S.source === "chart" && S.chart ? String(S.chart.sizes[S.chartSize] || "") : S.source === "size" ? S.size : "" }); return; }
    App().createDesign((S.name || tpl.name).trim(), notes, d);
    S.built = true; go("done");
  }

  function renderDone() {
    const eng = App().uiMode && App().uiMode() === "eng";
    frame("Your bike is ready", `<h3>${esc(S.name)} is built.</h3>
      <p class="lead">It's open now with plain generic parts and ordinary titanium tubes. Next, make it yours: swap parts, set tube sizes, shape the stays, then save it.</p>
      <ul class="nb-list"><li>It's open in step 2 (Design): pick a box beside the 3D bike (Geometry, Tubes, Stays…) to change that part and watch the bike update.</li><li><b>Design chat</b> lets you just type changes ("make the reach 460", "use a 140 mm fork").</li><li>${eng ? "Engineering results are on: they're in step 3 (Check) with the other checks." : "When it looks right, step 3 (Check) walks you through every check, one tick at a time."}</li></ul>`,
      `<span class="grow"></span><button type="button" data-own>I'll look around myself</button><button type="button" class="primary" data-refine>Show me how to refine it</button>`);
    dlg.querySelector("[data-own]").onclick = close;
    dlg.querySelector("[data-refine]").onclick = () => { close(); window.FrameTour && window.FrameTour.start("refine"); };
  }

  // scan: build the clean starting bike first, then hand it to the drawing scanner as the design to start from
  function startScan() {
    const { d, tpl } = buildDesign();
    close();
    if (window.FrameScanUI) window.FrameScanUI.open({ base: { id: "__new", name: tpl.name + " (new, not saved yet)", design: d } });
  }

  // builder's drawing typed in: same clean starting bike, handed to the Match a frame drawing dialog (drawmatch.js)
  function startTyped() {
    const { d, tpl } = buildDesign();
    close();
    if (window.FrameDrawMatch) window.FrameDrawMatch.open({ base: { id: "__new", name: tpl.name + " (new, not saved yet)", design: d } });
  }

  window.FrameNewBike = { open, _state: () => S, _buildDesign: () => buildDesign() };
})();
