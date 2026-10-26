// ============================================================================
//  DESIGN CHAT PHRASEBOOK, PART 2 (chatmore.js) — offline, no AI model
//  More hard-coded ways people talk about a custom frame, layered on top of
//  chat.js and chatplus.js (load after both). What it adds:
//   • tidy()        polite filler ("could you please…", "…thanks mate"), chart
//                   abbreviations (HA, SA, CS, ST, HT, WB, BBD, DT, TT, S/R),
//                   "+10 reach", "32-18 gearing", "170s", "6 foot 2", "25psi"
//   • what if …     "what if the reach was 470", "try a 435 chainstay"
//   • keep …        "slacker head angle but keep the trail", "reach 470, same wheelbase"
//   • borrow        "copy the reach from my gravel bike", "same tubes as the stiff variant"
//   • standards     T47 / BSA / PF30 / BB30 / BB86 shells, 44/56 · 44 straight ·
//                   52/52 · 42/52 head tubes, external or zero-stack lower cup
//   • your builder notes  things the 3D model doesn't draw (Boost/142 hub, UDH, routing,
//                   bottle/rack/mudguard mounts, ISCG, couplers, belt, finish,
//                   logos, free text "note: …") → listed in "what should I send your builder"
//   • more edits    saddle up/back, chainline presets, rotors, shoes and pedals,
//                   rider weight changes, ISO test level, tyre pressure, bars
//                   back/forward, flat/riser bars, dropped stays, standover,
//                   several tubes at once, gear inches, fork offset presets,
//                   "make it a gravel bike", "new road bike size M"
//   • questions     "how wide are the bars", "what did I change", "compare reach
//                   with my gravel bike", "redo twice", "more help"
//  Every edit goes through chat.js apply() (validated, reported old → new,
//  undoable) or records its own undo step.
// ============================================================================
(function (root) {
  "use strict";
  const FC = root.FrameChat; if (!FC || !FC._plus) return;
  const P = FC._plus;
  const { setMany, topField, baselineDesign, getPath, isQ, slashText, lenMM, geo, D, r1, r2, mm } = P;
  const clone = o => JSON.parse(JSON.stringify(o));
  const yes = v => v === true || v === "true";

  // ---------------------------------------------------------------- 1. tidy the sentence
  function pre(s) {
    return String(s).replace(/(\d)\s*[x×]\s*(?=\d)/gi, "$1 x ").replace(/\bw\/o\b/gi, "without").replace(/\bw\/(?=\s|[a-z])/gi, "with ").replace(/\s&\s/g, " and ");
  }
  const LEAD = new RegExp("^(?:" + [
    "(?:please|pls|plz|kindly|hey|hiya|ok|okay|so|alright|um+|uh+|erm+|hmm+|well|oh|actually|honestly|basically|right then)\\b[,!.]?\\s+",
    "(?:can|could|would|will) (?:you|u|ya)(?: please| pls| maybe)*\\s+",
    "would you mind\\s+",
    "(?:i'?d|i would) (?:like|love|prefer)(?: (?:it|you))?(?: to)?\\s+",
    "i (?:want|wanna|need)(?: you)? to\\s+",
    "i (?:think|reckon|guess|suppose|feel like)(?: that)?\\s+",
    "(?:let'?s|lets|let us)(?! see\\b)\\s+",
    "(?:can|could|shall|should) we(?: maybe| please| probably)*\\s+",
    "we (?:should|could|need to|ought to)(?: probably| maybe)*\\s+",
    "(?:maybe|perhaps|probably|go ahead and|try and|try to|i'?ll|i will)\\s+"].join("|") + ")");
  const TRAIL = /(?:[,\s]+(?:please|pls|plz|thanks|thank you|thx|ty|cheers|mate|bro|dude|for me|if you can|if possible|if you could|if that'?s ok(?:ay)?|when you can|ta))+[.!]*$/;
  // abbreviations from geometry charts, only when a number (or "?") follows so "ha ha" stays a laugh
  const AB_NEXT = "(?=\\s*(?:to\\s+|at\\s+|of\\s+)?[-+]?\\d|\\s*\\?|\\s*$|\\s+(?:wall|od|length|angle|thickness)\\b)";
  const ABBR = [["ha|hta", "head angle"], ["sa|sta", "seat angle"], ["cs", "chainstay"], ["st|stl", "seat tube"], ["ht|htl", "head tube"], ["bbd", "bb drop"], ["bbh", "bb height"],
    ["wb", "wheelbase"], ["dt", "down tube"], ["tt", "top tube"], ["fc", "front center"], ["ss(?=\\s*(?:\\d|wall|od|tubes?))", "seat stays"]].map(([a, b]) => [new RegExp("\\b(?:" + a + ")\\b" + AB_NEXT, "g"), b]);
  function post(s) {
    let prev = null;
    while (prev !== s) { prev = s; const n = s.replace(LEAD, ""); if (n.trim()) s = n; const n2 = s.replace(TRAIL, ""); if (n2.trim()) s = n2; }
    s = s.replace(/[.!]+$/, "").replace(/^making\b/, "make").trim();
    s = s.replace(/\bs ?\/ ?r\b/g, "stack to reach");
    for (const [re, to] of ABBR) s = s.replace(re, to);
    // "6 foot 2" (a height)
    s = s.replace(/(\d)\s*(?:foot|feet)\s+(\d{1,2})(?:\s*in)?\b/g, "$1 ft $2 in");
    // units stuck to the number: 25psi, 5kg
    s = s.replace(/(\d)(psi|kg|lb|mm|cm|rpm)\b/g, "$1 $2");
    // "32-18 gearing"
    if (/\b(gear|gears|gearing|singlespeed|single speed|ss|ratio)\b/.test(s)) s = s.replace(/\b(\d{2})\s*-\s*(\d{1,2})\b/g, "$1/$2");
    s = s.replace(/^(?:go|switch|change|move) to (?=[-+]?\d)/, "");
    // "go to 170s" → cranks
    s = s.replace(/\b(1[5-8]\d(?:\.5)?)s\b(?!\s*(?:cranks?|crank arms?))/g, "$1 mm cranks");
    // "+10 reach", "-1 head angle", "+5mm chainstays"
    const m = s.match(/^([+-]\d+(?:\.\d+)?)\s*(mm|cm|°|in|kg)?\s+(?:on |to |for |off )?(?:the |my )?([a-z][a-z .'-]*)$/);
    if (m && !/\b(more|less|longer|shorter)\b/.test(m[3])) s = `${m[3].trim()} ${m[1]}${m[2] ? " " + m[2] : ""}`;
    // "what did I change" → chat.js "what changed"
    if (/^(what did (i|we) change|list (my|the) changes|what have (i|we) changed|show (me )?(my|the) changes|my changes|what'?s different( now)?|what('s| is) changed)\??$/.test(s)) s = "what changed";
    return s.replace(/\s+/g, " ").trim();
  }
  const baseRewrite = FC.rewrite || (x => x);
  FC.rewrite = (raw, ctx) => post(baseRewrite(pre(raw), ctx));

  // ---------------------------------------------------------------- helpers
  const I = []; const on = fn => I.push(fn);
  const fieldVal = (ctx, id) => { const f = ctx.fld(id); return f ? f.get() : undefined; };
  const label = (ctx, id) => { const f = ctx.fld(id); return f ? f.label : id; };
  const show = (ctx, id) => { const f = ctx.fld(id); return f ? ctx.fmtV(f.get(), f) : "—"; };
  // an edit made by changing the design object directly, as one undo step
  function editDesign(ctx, lbl, fn) {
    const before = ctx.snapshot(), d = ctx.App.design();
    fn(d);
    try { ctx.App.validate(); } catch (e) { ctx.App.restore(before); ctx.App.refresh(); return { err: e.message }; }
    ctx.hist.push({ before, label: lbl }); ctx.redo.length = 0; ctx.App.refresh(); ctx.report(); ctx.state.last = null;
    return { ok: true };
  }
  // merge every undo step since index h0 into one
  function squash(ctx, h0, lbl) { if (ctx.hist.length - h0 > 1) { const first = ctx.hist[h0]; ctx.hist.splice(h0); ctx.hist.push({ before: first.before, label: lbl }); } }

  // ---------------------------------------------------------------- 2. notes for your builder
  const notesOf = ctx => (ctx.App.design().orderNotes || []);
  // add or replace a note (same key replaces). attach=true: part of the change just made (no new undo step)
  function setNote(ctx, key, text, attach) {
    const put = d => { const l = (d.orderNotes || []).filter(n => !(key && n.k === key)); l.push({ k: key || "free-" + Date.now().toString(36), text }); d.orderNotes = l; };
    if (attach) { put(ctx.App.design()); return; }
    editDesign(ctx, "note", put);
  }
  const NOTE_HINT = "\n_Saved as a note for your builder: it shows in `what should I send my builder`. `show my notes` lists them, `remove the … note` takes one out._";
  function noteReply(ctx, key, text, extra) {
    const had = notesOf(ctx).find(n => n.k === key);
    setNote(ctx, key, text);
    return `**Note for your builder**: ${had && had.text !== text ? `${had.text} → ` : ""}${text}${extra ? "\n" + extra : ""}` + NOTE_HINT;
  }
  const ORD = { one: 1, single: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5 };
  const NOTES = [
    // rear hub / axle
    { re: /\bsuper ?boost\b|\b157\b/, ctx: /\b(rear|hub|spacing|axle|boost|dropouts?|old|thru ?axle)\b/, k: "hub", text: () => "Rear hub: 157 × 12 mm Super Boost thru-axle", tip: "Super Boost moves the chainline out (about 56.5 mm): `chainline 56.5`." },
    { re: /\bboost\b|\b148\b/, ctx: /\b(rear|hub|spacing|axle|boost|dropouts?|old|thru ?axle|x ?12)\b/, not: /\bchain ?line\b|\bfork\b|\bfront\b/, k: "hub", text: () => "Rear hub: 148 × 12 mm Boost thru-axle", tip: "Boost cranks usually run a 52 mm chainline (`boost chainline`)." },
    { re: /\b142\b/, ctx: /\b(rear|hub|spacing|axle|dropouts?|old|thru ?axle|x ?12)\b/, k: "hub", text: () => "Rear hub: 142 × 12 mm thru-axle" },
    { re: /\b135\b/, ctx: /\b(rear|hub|spacing|axle|dropouts?|old|qr|quick release)\b/, k: "hub", text: t => /\b(qr|quick ?release|skewer)\b/.test(t) ? "Rear hub: 135 mm quick release" : "Rear hub: 135 mm (ask your builder: quick release or 12 mm thru-axle)" },
    { re: /\b(qr|quick ?release)\b/, ctx: /\b(rear|hub|dropouts?|axle|wheel)\b/, not: /\b135\b/, k: "hub", text: () => "Rear hub: 135 mm quick release" },
    { re: /\budh\b|universal derailleur hanger|\bt ?type\b|\bsram transmission\b|\btransmission\b/, k: "udh", text: () => "Rear dropout: SRAM UDH (Universal Derailleur Hanger) — needed for SRAM Transmission / T-Type" },
    { re: /\breplaceable (derailleur )?hanger\b|\bbolt ?on hanger\b/, k: "udh", text: () => "Replaceable (bolt-on) derailleur hanger" },
    // routing
    { re: /\b(rout(e|ing|ed)|cables?|hoses?|lines?|di ?2|wires?)\b/, ctx: /\b(internal(ly)?|external(ly)?|stealth|through the (headset|frame|down tube|bb)|hidden|inside)\b/, k: t => "routing" + (/\bdropper\b/.test(t) ? ":dropper" : /\bbrake|hose/.test(t) ? ":brake" : /\b(gear|shift|derailleur|di ?2)/.test(t) ? ":gear" : ""),
      text: t => {
        const type = /\bthrough the headset\b/.test(t) ? "Internal routing through the headset" : /\b(external(ly)?|outside|guides?)\b/.test(t) ? "External routing (guides / bosses on the frame)" : "Internal routing";
        const what = [/\bbrake|hose/.test(t) && "rear brake", /\b(gear|shift|derailleur)/.test(t) && "gear cable", /\bdi ?2|electronic|wires?\b/.test(t) && "Di2 wire", /\bdropper\b/.test(t) && "dropper (stealth, port in the seat tube)"].filter(Boolean);
        return `${type}${what.length ? ": " + what.join(", ") : ""}`;
      }, tip: t => /\bthrough the headset\b/.test(t) ? "Routing through the headset needs a 52/52 or 42/52 head tube (`52/52 head tube`)." : /\binternal|stealth\b/.test(t) ? "Internal lines through the BB area suit a T47 shell (`T47 bb`)." : "" },
    { re: /\bstealth\b|\binternal dropper\b|\bdropper (routing|port)\b/, k: "routing:dropper", text: () => "Internal dropper routing (stealth), port in the seat tube" },
    // mounts
    { re: /\bbottles?\b/, ctx: /\b(mounts?|bosses|cages?|holders?|bolts?|\d|one|two|three|four|five|second|third|fourth|fifth|extra|another|under)\b/, k: "bottles",
      text: t => { if (/\b(no|without|zero)\b/.test(t)) return "No bottle mounts"; const n = (t.match(/\b(\d)\b/) || [])[1] || Object.keys(ORD).find(w => new RegExp("\\b" + w + "\\b").test(t)); const c = n ? (ORD[n] || +n) : null; const under = /\bunder|beneath|bottom of the down tube\b/.test(t);
        return `${c ? c + " bottle mounts" : "Bottle mounts"}${under ? " (one under the down tube)" : c === 3 ? " (third one under the down tube?)" : ""}`; } },
    { re: /\brack\b/, ctx: /\b(mounts?|bosses|eyelets|braze ?ons?|bolts?|tabs)\b/, k: t => /\bfront\b/.test(t) ? "rack:front" : "rack", text: t => /\b(no|without|skip|don'?t (want|need))\b/.test(t) ? "No rack mounts" : /\bfront\b/.test(t) ? "Front rack mounts (on the fork — tell your builder if they make the fork)" : "Rear rack mounts (seat stay bosses + eyelets at the dropouts)" },
    { re: /\b(mudguards?|fenders?)\b/, ctx: /\b(mounts?|eyelets|bosses|braze ?ons?|tabs|bolts?)\b/, k: "mudguard", text: t => /\b(no|without|skip|don'?t (want|need))\b/.test(t) ? "No mudguard (fender) mounts" : "Mudguard (fender) mounts: eyelets at the dropouts, a boss on the seat-stay bridge and a chainstay bridge" },
    { re: /\b(top ?tube|bento)\b.*\b(bag|bolts?|mounts?|bosses)\b/, not: /\b(od|wall|length|\d+\s*mm)\b/, k: "ttbag", text: () => "Top tube bag bolts (bento box mount) just behind the head tube" },
    { re: /\b(anything|cargo|bikepacking) cage\b|\bfork (mounts|bosses|cage mounts)\b/, k: "forkcage", text: () => "Cargo / Anything-cage mounts on the fork legs" },
    { re: /\biscg( ?0?5)?\b|\bchain ?guide (mounts?|tabs)\b/, k: "iscg", text: () => "ISCG-05 chain guide tabs on the BB shell" },
    { re: /\bkick ?stand\b/, k: "kickstand", text: () => "Kickstand plate between the chainstays" },
    { re: /\bpump (peg|mount|bosses)\b/, k: "pump", text: () => "Frame pump peg" },
    { re: /\bdynamo\b/, k: "dynamo", text: () => "Dynamo light wire routing (internal through the fork/down tube)" },
    { re: /\bchain ?stay (protector|guard)\b|\bchain slap\b/, k: "csguard", text: () => "Chainstay protector / chain-slap guard" },
    // drivetrain
    { re: /\b(front derailleur|front mech|fd)\b|\b(1x|1 x|one by|single ring) only\b/, k: "fd", text: t => /\b(no|without|1x|1 x|one by|single ring)\b/.test(t) ? "1× only: no front derailleur mount" : "Front derailleur mount (2×) — give your builder the chainring sizes" },
    { re: /\b2x\b|\b2 x\b|\bdouble chainring\b/, ctx: /\b(drivetrain|crank|chainrings?|setup|gearing|groupset)\b/, k: "fd", text: () => "Front derailleur mount (2×) — give your builder the chainring sizes" },
    { re: /\bcouplers?\b|\bs and s\b|\bs ?& ?s\b|\btravel (frame|bike) (split|that splits)\b/, k: "couplers", text: () => "S&S couplers (travel frame that splits in two)" },
    { re: /\bbelt( drive)?\b|\bgates (belt|carbon drive)\b/, not: /\bseat ?belt\b/, k: "belt", text: () => "Belt drive: splittable seat stay (or chainstay) and belt-line clearance", tip: "A belt can't be threaded through a closed rear triangle, so the frame needs a split stay. Tension with sliders or an eccentric BB." },
    { re: /\brohloff\b/, k: "hubgear", text: () => "Rohloff hub: dropouts for the OEM2 axle plate (or a torque arm) + chain tensioning (sliders or EBB)" },
    { re: /\bpinion\b|\bgearbox\b/, k: "hubgear", text: () => "Pinion gearbox mount instead of a BB shell (ask your builder for their mount drawing)" },
    { re: /\b(eccentric (bb|bottom bracket)|ebb)\b/, k: "ebb", text: () => "Eccentric BB (EBB) for chain tension" },
    // finish and logos
    { re: /\b(brushed|polished|mirror|bead ?blast(ed)?|sand ?blast(ed)?|satin|anodi[sz]ed|painted|cerakote|raw|matte?|gloss)\b/, ctx: /\b(finish|frame|look|colou?r|paint|polish|brushed|bead|blast|anodi)/, not: /\b(seat ?post|bars?|stem|logos?|decals?)\b/, k: "finish",
      text: t => { const f = (t.match(/\b(brushed|polished|mirror|bead ?blast(?:ed)?|sand ?blast(?:ed)?|satin|anodi[sz]ed|painted|cerakote|raw|matte?|gloss)\b/) || [])[1].replace(/ /, "-"); return `Finish: ${f[0].toUpperCase() + f.slice(1)}`; } },
    { re: /\b(logos?|decals?|stickers|branding|graphics)\b/, k: "logo",
      text: t => /\b(no|without|none|plain|clean)\b/.test(t) ? "No logos or decals" : /\b(engrav|etch|laser)/.test(t) ? "Engraved / etched logos" : /\banodi/.test(t) ? "Anodised logos" : /\b(my own|custom|personal)\b/.test(t) ? "Custom logo (I'll send the artwork)" : "Logos: as standard" }
  ];
  on((raw, t, ctx) => {
    if (isQ(raw, t) && !/\b(add|want|need|with|fit|give|put|use|make)\b/.test(t)) return null;
    if (/^(what|how|why)\b/.test(t)) return null;
    for (const n of NOTES) {
      if (!n.re.test(t) || (n.ctx && !n.ctx.test(t)) || (n.not && n.not.test(t))) continue;
      const key = typeof n.k === "function" ? n.k(t) : n.k, text = n.text(t), tip = typeof n.tip === "function" ? n.tip(t) : n.tip;
      return noteReply(ctx, key, text, tip ? "_" + tip + "_" : "");
    }
    return null;
  });
  // show / clear / remove notes
  on((raw, t, ctx) => {
    let m;
    if (/^(show|list|read|see|view|what are|what're)( me)?( all)?( my| the)?( (?:waltly|my builder|the builder|your builder|builder)| order| builder)? notes\??$|^(my |(?:waltly|my builder|the builder|your builder|builder) |order )?notes\??$/.test(t)) {
      const l = notesOf(ctx); return l.length ? "**Notes for your builder**:\n" + l.map((n, i) => `${i + 1}. ${n.text}`).join("\n") + "\n_`remove note 2` or `remove the rack note` to take one out; `clear the notes` for all._" : "No notes yet. Things like `boost rear`, `3 bottle mounts`, `internal routing` or `note: …` add them.";
    }
    if (/^(clear|delete|remove|wipe|erase|reset|drop)( all)?( of)?( the| my)?( (?:waltly|my builder|the builder|your builder|builder)| order)? notes$/.test(t)) {
      if (!notesOf(ctx).length) return "There are no notes to clear.";
      editDesign(ctx, "clear notes", d => { d.orderNotes = []; }); return "Cleared all the notes for your builder. (`undo` brings them back.)";
    }
    if ((m = t.match(/^(?:remove|delete|drop|forget|scrap|take out|cancel|get rid of)(?: the)? (?:note (\d+)|(.+?) note|note (?:about|on|for) (.+))$/))) {
      const l = notesOf(ctx); if (!l.length) return "There are no notes yet.";
      let i = -1;
      if (m[1]) i = +m[1] - 1;
      else { const q = ctx.words(m[2] || m[3]).filter(w => w.length > 2); i = l.findIndex(n => q.some(w => n.text.toLowerCase().includes(w) || n.k.includes(w))); }
      if (!l[i]) return "I couldn't find that note. `show my notes` lists them.";
      const gone = l[i]; editDesign(ctx, "remove note", d => { d.orderNotes = l.filter((_, j) => j !== i); });
      return `Removed the note “${gone.text}”.`;
    }
    return null;
  });

  // ---------------------------------------------------------------- 3. what if / try
  on((raw, t, ctx) => {
    let m = t.match(/^(?:what if|what happens if|what would happen if|how about if|suppose|supposing|imagine|let'?s see|lets see|let me see|let me try|show me what happens if|try)\s+(.+?)\??$/), rest;
    if (m) rest = m[1];
    else if ((m = t.match(/^what (?:would|does|will|do) (.+?) do(?: to (?:it|the bike|the handling|the steering))?\??$/))) rest = m[1];
    else return null;
    rest = rest.replace(/^(?:i|we|you)\s+(?:made|make|set|changed?|used?|had|have|went to|go to|go|put|fitted|fit|ran|run|tried|try)\s+/, "make ")
      .replace(/^(?:it|the bike|the frame) had\s+/, "").replace(/^(?:a|an|the)\s+(?=\d)/, "")
      .replace(/\s+(?:was|were|is|are|became|went to|to be|of)\s+(?=[-+]?\d)/, " ").replace(/\s+(?:do|does|change|look like|feel like|be like)$/, "");
    if (!rest || rest === t) return null;
    const h0 = ctx.hist.length, r = ctx.inner(rest);
    if (/^I'm not sure which setting|^Did you mean \*\*/.test(String(r))) return null;
    return ctx.hist.length > h0 ? r + "\n_Say `undo` to go back._" : r;
  });

  // ---------------------------------------------------------------- 5. borrow from another design
  const GEO_IDS = ["geometry.reach", "geometry.stack", "geometry.headAngle", "geometry.seatAngle", "geometry.chainstay", "geometry.bbDrop", "geometry.headTube", "geometry.seatTube", "geometry.forkA2C", "geometry.forkOffset"];
  const WHEEL_IDS = ["geometry.rimBSD", "geometry.rimBSDFront", "geometry.tireDiameter", "geometry.tireDiameterFront", "geometry.tireWidth", "parts.tyreWidth"];
  const FORK_IDS = ["geometry.forkA2C", "geometry.forkOffset", "use.forkTravel"];
  const COCKPIT_IDS = ["parts.stemLength", "parts.stemRise", "parts.spacers", "parts.barWidth", "parts.barRise", "parts.backsweep"];
  const FIT_IDS = ["geometry.saddleHeight", "geometry.saddleSetback", "geometry.crankLength"].concat(COCKPIT_IDS);
  const TUBE_KEYS = ["topTube", "downTube", "seatTube", "headTube", "chainstay", "seatStay", "bbShell", "ssBridge", "ssMono", "csYoke"];
  function borrow(ctx, what, d) {
    const src = d.design, name = d.name;
    const ids = /\b(geometry|geo|numbers|angles and lengths|frame size|sizing)\b/.test(what) ? GEO_IDS : /\b(wheels?|tires?|tyres?|rubber)\b/.test(what) ? WHEEL_IDS
      : /^(the )?fork$/.test(what) ? FORK_IDS : /\b(cockpit|stem and bars?|bars? and stem)\b/.test(what) ? COCKPIT_IDS : /\b(fit|position|contact points|saddle and bars)\b/.test(what) ? FIT_IDS : null;
    const tubeAll = /\b(tubes|tube ?set|tubing|tube sizes|walls)\b/.test(what) && !ctx.findTube(what.replace(/\btubes\b/, ""));
    const tube = !tubeAll && !ids ? ctx.findTube(what) : null;
    if (tubeAll || (tube && TUBE_KEYS.includes(tube.k) && !/\b(length|angle|long)\b/.test(what))) {
      const keys = tubeAll ? TUBE_KEYS : [tube.k];
      const r = editDesign(ctx, "copy tubes", x => { for (const k of keys) if (src.tubes && src.tubes[k]) x.tubes[k] = clone(src.tubes[k]); if (tubeAll && src.catalog) x.catalog = clone(src.catalog); });
      if (r.err) return `I didn't copy them: ${r.err}`;
      return `Copied the ${tubeAll ? "frame tubes" : tube.name || tube.k} from **${name}**:\n` + keys.filter(k => src.tubes && src.tubes[k]).map(k => `• ${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${src.tubes[k].od ? "Ø" + src.tubes[k].od : ""}${src.tubes[k].h ? ` ${src.tubes[k].h}×${src.tubes[k].w}` : ""} × ${src.tubes[k].wall} mm`).join("\n");
    }
    let list = ids;
    if (!list) {
      list = []; for (const part of what.split(/\s*(?:,|\band\b|&)\s*/)) { const f = topField(ctx, part); if (!f) return null; list.push(f.id); }
    }
    const pairs = list.map(id => [id, getPath(src, id)]).filter(([, v]) => v !== undefined);
    if (!pairs.length) return `**${name}** doesn't have that setting.`;
    const r = setMany(ctx, pairs, "copy from " + name);
    return /^\*\*/.test(r) ? r + `\n_From **${name}**._` : r;
  }
  on((raw, t, ctx) => {
    let m, what, from;
    if ((m = t.match(/^(?:copy|use|take|steal|borrow|grab|bring over|import|apply|match)\s+(?:the |my |a |an )?(.+?)'s\s+(.+)$/))) { from = m[1]; what = m[2]; }
    else if ((m = t.match(/^(?:copy|use|take|steal|borrow|grab|bring over|import|apply)\s+(?:over\s+)?(?:the |my )?(.+?)\s+(?:from|off|of|on|used on|on the)\s+(?:the |my )?(.+)$/))) { what = m[1]; from = m[2]; }
    else if ((m = t.match(/^(?:match|copy)\s+(?:the |my )?(.+?)\s+(?:of|from|on|to)\s+(?:the |my )?(.+)$/))) { what = m[1]; from = m[2]; }
    else if ((m = t.match(/^(?:same|matching|identical)\s+(?:the |my )?(.+?)\s+(?:as|to|like)\s+(?:the |on the |on my |my )?(.+)$/))) { what = m[1]; from = m[2]; }
    else if ((m = t.match(/^(?:make |set |give it )?(?:the |my )?(.+?)\s+(?:the )?same as\s+(?:the |on the |on my |my )?(.+)$/))) { what = m[1]; from = m[2]; }
    else return null;
    from = from.replace(/\b(design|bike|frame|one)\b/g, " ").trim(); what = what.trim();
    if (!from || /^(it|this|that|before|saved|original)$/.test(from)) return null;
    const d = ctx.matchDesign(from); if (!d) return null;
    if (d.id === ctx.App.currentId()) return null;
    return borrow(ctx, what, d);
  });
  // "compare reach with my gravel bike"
  on((raw, t, ctx) => {
    const m = t.match(/^(?:compare|how does|how do)\s+(?:the |my )?(.+?)\s+(?:compare\s+)?(?:with|to|against|vs|versus)\s+(?:the |my )?(.+?)\??$/); if (!m) return null;
    const what = m[1], d = ctx.matchDesign(m[2].replace(/\b(design|bike|frame|one)\b/g, " ")); if (!d) return null;
    const ids = /\b(geometry|geo)\b/.test(what) ? GEO_IDS : what.split(/\s*(?:,|\band\b)\s*/).map(p => topField(ctx, p)).filter(Boolean).map(f => f.id);
    if (!ids.length) return null;
    return `**This design vs ${d.name}**:\n` + ids.map(id => { const f = ctx.fld(id), a = f.get(), b = getPath(d.design, id); const dv = isFinite(+a) && isFinite(+b) && a !== "" && b !== "" ? +(+a - +b).toFixed(2) : null;
      return `• ${f.label}: ${ctx.fmtV(a, f)} here, ${ctx.fmtV(b, f)} there${dv ? ` (${dv > 0 ? "+" : ""}${dv})` : dv === 0 ? " (same)" : ""}`; }).join("\n") + "\n_`copy the … from " + d.name.split(/\s[–-]\s/)[0] + "` takes their value._";
  });

  // ---------------------------------------------------------------- 4. change one thing, keep another
  const KEEP = [
    { key: "trail", re: /\btrail\b/, levers: ["geometry.forkOffset", "geometry.headAngle", "geometry.forkA2C"], name: "trail" },
    { key: "wheelbase", re: /\bwheel ?base\b/, levers: ["geometry.chainstay", "geometry.reach"], name: "wheelbase" },
    { key: "bbHeight", re: /\b(bb|bottom bracket) height\b|\bbb\b(?! drop)/, levers: ["geometry.bbDrop"], name: "BB height" },
    { key: "frontCentre", re: /\bfront cent(er|re)\b/, levers: ["geometry.headAngle", "geometry.forkOffset", "geometry.reach"], name: "front centre" },
    { key: "effectiveTopTube", re: /\b(ett|effective top tube|top tube length|virtual top tube)\b/, levers: ["geometry.reach", "geometry.seatAngle"], name: "effective top tube" }
  ];
  const KEEP_RE = /(?:,\s*|\s+)(?:but |and |while |whilst |yet |though |with )?(?:keep(?:ing)?|hold(?:ing)?|maintain(?:ing)?|preserv(?:e|ing)|lock(?:ing)?|without (?:changing|touching|altering|moving)|don'?t (?:change|touch|alter|move)|not changing|leave|leaving)\s+(?:the |my |it'?s |its )?(.+?)(?:\s+(?:the same|same|constant|fixed|unchanged|as it is|as is|where it is|alone|untouched|as before))?$|(?:,\s*|\s+)(?:but |and |with )?(?:the )?same ([a-z ]+?)$/;
  on((raw, t, ctx) => {
    const m = t.match(KEEP_RE); if (!m) return null;
    const what = (m[1] || m[2] || "").trim(), main = t.slice(0, m.index).trim();
    if (!main || !/[a-z]/.test(main) || /^(it|this|that|going|on|as|to|like|again)\b/.test(what)) return null;
    const K = KEEP.find(k => k.re.test(what)), F = K ? null : topField(ctx, what);
    if (!K && !F) return null;
    const g0 = K ? geo(ctx)[K.key] : null, v0 = F ? F.get() : null, h0 = ctx.hist.length;
    const r1 = ctx.inner(main);
    if (ctx.hist.length === h0) return r1;
    if (F) {
      if (String(F.get()) !== String(v0)) return r1 + `\n_That changed the ${F.label.toLowerCase()} itself, so it couldn't stay the same._`;
      return r1 + `\n_${F.label} stays at ${ctx.fmtV(F.get(), F)}._`;
    }
    const before = ctx.hist[h0].before;
    const lever = K.levers.find(id => JSON.stringify(getPath(before, id)) === JSON.stringify(getPath(ctx.App.design(), id)));
    if (!lever) return r1 + `\n_I couldn't keep the ${K.name} as well: everything that sets it just changed._`;
    const s = P.solve(ctx, lever, K.key, g0);
    if (!s || s.fail) return r1 + `\n_I couldn't bring the ${K.name} back to ${mm(g0, 1)} with the ${label(ctx, lever).toLowerCase()}._`;
    const r2 = ctx.apply([{ f: s.f, v: s.v }], "keep " + K.key);
    squash(ctx, h0, "change, keep " + K.key);
    return r1 + "\n" + r2 + `\n_Kept the ${K.name} at ${mm(geo(ctx)[K.key], 1)} (was ${mm(g0, 1)}) by changing the ${s.f.label.toLowerCase()}. One \`undo\` takes back both._`;
  });

  // ---------------------------------------------------------------- 6. BB and headset standards
  const BB_STD = [
    { re: /\bt ?47\b.*\b(inboard|86|85\.5|wide)\b|\b(inboard|86|85\.5)\b.*\bt ?47\b/, od: 52, wall: 2.5, width: 86, note: "BB: T47 inboard (86 mm wide threaded shell, bearings inside)" },
    { re: /\bt ?47\b/, od: 52, wall: 2.5, note: w => `BB: T47 threaded, outboard bearings (${w} mm shell) — your builder's default` },
    { re: /\b(bsa|english|threaded (bb|bottom bracket)|hollowtech|ita|italian)\b/, od: 44, wall: 3.0, note: w => `BB: BSA / English threaded (${w} mm shell)` },
    { re: /\bpf ?30\b/, od: 51, wall: 2.5, note: w => `BB: PF30 press-fit (${w} mm shell)` },
    { re: /\bbb ?30\b/, od: 48, wall: 3.0, note: w => `BB: BB30 (bearings pressed into the shell, ${w} mm)` },
    { re: /\b(bb|pf) ?92\b/, od: 46, wall: 2.5, width: 92, note: "BB: BB92 / PF92 press-fit (92 mm MTB shell)" },
    { re: /\b(bb|pf) ?86(\.5)?\b|\bpress ?fit 86\b/, od: 46, wall: 2.5, width: 86.5, note: "BB: BB86 / PF86 press-fit (86.5 mm road shell)" }
  ];
  on((raw, t, ctx) => {
    if (!/\b(bb|bottom bracket|shell|t ?47|bsa|english|pf ?30|bb ?30|bb ?86|pf ?86|bb ?92|pf ?92|threaded)\b/.test(t) || /\b(drop|height|od|wall|outside|thickness)\b/.test(t)) return null;
    if (isQ(raw, t) && !/\b(use|want|make|fit|give|switch|change)\b/.test(t)) return null;
    const std = BB_STD.find(s => s.re.test(t));
    const n = (t.match(/\b(68|73|83|85\.5|86|86\.5|92|100)\b/) || [])[1];
    const wWord = /\broad\b/.test(t) ? 68 : /\b(mtb|mountain|gravel)\b/.test(t) ? 73 : null;
    if (!std && !n && !wWord) return null;
    const cur = +fieldVal(ctx, "geometry.bbShellWidth"), width = std && std.width ? std.width : n ? +n : wWord || cur;
    const pairs = [["geometry.bbShellWidth", width]]; if (std) pairs.push(["tubes.bbShell.od", std.od], ["tubes.bbShell.wall", std.wall]);
    const r = setMany(ctx, pairs, "bb standard");
    if (std && !/^I didn't/.test(r)) { setNote(ctx, "bb", typeof std.note === "function" ? std.note(width) : std.note, true); return r + "\n_Shell size drawn approximately; the exact standard is saved as a note for your builder. Match the BB to your crank's spindle (24 mm / DUB / 30 mm)._"; }
    return r;
  });
  const HS_STD = [
    { re: /\b(44 ?\/ ?56|zs ?44 ?\/ ?zs ?56|zs ?56|is ?42 ?\/ ?is ?56|tapered (mtb|mountain|suspension)|1\.125 in (to|-) 1\.5)\b/, od: 52, wall: 2.0, cup: 0, note: "Headset: ZS44 top / ZS56 bottom, tapered (44/56 head tube)" },
    { re: /\b(42 ?\/ ?52|is ?42 ?\/ ?is ?52|acb)\b/, od: 51, wall: 2.0, cup: 0, note: "Headset: IS42 top / IS52 bottom integrated, tapered (42/52 head tube)" },
    { re: /\b(52 ?\/ ?52|is ?52( ?\/ ?is ?52)?|acr|aeroset)\b/, od: 56, wall: 2.0, cup: 0, note: "Headset: IS52 / IS52 integrated (52/52 head tube; routing through the headset possible)" },
    { re: /\b(44 ?\/ ?44|zs ?44 ?\/ ?ec ?44|ec ?44|44 ?mm straight|straight 44|44 straight)\b/, od: 48, wall: 2.0, cup: 12, note: "Headset: ZS44 top / EC44 bottom (44 mm straight head tube; external lower cup adds about 12 mm)" },
    { re: /\b(ec ?34|1\.125 in straight|straight 1\.125|traditional threadless)\b/, od: 38, wall: 1.5, cup: 12, note: "Headset: EC34 / EC34 external cups (1-1/8\" straight head tube, straight steerer only)" }
  ];
  on((raw, t0, ctx) => {
    const t = slashText(raw, t0);
    if (!/\b(head ?tube|headset|cups?|zs ?\d|ec ?\d|is ?\d|tapered|acr|acb|aeroset)\b/.test(t)) return null;
    if (isQ(raw, t) && !/\b(use|want|make|fit|give|switch|change)\b/.test(t)) return null;
    const std = HS_STD.find(s => s.re.test(t));
    if (std) {
      const r = setMany(ctx, [["tubes.headTube.od", std.od], ["tubes.headTube.wall", std.wall], ["geometry.lowerCupStack", std.cup]], "headset");
      if (!/^I didn't/.test(r)) { setNote(ctx, "headset", std.note, true); return r + `\n_Head tube drawn as one average size; the exact headset is saved as a note for your builder.${std.cup ? " The external lower cup lifts the front end (check the stack)." : ""}_`; }
      return r;
    }
    if (/\b(external|ec)\b.*\b(lower )?cup\b|\blower cup\b.*\bexternal\b/.test(t) && !/\d/.test(t)) return setMany(ctx, [["geometry.lowerCupStack", 12]], "cup", "An external lower cup adds about 12 mm under the head tube.");
    if (/\b((zero|0) ?stack|internal|integrated|flush)\b.*\b(lower )?cup\b|\blower cup\b.*\b((zero|0) ?stack|internal|integrated)\b/.test(t) && !/\d/.test(t.replace(/\b0 ?stack\b/g, ""))) return setMany(ctx, [["geometry.lowerCupStack", 0]], "cup");
    return null;
  });

  // ---------------------------------------------------------------- 7. more edits
  on((raw, t, ctx) => {   // saddle height and setback
    if (!/\b(saddle|seat)\b/.test(t) || /\b(seat ?(tube|angle|stays?|post|clamp|collar))\b|\bseatpost\b/.test(t) || /\b(height|setback|stack|rails?)\b.*\d|\bto \d/.test(t)) return null;
    if (isQ(raw, t)) return null;
    const n = ctx.numbersIn(t)[0], v = n ? lenMM(n) : null, k = ctx.sizeWord(t);
    if (/\b(back|backward|backwards|rearward|aft|further back)\b/.test(t) && !/\b(put|reset|original)\b/.test(t)) return setMany(ctx, [["geometry.saddleSetback", +(+fieldVal(ctx, "geometry.saddleSetback") + (v || 5 * k)).toFixed(1)]], "saddle back");
    if (/\b(forward|forwards|fore|further forward|ahead)\b/.test(t)) return setMany(ctx, [["geometry.saddleSetback", +(+fieldVal(ctx, "geometry.saddleSetback") - (v || 5 * k)).toFixed(1)]], "saddle forward");
    const up = /\b(raise|raised|up|higher|taller|lift)\b/.test(t), down = /\b(lower|lowered|down|drop|dropped)\b/.test(t);
    if (up === down) return null;
    return setMany(ctx, [["geometry.saddleHeight", +(+fieldVal(ctx, "geometry.saddleHeight") + (up ? 1 : -1) * (v || 5 * k)).toFixed(1)]], "saddle height");
  });
  on((raw, t, ctx) => {   // chainline presets
    if (!/\bchain ?line\b/.test(t) || /\d/.test(t) || isQ(raw, t)) return null;
    const v = /\bsuper ?boost\b/.test(t) ? 56.5 : /\bnon ?boost\b|\bstandard\b|\bnormal\b|\bold\b/.test(t) ? 49 : /\bboost\b/.test(t) ? 52 : /\broad\b/.test(t) ? 45 : /\bgravel\b/.test(t) ? 47 : /\bdh\b|\bdownhill\b/.test(t) ? 52 : null;
    return v == null ? null : setMany(ctx, [["geometry.chainline", v]], "chainline");
  });
  const ROTORS = [140, 160, 180, 203, 220];
  on((raw, t0, ctx) => {   // rotors and the rear caliper
    const t = slashText(raw, t0);
    if (/\b(brake|caliper|post ?mount|flat ?mount)\b.*\bchain ?stays?\b|\bchain ?stay (brake|mount|caliper)\b/.test(t)) return setMany(ctx, [["geometry.brakeMount", "chainstay"]], "brake");
    if (!/\b(rotors?|discs?)\b/.test(t)) return null;
    let m; const F0 = +fieldVal(ctx, "parts.rotorF"), R0 = +fieldVal(ctx, "geometry.rearRotor");
    if ((m = t.match(/\b(\d{3})\s*\/\s*(\d{3})\b/))) return setMany(ctx, [["parts.rotorF", +m[1]], ["geometry.rearRotor", +m[2]]], "rotors", "Front / rear.");
    const fr = t.match(/\b(\d{3})\s*(?:mm\s*)?(?:on the |at the |up )?front\b|\bfront\s*(?:rotor\s*)?(\d{3})\b/), rr = t.match(/\b(\d{3})\s*(?:mm\s*)?(?:on the |at the |out )?(?:rear|back)\b|\b(?:rear|back)\s*(?:rotor\s*)?(\d{3})\b/);
    if (fr && rr) return setMany(ctx, [["parts.rotorF", +(fr[1] || fr[2])], ["geometry.rearRotor", +(rr[1] || rr[2])]], "rotors");
    if (/\d/.test(t)) return null;
    const up = /\b(bigger|larger|more stopping|more power)\b/.test(t), down = /\b(smaller|lighter|less)\b/.test(t); if (up === down) return null;
    const step = x => up ? (ROTORS.find(r => r > x + 1) || x) : (ROTORS.slice().reverse().find(r => r < x - 1) || x);
    const front = /\bfront\b/.test(t), rear = /\b(rear|back)\b/.test(t), out = [];
    if (!rear || front) out.push(["parts.rotorF", step(F0)]); if (!front || rear) out.push(["geometry.rearRotor", step(R0)]);
    return setMany(ctx, out, "rotors");
  });
  on((raw, t, ctx) => {   // shoes, pedals, stance
    if (isQ(raw, t)) return null;
    if (/\bwide\b.*\b(shoes?|feet|foot|fit)\b|\b(shoes?|feet)\b.*\bwide\b/.test(t) && !/\d/.test(t)) return setMany(ctx, [["fit.wide", /\b(not|no|normal|narrow)\b/.test(t) ? "false" : "true"]], "wide shoe");
    if (/\b(narrow|normal|regular|standard) (width )?(shoes?|feet)\b/.test(t)) return setMany(ctx, [["fit.wide", "false"]], "wide shoe");
    const type = /\b(flat pedals?|flats|platform pedals?|platforms|five ?tens?|5 ?10s?|flat shoes?)\b/.test(t) ? "flat" : /\b(road shoes?|road cleats?|3 ?bolt|look keo|look pedals?|spd ?sl|speedplay)\b/.test(t) ? "road"
      : /\b(spd|2 ?bolt|mtb shoes?|mtb cleats?|gravel shoes?|crank ?brothers|eggbeaters?|time atac|clipless mtb)\b/.test(t) ? "mtb" : /\b(winter boots?|overshoes?|booties|winter shoes?)\b/.test(t) ? "winter" : null;
    if (type && !/\d/.test(t) && !/\b(bars?|mount|brake)\b/.test(t)) return setMany(ctx, [["fit.shoeType", type]], "shoe type", "Used for the toe-overlap check.");
    if (/\bduck ?(footed|feet|foot)\b|\bheels? in\b|\btoes point out\b/.test(t) && !/\d/.test(t)) return setMany(ctx, [["fit.toeAngle", 5 * ctx.sizeWord(t)]], "toe angle");
    if (/\bpigeon ?toed\b|\btoes point in\b/.test(t) && !/\d/.test(t)) return setMany(ctx, [["fit.toeAngle", -5 * ctx.sizeWord(t)]], "toe angle");
    let m;
    if ((m = t.match(/\bcleats?\b.*\b(back|forward)\b.*?(\d+(?:\.\d+)?)|\bcleats?\b.*?(\d+(?:\.\d+)?)\s*(?:mm)?\s*(back|forward|further back)\b/))) {
      const v = +(m[2] || m[3]), back = /back/.test(m[1] || m[4]); return setMany(ctx, [["fit.cleatBack", back ? v : -v]], "cleat");
    }
    return null;
  });
  on((raw, t, ctx) => {   // rider and bike weight changes
    const n = ctx.numbersIn(t).find(x => /^(kg|lb)$/.test(x.unit)); if (!n || /\bto \d/.test(t)) return null;
    const kg = n.unit === "lb" ? n.v * 0.453592 : n.v;
    if (/\bbike\b/.test(t) && /\b(heavier|lighter|add|more|less|plus|minus|gain|lose)\b/.test(t) && !/\bweighs?\b.*\d/.test(t.replace(/\bby\b.*$/, ""))) {
      const dir = /\b(lighter|less|minus|lose)\b/.test(t) ? -1 : 1; return setMany(ctx, [["rider.bikeKg", r1(+fieldVal(ctx, "rider.bikeKg") + dir * kg)]], "bike kg");
    }
    let dir = 0;
    if (/\b(i'?ve|i have|i|me)\b.*\b(lost|dropped|shed|lose|down)\b/.test(t)) dir = -1;
    else if (/\b(i'?ve|i have|i)\b.*\b(gained|put on|gain|piled on|up)\b/.test(t)) dir = 1;
    else if (/\b(add|plus|with|carrying|carry|extra|wearing)\b/.test(t) && /\b(backpack|pack|bag|bags|gear|luggage|load|bikepacking|kit|water|hydration|camera|kid|child|panniers?|cargo|shopping)\b/.test(t)) dir = 1;
    if (!dir) return null;
    return setMany(ctx, [["rider.riderKg", r1(+fieldVal(ctx, "rider.riderKg") + dir * kg)]], "rider kg", dir > 0 && !/\b(gained|put on|gain|piled on)\b/.test(t) ? "Added to the rider weight (what the frame carries)." : null);
  });
  const SEV = [1, 1.25, 1.5, 2];
  on((raw, t, ctx) => {   // ISO lab test level
    if (!/\b(iso|tests?|testing|standard|in ?house|lab)\b/.test(t) || isQ(raw, t)) return null;
    if (/\b(fork|wall|tube)\b/.test(t)) return null;
    let m; const cur = +fieldVal(ctx, "use.isoSeverity");
    if ((m = t.match(/\b(\d(?:\.\d+)?)\s*(?:x|times)\s*(?:the )?iso\b|\biso\s*(?:x|times)\s*(\d(?:\.\d+)?)|\biso\b.*\b(\d(?:\.\d+)?)\s*(?:x|times)\b/))) { const v = +(m[1] || m[2] || m[3]); const s = SEV.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a); return setMany(ctx, [["use.isoSeverity", s]], "iso", s !== v ? `Nearest option is ${s}×.` : null); }
    if (/\b(double|twice)\b/.test(t)) return setMany(ctx, [["use.isoSeverity", 2]], "iso");
    if (/\b(brand|in ?house|manufacturer|company)\b/.test(t)) return setMany(ctx, [["use.isoSeverity", 1.5]], "iso", "1.5× ISO is about what brands use in-house.");
    if (/\b(standard|plain|normal|regular|basic|just) iso\b|\biso (standard|minimum)\b/.test(t)) { if (!/\b(road|racing|mountain|mtb|city|trekking)\b/.test(t)) return setMany(ctx, [["use.isoSeverity", 1]], "iso"); }
    if (/\b(harsher|tougher|stricter|harder|more severe|stronger)\b/.test(t)) return setMany(ctx, [["use.isoSeverity", SEV.find(s => s > cur) || cur]], "iso");
    if (/\b(easier|gentler|softer|milder|less severe)\b/.test(t)) return setMany(ctx, [["use.isoSeverity", SEV.slice().reverse().find(s => s < cur) || cur]], "iso");
    const type = /\b(road|racing|race|gravel)\b/.test(t) ? "racing" : /\b(mtb|mountain|trail)\b/.test(t) ? "mountain" : /\b(city|trekking|commuter|touring|hybrid)\b/.test(t) ? "city" : null;
    if (type && /\b(iso|tests?|test type|test level|lab)\b/.test(t)) return setMany(ctx, [["use.isoType", type]], "iso type");
    return null;
  });
  on((raw, t, ctx) => {   // tyre pressure
    let m;
    if ((m = t.match(/^(?:run |set |use |put )?(?:the |my )?(?:rear )?(?:tyre |tire )?(?:pressure )?(?:to |at )?(\d+(?:\.\d+)?)\s*psi(?: in the (?:rear|back))?$/))) return setMany(ctx, [["use.rearTirePsi", +m[1]]], "psi");
    if (!/\b(pressure|psi|inflate|pump)\b/.test(t) || /\d/.test(t) || isQ(raw, t)) return null;
    const up = /\b(more|higher|raise|up|harder|increase|firmer|pump up)\b/.test(t), down = /\b(less|lower|drop|down|softer|decrease|reduce|let out)\b/.test(t);
    if (up === down) return null;
    return setMany(ctx, [["use.rearTirePsi", +fieldVal(ctx, "use.rearTirePsi") + (up ? 2 : -2) * ctx.sizeWord(t)]], "psi");
  });
  on((raw, t, ctx) => {   // bars: flat / riser, back / forward
    if (isQ(raw, t)) return null;
    if (/^(?:use |fit |run |want |with )?(?:a |some )?(flat|zero rise) ?(bars?|handlebars?)$/.test(t)) return setMany(ctx, [["parts.barRise", 0]], "flat bar");
    if (/^(?:use |fit |run |want |with )?(?:a |some )?(riser|rise|high rise) ?(bars?|handlebars?)$/.test(t)) { const v = +fieldVal(ctx, "parts.barRise"); return setMany(ctx, [["parts.barRise", /high/.test(t) ? 40 : v > 0 ? v : 20]], "riser bar"); }
    if (/\b(bars?|handlebars?|cockpit|hands|grips)\b/.test(t) && !/\b(width|wide|wider|narrower|rise|sweep|height|higher|lower|up|down)\b/.test(t)) {
      const n = ctx.numbersIn(t)[0], v = n ? lenMM(n) : 10 * ctx.sizeWord(t);
      const back = /\b(back|closer|rearward|towards me|toward me|nearer)\b/.test(t) && !/\bput .* back\b|\bback to\b/.test(t), fwd = /\b(forward|further out|further away|out|further forward|away)\b/.test(t);
      if (back !== fwd && /\b(move|shift|bring|get|want|put|bars?|handlebars?)\b/.test(t)) return setMany(ctx, [["parts.stemLength", Math.max(0, +fieldVal(ctx, "parts.stemLength") + (fwd ? v : -v))]], "bar reach", `Done with the stem (${fwd ? "longer" : "shorter"}); the frame's reach stays ${fieldVal(ctx, "geometry.reach")}.`);
    }
    return null;
  });
  on((raw, t, ctx) => {   // frame shape: chainstay bends, dropped stays, standover, bridge height
    let m; if (isQ(raw, t)) return null;
    if (/\b(s ?bend|s ?bent|s shaped|s curve)\b.*\bchain ?stays?\b|\bchain ?stays?\b.*\bs ?bend\b/.test(t)) return setMany(ctx, [["geometry.csShape", "spline"]], "cs shape");
    if (/\b(plain|simple|straight|normal|auto|regular) (bent )?chain ?stays?\b/.test(t)) return setMany(ctx, [["geometry.csShape", "auto"]], "cs shape", "Bent just enough to clear the tyre.");
    if (/\bdropped (seat ?)?stays\b|\b(drop|lower) the (seat ?)?stays\b|\bseat ?stays? (lower|dropped)\b|\bstay drop\b/.test(t) && !/\bno\b/.test(t)) {
      const n = ctx.numbersIn(t)[0], cur = +fieldVal(ctx, "geometry.ssBelowTt");
      const v = n ? (/\b(by|more|lower the|drop the)\b/.test(t) && !/\bdropped\b/.test(t) ? cur + lenMM(n) : lenMM(n)) : Math.max(cur + 15, 30);
      return setMany(ctx, [["geometry.ssBelowTt", v]], "dropped stays", "Seat stays join the seat tube further below the top tube (more compliance, room for a frame bag).");
    }
    if (/\b(no stay drop|un ?dropped (seat ?)?stays|stays? (at|up to) the top tube|higher (seat ?)?stays)\b/.test(t)) return setMany(ctx, [["geometry.ssBelowTt", 12]], "stays");
    if (/\bstand ?over\b/.test(t) && !/\d/.test(t)) {
      const more = /\b(more|lower|better|extra|increase)\b/.test(t), less = /\b(less|higher|reduce)\b/.test(t); if (more === less) return null;
      return setMany(ctx, [["geometry.ttAtSeatTube", +fieldVal(ctx, "geometry.ttAtSeatTube") + (more ? -20 : 20) * ctx.sizeWord(t)]], "standover", "Top tube meets the seat tube lower/higher (more slope); reach and stack don't change.");
    }
    if ((m = t.match(/^(lower|drop|raise|lift)( the)? top tube(?: (?:by )?(\d+(?:\.\d+)?)\s*(mm|cm)?)?$/)) || /\b(sloping|sloped|compact|slope the) top tube\b/.test(t)) {
      const up = m && /raise|lift/.test(m[1]), v = m && m[3] ? lenMM(ctx.numbersIn(m[3] + (m[4] ? " " + m[4] : ""))[0]) : 20 * ctx.sizeWord(t);
      return setMany(ctx, [["geometry.ttAtSeatTube", +fieldVal(ctx, "geometry.ttAtSeatTube") + (up ? v : -v)]], "top tube slope", "Moved where the top tube meets the seat tube (head-tube end unchanged).");
    }
    if ((m = t.match(/\bbridge\b.*?(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:above|over|from|clear of) (?:the )?(?:tire|tyre|wheel)\b/))) return setMany(ctx, [["geometry.ssBridgeAbove", +m[1]]], "bridge height");
    return null;
  });
  const TUBE_WORDS = [["topTube", /\btop( tubes?)?\b/], ["downTube", /\bdown( tubes?)?\b/], ["seatTube", /\bseat tubes?\b|\bseat\b(?! ?stays?)(?= (and|tubes?|,))/], ["headTube", /\bhead tubes?\b/], ["chainstay", /\bchain ?stays?\b/], ["seatStay", /\bseat ?stays?\b/]];
  on((raw, t, ctx) => {   // several tubes at once
    if (isQ(raw, t)) return null;
    let m;
    // all main walls up/down: "all walls up 0.1", "thicken every tube 0.1", "all walls +0.1"
    if (/\b(all|every|main|each)\b.*\b(walls?|tubes?)\b/.test(t) && (m = t.match(/(\+|-)?\s*(\d(?:\.\d+)?)\s*(?:mm)?/)) && (m[1] || /\b(up|down|thicker|thinner|thicken|thin|more|less|by|add|increase|decrease|reduce)\b/.test(t))) {
      const v = +m[2]; if (!(v > 0 && v <= 0.5)) return null;
      const dir = m[1] === "-" || /\b(down|thinner|thin|less|decrease|reduce)\b/.test(t) ? -1 : 1, T = D(ctx).tubes, out = [];
      for (const k of ["topTube", "downTube", "seatTube"]) { out.push(["tubes." + k + ".wall", r2(+T[k].wall + dir * v)]); if (+T[k].buttWall > 0) out.push(["tubes." + k + ".buttWall", r2(+T[k].buttWall + dir * v)]); }
      return setMany(ctx, out, "all walls");
    }
    const hits = TUBE_WORDS.filter(([, re]) => re.test(t)).map(([k]) => k);
    if (/\bstays\b/.test(t) && !/\b(chain|seat) ?stays?\b/.test(t)) for (const k of ["chainstay", "seatStay"]) if (!hits.includes(k)) hits.push(k);
    if (hits.length < 2) return null;
    const ns = ctx.numbersIn(t); if (ns.length !== 1) return null;
    const v = ns[0].v, wall = /\b(walls?|thick|thickness|gauge)\b/.test(t) || v < 4;
    if (!wall && !/\b(od|diameter|mm)\b/.test(t)) return null;
    if (wall && !(v >= 0.4 && v <= 3)) return null;
    return setMany(ctx, hits.map(k => ["tubes." + k + (wall ? ".wall" : ".od"), v]), "tubes");
  });
  on((raw, t, ctx) => {   // head tube / seat tube length in inches or cm, your builder-list tube shapes by name
    const tube = ctx.findTube(t); if (!tube) return null;
    const ns = ctx.numbersIn(t);
    if ((tube.k === "headTube" || tube.k === "seatTube") && ns.length === 1 && !/\b(wall|od|diameter|thick|thickness|gauge|angle)\b/.test(t)) {
      const v = lenMM(ns[0]); if (/^(in|cm)$/.test(ns[0].unit) && v >= 60 && !ctx.relDir(t, ns[0])) return setMany(ctx, [["geometry." + tube.k, r1(v)]], "length");
    }
    const catF = ctx.fld("catalog." + tube.k + ".preset");
    if (catF && !ns.length && /\b((?:waltly|my builder|the builder|your builder|builder)|standard|list|xc|catalog|catalogue)\b/.test(t)) {
      const want = ctx.words(t).filter(w => w.length > 1 && !/^(the|tube|tubes|down|top|seat|stays?|chainstays?|use|want|(?:waltly|my builder|the builder|your builder|builder)'?s?|make|it|a|an)$/.test(w));
      let best = null, bs = 0; for (const o of catF.options) { const ow = ctx.words(o[1]); const s = want.filter(w => ow.some(x => x === w || x.startsWith(w))).length; if (s > bs) { bs = s; best = o; } }
      if (best && bs >= 1) return setMany(ctx, [[catF.id, best[0]]], "shape", `From your builder's tube list: ${best[1]}.`);
    }
    return null;
  });
  on((raw, t, ctx) => {   // gear inches target
    const m = t.match(/\bgear inch(?:es)?(?: of| to)? (\d{2,3}(?:\.\d+)?)\b|\b(\d{2,3}(?:\.\d+)?) gear inch(?:es)?\b/); if (!m) return null;
    const gi = +(m[1] || m[2]), g = D(ctx).geometry, cog = Math.max(9, Math.round(g.chainring * g.tireDiameter / 25.4 / gi));
    return setMany(ctx, [["geometry.cog", cog]], "gear inches", `Kept the ${g.chainring}T ring: ${g.chainring} × ${cog} ≈ ${(g.chainring / cog * g.tireDiameter / 25.4).toFixed(1)} gear inches.`);
  });
  on((raw, t, ctx) => {   // fork: offset presets, longer/shorter fork by a number
    let m; if (isQ(raw, t)) return null;
    if (/\b(reduced|short|low|ro) offset\b|\bstandard offset\b|\bnormal offset\b|\blong offset\b/.test(t) && !/\d/.test(t)) {
      const g = D(ctx).geometry, bsd = +g.rimBSDFront || +g.rimBSD || P.bsdOf(+g.tireDiameterFront || +g.tireDiameter, +g.tireWidth);
      const [ro, std] = bsd >= 686 ? [51, 58] : bsd >= 622 ? [44, 51] : bsd >= 584 ? [37, 44] : [35, 40];
      return setMany(ctx, [["geometry.forkOffset", /\b(reduced|short|low|ro)\b/.test(t) ? ro : std]], "offset", `For ${bsd >= 686 ? "32-inch" : bsd >= 622 ? "29-inch" : bsd >= 584 ? "27.5-inch" : "26-inch"} wheels: reduced ${ro} mm, standard ${std} mm.`);
    }
    if ((m = t.match(/\b(\d+(?:\.\d+)?)\s*(mm|cm)?\s*(longer|shorter|taller)\s+fork\b|\bfork\s+(\d+(?:\.\d+)?)\s*(mm|cm)?\s*(longer|shorter|taller)\b/))) {
      const v = lenMM({ v: +(m[1] || m[4]), unit: m[2] || m[5] || "" }), up = /longer|taller/.test(m[3] || m[6]);
      return setMany(ctx, [["geometry.forkA2C", +fieldVal(ctx, "geometry.forkA2C") + (up ? v : -v)]], "fork a2c", "Axle-to-crown length (not travel).");
    }
    return null;
  });

  // ---------------------------------------------------------------- 8. whole-bike kinds from the templates
  const KIND = t => /\b(road|endurance road|race bike)\b/.test(t) ? "road" : /\b(gravel|cx|cyclocross|all ?road|adventure|bikepacking)\b/.test(t) ? "gravel" : /\b(mtb|mountain|hardtail|trail|xc)\b/.test(t) ? "mtb" : null;
  const SIZE = t => { const m = t.match(/\bsize (xs|s|m|l|xl|small|medium|large|extra large)\b|\b(small|medium|large|extra large)\b/); if (!m) return null; const w = m[1] || m[2]; return { xs: "S", s: "S", small: "S", m: "M", medium: "M", l: "L", large: "L", xl: "XL", "extra large": "XL" }[w]; };
  function pickWheel(T, kind, t) {
    const keys = Object.keys(T.TYPES[kind].wheels);
    const want = /\b(32|32 ?in|32er)\b/.test(t) ? /32/ : /\b(650 ?b|27\.5)\b/.test(t) ? /650b|27\.5/ : /\bmullet\b/.test(t) ? /mullet/ : /\b26\b/.test(t) ? /^26/ : /\b(29|700 ?c?)\b/.test(t) ? /29|700/ : null;
    const k = want ? keys.find(x => want.test(x)) : null;
    return k || keys[0];
  }
  // widest tyre asked for: "45 mm tyres", "2.4 in tires", '2.6" tyres' (null = the wheel's typical tyre)
  function pickTyre(t) {
    let m = t.match(/\b(\d{2}(?:\.\d)?)\s*(?:mm)?\s*(?:wide\s+)?(?:tyres?|tires?)\b/); if (m && +m[1] >= 20 && +m[1] <= 90) return +m[1];
    m = t.match(/\b([1-3]\.\d{1,2})\s*(?:"|in(?:ch(?:es)?)?|”)?\s*(?:wide\s+)?(?:tyres?|tires?)\b/); if (m) return Math.round(+m[1] * 25.4);
    return null;
  }
  on((raw, t, ctx) => {
    const T = root.FrameTemplates, FEA = root.FrameFEA; if (!T || !FEA) return null;
    let m;
    if ((m = t.match(/^(?:new|start (?:a )?new|create (?:a )?(?:new )?|make (?:me )?(?:a )?new|design (?:me )?a new)\s+(.+?)\s*(?:bike|design|frame)\b(.*)$/)) && KIND(m[1])) {
      const kind = KIND(m[1]), size = SIZE(t) || "M", wheel = pickWheel(T, kind, t), tpl = T.build(kind, wheel, size, pickTyre(t));
      const d = FEA.deepMerge(root.FRAME_DEFAULTS, tpl.changes);
      ctx.App.createDesign(tpl.name, tpl.notes, d); ctx.hist.length = 0; ctx.redo.length = 0;
      return `Created and opened **${tpl.name}** from the ${T.TYPES[kind].label.toLowerCase()} template. Your other designs are untouched. (\`new bike\` opens the full walkthrough instead.)`;
    }
    if ((m = t.match(/^(?:make|turn|convert|change|switch)\s+(?:it|this|the bike|this bike|this design|the frame)\s+(?:in)?to\s+(?:a |an )?(.+?)(?:\s+(?:bike|frame|geometry|build))?$|^(?:make|turn|convert|change)\s+(?:it|this)\s+(?:a |an )(.+?)(?:\s+(?:bike|frame|geometry))?$|^(?:give it|use)\s+(.+?)\s+geometry$/)) && KIND(m[1] || m[2] || m[3])) {
      const kind = KIND(m[1] || m[2] || m[3]), Ty = T.TYPES[kind], g = D(ctx).geometry;
      const size = SIZE(t) || Object.keys(Ty.sizes).reduce((a, b) => Math.abs(Ty.sizes[b].reach - g.reach) < Math.abs(Ty.sizes[a].reach - g.reach) ? b : a);
      const wheel = pickWheel(T, kind, t), tpl = T.build(kind, wheel, size, pickTyre(t)), ch = tpl.changes;
      const keepG = new Set(["saddleHeight", "saddleSetback", "saddleStack", "crankLength", "footOffset"]), keepU = new Set(["sprintWatts", "sprintCadence", "avgWatts", "avgCadence", "hoursPerWeek", "aggression", "legStroke", "dropHeight"]);
      const r = editDesign(ctx, "make it " + kind, d => {
        for (const [k, v] of Object.entries(ch.geometry || {})) if (!keepG.has(k)) d.geometry[k] = clone(v);
        for (const [k, v] of Object.entries(ch.use || {})) if (!keepU.has(k)) d.use[k] = clone(v);
      });
      if (r.err) return `I couldn't: ${r.err}`;
      const n = D(ctx).geometry;
      return `Made it a **${Ty.label.toLowerCase()}** bike (template size ${size}, ${Ty.wheels[wheel].label} wheels, tyres up to ${T.tyreLabel(kind, n.tireWidth, wheel)}): reach ${n.reach}, stack ${n.stack}, head ${n.headAngle}°, seat ${n.seatAngle}°, chainstay ${n.chainstay}, BB drop ${n.bbDrop}, fork ${n.forkA2C}/${n.forkOffset}, terrain ${show(ctx, "use.condition")}.\n_Kept your tubes, saddle height and riding. One \`undo\` goes back; \`new ${kind} bike size ${size}\` makes a separate design instead._`;
    }
    return null;
  });

  // ---------------------------------------------------------------- 9. questions and housekeeping
  const ASK = [[/\b(bars?|handlebars?)\b/, /\bwide|width\b/, "bar width"], [/\b(bars?|handlebars?)\b/, /\brise\b/, "bar rise"], [/\b(tires?|tyres?)\b/, /\bwide|big|fat|width\b/, "tyre width"],
    [/\bstem\b/, /./, "stem length"], [/\bspacers?\b/, /./, "spacers"], [/\bcranks?\b/, /./, "crank length"], [/\brotors?\b/, /./, "front rotor"], [/\bsetback\b/, /./, "saddle setback"], [/\bfork\b/, /\btravel\b|\bhow much\b/, "fork travel"]];
  on((raw, t, ctx) => {
    let m;
    if ((m = t.match(/^how (long|tall|wide|steep|slack|big|thick|heavy|high|low|much|many|far)(?: is| are| does)?(?: the| my)? (.+?)\??$/)) || (m = t.match(/^what (size|length|width)(?: of)?(?: the| my)? (.+?)(?: is it| do i have| am i using)?\??$/)) || (m = t.match(/^(how much) (setback)\??$/))) {
      const q = m[2]; for (const [a, b, ask] of ASK) if (a.test(q) && b.test(m[1] + " " + q)) return ctx.one("what is the " + ask);
      return null;
    }
    if (/^what (rotors|cranks|crank length|stem|tyres|tires)\b/.test(t)) { for (const [a, , ask] of ASK) if (a.test(t)) return ctx.one("what is the " + ask); }
    if (/\bstand ?over\b/.test(t) && isQ(raw, t)) return `Cyclic Labs doesn't work out a standover height. What sets it here: the top tube meets the seat tube **${fieldVal(ctx, "geometry.ttAtSeatTube")} mm** from the BB, and the BB is ${Math.round(geo(ctx).bbHeight)} mm off the ground. \`more standover\` slopes the top tube down 20 mm.`;
    if (/\b(max(imum)?|biggest|widest|largest)\b.*\b(tyres?|tires?)\b|\bwhat (tyres?|tires?) (will|can|could) (fit|clear)\b|\bhow (wide|big) (a )?(tyres?|tires?) (will|can) (fit|go)\b/.test(t)) {
      const g = D(ctx).geometry; return `The frame is built around the tyre you set: **${g.tireWidth} mm** with ${g.csClearance} mm clearance asked for at the chainstays/yoke and ${g.ssClearance} mm at the seat stays. Your builder spaces the stays for that. For a bigger tyre, set it (e.g. \`2.6 tyres\`) and keep 4–6 mm clearance; the Builder checks flag anything that won't fit.`;
    }
    if (/^(history|what have we done|what did we do|undo history|show (the )?history|list (the )?edits)\??$/.test(t)) {
      const ch = ctx.App.diff(); return `${ctx.hist.length} change${ctx.hist.length === 1 ? "" : "s"} you can undo in this chat.\n` + (ch.length ? "Different from the saved design:\n" + ch.map(c => `• ${c}`).join("\n") : "No differences from the saved design.");
    }
    if ((m = t.match(/^redo (twice|(\d+)(?: times| changes)?|all|everything|all of (?:it|them))$/))) {
      const n = m[1] === "twice" ? 2 : m[2] ? +m[2] : 999; let k = 0;
      while (k < n && ctx.redo.length) { const h = ctx.redo.pop(); ctx.hist.push({ before: ctx.snapshot(), label: h.label }); ctx.App.restore(h.before); k++; }
      if (!k) return "Nothing to redo."; ctx.App.refresh(); ctx.report(); return `Redid ${k} change${k > 1 ? "s" : ""}.`;
    }
    if (/^(more help|more examples|what else( can you do)?|examples|help more|everything you can do|show me more)\??$/.test(t)) return MORE_HELP;
    return null;
  });
  const MORE_HELP = ["More things you can type (all offline):",
    "• **The build journey**: `order help` (steps, windows, spec sheet, order progress, journal, questions, builder FAQ, themes)",
    "• **Try things**: `what if the reach was 470` · `try a 435 chainstay` · then `undo`",
    "• **Keep one number**: `slacker head angle but keep the trail` · `reach 470, same wheelbase` · `fork a2c 550 keep the bb height`",
    "• **Borrow**: `copy the reach from my gravel bike` · `same tubes as the stiff variant` · `compare reach with the canyon`",
    "• **Standards**: `T47 bb` · `BSA 68` · `PF30` · `44/56 tapered head tube` · `52/52 head tube` · `external lower cup`",
    "• **Notes for your builder**: `boost rear` · `UDH` · `internal routing for the rear brake` · `3 bottle mounts` · `rack mounts` · `brushed finish` · `note: anything you like` · `show my notes`",
    "• **Fit**: `raise the saddle 5mm` · `saddle back 10` · `move the bars back 10mm` · `flat bars` · `wide shoes` · `flat pedals` · `midfoot cleats`",
    "• **Riding & tests**: `add 5kg for a backpack` · `I've lost 3 kg` · `test to 1.5x ISO` · `road ISO tests` · `more tyre pressure`",
    "• **Frame**: `dropped seat stays` · `more standover` · `s-bend chainstays` · `top and down tube 1.0 wall` · `all walls up 0.1` · `bigger rotors` · `boost chainline`",
    "• **Kinds**: `make it a gravel bike` · `new road bike size M`",
    "• **Short forms**: `HA 65 SA 76 CS 440` · `+10 reach` · `S/R 1.45` · `32-18 gearing` · `gear inches 60` · `reduced offset fork`"].join("\n");

  // ---------------------------------------------------------------- hook in (before chatplus.js's own intents)
  FC.intents = I.concat(FC.intents || []);
  // free-text notes keep their capitals, so they are read before the sentence is tidied
  FC.early = (FC.early || []).concat([(raw0, n0, ctx) => {
    const m = String(raw0).match(/^\s*(?:(?:note|notes|memo|add (?:a |this )?note|add to (?:the |my )?notes|note (?:for|to) (?:waltly|the builder|my builder|your builder)|add (?:a |this )?note (?:for|to) (?:waltly|the builder|my builder|your builder))\s*[:\-–]|(?:tell|remind|ask) (?:waltly|my builder|the builder|your builder|builder)(?: that| to| about| whether| if)?|remind me to ask (?:waltly|my builder|the builder|your builder|builder)(?: about| whether| if)?|for (?:waltly|my builder|the builder|your builder|builder)\s*[:\-–])\s*(.+?)\s*[.!]*$/i);
    if (!m || !m[1] || m[1].length < 3 || !ctx) return null;
    setNote(ctx, null, m[1]);
    return `**Note for your builder**: ${m[1]}` + NOTE_HINT;
  }]);
  FC._more = { notesOf, setNote, NOTES, BB_STD, HS_STD, post };
})(typeof window !== "undefined" ? window : globalThis);
