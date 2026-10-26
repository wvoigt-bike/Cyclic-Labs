// ============================================================================
//  TOE OVERLAP (toe.js)
//  Will the rider's shoe hit the front tyre (or mudguard) when the bars turn?
//
//  The model, step by step:
//   1. Shoe size (EU / US / UK / foot length) → foot length → shoe length, width and toe-box height,
//      for the kind of shoe (road, MTB/gravel clipless, flat-pedal shoe, winter boot), plus wide fit.
//   2. Where the shoe sits on the pedal: how far the pedal axle is behind the ball of the foot (cleat
//      position), how far the foot is from the bike's centreline, toes pointing in/out, foot angle.
//   3. The shoe front is built as a 3D cloud of surface points (sole with toe spring, rounded toe box).
//   4. The crank is swept from 2 o'clock to 5 o'clock (the forward part of the stroke, where the toe is
//      near the tyre). For each crank angle the front wheel is turned about the real steering axis
//      (head angle, offset, axle-to-crown, tyre size) until the tyre or mudguard first touches a shoe point.
//   5. Reported: the classic side-view overlap (bars straight, mm), the bar turn at which the toe actually
//      touches, and the tightest turn you can ride pedalling before that happens.
//  Everything for this feature lives here; hooks elsewhere: page.html (script tag, FrameToe.render() in
//  run(), App.changed), checks.js (checklist row), chat.js (nicknames + "shoe size 13 US"), newbike.js
//  (shoe size question), tour.js (tour stop), designs.js (fit defaults). Settings live in design.fit.
// ============================================================================
(function (root) {
  "use strict";
  const FEA = () => root.FrameFEA || (typeof require !== "undefined" ? require("./fea.js") : null);
  const num = (v, d) => (v === "" || v == null || !isFinite(+v)) ? d : +v;
  const rad = Math.PI / 180;

  // ---------------------------------------------------------------- shoe sizes
  // Cycling-brand charts (Shimano / Specialized / Lake style), men's sizes. Between rows it interpolates.
  // EU → US men's. UK ≈ US men's − 0.5; US women's ≈ US men's + 1.5.
  const CHART = [[36, 4], [37, 4.5], [38, 5.5], [39, 6.5], [40, 7], [41, 8], [42, 8.5], [43, 9.5], [44, 10], [45, 11], [46, 11.5],
    [47, 12.5], [48, 13], [49, 14], [50, 15], [51, 16], [52, 17], [53, 18], [54, 19]];
  const lerpTab = (tab, x, i, j) => {
    if (x <= tab[0][i]) return tab[0][j] + (x - tab[0][i]) * (tab[1][j] - tab[0][j]) / (tab[1][i] - tab[0][i]);
    for (let k = 1; k < tab.length; k++) if (x <= tab[k][i]) { const a = tab[k - 1], b = tab[k]; return a[j] + (x - a[i]) * (b[j] - a[j]) / (b[i] - a[i]); }
    const a = tab[tab.length - 2], b = tab[tab.length - 1]; return b[j] + (x - b[i]) * (b[j] - a[j]) / (b[i] - a[i]);
  };
  const SYSTEMS = { eu: "EU", usm: "US men's", usw: "US women's", uk: "UK", mm: "Foot length (mm)" };
  function toEU(v, sys) {
    v = +v; if (!isFinite(v)) return NaN;
    if (sys === "usm") return lerpTab(CHART, v, 1, 0);
    if (sys === "usw") return lerpTab(CHART, v - 1.5, 1, 0);
    if (sys === "uk") return lerpTab(CHART, v + 0.5, 1, 0);
    if (sys === "mm") return (v + 16.7) / 6.667;
    return v;
  }
  function fromEU(eu, sys) {
    if (sys === "usm") return lerpTab(CHART, eu, 0, 1);
    if (sys === "usw") return lerpTab(CHART, eu, 0, 1) + 1.5;
    if (sys === "uk") return lerpTab(CHART, eu, 0, 1) - 0.5;
    if (sys === "mm") return footLength(eu);
    return eu;
  }
  // Paris point: last length = EU × 6⅔ mm; the foot is ≈ 17 mm shorter than the last
  const footLength = eu => eu * 6.667 - 16.7;
  const halfRound = v => Math.round(v * 2) / 2;
  const sizeText = eu => `EU ${halfRound(eu)} · US ${halfRound(fromEU(eu, "usm"))} · UK ${halfRound(fromEU(eu, "uk"))}`;
  // Quick picks: typical shoe size for each rider size
  const RIDER_SIZES = [["S", 40], ["M", 42], ["L", 44], ["XL", 46], ["XXL", 48], ["XXXL", 50], ["XXXL+", 52]];

  // ---------------------------------------------------------------- shoe types
  // extra: shoe outside length beyond the foot (toe box + heel counter) · stack: pedal axle to sole bottom ·
  // spring: how far the sole tip curls up · box: toe-box height factor · widthAdd: upper + sole beyond foot width
  const SHOES = {
    road:   { label: "Road shoe (3-bolt cleats)",        extra: 20, stack: 11, spring: 8,  box: 1.0,  widthAdd: 6 },
    mtb:    { label: "MTB / gravel clipless shoe (SPD)", extra: 28, stack: 14, spring: 12, box: 1.1,  widthAdd: 10 },
    flat:   { label: "Flat-pedal shoe",                  extra: 30, stack: 18, spring: 14, box: 1.15, widthAdd: 12 },
    winter: { label: "Winter boot / overshoe",           extra: 40, stack: 15, spring: 12, box: 1.25, widthAdd: 18 }
  };
  const FENDERS = { none: "No mudguard", full: "Full mudguard (fender)" };
  const DEFAULTS = { shoeEU: 43, shoeSys: "eu", shoeType: "auto", wide: false, cleatBack: 0, fender: "none", fenderGap: 12,
    footCentre: "", toeAngle: 0, footPitch: 5, toeReach: "",
    // where the toe numbers come from: "size" (estimated from shoe size), "shoe" (measured the shoe on the bench), "bike" (measured on the bike)
    shoeSource: "", mTip: "", mWidth: "", mToeH: "", mLength: "",
    // sideways: crank Q-factor + crank face to the middle of the pedal + how far the cleat slide pushes the foot out
    qFactor: "", pedalStance: "", cleatSlide: 0 };
  const SOURCES = { size: "Estimate from my shoe size", shoe: "I measured my shoe", bike: "I measured it on the bike" };
  const Q_DEFAULT = { road: 147, gravel: 155, mtb: 168 };              // crank Q-factor, outside face to outside face (mm)
  const STANCE_DEFAULT = { road: 52, mtb: 54, flat: 60, winter: 54 };  // crank face to the middle of the pedal body (mm)
  // Shoes of the same size differ in toe-box length, and cleats sit anywhere in their slots: an estimate from the shoe
  // size alone is good to about ±15 mm of toe reach.
  const SPREAD = 15;

  const bikeKind = d => {
    const use = d.use || {}, g = d.geometry || {}, p = d.parts || {};
    if ((use.isoType || "mountain") === "mountain" && p.barType !== "drop") return "mtb";
    return num(g.tireWidth, 45) < 36 ? "road" : "gravel";
  };
  function settings(design) {
    const f = Object.assign({}, DEFAULTS, design.fit || {});
    const kind = bikeKind(design);
    f.kind = kind;
    f.shoe = SHOES[f.shoeType] ? f.shoeType : kind === "road" ? "road" : "mtb";
    // pedal axle centre to the middle of the foot, sideways: half the Q-factor + pedal spindle to the cleat centre
    f.src = SOURCES[f.shoeSource] ? f.shoeSource : num(f.mTip, 0) > 0 ? "shoe" : num(f.toeReach, 0) > 0 ? "bike" : "size";
    // the measurement the chosen source needs; without it we fall back to the estimate
    f.eff = f.src === "shoe" && num(f.mTip, 0) > 0 ? "shoe" : f.src === "bike" && num(f.toeReach, 0) > 0 ? "bike" : "size";
    f.Q = num(f.qFactor, Q_DEFAULT[kind]);
    f.stance = num(f.pedalStance, STANCE_DEFAULT[f.shoe]);
    f.footCAuto = f.Q / 2 + f.stance + num(f.cleatSlide, 0);
    f.footC = num(f.footCentre, f.footCAuto);
    f.eu = Math.min(56, Math.max(30, num(f.shoeEU, 43)));
    return f;
  }

  // ---------------------------------------------------------------- the shoe
  // delta: extra toe reach (mm) for the "what if your shoe is a bit longer / shorter" band
  function shoeDims(f, delta) {
    const S = SHOES[f.shoe], mode = f.eff || "size";
    let F = footLength(f.eu);
    const W = mode === "shoe" && num(f.mWidth, 0) > 0 ? +f.mWidth : 0.37 * F + S.widthAdd + (f.wide === true || f.wide === "true" ? 7 : 0);
    let H = (0.17 * F + 8) * S.box;
    // cleat set-back only applies to the estimate; a measured shoe already has its cleat where it really is
    const cb = mode === "shoe" ? 0 : num(f.cleatBack, 0);
    let toeAhead = 0.27 * F + S.extra - 10;                                   // shoe tip ahead of the ball of the foot
    if (mode === "bike") toeAhead = Math.max(20, +f.toeReach - cb);
    if (mode === "shoe") toeAhead = Math.max(20, +f.mTip);                   // pedal axle under the cleat centre
    toeAhead += num(delta, 0);
    // measured toe-box height, 30 mm back from the tip → the height profile's peak
    if (mode === "shoe" && num(f.mToeH, 0) > 0) { const u = Math.max(0, 1 - 30 / toeAhead); H = +f.mToeH / (1 - 0.6 * u * u); }
    let ballFromHeel = 0.73 * F + 10;                                          // shoe heel to ball (only for the drawing)
    if (mode === "shoe" && num(f.mLength, 0) > toeAhead + 80) { ballFromHeel = +f.mLength - toeAhead; F = (ballFromHeel - 10) / 0.73; }
    return { F, W, H, toeAhead, ballFromHeel, stack: S.stack, spring: S.spring, measured: mode !== "size", mode, cb,
      reach: toeAhead + cb, length: ballFromHeel + toeAhead };
  }
  // Plan outline ahead of the ball (u = 0 at the ball, 1 at the tip): the big-toe side stays straight
  // longer, the little-toe side tapers early. w: sideways from the foot's middle, + = outward (away from the bike).
  function planEdges(D, u) {
    const wt = -0.15 * D.W;
    const inner = u <= 0 ? -D.W / 2 : wt - (D.W / 2 + wt) * Math.pow(Math.max(0, 1 - u * u * u), 1 / 3);
    const outer = u <= 0 ? D.W / 2 : wt + (D.W / 2 - wt) * Math.pow(Math.max(0, 1 - Math.pow(u, 1.8)), 1 / 1.8);
    return [inner, outer];
  }
  // Points on the shoe surface in shoe coordinates: x forward from the pedal axle, y up from the axle, w sideways.
  function shoePoints(D, cleatBack) {
    const pts = [], levels = [0, 0.18, 0.4, 0.65, 1], Ns = 14;
    for (const v of levels) {
      const len = D.toeAhead * (v === 1 ? 0.8 : 1 - 0.12 * (v - 0.35) * (v - 0.35));
      const ss = [];
      for (let s = -110; s < 0; s += 22) ss.push(s);
      for (let k = 0; k <= Ns; k++) ss.push(len * k / Ns);
      for (const s of ss) {
        const u = s <= 0 ? 0 : s / len;
        const ys = D.stack + D.spring * u * u, yt = ys + D.H * (1 - 0.6 * u * u);
        const y = ys + v * (yt - ys);
        const [wi, wo] = planEdges(D, Math.min(1, u));
        const x = s + cleatBack;
        if (v === 0 || v === 1) for (let j = 0; j <= 4; j++) pts.push([x, y, wi + (wo - wi) * j / 4]);
        else { pts.push([x, y, wi]); pts.push([x, y, wo]); }
      }
    }
    return pts;
  }
  // Side silhouette of the whole shoe (for the drawing), shoe coordinates [x, y]
  function shoeOutline(D, cleatBack) {
    const out = [], heel = -D.ballFromHeel, F = D.F, N = 16;
    out.push([heel + 4, D.stack + 4]);
    for (let k = 0; k <= N; k++) { const u = k / N; out.push([cleatBack + D.toeAhead * u * (k === N ? 1 : 0.98), D.stack + D.spring * u * u]); }
    const tip = [cleatBack + D.toeAhead, D.stack + D.spring + 0.22 * D.H * 0.4]; out.push(tip);
    for (let k = N; k >= 0; k--) { const u = k / N; out.push([cleatBack + D.toeAhead * 0.96 * u, D.stack + D.spring * u * u + D.H * (1 - 0.6 * u * u)]); }
    out.push([cleatBack - 0.35 * F, D.stack + D.H * 1.15]);
    out.push([heel + 0.3 * F, D.stack + 0.36 * F]);
    out.push([heel + 0.08 * F, D.stack + 0.3 * F]);
    out.push([heel, D.stack + 0.24 * F]);
    out.push([heel - 3, D.stack + 0.08 * F]);
    return out.map(([x, y]) => [x + 0, y]);
  }

  // ---------------------------------------------------------------- the bike: front tyre + steering axis
  function frontWheel(design, fit, geo) {
    const F = FEA(), g = design.geometry;
    geo = geo || F.buildGeometry(g, design.tubes);
    const P = geo.P, info = geo.info;
    const R = F.frontTyreR(g), Wt = num(g.tireWidthFront, num(g.tireWidth, 50)), bead = F.rimBSD(g, true) / 2;
    let Ro = R, b = Wt / 2;
    if (fit.fender === "full") { Ro = R + num(fit.fenderGap, 12) + 3; b = Wt / 2 + 8; }
    const a = Math.max(10, (Ro - bead) / 2), rc = Ro - a;
    const ha = g.headAngle * rad, u = [Math.cos(ha), -Math.sin(ha), 0];   // steering axis (down the head tube)
    return { P, info, R, Ro, Wt, bead, a, b, rc, O: P.HTtop, u, axle: P.AxleF, ha, dtLine: geo.downTubeLine };
  }
  // rotate point p about the steering axis by angle t (radians)
  function steer(Wh, p, t) {
    const O = Wh.O, u = Wh.u, v = [p[0] - O[0], p[1] - O[1], p[2] - O[2]];
    const c = Math.cos(t), s = Math.sin(t), d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return [O[0] + v[0] * c + cr[0] * s + u[0] * d * (1 - c), O[1] + v[1] * c + cr[1] * s + u[1] * d * (1 - c), O[2] + v[2] * c + cr[2] * s + u[2] * d * (1 - c)];
  }
  // inside the tyre (superellipse section n = 4 swept round the axle, the same shape as the clearance checks)
  function insideF(Wh, q) {
    const dx = q[0] - Wh.axle[0], dy = q[1] - Wh.axle[1];
    const r = (Math.hypot(dx, dy) - Wh.rc) / Wh.a, z = q[2] / Wh.b;
    const r2 = r * r, z2 = z * z;
    return r2 * r2 + z2 * z2;                                             // < 1 = inside
  }
  // Turning the bars never changes a point's distance from the steering axis, so a shoe point farther from the axis
  // than any part of the tyre at the same height along the axis can never be touched. envelope(): biggest tyre
  // distance from the axis in 4 mm slices along it.
  function envelope(Wh) {
    if (Wh.env) return Wh.env;
    const O = Wh.O, u = Wh.u, bins = new Map(), BIN = 4;
    for (let i = 0; i < 180; i++) {
      const th = i / 180 * 2 * Math.PI, c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k <= 24; k++) {
        const t = k / 24 * Math.PI, ct = Math.cos(t), st = Math.sin(t);
        const dr = Wh.a * Math.sign(ct) * Math.sqrt(Math.abs(ct)), z = Wh.b * Math.sqrt(Math.abs(st));
        for (const zz of [z, -z]) {
          const p = [Wh.axle[0] + (Wh.rc + dr) * c, Wh.axle[1] + (Wh.rc + dr) * s, zz], v = [p[0] - O[0], p[1] - O[1], p[2] - O[2]];
          const ax = v[0] * u[0] + v[1] * u[1] + v[2] * u[2], r = Math.hypot(v[0] - ax * u[0], v[1] - ax * u[1], v[2] - ax * u[2]);
          const bi = Math.floor(ax / BIN); if (!(bins.get(bi) >= r)) bins.set(bi, r);
        }
      }
    }
    Wh.env = { bins, BIN };
    return Wh.env;
  }
  function reachable(Wh, p) {
    const E = envelope(Wh), O = Wh.O, u = Wh.u, v = [p[0] - O[0], p[1] - O[1], p[2] - O[2]];
    const ax = v[0] * u[0] + v[1] * u[1] + v[2] * u[2], r = Math.hypot(v[0] - ax * u[0], v[1] - ax * u[1], v[2] - ax * u[2]);
    const bi = Math.floor(ax / E.BIN);
    let m = -Infinity; for (let k = bi - 1; k <= bi + 1; k++) { const q = E.bins.get(k); if (q > m) m = q; }
    return r <= m + 3;
  }
  // signed distance (mm, + = gap) from a point to the tyre surface, approximately exact
  function tyreDist(Wh, q) {
    const dx = q[0] - Wh.axle[0], dy = q[1] - Wh.axle[1], rho = Math.hypot(dx, dy), z = Math.abs(q[2]);
    if (!Wh.sect) { Wh.sect = []; for (let k = 0; k <= 60; k++) { const t = k / 60 * Math.PI, c = Math.cos(t), sn = Math.sin(t); Wh.sect.push([Wh.a * Math.sign(c) * Math.sqrt(Math.abs(c)), Wh.b * Math.sqrt(Math.abs(sn))]); } }
    let best = Infinity; for (const [dr, zz] of Wh.sect) best = Math.min(best, Math.hypot(rho - (Wh.rc + dr), z - zz));
    return insideF(Wh, q) < 1 ? -best : best;
  }

  // ---------------------------------------------------------------- shoe on the crank
  function placeShoe(local, crankDeg, Lc, fit) {
    const ph = crankDeg * rad, sp = [Lc * Math.cos(ph), -Lc * Math.sin(ph)];
    const b = num(fit.footPitch, 5) * rad, cb = Math.cos(b), sb = Math.sin(b);
    const gm = num(fit.toeAngle, 0) * rad, cg = Math.cos(gm), sg = Math.sin(gm);
    return local.map(([x, y, w]) => {
      const x1 = x * cb + y * sb, y1 = y * cb - x * sb;                    // toe down by the foot angle
      const x2 = x1 * cg - w * sg, w2 = w * cg + x1 * sg;                  // toes out (+) / in (−)
      return [sp[0] + x2, sp[1] + y1, fit.footC + w2];                     // right foot (+z side)
    });
  }
  const CRANKS = [-40, -30, -20, -10, 0, 10, 20, 30, 40, 50];

  // ---------------------------------------------------------------- the answer
  function compute(design, opts) {
    opts = opts || {};
    const fit = settings(design), g = design.geometry, Lc = num(opts.crank, num(g.crankLength, 172.5));
    if (opts.eu != null) fit.eu = opts.eu;
    const D = shoeDims(fit, opts.reachDelta), cb = D.cb;
    const Wh = frontWheel(design, fit, opts.geo);
    const local = shoePoints(D, cb);
    const fast = !!opts.fast;
    // 1) side view, bars straight: how far the shoe reaches inside the tyre (or mudguard) circle
    let side = -Infinity, sideCrank = 0;
    const sideLocal = shoeOutline(D, cb).map(([x, y]) => [x, y, 0]);
    for (const c of CRANKS) {
      for (const p of placeShoe(sideLocal, c, Lc, fit)) {
        const o = Wh.Ro - Math.hypot(p[0] - Wh.axle[0], p[1] - Wh.axle[1]);
        if (o > side) { side = o; sideCrank = c; }
      }
    }
    // 2) turn the bars until the tyre touches the shoe (both directions; the right foot is on +z)
    let touch = null;
    const maxT = 75, step = fast ? 3 : 1.5;
    // only points that could ever meet the tyre (within its reach of the steering axis)
    const placed = CRANKS.map(c => ({ c, pts: placeShoe(local, c, Lc, fit).filter(p => reachable(Wh, p)) })).filter(pl => pl.pts.length);
    for (const pl of placed) {
      const hit = t => { for (const p of pl.pts) if (insideF(Wh, steer(Wh, p, t)) < 1) return p; return null; };
      for (const sgn of [1, -1]) {
        let lo = 0, found = null;
        for (let d = 0; d <= maxT; d += step) {
          if (touch && d >= touch.deg) break;
          const h = hit(sgn * d * rad);
          if (h) { found = d; break; }
          lo = d;
        }
        if (found == null) continue;
        let a = lo, b = found;
        if (found > 0) for (let k = 0; k < (fast ? 5 : 8); k++) { const m = (a + b) / 2; if (hit(sgn * m * rad)) b = m; else a = m; }
        if (!touch || b < touch.deg) touch = { deg: b, sign: sgn, crank: pl.c, point: hit(sgn * b * rad) || hit(sgn * found * rad) };
      }
    }
    // 3) what that means on the trail/road: ground steer angle → tightest pedalling turn
    const kind = fit.kind, ha = Wh.ha, wb = Wh.info.wheelbase;
    const turn = d => { const gs = Math.atan(Math.tan(d * rad) * Math.sin(ha)); return gs > 1e-4 ? wb / Math.tan(gs) : Infinity; };
    const lim = kind === "mtb" ? { ok: 35, warn: 20 } : { ok: 25, warn: 12 };
    let status, verdict;
    if (!touch) { status = "ok"; verdict = side > 0 ? "Overlaps in side view, but the shoe can't reach the tyre at any bar angle." : "No toe overlap."; }
    else if (touch.deg >= lim.ok) { status = "ok"; verdict = "Only touches in a very tight, slow turn (walking-pace U-turn or track stand)."; }
    else if (touch.deg >= lim.warn) { status = "warn"; verdict = kind === "mtb" ? "Can touch on tight switchbacks or slow technical turns if you pedal through them." : "Can touch in slow tight turns (U-turns, junctions) if you pedal mid-turn."; }
    else { status = "fail"; verdict = "Touches in ordinary slow turns: you'll feel it."; }
    return { fit, D, Wh, Lc, side, sideCrank, touch, turnR: touch ? turn(touch.deg) : Infinity, turn, status, verdict, lim, kind, cb };
  }
  // smallest gap (mm) between shoe and tyre with the bars turned d degrees away from the foot (back of the tyre toward the toe), over the crank sweep
  function gapAt(res, deg) {
    const local = shoePoints(res.D, res.cb), sgn = towardFoot(res);
    let best = Infinity, crank = 0;
    for (const c of CRANKS) for (const p of placeShoe(local, c, res.Lc, res.fit)) {
      const dd = tyreDist(res.Wh, steer(res.Wh, p, sgn * deg * rad)); if (dd < best) { best = dd; crank = c; }
    }
    return { gap: best, crank };
  }
  // Which sign swings the back of the tyre toward the right foot (when nothing touches).
  // Sign convention everywhere here: steer(shoePoint, sgn·t) = the shoe seen from a tyre turned by −sgn·t,
  // so the tyre itself turns by −sgn·t. (Physically that's the bars turned AWAY from the foot: front of the
  // tyre goes left, the back of the tyre swings right into the right toe.)
  function towardFoot(res) {
    if (res.touch) return res.touch.sign;
    const p = [res.Wh.axle[0] - res.Wh.R, res.Wh.axle[1], 0];
    return steer(res.Wh, p, -20 * rad)[2] > 0 ? 1 : -1;
  }
  // How sure is the answer? With only a shoe size, rerun with the toe ±SPREAD mm and report the range.
  const RANK = { ok: 0, warn: 1, fail: 2 };
  function band(design, res, geo) {
    res = res || compute(design, { geo });
    if (res.fit.eff !== "size") return null;
    const long = compute(design, { geo, reachDelta: SPREAD, fast: true }), short = compute(design, { geo, reachDelta: -SPREAD, fast: true });
    return { long, short, spread: SPREAD, worse: RANK[long.status] > RANK[res.status] };
  }
  // the row in the builder checklist (checks.js): an estimate that could turn amber/red with the real shoe says "measure it"
  function checkRow(design, geo) {
    const r = compute(design, { geo }), b = band(design, r, geo);
    let status = r.status, note = `${r.verdict} With ${shoeText(r)}.`;
    if (b && b.worse) {
      if (status === "ok") status = "warn";
      note += ` This is estimated from the shoe size; if your shoe reaches ${SPREAD} mm further it ${b.long.touch ? `touches at ${b.long.touch.deg.toFixed(0)}°` : "still clears"}. Measure your shoe in the Toe overlap card to be sure.`;
    } else note += r.fit.eff === "size" ? " Estimated from the shoe size; measuring your shoe in the Toe overlap card makes it exact." : " Using your measured shoe.";
    return { res: r, band: b, status, value: describe(r), note, target: `no touch below ${r.lim.ok}° of bar turn` };
  }
  // Same frame and fork, other front tyres (toe only: doesn't check that the tyre fits the fork)
  const TYRES = [["650b × 47", 680, 47], ["700 × 32", 686, 32], ["700 × 40", 702, 40], ["700 × 45", 714, 45], ["700 × 50", 724, 50],
    ["27.5 × 2.6", 724, 66], ["29 × 2.4", 750, 61], ["29 × 2.6", 762, 66], ["32 × 2.4", 806, 61]];
  function tyreWhatIf(design) {
    const g = design.geometry, F = FEA(), cur = 2 * F.frontTyreR(g);
    return TYRES.map(([label, od, w]) => {
      const d = Object.assign({}, design, { geometry: Object.assign({}, g, { tireDiameterFront: od, tireWidthFront: w, rimBSDFront: "" }) });
      const r = compute(d, { fast: true });
      return { label, od, w, deg: r.touch ? r.touch.deg : null, side: r.side, status: r.status, near: Math.abs(od - cur) < 8 };
    });
  }

  // a grid of shoe size × crank length → bar angle at first touch
  const GRID_EU = [36, 38, 40, 42, 44, 46, 48, 50, 52], GRID_CRANK = [160, 165, 170, 172.5, 175, 177.5];
  function grid(design) {
    const F = FEA(), geo = F.buildGeometry(design.geometry, design.tubes);
    return GRID_EU.map(eu => GRID_CRANK.map(cr => { const r = compute(design, { eu, crank: cr, geo, fast: true }); return { eu, cr, deg: r.touch ? r.touch.deg : null, side: r.side, status: r.status }; }));
  }

  // ---------------------------------------------------------------- one-line summary (checklist, chat)
  function describe(res) {
    const sideTxt = res.side >= 0.5 ? `${res.side.toFixed(0)} mm overlap (side view)` : `${Math.max(0, -res.side).toFixed(0)} mm clear (side view)`;
    const t = res.touch ? `touches at ${res.touch.deg.toFixed(0)}° of bar turn` : "never touches";
    return `${sideTxt}; ${t}`;
  }
  function shoeText(res) {
    const f = res.fit, D = res.D;
    const what = D.mode === "shoe" ? `your measured ${SHOES[f.shoe].label.replace(/ \(.*\)$/, "").toLowerCase()} (${D.W.toFixed(0)} mm wide)`
      : `${sizeText(f.eu)} ${SHOES[f.shoe].label.replace(/ \(.*\)$/, "").toLowerCase()}${f.wide === true || f.wide === "true" ? " (wide)" : ""}`;
    return `${what}, toe ${D.reach.toFixed(0)} mm past the pedal axle${D.mode === "shoe" ? " (measured on the shoe)" : D.mode === "bike" ? " (measured on the bike)" : " (estimated)"}, ${res.Lc} mm cranks${f.fender === "full" ? ", mudguard" : ""}`;
  }

  // ================================================================ browser card
  const UI = { card: null, key: "", res: null, slider: null, gridKey: "", gridT: 0 };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const App = () => root.CyclicLabsApp;
  const CSS = `
#toeCard .toe-top { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(280px, 1.25fr); gap: 18px; align-items: start; }
#toeCard .toe-in { display: flex; flex-direction: column; gap: 9px; }
#toeCard .toe-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
#toeCard .toe-row > span.l { font-size: 14px; flex: 1 1 140px; }
#toeCard .toe-row input[type=number] { width: 80px; }
#toeCard .toe-row select { max-width: 210px; }
#toeCard .chips { display: flex; gap: 4px; flex-wrap: wrap; }
#toeCard .chips button { padding: 3px 8px; font-size: 12px; font-weight: 600; }
#toeCard .chips button[aria-pressed=true] { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
#toeCard .toe-res { display: flex; flex-direction: column; gap: 10px; }
#toeCard .big { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
#toeCard .big > div { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
#toeCard .big b { display: block; font: 700 22px var(--font-data, inherit); }
#toeCard .big span { font-size: 12.5px; color: var(--muted); }
#toeCard .verdict { font-size: 14px; margin: 0; }
#toeCard .pics { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-top: 14px; }
#toeCard .pic { border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
#toeCard .pic svg, #toeCard .pic canvas { width: 100%; height: auto; display: block; }
#toeCard .pic .cap { font-size: 12.5px; color: var(--muted); margin: 4px 2px 0; }
#toeCard .steer { display: flex; gap: 8px; align-items: center; margin-top: 6px; font-size: 13px; }
#toeCard .steer input { flex: 1; }
#toeCard table.toegrid { border-collapse: collapse; font-size: 12.5px; margin-top: 6px; }
#toeCard table.toegrid th, #toeCard table.toegrid td { padding: 4px 8px; text-align: center; border: 1px solid var(--line); white-space: nowrap; }
#toeCard table.toegrid td.ok { color: var(--ok); } #toeCard table.toegrid td.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 10%, transparent); }
#toeCard table.toegrid td.fail { color: var(--bad); background: color-mix(in srgb, var(--bad) 12%, transparent); font-weight: 700; }
#toeCard table.toegrid td.me { outline: 2px solid var(--accent); outline-offset: -2px; }
#toeCard details { margin-top: 10px; }
#toeCard .fixes { margin: 6px 0 0; padding-left: 18px; font-size: 13.5px; }
#toeCard .toe-src { display: flex; flex-direction: column; gap: 6px; padding: 10px 0 2px; border-top: 1px solid var(--line); }
#toeCard .toe-src .l { font-size: 14px; font-weight: 600; }
#toeCard .chips.toe-seg button { font-size: 12.5px; padding: 5px 10px; }
#toeCard .toe-sec { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--accent) 4%, transparent); }
#toeCard .toe-sec[hidden] { display: none; }
#toeCard .toe-msvg { width: 100%; max-width: 400px; height: auto; display: block; margin: 2px auto; }
#toeCard .toe-how { margin: -4px 0 2px; font-size: 12.5px; }
#toeCard .toe-need { color: var(--warn); margin: 0; }
#toeCard .toe-band { font-size: 13.5px; margin: 0; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); }
#toeCard .toe-band.warn { border-color: var(--warn); background: color-mix(in srgb, var(--warn) 9%, transparent); }
#toeCard .toe-band.good { border-color: var(--ok); background: color-mix(in srgb, var(--ok) 8%, transparent); }
#toeCard .toe-band button { margin-left: 4px; padding: 2px 8px; font-size: 12.5px; }
#toeStrip { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; font-size: 14px; }
#toeStrip .k { font-weight: 700; }
#toeStrip .grow { flex: 1 1 auto; }
#toeStrip button { padding: 4px 10px; font-size: 12.5px; }
#toeStrip .acts { display: flex; gap: 6px; flex: 0 0 auto; margin-left: auto; }
#toeStrip .est { color: var(--muted); font-size: 12.5px; }
@media (max-width: 760px) { #toeCard .toe-top { grid-template-columns: 1fr; } }`;

  function mount() {
    if (UI.card || typeof document === "undefined") return;
    const after = document.getElementById("checkCard"); if (!after) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    const c = document.createElement("div"); c.className = "panel card"; c.id = "toeCard";
    c.innerHTML = `<div class="cardhead"><h3>Toe overlap</h3><span class="hint" id="toeSummary"></span></div>
      <p class="hint">Will your shoe hit the front tyre when you turn the bars? Set the shoe and where it sits on the pedal; the model sweeps the crank through the front of the stroke and turns the front wheel about the real steering axis until the tyre${""} touches the shoe. Side-view overlap (bars straight) is the number builders quote; the bar angle is what you'll actually feel.</p>
      <div class="toe-top"><div class="toe-in" id="toeInputs"></div><div class="toe-res" id="toeResults"></div></div>
      <div class="pics"><div class="pic"><div id="toeSide"></div><p class="cap" id="toeSideCap"></p></div>
        <div class="pic"><canvas id="toeTop" width="640" height="420" aria-label="Top view of the shoe and the turned front tyre"></canvas>
          <div class="steer"><span>Turn the bars</span><input type="range" id="toeSteer" min="0" max="60" step="1" value="30" aria-label="Bar turn angle"><span id="toeSteerVal"></span></div>
          <p class="cap" id="toeTopCap"></p></div></div>
      <details id="toeGridBox"><summary>Who would hit it: shoe size × crank length</summary>
        <p class="hint">Each cell is the bar turn (degrees) at which the toe first touches, with this bike and the shoe type, cleat position and mudguard set above. "—" = never touches. Your current setup is outlined.</p>
        <div class="tablewrap" id="toeGrid"></div></details>
      <details id="toeTyreBox"><summary>Bigger or smaller front tyre (incl. 29 × 2.6 and 32")</summary>
        <p class="hint">Same frame and fork, same shoe, other front tyres. Bigger wheels and fatter tyres reach back toward the toe, so this is where 32" wheels and 2.6" tyres catch people out. Toe only: it doesn't check the tyre fits the fork or frame.</p>
        <div class="tablewrap" id="toeTyres"></div></details>`;
    after.parentNode.insertBefore(c, after.nextSibling);
    UI.card = c;
    // headline strip under the summary tiles: toe overlap is one of the first things to check on a custom frame
    const tiles = document.getElementById("tiles");
    if (tiles) {
      const strip = document.createElement("div"); strip.className = "panel"; strip.id = "toeStrip"; strip.setAttribute("aria-live", "polite");
      tiles.parentNode.insertBefore(strip, tiles.nextSibling); UI.strip = strip;
      strip.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.act === "measure") setSource("shoe");
        c.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    c.querySelector("#toeTyreBox").addEventListener("toggle", e => { if (e.target.open) renderTyres(); });
    c.addEventListener("click", e => { const b = e.target.closest("button[data-act=measure]"); if (b) { setSource("shoe"); c.querySelector("#toeInputs").scrollIntoView({ behavior: "smooth", block: "start" }); } });
    UI.slider = c.querySelector("#toeSteer");
    UI.slider.addEventListener("input", () => { UI.userSteer = true; drawTop(); });
    c.querySelector("#toeGridBox").addEventListener("toggle", e => { if (e.target.open) renderGrid(true); });
  }

  // how-to-measure drawing for the "I measured my shoe" option: sole from below (A, B) and side view (C, D)
  const MEASURE_SVG = `<svg viewBox="0 0 400 268" role="img" aria-label="Where to measure the shoe: A tip to cleat centre, B widest, C toe-box height 3 cm back, D overall length" class="toe-msvg">
    <g fill="none" stroke-linejoin="round" stroke-linecap="round">
      <path d="M30 70 C30 45 60 38 110 42 C170 46 220 26 290 25 C345 24 378 45 381 70 C378 95 345 116 290 115 C220 114 170 96 110 98 C60 102 30 95 30 70 Z" fill="color-mix(in srgb, var(--accent) 10%, var(--panel))" stroke="var(--ink)" stroke-width="2"/>
      <rect x="263" y="55" width="24" height="30" rx="6" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.6"/>
      <circle cx="275" cy="63" r="2.2" fill="var(--ink)"/><circle cx="275" cy="77" r="2.2" fill="var(--ink)"/>
      <path d="M268 70 H282" stroke="var(--bad)" stroke-width="1.6"/>
      <path d="M275 52 V10 M381 64 V10" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>
      <path d="M279 14 L275 18 L279 22 M377 14 L381 18 L377 22 M275 18 H381" stroke="var(--accent)" stroke-width="2"/>
      <path d="M318 25 V115 M314 29 L318 25 L322 29 M314 111 L318 115 L322 111" stroke="var(--accent)" stroke-width="2"/>
      <path d="M30 230 H300 Q360 230 382 214 Q388 196 352 186 L250 170 Q180 156 118 146 L64 152 Q30 162 30 230 Z" fill="color-mix(in srgb, var(--accent) 10%, var(--panel))" stroke="var(--ink)" stroke-width="2"/>
      <path d="M346 230 V186 M342 190 L346 186 L350 190 M342 226 L346 230 L350 226" stroke="var(--accent)" stroke-width="2"/>
      <path d="M346 230 V242 M382 216 V242" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>
      <path d="M30 252 H382 M34 248 L30 252 L34 256 M378 248 L382 252 L378 256" stroke="var(--muted)" stroke-width="1.5"/>
    </g>
    <g font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="var(--accent)">
      <text x="322" y="12">A</text><text x="324" y="64">B</text><text x="330" y="212">C</text>
      <text x="200" y="266" fill="var(--muted)" text-anchor="middle" font-weight="600" font-size="12">D overall length (optional)</text>
    </g>
    <g font-family="system-ui, sans-serif" font-size="11.5" fill="var(--muted)">
      <text x="40" y="20">Sole from below, toe to the right</text><text x="214" y="104">cleat centre</text>
      <text x="40" y="140">Side view</text><text x="352" y="242">3 cm</text>
    </g></svg>`;

  // inputs: built once per design; refreshed (when not being typed in) after every run
  function buildInputs() {
    const A = App(), d = A.design(); d.fit = d.fit || {};
    const host = UI.card.querySelector("#toeInputs");
    const f = () => A.design().fit || (A.design().fit = {});
    const set = (k, v) => { f()[k] = v; A.changed ? A.changed() : A.refresh(); };
    const opt = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? " selected" : ""}>${esc(typeof l === "string" ? l : l.label)}</option>`).join("");
    const s = settings(d);
    const row = (label, id, unit, extra) => `<div class="toe-row"><span class="l">${label}</span><input type="number" id="${id}" step="1"${extra || ""}><span class="hint">${unit}</span></div>`;
    host.innerHTML = `
      <div class="toe-row"><span class="l">Shoe size</span><input type="number" id="toeSize" step="0.5" min="1"><select id="toeSys" style="width:auto">${opt(SYSTEMS, s.shoeSys)}</select></div>
      <div class="toe-row"><span class="l hint">Typical for a rider size</span><div class="chips" id="toeChips">${RIDER_SIZES.map(([n, eu]) => `<button type="button" data-eu="${eu}" title="EU ${eu} · US ${halfRound(fromEU(eu, "usm"))}">${n}</button>`).join("")}</div></div>
      <div class="toe-row"><span class="l">Shoe</span><select id="toeShoe">${opt(Object.assign({ auto: "Auto (from the bike type)" }, SHOES), s.shoeType)}</select></div>
      <div class="toe-src"><span class="l">Where does your toe sit?</span>
        <div class="chips toe-seg" id="toeSrc" role="group" aria-label="Where the toe numbers come from">${Object.entries({ size: "Estimate from shoe size", shoe: "Measure my shoe", bike: "Measure on the bike" }).map(([k, l]) => `<button type="button" data-toesrc="${k}">${l}</button>`).join("")}</div></div>
      <div class="toe-sec" data-show="size">
        <div class="toe-row"><span class="l">Wide fit</span><select id="toeWide" style="width:auto"><option value="false">No</option><option value="true">Yes</option></select></div>
        <div class="toe-row"><span class="l">Pedal axle behind the ball of the foot</span><input type="number" id="toeCleat" step="1"><span class="hint">mm</span></div>
        <div class="toe-row"><span class="l hint">Cleat / foot position</span><div class="chips" id="toeCleatChips"><button type="button" data-cb="0" title="Pedal axle under the ball of the foot (the usual cleat setting)">Ball of foot</button><button type="button" data-cb="15" title="Cleats moved back a little">A bit back</button><button type="button" data-cb="35" title="Midfoot cleats / flat-pedal stance">Midfoot</button></div></div>
        <p class="hint">Shoes of the same size differ by a centimetre or more in the toe box, and cleats sit anywhere in their slots. For a frame you're ordering, measuring your own shoe takes two minutes with a ruler.</p>
      </div>
      <div class="toe-sec toe-measure" data-show="shoe">
        <p class="hint" style="margin:0">Use the shoe you'll ride this bike in, cleat fitted where you have it. Shoe off, sole up.</p>
        ${MEASURE_SVG}
        ${row("<b>A</b> Shoe tip to the cleat centre", "toeMTip", "mm", ' placeholder="needed"')}
        <p class="hint toe-how">Along the sole's centre line, from a ruler held square across the very tip. SPD (2-bolt): the middle of the cleat, between the bolts. Road (3-bolt): the pedal-axle mark on the side of the cleat. Flat pedals: to where the pedal axle sits under your foot (stand on the pedal and chalk the sole).</p>
        ${row("<b>B</b> Widest across the front of the shoe", "toeMWidth", "mm", ' placeholder="from size"')}
        ${row("<b>C</b> Toe-box height, 3 cm back from the tip <span class=\"hint\">(optional)</span>", "toeMToeH", "mm", ' placeholder="from size"')}
        ${row("<b>D</b> Overall length <span class=\"hint\">(optional, drawing only)</span>", "toeMLen", "mm", ' placeholder="from size"')}
        <p class="hint toe-need" id="toeNeedA" hidden>Enter <b>A</b> to use your shoe; until then the estimate from the shoe size is used.</p>
      </div>
      <div class="toe-sec" data-show="bike">
        ${row("Toe tip past the pedal axle", "toeMeas", "mm", ' placeholder="needed"')}
        <p class="hint toe-how">Clip in (or stand on the pedal as you ride), crank level and forward, and measure from the pedal axle centre forward to the tip of the shoe. A friend helps. Sideways position below.</p>
        <p class="hint toe-need" id="toeNeedB" hidden>Enter the measurement to use it; until then the estimate from the shoe size is used.</p>
      </div>
      <div class="toe-row"><span class="l">Crank length <span class="hint">(same as Geometry)</span></span><input type="number" id="toeCrank" step="2.5"><span class="hint">mm</span></div>
      <div class="toe-row"><span class="l">Mudguard</span><select id="toeFender">${opt(FENDERS, s.fender)}</select></div>
      <details id="toeSideBox"><summary>Where your foot sits sideways: Q-factor, pedals, cleat slide</summary><div class="toe-in" style="margin-top:8px">
        ${row("Crank Q-factor <span class=\"hint\">(outside face to outside face, on the crank's spec sheet)</span>", "toeQ", "mm", ' placeholder="auto"')}
        ${row("Crank face to the middle of the pedal <span class=\"hint\">(Shimano road ≈ 52, SPD ≈ 54, flats 55–65; add pedal washers)</span>", "toeStance", "mm", ' placeholder="auto"')}
        ${row("Cleat slid so the foot sits further out (+) / in (−)", "toeSlide", "mm")}
        <p class="hint" id="toeFootCTxt"></p>
      </div></details>
      <details><summary>More: mudguard gap, foot angle, override</summary><div class="toe-in" style="margin-top:8px">
        ${row("Mudguard gap above the tyre", "toeFGap", "mm")}
        ${row("Toes point out (+) / in (−)", "toeAng", "°")}
        ${row("Foot angle at 3 o'clock (toe down +)", "toePitch", "°")}
        ${row("Middle of the foot from the bike's centreline <span class=\"hint\">(overrides the sideways numbers above)</span>", "toeFC", "mm", ' placeholder="auto"')}
      </div></details>`;
    const $ = id => host.querySelector(id);
    $("#toeSize").addEventListener("input", e => { const eu = toEU(e.target.value, $("#toeSys").value); if (isFinite(eu) && eu > 25 && eu < 60) set("shoeEU", Math.round(eu * 10) / 10); });
    $("#toeSys").addEventListener("change", e => { f().shoeSys = e.target.value; syncInputs(true); A.changed && A.changed(); });
    host.querySelectorAll("#toeChips button").forEach(b => b.addEventListener("click", () => { set("shoeEU", +b.dataset.eu); syncInputs(true); }));
    host.querySelectorAll("#toeSrc button").forEach(b => b.addEventListener("click", () => setSource(b.dataset.toesrc)));
    $("#toeShoe").addEventListener("change", e => set("shoeType", e.target.value));
    $("#toeWide").addEventListener("change", e => set("wide", e.target.value === "true"));
    $("#toeCleat").addEventListener("input", e => { const v = parseFloat(e.target.value); if (isFinite(v)) set("cleatBack", v); });
    host.querySelectorAll("#toeCleatChips button").forEach(b => b.addEventListener("click", () => { set("cleatBack", +b.dataset.cb); syncInputs(true); }));
    $("#toeCrank").addEventListener("input", e => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= 100 && v <= 220) { A.design().geometry.crankLength = v; A.refresh(); setTimeout(() => { const i = UI.card.querySelector("#toeCrank"); if (i) { i.focus(); } }, 0); } });
    $("#toeFender").addEventListener("change", e => set("fender", e.target.value));
    const numIn = (id, k, blank) => $(id).addEventListener("input", e => { const v = e.target.value.trim(); if (blank && v === "") return set(k, ""); const n = parseFloat(v); if (isFinite(n)) set(k, n); });
    numIn("#toeFGap", "fenderGap"); numIn("#toeFC", "footCentre", true); numIn("#toeAng", "toeAngle"); numIn("#toePitch", "footPitch"); numIn("#toeMeas", "toeReach", true);
    numIn("#toeMTip", "mTip", true); numIn("#toeMWidth", "mWidth", true); numIn("#toeMToeH", "mToeH", true); numIn("#toeMLen", "mLength", true);
    numIn("#toeQ", "qFactor", true); numIn("#toeStance", "pedalStance", true); numIn("#toeSlide", "cleatSlide");
    syncInputs(true);
  }
  function setSource(src) {
    const A = App(), f = A.design().fit || (A.design().fit = {});
    f.shoeSource = src;
    if (src !== "size" && UI.card) { const sb = UI.card.querySelector("#toeSideBox"); if (sb) sb.open = true; }
    A.changed ? A.changed() : A.refresh();
    syncInputs(true);
    const first = UI.card && UI.card.querySelector(src === "shoe" ? "#toeMTip" : src === "bike" ? "#toeMeas" : "#toeSize");
    if (first && src !== "size") setTimeout(() => first.focus({ preventScroll: true }), 0);
  }
  function syncInputs(force) {
    const A = App(), d = A.design(), s = settings(d), host = UI.card.querySelector("#toeInputs");
    const put = (id, v) => { const el = host.querySelector(id); if (el && (force || document.activeElement !== el)) el.value = v; };
    const blank = v => v === "" || v == null ? "" : v;
    const sys = (d.fit && d.fit.shoeSys) || "eu";
    put("#toeSys", sys);
    put("#toeSize", sys === "mm" ? Math.round(fromEU(s.eu, sys)) : halfRound(fromEU(s.eu, sys)));
    put("#toeShoe", s.shoeType); put("#toeWide", String(s.wide === true || s.wide === "true")); put("#toeCleat", num(s.cleatBack, 0));
    put("#toeCrank", d.geometry.crankLength); put("#toeFender", s.fender); put("#toeFGap", num(s.fenderGap, 12));
    put("#toeFC", blank(s.footCentre)); put("#toeAng", num(s.toeAngle, 0)); put("#toePitch", num(s.footPitch, 5));
    put("#toeMeas", blank(s.toeReach)); put("#toeMTip", blank(s.mTip)); put("#toeMWidth", blank(s.mWidth)); put("#toeMToeH", blank(s.mToeH)); put("#toeMLen", blank(s.mLength));
    put("#toeQ", blank(s.qFactor)); put("#toeStance", blank(s.pedalStance)); put("#toeSlide", num(s.cleatSlide, 0));
    // placeholders show what the estimate would use
    const D0 = shoeDims(Object.assign({}, s, { eff: "size" }));
    const ph = (id, v) => { const el = host.querySelector(id); if (el) el.placeholder = v; };
    ph("#toeMWidth", `≈ ${D0.W.toFixed(0)}`); { const u = Math.max(0, 1 - 30 / D0.toeAhead); ph("#toeMToeH", `≈ ${(D0.H * (1 - 0.6 * u * u)).toFixed(0)}`); } ph("#toeMLen", `≈ ${D0.length.toFixed(0)}`);
    ph("#toeQ", `${Q_DEFAULT[s.kind]}`); ph("#toeStance", `${STANCE_DEFAULT[s.shoe]}`);
    const fc = host.querySelector("#toeFootCTxt");
    if (fc) fc.innerHTML = s.footCentre === "" || s.footCentre == null
      ? `Middle of your foot: <b>${s.footC.toFixed(0)} mm</b> from the bike's centreline (Q ${s.Q} ÷ 2 + pedal ${s.stance}${num(s.cleatSlide, 0) ? ` ${num(s.cleatSlide, 0) > 0 ? "+" : "−"} ${Math.abs(num(s.cleatSlide, 0))} cleat slide` : ""}). Narrower stance = closer to the tyre.`
      : `Using your override: ${s.footC.toFixed(0)} mm from the centreline.`;
    host.querySelectorAll("#toeChips button").forEach(b => b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.eu - s.eu) < 0.01)));
    host.querySelectorAll("#toeCleatChips button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.cb === num(s.cleatBack, 0))));
    host.querySelectorAll("#toeSrc button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.toesrc === s.src)));
    host.querySelectorAll(".toe-sec").forEach(el => { el.hidden = el.dataset.show !== s.src; });
    const na = host.querySelector("#toeNeedA"), nb = host.querySelector("#toeNeedB");
    if (na) na.hidden = !(s.src === "shoe" && s.eff !== "shoe");
    if (nb) nb.hidden = !(s.src === "bike" && s.eff !== "bike");
  }

  function render() {
    if (typeof document === "undefined") return;
    mount(); if (!UI.card) return;
    const A = App(); if (!A) return;
    const d = A.design();
    const k = A.currentId ? A.currentId() : "";
    if (UI.key !== k) { UI.key = k; UI.userSteer = false; buildInputs(); } else syncInputs(false);
    let res; try { res = compute(d); } catch (e) { UI.card.querySelector("#toeResults").innerHTML = `<p class="hint">Can't work out toe overlap for this design: ${esc(e.message)}</p>`; return; }
    UI.res = res;
    let bd = null; try { bd = band(d, res); } catch (e) { bd = null; }
    const pill = { ok: `<span class="pill ok">fine</span>`, warn: `<span class="pill warn">worth knowing</span>`, fail: `<span class="pill bad">you'll feel it</span>` }[res.status];
    UI.card.querySelector("#toeSummary").innerHTML = `${esc(describe(res))} ${pill}`;
    const sideB = res.side >= 0.5 ? `${res.side.toFixed(0)} mm` : "none";
    const sideS = res.side >= 0.5 ? "overlap with the bars straight (side view)" : `side view: ${Math.max(0, -res.side).toFixed(0)} mm clear`;
    const touchB = res.touch ? `${res.touch.deg.toFixed(0)}°` : "never";
    const touchS = res.touch ? `bar turn before the toe touches${res.Wh.Ro > res.Wh.R ? " the mudguard" : " the tyre"}` : "the shoe can't reach the tyre at any bar angle";
    const turnB = res.touch ? (isFinite(res.turnR) ? `${(2 * res.turnR / 1000).toFixed(1)} m` : "—") : "any";
    const turnS = res.touch ? "tightest circle you can ride while pedalling (across)" : "turn as tight as you like";
    const fixes = [];
    if (res.status !== "ok" || res.side > 0) {
      const need = Math.max(0, res.side) + 5;
      if (res.side > 0) {
        fixes.push(`About <b>${need.toFixed(0)} mm more front centre</b> (longer reach, slacker head angle or more fork offset) clears it in side view.`);
        const cut = Math.ceil(need / 2.5) * 2.5;
        if (res.Lc - cut >= 150) fixes.push(`Or cranks about ${cut} mm shorter (${res.Lc - cut} mm) for the same effect.`);
        else fixes.push("Shorter cranks alone can't clear this much: it needs a longer front centre, a smaller front wheel, or the cleats further forward.");
        if (res.cb > 10) fixes.push(`The cleat set-back (${res.cb} mm behind the ball) adds ${res.cb} mm to the overlap; under the ball it would be about ${Math.max(0, res.side - res.cb).toFixed(0)} mm.`);
        if (res.fit.fender === "full") fixes.push(`The mudguard adds about ${(res.Wh.Ro - res.Wh.R).toFixed(0)} mm.`);
        fixes.push("A smaller front tyre or cleats further forward help a little; a narrower stance (lower Q-factor) makes it worse.");
      }
    }
    UI.card.querySelector("#toeResults").innerHTML = `
      <div class="big"><div><b>${sideB}</b><span>${sideS}</span></div><div><b>${touchB}</b><span>${touchS}</span></div><div><b>${turnB}</b><span>${turnS}</span></div></div>
      <p class="verdict">${pill} ${esc(res.verdict)}</p>
      ${bandHTML(res, bd)}
      <p class="hint">Shoe: ${esc(shoeText(res))}. Foot ${res.fit.footC.toFixed(0)} mm out from the centreline. ${res.kind === "mtb" ? `Mountain bikes: fine from ${res.lim.ok}°, worth knowing from ${res.lim.warn}° (switchbacks need lots of bar turn).` : `Road / gravel: fine from ${res.lim.ok}°, worth knowing from ${res.lim.warn}°.`} For scale, riding along at 15 km/h you rarely turn the bars more than 5°.</p>
      ${fixes.length ? `<ul class="fixes">${fixes.map(x => `<li>${x}</li>`).join("")}</ul>` : ""}`;
    if (!UI.userSteer) UI.slider.value = res.touch ? Math.min(60, Math.round(res.touch.deg)) : 30;
    drawSide(); drawTop();
    const box = UI.card.querySelector("#toeGridBox");
    if (box.open) renderGrid(false);
    if (UI.card.querySelector("#toeTyreBox").open) renderTyres();
    renderStrip(res, bd, pill);
  }
  const degTxt = r => r.touch ? `touches at ${r.touch.deg.toFixed(0)}°` : "never touches";
  function bandHTML(res, bd) {
    if (res.D.mode !== "size") return `<p class="toe-band good">Using ${res.D.mode === "shoe" ? "your measured shoe" : "your on-the-bike measurement"}: toe ${res.D.reach.toFixed(0)} mm past the pedal axle, foot ${res.fit.footC.toFixed(0)} mm out from the centreline.</p>`;
    if (!bd) return "";
    const same = degTxt(bd.long) === degTxt(bd.short);
    return `<p class="toe-band${bd.worse ? " warn" : ""}"><b>Estimated from the shoe size.</b> ${same
      ? `Even with a shoe ${bd.spread} mm longer or shorter it ${degTxt(bd.long)}, so the estimate is safe here.`
      : `Real shoes and cleat set-ups vary about ±${bd.spread} mm: a shorter one ${degTxt(bd.short)}, a longer one ${degTxt(bd.long)}${bd.worse ? ` (<b>${{ warn: "worth knowing", fail: "you'll feel it" }[bd.long.status]}</b>)` : ""}.`}
      ${same && !bd.worse ? "" : `<button type="button" data-act="measure">Measure my shoe</button>`}</p>`;
  }
  function renderStrip(res, bd, pill) {
    if (!UI.strip) return;
    const what = res.touch ? `toe touches the ${res.Wh.Ro > res.Wh.R ? "mudguard" : "tyre"} at <b>${res.touch.deg.toFixed(0)}°</b> of bar turn` : res.side > 0.5 ? "overlaps in side view but <b>never touches</b>" : "<b>no overlap</b>";
    const src = res.D.mode === "shoe" ? "your measured shoe" : res.D.mode === "bike" ? "measured on the bike" : `estimated from ${sizeText(res.fit.eu).split(" · ")[0]}${res.fit.shoeSys && res.fit.shoeSys !== "eu" && res.fit.shoeSys !== "mm" ? " (" + sizeText(res.fit.eu).split(" · ")[res.fit.shoeSys === "uk" ? 2 : 1] + ")" : ""} shoes`;
    const unsure = res.D.mode === "size" && bd && bd.worse;
    UI.strip.innerHTML = `<span class="k">Toe overlap</span><span>${what}${res.side > 0.5 ? ` · ${res.side.toFixed(0)} mm side-view overlap` : ""}</span>${pill}${unsure ? `<span class="pill warn">could be worse with your shoe</span>` : ""}
      <span class="est">${esc(src)}</span>
      <span class="acts">${res.D.mode === "size" ? `<button type="button" data-act="measure">Measure my shoe</button>` : ""}<button type="button" data-act="go">Details</button></span>`;
  }
  function renderTyres() {
    const A = App(), d = A.design(), host = UI.card.querySelector("#toeTyres");
    let L; try { L = tyreWhatIf(d); } catch (e) { host.innerHTML = `<p class="hint">${esc(e.message)}</p>`; return; }
    const cur = 2 * FEA().frontTyreR(d.geometry);
    host.innerHTML = `<table class="toegrid"><tr><th>Front tyre</th><th>Outside Ø (approx.)</th><th>Side view</th><th>Toe touches at</th></tr>
      <tr class="me"><th>Yours now</th><td>${cur.toFixed(0)} mm</td><td class="${UI.res.status}">${UI.res.side > 0.5 ? UI.res.side.toFixed(0) + " mm overlap" : (-UI.res.side).toFixed(0) + " mm clear"}</td><td class="${UI.res.status} me">${UI.res.touch ? UI.res.touch.deg.toFixed(0) + "°" : "never"}</td></tr>
      ${L.map(t => `<tr><th>${t.label}</th><td>${t.od} mm</td><td class="${t.status}">${t.side > 0.5 ? t.side.toFixed(0) + " mm overlap" : (-t.side).toFixed(0) + " mm clear"}</td><td class="${t.status}">${t.deg == null ? "never" : t.deg.toFixed(0) + "°"}</td></tr>`).join("")}</table>`;
  }

  // ---------------------------------------------------------------- side view (SVG)
  function drawSide() {
    const res = UI.res, Wh = res.Wh, P = Wh.P, info = Wh.info, host = UI.card.querySelector("#toeSide");
    const ground = -info.bbHeight;
    const crank = res.side > 0 ? res.sideCrank : 0;
    const shoe = placeShoe(shoeOutline(res.D, res.cb).map(([x, y]) => [x, y, 0]), crank, res.Lc, res.fit);
    const x0 = Math.min(-res.D.ballFromHeel + res.Lc * 0 - 60, -260), x1 = Wh.axle[0] + Wh.Ro + 30;
    const y0 = ground - 15, y1 = Math.max(Wh.axle[1] + Wh.Ro + 20, P.HTtop[1] + 30);
    const Wd = 640, sc = Wd / (x1 - x0), Hd = Math.round((y1 - y0) * sc);
    const X = x => ((x - x0) * sc).toFixed(1), Y = y => ((y1 - y) * sc).toFixed(1);
    const pts = a => a.map(p => `${X(p[0])},${Y(p[1])}`).join(" ");
    const ph = crank * rad, sp = [res.Lc * Math.cos(ph), -res.Lc * Math.sin(ph)];
    const ax = Wh.axle, rT = Wh.Ro * sc;
    const tip = shoe.reduce((m, p) => (p[0] > m[0] ? p : m), shoe[0]);
    const sweepR = Math.hypot(tip[0], tip[1]);
    const dt = P.DTht || P.HTbot;
    host.innerHTML = `<svg viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="Side view: shoe, crank and front tyre">
      <defs><clipPath id="toeClip"><circle cx="${X(ax[0])}" cy="${Y(ax[1])}" r="${rT.toFixed(1)}"/></clipPath></defs>
      <line x1="0" y1="${Y(ground)}" x2="${Wd}" y2="${Y(ground)}" stroke="var(--line)" stroke-width="2"/>
      <circle cx="${X(ax[0])}" cy="${Y(ax[1])}" r="${(Wh.R * sc).toFixed(1)}" fill="color-mix(in srgb, var(--rubber) 18%, transparent)" stroke="var(--rubber)" stroke-width="${Math.max(2, Wh.a * 2 * sc * 0.25).toFixed(1)}"/>
      <circle cx="${X(ax[0])}" cy="${Y(ax[1])}" r="${(Wh.bead * sc).toFixed(1)}" fill="var(--panel)" stroke="var(--metal)" stroke-width="2"/>
      ${Wh.Ro > Wh.R ? `<circle cx="${X(ax[0])}" cy="${Y(ax[1])}" r="${rT.toFixed(1)}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="6 4"/>` : ""}
      <line x1="${X(P.HTtop[0])}" y1="${Y(P.HTtop[1])}" x2="${X(P.HTbot[0])}" y2="${Y(P.HTbot[1])}" stroke="var(--ink)" stroke-width="6" stroke-linecap="round"/>
      <line x1="${X(P.HTbot[0])}" y1="${Y(P.HTbot[1])}" x2="${X(ax[0])}" y2="${Y(ax[1])}" stroke="var(--part)" stroke-width="4" stroke-linecap="round"/>
      <line x1="0" y1="0" x2="0" y2="0"/>
      <polyline points="${pts(Wh.dtLine || [[0, 0], dt])}" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
      <circle cx="${X(0)}" cy="${Y(0)}" r="${(sweepR * sc).toFixed(1)}" fill="none" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="3 4" opacity=".7"/>
      <circle cx="${X(0)}" cy="${Y(0)}" r="${(res.Lc * sc).toFixed(1)}" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="2 4"/>
      <polygon points="${pts(shoe)}" fill="color-mix(in srgb, var(--accent) 22%, var(--panel))" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>
      <polygon points="${pts(shoe)}" fill="var(--bad)" opacity=".75" clip-path="url(#toeClip)"/>
      <line x1="${X(0)}" y1="${Y(0)}" x2="${X(sp[0])}" y2="${Y(sp[1])}" stroke="var(--ink)" stroke-width="7" stroke-linecap="round"/>
      <circle cx="${X(0)}" cy="${Y(0)}" r="9" fill="var(--panel)" stroke="var(--ink)" stroke-width="3"/>
      <circle cx="${X(sp[0])}" cy="${Y(sp[1])}" r="5" fill="var(--ink)"/>
      <circle cx="${X(ax[0])}" cy="${Y(ax[1])}" r="5" fill="var(--ink)"/>
    </svg>`;
    UI.card.querySelector("#toeSideCap").innerHTML = res.side > 0
      ? `Bars straight, crank ${crank === 0 ? "level and forward" : crank > 0 ? `${crank}° below level` : `${-crank}° above level`}: the red part of the shoe is inside the ${Wh.Ro > Wh.R ? "mudguard" : "tyre"} circle (${res.side.toFixed(0)} mm). The dotted purple circle is the path of the toe tip.`
      : `Bars straight, crank level: the toe tip path (dotted purple) stays ${(-res.side).toFixed(0)} mm clear of the ${Wh.Ro > Wh.R ? "mudguard" : "tyre"} — no overlap.`;
  }

  // ---------------------------------------------------------------- top view at the slider angle (canvas)
  function drawTop() {
    const res = UI.res; if (!res) return;
    const cv = UI.card.querySelector("#toeTop"), ctx = cv.getContext("2d"), Wh = res.Wh;
    const deg = +UI.slider.value, sgn = towardFoot(res), t = sgn * deg * rad;
    const gp = gapAt(res, deg), crank = gp.crank;
    const local = shoePoints(res.D, res.cb), shoe = placeShoe(local, crank, res.Lc, res.fit);
    const ys = shoe.map(p => p[1]), yLo = Math.min(...ys), yHi = Math.max(...ys);
    const plan0 = planPoly(res, crank), xs = plan0.map(p => p[0]);
    const cs = getComputedStyle(document.body), col = n => cs.getPropertyValue(n).trim() || "#888";
    const Wc = cv.width, Hc = cv.height;
    const xMin = Math.min(...xs) - 30, xMax = Math.max(Math.max(...xs) + 160, Wh.axle[0] - Wh.Ro * 0.2);
    const sc = Wc / (xMax - xMin), zMin = res.fit.footC + 75 - Hc / sc;
    const PX = x => (x - xMin) * sc, PZ = z => (z - zMin) * sc;
    ctx.clearRect(0, 0, Wc, Hc); ctx.fillStyle = col("--panel"); ctx.fillRect(0, 0, Wc, Hc);
    // the tyre (or mudguard) at shoe height, bars turned: shade every pixel where some height in the shoe's band is inside
    const img = ctx.getImageData(0, 0, Wc, Hc), dat = img.data;
    const rub = hexRGB(col("--rubber")), bad = hexRGB(col("--bad"));
    const levels = 6, step = 2;
    // shoe plan polygon (outline of all its points' footprint) for the overlap colour
    const plan = plan0;
    for (let py = 0; py < Hc; py += step) for (let px = 0; px < Wc; px += step) {
      const x = xMin + px / sc, z = zMin + py / sc;
      let inT = false;
      for (let k = 0; k <= levels && !inT; k++) { const y = yLo + (yHi - yLo) * k / levels; if (insideF(Wh, steer(Wh, [x, y, z], t)) < 1) inT = true; }
      if (!inT) continue;
      const over = pointInPoly(plan, x, z), c = over ? bad : rub, a = over ? 230 : 120;
      for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) { const i = ((py + dy) * Wc + px + dx) * 4; if (i < dat.length) { dat[i] = c[0]; dat[i + 1] = c[1]; dat[i + 2] = c[2]; dat[i + 3] = a; } }
    }
    ctx.putImageData(img, 0, 0);
    // whole tyre seen from above (turned), faint dashed outline
    { const hp = [];
      for (let i = 0; i < 120; i++) { const th = i / 120 * 2 * Math.PI, c = Math.cos(th), sn = Math.sin(th);
        for (const [rr, zz] of [[Wh.rc, Wh.b], [Wh.rc, -Wh.b], [Wh.Ro, 0]]) { const q = steer(Wh, [Wh.axle[0] + rr * c, Wh.axle[1] + rr * sn, zz], -t); hp.push([PX(q[0]), PZ(q[2])]); } }
      const H = hull(hp); ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = col("--muted"); ctx.lineWidth = 1.5; ctx.beginPath();
      H.forEach(([x, z], i) => i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)); ctx.closePath(); ctx.stroke(); ctx.restore(); }
    // centreline + steering axis
    ctx.strokeStyle = col("--muted"); ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, PZ(0)); ctx.lineTo(Wc, PZ(0)); ctx.stroke(); ctx.setLineDash([]);
    // shoe outline
    ctx.strokeStyle = col("--accent"); ctx.lineWidth = 2; ctx.fillStyle = "rgba(120,90,200,0.12)";
    ctx.beginPath(); plan.forEach(([x, z], i) => i ? ctx.lineTo(PX(x), PZ(z)) : ctx.moveTo(PX(x), PZ(z))); ctx.closePath(); ctx.fill(); ctx.stroke();
    // pedal axle + crank arm stub
    const ph = crank * rad, spx = res.Lc * Math.cos(ph);
    ctx.fillStyle = col("--ink"); ctx.beginPath(); ctx.arc(PX(spx), PZ(res.fit.footC), 4, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = col("--ink"); ctx.beginPath(); ctx.moveTo(PX(spx), PZ(res.fit.footC - 55)); ctx.lineTo(PX(spx), PZ(res.fit.footC + 30)); ctx.stroke();
    ctx.font = "600 22px system-ui, sans-serif"; ctx.fillStyle = col("--muted");
    ctx.fillText("bike centreline", 8, PZ(0) - 8);
    ctx.fillText("front →", Wc - 90, Hc - 12);
    UI.card.querySelector("#toeSteerVal").textContent = `${deg}°`;
    const g = gp.gap;
    UI.card.querySelector("#toeTopCap").innerHTML = `From above, bars turned ${deg}° to the left (away from your right foot, so the back of the tyre swings in toward the toe), crank ${crank === 0 ? "level" : crank > 0 ? `${crank}° below level` : `${-crank}° above level`} (the worst spot). Grey: the ${Wh.Ro > Wh.R ? "mudguard" : "tyre"} at shoe height. ` +
      (g >= 0 ? `<b>${g.toFixed(0)} mm gap.</b>` : `<b style="color:var(--bad)">Touching: ${(-g).toFixed(0)} mm into the shoe.</b>`);
  }
  function planPoly(res, crank) {
    const D = res.D, cb = res.cb, inner = [], outer = [], heel = D.ballFromHeel - 4;
    for (let s = -heel; s <= D.toeAhead + 0.01; s += 5) {
      const u = s <= 0 ? 0 : Math.min(1, s / D.toeAhead);
      let [wi, wo] = planEdges(D, u);
      if (s < 0) { const t = -s / heel, k = 1 - 0.33 * Math.pow(t, 1.6) - (t > 0.9 ? 0.5 * (t - 0.9) / 0.1 * (t - 0.9) / 0.1 : 0); wi *= k; wo *= k * 0.95; }
      inner.push([s + cb, D.stack, wi]); outer.push([s + cb, D.stack, wo]);
    }
    const loop = inner.concat(outer.reverse());
    return placeShoe(loop, crank, res.Lc, res.fit).map(p => [p[0], p[2]]);
  }
  function hull(P) {
    P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function pointInPoly(poly, x, y) {
    let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    } return c;
  }
  function hexRGB(c) {
    c = String(c).trim();
    if (c[0] === "#") { if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
    const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }

  // ---------------------------------------------------------------- grid
  function renderGrid(now) {
    const A = App(), d = A.design(), k = JSON.stringify([d.geometry, d.fit, d.parts && d.parts.barType, d.use && d.use.isoType]);
    if (k === UI.gridKey) return;
    clearTimeout(UI.gridT);
    const host = UI.card.querySelector("#toeGrid");
    if (!now) host.innerHTML = `<p class="hint">Working it out…</p>`;
    UI.gridT = setTimeout(() => {
      let G; try { G = grid(d); } catch (e) { host.innerHTML = `<p class="hint">${esc(e.message)}</p>`; return; }
      UI.gridKey = k;
      const me = settings(d), cr = +d.geometry.crankLength;
      const head = `<tr><th>Shoe size</th>${GRID_CRANK.map(c => `<th>${c} mm cranks</th>`).join("")}</tr>`;
      const rows = G.map(row => `<tr><th>EU ${row[0].eu} <span class="hint">(US ${halfRound(fromEU(row[0].eu, "usm"))})</span></th>${row.map(c => {
        const mine = Math.abs(c.eu - me.eu) < 1 && Math.abs(c.cr - cr) < 1.3;
        if (mine && UI.res && Math.abs(c.eu - UI.res.fit.eu) < 0.01 && Math.abs(c.cr - UI.res.Lc) < 0.01) { c.deg = UI.res.touch ? UI.res.touch.deg : null; c.status = UI.res.status; c.side = UI.res.side; }
        return `<td class="${c.status}${mine ? " me" : ""}" title="${c.side > 0 ? c.side.toFixed(0) + " mm side-view overlap" : (-c.side).toFixed(0) + " mm clear in side view"}">${c.deg == null ? "—" : c.deg.toFixed(0) + "°"}</td>`; }).join("")}</tr>`).join("");
      host.innerHTML = `<table class="toegrid">${head}${rows}</table>`;
    }, now ? 0 : 60);
  }

  // ---------------------------------------------------------------- design chat (chat.js runs FrameChat.extra handlers)
  // "shoe size 13 US", "US 12.5 shoes", "foot length 290 mm", "toes in 5", "midfoot cleats", "toe overlap?"
  function chat(raw, text, ctx) {
    const t = String(text || raw).toLowerCase();
    if (!ctx || !ctx.apply) return null;
    const A = ctx.App || App(), F = ctx.fields(), fld = id => F.find(f => f.id === id);
    if (/\btoe (overlap|strike|clearance|hit)|\b(toe|toes|foot|feet|shoe)s? (hit|touch|rub|clip)|\bwill my (toe|foot|shoe)/.test(t) && !/\d/.test(t)) {
      const r = compute(A.design());
      return `**Toe overlap**: ${describe(r)}${r.touch && isFinite(r.turnR) ? ` (tightest pedalling circle ≈ ${(2 * r.turnR / 1000).toFixed(1)} m across)` : ""}. ${r.verdict}\n_With ${shoeText(r)}. Details and pictures in the Toe overlap card._`;
    }
    let m;
    // "shoe tip to cleat is 95 mm", "toe to cleat centre 102": the measured shoe, and switch to using it
    if (/\b(tip|toe)\b.{0,25}\bcleats?\b|\bcleats?\b.{0,25}\b(tip|toe)\b/.test(t) && (m = t.match(/(\d+(?:\.\d+)?)\s*(mm|cm)?/))) {
      const v = +m[1] * (m[2] === "cm" ? 10 : 1);
      if (v > 30 && v < 250) return ctx.apply([{ f: fld("fit.mTip"), v }, { f: fld("fit.shoeSource"), v: "shoe" }], "measured shoe") + "\n_Using your measured shoe in the Toe overlap card. Add the shoe width there too if you have it._";
    }
    if (/\b(shoe|shoes|boot|boots|feet|foot)\b/.test(t) && !/\b(width|wide|length|height|q.?factor)\b/.test(t) && (m = t.match(/(\d+(?:\.\d+)?)/))) {
      const v = +m[1];
      let sys = /\bmm\b|foot length|feet length/.test(t) || v > 120 ? "mm" : /\bwom[ae]n'?s?\b|\bladies\b/.test(t) ? "usw" : /\bus\b|\bus\d|\busa\b|american/.test(t) ? "usm" : /\buk\b|british/.test(t) ? "uk" : /\beu\b|\beur|euro/.test(t) ? "eu" : null;
      if (!sys && /\b(size|sized)\b/.test(t)) sys = v < 30 ? "usm" : "eu";
      if (!sys) return null;
      const eu = toEU(v, sys);
      if (!(eu > 30 && eu < 57)) return `That shoe size works out to EU ${isFinite(eu) ? eu.toFixed(1) : "?"}, outside what I can model (EU 31–56).`;
      const ch = [{ f: fld("fit.shoeEU"), v: Math.round(eu * 10) / 10 }]; if (String(fld("fit.shoeSys").get() || "eu") !== sys) ch.push({ f: fld("fit.shoeSys"), v: sys });
      const out = ctx.apply(ch, "shoe");
      return out + `\n_${sizeText(eu)} — toe overlap is in the Toe overlap card._`;
    }
    if ((m = t.match(/\btoes? (?:pointing |point |pointed )?(in|out|inward|outward)(?: by)? (\d+(?:\.\d+)?)/)))
      return ctx.apply([{ f: fld("fit.toeAngle"), v: (/^in/.test(m[1]) ? -1 : 1) * +m[2] }], "toe angle");
    if (/\bcleats?\b/.test(t) && !/\d/.test(t)) {
      const cb = /mid ?foot|arch/.test(t) ? 35 : /\b(back|rearward)\b/.test(t) ? 15 : /\bball\b|normal|standard/.test(t) ? 0 : null;
      if (cb != null) return ctx.apply([{ f: fld("fit.cleatBack"), v: cb }], "cleat");
    }
    if (/\b(mudguards?|fenders?)\b/.test(t) && !/\bgap|clearance\b/.test(t) && !/\d/.test(t)) {
      const neg = /\b(no|remove|without|off|take off|none)\b/.test(t), pos = /\b(add|with|fit|fitted|full|on|yes|put)\b/.test(t);
      if (neg || pos) return ctx.apply([{ f: fld("fit.fender"), v: neg ? "none" : "full" }], "mudguard");
    }
    return null;
  }
  if (root.FrameChat && Array.isArray(root.FrameChat.extra)) root.FrameChat.extra.push(chat);
  // tour stops (tour.js), right after the builder checklist
  try {
    const TT = root.FrameTour && root.FrameTour.TOURS;
    const stop = n => ({ sel: "#toeCard", title: n ? n + " · Toe overlap" : "Toe overlap", text: "Will your shoe hit the front tyre? It matters most on small frames, fat tyres and 32\" wheels. Start from your shoe size, then measure your own shoe (tip to cleat, two minutes with a ruler) to make it exact. It shows the side-view overlap, how far you can turn the bars before the toe touches, who else would hit it, and what other front tyres would do." });
    if (TT) for (const [name, label] of [["basics", ""], ["refine", "8b"]]) {
      const L = TT[name]; if (!L || L.some(s => s.sel === "#toeCard")) continue;
      const i = L.findIndex(s => s.sel === "#checkCard"); L.splice(i >= 0 ? i + 1 : L.length, 0, stop(label));
    }
  } catch (e) {}

  const api = { chat, compute, settings, shoeDims, gapAt, grid, band, checkRow, tyreWhatIf, describe, shoeText, toEU, fromEU, footLength, sizeText, render,
    SHOES, SYSTEMS, FENDERS, SOURCES, DEFAULTS, RIDER_SIZES, GRID_EU, GRID_CRANK, TYRES, SPREAD, Q_DEFAULT, STANCE_DEFAULT };
  root.FrameToe = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
