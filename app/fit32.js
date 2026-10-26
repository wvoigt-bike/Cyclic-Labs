// ============================================================================
//  32er FIT SOLVER (fit32.js)  —  "put my hands where my 29er puts them"
//
//  A 32" bike has a much taller front end (bigger wheel, longer fork) and needs
//  a longer front centre to keep your toes off the tyre. So copying your 29er /
//  700c frame's stack and reach (or your stem) straight across usually doesn't
//  work: the bars end up in the wrong place, or you'd need a 20 mm stem.
//
//  This solver works on the one thing that really matters: where your HANDS sit
//  relative to the cranks (BB). It reads that off the bike that fits you
//  (frame stack + reach + head angle + spacers + stem + bar), then solves either
//    · the COCKPIT for a 32er frame you keep as it is (stem length or angle,
//      spacers, bar rise), or
//    · the FRAME stack / reach / head tube for a 32er, with the cockpit you pick,
//  with sliders that re-solve live, a "best real setups" list, the toe-overlap
//  check on every answer and a side-view picture.
//
//  Shows up when the bike has 32" wheels: in the new-bike walkthrough
//  (Geometry step → "Match a bike I already ride") and in step 2 (Design) as the
//  "Match my 29er fit" box. Chat: "match my 29er fit", "32er fit solver".
//
//  Geometry: BB centre = origin, x forward, y up, mm and degrees. The stem clamp
//  centre sits 8 mm (top cap) + spacers + 20 mm (half a 40 mm stem) up the
//  steerer from the head-tube top, the same rule as parts.js and fitgen.js.
//  To change the choices it offers, edit STEM_ANGLES / STEM_LENGTHS / RISES /
//  LIMITS / HAND below, or ask Claude in chat.
// ============================================================================
(function (root) {
  "use strict";
  const D2R = Math.PI / 180;
  const num = (v, d) => (v === "" || v == null || !isFinite(+v)) ? d : +v;
  const r0 = v => Math.round(v), r1 = v => Math.round(v * 10) / 10;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sgn = v => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(r0(v));

  // ---------------------------------------------------------------- what's on sale / what's sensible
  const CAP = 8, STEM_STACK = 40;                         // headset top cap, stem steerer-clamp height
  const STEM_ANGLES = [-35, -25, -17, -10, -6, 0, 6, 10, 17, 25, 35];   // stems people can actually buy (° from square to the steerer)
  const STEM_LENGTHS = [35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130];
  const RISES = { drop: [0, 10, 15, 20, 25, 30], flat: [0, 10, 15, 20, 25, 30, 35, 40, 50, 60, 80] };   // bar rise options (mm)
  // where your hands sit relative to the stem's bar clamp: drop bar = on the hoods (≈75 mm ahead); flat bar = on the grips
  // (≈40 mm behind, from the bar's backsweep). Only matters when the two bikes have different bar types.
  const HAND = { drop: 75, flat: -40 };
  const LIMITS = {
    headTubeMin: 90,          // shortest head tube a builder will weld two tubes and a ZS56 lower cup onto
    headTubeMax: 260,
    spacersMax: 40,           // most carbon fork makers allow ≤ 40 mm under the stem (some 30: check yours)
    spacersComfy: [5, 25],    // room to adjust either way later
    stem: { gravel: [55, 90], road: [70, 110], mtb: [35, 60] },   // stem lengths that keep the steering natural on a 32er
    angleNormal: 17,          // beyond ±17° stems look odd and are hard to find
    match: 6                  // mm: a real-parts setup within this of your hands counts as a match
  };

  // ---------------------------------------------------------------- the maths
  const upOf = ha => [-Math.cos(ha * D2R), Math.sin(ha * D2R)];          // up the steerer
  const fwdOf = ha => [Math.sin(ha * D2R), Math.cos(ha * D2R)];          // square to the steerer, forwards
  const stemDir = (ha, rise) => { const u = upOf(ha), f = fwdOf(ha), r = rise * D2R; return [f[0] * Math.cos(r) + u[0] * Math.sin(r), f[1] * Math.cos(r) + u[1] * Math.sin(r)]; };
  // b: { reach, stack, headAngle, spacers, stemLength, stemRise, barRise, barType }
  function points(b) {
    const u = upOf(b.headAngle), d = stemDir(b.headAngle, b.stemRise), H = [b.reach, b.stack];
    const base = [H[0] + u[0] * CAP, H[1] + u[1] * CAP];
    const stemC = [H[0] + u[0] * (CAP + b.spacers + STEM_STACK / 2), H[1] + u[1] * (CAP + b.spacers + STEM_STACK / 2)];
    const stemTop = [H[0] + u[0] * (CAP + b.spacers + STEM_STACK), H[1] + u[1] * (CAP + b.spacers + STEM_STACK)];
    const clamp = [stemC[0] + d[0] * b.stemLength, stemC[1] + d[1] * b.stemLength];
    const hand = [clamp[0] + (HAND[b.barType] || 0), clamp[1] + num(b.barRise, 0)];
    return { H, base, stemC, stemTop, clamp, hand };
  }
  const handPoint = b => points(b).hand;
  // the bar-clamp point that puts the hands on `target` with this bar
  const clampFor = (target, barRise, barType) => [target[0] - (HAND[barType] || 0), target[1] - num(barRise, 0)];

  // frame fixed, stem ANGLE chosen → stem length + spacers (two straight-line unknowns: exact)
  function solveLength(frame, target, rise, barRise, barType) {
    const u = upOf(frame.headAngle), d = stemDir(frame.headAngle, rise), C = clampFor(target, barRise, barType), k = CAP + STEM_STACK / 2;
    const v = [C[0] - frame.reach - u[0] * k, C[1] - frame.stack - u[1] * k];
    const det = u[0] * d[1] - u[1] * d[0];
    const spacers = (v[0] * d[1] - v[1] * d[0]) / det, stemLength = (u[0] * v[1] - u[1] * v[0]) / det;
    return { spacers, stemLength, stemRise: rise };
  }
  // frame fixed, stem LENGTH chosen → stem angle + spacers (the clamp is on a circle round the steerer: pick the root nearest a −6° stem)
  function solveAngle(frame, target, L, barRise, barType) {
    const u = upOf(frame.headAngle), f = fwdOf(frame.headAngle), C = clampFor(target, barRise, barType), k = CAP + STEM_STACK / 2;
    const v = [C[0] - frame.reach - u[0] * k, C[1] - frame.stack - u[1] * k];
    const uv = u[0] * v[0] + u[1] * v[1], fv = f[0] * v[0] + f[1] * v[1];   // along / square to the steerer
    if (Math.abs(fv) > L) return { stemLength: L, spacers: uv, stemRise: NaN, tooShort: L < Math.abs(fv), need: Math.abs(fv) };
    const along = Math.sqrt(L * L - fv * fv);               // stem's own rise along the steerer (±)
    const opts = [along, -along].map(a => ({ stemLength: L, spacers: uv - a, stemRise: Math.atan2(a, fv) / D2R }));
    const bad = o => (o.spacers < -0.5 ? -o.spacers : o.spacers > LIMITS.spacersMax ? o.spacers - LIMITS.spacersMax : 0) * 3 + Math.max(0, Math.abs(o.stemRise) - 40) * 5;
    const cost = o => bad(o) + Math.abs(o.stemRise + 6) * 0.4 + Math.max(0, o.spacers - LIMITS.spacersComfy[1]) * 0.6 + Math.max(0, LIMITS.spacersComfy[0] - o.spacers) * 0.3;
    opts.sort((a, b) => cost(a) - cost(b));
    return opts[0];
  }
  // cockpit chosen → the frame stack + reach that put the hands on target
  function frameFor(target, ck, headAngle) {
    const p = points(Object.assign({}, ck, { reach: 0, stack: 0, headAngle }));
    return { reach: target[0] - p.hand[0], stack: target[1] - p.hand[1] };
  }
  const nearest = (list, v) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, list[0]);
  const kindOf = d => (d && d.parts && d.parts.barType === "flat") || (d && d.use && +d.use.forkTravel > 0) ? "mtb" : "gravel";
  const is32 = d => { const g = d && d.geometry; return !!g && (+g.rimBSD === 686 || +g.rimBSDFront === 686 || (+g.tireDiameter > 760 && !(+g.rimBSD > 0))); };

  // penalties shared by both searches ("score points"; lower wins)
  function cockpitPenalty(ck, kind) {
    const [lo, hi] = LIMITS.stem[kind] || LIMITS.stem.gravel, L = ck.stemLength, s = ck.spacers, a = Math.abs(ck.stemRise);
    let p = 0;
    if (L < lo) p += (lo - L) * 0.6; if (L > hi) p += (L - hi) * 0.6;
    if (s < LIMITS.spacersComfy[0]) p += (LIMITS.spacersComfy[0] - s) * 0.3; if (s > LIMITS.spacersComfy[1]) p += (s - LIMITS.spacersComfy[1]) * 0.6;
    if (a > LIMITS.angleNormal) p += (a - LIMITS.angleNormal) * 0.8; else if (a > 10) p += (a - 10) * 0.25;
    p += Math.abs(num(ck.barRise, 0)) * 0.08;
    return p;
  }
  // frame fixed: the best combinations of real parts
  function bestCockpits(frame, target, barType, kind, n) {
    const out = [];
    for (const rise of STEM_ANGLES) for (const br of RISES[barType] || [0]) {
      const ex = solveLength(frame, target, rise, br, barType);
      if (!(ex.stemLength > 25)) continue;
      const L = nearest(STEM_LENGTHS, ex.stemLength);
      for (const sp of [Math.floor(ex.spacers / 5) * 5, Math.ceil(ex.spacers / 5) * 5]) {
        if (sp < 0 || sp > LIMITS.spacersMax) continue;
        const ck = { stemLength: L, stemRise: rise, spacers: sp, barRise: br, barType };
        const h = handPoint(Object.assign({}, frame, ck)), err = Math.hypot(h[0] - target[0], h[1] - target[1]);
        if (err > 15) continue;
        out.push(Object.assign(ck, { err, dx: h[0] - target[0], dy: h[1] - target[1], score: err * 1.5 + cockpitPenalty(ck, kind) }));
      }
    }
    out.sort((a, b) => a.score - b.score);
    const pick = [];
    for (const c of out) { if (!pick.some(p => p.stemRise === c.stemRise && p.barRise === c.barRise)) pick.push(c); if (pick.length >= (n || 3)) break; }
    return pick;
  }

  // ---------------------------------------------------------------- the 32er being fitted
  // base: a Cyclic Labs design. Its cockpit (with the bike's adjustments) and the toe-overlap limits (as front-centre).
  function cockpitOf(d) {
    const lib = root.FramePartLib, p = d.parts || {};
    let ck = {}; try { ck = lib && lib.resolve ? (lib.resolve(d).cockpit || {}) : {}; } catch (e) {}
    const useCk = !!(p.sel && p.sel.cockpit && ck.stemLength != null);
    const pick = (k, dflt) => num(useCk && ck[k] != null ? ck[k] : p[k], dflt);
    return { stemLength: pick("stemLength", 80), stemRise: pick("stemRise", -6), spacers: Math.max(0, pick("spacers", 15)), barRise: (useCk ? ck.barType : p.barType) === "flat" ? pick("barRise", 20) : pick("dropRise", 0),
      barType: (useCk ? ck.barType : p.barType) === "flat" ? "flat" : "drop" };
  }
  function geoInfo(d) { try { return root.FrameFEA.buildGeometry(d.geometry, d.tubes).info; } catch (e) { return null; } }
  function frameOf(d) {
    const g = d.geometry, info = geoInfo(d);
    return { reach: +g.reach, stack: +g.stack, headAngle: +g.headAngle, headTube: +g.headTube, forkA2C: +g.forkA2C, forkOffset: +g.forkOffset,
      fc: info ? info.frontCentre : NaN, wb: info ? info.wheelbase : NaN, R: info ? info.frontTyreR : (+g.tireDiameterFront || +g.tireDiameter) / 2,
      axleY: info ? info.frontAxleHeight : NaN, crank: num(g.crankLength, 172.5) };
  }
  // a copy of the design with a new stack / reach; the head tube grows with the stack so the bike still stands level
  function withFrame(d, reach, stack) {
    const c = JSON.parse(JSON.stringify(d)), g = c.geometry, ha = g.headAngle * D2R;
    g.headTube = r1(+g.headTube + (stack - g.stack) / Math.sin(ha));
    g.reach = r1(reach); g.stack = r1(stack);
    if (g.ttBelowHtTop + g.dtAboveHtBottom >= g.headTube - 10) { const k = Math.max(0.3, (g.headTube - 14) / (g.ttBelowHtTop + g.dtAboveHtBottom)); g.ttBelowHtTop = Math.round(g.ttBelowHtTop * k); g.dtAboveHtBottom = Math.round(g.dtAboveHtBottom * k); }
    return c;
  }
  // toe overlap only depends on how far ahead the front wheel is (front-centre) for a given fork / angle / crank / shoe:
  // find the front-centre where it stops touching in normal turns (warn) and where it's fully fine (ok), once per bike.
  const toeCache = new Map();
  function toeLimits(d) {
    const TOE = root.FrameToe; if (!TOE) return null;
    const g = d.geometry, key = JSON.stringify([g.headAngle, g.forkA2C, g.forkOffset, g.tireDiameter, g.tireDiameterFront, g.tireWidth, g.crankLength, g.headTube, g.stack, d.fit, d.parts && d.parts.fender]);
    if (toeCache.has(key)) return toeCache.get(key);
    const fc0 = (geoInfo(d) || {}).frontCentre; if (!isFinite(fc0)) return null;
    const RANK = { ok: 2, warn: 1, fail: 0 };
    const at = dr => { try { const r = TOE.compute(withFrame(d, +g.reach + dr, +g.stack), { fast: true }); return RANK[r.status]; } catch (e) { return NaN; } };
    // walk the reach until both limits are bracketed, then halve the gap (±1 mm)
    const find = need => {
      let lo = -200, hi = 200;
      if (at(hi) < need) return Infinity; if (at(lo) >= need) return -Infinity;
      for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (at(m) >= need) hi = m; else lo = m; }
      return fc0 + hi;
    };
    const res = { ok: find(2), warn: find(1), fc0 };
    toeCache.set(key, res);
    return res;
  }
  const toeAt = (lim, fc) => !lim || !isFinite(fc) ? null : fc >= lim.ok ? "ok" : fc >= lim.warn ? "warn" : "fail";
  const TOE_TXT = { ok: "No toe overlap in normal turns", warn: "Toe can touch in slow, tight turns", fail: "Toe touches the tyre in ordinary slow turns" };

  // frame free: the best stack / reach + real cockpit (scores the toe overlap, head tube, stem, spacers)
  function bestFrames(d, target, barType, barRise, n) {
    const F = frameOf(d), lim = toeLimits(d), kind = kindOf(d), out = [];
    const sinA = Math.sin(F.headAngle * D2R), tanA = Math.tan(F.headAngle * D2R);
    for (const L of STEM_LENGTHS.filter(x => x >= 40 && x <= 120)) for (const rise of STEM_ANGLES.filter(a => Math.abs(a) <= 17)) for (const sp of [5, 10, 15, 20, 25]) {
      const ck = { stemLength: L, stemRise: rise, spacers: sp, barRise, barType };
      const fr = frameFor(target, ck, F.headAngle), ht = F.headTube + (fr.stack - F.stack) / sinA;
      if (ht < LIMITS.headTubeMin || ht > LIMITS.headTubeMax) continue;
      const fc = F.fc + (fr.reach - F.reach) + (fr.stack - F.stack) / tanA, toe = toeAt(lim, fc);
      let score = cockpitPenalty(ck, kind) + (toe === "fail" ? 60 : toe === "warn" ? 14 : 0) + (rise === -6 ? 0 : rise === 0 ? 0.5 : 1.5);
      if (lim && isFinite(lim.ok) && toe === "ok") score += Math.max(0, fc - lim.ok - 30) * 0.05;   // don't stretch the wheelbase further than needed
      out.push(Object.assign(ck, { reach: fr.reach, stack: fr.stack, headTube: ht, fc, toe, score }));
    }
    out.sort((a, b) => a.score - b.score);
    const pick = [];
    for (const c of out) { if (!pick.some(p => Math.abs(p.reach - c.reach) < 8 && Math.abs(p.stack - c.stack) < 8 || p.stemLength === c.stemLength)) pick.push(c); if (pick.length >= (n || 3)) break; }
    return { list: pick, lim };
  }

  // ---------------------------------------------------------------- the old bike (remembered in this browser)
  const OLD_KEY = "frameBench.fit32.old";
  const OLD_DEFAULT = { name: "", stack: 620, reach: 390, headAngle: 71, spacers: 15, stemLength: 90, stemRise: -6, barRise: 0, barType: "drop" };
  function loadOld() { try { const o = JSON.parse(localStorage.getItem(OLD_KEY) || "null"); if (o && isFinite(+o.stack)) return Object.assign({}, OLD_DEFAULT, o); } catch (e) {} return Object.assign({}, OLD_DEFAULT); }
  function saveOld(o) { try { localStorage.setItem(OLD_KEY, JSON.stringify(o)); } catch (e) {} }
  // a saved bike that isn't a 32er → its fit numbers
  function oldFromDesign(d, name) {
    const g = d.geometry, ck = cockpitOf(d);
    return Object.assign({ name: name || "", stack: r1(+g.stack), reach: r1(+g.reach), headAngle: +g.headAngle }, ck);
  }

  // ---------------------------------------------------------------- UI
  const css = `
  dialog.f32 { width: min(1100px, calc(100vw - 24px)); max-width: none; max-height: calc(100vh - 24px); padding: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--ink); }
  dialog.f32::backdrop { background: rgba(10, 12, 16, .55); }
  .f32-wrap { display: flex; flex-direction: column; max-height: calc(100vh - 26px); }
  .f32-head { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--line); }
  .f32-head h2 { font-size: 20px; flex: 1; margin: 0; }
  .f32-body { padding: 14px 18px 18px; overflow: auto; }
  .f32 .lead { color: var(--muted); max-width: 80ch; margin: 0 0 10px; font-size: 14px; }
  .f32-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 1fr); gap: 16px; align-items: start; }
  @media (max-width: 800px) { .f32-grid { grid-template-columns: minmax(0, 1fr); } }
  .f32-card { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--bg); display: flex; flex-direction: column; gap: 8px; }
  .f32-card h3 { font: 600 16px var(--font-display); margin: 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .f32-card h3 small { font: 400 12.5px var(--font-body); color: var(--muted); }
  .f32-old { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px 10px; }
  .f32-old label { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; color: var(--muted); }
  .f32-old input, .f32-old select { font: 13px var(--font-data); width: 100%; box-sizing: border-box; }
  .f32-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
  .f32-tabs button { flex: 1 1 200px; text-align: left; padding: 8px 10px; border-radius: 8px; }
  .f32-tabs button small { display: block; color: var(--muted); font-size: 12px; }
  .f32-tabs button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
  .f32-sl { display: grid; grid-template-columns: 150px minmax(0, 1fr) 74px; gap: 8px; align-items: center; font-size: 13.5px; }
  @media (max-width: 520px) { .f32-sl { grid-template-columns: minmax(0, 1fr) 70px; } .f32-sl input[type=range] { grid-column: 1 / -1; grid-row: 2; } }
  .f32-sl input[type=range] { width: 100%; accent-color: var(--accent); }
  .f32-sl output { font: 600 13.5px var(--font-data); text-align: right; }
  .f32-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .f32-seg button { border: 0; border-radius: 0; padding: 4px 10px; font-size: 12.5px; }
  .f32-seg button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); }
  .f32-res { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; }
  .f32-res div { border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; background: var(--panel); }
  .f32-res span { display: block; font-size: 11.5px; color: var(--muted); }
  .f32-res b { font: 600 18px var(--font-data); }
  .f32-res small { display: block; font-size: 11.5px; color: var(--muted); }
  .f32-res .bad { border-color: var(--bad); } .f32-res .bad b { color: var(--bad); }
  .f32-res .warn { border-color: var(--warn); } .f32-res .warn b { color: var(--warn); }
  .f32-res .ok b { color: var(--ok); }
  .f32-msg { font-size: 13.5px; margin: 0; padding: 6px 9px; border-radius: 7px; border-left: 3px solid var(--line); background: var(--panel); }
  .f32-msg.bad { border-left-color: var(--bad); } .f32-msg.warn { border-left-color: var(--warn); } .f32-msg.ok { border-left-color: var(--ok); }
  .f32-best { display: flex; flex-direction: column; gap: 6px; }
  .f32-best button { text-align: left; padding: 7px 10px; border-radius: 8px; font-size: 13px; line-height: 1.35; }
  .f32-best button b { font-family: var(--font-display); font-size: 15px; }
  .f32-pic svg { width: 100%; height: auto; display: block; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
  .f32-key { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
  .f32-key i { display: inline-block; width: 18px; height: 0; border-top: 3px solid; vertical-align: middle; margin-right: 4px; }
  .f32-foot { display: flex; gap: 8px; align-items: center; padding: 12px 18px; border-top: 1px solid var(--line); flex-wrap: wrap; }
  .f32-foot .grow { flex: 1; }
  .f32 .hint { color: var(--muted); font-size: 12.5px; margin: 0; }
  `;
  let cssDone = false;
  function addCss() { if (cssDone || typeof document === "undefined") return; const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); cssDone = true; }

  // mount(el, { base: design, modes: ["cockpit","frame"], mode, designs: [{id,name,design}], onChange(result) })
  // returns { result() } — result: { mode, frame: {reach, stack, headTube} | null, cockpit: {stemLength, stemRise, spacers, barRise}, ok }
  function mount(el, opts) {
    addCss();
    const base = opts.base, F = frameOf(base), kind = kindOf(base), ck0 = cockpitOf(base);
    const modes = opts.modes || ["cockpit", "frame"];
    const st = {
      old: loadOld(), mode: opts.mode && modes.includes(opts.mode) ? opts.mode : modes[0],
      by: "length",                                                     // cockpit tab: the slider is the stem length (solve angle) or the angle (solve length)
      ck: { stemLength: ck0.stemLength, stemRise: ck0.stemRise, barRise: ck0.barRise, barType: ck0.barType },
      fr: { stemLength: Math.min(80, ck0.stemLength), stemRise: -6, spacers: 15, barRise: ck0.barRise, barType: ck0.barType },
      lim: undefined
    };
    let last = null;
    // keep-the-frame tab starts from the best real setup when the bike's own stem can't reach
    try {
      const T0 = handPoint(st.old), fr0 = { reach: F.reach, stack: F.stack, headAngle: F.headAngle }, a0 = solveAngle(fr0, T0, st.ck.stemLength, st.ck.barRise, st.ck.barType);
      if (!isFinite(a0.stemRise) || Math.abs(a0.stemRise) > 17 || a0.spacers < 0 || a0.spacers > LIMITS.spacersMax) {
        const b0 = bestCockpits(fr0, T0, st.ck.barType, kind, 1)[0]; if (b0) Object.assign(st.ck, { stemLength: b0.stemLength, stemRise: b0.stemRise, barRise: b0.barRise });
      }
    } catch (e) {}
    const designs = (opts.designs || []).filter(x => x.design && !is32(x.design));
    const target = () => handPoint(st.old);

    function oldHtml() {
      const o = st.old, f = (k, l, step, u) => `<label>${esc(l)}${u ? ` (${u})` : ""}<input type="number" step="${step}" data-old="${k}" value="${esc(o[k])}"></label>`;
      return `<div class="f32-card"><h3>1 · The bike that fits you <small>(your 29er, 700c gravel or road bike)</small></h3>
        ${designs.length ? `<label class="hint" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">Copy it from a saved bike:
          <select data-copy style="max-width:100%"><option value="">— pick one —</option>${designs.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label>` : ""}
        <div class="f32-old">${f("stack", "Frame stack", "0.5", "mm")}${f("reach", "Frame reach", "0.5", "mm")}${f("headAngle", "Head angle", "0.1", "°")}
          ${f("spacers", "Spacers under the stem", "1", "mm")}${f("stemLength", "Stem length", "5", "mm")}${f("stemRise", "Stem angle (−6 = normal)", "1", "°")}
          ${f("barRise", "Bar rise", "5", "mm")}<label>Bar<select data-old="barType"><option value="drop"${o.barType === "drop" ? " selected" : ""}>Drop bar</option><option value="flat"${o.barType === "flat" ? " selected" : ""}>Flat / riser bar</option></select></label></div>
        <p class="hint">Stack and reach are on the bike's geometry chart or drawing. Spacers = only the ones under the stem (an 8 mm top cap is added). Your hands sit
          <b data-hands></b> from the middle of the cranks: that's what the 32er has to copy.</p></div>`;
    }
    function tabsHtml() {
      if (modes.length < 2) return "";
      return `<div class="f32-tabs" role="group" aria-label="What can change">
        <button type="button" data-mode="cockpit" aria-pressed="${st.mode === "cockpit"}"><b>Keep this 32er frame</b><small>Solve the stem, spacers and bar to suit it</small></button>
        <button type="button" data-mode="frame" aria-pressed="${st.mode === "frame"}"><b>Change the 32er frame</b><small>Pick your cockpit; solve the frame stack and reach</small></button></div>`;
    }
    const slider = (key, label, min, max, step, val, unit) => `<div class="f32-sl"><span>${esc(label)}</span><input type="range" data-sl="${key}" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${esc(label)}"><output data-out="${key}">${val} ${unit}</output></div>`;
    function controlsHtml() {
      const br = st.mode === "cockpit" ? st.ck : st.fr, brMax = br.barType === "flat" ? 80 : 40;
      const barSl = slider("barRise", br.barType === "flat" ? "Bar rise" : "Drop-bar rise", -10, brMax, 5, br.barRise, "mm");
      if (st.mode === "cockpit") {
        return `<div class="f32-card"><h3>2 · Your 32er's cockpit <small>frame: reach ${r0(F.reach)}, stack ${r0(F.stack)}, head angle ${F.headAngle}°</small></h3>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px">I'll choose the
            <span class="f32-seg"><button type="button" data-by="length" aria-pressed="${st.by === "length"}">stem length</button><button type="button" data-by="angle" aria-pressed="${st.by === "angle"}">stem angle</button></span>
            and the solver works out the ${st.by === "length" ? "angle" : "length"} and spacers.</div>
          ${st.by === "length" ? slider("stemLength", "Stem length", 30, 140, 5, st.ck.stemLength, "mm") : slider("stemRise", "Stem angle", -40, 40, 1, st.ck.stemRise, "°")}
          ${barSl}
          <div class="f32-res" data-res></div><div data-msgs style="display:flex;flex-direction:column;gap:5px"></div>
          <div class="sub-h" style="margin-top:4px">Best setups with real parts</div><div class="f32-best" data-best></div></div>`;
      }
      return `<div class="f32-card"><h3>2 · Pick your 32er's cockpit <small>the frame is solved to fit it</small></h3>
        ${slider("stemLength", "Stem length", 35, 130, 5, st.fr.stemLength, "mm")}${slider("stemRise", "Stem angle", -35, 35, 1, st.fr.stemRise, "°")}
        ${slider("spacers", "Spacers under stem", 0, 40, 5, st.fr.spacers, "mm")}${barSl}
        <div class="f32-res" data-res></div><div data-msgs style="display:flex;flex-direction:column;gap:5px"></div>
        <div class="sub-h" style="margin-top:4px">Best frames for you</div><div class="f32-best" data-best><p class="hint">Working out the toe overlap…</p></div></div>`;
    }
    function render() {
      el.innerHTML = `<p class="lead">A 32" wheel and its long fork lift the front of the bike, and the bigger wheel needs more room in front of your toes. So the frame stack, reach and stem from your 29er don't carry across. What does carry across is where your <b>hands</b> sit relative to the cranks: this solver keeps that and works out the rest.</p>
        <div class="f32-grid"><div style="display:flex;flex-direction:column;gap:12px">${oldHtml()}${tabsHtml()}${controlsHtml()}</div>
        <div style="display:flex;flex-direction:column;gap:8px;position:sticky;top:0"><div class="f32-pic" data-pic></div>
          <div class="f32-key"><span><i style="border-color:var(--muted);border-top-style:dashed"></i>bike that fits you</span><span><i style="border-color:var(--accent)"></i>your 32er</span><span>✚ where your hands go</span></div>
          <p class="hint">Same scale for both bikes, lined up at the middle of the cranks. The circle round the BB is your crank and pedal.</p></div></div>`;
      bind(); update();
    }
    function bind() {
      el.querySelectorAll("[data-old]").forEach(inp => inp.addEventListener("input", () => {
        const k = inp.dataset.old; st.old[k] = k === "barType" ? inp.value : num(inp.value, st.old[k]);
        saveOld(st.old); update();
      }));
      const cp = el.querySelector("[data-copy]");
      if (cp) cp.onchange = () => { const x = designs.find(y => y.id === cp.value); if (!x) return; st.old = oldFromDesign(x.design, x.name); saveOld(st.old); render(); };
      el.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { st.mode = b.dataset.mode; render(); });
      el.querySelectorAll("[data-by]").forEach(b => b.onclick = () => { st.by = b.dataset.by; render(); });
      el.querySelectorAll("[data-sl]").forEach(s => s.addEventListener("input", () => { (st.mode === "cockpit" ? st.ck : st.fr)[s.dataset.sl] = +s.value; update(); }));
    }
    const setOut = (k, v, u) => { const o = el.querySelector(`[data-out="${k}"]`); if (o) o.textContent = `${v} ${u}`; };
    const box = (label, val, note, cls) => `<div class="${cls || ""}"><span>${esc(label)}</span><b>${val}</b>${note ? `<small>${note}</small>` : ""}</div>`;
    const msg = (cls, html) => `<p class="f32-msg ${cls}">${html}</p>`;

    function update() {
      const T = target(), hands = el.querySelector("[data-hands]");
      if (hands) hands.textContent = `${r0(T[0])} mm ahead and ${r0(T[1])} mm up`;
      const R = st.mode === "cockpit" ? updateCockpit(T) : updateFrame(T);
      last = R;
      el.querySelector("[data-pic]").innerHTML = picture(R, T);
      if (opts.onChange) try { opts.onChange(R); } catch (e) {}
    }
    // ---- keep the frame, solve the cockpit
    function updateCockpit(T) {
      const c = st.ck, frame = { reach: F.reach, stack: F.stack, headAngle: F.headAngle };
      setOut("stemLength", c.stemLength, "mm"); setOut("stemRise", sgn(c.stemRise), "°"); setOut("barRise", c.barRise, "mm");
      const ex = st.by === "length" ? solveAngle(frame, T, c.stemLength, c.barRise, c.barType) : solveLength(frame, T, c.stemRise, c.barRise, c.barType);
      const res = [], msgs = [];
      let real = null;
      if (st.by === "length" && !isFinite(ex.stemRise)) {
        res.push(box("Stem angle", "—", "no angle reaches", "bad"));
        msgs.push(msg("bad", ex.need > c.stemLength ? `A ${c.stemLength} mm stem can't reach: your hands need about <b>${r0(ex.need)} mm</b> of stem on this frame. Slide the stem longer.` : "No stem angle reaches from here. Try a longer stem."));
      } else {
        const ang = st.by === "length" ? ex.stemRise : c.stemRise, len = ex.stemLength, sp = ex.spacers;
        const lenBad = len < 30 || len > 140, spBad = sp < -0.5 || sp > LIMITS.spacersMax + 0.5, angBad = Math.abs(ang) > 40;
        res.push(st.by === "length" ? box("Stem angle needed", sgn(ang) + "°", Math.abs(ang) <= 17 ? "normal stems go to ±17°" : "a very steep stem", angBad ? "bad" : Math.abs(ang) > 17 ? "warn" : "ok")
          : box("Stem length needed", `${r0(len)} mm`, len < 35 ? "shorter than any road stem" : "", lenBad || len < 35 ? "bad" : "ok"));
        res.push(box("Spacers needed", `${r0(sp)} mm`, sp < 0 ? "below zero" : sp > 30 ? "a tall stack: check your fork's limit" : "", spBad ? "bad" : sp > 30 ? "warn" : "ok"));
        // nearest real parts
        const rr = nearest(STEM_ANGLES, ang), rl = st.by === "length" ? c.stemLength : nearest(STEM_LENGTHS, len);
        const fix = solveLength(frame, T, rr, c.barRise, c.barType), rs = Math.min(LIMITS.spacersMax, Math.max(0, Math.round(fix.spacers / 5) * 5));
        real = { stemLength: rl, stemRise: rr, spacers: rs, barRise: c.barRise, barType: c.barType };
        const h = handPoint(Object.assign({}, frame, real)), dx = h[0] - T[0], dy = h[1] - T[1], err = Math.hypot(dx, dy);
        real.err = err;
        res.push(box("With real parts", `${rl} mm · ${sgn(rr)}°`, `${rs} mm spacers${c.barRise ? `, ${c.barRise} mm bar rise` : ""}`, err <= LIMITS.match ? "ok" : err <= 15 ? "warn" : "bad"));
        res.push(box("Hands vs the bike that fits", err < 1 ? "spot on" : `${r0(err)} mm off`, err < 1 ? "" : `${Math.abs(r0(dx))} mm ${dx > 0 ? "further" : "closer"}, ${Math.abs(r0(dy))} mm ${dy > 0 ? "higher" : "lower"}`, err <= LIMITS.match ? "ok" : err <= 15 ? "warn" : "bad"));
        if (sp < -0.5) msgs.push(msg("bad", `Your bars sit <b>${r0(-sp)} mm too high</b> on this frame even with no spacers. Point the stem down more (a −17° stem), or lower the frame stack: the <b>Change the 32er frame</b> tab shows how far.`));
        if (sp > LIMITS.spacersMax + 0.5) msgs.push(msg("warn", `That needs ${r0(sp)} mm of spacers: more than most forks allow (${LIMITS.spacersMax}). Use a stem that points up, a riser bar, or a taller frame stack.`));
        if (st.by === "angle" && len < 35) msgs.push(msg("bad", `The frame reach (${r0(F.reach)} mm) is too long for your fit: your hands want a ${r0(len)} mm stem. A shorter frame reach, or a stem that points up, fixes it (watch the toe overlap).`));
        if (st.by === "length" && len < 35) msgs.push(msg("bad", "A stem under 35 mm only exists for downhill bikes."));
        const [lo, hi] = LIMITS.stem[kind] || LIMITS.stem.gravel;
        if (isFinite(len) && len >= 35 && (len < lo || len > hi)) msgs.push(msg("warn", `A ${r0(len)} mm stem works, but ${lo}–${hi} mm keeps a 32er's steering feeling natural. ${len < lo ? "A shorter frame reach would let you use a longer stem." : "A longer frame reach would let you use a shorter stem."}`));
        if (!msgs.length) msgs.push(msg("ok", "This frame fits you with an ordinary cockpit."));
      }
      el.querySelector("[data-res]").innerHTML = res.join(""); el.querySelector("[data-msgs]").innerHTML = msgs.join("");
      const best = bestCockpits(frame, T, c.barType, kind, 3), bb = el.querySelector("[data-best]");
      bb.innerHTML = best.length ? best.map((b, i) => `<button type="button" data-pickck="${i}"><b>${b.stemLength} mm stem at ${sgn(b.stemRise)}°</b>, ${b.spacers} mm spacers${b.barRise ? `, ${b.barRise} mm ${c.barType === "flat" ? "riser bar" : "rise drop bar"}` : ""}<br><span class="hint">hands ${b.err < 1 ? "spot on" : `within ${r0(b.err)} mm`}${b.stemLength < (LIMITS.stem[kind] || [0])[0] ? " · short stem" : ""}${Math.abs(b.stemRise) > 17 ? " · steep stem" : ""}</span></button>`).join("")
        : `<p class="f32-msg bad">No normal stem, spacer and bar combination gets your hands there on this frame (stems ${STEM_LENGTHS[0]}–${STEM_LENGTHS[STEM_LENGTHS.length - 1]} mm, ±35°, 0–${LIMITS.spacersMax} mm spacers). The frame has to change: try the <b>Change the 32er frame</b> tab.</p>`;
      bb.querySelectorAll("[data-pickck]").forEach(b => b.onclick = () => { const p = best[+b.dataset.pickck]; st.ck.stemLength = p.stemLength; st.ck.stemRise = p.stemRise; st.ck.barRise = p.barRise; st.by = "length"; render(); });
      const ckOut = real && real.err <= 15 ? real : null;
      const toe = toeAt(st.lim, F.fc);
      return { mode: "cockpit", frame: null, cockpit: ckOut, exact: ex, ok: !!ckOut && ckOut.err <= LIMITS.match, F, toe,
        draw: Object.assign({}, { reach: F.reach, stack: F.stack, headAngle: F.headAngle, headTube: F.headTube }, ckOut || { stemLength: c.stemLength, stemRise: isFinite(ex.stemRise) ? ex.stemRise : c.stemRise, spacers: Math.max(0, Math.min(60, ex.spacers || 0)), barRise: c.barRise, barType: c.barType }) };
    }
    // ---- keep the cockpit, solve the frame
    function updateFrame(T) {
      const c = st.fr;
      setOut("stemLength", c.stemLength, "mm"); setOut("stemRise", sgn(c.stemRise), "°"); setOut("spacers", c.spacers, "mm"); setOut("barRise", c.barRise, "mm");
      const fr = frameFor(T, c, F.headAngle), sinA = Math.sin(F.headAngle * D2R), tanA = Math.tan(F.headAngle * D2R);
      const ht = F.headTube + (fr.stack - F.stack) / sinA, fc = F.fc + (fr.reach - F.reach) + (fr.stack - F.stack) / tanA;
      const stackMin = F.stack + (LIMITS.headTubeMin - F.headTube) * sinA;
      if (st.lim === undefined) { st.lim = null; setTimeout(() => { st.lim = toeLimits(base); update(); }, 30); }   // the toe search takes a moment: show the rest first
      const toe = toeAt(st.lim, fc), res = [], msgs = [];
      const htBad = ht < LIMITS.headTubeMin, htWarn = ht > LIMITS.headTubeMax;
      res.push(box("Frame reach", `${r0(fr.reach)} mm`, `now ${r0(F.reach)} (${sgn(fr.reach - F.reach)})`));
      res.push(box("Frame stack", `${r0(fr.stack)} mm`, `now ${r0(F.stack)} (${sgn(fr.stack - F.stack)})`, htBad ? "bad" : ""));
      res.push(box("Head tube", `${r0(ht)} mm`, htBad ? `shortest a builder can do ≈ ${LIMITS.headTubeMin}` : `now ${r0(F.headTube)}`, htBad ? "bad" : htWarn ? "warn" : ""));
      res.push(box("Toe overlap", toe ? ({ ok: "OK", warn: "Slight", fail: "Yes" })[toe] : "…", toe ? esc(TOE_TXT[toe]) : "working it out", toe === "fail" ? "bad" : toe === "warn" ? "warn" : toe ? "ok" : ""));
      if (htBad) msgs.push(msg("bad", `The bars are too low for a 32er with this cockpit: the frame stack would have to be ${r0(fr.stack)} mm, but with a ${LIMITS.headTubeMin} mm head tube and this fork the lowest it goes is about <b>${r0(stackMin)} mm</b>. Point the stem down more, take out spacers, or accept bars ${r0(stackMin - fr.stack)} mm higher.`));
      if (toe === "fail" && st.lim && isFinite(st.lim.warn)) msgs.push(msg("bad", `Your toe will touch the front tyre in normal slow turns. It needs about <b>${r0(st.lim.warn - fc)} mm</b> more front-centre (${r0(st.lim.ok - fc)} mm for none at all): a longer frame reach with a <b>shorter stem</b> keeps your hands in the same place. (Shorter cranks, a steeper head angle or a narrower tyre help too.)`));
      else if (toe === "warn" && st.lim) msgs.push(msg("warn", `Your toe can touch in slow, tight turns (U-turns, switchbacks). About ${r0(st.lim.ok - fc)} mm more reach with a ${r0(st.lim.ok - fc)} mm shorter stem clears it.`));
      const [lo, hi] = LIMITS.stem[kind] || LIMITS.stem.gravel;
      if (c.stemLength < lo || c.stemLength > hi) msgs.push(msg("warn", `${lo}–${hi} mm stems keep a 32er's steering feeling natural.`));
      if (Math.abs(c.stemRise) > 17) msgs.push(msg("warn", "Stems steeper than ±17° are hard to find."));
      if (!msgs.length && toe) msgs.push(msg("ok", "This frame fits you, with no toe overlap and an ordinary cockpit."));
      el.querySelector("[data-res]").innerHTML = res.join(""); el.querySelector("[data-msgs]").innerHTML = msgs.join("");
      const bb = el.querySelector("[data-best]");
      if (st.lim !== undefined && st.lim !== null || !root.FrameToe) {
        const best = bestFrames(base, T, c.barType, c.barRise, 3).list;
        bb.innerHTML = best.length ? best.map((b, i) => `<button type="button" data-pickfr="${i}"><b>Reach ${r0(b.reach)} · stack ${r0(b.stack)}</b> with a ${b.stemLength} mm stem at ${sgn(b.stemRise)}°, ${b.spacers} mm spacers<br><span class="hint">head tube ${r0(b.headTube)} mm · ${b.toe ? esc(TOE_TXT[b.toe]).toLowerCase() : "toe overlap not checked"}</span></button>`).join("")
          : `<p class="f32-msg bad">No frame within the head-tube limits puts your hands there. Your fit is lower than a 32er with this fork can go.</p>`;
        bb.querySelectorAll("[data-pickfr]").forEach(b => b.onclick = () => { const p = best[+b.dataset.pickfr]; Object.assign(st.fr, { stemLength: p.stemLength, stemRise: p.stemRise, spacers: p.spacers }); render(); });
      }
      return { mode: "frame", frame: { reach: r1(fr.reach), stack: r1(fr.stack), headTube: r1(ht) }, cockpit: { stemLength: c.stemLength, stemRise: c.stemRise, spacers: c.spacers, barRise: c.barRise, barType: c.barType },
        ok: !htBad, toe, F, draw: { reach: fr.reach, stack: fr.stack, headAngle: F.headAngle, headTube: Math.max(ht, 20), stemLength: c.stemLength, stemRise: c.stemRise, spacers: c.spacers, barRise: c.barRise, barType: c.barType } };
    }

    // ---- side view: both bikes from the BB, same scale
    function picture(R, T) {
      const o = st.old, d = R.draw, po = points(o), pn = points(d);
      const u = upOf(d.headAngle), uo = upOf(o.headAngle);
      const htBot = [d.reach - u[0] * d.headTube, d.stack - u[1] * d.headTube];
      // the 32er's fork and wheel, moved with its head tube (fork length and offset don't change)
      const dyStack = d.stack - F.stack, dxReach = d.reach - F.reach, tanA = Math.tan(F.headAngle * D2R);
      const ax = [F.fc + dxReach + dyStack / tanA, F.axleY], Rw = F.R;
      const crownLen = (num(base.geometry.lowerCupStack, 0) + F.forkA2C);
      const crown = [htBot[0] - u[0] * num(base.geometry.lowerCupStack, 0), htBot[1] - u[1] * num(base.geometry.lowerCupStack, 0)];
      const crownBot = [crown[0] - u[0] * 30, crown[1] - u[1] * 30];
      const oldHtBot = [o.reach - uo[0] * 140, o.stack - uo[1] * 140];
      // view box: from behind the BB to in front of the wheel
      const xs = [-200, ax[0] + Rw * 0.35, po.hand[0], pn.hand[0], T[0]], ys = [-200, po.hand[1], pn.hand[1], T[1], ax[1] + Rw * 0.2];
      const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 20, y1 = Math.max(...ys) + 40;
      const W = 520, sc = W / (x1 - x0), Hh = (y1 - y0) * sc;
      const X = p => ((p[0] - x0) * sc).toFixed(1), Y = p => ((y1 - p[1]) * sc).toFixed(1);
      const ln = (a, b, col, w, dash) => `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
      const dot = (p, r, col) => `<circle cx="${X(p)}" cy="${Y(p)}" r="${r}" fill="${col}"/>`;
      const txt = (p, s, col, anchor, dy) => `<text x="${X(p)}" y="${(+Y(p) + (dy || 0)).toFixed(1)}" fill="${col}" font-size="11" text-anchor="${anchor || "start"}" font-family="var(--font-body)">${esc(s)}</text>`;
      const A = "var(--accent)", G = "var(--muted)";
      let s = `<svg viewBox="0 0 ${W} ${Hh.toFixed(0)}" role="img" aria-label="Side view: the bike that fits you and the 32er, lined up at the cranks">`;
      // ground under the 32er's wheel, wheel, fork
      s += `<circle cx="${X(ax)}" cy="${Y(ax)}" r="${(Rw * sc).toFixed(1)}" fill="none" stroke="var(--wheel, ${G})" stroke-width="5" opacity=".35"/>`;
      s += ln(crownBot, crown, A, 5) + ln(crownBot, ax, A, 3.5);
      // cranks
      s += `<circle cx="${X([0, 0])}" cy="${Y([0, 0])}" r="${(F.crank * sc).toFixed(1)}" fill="none" stroke="${G}" stroke-width="1" stroke-dasharray="3 3"/>` + dot([0, 0], 4, "var(--ink)");
      // the old bike: down tube, head tube top, steerer, stem, bar
      s += ln([0, 0], oldHtBot, G, 2, "5 4") + ln(oldHtBot, po.H, G, 4, "5 4") + ln(po.H, po.stemTop, G, 3, "5 4") + ln(po.stemC, po.clamp, G, 3, "5 4") + ln(po.clamp, po.hand, G, 2, "2 3") + dot(po.clamp, 3, G);
      // the 32er
      s += ln([0, 0], htBot, A, 3) + ln(htBot, pn.H, A, 6) + ln(pn.H, pn.stemTop, A, 3.5) + ln(pn.stemC, pn.clamp, A, 4) + ln(pn.clamp, pn.hand, A, 2, "2 3") + dot(pn.clamp, 3.5, A);
      // hands target
      const t = [X(T), Y(T)];
      s += `<g stroke="var(--ink)" stroke-width="1.6"><line x1="${t[0] - 9}" y1="${t[1]}" x2="${+t[0] + 9}" y2="${t[1]}"/><line x1="${t[0]}" y1="${t[1] - 9}" x2="${t[0]}" y2="${+t[1] + 9}"/></g>`;
      s += dot(pn.hand, 4, A) + txt(T, "hands", "var(--ink)", "middle", -13);
      s += txt([0, 0], "BB", "var(--ink)", "end", 16) + txt([0, 0], " ", G);
      s += txt(ax, R.toe ? ({ ok: "toe: clear", warn: "toe: slight overlap", fail: "toe: overlaps" })[R.toe] : "", R.toe === "fail" ? "var(--bad)" : R.toe === "warn" ? "var(--warn)" : G, "middle", 4);
      return s + `</svg>`;
    }

    render();
    return { result: () => last, state: () => st, rerender: render };
  }

  // ---------------------------------------------------------------- in the app: a window for the open 32er (step 2 box, chat)
  let dlg = null, mounted = null;
  function open(mode) {
    const App = root.CyclicLabsApp; if (!App) return;
    const d = App.design();
    addCss();
    if (!dlg) { dlg = document.createElement("dialog"); dlg.className = "f32"; dlg.setAttribute("aria-label", "32er fit solver"); document.body.appendChild(dlg); }
    let designs = []; try { designs = App.allDesigns().filter(x => x.id !== App.currentId()); } catch (e) {}
    dlg.innerHTML = `<div class="f32-wrap"><div class="f32-head"><h2>Match my 29er fit on this 32er</h2><button type="button" data-x>Close</button></div>
      <div class="f32-body" data-mount></div>
      <div class="f32-foot"><span class="hint" data-sum></span><span class="grow"></span><button type="button" data-x>Cancel</button><button type="button" class="primary" data-use>Use on my 32er</button></div></div>`;
    dlg.querySelectorAll("[data-x]").forEach(b => b.onclick = () => dlg.close());
    if (!is32(d)) dlg.querySelector("[data-mount]").innerHTML = `<p class="lead">This bike doesn't have 32" wheels. Pick 32" wheels first (Wheels box, or start a new bike), then come back.</p>`;
    else mounted = mount(dlg.querySelector("[data-mount]"), { base: d, modes: ["cockpit", "frame"], mode, designs,
      onChange: R => { const b = dlg.querySelector("[data-use]"), sm = dlg.querySelector("[data-sum]");
        b.disabled = R.mode === "cockpit" ? !R.cockpit : !R.ok;
        b.textContent = R.mode === "cockpit" ? "Use this cockpit" : "Use this frame + cockpit";
        sm.textContent = R.mode === "cockpit" ? (R.cockpit ? `Sets the stem to ${R.cockpit.stemLength} mm at ${sgn(R.cockpit.stemRise)}°, ${R.cockpit.spacers} mm spacers.` : "")
          : R.ok ? `Sets reach ${r0(R.frame.reach)}, stack ${r0(R.frame.stack)}, head tube ${r0(R.frame.headTube)} and the stem.` : ""; } });
    if (!is32(d)) dlg.querySelector("[data-use]").hidden = true;
    dlg.querySelector("[data-use]").onclick = () => { const R = mounted && mounted.result(); if (!R) return; apply(App.design(), R); App.refresh(); dlg.close();
      App.toast(R.mode === "cockpit" ? `Cockpit set: ${R.cockpit.stemLength} mm stem at ${sgn(R.cockpit.stemRise)}°, ${R.cockpit.spacers} mm spacers.` : `Frame set to reach ${r0(R.frame.reach)} / stack ${r0(R.frame.stack)} with a ${R.cockpit.stemLength} mm stem.`); };
    if (!dlg.open) dlg.showModal();
  }
  // write a solver result onto a design (frame numbers + the cockpit; with a library cockpit picked, as that part's adjustments)
  function apply(d, R) {
    if (R.frame) {
      const c = withFrame(d, R.frame.reach, R.frame.stack).geometry;
      for (const k of ["reach", "stack", "headTube", "ttBelowHtTop", "dtAboveHtBottom"]) d.geometry[k] = c[k];
    }
    const ck = R.cockpit; if (!ck) return d;
    const p = d.parts = d.parts || {};
    const vals = { stemLength: ck.stemLength, stemRise: ck.stemRise, spacers: ck.spacers };
    if (ck.barType === "flat") vals.barRise = ck.barRise;
    Object.assign(p, vals);
    if (p.sel && p.sel.cockpit) { p.adj = p.adj || {}; const a = p.adj.cockpit = p.adj.cockpit || {}; Object.assign(a, vals); if (ck.barType !== "flat") a.dropRise = ck.barRise; }
    return d;
  }
  // the S.values a new-bike walkthrough needs for a solver result (newbike.js setPath()s these onto its design)
  function values(R, d) {
    const v = {}, ck = R.cockpit;
    if (R.frame) { v["geometry.reach"] = R.frame.reach; v["geometry.stack"] = R.frame.stack; v["geometry.headTube"] = R.frame.headTube; }
    if (ck) {
      const lib = !!(d && d.parts && d.parts.sel && d.parts.sel.cockpit), pre = lib ? "parts.adj.cockpit." : "parts.";
      v[pre + "stemLength"] = ck.stemLength; v[pre + "stemRise"] = ck.stemRise; v[pre + "spacers"] = ck.spacers;
      if (ck.barType === "flat") v[pre + "barRise"] = ck.barRise; else if (lib) v[pre + "dropRise"] = ck.barRise;
    }
    return v;
  }

  // ---------------------------------------------------------------- design chat: "match my 29er fit"
  function chat(raw, text) {
    const t = String(text || raw || "").toLowerCase();
    const solver = /\b(32er |32 ?(in|inch|") )?(fit|cockpit|stem) solver\b/.test(t);
    const ask = /\b(fit|position|cockpit|hands?|bar position|match|copy|convert|transfer)\b/.test(t) && /\b(29ers?|29|700 ?c|old bike|current bike|other bike|bike that fits)\b/.test(t) && /\b32(ers?)?\b|\b32 ?(in|inch)|32"/.test(t);
    if (!solver && !ask) return null;
    const App = root.CyclicLabsApp; if (!App || !is32(App.design())) return "The 32er fit solver works on a bike with 32\" wheels. Open (or start) a 32\" bike first, then ask again — or use **New bike → 32 in wheels → Match a bike I already ride**.";
    setTimeout(() => open(/\bframe\b|stack|reach/.test(t) ? "frame" : "cockpit"), 0);
    return "Opened the **32er fit solver**: type the stack, reach and cockpit of the bike that fits you, then slide the stem to see what the 32er needs (or switch to *Change the 32er frame*).";
  }
  // early: before the wheel-size handlers read "29er … 32er" as "change the wheels"
  if (root.FrameChat) root.FrameChat.early = [chat].concat(root.FrameChat.early || []);

  root.FrameFit32 = { open, mount, apply, values, chat, is32, points, handPoint, solveLength, solveAngle, frameFor, bestCockpits, bestFrames, toeLimits, frameOf, cockpitOf, withFrame,
    STEM_ANGLES, STEM_LENGTHS, RISES, HAND, LIMITS };
  if (typeof module !== "undefined" && module.exports) module.exports = root.FrameFit32;
})(typeof window !== "undefined" ? window : globalThis);
