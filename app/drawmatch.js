// ============================================================================
//  MATCH A FRAME DRAWING (drawmatch.js, v9.3)
//  Type the numbers exactly as the builder prints them on a frame drawing; this turns them into Cyclic Labs' inputs
//  and cross-checks the drawing's own totals (wheelbase, front centre, effective top tube, top-tube and
//  down-tube lengths) against the geometry, so mistakes on a drawing are caught before it is confirmed.
//
//  How a builder dimensions a drawing (checked against six real drawings, 2026-10-10):
//   • Stack / reach: BB centre to the head-tube top centre (vertical / level).
//   • Fork length: head-tube bottom to the front axle, along the steering line (Cyclic Labs: lower cup + A2C).
//   • Front centre "FC": straight line BB → front axle (not the level distance). Wheelbase "WB": level, axle to axle.
//   • Chainstay: straight line BB → rear axle. BB drop: vertical.
//   • Small numbers at the head tube: top-tube centre below the head-tube top, down-tube centre above its bottom,
//     measured along the head tube (the tiny 8.7 / 7 next to them are the cup seats, not tube positions).
//   • Down tube length: BB to where the down-tube line meets the head-tube line. Top tube length: centre to centre.
//   • Seat-stay length (the longest number along the stay): rear axle to where the stay line meets the seat tube.
//  "Copy for my order" writes the same numbers (plus tubes and any bent tubes, which the builder's side view only shows
//  as curved lines) as plain text for the order email, in the builder's terms.
//  Hooks: Geometry window button (#btnDrawMatch, added here), the Start page card and typed drawing rounds (journey.js), the new-bike walkthrough ("typed" source),
//  the design chat ("match a frame drawing", "order email"), the scanner's start / failure screens ("Type the
//  numbers in instead"). Needs window.CyclicLabsApp.
// ============================================================================
(function (root) {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = v => (v === "" || v == null || !isFinite(+v)) ? null : +v;
  const FEA = () => root.FrameFEA, App = () => root.CyclicLabsApp;
  const rad = Math.PI / 180;

  // ---------------------------------------------------------------- the numbers, as labelled on a builder's drawing
  // k, label, unit, where to find it on the drawing, example (from a real builder 700C × 560 drawing)
  const MAIN = [
    ["stack", "Stack", "mm", "Tall vertical line from the BB up to the top of the head tube.", "585.2"],
    ["reach", "Reach", "mm", "Level line from the BB forward to the head tube, just below the top tube.", "378"],
    ["headAngle", "Head angle", "°", "Angle at the front wheel, between the steering line and the axle line.", "72"],
    ["seatAngle", "Seat angle", "°", "Angle at the BB, between the seat-tube line and the axle line.", "73"],
    ["headTube", "Head tube length", "mm", "Along the head tube (also on the head-tube detail, top right).", "175"],
    ["seatTube", "Seat tube length", "mm", "Along the seat tube, BB centre to its top.", "560"],
    ["chainstay", "Chainstay", "mm", "Along the chainstay in the side view, BB centre to the rear axle.", "420"],
    ["bbDrop", "BB drop", "mm", "Short vertical number beside the BB, from the axle line down to the BB.", "70"],
    ["forkLen", "Fork length", "mm", "Along the steering line, from the head-tube bottom to the front axle.", "382"],
    ["forkOffset", "Fork offset (rake)", "mm", "Small number at the front axle, square to the steering line.", "47"]
  ];
  const JOINTS = [
    ["ttBelowHt", "Top-tube centre below head-tube top", "mm", "Along the head tube, top end. Use the larger number (e.g. 34.3), not the small cup number (8.7).", "34.3"],
    ["dtAboveHt", "Down-tube centre above head-tube bottom", "mm", "Along the head tube, bottom end (e.g. 65.8), not the small cup number (7).", "65.8"],
    ["stAboveTt", "Seat-tube top above the top tube", "mm", "Short number at the very top of the seat tube.", "40"],
    ["ssLen", "Seat-stay length", "mm", "Longest number along the seat stay: rear axle to the seat tube.", "500.8"]
  ];
  const CHECK = [
    ["ett", "Effective top tube", "mm", "The long level number across the very top. If reach is missing, reach is worked out from it.", "557.5"],
    ["wb", "Wheelbase (WB)", "mm", "Level line along the bottom, axle to axle.", "1008.9"],
    ["fc", "Front centre (FC)", "mm", "BB to the front axle.", "598.9"],
    ["ttLen", "Top tube length", "mm", "Along the top tube, centre to centre.", "543.9"],
    ["dtLen", "Down tube length", "mm", "Along the down tube, BB to the head tube.", "633.4"]
  ];
  const ALL = MAIN.concat(JOINTS, CHECK);
  const BADGE = {}; ALL.forEach(([k], i) => BADGE[k] = i + 1);

  // ---------------------------------------------------------------- numbers ⇄ design
  // Turn the drawing's numbers into geometry changes for 'base' (a full design). Blank fields keep base's value.
  function toChanges(v, base) {
    const g0 = base.geometry, g = {}, notes = [];
    for (const k of ["stack", "headAngle", "seatAngle", "headTube", "seatTube", "chainstay", "bbDrop", "forkOffset"]) if (v[k] != null) g[k] = v[k];
    if (v.reach != null) g.reach = v.reach;
    else if (v.ett != null) {
      const st = v.stack != null ? v.stack : g0.stack, sa = (v.seatAngle != null ? v.seatAngle : g0.seatAngle) * rad;
      g.reach = +(v.ett - st / Math.tan(sa)).toFixed(1);
      notes.push(`Reach worked out from the effective top tube: ${g.reach} mm.`);
    }
    if (v.forkLen != null) { const cup = FEA().num(g0.lowerCupStack, 0); g.forkA2C = +(v.forkLen - cup).toFixed(1); if (cup) notes.push(`Fork axle-to-crown = fork length − ${cup} mm lower cup = ${g.forkA2C} mm.`); }
    if (v.ttBelowHt != null) g.ttBelowHtTop = v.ttBelowHt;
    if (v.dtAboveHt != null) g.dtAboveHtBottom = v.dtAboveHt;
    const stL = g.seatTube != null ? g.seatTube : g0.seatTube;
    if (v.stAboveTt != null) g.ttAtSeatTube = +(stL - v.stAboveTt).toFixed(1);
    if (v.ssLen != null) {
      // where on the seat-tube line (x from the BB) is the rear axle exactly ssLen away? x² − 2x(a·u) + |a|² − L² = 0
      const G = Object.assign({}, g0, g), cs = G.chainstay, dr = G.bbDrop, sa = G.seatAngle * rad;
      const a = [-Math.sqrt(Math.max(0, cs * cs - dr * dr)), dr], u = [-Math.cos(sa), Math.sin(sa)];
      const au = a[0] * u[0] + a[1] * u[1], disc = au * au - (a[0] * a[0] + a[1] * a[1]) + v.ssLen * v.ssLen;
      if (disc > 0) {
        const x = au + Math.sqrt(disc), tt = G.ttAtSeatTube, below = tt - x;
        if (below < -1) notes.push(`The seat-stay length puts the stays ${(-below).toFixed(0)} mm above the top tube; modelled at the top tube.`);
        g.ssBelowTt = +Math.max(0, below).toFixed(1);
      } else notes.push("The seat-stay length is too short to reach the seat tube with this chainstay; left as it was.");
    }
    return { geometry: g, notes };
  }
  // the same numbers read back from a design (to fill the form from the open design, or to show what a design gives)
  function fromDesign(d) {
    const F = FEA(), g = d.geometry, geo = F.buildGeometry(g, d.tubes), P = geo.P, info = geo.info;
    const A = P.AxleR, ssTop = P.SSst;
    return {
      stack: g.stack, reach: g.reach, headAngle: g.headAngle, seatAngle: g.seatAngle, headTube: g.headTube, seatTube: g.seatTube,
      chainstay: g.chainstay, bbDrop: g.bbDrop, forkLen: F.num(g.lowerCupStack, 0) + g.forkA2C, forkOffset: g.forkOffset,
      ttBelowHt: g.ttBelowHtTop, dtAboveHt: g.dtAboveHtBottom, stAboveTt: g.seatTube - g.ttAtSeatTube,
      ssLen: Math.hypot(ssTop[0] - A[0], ssTop[1] - A[1]),
      ett: info.effectiveTopTube, wb: info.wheelbase, fc: Math.hypot(P.AxleF[0], P.AxleF[1]),
      ttLen: info.frontTriangle.topTube, dtLen: info.frontTriangle.downTube,
      frontAxleUp: P.AxleF[1] - P.AxleR[1], geo
    };
  }
  // Compare what the drawing says with what its main numbers build. Returns rows + plain-language findings.
  function check(v, built) {
    const rows = [], tol = { ok: 1.5, warn: 4 };
    const cmp = (k, label, tolOk, tolWarn) => {
      if (v[k] == null) return;
      const d = built[k] - v[k], a = Math.abs(d), st = a <= (tolOk || tol.ok) ? "ok" : a <= (tolWarn || tol.warn) ? "warn" : "bad";
      rows.push({ k, label, drawing: v[k], built: built[k], d, st });
    };
    cmp("ett", "Effective top tube"); cmp("wb", "Wheelbase"); cmp("fc", "Front centre"); cmp("ttLen", "Top tube length"); cmp("dtLen", "Down tube length");
    if (v.reach != null && v.ett == null) {} // nothing to compare
    const by = k => rows.find(r => r.k === k), bad = k => by(k) && by(k).st !== "ok";
    const find = [];
    if (bad("ett")) find.push(`Effective top tube is ${fmtD(by("ett").d)} against the drawing: the drawing's stack, reach and seat angle don't add up to its ETT. Check those three numbers (an ETT mismatch is how a wrong reach shows up).`);
    if (bad("wb") && bad("fc") && Math.abs(by("wb").d - by("fc").d) < 3) find.push(`Wheelbase and front centre are both off by about ${fmtD(by("fc").d)}: the front end differs. Check the head angle, fork length and offset (and that the fork length runs from the head-tube bottom).`);
    else {
      if (bad("fc")) find.push(`Front centre is ${fmtD(by("fc").d)}: check reach, head angle, head-tube length, fork length and offset.`);
      if (bad("wb") && !bad("fc")) find.push(`Wheelbase is ${fmtD(by("wb").d)} while the front centre matches: check the chainstay length and BB drop.`);
    }
    if (bad("dtLen")) find.push(`Down tube length is ${fmtD(by("dtLen").d)}: check the down-tube position at the head tube (the larger number at the bottom of the head tube) and the head-tube length.`);
    if (bad("ttLen")) find.push(`Top tube length is ${fmtD(by("ttLen").d)}: check the top-tube position at the head tube and the seat-tube top number.`);
    if (built.frontAxleUp != null && Math.abs(built.frontAxleUp) > 3) find.push(`With this fork the front axle sits ${Math.abs(built.frontAxleUp).toFixed(0)} mm ${built.frontAxleUp > 0 ? "higher" : "lower"} than the rear axle, so the bike isn't level: the BB drop is measured from the rear axle. Normal with a suspension fork drawn at full length; otherwise worth asking about.`);
    if (rows.length && rows.every(r => r.st === "ok")) find.push("Everything the drawing prints agrees with its own main numbers (to within 1.5 mm).");
    return { rows, find };
  }
  const fmtD = d => `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} mm`;

  // ---------------------------------------------------------------- side-view diagram with numbered dimensions
  function diagram(d, focus) {
    let b; try { b = fromDesign(d); } catch (e) { return `<p class="hint">${esc(e.message)}</p>`; }
    const P = b.geo.P, g = d.geometry, F = FEA(), Rr = g.tireDiameter / 2, Rf = F.frontTyreR(g);
    const pts = [P.AxleR, P.AxleF, P.STtop, P.HTtop, P.BB].map(p => [p[0], p[1]]);
    const x0 = P.AxleR[0] - Rr - 20, x1 = P.AxleF[0] + Rf + 20, y0 = Math.min(P.AxleR[1] - Rr, P.AxleF[1] - Rf) - 40, y1 = Math.max(P.STtop[1], P.HTtop[1]) + 70;
    const W = 720, sc = W / (x1 - x0), H = Math.round((y1 - y0) * sc);
    const X = x => ((x - x0) * sc).toFixed(1), Y = y => ((y1 - y) * sc).toFixed(1);
    const L = (a, c, cls, extra) => `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(c[0])}" y2="${Y(c[1])}" class="${cls}"${extra || ""}/>`;
    const poly = (arr, cls) => `<polyline points="${arr.map(p => X(p[0]) + "," + Y(p[1])).join(" ")}" class="${cls}"/>`;
    const out = [];
    // wheels, frame centrelines, fork
    out.push(`<circle cx="${X(P.AxleR[0])}" cy="${Y(P.AxleR[1])}" r="${(Rr * sc).toFixed(1)}" class="wm-wheel"/><circle cx="${X(P.AxleF[0])}" cy="${Y(P.AxleF[1])}" r="${(Rf * sc).toFixed(1)}" class="wm-wheel"/>`);
    out.push(poly(b.geo.seatTubeLine, "wm-tube"), L(P.TTst, P.TTht, "wm-tube"), L(P.HTtop, P.HTbot, "wm-tube wm-ht"), poly(b.geo.downTubeLine, "wm-tube"));
    out.push(poly(b.geo.chainstayLine, "wm-tube"), poly(b.geo.seatStayLine, "wm-tube"), L(P.HTbot, P.AxleF, "wm-fork"));
    out.push(`<circle cx="${X(0)}" cy="${Y(0)}" r="${(26 * sc).toFixed(1)}" class="wm-bb"/>`);
    // dimension helper: line from a to c, offset sideways by off mm, with a numbered badge
    const dims = [];
    const dim = (k, a, c, off, badgeAt) => {
      const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1, n = [-dy / l * off, dx / l * off];
      const A = [a[0] + n[0], a[1] + n[1]], C = [c[0] + n[0], c[1] + n[1]], m = badgeAt || [(A[0] + C[0]) / 2, (A[1] + C[1]) / 2];
      dims.push({ k, svg: `<g class="wm-dim${focus === k ? " on" : ""}" data-k="${k}">${L(a, A, "wm-ext")}${L(c, C, "wm-ext")}${L(A, C, "wm-dl")}</g>`, badge: m });
    };
    const lvl = P.AxleR[1];
    dim("stack", [P.HTtop[0] + 30, 0], [P.HTtop[0] + 30, P.HTtop[1]], 0, [P.HTtop[0] + 30, P.HTtop[1] * 0.55]);
    dim("reach", [0, P.HTtop[1] - 60], [P.HTtop[0], P.HTtop[1] - 60], 0);
    const ettY = Math.max(P.STtop[1], P.HTtop[1]) + 40, ettX0 = P.HTtop[1] / Math.tan(g.seatAngle * rad) * -1;
    dim("ett", [ettX0, ettY], [P.HTtop[0], ettY], 0);
    dim("headTube", P.HTtop, P.HTbot, -28);
    dim("seatTube", P.BB, P.STtop, 34);
    dim("chainstay", P.BB, P.AxleR, -26);
    dim("bbDrop", [24, 0], [24, lvl], 0, [44, lvl / 2]);
    const foot = [P.AxleF[0] - g.forkOffset * b.geo.nF[0], P.AxleF[1] - g.forkOffset * b.geo.nF[1]];   // axle, back onto the steering line
    out.push(L(P.HTbot, foot, "wm-ext"));
    dim("forkLen", P.HTbot, foot, -40);
    dim("forkOffset", foot, P.AxleF, 0, [P.AxleF[0] + 26, P.AxleF[1] - 22]);
    dim("ttBelowHt", P.HTtop, P.TTht, 22, [P.HTtop[0] + 34, (P.HTtop[1] + P.TTht[1]) / 2 + 10]);
    dim("dtAboveHt", P.DTht, P.HTbot, 22, [P.HTbot[0] + 30, (P.HTbot[1] + P.DTht[1]) / 2]);
    dim("stAboveTt", P.TTst, P.STtop, 22, [P.STtop[0] - 26, (P.STtop[1] + P.TTst[1]) / 2]);
    dim("ssLen", P.AxleR, P.SSst, 22);
    dim("wb", [P.AxleR[0], lvl - Rr - 22], [P.AxleF[0], lvl - Rr - 22], 0);
    dim("fc", P.BB, P.AxleF, -14, [P.AxleF[0] * 0.62, P.AxleF[1] * 0.62 - 18]);
    dim("ttLen", P.TTst, P.TTht, -16);
    dim("dtLen", P.BB, P.DTht, 30);
    // angle arcs
    const arc = (k, c, a0, a1, r, badgeAt) => {
      const p0 = [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], p1 = [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)];
      dims.push({ k, svg: `<g class="wm-dim${focus === k ? " on" : ""}" data-k="${k}"><path d="M${X(p0[0])},${Y(p0[1])} A${(r * sc).toFixed(1)},${(r * sc).toFixed(1)} 0 0 1 ${X(p1[0])},${Y(p1[1])}" class="wm-dl"/></g>`, badge: badgeAt });
    };
    // head angle at the steering line's crossing of the axle line, between the line and the ground (behind)
    const ha = g.headAngle * rad, hx = P.HTtop[0] + (P.HTtop[1] - lvl) / Math.tan(ha);
    out.push(L([P.AxleR[0] - Rr * 0.4, lvl], [P.AxleF[0] + Rf * 0.5, lvl], "wm-axle"), L(P.HTbot, [hx, lvl], "wm-ext"));
    arc("headAngle", [hx, lvl], Math.PI - ha, Math.PI, 70, [hx - 92, lvl + 22]);
    const sa = g.seatAngle * rad, sx = -lvl / Math.tan(sa);
    out.push(L([sx, lvl], [0, 0], "wm-ext"));
    arc("seatAngle", [sx, lvl], Math.PI - sa, Math.PI, 80, [sx - 100, lvl + 34]);
    // badges last (on top)
    const badges = dims.map(o => `<g class="wm-badge${focus === o.k ? " on" : ""}" data-k="${o.k}"><circle cx="${X(o.badge[0])}" cy="${Y(o.badge[1])}" r="10"/><text x="${X(o.badge[0])}" y="${(+Y(o.badge[1]) + 4).toFixed(1)}">${BADGE[o.k]}</text></g>`);
    return `<svg viewBox="0 0 ${W} ${H}" class="wm-svg" role="img" aria-label="Side view of the frame with each builder's drawing number marked">${out.join("")}${dims.map(o => o.svg).join("")}${badges.join("")}</svg>`;
  }

  // ---------------------------------------------------------------- the order email text
  const f1 = v => (Math.round(+v * 10) / 10).toString();
  const tubeTxt = sp => !sp ? "?" : sp.shape === "biaxial" && sp.htH ? `${f1(sp.htH)}×${f1(sp.htW)} at the head tube to ${f1(sp.bbH)}×${f1(sp.bbW)} at the BB, ${f1(sp.wall)} wall`
    : sp.h && sp.w ? `${sp.shape ? sp.shape + " " : ""}${f1(sp.h)}×${f1(sp.w)}, ${f1(sp.wall)} wall` : `Ø${f1(sp.od)}×${f1(sp.wall)}${sp.buttWall > sp.wall && sp.buttLength > 0 ? ` (butted ${f1(sp.buttWall)} at the ends)` : ""}`;
  // plain-language description of every bend in a design (empty list = all straight)
  function bendsText(d) {
    const F = FEA(), g = d.geometry, out = [];
    let geo; try { geo = F.buildGeometry(g, d.tubes); } catch (e) { return out; }
    const B = geo.bends || {}, R = b => b.prof.rMin < 5000 ? ` (bend radius about ${Math.round(b.prof.rMin)} mm)` : "";
    if (B.st) out.push(`Seat tube bent forward near the BB for tyre room: the bend is ${f1(g.stBendOffset)} mm in front of the straight line from the BB to the saddle, ${f1(g.stBendHeight)} mm up from the BB${R(B.st)}. Upper (straight) part of the tube at ${geo.info.seatTubeAngleReal.toFixed(1)}°; effective seat angle ${f1(g.seatAngle)}° at a ${f1(g.saddleHeight)} mm saddle height.`);
    if (B.dt) out.push(`Down tube bent ${+g.dtBendAngle > 0 ? "up (toward the top tube)" : "down (toward the front wheel)"} by ${f1(Math.abs(g.dtBendAngle))}°, ${f1(g.dtBendFromHt)} mm from the head-tube joint${R(B.dt)}${+g.dtBendAngle > 0 ? ", for fork-crown clearance" : ""}.`);
    const stay = (b, name, style, depth, at, from) => {
      if (!b) return;
      const away = +depth > 0, dir = name === "Chainstays" ? (away ? "down (away from the tyre)" : "up (toward the tyre)") : (away ? "up and back (away from the tyre)" : "down (toward the tyre)");
      if (style === "bow") out.push(`${name} curved in the side view: one smooth curve, ${f1(Math.abs(depth))} mm ${dir} at the middle${R(b)}.`);
      else if (style === "kink") out.push(`${name} with one bend in the side view, ${f1(at)} mm from the ${from}: ${f1(Math.abs(depth))} mm ${dir}${R(b)}.`);
      else if (style === "s") out.push(`${name} S-bent in the side view: ${f1(Math.abs(depth))} mm each way.`);
    };
    stay(B.ss, "Seat stays", g.ssBendStyle, g.ssBendDepth, g.ssBendAt, "rear axle");
    stay(B.cs, "Chainstays", g.csBendStyle, g.csBendDepth, g.csBendAt, "BB");
    return out;
  }
  function orderText(d, name) {
    const g = d.geometry, t = d.tubes, b = fromDesign(d), L = [];
    L.push(`Frame geometry for ${name} (mm and degrees, measured the way your drawings show them):`);
    L.push(`- Stack ${f1(b.stack)}, reach ${f1(b.reach)} (effective top tube ${f1(b.ett)})`);
    L.push(`- Head angle ${f1(g.headAngle)}°, seat angle ${f1(g.seatAngle)}°`);
    L.push(`- Head tube ${f1(g.headTube)}, seat tube ${f1(g.seatTube)} (BB centre to top)`);
    L.push(`- Chainstay ${f1(g.chainstay)}, BB drop ${f1(g.bbDrop)}`);
    L.push(`- Fork length ${f1(b.forkLen)} (head-tube bottom to front axle), offset ${f1(g.forkOffset)}`);
    L.push(`- Top-tube centre ${f1(b.ttBelowHt)} below the head-tube top; down-tube centre ${f1(b.dtAboveHt)} above the head-tube bottom`);
    L.push(`- Seat tube ${f1(b.stAboveTt)} above the top tube; seat stays ${f1(b.ssLen)} from the rear axle to the seat tube`);
    L.push(`- To check against the drawing: wheelbase ${f1(b.wb)}, front centre ${f1(b.fc)}, top tube ${f1(b.ttLen)}, down tube ${f1(b.dtLen)}`);
    L.push("", `Tyres: up to ${f1(g.tireWidth)} mm wide, ${f1(g.tireDiameter)} mm outside diameter${+g.tireDiameterFront > 0 ? ` (front ${f1(g.tireDiameterFront)})` : ""}, with about ${f1(g.ssClearance != null ? g.ssClearance : 6)} mm clearance.`);
    L.push("", "Tubes:");
    for (const [k, lab] of [["topTube", "Top tube"], ["downTube", "Down tube"], ["seatTube", "Seat tube"], ["headTube", "Head tube"], ["chainstay", "Chainstays"], ["seatStay", "Seat stays"]]) if (t[k]) L.push(`- ${lab} ${tubeTxt(t[k])}`);
    const lay = [];
    if (g.ssShape === "curved") lay.push("Seat stays bent out sideways to clear the tyre.");
    if (g.ssShape === "wishbone") lay.push("Wishbone seat stay (one tube from the seat tube, splitting into two legs above the tyre).");
    if (+g.csYokeLength > 0) lay.push(`Chainstay yoke, about ${f1(g.csYokeLength)} mm long from the BB.`);
    if (g.ssBridge === true || g.ssBridge === "true") lay.push("Seat-stay bridge.");
    const bt = bendsText(d);
    if (lay.length || bt.length) { L.push("", "Shape:"); for (const x of lay.concat(bt)) L.push(`- ${x}`); }
    if (bt.length) L.push("", "Could you show each bend on the drawing with its position and radius, so I can check them before I confirm?");
    return L.join("\n");
  }

  // ---------------------------------------------------------------- dialog
  const css = `
  dialog.wm { width: min(1240px, calc(100vw - 24px)); max-width: none; height: min(900px, calc(100vh - 24px)); max-height: none; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--ink); }
  dialog.wm::backdrop { background: rgba(10, 12, 16, .55); }
  .wm-wrap { display: flex; flex-direction: column; height: 100%; }
  .wm-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .wm-head h2 { font-size: 20px; flex: 1; margin: 0; }
  .wm-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(340px, 1fr); }
  .wm-left { overflow: auto; padding: 12px 16px; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
  .wm-svg { width: 100%; height: auto; display: block; }
  .wm-svg .wm-wheel { fill: none; stroke: var(--line); stroke-width: 6; }
  .wm-svg .wm-tube { fill: none; stroke: var(--ink); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .wm-svg .wm-ht { stroke-width: 5; }
  .wm-svg .wm-fork { stroke: var(--muted); stroke-width: 2.5; stroke-dasharray: 6 4; }
  .wm-svg .wm-bb { fill: none; stroke: var(--ink); stroke-width: 2; }
  .wm-svg .wm-axle { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 10 4 2 4; }
  .wm-svg .wm-ext { stroke: var(--muted); stroke-width: .8; opacity: .7; }
  .wm-svg .wm-dl { fill: none; stroke: var(--muted); stroke-width: 1.2; }
  .wm-svg .wm-dim.on .wm-dl, .wm-svg .wm-dim.on .wm-ext { stroke: var(--accent); stroke-width: 2.6; opacity: 1; }
  .wm-svg .wm-badge circle { fill: var(--panel); stroke: var(--muted); stroke-width: 1.2; }
  .wm-svg .wm-badge text { font: 600 11px var(--font-data); text-anchor: middle; fill: var(--ink); }
  .wm-svg .wm-badge { cursor: pointer; }
  .wm-svg .wm-badge.on circle { fill: var(--accent); stroke: var(--accent); }
  .wm-svg .wm-badge.on text { fill: var(--on-accent); }
  .wm-where { font-size: 13.5px; min-height: 2.6em; color: var(--muted); }
  .wm-where b { color: var(--ink); }
  .wm-right { display: flex; flex-direction: column; min-height: 0; }
  .wm-list { flex: 1; overflow: auto; padding: 4px 0 8px; }
  .wm-list h4 { font: 600 12px var(--font-body, system-ui); color: var(--muted); text-transform: uppercase; letter-spacing: .07em; margin: 12px 16px 4px; }
  .wm-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) 92px 26px; gap: 8px; align-items: center; padding: 4px 12px 4px 16px; font-size: 14px; border-left: 3px solid transparent; }
  .wm-row.on { background: var(--accent-soft); border-left-color: var(--accent); }
  .wm-row .n { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--muted); display: grid; place-items: center; font: 600 11px var(--font-data); }
  .wm-row.on .n { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .wm-row small { display: block; color: var(--muted); font-size: 12px; }
  .wm-row input { font-family: var(--font-data); font-size: 13px; text-align: right; width: 100%; padding: 4px 6px; }
  .wm-row .u { color: var(--muted); font: 12px var(--font-data); }
  .wm-res { border-top: 1px solid var(--line); padding: 8px 16px; font-size: 13.5px; max-height: 40%; overflow: auto; }
  .wm-res table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .wm-res td, .wm-res th { padding: 3px 6px; text-align: right; border-bottom: 1px solid var(--line); }
  .wm-res td:first-child, .wm-res th:first-child { text-align: left; }
  .wm-res .ok { color: var(--ok); } .wm-res .warn { color: var(--warn); } .wm-res .bad { color: var(--bad); }
  .wm-res ul { margin: 6px 0 0; padding-left: 18px; }
  .wm-res li { margin: 3px 0; }
  .wm-err { color: var(--bad); }
  .wm-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--line); }
  .wm-foot input[type=text] { flex: 1 1 220px; }
  /* phone: one column, the whole dialog scrolls (after the rules above so it wins) */
  @media (max-width: 860px) { .wm-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto; overflow: auto; } .wm-left { overflow: visible; border-right: 0 !important; border-bottom: 1px solid var(--line); }
    .wm-right { min-height: auto; } .wm-list { flex: none; overflow: visible; } .wm-res { max-height: none; } .wm-head { flex-wrap: wrap; } .wm-head h2 { flex-basis: 100%; } }
  `;
  let dlg = null, S = null;
  function ensureStyle() { if (document.getElementById("wmStyle")) return; const st = document.createElement("style"); st.id = "wmStyle"; st.textContent = css; document.head.appendChild(st); }

  // open({ base: { id, name, design } }): start from a design that isn't saved yet (new-bike walkthrough)
  function open(opts) {
    const A = App(); if (!A) return;
    ensureStyle();
    const base = opts && opts.base ? opts.base : null;
    S = { values: {}, focus: "stack", base, name: (opts && opts.name) || "" };
    if (!dlg) { dlg = document.createElement("dialog"); dlg.className = "wm"; dlg.setAttribute("aria-label", "Match a frame drawing"); document.body.appendChild(dlg); }
    const baseName = base ? base.name : A.designName();
    dlg.innerHTML = `<div class="wm-wrap">
      <div class="wm-head"><h2>Match a frame drawing</h2><button type="button" data-wm="fill" title="Put the open design's numbers in the boxes, measured the way the builder measures them">Fill from ${base ? "the new bike" : "the open design"}</button><button type="button" data-wm="clear">Clear</button><button type="button" data-wm="close" aria-label="Close">✕</button></div>
      <div class="wm-body">
        <div class="wm-left"><div class="wm-where" id="wmWhere"></div><div id="wmPic"></div>
          <p class="hint">Type each number exactly as it is printed on the drawing. Blank boxes keep ${esc(baseName)}'s value. The picture is your frame as typed so far; the circled numbers match the boxes. Bends aren't dimensioned on the builder's side view (just drawn curved): they're kept from ${esc(baseName)}, or set them in the Bent tubes box (step 2) after.</p></div>
        <div class="wm-right"><div class="wm-list" id="wmList"></div><div class="wm-res" id="wmRes"></div>
          <div class="wm-foot"><input type="text" id="wmName" placeholder="Name for a new design" aria-label="Name for a new design" value="${esc(S.name)}"><button type="button" data-wm="new" class="primary">${esc((opts && opts.saveLabel) || "Save as new design")}</button>${base ? "" : `<button type="button" data-wm="apply">Apply to ${esc(baseName)}</button>`}<button type="button" data-wm="order" title="The numbers, tubes and bends as text for your order email to your builder">Copy for my order</button></div></div>
      </div></div>`;
    const sec = (title, list) => `<h4>${title}</h4>` + list.map(([k, lab, unit, where]) => `<label class="wm-row" data-k="${k}"><span class="n">${BADGE[k]}</span><span>${esc(lab)}<small>${esc(where)}</small></span><input type="number" step="any" id="wm_${k}" inputmode="decimal"><span class="u">${unit}</span></label>`).join("");
    dlg.querySelector("#wmList").innerHTML = sec("Main numbers", MAIN) + sec("Where the tubes join", JOINTS) + sec("The drawing's totals (checked, not copied)", CHECK);
    dlg.querySelectorAll(".wm-row input").forEach(inp => {
      const k = inp.id.slice(3);
      inp.addEventListener("focus", () => { S.focus = k; render(); });
      inp.addEventListener("input", () => { const v = num(inp.value); if (v == null) delete S.values[k]; else S.values[k] = v; render(); });
    });
    dlg.querySelector("#wmPic").addEventListener("click", e => { const g = e.target.closest("[data-k]"); if (g) { const i = dlg.querySelector("#wm_" + g.dataset.k); if (i) i.focus(); } });
    dlg.querySelector('[data-wm="close"]').onclick = () => dlg.close();
    dlg.querySelector('[data-wm="clear"]').onclick = () => { S.values = {}; dlg.querySelectorAll(".wm-row input").forEach(i => i.value = ""); render(); };
    dlg.querySelector('[data-wm="fill"]').onclick = () => { const b = fromDesign(baseDesign()); for (const [k] of ALL) { const v = b[k]; if (v != null) { S.values[k] = +(+v).toFixed(1); dlg.querySelector("#wm_" + k).value = S.values[k]; } } render(); };
    dlg.querySelector('[data-wm="new"]').onclick = () => saveNew();
    const ap = dlg.querySelector('[data-wm="apply"]'); if (ap) ap.onclick = () => apply();
    dlg.querySelector('[data-wm="order"]').onclick = () => showOrder();
    if (!dlg.open) dlg.showModal();
    render();
    setTimeout(() => { const i = dlg.querySelector("#wm_stack"); if (i) i.focus(); }, 30);
  }
  const baseDesign = () => S.base ? S.base.design : App().design();
  function merged() {
    const F = FEA(), base = baseDesign(), ch = toChanges(S.values, base);
    const d = F.deepMerge(base, { geometry: ch.geometry });
    return { d, ch };
  }
  function render() {
    if (!dlg) return;
    const F = FEA(), { d, ch } = merged();
    let err = ""; try { F.validate(d); } catch (e) { err = e.message; }
    const all = ALL.find(r => r[0] === S.focus);
    dlg.querySelector("#wmWhere").innerHTML = all ? `<b>${BADGE[S.focus]} · ${esc(all[1])}.</b> ${esc(all[3])} <span class="hint">(e.g. ${esc(all[4])} ${esc(all[2])} on a 700C × 560 drawing)</span>` : "";
    dlg.querySelectorAll(".wm-row").forEach(r => r.classList.toggle("on", r.dataset.k === S.focus));
    dlg.querySelector("#wmPic").innerHTML = err ? `<p class="wm-err">${esc(err)}</p>` + safeDiagram(baseDesign()) : diagram(d, S.focus);
    // results
    let html = "";
    if (err) html += `<p class="wm-err">Can't build a frame from these numbers yet: ${esc(err)}</p>`;
    else {
      const built = fromDesign(d), c = check(S.values, built);
      if (c.rows.length) html += `<table><thead><tr><th>Drawing total</th><th>Drawing</th><th>From its numbers</th><th>Difference</th></tr></thead><tbody>${c.rows.map(r => `<tr><td>${BADGE[r.k]} · ${esc(r.label)}</td><td>${r.drawing.toFixed(1)}</td><td>${r.built.toFixed(1)}</td><td class="${r.st}">${r.st === "ok" ? "✓ " : r.st === "warn" ? "≈ " : "✗ "}${fmtD(r.d)}</td></tr>`).join("")}</tbody></table>`;
      else html += `<p class="hint">Type the drawing's wheelbase, front centre, effective top tube, top-tube and down-tube lengths (the boxes at the bottom) and they'll be checked against the main numbers. This is how a mistake on the drawing shows up.</p>`;
      const info = d && F.buildGeometry(d.geometry, d.tubes).info;
      html += `<p class="hint" style="margin:6px 0 0">Builds: wheelbase ${built.wb.toFixed(1)} · front centre ${built.fc.toFixed(1)} · ETT ${built.ett.toFixed(1)} · trail ${info.trail.toFixed(0)} · BB height ${info.bbHeight.toFixed(0)} mm.</p>`;
      const notes = ch.notes.concat(c.find);
      if (notes.length) html += `<ul>${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>`;
    }
    dlg.querySelector("#wmRes").innerHTML = html;
    const can = !err && Object.keys(S.values).length > 0;
    dlg.querySelectorAll('[data-wm="new"], [data-wm="apply"]').forEach(b => b.disabled = !can);
  }
  const safeDiagram = d => { try { return diagram(d, S.focus); } catch (e) { return ""; } };
  // the order text for the design as typed so far (blank boxes = base design); copied, and shown to edit
  function showOrder() {
    const F = FEA(), { d } = merged();
    try { F.validate(d); } catch (e) { dlg.querySelector("#wmRes").innerHTML = `<p class="wm-err">Fix this first: ${esc(e.message)}</p>`; return; }
    const name = (dlg.querySelector("#wmName").value || "").trim() || (S.base ? S.base.name : App().designName());
    const txt = orderText(d, name.replace(/ \(new, not saved yet\)$/, ""));
    const res = dlg.querySelector("#wmRes");
    res.innerHTML = `<p style="margin:0 0 6px"><b>For your order email</b> <span class="hint" id="wmCopied"></span></p><textarea id="wmOrder" rows="12" style="width:100%;font:12.5px var(--font-data)" aria-label="Order email text">${esc(txt)}</textarea>
      <div style="display:flex;gap:8px;margin-top:6px"><button type="button" id="wmCopy">Copy</button><button type="button" id="wmBack">Back to the check</button></div>`;
    const ta = res.querySelector("#wmOrder"), copy = () => { const v = ta.value, ok = () => res.querySelector("#wmCopied").textContent = "Copied.";
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, () => { ta.select(); try { document.execCommand("copy"); ok(); } catch (e) {} });
      else { ta.select(); try { document.execCommand("copy"); ok(); } catch (e) {} } };
    res.querySelector("#wmCopy").onclick = copy; res.querySelector("#wmBack").onclick = () => render();
    copy();
  }
  function apply() {
    const A = App(), { d, ch } = merged();
    const cur = A.design(); Object.assign(cur.geometry, ch.geometry);
    A.refresh(); A.toast(`Drawing numbers applied (${Object.keys(ch.geometry).length} changed). Save to keep them.`);
    dlg.close();
  }
  function saveNew() {
    const A = App(), { d } = merged();
    const name = (dlg.querySelector("#wmName").value || "").trim() || "Frame drawing " + new Date().toISOString().slice(0, 10);
    const notes = "Numbers typed in from a builder's drawing: " + ALL.filter(([k]) => S.values[k] != null).map(([k, lab, unit]) => `${lab} ${S.values[k]}${unit === "°" ? "°" : ""}`).join(", ") + ".";
    dlg.close();
    A.createDesign(name, notes, d);
  }

  // ---------------------------------------------------------------- hooks
  function mountButton() {
    const host = document.getElementById("geoMain"); if (!host || document.getElementById("btnDrawMatch")) return;
    const b = document.createElement("button"); b.type = "button"; b.id = "btnDrawMatch"; b.textContent = "Match a frame drawing…";
    b.title = "Type the numbers off a builder's frame drawing; they're converted and cross-checked";
    b.style.marginTop = "8px"; b.addEventListener("click", () => open());
    host.parentNode.insertBefore(b, host.nextSibling);
  }
  function chat(raw, text) {
    if (/\b(order|builder) (email|text|numbers for)\b|\bnumbers for (my )?(order|builder)\b|\bwhat (do i|should i) (send|tell) (my |the )?builder\b/i.test(text)) { open(); showOrder(); return "Here's the open design written out for your order email (numbers the way the builder's drawings show them, tubes and any bends). It's copied; edit it in the box if you like."; }
    if (/\b(match|type|enter|copy)\b.*\bdrawing\b|\b(builder|frame)\'?s? (drawing|numbers)\b|\bcheck (the|my|a) drawing\b/i.test(text)) { open(); return "Opened **Match a frame drawing**. Type the numbers as they're printed; the drawing's own totals are cross-checked."; }
    return null;
  }
  if (root.FrameChat && Array.isArray(root.FrameChat.extra)) root.FrameChat.extra.push(chat);
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountButton); else mountButton(); }
  root.FrameDrawMatch = { open, toChanges, fromDesign, check, bendsText, orderText, MAIN, JOINTS, CHECK, _state: () => S };
  if (typeof module !== "undefined") module.exports = root.FrameDrawMatch;
})(typeof window !== "undefined" ? window : globalThis);
