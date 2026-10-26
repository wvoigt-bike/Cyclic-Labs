// ============================================================================
//  GEOMETRY IMPORT (geoimport.js) — works offline, no internet needed
//  1. BikeCAD files (.bcad): BikeCAD saves a design as a list of named numbers
//     (Java "properties" XML). parseBcad() pulls out the frame geometry and
//     tube sizes Cyclic Labs uses, and says where each number came from.
//  2. Geometry charts copied from a bike brand's website (or a spreadsheet):
//     parseChart() finds the size columns and the rows it knows (reach, stack,
//     head angle ...). pickSize() turns one size column into numbers.
//  Both return plain { "geometry.reach": 453, ... } maps plus notes, so the
//  New-bike screen can show them for checking before a design is made.
//  To teach it a new name for a number, add it to CHART_FIELDS or BCAD below.
// ============================================================================
(function (root) {
  "use strict";

  const num = v => { if (v == null) return NaN; const s = String(v).trim().replace(",", "."); return s === "" ? NaN : +s; };
  const decode = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&");

  // ------------------------------------------------------------------ BikeCAD
  // Read every <entry key="...">value</entry> in a .bcad file
  function readBcad(text) {
    const out = {};
    const re = /<entry\s+key\s*=\s*"([^"]*)"\s*(?:\/>|>([\s\S]*?)<\/entry>)/g;
    let m; while ((m = re.exec(text))) out[decode(m[1])] = m[2] == null ? "" : decode(m[2]).trim();
    return out;
  }
  const isBcad = text => /<properties[\s>]/.test(text) && /<entry\s+key=/.test(text) && /(Head angle|CS textfield|Stack|Seat angle)/.test(text);

  // parseBcad(text) → { values, src, notes, warnings, guess: { type }, raw }
  // values use Cyclic Labs ids ("geometry.reach", "tubes.downTube.od" ...); src says which BikeCAD name each came from
  function parseBcad(text) {
    const P = readBcad(text), values = {}, src = {}, notes = [], warnings = [];
    const has = k => P[k] != null && P[k] !== "" && isFinite(num(P[k]));
    const get = (...keys) => { for (const k of keys) if (has(k)) return { v: num(P[k]), k }; return null; };
    const set = (id, hit, conv, why) => { if (!hit) return null; const v = conv ? conv(hit.v) : hit.v; if (!isFinite(v)) return null; values[id] = round(v); src[id] = why || hit.k; return v; };
    if (!Object.keys(P).length) throw new Error("That file has no BikeCAD numbers in it.");

    // lengths: BikeCAD saves millimetres. A file saved in inches would have a tiny stack: convert.
    const stackHit = get("Stack");
    const inch = stackHit && stackHit.v > 5 && stackHit.v < 40;
    const L = v => inch ? v * 25.4 : v;
    if (inch) notes.push("This file's lengths look like inches, so they were converted to millimetres.");

    const ha = set("geometry.headAngle", get("Head angle")), sa = set("geometry.seatAngle", get("Seat angle"));
    const stack = set("geometry.stack", stackHit, L);
    const cs = set("geometry.chainstay", get("CS textfield", "Chain stay length", "Chainstay length"), L);
    const htl = set("geometry.headTube", get("Head tube length textfield", "Head tube length"), L);
    const stl = set("geometry.seatTube", get("Seat tube length", "Seat tube length textfield"), L);

    // wheels: "Wheel diameter" is the rim's bead-seat diameter (622 for 700c/29"); RDBSD / FDBSD = tyre outside diameter − rim
    const wheel = (side, ab) => {
      const wd = get(`Wheel diameter ${side}`, `BSD ${side}`), dd = get(`${ab}DBSD`);
      let bsd = null, od = null;
      if (wd && wd.v > 640) od = L(wd.v); else if (wd) bsd = L(wd.v);
      if (dd && dd.v < 200 && bsd) od = bsd + L(dd.v);
      else if (dd && dd.v > 500 && dd.v < 720) { if (!bsd) bsd = dd.v; else if (!od) od = dd.v; }
      return { bsd, od, src: [wd && wd.k, dd && dd.k].filter(Boolean).join(" + ") };
    };
    const wr = wheel("rear", "R"), wf = wheel("front", "F");
    if (wr.bsd && [559, 584, 622, 686].some(b => Math.abs(b - wr.bsd) < 3)) { values["geometry.rimBSD"] = Math.round(wr.bsd); src["geometry.rimBSD"] = wr.src; }
    if (wr.od) { values["geometry.tireDiameter"] = round(wr.od); src["geometry.tireDiameter"] = wr.src; }
    if (wr.od && wr.bsd) { values["geometry.tireWidth"] = round((wr.od - wr.bsd) / 2 / 1.05); src["geometry.tireWidth"] = "from the tyre size (estimate)"; }
    if (wf.od && wr.od && Math.abs(wf.od - wr.od) > 8) { values["geometry.tireDiameterFront"] = round(wf.od); src["geometry.tireDiameterFront"] = wf.src; }
    if (wf.bsd && wr.bsd && Math.abs(wf.bsd - wr.bsd) > 3) { values["geometry.rimBSDFront"] = Math.round(wf.bsd); src["geometry.rimBSDFront"] = wf.src; }
    const Rr = (values["geometry.tireDiameter"] || 0) / 2;

    // BB: drop below the rear axle; a value over 150 is a BB height instead
    const bb = get("BB textfield", "BB drop");
    if (bb) {
      if (L(bb.v) > 150 && Rr) { values["geometry.bbDrop"] = round(Rr - L(bb.v)); src["geometry.bbDrop"] = bb.k + " (BB height → drop)"; }
      else set("geometry.bbDrop", bb, L);
    }

    // fork: length (axle-to-crown) and rake/offset of the fork type in use
    const ft = get("Fork type"), fi = ft ? Math.round(ft.v) : 0;
    const a2c = set("geometry.forkA2C", get(`FORK${fi}L`, "FORK0L", "Fork length", "Fork axle to crown"), L);
    const off = set("geometry.forkOffset", get(`FORK${fi}R`, "FORK0R", "Fork rake", "Fork offset"), L);

    // tubes: diameters and walls
    const dia = (id, keys, w) => { set(`tubes.${id}.od`, get(...keys), L); if (w) set(`tubes.${id}.wall`, get(w)); };
    dia("topTube", ["Top tube diameter", "ttd", "Top tube rear diameter"], "Wall thickness Top tube");
    dia("downTube", ["Down tube diameter", "dtd", "Down tube front diameter"], "Wall thickness Down tube");
    dia("seatTube", ["Seat tube diameter", "std"], "Wall thickness Seat tube");
    dia("seatStay", ["ssd", "Seat stay diameter", "SEATSTAY_HR"], "Wall thickness Seat stay");
    {
      const top = get("Head tube diameter"), bot = get("Head tube d"), tapered = (get("Head tube type") || {}).v === 1;
      if (top) { const t = L(top.v), b = tapered && bot ? L(bot.v) : t; values["tubes.headTube.od"] = round((t + b) / 2); src["tubes.headTube.od"] = tapered && bot ? `Head tube diameter ${round(t)} / bottom ${round(b)} (averaged: Cyclic Labs models one size)` : top.k; }
      set("tubes.headTube.wall", get("Wall thickness Head tube"));
    }
    {
      const v = get("Chain stay vertical diameter", "csd"), h = get("Chain stay horizontal diameter"), back = get("Chain stay back diameter");
      if (v && h && Math.abs(v.v - h.v) > 1) { values["tubes.chainstay.ovalH"] = round(L(v.v)); values["tubes.chainstay.ovalW"] = round(L(h.v)); src["tubes.chainstay.ovalH"] = v.k; src["tubes.chainstay.ovalW"] = h.k; values["tubes.chainstay.od"] = round(L(Math.sqrt(v.v * h.v))); src["tubes.chainstay.od"] = "round size with the same area as the oval"; }
      else if (v) set("tubes.chainstay.od", v, L);
      if (back) set("tubes.chainstay.taperOD", back, L);
      set("tubes.chainstay.wall", get("Wall thickness Chain stay"));
    }
    set("tubes.bbShell.od", get("BB diameter"), L); set("geometry.bbShellWidth", get("BB length"), L);
    set("tubes.bbShell.wall", get("Wall thickness Bottom Bracket"));
    const ds = get("Dropout spacing");
    if (ds) { const sp = L(ds.v); values["geometry.stayWidthAtDropout"] = round(sp - (sp >= 147 ? 16 : 18)); src["geometry.stayWidthAtDropout"] = `${ds.k} ${round(sp)} mm (stay centres ≈ ${sp >= 147 ? 16 : 18} mm narrower)`; }

    // where the tubes join (estimates: BikeCAD measures these from the tube edges)
    const ttd = values["tubes.topTube.od"] || 31.8, dtd = values["tubes.downTube.od"] || 38.1;
    const ue = get("Head tube upper extension2", "Head tube upper extension"), le = get("Head tube lower extension2", "Head tube lower extension");
    if (ue) { values["geometry.ttBelowHtTop"] = round(L(ue.v) + ttd / 2); src["geometry.ttBelowHtTop"] = ue.k + " + half the top tube (estimate)"; }
    if (le) { values["geometry.dtAboveHtBottom"] = round(L(le.v) + dtd / 2); src["geometry.dtAboveHtBottom"] = le.k + " + half the down tube (estimate)"; }
    const se = get("Seat tube extension2", "Seat tube extension");
    if (se && stl) { values["geometry.ttAtSeatTube"] = round(stl - L(se.v) - ttd / 2); src["geometry.ttAtSeatTube"] = se.k + " (estimate)"; }
    const ssj = get("Seat stay junction0", "Seat stay offset", "Seat stay junction");
    if (ssj && stl) {
      const tt = values["geometry.ttAtSeatTube"] || (stl - 30), below = tt - (stl - L(ssj.v));
      if (below >= 0 && below < 120) { values["geometry.ssBelowTt"] = round(below); src["geometry.ssBelowTt"] = ssj.k + " (estimate)"; }
    }
    set("geometry.saddleHeight", get("Saddle height"), L);
    set("geometry.seatpostLength", get("Seatpost LENGTH", "Seatpost length"), L);

    // reach: BikeCAD can show reach directly, or the front end is set by the down tube length or front centre
    const style = get("Top tube front center measure style"), fcd = get("FCD textfield");
    const rad = d => d * Math.PI / 180;
    if (style && Math.round(style.v) === 3 && fcd) { set("geometry.reach", fcd, L, "FCD textfield (reach, Stack & Reach mode)"); }
    else if (has("Reach")) set("geometry.reach", get("Reach"), L);
    else {
      const dtl = get("DT Length", "Down tube length");
      if (dtl && stack && htl && ha) {
        const yb = stack - htl * Math.sin(rad(ha)), d = L(dtl.v);
        if (d > yb) { values["geometry.reach"] = round(Math.sqrt(d * d - yb * yb) - htl * Math.cos(rad(ha))); src["geometry.reach"] = dtl.k + " (worked out from the down tube length; check it)"; }
      }
      if (values["geometry.reach"] == null && fcd && stack && htl && ha && a2c && off) {
        // front centre = horizontal BB → front axle; walk back up the fork and head tube to the head-tube top
        const fc = L(fcd.v), h = rad(ha);
        const htBotX = fc - (a2c * Math.cos(h) + off * Math.sin(h));
        values["geometry.reach"] = round(htBotX - htl * Math.cos(h)); src["geometry.reach"] = fcd.k + " (front centre → reach, worked out; check it)";
      }
      if (values["geometry.reach"] == null) warnings.push("Couldn't find the reach in this file: type it in from BikeCAD's dimensions (Stack & Reach).");
      else warnings.push("Reach was worked out from other numbers in the file (BikeCAD wasn't set to show Stack & Reach). Check it against BikeCAD.");
    }

    // which kind of bike?
    const guess = { type: null };
    if (ha) guess.type = ha < 69 ? "mtb" : (values["geometry.tireWidth"] || 0) >= 34 || (values["geometry.tireDiameter"] || 0) > 690 ? "gravel" : "road";
    for (const req of ["geometry.headAngle", "geometry.seatAngle", "geometry.stack", "geometry.chainstay", "geometry.headTube", "geometry.seatTube"])
      if (values[req] == null) warnings.push(`No ${LABELS[req].toLowerCase()} in this file: the starting template's value is used.`);
    notes.push(`${Object.keys(P).length} settings in the file; ${Object.keys(values).length} used.`);
    return { values, src, notes, warnings, guess, raw: P };
  }

  // ------------------------------------------------------------------ geometry chart (copied text)
  // label patterns → Cyclic Labs id. Order matters (first match wins). "check.*" are only used to cross-check.
  const CHART_FIELDS = [
    ["skip", /stack\s*(to|\/|:)\s*reach|reach\s*(to|\/|:)\s*stack|str\b|stem|crank|bar\b|handlebar|saddle|standover|stand over|seat ?post|insertion|dropper|tyre|tire|wheel size|rim|weight|max/],
    ["geometry.reach", /\breach\b/],
    ["geometry.stack", /\bstack\b/],
    ["geometry.headAngle", /head\s*(tube)?\s*ang|\bhta\b|\bha\b|steer(ing)? angle/],
    ["geometry.seatAngleEff", /eff(ective|\.)?\s*seat\s*(tube)?\s*ang|seat\s*(tube)?\s*ang.*\beff|\beff\.?\s*sta\b/],
    ["geometry.seatAngle", /seat\s*(tube)?\s*ang|\bsta\b|\bsa\b/],
    ["geometry.chainstay", /chain\s*-?\s*stay|rear\s*cent(er|re)|\bcs\b|\bcsl\b/],
    ["geometry.bbDrop", /(bb|bottom\s*bracket)\s*drop|\bdrop\b/],
    ["check.bbHeight", /(bb|bottom\s*bracket)\s*(height|ht)/],
    ["geometry.headTube", /head\s*tube|\bht\b|\bhtl\b/],
    ["geometry.seatTube", /seat\s*tube|\bst\b|\bstl\b/],
    ["geometry.forkOffset", /offset|\brake\b/],
    ["geometry.forkA2C", /axle.{0,6}crown|fork\s*length|\ba-?\s*2-?\s*c\b|\batc\b/],
    ["check.wheelbase", /wheel\s*-?\s*base|\bwb\b/],
    ["check.frontCentre", /front\s*cent(er|re)|\bfc\b/],
    ["check.ett", /top\s*tube|\bett\b|\btt\b/],
    ["check.trail", /\btrail\b/]
  ];
  const LABELS = {
    "geometry.reach": "Reach", "geometry.stack": "Stack", "geometry.headAngle": "Head angle", "geometry.seatAngle": "Seat angle", "geometry.chainstay": "Chainstay",
    "geometry.bbDrop": "BB drop", "geometry.headTube": "Head tube length", "geometry.seatTube": "Seat tube length", "geometry.forkOffset": "Fork offset",
    "geometry.forkA2C": "Fork axle-to-crown", "check.wheelbase": "Wheelbase", "check.frontCentre": "Front centre", "check.ett": "Effective top tube", "check.trail": "Trail",
    "check.bbHeight": "BB height", "geometry.tireDiameter": "Tyre outside diameter", "geometry.tireWidth": "Tyre width", "geometry.ttAtSeatTube": "Top tube joins seat tube at",
    "geometry.ttBelowHtTop": "Top tube below head-tube top", "geometry.dtAboveHtBottom": "Down tube above head-tube bottom", "geometry.ssBelowTt": "Seat stays below top tube",
    "geometry.saddleHeight": "Saddle height", "geometry.seatpostLength": "Seatpost length", "geometry.bbShellWidth": "BB shell width", "geometry.stayWidthAtDropout": "Stay spacing at dropouts",
    "geometry.rimBSD": "Rear wheel size (rim)", "geometry.rimBSDFront": "Front wheel size (rim)", "geometry.tireDiameterFront": "Front tyre outside diameter",
    "tubes.topTube.od": "Top tube OD", "tubes.topTube.wall": "Top tube wall", "tubes.downTube.od": "Down tube OD", "tubes.downTube.wall": "Down tube wall",
    "tubes.seatTube.od": "Seat tube OD", "tubes.seatTube.wall": "Seat tube wall", "tubes.headTube.od": "Head tube OD", "tubes.headTube.wall": "Head tube wall",
    "tubes.seatStay.od": "Seat stay OD", "tubes.seatStay.wall": "Seat stay wall", "tubes.chainstay.od": "Chainstay OD", "tubes.chainstay.wall": "Chainstay wall",
    "tubes.chainstay.ovalH": "Chainstay oval height", "tubes.chainstay.ovalW": "Chainstay oval width", "tubes.chainstay.taperOD": "Chainstay end size",
    "tubes.bbShell.od": "BB shell OD", "tubes.bbShell.wall": "BB shell wall"
  };
  const ANGLE = new Set(["geometry.headAngle", "geometry.seatAngle", "geometry.seatAngleEff"]);
  const fieldOf = label => { const l = label.toLowerCase().replace(/[_*]/g, " "); for (const [id, re] of CHART_FIELDS) if (re.test(l)) return id === "skip" ? null : id; return undefined; };
  const SIZE_TOKEN = /^(xxs|xs|s|sm|m|md|ml|l|lg|xl|xxl|2xl|3xl|s\d|xs\d|[a-z]{0,3}\d{2,3}(cm)?|\d{2}(\.\d)?("|”|in)?|small|medium|large|x-?large|extra ?large)$/i;
  // a number in a cell: 445, 445mm, 64.5°, 64,5, 17.5", "445 / 450" (first)
  function cellNumber(c) {
    const m = String(c).replace(/[−–]/g, "-").match(/-?\d+(?:[.,]\d+)?/);
    return m ? num(m[0]) : NaN;
  }
  function splitLine(line) {
    if (line.includes("\t")) return line.split("\t").map(s => s.trim());
    if (/\s{2,}/.test(line.trim())) return line.trim().split(/\s{2,}/).map(s => s.trim());
    if (line.includes(";")) return line.split(";").map(s => s.trim());
    // single spaces: label words first, then one value per token
    const toks = line.trim().split(/\s+/); let k = 0;
    while (k < toks.length && !/^-?\d/.test(toks[k]) && !(k > 0 && SIZE_TOKEN.test(toks[k]) && toks.slice(k).every(t => SIZE_TOKEN.test(t)))) k++;
    // units after the label like "(mm)" stay in the label
    return [toks.slice(0, k).join(" ")].concat(toks.slice(k));
  }

  // parseChart(text) → { sizes: [..], rows: [{ id, label, values: [..] }], unknown: [labels], inches: bool }
  function parseChart(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n").map(l => l.replace(/ /g, " ")).filter(l => l.trim());
    // CSV (every line has the same number of commas, 2 or more): split on commas
    const nComma = l => (l.match(/,/g) || []).length, csv = lines.length >= 2 && nComma(lines[0]) >= 2 && lines.every(l => nComma(l) === nComma(lines[0]));
    let cells = lines.map(l => csv ? l.split(",").map(x => x.trim()) : splitLine(l)).filter(c => c.length >= 2);
    // sizes as rows, numbers as columns (a few brands do this): the first row names the fields → transpose
    if (cells.length >= 2) {
      const hdr = cells[0], known = hdr.filter(h => fieldOf(h)).length;
      if (known >= 3 && hdr.filter(h => isFinite(cellNumber(h))).length <= 1) {
        const T = hdr.map((h, j) => [h].concat(cells.slice(1).map(r => r[j] == null ? "" : r[j])));
        T[0] = ["Size"].concat(cells.slice(1).map(r => r[0]));
        cells = T;
      }
    }
    let sizes = null; const rows = [], unknown = [];
    for (const c of cells) {
      const label = c[0], vals = c.slice(1).filter(v => v !== "");
      if (!sizes && (/^(size|frame size|sizes|größe|taille|talla)\b/i.test(label) || (!label || fieldOf(label) === undefined) && vals.length >= 2 && vals.every(v => SIZE_TOKEN.test(v.replace(/\s/g, ""))))) { sizes = vals; continue; }
      const id = fieldOf(label);
      if (id === null) continue;
      const nums = vals.map(cellNumber);
      if (!nums.some(isFinite)) continue;
      if (id === undefined) { unknown.push(label); continue; }
      rows.push({ id, label, values: nums, inch: /\(in|inch|\bin\)|"$/i.test(label) || vals.some(v => /"|”|in\b/.test(v) && !/mm/.test(v)) });
    }
    const n = Math.max(0, ...rows.map(r => r.values.length));
    if (!sizes || sizes.length < n) sizes = Array.from({ length: n }, (_, k) => (sizes && sizes[k]) || `Column ${k + 1}`);
    // inches: lengths under 40 (reach 16.9", chainstay 17.1") are inches
    for (const r of rows) if (!ANGLE.has(r.id)) {
      const big = r.values.filter(isFinite);
      if (r.inch || (big.length && big.every(v => Math.abs(v) < 40) && !/trail|offset|drop/i.test(r.id))) { r.values = r.values.map(v => v * 25.4); r.converted = true; }
    }
    return { sizes, rows, unknown, found: [...new Set(rows.map(r => r.id))] };
  }
  // pickSize(chart, k) → { values, src, notes } for size column k
  function pickSize(chart, k) {
    const values = {}, src = {}, notes = [];
    for (const r of chart.rows) {
      const v = r.values[k]; if (!isFinite(v)) continue;
      let id = r.id;
      if (id === "geometry.seatAngleEff") { id = "geometry.seatAngle"; src.__effSeat = true; }
      else if (id === "geometry.seatAngle" && src.__effSeat) continue;   // effective seat angle wins (it's the one that sets the saddle position)
      if (values[id] != null && id !== "geometry.seatAngle") continue;    // first row wins
      values[id] = round(v); src[id] = r.label + (r.converted ? " (inches → mm)" : "");
    }
    if (src.__effSeat) { notes.push("Used the effective seat angle: Cyclic Labs draws a straight seat tube at that angle."); delete src.__effSeat; }
    if (values["geometry.bbDrop"] != null && values["geometry.bbDrop"] < 0) values["geometry.bbDrop"] = -values["geometry.bbDrop"];
    return { values, src, notes };
  }
  const round = v => Math.round(v * 10) / 10;

  root.FrameGeoImport = { readBcad, isBcad, parseBcad, parseChart, pickSize, fieldOf, LABELS, CHART_FIELDS };
  if (typeof module !== "undefined") module.exports = root.FrameGeoImport;
})(typeof window !== "undefined" ? window : globalThis);
