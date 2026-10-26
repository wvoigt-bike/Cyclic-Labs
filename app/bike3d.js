// ============================================================================
//  REALISTIC VIEW — "what the finished bike will look like"
//  Builds shaded 3D models of the frame (from the analysis model: same tube
//  paths and sizes) and of every part (fork, wheels, drivetrain, brakes,
//  cockpit, seatpost, saddle), lit like a photo studio. Display only: it never
//  changes an analysis number. Part choices live in design.parts, so they save
//  with the design. Uses bike3d-gl.js (a small WebGL2 engine, no libraries).
//
//  API: FrameBike3D.supported(), init(host), show(on), update(), setView(name),
//       dispose().  host = { wrap, panel, get() → {result, design, shown,
//       partShow, flex, stressColor}, onPartsChanged(), onManualView(), onReset() }
// ============================================================================
(function (root) {
  "use strict";
  const G = root.Bike3DGL;
  if (!G) return;
  const { V, M4, Mesh, sweep, lathe, cyl, torus, blob, disc, plate, hullCircles, smoothPath, perp, hex2lin, css2lin } = G;
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  const num = (v, d) => (v === "" || v == null || !isFinite(+v)) ? d : +v;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const pitchR = N => 12.7 / (2 * Math.sin(Math.PI / N));
  const D2R = Math.PI / 180;

  // ---------------------------------------------------------------- canvas textures
  function canvas(S) { const c = document.createElement("canvas"); c.width = c.height = S; return c; }
  function annulus(x, ro, ri) { x.beginPath(); x.arc(0, 0, ro, 0, 2 * Math.PI); if (ri > 0) x.arc(0, 0, ri, 0, 2 * Math.PI, true); x.fill(); }
  function texRotor(Rmm, brand) {
    const S = 512, c = canvas(S), x = c.getContext("2d"), k = (S / 2) / Rmm;
    x.translate(S / 2, S / 2); x.scale(k, -k);
    x.fillStyle = "#dcdcdc"; annulus(x, Rmm, Rmm - 16.5);
    x.globalCompositeOperation = "destination-out";
    const nH = Math.round(2 * Math.PI * (Rmm - 8) / 8.5);
    for (let i = 0; i < nH; i++) {
      const a = 2 * Math.PI * i / nH, r = (i % 3 === 0) ? Rmm - 8.2 : (i % 3 === 1 ? Rmm - 5 : Rmm - 11.5);
      x.beginPath(); x.ellipse(r * Math.cos(a), r * Math.sin(a), brand === "sram" ? 2.6 : 2.1, brand === "sram" ? 1.6 : 2.1, a + 0.6, 0, 2 * Math.PI); x.fill();
    }
    x.globalCompositeOperation = "source-over";
    const spider = brand === "shimano" ? "#202022" : "#c4c6c9";
    x.strokeStyle = spider; x.fillStyle = spider; x.lineCap = "round";
    const arms = brand === "shimano" ? 6 : 5;
    for (let i = 0; i < arms; i++) {
      const a = 2 * Math.PI * i / arms, a1 = a + (brand === "shimano" ? 0.45 : 0.75), am = (a + a1) / 2 - 0.05, rm = (30 + Rmm - 15) / 2;
      x.lineWidth = brand === "shimano" ? 9 : 6.5;
      x.beginPath(); x.moveTo(26 * Math.cos(a), 26 * Math.sin(a)); x.quadraticCurveTo(rm * Math.cos(am) * 1.05, rm * Math.sin(am) * 1.05, (Rmm - 15) * Math.cos(a1), (Rmm - 15) * Math.sin(a1)); x.stroke();
      if (brand === "shimano") { x.fillStyle = "#cfcfcf"; x.beginPath(); x.arc((Rmm - 15.5) * Math.cos(a1), (Rmm - 15.5) * Math.sin(a1), 2.2, 0, 7); x.fill(); x.fillStyle = spider; }
    }
    annulus(x, 31, 17);
    if (brand === "shimano") { x.fillStyle = "#dcdcdc"; annulus(x, Rmm - 15, Rmm - 17.5); }
    x.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 6; i++) { const a = 2 * Math.PI * i / 6; x.beginPath(); x.arc(22 * Math.cos(a), 22 * Math.sin(a), 2.8, 0, 7); x.fill(); }
    return c;
  }
  // Hope floating rotor: stainless track (round-hole pattern, etched HOPE) riveted to an anodised alloy carrier with
  // 6 forked arms (12 floating rivets). carrier = css colour of the alloy carrier.
  function texRotorHope(Rmm, carrier) {
    const S = 1024, c = canvas(S), x = c.getContext("2d"), k = (S / 2) / Rmm, tw = Rmm >= 90 ? 17 : 15.5, ri = Rmm - tw;
    x.translate(S / 2, S / 2); x.scale(k, -k);
    // track with inner rivet lugs
    x.fillStyle = "#d2d3d5"; annulus(x, Rmm, ri);
    for (let i = 0; i < 12; i++) { const a = 2 * Math.PI * (i + 0.5) / 12; x.beginPath(); x.arc((ri - 1) * Math.cos(a), (ri - 1) * Math.sin(a), 4.6, 0, 7); x.fill(); }
    x.globalCompositeOperation = "destination-out";
    const pitch = 9.6, nH = Math.round(2 * Math.PI * (Rmm - tw / 2) / pitch), rm = Rmm - tw / 2;
    for (let i = 0; i < nH; i++) {
      const a = 2 * Math.PI * i / nH, a2 = a + Math.PI / nH;
      const nearLogo = [0.55, 0.55 + Math.PI].some(t => Math.abs(Math.atan2(Math.sin(a - t - Math.PI / 2), Math.cos(a - t - Math.PI / 2))) < 0.17);
      if (!nearLogo) { x.beginPath(); x.arc(rm * Math.cos(a), rm * Math.sin(a), 2.5, 0, 7); x.fill(); }
      for (const [r, s] of [[Rmm - 3.6, 1.25], [ri + 3.4, 1.25]]) { x.beginPath(); x.arc(r * Math.cos(a2), r * Math.sin(a2), s, 0, 7); x.fill(); }
    }
    x.globalCompositeOperation = "source-over";
    // carrier: centre ring + 6 forked arms
    x.fillStyle = carrier; x.strokeStyle = carrier; x.lineCap = "round"; x.lineJoin = "round";
    annulus(x, 33, 17.5);
    for (let i = 0; i < 6; i++) {
      const a = 2 * Math.PI * i / 6, a0 = a - 0.12, aL = 2 * Math.PI * (2 * i + 0.5) / 12, aR = 2 * Math.PI * (2 * i + 1.5) / 12, rr = ri - 1, rf = (33 + rr) * 0.55;
      const f = [rf * Math.cos(a + 0.26), rf * Math.sin(a + 0.26)];
      x.lineWidth = 8.5; x.beginPath(); x.moveTo(28 * Math.cos(a0), 28 * Math.sin(a0)); x.quadraticCurveTo(rf * 0.7 * Math.cos(a + 0.05), rf * 0.7 * Math.sin(a + 0.05), f[0], f[1]); x.stroke();
      x.lineWidth = 5.5;
      for (const ae of [aL, aR]) { x.beginPath(); x.moveTo(f[0], f[1]); x.lineTo((rr - 1) * Math.cos(ae), (rr - 1) * Math.sin(ae)); x.stroke(); }
      x.beginPath(); x.arc(f[0], f[1], 6, 0, 7); x.fill();
    }
    x.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 6; i++) { const a = 2 * Math.PI * i / 6 + 0.26, rf = (33 + ri - 1) * 0.55; x.beginPath(); x.arc(rf * Math.cos(a), rf * Math.sin(a), 2.4, 0, 7); x.fill(); }
    x.globalCompositeOperation = "source-over";
    // floating rivets
    for (let i = 0; i < 12; i++) { const a = 2 * Math.PI * (i + 0.5) / 12, r = ri - 1;
      x.fillStyle = "#3a3b3e"; x.beginPath(); x.arc(r * Math.cos(a), r * Math.sin(a), 3.3, 0, 7); x.fill();
      x.fillStyle = "#e4e4e6"; x.beginPath(); x.arc(r * Math.cos(a), r * Math.sin(a), 2.5, 0, 7); x.fill(); }
    // etched logo on the track (dull grey), twice
    x.fillStyle = "#8d8f93"; x.font = "900 " + (tw * 0.42).toFixed(1) + "px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    for (const a of [0.55, 0.55 + Math.PI]) { x.save(); x.rotate(a); x.translate(0, rm); x.scale(1, -1); x.fillText("HOPE", 0, 0); x.restore(); }
    return c;
  }
  // toothed sprocket: kind "ring" (chainring with 4-arm direct-mount body), "cog", "pulley"
  function texSprocket(N, kind, col, inner) {
    const S = N > 40 ? 1024 : 512, c = canvas(S), x = c.getContext("2d"), pr = pitchR(N), tip = pr + (kind === "pulley" ? 2.4 : 3.4), root = pr - 3.9, k = (S / 2) / tip;
    x.translate(S / 2, S / 2); x.scale(k, -k);
    x.fillStyle = col; x.beginPath();
    const al = 2 * Math.PI / N;
    for (let i = 0; i < N; i++) {
      const a = i * al, pts = [[root, 0], [root + 0.6, 0.14], [pr, 0.27], [tip - 0.6, 0.38], [tip, 0.45], [tip, 0.55], [tip - 0.6, 0.62], [pr, 0.73], [root + 0.6, 0.86]];
      for (const [r, f] of pts) { const t = a + f * al; if (i === 0 && f === 0) x.moveTo(r * Math.cos(t), r * Math.sin(t)); else x.lineTo(r * Math.cos(t), r * Math.sin(t)); }
    }
    x.closePath(); x.fill();
    if (inner) { x.fillStyle = inner; annulus(x, root - 5, 0); }
    x.globalCompositeOperation = "destination-out";
    if (kind === "ring") {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2, w = 0.55, r0 = 34, r1 = root - 7;
        x.beginPath(); x.arc(0, 0, r1, a - w, a + w); x.arc(0, 0, r0, a + w * 0.7, a - w * 0.7, true); x.closePath(); x.fill();
      }
      annulus(x, 16, 0);
    } else if (kind === "cog") {
      if (N >= 28) { const nw = N >= 40 ? 6 : 5; for (let i = 0; i < nw; i++) { const a = i * 2 * Math.PI / nw, w = Math.PI / nw * 0.62, r0 = 25, r1 = root - 6; x.beginPath(); x.arc(0, 0, r1, a - w, a + w); x.arc(0, 0, r0, a + w * 0.5, a - w * 0.5, true); x.closePath(); x.fill(); } }
      annulus(x, 17, 0);
    } else { annulus(x, 5, 0); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.beginPath(); x.arc(13 * Math.cos(a), 13 * Math.sin(a), 3, 0, 7); x.fill(); } }
    return c;
  }
  // darker / lighter version of a #rrggbb colour (f < 1 darker)
  function shadeHex(hex, f) { const n = parseInt(String(hex || "#222222").slice(1, 7), 16) || 0; const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f)))); return "#" + c.map(v => v.toString(16).padStart(2, "0")).join(""); }
  function texText(text, font, fill, stroke, w, h) {
    const c = document.createElement("canvas"); c.width = w || 1024; c.height = h || 256; const x = c.getContext("2d");
    x.font = font; x.textAlign = "center"; x.textBaseline = "middle";
    const tw = x.measureText(text).width, maxW = c.width * 0.94;
    if (tw > maxW) { const px = parseFloat((font.match(/(\d+(\.\d+)?)px/) || [0, 100])[1]); x.font = font.replace(/\d+(\.\d+)?px/, (px * maxW / tw).toFixed(1) + "px"); }
    if (stroke) { x.lineWidth = c.height * 0.06; x.strokeStyle = stroke; x.strokeText(text, c.width / 2, c.height / 2 + c.height * 0.04); }
    x.fillStyle = fill; x.fillText(text, c.width / 2, c.height / 2 + c.height * 0.04);
    return c;
  }

  // ---------------------------------------------------------------- the build
  function buildBike(R, st, theme) {
    const res = st.result, des = st.design, FP = root.FrameParts;
    const m = res.model, geo = m.geo, P = geo.P, g = des.geometry, tb = des.tubes;
    const o = Object.assign({}, FP.DEFAULTS, des.parts || {});
    // the parts this bike shows (library picks, or the older per-bike settings) — see partlib.js
    const PR = root.FramePartLib ? root.FramePartLib.resolve(des) : null;
    const PE = PR ? PR.pedals : { color: "#151517", pinColor: "#c8c8ca" };
    const CK = PR ? PR.cockpit : { stemColor: "#141416", barColor: "#141416", gripColor: "#1a1a1a" };
    const SA = PR ? PR.saddle : { color: "#303032", railColor: "#c8c8ca" };
    if (PR) Object.assign(o, {
      tyreWidth: PR.tyres.width, tyreSide: PR.tyres.sidewall, spokes: PR.wheels.spokes, rimDepth: PR.wheels.rimDepth,
      brakes: PR.brakes.style, rotorF: PR.brakes.rotorF, pedals: PR.pedals.type, saddle: PR.saddle.shape,
      crankLen: PR.crankset.length > 0 ? PR.crankset.length : "auto",
      barType: PR.cockpit.barType, barWidth: PR.cockpit.barWidth, barRise: PR.cockpit.barRise, backsweep: PR.cockpit.backsweep,
      upsweep: PR.cockpit.upsweep, stemLength: PR.cockpit.stemLength, stemRise: PR.cockpit.stemRise,
      groupset: PR.rear.type === "sram12" ? "sramEagle" : PR.rear.type === "sramRoad12" ? "sramRoad" : PR.rear.type === "shimano12" ? "shimanoXT" : PR.rear.type === "singlespeed" ? "singlespeed" : (o.groupset || "auto")
    });
    const animating = !!(st.shown && st.shown.anim);   // FEA animation: frame only, stress colours, rebuilt every frame
    const show = animating ? { wheels: false, rotors: false, fork: false, cockpit: false, post: false, drive: false, bottles: false } : Object.assign({ wheels: true, rotors: true, fork: true, cockpit: true, post: true, drive: true, bottles: true }, st.partShow || {});
    const stress = st.mode === "stress";
    const B = {}, MAT = {};
    const M = key => B[key] || (B[key] = new Mesh());
    const texMat = (key, cv, props) => { if (!MAT[key]) MAT[key] = Object.assign({ map: R.texture(cv), alphaTest: 0.5 }, props); return M(key); };

    // ---- materials
    const smallPal = { silver: { base: [0.80, 0.80, 0.81], metal: 1, rough: 0.16 }, black: { base: [0.03, 0.03, 0.035], metal: 0.4, rough: 0.3, clear: 0.4 },
      purple: { base: hex2lin("#7a4cc8"), metal: 1, rough: 0.24 }, gold: { base: [0.86, 0.57, 0.2], metal: 1, rough: 0.2 } };
    Object.assign(MAT, {
      ti: { base: [0.58, 0.555, 0.52], metal: 1, rough: 0.3, aniso: 0.8, brushed: 1 },
      tiWeld: { base: [0.55, 0.515, 0.46], metal: 1, rough: 0.34 },
      // frame paint; parts.paintFinish: satin (default) | matte | gloss | metallic
      paint: Object.assign({ base: hex2lin(o.paintColor || "#5b2d8e"), metal: 0 }, { satin: { rough: 0.46, clear: 0.25, sheen: 0.45 }, matte: { rough: 0.66, clear: 0, sheen: 0.4 },
        gloss: { rough: 0.25, clear: 0.9, sheen: 0.2 }, metallic: { metal: 0.6, rough: 0.34, clear: 0.9, flake: 1 } }[o.paintFinish] || { rough: 0.46, clear: 0.25, sheen: 0.45 }),
      stress: { base: [1, 1, 1], vc: true, metal: 0, rough: 0.42, clear: 0.3 },
      blackAnod: { base: [0.024, 0.024, 0.028], metal: 0.35, rough: 0.32, clear: 0.25 },
      blackMatte: { base: [0.028, 0.028, 0.03], rough: 0.72 },
      blackGloss: { base: [0.016, 0.016, 0.018], rough: 0.2, clear: 0.9 },
      rubber: { base: [0.03, 0.03, 0.03], rough: 0.92, sheen: 0.3 },
      tyre: { base: [1, 1, 1], vc: true, rough: 0.9, sheen: 0.3 },
      silver: { base: [0.78, 0.78, 0.79], metal: 1, rough: 0.22 },
      steel: { base: [0.6, 0.6, 0.62], metal: 1, rough: 0.26 },
      chrome: { base: [0.9, 0.9, 0.92], metal: 1, rough: 0.08 },
      brass: { base: [0.78, 0.6, 0.3], metal: 1, rough: 0.3 },
      tiBolt: { base: [0.5, 0.48, 0.45], metal: 1, rough: 0.25 },
      kashima: { base: [0.66, 0.43, 0.17], metal: 1, rough: 0.2, aniso: 0.35 },
      stanBlack: { base: [0.02, 0.02, 0.022], metal: 0.6, rough: 0.16, clear: 0.6 },
      chain: { base: [0.5, 0.5, 0.52], metal: 1, rough: 0.3 },
      xtGrey: { base: [0.36, 0.37, 0.39], metal: 1, rough: 0.28 },
      small: smallPal[o.smallColor] || smallPal.silver,
      saddle: { base: [1, 1, 1], vc: true, rough: 0.6, sheen: 0.4 },
      orange: { base: hex2lin("#e8661c"), rough: 0.4, clear: 0.3 },
      ground: { ground: true }
    });
    // colour + finish → material (finishes: gloss, matte, metallic, anodised, polished; kind carbon adds a clear coat)
    const dynMat = (hex, finish, kind) => {
      const key = "d_" + hex + "_" + (finish || "gloss") + "_" + (kind || "");
      if (MAT[key]) return key;
      const base = hex2lin(hex || "#222222");
      const F = { gloss: { rough: 0.3, clear: 0.85, sheen: 0.2 }, matte: { rough: 0.62, sheen: 0.35 }, metallic: { metal: 0.62, rough: 0.34, clear: 0.9, flake: 1 },
        anodised: { metal: 0.7, rough: 0.27, clear: 0.15 }, polished: { metal: 1, rough: 0.08 } }[finish || "gloss"] || { rough: 0.4 };
      MAT[key] = Object.assign({ base }, F);
      if (kind === "carbon") { MAT[key].clear = finish === "matte" ? 0.25 : 0.95; MAT[key].rough = finish === "matte" ? 0.48 : 0.22; MAT[key].metal = 0; MAT[key].weave = 1; }
      if (kind === "carbonUD") { MAT[key].clear = finish === "matte" ? 0.12 : 0.95; MAT[key].rough = finish === "matte" ? 0.55 : 0.2; MAT[key].metal = 0; MAT[key].weave = 0; MAT[key].sheen = 0.15; }
      if (kind === "steel") Object.assign(MAT[key], { metal: 1, rough: 0.3 });
      return key;
    };

    // ---- frame geometry helpers (with optional exaggerated flex, like the line drawing)
    const shown = st.shown;
    let U = null, ex = 0;
    if (stress && (st.flex || animating) && shown && !shown.worst && shown.u) {
      U = shown.u;
      if (shown.exScale != null) ex = shown.exScale;
      else { let maxd = 0; for (let i = 0; i < m.nodes.length; i++) maxd = Math.max(maxd, Math.hypot(U[i * 6], U[i * 6 + 1], U[i * 6 + 2])); ex = maxd > 0 ? 45 / maxd : 0; }
    }
    const pos = i => { const p = m.nodes[i].p; return U ? [p[0] + U[i * 6] * ex, p[1] + U[i * 6 + 1] * ex, p[2] + U[i * 6 + 2] * ex] : p; };
    const NI = m.nodeIdx, at = nm => NI[nm] != null ? pos(NI[nm]) : P[nm];
    const elU = i => { if (!shown) return [0, 0]; const r = shown.worst ? res.envelope[i] : shown.el ? shown.el[i] : null; return r ? [r.u1 || 0, r.u2 || 0] : [0, 0]; };
    const colCache = {};
    const uCol = u => { const k = Math.round(u * 400); return colCache[k] || (colCache[k] = css2lin(st.stressColor ? st.stressColor(u) : "#888")); };
    const finish = o.finish || "wPurple";
    const painted = grp => finish === "painted" || (finish === "wPurple" && ["topTube", "downTube", "seatTube", "headTube", "bbShell"].includes(grp));
    // finish "tiSplit" (v10.18): two raw-Ti textures either side of one straight line in the side view, e.g. bead-blasted front
    // (head tube, front of the top tube, top of the down tube) and brushed rear. The line crosses the down tube parts.splitAt %
    // of its length up from the BB, at parts.splitAngle ° to it (90 = square across), and runs on up across the top tube.
    // finish "tiSplitFlip" (v10.20): the same line, textures swapped: brushed front, bead-blasted rear.
    let splitF = null;
    if ((finish === "tiSplit" || finish === "tiSplitFlip") && !stress) {
      const b0 = at("BB"), b1 = at("DTht"), Ld = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) || 1, d = [(b1[0] - b0[0]) / Ld, (b1[1] - b0[1]) / Ld];
      const s = clamp(num(o.splitAt, 67), 5, 95) / 100, a = clamp(num(o.splitAngle, 90), 20, 160) * D2R;
      const S0 = [b0[0] + d[0] * Ld * s, b0[1] + d[1] * Ld * s], ln = [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a)];
      const nrm = [-ln[1], ln[0]], f0 = p => (p[0] - S0[0]) * nrm[0] + (p[1] - S0[1]) * nrm[1], sg = (f0(at("HTtop")) >= 0 ? 1 : -1) * (finish === "tiSplitFlip" ? -1 : 1);
      splitF = p => sg * f0(p);                                       // > 0 = the bead-blasted side (head-tube side for tiSplit, rear for tiSplitFlip)
      if (!MAT.tiBlast) MAT.tiBlast = { base: [0.25, 0.245, 0.24], metal: 0.75, rough: 0.68, sheen: 0.15 };
      if (!MAT.tiBlastWeld) MAT.tiBlastWeld = { base: [0.27, 0.26, 0.25], metal: 0.75, rough: 0.64 };
    }
    const frontSide = p => !!(splitF && p && splitF(p) > 0);
    const matFor = (grp, p) => stress ? "stress" : painted(grp) ? "paint" : frontSide(p) ? "tiBlast" : "ti";
    const weldFor = (grp, p) => stress ? "stress" : painted(grp) ? "paint" : frontSide(p) ? "tiBlastWeld" : "tiWeld";
    const chainOf = mem => { const els = mem.elements; return { els, nodes: [m.elements[els[0]].n1].concat(els.map(e => m.elements[e].n2)) }; };
    const memBy = lab => m.members.find(mm => mm.label === lab);

    // ---------------- frame tubes
    const tubeEnds = {};   // label → {start: {p, dir, rh, rw, H, W}, end: {...}, grp}
    const SWEEP = new Set(["topTube", "downTube", "seatTube", "chainstay", "seatStay"]);
    const frameRef = t => { let w = V.sub(Z, V.mul(t, V.dot(Z, t))); if (V.len(w) < 1e-3) w = V.sub(Y, V.mul(t, V.dot(Y, t))); w = V.norm(w); return { W: w, H: V.cross(w, t) }; };
    m.members.forEach(mem => {
      if (!SWEEP.has(mem.group) || !mem.elements.length) return;
      const { els, nodes } = chainOf(mem);
      let pts = nodes.map(pos);
      const n = pts.length;
      const secAt = k => { const a = m.elements[els[Math.max(0, k - 1)]].section, b = m.elements[els[Math.min(els.length - 1, k)]].section; return [(a.h + b.h) / 4, (a.w + b.w) / 4]; };
      let rh = [], rw = [], col = [];
      for (let k = 0; k < n; k++) {
        const [h2, w2] = secAt(k); rh.push(h2); rw.push(w2);
        if (stress) { const uA = k > 0 ? elU(els[k - 1])[1] : elU(els[0])[0], uB = k < els.length ? elU(els[k])[0] : uA; col.push(uCol(Math.max(uA, uB))); }
      }
      // smooth curved tubes
      let curved = false;
      for (let k = 1; k < n - 1; k++) { const a = V.norm(V.sub(pts[k], pts[k - 1])), b = V.norm(V.sub(pts[k + 1], pts[k])); if (V.dot(a, b) < 0.99985) { curved = true; break; } }
      if (curved && n > 2) {
        const per = 3, sp = smoothPath(pts, per), R2 = [], W2 = [], C2 = [];
        for (let q = 0; q < sp.length; q++) { const k = Math.min(n - 2, Math.floor(q / per)), t = q / per - k; R2.push(lerp(rh[k], rh[k + 1], t)); W2.push(lerp(rw[k], rw[k + 1], t)); if (stress) C2.push(V.lerp(col[k], col[k + 1], t)); }
        pts = sp; rh = R2; rw = W2; col = C2;
      }
      const isStay = /^Seat stay \(|^Seat stay leg/.test(mem.label), isYoke = /yoke/i.test(mem.label), isCS = /^Chainstay \(/.test(mem.label);
      const isBridge = mem.label === "Seat stay bridge";
      let cap0 = null, cap1 = null;
      if (isStay && !/leg/.test(mem.label)) {             // capped stay top beside the seat tube
        const t0 = V.norm(V.sub(pts[1], pts[0]));
        pts = [V.madd(pts[0], t0, -4)].concat(pts); rh = [rh[0]].concat(rh); rw = [rw[0]].concat(rw); if (stress) col = [col[0]].concat(col);
        cap0 = "dome";
      }
      if (isStay || isCS) cap1 = "flat";
      if (isYoke) cap1 = "flat";
      if (/leg/.test(mem.label)) cap0 = "dome";
      const sOpt = { rh, rw, exp: isYoke ? 5 : 2, seg: isBridge ? 16 : 24, cap0, cap1, col: stress ? col : null, uScale: 0.004 };
      const fs = splitF ? pts.map(splitF) : null;
      if (fs && fs.some(v => v > 0) && fs.some(v => v <= 0)) {
        // split finish: cut the tube where it crosses the line, each piece in its own texture (no caps at the cut)
        let run = { p: [pts[0]], h: [rh[0]], w: [rw[0]], front: fs[0] > 0 }; const runs = [];
        for (let k = 1; k < pts.length; k++) {
          if ((fs[k] > 0) !== run.front) {
            const t = fs[k - 1] / (fs[k - 1] - fs[k]), q = V.lerp(pts[k - 1], pts[k], t), hq = lerp(rh[k - 1], rh[k], t), wq = lerp(rw[k - 1], rw[k], t);
            run.p.push(q); run.h.push(hq); run.w.push(wq); runs.push(run);
            run = { p: [q], h: [hq], w: [wq], front: fs[k] > 0 };
          }
          run.p.push(pts[k]); run.h.push(rh[k]); run.w.push(rw[k]);
        }
        runs.push(run);
        runs.forEach((r, i) => { if (r.p.length > 1) sweep(M(r.front ? "tiBlast" : "ti"), r.p, Object.assign({}, sOpt, { rh: r.h, rw: r.w, cap0: i === 0 ? cap0 : null, cap1: i === runs.length - 1 ? cap1 : null })); });
      } else sweep(M(matFor(mem.group, pts[Math.floor(pts.length / 2)])), pts, sOpt);
      const N2 = pts.length, t0 = V.norm(V.sub(pts[1], pts[0])), t1 = V.norm(V.sub(pts[N2 - 1], pts[N2 - 2]));
      const f0 = frameRef(t0), f1 = frameRef(t1);
      tubeEnds[mem.label] = { grp: mem.group,
        start: { p: pts[cap0 === "dome" && isStay ? 1 : 0], dir: t0, rh: rh[0], rw: rw[0], H: f0.H, W: f0.W, col: stress ? col[0] : null },
        end: { p: pts[N2 - 1], dir: V.mul(t1, -1), rh: rh[N2 - 1], rw: rw[N2 - 1], H: f1.H, W: f1.W, col: stress ? col[N2 - 1] : null }, pts };
    });

    // ---------------- head tube (ZS44 top / ZS56 bottom: tapered, machined cup ends)
    const htA = at("HTtop"), htB = at("HTbot"), htAx = V.norm(V.sub(htB, htA)), htL = V.dist(htA, htB);
    const fP = PR ? PR.fork : null;
    const forkCat = fP ? Object.assign({}, fP, { legHalf: (+fP.legSpacing || 140) / 2, travel: fP.type === "rigid" ? 0 : +fP.travel }) : (FP.FORKS[o.fork] || FP.FORKS.sidUlt120);
    const susp = forkCat.travel > 0;
    const htOD = tb.headTube.od || 52, rTop = Math.max(htOD - 2, 46) / 2, rBot = susp ? Math.max(htOD + 8, 60) / 2 : Math.max(htOD + 4, 52) / 2;
    const rHT = s => s < 6 ? rTop + 0.9 : s > htL - 7 ? rBot + 0.9 : lerp(rTop, rBot, (s - 6) / (htL - 13));
    const groupEls = grp => { const out = []; m.members.forEach(mm => { if (mm.group === grp) for (const e of mm.elements) out.push(e); }); return out; };
    const uAlongAxis = (els, o0, ax, s) => {
      let best = 0, bd = Infinity;
      for (const e of els) { const E = m.elements[e], s1 = V.dot(V.sub(pos(E.n1), o0), ax), s2 = V.dot(V.sub(pos(E.n2), o0), ax), lo = Math.min(s1, s2), hi = Math.max(s1, s2);
        const d = s < lo ? lo - s : s > hi ? s - hi : 0; if (d < bd) { bd = d; const t = hi - lo > 1e-6 ? clamp((s - s1) / (s2 - s1), 0, 1) : 0, u = elU(e); best = lerp(u[0], u[1], t); } }
      return best;
    };
    {
      const ss = [0, 5.7, 6.0, 12, htL * 0.3, htL * 0.5, htL * 0.7, htL - 12, htL - 7.3, htL - 7.0, htL];
      const pts = ss.map(s => V.madd(htA, htAx, s)), rr = ss.map(s => rHT(s)), els = groupEls("headTube");
      sweep(M(matFor("headTube", V.lerp(htA, htB, 0.5))), pts, { rh: rr, rw: rr, seg: 40, cap0: "flat", cap1: "flat", col: stress ? ss.map(s => uCol(uAlongAxis(els, htA, htAx, s))) : null, uScale: 0.004 });
    }
    // ---------------- BB shell (T47), along z
    const bbP = at("BB"), bbw = num(g.bbShellWidth, 73), bbR = (tb.bbShell.od || 52) / 2;
    {
      const zs = [-bbw / 2, -bbw / 2 + 1.2, -bbw / 2 + 4, 0, bbw / 2 - 4, bbw / 2 - 1.2, bbw / 2];
      const rr = zs.map(z => Math.abs(z) > bbw / 2 - 1 ? bbR - 1 : bbR), els = groupEls("bbShell");
      sweep(M(matFor("bbShell", bbP)), zs.map(z => V.add(bbP, [0, 0, z])), { rh: rr, rw: rr, ref: Y, seg: 40, cap0: "flat", cap1: "flat", col: stress ? zs.map(z => uCol(uAlongAxis(els, bbP, Z, z))) : null, uScale: 0.004 });
    }
    // ---------------- dropouts (plates slotted into the stay ends) + sliders
    const AX = at("AxleR"), stayHalf = num(g.stayWidthAtDropout, 132) / 2;
    const gc = geo.caliper, rotorR = num(gc ? gc.rotor : (g.rearRotor || o.rotorR), 160), zRotR = gc ? gc.p[2] : -59;
    const slider = g.singlespeed === true || g.singlespeed === "true";
    const csDir2 = s => { const ce = at("CE" + s), d = at("D" + s); const v = [ce[0] - d[0], ce[1] - d[1]]; const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const anchors = {};
    for (const s of ["R", "L"]) {
      const sg = s === "R" ? 1 : -1, D = at("D" + s), CE = at("CE" + s), SE = at("SE" + s), cd = csDir2(s);
      const circles = [[D[0], D[1], 19], [CE[0], CE[1], 12.5], [SE[0], SE[1], 12.5]];
      if (slider) circles.push([D[0] - cd[0] * 18, D[1] - cd[1] * 18, 16]);
      const u = stress ? uCol(Math.max(...groupEls("dropout").filter(e => m.members[m.elements[e].member].label.includes(sg > 0 ? "drive side" : "non-drive")).map(e => Math.max(...elU(e))), 0)) : null;
      const zc = D[2];
      plate(M(matFor("chainstay", D)), [0, 0, zc], X, Y, Z, hullCircles(circles, 20), -3, 3, u);
      const outZ0 = sg > 0 ? zc + 3 : zc - 9, outZ1 = sg > 0 ? zc + 9 : zc - 3;
      if (slider) {
        const sc = [[D[0] - cd[0] * 8, D[1] - cd[1] * 8, 17], [D[0] + cd[0] * 26, D[1] + cd[1] * 26, 13]];
        let bosses = [];
        if (sg < 0 && gc && gc.mount === "slider") {
          const rd = V.norm([gc.p[0] - AX[0], gc.p[1] - AX[1], 0]), td = [-rd[1], rd[0], 0];
          bosses = [-1, 1].map(k => V.add(V.madd(gc.p, td, k * 37), V.mul(rd, -8)));
          for (const b of bosses) sc.push([b[0], b[1], 9]);
        }
        plate(M("blackAnod"), [0, 0, 0], X, Y, Z, hullCircles(sc, 20), outZ0, outZ1);
        const nrm = [-cd[1], cd[0]];
        for (const k of [-1, 1]) { const p = [D[0] + cd[0] * 18 + nrm[0] * k * 9, D[1] + cd[1] * 18 + nrm[1] * k * 9]; cyl(M("silver"), [p[0], p[1], sg > 0 ? outZ1 : outZ0], [p[0], p[1], sg > 0 ? outZ1 + 3 : outZ0 - 3], 4.6, 4.2, 14); }
        const tb0 = [D[0] - cd[0] * 30, D[1] - cd[1] * 30, zc + sg * 2], tb1 = [D[0] - cd[0] * 22, D[1] - cd[1] * 22, zc + sg * 2];
        cyl(M("silver"), tb0, tb1, 2.6, 2.6, 10); cyl(M("blackAnod"), V.madd(tb0, [cd[0], cd[1], 0], -4), tb0, 4, 4, 6);
        for (const b of bosses) cyl(M("blackAnod"), [b[0], b[1], outZ1], [b[0], b[1], zRotR - 6], 7, 7, 16);
      } else if (sg > 0) {
        plate(M(matFor("chainstay", D)), [0, 0, 0], X, Y, Z, hullCircles([[D[0], D[1], 13], [D[0] - 6, D[1] - 26, 9]], 16), zc + 3, zc + 8);
      }
    }
    // ---------------- weld beads ("stack of dimes")
    const ST0 = at("BB"), STax = V.norm(V.sub(at("STtop"), ST0)), stR = (tb.seatTube.od || 34.9) / 2;
    const lineDist = (p, c, a) => { const d = V.sub(p, c); return V.len(V.sub(d, V.mul(a, V.dot(d, a)))); };
    const chordHT = p => lineDist(p, htA, htAx) - rHT(V.dot(V.sub(p, htA), htAx));
    const chordST = p => lineDist(p, ST0, STax) - stR;
    const chordBB = p => Math.abs(p[2] - bbP[2]) > bbw / 2 + 2 ? 1 : Math.hypot(p[0] - bbP[0], p[1] - bbP[1]) - bbR;
    function bead(matKey, e, chord, br, col) {
      const N = 48, hits = [], pts = [];
      for (let k = 0; k < N; k++) {
        const th = k / N * 2 * Math.PI, off = V.add(V.mul(e.H, e.rh * Math.cos(th)), V.mul(e.W, e.rw * Math.sin(th)));
        const f = s => chord ? chord(V.add(V.madd(e.p, e.dir, s), off)) : (s >= 1.2 ? 1 : -1);
        let s = 0, ok = true;
        if (f(0) >= 0) { ok = false; }
        else { let lo = 0, hi = 0; for (let q = 1; q <= 160; q++) { if (f(q * 0.75) >= 0) { hi = q * 0.75; lo = hi - 0.75; break; } } if (hi === 0) ok = false; else { for (let it = 0; it < 20; it++) { const mid = (lo + hi) / 2; if (f(mid) >= 0) hi = mid; else lo = mid; } s = hi; } }
        const on = V.norm(off);
        pts.push(V.add(V.add(V.madd(e.p, e.dir, s + br * 0.25), off), V.mul(on, br * 0.3))); hits.push(ok);
      }
      const opts = { rh: br, rw: br, seg: 8, ripple: { amp: 0.14, pitch: 1.7 }, col: col ? pts.map(() => col) : null, ref: e.dir };
      if (hits.every(Boolean)) { sweep(M(matKey), pts, Object.assign({ closed: true }, opts)); return; }
      // partial (e.g. a seat stay welded to the side of the seat tube): sweep each run of hits
      let start = hits.findIndex(h => !h); if (start < 0) return;
      let run = [];
      for (let q = 1; q <= N; q++) {
        const k = (start + q) % N;
        if (hits[k]) run.push(pts[k]);
        if ((!hits[k] || q === N) && run.length) { if (run.length >= 3) sweep(M(matKey), run, Object.assign({}, opts, { cap0: "dome", cap1: "dome", col: col ? run.map(() => col) : null })); run = []; }
      }
    }
    const BR = o.welds === "smooth" ? 3.2 : 2.3;   // parts.welds: "dimes" (TIG bead, default) | "smooth" (sanded aluminium welds: a soft fillet in the paint)
    const bridgeChord = () => {
      const stays = ["Seat stay (drive side)", "Seat stay (non-drive)", "Seat stay leg (drive side)", "Seat stay leg (non-drive)"].map(l => tubeEnds[l]).filter(Boolean);
      return p => { let best = Infinity; for (const sEnd of stays) { const pts = sEnd.pts; for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], ab = V.sub(b, a), L2 = V.dot(ab, ab) || 1, t = clamp(V.dot(V.sub(p, a), ab) / L2, 0, 1); const d = V.dist(p, V.madd(a, ab, t)) - (tb.seatStay.od || 16) / 2; if (d < best) best = d; } } return best; };
    };
    for (const lab in tubeEnds) {
      const te = tubeEnds[lab], mk = weldFor(te.grp, te.start.p), mkE = weldFor(te.grp, te.end.p);
      const startChord = lab === "Top tube" ? chordST : lab === "Down tube" ? chordHT : lab === "Seat tube" ? chordBB : /^Seat stay \(/.test(lab) ? chordST
        : lab === "Seat stay wishbone (single tube)" ? chordST : /yoke/i.test(lab) ? chordBB : /^Chainstay \(/.test(lab) ? (num(g.csYokeLength, 0) > 0 ? null : chordBB) : lab === "Seat stay bridge" ? bridgeChord() : undefined;
      const endChord = lab === "Top tube" ? chordHT : lab === "Down tube" ? chordBB : lab === "Seat stay bridge" ? bridgeChord() : /^Chainstay \(|^Seat stay|yoke/i.test(lab) ? null : undefined;
      if (startChord !== undefined) bead(/^Seat stay \(/.test(lab) ? weldFor("seatStay", te.start.p) : mk, te.start, startChord, lab === "Seat stay bridge" ? 1.6 : BR, te.start.col);
      if (endChord !== undefined) bead(mkE, te.end, endChord, lab === "Seat stay bridge" ? 1.6 : BR, te.end.col);
    }
    // ---------------- seat collar, bottle bosses, head-tube logo
    const STtop = at("STtop");
    {
      const r = stR + 3.4, pr = [[stR + 0.5, -16], [r - 1, -16], [r, -14.5], [r, 0.5], [r - 1, 2], [stR - 0.5, 2]];
      lathe(M("small"), STtop, STax, pr, 36);
      const fw = V.norm(V.cross(STax, Z)), bp = V.madd(V.madd(STtop, STax, -7), fw, r + 3.5);
      blob(M("small"), bp, fw, STax, Z, 5, 7, 9, 0.35, 8);
      cyl(M("silver"), V.add(bp, [0, 0, 9]), V.add(bp, [0, 0, 12]), 4.2, 4.2, 12);
    }
    {
      const dtA = at("BB"), dtB = at("DTht"), dd = V.norm(V.sub(dtB, dtA)), Ldt = V.dist(dtA, dtB), topN = V.norm(V.cross(Z, dd));
      const dtR = (tb.downTube.h || tb.downTube.od || 44.5) / 2;
      const boss = (p, n) => { cyl(M("silver"), V.madd(p, n, -0.5), V.madd(p, n, 1.4), 5.4, 5.4, 14); cyl(M("silver"), V.madd(p, n, 1.4), V.madd(p, n, 3.8), 4.6, 4.0, 14); };
      for (const s of [0.40, 0.40]) { }
      // bottle bosses: where the design puts them (geometry.dtBoss / stBoss, bottles.js), otherwise a typical spot
      const BT = root.FrameBottles, BR = BT && (+g.dtBoss > 0 || +g.stBoss > 0) ? (() => { try { return BT.analyse(des); } catch (e) { return null; } })() : null;
      const placed = BR && BR.F ? [BR.dt, BR.st].filter(Boolean) : [];
      if (placed.length) {
        for (const b of placed) for (const q of b.bolts) { const nn = [b.nIn[0], b.nIn[1], 0], rr = b.which === "dt" ? dtR : stR; boss(V.madd([q[0], q[1], 0], nn, rr - 0.6), nn); }
      }
      if (!BR || !(+g.dtBoss > 0)) { const L1 = clamp(Ldt * 0.38, 120, Ldt - 140); boss(V.madd(V.madd(dtA, dd, L1), topN, dtR - 0.6), topN); boss(V.madd(V.madd(dtA, dd, L1 + 64), topN, dtR - 0.6), topN); }
      const fwS = V.norm(V.cross(STax, Z)), stTT = num(g.ttAtSeatTube, 415), s1 = clamp(stTT - 230, 110, 200);
      if (!BR || !(+g.stBoss > 0)) { boss(V.madd(V.madd(ST0, STax, s1), fwS, stR - 0.6), fwS); boss(V.madd(V.madd(ST0, STax, s1 + 64), fwS, stR - 0.6), fwS); }
      // bottles in their cages (part toggle "bottles"): steel/insulated bottles brushed, plastic ones white; the cage is a
      // simple titanium wire cage (foot, two side rails, a hoop) standing off the tube on the bolts
      if (!stress && show.bottles !== false) for (const b of placed) {
        const u = [b.u[0], b.u[1], 0], n = [b.nIn[0], b.nIn[1], 0], base = [b.base[0], b.base[1], 0], B = b.B, R = B.d / 2, r = (B.capD || B.d) / 2, hb = B.h - (B.capH || 0);
        if (!MAT.bottleSteel) MAT.bottleSteel = { base: [0.72, 0.72, 0.74], metal: 1, rough: 0.3, aniso: 0.7, brushed: 1 };
        if (!MAT.bottlePlastic) MAT.bottlePlastic = { base: [0.86, 0.86, 0.85], rough: 0.55, sheen: 0.3 };
        const body = B.rigid ? "bottleSteel" : "bottlePlastic", sh = Math.min(18, hb * 0.1);
        lathe(M(body), base, u, [[0, 0], [R - 4, 0], [R, 4], [R, hb - sh], [r + 3, hb], [0, hb]], 40);
        lathe(M(B.rigid ? "blackGloss" : "blackMatte"), V.madd(base, u, hb), u, [[0, 0], [r, 0], [r, (B.capH || 20) * 0.7], [r * 0.8, B.capH || 20], [0, B.capH || 20]], 32);
        const wr = 2.6, Rh = R + wr, top = Math.min(hb * 0.62, B.h * 0.55);   // cage wire radius, hoop height up the bottle
        const Pt = (sAx, nn, zz) => V.add(V.add(V.madd(base, u, sAx), V.mul(n, nn)), [0, 0, zz]);
        const hoop = a => Pt(top, Rh * Math.cos(a), Rh * Math.sin(a));       // a from the front of the bottle, round to the back
        const A0 = 130 * Math.PI / 180;
        for (const sg of [-1, 1]) {
          // foot under the bottle, up the back along the tube, out to the hoop
          const rail = [Pt(-wr, R * 0.3, 0), Pt(-wr, -R * 0.2, sg * R * 0.45), Pt(-wr, -R - 1, sg * R * 0.6), Pt(top * 0.4, -R - 2, sg * R * 0.62), hoop(sg * A0)];
          for (let i = 0; i + 1 < rail.length; i++) cyl(M("ti"), rail[i], rail[i + 1], wr, wr, 10);
        }
        for (let i = 0; i < 16; i++) cyl(M("ti"), hoop(-A0 + 2 * A0 * i / 16), hoop(-A0 + 2 * A0 * (i + 1) / 16), wr, wr, 8);
        for (const q of b.bolts) cyl(M("ti"), V.madd([q[0], q[1], 0], n, (b.which === "dt" ? dtR : stR) + 1), V.madd([q[0], q[1], 0], n, (b.which === "dt" ? dtR : stR) + b.C.off - 1), 5, 5, 10);
      }
    }
    const BD = !stress && o.headBadge && root.FRAME_BADGES ? root.FRAME_BADGES[o.headBadge] : null;
    if (BD && BD.img && !(BD.img.complete && BD.img.naturalWidth)) BD.img.addEventListener("load", () => { S.key = ""; try { update(); } catch (e) {} }, { once: true });
    if (BD && BD.img && BD.img.complete && BD.img.naturalWidth) {
      // engraved head badge: the artwork is laser-cut through the paint to the titanium (or frosted into raw Ti)
      const cv = document.createElement("canvas"); cv.width = BD.img.naturalWidth; cv.height = BD.img.naturalHeight; cv.getContext("2d").drawImage(BD.img, 0, 0);
      const onPaint = painted("headTube");
      const Mk = texMat("badge_" + o.headBadge + (onPaint ? "p" : "r"), cv, onPaint ? { base: [0.6, 0.575, 0.54], metal: 1, rough: 0.3, aniso: 0.6, brushed: 1, decal: true } : { base: [0.34, 0.33, 0.315], metal: 1, rough: 0.6, decal: true });
      const fwd = V.norm(V.sub(geo.nF, V.mul(htAx, V.dot(geo.nF, htAx)))), side = V.cross(htAx, fwd);
      const span = clamp(+o.headBadgeSpan || 1.1, 0.4, 1.4), hgt = 2 * span * rTop / (BD.aspect || 1.5), sm = htL * 0.5 + (+o.headBadgeShift || 0);
      const s0 = Math.max(htL * 0.06, sm - hgt / 2), s1 = Math.min(htL * 0.94, sm + hgt / 2);
      Mk.grid(16, 24, (i, j) => {
        const sS = lerp(s0, s1, i / 16), ph = lerp(-span, span, j / 24), dir = V.add(V.mul(fwd, Math.cos(ph)), V.mul(side, Math.sin(ph)));
        return { p: V.add(V.madd(htA, htAx, sS), V.mul(dir, rHT(sS) + 0.12)), n: dir, uv: [(span - ph) / (2 * span), 1 - i / 16], t: htAx };
      });
    } else if (!stress && String(o.headLogo == null ? "" : o.headLogo).trim()) {
      const cv = texText(String(o.headLogo == null ? "" : o.headLogo).trim(), "italic 700 200px 'Barlow Semi Condensed', 'Arial Narrow', Arial, sans-serif", "#ffffff", null, 1024, 256);
      const Mk = texMat("logo", cv, { base: hex2lin(o.logoColor || "#f5c400"), decal: true, rough: 0.5, clear: 0.2 });
      const fwd = V.norm(V.sub(geo.nF, V.mul(htAx, V.dot(geo.nF, htAx)))), side = V.cross(htAx, fwd);
      const s0 = htL * 0.16, s1 = htL * 0.84, span = Math.min(0.62, 30 / rTop);
      Mk.grid(16, 16, (i, j) => {
        const s = lerp(s0, s1, i / 16), ph = lerp(-span, span, j / 16), dir = V.add(V.mul(fwd, Math.cos(ph)), V.mul(side, Math.sin(ph)));
        return { p: V.add(V.madd(htA, htAx, s), V.mul(dir, rHT(s) + 0.15)), n: dir, uv: [i / 16, (span - ph) / (2 * span) ], t: htAx };
      });
    }
    // down-tube logo (parts.dtLogo, e.g. "CANYON"): big letters along both sides of the down tube, reading from the head tube
    // end towards the BB on each side (as brands do), letter tops towards the top of the tube. parts.dtLogoColor = ink colour.
    if (!stress && String(o.dtLogo || "").trim()) {
      const txt = String(o.dtLogo).trim().toUpperCase(), dA = at("BB"), dB = at("DTht"), dd2 = V.norm(V.sub(dB, dA)), L = V.dist(dA, dB), topN2 = V.norm(V.cross(Z, dd2));
      const T = tb.downTube || {}, half = t => (T.htW ? lerp(T.bbW || T.htW, T.htW, t) : T.w || T.od || 44.5) / 2, halfH = t => (T.htH ? lerp(T.bbH || T.htH, T.htH, t) : T.h || T.od || 44.5) / 2;
      const cv = document.createElement("canvas"); cv.width = 2048; cv.height = 256; const x = cv.getContext("2d");
      x.fillStyle = "#fff"; x.textBaseline = "middle"; let fs = 230; x.font = `800 ${fs}px 'Arial Black', Arial, sans-serif`;
      const gap = 0.22, wOf = () => [...txt].reduce((a, ch) => a + x.measureText(ch).width, 0) + gap * fs * (txt.length - 1);
      while (wOf() > cv.width * 0.97 && fs > 40) { fs -= 6; x.font = `800 ${fs}px 'Arial Black', Arial, sans-serif`; }
      let px = (cv.width - wOf()) / 2; for (const ch of txt) { x.fillText(ch, px, cv.height / 2 + 8); px += x.measureText(ch).width + gap * fs; }
      const Mk = texMat("dtLogo_" + txt, cv, { base: hex2lin(o.dtLogoColor || "#1b2333"), decal: true, rough: 0.5, clear: 0.15 });
      const len = clamp(L * 0.6, 160, 420), sHT = L - clamp(L * 0.13, 60, 110), s0 = sHT - len;            // along the tube from the BB
      for (const side of [-1, 1]) {
        Mk.grid(24, 10, (i, j) => {
          const sAlong = lerp(sHT, s0, i / 24), t = sAlong / L, ph = lerp(-0.8, 0.8, j / 10);           // i = along the text (head-tube end first)
          const dir = V.add(V.mul([0, 0, side], Math.cos(ph)), V.mul(topN2, Math.sin(ph)));
          const r = 1 / Math.hypot(Math.cos(ph) / (half(t) + 0.2), Math.sin(ph) / (halfH(t) + 0.2));
          const n = V.norm(V.add(V.mul([0, 0, side], Math.cos(ph) / half(t)), V.mul(topN2, Math.sin(ph) / halfH(t))));
          // u/v picked so the letters are upright and unmirrored on both sides, starting at the head-tube end on the left side
          return { p: V.madd(V.madd(dA, dd2, sAlong), dir, r), n, uv: side > 0 ? [1 - i / 24, j / 10] : [i / 24, j / 10], t: V.mul(dd2, -1) };
        });
      }
    }

    // ---------------- fork (suspension: crown, stanchions, seals, lowers with arch, dropouts, axle, decals)
    const up = V.mul(geo.uHT, -1), fw = geo.nF;
    const crownP = P.Crown, axF = P.AxleF, a2c = V.dot(V.sub(crownP, axF), up);
    const lh = forkCat.legHalf || 70, rS = (forkCat.stanchion || 34) / 2, rL = (forkCat.lower || 41) / 2;
    const legAt = (s, h) => V.add(V.madd([axF[0], axF[1], 0], up, h), [0, 0, s * lh]);
    const steerAt = h => V.madd(crownP, up, h - a2c);
    // rigid fork style: "gravel" (road / gravel carbon fork: 12 × 100 thru-axle, slim tapered blades, flat-mount brake) or
    // "mtb" (suspension-corrected rigid MTB fork: 15 × 110, post mount). Old parts without a style: wide legs = mtb.
    const rigidStyle = susp ? "" : (forkCat.style || (lh >= 60 ? "mtb" : "gravel")), tiFork = rigidStyle === "ti", gravelFork = rigidStyle === "gravel" || tiFork;
    const hubKF = gravelFork || (susp && lh * 2 <= 125) ? 50 / 55 : 1;   // front hub: 100 mm (road / gravel, gravel suspension forks) instead of 110 Boost
    const zRotF = -45 * hubKF, rotorF = num(o.rotorF, 160);
    // steerer axis relative to the leg axis (the crown carries the offset): sideways-free, in the fw direction
    const offF = V.dot(V.sub(crownP, axF), fw);
    const isFox = (forkCat.arch || "front") === "front";
    // fork-only materials: Kashima (bronze-gold, a touch darker / browner than gold paint), wet-look "candy" lowers (no flake)
    MAT.forkKashima = MAT.forkKashima || { base: [0.36, 0.235, 0.095], metal: 1, rough: 0.2, aniso: 0.3 };
    const stanKey = { kashima: "forkKashima", black: "stanBlack", silver: "chrome" }[forkCat.stanchionFinish] || "forkKashima";
    const lowCol = /^#[0-9a-f]{6}$/i.test(forkCat.lowerColor || "") ? forkCat.lowerColor : "#111214";
    const lowKey = forkCat.lowerFinish === "candy" ? ("forkCandy" + lowCol) : dynMat(lowCol, forkCat.lowerFinish || "gloss");
    if (forkCat.lowerFinish === "candy" && !MAT[lowKey]) MAT[lowKey] = { base: hex2lin(lowCol), metal: 0.9, rough: 0.17, clear: 0.7 };
    const lowDark = "forkPocket" + lowCol;
    if (!MAT[lowDark]) MAT[lowDark] = { base: hex2lin(lowCol).map(v => v * 0.22), metal: 0.5, rough: 0.55 };
    const crownKey = dynMat(forkCat.crownColor || "#111214", forkCat.crownFinish || "gloss");
    const axleKey = dynMat(forkCat.axleColor || "#141414", "anodised");
    if (!MAT.forkRebound) MAT.forkRebound = { base: hex2lin("#b3141c"), metal: 0.75, rough: 0.3 };
    let crownBot = a2c - 33;
    if (show.fork) {
      const crownTop = a2c - 1;
      if (susp) {
        const seal = crownBot - (forkCat.travel + 12);       // top of the lower legs: travel + bottom-out bumper / wiper stack below the crown
        const sc = forkCat.stepCast === "yes";                // Step-Cast: slim lowers, dropouts stepped outward round the Boost hub
        const aSide = isFox ? 1 : -1;                         // arch in front of the legs (Fox) or behind (RockShox)
        const stepOut = h => sc ? 5.5 * (1 - smooth(10, 64, h)) : 0;
        const lp = (s, h, dz, df) => V.madd(V.add(legAt(s, h), [0, 0, s * (dz || 0)]), fw, df || 0);
        // lower-leg radius from the dropout up: slim casting, swelling to the bushing / seal head
        const KN = [[-30, 0.6], [40, sc ? 0.65 : 0.69], [140, sc ? 0.71 : 0.75], [seal - 125, 0.83], [seal - 65, 0.92], [seal - 38, 1.0], [seal - 24, 1.06], [seal - 3, 1.06]];
        for (let k = 1; k < KN.length; k++) if (KN[k][0] <= KN[k - 1][0] + 4) KN[k][0] = KN[k - 1][0] + 4;
        const rLeg = h => { let k = 1; while (k < KN.length - 1 && KN[k][0] < h) k++; const a = KN[k - 1], b = KN[k]; return rL * lerp(a[1], b[1], clamp((h - a[0]) / (b[0] - a[0]), 0, 1)); };
        // stanchions (Kashima), top caps: air valve left, GRIP SL 3-position lever right
        for (const s of [-1, 1]) {
          cyl(M(stanKey), legAt(s, seal - 12), legAt(s, crownTop + 1), rS, rS, 56, { caps: false });
          lathe(M("blackAnod"), legAt(s, crownTop), up, [[0, 0], [rS - 0.6, 0], [rS - 0.6, 0], [rS - 0.6, 1.5], [rS - 0.2, 2], [rS - 0.2, 4.6], [rS - 1.6, 6], [rS - 1.6, 6], [10, 6.4], [0, 6.4]], 40);
          for (let k = 0; k < 18; k++) { const a = k / 18 * 2 * Math.PI, d = V.norm(V.add(V.mul(fw, Math.cos(a)), [0, 0, Math.sin(a)])); cyl(M("blackMatte"), V.madd(legAt(s, crownTop + 2.2), d, rS - 0.35), V.madd(legAt(s, crownTop + 4.4), d, rS - 0.35), 0.55, 0.55, 4); }
        }
        { // air valve cap (left)
          const pc = legAt(-1, crownTop + 6.4);
          lathe(M("blackGloss"), pc, up, [[0, 0], [5.6, 0], [5.6, 0], [5.6, 7], [4.6, 8.6], [0, 9]], 24);
        }
        { // compression lever (right): hub, short alloy lever pointing forward-out
          const pc = legAt(1, crownTop + 6.4), dL = V.norm(V.add(V.mul(fw, Math.cos(0.55)), [0, 0, Math.sin(0.55)]));
          lathe(M("blackAnod"), pc, up, [[0, 0], [9.5, 0], [9.5, 0], [9.5, 3.4], [8.4, 4.6], [0, 4.6]], 28);
          blob(M("blackAnod"), V.madd(V.madd(pc, dL, 12), up, 3.4), dL, V.norm(V.cross(up, dL)), up, 15.5, 5.2, 2.6, 0.32, 10);
          blob(M("blackAnod"), V.madd(V.madd(pc, dL, 25), up, 4.2), dL, V.norm(V.cross(up, dL)), up, 4.4, 6.2, 3.4, 0.5, 10);
        }
        // lowers: one swept casting per leg (dropout step at the bottom, bushing swell, seal head), black SKF wipers on top
        for (const s of [-1, 1]) {
          const hs = []; for (let h = -2; h < seal - 8; h += h < 80 ? 6 : 14) hs.push(h); hs.push(seal - 8, seal - 3.2, seal - 2);
          const rW = rLeg(seal - 3) - 1.2, pts = hs.map(h => lp(s, h, stepOut(h))), rr = hs.map((h, k) => k === hs.length - 1 ? rW : rLeg(h) + (h > seal - 9 ? 0.45 : 0));
          sweep(M(lowKey), pts, { rh: rr, rw: rr, ref: fw, seg: 44, exp: 2 });
          lathe(M("rubber"), legAt(s, seal - 2), up, [[rW, 0], [rW + 0.6, 0.4], [rW + 0.6, 2.6], [rW, 3], [rW, 3], [Math.max(rS + 3, rW - 1.4), 5.2], [rS + 2.4, 7.2], [rS + 0.9, 8.8], [rS + 0.05, 9.8], [rS + 0.05, 9.8]], 48);
          // dropout lug: flattened teardrop round the axle, closed below it, flat outer face for the axle head
          const dz = stepOut(0);
          blob(M(lowKey), lp(s, 2, dz), fw, up, Z, 15.5, 21, rLeg(0) * 0.82, 0.55, 14);
          lathe(M(lowKey), lp(s, 0, dz + rLeg(0) * 0.55), [0, 0, s], [[0, 0], [13.2, 0], [13.2, 0], [13.2, 3.2], [12.2, 4.2], [0, 4.2]], 36);
          cyl(M(lowKey), [axF[0], axF[1], s * 55], lp(s, 0, dz - 4), 11, 12, 28);   // inner land the hub end cap seats against
          // bleed button at the back of the seal head
          cyl(M("blackMatte"), lp(s, seal - 19, 0, -(rL - 2)), lp(s, seal - 19, 0, -(rL + 1.6)), 3.2, 3.0, 14);
          // foot nut (left, air shaft) / red rebound knob (right) under the leg
          if (s < 0) lathe(M("blackAnod"), legAt(s, 0), up, [[0, -20.5], [5.5, -20.5], [5.5, -20.5], [5.5, -15], [0, -15]], 6);
          else lathe(M(isFox ? "forkRebound" : "blackAnod"), legAt(s, 0), up, [[0, -26], [5.2, -26], [6.3, -25], [6.3, -18.5], [5.4, -17.5], [0, -17.5]], 14);
        }
        // arch: a broad bridge in front of the lowers (Fox) / behind them (RockShox): flat-ish top running from seal head to seal
        // head, arched underside over the tyre, long fillets blending down the legs, hollow back. Lofted section by section across.
        {
          const tyreR = (root.FrameFEA && root.FrameFEA.frontTyreR ? root.FrameFEA.frontTyreR(g) : g.tireDiameter / 2) + 3, fC = 0.9 * rL;
          // section: a flat-faced oval (superellipse), ~27 mm tall × ~15 mm deep at the top, much taller in the fillets
          const Bc = Math.max(Math.sqrt(Math.max(0, tyreR * tyreR - fC * fC)) + 4, seal + 4), Tc = Bc + 40, Bl = seal - 105, Tl = seal - 1;
          const sec = u => { const a0 = Math.abs(u), a = Math.min(1, a0);   // |u| > 1: the fillet dies out on the front of the leg
            return { T: Tc - (Tc - Tl) * Math.pow(a, 1.6), B: Bl + (Bc - Bl) * Math.sqrt(Math.max(0, 1 - Math.pow(a, 2.0))),
              f: aSide * lerp(rL * 0.75 + 4, 9, Math.pow(a, 1.5)), d: lerp(10, 13, Math.pow(a, 1.3)) * (1 - smooth(1, 1.22, a0)) + 0.01, e: 4.2 }; };
          const loft = (Mk, n, seg, u0, u1, adj) => {
            const P = (u, th) => { const q = adj(sec(u)), e = 2 / (q.e || 2.7), c = Math.cos(th), sn = Math.sin(th);
              const cen = V.madd(V.madd([axF[0], axF[1], u * lh], up, (q.T + q.B) / 2), fw, q.f);
              return { p: V.madd(V.madd(cen, up, G.spow(c, e) * (q.T - q.B) / 2), fw, G.spow(sn, e) * q.d), cen }; };
            Mk.grid(n, seg, (i, j) => { const u = lerp(u0, u1, i / n), th = j / seg * 2 * Math.PI, du = (u1 - u0) / n * 0.5, dt = Math.PI / seg;
              const q = P(u, th), tu = V.sub(P(u + du, th).p, P(u - du, th).p), tt = V.sub(P(u, th + dt).p, P(u, th - dt).p);
              let nn = V.norm(V.cross(tu, tt)); if (V.dot(nn, V.sub(q.p, q.cen)) < 0) nn = V.mul(nn, -1);
              return { p: q.p, n: nn, uv: [u, j / seg], t: Z }; });
          };
          loft(M(lowKey), 64, 48, -1.22, 1.22, q => q);
          loft(M(lowDark), 36, 24, -0.8, 0.8, q => { const m = (q.T + q.B) / 2, h = (q.T - q.B) / 2 * 0.6; return { T: m + h, B: m - h, f: q.f - aSide * q.d * 0.5, d: q.d * 0.55, e: 3.5 }; });
        }
        // brake post mount (160 mm direct, 74 mm bolt spacing) cast onto the back of the left lower
        {
          const rdF0 = V.norm(V.add(V.mul(fw, -0.6), V.mul(up, 0.8))), tgF = V.norm(V.cross(Z, rdF0)), rFace = rotorF / 2 - 13;
          const fu = v => [V.dot(v, fw), V.dot(v, up)];
          const bz = zRotF - 24, ax0 = [axF[0], axF[1], 0];
          const bs = [-1, 1].map(k => fu(V.add(V.mul(rdF0, rFace - 6), V.mul(tgF, k * 37))));
          const outline = hullCircles([[-6, 24, 6], [-8, 58, 6], [bs[0][0], bs[0][1], 7], [bs[1][0], bs[1][1], 7]], 18);
          plate(M(lowKey), ax0, fw, up, Z, outline, bz - 3.5, bz + 3.5);
          for (const k of [-1, 1]) {
            const b = V.add(V.madd(ax0, tgF, k * 37), [0, 0, bz]);
            cyl(M(lowKey), V.madd(b, rdF0, rFace - 12), V.madd(b, rdF0, rFace), 8.6, 8.2, 24);
            cyl(M("silver"), V.madd(b, rdF0, rFace - 0.2), V.madd(b, rdF0, rFace + 0.4), 8.0, 8.0, 24);
            cyl(M("blackMatte"), V.madd(b, rdF0, rFace), V.madd(b, rdF0, rFace + 0.5), 3.2, 3.2, 12);
          }
          // hose guide on the back of the left lower
          blob(M("blackMatte"), lp(-1, a2c - 220, 0, -(rLeg(a2c - 220) + 3.5)), fw, up, Z, 4.5, 9, 6, 0.4, 8);
        }
        // crown: forged bridge from leg to leg through the steerer boss (arms curve back to the steerer), collars, tapered steerer
        const cOrg = V.madd([axF[0], axF[1], 0], up, crownBot), cH = crownTop - crownBot;
        {
          const cpts = [], crh = [], crw = [];
          for (let k = 0; k <= 28; k++) {
            const t = -1 + 2 * k / 28, a = Math.abs(t), f = Math.pow(1 - a, 1.5);
            const vh = lerp(cH * 0.5 - 0.8, cH * 0.3, smooth(0.95, 0.25, a));   // full depth at the collars, underside arching up to the steerer
            cpts.push(V.add(V.madd(V.madd(cOrg, up, cH - 0.6 - vh), fw, offF * (1 - a * a) * 0.94), [0, 0, t * lh]));
            crh.push(lerp(rS + 3.5, 23, f)); crw.push(vh);
          }
          sweep(M(crownKey), cpts, { rh: crh, rw: crw, ref: up, seg: 32, exp: 3.4, cap0: "flat", cap1: "flat" });
          for (const s2 of [-1, 1]) {
            lathe(M(crownKey), legAt(s2, crownBot), up, [[rS, -0.5], [rS + 5.5, -0.5], [rS + 7, 1.5], [rS + 7, cH - 4.5], [rS + 5.6, cH - 0.4], [rS + 2, cH], [rS, cH]], 48);
          }
          const sc0 = V.madd(cOrg, fw, offF);
          lathe(M(crownKey), sc0, up, [[0, -1], [21, -1], [24.5, 2.5], [24.5, cH - 3], [22.5, cH], [20.4, cH], [20.4, cH + 3.2], [19.3, cH + 3.8], [0, cH + 3.8]], 48);
          lathe(M("blackAnod"), sc0, up, [[0, cH + 3.8], [19.05, cH + 3.8], [19.05, cH + 3.8], [19.05, cH + 18], [14.3, cH + 70], [0, cH + 70]], 36);
        }
        // decals: big brand word along the outer face of each lower (reads top-to-bottom from that side), model text above it
        const outline = /^#[0-9a-f]{6}$/i.test(forkCat.decalOutline || "") ? forkCat.decalOutline : null;
        const legDecal = (M, h0, h1, span, ph0) => {
          for (const s of [-1, 1]) M.grid(14, 10, (i, j) => {
            const h = lerp(h1, h0, i / 14), ph = ph0 + (s > 0 ? (0.5 - j / 10) : (j / 10 - 0.5)) * span;
            const dd = V.norm(V.add(V.mul(fw, Math.cos(ph)), [0, 0, s * Math.sin(ph)]));
            return { p: V.madd(lp(s, h, stepOut(h)), dd, rLeg(h) + 0.3), n: dd, uv: [i / 14, j / 10], t: up };
          });
        };
        const decalCv = (txt, w, h, font, col) => {
          const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
          x.font = font; x.textBaseline = "middle"; x.textAlign = "center";
          const tw = x.measureText(txt).width, sx = Math.min(1.6, (w * 0.96) / Math.max(1, tw));
          x.translate(w / 2, h / 2 + h * 0.04); x.scale(sx, 1);
          if (outline) { x.lineWidth = h * 0.07; x.strokeStyle = outline; x.lineJoin = "round"; x.strokeText(txt, 0, 0); }
          x.fillStyle = col; x.fillText(txt, 0, 0); return c;
        };
        const dCol = forkCat.decalColor || "#ffffff", dMat = { base: [1, 1, 1], decal: true, rough: 0.2, clear: 0.8 };
        const hB0 = 72, hB1 = Math.min(seal - 120, hB0 + 30 * Math.max(3, (forkCat.brandText || "").length));
        if (forkCat.decalLayout === "split") {
          // Fox 34 SL / Podium style: big upright numerals on the front of each lower ("3" left, "4" right), the brand word
          // low on the left leg reading bottom-to-top, small model text on the right leg. Colours drawn in white on the canvas
          // and set on the material (canvas textures are read as linear).
          const ink = hex2lin(dCol), edge = outline ? hex2lin(outline) : null;
          // one decal patch on leg s: heights h0..h1, centred at angle ph0 (0 = straight ahead, + = towards the outside),
          // span (rad) round the leg; mode "up" = upright glyphs, "rise" = text running bottom-to-top
          const patch = (Mk, s, h0, h1, ph0, span, mode, lift) => Mk.grid(16, 12, (i, j) => {
            const h = lerp(h0, h1, i / 16), ph = ph0 + (j / 12 - 0.5) * span;
            const dd = V.norm(V.add(V.mul(fw, Math.cos(ph)), [0, 0, s * Math.sin(ph)]));
            // canvas "right" as seen from outside = the direction of increasing j when s * sin grows towards the viewer's right
            const tj = V.sub(V.norm(V.add(V.mul(fw, Math.cos(ph + 0.01)), [0, 0, s * Math.sin(ph + 0.01)])), dd), rightV = V.cross(up, dd);
            const jr = V.dot(tj, rightV) > 0 ? j / 12 : 1 - j / 12;   // 0 … 1 left → right as seen from outside
            return { p: V.madd(lp(s, h, stepOut(h)), dd, rLeg(h) + (lift || 0.3)), n: dd, uv: mode === "up" ? [jr, 1 - i / 16] : [i / 16, jr], t: up };
          });
          const glyph = (txt, w, h, font, stroke) => {
            const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
            x.font = font; x.textBaseline = "middle"; x.textAlign = "center";
            const tw = x.measureText(txt).width, sx = Math.min(1.4, w * 0.92 / Math.max(1, tw));
            x.translate(w / 2, h / 2 + h * 0.04); x.scale(sx, 1);
            if (stroke) { x.lineWidth = h * stroke; x.lineJoin = "round"; x.strokeStyle = "#fff"; x.strokeText(txt, 0, 0); } else { x.fillStyle = "#fff"; x.fillText(txt, 0, 0); }
            return c;
          };
          const legNum = String(forkCat.legNumber || "");
          const ink2 = Object.assign({}, dMat, { base: ink, rough: 0.32, clear: 0.7 });
          // brand word: thin edge in the outline colour under a dark fill (two decal layers, the fill drawn later = on top)
          if (forkCat.brandText) {
            const bf = "italic 900 220px 'Arial Black', Arial, sans-serif", L = hB1 - hB0 + 70;
            if (edge) patch(texMat("forkDecalEdge", glyph(forkCat.brandText, 1024, 300, bf, 0.1), Object.assign({}, dMat, { base: edge, metal: 0.8, rough: 0.25 })), 1, hB0 - 12, hB0 - 12 + L, 0.5, 2.2, "rise");
            patch(texMat("forkDecal", glyph(forkCat.brandText, 1024, 300, bf), ink2), 1, hB0 - 12, hB0 - 12 + L, 0.5, 2.2, "rise", 0.5);
          }
          // numerals: as tall as ~2.6 leg diameters, upper half of the lowers
          const nH = rL * 6, nTop = seal - 52, nf = "800 300px 'Arial Black', Arial, sans-serif";
          if (legNum) {
            const parts = [legNum.slice(0, 1), legNum.slice(1)];
            [1, -1].forEach((s, k) => { if (!parts[k]) return;   // seen from the front: first character on the rider's right leg
              const key = "forkNum" + k;
              if (edge) patch(texMat(key + "e", glyph(parts[k], 256, 360, nf, 0.07), Object.assign({}, dMat, { base: edge, metal: 0.8, rough: 0.25 })), s, nTop - nH, nTop, 0.45, 1.75, "up");
              patch(texMat(key, glyph(parts[k], 256, 360, nf), ink2), s, nTop - nH, nTop, 0.45, 1.75, "up", 0.5);
            });
          }
          if (forkCat.modelText) {
            const h0 = Math.max(70, nTop - nH - 18 - 8.5 * Math.max(5, forkCat.modelText.length)), h1 = nTop - nH - 18;
            if (h1 > h0 + 20) patch(texMat("forkDecal2", glyph(forkCat.modelText, 1024, 150, "italic 800 120px Arial, sans-serif"), ink2), -1, h0, h1, 0.6, 0.75, "rise");
          }
        } else {
          if (forkCat.brandText) legDecal(texMat("forkDecal", decalCv(forkCat.brandText, 1024, 256, "italic 900 200px 'Arial Black', Arial, sans-serif", dCol), Object.assign({}, dMat)), hB0, hB1, 1.55, 1.05);
          if (forkCat.modelText) {
            const h0 = hB1 + 14, h1 = Math.min(seal - 70, h0 + 9.5 * Math.max(4, forkCat.modelText.length));
            if (h1 > h0 + 20) legDecal(texMat("forkDecal2", decalCv(forkCat.modelText, 1024, 160, "800 120px Arial, sans-serif", dCol), Object.assign({}, dMat)), h0, h1, 0.95, 1.05);
          }
        }
        // 15 × 110 thru-axle (Kabolt: flush bolt head on the left, flush end on the right)
        const zo = lh + stepOut(0) + rLeg(0) * 0.55 + 4.2;
        cyl(M("steel"), [axF[0], axF[1], -zo], [axF[0], axF[1], zo], 7.5, 7.5, 16);
        lathe(M(axleKey), [axF[0], axF[1], -zo], [0, 0, -1], [[0, 0], [12.4, 0], [12.4, 0], [12.4, 2], [11.2, 3.4], [0, 3.4]], 36);
        disc(M("blackMatte"), [axF[0], axF[1], -zo - 3.45], Z, 3.6, 0.2, 6);
        lathe(M(axleKey), [axF[0], axF[1], zo], [0, 0, 1], [[0, 0], [9, 0], [9, 0], [9, 0.8], [8, 1.4], [0, 1.4]], 28);
      } else if (gravelFork) {
        // ---- road / gravel carbon fork: one continuous carbon form. Seen from the front it is an upside-down U: a low crown
        // under the lower headset cup that rolls over round shoulders into two slim blades; the blades splay out a little
        // (tyre room at the top, 100 mm hub at the bottom). Seen from the side the blades run nearly straight from the crown
        // (on the steering axis) forward to the dropouts (the offset), deep fore-aft at the top and tapering to the tips.
        // Titanium fork: brushed raw Ti (or painted), round blades. Sizes, tyre room, crown shoulders and the blade line are part fields.
        const rk = tiFork ? (forkCat.tiFinish === "paint" ? dynMat(forkCat.lowerColor || "#121214", forkCat.lowerFinish || "gloss") : "ti")
          : dynMat(forkCat.lowerColor || "#121214", forkCat.lowerFinish || "gloss", forkCat.weave === "twill" ? "carbon" : "carbonUD");
        const FR = (s3, h, f) => V.add(V.madd(V.madd([axF[0], axF[1], 0], up, h), fw, f), [0, 0, s3]);
        const twF = num(o.tyreWidth, 45), tyreRf = root.FrameFEA && root.FrameFEA.frontTyreR ? root.FrameFEA.frontTyreR(g) : g.tireDiameter / 2;
        const rhC = clamp((a2c - 1 - (tyreRf + 12)) / 2, 8, 12.5), hC = a2c - 1 - rhC;   // crown: half height, centre line (clears the tyre)
        const own = tiFork ? [28, 28, 19, 19] : [28, 40, 15, 22];                       // shape's own blade width / depth at the crown, at the tip
        const sz = (k, i) => +forkCat[k] > 0 ? +forkCat[k] : own[i];
        const bwT = sz("bladeWidth", 0) / 2, bdT = sz("bladeDepth", 1) / 2, bwB = sz("tipWidth", 2) / 2, bdB = sz("tipDepth", 3) / 2;   // half sizes
        const room = +forkCat.clearance > 0 ? Math.max(+forkCat.clearance / 2 + 6, twF / 2 + 3) : twF / 2 + 9;   // tyre centre to the blade's inner face
        const lhT = Math.max(room + bwT, 38), lhB = lh;                                  // blade centres: at the shoulder, at the dropout
        const Rc = Math.min(forkCat.shoulders === "square" ? 11 : 30, lhT - 6), hS = hC - Rc;   // shoulder radius (front view); blade top height
        const curve = forkCat.bladeCurve === "straight" || (forkCat.bladeCurve !== "curved" && tiFork) ? 1 : forkCat.bladeCurve === "curved" ? 0.55 : 1.12;
        const bf = h => offF * Math.pow(clamp(h / hC, 0, 1), curve);                     // fore-aft position of the blade (side view)
        crownBot = hC - rhC;
        const tB = h => clamp((h + 4) / (hS + 4), 0, 1);
        const bS = h => lerp(lhB, lhT, smooth(0, 1, tB(h)) * 0.65 + tB(h) * 0.35), bD = h => lerp(bdB, bdT, Math.pow(tB(h), 0.85)), bW = h => lerp(bwB, bwT, Math.pow(tB(h), 0.85));
        const half = [];                                                                 // [s, h, f, rh (side-to-side / vertical), rw (fore-aft)]
        const nB = 22;
        for (let k = 0; k <= nB; k++) {                                                  // blade: tip → shoulder
          const h = lerp(-4, hS, k / nB);
          half.push([bS(h), h, bf(h), bW(h), bD(h)]);
        }
        const nA = 14;
        for (let k = 1; k <= nA; k++) {                                                  // shoulder arc → over the top of the crown
          const th = k / nA * Math.PI / 2, s3 = lhT - Rc + Rc * Math.cos(th), h = hS + Rc * Math.sin(th), q = k / nA;
          half.push([s3, h, lerp(bf(hS), offF, Math.sin(th)), lerp(bwT, rhC, q * q), lerp(bdT, 23, q)]);
        }
        const nTop = 5, sEnd = lhT - Rc;
        for (let k = 1; k <= nTop; k++) { const s3 = sEnd * (1 - k / nTop); half.push([s3, hC, offF, rhC, 23 + 1.5 * (k / nTop)]); }
        const path = half.map(q => [-q[0], q[1], q[2], q[3], q[4]]).concat(half.slice(0, -1).reverse());   // left tip → crown → right tip
        sweep(M(rk), path.map(q => FR(q[0], q[1], q[2])), { rh: path.map(q => q[3]), rw: path.map(q => q[4]), ref: fw, seg: 30, exp: tiFork ? 2 : 2.25, cap0: "dome", cap1: "dome", uScale: 0.004 });
        // crown race seat: a round boss under the lower headset cup that flows down into the crown
        const sc0 = FR(0, 0, offF), rSeat = rBot - 0.8;
        lathe(M(rk), sc0, up, [[0, hC - rhC * 0.4], [17, hC - rhC * 0.4], [21.5, hC + rhC * 0.35], [rSeat - 1.2, a2c - 4.5], [rSeat, a2c - 2.6], [rSeat - 0.6, a2c - 1], [0, a2c - 1]], 48);
        if (tiFork) {
          // welded Ti: a bead where the steerer meets the crown, and where each blade meets the crown
          lathe(M("tiWeld"), sc0, up, [[rSeat - 2.4, hC + rhC * 0.35 - 1.2], [rSeat + 0.8, hC + rhC * 0.35], [rSeat + 1.3, hC + rhC * 0.35 + 1.6], [rSeat - 0.4, hC + rhC * 0.35 + 3.2]], 40);
          const seg = forkCat.tiCrown === "segmented", hb0 = hS - 18;
          if (seg) {
            // segmented crown: a machined block across the top of both blades (rounded-rectangle section), blades welded under it
            const hb1 = hC + rhC * 0.35 - 1, hm = (hb0 + hb1) / 2, hh = (hb1 - hb0) / 2, sx = lhT + bwT + 3, fm = (bf(hb0) + offF) / 2, dd = Math.max(bdT, 21) + 2.5;
            const xs = [-1, -0.6, 0, 0.6, 1].map(t => t * sx);
            sweep(M(rk), xs.map(x => FR(x, hm, fm)), { rh: xs.map(() => hh), rw: xs.map(() => dd), ref: fw, seg: 28, exp: 4, cap0: "dome", cap1: "dome", uScale: 0.004 });
          }
          for (const s2 of [-1, 1]) { const hW = seg ? hb0 + 0.5 : hS - 6, c0 = FR(s2 * bS(hW), hW, bf(hW));
            lathe(M("tiWeld"), c0, up, [[bW(hW) - 0.6, -1.6], [bW(hW) + 1.1, -0.4], [bW(hW) + 1.2, 0.8], [bW(hW) - 0.6, 1.9]], 32); }
        }
        // mounts: three-pack (two bolts 64 mm apart up the outside of the blade + one in front), low-rider eyelet, fender eyelets
        {
          const mt = forkCat.mounts || "none", cargo = /cargo|all/.test(mt), fender = /fender|all/i.test(mt) || mt === "all", lowRider = mt === "all";
          const boss = (s2, h, df, r) => { const c0 = FR(s2 * (bS(h) + bW(h) * 0.92), h, bf(h) + df), n = [0, 0, s2];
            cyl(M(rk), V.madd(c0, n, -1.5), V.madd(c0, n, 1.9), r, r - 0.4, 18); disc(M("blackMatte"), V.madd(c0, n, 1.95), n, 2.4, 0.1, 10);
            cyl(M("steel"), V.madd(c0, n, 1.9), V.madd(c0, n, 3.4), 2.9, 2.9, 12); };   // stainless bolt head
          if (cargo) for (const s2 of [-1, 1]) { const hm = clamp(hS * 0.5, 120, hS - 60); boss(s2, hm - 32, 0, 4.6); boss(s2, hm + 32, 0, 4.6); boss(s2, hm, bD(hm) * 0.55, 4.6); }
          if (lowRider) for (const s2 of [-1, 1]) { const hl = clamp(hS * 0.3, 70, hS - 120); boss(s2, hl, -bD(hl) * 0.45, 4.2); }
          if (fender) for (const s2 of [-1, 1]) { const c0 = FR(s2 * (lhB - bwB - 1.2), 10, -bdB - 5), n = [0, 0, -s2];   // eyelet behind the dropout, inside face
            lathe(M(rk), V.madd(c0, n, -2.5), n, [[0, 0], [6, 0], [6, 4], [0, 4]], 18); disc(M("blackMatte"), V.madd(c0, n, 1.55), n, 2.5, 0.1, 10); }
          if (fender) { const c0 = FR(0, hC - rhC + 0.5, offF - 20); lathe(M("blackMatte"), c0, V.mul(up, -1), [[0, 0], [3, 0], [3, 1], [0, 1]], 12); }   // fender bolt hole under the crown
        }
        // logo up the outside of each blade (rigid forks: "Logo on the lowers" text, blade logo colour)
        if (forkCat.brandText) {
          const txt = String(forkCat.brandText), Lh = Math.min(hS - 80, 18 + 16 * txt.length), h0 = clamp(hS * 0.42 - Lh / 2, 60, hS - 40 - Lh);
          if (Lh > 30) {
            const Mk = texMat("rigidForkLogo_" + txt + forkCat.bladeLogoColor, texText(txt, "italic 900 170px 'Arial Black', Arial, sans-serif", forkCat.bladeLogoColor || "#e8e8e8", null, 1024, 192), { base: [1, 1, 1], decal: true, rough: 0.35, clear: 0.7 });
            for (const s2 of [-1, 1]) Mk.grid(16, 3, (i, j) => { const h = h0 + Lh * i / 16, th = lerp(-0.55, 0.55, j / 3), rw = bD(h), rh2 = bW(h);
              const ex = tiFork ? 2 : 2.25, n = V.norm(V.add(V.mul([0, 0, s2], Math.cos(th) / rh2), V.mul(fw, Math.sin(th) / rw)));
              const r = Math.pow(Math.pow(Math.abs(Math.cos(th)) / rh2, ex) + Math.pow(Math.abs(Math.sin(th)) / rw, ex), -1 / ex) + 0.2;
              const pnt = V.add(FR(s2 * bS(h), h, bf(h)), V.add(V.mul([0, 0, s2], r * Math.cos(th)), V.mul(fw, r * Math.sin(th))));
              return { p: pnt, n, uv: s2 > 0 ? [i / 16, 1 - j / 3] : [1 - i / 16, 1 - j / 3], t: up }; });
          }
        }
        // dropouts: round thru-axle bosses at the blade tips (machined flat outside faces)
        for (const s2 of [-1, 1]) {
          const zi = s2 * (lhB - bwB - 0.3), zo2 = s2 * (lhB + bwB + 0.6);
          lathe(M(rk), FR(zi, 0, 0), [0, 0, s2], [[0, 0], [11, 0], [11.8, 1.2], [11.8, Math.abs(zo2 - zi) - 1.4], [10.8, Math.abs(zo2 - zi)], [0, Math.abs(zo2 - zi)]], 32);
        }
        // flat-mount brake: a sculpted pad on the back of the left blade with two bolt heads on the outside face
        {
          const rdF0 = V.norm(V.add(V.mul(fw, -0.6), V.mul(up, 0.8))), cpF0 = V.madd([axF[0], axF[1], 0], rdF0, rotorF / 2 - 11);
          const hP = Math.max(28, V.dot(V.sub(cpF0, [axF[0], axF[1], 0]), up) - 10), fB = bf(hP) - bdB - 4;
          const zP = -bS(hP);
          blob(M(rk), FR(zP + 1.5, hP, fB), fw, up, Z, 11, 24, bW(hP) + 3.2, 0.42, 12);
          for (const dh of [-12, 12]) {
            const b0 = FR(zP - bW(hP) - 4.3, hP + dh, fB - 2);
            cyl(M("blackAnod"), b0, V.add(b0, [0, 0, -2.6]), 4.2, 4.2, 6); disc(M("blackMatte"), V.add(b0, [0, 0, -2.65]), Z, 2, 0.1, 6);
          }
          // internal hose ports: in at the back of the left blade under the crown, out just above the brake pad
          const port = hq => FR(-bS(hq), hq, bf(hq) - bD(hq) + 0.6);
          for (const hq of [hS - 20, hP + 40]) lathe(M("blackMatte"), V.madd(port(hq), fw, 1.2), V.mul(fw, -1), [[2.6, 0], [4.6, 0], [5, 0.6], [5, 1.6], [4.4, 2.2], [2.6, 2.2]], 20);
          anchors.forkPortIn = V.madd(port(hS - 20), fw, -1.6); anchors.forkPortOut = V.madd(port(hP + 40), fw, -1.6);
        }
        anchors.forkLh = lhB; anchors.forkBw = bwB;
      } else {
        // rigid fork: one-piece carbon look — crown bridge through the steerer, blades curving forward to the dropouts
        crownBot = a2c - 26;
        const rk = dynMat(forkCat.lowerColor || "#121214", forkCat.lowerFinish || "gloss", "carbon");
        const cTop = a2c - 1, cOrg = V.madd([axF[0], axF[1], 0], up, crownBot), cH = cTop - crownBot, lt = lh - 4;
        const cpts = [], crh = [], crw = [];
        for (let k = 0; k <= 16; k++) { const t = -1 + 2 * k / 16, a = Math.abs(t); cpts.push(V.add(V.madd(V.madd(cOrg, up, cH / 2), fw, offF * (1 - a * a) * 0.9 + offF * 0.1), [0, 0, t * lt]));
          crh.push(lerp(15, 22, Math.pow(1 - a, 1.4))); crw.push(cH / 2); }
        sweep(M(rk), cpts, { rh: crh, rw: crw, ref: up, seg: 24, exp: 3, cap0: "dome", cap1: "dome" });
        lathe(M(rk), V.madd(cOrg, fw, offF), up, [[0, -2], [19, -2], [22, 2], [22, cH - 2], [19, cH + 1], [0, cH + 1]], 36);
        for (const s2 of [-1, 1]) {
          const top = V.add(V.madd(V.madd(cOrg, up, 4), fw, offF * 0.1), [0, 0, s2 * lt]), bot = V.add(legAt(s2, 6), [0, 0, -s2 * 3]);
          const mid = V.add(V.lerp(top, bot, 0.55), V.mul(fw, -6));
          const pts = smoothPath([top, mid, bot], 8);
          const nP = pts.length;
          sweep(M(rk), pts, { rh: pts.map((_, k) => lerp(15, 8.5, k / (nP - 1))), rw: pts.map((_, k) => lerp(12, 7, k / (nP - 1))), ref: Z, seg: 22, exp: 2.4, cap1: "dome" });
          // dropout
          blob(M(rk), V.add(legAt(s2, 0), [0, 0, s2 * 1]), fw, up, Z, 12, 15, 6, 0.45, 10);
        }
        // brake post mount on the back of the left blade (same posts as the suspension fork, so the caliper ears land on them)
        {
          const rdF0 = V.norm(V.add(V.mul(fw, -0.6), V.mul(up, 0.8))), tgF = V.norm(V.cross(Z, rdF0)), rFace = rotorF / 2 - 13;
          const fu = v => [V.dot(v, fw), V.dot(v, up)];
          const bz = zRotF - 24, ax0 = [axF[0], axF[1], 0];
          const bs = [-1, 1].map(k => fu(V.add(V.mul(rdF0, rFace - 6), V.mul(tgF, k * 37))));
          plate(M(rk), ax0, fw, up, Z, hullCircles([[-3, 22, 6.5], [-6, 62, 6.5], [bs[0][0], bs[0][1], 7], [bs[1][0], bs[1][1], 7]], 18), bz - 3, bz + 3);
          // web joining the tab to the blade
          plate(M(rk), ax0, fw, up, Z, hullCircles([[-2, 20, 7], [-5, 64, 7], [-16, 40, 7]], 14), Math.min(bz, -lt), Math.max(bz, -lt));
          for (const k of [-1, 1]) {
            const b = V.add(V.madd(ax0, tgF, k * 37), [0, 0, bz]);
            cyl(M(rk), V.madd(b, rdF0, rFace - 12), V.madd(b, rdF0, rFace), 8.2, 7.8, 24);
            cyl(M("blackMatte"), V.madd(b, rdF0, rFace), V.madd(b, rdF0, rFace + 0.5), 3.2, 3.2, 12);
          }
        }
            }
      if (!susp && gravelFork) {
        // 12 × 100 thru-axle: hex-socket bolt head on the left, flush threaded end on the right
        const lB = anchors.forkLh, wB = anchors.forkBw, zl = -(lB + wB + 0.6), zr2 = lB + wB + 0.6;
        cyl(M("steel"), V.add([axF[0], axF[1], 0], [0, 0, zl]), V.add([axF[0], axF[1], 0], [0, 0, zr2]), 6, 6, 16);
        lathe(M(axleKey), V.add([axF[0], axF[1], 0], [0, 0, zl]), [0, 0, -1], [[0, 0], [10.5, 0], [10.5, 0], [10.5, 2.2], [9.4, 3.4], [0, 3.4]], 32);
        disc(M("blackMatte"), V.add([axF[0], axF[1], 0], [0, 0, zl - 3.45]), Z, 3.2, 0.2, 6);
        lathe(M(axleKey), V.add([axF[0], axF[1], 0], [0, 0, zr2]), [0, 0, 1], [[0, 0], [8.5, 0], [8.5, 0], [8.5, 1.2], [7.6, 1.8], [0, 1.8]], 28);
      } else
      // rigid MTB fork: 15 × 110 thru-axle, bolt head on the left, flush nut on the right (the suspension fork draws its own)
      if (!susp) {
        cyl(M("steel"), legAt(-1, 0), legAt(1, 0), 7.5, 7.5, 16);
        const zo = rL * 0.8 + 2;
        lathe(M(axleKey), V.add(legAt(-1, 0), [0, 0, -zo]), [0, 0, -1], [[0, 0], [13, 0], [13, 0], [13, 2.2], [11.5, 3.6], [6, 3.8], [6, 2.6], [0, 2.6]], 32);
        lathe(M(axleKey), V.add(legAt(1, 0), [0, 0, zo]), [0, 0, 1], [[0, 0], [11, 0], [11, 0], [11, 1.6], [9.5, 2.4], [0, 2.4]], 28);
      }
    }

    // ---------------- wheels, tyres, rotors, calipers
    // rear wheel size; wheel(c, front) switches R0 / beadR / tA / tRc to the front size for mixed wheels (e.g. 29" front, 27.5" rear)
    const FEAm = root.FrameFEA, R0r = g.tireDiameter / 2, R0f = FEAm && FEAm.frontTyreR ? FEAm.frontTyreR(g) : R0r;
    const bsd = front => FEAm && FEAm.rimBSD ? FEAm.rimBSD(g, front) / 2 : 311;
    let R0 = R0r, beadR = bsd(false);
    const tw = num(o.tyreWidth, 61), rimD = num(o.rimDepth, 24);
    let tA = (R0 - 3.6 - beadR) / 2, tRc = beadR + tA;
    const tB = Math.max(8, tw / 2 - (tw < 50 ? 1.4 : 2.8)), tN = 2.05;   // tyre width is measured over the shoulder knobs
    const wheelSize = front => { R0 = front ? R0f : R0r; beadR = bsd(front); tA = (R0 - 3.6 - beadR) / 2; tRc = beadR + tA; };
    const tyreSide = o.tyreSide === "tan";
    const WH = PR ? PR.wheels : { rimMaterial: "alloy", rimColor: "#111112", rimFinish: "anodised", rimOuter: 35, spokes: o.spokes, spokeColor: "#1b1b1d", hubColor: "#151517", decalText: "" };
    const TY = PR ? PR.tyres : { tread: "trail", brandText: "" };
    const BK = PR ? PR.brakes : { bodyColor: o.brakes === "sram" ? "#141416" : "#5c5f66", finish: "anodised", rotorStyle: o.brakes };
    const rimKey = dynMat(WH.rimColor, WH.rimFinish, WH.rimMaterial === "carbon" || WH.rimMaterial === "carbonUD" ? WH.rimMaterial : "");
    const hubKey = dynMat(WH.hubColor, "anodised"), spokeKey = dynMat(WH.spokeColor || "#1b1b1d", "anodised", "steel");
    const brakeKey = dynMat(BK.bodyColor, BK.finish || "anodised");
    // tread rows: [position across the tread (0 = centre … 1 = widest point of the casing), phase (fraction of one pitch),
    // half length (around the tyre), half width (across), height, roundness (0.2 square-edged … 0.6 ramped), mirror-side phase shift]
    // n = pattern repeats around the tyre (a real 29 × 2.6 trail tyre has ~40, so knobs are big and the gaps open)
    const TREADS = {
      // trail (Dissector / Rekon style): alternating centre — a split pair, then one wide bar — transition knobs, tall shoulders
      trail: { n: 40, rows: [[0.12, 0, 5.6, 6.0, 3.6, 0.24, 0], [0.0, 0.5, 5.0, 8.5, 3.6, 0.24], [0.36, 0.27, 4.2, 4.6, 3.4, 0.26, 0], [0.62, 0.02, 7.2, 4.6, 3.9, 0.22, 0], [0.7, 0.52, 6.4, 4.2, 3.7, 0.22, 0]] },
      // xc (Rekon Race / Aspen style): small, low, ramped knobs, packed closer
      xc: { n: 50, rows: [[0.1, 0, 3.4, 4.2, 2.0, 0.5, 0], [0.0, 0.5, 3.0, 5.2, 1.8, 0.55], [0.38, 0.25, 3.2, 3.6, 2.2, 0.45, 0], [0.64, 0, 5.0, 3.8, 2.8, 0.3, 0], [0.7, 0.5, 4.4, 3.4, 2.6, 0.3, 0]] },
      // gravel: fine file tread in the middle, small knobs on the shoulders
      gravel: { n: 120, rows: [[0.06, 0, 1.4, 2.0, 0.8, 0.5, 0.5], [0.22, 0.5, 1.4, 2.0, 0.8, 0.5, 0.5], [0.4, 0, 2.0, 2.2, 1.1, 0.4, 0.5], [0.62, 0.5, 3.0, 2.8, 2.0, 0.3, 0.5]] },
      // road (v10.20): slick, no knobs
      road: { n: 0, rows: [] }
    };
    const tyrePt = t => { const ct = Math.cos(t), sn = Math.sin(t); const r = tRc + tA * G.spow(ct, 2 / tN), z = tB * G.spow(sn, 2 / tN);
      const nr = G.spow(ct, 2 - 2 / tN) / tA, nz = G.spow(sn, 2 - 2 / tN) / tB, nl = Math.hypot(nr, nz) || 1; return { r, z, nr: nr / nl, nz: nz / nl }; };
    // profile angle (0 … π) at which the casing reaches radius r on the sidewall
    const tyreTAt = r => Math.acos(Math.max(-1, Math.min(1, G.spow((r - tRc) / tA, tN / 2))));
    function wheel(c, front) {
      wheelSize(front);
      const rotate = front ? 0.13 : 0;
      if (show.wheels) {
        // tyre carcass (tan or black sidewalls): slightly rounded casing, a moulded bead line just above the rim and a faint
        // smoother band where the lettering sits
        const prof = [], pcol = [], tBead = tyreTAt(beadR + 9), tBand0 = tyreTAt(beadR + 15), tBand1 = tyreTAt(beadR + 38);
        for (let k = 0; k <= 96; k++) {
          const t = -0.92 * Math.PI + 1.84 * Math.PI * k / 96, ct = Math.cos(t), sn = Math.sin(t), at = Math.abs(t);
          const bead = 0.9 * Math.exp(-Math.pow((at - tBead) / 0.03, 2));     // raised bead line
          const q = tyrePt(t);
          prof.push([q.r + q.nr * bead, q.z + q.nz * bead]);
          const sideW = at > 0.36 * Math.PI, band = at > tBand1 && at < tBand0;
          const sh = band ? 0.85 : (k % 2 ? 1.06 : 0.97);                        // fine moulding texture / smooth label band
          const lip = at > tBead + 0.02 ? 1.5 : 1;                                   // smooth, slightly shinier strip between bead line and rim
          pcol.push(tyreSide && sideW ? (at > tBead - 0.02 ? [0.30, 0.18, 0.08] : [0.42, 0.25, 0.11].map(v => v * (band ? 0.95 : 1))) : [0.032 * sh * lip, 0.032 * sh * lip, 0.032 * sh * lip]);
        }
        lathe(M("tyre"), c, Z, prof, 160, { col: pcol, basis: [X, Y] });
        // knobs (rounded blocks, staggered rows)
        const TR = TREADS[TY.tread] || TREADS[tw < 50 ? "gravel" : "trail"], kn = M("rubber"), ks = Math.min(1.25, Math.max(0.6, tw / 61));
        for (let i = 0; i < TR.n; i++) {
          for (const [tt0, ph, ka, kb, kh, ke, mph] of TR.rows) for (const sgn of tt0 === 0 ? [1] : [1, -1]) {
            const tt = tt0 * sgn, phi = 2 * Math.PI * (i + ph + (sgn < 0 ? (mph == null ? 0.25 : mph) : 0)) / TR.n + rotate;
            const q = tyrePt(tt * Math.PI / 2 * 0.98);
            const radial = [Math.cos(phi), Math.sin(phi), 0], nrm = V.norm(V.add(V.mul(radial, q.nr), V.mul(Z, q.nz)));
            const p = V.add(V.add(c, V.mul(radial, q.r)), [0, 0, q.z]), circ = [-Math.sin(phi), Math.cos(phi), 0];
            blob(kn, V.madd(p, nrm, kh / 2 - 0.5), circ, V.norm(V.cross(nrm, circ)), nrm, ka, kb * (tt0 < 0.5 ? ks : 1), kh / 2, ke || 0.24, 6);
          }
        }
        // sidewall lettering (two places per side), mid-sidewall, reading left-to-right from outside on both sides
        if (TY.brandText) {
          const Mt = texMat("tyreText", texText(TY.brandText, "italic 800 170px 'Arial Black', Arial, sans-serif", TY.textColor || "#d8d8d8", null, 1024, 192), { base: [1, 1, 1], decal: true, rough: 0.75 });
          const span = Math.min(0.9, 0.11 * TY.brandText.length + 0.15), rT0 = beadR + 17, rT1 = beadR + 35;
          for (const sd of [1, -1]) for (const a0 of [0.6, 0.6 + Math.PI]) {
            Mt.grid(24, 3, (i, j) => { const phi = a0 + rotate + sd * lerp(-span / 2, span / 2, i / 24), t = sd * tyreTAt(lerp(rT0, rT1, j / 3)), q = tyrePt(t);
              const radial = [Math.cos(phi), Math.sin(phi), 0], nn = V.norm(V.add(V.mul(radial, q.nr), V.mul(Z, q.nz)));
              return { p: V.madd(V.add(V.add(c, V.mul(radial, q.r)), [0, 0, q.z]), nn, 0.3), n: nn, uv: [1 - i / 24, j / 3], t: [-Math.sin(phi), Math.cos(phi), 0] }; });
          }
        }
        // rim (hookless profile, width and depth from the wheel part)
        const hw = num(WH.rimOuter, 35) / 2, d0 = beadR - rimD;
        const rp = [[beadR + 4, hw - 0.4], [beadR - 4, hw], [d0 + 9, hw - 2.5], [d0 + 2, hw * 0.45], [d0, 3], [d0, -3], [d0 + 2, -hw * 0.45], [d0 + 9, -hw + 2.5], [beadR - 4, -hw], [beadR + 4, -hw + 0.4], [beadR + 5, -hw + 1.8], [beadR + 1.5, -hw + 2.6], [beadR - 1, 0], [beadR + 1.5, hw - 2.6], [beadR + 5, hw - 1.8], [beadR + 4, hw - 0.4]];
        lathe(M(rimKey), c, Z, rp, 144, { basis: [X, Y] });
        // rim graphics. Side surface of the rim at radius r (outer profile of rp above), and a patch helper:
        // centred at angle a0 (0 = forward, π/2 = top), span (rad), radii rIn..rOut; tops "out" = letter tops point to the
        // tyre and the text runs clockwise as seen from that side; "in" = tops to the hub, text runs anticlockwise.
        const rimSide = [[beadR + 4, hw - 0.4], [beadR - 4, hw], [d0 + 9, hw - 2.5], [d0 + 2, hw * 0.45], [d0, 3]];
        const rimZ = r => { for (let k = 1; k < rimSide.length; k++) { const A = rimSide[k - 1], Bq = rimSide[k]; if (r >= Bq[0]) return lerp(Bq[1], A[1], (r - Bq[0]) / (A[0] - Bq[0])); } return 3; };
        const rimPatch = (Mk, a0, span, rIn, rOut, tops, sides, lift) => {
          for (const sd of sides || [1, -1]) Mk.grid(32, 3, (i, j) => {
            const dir = tops === "in" ? sd : -sd, phi = a0 + rotate + dir * lerp(-span / 2, span / 2, i / 32);
            const r = tops === "in" ? lerp(rOut, rIn, j / 3) : lerp(rOut, rIn, j / 3), radial = [Math.cos(phi), Math.sin(phi), 0];
            const z = rimZ(r) + (lift || 0.25), dz = (rimZ(r + 1) - rimZ(r - 1)) / 2, nrm = V.norm(V.add([0, 0, sd], V.mul(radial, -sd * dz)));
            return { p: V.add(V.add(c, V.mul(radial, r)), [0, 0, sd * z]), n: nrm, uv: [i / 32, tops === "in" ? 1 - j / 3 : j / 3], t: V.mul([-Math.sin(phi), Math.cos(phi), 0], dir) };
          });
        };
        const whiteText = (txt, font, w, h, sx) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d");
          x.font = font; x.textAlign = "center"; x.textBaseline = "middle"; const tw = x.measureText(txt).width, k = Math.min(sx || 9, w * 0.97 / Math.max(1, tw));
          x.translate(w / 2, h / 2 + h * 0.05); x.scale(k, 1); x.fillStyle = "#fff"; x.fillText(txt, 0, 0); return cv; };
        const rIn = d0 + 7, rOut = beadR - 3, midR = (rIn + rOut) / 2;
        if (WH.rimLogo) {   // big tone-on-tone logo, centred front and back of each side, ~110° long, full rim height
          const span = Math.min(2.0, 0.21 * WH.rimLogo.length + 0.1), cw = 2048;
          const Ml = texMat("rimLogo", whiteText(WH.rimLogo, "italic 900 200px 'Arial Black', Arial, sans-serif", cw, Math.round(cw * (rOut - rIn) / (span * midR) * 1.05)),
            { base: hex2lin(WH.rimLogoColor || "#1c1c1f"), decal: true, rough: 0.2, clear: 0.9 });
          for (const a0 of [0, Math.PI]) rimPatch(Ml, a0, span, rIn, rOut, "out");
        }
        if (WH.decalText) {   // [box logo] MODEL + accent, upright at the bottom and (upside down) at the top
          const acc = WH.decalAccent || "", badge = WH.rimBadge === "yes";
          const hH = 120, font = "500 112px 'Arial Narrow', Arial, sans-serif";
          const mz = document.createElement("canvas").getContext("2d"); mz.font = font;
          const XS = 1.45, wTxt = (mz.measureText(WH.decalText).width + WH.decalText.length * 10) * XS + 10, wB = badge ? hH * 0.95 : 0, wA = acc ? hH * 0.8 * acc.length : 0;
          const W = Math.ceil(wB + wTxt + wA + 30), cvs = [0, 1].map(() => { const cv = document.createElement("canvas"); cv.width = W; cv.height = hH; return cv; });
          { const x = cvs[0].getContext("2d"); x.fillStyle = "#fff"; x.strokeStyle = "#fff";
            if (badge) {   // rounded square with a "b" cut out of it
              const bx = 8, by = 12, bs = hH - 24, rr = 12; x.beginPath(); x.moveTo(bx + rr, by); x.arcTo(bx + bs, by, bx + bs, by + bs, rr); x.arcTo(bx + bs, by + bs, bx, by + bs, rr); x.arcTo(bx, by + bs, bx, by, rr); x.arcTo(bx, by, bx + bs, by, rr); x.closePath(); x.fill();
              x.globalCompositeOperation = "destination-out"; x.font = "italic 900 92px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("b", bx + bs / 2, by + bs / 2 + 6); x.globalCompositeOperation = "source-over"; }
            x.font = font; x.textAlign = "left"; x.textBaseline = "middle"; x.save(); x.translate(wB + 16, 0); x.scale(XS, 1); let px = 0;   // wide, spaced capitals
            for (const ch of WH.decalText) { x.fillText(ch, px, hH / 2 + 4); px += x.measureText(ch).width + 10; } x.restore(); }
          if (acc) { const x = cvs[1].getContext("2d"), x0 = W - wA - 8, cell = wA / acc.length; x.fillStyle = "#fff";
            for (let k = 0; k < acc.length; k++) {   // ribbon-like crossed strokes
              const cx = x0 + cell * (k + 0.5), w2 = cell * 0.66, t = hH * 0.19, y0 = hH * 0.16, y1 = hH * 0.84;
              for (const [ax, bx] of [[cx - w2 / 2, cx + w2 / 2 + 6], [cx + w2 / 2 + 6, cx - w2 / 2]]) { x.beginPath(); x.moveTo(ax - t / 2, y1); x.lineTo(ax + t / 2, y1); x.lineTo(bx + t / 2, y0); x.lineTo(bx - t / 2, y0); x.closePath(); x.fill(); }
            } }
          const hgt = (rOut - rIn) * 0.72, span = hgt * W / hH / midR, rA = midR - hgt / 2, rB = midR + hgt / 2;
          const Mt = texMat("rimText", cvs[0], { base: hex2lin(WH.decalColor || "#e8e8e8"), decal: true, rough: 0.2, clear: 0.9 });
          for (const a0 of [-Math.PI / 2, Math.PI / 2]) rimPatch(Mt, a0, span, rA, rB, "in");
          if (acc) { const Ma = texMat("rimAccent", cvs[1], { base: hex2lin(WH.decalAccentColor || "#ff4f6a"), decal: true, rough: 0.3, clear: 0.6 });
            for (const a0 of [-Math.PI / 2, Math.PI / 2]) rimPatch(Ma, a0, span, rA, rB, "in"); }
        }
        // hub
        const hubF = [[0, -55], [11, -55], [11, -55], [11, -50], [14, -48], [14, -45], [22, -45], [22, -42], [15, -41], [15, -31], [28, -30.5], [28, -27.5], [16, -26], [17.5, 0], [16, 26], [28, 27.5], [28, 30.5], [15, 31], [14, 48], [11, 50], [11, 55], [11, 55], [0, 55]];
        const zr = front ? zRotF : zRotR;
        const hubR = [[0, -74], [12, -74], [12, -74], [12, -66], [15, -64], [15, zr - 1.2], [23, zr - 1.2], [23, zr + 2], [16, zr + 3], [16, -36], [31, -35], [31, -32], [18, -30], [19.5, 0], [18, 14], [31, 15], [31, 18], [17, 20], [17, 58], [13, 60], [12, 74], [12, 74], [0, 74]];
        lathe(M(hubKey), c, Z, front ? hubF.map(q => [q[0], q[1] * hubKF]) : hubR, 40);
        if (WH.hubShellColor && /^#[0-9a-f]{6}$/i.test(WH.hubShellColor)) {   // barrel between the flanges in its own colour / finish
          const shK = dynMat(WH.hubShellColor, WH.hubFinish || "anodised"), zb = front ? [-25 * hubKF, 25 * hubKF] : [-29, 13.5];
          const prof = []; for (let k = 0; k <= 12; k++) { const z = lerp(zb[0], zb[1], k / 12), q = (z - (zb[0] + zb[1]) / 2) / ((zb[1] - zb[0]) / 2); prof.push([(front ? 17.5 : 19.5) - 1.5 * q * q + 0.25, z]); }
          lathe(M(shK), c, Z, [[0, zb[0]]].concat(prof, [[0, zb[1]]]), 40);
        }
        // hub text round the barrel (wheels part "hubText"), twice so it reads from either side
        if (WH.hubText) {
          const Mh = texMat("hubText", texText(WH.hubText, "800 150px Arial, sans-serif", WH.decalColor || "#d8d8d8", null, 1024, 192), { base: [1, 1, 1], decal: true, rough: 0.35, clear: 0.5 });
          const span = Math.min(2.6, 0.2 * WH.hubText.length + 0.3), rr = (front ? 17.3 : 19.2) + 0.9, zc0 = front ? -6 : -8, hz = 3.6;
          for (const a0 of [0.4, 0.4 + Math.PI]) Mh.grid(24, 2, (i, j) => { const phi = a0 + rotate + lerp(span / 2, -span / 2, i / 24), z = zc0 + lerp(-hz, hz, j / 2), r = rr - Math.abs(z) * (front ? 0.06 : 0.055);
            return { p: V.add(c, [r * Math.cos(phi), r * Math.sin(phi), z]), n: [Math.cos(phi), Math.sin(phi), 0], uv: [i / 24, 1 - j / 2], t: [-Math.sin(phi), Math.cos(phi), 0] }; });
        }
        // spokes: 2-cross up to 24 spokes, 3-cross above
        const Ns = Math.max(16, Math.round(num(WH.spokes, 28) / 2) * 2), n = Ns / 2, cross = Ns <= 24 ? 2 : 3;
        const fl = front ? [[-29 * hubKF, 25], [29 * hubKF, 25]] : [[-33.5, 27.5], [16.5, 27.5]];
        for (let side = 0; side < 2; side++) {
          const [fz, fr] = fl[side];
          for (let k = 0; k < n; k++) {
            const th = 2 * Math.PI * k / n + (side ? Math.PI / n : 0) + rotate, dir = k % 2 ? 1 : -1;
            const tr = th + dir * cross * 4 * Math.PI / Ns;
            const a = V.add(c, [fr * Math.cos(th), fr * Math.sin(th), fz]);
            const rr = d0 + 3, b = V.add(c, [rr * Math.cos(tr), rr * Math.sin(tr), side ? 1.6 : -1.6]);
            cyl(M(spokeKey), a, b, 1.0, 1.0, 5, { caps: false });
            const d = V.norm(V.sub(b, a));
            cyl(M(spokeKey), V.madd(b, d, -11), V.madd(b, d, 1.5), 1.9, 1.9, 6);
          }
        }
        // rear thru-axle
        if (!front) { cyl(M("steel"), V.add(c, [0, 0, -86]), V.add(c, [0, 0, 84]), 6, 6, 14); blob(M("blackAnod"), V.add(c, [0, 0, -88]), X, Y, Z, 11, 11, 4, 0.6, 10); }
        else if (!show.fork) cyl(M("steel"), V.add(c, [0, 0, -62]), V.add(c, [0, 0, 62]), 7.5, 7.5, 14);
      }
      if (show.rotors) {
        const rr = (front ? rotorF : rotorR) / 2, zr = front ? zRotF : zRotR;
        const brand = BK.rotorStyle === "sram" ? "sram" : BK.rotorStyle === "hope" ? "hope" : "shimano";
        const Mr = texMat("rotor" + (front ? "F" : "R"), brand === "hope" ? texRotorHope(rr, BK.rotorCarrier || "#c4c6c9") : texRotor(rr, brand), { base: [1, 1, 1], metal: 1, rough: 0.28, twoSided: true });
        disc(Mr, V.add(c, [0, 0, zr]), Z, rr, 1.9, 120, [X, Y]);
        cyl(M("steel"), V.add(c, [0, 0, zr - 0.95]), V.add(c, [0, 0, zr + 0.95]), rr, rr, 120, { caps: false });
        // Center Lock lockring
        const sd = zr < 0 ? -1 : 1;
        lathe(M("blackAnod"), V.add(c, [0, 0, zr + sd * 0.95]), [0, 0, sd], [[17, 0], [21.5, 0], [21.5, 0], [21.5, 3.2], [20, 4.2], [17, 4.2]], 32);
      }
    }
    // Hope X2 (XCR Pro): one-piece CNC 2-piston post-mount caliper. Outboard half carries the mounting ears (radial
    // post-mount bolts, 74 mm apart), the machined face with the etched logo and the banjo; a slim inboard half; a bridge
    // over the rotor edge with the pad pin and bleed screw. hoseHint = rough direction the hose leaves in.
    // mount = { z: ear centre outboard of the rotor, r: ear centre radially from the caliper centre, bolts: draw the radial bolts }
    function caliperHope(cp, rad, zr, hoseHint, mount) {
      const tg = V.norm(V.cross(Z, rad)), so = zr < 0 ? -1 : 1, nO = [0, 0, so], body = brakeKey;
      const P3 = (t, r, z) => V.add(V.add(V.madd(cp, tg, t), V.mul(rad, r)), [0, 0, zr - cp[2] + so * z]);
      const o0 = P3(0, 0, 0), pl = (cs, z0, z1, k) => plate(M(k || body), o0, tg, rad, nO, hullCircles(cs, 18), z0, z1);
      const mz = mount.z, mr = mount.r, fz = Math.max(12.2, mz - 2), fz1 = fz + 2.4;
      // outboard half: body, stepped machined face, ears on the post-mount posts
      pl([[-22, 2, 9], [22, 2, 9], [-16, 13, 8.5], [16, 13, 8.5]], 2.6, fz);
      pl([[-19.5, 3, 7], [19.5, 3, 7], [-14.5, 12, 6.5], [14.5, 12, 6.5]], fz, fz1);
      for (const k of [-1, 1]) pl([[k * 37, mr, 6.5], [k * 21, Math.max(mr, -1), 8]], Math.max(3.2, mz - 6), mz + 5);
      // inboard half and the bridge over the rotor edge
      pl([[-20, 2.5, 8], [20, 2.5, 8], [-14, 12, 8], [14, 12, 8]], -9.6, -2.6);
      pl([[-18, 16.5, 4], [18, 16.5, 4], [-12, 18.5, 3.5], [12, 18.5, 3.5]], -9.6, 12.2);
      // post-mount bolts (radial) with hex sockets
      if (mount.bolts) for (const k of [-1, 1]) { const b0 = P3(k * 37, mr + 6.4, mz - 0.5); cyl(M("steel"), b0, V.madd(b0, rad, 5), 5, 5, 16); disc(M("blackAnod"), V.madd(b0, rad, 5.05), rad, 2.4, 0.1, 6); }
      // pad retaining pin head + bleed screw
      cyl(M("steel"), P3(0, 16.5, fz), P3(0, 16.5, fz + 1.8), 3, 3, 12);
      const tb = V.dot(tg, hoseHint) >= 0 ? 1 : -1;
      const bl = P3(-tb * 11, 20.5, 6); cyl(M("steel"), V.madd(bl, rad, -1), V.madd(bl, rad, 3.5), 2.6, 2.2, 10); disc(M("blackAnod"), V.madd(bl, rad, 3.55), rad, 1.3, 0.1, 6);
      // etched logo on the machined face
      if (BK.logoText) {
        const Ml = texMat("hopeLogo", texText(BK.logoText, "900 170px 'Arial Black', Arial, sans-serif", BK.logoColor || "#8e9196", null, 512, 192), { base: [1, 1, 1], decal: true, metal: 0.6, rough: 0.45 });
        const w = Math.min(30, 7.2 * BK.logoText.length), h = 8.4, fl = so * tb;
        Ml.grid(1, 1, (i, j) => ({ p: P3(fl * (i - 0.5) * w, 6.5 + (j - 0.5) * h, fz1 + 0.08), n: nO, uv: [i, j], t: tg }));
      }
      // banjo: lateral bolt into the outboard face, alloy banjo, crimped steel ferrule, hose
      const bc = P3(tb * 18.5, 11.5, fz);
      cyl(M(body), bc, V.madd(bc, nO, 6.5), 6.6, 6.6, 20);
      cyl(M("steel"), V.madd(bc, nO, 6.5), V.madd(bc, nO, 9), 5.2, 5.2, 6);
      disc(M("blackAnod"), V.madd(bc, nO, 9.05), nO, 2.4, 0.1, 6);
      const hd = V.norm(V.add(V.mul(tg, tb * 0.7), V.mul(rad, 0.7))), fc = V.madd(bc, nO, 3.4);
      cyl(M(body), V.madd(fc, hd, 4), V.madd(fc, hd, 9), 4.2, 4.2, 14);
      cyl(M("steel"), V.madd(fc, hd, 9), V.madd(fc, hd, 21), 3.7, 3.5, 14);
      return { at: V.madd(fc, hd, 20.5), dir: hd };
    }
    function caliper(cp, rad, zr, hoseHint, mount) {
      if (o.brakes === "hope-x2") return caliperHope(cp, rad, zr, hoseHint || rad, mount || { z: 12, r: -3, bolts: true });
      // body straddles the rotor edge; rad = unit vector from the axle to the caliper (in the wheel plane)
      const tg = V.norm(V.cross(Z, rad)), sram = o.brakes === "sram", body = brakeKey;
      if (mount && mount.flat) {
        // flat-mount road / gravel caliper: compact two-piece body hugging the back of the fork blade, pad pin, banjo at the rear end
        const Pz = (t, r, z) => V.add(V.add(V.madd(cp, tg, t), V.mul(rad, r)), [0, 0, zr - cp[2] + z]);
        for (const s of [-1, 1]) blob(M(body), Pz(0, 3, s * 8.6), tg, rad, Z, 25, 11.5, 6.2, 0.3, 10);
        blob(M(body), Pz(0, 13.5, 0), tg, rad, Z, 22, 5.5, 12.5, 0.35, 10);
        if (!sram) blob(M("blackMatte"), Pz(-2, 3, -15.2), tg, rad, Z, 13, 5, 1.2, 0.4, 6);
        cyl(M("steel"), Pz(2, 14.5, -13.2), Pz(2, 14.5, 13.2), 1.6, 1.6, 8);
        const bj = Pz(24, 6, -8.6); blob(M(body), bj, tg, rad, Z, 6, 6, 6.6, 0.5, 8);
        return V.madd(bj, tg, 5);
      }
      for (const s of [-1, 1]) blob(M(body), V.add(cp, [0, 0, zr - cp[2] + s * 9.5]), tg, rad, Z, 34, 15, 7, 0.32, 10);
      blob(M(body), V.add(V.madd(cp, rad, 14), [0, 0, zr - cp[2]]), tg, rad, Z, 32, 7, 15, 0.35, 10);
      for (const k of [-1, 1]) cyl(M("silver"), V.add(V.madd(cp, tg, k * 22), [0, 0, zr - cp[2] - 17]), V.add(V.madd(cp, tg, k * 22), [0, 0, zr - cp[2] - 19.5]), 6.5, 6.5, 14);
      if (!sram) blob(M("blackMatte"), V.add(V.madd(cp, rad, 2), [0, 0, zr - cp[2] - 17.5]), tg, rad, Z, 16, 6, 1.5, 0.4, 6);
      return V.add(V.madd(V.madd(cp, rad, 16), tg, 26), [0, 0, zr - cp[2]]);
    }
    wheel([AX[0], AX[1], 0], false);
    wheel([axF[0], axF[1], 0], true);
    if (show.rotors) {
      // anchors.calF / calR = where the hose meets the caliper; .calFdir / .calRdir = the way the hose leaves (Hope banjo)
      const hoseEnd = (r, k) => { if (r && r.at) { anchors[k] = r.at; anchors[k + "dir"] = r.dir; } else anchors[k] = r; };
      if (gc) { const rd = V.norm([gc.p[0] - AX[0], gc.p[1] - AX[1], 0]); const cp = V.madd([AX[0], AX[1], zRotR], rd, rotorR / 2 - 11);         // rear: ears against the slider's post bosses (frame code: gc.p − 8 mm radially, ±37 mm, ending 6 mm off the rotor)
        hoseEnd(caliper(cp, rd, zRotR, V.norm([bbP[0] - AX[0], bbP[1] - AX[1], 0]), { z: 11, r: V.dot(V.sub(gc.p, [AX[0], AX[1], gc.p[2]]), rd) - 8 - (rotorR / 2 - 11), bolts: false }), "calR"); }
      const rdF = V.norm(V.add(V.mul(fw, -0.6), V.mul(up, 0.8)));
      const cpF = V.madd([axF[0], axF[1], zRotF], rdF, rotorF / 2 - 11);
      // front: ears sit on the fork's post-mount posts (fork code: face at rotor/2 − 13 radially, 24 mm outboard of the rotor)
      hoseEnd(caliper(cpF, rdF, zRotF, up, gravelFork ? { z: 14, r: 2, bolts: false, flat: true } : { z: 24, r: 4.5, bolts: true }), "calF");

    }

    // ---------------- drivetrain
    const GS = FP.GROUPSETS || {};
    let gset = o.groupset || "auto"; if (gset === "auto") gset = slider ? "singlespeed" : "sramEagle";
    const geared = gset !== "singlespeed";
    const cl = num(g.chainline, 52), Lc = o.crankLen === "auto" || o.crankLen == null ? num(g.crankLength, 175) : num(o.crankLen, 175);
    const thc = num(o.crankAngle, 25) * D2R;
    const CR = PR ? PR.crankset : { material: "alloy", color: gset === "shimanoXT" ? "#5c5f66" : "#141416", finish: "anodised", logoText: "" };
    const RG = PR ? PR.chainring : { teeth: 0, color: "#1a1a1c" }, RC = PR ? PR.rear : { teeth: 0, color: "#c8cacc", spacerColor: "#1a1a1c" };
    // One tooth count: the drawing follows "Chainring" under Joint positions & drivetrain (the analysis number).
    // Picking a ring with its own teeth copies them into that field (see syncTeeth in the parts panel).
    const ringN = Math.round(num(g.chainring, RG.teeth > 0 ? RG.teeth : 34)), rRing = pitchR(ringN);
    const crankMat = dynMat(CR.color, CR.finish, CR.material === "carbon" ? "carbon" : "");
    if (show.drive) {
      // BB cups and spindle
      for (const s of [-1, 1]) lathe(M("blackAnod"), V.add(bbP, [0, 0, s * bbw / 2]), [0, 0, s], [[16, 0], [23, 0], [23.5, 1], [23.5, 3.5], [22, 4.5], [16, 4.5]], 40);
      cyl(M("blackAnod"), V.add(bbP, [0, 0, -bbw / 2 - 12]), V.add(bbP, [0, 0, bbw / 2 + 12]), 14.5, 14.5, 20);
      // crank arms
      const bootDiff = (() => { const a = G.hex2lin(CR.bootColor), b = G.hex2lin(CR.color); const d = Math.max(...a.map((v, i) => Math.abs(v - b[i]))); return isNaN(d) ? 1 : d; })();
      const hasBoot = !!CR.bootColor && CR.bootColor !== CR.color && bootDiff > 0.012;
      for (const s of [1, -1]) {
        const ang = s > 0 ? -thc : Math.PI - thc, zA = s * (bbw / 2 + 12), zB = s * (bbw / 2 + 39);
        const e = [Math.cos(ang), Math.sin(ang)], pts = [];
        for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(V.add(bbP, [Lc * e[0] * t, Lc * e[1] * t, lerp(zA, zB, smooth(0.15, 0.9, t))])); }
        // arm shape preset (parts3d.js SHAPES.crank): width in the crank plane / thickness at both ends, spine ridge, boss
        const KS = root.FrameShapes.pick("crank", CR.shape, "generic");
        const wAt = t => lerp(KS.wS, KS.wE, t) / 2 * (1 + (KS.flare ? (KS.flare / KS.wS) * Math.pow(1 - smooth(0, 0.3, t), 2) * 2 : 0)), tAt = t => lerp(KS.tS, KS.tE, t) / 2;
        sweep(M(crankMat), pts, { rh: pts.map((_, k) => wAt(k / 12)), rw: pts.map((_, k) => tAt(k / 12)), exp: KS.exp, ref: Z, seg: 24, cap0: "dome", cap1: "dome" });
        if (KS.ridge) {   // raised spine down the middle of the outside face (hollow carbon arms)
          const rp = pts.slice(1, 12).map((q, k) => V.add(q, [0, 0, s * (tAt((k + 1) / 12) - 0.2)]));
          sweep(M(crankMat), rp, { rh: rp.map((_, k) => wAt((k + 1) / 12) * 0.42), rw: KS.ridge, exp: 2.4, ref: Z, seg: 16, cap0: "dome", cap1: "dome" });
        }
        cyl(M(crankMat), V.add(bbP, [0, 0, zA - s * 8]), V.add(bbP, [0, 0, zA + s * 8]), KS.boss, KS.boss - 1, 40);
        if (KS.extractor && s < 0) {   // non-drive: self-extracting crank bolt ring + 8 mm hex bolt
          const zc0 = zA + s * 8;
          lathe(M(dynMat(CR.extractorColor || "#141416", "anodised")), V.add(bbP, [0, 0, zc0]), [0, 0, s], [[9.5, 0], [16.5, 0], [16.5, 1.6], [15.6, 2.4], [9.5, 2.4]], 40);
          cyl(M("blackAnod"), V.add(bbP, [0, 0, zc0]), V.add(bbP, [0, 0, zc0 + s * 1.6]), 9.5, 9.5, 6);
          cyl(M("blackMatte"), V.add(bbP, [0, 0, zc0 + s * 1.6]), V.add(bbP, [0, 0, zc0 + s * 1.7]), 4.6, 4.6, 6);
        }
        if (KS.extractor && s > 0) {   // drive side: direct-mount spline boss for the ring
          lathe(M(crankMat), V.add(bbP, [0, 0, zA - s * 8]), [0, 0, -s], [[14, 0], [KS.boss - 2, 0], [KS.boss - 3.5, 3], [14, 3]], 40);
        }
        const pe = V.add(bbP, [Lc * e[0], Lc * e[1], zB]);
        cyl(M(crankMat), V.add(pe, [0, 0, -s * 7]), V.add(pe, [0, 0, s * 7.5]), Math.max(12, KS.wE / 2 + 0.5), 12, 28);
        if (KS.insert) {   // metal pedal-thread insert showing on the outside face
          lathe(M(dynMat(CR.insertColor || "#1a1a1c", "anodised")), V.add(pe, [0, 0, s * 7.5]), [0, 0, s], [[7.4, 0], [10.2, 0], [10.2, 0.5], [9.6, 1.0], [7.4, 1.0]], 32);
          cyl(M("steel"), V.add(pe, [0, 0, s * 7.6]), V.add(pe, [0, 0, s * 8.0]), 7.4, 7.4, 20);
        }
        // rubber crank boot near the pedal end
        // (only when it actually stands out from the arm; a boot the same black as the arm is invisible and would just cut the logo)
        if (hasBoot) { const bp = V.add(bbP, [Lc * e[0] * 0.86, Lc * e[1] * 0.86, zB - s * 0.5]); blob(M(dynMat(CR.bootColor, "matte")), bp, [e[0], e[1], 0], [-e[1], e[0], 0], Z, 17, 12.4, 8.2, 0.4, 8); }
        // logo on the outside face of the arm
        if (CR.logoText) {
          const Ml = texMat("crankLogo", texText(CR.logoText, "italic 900 170px 'Arial Black', Arial, sans-serif", CR.logoColor || "#d4a017", null, 768, 192), { base: [1, 1, 1], decal: true, rough: 0.35, clear: 0.7 });
          const len = Math.min(0.55, 0.12 + 0.09 * CR.logoText.length, hasBoot ? 0.86 - 17 / Lc - 0.02 - 0.36 : 1);   // stop before the boot
          Ml.grid(10, 2, (i, j) => { const t = lerp(0.36, 0.36 + len, i / 10), w = lerp(-1, 1, j / 2), zz = lerp(zA, zB, smooth(0.15, 0.9, t)) + s * (lerp(KS.tS, KS.tE, t) / 2 + 0.3 + (KS.ridge ? KS.ridge - 0.15 : 0));
            const hW = lerp(KS.wS, KS.wE, t) / 2 * (KS.ridge ? 0.36 : 0.62), q = V.add(bbP, [Lc * e[0] * t - e[1] * w * hW, Lc * e[1] * t + e[0] * w * hW, zz]);
            return { p: q, n: [0, 0, s], uv: [i / 10, s > 0 ? j / 2 : 1 - j / 2], t: [e[0], e[1], 0] }; });   // unmirrored on the left arm
        }
        anchors["pedal" + s] = pe;
      }
      // chainring, rear cog(s) and chain. Shapes are data in parts3d.js (FrameShapes.SHAPES.ring / mount / cog / chain).
      const FSd = root.FrameShapes, dctx = { M, MAT, dyn: dynMat, tex: (k, cv, pr) => texMat(k, cv, pr), texText };
      const metalKey = (hex, tag) => { const k = "met_" + tag + hex; if (!MAT[k]) { const dark = Math.max(...hex2lin(hex)) < 0.12; MAT[k] = dark ? { base: hex2lin(hex), metal: 0.55, rough: 0.32, clear: 0.2 } : { base: hex2lin(hex), metal: 1, rough: tag === "chain" ? 0.3 : 0.24 }; } return k; };
      const cogs = geared ? (GS[gset] && GS[gset].cogs) || [10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 52] : [Math.round(num(g.cog, RC.teeth > 0 ? RC.teeth : 20))];
      const chainK = geared ? (gset === "sramRoad" ? 6 : 5) : 0;
      const zCog = k => geared ? 18 + (cogs.length - 1 - k) * 3.9 : cl;
      // chain path first: the ring and cog teeth are turned so the rollers sit in their seats (narrow-wide teeth in the right links)
      const rc = pitchR(cogs[chainK]), zc = zCog(chainK);
      const circles = [{ c: [bbP[0], bbP[1]], r: rRing, s: -1, z: cl }];
      let Up = null, Lo = null;
      if (geared) {
        Up = [AX[0] + 4, AX[1] - rc - 36]; Lo = [Up[0] - 16, Up[1] - 74];
        circles.push({ c: Lo, r: pitchR(14), s: -1, z: zc }, { c: Up, r: pitchR(12), s: 1, z: zc });
      }
      circles.push({ c: [AX[0], AX[1]], r: rc, s: -1, z: zc });
      const CHN = FSd.chainRollers(circles, { sag: geared ? 0 : 2.5 });
      const chSh = FSd.pick("chain", RG.chainColor, "silver");
      if (CHN) FSd.drawChain(dctx, CHN.rollers, { outer: metalKey(chSh.outer, "chain"), inner: metalKey(chSh.inner, "chain"), pin: "chrome", roller: "steel" });
      const seat = (cc, r, z, N) => CHN ? CHN.sprocket(cc, r, z, N) : { phase: 0, wide: k => k % 2 === 0 };
      // chainring
      {
        const rs = seat([bbP[0], bbP[1]], rRing, cl, ringN), ringSh = FSd.pick("ring", RG.shape, "xsync2"), ringKey = dynMat(RG.color || "#18181a", RG.finish || "anodised");
        const accent = RG.accentColor && RG.accentColor.toLowerCase() !== (RG.color || "").toLowerCase() ? dynMat(RG.accentColor, "polished") : ringKey;
        FSd.chainring(dctx, { c: [bbP[0], bbP[1], cl], N: ringN, sh: ringSh, mt: FSd.pick("mount", RG.mount, "sram3"), nw: RG.profile !== "std", phase: rs.phase, wide: rs.wide,
          keys: { body: ringKey, accent, crank: crankMat, bolt: "blackAnod", lock: "blackAnod" }, color: RG.color || "#18181a", logo: RG.logoText === "auto" || RG.logoText == null ? null : RG.logoText,
          logoColor: RG.logoColor, armAng: -thc, uid: "r" });
      }
      // 2x (v10.20): inner ring 7.5 mm inboard of the big ring (the chain stays on the big ring, on the analysis chainline),
      // and a braze-on front derailleur (SRAM AXS-style: body off the seat tube, battery behind, cage over the big ring)
      const ring2 = Math.round(num(RG.teeth2, 0));
      if (geared && ring2 >= 20 && ring2 < ringN) {
        const ringKey2 = dynMat(RG.color || "#18181a", RG.finish || "anodised");
        FSd.chainring(dctx, { c: [bbP[0], bbP[1], cl - 7.5], N: ring2, sh: FSd.pick("ring", "solid", "solid"), mt: { hole: 46, bolts: 0 }, nw: false, phase: 0, wide: k => k % 2 === 0,
          keys: { body: ringKey2, accent: ringKey2, crank: crankMat, bolt: "blackAnod", lock: "blackAnod" }, color: RG.color || "#18181a", logo: "", logoColor: RG.logoColor, armAng: -thc, uid: "r2" });
        const stT = at("STtop"), sd2 = V.norm([stT[0] - bbP[0], stT[1] - bbP[1], 0]), rr2 = V.norm([AX[0] - bbP[0], AX[1] - bbP[1], 0]);
        const turn = (sd2[0] * rr2[1] - sd2[1] * rr2[0]) >= 0 ? 1 : -1, a0 = Math.atan2(sd2[1], sd2[0]);
        const rTip = rRing + 3.4, fdM = M("blackAnod");
        const sector = (r0, r1, aA, aB) => { const pts = [];
          for (let k = 0; k <= 16; k++) { const a = lerp(aA, aB, k / 16); pts.push([bbP[0] + r1 * Math.cos(a), bbP[1] + r1 * Math.sin(a)]); }
          for (let k = 16; k >= 0; k--) { const a = lerp(aA, aB, k / 16); pts.push([bbP[0] + r0 * Math.cos(a), bbP[1] + r0 * Math.sin(a)]); }
          let ar = 0; for (let i = 0; i < pts.length; i++) { const p1 = pts[i], p2 = pts[(i + 1) % pts.length]; ar += p1[0] * p2[1] - p2[0] * p1[1]; }
          return ar < 0 ? pts.reverse() : pts; };
        const aS = a0 + turn * 0.04, aE = a0 + turn * 0.62;                       // cage: from just behind the seat tube, ~60 mm round the ring
        plate(fdM, [0, 0, 0], X, Y, Z, sector(rTip + 2.5, rTip + 20, aS, aE), cl + 4.5, cl + 6.3);         // outer cage plate
        plate(fdM, [0, 0, 0], X, Y, Z, sector(rTip + 9, rTip + 20, aS, aS + turn * 0.3), cl - 6.5, cl - 5); // inner plate (shorter)
        const dirAt = (a, r) => [bbP[0] + r * Math.cos(a), bbP[1] + r * Math.sin(a)];
        const pB = dirAt(a0 + turn * 0.12, rTip + 30), pBat = dirAt(a0 + turn * 0.36, rTip + 31);
        blob(fdM, [pB[0], pB[1], 26], X, Y, Z, 13, 15, 16, 0.35, 10);           // body / linkage from the braze-on out to the cage
        blob(fdM, [pBat[0], pBat[1], 30], X, Y, Z, 17, 10, 9, 0.3, 10);         // AXS battery
        const pT = dirAt(a0, rTip + 30);
        cyl(M(matFor("seatTube", [pT[0], pT[1], 0])), [pT[0], pT[1], 6], [pT[0], pT[1], 13], 9, 9, 16);   // braze-on tab
        anchors.fd = [pB[0], pB[1], 26];
      }
      // rear: singlespeed cog (tooth profile, wide base, spacers, lockring) or cassette
      if (!geared) {
        const N = cogs[0], cs = seat([AX[0], AX[1]], pitchR(N), cl, N), col = RC.color || "#c8cacc";
        FSd.ssCog(dctx, { c: [AX[0], AX[1], cl], N, sh: FSd.pick("cog", RC.cogShape, "wmfg"), phase: cs.phase, color: col, text: RC.brandText, logoColor: Math.max(...hex2lin(col)) < 0.12 ? "#8d8f93" : "#5d5f63",
          keys: { body: metalKey(col, "cog"), spacer: dynMat(RC.spacerColor || "#1a1a1c", "anodised"), lock: metalKey(RC.lockringColor || "#2a2b2e", "lock") }, zHub: 20, zEnd: 57, uid: "c" });
      } else {
        cogs.forEach((N, k) => {
          const big = N >= 28, col = gset === "sramEagle" && big ? "#bfc1c4" : (RC.color || "#c8cacc");
          const dark = (parseInt(col.slice(1, 3), 16) || 200) < 80;
          const Mc = texMat("cog" + N + "_" + k, texSprocket(N, "cog", col, big ? "#202022" : null), { base: [1, 1, 1], metal: dark ? 0.55 : 1, rough: dark ? 0.32 : 0.26, clear: dark ? 0.2 : 0, twoSided: true });
          disc(Mc, V.add(AX, [0, 0, zCog(k) - AX[2]]), Z, pitchR(N) + 3.4, 1.8, Math.max(64, N * 4), [X, Y]);
        });
        cyl(M("silver"), V.add(AX, [0, 0, 60 - AX[2]]), V.add(AX, [0, 0, 64 - AX[2]]), 16, 15, 24);
      }
      // derailleur
      if (geared) {
        const xt = gset === "shimanoXT", bodyM = xt ? "xtGrey" : "blackAnod";
        for (const [pc, N] of [[Up, 12], [Lo, 14]]) {
          const Mp = texMat("pulley" + N, texSprocket(N, "pulley", "#18181a"), { base: [1, 1, 1], rough: 0.5, twoSided: true });
          disc(Mp, [pc[0], pc[1], zc], Z, pitchR(N) + 2.4, 5, 64, [X, Y]);
          cyl(M("silver"), [pc[0], pc[1], zc - 8], [pc[0], pc[1], zc + 9], 5, 5, 14);
        }
        plate(M(bodyM), [0, 0, 0], X, Y, Z, hullCircles([[Up[0], Up[1], 17], [Lo[0], Lo[1], 20]], 20), zc + 6, zc + 9);
        plate(M(bodyM), [0, 0, 0], X, Y, Z, hullCircles([[Up[0], Up[1], 12], [Lo[0], Lo[1], 15]], 20), zc - 9, zc - 6.5);
        const K = [AX[0] - 4, AX[1] - 18, stayHalf + 16], Pk = [Up[0] - 8, Up[1] + 6, zc + 16];
        blob(M(bodyM), K, X, Y, Z, 16, 22, 10, 0.35, 10);
        const dv = V.sub(Pk, K), Ld = V.len(dv), ax1 = V.norm(dv), ay1 = V.norm(V.cross(Z, ax1));
        blob(M(bodyM), V.lerp(K, Pk, 0.5), ax1, ay1, V.norm(V.cross(ax1, ay1)), Ld / 2 + 8, 17, 11, 0.32, 10);
        cyl(M(bodyM), [Pk[0], Pk[1], zc + 9], [Pk[0], Pk[1], zc + 24], 13, 12, 24);
        if (!xt) cyl(M("blackAnod"), [AX[0], AX[1], stayHalf + 6], [AX[0], AX[1], stayHalf + 18], 14, 13, 24);
        anchors.rd = K;
      }
      // pedals
      for (const s of [1, -1]) {
        const pe = anchors["pedal" + s]; if (!pe) continue;
        const pdK = dynMat(PE.color, "anodised"), pnK = dynMat(PE.pinColor, "polished");
        const z0 = pe[2] + s * 7.5;
        if (o.pedals === "candy") {
          // Crankbrothers Candy: hexagonal open aluminium body (front / back bars with tread pads, angled ends), steel spindle,
          // inboard bearing boss, silver end cap, two crossed stainless "eggbeater" wing loops, black torsion spring
          const zc = z0 + s * 41, zi = z0 + s * 12, zo = z0 + s * 70, ax = [0, 0, s];
          const bodyK = dynMat(PE.color || "#141416", "anodised"), wingK = dynMat(PE.pinColor || "#c8cacc", "polished"), capK = dynMat(PE.capColor || "#c3c5c9", "anodised");
          cyl(M("steel"), [pe[0], pe[1], z0], [pe[0], pe[1], zo - s * 4], 5.2, 4.6, 16);                                   // spindle
          cyl(M(bodyK), [pe[0], pe[1], z0 + s * 2], [pe[0], pe[1], zi + s * 6], 9.5, 10.5, 24);                              // inboard boss
          lathe(M(capK), [pe[0], pe[1], zo - s * 9], ax, [[0, 0], [10.4, 0], [10.4, 8.4], [9.6, 9.4], [6, 9.8], [0, 9.8]], 28); // end cap
          for (const fx of [-1, 1]) {
            // front / back bar with angled ends making the hexagon; flat on top and bottom
            const bp = [[pe[0] + fx * 9, pe[1], zi], [pe[0] + fx * 31, pe[1], zi + s * 13], [pe[0] + fx * 33, pe[1], zc], [pe[0] + fx * 31, pe[1], zo - s * 15], [pe[0] + fx * 9, pe[1], zo - s * 4]];
            sweep(M(bodyK), smoothPath(bp, 4), { rh: 7.4, rw: 5.6, exp: 4, ref: Y, seg: 16 });
            // traction pads: raised tread blocks on top of the bar near the ends, silver insert bands
            for (const zf of [0.3, 0.7]) {
              const q = [pe[0] + fx * 32, pe[1] + 7.2, lerp(zi, zo, zf)];
              blob(M(bodyK), q, X, Y, Z, 5.2, 1.0, 7, 0.25, 8);
              for (let k = -2; k <= 2; k++) blob(M("blackMatte"), V.add(q, [0, 1.0, k * 2.6]), X, Y, Z, 4.6, 0.25, 0.5, 0.3, 4);
            }
            blob(M(capK), [pe[0] + fx * 31.5, pe[1], lerp(zi, zo, fx > 0 ? 0.08 : 0.92)], X, Y, Z, 6.2, 7.6, 2.4, 0.3, 8);
          }
          // wings: two rectangular stainless loops crossing at about ±38° from flat, round the spindle
          for (const sg of [-1, 1]) {
            const d = [Math.cos(sg * 0.66), Math.sin(sg * 0.66), 0], hw = 21, hz = 15, loop = [];
            for (let k = 0; k <= 48; k++) { const t = k / 48 * 2 * Math.PI, c = Math.cos(t), sn = Math.sin(t);
              const u = Math.sign(c) * Math.min(1, Math.abs(c) * 1.6) * hw, w = Math.sign(sn) * Math.min(1, Math.abs(sn) * 1.6) * hz;
              loop.push(V.add(V.madd([pe[0], pe[1], zc], d, u), [0, 0, w])); }
            sweep(M(wingK), loop, { rh: 1.9, ref: V.norm(V.cross(d, Z)), seg: 8 });
          }
          // torsion spring coiled round the spindle
          const sp = []; for (let k = 0; k <= 96; k++) { const t = k / 96, a = t * 4.5 * 2 * Math.PI; sp.push([pe[0] + 7.4 * Math.cos(a), pe[1] + 7.4 * Math.sin(a), lerp(zc - s * 10, zc + s * 10, t)]); }
          sweep(M(dynMat(PE.springColor || "#121214", "gloss")), sp, { rh: 1.5, ref: Z, seg: 6 });
        } else if (o.pedals === "clip") {
          cyl(M("steel"), [pe[0], pe[1], z0], [pe[0], pe[1], z0 + s * 22], 7.5, 7, 16);
          blob(M(pdK), [pe[0], pe[1], z0 + s * 52], X, Y, Z, 38, 9, 34, 0.35, 10);
          blob(M(pnK), [pe[0], pe[1] + 6, z0 + s * 52], X, Y, Z, 26, 5, 20, 0.35, 8);
          blob(M(pnK), [pe[0], pe[1] - 6, z0 + s * 52], X, Y, Z, 26, 5, 20, 0.35, 8);
        } else {
          cyl(M("steel"), [pe[0], pe[1], z0], [pe[0], pe[1], z0 + s * 14], 7.5, 7, 16);
          const pc = [pe[0], pe[1], z0 + s * 58];
          blob(M(pdK), pc, X, Y, Z, 52, 7.5, 50, 0.22, 12);
          cyl(M(pdK), [pe[0], pe[1], z0 + s * 8], [pe[0], pe[1], z0 + s * 104], 11, 10, 18);
          for (const dx of [-46, 46]) for (let q = 0; q < 5; q++) { const zz = pc[2] + (q - 2) * 20; for (const dy of [-1, 1]) cyl(M(pnK), [pc[0] + dx, pc[1] + dy * 7, zz], [pc[0] + dx, pc[1] + dy * 11.5, zz], 1.7, 1.5, 6); }
        }
      }
    }

    // ---------------- cockpit: headset, spacers, stem, bar, grips, levers. Shapes are data in parts3d.js (FrameShapes.SHAPES);
    // the numbers / colours come from the cockpit part (partlib.js).
    const FS = root.FrameShapes;
    const stemSh = FS.pick("stem", CK.stemShape, "forged"), hsKey = FS.SHAPES.headset[CK.headset] ? CK.headset : "zs";
    const spacers = CK.spacers != null && CK.spacers !== "" && +CK.spacers >= 0 ? +CK.spacers : num(o.spacers, 10), clampH = clamp(num(CK.stemClampH, 40), 28, 55);
    const rise = num(o.stemRise, 0) * D2R, stemDir = V.add(V.mul(fw, Math.cos(rise)), V.mul(up, Math.sin(rise)));
    const isDrop = o.barType === "drop", barD = CK.barClamp === "31.8" ? 31.8 : 35;
    const stK = dynMat(CK.stemColor, CK.stemFinish || "anodised"), boltK = dynMat(CK.boltColor || "#1a1a1c", /^#[89a-f]/i.test(CK.boltColor || "") ? "polished" : "anodised");
    const hsK = dynMat(CK.headsetColor || "#151517", "anodised");
    const shapeCtx = { M, MAT, dyn: dynMat, tex: (k, cv, pr) => texMat(k, cv, pr), texText };
    const STM = FS.stem(shapeCtx, { htA, stemFrom: P.HTtop, up, fw: stemDir, rTop, headset: FS.SHAPES.headset[hsKey], headsetKey: hsKey, spacers, clampH, spacersAbove: clamp(num(CK.spacersAbove, 0), 0, 30), len: num(o.stemLength, 50), sh: stemSh, barD,
      faceplate: CK.faceplate === "2" ? 2 : 4, cap: FS.pick("topCap", CK.topCap, "flat"), logo: CK.stemLogo, logoColor: CK.stemLogoColor, drawHeadset: show.fork || show.cockpit, draw: show.cockpit,
      keys: { headset: hsK, spacer: dynMat(CK.spacerColor || CK.stemColor, CK.spacerColor ? "anodised" : (CK.stemFinish || "anodised")), stem: stK, bolt: boltK, cap: dynMat(CK.topCapColor || CK.stemColor, CK.stemFinish || "anodised") } });
    const stemBase = STM.stemBase, stemC = STM.stemC, barC = STM.barC;
    // lower headset cup: zero-stack (5 mm seal) or an external cup filling geometry.lowerCupStack down to the fork crown
    {
      const cupH = Math.max(5, num(g.lowerCupStack, 0));
      const prof = cupH > 6
        ? [[0, 0], [rBot + 0.6, 0], [rBot + 0.6, 0], [rBot + 0.6, cupH - 4], [rBot - 0.4, cupH - 2.6], [rBot - 2.6, cupH - 1.6], [rBot - 3.4, cupH], [0, cupH]]
        : [[0, 0], [rBot - 0.5, 0], [rBot - 0.5, 0], [rBot - 1, 3.5], [rBot - 3, 5], [0, 5]];
      if (show.fork || show.cockpit) lathe(M(hsK), htB, V.mul(up, -1), prof, 48);
    }
    if (show.cockpit) {
      const carbonBar = CK.barMaterial === "carbon" || CK.barMaterial === "carbonUD";
      const barK = dynMat(CK.barColor, carbonBar ? (CK.barFinish === "gloss" ? "gloss" : "matte") : (CK.barFinish || "anodised"), carbonBar ? CK.barMaterial : ""), grK = dynMat(CK.gripColor, "matte");
      let bandK = null;
      if (CK.barBand) { const k0 = dynMat(CK.barBand, "gloss"); bandK = k0 + "_band"; MAT[bandK] = Object.assign({}, MAT[k0], { decal: true }); }
      const W = num(o.barWidth, 760) / 2, rz = num(o.barRise, 20), bs = num(o.backsweep, 8) * D2R, us = num(o.upsweep, 5) * D2R;
      // drop bar: the shape preset's numbers, replaced by the part's published geometry (reach, drop, flare, flare-out, sweep, rise)
      const dropSh = isDrop ? Object.assign({}, FS.SHAPES.bar.drop, { reach: clamp(num(CK.dropReach, 78), 55, 100), drop: clamp(num(CK.dropDrop, 122), 85, 150), flare: clamp(num(CK.dropFlare, 12), 0, 40),
        flareOut: clamp(num(CK.dropFlareOut, 0), 0, 20), sweep: clamp(num(CK.dropSweep, 0), 0, 25), rise: clamp(num(CK.dropRise, 0), 0, 50), widthAt: CK.widthAt === "drops" ? "drops" : "hoods" }) : null;
      const BAR = FS.bar(shapeCtx, { barC, type: isDrop ? "drop" : "flat", sh: isDrop ? dropSh : FS.SHAPES.bar.flat, W: isDrop ? Math.min(W, 300) : W, rise: rz, bs, us, D: barD,
        keys: { bar: barK, band: bandK, grip: grK, collar: dynMat(CK.collarColor || "#1a1a1c", "anodised"), bolt: boltK, plug: "blackMatte", lever: isDrop && BK.dropLeverColor ? dynMat(BK.dropLeverColor, "gloss", BK.bladeMaterial === "carbon" ? "carbonUD" : "") : brakeKey },
        logo: CK.barLogo, logoColor: CK.barLogoColor, logo2: CK.barText2, logo2Color: CK.barText2Color, bandOn: !!bandK,
        grip: { tp: FS.pick("gripType", CK.gripType, "lockon1"), pat: isDrop ? FS.SHAPES.grip.tape : FS.pick("grip", CK.gripPattern, "waffle"), L: clamp(num(CK.gripLength, 135), 90, 165) }, draw: true });
      const barPt = BAR.pt;
      anchors.lever = {};
      // Hope XCR Pro lever: radial master cylinder (piston at right angles to the bar) on a hinge clamp, round reservoir
      // cap on top, slim one-finger blade (carbon on the Pro) on an alloy knuckle with the reach-adjust screw.
      // b = bar point at the clamp, bt = along the bar towards the grip. Returns where the hose leaves the lever.
      function leverHope(b, bt, s, tilt) {
        const upL = V.norm(V.sub(Y, V.mul(bt, V.dot(Y, bt)))), fwdL = V.mul(V.norm(V.cross(bt, upL)), -s);
        const roll = -(tilt == null ? 22 : tilt) * D2R, dm = V.norm(V.add(V.mul(fwdL, Math.cos(roll)), V.mul(upL, Math.sin(roll)))), um = V.norm(V.cross(dm, V.mul(bt, -s)));
        const bodyK = brakeKey, bladeK = BK.bladeMaterial === "carbon" ? dynMat(BK.bladeColor || "#141416", "gloss", "carbon") : dynMat(BK.bladeColor || "#c8cacc", BK.finish || "anodised");
        // hinge clamp round the bar, hinge lug behind, Ti clamp bolt underneath
        lathe(M(bodyK), V.madd(b, bt, -7), bt, [[11.2, 0], [14.6, 0], [15.6, 1], [15.6, 13], [14.6, 14], [11.2, 14]], 32);
        blob(M(bodyK), V.madd(V.madd(b, um, 9), dm, -12), bt, dm, um, 6.5, 5, 5, 0.4, 8);
        const cb = V.madd(V.madd(b, um, -14), dm, 6);
        cyl(M("tiBolt"), V.madd(cb, dm, -6), V.madd(cb, dm, 6), 2.6, 2.6, 10); cyl(M("tiBolt"), V.madd(cb, dm, 6), V.madd(cb, dm, 9.5), 4.2, 4.2, 12);
        // master cylinder body (rounded box), integral reservoir with round cap
        const m0 = V.madd(b, dm, 10), m1 = V.madd(b, dm, 44), mp = [];
        for (let k = 0; k <= 8; k++) mp.push(V.lerp(m0, m1, k / 8));
        sweep(M(bodyK), mp, { rh: mp.map((_, k) => lerp(11.5, 8.5, k / 8)), rw: mp.map((_, k) => lerp(8, 7.5, k / 8)), exp: 3.2, ref: bt, seg: 20, cap1: "dome", domeDepth: 4 });
        const rc = V.madd(V.madd(b, dm, 25), um, 7);
        lathe(M(bodyK), rc, um, [[0, 0], [10.5, 0], [10.5, 0], [10.5, 3.2], [9.8, 4.2], [0, 4.2]], 32);
        lathe(M("small"), V.madd(rc, um, 4.2), um, [[0, 0], [9, 0], [9, 0], [9, 0.7], [8.4, 1.3], [0, 1.3]], 32);
        for (const k of [-1, 1]) cyl(M("tiBolt"), V.madd(V.madd(rc, um, 5.4), dm, k * 5.2), V.madd(V.madd(rc, um, 5.9), dm, k * 5.2), 1.5, 1.5, 8);
        // pivot knuckle at the front of the body (pivot pin along the bar), reach adjust grub screw facing forward
        const pv = V.madd(V.madd(b, dm, 42), um, -2);
        blob(M(bodyK), V.madd(pv, bt, 6), bt, dm, um, 13, 7, 7.5, 0.45, 10);
        for (const k of [-1, 1]) cyl(M("tiBolt"), V.madd(pv, bt, k > 0 ? 18 : -6.5), V.madd(pv, bt, k > 0 ? 20 : -8.5), 3.4, 3.4, 12);
        cyl(M("blackAnod"), V.madd(V.madd(pv, bt, 2), dm, 7), V.madd(V.madd(pv, bt, 2), dm, 8.2), 2.2, 2.2, 8);
        // blade: slim one-finger blade sweeping out along the bar, slight hook back and down at the tip
        const lv = [];
        for (let k = 0; k <= 12; k++) { const t = k / 12; lv.push(V.add(V.add(V.madd(pv, bt, 12 + 72 * t), V.mul(dm, 3 - 4 * t - 8 * t * t * t)), V.mul(um, -2 - 7 * t * t))); }
        sweep(M(bladeK), lv, { rh: lv.map((_, k) => lerp(7.5, 5.2, Math.sqrt(k / 12))), rw: lv.map((_, k) => lerp(4, 2.8, k / 12)), exp: 2.6, ref: dm, seg: 14, cap0: "flat", cap1: "dome", domeDepth: 3 });
        // straight hose fitting on the inboard side of the body
        const hf = V.madd(V.madd(V.madd(b, dm, 34), um, -5), bt, -7), hd = V.norm(V.add(V.mul(bt, -0.85), V.mul(um, -0.5)));
        cyl(M(bodyK), hf, V.madd(hf, hd, 5), 4.6, 4.6, 14); cyl(M("steel"), V.madd(hf, hd, 5), V.madd(hf, hd, 12), 3.5, 3.4, 12);
        return V.madd(hf, hd, 11.5);
      }
      if (isDrop) Object.assign(anchors.lever, BAR.levers);
      else {
        const gIn = BAR.gripIn, inb = clamp(num(CK.leverInboard, 18), 0, 80), tilt = clamp(num(CK.leverAngle, 22), 0, 60);
        for (const s of [-1, 1]) {
          // brake lever (front brake on the left, rear on the right): clamp edge 'inb' mm inboard of the grip / collar
          const lz = s * (gIn - inb - 7), b = barPt(lz), bt = V.norm(V.sub(barPt(lz + s), b));
          if (BK.leverStyle === "hope-xcr") anchors.lever[s] = leverHope(b, bt, s, tilt);
          else {
          cyl(M(brakeKey), V.madd(b, bt, -7), V.madd(b, bt, 7), 15, 15, 24);
          const mc = V.add(V.madd(b, bt, -20), [10, 11, 0]);
          blob(M(brakeKey), mc, bt, Y, V.norm(V.cross(bt, Y)), 24, 10, 11, 0.35, 10);
          const piv = V.add(b, [27, 6, 0]), lv = [];
          for (let k = 0; k <= 10; k++) { const t = k / 10; lv.push(V.add(V.madd(piv, bt, 90 * t), [8 * Math.sin(t * 2.2), -6 - 18 * t * t, 0])); }
          const bladeStd = o.brakes === "sram" ? "blackAnod" : BK.bladeMaterial === "carbon" ? dynMat(BK.bladeColor || "#141416", "gloss", "carbon") : BK.bladeColor && BK.bladeColor.toLowerCase() !== "#c8cacc" ? dynMat(BK.bladeColor, BK.finish || "anodised") : "silver";
          sweep(M(bladeStd), lv, { rh: 3.2, rw: 7, ref: Y, seg: 12, cap1: "dome", domeDepth: 3 });
          anchors.lever[s] = mc;
          }
          // dropper remote (left, under the bar, inboard of the lever) / shifter (right, geared bikes): own clamp, thumb paddle
          const rz2 = s * (gIn - inb - 14 - 26), rb = barPt(rz2), rt = V.norm(V.sub(barPt(rz2 + s), rb)), rup = V.norm(V.sub(Y, V.mul(rt, V.dot(Y, rt)))), rfw = V.mul(V.norm(V.cross(rt, rup)), -s);
          const R0 = BAR.R(rz2);
          if (s < 0 && show.post) {
            lathe(M("blackAnod"), V.madd(rb, rt, -5), rt, [[R0 + 0.2, 0], [R0 + 3.2, 0], [R0 + 3.6, 0.5], [R0 + 3.6, 9.5], [R0 + 3.2, 10], [R0 + 0.2, 10]], 28);
            const bd = V.madd(V.madd(rb, rup, -(R0 + 6)), rfw, -3);
            blob(M("blackAnod"), bd, rt, rup, rfw, 8, 6.5, 9, 0.4, 8);
            const pd = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pd.push(V.add(V.madd(V.madd(bd, rfw, -6 - 18 * t), rup, -4 - 6 * t * t), V.mul(rt, -s * 4 * t))); }
            sweep(M("blackMatte"), pd, { rh: 5.5, rw: 2.2, exp: 3, ref: rup, seg: 10, cap1: "dome", domeDepth: 2 });
            anchors.remote = V.madd(bd, rt, -s * 8);
          }
          if (s > 0 && geared) { const sh = V.add(V.madd(b, bt, -44), [-4, -16, 0]); blob(M(gset === "shimanoXT" ? "xtGrey" : "blackAnod"), sh, bt, Y, V.norm(V.cross(bt, Y)), 18, 10, 13, 0.4, 8); anchors.shifter = sh; }
        }
      }
    }

    // ---------------- seatpost & saddle
    const SP = PR ? PR.seatpost : null;
    const DR = SP ? { travel: SP.type === "dropper" ? +SP.travel : 0, stack: +SP.stack || 30, collar: +SP.collar || 12, stanchion: +SP.stanchion || 26 } : (FP.DROPPERS[o.dropper] || FP.DROPPERS.oneupV3_150);
    const expo = geo.postExposure, uST = geo.uST, poK = dynMat(SP ? SP.color : "#141416", "anodised"), psK = SP ? dynMat(SP.stanchionColor, "gloss") : "stanBlack";
    const atS = s => V.madd(P.STtop, uST, s), fit = (res.comfort && res.comfort.post && res.comfort.post.fit) || 31.6;
    if (show.post) {
      if (DR.travel > 0) {
        const outerShow = expo - (DR.collar + DR.stack + DR.travel), collarAt = Math.max(0, outerShow);
        if (collarAt > 0) cyl(M(poK), atS(-4), atS(collarAt), fit / 2, fit / 2, 32, { caps: false });
        const coK = SP && SP.collarColor ? dynMat(SP.collarColor, "anodised") : poK;
        lathe(M(coK), atS(collarAt), uST, [[DR.stanchion / 2, 0], [fit / 2 + 2.5, 0], [fit / 2 + 3.2, 1], [fit / 2 + 3.2, DR.collar - 1], [fit / 2 + 2, DR.collar], [DR.stanchion / 2 + 0.6, DR.collar + 1.2]], 36);
        if (SP && SP.head === "oneupV2") {   // wiper seal lip on top of the collar
          lathe(M("rubber"), atS(collarAt + DR.collar - 0.2), uST, [[DR.stanchion / 2 + 0.05, 0], [DR.stanchion / 2 + 3, 0], [DR.stanchion / 2 + 2.6, 1.6], [DR.stanchion / 2 + 0.05, 2.0]], 36);
          // two spanner flats on the collar
          for (const sg of [-1, 1]) blob(M("blackMatte"), V.add(atS(collarAt + DR.collar / 2), [0, 0, sg * (fit / 2 + 3.15)]), uST, X, [0, 0, sg], DR.collar / 2 - 1.6, 6, 0.08, 0.3, 6);
        }
        if (SP && SP.logoText && collarAt > 30) {   // logo up the front of the outer tube (only when enough of it shows)
          const Ml = texMat("postLogo_" + SP.logoText + SP.logoColor, texText(SP.logoText, "800 150px 'Arial Black', Arial, sans-serif", SP.logoColor || "#9a9ca0", null, 1024, 192), { base: [1, 1, 1], decal: true, rough: 0.4, clear: 0.3 });
          const fwd = V.norm(V.cross(uST, Z)), fw2 = V.dot(fwd, X) < 0 ? fwd : V.mul(fwd, -1), L = Math.min(collarAt - 8, 10 + 7 * SP.logoText.length), y0 = collarAt - 4 - L;
          Ml.grid(12, 4, (i, j) => { const ss = y0 + L * i / 12, th = lerp(-0.42, 0.42, j / 4), nn = V.add(V.mul(fw2, Math.cos(th)), [0, 0, Math.sin(th)]);
            return { p: V.madd(atS(ss), nn, fit / 2 + 0.08), n: nn, uv: [i / 12, j / 4], t: uST }; });
        }
        cyl(M(psK), atS(collarAt + DR.collar), atS(expo - 16), DR.stanchion / 2, DR.stanchion / 2, 32, { caps: false });
      } else cyl(M(poK), atS(-4), atS(expo - 12), fit / 2, fit / 2, 32, { caps: false });
      const HD = root.FrameShapes.pick("postHead", SP && SP.head, "generic"), hdK = poK, Mbo = M(SP && SP.boltColor ? dynMat(SP.boltColor, "anodised") : "steel");
      if (HD === root.FrameShapes.SHAPES.postHead.generic) {
        blob(M(poK), V.madd(P.Saddle, uST, -10), uST, V.norm(V.cross(Z, uST)), Z, 12, 16, 16, 0.5, 10);
        blob(M(poK), V.add(P.Saddle, [0, -4, 0]), X, Y, Z, 34, 7, 24, 0.3, 10);
        for (const dx of [-20, 20]) cyl(M("silver"), V.add(P.Saddle, [dx, -16, 0]), V.add(P.Saddle, [dx, 6, 0]), 3.6, 3.6, 10);
      } else {
        // low two-bolt head: neck off the stanchion, lower cradle (fore-aft bolts from underneath), rail clamps either side,
        // slotted top cradle with barrel nuts on top, Schrader valve under the head
        const sideZ = V.norm(V.cross(Z, uST)), hr = DR.stanchion / 2 + 2.2;
        lathe(M(hdK), V.madd(P.Saddle, uST, -HD.h), uST, [[0, 0], [hr, 0], [hr, HD.h * 0.45], [hr + 1.5, HD.h * 0.7], [0, HD.h * 0.7]], 32);
        const yC = P.Saddle[1] - 7;
        blob(M(hdK), [P.Saddle[0], yC, 0], X, Y, Z, HD.L / 2, 5.2, 12, 0.3, 12);                         // lower cradle
        for (const sg of [-1, 1]) {
          blob(M(hdK), [P.Saddle[0], P.Saddle[1] - 1.5, sg * 21], X, Y, Z, HD.L / 2 - 6, 4.4, 4.2, 0.35, 10);   // rail cradles (under the rails)
          blob(M(hdK), [P.Saddle[0], P.Saddle[1] + 4.2, sg * 21], X, Y, Z, HD.L / 2 - 8, 2.2, 5.4, 0.35, 10);   // top clamp plates
        }
        blob(M(hdK), [P.Saddle[0], P.Saddle[1] + 5.4, 0], X, Y, Z, HD.L / 2 - 10, 1.8, 21, 0.3, 10);       // top cradle bridge
        for (const dx of [-HD.L / 2 + 8, HD.L / 2 - 8]) {
          // bolt from underneath up through the cradle, barrel nut on top (slotted cradle: the nut shows in a slot)
          cyl(Mbo, [P.Saddle[0] + dx, yC - 9, 0], [P.Saddle[0] + dx, yC - 5.2, 0], 4.2, 4.2, 18);
          cyl(M("blackMatte"), [P.Saddle[0] + dx, yC - 9.1, 0], [P.Saddle[0] + dx, yC - 9, 0], 2.1, 2.1, 6);
          cyl(Mbo, [P.Saddle[0] + dx, yC - 5.2, 0], [P.Saddle[0] + dx, P.Saddle[1] + 8, 0], 2.5, 2.5, 10);
          cyl(Mbo, [P.Saddle[0] + dx, P.Saddle[1] + 7.2, -6], [P.Saddle[0] + dx, P.Saddle[1] + 7.2, 6], 3.6, 3.6, 14);
          if (HD.slotted) blob(M("blackMatte"), [P.Saddle[0] + dx, P.Saddle[1] + 6.6, 0], X, Y, Z, 3, 1.2, 4.2, 0.3, 6);
        }
        if (HD.valve) { const vb = V.madd(P.Saddle, uST, -HD.h + 1); cyl(M("blackAnod"), vb, V.madd(vb, uST, -4), 3.4, 3.4, 12); cyl(M("brass") , V.madd(vb, uST, -4), V.madd(vb, uST, -6), 2.2, 2.2, 10); }
      }
      const lattice = SA.top === "lattice", SD = Object.assign({}, FP.SADDLES[o.saddle] || FP.SADDLES.shortNose);
      if (+SA.length > 0) SD.length = +SA.length; if (+SA.width > 0) SD.width = +SA.width;
      MAT.saddle.base = hex2lin((lattice ? SA.shellColor : SA.color) || "#303032").map(v => v / 0.03);
      if (lattice) Object.assign(MAT.saddle, { rough: 0.48, clear: 0.25, sheen: 0.2 });
      let latt = null;
      if (lattice) {
        // 3D-printed lattice texture: solid colour with hexagonal holes (alpha); holes largest under the sit bones, smaller towards
        // the nose and edges (the printed density changes); no lattice over the centre cut-out
        const mkLat = (shade) => { const cv = document.createElement("canvas"); cv.width = cv.height = 1024; const x = cv.getContext("2d"), sx = 1024 / 280, sy = 1024 / 160;
          x.fillStyle = shade; x.fillRect(0, 0, 1024, 1024); x.globalCompositeOperation = "destination-out"; x.fillStyle = "#000";
          const cell = 7.2, Ls = SD.length;
          for (let row = 0; row * cell * 0.866 < 160; row++) for (let col = 0; col * cell < 280; col++) {
            const mx = col * cell + (row % 2 ? cell / 2 : 0), mz = row * cell * 0.866 - 80, u = mx / Math.max(1, Ls);   // u: 0 tail … 1 nose
            const sit = Math.exp(-Math.pow((u - 0.25) / 0.3, 2)), edge = 1 - Math.pow(Math.min(1, Math.abs(mz) / (SD.width / 2)), 4);
            const r = cell * (0.33 + 0.12 * sit) * Math.max(0.45, edge);
            x.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; x.lineTo((mx + r * Math.cos(a)) * sx, (mz + 80 + r * Math.sin(a)) * sy); } x.closePath(); x.fill();
          }
          if (SD.cutout) { x.beginPath(); x.ellipse((0.41 * Ls) * sx, 80 * sy, 0.15 * Ls * sx, 6.5 * sy, 0, 0, Math.PI * 2); x.fill(); }
          return cv; };
        // textures are sampled as linear values: draw the lattice white and put the colour in the material
        const lc = SA.color || "#1c1c1e", props = { base: hex2lin(lc), rough: 0.72, sheen: 0.18, twoSided: true };
        latt = [texMat("saddleLatTop_" + lc + SD.length + SD.width, mkLat("#ffffff"), props), texMat("saddleLatLow_" + lc + SD.length + SD.width, mkLat("#ffffff"), Object.assign({}, props, { base: hex2lin(lc).map(v => v * 0.45) }))];
      }
      const railK = SA.railMaterial === "carbon" ? dynMat(SA.railColor || "#141416", "matte", "carbonUD") : dynMat(SA.railColor || "#c8c8ca", "polished");
      let railScale = null;
      if (SA.railMaterial === "carbon") {   // "Min | 0 5 10 15 20 25 | Max" fore-aft position scale (white print)
        const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 96; const x = cv.getContext("2d");
        x.fillStyle = "#ffffff"; x.strokeStyle = "#ffffff"; x.font = "600 30px Arial, sans-serif"; x.textBaseline = "middle"; x.textAlign = "center";
        x.fillText("Min", 70, 48); x.fillText("Max", 954, 48); x.lineWidth = 3;
        for (let k = 0; k <= 5; k++) { const xx = 190 + k * 128; x.beginPath(); x.moveTo(xx, 24); x.lineTo(xx, 72); x.stroke(); x.font = "600 26px Arial, sans-serif"; x.fillText(String(k * 5), xx + 30, 48); }
        x.beginPath(); x.moveTo(130, 48); x.lineTo(160, 48); x.moveTo(864, 48); x.lineTo(894, 48); x.stroke();
        railScale = texMat("railScale", cv, { base: [0.8, 0.8, 0.8], decal: true, rough: 0.5 });
      }
      saddleMesh(M("saddle"), M(railK), SD, P.Saddle, P.Saddle[1] + num(g.saddleStack, 45), { lattice: latt, carbonRails: SA.railMaterial === "carbon", railScale });
      if (SA.brandText && lattice) {   // small text on the back of the shell
        const Mt = texMat("saddleTxt_" + SA.brandText, texText(SA.brandText, "800 150px Arial, sans-serif", SA.textColor || "#8c8e92", null, 1024, 192), { base: [1, 1, 1], decal: true, rough: 0.4 });
        const tx = P.Saddle[0] - 0.48 * SD.length + 1.2, ty = P.Saddle[1] + num(g.saddleStack, 45) - 4;
        Mt.grid(2, 2, (i, j) => ({ p: [tx - 0.4, ty - 3 + 6 * j / 2, lerp(-26, 26, i / 2)], n: [-1, 0, 0], uv: [1 - i / 2, j / 2], t: [0, 0, 1] }));
      }
    }

    // ---------------- hoses and cables
    if (show.cockpit && anchors.lever) {
      const dtA = at("BB"), dtB = at("DTht"), dd = V.norm(V.sub(dtB, dtA)), dn = V.norm(V.cross(dd, Z)), dtR = (tb.downTube.h || tb.downTube.od || 44.5) / 2;
      const dtPt = (f, side, off) => V.add(V.madd(V.lerp(dtA, dtB, f), dn, dtR + (off || 4)), [0, 0, side]);
      // brake hoses: colour from the brakes part; Hope's banjo hands over an exit direction so the hose leaves it straight
      const hoseKey = BK.hoseColor && BK.hoseColor.toLowerCase() !== "#151517" ? dynMat(BK.hoseColor, "gloss") : "rubber", hoseR = o.brakes === "hope-x2" ? 2.5 : 2.6;
      // internal routing (cockpit part "routing"): rear hose and dropper enter ports on the left of the down tube, hose exits the chainstay
      // routing "headset" (v10.18, e.g. FSA ACR): both hoses dive into the headset top cover in front of the steerer; inside the frame
      // they run as "internal" (rear out of the non-drive chainstay port, front out of the fork's blade port)
      const viaHs = CK.routing === "headset", internal = CK.routing === "internal" || viaHs;
      const hsIn = side => V.add(V.madd(V.madd(htA, up, 6), fw, rTop - 1.5), [0, 0, side * 5]);
      const hsRun = (start, side) => { const e = hsIn(side); return [start, V.add(start, [30, -16, -side * 8]), V.add(V.madd(V.madd(htA, up, 30), fw, 62), [0, 0, side * 14]), V.add(V.madd(e, fw, 16), [0, 0, side * 2]), V.madd(e, fw, 4), e]; };
      // port grommet on the side of the down tube (side -1 = left / non-drive, +1 = right / drive)
      const dtPort = (f, side) => { side = side || -1; const p = V.add(V.lerp(dtA, dtB, f), [0, 0, side * (dtR - 0.6)]); lathe(M("blackMatte"), V.add(p, [0, 0, -side * 1.2]), [0, 0, side], [[2.7, 0], [4.8, 0], [5.2, 0.6], [5.2, 1.6], [4.6, 2.2], [2.7, 2.2]], 20); return p; };
      // a tidy run from a lever / remote past the side of the head tube into a down-tube port
      const htMid = V.lerp(htA, htB, 0.62), htRun = (start, side, port) => [start, V.add(start, [26, -26, -side * 10]), V.add(V.madd(htMid, fw, rTop * 0.55), [0, 0, side * (rTop + 9)]),
        V.add(port, V.add(V.mul(dd, 34), [0, 0, side * 9])), V.add(port, V.add(V.mul(dd, 8), [0, 0, side * 3])), port];
      const calEnd = (k, off) => anchors[k + "dir"] ? [V.madd(anchors[k], anchors[k + "dir"], 26), V.madd(anchors[k], anchors[k + "dir"], 8), anchors[k]] : [V.add(anchors[k], off)];
      if (viaHs && anchors.calF && show.fork && show.rotors && anchors.lever[-1]) {
        sweep(M(hoseKey), smoothPath(hsRun(anchors.lever[-1], -1), 10), { rh: hoseR, ref: Y, seg: 8 });
        if (anchors.forkPortOut) { const pout = anchors.forkPortOut;
          sweep(M(hoseKey), smoothPath([pout, V.madd(pout, fw, -6), V.madd(V.lerp(pout, anchors.calF, 0.5), fw, -10)].concat(calEnd("calF", [0, 0, 0])), 8), { rh: hoseR, ref: Y, seg: 8 }); }
      } else if (anchors.calF && show.fork && show.rotors && anchors.lever[-1] && anchors.forkPortIn) {
        // gravel fork: hose runs in front of the head tube, into a port at the back of the left blade, out above the caliper
        const L0 = anchors.lever[-1], s0 = V.add(L0, [30, -14, 6]), pin = anchors.forkPortIn, pout = anchors.forkPortOut;
        const pts = [L0, s0, V.add(V.madd(steerAt(a2c + 60), fw, 60), [0, 0, -40]), V.add(V.madd(steerAt(a2c - 10), fw, -42), [0, 0, -38]), V.madd(pin, fw, -16), V.madd(pin, fw, -5), pin];
        sweep(M(hoseKey), smoothPath(pts, 10), { rh: hoseR, ref: Y, seg: 8 });
        const p2 = [pout, V.madd(pout, fw, -6), V.madd(V.lerp(pout, anchors.calF, 0.5), fw, -10)].concat(calEnd("calF", [0, 0, 0]));
        sweep(M(hoseKey), smoothPath(p2, 8), { rh: hoseR, ref: Y, seg: 8 });
      } else if (anchors.calF && show.fork && show.rotors && anchors.lever[-1]) {
        const L0 = anchors.lever[-1], s0 = V.add(L0, [30, -14, 6]);
        const pts = [L0, s0, V.add(V.madd(steerAt(a2c + 60), fw, 70), [0, 0, -45]), V.add(V.madd(legAt(-1, a2c - 70), fw, -(rS + 18)), [0, 0, -10]), V.madd(legAt(-1, a2c - 220), fw, -(rL + 8))].concat(calEnd("calF", [0, 0, -12]));
        sweep(M(hoseKey), smoothPath(pts, 10), { rh: hoseR, ref: Y, seg: 8 });
      }
      if (anchors.calR && show.rotors && anchors.lever[1]) {
        const L0 = anchors.lever[1], csL = tubeEnds["Chainstay (non-drive)"];
        const along = csL ? [0.25, 0.5, 0.75].map(f => { const p = csL.pts[Math.round(f * (csL.pts.length - 1))]; return V.add(p, [0, 16, -4]); }) : [];
        if (internal && csL) {
          // in: drive-side port near the head tube (the rear lever is on the right). Inside the down tube it crosses over and
          // comes out of a port on top of the non-drive chainstay just behind the BB, then runs along the stay to the caliper.
          if (viaHs) sweep(M(hoseKey), smoothPath(hsRun(L0, 1), 10), { rh: hoseR, ref: Y, seg: 8 });
          else { const port = dtPort(0.86, 1); sweep(M(hoseKey), smoothPath(htRun(L0, 1, port), 10), { rh: hoseR, ref: Y, seg: 8 }); }
          const nP = csL.pts.length - 1, csAt = f => csL.pts[Math.round(f * nP)], rr0 = csL.start.rh || 9;
          const q = csAt(0.12), tq = V.norm(V.sub(csAt(0.2), csAt(0.04))), upQ = V.norm(V.sub(Y, V.mul(tq, V.dot(Y, tq)))), ex = V.madd(q, upQ, rr0 - 0.6);
          lathe(M("blackMatte"), V.madd(ex, upQ, -1.2), upQ, [[2.7, 0], [4.8, 0], [5.2, 0.6], [5.2, 1.6], [4.6, 2.2], [2.7, 2.2]], 20);
          const calStart = anchors.calRdir ? V.madd(anchors.calR, anchors.calRdir, 26) : anchors.calR;
          const run = [0.3, 0.5, 0.7, 0.85].map(f => { const p = csAt(f), t = V.norm(V.sub(csAt(Math.min(1, f + 0.05)), csAt(Math.max(0, f - 0.05)))), u = V.norm(V.sub(Y, V.mul(t, V.dot(Y, t)))); return V.add(V.madd(p, u, (csL.start.rh || 9) * lerp(1, 0.8, f) + hoseR + 0.4), [0, 0, 2.5]); })
            .filter(p => V.dist(p, AX) > V.dist(calStart, AX) + 12);
          sweep(M(hoseKey), smoothPath([ex, V.madd(ex, upQ, 5)].concat(run).concat(calEnd("calR", [0, 0, -14])), 10), { rh: hoseR, ref: Y, seg: 8 });
          // zip-tie / guide clips holding it to the stay
          for (const p of run.slice(0, 3)) lathe(M("blackMatte"), V.add(p, [0, 0, 0]), V.norm(V.sub(run[Math.min(run.length - 1, 1)], run[0])), [[hoseR + 0.1, -2], [hoseR + 1.2, -2], [hoseR + 1.2, 2], [hoseR + 0.1, 2]], 14);
        } else {
        const pts = [L0, V.add(L0, [36, -22, -6]), V.add(V.madd(htB, fw, 55), [0, 0, 22]), dtPt(0.85, 8), dtPt(0.5, 8), dtPt(0.12, 6, 3), V.add(bbP, [-20, -bbR - 6, -20])].concat(along.filter(q => !anchors.calRdir || V.dist(q, AX) > V.dist(V.madd(anchors.calR, anchors.calRdir, 26), AX) + 15)).concat(calEnd("calR", [0, 0, -14]));
        sweep(M(hoseKey), smoothPath(pts, 10), { rh: hoseR, ref: Y, seg: 8 });
        }
      }
      if (anchors.remote && show.post && DR.travel > 0) {
        const r0 = anchors.remote, entry = V.madd(V.madd(ST0, STax, 95), V.norm(V.cross(STax, Z)), stR + 1);
        const port = internal ? dtPort(0.86, -1) : null;
        const pts = internal ? htRun(r0, -1, port)
          : [r0, V.add(r0, [40, -30, 10]), V.add(V.madd(htB, fw, 50), [0, 0, -22]), dtPt(0.85, -9), dtPt(0.5, -9), dtPt(0.25, -10, 6), V.madd(entry, V.norm(V.cross(STax, Z)), 14), entry];
        sweep(M("rubber"), smoothPath(pts, 10), { rh: 2.5, ref: Y, seg: 8 });
      }
      if (anchors.shifter && anchors.rd && gset === "shimanoXT" && show.drive) {
        const csR = tubeEnds["Chainstay (drive side)"];
        const along = csR ? [0.3, 0.6, 0.85].map(f => { const p = csR.pts[Math.round(f * (csR.pts.length - 1))]; return V.add(p, [0, 15, 6]); }) : [];
        const pts = [anchors.shifter, V.add(anchors.shifter, [40, -26, -4]), V.add(V.madd(htB, fw, 50), [0, 0, 28]), dtPt(0.85, 14), dtPt(0.5, 14), dtPt(0.12, 10, 3), V.add(bbP, [-18, -bbR - 4, 22])].concat(along).concat([V.add(anchors.rd, [6, 14, 2]), anchors.rd]);
        sweep(M("blackMatte"), smoothPath(pts, 10), { rh: 2.4, ref: Y, seg: 8 });
      }
    }

    // ---------------- upload
    for (const k in B) R.add(B[k], MAT[k] || MAT.blackAnod);
    const yR = P.AxleR[1] - R0r, yF = P.AxleF[1] - R0f;
    const gq = new Mesh(), gy = yR - 0.3, cx = (P.AxleR[0] + P.AxleF[0]) / 2;
    const g0 = gq.v([cx - 6000, gy, -6000], Y), g1 = gq.v([cx + 6000, gy, -6000], Y), g2 = gq.v([cx + 6000, gy, 6000], Y), g3 = gq.v([cx - 6000, gy, 6000], Y);
    gq.tri(g0, g1, g2); gq.tri(g0, g2, g3);
    R.add(gq, MAT.ground);
    const topY = Math.max(P.Saddle[1] + num(g.saddleStack, 45) + 10, barC[1] + 40);
    return {
      tilt: Math.atan2(yF - yR, P.AxleF[0] - P.AxleR[0]), pivot: [P.AxleR[0], yR],
      contacts: [[P.AxleR[0], yR, 0], [P.AxleF[0], yR, 0]], groundY: gy,
      bbox: { x0: P.AxleR[0] - R0r - 10, x1: P.AxleF[0] + R0f + 10, y0: yR, y1: topY, z: Math.min(Math.max(num(o.barWidth, 760) / 2, 200), 420) /* frame+wheels fit; a silly bar width never pushes the camera away */ },
      info: { gset, fork: forkCat, a2cGeo: num(g.forkA2C, 0) },
      // close-up targets for focus() (see FOCUS_DEF below for each one's default angle / zoom)
      focus: { fork: V.lerp(crownP, axF, 0.45), crank: bbP, rear: [AX[0], AX[1], 30], front: [axF[0], axF[1], 0], cockpit: barC, saddle: P.Saddle, headtube: V.lerp(htA, htB, 0.5),
        caliperF: anchors.calF || [axF[0], axF[1] + rotorF / 2, zRotF], caliperR: anchors.calR || [AX[0], AX[1], -55],
        lever: (anchors.lever && anchors.lever[-1]) || V.add(barC, [0, 0, -num(o.barWidth, 760) / 2 + 90]),
        hubF: [axF[0], axF[1], 0], hubR: [AX[0], AX[1], 0], pedal: anchors.pedal1 ? V.add(anchors.pedal1, [0, 0, 45]) : V.add(bbP, [0, 0, 130]), chainring: [bbP[0], bbP[1], cl],
        stem: V.lerp(stemC, barC, 0.5), bar: barC }
    };
  }

  // chain loop through oriented circles [{c, r, s (+1 anticlockwise, -1 clockwise), z}] in the order the chain runs
  function chainPath(C) {
    const n = C.length, seg = [];
    const vel = (Cc, T) => { const rx = (T[0] - Cc.c[0]) / Cc.r, ry = (T[1] - Cc.c[1]) / Cc.r; return Cc.s > 0 ? [-ry, rx] : [ry, -rx]; };
    for (let i = 0; i < n; i++) {
      const A = C[i], Bc = C[(i + 1) % n]; let best = null;
      for (const sa of [1, -1]) for (const sb of [1, -1]) {
        const ra = sa * A.r, rb = sb * Bc.r, d = [Bc.c[0] - A.c[0], Bc.c[1] - A.c[1]], L = Math.hypot(d[0], d[1]); if (L < 1e-6) continue;
        const k = (ra - rb) / L; if (Math.abs(k) > 1) continue;
        const u = [d[0] / L, d[1] / L], v = [-u[1], u[0]], h = Math.sqrt(1 - k * k);
        for (const sg of [1, -1]) {
          const N = [u[0] * k + v[0] * h * sg, u[1] * k + v[1] * h * sg];
          const T1 = [A.c[0] + ra * N[0], A.c[1] + ra * N[1]], T2 = [Bc.c[0] + rb * N[0], Bc.c[1] + rb * N[1]];
          const dl = Math.hypot(T2[0] - T1[0], T2[1] - T1[1]) || 1, dir = [(T2[0] - T1[0]) / dl, (T2[1] - T1[1]) / dl];
          const va = vel(A, T1), vb = vel(Bc, T2);
          if (dir[0] * va[0] + dir[1] * va[1] > 0.98 && dir[0] * vb[0] + dir[1] * vb[1] > 0.98) best = [T1, T2];
        }
      }
      if (!best) return null;
      seg.push(best);
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const Cc = C[i], entry = seg[(i - 1 + n) % n][1], exit = seg[i][0];
      let a0 = Math.atan2(entry[1] - Cc.c[1], entry[0] - Cc.c[0]), a1 = Math.atan2(exit[1] - Cc.c[1], exit[0] - Cc.c[0]);
      if (Cc.s > 0) { while (a1 < a0) a1 += 2 * Math.PI; } else { while (a1 > a0) a1 -= 2 * Math.PI; }
      const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) * Cc.r / 3));
      for (let k = 0; k <= steps; k++) { const a = a0 + (a1 - a0) * k / steps; out.push([Cc.c[0] + Cc.r * Math.cos(a), Cc.c[1] + Cc.r * Math.sin(a), Cc.z]); }
      // straight span to the next circle (z blends)
      const nx = C[(i + 1) % n], T2 = seg[i][1], L = Math.hypot(T2[0] - exit[0], T2[1] - exit[1]), st = Math.max(1, Math.ceil(L / 6));
      for (let k = 1; k < st; k++) { const t = k / st; out.push([exit[0] + (T2[0] - exit[0]) * t, exit[1] + (T2[1] - exit[1]) * t, Cc.z + (nx.z - Cc.z) * t]); }
    }
    return out;
  }
  function chainLinks(Mp, Mr, loop) {
    const n = loop.length, cum = [0];
    for (let k = 1; k <= n; k++) cum.push(cum[k - 1] + V.dist(loop[k % n], loop[k - 1]));
    const total = cum[n], pitch = total / Math.round(total / 12.7), rollers = [];
    let j = 0;
    for (let s = 0; s < total - 1e-6; s += pitch) { while (cum[j + 1] < s) j++; const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1); rollers.push(V.lerp(loop[j], loop[(j + 1) % n], t)); }
    const N = rollers.length;
    for (let k = 0; k < N; k++) {
      const a = rollers[k], b = rollers[(k + 1) % N], mid = V.lerp(a, b, 0.5), d = V.norm(V.sub(b, a)), ay = V.norm(V.cross(Z, d));
      const outer = k % 2 === 0, off = outer ? 5.0 : 3.9;
      for (const s of [-1, 1]) blob(Mp, V.add(mid, [0, 0, s * off]), d, ay, Z, 8.8, outer ? 4.5 : 4.9, 0.55, 0.45, 4);
      cyl(Mr, V.add(a, [0, 0, -3.4]), V.add(a, [0, 0, 3.4]), 3.8, 3.8, 8, { caps: false });
      cyl(Mr, V.add(a, [0, 0, -5.9]), V.add(a, [0, 0, 5.9]), 1.9, 1.9, 6);
    }
  }
  // saddle shell over a plan outline, with rails
  // opt (optional): { lattice: [mesh top layer, mesh lower layer] 3D-printed lattice top (alpha-holed textures), carbonRails: oval 7x10 }
  function saddleMesh(Ms, Mrail, S, clamp0, topY, opt) {
    opt = opt || {};
    const Ls = S.length, cx = clamp0[0], nose = cx + 0.52 * Ls, tail = cx - 0.48 * Ls;
    const nu = 48, nv = 36, rows = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, x = lerp(tail, nose, u), t = 1 - u;                      // t = 0 at the nose, 1 at the tail
      const wTrans = S.cutout ? smooth(0.32, 0.62, t) : smooth(0.25, 0.72, t);
      let w = S.nose / 2 + (S.width / 2 - S.nose / 2) * wTrans;
      const dT = (x - tail), dN = (nose - x), endT = 24, endN = 14;
      const fT = dT < endT ? Math.sqrt(Math.max(0, 1 - (1 - dT / endT) ** 2)) : 1, fN = dN < endN ? Math.sqrt(Math.max(0, 1 - (1 - dN / endN) ** 2)) : 1, f = Math.min(fT, fN);
      w *= f;
      const yTop = topY + (t > 0.78 ? S.kick * ((t - 0.78) / 0.22) ** 1.5 : 0) - (t < 0.18 ? S.dip * ((0.18 - t) / 0.18) ** 2 : 0);
      const ht = lerp(5, 10, smooth(0.0, 0.5, t)) * Math.max(0.35, f), hb = 4 * Math.max(0.35, f), yC = yTop - ht;
      const row = [];
      for (let j = 0; j <= nv; j++) {
        const th = j / nv * 2 * Math.PI, c = Math.cos(th), s = Math.sin(th);
        const z = w * G.spow(c, 2 / 3.2), y = yC + (s > 0 ? ht : hb) * G.spow(s, 2 / 3.2) - (s > 0 ? 1.5 * (z / Math.max(w, 1)) ** 2 : 0);
        let col = [0.03, 0.03, 0.032];
        if (opt.lattice && s > 0.2) col = [0.006, 0.006, 0.007];   // deep shadow under the printed lattice
        else if (opt.lattice) col = [0.03, 0.03, 0.032];           // carbon shell edge / base
        else if (s < 0.25 && s > -0.6 && t > 0.35) col = [0.09, 0.09, 0.095];
        if (S.cutout && s > 0.5 && Math.abs(z) < 7 && t > 0.2 && t < 0.62) col = [0.005, 0.005, 0.005];
        if (s < -0.6) col = [0.02, 0.02, 0.02];
        row.push({ p: [x, y, z], c: col });
      }
      rows.push(row);
    }
    const base = Ms.count;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const a = rows[Math.max(0, i - 1)][j].p, b = rows[Math.min(nu, i + 1)][j].p, c = rows[i][(j + nv - 1) % nv].p, d = rows[i][(j + 1) % nv].p;
      let n = V.norm(V.cross(V.sub(b, a), V.sub(d, c)));
      if (i === 0) n = [-1, 0, 0]; if (i === nu) n = [1, 0, 0];
      Ms.v(rows[i][j].p, n, [i / nu, j / nv], X, rows[i][j].c);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = base + i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1; Ms.i.push(a, c, b, b, c, d); }
    if (opt.lattice) {
      // printed lattice: the top of the shell offset outwards, two layers (upper + lower, cells shifted) for depth.
      // uv in mm-space so the texture cells stay round; j runs over the upper half of each cross-section
      const jA = 1, jB = Math.floor(nv / 2) - 1, nrmAt = (i, j) => { const a = rows[Math.max(0, i - 1)][j].p, b = rows[Math.min(nu, i + 1)][j].p, c = rows[i][j - 1].p, d = rows[i][j + 1].p; return V.norm(V.cross(V.sub(b, a), V.sub(d, c))); };
      opt.lattice.forEach((Ml, layer) => {
        const off = layer ? 1.8 : 4.0, i0 = 1, i1 = nu - 1;
        Ml.grid(i1 - i0, jB - jA, (ii, jj) => { const i = i0 + ii, j = jA + jj, q = rows[i][j].p, n = nrmAt(i, j);
          return { p: V.madd(q, n, off * (0.4 + 0.6 * Math.min(1, Math.min(i, nu - i) / 4))), n, uv: [(q[0] - tail) / 280 + layer * 0.009, (q[2] + 80) / 160 + layer * 0.011], t: X }; });
      });
    }
    const yR = clamp0[1], railR = opt.carbonRails ? [4.6, 3.3] : [3.5, 3.5];
    // rails: one smooth sweep each side - in under the nose, a long shallow ramp down to the straight clamp zone
    // (centred on the clamp), then up to the tail. No sharp "posts" at the ends.
    const zN = Math.min(7, S.nose / 2 - 6), zT = Math.min(33, S.width / 2 - 34);
    const railPts = s => [[nose - 16, topY - 10, s * zN], [nose - 40, topY - 17, s * (zN + 4)], [cx + 62, yR + 6, s * 17], [cx + 34, yR, s * 20.5], [cx, yR, s * 21],
      [cx - 34, yR, s * 21.5], [cx - 56, yR + 5, s * 24], [tail + 34, topY - 21, s * (zT - 1)], [tail + 15, topY - 12, s * zT]];
    for (const s of [-1, 1]) {
      const rp = smoothPath(railPts(s), 10);
      sweep(Mrail, rp, { rh: railR[0], rw: railR[1], ref: Y, seg: 14, cap0: "dome", cap1: "dome" });
      // rail sockets moulded into the shell at the nose and the tail
      blob(Mrail, [nose - 18, topY - 9.5, s * zN], X, Y, Z, 9, 3.2, 5, 0.4, 8);
      blob(Mrail, [tail + 16, topY - 11.5, s * zT], X, Y, Z, 10, 3.4, 6, 0.4, 8);
      // position scale printed on the outside of the rail in the clamp zone (carbon rails)
      if (opt.railScale) {
        const Ms2 = opt.railScale, x0 = cx - 34, x1 = cx + 34, zo = s * (21 + railR[1] + 0.12);
        Ms2.grid(1, 1, (i, j) => ({ p: [lerp(x0, x1, i), yR - 2.2 + 4.4 * j, zo], n: [0, 0, s], uv: [s > 0 ? i : 1 - i, j], t: X }));
      }
    }
  }

  // ---------------------------------------------------------------- controller
  const S = { host: null, R: null, canvas: null, msg: null, on: false, key: "", built: null, cam: { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 }, raf: 0, mode: "paint", ro: null, lastRes: null, panelSync: [] };
  try { S.mode = localStorage.getItem("frameBench.realMode") === "stress" ? "stress" : "paint"; } catch (e) {}
  const VIEWS = { side: [0, 0], nds: [Math.PI, 0], top: [0, Math.PI / 2], rear: [Math.PI / 2, 0], three: [0.62, 0.38] };
  function supported() { try { const c = document.createElement("canvas"); const gl = c.getContext("webgl2"); const ok = !!gl; if (gl) { const e = gl.getExtension("WEBGL_lose_context"); if (e) e.loseContext(); } return ok; } catch (e) { return false; } }
  function isDark() { try { const v = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(); const h = v.replace("#", ""); if (h.length < 6) return false; const n = parseInt(h, 16); return ((n >> 16 & 255) + (n >> 8 & 255) + (n & 255)) / 3 < 100; } catch (e) { return false; } }

  function init(host) {
    if (S.R) return true;
    S.host = host;
    const wrap = host.wrap;
    const cv = document.createElement("canvas"); cv.className = "real3d"; cv.setAttribute("aria-label", "Realistic 3D view of the finished bike");
    const msg = document.createElement("div"); msg.className = "real3dmsg"; msg.hidden = true;
    wrap.appendChild(cv); wrap.appendChild(msg);
    S.canvas = cv; S.msg = msg;
    try { S.R = new G.Renderer(cv); }
    catch (e) { cv.remove(); msg.hidden = false; msg.textContent = "This browser can't draw the realistic view (WebGL 2 is switched off or not supported). The line drawing still works."; S.R = null; return false; }
    injectCss();
    controls(cv);
    // graphics-card reset: stop drawing; when the browser hands the context back, rebuild everything on it
    cv.addEventListener("webglcontextlost", e => { e.preventDefault(); if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; S.lostCtx = true; msg.hidden = false; msg.textContent = "The graphics card was reset. The 3D view will redraw by itself in a moment; if it doesn't, switch Realistic view off and on again."; });
    cv.addEventListener("webglcontextrestored", () => { recover(); });
    S.ro = new ResizeObserver(() => { resize(); request(); }); S.ro.observe(wrap);
    buildPanel();
    return true;
  }
  function resize() {
    if (!S.canvas) return;
    const r = S.host.wrap.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (S.canvas.width !== w || S.canvas.height !== h) { S.canvas.width = w; S.canvas.height = h; }
  }
  // rebuild the renderer after a lost WebGL context (all GPU objects of the old one are gone)
  function recover() {
    if (!S.canvas) return false;
    try { if (S.R && S.R.gl && S.R.gl.isContextLost()) return false; } catch (e) {}
    try { S.R = new G.Renderer(S.canvas); } catch (e) { S.msg.hidden = false; S.msg.textContent = "The graphics card was reset and the 3D view couldn't restart. Reload the page to redraw it."; return false; }
    S.lostCtx = false; S.key = ""; S.lastRes = null; S.built = null; S.progOk = null; S.lastAcc = 0; S.msg.hidden = true;
    update();
    return true;
  }
  function show(on) {
    S.on = !!on;
    if (S.canvas) S.canvas.style.display = on ? "block" : "none";
    if (S.host && S.host.panel) S.host.panel.hidden = !on;
    if (on) { resize(); if (S.lostCtx) recover(); else update(); }
  }
  function update() {
    if (!S.R || !S.on || S.lostCtx) return;
    const st = S.host.get(); if (!st || !st.result) return;
    S.lastSt = st;   // geolabels.js reads the design / result the model was drawn from
    // Design mode (body.simple) hides the engineering side: always paint colours
    const simpleUI = typeof document !== "undefined" && document.body && document.body.classList.contains("simple");
    st.mode = simpleUI ? "paint" : st.shown && st.shown.anim ? "stress" : S.mode;
    const shownId = st.shown ? (st.shown.worst ? "worst" : st.shown.id) : "";
    const key = JSON.stringify([st.design.parts || {}, root.FramePartLib ? root.FramePartLib.resolve(st.design) : 0, st.partShow, st.mode, st.mode === "stress" ? [shownId, !!st.flex] : 0, st.mode === "stress" ? (st.stressColor ? st.stressColor(0.5) : "") : 0, root.FrameOverlay ? root.FrameOverlay.key() : 0]);
    if (key !== S.key || st.result !== S.lastRes) {
      S.key = key; S.lastRes = st.result;
      S.R.clear();
      try { S.built = buildBike(S.R, st, isDark()); S.msg.hidden = true; if (root.FrameOverlay) root.FrameOverlay.build(S.R, S.built, st, buildBike, isDark()); }   // overlay.js adds a second bike
      catch (e) { S.msg.hidden = false; S.msg.textContent = "Couldn't build the realistic model: " + e.message; if (window.console) console.error(e); }
    }
    syncPanel();
    request();
  }
  // every change restarts the progressive refinement; a still view is refined over QFRAMES frames (sharper edges, softer shadows)
  function request() { S.acc = 0; S.done = false; schedule(); }
  function schedule() { if (S.raf || !S.on) return; S.raf = requestAnimationFrame(() => { S.raf = 0; render(); }); }
  const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
  function camera() {
    const b = S.built.bbox, cw = S.canvas.width, ch = S.canvas.height, asp = cw / ch, fov = 30 * D2R;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, hx = (b.x1 - b.x0) / 2, hy = (b.y1 - b.y0) / 2;
    const base = Math.max(hx / asp, hy) / Math.tan(fov / 2) * 1.1 + b.z;
    const c = S.cam, dist = base / c.zoom;
    const dir = [-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)];
    const upv = [Math.sin(c.yaw) * Math.sin(c.pitch), Math.cos(c.pitch), -Math.cos(c.yaw) * Math.sin(c.pitch)];
    const right = V.norm(V.cross(upv, dir));
    let base0 = [cx, cy, 0];
    if (c.tgt) { const b0 = S.built, ct = Math.cos(-b0.tilt), st2 = Math.sin(-b0.tilt), dx = c.tgt[0] - b0.pivot[0], dy = c.tgt[1] - b0.pivot[1]; base0 = [b0.pivot[0] + ct * dx - st2 * dy, b0.pivot[1] + st2 * dx + ct * dy, c.tgt[2]]; }
    const tgt = V.add(V.add(base0, V.mul(right, c.panX * dist)), V.mul(upv, c.panY * dist));
    const eye = V.madd(tgt, dir, dist);
    let VP = M4.mul(M4.persp(fov, asp, Math.max(20, dist - 3000), dist + 4000), M4.lookAt(eye, tgt, upv));
    if (S.acc > 0) { const jx = (halton(S.acc, 2) - 0.5) * 2 / cw, jy = (halton(S.acc, 3) - 0.5) * 2 / ch; VP = M4.mul(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, jx, jy, 0, 1]), VP); }
    return { VP, eye, tgt, fov };
  }
  function render() {
    if (!S.R || !S.built || !S.on || S.lostCtx) return;
    resize();
    const b = S.built, dark = isDark();
    const model = M4.rotZ(-b.tilt, b.pivot[0], b.pivot[1]);
    const cam = camera();
    const cx = (b.bbox.x0 + b.bbox.x1) / 2, cy = (b.bbox.y0 + b.bbox.y1) / 2;
    let keyDir = V.norm([0.3, 1, 0.42]); const tgt = [cx, cy, 0];
    if (S.acc > 0) { const a = 2 * Math.PI * halton(S.acc, 5), r = 0.05 * Math.sqrt(halton(S.acc, 7)); keyDir = V.norm(V.add(keyDir, [r * Math.cos(a), 0, r * Math.sin(a)])); S.R.shadowDirty = true; }
    else if (S.lastAcc > 0) S.R.shadowDirty = true;
    const LV = M4.lookAt(V.madd(tgt, keyDir, 4000), tgt, [0, 0, -1]);
    const LVP = M4.mul(M4.ortho(-1300, 1300, -1300, 1300, 1500, 7000), LV);
    const bg = dark ? [0.135, 0.15, 0.175] : [0.905, 0.915, 0.93];
    const scene = {
      model, VP: cam.VP, cam: cam.eye, LVP, bg, exposure: dark ? 1.0 : 1.05, frame: S.acc, groundY: b.groundY, floorRefl: S.floorRefl == null ? 0.07 : S.floorRefl, vignette: dark ? 0.16 : 0.1,
      env: dark ? { top: [0.55, 0.57, 0.62], hor: [0.16, 0.17, 0.19], gnd: [0.05, 0.05, 0.055], int: 1.0 } : { top: [0.85, 0.86, 0.9], hor: [0.42, 0.43, 0.45], gnd: [0.16, 0.16, 0.17], int: 1.0 },
      key: { dir: keyDir, col: [2.7, 2.62, 2.5] }, fill: { dir: V.norm([-0.7, 0.35, -0.6]), col: [0.55, 0.6, 0.72] },
      contacts: b.contacts
    };
    if (S.progOk !== false) { try { S.R.renderProgressive(scene); S.progOk = true; } catch (e) { S.progOk = false; if (window.console) console.warn("progressive render off:", e.message); } }
    if (S.progOk === false) S.R.render(scene);
    if (S.acc === 0 && root.FrameGeoLabels) { try { root.FrameGeoLabels.draw(S, model, cam); } catch (e) { if (window.console) console.warn("geometry labels:", e); } }   // geometry numbers float on the bike (geolabels.js)
    S.lastAcc = S.acc;
    if (S.acc < (S.qframes == null ? 28 : S.qframes)) { S.acc++; schedule(); } else S.done = true;
  }
  function setView(name) { const v = VIEWS[name]; if (!v) return; Object.assign(S.cam, { yaw: v[0], pitch: v[1], zoom: 1, panX: 0, panY: 0, tgt: null }); request(); }
  // close-up on one area of the bike: name = fork | crank | rear | front | cockpit | saddle | headtube
  // close-up on one area of the bike. name: fork | crank | rear | front | cockpit | saddle | headtube | caliperF | caliperR |
  // lever | hubF | hubR | pedal | chainring | stem | bar. zoom: optional (default per target). view: optional angle —
  // a name from FOCUS_VIEWS ("side" = drive side, "nds" = other side, "front3q", "ds3q", "nds3q", "front", "top", ...) or [yaw, pitch].
  const FOCUS_VIEWS = Object.assign({}, VIEWS, { front: [-Math.PI / 2, 0.05], front3q: [-0.75, 0.15], ds3q: [0.35, 0.12], nds3q: [Math.PI - 0.62, 0.3], ndsfront3q: [-(Math.PI - 0.75), 0.15],
    lever: [-2.3, 0.55], stemtop: [Math.PI / 2 + 0.5, 0.65], below: [0.4, -0.35] });
  const FOCUS_DEF = { fork: [[-0.75, 0.15], 2.4], cockpit: [[-0.5, 0.45], 3], crank: [[0.35, 0.12], 3], rear: [[0.45, 0.1], 2.4], saddle: [[0.6, 0.35], 3.2], front: [[0, 0.05], 1.4],
    headtube: [[-0.75, 0.15], 3], caliperF: [[Math.PI - 0.3, 0.12], 4.5], caliperR: [[Math.PI + 0.3, 0.12], 4.5], lever: [[-2.3, 0.55], 4.5], hubF: [[Math.PI - 0.25, 0.1], 4],
    hubR: [[0.25, 0.1], 4], pedal: [[0.3, 0.25], 5], chainring: [[0.15, 0.08], 3.6], stem: [[0, 0.1], 4.5], bar: [[-Math.PI / 2, 0.25], 2.2] };
  function focus(name, zoom, view) {
    if (!S.built || !S.built.focus || !S.built.focus[name]) return false;
    const d = FOCUS_DEF[name] || [null, 3], ang = Array.isArray(view) ? view : (view && FOCUS_VIEWS[view]) || d[0];
    if (ang) { S.cam.yaw = ang[0]; S.cam.pitch = ang[1]; }
    Object.assign(S.cam, { tgt: S.built.focus[name], zoom: zoom || d[1], panX: 0, panY: 0 }); request(); return true;
  }

  function controls(cv) {
    const ptrs = new Map(); let start = null;
    const snap = () => ({ ...S.cam, pts: [...ptrs.values()].map(p => ({ ...p })) });
    cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); start = snap(); start.pan = e.button === 2 || e.shiftKey; cv.classList.add("drag"); });
    cv.addEventListener("pointermove", e => {
      if (!ptrs.has(e.pointerId) || !start) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const h = cv.clientHeight || 1, k = 2 * Math.tan(15 * D2R) / h;
      const pts = [...ptrs.values()];
      if (pts.length >= 2 && start.pts.length >= 2) {
        const d0 = Math.hypot(start.pts[0].x - start.pts[1].x, start.pts[0].y - start.pts[1].y) || 1, d1 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        S.cam.zoom = clamp(start.zoom * d1 / d0, 0.4, 8);
        const m0 = [(start.pts[0].x + start.pts[1].x) / 2, (start.pts[0].y + start.pts[1].y) / 2], m1 = [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
        S.cam.panX = start.panX - (m1[0] - m0[0]) * k / S.cam.zoom * S.cam.zoom; S.cam.panY = start.panY + (m1[1] - m0[1]) * k;
      } else {
        const p0 = start.pts.find(Boolean) || pts[0], dx = e.clientX - p0.x, dy = e.clientY - p0.y;
        if (start.pan) { S.cam.panX = start.panX - dx * k; S.cam.panY = start.panY + dy * k; }
        else { S.cam.yaw = start.yaw + dx * 0.008; S.cam.pitch = clamp(start.pitch + dy * 0.008, -1.55, 1.55); }
      }
      S.host.onManualView && S.host.onManualView();
      request();
    });
    const end = e => { ptrs.delete(e.pointerId); start = ptrs.size ? snap() : null; if (!ptrs.size) cv.classList.remove("drag"); };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    cv.addEventListener("contextmenu", e => e.preventDefault());
    cv.addEventListener("wheel", e => { e.preventDefault(); S.cam.zoom = clamp(S.cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.4, 8); request(); }, { passive: false });
    cv.addEventListener("dblclick", () => { S.host.onReset ? S.host.onReset() : setView("side"); });
  }

  // ---------------------------------------------------------------- "Build my bike" panel
  function injectCss() {
    if (document.getElementById("real3dCss")) return;
    const s = document.createElement("style"); s.id = "real3dCss";
    s.textContent = `
canvas.real3d { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; z-index: 2; touch-action: none; border-radius: 0; }
canvas.real3d.drag { cursor: grabbing; }
.real3dmsg { position: absolute; left: 12px; right: 12px; top: 12px; z-index: 3; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font-size: 14px; }
.realpanel { border-top: 1px solid var(--line); padding: 10px 14px; }
.realpanel > summary { font-size: 15px; }
.realgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px 22px; }
.realgrid .grp { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.realgrid .grp h4 { margin: 0; font: 600 12px var(--font-body); color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.realgrid label.f.sel { grid-template-columns: minmax(0, 1fr) minmax(0, 190px); }
.realgrid input[type=color] { width: 100%; height: 30px; padding: 2px; }
.realgrid .note { font-size: 12.5px; color: var(--muted); margin: 0; }
.realgrid .seg button { padding: 5px 10px; }
.realpanel [hidden] { display: none !important; }
.realpanel .rtabs { margin: 2px 0 12px; }
.realpanel .rtabs button { padding: 6px 12px; }
.realgrid .grp h4, .libpane h4 { margin: 0; font: 600 12px var(--font-body); color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.linkbtn { border: 0; background: none; color: var(--accent); padding: 0; font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
.libpane { display: flex; flex-direction: column; gap: 10px; }
.libhead { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.libhead label.f.sel { min-width: 240px; flex: 0 1 320px; }
.librow { display: flex; flex-wrap: wrap; gap: 8px 14px; justify-content: space-between; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
.librow > div:first-child { min-width: 0; flex: 1 1 260px; }
.librow .btnrow button { padding: 4px 9px; font-size: 12.5px; }
.libform { border: 1px solid var(--accent); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.libform .formgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px 22px; }
.libform input[type=text] { width: 100%; }
.libform input[type=color] { width: 100%; height: 30px; padding: 2px; }
.libform .formgrid .wide { grid-column: 1 / -1; }
.libform input[type=url] { width: 100%; }
.libform .rng { color: var(--muted); font-weight: 400; }
.libmatch { border: 1px dashed var(--line); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.libmatch .libcheck { margin: 0; padding-left: 18px; font-size: 13px; color: var(--muted); }
.libmatch .btnrow { display: flex; flex-wrap: wrap; gap: 6px; }
.libmatch .btnrow button { padding: 5px 9px; font-size: 12.5px; }
.libmatch textarea { width: 100%; box-sizing: border-box; font: 12px var(--font-data); }
.libmatch a, .librow a { color: var(--accent); word-break: break-all; }
.libpane .note { font-size: 12.5px; color: var(--muted); margin: 0; }
.libprob { margin: 0; padding-left: 18px; font-size: 13px; color: #b45309; }
.libprob li.error { color: #c0392b; }
.librow.haswarn { border-color: #d39b2a; }
.libwarn summary { cursor: pointer; font-size: 12.5px; color: #b45309; }
.libwarn ul { margin: 4px 0; padding-left: 18px; font-size: 12.5px; }
.libshadow { color: #b45309 !important; }
.adjbox { border: 1px dashed var(--line); border-radius: 8px; padding: 6px 10px; }
.adjbox > summary { cursor: pointer; font-size: 13px; font-weight: 600; }
.adjbox .adjn { color: var(--accent); font-weight: 600; }
.adjbox .fields { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
.adjbox input::placeholder { color: var(--muted); opacity: .75; }
.adjbox label.f.adj-on > span:first-child { color: var(--accent); font-weight: 600; }
.adjbox .btnrow button { padding: 4px 9px; font-size: 12.5px; }
.libform label.inh > span:first-child::after { content: " · from base"; font-weight: 400; font-size: 11px; color: var(--muted); }
.libbase { color: var(--muted); }
@media (max-width: 520px) { .libform .formgrid { grid-template-columns: minmax(0, 1fr); } .librow .btnrow { display: flex; flex-wrap: wrap; gap: 6px; } }
@media (max-width: 520px) { .realgrid { grid-template-columns: minmax(0, 1fr); } .realgrid label.f.sel { grid-template-columns: minmax(0, 1fr) minmax(0, 60%); } }
`;
    document.head.appendChild(s);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function buildPanel() {
    const host = S.host, el = host.panel; if (!el) return;
    const FP = root.FrameParts, PL = root.FramePartLib;
    el.innerHTML = `<summary>Build my bike</summary>
      <div class="rtabs seg" role="tablist"><button type="button" data-tab="bike" aria-pressed="true">Parts on this bike</button><button type="button" data-tab="lib" aria-pressed="false">My parts library</button></div>
      <div class="realgrid" data-pane="bike"></div><div class="libpane" data-pane="lib" hidden></div>`;
    const grid = el.querySelector(".realgrid"), libEl = el.querySelector(".libpane");
    el.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
      el.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      grid.hidden = b.dataset.tab !== "bike"; libEl.hidden = b.dataset.tab !== "lib"; if (!libEl.hidden) renderLib(); else stopPreview();
    }));
    S.panelSync = [];
    const parts = () => { const d = host.get().design; d.parts = d.parts || {}; return d.parts; };
    const selOf = () => { const p = parts(); p.sel = p.sel || {}; return p.sel; };
    // Chainring / singlespeed cog: one tooth count for the drawing and the analysis. Picking a part with its own teeth
    // (or adjusting them for this bike) copies them into Joint positions & drivetrain; returns a message if it changed.
    const syncTeeth = ck => {
      if (ck !== "chainring" && ck !== "rear") return "";
      const d = host.get().design, gg = d.geometry || {}, r = PL.resolve(d)[ck], key = ck === "chainring" ? "chainring" : "cog";
      if (!(r.teeth > 0) || (ck === "rear" && r.type !== "singlespeed") || +gg[key] === +r.teeth) return "";
      gg[key] = +r.teeth;
      return `${ck === "chainring" ? "Chainring" : "Rear cog"} set to ${r.teeth}T (drawing and analysis).`;
    };
    const partsChanged = ck => { const m = syncTeeth(ck); host.onPartsChanged && host.onPartsChanged(); if (m && host.onApply) host.onApply(m); };
    const val = k => { const p = parts(); return p[k] != null ? p[k] : FP.DEFAULTS[k]; };
    const set = (k, v) => { parts()[k] = v; host.onPartsChanged && host.onPartsChanged(); };
    const group = (title, cls) => { const g = document.createElement("div"); g.className = "grp" + (cls ? " " + cls : ""); g.innerHTML = `<h4>${esc(title)}</h4>`; grid.appendChild(g); return g; };
    const sel = (g, k, label, opts, conv) => {
      const l = document.createElement("label"); l.className = "f sel";
      l.innerHTML = `<span>${esc(label)}</span><select data-k="${k}">${opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("")}</select>`;
      const s = l.querySelector("select"); g.appendChild(l);
      const refresh = () => { const v = String(val(k)); if (![...s.options].some(op => op.value === v)) { const op = document.createElement("option"); op.value = v; op.textContent = v; s.appendChild(op); } s.value = v; };
      s.addEventListener("change", () => set(k, conv ? conv(s.value) : s.value));
      S.panelSync.push(refresh); refresh(); return s;
    };
    const numF = (g, k, label, unit, step) => {
      const l = document.createElement("label"); l.className = "f";
      l.innerHTML = `<span>${esc(label)}</span><input type="number" step="${step}" data-k="${k}"><span class="u">${esc(unit)}</span>`;
      const i = l.querySelector("input"); g.appendChild(l);
      const refresh = () => { if (document.activeElement !== i) i.value = val(k); };
      i.addEventListener("input", () => { const v = parseFloat(i.value); if (isFinite(v)) set(k, v); });
      S.panelSync.push(refresh); refresh(); return l;
    };
    const colour = (g, k, label) => {
      const l = document.createElement("label"); l.className = "f sel";
      l.innerHTML = `<span>${esc(label)}</span><input type="color" data-k="${k}">`;
      const i = l.querySelector("input"); g.appendChild(l);
      const refresh = () => { if (document.activeElement !== i) i.value = val(k); };
      i.addEventListener("input", () => set(k, i.value));
      S.panelSync.push(refresh); refresh();
    };
    const textF = (g, k, label) => {
      const l = document.createElement("label"); l.className = "f sel";
      l.innerHTML = `<span>${esc(label)}</span><input type="text" maxlength="24" data-k="${k}">`;
      const i = l.querySelector("input"); g.appendChild(l);
      const refresh = () => { if (document.activeElement !== i) i.value = val(k) == null ? "" : val(k); };
      i.addEventListener("change", () => set(k, i.value.trim()));
      S.panelSync.push(refresh); refresh();
    };
    const note = (g, fn) => { const p = document.createElement("p"); p.className = "note"; g.appendChild(p); S.panelSync.push(() => { const v = fn(); if (v && v.nodeType) { p.innerHTML = ""; p.appendChild(v); p.hidden = false; } else { p.textContent = v || ""; p.hidden = !p.textContent; } }); };
    const cat = c => Object.entries(c).map(([k, v]) => [k, v.label]);

    // ---- look
    const g1 = group("Look");
    const segW = document.createElement("div"); segW.className = "seg eng"; segW.setAttribute("role", "group"); segW.setAttribute("aria-label", "Colours shown");
    segW.innerHTML = `<button type="button" data-m="paint">Paint colours</button><button type="button" data-m="stress">Stress colours</button>`;
    g1.appendChild(segW);
    const segRefresh = () => { segW.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === S.mode))); host.onMode && host.onMode(S.mode); };
    segW.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { S.mode = b.dataset.m; try { localStorage.setItem("frameBench.realMode", S.mode); } catch (e) {} segRefresh(); update(); }));
    S.panelSync.push(segRefresh);
    note(g1, () => S.mode === "stress" ? "Frame coloured by the load case picked in Analysis mode (same colours). The load-case picker and animations show below the view." : "");
    const finSel = sel(g1, "finish", "Frame finish", cat(FP.FINISHES));
    {
      const lA = numF(g1, "splitAt", "Split line: % up the down tube from the BB", "%", 1), lB = numF(g1, "splitAngle", "Split line: angle to the down tube", "°", 1);
      const vis = () => { const on = val("finish") === "tiSplit" || val("finish") === "tiSplitFlip"; lA.hidden = !on; lB.hidden = !on; };
      S.panelSync.push(vis); vis(); finSel.addEventListener("change", vis);
    }
    colour(g1, "paintColor", "Paint colour");
    sel(g1, "paintFinish", "Paint finish", [["satin", "Satin"], ["matte", "Matte"], ["gloss", "Gloss"], ["metallic", "Metallic"]]);
    sel(g1, "welds", "Welds", [["dimes", "TIG beads (titanium / steel)"], ["smooth", "Smooth (sanded aluminium)"]]);
    textF(g1, "headLogo", "Head-tube logo text (blank = none)");
    colour(g1, "logoColor", "Head-tube logo colour");
    textF(g1, "dtLogo", "Down-tube logo text (blank = none)");
    colour(g1, "dtLogoColor", "Down-tube logo colour");
    sel(g1, "smallColor", "Headset & seat collar", cat(FP.SMALL_COLOURS));
    {
      const l = document.createElement("label"); l.className = "f sel";
      l.innerHTML = `<span>Studio floor</span><select><option value="0">Matte</option><option value="0.07">Satin (faint reflection)</option><option value="0.18">Glossy</option></select>`;
      const s = l.querySelector("select"); g1.appendChild(l);
      try { const v = localStorage.getItem("frameBench.floor"); if (v != null && [0, 0.07, 0.18].includes(+v)) S.floorRefl = +v; } catch (e) {}
      s.value = String(S.floorRefl == null ? 0.07 : S.floorRefl);
      s.addEventListener("change", () => { S.floorRefl = +s.value; try { localStorage.setItem("frameBench.floor", s.value); } catch (e) {} request(); });
    }

    // ---- one picker per part category (library parts; "standard" = the bike's older settings)
    const summary = (catKey, p) => {
      const n = (v, u) => v ? `${+(+v).toFixed(1)}${u}` : "";
      switch (catKey) {
        case "fork": return p.type === "rigid" ? ["Rigid " + (p.style === "ti" ? "titanium" : p.style === "mtb" ? "MTB" : "carbon") + " fork", p.a2c > 0 ? n(p.a2c, " mm axle-to-crown") : "", p.offset > 0 ? n(p.offset, " mm offset") : "", p.clearance > 0 ? `tyres up to ${n(p.clearance, " mm")}` : ""].filter(Boolean).join(" · ")
          : `${n(p.travel, " mm")} travel · ${n(p.a2c, " mm")} axle-to-crown · ${n(p.offset, " mm")} offset · ${n(p.stanchion, " mm")} stanchions`;
        case "crankset": return `${p.length > 0 ? n(p.length, " mm") : "length from the analysis"} · ${p.material}`;
        case "chainring": return p.teeth > 0 ? `${p.teeth}T` : "teeth from the analysis";
        case "rear": return p.type === "singlespeed" ? (p.teeth > 0 ? `${p.teeth}T cog` : "cog teeth from the analysis") : p.type === "auto" ? "as the analysis" : "12-speed cassette";
        case "wheels": return `${p.rimMaterial} rims ${n(p.rimInner, "")}/${n(p.rimOuter, " mm")} wide, ${n(p.rimDepth, " mm")} deep · ${p.spokes} spokes`;
        case "tyres": return `${n(p.width, " mm")} wide · ${p.tread} tread · ${p.sidewall} walls`;
        case "brakes": { const opt = (PL.CATS.brakes.fields.find(f => f[0] === "style") || [])[4] || [], lab = (opt.find(v => v[0] === p.style) || [0, p.style])[1];
          return `${lab} · ${n(p.rotorF, " mm")} front rotor`; }
        case "cockpit": return `${n(p.stemLength, " mm")} stem${p.stemRise ? ` (${p.stemRise > 0 ? "+" : ""}${p.stemRise}°)` : ""} · ` + (p.barType === "drop"
          ? `${n(p.barWidth, " mm")} drop bar (at the ${p.widthAt === "drops" ? "drops" : "hoods"}), ${n(p.dropReach, "")} reach / ${n(p.dropDrop, "")} drop / ${+p.dropFlare || 0}° flare` + (p.dropFlareOut ? ` / ${p.dropFlareOut}° flare-out` : "") + (p.dropRise ? ` / ${p.dropRise} mm rise` : "")
          : `${n(p.barWidth, " mm")} riser bar, ${+p.barRise || 0} mm rise, ${+p.backsweep || 0}° back / ${+p.upsweep || 0}° up`) + (p.spacersAbove > 0 ? ` · ${p.spacersAbove} mm spacers above the stem` : "");
        case "seatpost": return p.type === "dropper" ? `${n(p.travel, " mm")} dropper` : "rigid post";
        default: return "";
      }
    };
    // ---- per-bike size adjustments on top of the picked part (design.parts.adj[cat]; partlib.js ADJUST lists the sizes)
    const adjObj = ck => { const p = parts(); p.adj = p.adj && typeof p.adj === "object" ? p.adj : {}; return p.adj[ck] = p.adj[ck] || {}; };
    const ADJ_SHOWN = {
      fork: (k, r) => k === "travel" ? r.type !== "rigid" : k === "clearance" ? r.type === "rigid" && r.style !== "mtb" : true,
      cockpit: (k, r) => /^drop|^widthAt$/.test(k) ? r.barType === "drop" : /^(barRise|backsweep|upsweep|leverInboard|leverAngle|gripLength)$/.test(k) ? r.barType !== "drop" : true
    };
    function adjustBox(g, ck) {
      const keys = PL.ADJUST[ck], C = PL.CATS[ck];
      const det = document.createElement("details"); det.className = "adjbox";
      det.innerHTML = `<summary>Adjust sizes for this bike <span class="adjn"></span></summary>
        <p class="note">Starts from the part's own numbers (shown faded). Type a number to change it on this bike only; clear the box to go back. The part in the library stays as it is.</p>
        <div class="fields"></div><div class="btnrow"><button type="button" class="adjreset">Back to the part's numbers</button></div>`;
      g.appendChild(det);
      const box = det.querySelector(".fields"), rows = [];
      const unadjusted = () => { const d = host.get().design, dp = d.parts || {}; return PL.resolve(Object.assign({}, d, { parts: Object.assign({}, dp, { adj: {} }) }))[ck]; };
      for (const k of keys) {
        const f = C.fields.find(x => x[0] === k); if (!f) continue;
        const l = document.createElement("label"), lab = f[1].replace(/\s*\((0|-1|blank) = [^)]*\)/, "").replace(/^Drop bar: /, "Bar ");
        if (f[2] === "s") {
          l.className = "f sel"; l.innerHTML = `<span>${esc(lab)}</span><select data-adj="${k}"><option value="">Part's own</option>${f[4].map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("")}</select>`;
        } else {
          const L = PL.limitsOf(ck, f, {}), rng = L ? ` min="${L.zero ? 0 : L.hardMin}" max="${L.hardMax}"` : "";
          l.className = "f"; l.innerHTML = `<span>${esc(lab)}</span><input type="number" step="any" inputmode="decimal" data-adj="${k}"${rng}><span class="u">${esc(f[4] || "")}</span>`;
        }
        box.appendChild(l);
        const i = l.querySelector("[data-adj]");
        const write = () => { const a = adjObj(ck);
          if (i.value === "") delete a[k]; else a[k] = f[2] === "s" ? i.value : +i.value;
          if (!Object.keys(a).length) delete parts().adj[ck];
          host.onPartsChanged && host.onPartsChanged(); };
        i.addEventListener(f[2] === "s" ? "change" : "input", () => { if (f[2] !== "s" && i.value !== "" && !isFinite(parseFloat(i.value))) return; write(); });
        // teeth: copy into the analysis once the number is committed (not on every keystroke)
        if (k === "teeth") i.addEventListener("change", () => { const m = syncTeeth(ck); if (m && host.onApply) host.onApply(m); });
        rows.push({ k, f, l, i });
      }
      det.querySelector(".adjreset").addEventListener("click", () => { const p = parts(); if (p.adj) delete p.adj[ck]; partsChanged(ck); syncPanel(); });
      S.panelSync.push(() => {
        const r0 = unadjusted(), a = ((parts().adj || {})[ck]) || {}, shown = ADJ_SHOWN[ck] || (() => true);
        const legacyCk = ck === "cockpit" && !selOf().cockpit;            // the bike's own cockpit numbers are edited in the box above
        let n = 0;
        for (const { k, f, l, i } of rows) {
          const on = a[k] !== undefined && a[k] !== "" && a[k] !== null; if (on) n++;
          l.hidden = (legacyCk && PL.LEGACY_CK.includes(k)) || (!shown(k, r0) && !on); l.classList.toggle("adj-on", on);
          const own = r0[k];
          if (f[2] === "s") { const o0 = i.options[0], t = (f[4].find(q => q[0] === own) || [0, own])[1]; o0.textContent = `Part's own (${t})`; if (document.activeElement !== i) i.value = on ? String(a[k]) : ""; }
          else { i.placeholder = k === "spacers" && !(own >= 0) ? `this bike's ${num(parts().spacers, 10)}` : own === 0 && k === "a2c" || own === 0 && k === "offset" ? "from the analysis" : own === 0 && k === "clearance" ? "fits the tyre" : String(own); if (document.activeElement !== i) i.value = on ? String(a[k]) : ""; }
        }
        det.querySelector(".adjn").textContent = n ? `(${n} changed)` : "";
        det.querySelector(".adjreset").hidden = !n;
      });
    }
    const PICK = [["Frame-mounted", ["fork", "crankset", "chainring", "rear"]], ["Rolling", ["wheels", "tyres", "brakes"]], ["Contact points", ["cockpit", "seatpost", "saddle", "pedals"]]];
    for (const [title, cats] of PICK) {
      const g = group(title);
      for (const ck of cats) {
        const l = document.createElement("label"); l.className = "f sel";
        l.innerHTML = `<span>${esc(PL.CATS[ck].label)}</span><select data-cat="${ck}"></select>`;
        const s = l.querySelector("select"); g.appendChild(l);
        const fill = () => {
          const list = PL.byCat(ck), mine = list.filter(p => !p.builtIn), built = list.filter(p => p.builtIn);
          const std = ck === "cockpit" ? "This bike's own numbers (set below)" : "Standard";
          s.innerHTML = `<option value="">${esc(std)}</option>` + (mine.length ? `<optgroup label="My parts">${mine.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</optgroup>` : "") +
            `<optgroup label="Catalogue">${built.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</optgroup>`;
          const cur = selOf()[ck] || ""; if (cur && ![...s.options].some(o => o.value === cur)) s.insertAdjacentHTML("beforeend", `<option value="${esc(cur)}">(missing part: ${esc(cur)})</option>`);
          s.value = cur;
        };
        s.addEventListener("change", () => { selOf()[ck] = s.value; partsChanged(ck); });
        S.panelSync.push(fill); fill();
        note(g, () => { const st = host.get(), r = PL.resolve(st.design)[ck]; return summary(ck, r) + (r.adjusted && r.adjusted.length ? " · adjusted for this bike" : ""); });
        if (ck === "fork") note(g, () => {
          const st = host.get(), F = PL.resolve(st.design).fork, gg = st.design.geometry;
          const rigid = F.type === "rigid";
          if (!(F.a2c > 0) || (rigid && !(F.offset > 0))) return rigid ? "Drawn to the analysis axle-to-crown and offset (this fork doesn't list its own; set them under Adjust sizes or in the part)." : "";
          const a = +gg.forkA2C, off = +gg.forkOffset, tr = rigid ? 0 : +(st.design.use || {}).forkTravel || 0, ftr = rigid ? 0 : +F.travel;
          if (Math.abs(a - F.a2c) < 2 && Math.abs(off - F.offset) < 1 && tr === ftr) return "Matches the analysis.";
          const wrap = document.createElement("span");
          wrap.textContent = `The analysis uses ${Math.round(a)} mm axle-to-crown / ${off} mm offset${rigid ? "" : ` / ${tr} mm travel`}; the bike is drawn to those numbers. This fork is ${Math.round(F.a2c)} / ${F.offset}${rigid ? "" : ` / ${ftr} mm travel`}. `;
          const b = document.createElement("button"); b.type = "button"; b.className = "linkbtn"; b.textContent = "Use this fork in the analysis";
          b.addEventListener("click", () => { const d = st.design; d.use = d.use || {}; d.use.forkTravel = ftr; gg.forkA2C = +F.a2c; gg.forkOffset = +F.offset; gg.forkBaseA2C = F.a2c - ftr; if ((+d.use.isoForkTravel || 0) < ftr) d.use.isoForkTravel = ftr; host.onApply && host.onApply("Fork numbers copied into the analysis (head angle, trail and stack change with them)."); });
          wrap.appendChild(b); return wrap;
        });
        if (ck === "crankset") note(g, () => {
          const st = host.get(), C = PL.resolve(st.design).crankset, gg = st.design.geometry;
          if (!(C.length > 0) || Math.abs(C.length - gg.crankLength) < 0.1) return "";
          const wrap = document.createElement("span"); wrap.textContent = `The analysis uses ${gg.crankLength} mm cranks (pedal loads and clearance). `;
          const b = document.createElement("button"); b.type = "button"; b.className = "linkbtn"; b.textContent = `Use ${C.length} mm in the analysis`;
          b.addEventListener("click", () => { gg.crankLength = +C.length; host.onApply && host.onApply("Crank length copied into the analysis."); });
          wrap.appendChild(b); return wrap;
        });
        if (ck === "chainring" || ck === "rear") note(g, () => { const st = host.get(), gg = st.design.geometry, r = PL.resolve(st.design)[ck]; const cur = ck === "chainring" ? +gg.chainring : +gg.cog; return r.teeth > 0 && (ck === "chainring" || r.type === "singlespeed") && r.teeth !== cur ? `Drawn and analysed with ${cur}T (Joint positions & drivetrain); this part is listed as ${r.teeth}T.` : ""; });
        if (ck === "cockpit") {
          const box = document.createElement("div"); box.className = "fields"; g.appendChild(box);
          [["barWidth", "Bar width", "mm", 10], ["barRise", "Bar rise", "mm", 5], ["backsweep", "Backsweep", "°", 1], ["upsweep", "Upsweep", "°", 1], ["stemLength", "Stem length", "mm", 5], ["stemRise", "Stem rise", "°", 1]].forEach(f => numF(box, ...f));
          sel(box, "barType", "Bars", [["flat", "Flat / riser (MTB)"], ["drop", "Drop bar (gravel)"]]);
          S.panelSync.push(() => { box.hidden = !!selOf().cockpit; });
          numF(box, "spacers", "Headset spacers", "mm", 5);   // with a cockpit part picked, spacers are set under Adjust sizes for this bike
        }
        if (ck === "crankset") numF(g, "crankAngle", "Crank angle shown", "°", 5);
        if (ck === "brakes") note(g, () => { const gg = host.get().design.geometry; return `Rear rotor: ${gg.rearRotor || 160} mm (set under Joint positions & drivetrain; it moves the brake mount in the analysis).`; });
        if (PL.ADJUST && PL.ADJUST[ck]) adjustBox(g, ck);
      }
    }
    note(group("Tips"), () => "Drag to turn the bike, scroll or pinch to zoom, right-drag or two fingers to slide. Double-click to reset. The picture sharpens for a second after you stop moving it.");

    // ---- library editor (owned by the parts pipeline: see PARTS_GUIDE.md)
    let libCat = "fork", editing = null, pvTimer = 0;
    const SHOT_NAMES = { fork: "Fork", crank: "Cranks", rear: "Rear cog", front: "Front wheel", cockpit: "Cockpit", saddle: "Saddle", headtube: "Head tube", caliperF: "Front caliper",
      caliperR: "Rear caliper", lever: "Brake lever", hubF: "Front hub", hubR: "Rear hub", pedal: "Pedal", chainring: "Chainring", stem: "Stem", bar: "Bar" };
    const VIEW_NAMES = { side: "drive side", nds: "other side", front3q: "from the front", ds3q: "angled", nds3q: "other side, angled", front: "head-on", top: "from above", three: "angled", lever: "rider's view", rear: "from behind" };
    const srcOf = p => p.inBrowser ? (p.fromFile ? "my_parts.js, edited in this browser" : PL.CATALOG.some(c => c.id === p.id) ? "catalogue, edited in this browser" : "added in this browser") : p.fromFile ? "my_parts.js" : "catalogue";
    function stopPreview() { clearTimeout(pvTimer); if (PL.preview) { PL.setPreview(null); update(); } }
    function shot(cat, i) {
      const s = (PL.SHOTS[cat] || [])[i]; if (!s || !S.built) return;
      if (focus(s[0], s[2], s[1])) document.querySelectorAll("[data-focus]").forEach(b => b.setAttribute("aria-pressed", "false"));
    }
    function renderLib() {
      const list = PL.byCat(libCat);
      const row = p => {
        const pr = PL.problems(p.id), bad = pr.filter(q => !q.shadow), shadow = pr.find(q => q.shadow), isCat = PL.CATALOG.some(c => c.id === p.id);
        const acts = p.builtIn && !p.inBrowser ? [`<button type="button" data-act="variant" data-id="${esc(p.id)}" title="A new part built on this one: change only what's different">Make my version</button>`]
          : [`<button type="button" data-act="edit" data-id="${esc(p.id)}">Edit</button>`, `<button type="button" data-act="variant" data-id="${esc(p.id)}" title="A new part built on this one: change only what's different">New variant</button>`, `<button type="button" data-act="dup" data-id="${esc(p.id)}">Duplicate</button>`];
        if (p.inBrowser) acts.push(`<button type="button" data-act="del" data-id="${esc(p.id)}">${p.fromFile ? "Reset to file version" : isCat ? "Undo my edits" : "Delete"}</button>`);
        acts.push(`<button type="button" data-act="use" data-id="${esc(p.id)}" class="primary">Put on this bike</button>`);
        const warn = bad.length ? `<details class="libwarn"><summary>⚠ ${bad.length} thing${bad.length === 1 ? "" : "s"} to check</summary><ul>${bad.map(q => `<li>${esc(q.msg)}</li>`).join("")}</ul><p class="note">The 3D view uses a safe value instead until it's fixed.</p></details>` : "";
        const sh = shadow ? `<p class="note libshadow">${esc(shadow.msg)}.</p>` : "";
        const link = p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">product page</a>` : "";
        const bp = p.base ? PL.raw(p.base) : null, baseTxt = p.base ? ` · <span class="libbase">built on ${esc(bp ? bp.name : p.base + " (missing)")}</span>` : "";
        return `<div class="librow${bad.length ? " haswarn" : ""}"><div><b>${bad.length ? "⚠ " : ""}${esc(p.name)}</b><div class="note">${esc(summary(libCat, PL.complete(libCat, p)))} · <i>${esc(srcOf(p))}</i>${baseTxt}${link}</div>${sh}${warn}</div><div class="btnrow">${acts.join("")}</div></div>`;
      };
      const mine = list.filter(p => !p.builtIn || p.inBrowser), built = list.filter(p => p.builtIn && !p.inBrowser);
      libEl.innerHTML = `<div class="libhead"><label class="f sel"><span>Category</span><select class="libcat">${PL.ORDER.map(c => `<option value="${c}"${c === libCat ? " selected" : ""}>${esc(PL.CATS[c].label)}</option>`).join("")}</select></label>
          <button type="button" data-act="new" class="primary">+ Add a part</button>
          <button type="button" data-act="export">Export my parts</button><button type="button" data-act="import">Import parts</button><input type="file" class="libfile" accept=".json,application/json" hidden></div>
        <p class="note">Parts you add here are saved in this browser and can go on any bike. Easiest way to get a part exactly right: paste its product link to Claude in chat. Or edit it here (the 3D view shows each change), then use “Copy request for Claude”.</p>
        <h4>My parts</h4>${mine.length ? mine.map(row).join("") : `<p class="note">None yet in this category.</p>`}
        <h4>Catalogue</h4>${built.map(row).join("")}<div class="libform" hidden></div>`;
      libEl.querySelector(".libcat").addEventListener("change", e => { libCat = e.target.value; renderLib(); });
      libEl.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => libAction(b.dataset.act, b.dataset.id)));
      libEl.querySelector(".libfile").addEventListener("change", e => {
        const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
        rd.onload = () => { try { const j = JSON.parse(rd.result), arr = Array.isArray(j) ? j : j.parts; let n = 0, w = 0; let same = 0;
          // a part identical to its my_parts.js version (an export carries those too) isn't copied into the browser: a copy would hide later fixes to the file
          const canon = q => JSON.stringify(Object.keys(rawCopy(q)).sort().map(k => [k, q[k]]));
          for (const p of arr || []) if (p && typeof p.id === "string" && p.id && PL.CATS[p.cat]) { const fv = PL.fileVersion(p.id); if (fv && canon(fv) === canon(p)) { same++; continue; } PL.upsert(p); n++; if (PL.validate(p).length) w++; }
          libMsg(`${n} part${n === 1 ? "" : "s"} imported${w ? ` (${w} with ⚠ things to check)` : ""}${same ? `; ${same} already in my_parts.js` : ""}.`); renderLib(); syncPanel(); } catch (err) { libMsg("That file isn't a parts file."); } e.target.value = ""; };
        rd.readAsText(f);
      });
      if (editing) showForm();
    }
    function libMsg(t) { if (host.onApply) { const tb = document.getElementById("toast"); if (tb) { tb.textContent = t; tb.hidden = false; clearTimeout(libMsg.h); libMsg.h = setTimeout(() => tb.hidden = true, 2400); } } }
    // the part as typed (no bookkeeping flags); editing works on this, so unknown fields survive a save
    const rawCopy = p => { const o = {}; for (const k of Object.keys(p)) if (!["builtIn", "fromFile", "inBrowser", "src", "missing", "preview"].includes(k)) o[k] = p[k]; return o; };
    function libAction(act, id) {
      if (act === "new") { editing = { isNew: true, part: { id: PL.newId(libCat), cat: libCat, name: "My " + PL.CATS[libCat].label.toLowerCase() } }; return showForm(true); }
      if (act === "export") {
        const mine = PL.load(); const file = (root.MY_PARTS || []).filter(p => !mine.some(m => m.id === p.id));
        const blob = new Blob([JSON.stringify({ note: "Cyclic Labs parts — send to Claude to add to my_parts.js", parts: file.concat(mine) }, null, 2)], { type: "application/json" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "cyclic-labs-my-parts.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
      }
      if (act === "import") return libEl.querySelector(".libfile").click();
      const p = PL.raw(id); if (!p) return;
      if (act === "use") { selOf()[p.cat] = p.id; host.onPartsChanged && host.onPartsChanged(); syncPanel(); libMsg(`${p.name} is on this bike.`); return; }
      if (act === "del") { PL.remove(id); renderLib(); syncPanel(); host.onPartsChanged && host.onPartsChanged(); return; }
      if (act === "dup") { editing = { isNew: true, part: Object.assign(rawCopy(p), { id: PL.newId(p.cat), name: p.name + " (copy)" }) }; return showForm(true); }
      // a variant stores only what's different from its base, so later fixes to the base reach it
      if (act === "variant") { editing = { isNew: true, part: { id: PL.newId(p.cat), cat: p.cat, name: p.name + " (mine)", base: p.id } }; return showForm(true); }
      if (act === "edit") {
        const copy = p.builtIn && !p.inBrowser;
        editing = { isNew: copy, part: Object.assign(rawCopy(p), copy ? { id: PL.newId(p.cat), name: p.name + " (mine)" } : {}) }; return showForm(true);
      }
    }
    function showForm(jump) {
      const f = libEl.querySelector(".libform"), p = editing.part, C = PL.CATS[p.cat], full = PL.complete(p.cat, p);
      const info = C.fields.filter(x => x[4] === "info"), drawn = C.fields.filter(x => x[4] !== "info");
      const input = ([k, lab, t, d, x]) => {
        if (t === "s") return `<label class="f sel"><span>${esc(lab)}</span><select data-f="${k}">${x.map(([v, tl]) => `<option value="${esc(v)}">${esc(tl)}</option>`).join("")}</select></label>`;
        if (t === "c") return `<label class="f sel"><span>${esc(lab)}</span><input type="color" data-f="${k}"></label>`;
        if (t === "t") return `<label class="f sel${k === "notes" || k === "url" ? " wide" : ""}"><span>${esc(lab)}</span><input type="${k === "url" ? "url" : "text"}" data-f="${k}"${k === "url" ? ' placeholder="https://…" inputmode="url"' : ""}></label>`;
        const L = PL.limitsOf(p.cat, [k, lab, t, d, x], full), rng = L ? `${L.zero ? "0 or " : ""}${L.min}–${L.max}` : "";
        return `<label class="f"><span>${esc(lab)}${rng ? ` <small class="rng">(${esc(rng)})</small>` : ""}</span><input type="number" step="any" inputmode="decimal" data-f="${k}"${L ? ` min="${L.zero ? 0 : L.hardMin}" max="${L.hardMax}"` : ""}><span class="u">${esc(x || "")}</span></label>`;
      };
      const shots = PL.SHOTS[p.cat] || [];
      f.hidden = false;
      f.innerHTML = `<h4>${editing.isNew ? "New" : "Edit"} ${esc(C.label.toLowerCase())}</h4>
        <div class="libmatch"><b>Make it match the real part</b>
          <p class="note libLink"></p>
          <ul class="libcheck">${(PL.CHECKLIST[p.cat] || []).map(t => `<li>${esc(t)}</li>`).join("")}</ul>
          <div class="btnrow libshots">${shots.map((s, i) => `<button type="button" data-shot="${i}">${esc(SHOT_NAMES[s[0]] || s[0])}${s[1] && VIEW_NAMES[s[1]] ? `, ${esc(VIEW_NAMES[s[1]])}` : ""}</button>`).join("")}<button type="button" data-shot="all">Whole bike</button><button type="button" class="libup">↑ Show the 3D view</button></div>
          <p class="note">The 3D view shows your changes as you make them (not saved until you press Save).</p>
          <div class="btnrow"><button type="button" class="libcopy">Copy request for Claude</button></div>
          <textarea class="libreq" readonly rows="6" hidden></textarea>
        </div>
        <div class="fields formgrid"><label class="f sel"><span>Name</span><input type="text" data-f="name"></label>
          <label class="f sel wide"><span>Built on (base part: everything you don't change comes from it)</span><select data-f="base"><option value="">Nothing: a stand-alone part</option>${PL.byCat(p.cat).filter(q => q.id !== p.id && !(PL.baseChain(q).ids.includes(p.id))).map(q => `<option value="${esc(q.id)}">${esc(q.name)}</option>`).join("")}</select></label>
          ${info.map(input).join("")}</div>
        <div class="fields formgrid">${drawn.map(input).join("")}</div>
        <ul class="libprob" hidden></ul>
        <div class="btnrow"><button type="button" class="primary" data-f-act="save">Save part</button><button type="button" data-f-act="saveuse">Save &amp; put on this bike</button><button type="button" data-f-act="cancel">Cancel</button></div>`;
      // each box starts at the part's value (made safe) or the default; only values that were in the part or that W changes are saved
      f.querySelectorAll("[data-f]").forEach(i => { const k = i.dataset.f, had = p[k] !== undefined && p[k] !== null; const v = k === "name" ? (p.name || "") : k === "base" ? (p.base || "") : full[k];
        i.value = v == null ? "" : String(v); i.dataset.had = had ? "1" : ""; i.dataset.orig = i.value;
        if (p.base && !had && k !== "name" && k !== "base") { const lb = i.closest("label"); if (lb) lb.classList.add("inh"); } });
      const fd = k => C.fields.find(x => x[0] === k);
      const read = () => {
        const o = rawCopy(p); o.id = p.id; o.cat = p.cat;
        f.querySelectorAll("[data-f]").forEach(i => {
          const k = i.dataset.f, d = fd(k);
          if (!i.dataset.had && i.value === i.dataset.orig) return;   // untouched and not in the part: leave it out (default / base applies)
          if (k === "base") { if (i.value) o.base = i.value; else delete o.base; return; }
          if (d && d[2] === "n") { if (i.value === "") delete o[k]; else o[k] = +i.value; }
          else o[k] = i.value;
        });
        return o;
      };
      const refresh = () => {
        const o = read(), pr = PL.validate(o), ul = f.querySelector(".libprob");
        ul.hidden = !pr.length; ul.innerHTML = pr.map(q => `<li class="${q.level}">⚠ ${esc(q.msg)}</li>`).join("");
        const ln = f.querySelector(".libLink");
        if (o.url && /^https?:\/\//i.test(o.url)) { ln.innerHTML = `Product page: <a target="_blank" rel="noopener"></a>`; const a = ln.querySelector("a"); a.href = o.url; a.textContent = o.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60); }
        else ln.textContent = "No product link yet: paste it into “Product link” below so it stays with the part. Things to look at on the product page / photo:";
        return o;
      };
      const preview = () => { clearTimeout(pvTimer); pvTimer = setTimeout(() => { if (!editing) return; PL.setPreview(PL.complete(p.cat, read())); update(); }, 250); };
      f.querySelectorAll("[data-f]").forEach(i => { const typed = () => { i.dataset.had = "1"; const lb = i.closest("label"); if (lb) lb.classList.remove("inh"); if (editing) editing.part = read();
          if (i.dataset.f === "base" && editing) { showForm(); return; }   // new base: redraw so the inherited values show
          refresh(); preview(); };   // keep the typed values so a re-drawn form (tab / category switch) doesn't lose them
        i.addEventListener("input", typed); i.addEventListener("change", typed); });
      f.querySelectorAll("[data-shot]").forEach(b => b.addEventListener("click", () => { if (b.dataset.shot === "all") { const v = document.querySelector('[data-view][aria-pressed="true"]'); setView(v ? v.dataset.view : "three"); document.querySelectorAll("[data-focus]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.focus === "all"))); } else shot(p.cat, +b.dataset.shot); }));
      f.querySelector(".libup").addEventListener("click", () => { const v = document.querySelector(".viewer") || S.canvas; if (v) v.scrollIntoView({ behavior: "smooth", block: "start" }); });
      f.querySelector(".libcopy").addEventListener("click", () => {
        const txt = PL.requestText(read()), ta = f.querySelector(".libreq"); ta.value = txt; ta.hidden = false;
        const fallback = () => { ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (e) {} libMsg(ok ? "Copied: paste it to Claude in chat." : "Select the text below and copy it to Claude."); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => libMsg("Copied: paste it to Claude in chat."), fallback); else fallback();
      });
      f.querySelectorAll("[data-f-act]").forEach(b => b.addEventListener("click", () => {
        const a = b.dataset.fAct;
        if (a === "cancel") { editing = null; f.hidden = true; stopPreview(); return; }
        const o = read(); if (!String(o.name || "").trim()) o.name = "My " + C.label.toLowerCase();
        if (!PL.upsert(o)) libMsg("This browser wouldn't save it; use Export instead.");
        if (a === "saveuse") selOf()[o.cat] = o.id;
        editing = null; clearTimeout(pvTimer); PL.setPreview(null); renderLib(); syncPanel(); host.onPartsChanged && host.onPartsChanged(); update();
        const n = PL.validate(o).length; libMsg(`Saved “${o.name}”.` + (n ? ` ⚠ ${n} thing${n === 1 ? "" : "s"} to check.` : ""));
      }));
      refresh();
      PL.setPreview(PL.complete(p.cat, read())); update();
      if (jump) { shot(p.cat, 0); f.scrollIntoView({ block: "nearest" }); }
    }
  }
  function syncPanel() { for (const f of S.panelSync) { try { f(); } catch (e) {} } }
  function dispose() {
    if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0;
    if (S.ro) S.ro.disconnect();
    if (S.R) S.R.dispose();
    if (S.canvas) S.canvas.remove(); if (S.msg) S.msg.remove();
    if (S.host && S.host.panel) { S.host.panel.innerHTML = ""; S.host.panel.hidden = true; }
    Object.assign(S, { R: null, canvas: null, msg: null, built: null, key: "", lastRes: null, on: false, panelSync: [] });
  }
  // buildBike + isDark are shared with garage.js's showroom (its own canvas and renderer; buildBike only uses R, st, theme)
  root.FrameBike3D = { supported, init, show, update, setView, focus, FOCUS_VIEWS, dispose, buildBike, isDark, VIEWS, get mode() { return S.mode; }, _state: S };
})(typeof window !== "undefined" ? window : globalThis);
