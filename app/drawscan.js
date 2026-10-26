// ============================================================================
//  DRAWING SCANNER (drawscan.js)
//  Reads the numbers off a frame drawing (builder's AutoCAD sheet, as a PDF
//  render or a photo / screenshot) and suggests values for Cyclic Labs fields.
//
//  How it works, in plain steps:
//   1. Make the picture black & white and find every separate ink blob.
//   2. Blobs about the size of a letter are grouped into words; each word's
//      slant is measured (drawing text runs along tubes at any angle).
//   3. Each word is cut out, turned level and read by the built-in OCR
//      (Tesseract, runs offline inside the page - see ocr.js).
//   4. The text is sorted into kinds (angle, Ø tube callout, wheelbase ...).
//   5. Rules that know the usual builder sheet layout pick which number is which
//      field (reach, stack, head angle, tube sizes ...). Every pick keeps its
//      position, so the review screen can show it on the drawing.
//  Nothing here changes a design: the app shows the picks for the user to
//  confirm first.
// ============================================================================
(function (root) {
  "use strict";
  const DS = {};

  // ---------------------------------------------------------------- 1. ink blobs
  // img = { w, h, g: Uint8Array grey 0..255 }
  DS.threshold = function (img) {
    // Otsu on the histogram, clamped so faint scans and crisp renders both work
    const hist = new Float64Array(256), g = img.g, n = g.length;
    for (let i = 0; i < n; i++) hist[g[i]]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break;
      sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = t; }
    }
    return Math.max(90, Math.min(200, thr));
  };

  DS.components = function (img, thr) {
    const { w, h, g } = img; thr = thr || DS.threshold(img);
    const lab = new Int32Array(w * h), parent = [0];
    const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } };
    let next = 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x; if (g[i] >= thr) continue;
        let l = 0;
        const nb = [x > 0 ? lab[i - 1] : 0, y > 0 && x > 0 ? lab[i - w - 1] : 0, y > 0 ? lab[i - w] : 0, y > 0 && x < w - 1 ? lab[i - w + 1] : 0];
        for (const q of nb) if (q) { if (!l) l = q; else if (q !== l) unite(l, q); }
        if (!l) { l = next++; parent.push(l); }
        lab[i] = l;
      }
    }
    // flatten labels and gather boxes
    const remap = new Int32Array(next); let count = 0;
    for (let l = 1; l < next; l++) { const r = find(l); if (!remap[r]) remap[r] = ++count; remap[l] = remap[r]; }
    const comps = new Array(count + 1);
    for (let c = 1; c <= count; c++) comps[c] = { id: c, x0: w, y0: h, x1: -1, y1: -1, n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 };
    for (let i = 0; i < lab.length; i++) {
      const l = lab[i]; if (!l) continue; const c = comps[lab[i] = remap[l]];
      const x = i % w, y = (i / w) | 0;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y; c.n++; c.sx += x; c.sy += y; c.sxx += x * x; c.syy += y * y; c.sxy += x * y;
    }
    comps.shift();
    for (const c of comps) {
      c.cx = c.sx / c.n; c.cy = c.sy / c.n; c.bw = c.x1 - c.x0 + 1; c.bh = c.y1 - c.y0 + 1; c.big = Math.max(c.bw, c.bh);
      // shape: principal direction and how stretched the blob is (a dash is long and thin)
      const a = c.sxx / c.n - c.cx * c.cx, b = c.syy / c.n - c.cy * c.cy, d = c.sxy / c.n - c.cx * c.cy;
      const tr = (a + b) / 2, df = Math.sqrt(Math.max(0, ((a - b) / 2) ** 2 + d * d));
      c.dir = 0.5 * Math.atan2(2 * d, a - b); c.elong = Math.sqrt((tr + df) / Math.max(0.25, tr - df));
      delete c.sx; delete c.sy; delete c.sxx; delete c.syy; delete c.sxy;
    }
    return { w, h, lab, comps, thr };
  };

  // Erase long straight lines (dimension lines, tube outlines, borders) so numbers that touch them come free.
  // For 36 directions, measure how long a straight ink run passes through each pixel (on a slightly
  // thickened copy so thin lines at an in-between angle still read as one run). Ink on any run longer than
  // ~2.2 letter heights is line, not text. Returns a new grey image with the lines painted white.
  DS.removeLines = function (img, thr, H, bridge) {
    if (bridge === undefined) bridge = DS.BRIDGE !== undefined ? DS.BRIDGE : 1;
    const { w, h, g } = img, N = w * h, ink = new Uint8Array(N);
    for (let i = 0; i < N; i++) ink[i] = g[i] < thr ? 1 : 0;
    const minRun = Math.round(2.2 * H), line = new Uint8Array(N), idx = new Int32Array(Math.max(w, h) + 2), on = new Uint8Array(Math.max(w, h) + 2);
    for (let k = 0; k < 36; k++) {
      const th = k * Math.PI / 36, c = Math.cos(th), s = Math.sin(th);
      const xMajor = Math.abs(c) >= Math.abs(s);
      const slope = xMajor ? s / c : c / s;
      const L = xMajor ? w : h, M = xMajor ? h : w;
      const span = Math.ceil(Math.abs(slope) * L);
      for (let o = -span; o < M + span; o++) {
        let n = 0;
        for (let t = 0; t < L; t++) {
          const m = o + Math.round(slope * t); if (m < 0 || m >= M) continue;
          const p = xMajor ? m * w + t : t * w + m;
          idx[n] = p;
          // ink here or one pixel to either side across the line: a thin line at an in-between angle still reads as
          // one run, but letters standing side by side along the line don't get joined
          on[n] = ink[p] || (m > 0 && ink[xMajor ? p - w : p - 1]) || (m < M - 1 && ink[xMajor ? p + w : p + 1]) ? 1 : 0;
          if (!on[n] && bridge && t > 0 && t < L - 1 && (ink[xMajor ? p - 1 : p - w] || ink[xMajor ? p + 1 : p + w])) on[n] = 1;
          n++;
        }
        let a = 0;
        while (a < n) {
          if (!on[a]) { a++; continue; }
          let b = a; while (b < n && on[b]) b++;
          if (b - a >= minRun) for (let q = a; q < b; q++) line[idx[q]] = 1;
          a = b;
        }
      }
    }
    const out = new Uint8Array(g);
    for (let i = 0; i < N; i++) if (line[i] && ink[i]) out[i] = 255;
    return { w, h, g: out };
  };

  // The drawing border: the biggest blob whose box covers most of the page (else the whole page).
  DS.findFrame = function (cc) {
    let best = null, area = 0;
    for (const c of cc.comps) { const a = c.bw * c.bh; if (a > area) { area = a; best = c; } }
    if (best && area > 0.35 * cc.w * cc.h) return [best.x0, best.y0, best.x1, best.y1];
    return [0, 0, cc.w - 1, cc.h - 1];
  };

  // Typical character height: the most common blob size among letter-sized blobs.
  DS.charSize = function (cc) {
    const hist = new Float64Array(200);
    for (const c of cc.comps) if (c.big >= 10 && c.big < 200 && c.n > 12) {
      const fill = c.n / (c.bw * c.bh); if (fill > 0.6) continue;   // solid dots / blobs are not letters
      hist[c.big] += 1;
    }
    // smooth and take the peak
    let best = 0, at = 30;
    for (let s = 12; s < 190; s++) { const v = hist[s - 2] + 2 * hist[s - 1] + 3 * hist[s] + 2 * hist[s + 1] + hist[s + 2]; if (v > best) { best = v; at = s; } }
    return at;
  };

  // ---------------------------------------------------------------- 2. words
  DS.textGroups = function (cc, H) {
    H = H || DS.charSize(cc);
    const C = cc.comps, isChar = new Uint8Array(C.length), isDot = new Uint8Array(C.length);
    for (let i = 0; i < C.length; i++) {
      const c = C[i];
      if (c.big >= 0.45 * H && c.big <= 1.45 * H) isChar[i] = 1;
      else if (c.big >= 0.1 * H && c.big < 0.45 * H) isDot[i] = 1;
    }
    // dashes of hidden / centre lines: long thin blobs with another one in line with them
    const elong = i => C[i].elong >= 3.2 && C[i].big >= 0.5 * H;
    const adiff0 = (a, b) => { let d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
    // spatial grid
    const cell = Math.ceil(H * 1.5), gw = Math.ceil(cc.w / cell) + 1, grid = new Map();
    const key = (x, y) => Math.floor(y / cell) * gw + Math.floor(x / cell);
    for (let i = 0; i < C.length; i++) if (isChar[i] || isDot[i]) { const k = key(C[i].cx, C[i].cy); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
    const near = (i, r) => {
      const c = C[i], out = [], gx = Math.floor(c.cx / cell), gy = Math.floor(c.cy / cell), s = Math.ceil(r / cell);
      for (let yy = gy - s; yy <= gy + s; yy++) for (let xx = gx - s; xx <= gx + s; xx++) { const a = grid.get(yy * gw + xx); if (a) for (const j of a) if (j !== i) out.push(j); }
      return out;
    };
    const isDash = new Uint8Array(C.length);
    for (let i = 0; i < C.length; i++) if ((isChar[i] || isDot[i]) && elong(i)) {
      for (const j of near(i, 3 * H)) if (j !== i && elong(j) && adiff0(C[i].dir, C[j].dir) < 0.2) {
        const link = Math.atan2(C[j].cy - C[i].cy, C[j].cx - C[i].cx);
        if (adiff0(link, C[i].dir) < 0.22) { const side = Math.cos(link - C[i].dir) > 0 ? 1 : 2; isDash[i] |= side << 1; }
      }
      isDash[i] = isDash[i] === 6 ? 1 : 0;     // a dash has dashes in line on BOTH sides (two "1"s side by side don't)
    }
    for (let i = 0; i < C.length; i++) if (isDash[i]) { isChar[i] = 0; isDot[i] = 0; }
    // gap between two blob boxes (0 if they overlap)
    const gap = (a, b) => Math.hypot(Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)));
    const par = C.map((_, i) => i), f = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const u = (a, b) => { a = f(a); b = f(b); if (a !== b) par[b] = a; };
    for (let i = 0; i < C.length; i++) if (isChar[i]) {
      for (const j of near(i, 1.6 * H)) if (isChar[j] && j > i) {
        const a = C[i], b = C[j], r = a.big / b.big;
        if (r > 1.7 || r < 1 / 1.7) continue;
        if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < 1.25 * H && gap(a, b) < 0.55 * H) u(i, j);
      }
    }
    // geometry of a set of blobs: centre, slant (principal axis of the letter centres), extent along / across
    const geom = ids => {
      const chars = ids.filter(i => isChar[i]), g = { ids, chars };
      let sx = 0, sy = 0; for (const i of chars) { sx += C[i].cx; sy += C[i].cy; }
      g.cx = sx / chars.length; g.cy = sy / chars.length;
      if (chars.length >= 2) {
        let xx = 0, yy = 0, xy = 0;
        for (const i of chars) { const dx = C[i].cx - g.cx, dy = C[i].cy - g.cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
        g.angle = 0.5 * Math.atan2(2 * xy, xx - yy);
      } else g.angle = null;
      return g;
    };
    const extent = (g, ang) => {
      const ca = Math.cos(ang), sa = Math.sin(ang); let lo = 1e9, hi = -1e9, plo = 1e9, phi = -1e9;
      for (const i of g.ids) { const c = C[i]; for (const [px, py] of [[c.x0, c.y0], [c.x1, c.y0], [c.x0, c.y1], [c.x1, c.y1]]) {
        const t = (px - g.cx) * ca + (py - g.cy) * sa, p = -(px - g.cx) * sa + (py - g.cy) * ca;
        lo = Math.min(lo, t); hi = Math.max(hi, t); plo = Math.min(plo, p); phi = Math.max(phi, p); } }
      return { lo, hi, plo, phi };
    };
    const groups = new Map();
    for (let i = 0; i < C.length; i++) if (isChar[i]) { const r = f(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
    // two stacked labels (73.5 over 53.6) can touch: split a group whose letters form two parallel rows
    const spread = g => { if (g.angle === null) return 0; const sa = Math.sin(g.angle), ca = Math.cos(g.angle);
      let m = 0; for (const i of g.chars) m = Math.max(m, Math.abs(-(C[i].cx - g.cx) * sa + (C[i].cy - g.cy) * ca)); return m; };
    const splitRows = ids => {
      const g = geom(ids); if (g.chars.length < 3 || spread(g) < 0.4 * H) return [ids];
      const sa = Math.sin(g.angle), ca = Math.cos(g.angle);
      const p = ids.map(i => [i, -(C[i].cx - g.cx) * sa + (C[i].cy - g.cy) * ca]).sort((a, b) => a[1] - b[1]);
      let cut = -1, big = 0.55 * H;
      for (let k = 1; k < p.length; k++) if (p[k][1] - p[k - 1][1] > big) { big = p[k][1] - p[k - 1][1]; cut = k; }
      if (cut < 0) return [ids];
      return splitRows(p.slice(0, cut).map(q => q[0])).concat(splitRows(p.slice(cut).map(q => q[0])));
    };
    // drop dash pieces lying along a word (a centre line running through the text): long, thin and parallel to it
    const prune = ids => {
      const g = geom(ids); if (g.angle === null || g.chars.length < 3) return ids;
      const keep = ids.filter(i => !(C[i].elong >= 3.2 && C[i].big >= 0.75 * H && adiff0(C[i].dir, g.angle) < 0.22));
      return keep.length >= 1 ? keep : ids;
    };
    let G = [...groups.values()].flatMap(splitRows).map(prune).filter(ids => ids.length).map(geom);
    // join word pieces that sit on one text line (a long callout like Ø31.8*0.9T can break where a centre line ran through it)
    const adiff = (a, b) => { let d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
    for (let pass = 0; pass < 6; pass++) {
      let merged = false;
      G.sort((p, q) => q.chars.length - p.chars.length);
      for (let a = 0; a < G.length; a++) {
        const A = G[a]; if (!A || A.angle === null) continue;
        for (let b = 0; b < G.length; b++) {
          const B = G[b]; if (!B || a === b) continue;
          if (Math.hypot(A.cx - B.cx, A.cy - B.cy) > (A.chars.length + B.chars.length + 2) * H) continue;
          if (B.angle !== null && adiff(A.angle, B.angle) > (B.chars.length < 3 || A.chars.length < 3 ? 0.4 : 0.2)) continue;
          const ca = Math.cos(A.angle), sa = Math.sin(A.angle);
          const perp = Math.abs(-(B.cx - A.cx) * sa + (B.cy - A.cy) * ca); if (perp > 0.45 * H) continue;
          const ea = extent(A, A.angle), eb = extent(B, A.angle), off = (B.cx - A.cx) * ca + (B.cy - A.cy) * sa;
          const gapAlong = Math.max(eb.lo + off - ea.hi, ea.lo - (eb.hi + off));
          if (gapAlong > 1.1 * H || gapAlong < -0.3 * H) continue;
          const AB = geom(A.ids.concat(B.ids)); if (spread(AB) > 0.38 * H) continue;
          G[a] = AB; G[b] = null; merged = true; break;
        }
      }
      G = G.filter(Boolean); if (!merged) break;
    }
    // decimal points, ° marks and centre dots of * attach to the nearest word
    const owner = new Int32Array(C.length).fill(-1);
    G.forEach((g, k) => g.ids.forEach(i => owner[i] = k));
    for (let i = 0; i < C.length; i++) if (isDot[i]) {
      let best = -1, bd = 1e9;
      for (const j of near(i, 1.2 * H)) if (isChar[j] && owner[j] >= 0) { const d = gap(C[i], C[j]); if (d < bd) { bd = d; best = j; } }
      if (best >= 0 && bd < 0.45 * H) G[owner[best]].ids.push(i);
    }
    const out = [];
    for (const gg of G) {
      const ids = gg.ids, g = { ids: ids.map(i => C[i].id), nChars: gg.chars.length, H, cx: gg.cx, cy: gg.cy };
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (const i of ids) { const c = C[i]; x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1); }
      g.box = [x0, y0, x1, y1];
      g.angle = gg.angle === null ? 0 : gg.angle;
      // keep the reading direction in (-90°, 90°]: drawing text reads from the bottom or the right
      if (g.angle <= -Math.PI / 2 + 1e-6) g.angle += Math.PI;
      if (g.angle > Math.PI / 2) g.angle -= Math.PI;
      const e = extent(gg, g.angle);
      g.len = e.hi - e.lo; g.mid = (e.hi + e.lo) / 2; g.thick = e.phi - e.plo;
      // this word's own letter height (small notes are often a smaller font than the dimensions)
      if (gg.chars.length >= 2) {
        const ca = Math.cos(g.angle), sa = Math.sin(g.angle), hs = [];
        for (const i of gg.chars) { const c = C[i]; let lo = 1e9, hi = -1e9;
          for (const [px, py] of [[c.x0, c.y0], [c.x1, c.y0], [c.x0, c.y1], [c.x1, c.y1]]) { const p = -(px - g.cx) * sa + (py - g.cy) * ca; lo = Math.min(lo, p); hi = Math.max(hi, p); }
          hs.push(hi - lo); }
        hs.sort((p, q) => p - q);
        // box of a slanted letter overstates its height a little; the 70th percentile skips "." and "-"
        g.Hg = Math.max(0.55 * H, Math.min(1.5 * H, hs[Math.floor(hs.length * 0.7)] * (1 - 0.15 * Math.abs(Math.sin(2 * g.angle)))));
      } else g.Hg = H;
      out.push(g);
    }
    return out;
  };

  // ---------------------------------------------------------------- 3. level crop
  // Renders only the word's own blobs (nearby lines vanish), turned level, scaled so letters are ~targetH px.
  DS.renderGroup = function (cc, g, opts) {
    opts = opts || {};
    const targetH = opts.targetH || 44, flip = !!opts.flip, pad = Math.round(targetH * 0.6);
    const s = targetH / (g.Hg && g.Hg < 0.85 * g.H ? g.Hg : g.H), ang = g.angle + (flip ? Math.PI : 0), ca = Math.cos(ang), sa = Math.sin(ang);
    const half = (g.len / 2 + (g.Hg || g.H) * 0.4), mid = g.mid || 0;
    const ocx = g.cx + mid * Math.cos(g.angle), ocy = g.cy + mid * Math.sin(g.angle);
    const W = Math.ceil(2 * half * s) + 2 * pad, Hh = Math.ceil((g.Hg || g.H) * 1.9 * s) + 2 * pad;
    const set = new Set(g.ids), lab = cc.lab, w = cc.w, h = cc.h, out = new Uint8Array(W * Hh);
    if (opts.area) {
      // also take every small blob whose centre lies on the word's strip (letter strokes that touched a dash)
      const Hg = g.Hg || g.H, cg = Math.cos(g.angle), sg = Math.sin(g.angle);
      for (const c of cc.comps) {
        if (c.big > 2.6 * Hg || set.has(c.id)) continue;
        const du = (c.cx - ocx) * cg + (c.cy - ocy) * sg, dv = -(c.cx - ocx) * sg + (c.cy - ocy) * cg;
        if (Math.abs(du) <= g.len / 2 + 0.2 * Hg && Math.abs(dv) <= 0.55 * Hg) set.add(c.id);
      }
    }
    const inside = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return 0; return set.has(lab[y * w + x]) ? 1 : 0; };
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
      const u = (i - W / 2) / s, v = (j - Hh / 2) / s;
      const x = ocx + u * ca - v * sa, y = ocy + u * sa + v * ca;
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const ink = inside(x0, y0) * (1 - fx) * (1 - fy) + inside(x0 + 1, y0) * fx * (1 - fy) + inside(x0, y0 + 1) * (1 - fx) * fy + inside(x0 + 1, y0 + 1) * fx * fy;
      out[j * W + i] = ink > 0.35 ? 0 : 255;
    }
    // thicken the single-line CAD strokes so they look like a normal printed font to the OCR
    const r = opts.bold == null ? Math.max(1, Math.round(targetH / 18)) : opts.bold;
    if (r > 0) {
      const tmp = new Uint8Array(out);
      for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
        if (tmp[j * W + i] === 0) continue;
        let hit = false;
        for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + r) continue;
          const y = j + dy, x = i + dx; if (x >= 0 && y >= 0 && x < W && y < Hh && tmp[y * W + x] === 0) { hit = true; break; }
        }
        if (hit) out[j * W + i] = 0;
      }
    }
    return { w: W, h: Hh, g: out };
  };

  DS.toPGM = function (img) {
    const head = `P5\n${img.w} ${img.h}\n255\n`, buf = new Uint8Array(head.length + img.g.length);
    for (let i = 0; i < head.length; i++) buf[i] = head.charCodeAt(i);
    buf.set(img.g, head.length);
    return buf;
  };

  // ---------------------------------------------------------------- 4. what kind of text
  // Normalises OCR quirks of the AutoCAD "simplex" font: Ø often reads as @, 0, g, o or ©; * as x or X; ° as o or a trailing 0/9 superscript.
  // OD values titanium tube makers list (mm); used to tell a Ø misread as a digit ("934.9" = Ø34.9)
  DS.TUBE_OD = [9.5, 10, 12, 12.7, 14, 15.9, 16, 17, 19, 20, 22, 22.2, 25, 25.4, 28, 28.6, 30, 31.6, 31.8, 32, 34, 34.9, 35, 36, 38, 38.1, 40, 41.3, 42, 44, 44.5, 45, 46, 48, 50, 52, 54, 55, 56, 60];
  const DIA_JUNK = "Øø∅⌀@©$#%&¢906oOgQ8B";
  DS.parse = function (raw) {
    let t = String(raw || "").replace(/\s+/g, "").replace(/[，、]/g, ",");
    const tok = { raw: String(raw || "").trim(), text: t, kind: "junk" };
    if (!t) return tok;
    t = t.replace(/[Øø∅⌀@©]/g, "Ø").replace(/[×✕✱∗™"”“%]/g, "*").replace(/[‘’`´'|!]/g, "").replace(/[—–_]/g, "-").replace(/,/g, ".");
    t = t.replace(/^[^0-9A-Za-zØ$#&¢]+/, "").replace(/[^0-9A-Za-z°º.]+$/, "").replace(/\.+$/, "");
    tok.text = t;
    let m;
    if ((m = t.match(/^(WB|W8|VB|WE|WD|NB)[:;.]?(\d{3,4}(?:\.\d)?)$/i))) return Object.assign(tok, { kind: "wb", value: +m[2] });
    if ((m = t.match(/^(FC|FG|EC|F6)[:;.]?(\d{3,4}(?:\.\d)?)$/i))) return Object.assign(tok, { kind: "fc", value: +m[2] });
    if ((m = t.match(/^C[Ll1I][:;.]?(\d{2}(?:\.\d)?)$/))) return Object.assign(tok, { kind: "chainline", value: +m[1] });
    if ((m = t.match(/^(\d{2})T$/i))) return Object.assign(tok, { kind: "teeth", value: +m[1] });
    if ((m = t.match(/^R(\d{1,3}(?:\.\d)?)$/i))) return Object.assign(tok, { kind: "radius", value: +m[1] });
    if ((m = t.match(/TA?PER.?\D?(\d{2}(?:\.\d)?)\*(\d{2,3})L?/i))) return Object.assign(tok, { kind: "taper", od: +m[1], length: +m[2] });
    if ((m = t.match(/[O0D]VA?[LI1]?(\d{2}(?:\.\d)?)\*(\d{2}(?:\.\d)?)/i))) tok.oval = { h: +m[1], w: +m[2] };
    // tube callout: Ø44.5*1.0T, Ø34.9X0.9T, Ø44.5*1.0*0.3T, Ø22.2*1.2T (Ø may come out as 9, 0, $, # ...)
    const tube = t.match(/^(.?)(\d{2,3}(?:\.\d{1,2})?)[*xX](\d(?:\.\d{1,2})?)(?:[*xX](\d(?:\.\d{1,2})?))?T?/);
    if (tube) {
      let od = +tube[2], lead = tube[1];
      const s = tube[2];
      if (!DS.TUBE_OD.includes(od) && s.length >= 3 && DIA_JUNK.includes(s[0]) && DS.TUBE_OD.includes(+s.slice(1))) od = +s.slice(1);
      const wall = +tube[3];
      // a hair off a standard size (31.9) is a misread of it (31.8)
      if (!DS.TUBE_OD.includes(od)) { const near = DS.TUBE_OD.reduce((a, b) => Math.abs(b - od) < Math.abs(a - od) ? b : a); if (Math.abs(near - od) <= 0.15) { tok.snapped = od; od = near; } }
      if (od >= 9 && od <= 70 && wall > 0.3 && wall < 3.5) {
        Object.assign(tok, { kind: "tube", od, wall });
        // more walls after the first: 0.9*0.7*0.9 = butted; the builder's "1.0*0.3T" (meaning unclear) is kept as a note
        const more = (t.slice(tube[0].length - (tube[0].endsWith("T") ? 1 : 0)).match(/^(?:[*xX](\d(?:\.\d{1,2})?))+/) || [""])[0].split(/[*xX]/).filter(Boolean).map(Number);
        const allW = [wall].concat(tube[4] ? [+tube[4]] : []).concat(more);
        if (allW.length >= 3 && allW.every(x => x >= 0.5 && x <= 2.5)) tok.walls = allW;
        else if (allW.length === 2) tok.extra = allW[1];
        return tok;
      }
    }
    if (tok.oval) return Object.assign(tok, { kind: "oval" });
    // angle: 64.7° (° may read as o, º, * or a stray small 0 / 9 after a decimal)
    if ((m = t.match(/^(\d{2,3}(?:\.\d)?)[°ºo˚*]$/))) return Object.assign(tok, { kind: "angle", value: +m[1] });
    if ((m = t.match(/^(\d{2}\.\d)[09]$/)) && +m[1] > 40 && +m[1] < 100) return Object.assign(tok, { kind: "angle", value: +m[1], guess: true });
    // diameter: Ø754, Ø16, Ø66 - the Ø often reads as $, #, %, 9, 0 or 6
    if ((m = t.match(/^Ø(\d{1,3}(?:\.\d{1,2})?)$/))) return Object.assign(tok, { kind: "dia", value: +m[1] });
    if ((m = t.match(/^([$#&¢])(\d{1,3}(?:\.\d{1,2})?)$/))) return Object.assign(tok, { kind: "dia", value: +m[2] });
    if ((m = t.match(/^-?(\d{1,4}(?:\.\d{1,2})?)$/))) {
      const v = +m[1], s = m[1];
      // a leading 0 never starts a real dimension: "056" is Ø56. 9xx / 6xx might be a Ø too: keep both readings
      if (s.length >= 3 && s[0] === "0" && s[1] !== ".") return Object.assign(tok, { kind: "dia", value: +s.slice(1) });
      if (s.length >= 3 && (s[0] === "9" || s[0] === "6") && !s.includes(".")) Object.assign(tok, { alt: { kind: "dia", value: +s.slice(1) } });
      return Object.assign(tok, { kind: "num", value: v });
    }
    // builder's drawing number: LV700-123456M, SU700-654321M (prefix, 6 digits, size letter; the M often reads as 4 or H)
    if ((m = t.match(/\b([A-Z]{2}\d{2,3})\W?(\d{6})([A-Z0-9]{0,2})\b/i))) {
      let sz = (m[3] || "").toUpperCase(); if (/^[4H]$/.test(sz) || /^1[1V]$/.test(sz)) sz = "M";
      return Object.assign(tok, { kind: "model", value: (m[1] + "-" + m[2] + sz).toUpperCase() });
    }
    if ((m = t.match(/^(20\d\d)[\/.-]?(\d{1,2})[\/.-](\d{1,2})$/))) return Object.assign(tok, { kind: "date", value: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` });
    return tok;
  };
  DS.canon = function (tok) {
    switch (tok.kind) {
      case "tube": return `Ø${tok.od}*${tok.wall}` + (tok.oval ? `+OVAL${tok.oval.h}*${tok.oval.w}` : "");
      case "dia": return `Ø${tok.value}`;
      case "angle": return `${tok.value}°`;
      case "num": return `${tok.value}`;
      case "wb": return `WB${tok.value}`;
      case "fc": return `FC${tok.value}`;
      case "chainline": return `CL${tok.value}`;
      case "teeth": return `${tok.value}T`;
      case "radius": return `R${tok.value}`;
      case "taper": return `TAPER${tok.od}*${tok.length}`;
      case "oval": return `OVAL${tok.oval.h}*${tok.oval.w}`;
      case "model": return tok.value;
      case "date": return tok.value;
    }
    return null;
  };

  // Read one word: try a few renderings (size, upside-down) and keep the reading that makes the most sense.
  // ocr(pgmBytes) -> { text, conf } (sync or async)
  DS.readGroup = async function (cc, g, ocr) {
    const tries = [{ targetH: 44 }, { targetH: 44, flip: true }, { targetH: 34 }, { targetH: 44, area: true }, { targetH: 56, bold: 1 }, { targetH: 34, flip: true }];
    let best = null;
    for (let k = 0; k < tries.length; k++) {
      const o = tries[k];
      if (o.flip && Math.abs(g.angle) < 0.35 && best && best.conf > 60) continue;   // level text is rarely upside down
      const r = await ocr(DS.toPGM(DS.renderGroup(cc, g, o)));
      const tok = DS.parse(r.text);
      const score = r.conf + (tok.kind !== "junk" ? 30 : 0) + (tok.kind === "tube" || tok.kind === "angle" || tok.kind === "wb" ? 10 : 0);
      if (!best || score > best.score) best = { text: (r.text || "").trim(), conf: r.conf, tok, score, opts: o };
      if (tok.kind !== "junk" && r.conf >= 88) break;
      if (k >= 1 && best.tok.kind !== "junk" && best.conf >= 75) break;
      if (k >= 1 && g.nChars >= 4 && best.conf < 30 && best.tok.kind === "junk") break;       // long junk (Chinese text, hatching): give up early
    }
    return best;
  };

  // ---------------------------------------------------------------- 5. which number is which
  // words: [{ box:[x0,y0,x1,y1], angle (deg, -90..90, image y down), text, conf, tok }]
  // frame: [x0,y0,x1,y1] of the drawing border (or the page)
  // Returns { picks: { "geometry.reach": { value, word, score, alts:[...] }, ... }, info: {...} }
  //
  // The rules follow how builders usually lay out every frame sheet (checked on 16 of their drawings):
  //  side view in the middle, BB lower middle, front wheel right, chainstay top view lower left,
  //  head-tube detail top right, title block bottom right. Text runs along the tube it belongs to.
  DS.FIELDS = [
    // path, label, unit
    ["geometry.reach", "Reach", "mm"], ["geometry.stack", "Stack", "mm"], ["geometry.headAngle", "Head angle", "°"],
    ["geometry.seatAngle", "Seat angle", "°"], ["geometry.chainstay", "Chainstay", "mm"], ["geometry.bbDrop", "BB drop", "mm"],
    ["geometry.headTube", "Head tube length", "mm"], ["geometry.seatTube", "Seat tube length", "mm"],
    ["geometry.forkA2C", "Fork axle-to-crown", "mm"], ["geometry.forkOffset", "Fork offset", "mm"],
    ["geometry.ttAtSeatTube", "Top tube centre below the seat-tube top", "mm"],
    ["geometry.tireDiameter", "Tyre outside diameter", "mm"], ["geometry.bbShellWidth", "BB shell width", "mm"],
    ["geometry.chainring", "Chainring", "T"], ["geometry.chainline", "Chainline", "mm"], ["geometry.stayWidthAtDropout", "Stay spacing at dropouts (hub − 16)", "mm"],
    ["tubes.topTube.od", "Top tube Ø", "mm"], ["tubes.topTube.wall", "Top tube wall", "mm"],
    ["tubes.downTube.od", "Down tube Ø", "mm"], ["tubes.downTube.wall", "Down tube wall", "mm"],
    ["tubes.seatTube.od", "Seat tube Ø", "mm"], ["tubes.seatTube.wall", "Seat tube wall", "mm"],
    ["tubes.seatStay.od", "Seat stay Ø", "mm"], ["tubes.seatStay.wall", "Seat stay wall", "mm"],
    ["tubes.chainstay.od", "Chainstay Ø", "mm"], ["tubes.chainstay.wall", "Chainstay wall", "mm"],
    ["tubes.chainstay.ovalH", "Chainstay oval height", "mm"], ["tubes.chainstay.ovalW", "Chainstay oval width", "mm"],
    ["tubes.chainstay.taperOD", "Chainstay taper to Ø", "mm"], ["tubes.chainstay.taperLength", "Chainstay taper length", "mm"],
    ["tubes.headTube.od", "Head tube Ø (average of top & bottom)", "mm"],
    ["tubes.seatpost.fit", "Seatpost size", "mm"],
    ["check.wheelbase", "Wheelbase (drawing, for checking)", "mm"], ["check.frontCentre", "Front centre (drawing, for checking)", "mm"],
    ["check.ett", "Effective top tube (drawing, for checking)", "mm"]
  ];

  DS.mapFields = function (words, frame) {
    const [fx0, fy0, fx1, fy1] = frame, FW = fx1 - fx0, FH = fy1 - fy0;
    const W = words.map((w, i) => {
      const cx = (w.box[0] + w.box[2]) / 2, cy = (w.box[1] + w.box[3]) / 2;
      const tok = w.tok || DS.parse(w.text);
      return Object.assign({}, w, { i, tok, u: (cx - fx0) / FW, v: (cy - fy0) / FH, a: w.angle });
    });
    const used = new Set(), picks = {};
    // soft range: 1 inside [lo,hi], falling to 0 over 'soft' outside
    const rng = (x, lo, hi, soft) => x >= lo && x <= hi ? 1 : Math.max(0, 1 - (x < lo ? lo - x : x - hi) / (soft || 1e-9));
    const angAbs = a => Math.abs(a);
    const pick = (path, cands, opts) => {
      opts = opts || {};
      const list = cands.filter(c => c.s > 0.05 && (opts.reuse || !used.has(c.w.i))).sort((p, q) => q.s - p.s);
      if (!list.length) return null;
      const best = list[0];
      if (!opts.reuse) used.add(best.w.i);
      const val = opts.value ? opts.value(best.w) : best.w.tok.value;
      picks[path] = { value: val, word: best.w.i, score: +Math.min(1, best.s).toFixed(2), alts: list.slice(1, 4).map(c => ({ value: opts.value ? opts.value(c.w) : c.w.tok.value, word: c.w.i })) };
      return best.w;
    };
    const of = kind => W.filter(w => w.tok.kind === kind || (w.tok.alt && w.tok.alt.kind === kind));
    const guessW = (w, kind) => w.tok.kind === kind ? 1 : 0.5;    // a Ø read as a digit ("9754"): show it, but flag it for checking
    const nums = of("num"), angles = of("angle").concat(W.filter(w => w.tok.kind === "num" && /^\d{2}\.\d$/.test(w.tok.text) && false));
    const confW = w => 0.6 + 0.4 * Math.min(1, (w.conf || 50) / 90);

    // wheelbase / front centre (labelled, easy)
    pick("check.wheelbase", of("wb").map(w => ({ w, s: confW(w) * rng(w.tok.value, 850, 1400, 100) })));
    pick("check.frontCentre", of("fc").map(w => ({ w, s: confW(w) * rng(w.tok.value, 500, 900, 80) })));
    const wbW = picks["check.wheelbase"] ? W[picks["check.wheelbase"].word] : null;
    const axleV = wbW ? wbW.v : 0.66;                    // the wheelbase line runs at axle height

    // head angle: right-most angle in 60-76°, lower half (at the front wheel)
    pick("geometry.headAngle", angles.map(w => ({ w, s: confW(w) * rng(w.tok.value, 60, 76, 2) * rng(w.u, 0.7, 1.05, 0.15) * rng(w.v, 0.35, 0.85, 0.2) * (0.5 + w.u / 2) })));
    // seat angle: 70-80°, near the BB, left of it, below the seat-tube middle
    pick("geometry.seatAngle", angles.map(w => ({ w, s: confW(w) * rng(w.tok.value, 70, 80, 1.5) * rng(w.u, 0.2, 0.6, 0.1) * rng(w.v, axleV - 0.25, axleV + 0.08, 0.1) })));
    // stack: vertical text, 480-760, middle of the sheet
    const stackW = pick("geometry.stack", nums.map(w => ({ w, s: confW(w) * rng(w.tok.value, 480, 760, 20) * rng(90 - angAbs(w.a), 0, 4, 6) * rng(w.u, 0.35, 0.8, 0.15) * rng(w.v, 0.05, 0.6, 0.15) })));
    // reach: level text, 300-560, upper middle; the effective top tube is the bigger level number at the very top
    const levelTop = nums.filter(w => angAbs(w.a) < 6 && w.u > 0.3 && w.u < 0.85 && w.v < 0.5);
    pick("geometry.reach", levelTop.map(w => ({ w, s: confW(w) * rng(w.tok.value, 300, 560, 20) * rng(w.v, 0.08, 0.5, 0.1) * (stackW ? rng(Math.abs(w.u - stackW.u), 0, 0.25, 0.15) : 1) })));
    pick("check.ett", levelTop.map(w => ({ w, s: confW(w) * rng(w.tok.value, 470, 700, 20) * rng(w.v, -0.05, 0.12, 0.08) })));
    // BB drop: vertical text, 30-100, just below the axle line
    pick("geometry.bbDrop", nums.map(w => ({ w, s: confW(w) * rng(w.tok.value, 30, 100, 5) * rng(90 - angAbs(w.a), 0, 6, 8) * rng(w.u, 0.4, 0.8, 0.1) * rng(w.v - axleV, -0.02, 0.15, 0.06) })));
    // chainstay: 380-480 along the stay (nearly level), left half, side view (the highest such number; the top view sits lower)
    const csC = nums.map(w => ({ w, s: confW(w) * rng(w.tok.value, 380, 480, 10) * rng(angAbs(w.a), 0, 20, 10) * rng(w.u, 0.1, 0.5, 0.1) * rng(w.v - axleV, -0.02, 0.15, 0.08) }));
    pick("geometry.chainstay", csC);
    // fork axle-to-crown: 330-620 along the fork (steep), far right
    const forkW = pick("geometry.forkA2C", nums.map(w => ({ w, s: confW(w) * rng(w.tok.value, 330, 620, 15) * rng(w.a, 50, 82, 8) * rng(w.u, 0.75, 1.05, 0.1) * rng(w.v, 0.15, 0.65, 0.1) })));
    // fork offset: 30-65, bottom right corner of the side view
    pick("geometry.forkOffset", nums.map(w => ({ w, s: confW(w) * rng(w.tok.value, 30, 65, 3) * rng(w.u, 0.85, 1.05, 0.08) * rng(w.v - axleV, -0.05, 0.15, 0.08) })));
    // head tube length: 80-230 along the head tube (steep, top right) - the head-tube detail repeats it (vertical)
    pick("geometry.headTube", nums.map(w => ({ w, s: confW(w) * rng(w.tok.value, 80, 230, 10) * Math.max(rng(w.a, 45, 82, 8), 0.8 * rng(90 - angAbs(w.a), 0, 5, 5)) * rng(w.u, 0.7, 1.05, 0.1) * rng(w.v, -0.05, 0.4, 0.1) })));
    // seat tube length: 340-680 along the seat tube (steep, leaning back), left-middle
    const stW = pick("geometry.seatTube", nums.map(w => ({ w, s: confW(w) * rng(w.tok.value, 340, 680, 15) * rng(w.a, 62, 84, 6) * rng(w.u, 0.2, 0.55, 0.1) * rng(w.v, 0.15, 0.7, 0.1) })));
    // top tube joint below the seat-tube top: small number along the seat tube near its top
    const stTopW = pick("geometry.ttAtSeatTube", nums.map(w => ({ w, s: confW(w) * rng(w.tok.value, 15, 90, 5) * rng(w.a, 60, 86, 8) * rng(w.u, 0.2, 0.5, 0.1) * rng(w.v, 0.05, 0.4, 0.1) * (stW ? rng(stW.v - w.v, 0.05, 0.4, 0.1) : 1) })),
      { value: w => w.tok.value });   // converted to "from BB" below
    // tyre outside diameter: Ø650-800 (Ø622 etc. is the rim)
    pick("geometry.tireDiameter", of("dia").map(w => ({ w, s: confW(w) * guessW(w, "dia") * rng((w.tok.kind === "dia" ? w.tok : w.tok.alt).value, 650, 800, 10) })),
      { value: w => (w.tok.kind === "dia" ? w.tok : w.tok.alt).value });
    // BB shell width: 68 / 73 / 83 / 100 at the bottom (chainstay top view)
    pick("geometry.bbShellWidth", nums.map(w => ({ w, s: confW(w) * ([68, 73, 83, 85, 92, 100].includes(w.tok.value) ? 1 : 0) * rng(w.v - axleV, 0.12, 0.45, 0.08) * rng(w.u, 0.3, 0.65, 0.1) })));
    // hub spacing (148 Boost / 142 / 135 QR) on the rear-end dimensions, left
    pick("geometry.stayWidthAtDropout", nums.map(w => ({ w, s: confW(w) * ([135, 142, 148, 157].includes(w.tok.value) ? 1 : 0) * rng(w.u, -0.05, 0.25, 0.1) })),
      { value: w => w.tok.value - 16 });
    pick("geometry.chainring", of("teeth").map(w => ({ w, s: confW(w) * rng(w.tok.value, 26, 56, 2) })));
    pick("geometry.chainline", of("chainline").map(w => ({ w, s: confW(w) * rng(w.tok.value, 40, 60, 3) })));

    // ---- tube callouts: assign by the slant of the text and where it sits
    const tubes = of("tube");
    const stU = stW ? stW.u : 0.38;
    const tubeRule = {
      topTube:   w => rng(w.tok.od, 25, 42, 3) * rng(w.a, -35, 2, 6) * rng(w.v, -0.05, 0.45, 0.1) * rng(w.u, stU - 0.05, 0.95, 0.1),
      downTube:  w => rng(w.tok.od, 31.8, 56, 3) * rng(w.a, -68, -30, 8) * rng(w.u, stU + 0.05, 0.95, 0.08),
      seatTube:  w => rng(w.tok.od, 27, 38.1, 2) * rng(w.a, 60, 88, 8) * rng(w.u, 0.2, 0.6, 0.1),
      seatStay:  w => rng(w.tok.od, 12, 22.2, 2) * rng(w.a, -70, -25, 10) * rng(w.u, 0, stU, 0.08),
      chainstay: w => rng(w.tok.od, 16, 30, 3) * rng(angAbs(w.a), 0, 25, 10) * rng(w.v - axleV, -0.05, 0.15, 0.08) * (w.tok.oval ? 1.3 : 1)
    };
    // best overall assignment: greedy on the strongest matches first
    const pairs = [];
    for (const [t, f] of Object.entries(tubeRule)) for (const w of tubes) { const s = f(w) * confW(w); if (s > 0.05) pairs.push({ t, w, s }); }
    pairs.sort((p, q) => q.s - p.s);
    const doneT = new Set(), usedW = new Set();
    for (const p of pairs) {
      if (doneT.has(p.t) || usedW.has(p.w.i)) continue;
      doneT.add(p.t); usedW.add(p.w.i);
      const alts = pairs.filter(q => q.t === p.t && q.w.i !== p.w.i).slice(0, 3);
      picks[`tubes.${p.t}.od`] = { value: p.w.tok.od, word: p.w.i, score: +Math.min(1, p.s).toFixed(2), alts: alts.map(q => ({ value: q.w.tok.od, word: q.w.i })) };
      // walls: one wall = straight gauge; three walls (0.9*0.7*0.9) = butted: thin middle, thick ends
      const walls = [p.w.tok.wall].concat(p.w.tok.walls || []);
      picks[`tubes.${p.t}.wall`] = { value: p.w.tok.wall, word: p.w.i, score: +Math.min(1, p.s).toFixed(2), alts: [] };
      if (p.w.tok.walls && p.w.tok.walls.length >= 2) {
        const mid = Math.min(...walls), end = Math.max(...walls);
        if (end > mid) {
          picks[`tubes.${p.t}.wall`].value = mid;
          picks[`tubes.${p.t}.buttWall`] = { value: end, word: p.w.i, score: picks[`tubes.${p.t}.wall`].score, alts: [] };
          picks[`tubes.${p.t}.buttLength`] = { value: 120, word: p.w.i, score: 0.3, alts: [], note: "butt length isn't on the drawing: 120 mm assumed, ask the builder" };
        }
      }
      if (p.t === "chainstay" && p.w.tok.oval) {
        picks["tubes.chainstay.ovalH"] = { value: p.w.tok.oval.h, word: p.w.i, score: picks[`tubes.chainstay.od`].score, alts: [] };
        picks["tubes.chainstay.ovalW"] = { value: p.w.tok.oval.w, word: p.w.i, score: picks[`tubes.chainstay.od`].score, alts: [] };
      }
    }
    // oval callout read as its own word (OVAL25.5*18.5)
    if (!picks["tubes.chainstay.ovalH"]) {
      const ov = W.filter(w => w.tok.oval && !usedW.has(w.i)).map(w => ({ w, s: confW(w) * rng(w.v - axleV, -0.05, 0.15, 0.08) }));
      const b = pick("tubes.chainstay.ovalH", ov, { value: w => w.tok.oval.h });
      if (b) picks["tubes.chainstay.ovalW"] = { value: b.tok.oval.w, word: b.i, score: picks["tubes.chainstay.ovalH"].score, alts: [] };
    }
    const tp = pick("tubes.chainstay.taperOD", of("taper").map(w => ({ w, s: confW(w) * rng(w.tok.od, 12, 25, 2) })), { value: w => w.tok.od });
    if (tp) picks["tubes.chainstay.taperLength"] = { value: tp.tok.length, word: tp.i, score: picks["tubes.chainstay.taperOD"].score, alts: [] };

    // head tube detail (top right): Ø pairs at the top and bottom - outer Ø of each end, averaged
    const diaVal = w => (w.tok.kind === "dia" ? w.tok : w.tok.alt).value;
    const htD = of("dia").filter(w => w.u > 0.78 && w.v < 0.45 && diaVal(w) >= 34 && diaVal(w) <= 70);
    if (htD.length >= 2) {
      const vs = htD.map(w => w.v), vMid = (Math.min(...vs) + Math.max(...vs)) / 2;
      const top = htD.filter(w => w.v <= vMid), bot = htD.filter(w => w.v > vMid);
      const topOD = top.length ? Math.max(...top.map(diaVal)) : null, botOD = bot.length ? Math.max(...bot.map(diaVal)) : null;
      if (topOD && botOD && botOD >= topOD) {
        const w0 = top.find(w => diaVal(w) === topOD), w1 = bot.find(w => diaVal(w) === botOD);
        picks["tubes.headTube.od"] = { value: +((topOD + botOD) / 2).toFixed(1), word: w1.i, words: [w0.i, w1.i], score: +(confW(w0) * confW(w1) * guessW(w0, "dia") * guessW(w1, "dia")).toFixed(2), alts: [], note: `top Ø${topOD}, bottom Ø${botOD}` };
      }
    }
    // seatpost size: Ø27.2 / 30.9 / 31.6 / 34.9 next to the seat-tube top ("配 Ø31.6 座杆" = fits a 31.6 post)
    pick("tubes.seatpost.fit", W.filter(w => { const t = w.tok; const v = t.kind === "dia" ? t.value : t.kind === "num" ? t.value : null;
      return v && [25.4, 27.2, 30.9, 31.6, 34.9].includes(v); }).map(w => ({ w, s: confW(w) * rng(w.u, 0.2, 0.6, 0.15) * rng(w.v, 0, 0.4, 0.15) })),
      { value: w => w.tok.value });

    // title block: model / drawing number, date
    const info = {};
    const model = W.filter(w => w.tok.kind === "model").sort((p, q) => q.conf - p.conf)[0];
    if (model) info.model = model.tok.value;
    const date = W.filter(w => w.tok.kind === "date").sort((p, q) => q.conf - p.conf)[0];
    if (date) info.date = date.tok.value;
    return { picks, info, words: W };
  };

  // Turn picks into a design change (only fields that were found) and run the geometry cross-checks.
  DS.toChanges = function (picks, base) {
    const ch = { geometry: {}, tubes: {} };
    const set = (path, v) => { const k = path.split("."); let o = ch; for (let i = 0; i < k.length - 1; i++) o = o[k[i]] = o[k[i]] || {}; o[k[k.length - 1]] = v; };
    for (const [path, p] of Object.entries(picks)) {
      if (p.value === null || p.value === undefined || p.value === "" || !isFinite(+p.value)) continue;
      if (path.startsWith("check.")) continue;
      if (path === "geometry.ttAtSeatTube") continue;
      if (path === "tubes.seatpost.fit") continue;
      set(path, +p.value);
    }
    // the drawing gives the top-tube joint as a distance below the seat-tube top
    const st = picks["geometry.seatTube"] ? +picks["geometry.seatTube"].value : (base && base.geometry ? base.geometry.seatTube : null);
    if (picks["geometry.ttAtSeatTube"] && st) set("geometry.ttAtSeatTube", st - +picks["geometry.ttAtSeatTube"].value);
    // seatpost: keep the base design's post if it already fits, else pick the matching preset
    if (picks["tubes.seatpost.fit"]) {
      const fit = +picks["tubes.seatpost.fit"].value, cur = base && base.tubes && base.tubes.seatpost;
      const presets = { 27.2: "alloy272", 30.9: "dropper309", 31.6: "dropper316" };
      const curFit = cur ? ({ alloy272: 27.2, carbon272: 27.2, hiflex272: 27.2, leaf272: 27.2, ti272: 27.2, alloy316: 31.6, carbon316: 31.6, dropper316: 31.6, dropper309: 30.9 })[cur.type] : null;
      if (curFit !== fit && presets[fit]) set("tubes.seatpost", { type: presets[fit] });
    }
    // head tube keeps the base wall if the drawing doesn't give one
    if (!Object.keys(ch.geometry).length) delete ch.geometry;
    if (!Object.keys(ch.tubes).length) delete ch.tubes;
    return ch;
  };

  root.DrawScan = DS;
})(typeof window !== "undefined" ? window : globalThis);
