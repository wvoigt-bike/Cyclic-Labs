// ============================================================================
//  BOTTLES (bottles.js) — will my bottles fit, and can I get them out?
//  window.FrameBottles. Side view of the front triangle: the down-tube and seat-tube bottle cages sit on bosses
//  measured along each tube from the BB centre (the way the builder dimensions them, e.g. "330" and "180" on a
//  drawing; the second boss is 64 mm further up). Each bottle is drawn as its real outline (body + cap), standing on
//  the cage foot. Checks: bottle against the tubes, the two bottles against each other, and how far each one can
//  slide up its cage before it hits something (a rigid steel/insulated bottle has to come out that way).
//
//  Design fields (geometry): dtBoss (mm, BB → lower down-tube boss, 0 = no cage), stBoss (same, seat tube),
//  dtBottle / stBottle (bottle id from BOTTLES), dtCage / stCage (cage id from CAGES), bossSpacing (64).
//
//  analyse(design)  → { ok, rows[], dt, st, gap, svg } (numbers in mm)
//  suggest(design, opts) → best boss positions for the chosen bottles (grid search)
//  svg(design, res) → side-view picture (also used by the Bottles window)
//  To add a bottle or cage: one line in BOTTLES / CAGES below.
// ============================================================================
(function (root) {
  "use strict";

  // h = overall height with the cap, d = body diameter, capH/capD = the cap (narrower), rigid = can't be squeezed out
  const BOTTLES = {
    "bivo-trio-21":   { name: "Bivo Trio 21 oz (insulated)",      h: 260, d: 77, capH: 38, capD: 58, rigid: true },
    "bivo-trio-17":   { name: "Bivo Trio Mini 17 oz (insulated)", h: 220, d: 77, capH: 38, capD: 58, rigid: true },
    "bivo-one-21":    { name: "Bivo One 21 oz",                   h: 213, d: 77, capH: 38, capD: 58, rigid: true },
    "bivo-duo-25":    { name: "Bivo Duo 25 oz",                   h: 245, d: 77, capH: 38, capD: 58, rigid: true },
    "std-21":         { name: "Standard 21 oz / 620 ml bottle",   h: 205, d: 74, capH: 30, capD: 40, rigid: false },
    "std-24":         { name: "Large 24–26 oz / 750 ml bottle",   h: 240, d: 74, capH: 30, capD: 40, rigid: false },
    "none":           { name: "No bottle", h: 0, d: 0 }
  };
  // below = bottle base below the lower bolt hole (along the tube), slot = how far the cage slides each way on its
  // slotted holes, off = gap between the tube and the bottle, lift = how far a bottle must slide up to come out
  const CAGES = {
    "silca-sicuro":   { name: "Silca Sicuro Ti (top-load)", below: 35, slot: 8, off: 7, lift: 25, side: false,
                        note: "Ti top-load cage, slotted holes (up to 16 mm fore/aft). Measure yours: bottle base to the lower bolt hole." },
    "standard":       { name: "Standard top-load cage", below: 35, slot: 0, off: 7, lift: 25, side: false, note: "" },
    "side-load":      { name: "Side-load cage", below: 35, slot: 0, off: 8, lift: 5, side: true,
                        note: "Comes out sideways, so it needs very little room above the bottle." }
  };
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
  const len = a => Math.hypot(a[0], a[1]), unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  let STEP = 3;   // outline sampling (mm); suggest() uses a coarser one for its first pass

  function settings(g) {
    return {
      dtBoss: num(g.dtBoss, 0), stBoss: num(g.stBoss, 0), spacing: num(g.bossSpacing, 64),
      dtBottle: BOTTLES[g.dtBottle] ? g.dtBottle : "std-21", stBottle: BOTTLES[g.stBottle] ? g.stBottle : "std-21",
      dtCage: CAGES[g.dtCage] ? g.dtCage : "standard", stCage: CAGES[g.stCage] ? g.stCage : "standard",
      dtSlide: num(g.dtCageSlide, 0), stSlide: num(g.stCageSlide, 0),
      cageBelow: num(g.cageBelowBolt, NaN)
    };
  }

  // a polyline measured from its first point; at(s) → { p, t }
  function walker(pts) {
    const segs = []; let tot = 0;
    for (let i = 0; i + 1 < pts.length; i++) { const L = len(sub(pts[i + 1], pts[i])); segs.push({ a: pts[i], b: pts[i + 1], s0: tot, L }); tot += L; }
    return { total: tot, at(s) {
      const sg = segs.find(q => s <= q.s0 + q.L) || segs[segs.length - 1], t = unit(sub(sg.b, sg.a));
      return { p: add(sg.a, mul(t, s - sg.s0)), t };
    } };
  }

  // tubes of the front triangle as thick polylines (centreline + radius)
  function frame(design) {
    const FEA = root.FrameFEA, g = design.geometry, tb = design.tubes || {};
    const G = FEA.buildGeometry(g, tb), P = G.P, xy = p => [p[0], p[1]];
    const r = k => { const s = tb[k] || {}; return (s.od || s.h || 30) / 2; };
    const dtLine = G.downTubeLine.slice().reverse().map(xy);   // BB → head tube
    const stLine = G.seatTubeLine.map(xy);                     // BB → seat-tube top
    const tubes = [
      { name: "down tube", pts: dtLine, r: r("downTube") },
      { name: "seat tube", pts: stLine, r: r("seatTube") },
      { name: "top tube", pts: [xy(P.TTst), xy(P.TTht)], r: r("topTube") },
      { name: "head tube", pts: [xy(P.HTtop), xy(P.HTbot)], r: (tb.headTube && tb.headTube.od || 54) / 2 },
      { name: "BB shell", pts: [[0, 0], [0, 0.01]], r: ((tb.bbShell && tb.bbShell.od) || 52) / 2 }
    ];
    return { G, tubes, dt: walker(dtLine), st: walker(stLine), rDT: r("downTube"), rST: r("seatTube") };
  }

  // bottle outline (closed polygon) standing on base point b with axis u, the tube on the side −n
  function outline(B, base, u) {
    const n = [-u[1], u[0]], R = B.d / 2, r = (B.capD || B.d) / 2, hb = B.h - (B.capH || 0), sh = Math.min(18, hb * 0.1);
    const P = (s, w) => add(add(base, mul(u, s)), mul(n, w));
    return [P(0, -R + 4), P(0, R - 4), P(4, R), P(hb - sh, R), P(hb, r + 4), P(hb, r), P(B.h, r * 0.8), P(B.h, -r * 0.8), P(hb, -r), P(hb, -r - 4), P(hb - sh, -R), P(4, -R)];
  }
  function inPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function segDist(p, a, b) { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1))); return len(sub(p, add(a, mul(ab, t)))); }
  function samples(poly, step) {
    const out = [];
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], L = len(sub(b, a)), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) out.push(add(a, mul(sub(b, a), k / n))); }
    return out;
  }
  // gap from a bottle outline to a tube (negative = overlapping); skip = ignore the part of the tube the cage sits on
  function gapToTube(poly, tube) {
    let best = Infinity;
    const pts = samples(poly, STEP);
    for (const p of pts) for (let i = 0; i + 1 < tube.pts.length; i++) best = Math.min(best, segDist(p, tube.pts[i], tube.pts[i + 1]) - tube.r);
    // a tube passing right through the middle of the bottle
    for (const q of tube.pts) if (inPoly(q, poly)) best = Math.min(best, -tube.r);
    return best;
  }
  function gapPoly(A, B) {
    let best = Infinity; const sa = samples(A, STEP), sb = samples(B, STEP);
    for (const p of sa) { if (inPoly(p, B)) return -1; for (let i = 0; i < B.length; i++) best = Math.min(best, segDist(p, B[i], B[(i + 1) % B.length])); }
    for (const p of sb) if (inPoly(p, A)) return -1;
    return best;
  }

  // one bottle in one cage: where it sits
  function place(F, which, S) {
    const isDT = which === "dt", boss = isDT ? S.dtBoss : S.stBoss;
    const B = BOTTLES[isDT ? S.dtBottle : S.stBottle], C = CAGES[isDT ? S.dtCage : S.stCage];
    if (!(boss > 0) || !B || !B.h) return null;
    const below = isFinite(S.cageBelow) ? S.cageBelow : C.below, slide = Math.max(-C.slot, Math.min(C.slot, isDT ? S.dtSlide : S.stSlide));
    const W = isDT ? F.dt : F.st, rT = isDT ? F.rDT : F.rST;
    const s0 = boss - below + slide, at = W.at(Math.max(0, Math.min(W.total, s0 + B.h / 2))), u = at.t;
    const nIn = isDT ? [-u[1], u[0]] : [u[1], -u[0]];                 // inside the triangle
    const onTube = W.at(Math.max(0, s0));
    const off = rT + C.off + B.d / 2;
    const base = add(onTube.p, mul(nIn, off));
    const poly = outline(B, base, u);
    return { which, B, C, boss, s0, base, u, nIn, poly, bolts: [W.at(boss).p, W.at(boss + S.spacing).p], slide, below, lift: C.lift };
  }

  function clearances(F, b, others) {
    const tubes = F.tubes;   // its own tube too: the bottle runs alongside it at the cage gap, but a bend can still reach it
    let tube = Infinity, tubeName = "";
    for (const t of tubes) { const d = gapToTube(b.poly, t); if (d < tube) { tube = d; tubeName = t.name; } }
    let other = Infinity; for (const o of others) other = Math.min(other, gapPoly(b.poly, o.poly));
    return { tube, tubeName, other };
  }
  // how far it slides up its own axis before touching anything (stops at 120)
  function freeLift(F, b, others) {
    const hits = d => { const c = clearances(F, Object.assign({}, b, { poly: b.poly.map(p => add(p, mul(b.u, d))) }), others); return c.tube < 0 ? c.tubeName : c.other < 0 ? "the other bottle" : ""; };
    let lo = 0, step = 8, h = "";
    while (lo < 120) { const w = hits(lo + step); if (w) { h = w; break; } lo += step; }
    if (!h) return { lift: 120, hit: "" };
    for (let d = lo + 1; d <= lo + step; d++) { const w = hits(d); if (w) return { lift: d - 1, hit: w }; }
    return { lift: lo + step, hit: h };
  }

  function analyse(design, over) {
    const g = Object.assign({}, design.geometry, over || {}), S = settings(g);
    let F; try { F = frame(Object.assign({}, design, { geometry: g })); } catch (e) { return { ok: false, error: e.message, rows: [] }; }
    const dt = place(F, "dt", S), st = place(F, "st", S), list = [dt, st].filter(Boolean);
    const res = { ok: true, S, F, dt, st, rows: [] };
    for (const b of list) {
      const others = list.filter(o => o !== b);
      b.clear = clearances(F, b, others);
      b.free = freeLift(F, b, others);
      b.room = b.free.lift - b.lift;                 // spare room beyond what's needed to get it out
      b.fits = b.clear.tube >= 0 && b.clear.other >= 0;
      b.out = b.fits && b.room >= 0;
    }
    res.gap = dt && st ? gapPoly(dt.poly, st.poly) : null;
    const w = b => b.which === "dt" ? "Down-tube" : "Seat-tube";
    for (const b of list) {
      const lvl = !b.fits ? "bad" : b.room < 0 ? "bad" : b.room < 8 ? "warn" : "ok";
      res.rows.push({ k: b.which, label: `${w(b)} bottle: ${b.B.name}`, level: lvl,
        value: !b.fits ? `hits the ${b.clear.tube < 0 ? b.clear.tubeName : "other bottle"}` : `${Math.round(b.free.lift)} mm to slide out (needs ${b.lift})`,
        text: !b.fits ? `Doesn't fit: the bottle overlaps the ${b.clear.tube < 0 ? b.clear.tubeName : "other bottle"} with the cage on bosses at ${b.boss} / ${b.boss + S.spacing} mm from the BB.`
          : b.room < 0 ? `Fits in the cage, but it can only slide ${Math.round(b.free.lift)} mm before it hits the ${b.free.hit}; a ${b.B.rigid ? "rigid " : ""}bottle in a ${b.C.side ? "side-load" : "top-load"} cage needs about ${b.lift} mm to come out.`
          : `Fits and comes out: ${Math.round(b.free.lift)} mm of slide before the ${b.free.hit || "nothing"} (needs about ${b.lift}). Closest tube ${Math.round(b.clear.tube)} mm (${b.clear.tubeName}).` });
    }
    if (dt && st) res.rows.push({ k: "gap", label: "Gap between the two bottles", level: res.gap < 0 ? "bad" : res.gap < 5 ? "warn" : "ok", value: res.gap < 0 ? "they touch" : `${Math.round(res.gap)} mm`,
      text: res.gap < 0 ? "The bottles overlap in the side view." : res.gap < 5 ? "Very close: they may rub or clack." : "Clear of each other." });
    res.ok = list.every(b => b.out) && !(res.gap !== null && res.gap < 0);
    return res;
  }

  // best boss positions for the chosen bottles: the smallest of (spare slide room DT, spare room ST, bottle gap − 5),
  // counted up to opts.cap (40 mm spare is plenty), then the least change from the current bosses (±100 / ±60 mm). Searches 10 mm steps, then 3 mm around the best.
  function suggest(design, opts) {
    const o = Object.assign({ dt: [200, 520], st: [120, 300], keepSt: false, cap: 40 }, opts || {}), g = design.geometry;
    const cur = { dt: num(g.dtBoss, 330), st: num(g.stBoss, 180) };
    const score = (d, s) => {
      const r = analyse(design, { dtBoss: d, stBoss: s });
      if (!r.ok && (!r.dt || !r.st || !r.dt.fits || !r.st.fits)) return { v: -1e3, r };
      const m = Math.min(r.dt ? r.dt.room : 99, r.st ? r.st.room : 99, r.gap === null ? 99 : r.gap - 5);
      return { v: Math.min(m, o.cap) - 0.02 * (Math.abs(d - cur.dt) + Math.abs(s - cur.st)), m, r };
    };
    let best = null;
    o.dt = [Math.max(o.dt[0], cur.dt - 100), Math.min(o.dt[1], cur.dt + 100)]; o.st = [Math.max(o.st[0], cur.st - 60), Math.min(o.st[1], cur.st + 60)];
    const stR = o.keepSt ? [cur.st, cur.st] : o.st;
    STEP = 8;
    try { for (let d = o.dt[0]; d <= o.dt[1]; d += 10) for (let s = stR[0]; s <= stR[1]; s += 10) { const q = score(d, s); if (!best || q.v > best.v) best = Object.assign(q, { d, s }); } }
    finally { STEP = 3; }
    const c = best; best = score(c.d, c.s); Object.assign(best, { d: c.d, s: c.s });
    for (let d = c.d - 6; d <= c.d + 6; d += 3) for (let s = (o.keepSt ? cur.st : c.s - 6); s <= (o.keepSt ? cur.st : c.s + 6); s += 3) { const q = score(d, s); if (q.v > best.v) best = Object.assign(q, { d, s }); }
    return { dtBoss: best.d, stBoss: best.s, margin: best.m, res: best.r };
  }

  // ---------------------------------------------------------------- picture
  function svg(design, res) {
    res = res || analyse(design);
    if (!res.F) return "";
    const F = res.F, P = F.G.P, pts = [];
    const T = p => [p[0], -p[1]];
    const pl = (arr, cls, close) => `<${close ? "polygon" : "polyline"} class="${cls}" points="${arr.map(p => T(p).map(v => v.toFixed(1)).join(",")).join(" ")}"/>`;
    let s = "";
    for (const t of F.tubes) { if (t.name === "BB shell") { s += `<circle class="bt-tube" cx="0" cy="0" r="${t.r}"/>`; continue; } s += `<polyline class="bt-tube" stroke-width="${2 * t.r}" points="${t.pts.map(p => T(p).join(",")).join(" ")}"/>`; t.pts.forEach(p => pts.push(p)); }
    for (const t of F.tubes) if (t.name !== "BB shell") s += `<polyline class="bt-cl" points="${t.pts.map(p => T(p).join(",")).join(" ")}"/>`;
    for (const b of [res.dt, res.st].filter(Boolean)) {
      const lvl = !b.fits || b.room < 0 ? "bad" : b.room < 8 ? "warn" : "ok";
      // ghost: slid up by what it needs to come out
      s += pl(b.poly.map(p => add(p, mul(b.u, b.lift))), "bt-ghost " + lvl, true);
      s += pl(b.poly, "bt-bottle " + lvl, true);
      for (const q of b.bolts) s += `<circle class="bt-boss" cx="${q[0].toFixed(1)}" cy="${(-q[1]).toFixed(1)}" r="4"/>`;
      b.poly.forEach(p => pts.push(p));
    }
    const xs = pts.map(p => p[0]), ys = pts.map(p => -p[1]);
    const x0 = Math.min(...xs) - 20, x1 = Math.max(...xs) + 20, y0 = Math.min(...ys) - 20, y1 = Math.max(...ys) + 30;
    return `<svg class="bt-svg" viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}" role="img" aria-label="Bottles in the front triangle, side view">${s}</svg>`;
  }

  // ---------------------------------------------------------------- design chat (chat.js FrameChat.extra)
  // "fit a Bivo 21 oz insulated in the down tube cage", "Bivo Trio Mini on the seat tube", "Silca Sicuro cages",
  // "side-load cage on the seat tube", "best bottle positions" / "optimise the bottle bosses".
  function bottleOf(t) {
    if (/\b(trio ?mini|mini)\b|\b17 ?(oz|ounce)/.test(t)) return "bivo-trio-17";
    if (/\bbivo one\b/.test(t)) return "bivo-one-21";
    if (/\b(duo|25 ?(oz|ounce))\b/.test(t)) return "bivo-duo-25";
    if (/\b(bivo|trio|insulated)\b/.test(t)) return "bivo-trio-21";
    if (/\b(750 ?ml|24 ?(oz|ounce)|26 ?(oz|ounce)|large bottle|big bottle)\b/.test(t)) return "std-24";
    if (/\b(standard|normal|plastic|regular) bottle\b|\b(620 ?ml|21 ?(oz|ounce))\b/.test(t)) return "std-21";
    if (/\bno bottle\b/.test(t)) return "none";
    return null;
  }
  function chat(raw, text, ctx) {
    const t = String(text || "").toLowerCase();
    if (!ctx || !ctx.fields || !ctx.App) return null;
    const F = id => ctx.fields().find(f => f.id === "geometry." + id);
    if (!F("dtBoss")) return null;
    const where = /\b(seat ?tube|seat tube cage|lower|bottom|rear) (cage|bottle|one|position)?|\bon the seat ?tube\b|\bin the seat ?tube\b/.test(t) ? "st"
      : /\b(both|each|all)\b/.test(t) ? "both" : "dt";
    // best positions
    if (/\b(best|optimi[sz]e|optimi[sz]ed|ideal|where should)\b.*\b(bottle|cage|boss|bosses)\b|\b(bottle|cage|boss|bosses)\b.*\b(optimi[sz]e|best positions?)\b/.test(t)) {
      const d = ctx.App.design(); if (!d) return null;
      const g = d.geometry, dd = JSON.parse(JSON.stringify(d));
      if (!(+dd.geometry.dtBoss > 0)) dd.geometry.dtBoss = 330; if (!(+dd.geometry.stBoss > 0)) dd.geometry.stBoss = 180;
      const b = suggest(dd);
      if (!(b.margin > -100)) return "I couldn't find boss positions where both bottles fit and come out. Try a smaller bottle (`Bivo Trio Mini on the seat tube`) or a side-load cage.";
      const r = b.res, line = x => x ? `${x.B.name}: ${Math.round(x.free.lift)} mm to slide out (needs ${x.lift})` : "";
      const chg = [{ f: F("dtBoss"), v: b.dtBoss }, { f: F("stBoss"), v: b.stBoss }].filter(c => +c.f.get() !== c.v);
      const out = chg.length ? ctx.apply(chg, "best bottle positions") : "The bosses are already where they fit best.";
      return out + `\nDown-tube bosses ${b.dtBoss} / ${b.dtBoss + (+g.bossSpacing || 64)} mm, seat-tube bosses ${b.stBoss} / ${b.stBoss + (+g.bossSpacing || 64)} mm from the BB.\n• ${[line(r.dt), line(r.st)].filter(Boolean).join("\n• ")}${r.gap != null ? `\n• ${Math.round(r.gap)} mm between the bottles` : ""}\n_Open **Bottles & cages** to see it; \`undo\` puts them back._`;
    }
    if (!/\b(bivo|trio|insulated|sicuro|silca|side ?load(ing)?|bottle|cage)\b/.test(t)) return null;
    if (/\?$|^(how|what|why|which|does|do|can|is|are)\b/.test(t.trim()) || /\b(ask|question|builder|note|mounts?)\b/.test(t)) return null;
    const ch = [];
    const bot = bottleOf(t);
    const cage = /\b(silca|sicuro)\b/.test(t) ? "silca-sicuro" : /\bside ?load(ing)?\b/.test(t) ? "side-load" : /\b(standard|normal|regular) cages?\b/.test(t) ? "standard" : null;
    const tubes = where === "both" ? ["dt", "st"] : [where];
    for (const w of tubes) {
      if (bot) ch.push({ f: F(w + "Bottle"), v: bot });
      if (cage) ch.push({ f: F(w + "Cage"), v: cage });
    }
    if (!bot && cage && where === "dt" && !/\bdown ?tube\b/.test(t)) ch.push({ f: F("stCage"), v: cage });    // "Silca Sicuro cages": both
    if (!ch.length) return null;
    const g = ctx.App.design().geometry;
    for (const w of tubes) if (!(+g[w + "Boss"] > 0)) ch.push({ f: F(w + "Boss"), v: w === "dt" ? 330 : 180 });
    const out = ctx.apply(ch, "bottles");
    let r = null; try { r = analyse(ctx.App.design()); } catch (e) {}
    const rows = r && r.rows ? r.rows.map(x => `• ${x.label}: ${x.value}${x.level === "bad" ? " ⚠" : ""}`).join("\n") : "";
    return out + (rows ? "\n" + rows : "") + "\n_`best bottle positions` finds the boss positions with the most room; open **Bottles & cages** to see it._";
  }
  if (root.FrameChat && Array.isArray(root.FrameChat.extra)) root.FrameChat.extra.push(chat);
  else if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => { if (root.FrameChat && Array.isArray(root.FrameChat.extra)) root.FrameChat.extra.push(chat); });

  root.FrameBottles = { BOTTLES, CAGES, analyse, suggest, svg, settings, chat };
  if (typeof module !== "undefined") module.exports = root.FrameBottles;
})(typeof window !== "undefined" ? window : globalThis);
