// ============================================================================
//  SMALL 3D ENGINE for the realistic bike view (WebGL2, no libraries)
//  Mesh building helpers (tubes, lathes, rounded blocks, discs, plates) plus a
//  renderer with metal/paint shading, a soft studio light, brushed-metal
//  streaks and soft shadows on the floor. Display only: nothing here touches
//  the stress analysis. Works from file:// (no modules, no file loading).
// ============================================================================
(function (root) {
  "use strict";
  // ---------------------------------------------------------------- vectors (plain arrays)
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  };
  // any two unit vectors perpendicular to n
  function perp(n) {
    const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = V.norm(V.cross(a, n)), e2 = V.cross(n, e1);
    return [e1, e2];
  }
  const spow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);

  // ---------------------------------------------------------------- 4x4 matrices (column-major)
  const M4 = {
    ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
    ortho(l, r, b, t, n, f) { const o = new Float32Array(16); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o; },
    lookAt(eye, tgt, up) {
      const z = V.norm(V.sub(eye, tgt)), x = V.norm(V.cross(up, z)), y = V.cross(z, x);
      return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -V.dot(x, eye), -V.dot(y, eye), -V.dot(z, eye), 1]);
    },
    rotZ(a, cx, cy) { const c = Math.cos(a), s = Math.sin(a), o = M4.ident(); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; o[12] = cx - c * cx + s * cy; o[13] = cy - s * cx - c * cy; return o; }
  };

  // ---------------------------------------------------------------- mesh builder
  class Mesh {
    constructor() { this.p = []; this.n = []; this.uv = []; this.t = []; this.c = []; this.i = []; }
    get count() { return this.p.length / 3; }
    v(p, n, uv, t, c) {
      this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]);
      this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0); const tt = t || [1, 0, 0]; this.t.push(tt[0], tt[1], tt[2]);
      const cc = c || [1, 1, 1]; this.c.push(cc[0], cc[1], cc[2]);
      return this.count - 1;
    }
    tri(a, b, c) { this.i.push(a, b, c); }
    // rows × cols grid of vertices made by f(i, j) → {p, n, uv, t, c}
    grid(rows, cols, f) {
      const base = this.count;
      for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) { const q = f(i, j); this.v(q.p, q.n, q.uv, q.t, q.c); }
      const W = cols + 1;
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const a = base + i * W + j, b = a + 1, c = a + W, d = c + 1;
        this.i.push(a, c, b, b, c, d);
      }
    }
  }

  // Swept tube through ring centres P with per-ring radii.
  //  opts: rh[], rw[] (half sizes: h in the 'up' direction, w in the 'ref' direction), ref (default +z), exp (2 = ellipse,
  //  4 = rounded box), seg, col[] (per ring colours), cap0/cap1: "flat" | "dome" | null, closed (loop), uScale, ripple
  function sweep(M, P, opts) {
    const n = P.length; if (n < 2) return;
    const seg = opts.seg || 20, ref = opts.ref || [0, 0, 1], ex = opts.exp || 2, closed = !!opts.closed;
    const T = [], H = [], W = [];
    for (let k = 0; k < n; k++) {
      let t;
      if (closed) t = V.sub(P[(k + 1) % n], P[(k - 1 + n) % n]);
      else t = k === 0 ? V.sub(P[1], P[0]) : k === n - 1 ? V.sub(P[n - 1], P[n - 2]) : V.sub(P[k + 1], P[k - 1]);
      t = V.norm(t); T.push(t);
      let r = typeof ref === "function" ? ref(k) : ref;
      let w = V.sub(r, V.mul(t, V.dot(r, t)));
      if (V.len(w) < 1e-3) { w = k > 0 ? V.sub(W[k - 1], V.mul(t, V.dot(W[k - 1], t))) : perp(t)[0]; }
      w = V.norm(w);
      if (k > 0 && V.dot(w, W[k - 1]) < 0 && !opts.noFlipFix) w = V.mul(w, -1);
      W.push(w); H.push(V.cross(w, t));
    }
    const rh = k => Array.isArray(opts.rh) ? opts.rh[k] : opts.rh, rw = k => Array.isArray(opts.rw) ? opts.rw[k] : (opts.rw == null ? rh(k) : opts.rw);
    const cum = [0]; for (let k = 1; k < n; k++) cum.push(cum[k - 1] + V.dist(P[k], P[k - 1]));
    const us = opts.uScale || 0.01, e = 2 / ex, rip = opts.ripple;
    const rows = closed ? n : n - 1;
    const ringPt = (k, j) => {
      const kk = k % n, th = j / seg * 2 * Math.PI, c = Math.cos(th), s = Math.sin(th);
      let a = rh(kk), b = rw(kk);
      if (rip) { const f = 1 + rip.amp * Math.cos(cum[kk] / rip.pitch * 2 * Math.PI); a *= f; b *= f; }
      const pc = spow(c, e) * a, ps = spow(s, e) * b;
      const nc = spow(c, 2 - e) / Math.max(a, 1e-6), ns = spow(s, 2 - e) / Math.max(b, 1e-6);
      const p = V.add(P[kk], V.add(V.mul(H[kk], pc), V.mul(W[kk], ps)));
      const nn = V.norm(V.add(V.mul(H[kk], nc), V.mul(W[kk], ns)));
      return { p, n: nn, uv: [(closed && k === n ? cum[n - 1] + V.dist(P[n - 1], P[0]) : cum[kk]) * us, j / seg], t: T[kk], c: opts.col ? opts.col[kk] : null };
    };
    M.grid(rows, seg, (i, j) => ringPt(i, j));
    if (closed) return;
    for (const [end, kind] of [[0, opts.cap0], [n - 1, opts.cap1]]) {
      if (!kind) continue;
      const sgn = end === 0 ? -1 : 1, t = V.mul(T[end], sgn), c = opts.col ? opts.col[end] : null;
      if (kind === "flat") {
        const ci = M.v(P[end], t, [0, 0], H[end], c), b0 = M.count;
        for (let j = 0; j <= seg; j++) { const q = ringPt(end, j); M.v(q.p, t, [0, 0], H[end], c); }
        for (let j = 0; j < seg; j++) M.tri(ci, b0 + j, b0 + j + 1);
      } else {
        const rings = 6, base = M.count, depth = opts.domeDepth || Math.min(rh(end), rw(end));
        for (let r = 0; r <= rings; r++) {
          const ph = r / rings * Math.PI / 2, cr = Math.cos(ph), sr = Math.sin(ph);
          for (let j = 0; j <= seg; j++) {
            const q = ringPt(end, j), off = V.sub(q.p, P[end]);
            const p = V.add(V.add(P[end], V.mul(off, cr)), V.mul(t, depth * sr));
            const nn = V.norm(V.add(V.mul(q.n, cr), V.mul(t, sr)));
            M.v(p, nn, [0, 0], H[end], c);
          }
        }
        for (let r = 0; r < rings; r++) for (let j = 0; j < seg; j++) { const a = base + r * (seg + 1) + j, b = a + 1, cc = a + seg + 1, d = cc + 1; M.i.push(a, cc, b, b, cc, d); }
      }
    }
  }

  // Solid of revolution around an axis. prof = [[r, s], ...] ordered from the bottom (s low) up; a repeated point makes
  // a sharp edge. Optional per-point colours profCol.
  function lathe(M, o, axis, prof, seg, opts) {
    opts = opts || {};
    axis = V.norm(axis); const [e1, e2] = opts.basis || perp(axis), n = prof.length;
    const nrm = [];
    for (let k = 0; k < n; k++) {
      const pa = prof[Math.max(0, k - 1)], pb = prof[Math.min(n - 1, k + 1)], p = prof[k];
      let a = pa, b = pb;
      if (k > 0 && prof[k - 1][0] === p[0] && prof[k - 1][1] === p[1]) a = p;       // sharp edge: one-sided
      if (k < n - 1 && prof[k + 1][0] === p[0] && prof[k + 1][1] === p[1]) b = p;
      let dr = b[0] - a[0], ds = b[1] - a[1]; const l = Math.hypot(dr, ds) || 1;
      nrm.push([ds / l, -dr / l]);
    }
    const a0 = opts.a0 || 0, a1 = opts.a1 == null ? 2 * Math.PI : opts.a1;
    M.grid(n - 1, seg, (i, j) => {
      const th = a0 + (a1 - a0) * j / seg, c = Math.cos(th), s = Math.sin(th);
      const rad = V.add(V.mul(e1, c), V.mul(e2, s));
      const p = V.add(V.add(o, V.mul(rad, prof[i][0])), V.mul(axis, prof[i][1]));
      const nn = V.norm(V.add(V.mul(rad, nrm[i][0]), V.mul(axis, nrm[i][1])));
      return { p, n: nn, uv: [prof[i][1] * 0.01, j / seg], t: V.cross(axis, rad), c: opts.col ? opts.col[i] : null };
    });
  }
  // closed cylinder from a to b (radius r1 at a, r2 at b)
  function cyl(M, a, b, r1, r2, seg, opts) {
    const ax = V.sub(b, a), L = V.len(ax);
    if (L < 1e-6) return;
    const caps = !opts || opts.caps !== false;
    const prof = caps ? [[0, 0], [r1, 0], [r1, 0], [r2, L], [r2, L], [0, L]] : [[r1, 0], [r2, L]];
    lathe(M, a, ax, prof, seg || 16, opts);
  }
  function torus(M, c, axis, R, r, seg, segR, opts) {
    const prof = []; const sr = segR || 10;
    for (let k = 0; k <= sr; k++) { const t = -Math.PI / 2 + k / sr * 2 * Math.PI; prof.push([R - r * Math.cos(t), r * Math.sin(t)]); }
    lathe(M, c, axis, prof, seg || 32, opts);
  }
  // Rounded block (superellipsoid). ax/ay/az: unit axes, a/b/c half sizes, e: roundness (0.2 boxy … 1 ellipsoid)
  function blob(M, c, ax, ay, az, a, b, cc, e, seg, col) {
    const e1 = e == null ? 0.3 : e, e2 = e1, nu = seg || 10, nv = (seg || 10) * 2;
    M.grid(nu, nv, (i, j) => {
      const th = -Math.PI / 2 + Math.PI * i / nu, ph = -Math.PI + 2 * Math.PI * j / nv;
      const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
      const x = a * spow(ct, e1) * spow(cp, e2), y = b * spow(ct, e1) * spow(sp, e2), z = cc * spow(st, e1);
      const nx = spow(ct, 2 - e1) * spow(cp, 2 - e2) / a, ny = spow(ct, 2 - e1) * spow(sp, 2 - e2) / b, nz = spow(st, 2 - e1) / cc;
      const p = V.add(c, V.add(V.add(V.mul(ax, x), V.mul(ay, y)), V.mul(az, z)));
      const n = V.norm(V.add(V.add(V.mul(ax, nx), V.mul(ay, ny)), V.mul(az, nz)));
      return { p, n, uv: [x * 0.01, y * 0.01], t: ax, c: col };
    });
  }
  // Flat disc (two faces 'th' apart) textured by a square canvas: texture (0.5,0.5) at the centre, half-width = R
  function disc(M, c, axis, R, th, seg, basis) {
    axis = V.norm(axis); const [e1, e2] = basis || perp(axis);
    for (const side of [-1, 1]) {
      const cc = V.madd(c, axis, side * th / 2), n = V.mul(axis, side);
      const ci = M.v(cc, n, [0.5, 0.5], e1), b0 = M.count;
      for (let j = 0; j <= seg; j++) { const t = j / seg * 2 * Math.PI, x = Math.cos(t), y = Math.sin(t); M.v(V.add(cc, V.add(V.mul(e1, R * x), V.mul(e2, R * y))), n, [0.5 + 0.5 * x, 0.5 + 0.5 * y], e1); }
      for (let j = 0; j < seg; j++) M.tri(ci, b0 + j, b0 + j + 1);
    }
  }
  // Plate: a star-shaped 2D outline (points [x, y] in the e1/e2 plane through o) extruded from z0 to z1 along n
  function plate(M, o, e1, e2, n, outline, z0, z1, col) {
    const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length, cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    const P3 = (x, y, z) => V.add(o, V.add(V.add(V.mul(e1, x), V.mul(e2, y)), V.mul(n, z)));
    const L = outline.length;
    for (const [z, sg] of [[z0, -1], [z1, 1]]) {
      const nn = V.mul(n, sg), ci = M.v(P3(cx, cy, z), nn, [cx * 0.01, cy * 0.01], e1, col), b0 = M.count;
      for (let k = 0; k <= L; k++) { const p = outline[k % L]; M.v(P3(p[0], p[1], z), nn, [p[0] * 0.01, p[1] * 0.01], e1, col); }
      for (let k = 0; k < L; k++) sg > 0 ? M.tri(ci, b0 + k, b0 + k + 1) : M.tri(ci, b0 + k + 1, b0 + k);
    }
    // side wall, smooth normals
    const nr = outline.map((p, k) => { const a = outline[(k - 1 + L) % L], b = outline[(k + 1) % L]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });
    // orientation: make normals point away from the centroid
    const sgn = (nr[0][0] * (outline[0][0] - cx) + nr[0][1] * (outline[0][1] - cy)) < 0 ? -1 : 1;
    M.grid(1, L, (i, j) => { const k = j % L, p = outline[k], nn = V.norm(V.add(V.mul(e1, nr[k][0] * sgn), V.mul(e2, nr[k][1] * sgn))); return { p: P3(p[0], p[1], i ? z1 : z0), n: nn, uv: [j / L, i], t: n, c: col }; });
  }
  // convex hull of circles [[x, y, r], ...] → outline points
  function hullCircles(cs, k) {
    const pts = []; k = k || 24;
    for (const [x, y, r] of cs) for (let i = 0; i < k; i++) { const t = i / k * 2 * Math.PI; pts.push([x + r * Math.cos(t), y + r * Math.sin(t)]); }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  // Catmull-Rom resample of a polyline: 'per' points per span
  function smoothPath(P, per, closed) {
    const n = P.length, out = [];
    const at = k => closed ? P[(k + n) % n] : P[Math.max(0, Math.min(n - 1, k))];
    const spans = closed ? n : n - 1;
    for (let k = 0; k < spans; k++) {
      const p0 = at(k - 1), p1 = at(k), p2 = at(k + 1), p3 = at(k + 2);
      for (let s = 0; s < per; s++) {
        const t = s / per, t2 = t * t, t3 = t2 * t;
        out.push([0, 1, 2].map(i => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)));
      }
    }
    if (!closed) out.push(P[n - 1]);
    return out;
  }

  // ---------------------------------------------------------------- colours
  const hex2lin = h => { h = String(h || "#888").replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.pow(v / 255, 2.2)); };
  const css2lin = s => { const m = String(s).match(/\d+(\.\d+)?/g); if (!m) return hex2lin(s); return m.slice(0, 3).map(v => Math.pow(+v / 255, 2.2)); };

  // ---------------------------------------------------------------- shaders
  const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUv; layout(location=3) in vec3 aT; layout(location=4) in vec3 aC;
uniform mat4 uVP, uModel, uLVP;
out vec3 vP; out vec3 vN; out vec3 vT; out vec3 vC; out vec2 vUv; out vec4 vS;
void main(){ vec4 wp = uModel*vec4(aP,1.0); vP = wp.xyz; vN = mat3(uModel)*aN; vT = mat3(uModel)*aT; vC = aC; vUv = aUv;
  vS = uLVP*(wp + vec4(normalize(vN)*1.6, 0.0)); gl_Position = uVP*wp; }`;
  const FS = `#version 300 es
precision highp float;
in vec3 vP; in vec3 vN; in vec3 vT; in vec3 vC; in vec2 vUv; in vec4 vS;
uniform vec3 uCam, uBase, uBg, uKeyDir, uKeyCol, uFillDir, uFillCol, uEnvTop, uEnvHor, uEnvGnd;
uniform float uMetal, uRough, uAniso, uBrushed, uClear, uAlphaTest, uExposure, uTwoSided, uGround, uEnvInt, uSheen, uFlake, uWeave, uMirror, uFloorRefl;
uniform float uOpacity, uGhost;   // overlay.js: a second bike drawn see-through (uGhost 1, uOpacity < 1) or in one solid colour
uniform int uUseVC, uUseMap;
uniform sampler2D uMap;
uniform highp sampler2DShadow uShadow;
uniform vec2 uShadowTexel;
uniform vec3 uContact0, uContact1;
out vec4 frag;
const float PI = 3.14159265;
float hash(float n){ return fract(sin(n)*43758.5453); }
float softbox(vec3 d, vec3 c, vec2 hs, float w){
  vec3 up = abs(c.y) > 0.9 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);
  vec3 a = normalize(cross(up, c)); vec3 b = cross(c, a);
  float dc = dot(d, c); if (dc <= 0.0) return 0.0;
  float u = atan(dot(d, a), dc), v = atan(dot(d, b), dc);
  float m = (1.0 - smoothstep(hs.x - w, hs.x + w, abs(u))) * (1.0 - smoothstep(hs.y - w, hs.y + w, abs(v)));
  return m * (hs.x*hs.y) / ((hs.x + w)*(hs.y + w));
}
vec3 envMap(vec3 d, float r){
  float y = d.y;
  vec3 c = y > 0.0 ? mix(uEnvHor, uEnvTop, pow(y, 0.7)) : mix(uEnvHor, uEnvGnd, pow(-y, 0.35));
  float w = 0.03 + r*r*1.4;
  c += softbox(d, normalize(vec3(0.25, 1.0, 0.35)), vec2(0.55, 0.35), w) * 4.0;
  c += softbox(d, normalize(vec3(-0.85, 0.35, 0.75)), vec2(0.12, 0.55), w) * 2.4;
  c += softbox(d, normalize(vec3(0.9, 0.25, 0.6)), vec2(0.10, 0.5), w) * 1.6;
  c += softbox(d, normalize(vec3(0.3, 0.3, -1.0)), vec2(0.25, 0.4), w) * 1.2;
  return c * uEnvInt;
}
vec3 irradiance(vec3 n){ return mix(uEnvGnd*1.4, uEnvTop, 0.5 + 0.5*n.y) * uEnvInt + vec3(0.06); }
vec3 envBRDF(vec3 F0, float r, float NoV){
  vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022), c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 rr = r * c0 + c1; float a004 = min(rr.x*rr.x, exp2(-9.28*NoV))*rr.x + rr.y;
  vec2 AB = vec2(-1.04, 1.04)*a004 + rr.zw; return F0*AB.x + AB.y;
}
float shadowAt(){
  vec3 sc = vS.xyz / vS.w * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  float s = 0.0;
  for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) s += texture(uShadow, vec3(sc.xy + vec2(float(i), float(j))*uShadowTexel*1.2, sc.z - 0.0015));
  return s / 25.0;
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03)) / (x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
float Dgx(float NoH, float a){ float a2 = a*a; float d = NoH*NoH*(a2 - 1.0) + 1.0; return a2 / (PI*d*d); }
float Dan(vec3 H, vec3 N, vec3 T, vec3 B, float at, float ab){ float x = dot(T,H)/at, y = dot(B,H)/ab, z = dot(N,H); float d = x*x + y*y + z*z; return 1.0 / (PI*at*ab*d*d); }
void main(){
  if (uGround > 0.5) {
    float sh = shadowAt();
    float ao = 0.0;
    vec2 d0 = (vP.xz - uContact0.xz) / vec2(120.0, 45.0), d1 = (vP.xz - uContact1.xz) / vec2(120.0, 45.0);
    ao = 0.30*exp(-dot(d0, d0)) + 0.30*exp(-dot(d1, d1));
    float fade = 1.0 - smoothstep(900.0, 2600.0, length(vP.xz - 0.5*(uContact0.xz + uContact1.xz)));
    float dark = clamp(((1.0 - sh)*0.42 + ao) * fade, 0.0, 0.75);
    float rf = uFloorRefl * (1.0 - smoothstep(150.0, 1100.0, length(vP.xz - 0.5*(uContact0.xz + uContact1.xz))));
    frag = vec4(uBg * (1.0 - dark), 1.0 - rf); return;
  }
  vec4 tex = vec4(1.0);
  if (uUseMap == 1) { tex = texture(uMap, vUv); if (tex.a < uAlphaTest) discard; }
  vec3 base = uBase * (uGhost > 0.5 ? vec3(1.0) : tex.rgb); if (uUseVC == 1 && uGhost < 0.5) base *= vC;   // overlay bike: one clean colour (texture only cuts out holes)
  float weaveR = 0.0;
  if (uWeave > 0.0) {   // 2x2 twill carbon weave (about 3 mm tows), world space
    vec3 q = vP * 0.33; float ch = mod(floor(q.x + q.y) + floor(q.z - q.y), 2.0);
    float fib = 0.5 + 0.5*sin((ch > 0.5 ? q.x + q.y : q.z - q.y) * 37.0);
    base *= mix(0.78, 1.22, ch) * (0.94 + 0.12*fib); weaveR = (ch - 0.5)*0.12;
  }
  vec3 N = normalize(vN); vec3 V = normalize(uCam - vP);
  if (uTwoSided > 0.5 && dot(N, V) < 0.0) N = -N;
  float rough = clamp(uRough + weaveR, 0.04, 1.0);
  if (uBrushed > 0.0) {
    float line = hash(floor(vUv.y*700.0) + 0.37*floor(vUv.x*3.0));
    float line2 = hash(floor(vUv.y*2300.0 + 11.0));
    float st = 0.6*line + 0.4*line2;
    base *= 1.0 + uBrushed*(st - 0.5)*0.22;
    rough = clamp(rough + uBrushed*(st - 0.5)*0.14, 0.04, 1.0);
  }
  vec3 T = vT - N*dot(vT, N); T = length(T) > 1e-4 ? normalize(T) : vec3(1.0,0.0,0.0);
  vec3 B = cross(N, T);
  float a = max(rough*rough, 0.003);
  float at = max(a*(1.0 - 0.6*uAniso), 0.003), ab = max(a*(1.0 + 1.6*uAniso), 0.003);
  vec3 F0 = mix(vec3(0.04), base, uMetal);
  vec3 diffC = base * (1.0 - uMetal);
  float NoV = max(dot(N, V), 1e-3);
  float sh = uMirror > 0.5 ? 0.8 : shadowAt();
  vec3 col = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    vec3 L = k == 0 ? normalize(uKeyDir) : normalize(uFillDir); vec3 lc = k == 0 ? uKeyCol*sh : uFillCol;
    float NoL = max(dot(N, L), 0.0); if (NoL <= 0.0) continue;
    vec3 H = normalize(L + V); float NoH = max(dot(N, H), 0.0), VoH = max(dot(V, H), 0.0);
    float D = uAniso > 0.0 ? Dan(H, N, T, B, at, ab) : Dgx(NoH, a);
    vec3 F = F0 + (1.0 - F0)*pow(1.0 - VoH, 5.0);
    float k2 = (rough + 1.0)*(rough + 1.0)/8.0; float G = NoL/(NoL*(1.0-k2)+k2) * NoV/(NoV*(1.0-k2)+k2);
    vec3 spec = D*F*G / max(4.0*NoL*NoV, 1e-3);
    col += (diffC/PI + spec) * lc * NoL;
    if (uClear > 0.0) { float Dc = Dgx(NoH, 0.04); float Fc = 0.04 + 0.96*pow(1.0 - VoH, 5.0); col += uClear * Dc*Fc*0.25 * lc * NoL; }
  }
  // image-based light from the procedural studio
  vec3 Nb = N;
  if (uAniso > 0.0) { vec3 aT2 = cross(B, V); vec3 aN = cross(aT2, B); Nb = normalize(mix(N, aN, clamp(uAniso*rough*1.4, 0.0, 0.9))); }
  vec3 R = reflect(-V, Nb);
  float ao = 0.55 + 0.45*clamp(0.5 + 0.5*N.y, 0.0, 1.0);
  col += diffC * irradiance(N) * ao;
  col += envMap(R, rough) * envBRDF(F0, rough, NoV) * mix(ao, 1.0, 0.5) * (0.65 + 0.35*sh);
  if (uClear > 0.0) { float Fc = 0.04 + 0.96*pow(1.0 - NoV, 5.0); col += uClear * Fc * envMap(reflect(-V, N), 0.08); }
  if (uSheen > 0.0) col += uSheen * pow(1.0 - NoV, 3.0) * irradiance(N) * 0.4;
  if (uFlake > 0.0) {   // metallic paint: sparkling flakes under the clear coat
    vec3 cell = floor(vP * 5.0); float h = hash(dot(cell, vec3(1.0, 57.0, 113.0)));
    vec3 fn = normalize(N + (vec3(hash(h*7.13), hash(h*3.31), hash(h*5.77)) - 0.5) * 0.9);
    col += uFlake * pow(h, 6.0) * envMap(reflect(-V, fn), 0.12) * base * 1.4;
    col += uFlake * 0.25 * base * envMap(reflect(-V, N), 0.45) * pow(NoV, 2.0);
  }
  col = aces(col * uExposure);
  // overlay ghost: edges (grazing view) more opaque than faces, so tube outlines read clearly through the other bike
  float alpha = uGhost > 0.5 ? clamp(uOpacity * (0.55 + 1.3*pow(1.0 - NoV, 2.0)), 0.0, 1.0) : 1.0;
  frag = vec4(pow(col, vec3(1.0/2.2)), alpha);
}`;
  const VS_D = `#version 300 es
layout(location=0) in vec3 aP; layout(location=2) in vec2 aUv;
uniform mat4 uLVP, uModel; out vec2 vUv;
void main(){ vUv = aUv; gl_Position = uLVP*uModel*vec4(aP,1.0); }`;
  const FS_D = `#version 300 es
precision mediump float; in vec2 vUv; uniform int uUseMap; uniform sampler2D uMap; uniform float uAlphaTest; out vec4 o;
void main(){ if (uUseMap == 1 && texture(uMap, vUv).a < uAlphaTest) discard; o = vec4(1.0); }`;

  const VS_Q = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vUv; void main(){ vec2 p = P[gl_VertexID]; vUv = p*0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
  const FS_COPY = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; out vec4 o; void main(){ o = vec4(texture(uTex, vUv).rgb, 1.0); }`;
  const FS_PRESENT = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; uniform float uVig; out vec4 o;
void main(){ vec3 c = texture(uTex, vUv).rgb; vec2 d = vUv - 0.5; float v = 1.0 - uVig * smoothstep(0.35, 1.2, dot(d, d) * 2.0);
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) / 255.0; o = vec4(c * v + g, 1.0); }`;

  // ---------------------------------------------------------------- renderer
  class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
      if (!gl) throw new Error("WebGL2 not available");
      this.gl = gl; this.canvas = canvas; this.items = []; this.textures = [];
      this.prog = this._prog(VS, FS); this.dprog = this._prog(VS_D, FS_D);
      this.U = this._uniforms(this.prog, ["uVP", "uModel", "uLVP", "uCam", "uBase", "uBg", "uKeyDir", "uKeyCol", "uFillDir", "uFillCol", "uEnvTop", "uEnvHor", "uEnvGnd",
        "uMetal", "uRough", "uAniso", "uBrushed", "uClear", "uAlphaTest", "uExposure", "uTwoSided", "uGround", "uEnvInt", "uSheen", "uUseVC", "uUseMap", "uMap", "uShadow", "uShadowTexel", "uContact0", "uContact1", "uFlake", "uWeave", "uMirror", "uFloorRefl", "uOpacity", "uGhost"]);
      // progressive quality: frames rendered into a 4x MSAA buffer, averaged in a float buffer while the view is still
      this.qprog = this._prog(VS_Q, FS_COPY); this.pprog = this._prog(VS_Q, FS_PRESENT);
      this.QU = this._uniforms(this.qprog, ["uTex"]); this.PU = this._uniforms(this.pprog, ["uTex", "uVig"]);
      this.floatOk = !!gl.getExtension("EXT_color_buffer_float"); this.tw = 0; this.th = 0;
      this.DU = this._uniforms(this.dprog, ["uLVP", "uModel", "uUseMap", "uMap", "uAlphaTest"]);
      this.SM = 2048;
      this.shadowTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.SM, this.SM);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      this.shadowFb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.whiteTex = this.texture(null);
      this.shadowDirty = true;
    }
    _prog(vs, fs) {
      const gl = this.gl, mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
      const p = gl.createProgram(), v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
      const ok = gl.getProgramParameter(p, gl.LINK_STATUS), log = ok ? "" : gl.getProgramInfoLog(p);
      // the compiled shaders are no longer needed once linked
      gl.detachShader(p, v); gl.detachShader(p, f); gl.deleteShader(v); gl.deleteShader(f);
      if (!ok) { gl.deleteProgram(p); throw new Error(log); }
      return p;
    }
    _uniforms(p, names) { const o = {}; for (const n of names) o[n] = this.gl.getUniformLocation(p, n); return o; }
    // canvas (or null for plain white) → texture
    texture(canvas) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (canvas) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures.push(t);
      return t;
    }
    // upload a Mesh with a material {base, metal, rough, aniso, brushed, clear, map, alphaTest, twoSided, vc, ground, sheen, noShadow}
    add(mesh, mat) {
      if (!mesh.count || !mesh.i.length) return null;
      const gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const bufs = [];
      const attr = (loc, data, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); bufs.push(b); };
      attr(0, mesh.p, 3); attr(1, mesh.n, 3); attr(2, mesh.uv, 2); attr(3, mesh.t, 3); attr(4, mesh.c, 3);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.i), gl.STATIC_DRAW); bufs.push(ib);
      gl.bindVertexArray(null);
      const it = { vao, bufs, count: mesh.i.length, mat };
      this.items.push(it); this.shadowDirty = true;
      return it;
    }
    clear() {
      const gl = this.gl;
      for (const it of this.items) { gl.deleteVertexArray(it.vao); for (const b of it.bufs) gl.deleteBuffer(b); }
      this.items = [];
      for (const t of this.textures) if (t !== this.whiteTex) gl.deleteTexture(t);
      this.textures = [this.whiteTex];
      this.shadowDirty = true;
    }
    dispose() { this.clear(); const gl = this.gl; gl.deleteTexture(this.whiteTex); gl.deleteTexture(this.shadowTex); gl.deleteFramebuffer(this.shadowFb); gl.deleteProgram(this.prog); gl.deleteProgram(this.dprog); const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); }
    _targets(w, h) {
      const gl = this.gl; if (this.tw === w && this.th === h) return;
      this.tw = w; this.th = h;
      for (const k of ["msFb", "resFb", "accFb"]) if (this[k]) gl.deleteFramebuffer(this[k]);
      for (const k of ["msCol", "msDep"]) if (this[k]) gl.deleteRenderbuffer(this[k]);
      for (const k of ["resTex", "accTex"]) if (this[k]) gl.deleteTexture(this[k]);
      const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
      this.msCol = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.msCol); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
      this.msDep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.msDep); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
      this.msFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msCol); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.msDep);
      const tex = (fmt, type, ifmt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
      this.resTex = tex(0, gl.UNSIGNED_BYTE, gl.RGBA8);
      this.resFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.resFb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.resTex, 0);
      this.accTex = this.floatOk ? tex(0, gl.HALF_FLOAT, gl.RGBA16F) : tex(0, gl.UNSIGNED_BYTE, gl.RGBA8);
      this.accFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.accFb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accTex, 0);
      this.accOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // one frame of the scene; S.frame = index in the progressive sequence (0 = fresh view), S.floorRefl = floor gloss (0–0.3)
    renderProgressive(S) {
      const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
      this._targets(w, h);
      this.render(S, this.msFb);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resFb);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(null); gl.viewport(0, 0, w, h);
      // average into the accumulation buffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.accFb); gl.useProgram(this.qprog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.resTex); gl.uniform1i(this.QU.uTex, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA); gl.blendColor(0, 0, 0, 1 / ((S.frame || 0) + 1));
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disable(gl.BLEND);
      // show it, with a soft photographic vignette
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(this.pprog);
      gl.bindTexture(gl.TEXTURE_2D, this.accOk ? this.accTex : this.resTex); gl.uniform1i(this.PU.uTex, 0); gl.uniform1f(this.PU.uVig, S.vignette == null ? 0.22 : S.vignette);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
    }
    // scene: {model, VP, cam, LVP, bg, env, key, fill, contacts, exposure, floorRefl, groundY}
    render(S, target) {
      const gl = this.gl;
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      if (this.shadowDirty) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb); gl.viewport(0, 0, this.SM, this.SM);
        gl.clear(gl.DEPTH_BUFFER_BIT); gl.useProgram(this.dprog); const U = this.DU;
        gl.uniformMatrix4fv(U.uLVP, false, S.LVP); gl.uniformMatrix4fv(U.uModel, false, S.model);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
        gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U.uMap, 0);
        for (const it of this.items) {
          if (it.mat.ground || it.mat.noShadow) continue;
          gl.uniform1i(U.uUseMap, it.mat.map ? 1 : 0); gl.bindTexture(gl.TEXTURE_2D, it.mat.map || this.whiteTex); gl.uniform1f(U.uAlphaTest, it.mat.alphaTest || 0.5);
          gl.uniformMatrix4fv(U.uModel, false, it.xf || S.model);   // it.xf: overlay bike's own placement
          gl.bindVertexArray(it.vao); gl.drawElements(gl.TRIANGLES, it.count, gl.UNSIGNED_INT, 0);
        }
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.shadowDirty = false;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, target || null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(Math.pow(S.bg[0], 1), Math.pow(S.bg[1], 1), Math.pow(S.bg[2], 1), 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.prog); const U = this.U;
      gl.uniformMatrix4fv(U.uVP, false, S.VP); gl.uniformMatrix4fv(U.uModel, false, S.model); gl.uniformMatrix4fv(U.uLVP, false, S.LVP);
      gl.uniform3fv(U.uCam, S.cam); gl.uniform3fv(U.uBg, S.bg);
      gl.uniform3fv(U.uKeyDir, S.key.dir); gl.uniform3fv(U.uKeyCol, S.key.col); gl.uniform3fv(U.uFillDir, S.fill.dir); gl.uniform3fv(U.uFillCol, S.fill.col);
      gl.uniform3fv(U.uEnvTop, S.env.top); gl.uniform3fv(U.uEnvHor, S.env.hor); gl.uniform3fv(U.uEnvGnd, S.env.gnd); gl.uniform1f(U.uEnvInt, S.env.int);
      gl.uniform1f(U.uExposure, S.exposure); gl.uniform2f(U.uShadowTexel, 1 / this.SM, 1 / this.SM);
      gl.uniform3fv(U.uContact0, S.contacts[0]); gl.uniform3fv(U.uContact1, S.contacts[1]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(U.uShadow, 1);
      gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U.uMap, 0);
      const order = this.items.slice().sort((a, b) => (a.mat.ground ? 2 : a.mat.decal ? 1 : 0) - (b.mat.ground ? 2 : b.mat.decal ? 1 : 0));
      gl.uniform1f(U.uFloorRefl, S.floorRefl || 0);
      // mirror image under a glossy floor (drawn first, the floor then blends over it)
      if (S.floorRefl > 0 && S.groundY != null) {
        const Rm = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2 * S.groundY, 0, 1]);
        gl.uniformMatrix4fv(U.uModel, false, M4.mul(S.model, Rm)); gl.uniform1f(U.uMirror, 1);
        for (const it of order) { if (it.mat.ground || it.xf) continue; this._draw(it); }   // the overlay bike isn't mirrored
        gl.uniformMatrix4fv(U.uModel, false, S.model); gl.uniform1f(U.uMirror, 0);
      } else gl.uniform1f(U.uMirror, 0);
      const see = it => it.mat.ghost && it.mat.opacity != null && it.mat.opacity < 0.999;   // see-through overlay bike (overlay.js)
      for (const it of order) {
        if (see(it)) continue;
        if (it.mat.ground) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); this._draw(it, S.model); gl.disable(gl.BLEND); continue; }
        this._draw(it, S.model);
      }
      // see-through overlay: depth first (so it shows as one clean layer), then blended colour on top of the solid bike and the floor
      const ghosts = order.filter(see);
      if (ghosts.length) {
        gl.colorMask(false, false, false, false); for (const it of ghosts) this._draw(it, S.model); gl.colorMask(true, true, true, true);
        gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
        for (const it of ghosts) this._draw(it, S.model);
        gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
      }
      gl.bindVertexArray(null);
    }
    _draw(it, model) {
      const gl = this.gl, U = this.U;
      {
        const m = it.mat;
        if (model) gl.uniformMatrix4fv(U.uModel, false, it.xf || model);
        gl.uniform1f(U.uGhost, m.ghost ? 1 : 0); gl.uniform1f(U.uOpacity, m.opacity == null ? 1 : m.opacity);
        gl.uniform3fv(U.uBase, m.base || [0.5, 0.5, 0.5]);
        gl.uniform1f(U.uMetal, m.metal || 0); gl.uniform1f(U.uRough, m.rough == null ? 0.5 : m.rough); gl.uniform1f(U.uAniso, m.aniso || 0);
        gl.uniform1f(U.uBrushed, m.brushed || 0); gl.uniform1f(U.uClear, m.clear || 0); gl.uniform1f(U.uAlphaTest, m.alphaTest || 0.5);
        gl.uniform1f(U.uTwoSided, m.twoSided ? 1 : 0); gl.uniform1f(U.uGround, m.ground ? 1 : 0); gl.uniform1f(U.uSheen, m.sheen || 0);
        gl.uniform1f(U.uFlake, m.flake || 0); gl.uniform1f(U.uWeave, m.weave || 0);
        gl.uniform1i(U.uUseVC, m.vc ? 1 : 0); gl.uniform1i(U.uUseMap, m.map ? 1 : 0); gl.bindTexture(gl.TEXTURE_2D, m.map || this.whiteTex);
        if (m.decal) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4); }
        gl.bindVertexArray(it.vao); gl.drawElements(gl.TRIANGLES, it.count, gl.UNSIGNED_INT, 0);
        if (m.decal) gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      gl.bindVertexArray(null);
    }
  }

  root.Bike3DGL = { V, M4, Mesh, sweep, lathe, cyl, torus, blob, disc, plate, hullCircles, smoothPath, perp, spow, hex2lin, css2lin, Renderer };
})(typeof window !== "undefined" ? window : globalThis);
