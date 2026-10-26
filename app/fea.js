// ============================================================================
//  FRAME FEA ENGINE  (v3)
//  3D beam ("tube model") finite-element analysis of a bicycle frame.
//  Tubes are hollow round or oval beams; chainstays S-bend, ovalise and taper;
//  dropouts are short plates. Units: N, mm, MPa.
//  Coordinates: x = forward, y = up, z = drive side. BB centre = origin.
//
//  Computes
//   • Stiffness tests (side push at the BB, front-end twist, weight on the saddle)
//   • Everyday loads (power sprint, seated bump, hard braking) scaled to the rider
//   • Abuse events for an EN 17406 riding condition (huck to flat, rock hits)
//   • ISO 4210-6 frame tests (pedalling / horizontal / vertical fatigue, falling mass, falling frame)
//   • Fatigue life: welded-joint S-N curve + Miner's rule over a riding load spectrum
//  Joints use annealed (heat-affected zone) strength; tube bodies use cold-worked strength.
// ============================================================================
(function (root) {
  "use strict";

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => mul(a, 1 / norm(a));
  const lerp = (a, b, t) => a + (b - a) * t;

  function deepMerge(base, over) {
    const out = JSON.parse(JSON.stringify(base));
    (function m(o, v) {
      for (const k in v) {
        if (v[k] && typeof v[k] === "object" && !Array.isArray(v[k])) { o[k] = o[k] || {}; m(o[k], v[k]); }
        else o[k] = v[k];
      }
    })(out, over || {});
    return out;
  }

  // ------------------------------------------------------------ riding conditions
  // EN 17406 / ASTM F2043 conditions. Wheel loads in multiples of rider body weight (hardtail, suspension fork).
  //  rearPeak / frontPeak: biggest square-edge hit (De Lorenzo & Hull 1999 measured ≈5.4× rear, ≈2.6× front
  //  on a rough descent with the rear suspension locked).  rearSD / frontSD: everyday chatter (measured SD 0.42× / 0.18×).
  //  peakEveryH: the peak-sized hit happens about once every this many hours of riding.
  //  edge: typical square-edge height (mm) for the peak hit; sets the hit direction (contact normal at the edge).
  //  lateral: sideways tyre force in a crossed-up landing / berm / slide, × body weight at the rear contact patch.
  const CONDITIONS = {
    1: { name: "Condition 1 – paved roads", short: "Paved", drop: 0, rearPeak: 1.5, frontPeak: 1.0, rearSD: 0.12, frontSD: 0.08, peakEveryH: 10, edge: 20, lateral: 0.15, dropsPerHour: 0, desc: "Paved roads, wheels stay on the ground." },
    2: { name: "Condition 2 – gravel roads", short: "Gravel", drop: 0.15, rearPeak: 2.5, frontPeak: 1.6, rearSD: 0.25, frontSD: 0.13, peakEveryH: 10, edge: 50, lateral: 0.3, dropsPerHour: 20, desc: "Gravel and unpaved roads, small drops under 15 cm." },
    3: { name: "Condition 3 – XC / rough trails", short: "XC", drop: 0.6, rearPeak: 4.0, frontPeak: 2.2, rearSD: 0.35, frontSD: 0.16, peakEveryH: 10, edge: 100, lateral: 0.45, dropsPerHour: 4, desc: "Rough trails, rocks and roots, jumps and drops up to about 60 cm." },
    4: { name: "Condition 4 – trail / enduro", short: "Trail", drop: 1.2, rearPeak: 5.0, frontPeak: 2.6, rearSD: 0.42, frontSD: 0.18, peakEveryH: 10, edge: 130, lateral: 0.6, dropsPerHour: 6, desc: "Steep, rough trails under 40 km/h, drops up to about 120 cm." },
    5: { name: "Condition 5 – freeride / DH", short: "Freeride", drop: 2.0, rearPeak: 6.5, frontPeak: 3.2, rearSD: 0.50, frontSD: 0.22, peakEveryH: 10, edge: 160, lateral: 0.8, dropsPerHour: 8, desc: "Big jumps and drops over 120 cm, speeds over 40 km/h." }
  };
  // ISO 4210-6 frame test levels (ISO forces as reproduced in TBIS 4210-6). Pass limits for impact tests with a
  // dummy fork per TBIS 4210-2:2025 (massSet / frameSet, mm of wheelbase shortening).
  const ISO = {
    racing:   { name: "Racing (road & gravel)", pedal: 1100, pedalCycles: 100000, fwd: 600, back: 600, horizCycles: 100000, vert: 1200, vertCycles: 50000, massDrop: 212, frameDrop: 200, m1: 30, m2: 10, m3: 50, massSet: 15, frameSet: 15 },
    mountain: { name: "Mountain bike", pedal: 1200, pedalCycles: 100000, fwd: 1200, back: 600, horizCycles: 50000, vert: 1200, vertCycles: 50000, massDrop: 360, frameDrop: 300, m1: 30, m2: 10, m3: 50, massSet: 10, frameSet: 60 },
    city:     { name: "City & trekking", pedal: 1000, pedalCycles: 100000, fwd: 450, back: 450, horizCycles: 100000, vert: 1000, vertCycles: 50000, massDrop: 180, frameDrop: 200, m1: 50, m2: 10, m3: 30, massSet: 10, frameSet: 60 }
  };
  const RIGID = { E: 210000, G: 80000, A: 5000, Iy: 5e6, Iz: 5e6, J: 1e7, rigid: true, h: 12, w: 12, t: 6, round: true, od: 12 };

  // ------------------------------------------------------------ sections
  // spec: { od, wall } | { h, w, wall } (oval: h = height, w = width) | { plate: true, h, w } (solid rectangle)
  // Thin-walled closed section from its wall centreline (closed polygon of [y, z] points; y = in-plane, z = sideways):
  // A = t·perimeter, I = t·∮(y−ȳ)² ds, Bredt torsion J = 4·Am²·t / perimeter, extreme fibres for stress.
  function thinWallSection(pts, t, E, G, h, w) {
    let P = 0, Am = 0, sy = 0, sz = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); P += L; sy += L * (a[0] + b[0]) / 2; sz += L * (a[1] + b[1]) / 2; Am += (a[0] * b[1] - b[0] * a[1]) / 2; }
    const yc = sy / P, zc = sz / P; let Iz = 0, Iy = 0, ymax = 0, zmax = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ya = a[0] - yc, yb = b[0] - yc, za = a[1] - zc, zb = b[1] - zc;
      Iz += t * L * (ya * ya + ya * yb + yb * yb) / 3; Iy += t * L * (za * za + za * zb + zb * zb) / 3;
      ymax = Math.max(ymax, Math.abs(ya)); zmax = Math.max(zmax, Math.abs(za));
    }
    Am = Math.abs(Am);
    return { E, G, A: t * P, Iz, Iy, J: 4 * Am * Am * t / P, h, w, t, Am, round: false, od: (h + w) / 2, wall: t, cy: ymax + t / 2, cz: zmax + t / 2 };
  }
  // Shaped tubes from a typical builder's tube sheet: teardrop (round top, pointed bottom, h tall × w wide) and diamond (rounded rhombus)
  function shapeOutline(shape, h, w, t) {
    const H = h - t, W = w - t, pts = [], N = 160;
    if (shape === "teardrop") {
      const r = W / 2, yc = H / 2 - r, tipY = -H / 2, d = yc - tipY;              // circle on top, straight flanks to the tip
      const a = Math.asin(Math.min(0.999, r / d));                                   // flank angle from the vertical
      const tA = Math.PI / 2 + a;                                                    // tangent point angle on the circle
      for (let k = 0; k <= N; k++) { const th = -tA + (2 * tA) * k / N; pts.push([yc + r * Math.cos(th), r * Math.sin(th)]); }
      pts.push([tipY, 0]);
      return pts;
    }
    if (shape === "diamond") {
      const rc = Math.min(W, H) * 0.18, corners = [[H / 2, 0], [0, W / 2], [-H / 2, 0], [0, -W / 2]];
      for (let c = 0; c < 4; c++) {                                                  // corners rounded with radius rc
        const p0 = corners[(c + 3) % 4], p1 = corners[c], p2 = corners[(c + 1) % 4];
        const u1 = [p0[0] - p1[0], p0[1] - p1[1]], u2 = [p2[0] - p1[0], p2[1] - p1[1]], l1 = Math.hypot(...u1), l2 = Math.hypot(...u2);
        const e1 = [u1[0] / l1, u1[1] / l1], e2 = [u2[0] / l2, u2[1] / l2], half = Math.acos(e1[0] * e2[0] + e1[1] * e2[1]) / 2, off = rc / Math.tan(half);
        const a1 = [p1[0] + e1[0] * off, p1[1] + e1[1] * off], a2 = [p1[0] + e2[0] * off, p1[1] + e2[1] * off];
        for (let k = 0; k <= 8; k++) { const u = k / 8, q = [(1 - u) ** 2 * a1[0] + 2 * u * (1 - u) * p1[0] + u * u * a2[0], (1 - u) ** 2 * a1[1] + 2 * u * (1 - u) * p1[1] + u * u * a2[1]]; pts.push(q); }
      }
      return pts;
    }
    for (let k = 0; k < N; k++) { const th = 2 * Math.PI * k / N; pts.push([H / 2 * Math.cos(th), W / 2 * Math.sin(th)]); }
    return pts;
  }
  function sectionProps(spec, E, nu) {
    const G = E / (2 * (1 + nu));
    if (spec.shape === "teardrop" || spec.shape === "diamond") return thinWallSection(shapeOutline(spec.shape, spec.h, spec.w, spec.wall), spec.wall, E, G, spec.h, spec.w);
    if (spec.plate) {
      const h = spec.h, w = spec.w, a = Math.max(h, w), b = Math.min(h, w);
      const J = a * b ** 3 * (1 / 3 - 0.21 * (b / a) * (1 - b ** 4 / (12 * a ** 4)));
      return { E, G, A: h * w, Iz: w * h ** 3 / 12, Iy: h * w ** 3 / 12, J, h, w, t: b / 2, plate: true, round: false, od: (h + w) / 2, wall: b / 2, Am: 0 };
    }
    const h = spec.h || spec.od, w = spec.w || spec.od;
    const t = Math.min(spec.wall, Math.min(h, w) / 2 - 0.01);
    const p = h / 2, q = w / 2, pi = p - t, qi = q - t;
    const round = Math.abs(h - w) < 1e-6;
    const A = Math.PI * (p * q - pi * qi);
    const Iz = Math.PI / 4 * (q * p ** 3 - qi * pi ** 3);   // resists up/down bending
    const Iy = Math.PI / 4 * (p * q ** 3 - pi * qi ** 3);   // resists sideways bending
    const pm = p - t / 2, qm = q - t / 2, Am = Math.PI * pm * qm;
    const per = Math.PI * (3 * (pm + qm) - Math.sqrt((3 * pm + qm) * (pm + 3 * qm)));
    const J = round ? Iz + Iy : 4 * Am * Am * t / per;
    return { E, G, A, Iy, Iz, J, h, w, t, Am, round, od: (h + w) / 2, wall: t };
  }
  function sectionLabel(s) {
    if (s.plate) return `${+s.h.toFixed(1)}×${+s.w.toFixed(1)} plate`;
    return s.round ? `Ø${+s.h.toFixed(1)}×${+s.t.toFixed(2)}` : `${+s.h.toFixed(1)}×${+s.w.toFixed(1)} oval, ${+s.t.toFixed(2)} wall`;
  }

  // Chainstay section at distance d from the BB end of a stay of length L
  function chainstaySpec(cs, d, L) {
    const round = { h: cs.od, w: cs.od, wall: cs.wall };
    let s = round;
    if (cs.ovalH && cs.ovalW && cs.ovalLength > 0) {
      const oval = { h: cs.ovalH, w: cs.ovalW, wall: cs.wall }, blend = 30;
      if (d <= cs.ovalLength) s = oval;
      else if (d < cs.ovalLength + blend) { const k = (d - cs.ovalLength) / blend; s = { h: lerp(oval.h, round.h, k), w: lerp(oval.w, round.w, k), wall: cs.wall }; }
    }
    if (cs.taperOD && cs.taperLength > 0 && d > L - cs.taperLength) {
      const k = (d - (L - cs.taperLength)) / cs.taperLength;
      s = { h: lerp(s.h, cs.taperOD, k), w: lerp(s.w, cs.taperOD, k), wall: cs.wall };
    }
    return s;
  }

  function pchip3(t1, z0, z1, z2) {
    const d0 = (z1 - z0) / t1, d1 = (z2 - z1) / (1 - t1);
    const m1 = d0 * d1 > 0 ? (2 * d0 * d1) / (d0 + d1) : 0;
    const herm = (ya, yb, ma, mb, h, s) => { const s2 = s * s, s3 = s2 * s; return (2 * s3 - 3 * s2 + 1) * ya + (s3 - 2 * s2 + s) * h * ma + (-2 * s3 + 3 * s2) * yb + (s3 - s2) * h * mb; };
    return t => t <= t1 ? herm(z0, z1, d0, m1, t1, t / t1) : herm(z1, z2, m1, d1, 1 - t1, (t - t1) / (1 - t1));
  }

  const num = (v, d) => (v === "" || v == null || !isFinite(+v)) ? d : +v;

  // ------------------------------------------------------------ tube bends (side view, v9.4)
  // A bent tube = its straight chord (length L) plus an offset f(x) square to it in the frame's plane, x measured
  // along the chord. Each profile returns f(x), slope df(x), curvature k(x) (1/mm), the total turn (degrees), the
  // smallest bend radius used and whether a requested radius had to be made tighter to fit ("reduced").
  // Kink: straight runs through corner points, each corner rounded with a circular bend of radius r. The bend
  // has to fit between minX and maxX (e.g. below the seat-stay weld); if it doesn't, r is reduced until it does.
  function kinkProfile(L, corners) {
    const pts = [[0, 0]].concat(corners.map(c => [c.x, c.f]), [[L, 0]]), arcs = [];
    let turn = 0, reduced = false, rMin = Infinity;
    for (let i = 1; i < pts.length - 1; i++) {
      const c = corners[i - 1], P0 = pts[i - 1], C = pts[i], P1 = pts[i + 1];
      const l1 = Math.hypot(C[0] - P0[0], C[1] - P0[1]), l2 = Math.hypot(P1[0] - C[0], P1[1] - C[1]);
      const d1 = [(C[0] - P0[0]) / l1, (C[1] - P0[1]) / l1], d2 = [(P1[0] - C[0]) / l2, (P1[1] - C[1]) / l2];
      const th = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
      turn += th;
      if (th < 1e-6) continue;
      let r = c.r, T = r * Math.tan(th / 2);
      const Tmax = Math.min((C[0] - (c.minX != null ? c.minX : P0[0])) / d1[0], ((c.maxX != null ? c.maxX : P1[0]) - C[0]) / d2[0]) * 0.999;
      if (T > Tmax) { T = Math.max(1, Tmax); r = T / Math.tan(th / 2); reduced = true; }
      const A = [C[0] - d1[0] * T, C[1] - d1[1] * T], B = [C[0] + d2[0] * T, C[1] + d2[1] * T];
      const s = Math.sign(d1[0] * d2[1] - d1[1] * d2[0]) || 1, nIn = [-d1[1] * s, d1[0] * s];
      const O = [A[0] + nIn[0] * r, A[1] + nIn[1] * r];
      arcs.push({ A, B, O, r, sg: Math.sign(A[1] - O[1]) || 1, d1, d2, C });
      rMin = Math.min(rMin, r);
    }
    // straight pieces between the arcs (and the end points); x past either end continues the end run
    const runs = []; let from = pts[0];
    for (let i = 0; i < pts.length - 2; i++) { const a = arcs.find(q => q.C[0] === pts[i + 1][0] && q.C[1] === pts[i + 1][1]); const to = a ? a.A : pts[i + 1]; runs.push([from, to]); from = a ? a.B : pts[i + 1]; }
    runs.push([from, pts[pts.length - 1]]);
    const on = x => { for (const a of arcs) if (x >= a.A[0] && x <= a.B[0]) return a; return null; };
    const run = x => { for (const rr of runs) if (x <= rr[1][0] + 1e-9) return rr; return runs[runs.length - 1]; };
    const f = x => { const a = on(x); if (a) return a.O[1] + a.sg * Math.sqrt(Math.max(0, a.r * a.r - (x - a.O[0]) ** 2));
      const [p, q] = run(x); return p[1] + (q[1] - p[1]) * (x - p[0]) / ((q[0] - p[0]) || 1); };
    const df = x => { const a = on(x); if (a) { const w = Math.sqrt(Math.max(1e-9, a.r * a.r - (x - a.O[0]) ** 2)); return -a.sg * (x - a.O[0]) / w; }
      const [p, q] = run(x); return (q[1] - p[1]) / ((q[0] - p[0]) || 1); };
    const k = x => on(x) ? 1 / on(x).r : 0;
    const span = arcs.length ? [Math.min(...arcs.map(a => a.A[0])), Math.max(...arcs.map(a => a.B[0]))] : null;
    return { kind: "kink", L, f, df, k, turnDeg: turn * 180 / Math.PI, rMin, reduced, rTarget: Math.min(...corners.map(c => c.r)), span, arcs };
  }
  // Bow: one circular arc from end to end, 'd' at the middle (+ along the normal)
  function bowProfile(L, d) {
    const a = Math.abs(d), R = (L * L / 4 + a * a) / (2 * a), sg = Math.sign(d);
    const f = x => sg * (Math.sqrt(Math.max(0, R * R - (x - L / 2) ** 2)) - (R - a));
    const df = x => -sg * (x - L / 2) / Math.sqrt(Math.max(1e-9, R * R - (x - L / 2) ** 2));
    return { kind: "bow", L, f, df, k: () => 1 / R, turnDeg: 2 * Math.asin(Math.min(1, L / (2 * R))) * 180 / Math.PI, rMin: R, reduced: false, rTarget: 0, span: [0, L] };
  }
  // S-bend: one sine wave, +d in the first half and −d in the second
  function sProfile(L, d) {
    const w = 2 * Math.PI / L, f = x => d * Math.sin(w * x), df = x => d * w * Math.cos(w * x);
    const k = x => Math.abs(d * w * w * Math.sin(w * x)) / Math.pow(1 + df(x) ** 2, 1.5);
    let turn = 0; for (let i = 0; i < 200; i++) { const x = (i + 0.5) * L / 200; turn += k(x) * Math.sqrt(1 + df(x) ** 2) * L / 200; }
    return { kind: "s", L, f, df, k, turnDeg: turn * 180 / Math.PI, rMin: 1 / (Math.abs(d) * w * w), reduced: false, rTarget: 0, span: [0, L] };
  }
  // a profile placed on the frame: chord from O along unit c, offset along unit n (both in the x–y plane)
  const bendPt = (b, x) => { const fx = b.prof.f(x); return [b.O[0] + b.c[0] * x + b.n[0] * fx, b.O[1] + b.c[1] * x + b.n[1] * fx, 0]; };
  // 3D member path along a placed profile from chord distance xa to xb (z from zf(u), default 0)
  function bendPath(b, xa, xb, zf) {
    const fn = u => { const p = bendPt(b, xa + (xb - xa) * u); p[2] = zf ? zf(u) : 0; return p; };
    fn.bendR = u => { const k = b.prof.k(xa + (xb - xa) * u); return k > 1e-9 ? 1 / k : Infinity; };
    fn.turnDeg = b.prof.turnDeg; fn.minRreached = !b.prof.reduced; fn.minRtarget = b.prof.rTarget;
    return fn;
  }
  // unit normal to chord c in the x–y plane, picked to point up (wantUp) or down
  const sideNormal = (c, wantUp) => { const n = [-c[1], c[0], 0]; return (n[1] >= 0) === wantUp ? n : [c[1], -c[0], 0]; };
  // stay side-view profile from the style settings ("none" | "bow" | "kink" | "s"); xKink: chord distance of the kink
  function stayProfile(style, depth, L, xKink, r, errs, name) {
    const d = num(depth, 0);
    if (!style || style === "none" || Math.abs(d) < 0.05) return null;
    if (Math.abs(d) > 40) { errs.push(`${name} bend: the depth should be within ±40 mm.`); return null; }
    if (style === "bow") return bowProfile(L, d);
    if (style === "s") return sProfile(L, d);
    if (style === "kink") {
      if (!(xKink >= 30 && xKink <= L - 30)) { errs.push(`${name} bend: the kink has to be at least 30 mm from either end of the stay.`); return null; }
      return kinkProfile(L, [{ x: xKink, f: d, r, minX: 10, maxX: L - 10 }]);
    }
    return null;
  }
  const isBent = g => num(g.stBendOffset, 0) > 0.05 || Math.abs(num(g.dtBendAngle, 0)) > 0.05 || ["csBend", "ssBend"].some(k => g[k + "Style"] && g[k + "Style"] !== "none" && Math.abs(num(g[k + "Depth"], 0)) > 0.05);

  // rim bead-seat diameter (ISO, mm): typed (rimBSD / rimBSDFront) or the standard rim whose tyre height best fits the
  // outside diameter and width (26" 559, 27.5"/650b 584, 29"/700c 622, 32" 686)
  function rimBSD(g, front) {
    const typed = num(front ? g.rimBSDFront : g.rimBSD, 0); if (typed > 0) return typed;
    if (front && !(num(g.tireDiameterFront, 0) > 0)) return rimBSD(g, false);
    const od = front ? +g.tireDiameterFront : +g.tireDiameter, w = num(g.tireWidth, 60);
    let best = 622, err = Infinity;
    for (const b of [559, 584, 622, 686]) { const e = Math.abs((od - b) / 2 - 0.95 * w); if (e < err) { err = e; best = b; } }
    return best;
  }
  // front tyre radius: tireDiameterFront when set (mixed wheels, e.g. 29" front / 27.5" rear), otherwise the same as the rear
  const frontTyreR = g => num(g.tireDiameterFront, 0) > 0 ? +g.tireDiameterFront / 2 : g.tireDiameter / 2;

  // ------------------------------------------------------------ input checks
  // [field, lowest, highest, unit] checked by validate(); a design outside these is refused with a plain message
  const RANGES = [["headAngle", 55, 80, "°"], ["seatAngle", 60, 85, "°"], ["reach", 250, 650, "mm"], ["stack", 400, 850, "mm"],
    ["chainstay", 330, 650, "mm"], ["headTube", 40, 350, "mm"], ["seatTube", 150, 750, "mm"], ["forkA2C", 300, 750, "mm"],
    ["tireDiameter", 400, 950, "mm"], ["crankLength", 120, 200, "mm"], ["chainring", 18, 60, "T"], ["cog", 9, 60, "T"]];
  function validate(design) {
    const g = design.geometry, t = design.tubes, errs = [];
    const NAMES = { reach: "Reach", stack: "Stack", headAngle: "Head angle", seatAngle: "Seat angle", chainstay: "Chainstay length", headTube: "Head tube length", seatTube: "Seat tube length",
      forkA2C: "Fork axle-to-crown", tireDiameter: "Tyre outside diameter", crankLength: "Crank length", chainring: "Chainring", cog: "Rear cog",
      E: "Stiffness (E)", yield: "Tube yield strength", uts: "Tube tensile strength", jointYield: "Weld-zone yield strength", jointUts: "Weld-zone tensile strength", weldFatigue: "Weld fatigue swing", density: "Density" };
    const pos = (v, name) => { if (!(v > 0)) errs.push(`${NAMES[name] || name} must be more than zero.`); };
    ["reach", "stack", "headAngle", "seatAngle", "chainstay", "headTube", "seatTube", "forkA2C", "tireDiameter", "crankLength", "chainring", "cog"].forEach(k => pos(g[k], k));
    // plain sanity ranges (code review 2026-10-12 #4): wide enough for road, gravel, MTB and 32" bikes of any size,
    // tight enough that a typo (head angle 120, reach 5, 1 mm cranks) is stopped before it is analysed
    const unit = u => (u === "°" ? "°" : " " + u);
    const inRange = (v, lo, hi, name, u) => { if (v > 0 && !(v >= lo && v <= hi)) errs.push(`${NAMES[name] || name} should be ${lo}–${hi}${unit(u)} (it's ${Math.round(v * 10) / 10}${unit(u)}).`); };
    for (const [k, lo, hi, u] of RANGES) inRange(g[k], lo, hi, k, u);
    if (g.tireDiameterFront != null && g.tireDiameterFront !== "" && !(+g.tireDiameterFront > 300)) errs.push("Front tyre outside diameter must be a real tyre size (leave it blank to match the rear).");
    if (g.chainstay <= Math.abs(g.bbDrop) + 50) errs.push("Chainstay is too short for that BB drop.");
    if (g.ttAtSeatTube > g.seatTube) errs.push("The top tube can't join above the top of the seat tube.");
    if (g.saddleHeight - g.seatTube < 60) errs.push("Saddle height must be at least 60 mm above the top of the seat tube (some seatpost has to show).");
    if (g.saddleStack != null && g.saddleStack !== "" && !(+g.saddleStack >= 0)) errs.push("Saddle top above rails can't be negative.");
    if (g.saddleSetback != null && g.saddleSetback !== "" && !(+g.saddleSetback >= 0)) errs.push("Sit-bone setback can't be negative.");
    if (!errs.length && (g.saddleHeight - num(g.saddleStack, 45) / Math.sin(g.seatAngle * Math.PI / 180)) - g.seatTube < 20) errs.push("The seatpost clamp would sit inside the seat tube: raise the saddle or lower the saddle stack.");
    if (g.ssBelowTt < 0) errs.push("Seat stays can't join above the top tube (use 0 for a shared cluster).");
    if (g.ssBelowTt >= g.ttAtSeatTube - 100) errs.push("Seat stays join too low on the seat tube.");
    if (num(g.csYokeLength, 0) > 0 && num(g.csYokeLength, 0) > g.chainstay - num(g.dropoutLength, 28) - 60) errs.push("The chainstay yoke is too long: it has to end well before the rear dropouts.");
    if (g.rearRotor != null && g.rearRotor !== "" && !(+g.rearRotor >= 120 && +g.rearRotor <= 230)) errs.push("Rear rotor should be 120–230 mm.");
    if (g.ssShape === "wishbone") {
      const gg = buildGeometry(g, t), wb = gg.wishbone;
      if (wb && wb.max < 30) errs.push(`Wishbone stays don't fit here: the seat stays only reach ${Math.round(wb.max + 30)} mm above the tyre's clearance line. Drop the stays less, or use bent stays.`);
    }
    if (!errs.length && isBent(g)) { try { errs.push(...buildGeometry(g, t).bendErrs); } catch (e) {} }
    if (g.rearRotor != null && g.rearRotor !== "" && num(g.dropoutLength, 28) + 8 > +g.rearRotor / 2 + 15) errs.push("That rotor is too small for the dropout plate: the brake mount would sit on the dropout.");
    if ((g.ssBridge === true || g.ssBridge === "true") && !(num(g.ssBridgeAbove, 40) >= 5)) errs.push("The seat-stay bridge must be at least 5 mm above the tyre.");
    if (num(g.csYokeLength, 0) > 0 && !(num(g.csYokeSpacing, 80) >= 40 && num(g.csYokeSpacing, 80) <= 160)) errs.push("Yoke spacing should be 40–160 mm.");
    if (g.ttBelowHtTop + g.dtAboveHtBottom >= g.headTube) errs.push("Top tube and down tube overlap on the head tube.");
    if (g.csWidestAt && g.csWidestAt >= g.chainstay - 20) errs.push("Chainstay widest point must be well ahead of the rear axle.");
    const TUBE_NAMES = { topTube: "Top tube", downTube: "Down tube", seatTube: "Seat tube", headTube: "Head tube", chainstay: "Chainstay", seatStay: "Seat stay", bbShell: "BB shell", seatpost: "Seatpost", csYoke: "Yoke plate", ssMono: "Wishbone tube", ssBridge: "Bridge tube" };
    const unused = { csYoke: !(num(g.csYokeLength, 0) > 0), ssMono: g.ssShape !== "wishbone", ssBridge: !(g.ssBridge === true || g.ssBridge === "true") };
    for (const [k0, v] of Object.entries(t)) {
      if (unused[k0]) continue;
      const k = TUBE_NAMES[k0] || k0;
      if (v && v.buttLength > 0 && v.buttWall > 0) {
        if (v.buttWall < v.wall) errs.push(`${k}: the butted (end) wall should be at least as thick as the middle wall.`);
        if (v.buttWall >= Math.min(v.h || v.od || 99, v.w || v.od || 99) / 2) errs.push(`${k}: butted wall is thicker than the tube radius.`);
      }
      if (k0 === "seatpost" && v && v.type && v.type !== "custom" && SEATPOSTS[v.type]) continue;
      if (v && v.h > 0 && v.w > 0 && v.wall > 0) continue;              // oval/box parts given as height × width
      if (k0 === "csYoke") { if (!(v && v.h > 0 && v.w > 0)) errs.push("Yoke plate: height and thickness must be more than zero."); continue; }
      if (!v || !(v.od > 0) || !(v.wall > 0)) { errs.push(`${k}: diameter and wall must be more than zero.`); continue; }
      if (v.wall >= v.od / 2) errs.push(`${k}: wall is thicker than the tube radius.`);
      else if (!(v.wall >= 0.5 && v.wall <= 4)) errs.push(`${k}: wall should be 0.5–4 mm (it's ${v.wall} mm).`);
      if (v.od > 0 && !(v.od >= 6 && v.od <= 80)) errs.push(`${k}: diameter should be 6–80 mm (it's ${v.od} mm).`);
    }
    if (!(design.rider.riderKg > 0)) errs.push("Rider weight must be more than zero.");
    else if (!(design.rider.riderKg >= 30 && design.rider.riderKg <= 200)) errs.push(`Rider weight should be 30–200 kg (it's ${Math.round(design.rider.riderKg * 10) / 10} kg).`);
    const m = design.material || {};
    ["E", "yield", "uts", "jointYield", "jointUts", "weldFatigue", "density"].forEach(k => { if (!(m[k] > 0)) errs.push(`${NAMES[k]} must be more than zero.`); });
    if (g.dropoutLength != null && !(g.dropoutLength >= 5 && g.dropoutLength <= 80)) errs.push("Dropout plate length should be 5–80 mm.");
    const u = design.use || {};
    if (u.condition != null && !CONDITIONS[u.condition]) errs.push("Riding condition must be 1 to 5.");
    if (errs.length) { const e = new Error(errs[0]); e.all = errs; throw e; }
  }

  // ------------------------------------------------------------ seatposts
  // Seatpost presets. kRef = vertical stiffness (N/mm) of the post alone, measured at the sit point with the
  // reference set-up below, estimated from published lab tests (Tour, Velo 2012, Microbac via CyclingAbout):
  // flex posts such as Ergon CF3 / Canyon VCLS about 65-85 N/mm, Syntace Hi-Flex about 115-125, and a plain
  // 27.2 alloy post roughly 1.6x stiffer than a plain 27.2 carbon one. Estimates: real posts vary ±25%.
  // headK = series stiffness of the clamp head + saddle rails. The tube itself is modelled as a beam whose
  // effective modulus is set so the preset hits kRef in the reference set-up; any other exposure, seat angle
  // or setback then follows from beam physics.
  const POST_REF = { exposure: 200, seatAngle: 73, setback: 50 };
  // Seatpost presets. Alloy and titanium posts are plain beams of their real tube (E = 70 / 105 GPa) plus a
  // head/rails spring (headK). Carbon posts: kRef = stiffness in the reference set-up above, set from lab
  // ratios: Velo (2012) measured round carbon 27.2 posts flexing ~1.5x an alloy post; Syntace P6 Hi-Flex
  // 114-123 N/mm and Ergon CF3 ~69 N/mm (Microbac / TOUR via CyclingAbout). Leaf-spring posts flex in the head,
  // so they are a stiff shaft plus a rotational spring at the clamp. Droppers: exposed stanchion (≈ Ø25) plus
  // bushing lash. fit = diameter the seat tube must take. All ±25% at best.
  const SEATPOSTS = {
    alloy272:   { label: "Alloy 27.2 (rigid)",                 od: 27.2, wall: 1.8, fit: 27.2, kRef: null, headK: 600, mat: "alloy" },
    carbon272:  { label: "Carbon 27.2 (standard round)",       od: 27.2, wall: 2.0, fit: 27.2, kRef: 200, headK: 600, mat: "carbon" },
    hiflex272:  { label: "Carbon 27.2 thin-wall flex (Syntace Hi-Flex type)", od: 27.2, wall: 1.6, fit: 27.2, kRef: 130, headK: 600, mat: "carbon" },
    leaf272:    { label: "Carbon leaf-spring / split-head post (Ergon CF3, Canyon VCLS type)", od: 27.2, wall: 2.0, fit: 27.2, kRef: 72, headK: 600, mat: "carbon", leaf: true },
    ti272:      { label: "Titanium 27.2",                      od: 27.2, wall: 1.4, fit: 27.2, kRef: null, headK: 600, mat: "titanium" },
    alloy316:   { label: "Alloy 31.6 (rigid)",                 od: 31.6, wall: 2.0, fit: 31.6, kRef: null, headK: 600, mat: "alloy" },
    carbon316:  { label: "Carbon 31.6",                        od: 31.6, wall: 2.0, fit: 31.6, kRef: 330, headK: 600, mat: "carbon" },
    dropper316: { label: "Dropper 31.6 (Ø25 stanchion showing)", od: 25, wall: 2.5, fit: 31.6, kRef: null, headK: 450, mat: "alloy", dropper: true },
    dropper309: { label: "Dropper 30.9 (Ø25 stanchion showing)", od: 25, wall: 2.5, fit: 30.9, kRef: null, headK: 450, mat: "alloy", dropper: true },
    custom:     { label: "Custom (use OD, wall and material)", od: 27.2, wall: 1.8, fit: null, kRef: null, headK: 600, mat: "alloy" }
  };
  const POST_E = { alloy: 70000, carbon: 70000, titanium: 105000, steel: 200000 };
  // Bending flexibility of a cantilevered post: vertical deflection per newton at a point 'setback' behind the
  // top of a post of 'exposure' length leaning at the seat angle (virtual work, bending only), times EI.
  function postFlexEI(exposure, seatAngleDeg, setback) {
    const c = Math.cos(seatAngleDeg * Math.PI / 180), Lp = exposure, e = setback;
    return c * c * Lp ** 3 / 3 + c * e * Lp ** 2 + e * e * Lp;
  }
  function seatpostPreset(spec) {
    const key = spec && spec.type && SEATPOSTS[spec.type] ? spec.type : "custom";
    return { key, ...SEATPOSTS[key] };
  }
  // The post beam section, plus what the comfort model needs (head spring, leaf rotational spring, fit diameter)
  function seatpostSection(spec, g) {
    const pre = seatpostPreset(spec), isCustom = pre.key === "custom";
    const od = isCustom ? num(spec.od, pre.od) : pre.od, wall = isCustom ? num(spec.wall, pre.wall) : pre.wall;
    const headK = isCustom ? num(spec.headK, pre.headK) : pre.headK;
    const geomOnly = sectionProps({ od, wall }, 1, 0.3);
    const Sref = postFlexEI(POST_REF.exposure, POST_REF.seatAngle, POST_REF.setback);
    let E = isCustom ? num(spec.E, POST_E[spec.material || pre.mat] || 70000) : POST_E[pre.mat];
    let kTheta = null;
    if (pre.kRef && pre.leaf) {
      // stiff carbon shaft + rotational spring at the head: C = e²/kθ at the sit point
      const cShaft = Sref / (E * geomOnly.Iz);
      kTheta = POST_REF.setback ** 2 / Math.max(1e-6, 1 / pre.kRef - 1 / headK - cShaft);
    } else if (pre.kRef) {
      const kBeam = 1 / Math.max(1e-6, 1 / pre.kRef - 1 / headK);
      E = kBeam * Sref / geomOnly.Iz;
    }
    const s = sectionProps({ od, wall }, E, 0.33);
    s.post = { key: pre.key, label: pre.label, kRef: pre.kRef, headK, kTheta, Eeff: E, od, wall, fit: isCustom ? num(spec.od, pre.od) : pre.fit, dropper: !!pre.dropper, leaf: !!pre.leaf };
    return s;
  }

  // Tyre vertical stiffness (N/mm), rough fit: about 100 N/mm for a 25 mm tyre at 87 psi, 150 for 23 mm at 116 psi
  // (Girona / CyclingAbout data), scaling with pressure and the square root of width. Real tyres are non-linear
  // and casing-dependent: treat as ±30%.
  function tyreStiffness(widthMm, psi) { return Math.max(10, 1.2 * psi * Math.sqrt(Math.max(20, widthMm) / 25)); }
  // Frame + seatpost vertical stiffness at the sit bones, rated against Tour-style lab numbers for complete bikes
  function comfortRating(k) {
    if (k < 90) return { label: "Very plush", score: 5 };
    if (k < 130) return { label: "Plush", score: 4 };
    if (k < 180) return { label: "Comfortable", score: 3 };
    if (k < 250) return { label: "Firm", score: 2 };
    return { label: "Harsh", score: 1 };
  }

  // ------------------------------------------------------------ tyre cross-section (for clearance)
  // A knobby tyre is nearly full width from its equator up to the shoulder knobs just below the tread, so the
  // section is a superellipse (n = 4): radial half-height a = (R − rim bead radius)/2, half-width b = W/2.
  function tyreShape(g) {
    const R = g.tireDiameter / 2, W = num(g.tireWidth, 60);
    const bead = rimBSD(g, false) / 2;
    const a = Math.max(10, (R - bead) / 2), b = W / 2, rc = R - a, n = 4, pts = [];
    for (let k = 0; k <= 90; k++) { const t = k / 90 * Math.PI, c = Math.cos(t), sn = Math.sin(t); pts.push([a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.abs(sn) ** (2 / n)]); }
    return { R, W, a, b, rc, n, pts };
  }
  // smallest |z| a point at distance rho from the axle needs to be at least d from the tyre surface
  function tyreNeedZ(ts, rho, d) {
    let need = 0;
    for (const [dr, z] of ts.pts) { const dx = rho - (ts.rc + dr); if (Math.abs(dx) < d) need = Math.max(need, z + Math.sqrt(d * d - dx * dx)); }
    return need;
  }
  // signed distance from a point (rho from the axle, |z| off-centre) to the tyre surface (negative = inside)
  function tyreGapPoint(ts, rho, z) {
    let best = Infinity; for (const [dr, zz] of ts.pts) best = Math.min(best, Math.hypot(rho - (ts.rc + dr), Math.abs(z) - zz));
    const inside = (Math.abs((rho - ts.rc) / ts.a) ** ts.n + Math.abs(z / ts.b) ** ts.n) < 1;
    return inside ? -best : best;
  }

  // ------------------------------------------------------------ geometry
  function buildGeometry(g, tubes) {
    const rad = Math.PI / 180;
    const sa = g.seatAngle * rad, ha = g.headAngle * rad;
    const uST = [-Math.cos(sa), Math.sin(sa), 0];
    const uHT = [Math.cos(ha), -Math.sin(ha), 0];
    const nF = [Math.sin(ha), Math.cos(ha), 0];
    const P = {};
    const bends = {}, bendErrs = [];
    const odOf = k => { const s = tubes && tubes[k]; return s ? (s.od || Math.max(s.h || 0, s.w || 0) || 30) : 30; };
    P.BB = [0, 0, 0];
    P.BBR = [0, 0, g.csSpacingAtBB / 2];
    P.BBL = [0, 0, -g.csSpacingAtBB / 2];
    // Bent seat tube: the seat angle stays the effective one (BB to the saddle along the seat-angle line, at this
    // saddle height), so the fit doesn't move. The bend sits stBendOffset in front of that line at stBendHeight; the
    // straight upper part (where the post goes) runs from the bend to the saddle, so it is a little slacker and the
    // seat-tube top sits slightly in front of the line.
    {
      const e = num(g.stBendOffset, 0), h = num(g.stBendHeight, 150), xSS = g.ttAtSeatTube - Math.max(0, num(g.ssBelowTt, 0));
      if (e > 0.05) {
        if (e > 60) bendErrs.push("Seat tube bend: the offset should be 60 mm or less.");
        else if (!(h >= 60)) bendErrs.push("Seat tube bend: the bend must be at least 60 mm above the BB (it needs a straight stub at the shell).");
        else if (h > xSS - 40) bendErrs.push(`Seat tube bend: the bend must be at least 40 mm below the seat stays (at most ${Math.max(0, xSS - 40).toFixed(0)} mm from the BB here).`);
        else {
          const r0 = num(g.stBendRadius, 0), prof = kinkProfile(Math.max(g.saddleHeight, g.seatTube + 60), [{ x: h, f: e, r: r0 > 0 ? r0 : 5 * odOf("seatTube"), minX: 35, maxX: xSS - 20 }]);
          if (prof.reduced && r0 > 0) bendErrs.push(`Seat tube bend: a ${r0} mm radius doesn't fit between the BB and the seat stays here; the largest that fits is about ${Math.floor(prof.rMin)} mm (blank = automatic).`);
          bends.st = { prof, O: [0, 0, 0], c: uST.slice(), n: [Math.sin(sa), Math.cos(sa), 0] };
        }
      } else if (e < -0.05) bendErrs.push("Seat tube bend: the offset is measured forward of the BB line, so it must be more than zero (0 = straight).");
    }
    const stAt = x => bends.st ? bendPt(bends.st, x) : mul(uST, x);
    const uSTv = uST, uSTa = bends.st ? unit(add(uST, mul(bends.st.n, bends.st.prof.df(g.seatTube)))) : uST;   // seat-angle line / real upper tube
    P.STtop = stAt(g.seatTube);
    P.TTst = stAt(g.ttAtSeatTube);
    P.SSst = stAt(g.ttAtSeatTube - g.ssBelowTt);
    P.SSR = add(P.SSst, [0, 0, g.ssSpacingAtTop / 2]);
    P.SSL = add(P.SSst, [0, 0, -g.ssSpacingAtTop / 2]);
    // Seatpost rail clamp: on the post axis, saddleStack (rails to saddle top, vertical) below the saddle top
    const stackS = num(g.saddleStack, 45);
    P.Saddle = stAt(g.saddleHeight - stackS / Math.sin(sa));
    // Where the rider's sit bones load the saddle: on the saddle top, saddleSetback behind the clamp
    P.Sit = add(P.Saddle, [-num(g.saddleSetback, 50), stackS, 0]);
    // ISO 4210-6 vertical test: dummy post 250 mm or the real maximum exposure, whichever is longer
    P.IsoPost = add(P.STtop, mul(uSTa, Math.max(250, g.saddleHeight - g.seatTube)));
    P.IsoSeat = add(P.IsoPost, [-70, 0, 0]);
    P.IsoM1 = add(P.STtop, mul(uSTa, 75));
    // TBIS 4210-6:2026 stiffness-rating fixtures: L = lateral load 250 mm from the head-tube centre (down the steer
    // axis, where the fork would be); M = 800 N on a crank 250 mm from the BB centre (drive side)
    P.HTtop = [g.reach, g.stack, 0];
    P.HTbot = add(P.HTtop, mul(uHT, g.headTube));
    P.TTht = add(P.HTtop, mul(uHT, g.ttBelowHtTop));
    P.DTht = sub(P.HTbot, mul(uHT, g.dtAboveHtBottom));
    P.HTmid = add(P.HTtop, mul(uHT, (g.ttBelowHtTop + g.headTube - g.dtAboveHtBottom) / 2));
    P.IsoHTc = add(P.HTtop, mul(uHT, g.headTube / 2));
    P.IsoL = add(P.IsoHTc, mul(uHT, 250));
    P.IsoMk = [0, 0, 250];
    P.Crown = add(P.HTbot, mul(uHT, g.lowerCupStack));
    P.AxleF = add(add(P.Crown, mul(uHT, g.forkA2C)), mul(nF, g.forkOffset));
    // Bent down tube: a kink dtBendFromHt along the tube from the head tube, turning dtBendAngle; + bends it up toward
    // the top tube (more room for the fork crown and tyre), − down toward the wheel. Both ends stay where they are.
    {
      const th = num(g.dtBendAngle, 0), a = num(g.dtBendFromHt, 120), L = norm(sub(P.BB, P.DTht));
      if (Math.abs(th) > 0.05) {
        if (Math.abs(th) > 25) bendErrs.push("Down tube bend: keep the bend angle within ±25°.");
        else if (!(a >= 40 && a <= L - 100)) bendErrs.push(`Down tube bend: the bend has to be 40–${Math.max(40, L - 100).toFixed(0)} mm from the head tube.`);
        else {
          const turn = e => Math.atan(e / a) + Math.atan(e / (L - a)), want = Math.abs(th) * rad;
          let lo = 0, hi = L; for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (turn(mid) < want) lo = mid; else hi = mid; }
          const e = Math.sign(th) * lo, r0 = num(g.dtBendRadius, 0);
          const prof = kinkProfile(L, [{ x: a, f: e, r: r0 > 0 ? r0 : 5 * odOf("downTube"), minX: 25, maxX: L - 60 }]);
          if (prof.reduced && r0 > 0) bendErrs.push(`Down tube bend: a ${r0} mm radius doesn't fit there; the largest that fits is about ${Math.floor(prof.rMin)} mm (blank = automatic).`);
          const c = unit(sub(P.BB, P.DTht));
          bends.dt = { prof, O: P.DTht.slice(), c, n: sideNormal(c, true) };
        }
      }
    }
    const ax =-Math.sqrt(g.chainstay ** 2 - g.bbDrop ** 2);
    P.AxleR = [ax, g.bbDrop, 0];
    P.DR = [ax, g.bbDrop, g.stayWidthAtDropout / 2];
    P.DL = [ax, g.bbDrop, -g.stayWidthAtDropout / 2];
    P.Cog = [ax, g.bbDrop, g.chainline];
    // Chainstay yoke: one piece welded to the BB shell that splits the stays wide apart for tyre room
    const yokeL = num(g.csYokeLength, 0);
    if (yokeL > 0) {
      const dir = unit([P.AxleR[0], P.AxleR[1], 0]);
      // the stays leave the yoke far enough apart to clear the tyre there (so the yoke end is never the pinch point)
      const Rt = g.tireDiameter / 2, Wt = num(g.tireWidth, 60), stayHalf = ((tubes && tubes.chainstay && tubes.chainstay.od) || 22) / 2;
      const endP = [dir[0] * yokeL, dir[1] * yokeL], axR = [-Math.sqrt(g.chainstay ** 2 - g.bbDrop ** 2), g.bbDrop];
      const needZ = tyreNeedZ(tyreShape(g), Math.hypot(endP[0] - axR[0], endP[1] - axR[1]), stayHalf + num(g.csClearance, 6) + 1.5);
      const half = Math.max(num(g.csYokeSpacing, 90) / 2, needZ);
      P.YkR = [dir[0] * yokeL, dir[1] * yokeL, half];
      P.YkL = [dir[0] * yokeL, dir[1] * yokeL, -half];
    }
    // Wishbone seat stay: one tube from the seat tube down to a junction above the tyre, then two legs
    const R0 = g.tireDiameter / 2;
    if (g.ssShape === "wishbone") {
      const a = P.SSst, b = P.AxleR, Ltot = norm(sub(a, b));
      const monoOD = (tubes && tubes.ssMono && tubes.ssMono.od) || num(g.ssMonoOD, 25);
      const needFromAxle = R0 + num(g.ssClearance, 6) + monoOD / 2 + 15;       // the split sits at least 15 mm above the tyre's clearance line
      const maxTop = Ltot - needFromAxle;
      const asked = num(g.wishboneLength, 0);
      const fromTop = Math.max(30, asked > 0 ? Math.min(asked, maxTop) : 30);   // default: split as high as possible, so the legs can bend gently
      P.WB = add(a, mul(unit(sub(b, a)), fromTop));
      // a short cast/CNC junction piece: the legs start either side of the split, not from one point
      const legOD = (tubes && tubes.seatStay && tubes.seatStay.od) || 16;
      P.WBR = add(P.WB, [0, 0, legOD / 2 + 4]); P.WBL = add(P.WB, [0, 0, -(legOD / 2 + 4)]);
      var wishboneInfo = { asked, used: fromTop, max: maxTop, clamped: asked > 0 && asked > maxTop + 0.5 };
    }
    // Dropout plates: stays end a short way from the axle; the plate carries load into the axle
    const plate = g.dropoutLength || 28;
    for (const [side, D, B0, S0] of [[1, "DR", "BBR", "SSR"], [-1, "DL", "BBL", "SSL"]]) {
      const B = yokeL > 0 ? (side > 0 ? "YkR" : "YkL") : B0, S = P.WB ? "WB" : S0;
      const toBB = unit([P[B][0] - P[D][0], P[B][1] - P[D][1], 0]);
      const toSS = unit([P[S][0] - P[D][0], P[S][1] - P[D][1], 0]);
      P["CE" + (side > 0 ? "R" : "L")] = add(P[D], mul(toBB, plate));
      P["SE" + (side > 0 ? "R" : "L")] = add(P[D], mul(toSS, plate));
    }
    // Stays bent in the side view. "+" depth always means away from the tyre: down for chainstays, up/back for
    // seat stays. Chainstay kink measured from the BB; seat-stay kink from the rear axle. Same shape both sides.
    {
      const a = yokeL > 0 ? [P.YkR[0], P.YkR[1], 0] : [0, 0, 0], b = [P.CER[0], P.CER[1], 0], L = norm(sub(b, a));
      const prof = stayProfile(g.csBendStyle, g.csBendDepth, L, num(g.csBendAt, 130) - norm(a), 4 * odOf("chainstay"), bendErrs, "Chainstay");
      if (prof) { const c = unit(sub(b, a)); bends.cs = { prof, O: a, c, n: sideNormal(c, false) }; }
    }
    {
      const top = P.WB ? P.WB : P.SSst, a = [top[0], top[1], 0], b = [P.SER[0], P.SER[1], 0], L = norm(sub(b, a));
      const fromAxle = num(g.ssBendAt, 150) - num(g.dropoutLength, 28);
      const prof = stayProfile(g.ssBendStyle, g.ssBendDepth, L, L - fromAxle, 4 * odOf("seatStay"), bendErrs, "Seat stay");
      if (prof) { const c = unit(sub(b, a)); bends.ss = { prof, O: a, c, n: sideNormal(c, true) }; }
    }
    // side-view centrelines for the 2D sketches (walkthrough, fit, toe card, drawing match)
    const sample = (b, x0, x1, n) => { const out = []; for (let k = 0; k <= n; k++) { const q = bendPt(b, x0 + (x1 - x0) * k / n); out.push([q[0], q[1]]); } return out; };
    const xy = p => [p[0], p[1]];
    const seatTubeLine = bends.st ? sample(bends.st, 0, g.seatTube, 40) : [xy(P.BB), xy(P.STtop)];
    const downTubeLine = bends.dt ? sample(bends.dt, 0, bends.dt.prof.L, 40) : [xy(P.DTht), xy(P.BB)];
    const chainstayLine = [xy(P.BB)].concat(bends.cs ? sample(bends.cs, 0, bends.cs.prof.L, 40) : [xy(yokeL > 0 ? P.YkR : P.BB), xy(P.CER)]).concat([xy(P.AxleR)]);
    const seatStayLine = [xy(P.SSst)].concat(bends.ss ? sample(bends.ss, 0, bends.ss.prof.L, 40) : [xy(P.WB || P.SSst), xy(P.SER)]).concat([xy(P.AxleR)]);
    const R = g.tireDiameter / 2, Rf = frontTyreR(g);
    const stTopAhead = bends.st ? bends.st.prof.f(g.seatTube) : 0;   // seat-tube top in front of the seat-angle line
    return {
      P, uST: uSTa, uSTv, uHT, nF, postExposure: norm(sub(P.Saddle, P.STtop)), wishbone: typeof wishboneInfo !== "undefined" ? wishboneInfo : null,
      bends, bendErrs, seatTubeLine, downTubeLine, chainstayLine, seatStayLine,
      // straight seat tube from its top down to the start of the bend (how far a dropper body can go in)
      straightSeatTube: bends.st ? g.seatTube - bends.st.prof.span[1] : g.seatTube,
      info: {
        seatTubeAngleReal: Math.atan2(uSTa[1], -uSTa[0]) / rad, seatTubeTopAhead: stTopAhead,
        wheelbase: P.AxleF[0] - ax, frontCentre: P.AxleF[0],
        trail: (Rf * Math.cos(ha) - g.forkOffset) / Math.sin(ha),
        effectiveTopTube: P.HTtop[0] + P.HTtop[1] / Math.tan(sa),
        frontAxleHeight: P.AxleF[1], bbHeight: R - g.bbDrop,
        // where the front axle should sit for the bike to stand level: rear axle height + (front tyre radius − rear tyre radius)
        frontAxleTarget: g.bbDrop + (Rf - R), frontTyreR: Rf, rearTyreR: R,
        frontTriangle: { seatTubeInside: g.ttAtSeatTube, downTube: norm(sub(P.DTht, P.BB)), topTube: norm(sub(P.TTht, P.TTst)) }
      }
    };
  }

  // ------------------------------------------------------------ model
  function buildModel(design) {
    validate(design);
    const g = design.geometry, t = design.tubes, m = design.material;
    const geo = buildGeometry(g, t);
    const P = geo.P;
    // Butted tubes: a thicker wall (buttWall) for buttLength mm at each end, where the welds are
    const isButted = sp => !!(sp && sp.buttWall > sp.wall && sp.buttLength > 0);
    const buttWallAt = (sp, d, L) => isButted(sp) && (d < sp.buttLength || d > L - sp.buttLength) ? sp.buttWall : sp.wall;
    const sec = k => isButted(t[k]) ? (d, L) => sectionProps(Object.assign({}, t[k], { wall: buttWallAt(t[k], d, L) }), m.E, m.nu) : sectionProps(t[k], m.E, m.nu);
    const buttStations = (sp, a, b) => { if (!isButted(sp)) return []; const L = norm(sub(P[b], P[a])); return L > 2 * sp.buttLength + 10 ? [sp.buttLength / L, 1 - sp.buttLength / L] : []; };
    // Seat stays can be ovalised at the seat-tube end and tapered at the dropout end (same rules as chainstays; optional
    // taper at the top end too, for "tapered both ends" stays)
    const ssSpec = t.seatStay, ssShaped = ssSpec.ovalLength > 0 || ssSpec.taperLength > 0 || ssSpec.topTaperLength > 0;
    const ssSection = ssShaped ? (d, L) => { let sp = chainstaySpec(ssSpec, d, L); if (ssSpec.topTaperOD && ssSpec.topTaperLength > 0 && d < ssSpec.topTaperLength) { const k = d / ssSpec.topTaperLength; sp = { h: lerp(ssSpec.topTaperOD, sp.h, k), w: lerp(ssSpec.topTaperOD, sp.w, k), wall: sp.wall }; } return sectionProps(sp, m.E, m.nu); } : sec("seatStay");
    // Down tube: round, teardrop, diamond, or biaxially ovalised (tall oval at the head tube → wide oval at the BB)
    const dtSpec = t.downTube;
    // (the builder's drawings give the end sizes: htH × htW at the head tube, bbH × bbW at the BB, H = in the frame's plane)
    const dtSection = dtSpec.shape === "biaxial" ? (d, L) => { const k = Math.min(1, Math.max(0, d / L)), D = dtSpec.od, o = num(dtSpec.ovality, 0.18);
      const ends = dtSpec.htH > 0 && dtSpec.htW > 0 && dtSpec.bbH > 0 && dtSpec.bbW > 0;
      return sectionProps({ h: ends ? lerp(dtSpec.htH, dtSpec.bbH, k) : D * lerp(1 + o, 1 - o, k), w: ends ? lerp(dtSpec.htW, dtSpec.bbW, k) : D * lerp(1 - o, 1 + o, k), wall: buttWallAt(dtSpec, d, L) }, m.E, m.nu); } : sec("downTube");
    const postSec = seatpostSection(t.seatpost, g);
    const axleSec = sectionProps({ od: 20, wall: 4 }, 200000, 0.3);
    const plateSec = sectionProps({ plate: true, h: g.dropoutHeight || 30, w: g.dropoutThickness || 6 }, m.E, m.nu);

    // Merge key points that coincide (e.g. seat stays joining exactly at the top tube) with a union-find,
    // so every member that names either point connects to the same node.
    const names = Object.keys(P), parent = {};
    const findRoot = a => { while (parent[a] && parent[a] !== a) a = parent[a]; return a; };
    names.forEach(nm => parent[nm] = nm);
    // Test-rig and saddle points never merge with frame points (they'd short-circuit the real seatpost)
    const noMerge = nm => /^Iso/.test(nm) || nm === "Saddle" || nm === "Sit";
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++)
      if (!noMerge(names[i]) && !noMerge(names[j]) && norm(sub(P[names[i]], P[names[j]])) < 0.5) { const a = findRoot(names[i]), b = findRoot(names[j]); if (a !== b) parent[b] = a; }

    const nodes = [], nodeIdx = {};
    function keyNode(name) {
      const r = findRoot(name);
      if (!(r in nodeIdx)) { nodeIdx[r] = nodes.length; nodes.push({ p: P[r].slice(), name: r }); }
      nodeIdx[name] = nodeIdx[r];
      return nodeIdx[r];
    }
    const elements = [], members = [];
    function member(group, label, a, b, section, nseg, opts = {}) {
      if (findRoot(a) === findRoot(b)) return null;
      const pa = P[a], pb = P[b];
      const path = opts.path || (s => add(pa, mul(sub(pb, pa), s)));
      // parameter stations: a uniform grid, plus exact points asked for (bolt holes, bridge welds)
      let us = []; for (let s = 0; s <= nseg; s++) us.push(s / nseg);
      const stations = (opts.stations || []).filter(u => u > 1e-3 && u < 1 - 1e-3);
      // snap the nearest interior grid point onto each station (keeps the element count constant as stations move)
      for (const st of stations) { let bi = -1, bd = Infinity; us.forEach((u, k) => { if (k > 0 && k < us.length - 1 && !stations.includes(u) && Math.abs(u - st) < bd) { bd = Math.abs(u - st); bi = k; } }); if (bi > 0) us[bi] = st; else us.push(st); }
      us = [...new Set(us)].sort((x, y) => x - y);
      nseg = us.length - 1;
      const pts = us.map((u, k) => k === 0 ? pa : k === nseg ? pb : path(u));
      const cum = [0]; for (let s = 1; s <= nseg; s++) cum.push(cum[s - 1] + norm(sub(pts[s], pts[s - 1])));
      const Ltot = cum[nseg];
      const secFn = typeof section === "function" ? section : () => section;
      const mem = { group, label, a, b, elements: [], rigid: !!section.rigid, structural: !opts.nonFrame && !section.rigid, length: Ltot, fixture: !!opts.fixture, stationNodes: {}, path, us };
      const ia = keyNode(a), ib = keyNode(b);
      let prev = ia;
      for (let s = 1; s <= nseg; s++) {
        let cur;
        if (s === nseg) cur = ib; else { cur = nodes.length; nodes.push({ p: pts[s] }); }
        if (stations.includes(us[s])) mem.stationNodes[us[s]] = cur;
        mem.elements.push(elements.length);
        elements.push({ n1: prev, n2: cur, section: secFn((cum[s - 1] + cum[s]) / 2, Ltot), member: members.length, dFrom: cum[s - 1], dTo: cum[s] });
        prev = cur;
      }
      mem.section = elements[mem.elements[Math.floor(mem.elements.length / 2)]].section;
      // Bent tubes: bend radius from the smooth path (not the element corners), and the bend's stress raise on the
      // plain tube (ASME III pipe-bend C2 = 1.95 / h^(2/3), h = t·R / r², at least 1), used by the tube-body fatigue check
      if (opts.path && !section.rigid) {
        const M = 120, Rk = new Float64Array(M + 1).fill(Infinity);
        if (path.bendR) { for (let k = 1; k < M; k++) Rk[k] = path.bendR(k / M); }
        else {
          // smooth analytic paths (spline chainstays): circumradius over a fixed 2-cell stencil
          const q = []; for (let k = 0; k <= M; k++) q.push(path(k / M));
          for (let k = 2; k < M - 1; k++) { const A = q[k - 2], B = q[k], Cc = q[k + 2], ar = norm(cross(sub(B, A), sub(Cc, A))); if (ar > 1e-9) Rk[k] = norm(sub(B, A)) * norm(sub(Cc, B)) * norm(sub(A, Cc)) / (2 * ar); }
        }
        // opts.bendFrom: ignore the curvature before this u (a solid plate at the BB end isn't a bent tube)
        mem.minBendR = Math.min(...Array.from(Rk).filter((r, k) => !(opts.bendFrom > 0) || k / M >= opts.bendFrom));
        mem.turnDeg = path.turnDeg != null ? path.turnDeg : null;
        mem.minRreached = path.minRreached != null ? path.minRreached : true; mem.minRtarget = path.minRtarget || 0;
        // ASME C2 is for a full 90° elbow; a short, gentle bend is held round by the straight tube either side, so the
        // raise is scaled by the bend's turning angle (engineering estimate): i = 1 + (C2 − 1) · min(1, angle / 90°)
        const arcF = mem.turnDeg != null ? Math.min(1, mem.turnDeg / 90) : 1;
        mem.elements.forEach((ei, j) => {
          const e = elements[ei], u0 = us[j], u1 = us[j + 1];
          let Rmin = Infinity; for (let k = 1; k < M; k++) { const u = k / M; if (u >= u0 - 0.5 / M && u <= u1 + 0.5 / M) Rmin = Math.min(Rmin, Rk[k]); }
          if (!isFinite(Rmin) || Rmin > 1e5) Rmin = Infinity;
          const sct = e.section, r = (sct.od - sct.t) / 2;
        if (opts.bendFrom > 0 && u1 <= opts.bendFrom) { e.bendR = Infinity; e.bendSIF = 1; return; }
          e.bendR = Rmin;
          e.bendSIF = isFinite(Rmin) && sct.t > 0 && sct.round ? 1 + Math.max(0, 1.95 / Math.pow(sct.t * Rmin / (r * r), 2 / 3) - 1) * arcF : 1;
        });
      }
      members.push(mem);
      return mem;
    }
    const N = 8;
    member("bbShell", "BB shell (drive side)", "BB", "BBR", sec("bbShell"), 2);
    member("bbShell", "BB shell (non-drive)", "BB", "BBL", sec("bbShell"), 2);
    // seat tube is split into three members; its butts are measured along the whole tube (BB → top), not per member
    const LST = norm(sub(P.STtop, P.BB)), offST = nm => norm(sub(P[nm], P.BB));
    const stSec = off => isButted(t.seatTube) ? (d, L) => sectionProps(Object.assign({}, t.seatTube, { wall: buttWallAt(t.seatTube, off + d, LST) }), m.E, m.nu) : sec("seatTube");
    const stStations = (a, b) => { if (!isButted(t.seatTube)) return []; const o = offST(a), L = offST(b) - o, bl = t.seatTube.buttLength; return [bl, LST - bl].map(x => (x - o) / L).filter(u => u > 0.02 && u < 0.98); };
    const stB = geo.bends.st, xSSst = g.ttAtSeatTube - g.ssBelowTt;
    member("seatTube", "Seat tube", "BB", "SSst", stSec(0), stB ? Math.max(N, Math.ceil(xSSst / 12)) : N, { stations: stStations("BB", "SSst"), path: stB ? bendPath(stB, 0, xSSst) : undefined });
    member("seatTube", "Seat tube (at stays)", "SSst", "TTst", stSec(offST("SSst")), 2, { stations: stStations("SSst", "TTst") });
    member("seatTube", "Seat tube (top)", "TTst", "STtop", stSec(offST("TTst")), 2, { stations: stStations("TTst", "STtop") });
    member("seatpost", "Seatpost", "STtop", "Saddle", postSec, 4, { nonFrame: true });
    member("saddle", "Saddle (rails to sit bones, rigid)", "Saddle", "Sit", RIGID, 1, { nonFrame: true });
    // The inserted part of the post works in parallel with the seat tube down to its insertion depth
    {
      const pp = postSec.post, inside = num(g.seatpostLength, 400) - geo.postExposure;
      const inSec = pp.dropper ? sectionProps({ od: pp.fit, wall: 2.0 }, 70000, 0.33) : postSec;
      if (inside >= g.seatTube - g.ttAtSeatTube) member("postInserted", "Seatpost inside the seat tube", "STtop", "TTst", inSec, 1, { nonFrame: true });
      if (g.ssBelowTt > 0.5 && inside >= g.seatTube - g.ttAtSeatTube + g.ssBelowTt) member("postInserted", "Seatpost inside the seat tube", "TTst", "SSst", inSec, 1, { nonFrame: true });
    }
    member("fixture", "ISO test dummy seatpost", "STtop", "IsoM1", RIGID, 1, { nonFrame: true, fixture: true });
    member("fixture", "ISO test dummy seatpost", "IsoM1", "IsoPost", RIGID, 1, { nonFrame: true, fixture: true });
    member("fixture", "ISO test dummy seatpost", "IsoPost", "IsoSeat", RIGID, 1, { nonFrame: true, fixture: true });
    member("fixture", "TBIS head-tube lateral arm", "HTmid", "IsoL", RIGID, 1, { nonFrame: true, fixture: true });
    member("fixture", "TBIS BB crank arm", "BB", "IsoMk", RIGID, 1, { nonFrame: true, fixture: true });
    member("topTube", "Top tube", "TTst", "TTht", sec("topTube"), N, { stations: buttStations(t.topTube, "TTst", "TTht") });
    const dtB = geo.bends.dt;
    member("downTube", "Down tube", "DTht", "BB", dtSection, dtB ? Math.max(N, Math.ceil(dtB.prof.L / 12)) : dtSpec.shape === "biaxial" ? 12 : N, { stations: buttStations(dtSpec, "DTht", "BB"), path: dtB ? bendPath(dtB, 0, dtB.prof.L) : undefined });
    member("headTube", "Head tube (top)", "HTtop", "TTht", sec("headTube"), 1);
    member("headTube", "Head tube", "TTht", "HTmid", sec("headTube"), 2);
    member("headTube", "Head tube", "HTmid", "DTht", sec("headTube"), 2);
    member("headTube", "Head tube (bottom)", "DTht", "HTbot", sec("headTube"), 1);
    member("fork", "Fork (rigid test dummy)", "HTbot", "AxleF", RIGID, 2, { nonFrame: true });

    const cs = t.chainstay;
    const csSection = (d, L) => sectionProps(chainstaySpec(cs, d, L), m.E, m.nu);
    // Stays that bow out just enough to clear the rear tyre (a torus: width W, outside radius R) by 'clr' mm.
    // The outward bends are slope-limited (≤ maxDeg) and rounded, like real bent stays; ends stay where they are.
    const TS = tyreShape(g);
    // Stays that bow out just enough to clear the rear tyre by 'clr' mm, as a smooth bend. Built in real millimetres
    // (independent of any sampling): the bump the tyre needs is smoothed by a Gaussian of width σ and scaled up just
    // enough to clear everywhere; σ grows until the tightest bend is at least minR (builders bend Ti stays no tighter
    // than ~3–4 × OD) or it can't get any gentler. The ends stay exactly where they are.
    // side (optional): the stay's side-view bend { pt: u → [x, y], k: u → curvature, turnDeg, reduced } that the
    // sideways bulge is built on top of (so the tyre check uses where the bent stay really is)
    function clearPath(pa, pb, halfW, clr, maxDeg, hold, minR, side) {
      const sxy = u => side ? side.pt(u) : [lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u)];
      const n = 240, L = norm(sub(pb, pa)), ds = L / n, za = Math.abs(pa[2]), zb = Math.abs(pb[2]);
      const smooth = t => t * t * (3 - 2 * t);
      const base = u => hold ? (u < 0.7 ? za : lerp(za, zb, smooth((u - 0.7) / 0.3))) : lerp(za, zb, u);
      const need = new Float64Array(n + 1), f = new Float64Array(n + 1), b = new Float64Array(n + 1);
      for (let i = 0; i <= n; i++) {
        const u = i / n, [x, y] = sxy(u);
        need[i] = tyreNeedZ(TS, Math.hypot(x - P.AxleR[0], y - P.AxleR[1]), halfW(u) + clr + 1.0);   // +1 for the straight elements
        b[i] = base(u); f[i] = Math.max(0, need[i] - b[i]);
      }
      const H = Math.max(...f);
      let zs = Float64Array.from(b), reached = true;
      const radii = z => { const r = new Float64Array(n + 1).fill(Infinity); for (let i = 1; i < n; i++) { const k = Math.abs(z[i - 1] - 2 * z[i] + z[i + 1]) / (ds * ds); if (k > 1e-12) r[i] = 1 / k; } return r; };
      if (H > 1e-6 && hold) {
        // machined yoke plate: keep it narrow as long as possible and kick out only where the tyre needs it
        for (let i = 0; i <= n; i++) zs[i] = Math.max(b[i], need[i]);
        for (let pass = 0; pass < 4; pass++) { const c = Float64Array.from(zs); for (let i = 1; i < n; i++) zs[i] = Math.max(need[i], (c[i - 1] + 2 * c[i] + c[i + 1]) / 4); }
      } else if (H > 1e-6) {
        let sigma = Math.max(3 * ds, Math.sqrt((minR || 50) * H)), best = null;
        for (let it = 0; it < 14; it++) {
          const w = Math.ceil(3.5 * sigma / ds), ker = []; for (let j = -w; j <= w; j++) ker.push(Math.exp(-0.5 * (j * ds / sigma) ** 2));
          const ksum = ker.reduce((a, v) => a + v, 0);
          const gg = new Float64Array(n + 1);
          for (let i = 0; i <= n; i++) { let v = 0; for (let j = -w; j <= w; j++) { const q = i + j; if (q >= 0 && q <= n) v += ker[j + w] * f[q]; } gg[i] = v / ksum; }
          const h = new Float64Array(n + 1); for (let i = 0; i <= n; i++) h[i] = gg[i] - lerp(gg[0], gg[n], i / n);   // ends stay put
          let k = 1; for (let i = 1; i < n; i++) if (f[i] > 1e-9) k = h[i] > 1e-9 ? Math.max(k, f[i] / h[i]) : Infinity;
          if (!isFinite(k)) { sigma *= 0.8; continue; }
          const z = new Float64Array(n + 1); for (let i = 0; i <= n; i++) z[i] = b[i] + k * h[i];
          const rMin = Math.min(...radii(z));
          if (!best || rMin > best.r) best = { z, r: rMin };
          if (rMin >= (minR || 0)) break;
          sigma *= 1.3;
        }
        if (best) zs = best.z; else { for (let i = 0; i <= n; i++) zs[i] = Math.max(b[i], need[i]); }
        for (let i = 0; i <= n; i++) if (zs[i] < need[i]) zs[i] = need[i];     // guarantee (normally already met)
      }
      zs[0] = za; zs[n] = zb;
      const rArr = radii(zs), minRad = Math.min(...rArr);
      reached = hold || minRad >= (minR || 0) - 1e-6;
      let thMax = -Infinity, thMin = Infinity; for (let i = 0; i < n; i++) { const th = Math.atan((zs[i + 1] - zs[i]) / ds); thMax = Math.max(thMax, th); thMin = Math.min(thMin, th); }
      const sgn = Math.sign(pa[2] || pb[2]) || 1;
      const zAt = fr => { const i = Math.min(n - 1, Math.max(0, Math.floor(fr))), w = fr - i, p0 = zs[Math.max(0, i - 1)], p1 = zs[i], p2 = zs[i + 1], p3 = zs[Math.min(n, i + 2)];
        return 0.5 * ((2 * p1) + (-p0 + p2) * w + (2 * p0 - 5 * p1 + 4 * p2 - p3) * w * w + (-p0 + 3 * p1 - 3 * p2 + p3) * w * w * w); };
      const fn = u => { const fr = Math.min(n, Math.max(0, u * n)), q = sxy(u); return [q[0], q[1], sgn * zAt(fr)]; };
      fn.bendR = u => { const rp = rArr[Math.round(Math.min(n - 1, Math.max(1, u * n)))], ks = side ? side.k(u) : 0; return 1 / Math.sqrt((isFinite(rp) ? 1 / (rp * rp) : 0) + ks * ks) || Infinity; };
      fn.turnDeg = Math.max((thMax - thMin) * 180 / Math.PI, side ? side.turnDeg : 0); fn.minRreached = reached && !(side && side.reduced); fn.minRtarget = minR || 0; fn.minR = minRad;
      return fn;
    }
    // Drive-side chainstay tucked in past the chainring (csRingTuck = mm wanted between the ring's inner face and the stay;
    // blank = off). Builders bend or ovalise the drive stay inboard where the ring passes, then let it out behind the ring
    // for the tyre (e.g. a builder's drawing checked "32T CL:49"). Within 2 mm of the ring's tooth tips the stay's
    // outer face is kept ≤ chainline − 1.5 − tuck; outside that circle the ring can't be hit, so the stay is free to swing out
    // for the tyre (the chain runs pass above and below the stay). Where the ring and the tyre both want the same spot, the
    // stay goes halfway between them (equal gaps) and the checklist reports both.
    function ringTuck(path, tuck, halfW, Lxy) {
      const ro = num(g.chainring, 32) * 12.7 / (2 * Math.PI) + 4 + 2, face = num(g.chainline, 52) - 1.5 - tuck;   // tooth tips + 2 (as the checklist)
      const tyreClr = num(g.csClearance, 6);
      const n = 240, ds = Lxy / n, z = new Float64Array(n + 1), L0 = new Float64Array(n + 1), N0 = new Float64Array(n + 1), LIM = new Float64Array(n + 1), NEED = new Float64Array(n + 1), inRing = [];
      let hit = false;
      for (let i = 0; i <= n; i++) {
        const u = i / n, q = path(u), hw = halfW(u), rb = Math.hypot(q[0], q[1]), rA = Math.hypot(q[0] - P.AxleR[0], q[1] - P.AxleR[1]);
        const swing = rb <= ro ? 0 : rb >= ro + 15 ? Infinity : 40 * ((rb - ro) / 15) ** 2;
        L0[i] = face + tuck - hw + swing; LIM[i] = L0[i] - tuck;                                  // ring side: touching / with the gap wanted
        N0[i] = tyreNeedZ(TS, rA, hw); NEED[i] = tyreNeedZ(TS, rA, hw + tyreClr + 1.0);          // tyre side: touching / with its gap
        z[i] = q[2]; inRing[i] = rb <= ro;
        if (z[i] > LIM[i] + 0.05 && i > 0 && i < n) hit = true;
      }
      if (!hit) return path;
      const sg = Math.max(2 * ds, 2.4 * halfW(0.2)), kw = Math.ceil(3 * sg / ds), ker = []; for (let j = -kw; j <= kw; j++) ker.push(Math.exp(-0.5 * (j * ds / sg) ** 2));
      // where both gaps can't be met the stay goes between touching the ring and touching the tyre; bias shifts it so that
      // after rounding the two gaps come out about equal
      const shape = bias => {
        const lo = new Float64Array(n + 1), hi = new Float64Array(n + 1);
        for (let i = 0; i <= n; i++) { if (NEED[i] > LIM[i] && N0[i] > 0) { const mid = (N0[i] + L0[i]) / 2 + bias; lo[i] = hi[i] = mid; } else { lo[i] = NEED[i]; hi[i] = LIM[i]; } }
        const zs = Float64Array.from(z, (v, i) => i === 0 || i === n ? v : Math.min(hi[i], Math.max(lo[i], v)));
        for (let it = 0; it < 600; it++) { const c = Float64Array.from(zs); for (let i = 1; i < n; i++) zs[i] = Math.min(hi[i], Math.max(lo[i], (c[i - 1] + 2 * c[i] + c[i + 1]) / 4)); }
        // a real bent tube can't jog sideways in a few mm: round it off (Gaussian, σ = 1.2 × the stay width)
        const c = Float64Array.from(zs); for (let i = 1; i < n; i++) { let v = 0, ws = 0; for (let j = -kw; j <= kw; j++) { const q = Math.min(n, Math.max(0, i + j)); v += ker[j + kw] * c[q]; ws += ker[j + kw]; } zs[i] = v / ws; }
        let gr = Infinity, gt = Infinity; for (let i = 1; i < n; i++) { if (inRing[i]) gr = Math.min(gr, L0[i] - zs[i]); if (N0[i] > 0) gt = Math.min(gt, zs[i] - N0[i]); }
        return { zs, gr, gt };
      };
      let bias = 0, res = shape(0);
      for (let k = 0; k < 4 && isFinite(res.gr) && isFinite(res.gt) && Math.abs(res.gr - res.gt) > 0.3; k++) { bias += (res.gr - res.gt) / 2; res = shape(bias); }
      const zs = res.zs;
      const rArr = new Float64Array(n + 1).fill(Infinity); for (let i = 1; i < n; i++) { const kk = Math.abs(zs[i - 1] - 2 * zs[i] + zs[i + 1]) / (ds * ds); if (kk > 1e-12) rArr[i] = 1 / kk; }
      const zAt = fr => { const i = Math.min(n - 1, Math.max(0, Math.floor(fr))), t2 = fr - i; return zs[i] * (1 - t2) + zs[i + 1] * t2; };
      const fn = u => { const fr = Math.min(n, Math.max(0, u * n)), q = path(u); return [q[0], q[1], zAt(fr)]; };
      fn.bendR = u => { const rp = rArr[Math.round(Math.min(n - 1, Math.max(1, u * n)))], r0 = path.bendR ? path.bendR(u) : Infinity; return 1 / Math.sqrt((isFinite(rp) ? 1 / (rp * rp) : 0) + (isFinite(r0) ? 1 / (r0 * r0) : 0)) || Infinity; };
      let thMax = -Infinity, thMin = Infinity; for (let i = 0; i < n; i++) { const th = Math.atan((zs[i + 1] - zs[i]) / ds); thMax = Math.max(thMax, th); thMin = Math.min(thMin, th); }
      fn.turnDeg = Math.max((thMax - thMin) * 180 / Math.PI, path.turnDeg || 0); fn.minRreached = path.minRreached !== false; fn.minRtarget = path.minRtarget || 0;
      fn.ringTucked = true;
      return fn;
    }
    const clr = num(g.ssClearance, 6), csClr = num(g.csClearance, 6);
    // bridge asked for above the top of the stays: put it 20 mm down from the top instead (reported in the checklist)
    const bridgeFallback = p => { const q0 = p(0), q1 = p(1), Ls = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]); return Math.min(0.5, 20 / Ls); };
    // parameter u along a path (from its dropout end, u = 1) where the distance from the rear axle equals r
    function uAtRadius(path, r) {
      const rho = u => { const q = path(u); return Math.hypot(q[0] - P.AxleR[0], q[1] - P.AxleR[1]); };
      let prev = 1, fp = rho(1) - r;
      for (let k = 1; k <= 200; k++) {
        const u = 1 - k / 200, f = rho(u) - r;
        if ((f >= 0) !== (fp >= 0)) { let lo = u, hi = prev; for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if ((rho(mid) - r >= 0) === (f >= 0)) lo = mid; else hi = mid; } return (lo + hi) / 2; }
        prev = u; fp = f;
      }
      return null;
    }
    const bossNodes = [];
    const bridgeEnds = [], bridgeOn = g.ssBridge === true || g.ssBridge === "true";
    const yokeOn = num(g.csYokeLength, 0) > 0;
    const ySpec = t.csYoke || { h: 32, w: 10 };
    // the yoke is a solid machined/cut plate (h tall × w thick), not a tube
    const yokeSec = sectionProps({ plate: true, h: ySpec.h, w: ySpec.w }, m.E, m.nu);
    // side-view bends of the stays (from buildGeometry) as { pt, k } over u ∈ [0, 1] of the stay member
    const sideOf = b => b ? { pt: u => { const q = bendPt(b, u * b.prof.L); return [q[0], q[1]]; }, k: u => b.prof.k(u * b.prof.L), turnDeg: b.prof.turnDeg, reduced: b.prof.reduced, b } : null;
    const csSide = sideOf(geo.bends.cs), ssSide = sideOf(geo.bends.ss);
    // a path given only by its side view + z(u): curvature from both (side-view bend and the plan-view z bend)
    const withSide = (sd, zf, L) => {
      const fn = u => { const q = sd.pt(u); return [q[0], q[1], zf(u)]; }, h = 1 / 400;
      fn.bendR = u => { const a = Math.max(h, Math.min(1 - h, u)), z2 = (zf(a - h) - 2 * zf(a) + zf(a + h)) / ((h * L) ** 2), z1 = (zf(a + h) - zf(a - h)) / (2 * h * L);
        const kp = Math.abs(z2) / Math.pow(1 + z1 * z1, 1.5), ks = sd.k(u); return 1 / Math.sqrt(kp * kp + ks * ks) || Infinity; };
      fn.turnDeg = sd.turnDeg; fn.minRreached = !sd.reduced; fn.minRtarget = sd.b.prof.rTarget; return fn;
    };
    // Chainstays drawn as on a builder's drawing (csShape "drawn"): the plan view (top view) of each stay is given as
    // points "d:z" = stay centre z mm out from the frame centre, d mm behind the BB centre (measured along the BB→axle
    // line, as the builder's top view is drawn). Between the points (and out to the BB node and the dropout end) the
    // centreline follows a monotone cubic (PCHIP), so it passes exactly through every point and doesn't overshoot.
    const drawnOn = g.csShape === "drawn" && !yokeOn;
    const planOf = str => String(str == null ? "" : str).split(/[,;\n]+/).map(q => q.trim().split(/\s*[:=]\s*|\s+/).map(Number))
      .filter(q => q.length >= 2 && isFinite(q[0]) && isFinite(q[1]) && q[0] > 0).map(q => [q[0], Math.abs(q[1])]).sort((x, y) => x[0] - y[0]);
    function planZ(pts, z0, z1, L) {
      const use = pts.filter(q => q[0] > 1 && q[0] < L - 20);
      // inside the BB shell (first point usually at its surface) carry the drawn line straight on to the BB centre, so the
      // stay doesn't kink where it leaves the shell; the BB node itself stays where it is (members start at their node)
      if (use.length >= 2 && use[0][0] >= 15) { const sl = (use[1][1] - use[0][1]) / (use[1][0] - use[0][0]); z0 = Math.min(45, Math.max(0, use[0][1] - sl * use[0][0])); }
      const P0 = [[0, z0]].concat(use).concat([[L, z1]]);
      const n = P0.length, h = [], dl = [], mt = new Array(n).fill(0);
      for (let i = 0; i < n - 1; i++) { h.push(P0[i + 1][0] - P0[i][0]); dl.push((P0[i + 1][1] - P0[i][1]) / h[i]); }
      mt[0] = dl[0]; mt[n - 1] = dl[n - 2];
      for (let i = 1; i < n - 1; i++) mt[i] = dl[i - 1] * dl[i] <= 0 ? 0 : (h[i - 1] + 2 * h[i] + 2 * h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / dl[i - 1] + (h[i] + 2 * h[i - 1]) / dl[i]);
      const f = d => {
        d = Math.min(L, Math.max(0, d)); let i = 0; while (i < n - 2 && d > P0[i + 1][0]) i++;
        const t = (d - P0[i][0]) / h[i], t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * P0[i][1] + (t3 - 2 * t2 + t) * h[i] * mt[i] + (-2 * t3 + 3 * t2) * P0[i + 1][1] + (t3 - t2) * h[i] * mt[i + 1];
      };
      // points traced off a drawing are good to ±0.5 mm: a light rounding (Gaussian, σ 4 mm) keeps that noise from
      // showing up as tight bends at the points; the ends stay exactly at the BB and dropout nodes
      const N = Math.max(2, Math.ceil(L)), ds = L / N, raw = Float64Array.from({ length: N + 1 }, (_, i) => f(i * ds)), sm = new Float64Array(N + 1);
      const sg = 4, kw = Math.ceil(3 * sg / ds);
      for (let i = 0; i <= N; i++) { let v = 0, w = 0; for (let j = -kw; j <= kw; j++) { const q = Math.min(N, Math.max(0, i + j)), wt = Math.exp(-0.5 * (j * ds / sg) ** 2); v += wt * raw[q]; w += wt; } sm[i] = v / w; }
      const e0 = raw[0] - sm[0], e1 = raw[N] - sm[N];
      for (let i = 0; i <= N; i++) sm[i] += e0 + (e1 - e0) * i / N;
      const F = d => { const x = Math.min(N, Math.max(0, d / ds)), i = Math.min(N - 1, Math.floor(x)), t = x - i; return sm[i] * (1 - t) + sm[i + 1] * t; };
      let a0 = Infinity, a1 = -Infinity; for (let k = 0; k < 200; k++) { const th = Math.atan((F((k + 1) * L / 200) - F(k * L / 200)) / (L / 200)); a0 = Math.min(a0, th); a1 = Math.max(a1, th); }
      F.turnDeg = (a1 - a0) * 180 / Math.PI;
      return F;
    }
    // Drive-side plate (csDrivePlate = mm from the BB centre): a solid plate (csDrivePlateW thick × csDrivePlateH tall)
    // welded to the shell and slotted into the drive stay, the way builders get chainring room on short stays.
    const drivePlateL = drawnOn ? num(g.csDrivePlate, 0) : 0;
    const drivePlateSec = sectionProps({ plate: true, h: num(g.csDrivePlateH, 25.5), w: num(g.csDrivePlateW, 6) }, m.E, m.nu);
    geo.drawnStays = drawnOn ? { plateL: drivePlateL, plateW: num(g.csDrivePlateW, 6), plateH: num(g.csDrivePlateH, 25.5) } : null;
    for (const side of [1, -1]) {
      const s = side > 0 ? "R" : "L";
      const segs = (A, B, n) => Math.max(n, Math.ceil(norm(sub(P[B], P[A])) / 15));
      if (yokeOn) member("chainstay", side > 0 ? "Chainstay yoke (drive side)" : "Chainstay yoke (non-drive)", "BB" + s, "Yk" + s, yokeSec, segs("BB" + s, "Yk" + s, Math.ceil(norm(sub(P["Yk" + s], P["BB" + s])) / 5)),
        { path: clearPath(P["BB" + s], P["Yk" + s], () => ySpec.w / 2, csClr, 30, true, 2 * ySpec.w) });
      const a = yokeOn ? "Yk" + s : "BB" + s, b = "CE" + s;
      const pa = P[a], pb = P[b];
      const straightLen = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      let path;
      const plan = drawnOn ? planOf(side > 0 ? g.csPlanDrive : g.csPlanNds) : [];
      if (drawnOn && plan.length) {
        const zf = planZ(plan, Math.abs(pa[2]), Math.abs(pb[2]), straightLen), zu = u => side * zf(u * straightLen);
        if (csSide) path = withSide(csSide, zu, straightLen);
        else { path = u => [lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u), zu(u)]; path.minRtarget = 0; }
        path.turnDeg = Math.max(zf.turnDeg, csSide ? csSide.turnDeg || 0 : 0); path.drawn = true;
      }
      else if (g.csShape === "auto") path = clearPath(pa, pb, u => chainstaySpec(cs, u * straightLen, straightLen).w / 2 || cs.od / 2, csClr, 12, false, 3.5 * cs.od, csSide);
      else {
        const tW = Math.min(0.9, Math.max(0.05, ((g.csWidestAt || straightLen * 0.3) - (yokeOn ? norm([pa[0], pa[1], 0]) : 0)) / straightLen));
        const zW = (g.csSpacingAtTire || (Math.abs(pa[2]) * 2 + g.stayWidthAtDropout) / 2) / 2;
        const zf = yokeOn ? (u => lerp(Math.abs(pa[2]), g.stayWidthAtDropout / 2, u)) : pchip3(tW, g.csSpacingAtBB / 2, zW, g.stayWidthAtDropout / 2);
        path = csSide ? withSide(csSide, u => side * zf(u), straightLen) : u => [lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u), side * zf(u)];
      }
      const tuck = g.csRingTuck === "" || g.csRingTuck == null ? NaN : num(g.csRingTuck, NaN);
      if (side > 0 && isFinite(tuck) && num(g.chainring, 0) > 0 && !(path && path.drawn)) path = ringTuck(path, tuck, u => (chainstaySpec(cs, u * straightLen, straightLen).w || cs.od) / 2, straightLen);
      const brakeOnCS = !g.brakeMount || g.brakeMount === "chainstay", brakeOnSS = g.brakeMount === "seatstay", rot = num(g.rearRotor, 180);
      const plateEnd = num(g.dropoutLength, 28) + 8, b1 = Math.max(rot / 2 - 5, plateEnd);
      const boltRadii = [b1, b1 + 74];                                // post-mount bolt holes, 74 mm apart, clear of the dropout plate
      const plateU = side > 0 && drivePlateL > 0 && drivePlateL < straightLen - 40 ? drivePlateL / straightLen : 0;
      // the plate ends at the station plateU; members hand sections the arc length, so measure the plate along the path
      let plateArc = 0; if (plateU) { let q0 = pa; for (let k = 1; k <= 60; k++) { const q = path(plateU * k / 60); plateArc += norm(sub(q, q0)); q0 = q; } }
      const csSec = plateU ? (d, L) => d < plateArc ? drivePlateSec : csSection(d, L) : csSection;   // oval/taper lengths stay measured from the BB
      member("chainstay", side > 0 ? "Chainstay (drive side)" : "Chainstay (non-drive)", a, b, csSec, csSide ? Math.max(segs(a, b, 12), Math.ceil(straightLen / 10)) : segs(a, b, 12),
        { path, bendFrom: drawnOn ? Math.max(plateU ? plateU + 15 / straightLen : 0, 30 / straightLen) : 0, stations: (side < 0 && brakeOnCS ? boltRadii.map(r => uAtRadius(path, r)).filter(u => u != null) : []).concat(plateU ? [plateU] : []) });
      const ssOd = t.seatStay.od;
      // seat-stay bridge: just above the tyre (or where asked), as an exact station on each stay
      const bridgeR = TS.R + num(g.ssBridgeAbove, 25) + ((t.ssBridge && t.ssBridge.od) || 12.7) / 2;
      const ssStations = p => (bridgeOn && uAtRadius(p, bridgeR) != null ? [uAtRadius(p, bridgeR)] : bridgeOn ? [bridgeFallback(p)] : []).concat(side < 0 && brakeOnSS ? boltRadii.map(r => uAtRadius(p, r)) : []).filter(u => u != null);
      let ssMem;
      if (g.ssShape === "wishbone") {
        member("link", "Wishbone junction", "WB", "WB" + s, RIGID, 1, { nonFrame: true });
        const pth = clearPath(P["WB" + s], P["SE" + s], () => ssOd / 2, clr, 18, false, 3.5 * ssOd, ssSide);
        ssMem = member("seatStay", side > 0 ? "Seat stay leg (drive side)" : "Seat stay leg (non-drive)", "WB" + s, "SE" + s, ssSection, segs("WB" + s, "SE" + s, ssSide ? 24 : 12), { path: pth, stations: ssStations(pth) });
      } else if (g.ssShape === "curved") {
        const pth = clearPath(P["SS" + s], P["SE" + s], () => ssOd / 2, clr, 14, false, 3.5 * ssOd, ssSide);
        ssMem = member("seatStay", side > 0 ? "Seat stay (drive side)" : "Seat stay (non-drive)", "SS" + s, "SE" + s, ssSection, segs("SS" + s, "SE" + s, ssSide ? 30 : 18), { path: pth, stations: ssStations(pth) });
      } else {
        const A = P["SS" + s], B = P["SE" + s], pth = ssSide ? withSide(ssSide, u => lerp(A[2], B[2], u), norm(sub(B, A))) : u => add(A, mul(sub(B, A), u));
        ssMem = member("seatStay", side > 0 ? "Seat stay (drive side)" : "Seat stay (non-drive)", "SS" + s, "SE" + s, ssSection, ssSide ? 24 : ssShaped ? 12 : N, { stations: ssStations(pth), path: ssSide ? pth : undefined });
      }
      if (bridgeOn && ssMem) { const ub = uAtRadius(ssMem.path, bridgeR) ?? bridgeFallback(ssMem.path); bridgeEnds.push(ssMem.stationNodes[ub]); if (uAtRadius(ssMem.path, bridgeR) == null) geo.bridgeClamped = true; }
      member("dropout", side > 0 ? "Dropout plate (drive side)" : "Dropout plate (non-drive)", "D" + s, "CE" + s, plateSec, 1);
      member("dropout", side > 0 ? "Dropout plate (drive side)" : "Dropout plate (non-drive)", "D" + s, "SE" + s, plateSec, 1);
      if (g.ssShape !== "wishbone") member("link", "Seat-stay junction (rigid)", "SSst", "SS" + s, RIGID, 1, { nonFrame: true });
    }
    if (bridgeEnds.length === 2 && bridgeEnds.every(v => v != null)) {
      nodeIdx.BrR = bridgeEnds[0]; nodeIdx.BrL = bridgeEnds[1];
      // seat-stay bridge tube between the two stays (drawn and loaded like any tube; its welds are fatigue sites)
      const bs = sectionProps(t.ssBridge || { od: 12.7, wall: 0.9 }, m.E, m.nu), [nA, nB] = bridgeEnds, pA = nodes[nA].p, pB = nodes[nB].p;
      const mem = { group: "seatStay", label: "Seat stay bridge", a: "", b: "", elements: [], rigid: false, structural: true, length: norm(sub(pB, pA)), fixture: false, section: bs };
      let prev = nA; const nb = 4;
      for (let k = 1; k <= nb; k++) {
        let cur; if (k === nb) cur = nB; else { cur = nodes.length; nodes.push({ p: add(pA, mul(sub(pB, pA), k / nb)) }); }
        mem.elements.push(elements.length); elements.push({ n1: prev, n2: cur, section: bs, member: members.length, dFrom: mem.length * (k - 1) / nb, dTo: mem.length * k / nb }); prev = cur;
      }
      members.push(mem);
    }
    if (g.ssShape === "wishbone") member("seatStay", "Seat stay wishbone (single tube)", "SSst", "WB", sectionProps(t.ssMono || { od: num(g.ssMonoOD, 22), wall: 1.0 }, m.E, m.nu), 6);
    member("axle", "Rear axle + hub", "DL", "AxleR", axleSec, 2, { nonFrame: true });
    member("axle", "Rear axle + hub", "AxleR", "Cog", axleSec, 2, { nonFrame: true });
    member("axle", "Rear axle + hub", "Cog", "DR", axleSec, 1, { nonFrame: true });
    // Rear disc-brake caliper: a rigid mount from the caliper to the nearest point of the non-drive stay it bolts to
    {
      const rot = num(g.rearRotor, 180), onSeat = g.brakeMount === "seatstay" || g.brakeMount === "slider", onSlider = g.brakeMount === "slider";
      const lab = onSeat ? (g.ssShape === "wishbone" ? "Seat stay leg (non-drive)" : "Seat stay (non-drive)") : "Chainstay (non-drive)";
      const sm = members.find(mm => mm.label === lab);
      if (sm) {
        // post-mount bosses: two bolts 74 mm apart along the stay, at exact stations on the stay
        const ax = P.AxleR;
        // post mount on the sliding dropout: the bolts go into the slider plate (bolted, not welded), so the caliper
        // loads the dropout plate at the axle and at the seat-stay end of the plate
        let bolts = onSlider ? [nodeIdx.DL, nodeIdx.SEL].filter(v => v != null) : Object.values(sm.stationNodes || {});
        const b1 = Math.max(rot / 2 - 5, num(g.dropoutLength, 28) + 8), rOfN = nn => Math.hypot(nodes[nn].p[0] - ax[0], nodes[nn].p[1] - ax[1]);
        if (bridgeOn && g.brakeMount === "seatstay") bolts = bolts.filter(nn => Math.abs(rOfN(nn) - b1) < 2 || Math.abs(rOfN(nn) - (b1 + 74)) < 2);
        if (!bolts.length) { const stayNodes = [...new Set(sm.elements.flatMap(ei => [elements[ei].n1, elements[ei].n2]))]; const rOf = nn => Math.hypot(nodes[nn].p[0] - ax[0], nodes[nn].p[1] - ax[1]); bolts = [stayNodes.reduce((b, nn) => Math.abs(rOf(nn) - (rot / 2 - 5)) < Math.abs(rOf(b) - (rot / 2 - 5)) ? nn : b, stayNodes[0])]; }
        bolts.sort((u, v) => Math.hypot(nodes[u].p[0] - ax[0], nodes[u].p[1] - ax[1]) - Math.hypot(nodes[v].p[0] - ax[0], nodes[v].p[1] - ax[1]));
        const q = nodes[onSlider ? bolts[bolts.length - 1] : bolts[0]].p, dir = unit([q[0] - ax[0], q[1] - ax[1], 0]), rc = rot / 2 - 12;
        const cp = [ax[0] + dir[0] * rc, ax[1] + dir[1] * rc, -(g.stayWidthAtDropout / 2) + 8];
        const ci = nodes.length; nodes.push({ p: cp, name: "Cal" }); nodeIdx.Cal = ci;
        // the mount tabs + caliper body as short Ti plate beams (6 × 20 mm), not rigid, so the stay isn't artificially stiffened
        const tab = sectionProps({ plate: true, h: 20, w: 6 }, m.E, m.nu);
        const mem = { group: "brakeMount", label: "Brake caliper mount", a: "Cal", b: "", elements: [], rigid: false, structural: false, length: 0, fixture: false, section: tab, stay: lab };
        if (!onSlider) bossNodes.push(...bolts);
        for (const bn of bolts) { mem.elements.push(elements.length); elements.push({ n1: bn, n2: ci, section: tab, member: members.length, dFrom: 0, dTo: norm(sub(cp, nodes[bn].p)) }); }
        members.push(mem);
        geo.caliper = { p: cp, r: rc, stay: onSlider ? "sliding dropout" : lab, rotor: rot, mount: onSlider ? "slider" : onSeat ? "seatstay" : "chainstay" };
      }
    }

    // names that were merged into a used point share its node; unused points get no node
    for (const nm of names) { const r = findRoot(nm); if (r in nodeIdx) nodeIdx[nm] = nodeIdx[r]; }
    // Welded joints for the hot-spot fatigue check: which brace meets which chord, where
    const T = t;
    const weldWall = sp => isButted(sp) ? sp.buttWall : sp.wall;   // chord wall at the weld (butted tubes: the thick end)
    // chord diameter: round od, or the mean of an oval head tube / BB shell (h × w)
    const chordD = sp => sp.od > 0 ? sp.od : (sp.h > 0 && sp.w > 0 ? (sp.h + sp.w) / 2 : (sp.h || sp.w || NaN));
    const jointSpecs = [
      { name: "Top tube → head tube", brace: "Top tube", at: "TTht", chord: { D: chordD(T.headTube), T: weldWall(T.headTube), L: g.headTube, axis: geo.uHT } },
      { name: "Down tube → head tube", brace: "Down tube", at: "DTht", chord: { D: chordD(T.headTube), T: weldWall(T.headTube), L: g.headTube, axis: geo.uHT } },
      { name: "Top tube → seat tube", brace: "Top tube", at: "TTst", chord: { D: chordD(T.seatTube), T: weldWall(T.seatTube), L: g.seatTube, axis: geo.uST } },
      ...(g.ssShape === "wishbone" ? [
        { name: "Wishbone → seat tube", brace: "Seat stay wishbone (single tube)", at: "SSst", chord: { D: chordD(T.seatTube), T: weldWall(T.seatTube), L: g.seatTube, axis: geo.uST } },
        { name: "Wishbone → leg (drive)", brace: "Seat stay leg (drive side)", at: "WBR", chord: null },
        { name: "Wishbone → leg (non-drive)", brace: "Seat stay leg (non-drive)", at: "WBL", chord: null }
      ] : [
        { name: "Seat stay → seat tube (drive)", brace: "Seat stay (drive side)", at: "SSR", chord: { D: chordD(T.seatTube), T: weldWall(T.seatTube), L: g.seatTube, axis: geo.uST } },
        { name: "Seat stay → seat tube (non-drive)", brace: "Seat stay (non-drive)", at: "SSL", chord: { D: chordD(T.seatTube), T: weldWall(T.seatTube), L: g.seatTube, axis: geo.uST } }]),
      { name: "Down tube → BB shell", brace: "Down tube", at: "BB", chord: { D: chordD(T.bbShell), T: weldWall(T.bbShell), L: g.bbShellWidth || 73, axis: [0, 0, 1] }, bb: true },
      { name: "Seat tube → BB shell", brace: "Seat tube", at: "BB", chord: { D: chordD(T.bbShell), T: weldWall(T.bbShell), L: g.bbShellWidth || 73, axis: [0, 0, 1] }, bb: true },
      ...(yokeOn ? [
        { name: "Yoke → BB shell (drive)", brace: "Chainstay yoke (drive side)", at: "BBR", chord: { D: chordD(T.bbShell), T: weldWall(T.bbShell), L: g.bbShellWidth || 73, axis: [0, 0, 1] }, bb: true },
        { name: "Yoke → BB shell (non-drive)", brace: "Chainstay yoke (non-drive)", at: "BBL", chord: { D: chordD(T.bbShell), T: weldWall(T.bbShell), L: g.bbShellWidth || 73, axis: [0, 0, 1] }, bb: true },
        { name: "Chainstay → yoke (drive)", brace: "Chainstay (drive side)", at: "YkR", chord: null },
        { name: "Chainstay → yoke (non-drive)", brace: "Chainstay (non-drive)", at: "YkL", chord: null }
      ] : [
        { name: "Chainstay → BB shell (drive)", brace: "Chainstay (drive side)", at: "BBR", chord: { D: chordD(T.bbShell), T: weldWall(T.bbShell), L: g.bbShellWidth || 73, axis: [0, 0, 1] }, bb: true },
        { name: "Chainstay → BB shell (non-drive)", brace: "Chainstay (non-drive)", at: "BBL", chord: { D: chordD(T.bbShell), T: weldWall(T.bbShell), L: g.bbShellWidth || 73, axis: [0, 0, 1] }, bb: true }]),
      { name: "Chainstay → dropout (drive)", brace: "Chainstay (drive side)", at: "CER", chord: null },
      { name: "Chainstay → dropout (non-drive)", brace: "Chainstay (non-drive)", at: "CEL", chord: null },
      ...(nodeIdx.BrR != null ? [
        { name: "Bridge → seat stay (drive)", brace: "Seat stay bridge", at: "BrR", chord: { D: chordD(T.seatStay), T: weldWall(T.seatStay), L: 200, axis: unit(sub(P.SER, P.SSR)) } },
        { name: "Bridge → seat stay (non-drive)", brace: "Seat stay bridge", at: "BrL", chord: { D: chordD(T.seatStay), T: weldWall(T.seatStay), L: 200, axis: unit(sub(P.SEL, P.SSL)) } }] : []),
      { name: "Seat stay → dropout (drive)", brace: g.ssShape === "wishbone" ? "Seat stay leg (drive side)" : "Seat stay (drive side)", at: "SER", chord: null },
      { name: "Seat stay → dropout (non-drive)", brace: g.ssShape === "wishbone" ? "Seat stay leg (non-drive)" : "Seat stay (non-drive)", at: "SEL", chord: null }
    ];
    // Real inside gap between the chainstays at their widest point
    { let best = null; const cm = members.find(mm => mm.label === "Chainstay (drive side)");
      if (cm) for (const ei of cm.elements) { const e = elements[ei], z = nodes[e.n2].p[2]; if (!best || z > best.z) best = { z, w: e.section.w }; }
      if (best) geo.info.csGapAtWidest = 2 * best.z - best.w; }
    // Joint flags: element ends at a node where two or more different frame parts meet are welded joints
    const groupsAt = nodes.map(() => new Set());
    // (brake-mount bosses count as welded-on parts: the stay is a weld site where they attach)
    for (const e of elements) { const mem = members[e.member]; if (!mem.structural && mem.group !== "link" && mem.group !== "brakeMount") continue; const tag = mem.group === "link" ? "link" : mem.group === "brakeMount" ? "brake-mount boss" : mem.label; groupsAt[e.n1].add(tag); groupsAt[e.n2].add(tag); }
    for (const e of elements) { e.joint1 = groupsAt[e.n1].size >= 2; e.joint2 = groupsAt[e.n2].size >= 2; }
    return { design, geo, nodes, nodeIdx, elements, members, jointSpecs, bossNodes };
  }

  // ------------------------------------------------------------ element matrices
  function elementFrame(pa, pb) {
    const ex = unit(sub(pb, pa));
    const ref = Math.abs(ex[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const ez = unit(cross(ex, ref));
    const ey = cross(ez, ex);
    return [ex, ey, ez];
  }
  function localK(s, L) {
    const k = new Float64Array(144);
    const set = (i, j, v) => { k[i * 12 + j] = v; k[j * 12 + i] = v; };
    const a = s.E * s.A / L, t = s.G * s.J / L;
    const z12 = 12 * s.E * s.Iz / L ** 3, z6 = 6 * s.E * s.Iz / L ** 2, z4 = 4 * s.E * s.Iz / L, z2 = 2 * s.E * s.Iz / L;
    const y12 = 12 * s.E * s.Iy / L ** 3, y6 = 6 * s.E * s.Iy / L ** 2, y4 = 4 * s.E * s.Iy / L, y2 = 2 * s.E * s.Iy / L;
    set(0, 0, a); set(0, 6, -a); set(6, 6, a);
    set(3, 3, t); set(3, 9, -t); set(9, 9, t);
    set(1, 1, z12); set(1, 5, z6); set(1, 7, -z12); set(1, 11, z6);
    set(5, 5, z4); set(5, 7, -z6); set(5, 11, z2);
    set(7, 7, z12); set(7, 11, -z6); set(11, 11, z4);
    set(2, 2, y12); set(2, 4, -y6); set(2, 8, -y12); set(2, 10, -y6);
    set(4, 4, y4); set(4, 8, y6); set(4, 10, y2);
    set(8, 8, y12); set(8, 10, y6); set(10, 10, y4);
    return k;
  }
  function transform(R) {
    const T = new Float64Array(144);
    for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[(b * 3 + i) * 12 + b * 3 + j] = R[i][j];
    return T;
  }
  function prepareElements(model) {
    for (const e of model.elements) {
      const pa = model.nodes[e.n1].p, pb = model.nodes[e.n2].p;
      e.L = norm(sub(pb, pa)); e.R = elementFrame(pa, pb); e.T = transform(e.R); e.kl = localK(e.section, e.L);
      const kT = new Float64Array(144), kg = new Float64Array(144);
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { let s = 0; for (let m = 0; m < 12; m++) s += e.kl[i * 12 + m] * e.T[m * 12 + j]; kT[i * 12 + j] = s; }
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { let s = 0; for (let m = 0; m < 12; m++) s += e.T[m * 12 + i] * kT[m * 12 + j]; kg[i * 12 + j] = s; }
      e.kg = kg;
    }
  }
  // Reverse Cuthill-McKee node ordering keeps the stiffness matrix narrow-banded (much faster solves)
  function rcmOrder(model) {
    const nn = model.nodes.length, adj = Array.from({ length: nn }, () => new Set());
    for (const e of model.elements) { adj[e.n1].add(e.n2); adj[e.n2].add(e.n1); }
    const order = [], seen = new Uint8Array(nn);
    const byDeg = [...Array(nn).keys()].sort((a, b) => adj[a].size - adj[b].size);
    for (const start of byDeg) {
      if (seen[start]) continue;
      const q = [start]; seen[start] = 1;
      while (q.length) { const v = q.shift(); order.push(v); [...adj[v]].filter(w => !seen[w]).sort((a, b) => adj[a].size - adj[b].size).forEach(w => { seen[w] = 1; q.push(w); }); }
    }
    order.reverse();
    const pos = new Int32Array(nn); order.forEach((v, i) => pos[v] = i);
    return pos;
  }
  function assemble(model, kgOverride) {
    const nn = model.nodes.length, n = nn * 6;
    const pos = rcmOrder(model);
    const map = i => pos[Math.floor(i / 6)] * 6 + (i % 6);   // original DOF -> banded position
    let bw = 0;
    for (const e of model.elements) bw = Math.max(bw, Math.abs(pos[e.n1] - pos[e.n2]) * 6 + 5);
    const K = new Map();   // sparse (row*n+col) in banded numbering
    for (const e of model.elements) {
      const d = []; for (let i = 0; i < 6; i++) d.push(map(e.n1 * 6 + i)); for (let i = 0; i < 6; i++) d.push(map(e.n2 * 6 + i));
      const kgE = (kgOverride && kgOverride.get(e)) || e.kg;
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { const key = d[i] * n + d[j]; K.set(key, (K.get(key) || 0) + kgE[i * 12 + j]); }
    }
    return { K, n, map, bw };
  }
  // Banded Cholesky with some DOFs held at zero (given in original numbering); returns solve(F) -> u
  function makeSolverRaw(asm, fixed) {
    const { K, n, map, bw } = asm;
    const isFixed = new Uint8Array(n); for (const d of fixed) isFixed[map(d)] = 1;
    const free = []; const fpos = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (!isFixed[i]) { fpos[i] = free.length; free.push(i); }
    const m = free.length, B = bw + 1;
    const A = new Float64Array(m * B);
    for (const [key, v] of K) {
      const r = Math.floor(key / n), c = key % n;
      const i = fpos[r], j = fpos[c];
      if (i < 0 || j < 0 || j > i || i - j > bw) continue;
      A[i * B + (i - j)] = v;
    }
    for (let j = 0; j < m; j++) {
      let s = A[j * B];
      for (let k = Math.max(0, j - bw); k < j; k++) { const v = A[j * B + (j - k)]; s -= v * v; }
      if (!(s > 1e-9)) throw new Error("The frame model is unstable (a support or joint is missing).");
      const d = Math.sqrt(s); A[j * B] = d;
      const iMax = Math.min(m - 1, j + bw);
      for (let i = j + 1; i <= iMax; i++) {
        let v = A[i * B + (i - j)];
        for (let k = Math.max(0, i - bw); k < j; k++) v -= A[i * B + (i - k)] * A[j * B + (j - k)];
        A[i * B + (i - j)] = v / d;
      }
    }
    const inv = new Int32Array(n); for (let d = 0; d < n; d++) inv[map(d)] = d;
    return F => {
      const y = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        let v = F[inv[free[i]]];
        for (let k = Math.max(0, i - bw); k < i; k++) v -= A[i * B + (i - k)] * y[k];
        y[i] = v / A[i * B];
      }
      const x = new Float64Array(m);
      for (let i = m - 1; i >= 0; i--) {
        let v = y[i];
        const kMax = Math.min(m - 1, i + bw);
        for (let k = i + 1; k <= kMax; k++) v -= A[k * B + (k - i)] * x[k];
        x[i] = v / A[i * B];
      }
      const u = new Float64Array(n);
      for (let i = 0; i < m; i++) u[inv[free[i]]] = x[i];
      return u;
    };
  }
  function solveSupported(asm, fixed, loads) { const s = makeSolverRaw(asm, fixed); return loads.map(s); }

  // Stresses per element end, plus utilisation against the local strength (joint ends use heat-affected strength)
  function elementResults(model, u) {
    const mat = model.design.material, jy = mat.jointYield || mat.yield, ty = mat.yield;
    return model.elements.map(e => {
      const ue = new Float64Array(12);
      for (let i = 0; i < 6; i++) { ue[i] = u[e.n1 * 6 + i]; ue[6 + i] = u[e.n2 * 6 + i]; }
      const ul = new Float64Array(12);
      for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += e.T[i * 12 + j] * ue[j]; ul[i] = s; }
      const f = new Float64Array(12);
      for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += e.kl[i * 12 + j] * ul[j]; f[i] = s; }
      const s = e.section;
      const N = f[6], Tq = f[9];
      if (s.rigid) return { axial: N, torque: Tq, vm1: 0, vm2: 0, vm: 0, sig: 0, u1: 0, u2: 0, u: 0, f };
      const p = s.cy || s.h / 2, q = s.cz || s.w / 2;
      const bend = (My, Mz) => s.round ? Math.hypot(My, Mz) * p / s.Iz : Math.abs(Mz) * p / s.Iz + Math.abs(My) * q / s.Iy;
      const tau = s.plate ? Math.abs(Tq) * Math.min(s.h, s.w) / s.J : s.round ? Math.abs(Tq) * p / s.J : Math.abs(Tq) / (2 * s.Am * s.t);
      const sig1 = Math.abs(N) / s.A + bend(f[4], f[5]);
      const sig2 = Math.abs(N) / s.A + bend(f[10], f[11]);
      const vm1 = Math.sqrt(sig1 ** 2 + 3 * tau ** 2), vm2 = Math.sqrt(sig2 ** 2 + 3 * tau ** 2);
      // utilisation: von Mises vs local yield, or (round tubes) axial + bending vs the local-buckling moment capacity
      const fy1 = e.joint1 ? jy : ty, fy2 = e.joint2 ? jy : ty;
      let u1 = vm1 / fy1, u2 = vm2 / fy2;
      if (s.round) {
        const b1 = Math.abs(N) / (s.A * fy1) + Math.hypot(f[4], f[5]) / momentCapacity(s, fy1);
        const b2 = Math.abs(N) / (s.A * fy2) + Math.hypot(f[10], f[11]) / momentCapacity(s, fy2);
        u1 = Math.max(u1, b1); u2 = Math.max(u2, b2);
      }
      return { axial: N, torque: Tq, vm1, vm2, vm: Math.max(vm1, vm2), sig: Math.max(sig1, sig2), tau, u1, u2, u: Math.max(u1, u2), f, sa: Math.abs(N) / s.A, sb1: bend(f[4], f[5]), sb2: bend(f[10], f[11]) };
    });
  }

  // ------------------------------------------------------------ tube bending capacity (local buckling)
  // AISC 360 F8 for round hollow sections, written with λ = (D/t)·fy/E so it holds for titanium:
  //  λ ≤ 0.07 compact → plastic moment; ≤ 0.31 non-compact → (0.021/λ + 1)·fy·S; beyond → (0.33/λ)·fy·S
  const F8_WARN = new Set();   // tube sizes thinner than the AISC F8 range met during the last analysis
  function momentCapacity(s, fy) {
    const D = s.h, t = s.t, lam = (D / t) * fy / s.E;
    if (lam > 0.45) { s.beyondF8 = true; F8_WARN.add(`Ø${+D.toFixed(1)}×${+t.toFixed(2)}`); }   // AISC F8 only covers D/t < 0.45·E/fy
    const S = s.Iz / (D / 2), Z = (D ** 3 - (D - 2 * t) ** 3) / 6;
    if (lam <= 0.07) return fy * Z;
    if (lam <= 0.31) return Math.min(fy * Z, (0.021 / lam + 1) * fy * S);
    return (0.33 / lam) * fy * S;
  }

  // ------------------------------------------------------------ welded tube joints: hot-spot stress
  // Efthymiou (1988) parametric SCFs for T/Y tubular joints, general chord-end fixity C (as in DNV-RP-C203 App. B).
  // β = d/D, γ = D/2T, τ = t/T, α = 2L/D, θ = brace angle. Parameters are clamped to the validity range.
  function efthymiou(beta, gamma, tau, alpha, thetaDeg, C) {
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const inRange = beta >= 0.2 && beta <= 1 && gamma >= 8 && gamma <= 32 && tau >= 0.2 && tau <= 1 && alpha >= 4 && alpha <= 40 && thetaDeg >= 20 && thetaDeg <= 90;
    const b = clamp(beta, 0.2, 1), g = clamp(gamma, 8, 32), t = clamp(tau, 0.2, 1), a = clamp(alpha, 4, 40);
    const th = clamp(thetaDeg, 20, 90) * Math.PI / 180, sn = Math.sin(th);
    const C1 = 2 * (C - 0.5), C2 = C / 2, C3 = C / 5;
    const F2 = a < 12 ? 1 - (1.43 * b - 0.97 * b * b - 0.03) * g ** 0.04 * Math.exp(-0.71 * g ** -1.38 * a ** 2.5) : 1;
    const F3 = a < 12 ? 1 - 0.55 * b ** 1.8 * g ** 0.16 * Math.exp(-0.49 * g ** -0.89 * a ** 1.8) : 1;
    const chordSaddleAx = (g * t ** 1.1 * (1.11 - 3 * (b - 0.52) ** 2) * sn ** 1.6 + C1 * (0.8 * a - 6) * t * b * b * Math.sqrt(Math.max(0, 1 - b * b)) * Math.sin(2 * th) ** 2) * F2;
    const chordCrownAx = g ** 0.2 * t * (2.65 + 5 * (b - 0.65) ** 2) + t * b * (C2 * a - 3) * sn;
    const braceSaddleAx = (1.3 + g * t ** 0.52 * a ** 0.1 * (0.187 - 1.25 * b ** 1.1 * (b - 0.96)) * sn ** (2.7 - 0.01 * a)) * F2;
    const braceCrownAx = 3 + g ** 1.2 * (0.12 * Math.exp(-4 * b) + 0.011 * b * b - 0.045) + b * t * (C3 * a - 1.2);
    const chordIPB = 1.45 * b * t ** 0.85 * g ** (1 - 0.68 * b) * sn ** 0.7;
    const braceIPB = 1 + 0.65 * b * t ** 0.4 * g ** (1.09 - 0.77 * b) * sn ** (0.06 * g - 1.16);
    const chordOPB = g * t * b * (1.7 - 1.05 * b ** 3) * sn ** 1.6 * F3;
    const braceOPB = t ** -0.54 * g ** -0.05 * (0.99 - 0.47 * b + 0.08 * b ** 4) * chordOPB;
    return { inRange, chord: { AS: chordSaddleAx, AC: chordCrownAx, IPB: chordIPB, OPB: chordOPB }, brace: { AS: braceSaddleAx, AC: braceCrownAx, IPB: braceIPB, OPB: braceOPB } };
  }
  // Stress factors measured on 3D solid weld models (CalculiX C3D20R, real fillet bead): stored per joint geometry in
  // design.material.feSCF = [{ D, T, d, t, theta, weldLeg, chord: {axial, ipb, opb}, brace: {axial, ipb, opb}, ... }].
  // A joint uses a stored entry only if the chord and brace sizes match exactly and the angle within 3°.
  // measured factors shared by every design (the app fills this from its built-in table and the browser's saved runs)
  let FE_LIBRARY = [];
  function setFeLibrary(list) { FE_LIBRARY = Array.isArray(list) ? list.filter(e => e && e.chord && e.brace) : []; }
  function jointSig(D, T, d, t, theta) { return `${(+D).toFixed(1)}x${(+T).toFixed(2)}/${(+d).toFixed(1)}x${(+t).toFixed(2)}@${Math.round(theta)}`; }
  function matchFE(list, D, T, d, t, theta) {
    if (!Array.isArray(list)) return null;
    let best = null;
    for (const e of list) {
      if (!e || !e.chord || !e.brace) continue;
      if (Math.abs(e.D - D) > 0.05 || Math.abs(e.T - T) > 0.011 || Math.abs(e.d - d) > 0.05 || Math.abs(e.t - t) > 0.011) continue;
      const dth = Math.abs(e.theta - theta); if (dth > 3) continue;
      if (!best || dth < Math.abs(best.theta - theta)) best = e;
    }
    return best;
  }
  // Hot-spot stress at a joint from brace-end forces: 8 points around the brace, chord and brace side (DNV-RP-C203 eq. 3.3.1),
  // torsion added as shear (× K_T) and combined into a principal stress.
  function hotSpot(site, r) {
    const f = r.f; if (!f) return 0;
    const o = site.end === 1 ? 0 : 6;
    const N = f[o], T = f[o + 3], My = f[o + 4], Mz = f[o + 5];
    const s = site.section, R = site.R;
    const M = [My * R[1][0] + Mz * R[2][0], My * R[1][1] + Mz * R[2][1], My * R[1][2] + Mz * R[2][2]];
    const nI = site.nIPB, nO = site.nOPB;
    const bendStress = axis => {   // stress from a unit-direction moment component
      const m = M[0] * axis[0] + M[1] * axis[1] + M[2] * axis[2];
      const ay = axis[0] * R[1][0] + axis[1] * R[1][1] + axis[2] * R[1][2], az = axis[0] * R[2][0] + axis[1] * R[2][1] + axis[2] * R[2][2];
      return Math.abs(m) * (Math.abs(ay) * (s.cz || s.w / 2) / s.Iy + Math.abs(az) * (s.cy || s.h / 2) / s.Iz);
    };
    const sx = Math.abs(N) / s.A, sI = bendStress(nI), sO = bendStress(nO);
    const tau = s.plate ? Math.abs(T) * Math.min(s.h, s.w) / s.J : s.round ? Math.abs(T) * (s.h / 2) / s.J : Math.abs(T) / (2 * s.Am * s.t);
    const k = Math.SQRT1_2;
    let worst = 0;
    for (const side of site.scf ? [site.scf.chord, site.scf.brace] : [null]) {
      const f1 = sc => Math.max(site.minSCF, sc);
      const AC = side ? f1(side.AC) : site.fixedSCF, AS = side ? f1(side.AS) : site.fixedSCF;
      const MI = side ? f1(side.IPB) : site.fixedSCF, MO = side ? f1(side.OPB) : site.fixedSCF;
      const A = (AC + AS) / 2;
      const pts = [AC * sx + MI * sI, A * sx + k * MI * sI - k * MO * sO, AS * sx - MO * sO, A * sx - k * MI * sI - k * MO * sO,
                   AC * sx - MI * sI, A * sx - k * MI * sI + k * MO * sO, AS * sx + MO * sO, A * sx + k * MI * sI + k * MO * sO];
      const th = site.KT * tau * site.penalty;
      for (const p0 of pts) { const p = Math.abs(p0) * site.penalty; const pr = p / 2 + Math.sqrt(p * p / 4 + th * th); if (!(pr <= Infinity)) return Infinity; if (pr > worst) worst = pr; }
    }
    return worst;
  }

  // ------------------------------------------------------------ fatigue (S-N curve)
  // Welded tube joint, nominal (tube-model) stress amplitude. Slope 3 to 10 million cycles, slope 5 beyond
  // (the usual welded-joint shape, IIW). Sa = weldFatigue at 2 million cycles, calibrated so that titanium
  // frames that pass ISO 4210 in reality also pass here with a similar margin.
  function snLife(Sa, Sm, mat) {
    if (!(Sa > 0)) return Infinity;
    const uts = mat.jointUts || mat.uts;
    const Seq = Sm > 0 ? Sa / Math.max(0.05, 1 - Sm / uts) : Sa;   // Goodman mean-stress correction
    const S2 = mat.weldFatigue, Sknee = S2 * Math.pow(5, -1 / 3);
    if (Seq >= uts) return 1;
    return Seq >= Sknee ? 2e6 * Math.pow(S2 / Seq, 3) : 1e7 * Math.pow(Sknee / Seq, 5);
  }
  function snAllow(N, mat) {
    const S2 = mat.weldFatigue, Sknee = S2 * Math.pow(5, -1 / 3);
    return N <= 1e7 ? S2 * Math.pow(N / 2e6, -1 / 3) : Sknee * Math.pow(N / 1e7, -1 / 5);
  }

  // ------------------------------------------------------------ analysis
  function analyze(design) {
    const now = () => (typeof performance !== "undefined" ? performance : Date).now();
    const t0 = now();
    F8_WARN.clear();
    const model = buildModel(design);
    prepareElements(model);
    const asm = assemble(model), n = asm.n;
    const id = model.nodeIdx, P = model.geo.P, g = design.geometry, L = design.loads || {}, mat = design.material;
    const use = design.use || {};
    const dof = (name, i) => id[name] * 6 + i;
    const X = 0, Y = 1, Z = 2, RX = 3, RZ = 5;
    const vec = () => new Float64Array(n);
    const Wr = design.rider.riderKg * 9.81;
    const Wt = (design.rider.riderKg + design.rider.bikeKg) * 9.81;
    const Rw = g.tireDiameter / 2, RwF = frontTyreR(g);   // rear / front tyre radius (mixed wheel sizes: front can differ)
    const structural = model.elements.map(e => model.members[e.member].structural);

    const SUP = {
      roll:       { label: "rear axle pinned, front axle on a roller", fix: [["DR", [X, Y, Z]], ["DL", [Y, Z]], ["AxleF", [Y, Z]]] },
      clamp:      { label: "rear dropouts clamped", fix: [["DR", [0, 1, 2, 3, 4, 5]], ["DL", [0, 1, 2, 3, 4, 5]]] },
      sprint:     { label: "both tyres on the ground, rider's hands hold the bars upright", fix: [["AxleR", [X, Y, Z]], ["AxleF", [Y, Z]], ["HTtop", [RX]]] },
      rider:      { label: "rider holds the BB, rear tyre on the ground", fix: [["BB", [X, Y, Z]], ["DR", [Y, Z]], ["DL", [Y]]] },
      brakeFront: { label: "rider holds the BB and the bars, rear tyre unloaded", fix: [["BB", [X, Y, Z]], ["HTtop", [Y, Z]], ["DR", [Z]]] },
      rearHit:    { label: "rider holds the BB, front tyre on the ground", fix: [["BB", [X, Y, Z]], ["AxleF", [Y, Z]], ["DR", [Z]]] },
      isoPedal:   { label: "front axle fixed, rear axle on a swinging link", fix: [["AxleF", [X, Y, Z]], ["DR", [Y, Z]], ["DL", [Y]]] },
      bbFix:      { label: "frame held at the BB (ISO brake-mount rig)", fix: [["BB", [0, 1, 2, 3, 4, 5]]] },
      tbisJ:      { label: "BB, fork end and seat-tube top held", fix: [["BB", [0, 1, 2, 3, 4, 5]], ["AxleF", [0, 1, 2, 3, 4, 5]], ["STtop", [0, 1, 2, 3, 4, 5]]] },
      tbisK:      { label: "rear dropouts pinned, fork end on a rail", fix: [["DR", [X, Y, Z]], ["DL", [Y, Z]], ["AxleF", [Y, Z]]] },
      tbisL:      { label: "BB and seat-tube top held", fix: [["BB", [0, 1, 2, 3, 4, 5]], ["STtop", [0, 1, 2, 3, 4, 5]]] },
      tbisM:      { label: "fork end and rear dropouts held", fix: [["AxleF", [0, 1, 2, 3, 4, 5]], ["DR", [0, 1, 2, 3, 4, 5]], ["DL", [0, 1, 2, 3, 4, 5]]] },
      efbeSide:   { label: "BB, head tube and seat-tube top held", fix: [["BB", [0, 1, 2, 3, 4, 5]], ["HTtop", [X, Y, Z]], ["HTbot", [X, Y, Z]], ["STtop", [X, Y, Z]]] },
      sideRear:   { label: "rider's feet hold the BB, hands hold the bars sideways, front tyre on the ground", fix: [["BB", [X, Y, Z]], ["AxleF", [Y, Z]], ["HTtop", [Z]]] }
    };
    const solvers = {};
    const solve = (sup, F) => {
      if (!solvers[sup]) { const fx = []; for (const [nm, ds] of SUP[sup].fix) for (const d of ds) fx.push(dof(nm, d)); solvers[sup] = makeSolverRaw(asm, fx); }
      return solvers[sup](F);
    };
    const elRes = u => elementResults(model, u);
    const maxStructural = el => { let v = 0, at = -1, uu = 0, ua = -1; el.forEach((r, i) => { if (!structural[i]) return; if (r.vm > v) { v = r.vm; at = i; } if (r.u > uu) { uu = r.u; ua = i; } }); return { vm: v, at, u: uu, uAt: ua }; };
    const addF = (F, name, f) => { F[dof(name, X)] += f[0]; F[dof(name, Y)] += f[1]; F[dof(name, Z)] += f[2]; };
    const lin = (a, ka, b, kb) => { const r = new Float64Array(a.length); for (let i = 0; i < a.length; i++) r[i] = ka * a[i] + kb * b[i]; return r; };
    const dotFU = (F, u) => { let s = 0; for (let i = 0; i < n; i++) s += F[i] * u[i]; return s; };

    // pedal force + chain pull. crankDeg: 0 = crank forward & level, 45 = forward & down
    function pedalLoad(side, Fp, crankDeg, tiltDeg, footOffset) {
      const F = vec();
      const c = crankDeg * Math.PI / 180, tl = (tiltDeg || 0) * Math.PI / 180, fo = footOffset || g.footOffset;
      const rp = [g.crankLength * Math.cos(c), -g.crankLength * Math.sin(c), side * fo];
      const fp = [0, -Fp * Math.cos(tl), side * Fp * Math.sin(tl)];
      const rRing = g.chainring * 12.7 / (2 * Math.PI), rCog = g.cog * 12.7 / (2 * Math.PI);
      const ringTop = [0, rRing, g.chainline];
      const cogTop = [P.AxleR[0], P.AxleR[1] + rCog, g.chainline];
      const d = unit(sub(cogTop, ringTop));
      const Mp = cross(rp, fp), Mc1 = cross(ringTop, d);
      const T = -Mp[2] / Mc1[2];
      const fc = mul(d, T);
      const Mtot = add(Mp, cross(ringTop, fc)), Ftot = add(fp, fc);
      addF(F, "BB", Ftot); F[dof("BB", RX)] += Mtot[0]; F[dof("BB", 4)] += Mtot[1];
      addF(F, "Cog", mul(fc, -1));
      return { F, T };
    }
    function finish(o) { const w = maxStructural(o.el); o.peak = w.vm; o.peakEl = w.at; o.peakU = w.u; o.peakUEl = w.uAt; return o; }
    function mk(o) { o.u = solve(o.supports, o.F); o.el = elRes(o.u); return finish(o); }
    const scaleCase = (base, k, props) => finish(Object.assign({
      F: lin(base.F, k, base.F, 0), u: lin(base.u, k, base.u, 0),
      el: base.el.map(r => ({ ...r, axial: r.axial * k, torque: r.torque * k, tau: r.tau != null ? r.tau * Math.abs(k) : r.tau, sa: r.sa != null ? r.sa * Math.abs(k) : r.sa, sb1: r.sb1 != null ? r.sb1 * Math.abs(k) : r.sb1, sb2: r.sb2 != null ? r.sb2 * Math.abs(k) : r.sb2, vm1: r.vm1 * k, vm2: r.vm2 * k, vm: r.vm * k, sig: r.sig * k, u1: r.u1 * k, u2: r.u2 * k, u: r.u * k, f: r.f ? r.f.map(v => v * k) : r.f })),
      supports: base.supports
    }, props));

    // ================= stiffness tests
    const fBB = vec(); fBB[dof("BB", Z)] = 1000;
    const fSad = vec(); fSad[dof("Sit", Y)] = -1000;
    const fHT = vec(); fHT[dof("HTmid", RX)] = 100000;
    const tests = [
      mk({ id: "testBB", family: "test", name: "Side push at the BB", supports: "roll", F: fBB, detail: "1000 N sideways at the BB (pedalling stiffness)" }),
      mk({ id: "testHT", family: "test", name: "Front-end twist", supports: "clamp", F: fHT, detail: "100 N·m twist about the frame's long axis at the head tube, rear clamped (steering stiffness)" }),
      mk({ id: "testSaddle", family: "test", name: "Weight on the saddle", supports: "roll", F: fSad, detail: `1000 N straight down at the sit bones, ${Math.round(num(g.saddleSetback, 50))} mm behind the seatpost clamp (seated comfort flex)` })
    ];
    // TBIS 4210-6:2026 stiffness ratings J/K/L/M (bands, not pass/fail). K here is frame-only: the fork is a rigid dummy.
    const tbis = (() => {
      const one = (sup, node, d, f) => { const F = vec(); F[dof(node, d)] = f; const u = solve(sup, F); return Math.abs(f / u[dof(node, d)]); };
      return {
        J: { k: one("tbisJ", "DR", Z, 250), band: [40, 80], label: "Rear triangle, sideways (J)", how: "250 N sideways at the drive-side dropout; BB, fork end and seat-tube top held" },
        K: { k: one("tbisK", "HTtop", Y, -400), band: [4, 12], label: "Vertical at the bars (K)", how: "2 × 200 N down at the bars, dropouts pinned, fork end on a rail. Frame only here (rigid dummy fork), so it reads far stiffer than the TBIS bands, which include a real fork and bars" },
        L: { k: one("tbisL", "IsoL", Z, 500), band: [50, 90], label: "Head tube, sideways (L)", how: "500 N sideways 250 mm below the head-tube centre; BB and seat-tube top held" },
        M: { k: one("tbisM", "IsoMk", Y, -800), band: [70, 110], label: "BB, vertical on a crank (M)", how: "800 N down 250 mm out from the BB centre; fork end and rear axle held" }
      };
    })();
    const stiffness = {
      tbis,
      bbLateral: 1000 / tests[0].u[dof("BB", Z)],
      headTorsion: 100 / (tests[1].u[dof("HTmid", RX)] * 180 / Math.PI),
      saddleVertical: -tests[2].u[dof("Sit", Y)],
      seatTubeTopVertical: -tests[2].u[dof("STtop", Y)]
    };

    // ================= seated comfort: where the flex comes from
    // Strain energy per tube group under the saddle test: each group's share of the energy is its share of the
    // vertical deflection at the sit bones (Castigliano), so the numbers add up exactly to the total.
    const comfort = (() => {
      const tS = tests[2], uS = tS.u, share = {};
      let Utot = 0;
      model.elements.forEach(e => {
        const ue = new Float64Array(12);
        for (let k = 0; k < 6; k++) { ue[k] = uS[e.n1 * 6 + k]; ue[6 + k] = uS[e.n2 * 6 + k]; }
        let Ue = 0; for (let i = 0; i < 12; i++) { let r = 0; for (let j = 0; j < 12; j++) r += e.kg[i * 12 + j] * ue[j]; Ue += 0.5 * ue[i] * r; }
        const grp = model.members[e.member].group;
        share[grp] = (share[grp] || 0) + Ue; Utot += Ue;
      });
      const d = -uS[dof("Sit", Y)];                       // mm per 1000 N
      const mmPerN = {}; for (const [k, v] of Object.entries(share)) mmPerN[k] = Utot > 0 ? (v / Utot) * d / 1000 : 0;
      const postSec = model.members.find(mm => mm.group === "seatpost").section;
      const post = postSec.post || {};
      const sb = num(g.saddleSetback, 50);
      const headC = 1 / num(post.headK, 600) + (post.kTheta ? sb * sb / post.kTheta : 0);
      const isPost = k => k === "seatpost" || k === "saddle" || k === "postInserted";
      const frameC = Object.entries(mmPerN).filter(([k]) => !isPost(k)).reduce((a, [, v]) => a + v, 0);
      const postC = (mmPerN.seatpost || 0) + (mmPerN.postInserted || 0) + headC;
      const frameAndPost = frameC + postC;
      // Rear tyre, in series: a vertical force at the saddle puts share r on the rear tyre, and the saddle drops r × the tyre squish.
      const xR = P.AxleR[0], xF = P.AxleF[0], xS = P.Sit[0], wb = xF - xR, r = Math.min(1, Math.max(0, (xF - xS) / wb));
      const psi = num(use.rearTirePsi, 0) || (g.tireWidth > 50 ? 22 : 35);
      const kTyre = tyreStiffness(g.tireWidth || 50, psi);
      const kWheel = 1100;                              // spoked wheel, radial (Killa's Garage measurements ≈ 900–1400 N/mm)
      const tyreC = r * r / kTyre + (1 - r) * (1 - r) / tyreStiffness(g.tireWidth || 50, num(use.frontTirePsi, 0) || psi * 0.9)
        + (r * r + (1 - r) * (1 - r)) / kWheel;
      const exposure = model.geo.postExposure;
      const groups = {};
      for (const [k, v] of Object.entries(mmPerN)) if (k !== "saddle" && k !== "postInserted") groups[k] = v;
      groups.seatpost = (mmPerN.seatpost || 0) + (mmPerN.postInserted || 0);
      groups.postHead = headC;
      return {
        k: 1 / frameAndPost, deflPerKN: frameAndPost * 1000, frameC, postC, headC, tyreC, groups,
        frameK: frameC > 0 ? 1 / frameC : Infinity, postK: 1 / postC, tyreK: 1 / tyreC, systemK: 1 / (frameAndPost + tyreC),
        rearShare: r, tyrePsi: psi, exposure, post, setback: num(g.saddleSetback, 50),
        rating: comfortRating(1 / frameAndPost)
      };
    })();

    // ================= everyday riding loads
    const cases = [];
    // Sprint: peak pedal force from power and cadence. Crank torque peaks at about π/2 × its average.
    const watts = num(use.sprintWatts, 2000), rpm = Math.max(20, num(use.sprintCadence, 90));
    const sprintF = Math.PI / 2 * watts / (rpm * 2 * Math.PI / 60) / (g.crankLength / 1000);
    for (const side of [1, -1]) {
      const pr = pedalLoad(side, sprintF, 0);
      const pull = Math.max(0, sprintF - Wr);           // rider pulls up on the bars for anything above body weight
      pr.F[dof("HTtop", Y)] += pull;
      cases.push(mk({ id: side > 0 ? "pedalR" : "pedalL", family: "everyday", name: `${watts} W sprint – ${side > 0 ? "drive-side" : "non-drive"} pedal`, supports: "sprint", F: pr.F, force: sprintF,
        detail: `${watts} W at ${rpm} rpm: ${Math.round(sprintF)} N on the ${side > 0 ? "drive-side" : "non-drive"} pedal, crank forward; chain pull ${Math.round(pr.T)} N; ${Math.round(pull)} N pull on the bars` }));
    }
    { const F = vec(), v = (L.seatedFactor || 2) * Wr; F[dof("Sit", Y)] = -v; cases.push(mk({ id: "seated", family: "everyday", name: "Seated bump", supports: "roll", F, detail: `${Math.round(v)} N straight down at the sit bones` })); }
    { const F = vec(), f = (L.frontBrakeG || 1) * Wt, nr = Wt;       // at 1 g the whole weight is on the front tyre
      F[dof("AxleF", X)] = -f; F[dof("AxleF", Y)] = nr; F[dof("AxleF", RZ)] = -RwF * f;
      cases.push(mk({ id: "frontBrake", family: "everyday", name: "Hard front braking", supports: "brakeFront", F, detail: `${Math.round(f)} N braking + ${Math.round(nr)} N up at the front tyre, rear wheel about to lift` })); }
    // Rear disc brake: caliper force Fc = f·Rw / r on the caliper mount (tangent to the rotor), the rest through the axle
    function rearBrakeLoad(f, Rarm) {
      const F = vec();
      if (id.Cal == null) { F[dof("AxleR", X)] = -f; F[dof("DL", RZ)] = -Rarm * f; return { F, Fc: 0 }; }
      const cp = model.nodes[id.Cal].p, ax = P.AxleR, r = Math.hypot(cp[0] - ax[0], cp[1] - ax[1]), phi = Math.atan2(cp[1] - ax[1], cp[0] - ax[0]);
      const Fc = f * Rarm / r, fx = Fc * Math.sin(phi), fy = -Fc * Math.cos(phi);
      F[dof("Cal", X)] += fx; F[dof("Cal", Y)] += fy;
      F[dof("AxleR", X)] += -f - fx; F[dof("AxleR", Y)] += -fy;
      return { F, Fc };
    }
    { const f = (L.rearBrakeG || 0.5) * Wt, rb = rearBrakeLoad(f, Rw);
      cases.push(mk({ id: "rearBrake", family: "everyday", name: "Hard rear braking", supports: "rider", F: rb.F, detail: `${Math.round(f)} N braking at the rear tyre: ${Math.round(rb.Fc)} N pulls on the ${num(g.rearRotor, 180)} mm rotor's caliper mount (${g.brakeMount === "seatstay" ? "seat stay" : "chainstay"})` })); }

    // ================= abuse events for the riding condition
    const condNo = CONDITIONS[use.condition] ? +use.condition : 4, cond = CONDITIONS[condNo];
    const forkTravel = Math.max(0, num(use.forkTravel, 0)), tire = Math.max(0, num(use.tireSquish, 20)), legs = Math.max(0, num(use.legStroke, 250));
    const stroke = Math.max(20, legs + tire + 0.5 * forkTravel);
    const blankDrop = use.dropHeight == null || use.dropHeight === "";
    const hDrop = blankDrop ? cond.drop : Math.max(0, +use.dropHeight);
    const pedalShare = 0.7;
    const landingTotal = h => 2 * Wr * (h * 1000 + stroke) / stroke;
    const rigidFront = forkTravel < 20 ? 1.4 : 1.0;
    const hard = num(use.aggression, 1);
    const rearPeak = cond.rearPeak * Wr * hard, frontPeak = cond.frontPeak * Wr * rigidFront * hard;

    const uLand = vec(); uLand[dof("BB", Y)] = -pedalShare; uLand[dof("HTtop", Y)] = -(1 - pedalShare);
    const uRear = vec(); uRear[dof("AxleR", Y)] = 1; uRear[dof("AxleR", X)] = -0.35;
    const uFront = vec(); uFront[dof("AxleF", Y)] = 1; uFront[dof("AxleF", X)] = -0.5;
    const landU = mk({ supports: "roll", F: uLand }), rearU = mk({ supports: "rearHit", F: uRear }), frontU = mk({ supports: "rider", F: uFront });
    // Square-edge hits: the force points along the contact normal at the edge, θ = acos(1 − e/R) back from vertical
    const edge = Math.min(0.6 * Rw, num(use.edgeHeight, 0) || cond.edge || 100), thEdge = Math.acos(1 - edge / Rw);
    const edgeF = Math.min(0.6 * RwF, num(use.edgeHeight, 0) || cond.edge || 100), thEdgeF = Math.acos(1 - edgeF / RwF);
    const uFrontEdge = vec(); uFrontEdge[dof("AxleF", Y)] = Math.cos(thEdgeF); uFrontEdge[dof("AxleF", X)] = -Math.sin(thEdgeF);
    const uFrontLand = vec(); uFrontLand[dof("AxleF", Y)] = 1;
    const uRearEdge = vec(); uRearEdge[dof("AxleR", Y)] = Math.cos(thEdge); uRearEdge[dof("AxleR", X)] = -Math.sin(thEdge);
    const frontEdgeU = mk({ supports: "rider", F: uFrontEdge }), frontLandU = mk({ supports: "rider", F: uFrontLand }), rearEdgeU = mk({ supports: "rearHit", F: uRearEdge });
    // Sideways force at the rear contact patch (force at the axle + the moment from the patch R below it)
    const uSide = vec(); uSide[dof("AxleR", Z)] = 1; uSide[dof("AxleR", RX)] = -Rw;
    const sideU = mk({ supports: "sideRear", F: uSide });

    const abuse = [];
    const Fland = hDrop > 0 ? landingTotal(hDrop) : 0;
    if (hDrop > 0) abuse.push(scaleCase(landU, Fland, { id: "huck", family: "abuse", name: `Huck to flat (${(hDrop * 100).toFixed(0)} cm)`, force: Fland,
      detail: `${(hDrop * 100).toFixed(0)} cm flat landing: rider force peaks at ${Math.round(Fland)} N (${(Fland / Wr).toFixed(1)}× body weight), 70% through the pedals; legs, tyres and fork give ${Math.round(stroke)} mm of cushion` }));
    const deg = Math.round(thEdge * 180 / Math.PI);
    abuse.push(scaleCase(rearU, rearPeak, { id: "rearHit", family: "abuse", name: "Rear wheel hard compression", force: rearPeak,
      detail: `Big compression / rock garden: ${Math.round(rearPeak)} N up (${(rearPeak / Wr).toFixed(1)}× body weight) plus 35% of that rearward at the rear axle` }));
    abuse.push(scaleCase(rearEdgeU, rearPeak, { id: "rearEdge", family: "abuse", name: "Rear wheel square edge", force: rearPeak,
      detail: `${Math.round(rearPeak)} N at the rear axle along the contact normal of a ${Math.round(edge)} mm square edge (${deg}° back from vertical)` }));
    abuse.push(scaleCase(frontEdgeU, frontPeak, { id: "frontHit", family: "abuse", name: "Front wheel square edge", force: frontPeak,
      detail: `${Math.round(frontPeak)} N at the front axle along the contact normal of a ${Math.round(edge)} mm square edge (${deg}° back from vertical)${rigidFront > 1 ? ", rigid fork" : ""}. This is the load that bends the fork back into the head tube and down tube.` }));
    abuse.push(scaleCase(frontLandU, frontPeak, { id: "frontLand", family: "abuse", name: "Front wheel landing", force: frontPeak,
      detail: `${Math.round(frontPeak)} N straight up at the front axle (nose-first landing): bends the fork forward` }));
    const sideF = (cond.lateral || 0.5) * Wr * hard;
    abuse.push(scaleCase(sideU, sideF, { id: "sideRear", family: "abuse", name: "Sideways landing (rear)", force: sideF,
      detail: `${Math.round(sideF)} N sideways at the rear tyre's contact patch (${(sideF / Wr).toFixed(2)}× body weight): crossed-up landing, berm or slide. Loads the chainstays and BB sideways.` }));
    // Flat-landing height where the frame first starts to yield (at a joint, using heat-affected strength)
    const hYield = landU.peakU > 0 ? Math.max(0, ((1 / landU.peakU) * stroke / (2 * Wr) - stroke) / 1000) : Infinity;

    // ================= ISO 4210-6 frame tests
    const isoKey = use.isoType || "mountain", iso = ISO[isoKey], sev = +use.isoSeverity || 1;
    const feMode = mat.fatigueMethod === "hotspot-fe";
    const isoTests = [];
    // ---- fatigue sites: every welded joint (hot-spot stress) plus every tube-body section away from welds
    const sites = [];
    for (const js of model.jointSpecs) {
      const mem = model.members.find(mm => mm.label === js.brace); if (!mem) continue;
      const nodeId = id[js.at]; if (nodeId == null) continue;
      const first = model.elements[mem.elements[0]], last = model.elements[mem.elements[mem.elements.length - 1]];
      let ei, end;
      if (first.n1 === nodeId) { ei = mem.elements[0]; end = 1; } else if (last.n2 === nodeId) { ei = mem.elements[mem.elements.length - 1]; end = 2; } else continue;
      const e = model.elements[ei], ex = e.R[0], sec = e.section;
      const site = { kind: "joint", name: js.name, el: ei, end, section: sec, R: e.R, minSCF: num(mat.minSCF, 2.0), KT: num(mat.torsionSCF, 2.0), penalty: 1, fixedSCF: num(mat.dropoutSCF, 2.5) };
      if (js.chord) {
        const c = unit(js.chord.axis);
        let nI = cross(ex, c); if (norm(nI) < 1e-6) nI = e.R[2]; nI = unit(nI);
        site.nIPB = nI; site.nOPB = unit(cross(nI, ex));
        const cosT = Math.abs(ex[0] * c[0] + ex[1] * c[1] + ex[2] * c[2]);
        const theta = Math.acos(Math.min(1, cosT)) * 180 / Math.PI;
        // brace footprint along the chord: sideways width for the BB shell (chord axis sideways), height otherwise
        const lat = Math.abs(c[0] * e.R[2][0] + c[1] * e.R[2][1] + c[2] * e.R[2][2]) > 0.7;
        const d = sec.round ? sec.h : (lat ? sec.w : sec.h), D = js.chord.D, Tc = js.chord.T;
        site.params = { beta: d / D, gamma: D / (2 * Tc), tau: sec.t / Tc, alpha: 2 * js.chord.L / D, theta };
        site.scf = efthymiou(site.params.beta, site.params.gamma, site.params.tau, site.params.alpha, theta, num(mat.chordFixity, 0.7));
        site.inRange = site.scf.inRange;
        site.chord = { D, T: Tc, L: js.chord.L, bb: !!js.bb };
        if (js.bb || !site.inRange) site.penalty = js.bb ? 1.25 : 1.1;     // outside the parametric method: extra margin
        site.scfSource = "textbook";
        const fe = feMode && sec.round ? matchFE([].concat(mat.feSCF || [], FE_LIBRARY, root.FE_SCF_LIBRARY || []), D, Tc, sec.h, sec.t, theta) : null;
        if (fe) {
          const side = s => ({ AS: s.axial, AC: s.axial, IPB: s.ipb, OPB: s.opb });   // measured: worst point around the weld
          site.scf = { inRange: true, chord: side(fe.chord), brace: side(fe.brace) };
          site.inRange = true; site.minSCF = 1; site.fe = fe; site.scfSource = "3D weld model";
          // the BB model has one tube on the shell; the real shell carries several, so keep a little margin there
          site.penalty = js.bb ? 1.1 : 1;
        }
      } else { site.nIPB = e.R[2]; site.nOPB = e.R[1]; site.scf = null; site.inRange = false; }
      sites.push(site);
    }
    const covered = new Set(sites.map(st => st.el + ":" + st.end));
    model.elements.forEach((e, i) => {
      if (!structural[i]) return;
      const label = model.members[e.member].label;
      for (const end of [1, 2]) {
        const isJoint = end === 1 ? e.joint1 : e.joint2;
        if (covered.has(i + ":" + end)) continue;
        const nodeAt = end === 1 ? e.n1 : e.n2;
        const braces = model.jointSpecs.filter(js => id[js.at] === nodeAt).map(js => js.brace.replace(/ \(.*\)/, "").toLowerCase());
        const where = (model.bossNodes || []).includes(nodeAt) ? "at the brake-mount boss weld" : braces.length ? `at the ${[...new Set(braces)].join(" / ")} weld` : "at the weld";
        if (isJoint) sites.push({ kind: "joint", name: `${label.replace(/ \((top|bottom|at stays)\)/, "")} ${where}`, el: i, end, section: e.section, R: e.R, nIPB: e.R[2], nOPB: e.R[1], scf: null, minSCF: 1.5, fixedSCF: num(mat.chordSCF, 1.5), KT: 1.5, penalty: 1, inRange: false, chordSide: true });
        else sites.push({ kind: "body", el: i, end, name: `${label}, tube body${(e.bendSIF || 1) > 1.05 ? " (bend)" : ""}`, sif: e.bendSIF || 1 });
      }
    });
    // Fatigue method. "calibrated" (default): tube-model stress at the weld with a welded-joint S-N curve calibrated
    // so real titanium frames that pass ISO 4210 also pass here. "hotspot": IIW/DNV hot-spot method with Efthymiou
    // stress-concentration factors — textbook, but it ignores the reinforcing effect of a TIG bead on 0.9 mm walls,
    // so it is conservative for bike joints.
    // "hotspot-fe": the same hot-spot method, with stress factors from 3D solid weld models where they have been run
    // (textbook factors elsewhere), and its own S-N level (hotSpotFATfe), calibrated against the gravel frame.
    const hotspotMode = mat.fatigueMethod === "hotspot" || feMode;
    const nominalAt = (site, el) => site.end === 1 ? el[site.el].vm1 : el[site.el].vm2;
    // tube-body sites in a bend: only the bending part of the stress is raised
    const bentStress = (site, r) => { const b = site.end === 1 ? r.sb1 : r.sb2; if (b == null) return (site.end === 1 ? r.vm1 : r.vm2) * site.sif; return Math.sqrt((r.sa + site.sif * b) ** 2 + 3 * (r.tau || 0) ** 2); };
    // In the 3D-weld method only joints with measured factors use hot-spot stress (and the frame-calibrated FAT);
    // every other weld keeps the default calibrated method, so unmeasured joints are neither harsher nor easier.
    const useHS = site => site.kind === "joint" && hotspotMode && (!feMode || !!site.fe);
    const siteStress = (site, el) => useHS(site) ? hotSpot(site, el[site.el]) : (site.sif || 1) > 1 ? bentStress(site, el[site.el]) : nominalAt(site, el);
    const stressesOf = el => sites.map(st => siteStress(st, el));
    // S-N: welds on hot-spot stress RANGE (mean curve, as-welded so no mean-stress credit); tube body on
    // nominal amplitude with Goodman mean-stress correction.
    const hsLife = range => { const F = feMode ? num(mat.hotSpotFATfe, 794) : num(mat.hotSpotFAT, 116); if (!(range > 0)) return Infinity; const knee = F * Math.pow(5, -1 / 3); return range >= knee ? 2e6 * (F / range) ** 3 : 1e7 * (knee / range) ** 5; };
    const bodyLife = (amp, mean) => { if (!(amp > 0)) return Infinity; const Seq = amp / Math.max(0.05, 1 - Math.max(0, mean) / mat.uts); if (Seq >= mat.uts) return 1; return 1e7 * (num(mat.bodyFatigue, 280) / Seq) ** 10; };
    // life of each site for a two-state cycle A↔B (given the amplitude and mean states' element results)
    const jointLife = (st, amp, mean) => useHS(st) ? hsLife(2 * amp) : snLife(amp, mean, mat);
    const siteLives = (ampEl, meanEl) => sites.map(st => st.kind === "joint" ? jointLife(st, siteStress(st, ampEl), siteStress(st, meanEl)) : bodyLife(siteStress(st, ampEl), siteStress(st, meanEl)));
    const worstSite = lives => { let life = Infinity, at = -1; lives.forEach((L, i) => { if (L < life) { life = L; at = i; } }); return { life, at }; };
    // Load factor λ that brings the weakest site's life down to exactly the required cycles
    // (amplitude and mean both scale with λ; found by bisection, so Goodman and curve knees are honoured).
    const fatigueResult = (c, ampEl, meanEl, required) => {
      const sA = stressesOf(ampEl), sM = stressesOf(meanEl);
      const livesAt = lam => sites.map((st, i) => st.kind === "joint" ? jointLife(st, lam * sA[i], lam * sM[i]) : bodyLife(lam * sA[i], lam * sM[i]));
      const lives = livesAt(1), w = worstSite(lives), st = sites[w.at];
      const minLife = lam => Math.min(...livesAt(lam));
      let lo = 0.01, hi = 100, margin;
      if (minLife(hi) >= required) margin = Infinity;
      else if (minLife(lo) < required) margin = 0;
      else { for (let it = 0; it < 60; it++) { const mid = Math.sqrt(lo * hi); if (minLife(mid) >= required) lo = mid; else hi = mid; } margin = lo; }
      // the site that actually limits the margin (a slope-10 tube body can overtake a slope-3 weld as the load rises)
      const lim = isFinite(margin) && margin > 0 ? worstSite(livesAt(margin * 1.0001)) : w;
      const ls = sites[lim.at] || st;
      return Object.assign(c, { kind: "fatigue", required, life: lives[lim.at] != null ? lives[lim.at] : w.life, minLife: w.life, site: ls, critEl: ls ? ls.el : -1, pass: w.life >= required, margin, method: feMode ? "hotspot-fe" : hotspotMode ? "hotspot" : "calibrated" });
    };
    // When the lab tests will be re-run with a longer approved fork, skip them here (their results would be discarded)
    const willRerun = !use._isoOnly && isoKey === "mountain" && Math.max(0, num(use.forkTravel, 0)) >= 20 && num(use.isoForkTravel, 0) > Math.max(0, num(use.forkTravel, 0));
    if (!willRerun) {
    {
      const Fp = iso.pedal * sev;
      const R = pedalLoad(+1, Fp, 45, 7.5, 150), Lf = pedalLoad(-1, Fp, 45, 7.5, 150);
      const uR = solve("isoPedal", R.F), uL = solve("isoPedal", Lf.F);
      const ampE = elRes(lin(uR, 0.5, uL, -0.5)), meanE = elRes(lin(uR, 0.5, uL, 0.5));
      const c = mk({ id: "isoPedal", family: "iso", name: "ISO pedalling fatigue", supports: "isoPedal", F: R.F, load: `${Math.round(Fp)} N each pedal, alternating`,
        detail: `${Math.round(Fp)} N pushed alternately on each pedal (cranks 45° down, 150 mm out, 7.5° tilt), ${iso.pedalCycles.toLocaleString()} cycles. Shown: right foot down` });
      isoTests.push(fatigueResult(c, ampE, meanE, iso.pedalCycles));
    }
    {
      const F2 = iso.fwd * sev, F3 = iso.back * sev;
      const Fa = vec(); Fa[dof("AxleF", X)] = F2; const Fb = vec(); Fb[dof("AxleF", X)] = -F3;
      const ua = solve("roll", Fa), ub = solve("roll", Fb);
      const ampE = elRes(lin(ua, 0.5, ub, -0.5)), meanE = elRes(lin(ua, 0.5, ub, 0.5));
      const c = mk({ id: "isoHoriz", family: "iso", name: "ISO horizontal fatigue", supports: "roll", F: Fb, load: `+${Math.round(F2)} / −${Math.round(F3)} N at the fork`,
        detail: `Fork dropouts pushed ${Math.round(F2)} N forward and ${Math.round(F3)} N back, ${iso.horizCycles.toLocaleString()} cycles. Shown: push back` });
      isoTests.push(fatigueResult(c, ampE, meanE, iso.horizCycles));
    }
    {
      const F4 = iso.vert * sev;
      const Fv = vec(); Fv[dof("IsoSeat", Y)] = -F4;
      const uv = solve("roll", Fv), half = elRes(lin(uv, 0.5, uv, 0));
      const c = mk({ id: "isoVert", family: "iso", name: "ISO vertical fatigue", supports: "roll", F: Fv, load: `0 → ${Math.round(F4)} N on the seat`,
        detail: `0 to ${Math.round(F4)} N down on a dummy seatpost 250 mm tall with a 70 mm rearward arm, ${iso.vertCycles.toLocaleString()} cycles` });
      isoTests.push(fatigueResult(c, half, half, iso.vertCycles));
    }
    // ISO 4210-6:2023 §4.6 rear brake-mount fatigue: a torque arm at 368 mm (29") pushed 500 N rearward / 200 N forward
    // (TBIS 4210-6:2026 values; the forward force is uncertain in the free text), 2 000 cycles at 100 °C + 20 000 at room temperature.
    if (id.Cal != null) {
      const arm = 368, a = rearBrakeLoad(500 * sev, arm), b = rearBrakeLoad(-200 * sev, arm);
      const ua = solve("bbFix", a.F), ub = solve("bbFix", b.F);
      const ampE = elRes(lin(ua, 0.5, ub, -0.5)), meanE = elRes(lin(ua, 0.5, ub, 0.5));
      const c = mk({ id: "isoBrake", family: "iso", name: "ISO rear brake-mount fatigue", supports: "bbFix", F: a.F, load: `+${Math.round(500 * sev)} / −${Math.round(200 * sev)} N on a 368 mm arm`,
        detail: `New in ISO 4210-6:2023: a torque arm on the rear hub, 368 mm long, pushed ${Math.round(500 * sev)} N back and ${Math.round(200 * sev)} N forward; ${Math.round(a.Fc)} N peak on the caliper mount; 22 000 cycles (2 000 of them at 100 °C). Frame held at the BB` });
      isoTests.push(fatigueResult(c, ampE, meanE, 22000));
    }
    // Impact tests: step-by-step plastic-hinge push-over. The striker energy is absorbed by pushing the frame
    // along the test load. When an element end reaches its full bending capacity (AISC F8 moment capacity for
    // round tubes, which caps thin non-compact tubes by local buckling; 1.27 × first yield for ovals/plates;
    // interaction with axial force; heat-affected yield at welds, +10% for impact strain rate) it becomes a
    // hinge that keeps its moment with 2% hardening, and the load redistributes to the rest of the frame.
    // Permanent set = peak displacement minus the elastic spring-back, reported as wheelbase shortening.
    const RATE = num(mat.impactRateFactor, 1.1);
    function hingeLocalK(kl, ends, HARD) {
      const k = Float64Array.from(kl), rel = [];
      if (ends & 1) rel.push(4, 5); if (ends & 2) rel.push(10, 11);
      for (const r of rel) {
        const d = k[r * 12 + r]; if (!(d > 0)) continue;
        const col = []; for (let i = 0; i < 12; i++) col.push(k[i * 12 + r]);
        for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) k[i * 12 + j] -= col[i] * col[j] / d;
      }
      for (let i = 0; i < 144; i++) k[i] = HARD * kl[i] + (1 - HARD) * k[i];
      return k;
    }
    const toGlobal = (e, k) => {
      const kT = new Float64Array(144), kg = new Float64Array(144);
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { let s2 = 0; for (let m2 = 0; m2 < 12; m2++) s2 += k[i * 12 + m2] * e.T[m2 * 12 + j]; kT[i * 12 + j] = s2; }
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { let s2 = 0; for (let m2 = 0; m2 < 12; m2++) s2 += e.T[m2 * 12 + i] * kT[m2 * 12 + j]; kg[i * 12 + j] = s2; }
      return kg;
    };
    const localForces = (e, k, u) => {
      const ue = new Float64Array(12), ul = new Float64Array(12), f = new Float64Array(12);
      for (let i = 0; i < 6; i++) { ue[i] = u[e.n1 * 6 + i]; ue[6 + i] = u[e.n2 * 6 + i]; }
      for (let i = 0; i < 12; i++) { let s2 = 0; for (let j = 0; j < 12; j++) s2 += e.T[i * 12 + j] * ue[j]; ul[i] = s2; }
      for (let i = 0; i < 12; i++) { let s2 = 0; for (let j = 0; j < 12; j++) s2 += k[i * 12 + j] * ul[j]; f[i] = s2; }
      return f;
    };
    // how close an element end is to forming a hinge (1 = hinge)
    // hinge ratio at element end for forces fa + x·fb (no allocation; capacities cached per element end)
    function hingeRatioAt(e, fa, fb, x, end) {
      const s = e.section, key = end === 1 ? "_hc1" : "_hc2";
      if (e[key] == null) { const fy = ((end === 1 ? e.joint1 : e.joint2) ? (mat.jointYield || mat.yield) : mat.yield) * RATE; e[key] = s.round ? { fy, mc: momentCapacity(s, fy) } : { fy }; }
      const c = e[key], N = Math.abs(fa[6] + x * fb[6]), iy = end === 1 ? 4 : 10, iz = end === 1 ? 5 : 11;
      const My = fa[iy] + x * fb[iy], Mz = fa[iz] + x * fb[iz];
      if (s.round) return N / (s.A * c.fy) + Math.hypot(My, Mz) / c.mc;
      return (N / s.A + Math.abs(Mz) * (s.cy || s.h / 2) / s.Iz + Math.abs(My) * (s.cz || s.w / 2) / s.Iy) / (1.27 * c.fy);
    }
    function pushover(supports, Funit, energy, u1, c1, HARD) {
      const fixed = []; for (const [nm, ds] of SUP[supports].fix) for (const d of ds) fixed.push(dof(nm, d));
      const hinged = new Map();            // element -> bitmask of hinged ends
      const fAcc = model.elements.map(() => new Float64Array(12)), uAcc = vec();
      let lam = 0, del = 0, area = 0, collapsed = false, lastU = u1, lastC = c1, steps = 0;
      const events = [];
      while (steps++ < 200) {
        const over = new Map(), kLoc = new Map();
        for (const [ei, ends] of hinged) { const e = model.elements[ei], k = hingeLocalK(e.kl, ends, HARD); kLoc.set(ei, k); over.set(e, toGlobal(e, k)); }
        let uI;
        try { uI = over.size ? makeSolverRaw(assemble(model, over), fixed)(Funit) : u1; } catch (err) { collapsed = true; break; }
        const cI = dotFU(Funit, uI);
        if (!(cI > 0) || cI > 40 * c1) { collapsed = true; if (cI > 0) { lastU = uI; lastC = cI; } break; }
        lastU = uI; lastC = cI;
        const fI = model.elements.map((e, i) => localForces(e, kLoc.get(i) || e.kl, uI));
        // smallest load step that forms the next hinge
        let dMin = Infinity, next = null;
        model.elements.forEach((e, i) => {
          if (!structural[i] || e.section.rigid) return;
          for (const end of [1, 2]) {
            if ((hinged.get(i) || 0) & end) continue;
            const r = x => hingeRatioAt(e, fAcc[i], fI[i], x, end);
            if (r(0) >= 1) { dMin = 0; next = [i, end]; return; }
            let hi = 1; while (r(hi) < 1 && hi < 1e8) hi *= 2;
            if (hi >= 1e8) continue;
            if (hi > dMin) { if (r(dMin) < 1) continue; hi = dMin; }
            let lo = 0; for (let it = 0; it < 30 && hi - lo > 1e-7 * hi; it++) { const mid = (lo + hi) / 2; if (r(mid) >= 1) hi = mid; else lo = mid; }
            if (hi < dMin) { dMin = hi; next = [i, end]; }
          }
        });
        const need = energy - area;
        const xFull = -lam + Math.sqrt(lam * lam + 2 * need / cI);     // step that would absorb the rest
        const x = Math.min(dMin, xFull);
        for (let k = 0; k < uAcc.length; k++) uAcc[k] += x * uI[k];
        fAcc.forEach((f, i) => { for (let k = 0; k < 12; k++) f[k] += x * fI[i][k]; });
        area += (lam + x / 2) * x * cI; del += x * cI; lam += x;
        if (xFull <= dMin) break;                                       // energy absorbed before the next hinge
        if (next) { hinged.set(next[0], (hinged.get(next[0]) || 0) | next[1]); events.push({ el: next[0], end: next[1], load: lam }); }
      }
      if (area < energy * 0.999) collapsed = true;
      if (collapsed && area < energy) {                                 // mechanism: it keeps bending at the collapse load
        const extra = (energy - area) / Math.max(lam, 1e-9);
        for (let k = 0; k < uAcc.length; k++) uAcc[k] += extra / lastC * uI_safe(lastU)[k];
        del += extra; area = energy;
      }
      const uPerm = lin(uAcc, 1, u1, -lam);
      return { peakLoad: lam, peakDisp: del, uPerm, hinges: events, collapsed };
    }
    const uI_safe = u => u;
    function impact(o, Funit, energyJ, limitMM, wheelbaseChange) {
      const u1 = solve(o.supports, Funit), el1 = elRes(u1);
      const w1 = maxStructural(el1), c1 = dotFU(Funit, u1);
      const E = energyJ * 1000 * sev;
      const lamY = 1 / w1.u, Ey = 0.5 * lamY * lamY * c1;
      // Hinge behaviour bounds: perfectly plastic (cold-worked Ti barely hardens: governs pass/fail) and 2% hardening
      const po = pushover(o.supports, Funit, E, u1, c1, 0.001);
      const poH = pushover(o.supports, Funit, E, u1, c1, 0.02);
      const set = Math.max(0, Math.abs(wheelbaseChange(po.uPerm)));
      const setLow = Math.max(0, Math.abs(wheelbaseChange(poH.uPerm)));
      const shown = Math.min(Math.sqrt(2 * E / c1), lamY);
      const c = finish(Object.assign({ F: lin(Funit, shown, Funit, 0), u: lin(u1, shown, u1, 0), el: el1.map(r => ({ ...r, axial: r.axial * shown, torque: r.torque * shown, tau: r.tau != null ? r.tau * shown : r.tau, sa: r.sa != null ? r.sa * shown : r.sa, sb1: r.sb1 != null ? r.sb1 * shown : r.sb1, sb2: r.sb2 != null ? r.sb2 * shown : r.sb2, vm1: r.vm1 * shown, vm2: r.vm2 * shown, vm: r.vm * shown, sig: r.sig * shown, u1: r.u1 * shown, u2: r.u2 * shown, u: r.u * shown, f: r.f ? r.f.map(v => v * shown) : r.f })) }, o));
      const hingeNames = [...new Set(po.hinges.map(h => { const e = model.elements[h.el]; return model.members[e.member].label + ((h.end === 1 ? e.joint1 : e.joint2) ? " (at the weld)" : ""); }))];
      const kinks = po.hinges.filter(h => { const sct = model.elements[h.el].section; return sct.round && (sct.h / sct.t) * mat.yield / sct.E > 0.07; }).length;
      return Object.assign(c, { kind: "impact", energy: E / 1000, yieldEnergy: Ey / 1000, permanentSet: set, permanentSetLow: Math.min(set, setLow), limit: limitMM, pass: set <= limitMM, borderline: set > limitMM && setLow <= limitMM, critEl: w1.uAt,
        margin: Ey >= E ? Math.sqrt(Ey / E) : null, peakLoad: po.peakLoad, firstYieldLoad: lamY, hinges: hingeNames, collapsed: po.collapsed, kinkRisk: kinks > 0 });
    }
    const wbChange = u => (u[dof("AxleF", X)] - u[dof("AxleR", X)]);
    {
      const Fm = vec(); Fm[dof("AxleF", X)] = -1;
      const E = 22.5 * 9.81 * iso.massDrop / 1000;
      isoTests.push(impact({ id: "isoMass", family: "iso", name: "ISO falling-mass impact", supports: "clamp", load: `22.5 kg dropped ${iso.massDrop} mm`,
        detail: `22.5 kg striker dropped ${iso.massDrop} mm onto the fork dummy (${(E * sev).toFixed(0)} J), rear clamped. Pass: no cracks, wheelbase shortened ≤ ${iso.massSet} mm` }, Fm, E, iso.massSet, wbChange));
    }
    {
      const xF = P.AxleF[0] - P.AxleR[0];
      const pts = [["IsoM1", iso.m1], ["HTtop", iso.m2], ["BB", iso.m3]];
      const Ff = vec(); let E = 0;
      for (const [nm, mkg] of pts) { const r = (P[nm][0] - P.AxleR[0]) / xF; Ff[dof(nm, Y)] = -mkg * r; E += mkg * 9.81 * iso.frameDrop * r / 1000; }
      isoTests.push(impact({ id: "isoFrame", family: "iso", name: "ISO falling-frame impact", supports: "roll", load: `${iso.m1}+${iso.m2}+${iso.m3} kg dropped ${iso.frameDrop} mm`,
        detail: `Frame with ${iso.m1} kg on the seatpost, ${iso.m2} kg at the head tube and ${iso.m3} kg at the BB dropped ${iso.frameDrop} mm onto the fork (${(E * sev).toFixed(0)} J). Pass: no cracks, ≤ ${iso.frameSet} mm set` }, Ff, E, iso.frameSet, wbChange));
    }
    }

    if (use._isoOnly) return { isoTests };                 // longest-fork re-run only needs the lab tests
    // ================= beyond ISO: EFBe-style brand tests (numbers from EFBe's published Cat-5 test set via Pole;
    // brands test enduro/trail hardtails to levels like these). Fatigue tests use the same weld S-N curve; static
    // tests pass if no part of the frame yields (tube model, heat-affected strength at welds).
    const brandTests = [];
    if (isoKey === "mountain") {
    {
      const fa = vec(); fa[dof("AxleR", Z)] = 400; const fb = vec(); fb[dof("AxleR", Z)] = -400;
      const ua = solve("efbeSide", fa), ub = solve("efbeSide", fb);
      const c = mk({ id: "brandSide", family: "brand", name: "Rear axle sideways fatigue", supports: "efbeSide", F: fa, load: "±400 N sideways at the rear axle",
        detail: "Rear axle pushed 400 N each way sideways, 100 000 cycles (EFBe Cat-5 level). Works the chainstays, yoke, bridge and dropout welds. BB, head tube and seat-tube top held" });
      brandTests.push(fatigueResult(c, elRes(lin(ua, 0.5, ub, -0.5)), elRes(lin(ua, 0.5, ub, 0.5)), 100000));
    }
    {
      const f = vec(); f[dof("AxleR", Y)] = 2100; const u0 = solve("rearHit", f), half = elRes(lin(u0, 0.5, u0, 0));
      const c = mk({ id: "brandRearV", family: "brand", name: "Rear axle vertical fatigue", supports: "rearHit", F: f, load: "0 → 2100 N up at the rear axle",
        detail: "Rear axle pushed up 0 → 2100 N, 100 000 cycles (EFBe Cat-5 level): repeated rear-wheel impacts. Rider holds the BB, front tyre on the ground" });
      brandTests.push(fatigueResult(c, half, half, 100000));
    }
    {
      const fa = vec(); fa[dof("AxleF", X)] = 600; const fb = vec(); fb[dof("AxleF", X)] = -1200;
      const ua = solve("roll", fa), ub = solve("roll", fb);
      const c = mk({ id: "brandHead", family: "brand", name: "Head tube fatigue (fork push-pull)", supports: "roll", F: fb, load: "+600 / −1200 N at the fork end",
        detail: "Fork dropouts pushed 600 N forward and 1200 N back, 100 000 cycles (EFBe Cat-5 level; ISO uses 1200/600 for 50 000). Shown: push back" });
      brandTests.push(fatigueResult(c, elRes(lin(ua, 0.5, ub, -0.5)), elRes(lin(ua, 0.5, ub, 0.5)), 100000));
    }
    }
    const staticTest = (c, limitNote) => { const w = maxStructural(c.el); return Object.assign(c, { kind: "static", u: w.u, critEl: w.uAt, pass: w.u < 1, margin: w.u > 0 ? 1 / w.u : Infinity, note: limitNote }); };
    if (isoKey === "mountain") {
      const pr = pedalLoad(+1, 2500, 45, 26, 150);
      brandTests.push(staticTest(mk({ id: "brandPedal", family: "brand", name: "Static pedal overload", supports: "isoPedal", F: pr.F, load: "2500 N on one pedal, 26° tilt",
        detail: `2500 N held for 10 s on the drive-side pedal, tilted 26° (EFBe Cat-5). Chain pull ${Math.round(pr.T)} N through the drive-side dropout${g.singlespeed ? " / slider" : ""}` })));
    }
    if (isoKey === "mountain") {
      const f = 6000, F = lin(uLand, f, uLand, 0);
      brandTests.push(staticTest(mk({ id: "brandDrop", family: "brand", name: "Static drop overload", supports: "roll", F, load: "6000 N, 70% pedals / 30% bars",
        detail: "6000 N held for 10 s, split between the BB (pedals) and the bars like a flat landing (EFBe Cat-5 static drop)" })));
    }

    // ================= riding fatigue life (Miner's rule, per hour in the chosen condition)
    // Chatter: 7200 small cycles an hour, sizes Rayleigh-distributed with the measured SD, fully reversed.
    // Hits: 0→peak→0 pulses; exceedance falls exponentially from 1000 an hour at zero size to once every
    // `peakEveryH` hours at the abuse-event peak size (and keeps falling beyond it).
    const ns = sites.length;
    const unitHS = uc => stressesOf(uc.el);          // site stress per newton of the unit case
    function chatterDamage(uc, sdN) {                // fully reversed, Rayleigh amplitudes
      const dmg = new Float64Array(ns), sU = unitHS(uc), bins = 30, maxK = 5;
      for (let b = 0; b < bins; b++) {
        const r0 = b / bins * maxK, r1 = (b + 1) / bins * maxK, a = (r0 + r1) / 2 * sdN;
        const p = Math.exp(-r0 * r0 / 2) - Math.exp(-r1 * r1 / 2);
        sites.forEach((st, i) => { const L = st.kind === "joint" ? jointLife(st, a * sU[i], 0) : bodyLife(a * sU[i], 0); dmg[i] += 7200 * p / L; });
      }
      return dmg;
    }
    function pulseDamage(uc, sizes) {                // 0 → peak → 0 pulses: [{size N, count per hour}]
      const dmg = new Float64Array(ns), sU = unitHS(uc);
      for (const { size, count } of sizes) sites.forEach((st, i) => { const sp = size * sU[i]; const L = st.kind === "joint" ? jointLife(st, sp / 2, sp / 2) : bodyLife(sp / 2, sp / 2); dmg[i] += count / L; });
      return dmg;
    }
    const hitSizes = (peakN, everyH) => {             // exponential exceedance: 1000/h at zero, 1/everyH at the peak
      const N0 = 1000, mu = peakN / Math.log(N0 * everyH), bins = 60, top = 1.6 * peakN, out = [];
      for (let b = 0; b < bins; b++) { const a0 = b / bins * top, a1 = (b + 1) / bins * top; out.push({ size: (a0 + a1) / 2, count: N0 * (Math.exp(-a0 / mu) - Math.exp(-a1 / mu)) }); }
      return out;
    };
    const dRear = chatterDamage(rearU, cond.rearSD * Wr * hard), dFront = chatterDamage(frontU, cond.frontSD * Wr * rigidFront * hard);
    const hRear = pulseDamage(rearU, hitSizes(rearPeak, cond.peakEveryH)), hFront = pulseDamage(frontEdgeU, hitSizes(frontPeak, cond.peakEveryH));
    const dPedal = new Float64Array(ns);
    {
      const aw = Math.max(0, num(use.avgWatts, 200)), ac = Math.max(20, num(use.avgCadence, 80));
      const Fp = Math.PI / 2 * aw / (ac * 2 * Math.PI / 60) / (g.crankLength / 1000);
      const R = pedalLoad(+1, Fp, 0), Lf = pedalLoad(-1, Fp, 0);
      const uR = solve("sprint", R.F), uL = solve("sprint", Lf.F);
      const lives = siteLives(elRes(lin(uR, 0.5, uL, -0.5)), elRes(lin(uR, 0.5, uL, 0.5)));
      // Standing climbs: full body weight on each down-stroke plus a pull on the bars, at a slow cadence
      const share = Math.min(1, Math.max(0, num(use.standingShare, g.singlespeed ? 0.25 : 0.1)));
      const sc = Math.max(20, num(use.standingCadence, 60)), Fs = num(use.standingForce, 1.0) * Wr;
      let livesS = null;
      if (share > 0) {
        const Rs = pedalLoad(+1, Fs, 0), Ls = pedalLoad(-1, Fs, 0);
        Rs.F[dof("HTtop", Y)] += 0.3 * Wr; Ls.F[dof("HTtop", Y)] += 0.3 * Wr;
        const uRs = solve("sprint", Rs.F), uLs = solve("sprint", Ls.F);
        livesS = siteLives(elRes(lin(uRs, 0.5, uLs, -0.5)), elRes(lin(uRs, 0.5, uLs, 0.5)));
      }
      lives.forEach((L, i) => dPedal[i] = (1 - share) * ac * 60 / L + (livesS ? share * sc * 60 / livesS[i] : 0));
    }
    const dDrops = cond.drop > 0 && cond.dropsPerHour > 0 ? pulseDamage(landU, [{ size: landingTotal(cond.drop * 0.6 * hard), count: cond.dropsPerHour * hard }]) : new Float64Array(ns);
    const total = new Float64Array(ns); let worstD = 0, worstS = -1;
    for (let i = 0; i < ns; i++) { total[i] = dRear[i] + dFront[i] + hRear[i] + hFront[i] + dPedal[i] + dDrops[i]; if (total[i] > worstD) { worstD = total[i]; worstS = i; } }
    const lifeHours = worstD > 0 ? 1 / worstD : Infinity;
    const hpw = Math.max(0, num(use.hoursPerWeek, 5));
    const w = worstS;
    const fatigue = {
      conditionNo: condNo, condition: cond, lifeHours, lifeYears: hpw > 0 ? lifeHours / (hpw * 52) : Infinity,
      // the weld S-N curve is a mean curve; a design curve (stress ÷ 1.5 → life ÷ 3.4 on slope 3) gives the cautious figure
      lifeYearsLow: hpw > 0 ? lifeHours / (hpw * 52) / 3.4 : Infinity, site: sites[w], critEl: w >= 0 ? sites[w].el : -1,
      siteLives: sites.map((st, i) => ({ name: st.name, kind: st.kind, hours: total[i] > 0 ? 1 / total[i] : Infinity, el: st.el })),
      shares: w >= 0 ? { "rock hits, rear": hRear[w] / worstD, "rock hits, front": hFront[w] / worstD, "chatter, rear": dRear[w] / worstD, "chatter, front": dFront[w] / worstD, "pedalling": dPedal[w] / worstD, "drops": dDrops[w] / worstD } : {}
    };

    // ================= summaries
    const groups = ["topTube", "downTube", "seatTube", "headTube", "chainstay", "seatStay", "bbShell", "dropout"];
    const summarize = c => {
      c.byGroup = {}; c.utilByGroup = {}; c.sigByGroup = {};
      for (const gname of groups) { c.byGroup[gname] = 0; c.utilByGroup[gname] = 0; c.sigByGroup[gname] = 0; }
      model.members.forEach(mem => { if (!mem.structural) return; for (const ei of mem.elements) { const r = c.el[ei]; c.byGroup[mem.group] = Math.max(c.byGroup[mem.group], r.vm); c.utilByGroup[mem.group] = Math.max(c.utilByGroup[mem.group], r.u); c.sigByGroup[mem.group] = Math.max(c.sigByGroup[mem.group], r.sig); } });
      c.peakGroup = Object.keys(c.utilByGroup).reduce((a, b) => c.utilByGroup[a] >= c.utilByGroup[b] ? a : b);
    };
    const allLoads = cases.concat(abuse);
    for (const c of allLoads.concat(isoTests, tests, brandTests)) summarize(c);
    // ISO 4210-6: the dummy fork must be as long as the LONGEST fork the frame is approved for. If that's longer
    // than the fork fitted here, the lab tests are re-run on a copy with the longer fork (≈ 1 mm of axle-to-crown
    // per mm of extra travel on 29" forks).
    let isoFork = { travel: forkTravel, a2c: g.forkA2C };
    const maxTravel = num(use.isoForkTravel, 0);
    if (!use._isoOnly && isoKey === "mountain" && forkTravel >= 20 && maxTravel > forkTravel) {
      const cp = JSON.parse(JSON.stringify(design));
      cp.geometry.forkA2C = g.forkA2C + (maxTravel - forkTravel);
      cp.use._isoOnly = true;
      const sub = analyze(cp);
      isoTests.length = 0; sub.isoTests.forEach(c => { summarize(c); isoTests.push(c); });
      isoFork = { travel: maxTravel, a2c: cp.geometry.forkA2C };
    }
    // Joint severity table (hot-spot stress under the worst everyday/abuse load, Efthymiou SCFs)
    const jointTable = sites.filter(st => st.kind === "joint" && !st.chordSide).map(st => {
      let worst = 0, nomW = 0, by = null;
      for (const c of allLoads) { const hs = hotSpot(st, c.el[st.el]), nm = nominalAt(st, c.el); if (hs > worst) { worst = hs; nomW = nm; by = c.name; } }
      const scfMax = st.scf ? Math.max(st.minSCF, ...Object.values(st.scf.chord), ...Object.values(st.scf.brace)) : st.fixedSCF;
      const cluster = model.jointSpecs.filter(js => js.chord && id[js.at] === model.elements[st.el][st.end === 1 ? "n1" : "n2"]).length > 1 ||
        (/seat tube/.test(st.name) && /Top tube|Seat stay/.test(st.name) && g.ssBelowTt < ((design.tubes.topTube.od || design.tubes.topTube.h) + design.tubes.seatStay.od) / 2);
      return { name: st.name, cluster, params: st.params || null, inRange: st.inRange, parametric: !!st.scf, scfMax: scfMax * st.penalty, hotSpot: worst, nominal: nomW, by, source: st.scfSource || null, chord: st.chord || null, section: st.section };
    });
    const envelope = model.elements.map((e, i) => {
      let best = { vm1: 0, vm2: 0, vm: 0, sig: 0, u1: 0, u2: 0, u: 0, caseId: null };
      for (const c of allLoads) { const r = c.el[i]; if (r.u > best.u) best = { ...r, caseId: c.id }; }
      return best;
    });
    const groupWorst = {};
    for (const gname of groups) { let wv = { vm: 0, u: 0, caseId: null }; for (const c of allLoads) if (c.utilByGroup[gname] > wv.u) wv = { vm: c.byGroup[gname], u: c.utilByGroup[gname], caseId: c.id }; groupWorst[gname] = wv; }

    let massG = 0; const massByGroup = {};
    for (const e of model.elements) {
      const mem = model.members[e.member]; if (!mem.structural) continue;
      const gm = e.L * e.section.A * mat.density / 1000; massG += gm; massByGroup[mem.group] = (massByGroup[mem.group] || 0) + gm;
    }
    const where = (i, r) => {
      if (!(i >= 0)) return "—";
      const e = model.elements[i], j = r ? (r.u1 >= r.u2 ? e.joint1 : e.joint2) : (e.joint1 || e.joint2);
      return model.members[e.member].label + (j ? " (at the weld)" : "");
    };

    return {
      supportDefs: SUP, sites, jointTable, fatigueMethod: feMode ? "hotspot-fe" : hotspotMode ? "hotspot" : "calibrated", model, stiffness, comfort, isoFork, brandTests, tests, cases, abuse, isoTests, isoKey, iso, sev, fatigue, hYield, hDrop, stroke, sprintF, envelope, groupWorst, massG, massByGroup, f8Warn: [...F8_WARN], where,
      info: model.geo.info,
      supportSets: Object.fromEntries(Object.entries(SUP).map(([k, v]) => [k, v.fix.map(f => f[0])])),
      supportLabels: Object.fromEntries(Object.entries(SUP).map(([k, v]) => [k, v.label])),
      ms: now() - t0
    };
  }

  // Seatpost insertion the frame needs: past the lower of the top-tube and seat-stay welds plus 25 mm, and at least 90 mm
  function postInsertion(design) {
    const g = design.geometry, t = design.tubes;
    const lowestJoint = g.ttAtSeatTube - Math.max(0, g.ssBelowTt || 0);
    const below = Math.max(t.topTube.od || t.topTube.h || 0, t.seatStay.od) / 2;
    const required = Math.max(90, g.seatTube - lowestJoint + below + 25);
    const exposure = buildGeometry(g).postExposure;
    const postLength = num(g.seatpostLength, 400);
    return { required, available: postLength - exposure, exposure, postLength, ok: postLength - exposure >= required };
  }

  // Does the seatpost fit the seat tube bore (reamed to size, or a standard shim)?
  function postFit(design) {
    const t = design.tubes, pre = seatpostPreset(t.seatpost);
    const fit = pre.key === "custom" ? t.seatpost.od : pre.fit, bore = t.seatTube.od - 2 * t.seatTube.wall;
    const SHIMS = { 27.2: [30.0, 30.9, 31.6], 30.9: [31.6], 31.6: [] };
    const direct = bore - fit >= -0.05 && bore - fit <= 0.4;
    const shim = (SHIMS[fit] || []).find(b => Math.abs(bore - b) <= 0.3);
    return { bore, fit, ok: direct || shim != null, shim: !direct && shim != null ? shim : null };
  }

  // Compact numbers for the comfort explorer / optimiser
  function summary(design, res) {
    const r = res || analyze(design);
    const worstU = list => list.reduce((a, c) => Math.max(a, c.peakU || 0), 0);
    const fat = r.isoTests.filter(c => c.kind === "fatigue"), imp = r.isoTests.filter(c => c.kind === "impact");
    const ins = postInsertion(design);
    return {
      comfortK: r.comfort.k, systemK: r.comfort.systemK, frameK: r.comfort.frameK, deflPerKN: r.comfort.deflPerKN, rating: r.comfort.rating,
      groups: r.comfort.groups, bbLateral: r.stiffness.bbLateral, headTorsion: r.stiffness.headTorsion, massG: r.massG,
      everydayU: worstU(r.cases), abuseU: worstU(r.abuse), isoPass: r.isoTests.every(c => c.pass), isoFatigueMin: Math.min(...fat.map(c => c.margin)),
      impactPass: imp.every(c => c.pass), impactRatio: Math.max(...imp.map(c => c.permanentSet / c.limit)),
      impacts: imp.map(c => ({ id: c.id, set: c.permanentSet, limit: c.limit, pass: c.pass })),
      lifeYears: r.fatigue.lifeYears, rearLateral: r.stiffness.tbis ? r.stiffness.tbis.J.k : null, insertion: ins, fit: postFit(design)
    };
  }

  root.FrameFEA = { RANGES, num, isBent, bendPt, kinkProfile, bowProfile, sProfile, rimBSD, frontTyreR, efthymiou, jointSig, matchFE, setFeLibrary, getFeLibrary: () => FE_LIBRARY.slice(), momentCapacity, analyze, buildModel, buildGeometry, deepMerge, sectionProps, sectionLabel, chainstaySpec, snLife, snAllow, validate, CONDITIONS, ISO, SEATPOSTS, POST_REF, tyreStiffness, comfortRating, summary, postInsertion, postFit, tyreShape, tyreGapPoint, tyreNeedZ,
    _internal: { solveSupported, makeSolverRaw, prepareElements, assemble, elementResults } };
  if (typeof module !== "undefined") module.exports = root.FrameFEA;
})(typeof window !== "undefined" ? window : globalThis);
