// ============================================================================
//  BIKE-FIT REPORT READER (fitreport.js)  —  "start from my Retül fit"
//
//  A bike fit (Retül is the most common; Guru, Shimano and others print the
//  same kind of sheet) measures where the rider's contact points are:
//    saddle  — saddle height + effective seat angle (both measured from the BB)
//    hands   — handlebar stack + reach (BB to the centre of the bar clamp)
//    cranks  — crank length
//  plus the cockpit on the bike that was fitted (stem, spacers, bars).
//  Those points don't depend on the frame, so they are the best possible
//  starting point for a new one: choose the stem and spacers you want and the
//  frame reach / stack / head tube / seat angle that put your saddle and bars
//  in exactly the same place fall straight out.
//
//  Reading: the PDF's own text is read with pdf.js (vendor/pdf.js, already
//  shipped for the drawing scanner), right on this computer. Each number is
//  recognised by its label AND the little description printed under it,
//  because Retül prints "Handlebar Reach" twice (saddle → bar and BB → bar).
//  Copied/pasted report text works too (parseText).
//  Privacy: the rider's name, phone, e-mail, age and the fitter's details are
//  never kept — only the bike numbers, the fitted bike's make/type and the date.
//
//  To teach it a new label (another fit system), add a line to LABELS below.
//  Units: mm and degrees. BB centre = origin, x forward, y up.
// ============================================================================
(function (root) {
  "use strict";
  const D2R = Math.PI / 180;
  const r1 = v => Math.round(v * 10) / 10;
  const half = v => Math.round(v * 2) / 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------------------- what each number means
  // id → [plain label, unit, explanation shown in the app]
  const FIELDS = {
    saddleHeight: ["Saddle height", "mm", "BB centre to the middle of the saddle, along the line to the saddle."],
    esta:         ["Effective seat angle", "°", "Angle of the line from the BB to the middle of the saddle. Sets how far behind the cranks you sit."],
    crank:        ["Crank length", "mm", "Length of the crank arms you were fitted on."],
    barStack:     ["Handlebar stack", "mm", "Straight up from the BB to the centre of the handlebar clamp."],
    barReach:     ["Handlebar reach", "mm", "Straight forward from the BB to the centre of the handlebar clamp."],
    saddleToBar:  ["Saddle to bar reach", "mm", "Saddle tip to the top of the bar, measured flat."],
    barDrop:      ["Saddle to bar drop", "mm", "How far the bar top sits below the saddle (negative = below)."],
    saddleNose:   ["Saddle setback (nose)", "mm", "Saddle tip behind the BB (negative = behind)."],
    saddleTilt:   ["Saddle tilt", "°", "Saddle angle to level (negative = nose down)."],
    gripReach:    ["Saddle to hoods reach", "mm", "Saddle tip to the hoods (where your hands rest), flat."],
    gripDrop:     ["Saddle to hoods drop", "mm", "Saddle to the hoods, up/down."],
    bbGripReach:  ["BB to hoods", "mm", "Straight-line distance BB to the hoods."],
    gripWidth:    ["Hood width", "mm", "Hood centre to hood centre."],
    gripAngle:    ["Hood angle", "°", "Hood angle to level."],
    frameStack:   ["Fitted bike: frame stack", "mm", "Stack of the frame you were fitted on (for comparison only)."],
    frameReach:   ["Fitted bike: frame reach", "mm", "Reach of the frame you were fitted on (for comparison only)."],
    stemLen:      ["Fitted bike: stem length", "mm", "Stem on the fitted bike."],
    stemRise:     ["Fitted bike: stem angle", "°", "Stem angle on the fitted bike (−6 is the usual 'flat' road stem)."],
    spacers:      ["Fitted bike: spacers", "mm", "Spacers under the stem on the fitted bike."],
    barWidth:     ["Fitted bike: bar width", "mm", "Handlebar width."]
  };

  // label (lower case, spaces squeezed) → field id; a function decides from the description under the number
  const LABELS = [
    [/^saddle height$/, "saddleHeight"],
    [/^saddle set ?back$/, "saddleNose"],
    [/^saddle (angle|tilt)$/, "saddleTilt"],
    [/^eff(ective|\.)? ?seat ?(tube )?angle$|^seat angle \(eff/, "esta"],
    [/^(handle ?bar|bar) stack$/, "barStack"],
    [/^(handle ?bar|bar) reach$/, d => /\bbb\b|bottom bracket/.test(d) ? "barReach" : /saddle/.test(d) ? "saddleToBar" : "?reach"],
    [/^saddle to (handle ?)?bar reach$/, "saddleToBar"],
    [/^(handle ?bar|bar|saddle to (handle ?)?bar) drop$/, "barDrop"],
    [/^bb to (handle ?)?bar reach$/, "barReach"],
    [/^bb to (handle ?)?bar stack$/, "barStack"],
    [/^grip reach$|^hood reach$/, "gripReach"],
    [/^grip drop$|^hood drop$/, "gripDrop"],
    [/^bb to (grip|hood) reach$/, "bbGripReach"],
    [/^(grip|hood) width$/, "gripWidth"],
    [/^(grip|hood) angle$/, "gripAngle"],
    [/^frame stack$/, "frameStack"],
    [/^frame reach$/, "frameReach"],
    [/^crank( arm)? length$/, "crank"],
    [/^stem length$/, "stemLen"],
    [/^stem (angle|rise)$/, "stemRise"],
    [/^(spacers?|spacer stack|headset spacers)$/, "spacers"],
    [/^(bar|handle ?bar) width$/, "barWidth"]
  ];

  // ---------------------------------------------------------------- reading
  const MEASURE = /^\s*([A-Za-z][A-Za-z .()\/-]*?)\s*:\s*(-?\d+(?:[.,]\d+)?)\s*(mm|cm|in|"|°|deg|degrees)?\s*$/i;
  const toMM = (v, u) => /^cm$/i.test(u || "") ? v * 10 : /^(in|")$/i.test(u || "") ? v * 25.4 : v;
  const squeeze = s => String(s).toLowerCase().replace(/\s+/g, " ").trim();
  const numIn = s => { const m = String(s).replace(",", ".").match(/-?\d+(?:\.\d+)?/); return m ? +m[0] : NaN; };

  // items: [{ p: page, x, y (up), s: text }] — pdf.js text items or columns cut from pasted text
  function parseItems(items, tolX) {
    tolX = tolX || 5;
    const its = items.filter(i => String(i.s).trim()).map(i => Object.assign({}, i, { s: String(i.s).replace(/\s+/g, " ").trim() }))
      .sort((a, b) => a.p - b.p || b.y - a.y || a.x - b.x);
    // join a label item with a number sitting just to its right on the same line ("Saddle Height:" "777 mm")
    for (let i = 0; i < its.length - 1; i++) {
      const a = its[i], b = its[i + 1];
      if (/:\s*$/.test(a.s) && a.p === b.p && Math.abs(a.y - b.y) < 3 && /^-?\d/.test(b.s)) { a.s += " " + b.s; b.s = ""; }
    }
    const measures = [];
    its.forEach((it, k) => { const m = it.s && it.s.match(MEASURE); if (m) measures.push({ k, it, label: squeeze(m[1]), v: toMM(+m[2].replace(",", "."), m[3]), unit: m[3] || "" }); });
    // description = the lines right under a number in the same column, until the next number in that column
    for (const m of measures) {
      const below = its.filter(o => o.s && o.p === m.it.p && Math.abs(o.x - m.it.x) <= tolX && o.y < m.it.y && m.it.y - o.y < 40);
      const desc = [];
      for (const o of below) { if (MEASURE.test(o.s)) break; desc.push(o.s); }
      m.desc = squeeze(desc.join(" "));
    }
    const out = { values: {}, raw: [], bike: {}, cockpit: {} };
    const pending = [];
    for (const m of measures) {
      let id = null;
      for (const [re, f] of LABELS) if (re.test(m.label)) { id = typeof f === "function" ? f(m.desc) : f; break; }
      out.raw.push({ label: m.label, value: m.v, desc: m.desc, id });
      if (!id) continue;
      if (id === "?reach") { pending.push(m); continue; }
      if (out.values[id] == null) out.values[id] = r1(m.v);
    }
    // "Handlebar Reach" printed without a description: the one next to "Handlebar Stack" is measured from the BB
    if (pending.length) {
      const st = measures.find(m => /stack$/.test(m.label) && /bar/.test(m.label));
      pending.sort((a, b) => st ? Math.hypot(a.it.x - st.it.x, a.it.y - st.it.y) - Math.hypot(b.it.x - st.it.x, b.it.y - st.it.y) : 0);
      pending.forEach((m, i) => { const id = i === 0 && out.values.barReach == null ? "barReach" : "saddleToBar"; if (out.values[id] == null) out.values[id] = r1(m.v); });
    }
    // components table (Retül): a row of capital headings with the values on the line below
    const HEAD = { "STEM": "stem", "SPACER STACK": "spacers", "SPACERS": "spacers", "CRANK LENGTH": "crank", "CRANKS": "crank", "PEDALS": "pedals", "SADDLE": "saddle", "BARS": "bars", "HANDLEBARS": "bars", "SHOES": "shoes" };
    for (const h of its) {
      const key = HEAD[h.s.toUpperCase()]; if (!key || h.s !== h.s.toUpperCase()) continue;
      const v = its.find(o => o.s && o !== h && o.p === h.p && Math.abs(o.x - h.x) <= tolX && o.y < h.y && h.y - o.y < 25);
      if (!v || HEAD[v.s.toUpperCase()]) continue;
      out.cockpit[key] = v.s;
    }
    const ck = out.cockpit, V = out.values;
    if (ck.stem) {   // "-6 ° x 90 mm", "90mm -6°", "90 x -6"
      const s = ck.stem.replace(",", "."), deg = s.match(/(-?\+?\d+(?:\.\d+)?)\s*(°|deg)/i), mm = s.match(/(\d+(?:\.\d+)?)\s*mm/i);
      if (mm && V.stemLen == null) V.stemLen = +mm[1];
      if (deg && V.stemRise == null) V.stemRise = +deg[1];
      if (!mm || !deg) { const ns = (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); for (const n of ns) { if (n >= 30 && V.stemLen == null) V.stemLen = n; else if (Math.abs(n) <= 45 && V.stemRise == null && n < 30) V.stemRise = n; } }
    }
    if (ck.spacers && V.spacers == null && isFinite(numIn(ck.spacers))) V.spacers = numIn(ck.spacers);
    if (ck.crank && V.crank == null && isFinite(numIn(ck.crank))) V.crank = numIn(ck.crank);
    if (ck.bars && V.barWidth == null) { const m = ck.bars.replace(",", ".").match(/(\d{2}(?:\.\d)?)\s*cm|(\d{3})\s*mm/i); if (m) V.barWidth = m[1] ? +m[1] * 10 : +m[2]; }
    // the fitted bike: "MAKE/MODEL:" "BRAND," …  (value is the next item on the same line)
    const after = re => { const i = its.findIndex(o => re.test(o.s)); if (i < 0) return ""; const m = its[i].s.match(/:\s*(.+)$/); if (m && m[1].trim()) return m[1].trim();
      const n = its.filter(o => o.s && o !== its[i] && o.p === its[i].p && Math.abs(o.y - its[i].y) < 3 && o.x > its[i].x).sort((a, b) => a.x - b.x)[0]; return n ? n.s : ""; };
    const bk = out.bike;
    bk.model = after(/^make ?\/ ?model\s*:?/i).replace(/,\s*$/, "");
    bk.type = after(/^type\s*:?/i); bk.year = after(/^year\s*:?/i); bk.size = after(/^size\s*:?/i);
    if (/no size/i.test(bk.size)) bk.size = "";
    const all = its.map(o => o.s).join("\n");
    const dt = all.match(/\b(20\d\d-\d\d-\d\d)\b/) || all.match(/\b(\d{1,2}\/\d{1,2}\/20\d\d)\b/); out.date = dt ? dt[1] : "";
    out.system = /ret[uü]l|zin report/i.test(all) ? "Retül" : /guru/i.test(all) ? "Guru" : /shimano/i.test(all) && /fit/i.test(all) ? "Shimano" : "bike fit";
    out.ok = V.saddleHeight != null;
    return out;
  }

  // pasted text: each line is cut into columns at runs of 2+ spaces (keeps a two-column report apart)
  function parseText(text) {
    const items = [];
    String(text || "").replace(/\r/g, "").split("\n").forEach((line, row) => {
      const re = /\S(?:.*?\S)?(?= {2,}|\t|$)/g; let m;
      while ((m = re.exec(line))) items.push({ p: 1, x: m.index, y: -row * 10, s: m[0] });
    });
    return parseItems(items, 6);
  }

  // a File (PDF) → parse result. Uses the pdf.js that ships in vendor/ (loaded on demand, no internet)
  function loadScript(rel) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[data-fr="${rel}"]`) || (rel.endsWith("pdf.js") && root.pdfjsLib)) return res();
      const s = document.createElement("script"); s.src = rel; s.dataset.fr = rel; s.onload = () => res(); s.onerror = () => rej(new Error("Couldn't load " + rel));
      document.head.appendChild(s);
    });
  }
  async function readFile(file) {
    if (/\.(txt|text|csv)$/i.test(file.name || "") || /^text\//.test(file.type || "")) return parseText(await file.text());
    if (!/\.pdf$/i.test(file.name || "") && file.type !== "application/pdf") throw new Error("Use the PDF your fitter sent (or copy its text and paste it in). Photos of a fit sheet: type the numbers in instead.");
    if (!root.pdfjsLib) { await loadScript("vendor/pdf.worker.js"); await loadScript("vendor/pdf.js"); }
    const lib = root.pdfjsLib;
    const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }), doc = await task.promise;
    const items = [];
    for (let p = 1; p <= Math.min(doc.numPages, 8); p++) {
      const pg = await doc.getPage(p), tc = await pg.getTextContent();
      for (const it of tc.items) if (it.str && it.str.trim()) items.push({ p, x: it.transform[4], y: it.transform[5], s: it.str });
    }
    try { await task.destroy(); } catch (e) {}
    if (!items.length) throw new Error("That PDF has no text in it (it's probably a scan or photo). Type the numbers in instead.");
    return parseItems(items, 5);
  }

  // ---------------------------------------------------------------- geometry from the fit
  // same cockpit rule as parts.js / fitgen.js: 8 mm top cap, spacers, half a 40 mm stem clamp, then the stem
  function barOffset(hta, spacers, stemLen, stemRise) {
    const a = hta * D2R, up = [-Math.cos(a), Math.sin(a)], nF = [Math.sin(a), Math.cos(a)], r = stemRise * D2R;
    const h = 8 + spacers + 20;
    return [up[0] * h + stemLen * (nF[0] * Math.cos(r) + up[0] * Math.sin(r)), up[1] * h + stemLen * (nF[1] * Math.cos(r) + up[1] * Math.sin(r))];
  }
  // frame stack for a head tube (bike standing level: front axle at BB-drop height) and the other way round
  const stackOf = (hta, ht, lc, a2c, off, drop) => (ht + lc + a2c) * Math.sin(hta * D2R) - off * Math.cos(hta * D2R) + drop;
  const headTubeFor = (stack, hta, lc, a2c, off, drop) => (stack - drop + off * Math.cos(hta * D2R)) / Math.sin(hta * D2R) - lc - a2c;

  const SEAT_RANGE = { road: [72, 76.5], gravel: [71.5, 76.5], mtb: [73, 78] };
  const HT_MIN = 90, HT_MAX = 260;

  // the template size whose saddle height is closest (pick it BEFORE building the template you pass in as ctx.g)
  function sizeFor(SH, sizes) { return Object.keys(sizes || {}).reduce((a, b) => a == null || Math.abs(sizes[b].saddleHeight - SH) < Math.abs(sizes[a].saddleHeight - SH) ? b : a, null) || "M"; }

  // fit: parse result .values (+ .bike); ctx: { type, g: template geometry, sizes: template sizes, parts: template parts,
  //   stem, rise, spacers (cockpit on the NEW bike; blank = from the fit), relax (bars 15 mm up, 10 mm closer) }
  // → { values: {path: number}, size, bar, notes[], warnings[], cockpit, frame }
  function toGeometry(fit, ctx) {
    const V = fit.values || fit, g = ctx.g, type = ctx.type || "gravel", notes = [], warnings = [];
    if (!(V.saddleHeight > 400 && V.saddleHeight < 1100)) throw new Error("The fit report needs a saddle height (BB to saddle) to start from.");
    const SH = V.saddleHeight, hta = g.headAngle;
    const has = v => v != null && v !== "" && isFinite(v);
    // --- where you sit
    let esta = has(V.esta) ? +V.esta : null;
    if (esta == null) { esta = g.seatAngle; notes.push(`No effective seat angle in the report: used ${esta}° (typical for this bike). Type the one from your fit if you have it.`); }
    const rg = SEAT_RANGE[type] || SEAT_RANGE.gravel;
    const sa = type === "mtb" ? g.seatAngle : clamp(half(esta), rg[0], rg[1]);
    // saddle-top height stays the same; the saddle slides on its rails for whatever the frame angle doesn't give
    const shFrame = Math.round(SH * Math.sin(esta * D2R) / Math.sin(sa * D2R));
    const saddleStack = has(g.saddleStack) ? +g.saddleStack : 45;
    let setback = Math.round(SH * Math.cos(esta * D2R) - (shFrame - saddleStack / Math.sin(sa * D2R)) * Math.cos(sa * D2R));
    if (type === "mtb") { setback = has(g.saddleSetback) ? g.saddleSetback : 45; notes.push(`Mountain bike: the seat angle stays at a normal ${sa}° (steep, for climbing with a dropper); only your saddle height carries over from the fit.`); }
    else if (sa !== half(esta)) notes.push(`Your fitted seat angle (${esta}°) is outside what's normal for this kind of frame, so the frame gets ${sa}° and the saddle slides on its rails/post to put you in the same place.`);
    if (setback < -15) warnings.push(`To sit where your fit puts you, the saddle has to sit ${-setback} mm ahead of the seatpost clamp: steepen the seat angle a little.`);
    if (setback > 85) warnings.push(`To sit where your fit puts you, the saddle needs ${setback} mm of setback (a layback post): slacken the seat angle a little.`);
    const crank = has(V.crank) ? +V.crank : g.crankLength;
    // template size for the parts and for anything the fit doesn't say: closest saddle height
    const sizes = ctx.sizes || {};
    const size = sizeFor(SH, sizes);
    const zs = sizes[size] || {};
    const seatTube = Math.max(380, Math.round(shFrame - ((zs.saddleHeight || 720) - (zs.seatTube || 520))));
    const values = { "geometry.saddleHeight": shFrame, "geometry.seatAngle": sa, "geometry.saddleSetback": setback, "geometry.crankLength": crank, "geometry.seatTube": seatTube };

    // --- where your hands go
    let bar = null, barFrom = "";
    if (has(V.barStack) && has(V.barReach)) { bar = [+V.barReach, +V.barStack]; barFrom = "the report's handlebar stack and reach"; }
    else if (has(V.frameStack) && has(V.frameReach) && has(V.stemLen)) {
      const o = barOffset(73, has(V.spacers) ? +V.spacers : 15, +V.stemLen, has(V.stemRise) ? +V.stemRise : -6);
      bar = [+V.frameReach + o[0], +V.frameStack + o[1]]; barFrom = "the fitted bike's frame stack, reach and stem (head angle assumed 73°)";
      notes.push("The report has no BB-to-bar numbers, so the bar position was worked out from the fitted bike's frame and stem (assuming a 73° head angle). Within a few mm.");
    }
    const cockpit = {
      stem: has(ctx.stem) ? +ctx.stem : has(V.stemLen) ? +V.stemLen : (ctx.parts || {}).stemLength || 80,
      rise: has(ctx.rise) ? +ctx.rise : has(V.stemRise) ? +V.stemRise : (ctx.parts || {}).stemRise != null ? ctx.parts.stemRise : -6,
      spacers: has(ctx.spacers) ? +ctx.spacers : has(V.spacers) ? clamp(+V.spacers, 10, 20) : 15
    };
    if (!has(ctx.spacers) && has(V.spacers) && +V.spacers > 20)
      notes.push(`Your fitted bike runs ${V.spacers} mm of spacers. On a custom frame that height goes into the head tube instead, keeping ${cockpit.spacers} mm of spacers so you can still fine-tune up or down.`);
    let frame = null;
    if (type === "mtb" || !bar) {
      if (!bar) warnings.push("No handlebar position in the report: reach and stack stay typical for your size. Type the handlebar stack and reach (BB to the centre of the bar) if your fitter gave them.");
      else notes.push("Mountain bike: a drop-bar fit doesn't carry over to flat bars, so reach and stack are typical for your size (picked from your saddle height). Ask your fitter for an MTB position to match it exactly.");
      Object.assign(values, { "geometry.reach": zs.reach || g.reach, "geometry.stack": zs.stack || g.stack, "geometry.headTube": zs.headTube || g.headTube });
    } else {
      const target = ctx.relax ? [bar[0] - 10, bar[1] + 15] : bar.slice();
      if (ctx.relax) notes.push("Bars set 15 mm higher and 10 mm closer than the fit (a common, slightly more relaxed starting point for gravel and long days).");
      const lc = +g.lowerCupStack || 0, a2c = g.forkA2C, off = g.forkOffset, drop = g.bbDrop;
      const solve = () => { const o = barOffset(hta, cockpit.spacers, cockpit.stem, cockpit.rise), reach = target[0] - o[0], stack = target[1] - o[1];
        return { reach, stack, ht: headTubeFor(stack, hta, lc, a2c, off, drop) }; };
      let f = solve(), moved = [];
      // bars lower than this fork allows: take spacers out, then a steeper (−17°) stem
      while (f.ht < HT_MIN && cockpit.spacers > 5) { cockpit.spacers -= 5; f = solve(); moved.push("spacers"); }
      if (f.ht < HT_MIN && cockpit.rise > -17) { cockpit.rise = -17; f = solve(); moved.push("stem"); }
      if (moved.length) notes.push(`Your bars sit low for this fork, so the cockpit was changed to ${cockpit.spacers} mm of spacers${moved.includes("stem") ? " and a −17° stem" : ""} to keep a buildable head tube.`);
      let high = 0;
      if (f.ht < HT_MIN) { const st = stackOf(hta, HT_MIN, lc, a2c, off, drop); high = st - f.stack; f = { reach: f.reach, stack: st, ht: HT_MIN };
        warnings.push(`Even with a slammed −17° stem the shortest head tube (${HT_MIN} mm) puts your bars ${Math.round(high)} mm higher than your fit with this fork. A shorter fork, or living with slightly higher bars, fixes it.`); }
      if (f.ht > HT_MAX) warnings.push(`That needs a very tall ${Math.round(f.ht)} mm head tube: a stem flipped up (+6°) or more spacers would shorten it.`);
      if (f.reach < 300 || f.reach > 520) warnings.push(`Frame reach comes out at ${Math.round(f.reach)} mm, which is unusual: try a ${f.reach < 300 ? "shorter" : "longer"} stem.`);
      frame = { reach: Math.round(f.reach), stack: Math.round(f.stack), headTube: Math.round(f.ht), high: Math.round(high) };
      Object.assign(values, { "geometry.reach": frame.reach, "geometry.stack": frame.stack, "geometry.headTube": frame.headTube });
    }
    values["parts.stemLength"] = cockpit.stem; values["parts.stemRise"] = cockpit.rise; values["parts.spacers"] = cockpit.spacers;
    if (type !== "mtb" && has(V.barWidth) && V.barWidth >= 340 && V.barWidth <= 560) values["parts.barWidth"] = +V.barWidth;
    return { values, size, bar, barFrom, notes, warnings, cockpit, frame, seat: { esta, sa, setback, shFrame } };
  }

  // where the bars end up for a design (to show "x mm from your fitted position" after edits)
  function barOf(g, parts) { const o = barOffset(g.headAngle, +parts.spacers || 0, +parts.stemLength || 80, +parts.stemRise || 0); return [g.reach + o[0], g.stack + o[1]]; }

  // what gets saved into the design (design.fit.report): numbers + fitted bike only, never the rider's personal details
  function keep(fit) {
    const k = { system: fit.system || "bike fit", date: fit.date || "", bike: [fit.bike && fit.bike.year, fit.bike && fit.bike.model, fit.bike && fit.bike.type && `(${fit.bike.type})`].filter(Boolean).join(" ") };
    for (const id of Object.keys(FIELDS)) if (fit.values && fit.values[id] != null && isFinite(fit.values[id])) k[id] = +fit.values[id];
    return k;
  }

  const API = { FIELDS, LABELS, parseItems, parseText, readFile, toGeometry, sizeFor, barOffset, barOf, stackOf, headTubeFor, keep };
  root.FrameFitReport = API;
  if (typeof module !== "undefined") module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
