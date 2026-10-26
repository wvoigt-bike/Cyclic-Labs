// ============================================================================
//  PART SHAPES for the realistic view: chainring, chain, singlespeed cog,
//  headset / spacers / stem / top cap, handlebar, grips.
//
//  Everything that makes one product look different from another is DATA in
//  the SHAPES table below (one entry per shape preset). To add a product:
//    1. add (or reuse) a preset here, e.g. SHAPES.stem.myStem = { ... },
//    2. add its key to the matching select list in partlib.js (same key),
//    3. add a library part that uses it (partlib.js CATALOG or my_parts.js).
//  The builders further down read the preset numbers; no per-product code.
//  Display only: nothing here touches the analysis.
//  Units: mm. Used by bike3d.js (buildBike) through FrameShapes.*.
// ============================================================================
(function (root) {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const pitchR = N => 12.7 / (2 * Math.sin(Math.PI / N));
  const D2R = Math.PI / 180, TAU = 2 * Math.PI;
  // groove profile: 0 on the flat, rising to 1 in a narrow groove every unit of x
  const groove = (x, w) => smooth(1 - (w || 0.22), 1, 0.5 + 0.5 * Math.cos(TAU * x));

  // ---------------------------------------------------------------- SHAPES (data)
  const SHAPES = {
    // stem body: exp = squareness of the body section (2 round … 6 boxy), h/w = body height / width at the
    // steerer and at the bar (mm), pocket = I-beam web width (0 = solid sides), rS = steerer clamp outer radius,
    // ch = edge chamfer, clampW = bar clamp width, wall = bar clamp wall
    stem: {
      forged: { label: "Forged alloy, boxy (most trail stems)", exp: 3.6, h: [24, 21], w: [27, 24], pocket: 0, rS: 20.6, ch: 1.6, clampW: 50, wall: 4.6 },
      cnc: { label: "CNC-machined, pocketed sides", exp: 5.5, h: [27, 24], w: [29, 26], pocket: 0.48, rS: 20.8, ch: 0.7, clampW: 52, wall: 5 },
      round: { label: "Rounded tube (Thomson-style)", exp: 2.1, h: [23, 20], w: [23, 20], pocket: 0, rS: 20.2, ch: 2.4, clampW: 46, wall: 4.4 },
      xc: { label: "Slim XC / road", exp: 3.0, h: [21, 18], w: [22, 19], pocket: 0, rS: 19.6, ch: 1.2, clampW: 42, wall: 4.2 },
      // split: two separate narrow bar clamps (w mm wide each) that wrap 240° (over the top, round the front, closing underneath),
      // bar visible between them; web = external stiffening ribs on the body sides
      apex: { label: "Renthal Apex (CNC, two 240° wrap clamps)", exp: 5.2, h: [26, 23], w: [30, 27], pocket: 0.5, rS: 20.8, ch: 0.8, clampW: 60, wall: 5, split: { w: 14 }, web: true }
    },
    // headset top: h = height of the visible cover/cup above the head tube
    headset: {
      zs: { label: "Integrated / ZS (slim cone cover)", h: 7 },
      inset: { label: "Chris King InSet-style (cup lip + cover)", h: 8.5 },
      external: { label: "External cups", h: 13 },
      acr: { label: "FSA ACR (integrated cable-routing top cover)", h: 10.9 }
    },
    // top cap profiles [[r, height]] (bolt sits in the recess of radius 'recess')
    topCap: {
      flat: { label: "Flat alloy cap", prof: [[0, 0], [17.4, 0], [17.8, 0.6], [17.8, 3.4], [16.6, 4.4], [8, 4.4], [7.4, 3.6], [0, 3.6]], recess: 3.6 },
      domed: { label: "Domed cap", prof: [[0, 0], [17.6, 0], [17.6, 1.8], [16.2, 4.4], [12, 6.2], [8.2, 6.6], [7.4, 4.8], [0, 4.8]], recess: 4.8 },
      flush: { label: "Low flush cap (sunk into the stem)", prof: [[0, 0], [16.2, 0], [16.2, 1.4], [15.6, 2], [7.6, 2], [7.4, 1.2], [0, 1.2]], recess: 1.2 }
    },
    // handlebar: taper = [a0, a1] distance from the centre where the clamp diameter tapers to the grip diameter,
    // rise = [a0, a1] where the rise bend happens, sweep = [a0, a1] where back/upsweep bend in, endD = grip-area diameter
    bar: {
      flat: { label: "MTB riser / flat bar", taper: [48, 112], rise: [62, 135], sweep: [130, 215], endD: 22.2 },
      drop: { label: "Drop bar", taper: [48, 90], reach: 78, drop: 122, flare: 12, endD: 23.8 }
    },
    // grip patterns: f(s along the grip mm, c around mm) → 0..1 raised, amp = height of the pattern (mm)
    grip: {
      waffle: { label: "Waffle (square blocks)", amp: 0.75, f: (s, c) => 1 - Math.max(groove(s / 4.6, 0.2), groove(c / 4.6, 0.2)) },
      diamond: { label: "Diamond knurl", amp: 0.6, f: (s, c) => 1 - Math.max(groove((s + c) / 5.2, 0.2), groove((s - c) / 5.2, 0.2)) },
      ribbed: { label: "Ribbed rings", amp: 0.7, f: (s) => 1 - groove(s / 3.4, 0.35) },
      mushroom: { label: "Mushroom fins", amp: 1.5, f: (s, c) => Math.pow(0.5 + 0.5 * Math.cos(TAU * c / 6), 3) },
      hex: { label: "Hex / honeycomb", amp: 0.6, f: (s, c) => { const a = groove(c / 5), b = groove((c * 0.5 + s * 0.866) / 5), d = groove((c * 0.5 - s * 0.866) / 5); return 1 - Math.max(a, b, d); } },
      smooth: { label: "Smooth", amp: 0, f: () => 0 },
      tape: { label: "Bar tape (spiral wrap)", amp: 0.45, f: (s, c, th) => Math.pow(0.5 + 0.5 * Math.cos(TAU * (s / 26 + th / TAU)), 12) }
    },
    gripType: {
      lockon2: { label: "Lock-on, two collars", inner: true, outer: true },
      lockon1: { label: "Lock-on, one inner collar", inner: true, outer: false },
      pushon: { label: "Push-on (no collars)", inner: false, outer: false }
    },
    // chainring web: windows n, armW arm width (mm), rIn inner radius of the windows, band = solid band under the teeth,
    // sq = window squareness (0.2 boxy … 1 oval), taper = windows narrow towards the centre, twist = swept arms,
    // ch = machined chamfer round the windows (mm), logo = default engraved text
    ring: {
      xsync2: { label: "SRAM X-Sync 2 (6 machined windows)", n: 6, armW: 7, rIn: 30, band: 8.2, sq: 0.32, taper: 0.3, twist: 0, ch: 0.9, logo: "X-SYNC 2" },
      wolftooth: { label: "Wolf Tooth (5 rounded windows)", n: 5, armW: 9.5, rIn: 31.5, band: 9.2, sq: 0.6, taper: 0.55, twist: 0.1, ch: 0.6, logo: "WOLF TOOTH" },
      raceface: { label: "Race Face (4 swept arms)", n: 4, armW: 9, rIn: 30, band: 9, sq: 0.42, taper: 0.4, twist: 0.32, ch: 0.7, logo: "RACE FACE" },
      solid: { label: "Solid web (no windows)", n: 0, band: 8, ch: 0, logo: "" },
      // aero: solid disc face with concentric machining lines and a polished step ring under the teeth
      alugearAero: { label: "Alugear Aero (solid disc, no windows)", n: 0, band: 8, ch: 0, logo: "ALUGEAR", aero: { lines: 0.6 } }
    },
    // how the ring fixes to the crank: hole = centre hole radius; bolts = visible bolts on the outer face at boltR
    mount: {
      sram3: { label: "Direct mount, SRAM 3-bolt", hole: 20.5, bolts: 3, boltR: 24.5, lockring: false },
      shimano: { label: "Direct mount, Shimano (lockring)", hole: 20.5, bolts: 0, lockring: true },
      cinch: { label: "Direct mount, Race Face Cinch", hole: 20.5, bolts: 0, splines: 18 },
      bcd104: { label: "104 BCD, 4-bolt on a spider", hole: 45.5, bolts: 4, boltR: 52, spider: true },
      bcd107: { label: "107 BCD, 4-bolt on a spider (SRAM AXS / Quarq power-meter spider)", hole: 45.5, bolts: 4, boltR: 53.5, spider: true }
    },
    // singlespeed cog: thick = tooth thickness, base = width of the wide base on the freehub, holes = lightening holes
    cog: {
      wmfg: { label: "Machined steel, wide base (Wheels Mfg-style)", thick: 2.3, base: 5.6, holes: 0 },
      stamped: { label: "Stamped steel, 6 holes", thick: 2.0, base: 2.0, holes: 6 },
      alloy: { label: "Alloy, wide, 5 windows (Chris King / Hope-style)", thick: 2.6, base: 6.5, holes: 5 }
    },
    // crank arm: wS/wE = arm width (in the crank plane) at the spindle / pedal end, tS/tE = thickness, exp = squareness,
    // ridge = raised spine on the outside face (mm), boss = spindle-end boss radius, insert = metal pedal-thread insert ring,
    // extractor = self-extracting bolt cap on the non-drive arm, flare = how far the spindle end flares out
    crank: {
      generic: { label: "Generic forged arm", wS: 38, wE: 23, tS: 17, tE: 14.4, exp: 3, ridge: 0, boss: 21, insert: false, extractor: false, flare: 0 },
      sramCarbon: { label: "SRAM carbon (XX1 / X01 Eagle: hollow, sculpted spine)", wS: 42, wE: 22, tS: 18, tE: 13.5, exp: 3.6, ridge: 1.6, boss: 22.5, insert: true, extractor: true, flare: 6 }
    },
    // dropper head: bolts = saddle-clamp bolts (2 = fore/aft, heads underneath), slotted = slotted top cradle, h = head height,
    // L = cradle length, valve = Schrader valve under the head
    postHead: {
      generic: { label: "Generic one-piece head", bolts: 2, slotted: false, h: 20, L: 68, valve: false },
      oneupV2: { label: "OneUp V2 (low 2-bolt head, slotted top cradle)", bolts: 2, slotted: true, h: 17, L: 64, valve: true }
    },
    // chain plate colours (outer, inner)
    chain: {
      silver: { label: "Silver", outer: "#c4c6ca", inner: "#b7b9bd" },
      black: { label: "Black", outer: "#1d1d20", inner: "#1d1d20" },
      gold: { label: "Gold (XX1 / Ti-nitride)", outer: "#c9a24a", inner: "#c09541" },
      silverBlack: { label: "Silver outer / black inner", outer: "#c4c6ca", inner: "#202023" },
      goldBlack: { label: "Gold outer / black inner", outer: "#c9a24a", inner: "#202023" }
    }
  };
  const options = kind => Object.keys(SHAPES[kind]).map(k => [k, SHAPES[kind][k].label]);
  const pick = (kind, key, dflt) => SHAPES[kind][key] || SHAPES[kind][dflt || Object.keys(SHAPES[kind])[0]];

  // ---------------------------------------------------------------- geometry helpers
  const GL = () => root.Bike3DGL;
  // parametric surface P(u, v) (u, v in 0..1) with finite-difference normals pointing away from centre(u, v)
  function surface(Mk, nu, nv, P, o) {
    o = o || {}; const V = GL().V, e = 1e-3;
    Mk.grid(nu, nv, (i, j) => {
      const u = i / nu, v = j / nv, p = P(u, v);
      const du = V.sub(P(Math.min(1, u + e), v), P(Math.max(0, u - e), v));
      const dv = V.sub(P(u, o.wrap ? v + e : Math.min(1, v + e)), P(u, o.wrap ? v - e : Math.max(0, v - e)));
      let n = V.cross(du, dv);
      if (V.len(n) < 1e-12) { const uu = u > 0.5 ? u - 0.03 : u + 0.03, q = P(uu, v); n = V.cross(V.sub(P(Math.min(1, uu + e), v), P(uu - e, v)), V.sub(P(uu, v + e), P(uu, v - e))); if (o.center && V.dot(n, V.sub(q, o.center(uu, v))) < 0) n = V.mul(n, -1); }
      else if (o.center && V.dot(n, V.sub(p, o.center(u, v))) < 0) n = V.mul(n, -1);
      if (o.flip) n = V.mul(n, -1);
      return { p, n: V.norm(n), uv: o.uv ? o.uv(u, v) : [u, v], t: V.norm(du), c: o.col ? o.col(u, v) : null };
    });
  }
  // closed solid ring sector round an axis: rIn..rOut, half width hw along the axis, angles a0..a1 measured from e1 towards e2,
  // chamfer ch on the outer edges, end faces at a0 / a1 (skipped for a full ring)
  function ringSector(Mk, c, axis, e1, e2, rIn, rOut, hw, a0, a1, seg, ch) {
    const G = GL(), V = G.V; ch = ch || 0;
    const prof = [[rIn, -hw], [rOut - ch, -hw], [rOut - ch, -hw], [rOut, -hw + ch], [rOut, -hw + ch], [rOut, hw - ch], [rOut, hw - ch], [rOut - ch, hw], [rOut - ch, hw], [rIn, hw], [rIn, hw], [rIn, -hw]];
    if (!ch) prof.splice(1, 8, [rOut, -hw], [rOut, -hw], [rOut, hw], [rOut, hw]);
    G.lathe(Mk, V.madd(c, axis, 0), axis, prof.map(p => [p[0], p[1]]), seg, { basis: [e1, e2], a0, a1 });
    if (a1 - a0 >= TAU - 1e-6) return;
    for (const [a, sg] of [[a0, -1], [a1, 1]]) {
      const rad = V.add(V.mul(e1, Math.cos(a)), V.mul(e2, Math.sin(a))), tg = V.mul(V.add(V.mul(e1, -Math.sin(a)), V.mul(e2, Math.cos(a))), sg);
      const pts = prof.filter((p, k) => k === 0 || p[0] !== prof[k - 1][0] || p[1] !== prof[k - 1][1]);
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const P3 = p => V.add(V.add(c, V.mul(rad, p[0])), V.mul(axis, p[1]));
      const ci = Mk.v(P3([cx, cy]), tg, [0, 0], rad), b0 = Mk.count;
      for (let k = 0; k <= pts.length; k++) Mk.v(P3(pts[k % pts.length]), tg, [0, 0], rad);
      for (let k = 0; k < pts.length; k++) Mk.tri(ci, b0 + k, b0 + k + 1);
    }
  }
  // flat single-sided face of a disc (texture: (0.5, 0.5) at the centre, half-width = R), normal +n
  function face(Mk, c, e1, e2, n, R, seg) {
    const V = GL().V, ci = Mk.v(c, n, [0.5, 0.5], e1), b0 = Mk.count;
    for (let j = 0; j <= seg; j++) { const t = j / seg * TAU, x = Math.cos(t), y = Math.sin(t); Mk.v(V.add(c, V.add(V.mul(e1, R * x), V.mul(e2, R * y))), n, [0.5 + 0.5 * x, 0.5 + 0.5 * y], e1); }
    for (let j = 0; j < seg; j++) Mk.tri(ci, b0 + j, b0 + j + 1);
  }
  // walls (and machined chamfers) round closed 2D outlines (holes) in a plate lying in the plane z = c[2] ± T
  function holeWalls(Mw, Mc, c, outlines, T, ch) {
    for (const ol of outlines) {
      const L = ol.length, nr = ol.map((p, k) => { const a = ol[(k - 1 + L) % L], b = ol[(k + 1) % L]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });
      // outlines are counter-clockwise: (dy, -dx) points out of the hole, into the material
      const P = (k, off, z) => [c[0] + ol[k % L][0] + nr[k % L][0] * off, c[1] + ol[k % L][1] + nr[k % L][1] * off, c[2] + z];
      const strip = (Mk, o0, z0, o1, z1, nf) => Mk.grid(1, L, (i, j) => ({ p: i ? P(j, o1, z1) : P(j, o0, z0), n: nf(j % L), uv: [j / L, i], t: [0, 0, 1] }));
      const inN = k => [-nr[k][0], -nr[k][1], 0];
      strip(Mw, 0, T - ch, 0, -T + ch, inN);
      if (ch > 0) {
        const s2 = Math.SQRT1_2;
        strip(Mc, ch, T, 0, T - ch, k => [-nr[k][0] * s2, -nr[k][1] * s2, s2]);
        strip(Mc, 0, -T + ch, ch, -T, k => [-nr[k][0] * s2, -nr[k][1] * s2, -s2]);
      }
    }
  }
  const ccw = pts => { let a = 0; for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a < 0 ? pts.slice().reverse() : pts; };
  function canvas(S) { const c = document.createElement("canvas"); c.width = c.height = S; return c; }
  // the renderer reads texture colours as linear values: convert a #rrggbb (sRGB) colour so it shows as picked
  const linCss = hex => { const n = parseInt(String(hex || "#222222").slice(1, 7), 16) || 0; return "rgb(" + [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { const c = v / 255; return Math.round(255 * (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); }).join(",") + ")"; };

  // ---------------------------------------------------------------- sprocket teeth (chainring, cog)
  // c = centre (sprocket in the x-y plane at z = c[2]); o.phase = angle of a roller seat; tooth k sits between seats k and k+1.
  // o.H = tip height above the pitch circle, o.tb(k) = half thickness at the root, o.thin = how much the tip thins (0..1)
  function teeth(Mk, c, N, o) {
    const V = GL().V, pr = pitchR(N), al = TAU / N, rho = 3.97, rSeat = pr - rho, r0 = rSeat - 1.0, rTip = pr + o.H, wt = 0.75, rA = pr + 0.5 * rho, rT1 = rTip - wt, hA = al / 2;
    const wR = r => { if (r <= rSeat) return r * Math.sin(hA) * 0.995; const cc = clamp((r * r + pr * pr - rho * rho) / (2 * r * pr), -1, 1); return r * Math.sin(Math.max(0, hA - Math.acos(cc))); };
    const wA = wR(rA);
    const w = r => r <= rA ? wR(r) : r <= rT1 ? lerp(wA, wt, Math.pow((r - rA) / (rT1 - rA), 0.85)) : wt * Math.sqrt(Math.max(0, 1 - ((r - rT1) / wt) ** 2));
    const tipF = r => r <= rT1 ? 1 : 0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - ((r - rT1) / wt) ** 2));
    const ex = 0.42;
    for (let k = 0; k < N; k++) {
      const th = o.phase + (k + 0.5) * al, R = [Math.cos(th), Math.sin(th), 0], T = [-Math.sin(th), Math.cos(th), 0], tb = o.tb(k);
      const rad = u => r0 + (rTip - r0) * (1 - Math.pow(1 - u, 1.35));
      const P = (u, v) => { const r = rad(u), ph = v * TAU, cs = Math.cos(ph), sn = Math.sin(ph), t = tb * (1 - o.thin * smooth(pr - 1.2, rTip, r)) * tipF(r);
        const y = w(r) * Math.sign(cs) * Math.pow(Math.abs(cs), ex), z = t * Math.sign(sn) * Math.pow(Math.abs(sn), ex);
        return [c[0] + R[0] * r + T[0] * y, c[1] + R[1] * r + T[1] * y, c[2] + z]; };
      surface(Mk, 9, 18, P, { wrap: true, center: u => { const r = rad(u); return [c[0] + R[0] * r, c[1] + R[1] * r, c[2]]; } });
    }
    return { pr, rSeat, rTip };
  }

  // ---------------------------------------------------------------- chain path + rollers
  // circles [{c:[x,y], r, s (+1 anticlockwise / -1 clockwise), z}] in the order the chain runs. The chain is laid
  // pitch by pitch from the LAST circle (the cog) so the rollers sit in its tooth seats, round the others, and the
  // span back into the cog takes up the leftover (with a little sag when opts.sag).
  function chainRollers(C, opts) {
    const n = C.length, seg = [], P = 12.7;
    const vel = (Cc, T) => { const rx = (T[0] - Cc.c[0]) / Cc.r, ry = (T[1] - Cc.c[1]) / Cc.r; return Cc.s > 0 ? [-ry, rx] : [ry, -rx]; };
    for (let i = 0; i < n; i++) {
      const A = C[i], Bc = C[(i + 1) % n]; let best = null;
      for (const sa of [1, -1]) for (const sb of [1, -1]) {
        const ra = sa * A.r, rb = sb * Bc.r, d = [Bc.c[0] - A.c[0], Bc.c[1] - A.c[1]], L = Math.hypot(d[0], d[1]); if (L < 1e-6) continue;
        const k = (ra - rb) / L; if (Math.abs(k) > 1) continue;
        const u = [d[0] / L, d[1] / L], v = [-u[1], u[0]], h = Math.sqrt(1 - k * k);
        for (const sg of [1, -1]) {
          const Nn = [u[0] * k + v[0] * h * sg, u[1] * k + v[1] * h * sg];
          const T1 = [A.c[0] + ra * Nn[0], A.c[1] + ra * Nn[1]], T2 = [Bc.c[0] + rb * Nn[0], Bc.c[1] + rb * Nn[1]];
          const dl = Math.hypot(T2[0] - T1[0], T2[1] - T1[1]) || 1, dir = [(T2[0] - T1[0]) / dl, (T2[1] - T1[1]) / dl];
          const va = vel(A, T1), vb = vel(Bc, T2);
          if (dir[0] * va[0] + dir[1] * va[1] > 0.98 && dir[0] * vb[0] + dir[1] * vb[1] > 0.98) best = [T1, T2];
        }
      }
      if (!best) return null;
      seg.push(best);
    }
    // dense path: arc of circle n-1, span to 0, arc 0, span ... , closing span (n-2 → n-1)
    const pts = []; let closeStart = 0;
    for (let q = 0; q < n; q++) {
      const i = (n - 1 + q) % n, Cc = C[i], entry = seg[(i - 1 + n) % n][1], exit = seg[i][0];
      let a0 = Math.atan2(entry[1] - Cc.c[1], entry[0] - Cc.c[0]), a1 = Math.atan2(exit[1] - Cc.c[1], exit[0] - Cc.c[0]);
      if (Cc.s > 0) { while (a1 < a0) a1 += TAU; } else { while (a1 > a0) a1 -= TAU; }
      const st = Math.max(2, Math.ceil(Math.abs(a1 - a0) * Cc.r / 0.8));
      for (let k = 0; k < st; k++) { const a = a0 + (a1 - a0) * k / st; pts.push([Cc.c[0] + Cc.r * Math.cos(a), Cc.c[1] + Cc.r * Math.sin(a), Cc.z]); }
      const nx = C[(i + 1) % n], T2 = seg[i][1], L = Math.hypot(T2[0] - exit[0], T2[1] - exit[1]), sn = Math.max(1, Math.ceil(L / 1.5));
      if (q === n - 1) closeStart = pts.length;
      const dx = (T2[0] - exit[0]) / (L || 1), dy = (T2[1] - exit[1]) / (L || 1); let nrm = [-dy, dx]; if (nrm[1] > 0) nrm = [-nrm[0], -nrm[1]];
      for (let k = 0; k < sn; k++) { const t = k / sn, sag = q === n - 1 && opts && opts.sag ? opts.sag * 4 * t * (1 - t) : 0;
        pts.push([exit[0] + (T2[0] - exit[0]) * t + nrm[0] * sag, exit[1] + (T2[1] - exit[1]) * t + nrm[1] * sag, Cc.z + (nx.z - Cc.z) * t]); }
    }
    // pitch-by-pitch (chord) stepping
    const V = GL().V, rol = [pts[0]]; let cur = pts[0], j = 0, t0 = 0, last = { j: 0, t: 0 };
    for (;;) {
      let found = false;
      for (; j < closeStart; j++) {
        const a = pts[j], b = pts[j + 1], d = V.sub(a, cur), e = V.sub(b, a), A2 = V.dot(e, e), B = V.dot(d, e), Cq = V.dot(d, d) - P * P, disc = B * B - A2 * Cq;
        if (A2 > 1e-12 && disc >= 0) { const s = (-B + Math.sqrt(disc)) / A2; if (s >= t0 - 1e-9 && s <= 1) { cur = V.madd(a, e, s); t0 = s; rol.push(cur); last = { j, t: s }; found = true; break; } }
        t0 = 0;
      }
      if (!found) break;
    }
    // closing span: evenly re-space so the loop closes with an even number of links
    const cv = [rol[rol.length - 1]]; for (let k = last.j + 1; k < pts.length; k++) cv.push(pts[k]); cv.push(pts[0]);
    const cum = [0]; for (let k = 1; k < cv.length; k++) cum.push(cum[k - 1] + V.dist(cv[k], cv[k - 1]));
    const Lc = cum[cum.length - 1], K = rol.length;
    let nb = Math.max(0, Math.round(Lc / P) - 1);
    if ((K + nb) % 2) nb += (Lc / P - Math.round(Lc / P) >= 0 || nb === 0) ? 1 : -1;
    let jj = 0;
    for (let q = 1; q <= nb; q++) { const s = Lc * q / (nb + 1); while (cum[jj + 1] < s) jj++; const tt = (s - cum[jj]) / ((cum[jj + 1] - cum[jj]) || 1); rol.push(V.lerp(cv[jj], cv[jj + 1], tt)); }
    // which tooth of a sprocket meets which kind of link (narrow-wide), and the seat phase
    const sprocket = (cc, r, z, N) => {
      const on = rol.map(p => Math.abs(Math.hypot(p[0] - cc[0], p[1] - cc[1]) - r) < 0.12 && Math.abs(p[2] - z) < 0.6);
      const k0 = on.indexOf(true); if (k0 < 0) return { phase: 0, wide: k => k % 2 === 0 };
      const ang = p => Math.atan2(p[1] - cc[1], p[0] - cc[0]), phase = ang(rol[k0]), al = TAU / N;
      let anchor = null;
      for (let k = 0; k < rol.length && anchor == null; k++) { const k2 = (k + 1) % rol.length; if (on[k] && on[k2]) { const m = V.lerp(rol[k], rol[k2], 0.5); let ti = Math.round((ang(m) - phase) / al - 0.5); ti = ((ti % N) + N) % N; anchor = { ti, outer: k % 2 === 0 }; } }
      if (!anchor) anchor = { ti: 0, outer: true };
      return { phase, wide: k => ((((k - anchor.ti) % 2) + 2) % 2 === 0) === anchor.outer };
    };
    return { rollers: rol, sprocket };
  }

  // chain plates, rollers and pins (one template per link type, copied along the loop)
  let chainTpl = null;
  function chainTemplates() {
    if (chainTpl) return chainTpl;
    const G = GL(), V = G.V, P = 12.7;
    const outline = (Ro, Hw) => { const o = [];
      for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + Math.PI * k / 12; o.push([P / 2 + Ro * Math.cos(a), Ro * Math.sin(a)]); }
      for (let k = 1; k < 8; k++) { const x = P / 2 - P * k / 8; o.push([x, Hw + (Ro - Hw) * (1 - Math.cos(TAU * x / P)) / 2]); }
      for (let k = 0; k <= 12; k++) { const a = Math.PI / 2 + Math.PI * k / 12; o.push([-P / 2 + Ro * Math.cos(a), Ro * Math.sin(a)]); }
      for (let k = 1; k < 8; k++) { const x = -P / 2 + P * k / 8; o.push([x, -(Hw + (Ro - Hw) * (1 - Math.cos(TAU * x / P)) / 2)]); }
      return o; };
    const plateMesh = (Mk, ol, zc, tp, bv) => {
      const L = ol.length, nr = ol.map((p, k) => { const a = ol[(k - 1 + L) % L], b = ol[(k + 1) % L]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });
      const ins = k => [ol[k][0] - nr[k][0] * bv, ol[k][1] - nr[k][1] * bv];
      for (const sg of [-1, 1]) { const z = zc + sg * tp / 2, ci = Mk.v([0, 0, z], [0, 0, sg], [0, 0], [1, 0, 0]), b0 = Mk.count; for (let k = 0; k <= L; k++) { const q = ins(k % L); Mk.v([q[0], q[1], z], [0, 0, sg], [0, 0], [1, 0, 0]); } for (let k = 0; k < L; k++) Mk.tri(ci, b0 + k, b0 + k + 1); }
      const rows = [[ins, zc + tp / 2, 0.7], [k => ol[k], zc + tp / 2 - bv, 0], [k => ol[k], zc - tp / 2 + bv, 0], [ins, zc - tp / 2, -0.7]];
      Mk.grid(3, L, (i, j) => { const k = j % L, [f, z, nz] = rows[i], q = f(k), nn = V.norm([nr[k][0], nr[k][1], nz]); return { p: [q[0], q[1], z], n: nn, uv: [0, 0], t: [1, 0, 0] }; });
    };
    const zi = 1.19 + 0.42, zo = 1.19 + 0.84 + 0.47, tp = 0.84;
    const outer = new G.Mesh(), inner = new G.Mesh(), pins = new G.Mesh(), roller = new G.Mesh();
    for (const s of [-1, 1]) plateMesh(outer, outline(4.25, 3.15), s * zo, tp, 0.24);
    for (const s of [-1, 1]) plateMesh(inner, outline(4.15, 3.75), s * zi, tp, 0.2);
    for (const s of [-1, 1]) for (const x of [-P / 2, P / 2]) G.lathe(pins, [x, 0, s * (zo + tp / 2)], [0, 0, s], [[1.95, -0.2], [1.95, 0.12], [1.55, 0.42], [0.8, 0.55], [0, 0.57]], 10);
    G.cyl(roller, [0, 0, -1.2], [0, 0, 1.2], 3.87, 3.87, 14, { caps: false });
    chainTpl = { outer, inner, pins, roller };
    return chainTpl;
  }
  function addXf(Mk, T, o, ex, ey, ez, sx) {
    const b0 = Mk.count;
    for (let k = 0; k < T.count; k++) {
      const x = T.p[k * 3] * (sx || 1), y = T.p[k * 3 + 1], z = T.p[k * 3 + 2], nx = T.n[k * 3], ny = T.n[k * 3 + 1], nz = T.n[k * 3 + 2];
      Mk.p.push(o[0] + ex[0] * x + ey[0] * y + ez[0] * z, o[1] + ex[1] * x + ey[1] * y + ez[1] * z, o[2] + ex[2] * x + ey[2] * y + ez[2] * z);
      Mk.n.push(ex[0] * nx + ey[0] * ny + ez[0] * nz, ex[1] * nx + ey[1] * ny + ez[1] * nz, ex[2] * nx + ey[2] * ny + ez[2] * nz);
      Mk.uv.push(0, 0); Mk.t.push(ex[0], ex[1], ex[2]); Mk.c.push(1, 1, 1);
    }
    for (const i of T.i) Mk.i.push(b0 + i);
  }
  // ctx: {M, dyn}; keys: {outer, inner, pin, roller} material keys
  function drawChain(ctx, rol, keys) {
    const V = GL().V, Tp = chainTemplates(), N = rol.length, Zz = [0, 0, 1];
    for (let k = 0; k < N; k++) {
      const a = rol[k], b = rol[(k + 1) % N], d = V.sub(b, a), L = V.len(d), ex = V.mul(d, 1 / (L || 1));
      const ez = V.norm(V.sub(Zz, V.mul(ex, V.dot(ex, Zz)))), ey = V.cross(ez, ex), mid = V.lerp(a, b, 0.5), sx = L / 12.7;
      if (k % 2 === 0) { addXf(ctx.M(keys.outer), Tp.outer, mid, ex, ey, ez, sx); addXf(ctx.M(keys.pin), Tp.pins, mid, ex, ey, ez, sx); }
      else addXf(ctx.M(keys.inner), Tp.inner, mid, ex, ey, ez, sx);
      addXf(ctx.M(keys.roller), Tp.roller, a, ex, ey, ez, 1);
    }
  }

  // ---------------------------------------------------------------- chainring
  // o: {c (centre), N, sh (SHAPES.ring), mt (SHAPES.mount), nw (narrow-wide), phase, wide(k), keys: {body, accent, crank}, color, logo, logoColor,
  //     armAng (crank arm angle, for the bolt pattern)}
  function chainring(ctx, o) {
    const G = GL(), V = G.V, sh = o.sh, mt = o.mt, c = o.c, N = o.N, pr = pitchR(N), rSeat = pr - 3.97, T = 1.65;
    const Mb = ctx.M(o.keys.body), Ma = ctx.M(o.keys.accent);
    teeth(Mb, c, N, { phase: o.phase, H: o.nw ? 4.6 : 3.8, thin: o.nw ? 0.55 : 0.45, tb: k => o.nw && N % 2 === 0 ? (o.wide(k) ? 1.75 : 1.05) : 1.4 });
    // windows (polar rounded trapezoids between the arms)
    const ro = rSeat - (sh.band || 8), hole = mt.hole, wins = [];
    if (sh.n > 0 && !mt.spider && ro - Math.max(sh.rIn, hole + 6) > 5) {
      const ri = Math.max(sh.rIn, hole + 6), wph = o.armAng + Math.PI / sh.n;
      for (let i = 0; i < sh.n; i++) {
        const tc = wph + i * TAU / sh.n, pts = [];
        for (let k = 0; k < 72; k++) {
          const ph = k / 72 * TAU, x = Math.sign(Math.cos(ph)) * Math.pow(Math.abs(Math.cos(ph)), sh.sq), y = Math.sign(Math.sin(ph)) * Math.pow(Math.abs(Math.sin(ph)), sh.sq);
          const fy = (y + 1) / 2, r = lerp(ri, ro, fy), hw = Math.max(0.02, Math.PI / sh.n - Math.asin(clamp(sh.armW / 2 / r, 0, 1))) * lerp(1 - sh.taper, 1, fy);
          const th = tc + x * hw + sh.twist * (fy - 0.5);
          pts.push([r * Math.cos(th), r * Math.sin(th)]);
        }
        wins.push(ccw(pts));
      }
    }
    const ch = sh.ch || 0;
    // face textures (outer face carries the engraved logo)
    const Rf = rSeat + 0.3, S = 1024, k = (S / 2) / Rf;
    const mk = withLogo => {
      const cv = canvas(S), x = cv.getContext("2d"); x.translate(S / 2, S / 2); x.scale(k, -k);
      x.fillStyle = sh.aero ? linCss(o.color || "#18181a") : (o.color || "#18181a"); x.beginPath(); x.arc(0, 0, Rf, 0, TAU); x.arc(0, 0, hole, 0, TAU, true); x.fill();
      if (mt.spider) for (let i = 0; i < 4; i++) { const a = o.armAng + Math.PI / 4 + i * Math.PI / 2; x.beginPath(); x.arc(mt.boltR * Math.cos(a), mt.boltR * Math.sin(a), 7.5, 0, TAU); x.fill(); }
      x.globalCompositeOperation = "destination-out";
      for (const w of wins) { x.beginPath(); w.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); if (ch) { x.lineWidth = ch * 2; x.stroke(); } }
      if (mt.spider) for (let i = 0; i < 4; i++) { const a = o.armAng + Math.PI / 4 + i * Math.PI / 2; x.beginPath(); x.arc(mt.boltR * Math.cos(a), mt.boltR * Math.sin(a), 4.2, 0, TAU); x.fill(); }
      x.globalCompositeOperation = "source-over";
      if (sh.aero) {
        // solid aero disc: fine concentric lathe lines (lighter / darker), a machined step ring below the teeth band
        const lw = sh.aero.lines || 0.6;
        for (let r = hole + 6; r < ro; r += lw) { x.strokeStyle = (Math.round(r / lw) % 2) ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.05)"; x.lineWidth = lw * 0.5; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); }
        x.strokeStyle = "rgba(255,255,255,0.08)"; x.lineWidth = 0.5; x.beginPath(); x.arc(0, 0, ro, 0, TAU); x.stroke();
        x.strokeStyle = "rgba(0,0,0,0.35)"; x.lineWidth = 0.5; x.beginPath(); x.arc(0, 0, ro - 0.8, 0, TAU); x.stroke();
        x.strokeStyle = "rgba(255,255,255,0.12)"; x.lineWidth = 0.6; x.beginPath(); x.arc(0, 0, hole + 6.2, 0, TAU); x.stroke();
      }
      if (withLogo) {
        const lc = sh.aero ? linCss(o.logoColor || "#8a8b8f") : (o.logoColor || "#8a8b8f"), rr = (ro + rSeat) / 2 - 0.3, hgt = Math.min(4.2, (rSeat - ro) * 0.55);
        const arcText = (txt, a0) => { if (!txt) return; x.font = "700 " + hgt.toFixed(2) + "px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = lc;
          const wsum = [...txt].reduce((s, ch2) => s + x.measureText(ch2).width * 1.08, 0); let a = a0 + wsum / 2 / rr;
          // upper half: reads clockwise, tops outward; lower half: reads anticlockwise, tops inward (both upright to the eye)
          const low = Math.sin(a0) < 0; if (low) a = a0 - wsum / 2 / rr;
          for (const ch2 of txt) { const wch = x.measureText(ch2).width * 1.08; a += (low ? 1 : -1) * wch / 2 / rr; x.save(); x.rotate(a - Math.PI / 2); x.translate(0, rr); x.scale(low ? -1 : 1, low ? 1 : -1); x.fillText(ch2, 0, 0); x.restore(); a += (low ? 1 : -1) * wch / 2 / rr; } };
        const lg = o.logo == null ? sh.logo : o.logo;
        arcText(lg, o.armAng + Math.PI * 0.62); arcText(N + "T", o.armAng + Math.PI * 1.62);
      }
      return cv;
    };
    const props = Object.assign({}, ctx.MAT[o.keys.body], { base: [1, 1, 1] }); delete props.map;
    const tex = (key, cv) => ctx.tex(key, cv, props);
    const keyF = "ringF_" + o.uid, keyB = "ringB_" + o.uid;
    const Mf = tex(keyF, mk(true)), Mbk = tex(keyB, mk(false));
    face(Mf, V.add(c, [0, 0, T]), [1, 0, 0], [0, 1, 0], [0, 0, 1], Rf, 180);
    face(Mbk, V.add(c, [0, 0, -T]), [1, 0, 0], [0, 1, 0], [0, 0, -1], Rf, 180);
    holeWalls(Mb, Ma, c, wins, T, ch);
    G.cyl(Mb, V.add(c, [0, 0, -T]), V.add(c, [0, 0, T]), rSeat, rSeat, 120, { caps: false });
    // centre / mount
    const Mbolt = ctx.M(o.keys.bolt || "steel"), Md = ctx.M("blackMatte");
    if (mt.spider) {
      // the crank's 4-arm spider behind the ring, chainring bolts through the tabs
      const Mc = ctx.M(o.keys.crank), zS = c[2] - T - 3.2;
      for (let i = 0; i < 4; i++) { const a = o.armAng + Math.PI / 4 + i * Math.PI / 2, bx = mt.boltR * Math.cos(a), by = mt.boltR * Math.sin(a);
        G.plate(Mc, [c[0], c[1], 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], G.hullCircles([[0, 0, 12], [bx * 0.55, by * 0.55, 8], [bx, by, 7.5]], 14), zS, c[2] - T - 0.05);
        G.lathe(Mbolt, [c[0] + bx, c[1] + by, c[2] + T], [0, 0, 1], [[0, 0], [5, 0], [5, 0.4], [4.6, 1.6], [0, 1.7]], 20);
        G.cyl(Md, [c[0] + bx, c[1] + by, c[2] + T + 1.65], [c[0] + bx, c[1] + by, c[2] + T + 1.75], 2.3, 2.3, 6); }
      G.cyl(Mb, V.add(c, [0, 0, -T]), V.add(c, [0, 0, T]), hole, hole, 90, { caps: false });
    } else {
      G.lathe(Mb, V.add(c, [0, 0, -T - 0.4]), [0, 0, 1], [[hole - 1.2, 0], [hole + 4.5, 0], [hole + 5.2, 0.6], [hole + 5.2, 2 * T + 0.2], [hole + 4.5, 2 * T + 0.8], [hole - 1.2, 2 * T + 0.8], [hole - 1.2, 2 * T + 0.8], [hole - 1.2, 0]], 64);
      if (mt.bolts) for (let i = 0; i < mt.bolts; i++) { const a = o.armAng + Math.PI / 2 + i * TAU / mt.bolts, bx = c[0] + mt.boltR * Math.cos(a), by = c[1] + mt.boltR * Math.sin(a), z0 = c[2] + T + 0.4;
        G.lathe(Mbolt, [bx, by, z0], [0, 0, 1], [[0, 0], [3.5, 0], [3.5, 1.2], [3.1, 1.9], [0, 2]], 16); G.cyl(Md, [bx, by, z0 + 1.9], [bx, by, z0 + 2.02], 1.7, 1.7, 6); }
      if (mt.lockring) { const z0 = c[2] + T + 0.4; G.lathe(ctx.M(o.keys.lock || "blackAnod"), [c[0], c[1], z0], [0, 0, 1], [[hole - 1.5, 0], [hole + 7, 0], [hole + 7, 2.6], [hole + 6.2, 3.4], [hole - 1.5, 3.4]], 48);
        for (let i = 0; i < 12; i++) { const a = i * TAU / 12, rr = hole + 6.4; G.blob(Md, [c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a), z0 + 2.4], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1], 1.1, 1.3, 1.1, 0.3, 4); } }
      if (mt.splines) for (let i = 0; i < mt.splines; i++) { const a = i * TAU / mt.splines, rr = hole + 0.1; G.blob(Md, [c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a), c[2]], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1], 1.0, 1.2, T + 0.8, 0.3, 4); }
    }
    return { rSeat };
  }

  // ---------------------------------------------------------------- singlespeed cog + spacers + lockring
  // o: {c (cog centre), N, sh (SHAPES.cog), phase, keys: {body, spacer, lock}, color, text, zHub (inboard end of the stack), zEnd (outboard end)}
  function ssCog(ctx, o) {
    const G = GL(), V = G.V, sh = o.sh, c = o.c, N = o.N, pr = pitchR(N), rSeat = pr - 3.97, T = sh.thick / 2, Mb = ctx.M(o.keys.body), rIn = 17.4;
    teeth(Mb, c, N, { phase: o.phase, H: 3.4, thin: 0.42, tb: () => T });
    const S = 512, Rf = rSeat + 0.3, k = (S / 2) / Rf, holes = [];
    if (sh.holes) for (let i = 0; i < sh.holes; i++) { const a = i * TAU / sh.holes + 0.3, rr = (rIn + 4 + rSeat - 3) / 2, rad = Math.min(5.5, (rSeat - 3 - rIn - 4) / 2 - 0.5);
      if (rad > 1.5) { const pts = []; for (let q = 0; q < 28; q++) { const t = q / 28 * TAU; pts.push([rr * Math.cos(a) + rad * Math.cos(t) * 1.25, rr * Math.sin(a) + rad * Math.sin(t)]); } holes.push(ccw(pts)); } }
    const mk = withLogo => { const cv = canvas(S), x = cv.getContext("2d"); x.translate(S / 2, S / 2); x.scale(k, -k);
      x.fillStyle = o.color || "#1a1a1c"; x.beginPath(); x.arc(0, 0, Rf, 0, TAU); x.arc(0, 0, rIn, 0, TAU, true); x.fill();
      x.globalCompositeOperation = "destination-out"; for (const h of holes) { x.beginPath(); h.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.fill(); }
      x.globalCompositeOperation = "source-over";
      if (withLogo) { const rr = (rIn + sh.base * 0 + rSeat) / 2 + 2.5, hgt = 2.6; x.fillStyle = o.logoColor || "#9c9ea2"; x.font = "700 " + hgt + "px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
        const arcText = (txt, a0) => { if (!txt) return; const wsum = [...txt].reduce((s, q) => s + x.measureText(q).width * 1.1, 0), low = Math.sin(a0) < 0; let a = a0 + (low ? -1 : 1) * wsum / 2 / rr;
          for (const q of txt) { const w = x.measureText(q).width * 1.1; a += (low ? 1 : -1) * w / 2 / rr; x.save(); x.rotate(a - Math.PI / 2); x.translate(0, rr); x.scale(low ? -1 : 1, low ? 1 : -1); x.fillText(q, 0, 0); x.restore(); a += (low ? 1 : -1) * w / 2 / rr; } };
        arcText(o.text || "", Math.PI / 2); arcText(N + "T", -Math.PI / 2); }
      return cv; };
    const props = Object.assign({}, ctx.MAT[o.keys.body], { base: [1, 1, 1] }); delete props.map;
    face(ctx.tex("cogF_" + o.uid, mk(true), props), V.add(c, [0, 0, T]), [1, 0, 0], [0, 1, 0], [0, 0, 1], Rf, 120);
    face(ctx.tex("cogB_" + o.uid, mk(false), props), V.add(c, [0, 0, -T]), [1, 0, 0], [0, 1, 0], [0, 0, -1], Rf, 120);
    holeWalls(Mb, Mb, c, holes, T, 0);
    G.cyl(Mb, V.add(c, [0, 0, -T]), V.add(c, [0, 0, T]), rSeat, rSeat, 90, { caps: false });
    // wide base on the freehub
    const hb = Math.max(T, sh.base / 2);
    G.lathe(Mb, V.add(c, [0, 0, -hb]), [0, 0, 1], [[rIn, 0], [rIn + 4.2, 0], [rIn + 4.8, 0.5], [rIn + 4.8, 2 * hb - 0.5], [rIn + 4.2, 2 * hb], [rIn, 2 * hb]], 64);
    // spacers either side (separate rings with chamfered edges), lockring outboard
    const Ms = ctx.M(o.keys.spacer), stack = (z0, z1) => { let z = z0; const pieces = [10, 5, 3, 2, 1];
      while (z1 - z > 0.6) { const w = pieces.find(p => p <= z1 - z + 0.01) || (z1 - z); G.lathe(Ms, [c[0], c[1], z], [0, 0, 1], [[rIn, 0.08], [18.3, 0.08], [18.7, 0.45], [18.7, w - 0.45], [18.3, w - 0.08], [rIn, w - 0.08]], 48); z += w; } };
    stack(o.zHub, c[2] - hb); stack(c[2] + hb, o.zEnd);
    const Ml = ctx.M(o.keys.lock), Md = ctx.M("blackMatte"), zl = o.zEnd;
    G.lathe(Ml, [c[0], c[1], zl], [0, 0, 1], [[13.2, 0], [19.6, 0], [19.6, 1.2], [18.6, 2.2], [16.6, 3.8], [13.2, 3.8]], 64);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; G.blob(Md, [c[0] + 13.6 * Math.cos(a), c[1] + 13.6 * Math.sin(a), zl + 3.2], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1], 1.0, 1.1, 0.8, 0.3, 4); }
    G.cyl(ctx.M("blackAnod"), [c[0], c[1], zl + 0.5], [c[0], c[1], zl + 3.3], 13.2, 12.5, 32);
  }

  // ---------------------------------------------------------------- headset cover, spacers, stem, top cap
  // o: {htA (head-tube top centre), up, fw (stem direction), rTop, headset (SHAPES.headset), spacers mm, clampH, len, sh (SHAPES.stem),
  //     barD, faceplate 2|4, cap (SHAPES.topCap), keys: {headset, spacer, stem, bolt, cap}, logo, logoColor}. Returns {stemBase, stemC, barC}
  function stem(ctx, o) {
    const G = GL(), V = G.V, up = o.up, sh = o.sh, Z = [0, 0, 1];
    const base = V.madd(o.stemFrom || o.htA, up, o.headset.h + o.spacers), stemC = V.madd(base, up, o.clampH / 2), barC = V.madd(stemC, o.fw, o.len);
    const out = { stemBase: base, stemC, barC };
    const rT = o.rTop, h = o.headset.h;
    if (o.drawHeadset) {
    // headset cover above the head tube
    const HP = {
      zs: [[0, 0], [rT + 0.3, 0], [rT + 0.3, 1.3], [rT - 0.6, 2.2], [19.4, h - 0.7], [18.8, h], [0, h]],
      inset: [[0, 0], [rT + 0.5, 0], [rT + 0.5, 2.4], [rT - 0.4, 3.0], [rT - 2.4, 3.0], [rT - 2.4, 3.0], [19.8, h - 1], [19.0, h], [0, h]],
      external: [[0, 0], [rT + 1.6, 0], [rT + 1.6, h - 5], [rT + 0.9, h - 4], [20, h - 1.2], [19, h], [0, h]],
      // FSA ACR: a tall, nearly straight cover the hoses run under, stepping in to the stem's lower edge
      acr: [[0, 0], [rT + 0.4, 0], [rT + 0.4, h * 0.55], [rT - 0.6, h - 1.4], [rT - 2.2, h], [0, h]]
    }[o.headsetKey] || [[0, 0], [rT + 0.3, 0], [rT + 0.3, 1.3], [18.8, h], [0, h]];
    G.lathe(ctx.M(o.keys.headset), o.htA, up, HP, 64);
    }
    if (!o.draw) return out;
    const Ms = ctx.M(o.keys.spacer), Mt = ctx.M(o.keys.stem), Mbo = ctx.M(o.keys.bolt), Md = ctx.M("blackMatte");
    const htA = o.stemFrom || o.htA;
    // spacers
    let z = h; const pieces = [10, 5, 2.5];
    while (o.spacers - (z - h) > 0.4) { const w = pieces.find(p => p <= o.spacers - (z - h) + 0.01) || (o.spacers - (z - h));
      G.lathe(Ms, V.madd(htA, up, z), up, [[14.4, 0.06], [17.5, 0.06], [17.9, 0.4], [17.9, w - 0.4], [17.5, w - 0.06], [14.4, w - 0.06]], 48); z += w; }
    // steerer (seen through the clamp slot)
    G.cyl(Md, V.madd(base, up, -1), V.madd(base, up, o.clampH - 2.5), 14.3, 14.3, 24);
    // steerer clamp: ring split at the back, two pinch-bolt ears
    const fwP = V.norm(V.sub(o.fw, V.mul(up, V.dot(o.fw, up)))), back = V.mul(fwP, -1), lat = V.norm(V.cross(up, back));
    const rS = sh.rS, gapA = 0.09;
    ringSector(Mt, V.madd(base, up, o.clampH / 2), up, back, lat, 14.3, rS, o.clampH / 2, gapA, TAU - gapA, 56, sh.ch);
    for (const sg of [-1, 1]) G.blob(Mt, V.add(V.madd(V.madd(base, up, o.clampH / 2), back, rS - 1.5), V.mul(lat, sg * 5.3)), back, lat, up, 6.2, 4.4, o.clampH / 2 - sh.ch * 0.6, 0.28, 10);
    for (const f of [0.27, 0.73]) { const bp = V.madd(V.madd(base, up, o.clampH * f), back, rS + 0.6), hd = V.madd(bp, lat, 9.6);
      G.cyl(Mbo, hd, V.madd(hd, lat, 4.2), 4.15, 4.15, 18); G.cyl(Md, V.madd(hd, lat, 4.2), V.madd(hd, lat, 4.28), 1.9, 1.9, 6); G.cyl(Mbo, V.madd(bp, lat, -9.7), V.madd(bp, lat, -9.2), 2.4, 2.4, 10); }
    // body from the steerer clamp to the bar clamp (I-beam when pocketed)
    const bu0 = V.norm(V.cross(Z, o.fw)), bu = V.dot(bu0, up) < 0 ? V.mul(bu0, -1) : bu0, rB = o.barD / 2, wallB = sh.wall;
    const p0 = V.madd(stemC, o.fw, rS - 4), p1 = V.madd(barC, o.fw, -(rB + wallB - 2)), np = 8, bp = [];
    if (V.dist(p0, p1) > 2 && V.dot(V.sub(p1, p0), o.fw) > 0) {
      for (let k = 0; k <= np; k++) bp.push(V.lerp(p0, p1, k / np));
      const hh = bp.map((_, k) => lerp(sh.h[0], sh.h[1], k / np) / 2), ww = bp.map((_, k) => lerp(sh.w[0], sh.w[1], k / np) / 2);
      if (sh.pocket > 0) {
        G.sweep(Mt, bp, { rh: hh.map(v => v * 0.82), rw: ww.map(v => v * sh.pocket), exp: 4, ref: Z, seg: 20 });
        for (const sg of [-1, 1]) { const fl = bp.map((p, k) => V.madd(p, bu, sg * (hh[k] - 2.4))); G.sweep(Mt, fl, { rh: 2.4, rw: ww, exp: sh.exp, ref: Z, seg: 20 }); }
      } else G.sweep(Mt, bp, { rh: hh, rw: ww, exp: sh.exp, ref: Z, seg: 24 });
      // logo on top of the body
      if (o.logo && V.dist(p0, p1) > 16) {
        const L = V.dist(p0, p1), Mk = ctx.tex("stemLogo_" + o.logo + o.logoColor, ctx.texText(o.logo, "italic 800 150px 'Arial Black', Arial, sans-serif", o.logoColor || "#d8d8d8", null, 768, 192), { base: [1, 1, 1], decal: true, rough: 0.35, clear: 0.6 });
        const t0 = 0.08, t1 = 0.92, wl = Math.min((t1 - t0) * L / 4, ww[np] * 0.62);
        Mk.grid(8, 2, (i, j) => { const t = lerp(t0, t1, i / 8), kk = Math.min(np, Math.round(t * np)), y = lerp(-wl, wl, j / 2), hT = hh[kk] * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y) / ww[kk], sh.exp)), 1 / sh.exp) + 0.12;
          return { p: V.add(V.madd(V.lerp(p0, p1, t), bu, hT), [0, 0, y]), n: bu, uv: [i / 8, 1 - j / 2], t: o.fw }; });
      }
    }
    // external webbing: a thin rib along each side of the body (Renthal Apex-style)
    if (sh.web && bp.length) for (const sg of [-1, 1]) { const ww0 = bp.map((_, k) => lerp(sh.w[0], sh.w[1], k / np) / 2);
      G.sweep(Mt, bp.map((p, k) => V.add(p, [0, 0, sg * (ww0[k] - 0.6)])), { rh: bp.map((_, k) => lerp(sh.h[0], sh.h[1], k / np) * 0.18), rw: 1.6, exp: 3, ref: Z, seg: 12 }); }
    const hw = sh.clampW / 2, rO = rB + wallB;
    if (sh.split) {
      // two separate clamps at the outer edges; each wraps 240° from the upper back, over the top and round the front,
      // closing underneath on a jaw of the body with two bolts. The bar shows between them.
      const cw = sh.split.w / 2, jawA0 = 150 * D2R, jawA1 = 270 * D2R;
      // body: centre web behind the bar joining the two jaws, and the jaws themselves (rear-bottom 120°)
      ringSector(Mt, barC, Z, o.fw, bu, rB, rO, hw - 2 * cw, 120 * D2R, 220 * D2R, 24, sh.ch);
      for (const sg of [-1, 1]) {
        const cz = V.add(barC, [0, 0, sg * (hw - cw)]);
        ringSector(Mt, cz, Z, o.fw, bu, rB, rO, cw, jawA0 - 0.03, jawA1 + 0.02, 28, sh.ch);
        // clamp: 240° from the top-back over the front to the bottom, small gap where it meets the jaw underneath
        ringSector(Mt, cz, Z, o.fw, bu, rB, rO - 0.3, cw - 0.25, jawA1 + 0.07 - TAU, jawA0 - 0.06, 44, sh.ch);
        // bolt ears under the bar (clamp side in front, jaw side behind), two bolts per clamp pulling fore-aft
        const dn = V.mul(bu, -1), earC = V.madd(cz, dn, rO + 1.6);
        G.blob(Mt, V.madd(earC, o.fw, 4.2), o.fw, dn, Z, 4.4, 3.6, cw - 0.4, 0.3, 10);
        G.blob(Mt, V.madd(earC, o.fw, -4.6), o.fw, dn, Z, 4.6, 3.6, cw - 0.4, 0.3, 10);
        for (const zz of [-cw * 0.45, cw * 0.45]) { const b0 = V.add(V.madd(earC, o.fw, 8.4), [0, 0, zz]);
          G.cyl(Mbo, b0, V.madd(b0, o.fw, 3.4), 3.6, 3.6, 16); G.cyl(Md, V.madd(b0, o.fw, 3.4), V.madd(b0, o.fw, 3.48), 1.7, 1.7, 6); }
      }
    } else {
    // bar clamp: rear half on the body, faceplate in front, slits top and bottom
    ringSector(Mt, barC, Z, o.fw, bu, rB, rO, hw, 1.78, TAU - 1.78, 40, sh.ch);
    // faceplate: a flat-fronted plate with rounded corners wrapped round the front of the bar (rounder for round stems)
    const fd = (rO + 0.4) / 2, fh = rB + wallB + 2.6, fe = sh.exp <= 2.5 ? 0.45 : 0.24;
    G.blob(Mt, V.madd(barC, o.fw, 0.7 + fd), o.fw, bu, Z, fd, fh, hw - 0.4, fe, 14);
    for (const sg of [-1, 1]) {
      const ec = V.madd(barC, bu, sg * (rB + 4.2));
      G.blob(Mt, V.madd(ec, o.fw, -3.4), o.fw, bu, Z, 2.7, 4.2, hw - 0.4, 0.25, 10);
      const zs = o.faceplate === 2 ? [0] : [-(hw - 8.5), hw - 8.5];
      for (const zz of zs) { const b0 = V.add(V.madd(V.madd(barC, bu, sg * (rB + 3.4)), o.fw, 0.7 + 2 * fd - 0.6), [0, 0, zz]); G.cyl(Mbo, b0, V.madd(b0, o.fw, 3.2), 4.1, 4.1, 18); G.cyl(Md, V.madd(b0, o.fw, 3.2), V.madd(b0, o.fw, 3.28), 1.9, 1.9, 6); }
    }
    }
    // spacers on top of the stem (steerer left long), then the top cap
    const above = Math.max(0, o.spacersAbove || 0);
    if (above > 0.4) {
      G.cyl(Md, V.madd(base, up, o.clampH - 3), V.madd(base, up, o.clampH + above - 1), 14.3, 14.3, 24);
      let za = 0; while (above - za > 0.4) { const w = [10, 5, 2.5].find(q => q <= above - za + 0.01) || (above - za);
        G.lathe(Ms, V.madd(base, up, o.clampH + za), up, [[14.4, 0.06], [17.5, 0.06], [17.9, 0.4], [17.9, w - 0.4], [17.5, w - 0.06], [14.4, w - 0.06]], 48); za += w; }
    }
    const capB = V.madd(base, up, o.clampH + (above > 0.4 ? above : 0)), Mc = ctx.M(o.keys.cap);
    G.lathe(Mc, capB, up, o.cap.prof, 56);
    const rb = V.madd(capB, up, o.cap.recess);
    G.cyl(Mbo, rb, V.madd(rb, up, 2.6), 5, 5, 20); G.cyl(Md, V.madd(rb, up, 2.6), V.madd(rb, up, 2.68), 2.6, 2.6, 6);
    return out;
  }

  // ---------------------------------------------------------------- tube along a path with a radius function (bars, grips, tape)
  // path(s) → point for s in [s0, s1]; rad(s, th) → radius; frame: th = 0 up (+y), th = 90° forward (+x)
  function tube(Mk, path, s0, s1, nu, nv, rad, o) {
    const V = GL().V; o = o || {};
    const fr = s => { const e = 0.05 * Math.sign(s1 - s0) || 0.05, a = path(s - e), b = path(s + e), t = V.norm(V.sub(b, a)); let up = V.sub([0, 1, 0], V.mul(t, t[1])); if (V.len(up) < 1e-3) up = [1, 0, 0]; up = V.norm(up); const fwd = V.cross(up, t); return { t, up, fwd: V.dot(fwd, [1, 0, 0]) < 0 ? V.mul(fwd, -1) : fwd }; };
    // the frame and centre point depend only on s: cache them (surface() asks for the same s ~6× per vertex row)
    const memo = new Map(), at = s => { let q = memo.get(s); if (!q) { q = { F: fr(s), c: path(s) }; memo.set(s, q); } return q; };
    surface(Mk, nu, nv, (u, v) => { const s = lerp(s0, s1, u), th = v * TAU, q = at(s), F = q.F, r = rad(s, th), c = q.c; return V.add(c, V.add(V.mul(F.up, r * Math.cos(th)), V.mul(F.fwd, r * Math.sin(th)))); },
      { wrap: true, center: u => path(lerp(s0, s1, u)), uv: o.uv });
  }

  // ---------------------------------------------------------------- handlebar + grips / tape
  // o: {barC, type "flat"|"drop", sh (SHAPES.bar[type]), W (half width), rise, bs, us (radians), D (clamp diameter), material keys
  //     {bar, band, grip, collar, bolt, plug}, logo, logoColor, bandOn, grip: {tp (SHAPES.gripType), pat (SHAPES.grip), L}, draw}
  // Returns { pt(z) → bar centre-line point at lateral offset z (flat bar / drop-bar tops), R(z) → bar radius there,
  //           gripIn → lateral distance of the grip's inner end, levers: {-1, 1} drop-bar hose exits, hoods }
  function bar(ctx, o) {
    const G = GL(), V = G.V, sh = o.sh, Rc = o.D / 2, Re = sh.endD / 2, c = o.barC;
    const R = a => lerp(Rc, Re, smooth(sh.taper[0], sh.taper[1], Math.abs(a)));
    const out = { R: z => R(z) };
    if (o.type !== "drop") {
      // centre line: smooth rise bend, then smooth back / upsweep bend (integrated so there are no kinks or bulges)
      const W = o.W, st = 0.5, n = Math.ceil(W / st) + 2, X = [0], Yv = [0]; let S = 0;
      for (let k = 1; k <= n; k++) { const a = k * st; S += smooth(sh.sweep[0], sh.sweep[1], a - st / 2) * st; X.push(-Math.tan(o.bs) * S); Yv.push(o.rise * smooth(sh.rise[0], sh.rise[1], a) + Math.tan(o.us) * S); }
      const at = (arr, a) => { const f = clamp(a / st, 0, n - 1e-6), k = Math.floor(f); return lerp(arr[k], arr[k + 1], f - k); };
      const pt = z => { const a = Math.abs(z); return [c[0] + at(X, a), c[1] + at(Yv, a), c[2] + z]; };
      out.pt = pt;
      const gL = o.grip.L, tp = o.grip.tp, gIn = W - gL; out.gripIn = gIn;
      if (!o.draw) return out;
      const Mb = ctx.M(o.keys.bar);
      tube(Mb, pt, -W + 1, W - 1, Math.ceil(2 * W / 3), 30, s => R(s));
      if (o.bandOn) tube(ctx.M(o.keys.band), pt, -64, 64, 44, 30, s => R(s) + 0.05);
      // logo (and an optional second, smaller line of text further out, e.g. the model name)
      const barText = (txt, col, a0, L, font, keyp, th0, th1) => {
        const Mk = ctx.tex(keyp + txt + col, ctx.texText(txt, font, col, null, 1024, 192), { base: [1, 1, 1], decal: true, rough: 0.35, clear: 0.6, twoSided: true });
        for (const s of [-1, 1]) Mk.grid(16, 3, (i, j) => { const a = a0 + L * i / 16, z = s * a, p = pt(z), r = R(z) + 0.1, th = lerp(th0, th1, j / 3);
          const t = V.norm(V.sub(pt(z + 0.1), pt(z - 0.1))), up = V.norm(V.sub([0, 1, 0], V.mul(t, t[1]))), fw = V.cross(up, t), fwd = V.dot(fw, [1, 0, 0]) < 0 ? V.mul(fw, -1) : fw;
          const nn = V.add(V.mul(up, Math.cos(th)), V.mul(fwd, Math.sin(th)));
          return { p: V.madd(p, nn, r), n: nn, uv: [s > 0 ? 1 - i / 16 : i / 16, j / 3], t }; });
      };
      let a2 = 72;
      if (o.logo) a2 = 72 + Math.min(80, 8 + 5.4 * o.logo.length) + 8;
      if (o.logo2) barText(o.logo2, o.logo2Color || o.logoColor || "#9a9ca0", a2, Math.min(70, 4 + 3.6 * o.logo2.length), "700 120px Arial, sans-serif", "barLogo2_", 0.98, 0.7);
      if (o.logo) {
        const Mk = ctx.tex("barLogo_" + o.logo + o.logoColor, ctx.texText(o.logo, "italic 800 150px 'Arial Black', Arial, sans-serif", o.logoColor || "#e0e0e0", null, 1024, 192), { base: [1, 1, 1], decal: true, rough: 0.35, clear: 0.6, twoSided: true });
        const L = Math.min(80, 8 + 5.4 * o.logo.length), a0 = 72;
        for (const s of [-1, 1]) Mk.grid(16, 3, (i, j) => { const a = a0 + L * i / 16, z = s * a, p = pt(z), r = R(z) + 0.1, th = lerp(1.02, 0.6, j / 3);
          const t = V.norm(V.sub(pt(z + 0.1), pt(z - 0.1))), up = V.norm(V.sub([0, 1, 0], V.mul(t, t[1]))), fw = V.cross(up, t), fwd = V.dot(fw, [1, 0, 0]) < 0 ? V.mul(fw, -1) : fw;
          const nn = V.add(V.mul(up, Math.cos(th)), V.mul(fwd, Math.sin(th)));
          return { p: V.madd(p, nn, r), n: nn, uv: [s > 0 ? 1 - i / 16 : i / 16, j / 3], t }; });
      }
      // grips
      const Mg = ctx.M(o.keys.grip), Mc = ctx.M(o.keys.collar), Mbo = ctx.M(o.keys.bolt), Md = ctx.M("blackMatte"), pat = o.grip.pat, cw = 6.5;
      for (const s of [-1, 1]) {
        const g0 = gIn + (tp.inner ? cw : 0), g1 = W - (tp.outer ? cw : 0), Rg = 15.1;
        const rad = (z, th) => { const a = Math.abs(z), e0 = a - g0, e1 = g1 - a, edge = Math.min(e0, e1), fade = smooth(1.5, 5, edge);
          const endR = tp.outer ? 0 : 3.2 * (1 - Math.sqrt(Math.max(0, 1 - Math.pow(1 - clamp(e1 / 3.2, 0, 1), 2))));
          const base = Rg - 0.7 * (1 - smooth(0, 4, edge)) - endR; return base + pat.amp * fade * pat.f(e0, th * Rg, th); };
        tube(Mg, pt, s * g0, s * g1, Math.max(40, Math.ceil((g1 - g0) / 0.9)), pat.amp > 0 ? 104 : 40, rad);
        const tangentAt = z => V.norm(V.sub(pt(z + s * 0.2), pt(z - s * 0.2)));
        const collar = a => { const p = pt(s * a), t = tangentAt(s * a); G.lathe(Mc, p, t, [[Re + 0.2, 0], [16.2, 0], [16.8, 0.6], [16.8, cw - 0.6], [16.2, cw], [Re + 0.2, cw]], 40);
          const up = V.norm(V.sub([0, 1, 0], V.mul(t, t[1]))), dn = V.mul(up, -1), bp = V.madd(V.madd(p, t, cw / 2), dn, 16.6), side = V.norm(V.cross(t, up));
          G.cyl(Mbo, V.madd(bp, side, -3), V.madd(bp, side, 3), 2.4, 2.4, 10); G.cyl(Mbo, V.madd(bp, side, 3), V.madd(bp, side, 5.2), 3.2, 3.2, 12); G.cyl(Md, V.madd(bp, side, 5.2), V.madd(bp, side, 5.3), 1.4, 1.4, 6); };
        if (tp.inner) collar(gIn);
        if (tp.outer) collar(W - cw);
        const pe = pt(s * W), te = tangentAt(s * W);
        if (tp.outer || tp.inner) G.lathe(ctx.M(o.keys.plug), V.madd(pe, te, tp.outer ? -0.6 : -1.6), te, [[0, 1.6], [6, 1.6], [6.4, 1.2], [12.4, 1.2], [13, 0.6], [13, 0], [Re, 0], [Re, -2], [0, -2]].map(q => [q[0], q[1]]), 32);
        else {   // push-on: closed rubber end + flange at the inner end
          G.lathe(Mg, V.madd(pe, te, -0.2), te, [[Rg - 0.7, 0], [Rg - 0.9, 1.6], [Rg - 3.2, 3.8], [6, 4.6], [0, 4.7]], 40);
          const pi = pt(s * gIn), ti = tangentAt(s * gIn); G.lathe(Mg, pi, ti, [[Re, 0], [17.8, 0], [18.4, 0.8], [18.2, 2.6], [Rg, 5.2], [Rg - 0.6, 5.4]], 40);
        }
      }
      return out;
    }
    // ---- drop bar: tops straight out, ramp forward, front bend (hoods), drop, flat hooks; flared drops
    // geometry: reach / drop / flare from the shape (the part's published numbers); flare-out = the hoods and the top of the
    // drops angle outwards (outsweep); sweep = backsweep of the tops; rise = the tops climb from the clamp; width at the hoods,
    // or at the drop ends (then the hoods sit closer in by the flare)
    const rch = sh.reach, drp = sh.drop, fl = Math.tan((sh.flare == null ? 12 : sh.flare) * D2R) * drp;
    const foK = Math.tan((sh.flareOut || 0) * D2R), foMax = foK * (rch - 7);
    const Wd = Math.max(140, sh.widthAt === "drops" ? o.W - fl - foMax : o.W);
    const ctrl0 = [[0, 0, 0], [0, 0, Wd - 70], [0, 0, Wd - 36], [14, -1.5, Wd - 9], [40, -5, Wd], [rch - 16, -10, Wd + 0.5], [rch + 7, -30, Wd + 2], [rch + 6, -66, Wd + fl * 0.5], [rch - 20, -drp + 9, Wd + fl * 0.88], [rch - 55, -drp, Wd + fl], [rch - 120, -drp - 3, Wd + fl + 1]];
    // extra points along the tops so a rise or sweep bends smoothly just outside the clamp
    if ((sh.rise || 0) > 0 || (sh.sweep || 0) > 0) for (const z of [95, 70, 46].filter(z => z < Wd - 80)) ctrl0.splice(1, 0, [0, 0, z]);
    const swK = Math.tan((sh.sweep || 0) * D2R), zS0 = 46, zS1 = Wd - 36;
    const ctrl = ctrl0.map((q, k) => {
      const z = q[2], bend = k >= ctrl0.length - 8;                              // the front bend, hoods and drops
      const x = q[0] - swK * clamp(z - zS0, 0, zS1 - zS0);
      const y = q[1] + (sh.rise || 0) * smooth(zS0, Math.min(zS0 + 70, zS1), z);
      return [x, y, z + (bend ? foK * clamp(q[0] - 14, 0, rch - 7) : 0)];
    });
    // flare-out holds its full outward offset down the drops (points after the hood)
    for (let k = ctrl.length - 4; k < ctrl.length; k++) ctrl[k][2] = ctrl0[k][2] + foK * (rch - 7);
    const half = G.smoothPath(ctrl.map(q => [q[0], q[1], q[2]]), 10);
    const sidePts = s => half.map(q => [c[0] + q[0], c[1] + q[1], c[2] + s * q[2]]);
    const all = sidePts(-1).reverse().concat(sidePts(1).slice(1));
    const cum = [0]; for (let k = 1; k < all.length; k++) cum.push(cum[k - 1] + V.dist(all[k], all[k - 1]));
    const Ltot = cum[cum.length - 1];
    const ptS = s => { s = clamp(s, 0, Ltot); let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; } const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1); return V.lerp(all[lo], all[hi], t); };
    const sOfTop = a => { const mid = Ltot / 2; return [mid - a, mid + a]; };   // tops are straight along z, so arc length = lateral offset
    out.pt = z => [c[0], c[1], c[2] + z];
    const Rs = s => R(Math.abs(ptS(s)[2] - c[2]));
    const tapeA = 92, [sTL, sTR] = sOfTop(tapeA);
    out.levers = {}; out.hoods = {};
    // hood position: where the front bend points ~40° down
    const tanS = s => V.norm(V.sub(ptS(s + 0.5), ptS(s - 0.5)));
    const hoodS = sd => { let s = sd > 0 ? sTR : sTL; const step = sd > 0 ? 1 : -1; for (let q = 0; q < 400; q++) { const tt = V.mul(tanS(s), step); if (tt[1] < -0.62) return s; s += step; } return s; };
    for (const sd of [-1, 1]) { const ex = ptS(sd > 0 ? sTR + 6 : sTL - 6); out.levers[sd] = V.add(ex, [2, -(Re + 2.2), 0]); }
    if (!o.draw) return out;
    tube(ctx.M(o.keys.bar), ptS, 0.5, Ltot - 0.5, Math.ceil(Ltot / 3), 28, Rs);
    if (o.bandOn) tube(ctx.M(o.keys.band), ptS, Ltot / 2 - 64, Ltot / 2 + 64, 44, 28, s => Rs(s) + 0.05);
    const tape = o.grip.pat, Mt = ctx.M(o.keys.grip);
    for (const [s0, s1] of [[0.6, sTL], [sTR, Ltot - 0.6]]) tube(Mt, ptS, s0, s1, Math.ceil((s1 - s0) / 1.1), 56, (s, th) => Rs(s) + 1.5 + tape.amp * tape.f(s, th * 13, th));
    for (const [s, sg] of [[0.6, -1], [Ltot - 0.6, 1]]) { const p = ptS(s), t = V.mul(tanS(s), sg); G.lathe(ctx.M(o.keys.plug), p, t, [[0, 2], [Re + 1.2, 2], [Re + 1.7, 1.4], [Re + 1.7, 0], [Re, 0], [Re, -3], [0, -3]], 32); }
    // hoods (rubber over the lever body), lever blades following the drop, hose under the tape
    for (const sd of [-1, 1]) {
      const sQ = hoodS(sd), Q = ptS(sQ), hd = V.norm([1, 0.24, 0]), hu = V.norm(V.sub([0, 1, 0], V.mul(hd, hd[1]))), lat = [0, 0, sd];
      const Rt = Re + 1.5;
      G.blob(ctx.M("rubber"), V.madd(V.madd(Q, hu, Rt + 9), hd, 4), hd, hu, lat, 38, 13, 13.5, 0.5, 14);
      G.blob(ctx.M("rubber"), V.madd(V.madd(Q, hu, Rt + 20), hd, 34), hd, hu, lat, 9.5, 10, 11, 0.6, 10);
      G.lathe(ctx.M("rubber"), V.madd(Q, hd, -10), [0, 1, 0], [[0, 0], [Rt + 2.6, 0], [Rt + 2.6, 9], [0, 9]], 24, { a0: 0, a1: TAU });
      // blade: from the front of the hood down, parallel to the drop and ~16 mm in front of it
      const bl = [];
      for (let k = 0; k <= 12; k++) { const s = sQ + sd * (6 + 9 * k), p = ptS(s), t = V.mul(tanS(s), sd); let nn = V.norm(V.cross(t, lat)); if (V.dot(nn, [1, 0, 0]) < 0) nn = V.mul(nn, -1); bl.push(V.add(V.madd(p, nn, lerp(26, 15, k / 12)), [0, 0, sd * 1.5 * k / 12])); }
      bl.unshift(V.madd(V.madd(Q, hu, Rt + 8), hd, 30));
      G.sweep(ctx.M(o.keys.lever), G.smoothPath(bl, 3), { rh: 4.2, rw: 8.5, exp: 3, ref: [0, 0, 1], seg: 12, cap1: "dome", domeDepth: 3 });
      out.hoods[sd] = Q;
    }
    return out;
  }

  root.FrameShapes = { SHAPES, options, pick, pitchR, surface, ringSector, teeth, chainRollers, drawChain, chainring, ssCog, stem, tube, face, bar };
  if (typeof module !== "undefined") module.exports = root.FrameShapes;
})(typeof window !== "undefined" ? window : globalThis);
