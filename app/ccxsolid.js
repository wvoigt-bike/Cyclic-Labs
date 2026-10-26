// ============================================================================
//  CALCULIX SOLID WELD-JOINT MODEL
//  Builds a solid (C3D20R, 20-node quadratic brick, reduced integration) model
//  of one tube-to-tube welded joint: chord tube, brace tube welded on at angle
//  θ, and a real fillet weld (a triangular bead of solid elements filling the
//  corner between brace and chord all the way round). Same geometry
//  conventions, load cases and read-out as the shell model in ccxjoint.js:
//  chord along x, brace in the x-z plane leaning at θ, φ = 0 on the +x side
//  of the brace; three unit load cases on the brace end (axial 1000 N,
//  in-plane bending 100 N, out-of-plane bending 100 N); both chord ends held.
//  Hot-spot stress: surface stress at 0.4·wall and 1.0·wall from the weld toe,
//  extrapolated to the toe (IIW: σhs = 1.67 σ(0.4t) − 0.67 σ(1.0t)).
//  Also builds a plain solid tube cantilever to check the mesher on its own.
// ============================================================================
(function (root) {
  "use strict";
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => mul(a, 1 / norm(a));
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const fmt = v => (Math.abs(v) < 1e-12 ? 0 : v).toFixed(6);

  // ---------------------------------------------------------------- C3D20 element
  // CalculiX / Abaqus order: corners 1-4 on ζ = −1 (counter-clockwise), 5-8 above them on ζ = +1,
  // then mid-edge nodes 9-12 (edges 1-2, 2-3, 3-4, 4-1), 13-16 (5-6, 6-7, 7-8, 8-5), 17-20 (1-5, 2-6, 3-7, 4-8).
  // Entries are (ξ, η, ζ) grid indices 0/1/2 ↔ −1/0/+1.
  const H20 = [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [0, 0, 2], [2, 0, 2], [2, 2, 2], [0, 2, 2],
    [1, 0, 0], [2, 1, 0], [1, 2, 0], [0, 1, 0], [1, 0, 2], [2, 1, 2], [1, 2, 2], [0, 1, 2],
    [0, 0, 1], [2, 0, 1], [2, 2, 1], [0, 2, 1]];
  const H20F = [[0, 1, 2, 3, 8, 9, 10, 11], [4, 7, 6, 5, 15, 14, 13, 12], [0, 4, 5, 1, 16, 12, 17, 8],
    [1, 5, 6, 2, 17, 13, 18, 9], [2, 6, 7, 3, 18, 14, 19, 10], [3, 7, 4, 0, 19, 15, 16, 11]];   // ccx faces 1-6
  // shape-function derivatives of the 20-node serendipity brick at (ξ, η, ζ)
  function dN20(x, y, z) {
    const out = [];
    for (const [a, b, c] of H20) {
      const xi = a - 1, yi = b - 1, zi = c - 1;
      if (xi && yi && zi) {
        const fx = 1 + x * xi, fy = 1 + y * yi, fz = 1 + z * zi, s = x * xi + y * yi + z * zi - 2;
        out.push([xi * fy * fz * (s + fx) / 8, yi * fx * fz * (s + fy) / 8, zi * fx * fy * (s + fz) / 8]);
      } else if (!xi) out.push([-2 * x * (1 + y * yi) * (1 + z * zi) / 4, (1 - x * x) * yi * (1 + z * zi) / 4, (1 - x * x) * (1 + y * yi) * zi / 4]);
      else if (!yi) out.push([xi * (1 - y * y) * (1 + z * zi) / 4, -2 * y * (1 + x * xi) * (1 + z * zi) / 4, (1 + x * xi) * (1 - y * y) * zi / 4]);
      else out.push([xi * (1 + y * yi) * (1 - z * z) / 4, (1 + x * xi) * yi * (1 - z * z) / 4, -2 * z * (1 + x * xi) * (1 + y * yi) / 4]);
    }
    return out;
  }
  function detJ(P, x, y, z) {
    const d = dN20(x, y, z), J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let n = 0; n < 20; n++) for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) J[i][k] += d[n][i] * P[n][k];
    return J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) + J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]);
  }
  // 8-node serendipity face: shape functions and derivatives at (ξ, η); nodes corners (−−, +−, ++, −+), mids (0−, +0, 0+, −0)
  const Q8 = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]];
  function N8(x, y) {
    return Q8.map(([a, b]) => {
      if (a && b) return [(1 + a * x) * (1 + b * y) * (a * x + b * y - 1) / 4, a * (1 + b * y) * (2 * a * x + b * y) / 4, b * (1 + a * x) * (a * x + 2 * b * y) / 4];
      if (!a) return [(1 - x * x) * (1 + b * y) / 2, -x * (1 + b * y), b * (1 - x * x) / 2];
      return [(1 + a * x) * (1 - y * y) / 2, a * (1 - y * y) / 2, -y * (1 + a * x)];
    });
  }
  const G3 = [[-Math.sqrt(0.6), 5 / 9], [0, 8 / 9], [Math.sqrt(0.6), 5 / 9]];

  // ---------------------------------------------------------------- mesh container
  function Mesh() {
    const coords = [], grid = new Map(), H = 1e-3, TOL = 1e-6, elems = [], faces = [];
    const cell = p => p.map(v => Math.floor(v / H));
    function node(p) {
      const [i, j, k] = cell(p);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const l = grid.get(`${i + a},${j + b},${k + c}`); if (!l) continue;
        for (const id of l) { const q = coords[id - 1]; if (Math.abs(q[0] - p[0]) < TOL && Math.abs(q[1] - p[1]) < TOL && Math.abs(q[2] - p[2]) < TOL) return id; }
      }
      coords.push(p.slice()); const id = coords.length, key = `${i},${j},${k}`;
      if (!grid.has(key)) grid.set(key, []); grid.get(key).push(id);
      return id;
    }
    function find(p) {
      const [i, j, k] = cell(p);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const l = grid.get(`${i + a},${j + b},${k + c}`); if (!l) continue;
        for (const id of l) { const q = coords[id - 1]; if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-5) return id; }
      }
      return 0;
    }
    // g(i, j, l) → point for grid indices 0..2; builds the 20-node brick, flipping ζ if the mapping is left-handed
    function hex(set, g) {
      let P = H20.map(([i, j, l]) => g(i, j, l));
      let flip = false;
      if (detJ(P, 0, 0, 0) < 0) { flip = true; P = H20.map(([i, j, l]) => g(i, j, 2 - l)); }
      const ids = P.map(node);
      elems.push({ set, n: ids });
      return { ids, flip };
    }
    return { coords, elems, faces, node, find, hex };
  }

  // geometric grading: n sizes starting near h0, growing by a common ratio (capped at hmax), summing exactly to L
  function gradeCap(L, h0, n, hmax) {
    const sizes = q => { const s = []; let h = h0; for (let i = 0; i < n; i++) { s.push(Math.min(h, hmax)); h *= q; } return s; };
    const tot = q => sizes(q).reduce((a, b) => a + b, 0);
    let lo = 0.2, hi = 4;
    if (tot(hi) < L) lo = hi; else if (tot(lo) > L) hi = lo;
    for (let it = 0; it < 100 && hi > lo; it++) { const m = (lo + hi) / 2; if (tot(m) > L) hi = m; else lo = m; }
    const s = sizes((lo + hi) / 2), f = L / s.reduce((a, b) => a + b, 0), out = [0];
    for (const h of s) out.push(out[out.length - 1] + h * f);
    out[n] = L; return out;
  }
  const nForGrade = (L, h0, hmax, q) => { let n = 0, s = 0, h = h0; while (s < L && n < 400) { s += Math.min(h, hmax); h *= q; n++; } return Math.max(1, n); };
  const lin = (a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => a0 + (a1 - a0) * i / n);
  // corner list → node-level list (odd levels are mid-points)
  const levels = c => { const out = []; for (let i = 0; i < c.length; i++) { out.push(c[i]); if (i + 1 < c.length) out.push((c[i] + c[i + 1]) / 2); } return out; };

  // ---------------------------------------------------------------- consistent face loads
  // fq: 8 node ids in Q8 order. Adds ∫ N_i dA to wts (uniform unit traction).
  function faceWeights(mesh, fq, wts) {
    const P = fq.map(id => mesh.coords[id - 1]);
    let area = 0;
    for (const [x, wx] of G3) for (const [y, wy] of G3) {
      const N = N8(x, y); let tx = [0, 0, 0], ty = [0, 0, 0];
      for (let i = 0; i < 8; i++) { tx = add(tx, mul(P[i], N[i][1])); ty = add(ty, mul(P[i], N[i][2])); }
      const dA = norm(cross(tx, ty)) * wx * wy; area += dA;
      for (let i = 0; i < 8; i++) wts.set(fq[i], (wts.get(fq[i]) || 0) + N[i][0] * dA);
    }
    return area;
  }

  // ---------------------------------------------------------------- deck writing helpers
  function writeDeck(L, mesh, setOrder) {
    L("*NODE,NSET=NALL"); mesh.coords.forEach((p, i) => L(`${i + 1},${fmt(p[0])},${fmt(p[1])},${fmt(p[2])}`));
    let eid = 0; const ranges = {};
    for (const set of setOrder) {
      const list = mesh.elems.filter(e => e.set === set); if (!list.length) continue;
      L(`*ELEMENT,TYPE=C3D20R,ELSET=E${set}`);
      ranges[set] = [eid + 1, eid + list.length];
      for (const e of list) { eid++; e.id = eid; L(`${eid},${e.n.slice(0, 10).join(",")},`); L(e.n.slice(10).join(",")); }
    }
    return { eid, ranges };
  }
  const wlist = (L, ids) => { for (let i = 0; i < ids.length; i += 16) L(ids.slice(i, i + 16).join(",") + ","); };

  // ============================================================================ JOINT
  // o: { D, T, d, t, theta (deg), Lchord, Lbrace, weldLeg (or weldLegChord / weldLegBrace), E, nu, NC,
  //      chordHole (default true: the brace bore opens into the chord through a radial hole, as in the shell model) }
  function build(o) {
    const E = o.E || 100000, nu = o.nu || 0.32;
    const Ro = o.D / 2, Ri = o.D / 2 - o.T, ro = o.d / 2, ri = o.d / 2 - o.t;
    const R = (o.D - o.T) / 2;                                        // chord mid-surface radius (nominal arm, as ccxjoint.js)
    if (!(ro < Ro * 0.96)) throw new Error("Brace must be narrower than the chord for this joint model (d < 0.96 D).");
    const th = o.theta * Math.PI / 180, st = Math.sin(th), ct = Math.cos(th);
    const b = [ct, 0, st], e1 = [st, 0, -ct], e2 = [0, 1, 0];
    const NC = Math.max(16, Math.round((o.NC || 40) / 8) * 8), K = 2 * NC;
    const NW = 2, LV = 2 * NW;                                        // elements / node levels through each wall
    const hole = o.chordHole !== false;
    const legB = o.weldLegBrace || o.weldLeg || 1.4 * o.t;           // weld leg up the brace (along the brace generator)
    const legC = o.weldLegChord || o.weldLeg || 1.4 * o.t;           // weld leg along the chord (perpendicular to the weld root line)
    const Lc = o.Lchord || Math.max(8 * o.D, 250), Lb = o.Lbrace || Math.max(6 * o.d, 180);

    // ---- geometry
    const sFoot = (q, rho, phi) => (Math.sqrt(rho * rho - (q * Math.sin(phi)) ** 2) + q * Math.cos(phi) * ct) / st;
    const bp = (s, phi, q) => add(add(mul(b, s), mul(e1, q * Math.cos(phi))), mul(e2, q * Math.sin(phi)));
    const cyl = (xa, rho) => [xa[0], rho * Math.sin(xa[1] / Ro), rho * Math.cos(xa[1] / Ro)];      // (x, arc on outer surface) → 3D
    const toXA = p => [p[0], Ro * Math.atan2(p[1], p[2])];
    const footXA = (q, phi) => toXA(bp(sFoot(q, Ro, phi), phi, q));
    const braceQ = p => norm(sub(p, mul(b, dot(p, b))));

    // ---- patch rectangle around the footprint (same layout as ccxjoint.js)
    let xmin = Infinity, xmax = -Infinity, as = 0;
    for (let k = 0; k < 720; k++) { const [x, a] = footXA(ro, 2 * Math.PI * k / 720); xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); as = Math.max(as, Math.abs(a)); }
    const xc = (xmin + xmax) / 2;
    const margin = Math.max(legC + 8 * o.T, 0.6 * ro);
    const Ax = (xmax - xmin) / 2 + margin, As = as + margin;
    if (As > Math.PI * Ro * 0.85) throw new Error("Brace too big for the chord in this joint model.");
    const outer = k => {
      const v = (((k / K) + 1 / 8) % 1) * 4, side = Math.floor(v + 1e-12) % 4, f = v - Math.floor(v + 1e-12);
      return side === 0 ? [xc + Ax, -As + 2 * As * f] : side === 1 ? [xc + Ax - 2 * Ax * f, As] : side === 2 ? [xc - Ax, As - 2 * As * f] : [xc - Ax + 2 * Ax * f, -As];
    };
    const angOf = ([x, sv]) => { let a = Math.atan2(sv, x - xc); return a < 0 ? a + 2 * Math.PI : a; };
    const phiTab = [];
    for (let k = 0; k < K; k++) {
      const target = angOf(outer(k));
      let lo = 2 * Math.PI * k / K - Math.PI / 2, hi = lo + Math.PI;
      const diff = ph => { let d = angOf(footXA(ro, ph)) - target; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
      for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2; if (diff(m) > 0) hi = m; else lo = m; }
      phiTab.push((lo + hi) / 2);
    }
    const kk = k => ((k % K) + K) % K;
    const phiK = k => phiTab[kk(k)];

    // ---- chord lines: from the hole edge, under the brace wall, across the weld leg (normal to the root line), fine toe
    //      stations, then graded out to the patch rectangle
    const fineC = [0, legC / 2, legC, legC + 0.4 * o.T, legC + 0.7 * o.T, legC + 1.0 * o.T, legC + 1.4 * o.T, legC + 2.0 * o.T];
    const dN = fineC[fineC.length - 1];
    const lineC = [];
    for (let k = 0; k < K; k++) {
      const phi = phiK(k), F = footXA(ro, phi), h = 1e-5;
      const Fp = footXA(ro, phi + h), Fm = footXA(ro, phi - h);
      const tg = [Fp[0] - Fm[0], Fp[1] - Fm[1]], tl = Math.hypot(tg[0], tg[1]);
      let n = [tg[1] / tl, -tg[0] / tl];
      if (n[0] * (F[0] - xc) + n[1] * F[1] < 0) n = [-n[0], -n[1]];
      const Pn = [F[0] + n[0] * dN, F[1] + n[1] * dN], pout = outer(k);
      const Ls = Math.hypot(pout[0] - Pn[0], pout[1] - Pn[1]);
      lineC.push({ phi, F, n, Pn, pout, Ls });
    }
    const h0C = 0.8 * o.T, hmaxC = 10 * o.T;
    const LsMax = Math.max(...lineC.map(l => l.Ls));
    if (Math.min(...lineC.map(l => l.Ls)) < 2 * h0C) throw new Error("Joint patch too small; brace nearly as wide as the chord.");
    const nFarC = Math.max(3, nForGrade(LsMax, h0C, hmaxC, 1.3));
    lineC.forEach(l => {
      const far = gradeCap(l.Ls, h0C, nFarC, hmaxC);
      l.lv = levels(fineC.concat(far.slice(1).map(v => dN + v)));      // node-level distances from the root line
    });
    const nIn = 3;                                                     // rings inside the hole footprint (no-hole variant)
    let scIn = Infinity;
    if (!hole) for (let k = 0; k < K; k++) { const Fi = footXA(ri, phiK(k)), po = outer(k); scIn = Math.min(scIn, Math.hypot(Fi[0] - xc, Fi[1]) / Math.hypot(po[0] - xc, po[1])); }
    scIn *= 0.55;
    // (x, arc) of chord line k at level j: j < 0 inside the bore footprint, 0..LV under the brace wall, > LV outside
    function chordXA(k, j) {
      const l = lineC[kk(k)], phi = l.phi;
      if (j < 0) {
        const Fi = footXA(ri, phi), po = outer(kk(k)), pin = [xc + (po[0] - xc) * scIn, po[1] * scIn], f = -j / (2 * nIn);
        return [Fi[0] + (pin[0] - Fi[0]) * f, Fi[1] + (pin[1] - Fi[1]) * f];
      }
      if (j <= LV) return footXA(ri + (ro - ri) * j / LV, phi);
      const d = l.lv[j - LV];
      if (d <= dN + 1e-12) return [l.F[0] + l.n[0] * d, l.F[1] + l.n[1] * d];
      const f = (d - dN) / l.Ls;
      return [l.Pn[0] + (l.pout[0] - l.Pn[0]) * f, l.Pn[1] + (l.pout[1] - l.Pn[1]) * f];
    }
    const rhoL = l => Ri + (Ro - Ri) * l / LV;
    const chordPt = (k, j, l) => cyl(chordXA(k, j), rhoL(l));

    // ---- brace lines: generators at φ_k, stations measured up the outer surface from the weld root
    const fineB = [0, legB / 2, legB, legB + 0.4 * o.t, legB + 0.7 * o.t, legB + 1.0 * o.t, legB + 1.4 * o.t, legB + 2.0 * o.t];
    const dNB = fineB[fineB.length - 1], h0B = 0.8 * o.t, hmaxB = 10 * o.t;
    const lineB = [];
    for (let k = 0; k < K; k++) {
      const phi = phiK(k), s0 = sFoot(ro, Ro, phi);
      const dIn = sFoot(ri, Ro, phi) - s0;                             // bore footprint sits this much further up (+) or down (−)
      lineB.push({ phi, s0, Hb: Math.max(legB + 2 * o.t, 3 * Math.abs(dIn)), Lrem: Lb - s0 - dNB });
    }
    const nFarB = Math.max(3, nForGrade(Math.max(...lineB.map(l => l.Lrem)), h0B, hmaxB, 1.3));
    lineB.forEach(l => {
      if (l.Lrem < 3 * h0B || l.Hb > Lb - l.s0 - h0B) throw new Error("Brace too short for this joint model.");
      l.lv = levels(fineB.concat(gradeCap(l.Lrem, h0B, nFarB, hmaxB).slice(1).map(v => dNB + v)));
    });
    // brace node: around level k, wall level m (0 = bore, LV = outer), height level h
    function bracePt(k, m, h) {
      const l = lineB[kk(k)], q = ri + (ro - ri) * m / LV, d = l.lv[h];
      const dq = sFoot(q, Ro, l.phi) - l.s0, lam = Math.min(1, d / l.Hb);
      return bp(l.s0 + d + dq * (1 - lam), l.phi, q);
    }

    // ---- fillet cross-section at around level k (triangle root O, chord toe C, brace toe B; split in three quads)
    const secCache = new Map();
    function section(k) {
      const key = kk(k); if (secCache.has(key)) return secCache.get(key);
      const c = j => chordPt(k, LV + j, LV), bb = h => bracePt(k, LV, h);
      const O = c(0), C = c(4), B = bb(4), f = i => add(C, mul(sub(B, C), i / 4));
      const G = mul(add(add(O, C), B), 1 / 3);
      const mOC = c(2), mBO = bb(2), mCB = f(2);
      // quads as 3×3 grids g[u][v]
      const A = [[O, bb(1), mBO], [c(1), null, mid(mBO, G)], [mOC, mid(mOC, G), G]];
      const Bq = [[mOC, mid(mOC, G), G], [c(3), null, mid(G, mCB)], [C, f(1), mCB]];
      const Cq = [[mBO, bb(3), B], [mid(mBO, G), null, f(3)], [G, mid(G, mCB), mCB]];
      const s = { quads: [A, Bq, Cq], face: [f(0), f(1), f(2), f(3), f(4)], O, C, B };
      secCache.set(key, s); return s;
    }

    // ---- build the mesh
    const mesh = Mesh(), tags = { hole: new Set(), weldFace: new Set() };
    const NR_UNDER = NW, NR_OUT = (fineC.length - 1) + nFarC;
    const jStart = hole ? 0 : -2 * nIn;
    for (let ic = 0; ic < NC; ic++) {
      for (let j0 = jStart; j0 < LV + 2 * NR_OUT; j0 += 2) for (let il = 0; il < NW; il++)
        mesh.hex("CH", (i, j, l) => chordPt(2 * ic + i, j0 + j, 2 * il + l));
    }
    // chord remainder (structured, sharing the patch rectangle edge nodes); in the no-hole variant also the bore core
    const nSide = NC / 4, circ = 2 * Math.PI * Ro;
    const rectElt = 2 * Ax / nSide;
    const xEnd = Lc / 2 - (xc + Ax), xEnd2 = xc - Ax + Lc / 2;
    const gx = (Lr) => gradeCap(Lr, Math.min(rectElt, hmaxC), nForGrade(Lr, Math.min(rectElt, hmaxC), hmaxC, 1.3), hmaxC);
    const xAll = gx(xEnd2).map(v => xc - Ax - v).reverse().slice(0, -1).concat(lin(xc - Ax, xc + Ax, nSide)).concat(gx(xEnd).map(v => xc + Ax + v).slice(1));
    const nArc = Math.max(4, Math.ceil((circ - 2 * As) / Math.min(hmaxC, 1.2 * 2 * As / nSide)));
    const sAll = lin(-As, As, nSide).concat(lin(As, circ - As, nArc).slice(1));
    const remainder = (xs, ss, skip) => {
      for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ss.length - 1; j++) {
        const xm = (xs[i] + xs[i + 1]) / 2, sm = (ss[j] + ss[j + 1]) / 2;
        if (skip(xm, sm)) continue;
        const xq = [xs[i], xm, xs[i + 1]], sq = [ss[j], sm, ss[j + 1]];
        for (let il = 0; il < NW; il++) mesh.hex("CH", (a, c, l) => cyl([xq[a], sq[c]], rhoL(2 * il + l)));
      }
    };
    remainder(xAll, sAll, (xm, sm) => Math.abs(xm - xc) < Ax && sm > -As && sm < As);
    if (!hole) remainder(lin(xc - Ax * scIn, xc + Ax * scIn, nSide), lin(-As * scIn, As * scIn, nSide), () => false);
    if (hole) for (let k = 0; k < K; k++) for (let l = 0; l <= LV; l++) { const id = mesh.find(chordPt(k, 0, l)); if (id) tags.hole.add(id); }
    // brace
    const nRowsB = (lineB[0].lv.length - 1) / 2;
    const topFaces = [];
    for (let ic = 0; ic < NC; ic++) for (let il = 0; il < NW; il++) for (let ir = 0; ir < nRowsB; ir++) {
      const r = mesh.hex("BR", (i, m, h) => bracePt(2 * ic + i, 2 * il + m, 2 * ir + h));
      if (ir === nRowsB - 1) {
        // top face (h = 2): grid (i, m) → Q8 order
        const g = (i, m) => mesh.find(bracePt(2 * ic + i, 2 * il + m, 2 * ir + 2));
        topFaces.push([g(0, 0), g(2, 0), g(2, 2), g(0, 2), g(1, 0), g(2, 1), g(1, 2), g(0, 1)]);
      }
    }
    // weld fillet
    for (let ic = 0; ic < NC; ic++) for (let qd = 0; qd < 3; qd++)
      mesh.hex("WD", (i, u, v) => section(2 * ic + i).quads[qd][u][v]);
    for (let k = 0; k < K; k++) for (const p of section(k).face) { const id = mesh.find(p); if (id) tags.weldFace.add(id); }

    // ---- sets, loads, deck
    const N = mesh.coords.length;
    const endNodes = [], topNodes = [];
    mesh.coords.forEach((p, i) => { if (Math.abs(Math.abs(p[0]) - Lc / 2) < 1e-6) endNodes.push(i + 1); if (Math.abs(dot(p, b) - Lb) < 1e-6) topNodes.push(i + 1); });
    const wts = new Map(); let areaDisc = 0;
    for (const fq of topFaces) areaDisc += faceWeights(mesh, fq, wts);
    const Ab = Math.PI * (o.d ** 2 - (o.d - 2 * o.t) ** 2) / 4, Ib = Math.PI * (o.d ** 4 - (o.d - 2 * o.t) ** 4) / 64;
    const F = { axial: 1000, ipb: 100, opb: 100 };
    const arm = Lb - R / st;
    const steps = [["axial", b, F.axial], ["ipb", e1, F.ipb], ["opb", e2, F.opb]];
    const loads = {};
    for (const [name, dir, tot] of steps) {
      const list = [];
      for (const [id, w] of wts) { const f = tot * w / areaDisc; list.push([id, mul(dir, f)]); }
      loads[name] = list;
    }
    const out = [], L = s => out.push(s);
    L(`** Cyclic Labs SOLID weld-joint model (C3D20R): chord OD ${o.D} x ${o.T}, brace OD ${o.d} x ${o.t}, angle ${o.theta} deg`);
    L(`** fillet weld legs: ${legC.toFixed(3)} mm on the chord, ${legB.toFixed(3)} mm on the brace; chord hole under the brace bore: ${hole ? "yes" : "no"}`);
    L("** units mm, N, MPa. Chord along x, brace in the x-z plane. Both chord ends held (UX,UY,UZ).");
    const { eid, ranges } = writeDeck(L, mesh, ["CH", "WD", "BR"]);
    L("*NSET,NSET=NEND"); wlist(L, endNodes);
    L("*NSET,NSET=NTOP"); wlist(L, topNodes);
    L("*BOUNDARY"); L("NEND,1,3");
    L("*MATERIAL,NAME=TI"); L("*ELASTIC"); L(`${E},${nu}`);
    for (const set of ["CH", "WD", "BR"]) if (ranges[set]) L(`*SOLID SECTION,ELSET=E${set},MATERIAL=TI`);
    steps.forEach(([name, , tot], si) => {
      L("*STEP"); L("*STATIC");
      L(`** ${name}: ${tot} N on the brace end, as consistent nodal forces of a uniform traction over the end face`);
      L(si === 0 ? "*CLOAD" : "*CLOAD,OP=NEW");
      for (const [id, f] of loads[name]) for (let d = 0; d < 3; d++) if (Math.abs(f[d]) > 1e-14) L(`${id},${d + 1},${f[d].toExponential(8)}`);
      if (si === 0) { L("*NODE FILE"); L("U"); L("*EL FILE"); L("S"); }
      L("*END STEP");
    });
    const nominal = { axial: F.axial / Ab, ipb: F.ipb * arm * (o.d / 2) / Ib, opb: F.opb * arm * (o.d / 2) / Ib };

    // ---- read-out paths: every around level k; outer-surface nodes at toe + 0.4·wall and toe + 1.0·wall
    const paths = [];
    for (let k = 0; k < K; k++) {
      const c4 = chordPt(k, LV + 6, LV), c10 = chordPt(k, LV + 10, LV);      // fineC index 3 and 5 → levels 6 and 10
      const b4 = bracePt(k, LV, 6), b10 = bracePt(k, LV, 10);
      paths.push({
        phi: phiK(k), chord: [c4, c10], brace: [b4, b10],
        chordIds: [mesh.find(c4), mesh.find(c10)], braceIds: [mesh.find(b4), mesh.find(b10)],
        chordDir: unit(sub(c10, c4)), braceDir: unit(sub(b10, b4)),
        chordToe: chordPt(k, LV + 4, LV), braceToe: bracePt(k, LV, 4)
      });
    }
    return {
      text: out.join("\n") + "\n", nodes: N, elements: eid, ranges, nominal, paths, steps: steps.map(s => s[0]),
      loads, mesh, tags,
      meta: { type: "solid-C3D20R", R, r: (o.d - o.t) / 2, Ro, Ri, ro, ri, Ax, As, xc, legC, legB, weld: legC, arm, Lc, Lb, NC, hole, theta: o.theta, b, e1, e2, areaDisc, nFarC, nFarB }
    };
  }

  // ============================================================================ CANTILEVER CHECK
  // Straight solid tube along x, clamped at x = 0 (all end-face nodes, UX UY UZ), load P at x = L as a uniform
  // traction over the tip face. Step 1: transverse (z), step 2: axial (x).
  function buildTube(o) {
    const E = o.E || 100000, nu = o.nu || 0.32, D = o.D || 38.1, T = o.T || 1.2, Lt = o.L || 300, P = o.P || 100, Pax = o.Pax || 1000;
    const NC = o.NC || 40, nx = o.nx || 30, NW = 2, LV = 4;
    const Ro = D / 2, Ri = D / 2 - T, circ = 2 * Math.PI * Ro;
    const mesh = Mesh();
    const xs = lin(0, Lt, nx), ss = lin(0, circ, NC);
    const cyl = (x, a, rho) => [x, rho * Math.sin(a / Ro), rho * Math.cos(a / Ro)];
    const tip = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < NC; j++) for (let il = 0; il < NW; il++) {
      const xq = [xs[i], (xs[i] + xs[i + 1]) / 2, xs[i + 1]], sq = [ss[j], (ss[j] + ss[j + 1]) / 2, ss[j + 1]];
      const g = (a, c, l) => cyl(xq[a], sq[c], Ri + T * (2 * il + l) / LV);
      mesh.hex("TU", g);
      if (i === nx - 1) { const f = (c, l) => mesh.find(g(2, c, l)); tip.push([f(0, 0), f(2, 0), f(2, 2), f(0, 2), f(1, 0), f(2, 1), f(1, 2), f(0, 1)]); }
    }
    const wts = new Map(); let area = 0; for (const fq of tip) area += faceWeights(mesh, fq, wts);
    const fixN = [], tipN = [];
    mesh.coords.forEach((p, i) => { if (Math.abs(p[0]) < 1e-6) fixN.push(i + 1); if (Math.abs(p[0] - Lt) < 1e-6) tipN.push(i + 1); });
    const out = [], L = s => out.push(s);
    const A = Math.PI * (Ro * Ro - Ri * Ri), I = Math.PI * (Ro ** 4 - Ri ** 4) / 4, G = E / (2 * (1 + nu));
    const m = Ri / Ro, kap = 6 * (1 + nu) * (1 + m * m) ** 2 / ((7 + 6 * nu) * (1 + m * m) ** 2 + (20 + 12 * nu) * m * m);   // Cowper, hollow circle
    const bend = P * Lt ** 3 / (3 * E * I), shear = P * Lt / (kap * G * A), axial = Pax * Lt / (E * A);
    L(`** Cyclic Labs solid-mesher check: straight tube OD ${D} x ${T}, length ${Lt}, C3D20R, ${NC} around x ${nx} along x 2 through the wall`);
    L(`** step 1: ${P} N transverse (z) at the tip. Beam theory tip deflection = ${bend.toFixed(5)} (bending) + ${shear.toFixed(5)} (shear) = ${(bend + shear).toFixed(5)} mm`);
    L(`** step 2: ${Pax} N axial (x) at the tip. Expected tip stretch = ${axial.toExponential(5)} mm`);
    const { eid } = writeDeck(L, mesh, ["TU"]);
    L("*NSET,NSET=NFIX"); wlist(L, fixN);
    L("*NSET,NSET=NTIP"); wlist(L, tipN);
    L("*BOUNDARY"); L("NFIX,1,3");
    L("*MATERIAL,NAME=TI"); L("*ELASTIC"); L(`${E},${nu}`);
    L("*SOLID SECTION,ELSET=ETU,MATERIAL=TI");
    [[3, P], [1, Pax]].forEach(([dof, tot], si) => {
      L("*STEP"); L("*STATIC");
      L(si === 0 ? "*CLOAD" : "*CLOAD,OP=NEW");
      for (const [id, w] of wts) L(`${id},${dof},${(tot * w / area).toExponential(8)}`);
      L("*NODE PRINT,NSET=NTIP"); L("U");
      if (si === 0) { L("*NODE FILE"); L("U"); L("*EL FILE"); L("S"); }
      L("*END STEP");
    });
    // compare nodes: tip face, mid-wall, on the neutral axis (y = ±r_mid, z = 0) and top/bottom (z = ±r_mid)
    const rm = (Ro + Ri) / 2, pick = p => mesh.find(p);
    const compare = { neutralAxis: [pick([Lt, rm, 0]), pick([Lt, -rm, 0])], topBottom: [pick([Lt, 0, rm]), pick([Lt, 0, -rm])] };
    return {
      text: out.join("\n") + "\n", nodes: mesh.coords.length, elements: eid, mesh, tipNodes: tipN, compare,
      expected: { tipDeflectionZ: bend + shear, bending: bend, shear, shearCoefficient: kap, axialStretchX: axial, P, Pax, E, nu, D, T, L: Lt, I, A },
      loads: { transverse: [...wts].map(([id, w]) => [id, [0, 0, P * w / area]]) }
    };
  }

  // ============================================================================ MESH CHECKS (node / verification)
  function checkMesh(model, opt = {}) {
    const { coords, elems } = model.mesh;
    let neg = 0, minDet = Infinity, worstRatio = Infinity, worstEl = -1, vol = {}, volAll = 0;
    const gp = [];
    for (const [x, wx] of G3) for (const [y, wy] of G3) for (const [z, wz] of G3) gp.push([x, y, z, wx * wy * wz]);
    const corners = H20.slice(0, 8).map(([a, b2, c]) => [a - 1, b2 - 1, c - 1]);
    elems.forEach((e, ei) => {
      const P = e.n.map(id => coords[id - 1]);
      let mn = Infinity, mx = -Infinity, v = 0;
      for (const [x, y, z, w] of gp) { const d = detJ(P, x, y, z); mn = Math.min(mn, d); mx = Math.max(mx, d); v += d * w; }
      let mnc = Infinity; for (const [x, y, z] of corners) mnc = Math.min(mnc, detJ(P, x, y, z));
      if (mn <= 0 || mnc <= 0) neg++;
      minDet = Math.min(minDet, mn);
      const ratio = Math.min(mn, mnc) / mx; if (ratio < worstRatio) { worstRatio = ratio; worstEl = ei; }
      vol[e.set] = (vol[e.set] || 0) + v; volAll += v;
    });
    // faces
    const fmap = new Map();
    elems.forEach((e, ei) => { for (const f of H20F) { const ids = f.map(i => e.n[i]); const key = ids.slice().sort((a, b2) => a - b2).join(","); if (!fmap.has(key)) fmap.set(key, []); fmap.get(key).push([ei, ids]); } });
    let over = 0; const free = [];
    for (const v of fmap.values()) { if (v.length > 2) over++; if (v.length === 1) free.push(v[0][1]); }
    // node usage & closest distinct nodes
    const used = new Uint8Array(coords.length + 1); elems.forEach(e => e.n.forEach(id => { used[id] = 1; }));
    let unused = 0; for (let i = 1; i <= coords.length; i++) if (!used[i]) unused++;
    let minDist = Infinity; {
      const h = 0.05, g = new Map();
      coords.forEach((p, i) => { const k = p.map(v => Math.floor(v / h)).join(","); if (!g.has(k)) g.set(k, []); g.get(k).push(i); });
      coords.forEach((p, i) => { const c = p.map(v => Math.floor(v / h)); for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) for (let c2 = -1; c2 <= 1; c2++) { const l = g.get(`${c[0] + a},${c[1] + b2},${c[2] + c2}`); if (l) for (const j of l) if (j !== i) minDist = Math.min(minDist, norm(sub(p, coords[j]))); } });
    }
    return { elements: elems.length, nodes: coords.length, negativeJacobian: neg, minDetJ: minDet, worstRatio, worstEl, volume: vol, volumeTotal: volAll, facesSharedByMoreThanTwo: over, freeFaces: free, unusedNodes: unused, minNodeDistance: minDist };
  }

  // ============================================================================ RESULTS
  const FLOAT = /[-+]?\d*\.\d+(?:[EeDd]?[-+]\d+)?/g;
  const toNum = t => parseFloat(/[EeDd]/.test(t) ? t.replace(/[Dd]/, "E") : t.replace(/(\d)([-+]\d{2,3})$/, "$1E$2"));
  // .frd reader (same as FrameCCX.parseFrd in ccx.js; handles ccx 2.13 short/long ASCII format)
  function parseFrd(text) {
    const nodes = new Map(), blocks = []; let blk = null, section = null, step = 0;
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("    2C")) { section = "nodes"; continue; }
      if (line.startsWith("    3C")) { section = "elems"; continue; }
      if (line.startsWith("    1PSTEP")) { const p = line.trim().split(/\s+/); step = parseInt(p[p.length - 1], 10) || step + 1; continue; }
      if (line.startsWith("  100C")) { blk = { step, name: "", comps: [], data: new Map() }; blocks.push(blk); section = "result"; continue; }
      if (line.startsWith(" -4")) { if (blk) blk.name = line.substr(3).trim().split(/\s+/)[0]; continue; }
      if (line.startsWith(" -5")) { if (blk) { const c = line.substr(3).trim().split(/\s+/)[0]; if (c !== "ALL") blk.comps.push(c); } continue; }
      if (line.startsWith(" -3")) { section = null; continue; }
      if (line.startsWith(" -1") && (section === "nodes" || section === "result")) {
        const m = line.substr(3).match(/^\s*(\d+)(.*)$/); if (!m) continue;
        const vals = (m[2].match(FLOAT) || []).map(toNum);
        if (section === "nodes") nodes.set(parseInt(m[1], 10), vals.slice(0, 3));
        else blk.data.set(parseInt(m[1], 10), vals);
      }
    }
    return { nodes, blocks };
  }
  // signed principal stress of largest magnitude of [xx, yy, zz, xy, yz, zx]
  function principal(s) {
    const [xx, yy, zz, xy, yz, zx] = s;
    const I1 = xx + yy + zz, I2 = xx * yy + yy * zz + zz * xx - xy * xy - yz * yz - zx * zx;
    const I3 = xx * yy * zz + 2 * xy * yz * zx - xx * yz * yz - yy * zx * zx - zz * xy * xy;
    const p = I1 / 3, qq = (I1 * I1 - 3 * I2) / 9, rr = (2 * I1 ** 3 - 9 * I1 * I2 + 27 * I3) / 54;
    const ph = Math.acos(Math.max(-1, Math.min(1, qq > 0 ? rr / Math.sqrt(qq ** 3) : 0))) / 3, sq = 2 * Math.sqrt(Math.max(0, qq));
    const e = [p + sq * Math.cos(ph), p + sq * Math.cos(ph + 2 * Math.PI / 3), p + sq * Math.cos(ph - 2 * Math.PI / 3)];
    return e.reduce((a, v) => (Math.abs(v) > Math.abs(a) ? v : a), 0);
  }
  const normalStress = (s, d) => {
    const [xx, yy, zz, xy, yz, zx] = s;
    return d[0] * d[0] * xx + d[1] * d[1] * yy + d[2] * d[2] * zz + 2 * (d[0] * d[1] * xy + d[1] * d[2] * yz + d[2] * d[0] * zx);
  };
  // Hot-spot SCFs from the .frd (text or parsed): per load case, chord and brace
  //   chord / brace          : max |1.67·σ1(0.4t) − 0.67·σ1(1.0t)| / nominal, σ1 = signed max-magnitude principal stress
  //   chordPerp / bracePerp  : same with the surface stress perpendicular to the weld toe (IIW's preferred component)
  //   chordPhi / bracePhi    : brace angle φ (deg) where the maximum occurs; matchError: worst node-position mismatch (mm)
  function readSCF(model, frd) {
    if (typeof frd === "string") frd = parseFrd(frd);
    let grid = null; const cell = 0.5;
    const nearest = q => {
      if (!grid) { grid = new Map(); for (const [id, p] of frd.nodes) { const k = p.map(v => Math.floor(v / cell)).join(","); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([id, p]); } }
      let best = null, bd = Infinity; const [i, j, k] = q.map(v => Math.floor(v / cell));
      for (let a = -2; a <= 2; a++) for (let b2 = -2; b2 <= 2; b2++) for (let c = -2; c <= 2; c++) {
        const list = grid.get(`${i + a},${j + b2},${k + c}`); if (!list) continue;
        for (const [id, p] of list) { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; best = id; } }
      }
      return { id: best, d: bd };
    };
    const locate = (id, q) => {
      const p = id && frd.nodes.get(id);
      if (p) { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < 1e-3) return { id, d }; }
      return nearest(q);
    };
    const stressBlocks = frd.blocks.filter(bk => bk.name === "STRESS");
    const res = {};
    model.steps.forEach((name, si) => {
      const S = stressBlocks[si]; if (!S) return;
      const r = { chord: 0, brace: 0, chordPerp: 0, bracePerp: 0, chordPhi: 0, bracePhi: 0, matchError: 0 };
      for (const pth of model.paths) for (const side of ["chord", "brace"]) {
        const ids = pth[side + "Ids"] || [0, 0], [q4, q10] = pth[side];
        const n4 = locate(ids[0], q4), n10 = locate(ids[1], q10);
        r.matchError = Math.max(r.matchError, n4.d, n10.d);
        const s4 = S.data.get(n4.id), s10 = S.data.get(n10.id); if (!s4 || !s10) continue;
        const hs = Math.abs(1.67 * principal(s4) - 0.67 * principal(s10)) / model.nominal[name];
        if (hs > r[side]) { r[side] = hs; r[side + "Phi"] = pth.phi * 180 / Math.PI; }
        const dir = pth[side + "Dir"];
        if (dir) { const hp = Math.abs(1.67 * normalStress(s4, dir) - 0.67 * normalStress(s10, dir)) / model.nominal[name]; r[side + "Perp"] = Math.max(r[side + "Perp"], hp); }
      }
      res[name] = r;
    });
    return res;
  }
  // Cantilever check: mean tip-face displacement per step from the .frd, vs. the beam-theory numbers
  function readTube(model, frd) {
    if (typeof frd === "string") frd = parseFrd(frd);
    const D = frd.blocks.filter(bk => bk.name === "DISP");
    const mean = (blk, comp) => { let s = 0, n = 0; for (const id of model.tipNodes) { const v = blk.data.get(id); if (v) { s += v[comp]; n++; } } return n ? s / n : NaN; };
    const uz = D[0] ? mean(D[0], 2) : NaN, ux = D[1] ? mean(D[1], 0) : NaN;
    return { tipUz: uz, expectedUz: model.expected.tipDeflectionZ, ratioUz: uz / model.expected.tipDeflectionZ, tipUx: ux, expectedUx: model.expected.axialStretchX, ratioUx: ux / model.expected.axialStretchX };
  }

  // ---- one solid model per welded tube joint of an analysed design (result from FrameFEA.analyze).
  // Joints with the same sizes and angle (left/right seat stays, etc.) share one model. Returns
  // [{ key, names, o (build options), D, T, d, t, theta, weldLeg, ok, reason }].
  function jointCases(result, opts = {}) {
    const out = new Map();
    const sig = (typeof FrameFEA !== "undefined" && FrameFEA.jointSig) || ((D, T, d, t, th) => `${(+D).toFixed(1)}x${(+T).toFixed(2)}/${(+d).toFixed(1)}x${(+t).toFixed(2)}@${Math.round(th)}`);
    for (const st of result.sites || []) {
      if (st.kind !== "joint" || !st.params || !st.chord || st.chordSide) continue;
      const s = st.section, D = st.chord.D, T = st.chord.T, theta = st.params.theta;
      const d = s.h, t = s.t;
      // weld legs from builder photos (TIG beads ~5–6 mm wide on the main tubes); smaller on small tubes
      const weldLeg = opts.weldLeg || (d < 16 ? 2.0 : 2.7);
      const key = sig(D, T, d, t, theta);
      if (out.has(key)) { out.get(key).names.push(st.name); continue; }
      const c = { key, names: [st.name], D, T, d, t, theta: +theta.toFixed(2), weldLeg, bb: !!st.chord.bb, ok: true, reason: "" };
      if (!s.round) { c.ok = false; c.reason = "brace tube isn't round (oval/shaped tubes not supported by this model yet)"; }
      else if (d >= 0.96 * D) { c.ok = false; c.reason = "brace is as big as (or bigger than) the tube it joins; the model needs a narrower brace"; }
      else if (theta < 25) { c.ok = false; c.reason = "joint angle below 25° (too shallow for the mesher)"; }
      c.o = { D, T, d, t, theta: Math.max(25, Math.min(90, theta)), weldLeg, NC: opts.NC || 40 };
      if (c.ok && opts.check !== false) { try { build(c.o); } catch (e) { c.ok = false; c.reason = e.message; } }
      out.set(key, c);
    }
    return [...out.values()];
  }
  // SCF entry for FrameFEA (design.material.feSCF) from a solved model
  function feEntry(c, model, frd) {
    const r = readSCF(model, frd), pick = side => ({ axial: +r.axial[side].toFixed(3), ipb: +r.ipb[side].toFixed(3), opb: +r.opb[side].toFixed(3) });
    if (!r.axial || !r.ipb || !r.opb) throw new Error("CalculiX results are missing load steps for this joint.");
    const matchError = Math.max(r.axial.matchError, r.ipb.matchError, r.opb.matchError);
    // results from a different mesh (e.g. a stale job file) don't line up with this model's read-out points
    if (!(matchError < 0.01)) throw new Error(`CalculiX results don't match this joint's mesh (read-out points off by ${matchError.toFixed(2)} mm).`);
    const e = { D: c.D, T: c.T, d: c.d, t: c.t, theta: c.theta, weldLeg: c.weldLeg, names: c.names, chord: pick("chord"), brace: pick("brace"), matchError, date: new Date().toISOString().slice(0, 10) };
    for (const s of ["chord", "brace"]) for (const k of ["axial", "ipb", "opb"]) if (!(e[s][k] > 0.3 && e[s][k] < 50)) throw new Error(`Implausible stress factor ${e[s][k]} (${s} ${k}); not stored.`);
    return e;
  }

  root.FrameSolidJoint = { build, buildTube, readSCF, readTube, parseFrd, checkMesh, principal, jointCases, feEntry };
  if (typeof module !== "undefined") module.exports = root.FrameSolidJoint;
})(typeof window !== "undefined" ? window : globalThis);
