// ============================================================================
//  DESIGN CHAT (chat.js) — offline, no AI model
//  Type plain sentences like "change the reach to 567", "head angle 1° slacker",
//  "down tube 44.5 x 1.2", "no seat-stay bridge", "what's the stack?", "undo".
//  It works out which setting you mean from the app's own field list
//  (CyclicLabsApp.chatFields(), built from the same tables as the input panel),
//  so a field added to the app is understood here automatically. Extra
//  nicknames for a field go in SYNONYMS below.
//  Every change is reported old → new, checked by the app's validator, and
//  can be undone.
// ============================================================================
(function (root) {
  "use strict";

  // Extra names people use. Key = field id from chatFields(). The field's own label always works too.
  const SYNONYMS = {
    "geometry.reach": ["reach"], "geometry.stack": ["stack"],
    "geometry.headAngle": ["hta", "ha", "head angle", "head tube angle", "steering angle", "head"],
    "geometry.seatAngle": ["sta", "sa", "seat angle", "seat tube angle"],
    "geometry.csDrivePlate": ["drive plate", "drive side plate", "chainstay plate", "plate length", "drive stay plate"],
    "geometry.csDrivePlateW": ["plate thickness", "drive plate thickness"], "geometry.csDrivePlateH": ["plate height", "drive plate height"],
    "geometry.csRingTuck": ["chainring tuck", "ring tuck", "chainring clearance bend", "ring clearance bend", "drive stay tuck", "tuck the drive stay", "drive side stay tuck"],
    "geometry.chainstay": ["cs", "chainstay", "chainstays", "chain stay", "chain stays", "chainstay length", "rear centre", "rear center", "stay length"],
    "geometry.bbDrop": ["bb drop", "drop", "bottom bracket drop", "bbdrop"],
    "geometry.headTube": ["ht", "head tube", "head tube length", "htl"],
    "geometry.seatTube": ["st", "seat tube", "seat tube length", "stl"],
    "geometry.forkA2C": ["a2c", "axle to crown", "fork length", "axle crown", "fork a2c"],
    "geometry.forkOffset": ["offset", "fork offset", "rake"],
    "use.forkSag": ["sag", "fork sag", "front sag", "sag percent", "sag %"],
    "geometry.ttAtSeatTube": ["top tube junction", "tt junction"], "geometry.ttBelowHtTop": ["top tube below head tube", "tt drop at head tube"],
    "geometry.saddleHeight": ["saddle height", "seat height"], "geometry.tireDiameter": ["tyre diameter", "tire diameter", "wheel diameter", "tyre od", "tire od"],
    "geometry.tireDiameterFront": ["front tyre diameter", "front tire diameter", "front wheel diameter", "front tyre od", "front tire od"],
    "geometry.rimBSD": ["wheel size", "rear wheel size", "rim size", "rear rim", "wheels"], "geometry.rimBSDFront": ["front wheel size", "front rim size", "front rim"],
    "geometry.tireWidth": ["tyre width", "tire width", "tyres", "tires", "tyre size", "tire size"],
    "geometry.bbShellWidth": ["bb width", "bb shell", "shell width", "bottom bracket width"],
    "geometry.chainring": ["chainring", "ring", "front ring", "front teeth"], "geometry.cog": ["cog", "rear cog", "sprocket", "rear teeth"],
    "geometry.crankLength": ["crank", "cranks", "crank length", "crank arms"], "geometry.chainline": ["chainline", "chain line"],
    "geometry.rearRotor": ["rear rotor", "rotor", "rear disc", "disc size"], "geometry.brakeMount": ["brake mount", "caliper mount", "caliper", "brake"],
    "geometry.stayWidthAtDropout": ["dropout spacing", "hub spacing", "rear spacing"],
    "geometry.ssShape": ["seat stay shape", "stay shape", "seat stays"], "geometry.csShape": ["chainstay shape"],
    "geometry.stBendOffset": ["seat tube bend", "bent seat tube", "seat tube offset", "st bend", "seat tube kink"], "geometry.stBendHeight": ["seat tube bend height", "st bend height"],
    "geometry.stBendRadius": ["seat tube bend radius"], "geometry.dtBendRadius": ["down tube bend radius"],
    "geometry.dtBendAngle": ["down tube bend", "bent down tube", "dt bend", "down tube kink", "down tube bend angle"], "geometry.dtBendFromHt": ["down tube bend position", "dt bend position", "down tube bend distance"],
    "geometry.ssBendStyle": ["seat stay bend", "seat stay side bend", "seat stay bend style"], "geometry.ssBendDepth": ["seat stay bend depth", "seat stay curve depth"], "geometry.ssBendAt": ["seat stay kink position", "seat stay bend position"],
    "geometry.csBendStyle": ["chainstay bend", "chainstay side bend", "chainstay bend style"], "geometry.csBendDepth": ["chainstay bend depth", "chainstay drop"], "geometry.csBendAt": ["chainstay kink position", "chainstay bend position"],
    "geometry.ssBridge": ["bridge", "seat stay bridge", "brace"], "geometry.csYokeLength": ["yoke", "yoke length", "chainstay yoke"],
    "geometry.singlespeed": ["singlespeed", "single speed", "sliders", "sliding dropouts"],
    "use.condition": ["terrain", "riding", "condition", "astm", "en 17406"], "use.aggression": ["riding style", "style", "aggression"],
    "use.sprintWatts": ["sprint", "sprint power", "max power", "watts", "peak power"], "use.avgWatts": ["average power", "avg power", "typical power", "ftp"],
    "use.hoursPerWeek": ["hours", "hours per week", "riding hours"], "use.dropHeight": ["drop height", "huck", "biggest drop", "flat landing"],
    "use.forkTravel": ["fork travel", "travel", "fork"], "use.isoForkTravel": ["longest fork", "max fork", "iso fork"],
    "use.rearTirePsi": ["tyre pressure", "tire pressure", "psi", "pressure"], "use.isoType": ["iso level", "test level", "iso type", "lab test"],
    "use.isoSeverity": ["test severity", "severity", "iso severity"],
    "rider.riderKg": ["rider weight", "my weight", "rider", "weight of the rider", "i weigh", "rider mass"], "rider.bikeKg": ["bike weight", "bike mass"],
    "tubes.seatpost.type": ["seatpost", "seat post", "post", "dropper"],
    "material.fatigueMethod": ["fatigue method", "weld method"],
    "fit.shoeEU": ["shoe size", "shoe", "shoes", "foot size", "feet", "boot size", "eu shoe size"], "fit.shoeType": ["shoe type", "type of shoe", "kind of shoe"],
    "fit.wide": ["wide shoe", "wide shoes", "wide fit", "wide feet"], "fit.cleatBack": ["cleat", "cleats", "cleat position", "cleat setback", "cleat set back"],
    "fit.fender": ["mudguard", "mudguards", "fender", "fenders"], "fit.fenderGap": ["mudguard gap", "fender gap", "mudguard clearance", "fender clearance"],
    "fit.footCentre": ["stance", "stance width", "foot position sideways"], "fit.toeAngle": ["toe angle", "duck feet"],
    "fit.footPitch": ["foot angle", "ankle angle", "toe down"], "fit.toeReach": ["toe reach", "measured toe", "toe past the pedal", "toe length"],
    "fit.mTip": ["tip to cleat", "toe to cleat", "shoe tip to cleat", "cleat to toe", "cleat to tip"], "fit.mWidth": ["shoe width", "width of my shoe"],
    "fit.mToeH": ["toe box height", "toe-box height"], "fit.mLength": ["shoe length", "length of my shoe"],
    "fit.qFactor": ["q factor", "q-factor", "qfactor", "crank q"], "fit.pedalStance": ["pedal stance", "pedal spindle", "pedal axle length"],
    "fit.cleatSlide": ["cleat slide", "cleat sideways", "cleat lateral"], "fit.shoeSource": ["toe position from", "toe source"],
    // parts drawn (v10.2): with a library part picked these adjust that part on this bike only
    "parts.stemLength": ["stem", "stem length"], "parts.stemRise": ["stem angle", "stem rise"], "parts.spacers": ["spacers", "spacer stack", "headset spacers", "spacers under the stem", "spacer height"],
    "parts.barWidth": ["bar width", "handlebar width", "bars"], "parts.barRise": ["bar rise", "handlebar rise"], "parts.backsweep": ["backsweep", "bar sweep", "sweep"],
    "parts.adj.cockpit.dropReach": ["bar reach", "drop bar reach"], "parts.adj.cockpit.dropDrop": ["bar drop", "drop bar drop"],
    "parts.adj.cockpit.dropFlare": ["flare", "bar flare", "drop flare"], "parts.adj.cockpit.dropFlareOut": ["flare out", "outsweep", "flare-out"],
    "parts.adj.cockpit.dropRise": ["drop bar rise", "tops rise"], "parts.adj.cockpit.spacersAbove": ["spacers above", "spacers on top", "spacers above the stem", "spacers on top of the stem"],
    "parts.adj.fork.clearance": ["fork clearance", "fork tyre clearance", "fork tire clearance", "fork max tyre", "fork max tire"]
  };
  // tube names → tube key
  const TUBE_NAMES = {
    topTube: ["top tube", "tt", "toptube"], downTube: ["down tube", "dt", "downtube"], seatTube: ["seat tube", "st", "seattube"],
    headTube: ["head tube", "ht", "headtube"], chainstay: ["chainstay", "chainstays", "chain stay", "chain stays", "cs"],
    seatStay: ["seat stay", "seat stays", "seatstay", "seatstays", "ss"], bbShell: ["bb shell", "bottom bracket shell", "shell"],
    ssBridge: ["bridge tube", "bridge"], ssMono: ["wishbone tube", "mono stay", "wishbone"], csYoke: ["yoke plate", "yoke"]
  };
  const STOP = new Set("please can could you would i want to the a an my of at be is it its it's set change make put use go have with for from and also then just so this that frame bike new value number should".split(" "));
  const UP = ["increase", "add", "raise", "more", "longer", "bigger", "taller", "higher", "up", "lengthen", "extend", "grow", "plus", "steeper", "steepen", "thicker", "wider", "bump", "nudge", "boost", "heavier", "fatter", "stretch", "further"];
  const DOWN = ["decrease", "reduce", "lower", "less", "shorter", "smaller", "down", "shorten", "subtract", "take", "minus", "slacker", "slacken", "thinner", "narrower", "cut", "trim", "chop", "shave", "knock", "lighter", "skinnier", "drop"];
  // how far "longer chainstays" / "slacker head angle" / "a bit more reach" moves a setting when no number is given
  const NUDGE = { "geometry.reach": 10, "geometry.stack": 10, "geometry.headAngle": 1, "geometry.seatAngle": 1, "geometry.chainstay": 5, "geometry.bbDrop": 5,
    "geometry.headTube": 10, "geometry.seatTube": 10, "geometry.forkA2C": 10, "geometry.forkOffset": 5, "geometry.saddleHeight": 5, "geometry.crankLength": 2.5,
    "geometry.tireWidth": 5, "geometry.chainring": 2, "geometry.cog": 1, "geometry.ssClearance": 2, "geometry.csClearance": 2, "geometry.rearRotor": 20,
    "parts.stemLength": 10, "parts.spacers": 5, "parts.barWidth": 20, "parts.barRise": 10, "parts.stemRise": 6, "parts.rotorF": 20,
    "rider.riderKg": 2, "rider.bikeKg": 0.5, "use.hoursPerWeek": 1, "use.avgWatts": 25, "use.sprintWatts": 100, "use.rearTirePsi": 2, "fit.shoeEU": 0.5 };
  function nudgeSize(f) {
    if (NUDGE[f.id] != null) return NUDGE[f.id];
    if (/\.(wall|buttWall)$/.test(f.id)) return 0.1;
    if (/\.od$/.test(f.id)) return 3;
    if (f.unit === "°") return 1;
    if (f.unit === "mm") return f.step >= 1 ? Math.max(5, f.step) : 1;
    return (f.step || 1) * 5;
  }
  // "a bit / a touch / slightly" halves a nudge, "a lot / way / much" doubles it
  const sizeWord = t => /\b(a (bit|little|touch|tad|smidge|hair|fraction)|slightly|bit|little|touch|tad|marginally|fractionally)\b/.test(t) ? 0.5 : /\b(a lot|lots|way|much|heaps|loads|tons|significantly|massively|way more|way less)\b/.test(t) ? 2 : 1;
  const NEG = ["no", "remove", "without", "off", "disable", "none", "drop", "delete", "kill"];
  const POS = ["add", "with", "on", "enable", "yes", "fit", "include"];

  const norm = s => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[–—]/g, "-").replace(/(^|\s)-(?=\d)/g, "$1\u2212").replace(/[_\-/]+/g, " ").replace(/\u2212/g, "-").replace(/[“”"]/g, " ").replace(/\s+/g, " ").trim();
  const words = s => norm(s).replace(/[^a-z0-9.°%+×*x -]/g, " ").split(" ").filter(Boolean);
  const stem = w => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "").replace(/(ing|ed)$/, "");
  const canon = w => w.replace(/^tyre/, "tire").replace(/^centre/, "center").replace(/^colour/, "color").replace(/^aluminium/, "aluminum");
  const same = (a, b) => { a = canon(a); b = canon(b); return a === b || stem(a) === stem(b) || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a))); };
  const camelWords = k => k.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
  const fmtV = (v, f) => {
    if (f && f.kind === "select") { const o = f.options.find(o => String(o[0]) === String(v)); return o ? o[1] : String(v); }
    if (v === "" || v == null) return "auto";
    return (typeof v === "number" ? +v.toFixed(3) : v) + (f && f.unit && f.unit !== "select" && !/^[×0]/.test(f.unit) ? (f.unit === "°" ? "°" : " " + f.unit) : "");
  };

  // ---------------------------------------------------------------- understanding a sentence
  function phrasesOf(f) {
    const p = new Set([norm(f.label), camelWords(f.key)].concat(SYNONYMS[f.id] || []).concat(f.aliases || []));
    return [...p].filter(Boolean).map(x => x.split(" ").filter(w => !STOP.has(w)));
  }
  function scoreField(f, toks, text) {
    let best = 0;
    for (const ph of phrasesOf(f)) {
      if (!ph.length) continue;
      const hit = ph.filter(w => toks.some(t => same(t, w))).length;
      let s = hit / ph.length;
      if (s === 1) s = 1 + 0.12 * ph.length + (text.includes(ph.join(" ")) ? 0.25 : 0);   // full phrase present; longer phrases are more specific
      else s *= 0.55;
      best = Math.max(best, s);
    }
    return best;
  }
  function numbersIn(s) {
    const out = []; const re = /(^|[^a-z0-9.])([+-]?\d+(?:\.\d+)?)\s*(%|mm|cm|in(?:ch(?:es)?)?\b|"|°|deg(?:rees?)?|kg|lbs?|pounds?|w\b|watts?|rpm|psi|t\b|teeth|h\b|hours?|m\b)?/gi;
    let m; while ((m = re.exec(s))) out.push({ v: +m[2], unit: (m[3] || "").toLowerCase(), signed: /^[+-]/.test(m[2]), at: m.index + m[1].length, end: m.index + m[0].length, raw: m[0] });
    return out;
  }
  // convert to the field's unit where it's obvious (inches, cm, lb)
  function convert(n, f) {
    const u = n.unit;
    if (!u) return n.v;
    if (/^(in|inch|inches|")$/.test(u) && f.unit === "mm") return n.v * 25.4;
    if (u === "cm" && f.unit === "mm") return n.v * 10;
    if (/^(lb|lbs|pound|pounds)$/.test(u) && f.unit === "kg") return n.v * 0.4536;
    return n.v;
  }

  function findTube(text) {
    let best = null;
    for (const [k, names] of Object.entries(TUBE_NAMES)) for (const n of names) {
      const re = new RegExp("(^|[^a-z])" + n.replace(/ /g, "\\s*") + "([^a-z]|$)");
      if (re.test(text) && (!best || n.length > best.n.length)) best = { k, n };
    }
    return best;
  }

  // ---------------------------------------------------------------- the chat engine
  function makeEngine(App) {
    const hist = [], redo = [];
    const state = { last: null, lastField: null, pending: null };   // memory for "a bit more", "make it 470", "yes"
    let pendingReport = null;
    const fields = () => App.chatFields();
    const snapshot = () => JSON.parse(JSON.stringify(App.design()));

    function apply(changes, label) {
      // changes: [{ f, v }]
      const before = snapshot(), geoBefore = App.geometryInfo();
      for (const c of changes) c.old = c.f.get();
      if (changes.every(c => String(c.old) === String(c.v) || (+c.old === +c.v && c.v !== "" && c.old !== ""))) return changes.map(c => `**${c.f.label}** is already ${fmtV(c.old, c.f)}.`).join("\n");
      for (const c of changes) c.f.set(c.v);
      try { App.validate(); } catch (e) {
        App.restore(before);
        return `I didn't change it: ${e.message}`;
      }
      hist.push({ before, label }); redo.length = 0;
      App.refresh();
      state.last = { items: changes.map(c => ({ id: c.f.id, old: c.old, now: c.f.get() })), label };
      state.lastField = changes[changes.length - 1].f.id;
      const lines = changes.map(c => `**${c.f.label}**: ${fmtV(c.old, c.f)} → ${fmtV(c.f.get(), c.f)}`);
      const geoAfter = App.geometryInfo();
      const eff = [];
      if (geoBefore && geoAfter) for (const [k, lab] of [["wheelbase", "wheelbase"], ["trail", "trail"], ["effectiveTopTube", "effective top tube"], ["bbHeight", "BB height"]]) {
        const a = geoBefore[k], b = geoAfter[k]; if (isFinite(a) && isFinite(b) && Math.abs(b - a) >= 0.5) eff.push(`${lab} ${a.toFixed(0)} → ${b.toFixed(0)} mm`);
      }
      pendingReport = App.summary();
      return lines.join("\n") + (eff.length ? `\n_Knock-on: ${eff.join(", ")}._` : "");
    }

    function help() {
      return [
        "Type what you want in plain words. Examples:",
        "• `change the reach to 460` · `stack 640` · `head angle 65.5°`",
        "• `make the head angle 1° slacker` · `add 10 mm to the chainstay` · `seat tube 20 shorter`",
        "• `down tube 44.5 x 1.2` · `top tube wall 0.9` · `seat stays 19 mm`",
        "• `wishbone seat stays` · `no bridge` · `terrain: trail` · `rider weight 170 lb`",
        "• `use the Fox 34 fork` (realistic view parts) · `what's the trail?` · `what is the stack`",
        "• `front wheel size 29` · `rear wheel size 27.5` (mullet) · `front tyre diameter auto`",
        "• `new bike` (set-up walkthrough) · `tutorial` · `engineering mode` / `design mode` · `dark mode` / `light mode` / `custom colours`",
        "• `undo` · `redo` · `what changed` · `save as hardtail v2` · `save changes` · `open gravel` · `compare with my spec`",
        "• `shoe size 13 US` · `shoe size 47` · `midfoot cleats` · `add mudguards` · `toe overlap?` (will the toe hit the front tyre)",
        "• `overlay my current bike` · `overlay solid orange` · `overlay fit view` · `overlay differences` · `overlay off` (3D overlay of another bike)",
        "• `list fields` shows every setting the chat knows (" + fields().length + " right now).",
        "• `more help` — lots more: what-ifs, keep the trail, copy from another design, BB/headset standards, notes for your builder, short forms like `HA 65`.",
        "• `order help` — the build journey: steps, windows, spec sheet, order progress, journal, questions for your builder, lead times and prices, themes."
      ].join("\n");
    }

    function describe(f) {
      state.lastField = f.id;
      const v = f.get();
      let extra = "";
      if (f.kind === "select") extra = `\nOptions: ${f.options.map(o => o[1]).join(" · ")}`;
      return `**${f.label}** is ${fmtV(v, f)}.${extra}`;
    }

    function matchDesign(q) {
      const list = App.allDesigns(), qt = words(q).filter(w => !STOP.has(w) && !["open", "load", "switch", "compare", "with", "design", "against", "vs"].includes(w));
      let best = null, bs = 0;
      for (const d of list) { const nt = words(d.name); const s = qt.filter(w => nt.some(n => same(n, w))).length / Math.max(1, qt.length) + (norm(d.name).includes(qt.join(" ")) ? 0.5 : 0); if (s > bs) { bs = s; best = d; } }
      return bs >= 0.5 ? best : null;
    }

    function partCommand(text) {
      const lib = root.FramePartLib; if (!lib) return null;
      if (!/\b(use|fit|put|install|show|swap|switch|change)\b/.test(text)) return null;
      const toks = words(text).filter(w => !STOP.has(w));
      let best = null, bs = 0;
      for (const p of lib.all()) {
        const nt = words(p.name).filter(w => !STOP.has(w) && w.length > 1); if (!nt.length) continue;
        const hit = nt.filter(w => toks.some(t => same(t, w))).length, s = hit / nt.length + hit * 0.05;
        if (hit >= Math.min(2, nt.length) && s > bs) { bs = s; best = p; }
      }
      if (!best || bs < 0.5) return null;
      const before = snapshot();
      const d = App.design(); d.parts = d.parts || {}; d.parts.sel = d.parts.sel || {};
      const old = d.parts.sel[best.cat]; const oldP = old && lib.raw(old);
      d.parts.sel[best.cat] = best.id;
      hist.push({ before, label: "part" }); redo.length = 0; App.refresh();
      return `**${(lib.CATS[best.cat] || {}).label || best.cat}** (realistic view): ${oldP ? oldP.name : old || "default"} → ${best.name}`;
    }

    function undo() {
      const h = hist.pop(); if (!h) return false;
      redo.push({ before: snapshot(), label: h.label }); App.restore(h.before); App.refresh(); pendingReport = App.summary(); state.last = null; return true;
    }
    // a whole-design change made outside apply() (reset, preset tyres ...) that should still be undoable
    function record(before, label) { hist.push({ before, label }); redo.length = 0; App.refresh(); pendingReport = App.summary(); }
    const unsure = r => typeof r === "string" && /^I'm not sure which setting/.test(r);
    const X = () => root.FrameChat || {};
    const ctx = { App, fields, apply, state, hist, redo, undo, record, snapshot, describe, help, fmtV, norm, words, numbersIn, convert, scoreField, findTube, nudgeSize, sizeWord, relDir: (t, n) => relDir(t, n),
      one: t => one(t), single: t => single(t), inner: t => inner(t), matchDesign: q => matchDesign(q), fld: id => fields().find(f => f.id === id), report: () => { pendingReport = App.summary(); } };

    // after-hooks (chatjourney.js): look at what a reply changed and add a line (e.g. "also ticked on the spec sheet")
    function handle(input) {
      const raw0 = String(input || "").trim(); if (!raw0) return null;
      const before = (X().after || []).map(h => { try { return h.before ? h.before(ctx) : null; } catch (e) { return null; } });
      let r = handle0(raw0);
      (X().after || []).forEach((h, i) => { try { const x = h.after(raw0, r, ctx, before[i]); if (x) r = (r == null ? "" : r + "\n") + x; } catch (e) { console.error(e); } });
      return r;
    }
    function handle0(raw0) {
      let m;
      // names are kept exactly as typed
      if ((m = raw0.match(/^\s*save\s+(?:it\s+)?as(?:\s+new)?(?:\s+design)?\s*[:\-]?\s*(.*)$/i))) return App.saveNew(m[1].trim());
      for (const h of X().early || []) { const r = h(raw0, norm(raw0), ctx); if (r) return r; }
      const raw = X().rewrite ? X().rewrite(raw0, ctx) : raw0;
      const r = inner(raw);
      // nothing matched: broad answers first (chatextra.js: builder FAQ, "ok", "why…", results in words), then spelling fixes
      if (unsure(r)) for (const h of X().fallback || []) {
        let x = null; try { x = h(raw0, norm(raw0), ctx, raw); } catch (e) { console.error(e); }
        if (x) { state.pending = state.keepPending ? state.pending : (state.pendingNext || null); state.pendingNext = null; state.keepPending = false; return x; }
      }
      // nothing matched: try again with spelling mistakes fixed ("raech 460", "head angel 65")
      if ((unsure(r) || /^Did you mean \*\*/.test(String(r))) && X().typofix) {
        const fixed = X().typofix(raw, ctx);
        if (fixed && norm(fixed) !== norm(raw)) { const r2 = inner(fixed); if (!unsure(r2)) return `_(read as “${fixed.trim()}”)_\n` + r2; }
      }
      state.pending = unsure(r) || /^Did you mean \*\*/.test(String(r)) ? state.pendingNext || null : (state.keepPending ? state.pending : null);
      state.pendingNext = null; state.keepPending = false;
      return r;
    }
    // one sentence after it has been tidied up: phrasebook first (chatplus.js), then the built-in commands
    function single(raw) {
      const text = norm(raw);
      for (const h of X().intents || []) { const r = h(raw, text, ctx); if (r) return r; }
      return one(raw);
    }

    function inner(raw) {
      const text = norm(raw);
      for (const h of X().intents || []) { const r = h(raw, text, ctx); if (r) return r; }
      if (/^(help|\?|what can you do|commands)\b/.test(text)) return help();
      if (/^(undo|go back|revert|oops)\b/.test(text)) return undo() ? "Undone." : "Nothing to undo.";
      if (/^redo\b/.test(text)) { const h = redo.pop(); if (!h) return "Nothing to redo."; hist.push({ before: snapshot(), label: h.label }); App.restore(h.before); App.refresh(); pendingReport = App.summary(); return "Redone."; }
      if (/^(list|show)( all)? (fields|settings|options)|^what can i change/.test(text)) {
        const by = {}; for (const f of fields()) (by[f.group] = by[f.group] || []).push(f.label);
        return Object.entries(by).map(([g, l]) => `**${g}**: ${l.join(", ")}`).join("\n");
      }
      if (/^what('?s| has| have)? changed|^(show )?changes\b|^diff\b/.test(text)) {
        const ch = App.diff(); return ch.length ? "Changed from the saved design:\n" + ch.map(c => `• ${c}`).join("\n") : "No changes from the saved design.";
      }
      let m;
      if (/^save( changes| it| this)?\.?$/.test(text)) return App.saveChanges();
      if (!/\bgarage\b/.test(text) && (m = text.match(/^(?:open|load|switch to|go to)\s+(.+)$/))) { const d = matchDesign(m[1]); if (!d) return `I couldn't find a design called “${m[1]}”. Designs: ${App.allDesigns().map(x => x.name).join(" · ")}`; App.openDesign(d.id); hist.length = 0; return `Opened **${d.name}**.`; }
      if ((m = text.match(/^compare(?: it)?(?: with| to| against)?\s+(.+)$/))) { const d = /\b(nothing|none|off)\b/.test(m[1]) ? { id: "", name: "nothing" } : matchDesign(m[1]); if (!d) return `I couldn't find a design called “${m[1]}”.`; App.compareWith(d.id); return `Comparing with **${d.name}**.`; }
      // a bike-fit report (Retül etc.) → the new-bike walkthrough's fit step (fitreport.js)
      if (/\b(ret[uü]l|bike ?fit|fit report|fitting report|fit sheet|my fit)\b/.test(text) && /\b(upload|load|start|use|import|from|open|build|design|new|base|add|read)\b/.test(text) && !/\b(what is|what's|explain)\b/.test(text)) {
        setTimeout(() => window.FrameNewBike && window.FrameNewBike.open({ step: "type", source: "fit" }), 50);
        return "Opening the new-bike walkthrough. Pick the kind of bike, wheels and tyres, then it goes straight to **Start from your bike fit**: drop in the PDF your fitter sent (Retül or similar) and your saddle and handlebar position become the frame's geometry.";
      }
      if (/^(new|start a new|make a new|create a new) (bike|project|design)\b/.test(text)) { setTimeout(() => window.FrameNewBike && window.FrameNewBike.open(), 50); return "Opening the new-bike walkthrough."; }
      if (/^(tutorial|tour|show me around|how do i (use|refine) (this|it)|refine tour)\b/.test(text)) { const t = /refine/.test(text) ? "refine" : "basics"; setTimeout(() => window.FrameTour && window.FrameTour.start(t), 50); return "Starting the tour."; }
      if (/^((open|show|go to|switch to) )?(the )?(fea|strength|simulation|strength simulation|engineering|stress) tab$/.test(text) && window.FrameJourney && FrameJourney.designTab) { FrameJourney.go("design"); FrameJourney.designTab("fea"); if (App.uiMode && App.uiMode() !== "eng" && App.setUiMode) App.setUiMode("eng"); return "Opened the **Strength (FEA)** tab in step 2 (Design). Remember: it's a simulation with estimates that may contain mistakes; your frame builder has the final say."; }
      if (/^((open|show|go to|switch to) )?(the )?(design|shape|geometry) tab$/.test(text) && window.FrameJourney && FrameJourney.designTab) { FrameJourney.go("design"); FrameJourney.designTab("design"); return "Back on the **Design** tab."; }
      if (/^(show |open |read )?(the )?((fea|simulation|strength|safety) )?disclaimer$|^is (this|it|the fea|frame bench|cyclic labs) (safe|accurate|reliable|certified)\??$|^can i trust (the|these) (fea|results|numbers|simulation)\??$/.test(text) && window.FrameJourney) { FrameJourney.open("w-disclaimer"); return "Cyclic Labs' strength numbers are **simulation estimates** from a simplified model. They may contain mistakes and are not an engineering approval or safety certification. Always have your frame builder or a qualified frame designer review the design. The full disclaimer is open."; }
      if (/^(engineering|design \+ engineering|fea|show (the )?(engineering|fea|stress)( results)?)( view| mode| on)?$/.test(text) && App.setUiMode) { App.setUiMode("eng"); try { window.FrameJourney && FrameJourney.designTab && FrameJourney.designTab("fea"); } catch (e) {} return App.uiMode && App.uiMode() === "eng" ? "Strength simulation is on: see the **Strength (FEA)** tab in Design and step 3 (Check). Estimates only, may contain mistakes; your frame builder has the final say." : "Please read the short simulation disclaimer first; tick the box and the **Strength (FEA)** tab fills in."; }
      if (/^(design|simple|hide (the )?(engineering|fea|stress)( results)?)( view| mode| only)?$/.test(text) && App.setUiMode) { App.setUiMode("simple"); return "Design view: engineering results hidden (they still run)."; }
      if (window.FrameTheme) {   // theme.js
        if (/^(dark|night|black)( mode| theme)?( on)?$|^(turn on |switch to )?(dark|night) (mode|theme)$/.test(text)) { FrameTheme.set("dark"); return "Night mode on. Say `light mode` to switch back, or `auto theme` to follow your computer."; }
        if (/^(light|day|white)( mode| theme)?( on)?$|^(turn on |switch to )?(light|day) (mode|theme)$|^(dark|night) mode off$/.test(text)) { FrameTheme.set("light"); return "Light mode on."; }
        if (/^(auto|system)( mode| theme)$/.test(text)) { FrameTheme.set("auto"); return "The theme now follows your computer's light/dark setting."; }
        if (/^(custom (colou?rs?|theme|mode)|(change|pick|set) (the )?(colou?rs?|theme))$/.test(text)) { FrameTheme.set("custom"); const m = document.getElementById("themeMenu"); if (m) m.open = true; return "Custom colours on. Pick a starting look or your own accent, background, panel and text colours in the Theme menu (top right)."; }
      }
      for (const h of (root.FrameChat && root.FrameChat.extra) || []) { const r = h(raw, text, { apply, fields, App }); if (r) return r; }   // add-on commands (overlay.js: "overlay my current bike")
      if (/^(realistic|analysis)( view| mode)?$|^(show|switch to) (the )?(realistic|analysis)/.test(text)) { const real = /realistic/.test(text); App.setReal(real); return real ? "Showing the realistic view." : "Showing the analysis view."; }

      // several requests in one line: "reach 460 and stack 640, head angle 65"
      const parts = raw.split(/\s*(?:;|,|\band\b|\bthen\b|\balso\b|\bplus\b(?=\s+[a-z]))\s*(?=[a-z])/i).filter(s => s.trim());
      const doable = p => /\d/.test(p) || /\b(no|remove|add|wishbone|straight|curved|slacker|steeper|longer|shorter|taller|lower|higher|raise|bigger|smaller|thicker|thinner|wider|narrower|more|less|rigid|dropper|mullet|flip|slam)\b/i.test(p);
      if (parts.length > 1 && parts.every(doable)) {
        const outs = []; for (const p of parts) outs.push(single(p));
        return outs.join("\n");
      }
      // several numbers with no separators: "reach 460 stack 650", "460 reach 650 stack"
      const chunks = numberChunks(text);
      if (chunks) return chunks.map(c => single(c)).join("\n");
      return one(raw);
    }
    function numberChunks(text) {
      if (/\d\s*(x|×|\*|\/|by|to|-|:)\s*\d|\bfrom\b|\bto\b|\bby\b|\bthen\b|%/.test(text)) return null;
      const nums = numbersIn(text); if (nums.length < 2) return null;
      for (let i = 1; i < nums.length; i++) if (!/[a-z]{2}/.test(text.slice(nums[i - 1].end, nums[i].at))) return null;
      const cut = /^\s*[+-]?\d/.test(text) ? nums.map(n => n.at) : [0].concat(nums.slice(0, -1).map(n => n.end));
      const out = []; for (let i = 0; i < cut.length; i++) out.push(text.slice(cut[i], cut[i + 1] == null ? undefined : cut[i + 1]).trim());
      const F = fields(), seen = new Set();
      for (const c of out) {
        if (numbersIn(c).length !== 1 || !/[a-z]{2}/.test(c.replace(/\b(mm|cm|deg|kg|lbs?|psi|in|inch|inches)\b/g, ""))) return null;
        const toks = words(c).filter(w => !STOP.has(w)), best = F.map(f => ({ f, s: scoreField(f, toks, c) })).sort((a, b) => b.s - a.s)[0];
        if (!best || best.s < 1 || seen.has(best.f.id)) return null; seen.add(best.f.id);
      }
      return out;
    }

    function one(raw) {
      const text = norm(raw), toks = words(text).filter(w => !STOP.has(w));
      const F = fields();
      const isQuery = /^(what|what's|whats|how (much|long|big|steep)|show me|tell me|current)\b/.test(text) || /\?\s*$/.test(raw);
      // ---- derived numbers people ask about
      if (isQuery) {
        const g = App.geometryInfo();
        const D = { trail: ["trail", "mm"], wheelbase: ["wheelbase", "mm"], "wheel base": ["wheelbase", "mm"], "effective top tube": ["effectiveTopTube", "mm"], ett: ["effectiveTopTube", "mm"], "front centre": ["frontCentre", "mm"], "front center": ["frontCentre", "mm"], "bb height": ["bbHeight", "mm"] };
        for (const [k, [key, u]] of Object.entries(D)) if (text.includes(k) && g && isFinite(g[key])) return `**${k[0].toUpperCase() + k.slice(1)}**: ${g[key].toFixed(1)} ${u} (worked out from the geometry).`;
        const s = App.summary();
        if (s && /\b(life|fatigue)\b/.test(text)) return `**Fatigue life**: ${s.life}.`;
        if (s && /\b(weight|mass|heavy)\b/.test(text) && !/rider|bike weight/.test(text)) return `**Tube weight**: ${s.mass}.`;
      }
      // ---- realistic-view parts ("use the Fox 34 SL fork")
      const pc = partCommand(text); if (pc) return pc;

      // ---- tube size shorthand: "down tube 44.5 x 1.2", "make the top tube 34.9x0.9", "seat stays 19 mm"
      const tube = findTube(text);
      const nums = numbersIn(text);
      const lengthTalk = /\b(length|long|longer|shorter|taller|lengthen|shorten)\b/.test(text);
      const sizeTalk = /\b(od|diameter|dia|size|wall|thickness|gauge|thick|thicker|thinner|butt|butted)\b|ø|\d\s*[x×*]\s*\d/.test(text);
      const relTalk = /\b(by|add|subtract|more|less|plus|minus)\b/.test(text) || (nums[0] && nums[0].signed);
      const scoredAll = F.map(f => ({ f, s: scoreField(f, toks, text) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
      const top = scoredAll[0];
      // a full-name match of a numeric, non-tube-size setting ("bb shell width 73", "chainstay 440") wins over tube sizes
      const strongOther = top && top.s >= 1.2 && top.f.kind === "num" && !/^tubes\.\w+\.(od|wall|buttWall|buttLength)$/.test(top.f.id);
      const hasGeo = tube && F.some(x => x.id === `geometry.${tube.k}`);
      let useTube = tube && !isQuery && nums.length >= 1;
      if (useTube && !sizeTalk) {
        if (strongOther && !(hasGeo && top.f.id === `geometry.${tube.k}` && nums[0].v < 40 && !lengthTalk && !relTalk)) useTube = false;
        if (hasGeo && (lengthTalk || relTalk || nums[0].v > 60)) useTube = false;
      }
      if (useTube) {
        const od = F.find(f => f.id === `tubes.${tube.k}.od`), wall = F.find(f => f.id === `tubes.${tube.k}.wall`);
        const xm = text.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*[x×*]\s*(\d+(?:\.\d+)?)/);
        if (xm && od && wall) return apply([{ f: od, v: +xm[1] }, { f: wall, v: +xm[2] }]);
        const wantsWall = /\b(wall|thickness|gauge|thick|thicker|thinner)\b/.test(text), wantsButt = /\b(butt|butted|end wall|ends)\b/.test(text);
        const wantsOd = /\b(od|diameter|dia|size|ø)\b/.test(text);
        if (nums.length === 1 && od) {
          const n = nums[0];
          let f = wantsWall ? wall : wantsOd ? od : (n.v < 4 ? wall : od);
          if (wantsButt) f = F.find(x => x.id === `tubes.${tube.k}.buttWall`) || f;
          if (f) {
            const rel = relDir(text, n);
            const v = rel ? f.get() + rel * convert(n, f) : convert(n, f);
            return apply([{ f, v: +(+v).toFixed(3) }]);
          }
        }
      }

      // ---- which field?
      const scored = F.map(f => ({ f, s: scoreField(f, toks, text) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
      let best = scored[0];
      // a select option named on its own: "wishbone seat stays", "trail riding", "savage"
      const optHit = [];
      const shapeTalk = /\b(teardrop|tear drop|biaxial|biax|ovali[sz]ed|oval|diamond|round|preset|(?:waltly|my builder|the builder|your builder|builder) list|hydroformed|tapered|single bend|double bend)\b/.test(text);
      for (const f of F) if (f.kind === "select" && (shapeTalk || !/^catalog\./.test(f.id))) for (const [val, lab] of f.options) {
        const lw = words(lab).filter(w => !STOP.has(w) && w.length > 2 && !/^\d/.test(w));
        if (!lw.length) continue;
        const hit = lw.filter(w => toks.some(t => same(t, w))).length, exact = lw.filter(w => toks.includes(w)).length;
        if (hit) optHit.push({ f, val, lab, s: hit / lw.length + hit * 0.1 + exact * 0.08 + (best && best.f === f ? 0.6 : 0) });
      }
      optHit.sort((a, b) => b.s - a.s);

      if (!best || best.s < 0.5) {
        if (optHit.length && optHit[0].s >= 0.6 && !isQuery) return apply([{ f: optHit[0].f, v: optHit[0].val }]);
        const sug = scored.slice(0, 3).map(x => `“${x.f.label}”`);
        if (scored.length && !isQuery) state.pendingNext = { kind: "field", options: scored.slice(0, 3).map(x => x.f.id), raw };
        return `I'm not sure which setting you mean.${sug.length ? " Did you mean " + sug.join(", ") + "?" : ""} Type \`list fields\` to see them all.`;
      }
      const close = scored.filter(x => x.f !== best.f && x.s >= best.s - 0.05);
      if (close.length && !isQuery && !optHit.length) state.pendingNext = { kind: "field", options: [best.f.id, close[0].f.id], raw };
      if (close.length && !isQuery && !optHit.length) return `Did you mean **${best.f.label}** or **${close[0].f.label}**? Say it with the full name, e.g. “${close[0].f.label.toLowerCase()} ${nums[0] ? nums[0].v : "…"}”.`;
      const f = best.f;
      // "front tyre diameter auto", "rear wheel size same as front" → back to the blank / automatic value
      const blankWord = /\b(auto|automatic|blank|clear|default|same as( the)? (rear|front|tyre|tire))\b/.test(text);
      if (!isQuery && blankWord && !nums.length && (f.allowBlank || (f.kind === "select" && f.options.some(o => o[0] === "")))) return apply([{ f, v: "" }]);
      // "slacker head angle", "longer chainstays", "a bit more reach": no number → a sensible step
      if (!isQuery && !nums.length && f.kind === "num") {
        const dir = relDir(text, null, true);
        if (dir) { const cur = +f.get() || 0, step = nudgeSize(f) * sizeWord(text); return apply([{ f, v: +(cur + dir * step).toFixed(3) }]); }
      }
      if (isQuery || (!nums.length && f.kind !== "select")) return describe(f);

      if (f.kind === "select") {
        // yes/no settings
        const yn = f.options.length === 2 && f.options.every(o => typeof o[0] === "boolean");
        if (yn) { const neg = toks.some(t => NEG.includes(t)) || /\b(no|off|false)\b/.test(text); const pos = !neg && (toks.some(t => POS.includes(t)) || /\b(yes|on|true)\b/.test(text)); if (neg || pos) return apply([{ f, v: !neg }]); }
        // number given for a numeric select (fork travel 130, severity 1.5)
        if (nums.length && f.options.some(o => typeof o[0] === "number")) {
          const v = convert(nums[nums.length - 1], f), o = f.options.reduce((a, b) => Math.abs(b[0] - v) < Math.abs(a[0] - v) ? b : a);
          if (Math.abs(o[0] - v) <= Math.max(0.01, Math.abs(v) * 0.02) || f.allowAny) return apply([{ f, v: f.allowAny ? v : o[0] }]);
          // the number names an option by its label ("front wheel size 29" → "29 inch / 700c (622)")
          const nv = nums[nums.length - 1].v, byLab = f.options.find(o => new RegExp("^" + String(nv).replace(".", "\\.") + "(\\b|\\s)").test(String(o[1])));
          if (byLab) return apply([{ f, v: byLab[0] }]);
          return `${f.label} can be ${f.options.map(o => o[1]).join(" · ")}.`;
        }
        const own = optHit.filter(o => o.f === f);
        if (own.length) return apply([{ f, v: own[0].val }]);
        return describe(f);
      }

      // numeric
      let n = nums[nums.length - 1];
      // "add 10 to the reach" → the number before the field name; "reach to 460" → the one after
      if (nums.length > 1) { const to = text.search(/\b(to|=)\b/); n = nums.find(x => x.at > to && to >= 0) || nums[nums.length - 1]; }
      const rel = relDir(text, n);
      let v = convert(n, f);
      if (n.unit === "%" && rel) v = f.get() * v / 100;
      if (rel) v = (+f.get() || 0) + rel * v;
      if (f.step && f.step >= 1 && !rel) v = Math.round(v * 10) / 10;
      return apply([{ f, v: +(+v).toFixed(3) }]);
    }

    // +1 / −1 for "increase / slacker / +10 / by 10", 0 for an absolute value
    function relDir(text, n, noNumber) {
      // field names that contain direction words must not count ("bb drop", "drop height", "lower headset cup", "bar rise", "drop bars")
      text = text.replace(/\b(bb|bottom bracket) drop\b|\bdrop height\b|\bdrop ?bars?\b|\blower (headset|cup)\b|\b(stem|bar) rise\b|\btop tube\b|\bdown tube\b|\bup ?(to|until)\b/g, " ");
      const t = words(text);
      const hasBy = /\bby\b/.test(text) || /\b(add|subtract|take|plus|minus|up|down)\b/.test(text) || /\b(more|less|longer|shorter|steeper|slacker|bigger|smaller|thicker|thinner|wider|narrower|higher|lower|taller|increase|decrease|reduce|raise|lengthen|shorten|steepen|slacken|extend|bump|nudge|boost|chop|shave|knock|trim|cut|drop|further)\b/.test(text);
      if (n && n.signed && !/\bto\b/.test(text)) return 1;   // "+10" / "-10": the sign is in the number
      if (/\bto\b/.test(text) && !/\b(add|subtract)\b/.test(text) && !noNumber) return 0;
      if (!hasBy) return 0;
      if (t.some(w => DOWN.some(d => same(d, w)))) return -1;
      if (t.some(w => UP.some(d => same(d, w)))) return 1;
      return 0;
    }

    return { handle, takeReport: () => { const r = pendingReport; pendingReport = null; return r; }, help, state, ctx };
  }

  // ---------------------------------------------------------------- the chat panel
  const css = `
  .dchat-btn { position: fixed; right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 40; border-radius: 99px; padding: 10px 16px; font-size: 14px; box-shadow: 0 4px 16px rgba(0,0,0,.18); }
  .dchat { position: fixed; right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 41; width: min(420px, calc(100vw - 32px)); height: min(560px, calc(100vh - 32px)); display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 10px 32px rgba(0,0,0,.22); }
  .dchat[hidden] { display: none; }
  .dchat .hd { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .dchat .hd b { font: 600 16px var(--font-display); flex: 1; }
  .dchat .hd small { color: var(--muted); font-weight: 400; font-size: 12px; margin-left: 6px; }
  .dchat .log { flex: 1; overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
  .dchat .m { max-width: 92%; padding: 7px 10px; border-radius: 10px; font-size: 14px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
  .dchat .m.me { align-self: flex-end; background: var(--accent); color: var(--on-accent); border-bottom-right-radius: 3px; }
  .dchat .m.bot { align-self: flex-start; background: var(--bg); border: 1px solid var(--line); border-bottom-left-radius: 3px; }
  .dchat .m.res { align-self: flex-start; color: var(--muted); font-size: 13px; background: transparent; padding: 0 4px; }
  .dchat .m code { font: 12.5px var(--font-data); background: color-mix(in srgb, var(--accent) 10%, transparent); padding: 0 3px; border-radius: 3px; }
  .dchat .chips { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 12px 8px; }
  .dchat .chips button { font-weight: 400; font-size: 12.5px; padding: 3px 8px; border-radius: 99px; }
  .dchat form { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--line); }
  .dchat form input { flex: 1; font-size: 14px; padding: 7px 9px; }
  `;
  function md(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/(^|\s)_(.+?)_(?=\s|$|[.,])/g, "$1<i>$2</i>"); }

  function mount(App) {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "primary dchat-btn"; btn.textContent = "💬 Design chat";
    btn.title = "Change the design by typing, e.g. “change the reach to 460”";
    const box = document.createElement("section"); box.className = "dchat"; box.hidden = true; box.setAttribute("aria-label", "Design chat");
    box.innerHTML = `<div class="hd"><b>Design chat<small>offline · no AI model</small></b><button type="button" data-close aria-label="Close chat">✕</button></div>
      <div class="log" role="log" aria-live="polite"></div>
      <div class="chips">${["change the reach to 460", "head angle 1° slacker", "down tube 44.5 x 1.2", "what's the trail?", "undo", "help"].map(t => `<button type="button">${t}</button>`).join("")}</div>
      <form><input aria-label="Type a change" placeholder="e.g. change the reach to 460" autocomplete="off"><button class="primary">Send</button></form>`;
    document.body.appendChild(btn); document.body.appendChild(box);
    const log = box.querySelector(".log"), inp = box.querySelector("input");
    const E = makeEngine(App);
    const say = (who, t) => { const d = document.createElement("div"); d.className = "m " + who; d.innerHTML = md(t); log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
    let hello = false;
    const openBox = () => { box.hidden = false; btn.hidden = true; if (!hello) { hello = true; say("bot", "Hi! Tell me what to change on **" + App.designName() + "**, e.g. “change the reach to 460” or “make the down tube 44.5 x 1.2”. Type `help` for more."); } inp.focus(); };
    btn.onclick = openBox;
    box.querySelector("[data-close]").onclick = () => { box.hidden = true; btn.hidden = false; };
    const send = t => {
      if (!t.trim()) return;
      say("me", t);
      let r; try { r = E.handle(t); } catch (e) { console.error(e); r = "Something went wrong there: " + e.message; }
      if (r === "\u0001CLEAR") { log.innerHTML = ""; say("bot", "Chat cleared. Your design and undo history are unchanged."); r = null; }
      if (r) say("bot", r);
      // the analysis re-runs a moment later: report the headline results
      const before = E.takeReport();
      if (before) App.afterRun(() => {
        const after = App.summary(); if (!after) return;
        const bits = [];
        if (before.life !== after.life) bits.push(`fatigue life ${before.life} → ${after.life}`);
        if (before.mass !== after.mass) bits.push(`tube weight ${before.mass} → ${after.mass}`);
        if (before.iso !== after.iso) bits.push(`lab tests: ${after.iso}`);
        if (before.landing !== after.landing) bits.push(`flat-landing limit ${before.landing} → ${after.landing}`);
        if (bits.length) say("res", "Results: " + bits.join(" · "));
      });
    };
    box.querySelector("form").onsubmit = e => { e.preventDefault(); const t = inp.value; inp.value = ""; send(t); };
    box.querySelectorAll(".chips button").forEach(b => b.onclick = () => send(b.textContent));
    return { open: openBox, send, engine: E };
  }

  root.FrameChat = { mount, makeEngine, SYNONYMS, TUBE_NAMES, extra: [] };   // extra: add-on command handlers (raw, text) → reply or null
})(typeof window !== "undefined" ? window : globalThis);
