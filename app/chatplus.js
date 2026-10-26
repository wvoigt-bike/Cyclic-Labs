// ============================================================================
//  DESIGN CHAT PHRASEBOOK (chatplus.js) — offline, no AI model
//  Hard-coded ways people actually talk about bike design, layered on top of
//  chat.js. Three parts:
//   1. rewrite()  — tidies a sentence before it is read: number words
//      ("sixty-five and a half"), fractions ("1 3/8"), units ("20 mil",
//      "14 stone", "1.7 bar", 18"), bike slang verbs ("chop 10 off", "bump up").
//   2. intents    — handlers tried in order; each returns a reply or null.
//      Tyres ("29 x 2.4"), gearing ("42/18"), cockpit ("slam the stem"),
//      worked-out targets ("trail 100", "wheelbase 1200"), memory ("a bit more",
//      "make it 470", "again", "too much"), feel words ("more stable",
//      "I feel cramped"), definitions ("what does trail mean"), summaries
//      ("what do I send your builder"), views and buttons ("top view", "hide wheels").
//   3. typofix()  — only used when nothing else matched ("raech 460").
//  Every edit still goes through chat.js apply(): reported old → new, checked by
//  the app's validator, and undoable.
// ============================================================================
(function (root) {
  "use strict";
  const FC = root.FrameChat; if (!FC) return;

  // ---------------------------------------------------------------- 1. rewrite
  const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const UNITWORD = /^(mm|mms|mil|mils|millimet\w*|cm|cms|centimet\w*|°|degrees?|degs?|inch|inches|in|kg|kgs|kilos?|kilograms?|lbs?|pounds?|stone|psi|bar|watts?|w|tooth|teeth|t|hours?|hrs?|percent|%|metres?|meters?|m|ft|feet|foot|size|notch|notches|step|steps)$/;
  const isNumWord = w => ONES[w] != null || TEENS[w] != null || TENS[w] != null || w === "hundred" || w === "thousand";

  function wordsToNumbers(s) {
    const t = s.split(" "), out = [];
    for (let i = 0; i < t.length; i++) {
      const w = t[i];
      // "half a degree", "a half", "a quarter", "a couple of"
      if ((w === "half" || w === "quarter") && (t[i + 1] === "a" || t[i + 1] === "an")) { out.push(w === "half" ? "0.5" : "0.25"); i++; continue; }
      if (w === "a" && (t[i + 1] === "half" || t[i + 1] === "quarter") && !/^\d/.test(out[out.length - 1] || "")) { out.push(t[i + 1] === "half" ? "0.5" : "0.25"); i++; continue; }
      if (w === "a" && t[i + 1] === "couple") { out.push("2"); i += t[i + 2] === "of" ? 2 : 1; continue; }
      if (w === "couple" && t[i + 1] === "of") { out.push("2"); i++; continue; }
      if (w === "a" && (t[i + 1] === "hundred" || t[i + 1] === "thousand")) { t[i] = "one"; }
      if (w === "and" && (t[i + 1] === "a" || t[i + 1] === "an") && (t[i + 2] === "half" || t[i + 2] === "quarter") && /^\d+(\.\d+)?$/.test(out[out.length - 1] || "")) {
        out[out.length - 1] = String(+out[out.length - 1] + (t[i + 2] === "half" ? 0.5 : 0.25)); i += 2; continue;
      }
      if (!isNumWord(t[i])) { out.push(w); continue; }
      // "one" on its own stays a word ("the first one") unless a unit or more numbers follow
      if (t[i] === "one" && !(isNumWord(t[i + 1] || "") || UNITWORD.test(t[i + 1] || "") || t[i + 1] === "point" || (t[i + 1] === "and" && /^(a|an)$/.test(t[i + 2] || "")))) { out.push(w); continue; }
      let cur = 0, total = 0, last = null, j = i;
      for (; j < t.length; j++) {
        const x = t[j];
        if (ONES[x] != null) { if (last === null || last === "H" || last === "AND" || last === "K" || (last === "D" && cur % 10 === 0)) { cur += ONES[x]; last = "O"; } else break; }
        else if (TEENS[x] != null) { if (last === null || last === "H" || last === "AND" || last === "K") { cur += TEENS[x]; last = "T"; } else if (last === "O" && cur < 10) { cur = cur * 100 + TEENS[x]; last = "T"; } else break; }
        else if (TENS[x] != null) { if (last === null || last === "H" || last === "AND" || last === "K") { cur += TENS[x]; last = "D"; } else if (last === "O" && cur < 10) { cur = cur * 100 + TENS[x]; last = "D"; } else break; }
        else if (x === "hundred") { if (last === "O" || last === "T" || last === null) { cur = (cur || 1) * 100; last = "H"; } else break; }
        else if (x === "thousand") { total += (cur || 1) * 1000; cur = 0; last = "K"; }
        else if (x === "and" && (last === "H" || last === "K") && isNumWord(t[j + 1] || "")) { last = "AND"; }
        else break;
      }
      let v = total + cur;
      // "sixty five point five"
      if (t[j] === "point") { let dec = ""; let k = j + 1; while (k < t.length && ONES[t[k]] != null) { dec += ONES[t[k]]; k++; } if (dec) { v = +(v + "." + dec); j = k; } }
      if (t[j] === "and" && (t[j + 1] === "a" || t[j + 1] === "an") && (t[j + 2] === "half" || t[j + 2] === "quarter")) { v += t[j + 2] === "half" ? 0.5 : 0.25; j += 3; }
      out.push(String(v)); i = j - 1;
    }
    return out.join(" ");
  }

  const FRAC = new Set([2, 3, 4, 8, 16, 32]);
  const UNIT_AFTER = "(?=\\s*(?:mm|cm|°|in|inch|inches|degrees?|deg|\\s|$))";
  function rewrite(raw) {
    let s = " " + String(raw) + " ";
    s = s.replace(/[’‘`´]/g, "'").replace(/[“”″]/g, '"').replace(/[–—−]/g, "-").replace(/×/g, " x ").replace(/ /g, " ");
    // inch and foot marks before anything strips them: 18" → 18 in, 6'2 → 6 ft 2 in
    s = s.replace(/(\d)\s*(?:"|'')(?=[\s,.;!?)]|$)/g, "$1 in ").replace(/(\d)\s*in\.(?=\s|$)/g, "$1 in ");
    s = s.replace(/(\d)\s*'\s*(\d{1,2})(?:\s*(?:"|in(?:ch(?:es)?)?))?(?![\d.])/g, "$1 ft $2 in").replace(/(\d)\s*'(?=\s|$)/g, "$1 ft");
    s = s.toLowerCase();
    s = s.replace(/([a-z])-(?=[a-z])/g, "$1 ");                      // sixty-five → sixty five
    s = s.replace(/\s*(?:->|=>|→|⟶|⇒)\s*/g, " to ").replace(/([a-z°)%])\s*[:=]\s*(?=[-+]?[\d.])/g, "$1 to ").replace(/\s=\s/g, " to ");
    s = s.replace(/\s*(?:percent|per cent|pct)\b/g, "%");
    // "a degree", "an inch", "one centimetre" → 1 …
    s = s.replace(/(?<!\b(?:half|quarter)\s)\b(?:a|an)\s+(?=(?:millimet\w*|mil|mm|centimet\w*|cm|degree|deg|inch|kilo\w*|pound|lb|tooth|notch|size|step|psi|watt)\b)/g, "1 ");
    s = wordsToNumbers(s.replace(/\s+/g, " "));
    // fractions: 1 3/8 (inches unless a unit follows), 1/2 inch
    s = s.replace(new RegExp("(\\d+)\\s+(\\d{1,2})\\s*/\\s*(\\d{1,2})\\b(?![./\\d])(\\s*(?:mm|cm|°|in\\b|inch|inches|degrees?|deg)?)", "g"), (m, a, n, d, u) => (+n < +d && FRAC.has(+d)) ? ` ${+(+a + n / d).toFixed(4)}${u && u.trim() ? u : " in "}` : m);
    s = s.replace(new RegExp("(^|[^\\d./])(\\d{1,2})\\s*/\\s*(\\d{1,2})\\b(?![./\\d])" + UNIT_AFTER, "g"), (m, p, n, d) => (+n < +d && FRAC.has(+d)) ? `${p}${+(n / d).toFixed(4)}` : m);
    // units
    s = s.replace(/(\d)\s*(?:millimet(?:er|re)s?|mils?|mms)\b/g, "$1 mm").replace(/(\d)\s*(?:centimet(?:er|re)s?|cms)\b/g, "$1 cm")
      .replace(/(\d)\s*(?:degrees?|degs?|º)(?![a-z])/g, "$1°").replace(/(\d)\s*(?:kilos?|kilograms?|kgs)\b/g, "$1 kg")
      .replace(/(\d)\s*(?:pounds?|lbs?)\b/g, "$1 lb").replace(/(\d)\s*(?:inch(?:es)?|ins)\b/g, "$1 in").replace(/(\d)\s*(?:metres?|meters?)\b/g, "$1 m")
      .replace(/(\d)\s*(?:watts?)\b/g, "$1 w").replace(/(\d)\s*(?:hrs?)\b/g, "$1 hours");
    s = s.replace(/(\d+(?:\.\d+)?)\s*stone(?:\s+(\d+(?:\.\d+)?)(?:\s*lb)?)?/g, (m, st, lb) => `${(+st * 6.35029 + (lb ? +lb * 0.453592 : 0)).toFixed(1)} kg`);
    if (/\b(pressure|psi|tyres?|tires?|inflat|pump)/.test(s)) s = s.replace(/(\d+(?:\.\d+)?)\s*bars?\b/g, (m, v) => +v < 8 ? `${(+v * 14.5038).toFixed(1)} psi` : m);
    if (/\b(drops?|huck|hucks|hucking|jumps?|landing|landings|to flat|gap|launch)\b/.test(s) && !/\b(bb|bottom bracket) drop\b/.test(s))
      s = s.replace(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)\b/g, (m, v) => `${(+v * 0.3048).toFixed(2)} m`).replace(/(\d+(?:\.\d+)?)\s*cm\b/g, (m, v) => `${(+v / 100).toFixed(2)} m`);
    // bike slang verbs
    s = s.replace(/\b(?:chop|knock|shave|take|cut|trim|lop|shed|drop)\s+(?:off\s+)?([-+]?\d+(?:\.\d+)?\s*(?:mm|cm|°|in)?)\s+(?:off|from|out of)\b/g, "reduce by $1 ");
    s = s.replace(/\b(?:bump|nudge|push|jack|kick|tweak)(?:ed|ing|s)?\b(.*)$/, (m, rest) => (/\b(down|back|lower|less|shorter|slacker)\b/.test(rest) ? "decrease" : "increase") + rest);
    s = s.replace(/\bdrop\s+(?=(?:the|my|it|that|your|stack|saddle|seat|front|bars?|handlebars?|reach|cockpit|head|bb|bottom)\b)(?!(?:the\s+)?(?:bb|bottom bracket)\s+drop\b)/g, "lower ");
    s = s.replace(/\bslacken\b/g, "slacker").replace(/\bsteepen\b/g, "steeper");
    s = s.replace(/\btyres?\b/g, m => m.replace("y", "i")).replace(/\bcentre\b/g, "center");
    return s.replace(/\s+/g, " ").trim();
  }

  // ---------------------------------------------------------------- helpers
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  const mm = (v, d = 0) => (+v).toFixed(d) + " mm";
  const toIn = v => r2(v / 25.4);
  const nums = (ctx, t) => ctx.numbersIn(t);
  const lenMM = n => !n ? NaN : /^(in|inch|inches|")$/.test(n.unit) ? n.v * 25.4 : n.unit === "cm" ? n.v * 10 : n.v;
  const has = (t, re) => re.test(t);
  function setMany(ctx, pairs, label, note) {
    const F = ctx.fields(), list = [];
    for (const [id, v] of pairs) { const f = F.find(x => x.id === id); if (f) list.push({ f, v }); }
    if (!list.length) return null;
    const same = c => String(c.f.get()) === String(c.v) || (c.v !== "" && c.f.get() !== "" && c.f.get() != null && +c.f.get() === +c.v);
    const changed = list.filter(c => !same(c));
    const r = ctx.apply(changed.length ? changed : list, label);
    return note && !/^I didn't|already/.test(r) ? r + "\n_" + note + "_" : r;
  }
  const geo = ctx => ctx.App.geometryInfo() || {};
  const D = ctx => ctx.App.design();
  // which field a short phrase names best (score ≥ 1 means the whole name was there)
  function topField(ctx, text, filter) {
    const toks = ctx.words(text).filter(w => w.length > 1), F = ctx.fields().filter(filter || (() => true));
    const sc = F.map(f => ({ f, s: ctx.scoreField(f, toks, text) })).sort((a, b) => b.s - a.s);
    return sc[0] && sc[0].s >= 1 ? sc[0].f : null;
  }
  const baselineDesign = ctx => { const A = ctx.App, d = A.allDesigns().find(x => x.id === A.currentId()); return d ? d.design : null; };
  const getPath = (o, p) => p.split(".").reduce((a, k) => a == null ? a : a[k], o);
  // the sentence with "/" kept (chat.js norm() turns "42/18" into "42 18"); everything else as norm() has it
  const slashText = (raw, t) => /\d\s*\/\s*\d|[a-z]\s*\/\s*[a-z]/i.test(raw) ? String(raw).toLowerCase().replace(/[’']/g, "'").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() : t;
  const isQ = (raw, t) => /^(what|whats|what's|how|show|tell|which|is|are|does|do|can|will|list|current|give me)\b/.test(t) || /\?\s*$/.test(raw);
  const STD_OD = [12.7, 16, 19, 22.2, 25.4, 28.6, 31.8, 34.9, 38.1, 41.3, 44.5, 48, 50.8];
  const HT_OD = [44, 46, 48, 50, 52, 56];
  const BSD = { 559: "26 in", 584: "27.5 in / 650b", 622: "29 in / 700c", 686: "32 in" };
  const tyreOD = (bsd, width) => Math.round(bsd + 2 * 1.05 * width);
  const bsdOf = (od, w) => [559, 584, 622, 686].reduce((a, b) => Math.abs(b - (od - 2.1 * w)) < Math.abs(a - (od - 2.1 * w)) ? b : a);

  // ---------------------------------------------------------------- definitions
  // [match on the question, explanation, what to show from this design]
  const GLOSSARY = [
    [/\breach\b/, "**Reach**: the horizontal distance from the centre of the bottom bracket to the top-centre of the head tube. It's the main \"how long is the bike when you stand up\" number; ±10 mm is a noticeable change.", "geometry.reach"],
    [/\bstack to reach|stack reach ratio|s ?\/ ?r\b/, "**Stack-to-reach ratio**: stack ÷ reach. Around 1.35 or less is a long, low race position; 1.45–1.55 is relaxed or endurance.", "ratio"],
    [/\bstack\b/, "**Stack**: the vertical distance from the centre of the bottom bracket up to the top-centre of the head tube. More stack means a taller front end and a more upright position (spacers and stem rise add on top).", "geometry.stack"],
    [/\b(head (tube )?angle|hta)\b/, "**Head angle**: the angle of the head tube (and fork) from the ground. Slacker (a smaller number, e.g. 64°) is calmer at speed and on steep ground; steeper (e.g. 71°) steers quicker. 1° is a big change.", "geometry.headAngle"],
    [/\b(seat (tube )?angle|sta)\b/, "**Seat angle**: the angle of the seat tube from the ground, measured to your saddle height. Steeper puts your hips further forward over the cranks, which helps seated climbing.", "geometry.seatAngle"],
    [/\b(chain ?stays?|rear cent(er|re)|cs)\b/, "**Chainstay length**: bottom bracket to rear axle. Shorter is livelier and easier to lift the front wheel; longer is more planted and keeps the front down on steep climbs.", "geometry.chainstay"],
    [/\b(bb|bottom bracket) height\b/, "**BB height**: how high the bottom bracket sits above the ground. Set by the BB drop and the tyre size. Lower feels more stable; higher clears rocks with the pedals.", "info.bbHeight"],
    [/\b(bb|bottom bracket) drop\b|\bdrop\b(?! height)/, "**BB drop**: how far the bottom bracket sits below a straight line between the two axles. More drop = a lower BB (more stable, \"in\" the bike) but less pedal clearance.", "geometry.bbDrop"],
    [/\btrail\b/, "**Trail**: the distance on the ground between where the steering axis would hit the ground and the middle of the front tyre's contact patch. More trail makes the steering want to straighten itself (stable, heavier); less trail makes it lighter and quicker. Set by head angle, fork offset and front tyre size.", "info.trail"],
    [/\b(fork )?(offset|rake)\b/, "**Fork offset (rake)**: how far the front axle sits ahead of the steering axis. More offset = less trail = lighter steering.", "geometry.forkOffset"],
    [/\b(a2c|axle to crown|axle crown)\b/, "**Fork axle-to-crown**: from the front axle up to the bottom of the fork crown. A longer fork lifts the front, slackens the head and seat angles and raises the BB.", "geometry.forkA2C"],
    [/\bwheel ?base\b/, "**Wheelbase**: axle to axle. Longer is calmer and more stable; shorter is easier to turn tightly.", "info.wheelbase"],
    [/\bfront cent(er|re)\b/, "**Front centre**: horizontal distance from the bottom bracket to the front axle. It mostly decides toe overlap and how stable the front feels.", "info.frontCentre"],
    [/\b(ett|effective top tube)\b/, "**Effective top tube**: the horizontal distance from the top of the head tube back to the seat tube's line. An older way to size bikes; reach and stack are more useful.", "info.effectiveTopTube"],
    [/\bhead tube( length)?\b/, "**Head tube length**: the length of the head tube itself. With the fork, it sets the stack.", "geometry.headTube"],
    [/\bseat tube( length)?\b/, "**Seat tube length**: from the bottom bracket centre to the top of the seat tube. It limits how low the saddle goes and how long a dropper fits.", "geometry.seatTube"],
    [/\btoe (overlap|strike)\b/, "**Toe overlap**: when your shoe can touch the front tyre (or mudguard) with the pedal forward and the bars turned. It's common on small frames, big tyres and 32-inch wheels. Type `toe overlap?` to check this bike.", null],
    [/\byoke\b/, "**Chainstay yoke**: a machined or plate piece just behind the bottom bracket that joins the two chainstays. It gives tyre and chainring clearance without bending the stays a lot. `no yoke` / `add a yoke` switches it.", "geometry.csYokeLength"],
    [/\bbridge\b/, "**Seat-stay bridge**: a short tube between the seat stays above the tyre. It stiffens the stays sideways and gives a mudguard mount; leaving it off makes the back a little more compliant.", "geometry.ssBridge"],
    [/\bwishbone\b/, "**Wishbone stays**: seat stays that leave the seat tube as one tube and split into two legs above the tyre.", "geometry.ssShape"],
    [/\bbutt(ed|ing)?\b/, "**Butted tubes**: the wall is thicker at the ends (where the welds and the highest stresses are) and thinner in the middle to save weight. Written end/middle/end, e.g. 1.2/0.9/1.2 mm.", null],
    [/\b(od|outside diameter)\b/, "**OD**: a tube's outside diameter. A bigger OD is much stiffer for the same weight (stiffness grows with roughly the cube of the diameter).", null],
    [/\bwall( thickness)?\b|\bgauge\b/, "**Wall thickness**: how thick the tube's wall is. Thicker is stronger and heavier; titanium frame tubes are usually 0.7–1.2 mm.", null],
    [/\b(3 ?al|3 2\.5|3\/2\.5|grade 9)\b/, "**3Al-2.5V titanium** (grade 9): about 3% aluminium and 2.5% vanadium. It's the usual titanium for frame tubes, cold-worked and stress-relieved, and it's what your builder builds in. Cyclic Labs' material settings are for it.", null],
    [/\b(6 ?al|6 4|6\/4|grade 5)\b/, "**6Al-4V titanium** (grade 5): stronger than 3Al-2.5V but hard to make into thin tubes, so it's mostly used for dropouts, yokes and machined parts.", null],
    [/\btitanium\b|\bti\b/, "**Titanium**: frames are usually 3Al-2.5V tubing. It's about half the stiffness of steel at a bit over half the weight, doesn't rust, and has a long fatigue life when the welds are good.", null],
    [/\biso\b|\b4210\b|\blab tests?\b/, "**ISO tests**: the ISO 4210 lab tests for frames and forks (pedalling and braking fatigue, heavy-object drop and so on). Cyclic Labs checks the frame against them; \"Test severity\" scales the loads like some brands' in-house standards.", "use.isoType"],
    [/\bfatigue( life)?\b/, "**Fatigue life**: how long the frame should last before a crack starts, from the stress swings in each load case and the weld fatigue strength, for the riding you described (hours, power, terrain, style).", "life"],
    [/\b(flat landing|drop height|huck)\b/, "**Flat-landing limit**: the highest drop to flat ground the frame should survive without bending (yielding), from the rider and bike weight, legs and tyres soaking up the hit.", "landing"],
    [/\bchain ?line\b/, "**Chainline**: the distance from the frame's centre to the middle of the chainring. Cyclic Labs uses it to check chainring-to-chainstay clearance.", "geometry.chainline"],
    [/\b(650b|27\.5)\b/, "**27.5 in / 650b**: a 584 mm rim. Used for mountain bikes and for fat \"road plus\" or gravel tyres.", null],
    [/\b(700c|29er|29)\b/, "**29 in / 700c**: the same 622 mm rim. 700c is the road and gravel name, 29 the mountain-bike name.", null],
    [/\b32 ?(in|inch|er)?\b/, "**32-inch wheels**: a new 686 mm rim. They roll over everything but sit the front end high and make toe overlap likely on small frames. `fit me a 32er` designs one around you.", null],
    [/\bmullet\b/, "**Mullet**: a 29-inch front wheel with a 27.5-inch rear. `make it a mullet` sets it up.", null],
    [/\bdropper\b/, "**Dropper post**: a seatpost you can lower from the bars. Needs enough straight seat tube for its length.", "tubes.seatpost.type"],
    [/\b(sliders?|sliding dropouts?)\b/, "**Sliding dropouts**: rear dropouts that slide to tension the chain on a singlespeed (or allow chainstay adjustment).", null],
    [/\b(flat mount|post mount|caliper mount|brake mount)\b/, "**Brake mounts**: post mount (two bolts pointing forward) or flat mount (bolts up through the chainstay). Cyclic Labs lets you put the rear caliper on the chainstay, seat stay or slider.", "geometry.brakeMount"],
    [/\b(terrain|condition)\b|\bastm\b/, "**Terrain (condition 1–5)**: from ASTM F2043: 1 paved roads, 2 gravel roads, 3 cross-country, 4 trail/enduro, 5 freeride/downhill. It sets how hard the riding loads are.", "use.condition"],
    [/\bspacers?\b/, "**Headset spacers**: rings under the stem. Each 5 mm raises the bars about 5 mm without changing the frame.", "parts.spacers"],
    [/\bstem\b/, "**Stem**: length moves the bars forward (longer = more stretched, slower steering), rise tilts them up or down.", "parts.stemLength"],
    [/\b(tire|tyre) clearance\b|\bclearance\b/, "**Tyre clearance**: the gap between the tyre and the stays/yoke. 4–6 mm is the usual minimum for mud and wheel flex.", "geometry.csClearance"],
    [/\bcleats?\b/, "**Cleat set-back**: how far behind the ball of the foot the pedal axle sits. Moving cleats back (\"midfoot\") reduces toe overlap.", "fit.cleatBack"],
    [/\b(scf|stress concentration)\b/, "**SCF (stress concentration factor)**: how much higher the stress is at a weld toe than in the plain tube.", "material.minSCF"],
    [/\bhot ?spot\b/, "**Hot-spot method**: a textbook way (IIW) of judging weld fatigue from the stress right at the weld toe. Harsher than Cyclic Labs' calibrated default.", "material.fatigueMethod"]
  ];
  function glossaryValue(ctx, key) {
    if (!key) return "";
    const g = geo(ctx), s = ctx.App.summary(), d = D(ctx);
    if (key === "ratio") return ` On this design: ${(d.geometry.stack / d.geometry.reach).toFixed(2)}.`;
    if (key === "life") return s ? ` On this design: ${s.life}.` : "";
    if (key === "landing") return s ? ` On this design: ${s.landing}.` : "";
    if (/^info\./.test(key)) { const v = g[key.slice(5)]; return isFinite(v) ? ` On this design: ${mm(v)}.` : ""; }
    const f = ctx.fld(key); return f ? ` On this design: ${ctx.fmtV(f.get(), f)}.` : "";
  }
  function define(raw, t, ctx) {
    const asks = /\b(mean|meaning|means|define|definition|explain|stand for|tell me about|what('s| is| are) (a|an)\b|what('s| is) .+ for\b|what('s| is) the point of|why (would|do|does|should))/.test(t)
      || (/^(what|whats|what's)( is| are|'s)? (?!the\b|my\b|its\b|it\b|this\b|current\b|our\b)/.test(t) && (!/\d/.test(t) || /\b(3 ?al|6 ?al|650 ?b|700 ?c|29er|4210)/.test(t)) && t.split(" ").length <= 6);
    if (!asks) return null;
    const q = t.replace(/^(what('s| is| are| does| do)?|whats|define|explain|tell me about|meaning of)\s+/, "");
    for (const [re, text, key] of GLOSSARY) if (re.test(q)) return text + glossaryValue(ctx, key);
    return null;
  }

  // ---------------------------------------------------------------- summaries
  function tubeText(t) {
    if (!t) return "—";
    let s = t.h && t.w ? `${t.h}×${t.w}` : t.shape === "biaxial" && t.htH ? `Ø${t.od} biaxial (${t.htH}×${t.htW} → ${t.bbH}×${t.bbW})` : `Ø${t.od}`;
    s += ` × ${t.wall} mm`;
    if (t.buttWall > 0 && t.buttLength > 0) s += ` (butted ${t.buttWall}/${t.wall}/${t.buttWall}, ${t.buttLength} mm ends)`;
    return s;
  }
  function wheelText(g) {
    const rb = +g.rimBSD || bsdOf(g.tireDiameter, g.tireWidth), fb = +g.rimBSDFront || (g.tireDiameterFront ? bsdOf(+g.tireDiameterFront, g.tireWidth) : rb);
    return fb === rb ? `${BSD[rb] || rb} × ${g.tireWidth} mm (Ø${g.tireDiameter})` : `${BSD[fb] || fb} front / ${BSD[rb] || rb} rear (mullet), ${g.tireWidth} mm`;
  }
  function geometrySummary(ctx) {
    const g = D(ctx).geometry, i = geo(ctx);
    return ["**Geometry** — " + ctx.App.designName(),
      `Reach ${g.reach} · Stack ${g.stack} · Stack/reach ${(g.stack / g.reach).toFixed(2)}`,
      `Head angle ${g.headAngle}° · Seat angle ${g.seatAngle}°`,
      `Chainstay ${g.chainstay} · BB drop ${g.bbDrop} · BB height ${r1(i.bbHeight)}`,
      `Head tube ${g.headTube} · Seat tube ${g.seatTube}`,
      `Fork ${g.forkA2C} A2C, ${g.forkOffset} offset · Trail ${r1(i.trail)}`,
      `Wheelbase ${r1(i.wheelbase)} · Front centre ${r1(i.frontCentre)} · Effective top tube ${r1(i.effectiveTopTube)}`,
      `Wheels ${wheelText(g)}`,
      "_All mm unless marked. Ask “in inches” for imperial._"].join("\n");
  }
  function tubesSummary(ctx) {
    const t = D(ctx).tubes, g = D(ctx).geometry, post = t.seatpost || {};
    const rows = [["Top tube", t.topTube], ["Down tube", t.downTube], ["Seat tube", t.seatTube], ["Head tube", t.headTube], ["Chainstays", t.chainstay], ["Seat stays", t.seatStay], ["BB shell", t.bbShell]];
    if (g.ssShape === "wishbone" && t.ssMono) rows.push(["Wishbone tube", t.ssMono]);
    if ((g.ssBridge === true || g.ssBridge === "true") && t.ssBridge) rows.push(["Bridge", t.ssBridge]);
    const pf = ctx.fld("tubes.seatpost.type");
    return ["**Tubes** — " + ctx.App.designName()].concat(rows.map(([n, x]) => `${n}: ${tubeText(x)}`))
      .concat([`Seatpost: ${pf ? ctx.fmtV(post.type, pf) : post.type} (Ø${post.od})`]).join("\n");
  }
  function orderSummary(ctx) {
    const d = D(ctx), g = d.geometry, i = geo(ctx), f = id => { const x = ctx.fld(id); return x ? ctx.fmtV(x.get(), x) : "—"; };
    const yes = v => v === true || v === "true";
    return ["**Spec to send your builder** — " + ctx.App.designName(),
      "_Check each line against your builder's order form; they draw it up and you approve the drawing._",
      "",
      "Geometry (mm / °):",
      `• Reach ${g.reach}, stack ${g.stack}`,
      `• Head angle ${g.headAngle}°, seat angle ${g.seatAngle}° (effective)`,
      `• Head tube ${g.headTube}, seat tube ${g.seatTube} (BB centre to top)`,
      `• Chainstay ${g.chainstay}, BB drop ${g.bbDrop}`,
      `• Fork axle-to-crown ${g.forkA2C}, offset ${g.forkOffset}${+d.use.forkTravel ? `, ${d.use.forkTravel} mm travel` : ", rigid"}`,
      `• Wheels/tyres: ${wheelText(g)}`,
      `• Works out to: wheelbase ${Math.round(i.wheelbase)}, trail ${Math.round(i.trail)}, BB height ${Math.round(i.bbHeight)}, ETT ${Math.round(i.effectiveTopTube)}`,
      "",
      "Tubes (OD × wall):",
      ...[["Top tube", "topTube"], ["Down tube", "downTube"], ["Seat tube", "seatTube"], ["Head tube", "headTube"], ["Chainstays", "chainstay"], ["Seat stays", "seatStay"]].map(([n, k]) => `• ${n}: ${tubeText(d.tubes[k])}`),
      "",
      "Details:",
      `• BB shell width ${g.bbShellWidth}, seatpost ${f("tubes.seatpost.type")}`,
      `• Seat stays: ${f("geometry.ssShape")}, bridge ${yes(g.ssBridge) ? "yes" : "no"}, chainstay yoke ${+g.csYokeLength > 0 ? g.csYokeLength + " mm" : "none"}`,
      `• Rear brake: ${f("geometry.brakeMount")}, ${g.rearRotor || "—"} mm rotor`,
      `• Tyre clearance asked for: ${g.csClearance} mm chainstays, ${g.ssClearance} mm seat stays`,
      `• Rider ${d.rider.riderKg} kg, terrain: ${f("use.condition")}`]
      .concat(Array.isArray(d.orderNotes) && d.orderNotes.length ? ["", "Notes for your builder (things the 3D model doesn't draw):"].concat(d.orderNotes.map(n => "• " + n.text)) : []).join("\n");
  }
  function inchify(s) {
    return String(s).replace(/(-?\d+(?:\.\d+)?)\s*mm\b/g, (m, v) => `${m} (${toIn(+v)} in)`)
      .replace(/^(Reach|Stack|Chainstay|BB drop|Head tube|Seat tube|Wheelbase|Front centre|Effective top tube|Fork) ([\d.]+)/gm, (m, k, v) => `${k} ${v} (${toIn(+v)} in)`);
  }

  // ---------------------------------------------------------------- 2. intents
  const I = [];
  const on = fn => I.push(fn);

  // --- answers to "Did you mean …?" -----------------------------------------
  on((raw, t, ctx) => {
    const p = ctx.state.pending; if (!p) return null;
    const ord = { first: 0, "1st": 0, "1": 0, second: 1, "2nd": 1, "2": 1, third: 2, "3rd": 2, "3": 2, last: -1 };
    let k = null;
    if (/^(yes|yeah|yep|yup|ya|y|sure|ok|okay|correct|right|that one|do it|go ahead|please do|yes please|that's it|exactly)\b[.!]*$/.test(t)) k = 0;
    const m = t.match(/^(?:the )?(first|1st|second|2nd|third|3rd|last|1|2|3)( one)?$/); if (m) k = ord[m[1]] === -1 ? p.options.length - 1 : ord[m[1]];
    if (/^(no|nope|nah|neither|none|cancel|no thanks)\b/.test(t)) { ctx.state.pending = null; return "OK, nothing changed. Type `list fields` to see every setting by name."; }
    if (k == null) { const f = topField(ctx, t, x => p.options.includes(x.id)); if (f && !ctx.numbersIn(t).length) k = p.options.indexOf(f.id); }
    if (k == null || !p.options[k]) return null;
    const f = ctx.fld(p.options[k]); ctx.state.pending = null; if (!f) return null;
    const n = ctx.numbersIn(ctx.norm(p.raw)); const tail = n.length ? " " + n[n.length - 1].raw.trim() : "";
    const rel = p.raw.match(/\b(longer|shorter|more|less|slacker|steeper|bigger|smaller|higher|lower|thicker|thinner)\b/);
    return ctx.one(f.label.toLowerCase().replace(/\(.*?\)/g, "") + tail + (rel && !tail ? " " + rel[1] : rel ? " " + rel[1] : ""));
  });

  // --- hello / thanks / who are you / clear --------------------------------
  on((raw, t, ctx) => {
    if (/^(hi|hello|hey|hiya|howdy|yo|good (morning|afternoon|evening)|sup|g'?day)\b[!. ]*(there|claude|chat|bot)?[!. ]*$/.test(t))
      return `Hi! Tell me what to change on **${ctx.App.designName()}** in plain words, e.g. “reach 460”, “slacker head angle”, “29 x 2.4 tyres” or “what should I send my builder”. Type \`help\` for lots more.`;
    if (/^(thanks|thank you|thx|ty|cheers|ta|nice|great|awesome|perfect|cool|sweet|good job|nice one|legend)\b/.test(t) && t.split(" ").length <= 5) return "You're welcome. Anything else to change?";
    if (/\b(are you (an? )?(ai|bot|robot|human|chatgpt|gpt|claude|llm|real)|who are you|what are you)\b/.test(t))
      return "I'm Cyclic Labs' built-in design chat: an offline phrasebook, **no AI model** and nothing sent anywhere. I understand a few thousand ways of saying design changes and questions. Type `help` to see them.";
    if (/^(clear|clean|wipe|reset) (the )?(chat|screen|log|conversation|messages)$|^cls$/.test(t)) return "\u0001CLEAR";
    if (/^(bye|goodbye|see ya|later|cya)\b/.test(t)) return "Bye! Your design stays as it is. Remember `save changes` or `save as <name>` if you want to keep it.";
    return null;
  });

  // --- undo several / never mind / reset ----------------------------------------
  on((raw, t, ctx) => {
    let m;
    if (/^(never ?mind|nevermind|scratch that|forget (it|that)|cancel( that)?|undo that|take that back|revert that|nah undo|no undo( that)?|oops)\b/.test(t)) return ctx.undo() ? "Undone." : "Nothing to undo.";
    if ((m = t.match(/^undo(?: the)?(?: last)? (\d+)(?: times| changes| edits| steps)?$|^undo (\d+) (?:times|changes|edits|steps)$/)) || /^undo twice$|^undo (two|2) times$/.test(t)) {
      const n = m ? +(m[1] || m[2]) : 2; let k = 0; while (k < n && ctx.undo()) k++;
      return k ? `Undid ${k} change${k > 1 ? "s" : ""}.` : "Nothing to undo.";
    }
    if (/^undo (all|everything|every change|all changes|all of (it|them))$/.test(t)) { let k = 0; while (ctx.undo()) k++; return k ? `Undid all ${k} change${k > 1 ? "s" : ""} made in this chat.` : "Nothing to undo."; }
    if (/^(reset|revert|restore|discard|throw away|go back to|back to)( all| every)?( the)?( changes| edits| everything| it| design| all| bike| saved( version| design)?| original| as saved)+$|^(start over|start again|from scratch|reset everything|revert everything|discard (all )?(my )?(changes|edits))$/.test(t)) {
      const base = baselineDesign(ctx); if (!base) return null;
      const before = ctx.snapshot(); ctx.App.restore(JSON.parse(JSON.stringify(base))); ctx.record(before, "reset");
      return `Back to the saved **${ctx.App.designName()}** (all unsaved edits undone). Say \`undo\` to get them back.`;
    }
    // "reset the reach", "put the stack back", "chainstay back to original"
    if ((m = t.match(/^(?:reset|revert|restore|undo)(?: the| my)? (.+?)(?: to (?:the )?(?:original|default|saved|before|how it was|what it was))?$|^put(?: the| my)? (.+?) back(?: to .*)?$|^(.+?) back to (?:the )?(?:original|default|saved|before|how it was|what it was|normal|stock)$/))) {
      const q = m[1] || m[2] || m[3]; if (/^(all|everything|it|that|this|chat)$/.test(q)) return null;
      const f = topField(ctx, q); const base = baselineDesign(ctx); if (!f || !base) return null;
      const v = getPath(base, f.id); if (v === undefined) return null;
      return setMany(ctx, [[f.id, v]], "reset " + f.id);
    }
    return null;
  });

  // --- follow-ups on the last thing changed or asked about ------------------
  on((raw, t, ctx) => {
    const st = ctx.state, last = st.last, lf = st.lastField && ctx.fld(st.lastField);
    if (topField(ctx, t)) return null;                     // a setting is named: not a follow-up
    let m;
    // "again", "same again", "do that again", "once more"
    if (/^(again|same again|(do|repeat) (that|it|this)( again)?|repeat|once more|one more time|keep going|more of (that|the same)|and again)[.!]*$/.test(t)) {
      if (!last) return "There's nothing to repeat yet.";
      const ch = []; for (const it of last.items) { const f = ctx.fld(it.id); if (!f || !(isFinite(+it.now) && isFinite(+it.old)) || it.now === "" || it.old === "") continue; ch.push([it.id, +(+f.get() + (+it.now - +it.old)).toFixed(3)]); }
      return ch.length ? setMany(ctx, ch, "again") : "That last change can't be repeated (it wasn't a number).";
    }
    // "too much", "go back halfway", "split the difference"
    if (/\b(too much|too far|overdid|overshot|half ?way( back)?|split the difference|meet in the middle|back off( a (bit|little|touch))?|go back (a bit|a little|half))\b/.test(t) && !/\d/.test(t)) {
      if (!last) return "There's no change to back off yet.";
      const ch = []; for (const it of last.items) { if (!(isFinite(+it.now) && isFinite(+it.old)) || it.now === "" || it.old === "") continue; ch.push([it.id, +((+it.old + +it.now) / 2).toFixed(2)]); }
      return ch.length ? setMany(ctx, ch, "halfway") : null;
    }
    if (!lf) return null;
    // "make it 470", "now 66", "try 65.5", "what about 440", "460 instead", "470"
    if ((m = t.match(/^(?:and |ok |okay |hmm |then )?(?:make (?:it|that|them)|set (?:it|that|them)(?: to)?|change (?:it|that|them)(?: to)?|now|try|what about|how about|go|go to|go with|let's do|lets do|do|put (?:it|that) at|instead)?\s*(?:to |at )?([+-]?\d+(?:\.\d+)?)\s*(mm|cm|°|in|kg|lb|psi|w|t|%)?\s*(?:instead|then|please|pls|thanks)?[.!?]*$/))) {
      if (m[2] === "%") return null;
      const n = ctx.numbersIn(m[1] + (m[2] ? " " + m[2] : ""))[0]; let v = ctx.convert(n, lf);
      if (lf.kind === "select") return ctx.one(lf.label.replace(/\(.*?\)/g, "") + " " + m[1]);
      if (n.signed) v = (+lf.get() || 0) + v;
      return setMany(ctx, [[lf.id, +(+v).toFixed(3)]], "follow-up");
    }
    // "5 more", "another 5", "a bit more", "and 5 less", "a little less", "further", "bit more"
    if ((m = t.match(/^(?:and |ok |then |now )?(?:(another|an extra|add|plus|take|minus)\s+)?(?:(a (?:bit|little|touch|tad|lot)|slightly|bit|little|lots|much|way)\s+)?([+-]?\d+(?:\.\d+)?\s*(?:mm|cm|°|in|kg|lb|psi|w|t)?)?\s*(more|less|further|extra|longer|shorter|higher|lower|bigger|smaller|steeper|slacker|thicker|thinner|up|down|back)?(?: than that)?(?: please)?[.!]*$/)) && (m[1] || m[3] || m[4])) {
      if (lf.kind !== "num") return null;
      const lastDelta = last && last.items.find(x => x.id === lf.id); const dirLast = lastDelta && isFinite(+lastDelta.now - +lastDelta.old) ? Math.sign(+lastDelta.now - +lastDelta.old) || 1 : 1;
      let dir = 0; const w = m[4] || "";
      if (/^(more|longer|higher|bigger|steeper|thicker|up|extra)$/.test(w) || /^(another|an extra|add|plus)$/.test(m[1] || "")) dir = 1;
      if (/^(less|shorter|lower|smaller|thinner|down)$/.test(w) || /^(take|minus)$/.test(m[1] || "")) dir = -1;
      if (/^(further)$/.test(w) || (m[1] === "another" && !w)) dir = dirLast;
      if (w === "back") dir = -dirLast;
      if (w === "slacker") dir = lf.id === "geometry.headAngle" || lf.id === "geometry.seatAngle" ? -1 : 1;
      if (w === "steeper") dir = 1;
      if (!dir) return null;
      const n = m[3] ? ctx.numbersIn(m[3])[0] : null;
      const step = n ? Math.abs(ctx.convert(n, lf)) : ctx.nudgeSize(lf) * ctx.sizeWord(t);
      return setMany(ctx, [[lf.id, +((+lf.get() || 0) + dir * step).toFixed(3)]], "follow-up");
    }
    return null;
  });

  // --- definitions --------------------------------------------------------
  on((raw, t, ctx) => define(raw, t, ctx));

  // --- summaries and questions about the whole bike -----------------------------
  on((raw, t, ctx) => {
    const inches = /\b(in|into) (inches|imperial|freedom units)\b|\bimperial\b/.test(t);
    const q = t.replace(/\b(in|into) (inches|imperial|freedom units)\b|\bimperial\b/g, "").trim();
    const out = s => inches ? inchify(s) : s;
    if (/\b(what (should|do|would) i (send|give|tell|ask)( to)? (?:waltly|my builder|the builder|your builder|builder)|order (form|summary|sheet|spec)|spec ?sheet|send (to )?(?:waltly|my builder|the builder|your builder|builder)|(?:waltly|my builder|the builder|your builder|builder) (form|order|spec)|build sheet|full spec|summary for (?:waltly|my builder|the builder|your builder|builder)|what do i order|order details)\b/.test(q)) return orderSummary(ctx);
    if (/^(show|list|give|what('s| is| are)?|whats|tell me)?( me)?( the| all| my| full)* ?(geometry|geo)( summary| chart| numbers| table| sheet)?\??$|^geometry (summary|chart|numbers|table|sheet)\??$|^(all|full|every) (the )?(numbers|dimensions|measurements)\??$/.test(q)) return out(geometrySummary(ctx));
    if (/^(show|list|give|what('s| is| are)?|whats|tell me)?( me)?( the| all| my)* ?(tubes?|tube ?set|tubing|tube sizes|tube list|tube spec)( list| summary| sizes)?\??$|\bwhat tubes?\b|\b(tube|tubing) (summary|spec|list)\b|\bwhich tubes\b/.test(q)) return tubesSummary(ctx);
    const d = D(ctx), g = d.geometry;
    if (/\b(gear|gearing|ratio|gears|gear inches|gain ratio)\b/.test(q) && isQ(raw, q) && !/\d/.test(q) && !/\bstack\b|\breach\b|\bs ?\/ ?r\b/.test(q)) {
      const ratio = g.chainring / g.cog, gi = ratio * g.tireDiameter / 25.4, dev = ratio * Math.PI * g.tireDiameter / 1000;
      return `**Gearing**: ${g.chainring} × ${g.cog} — ratio ${ratio.toFixed(2)}, about ${gi.toFixed(1)} gear inches, ${dev.toFixed(2)} m per crank turn. At 90 rpm that's ${(dev * 90 * 60 / 1000).toFixed(1)} km/h.`;
    }
    if (/\b(how (heavy|much does (it|the frame) weigh)|frame weight|weight of the frame|how much (will|would|does) it weigh|tube weight)\b/.test(q) && !/\d/.test(q)) {
      const s = ctx.App.summary(); return s ? `**Tube weight**: ${s.mass} (frame tubes only — add roughly 250–400 g for dropouts, head and BB shell machining, bosses and paint).` : null;
    }
    if (/\b(is it|will it|would it|is the frame|is this|does it|can it)\b.*\b(safe|strong|pass|survive|hold up|last|break|crack|fail|ok|okay|good enough)\b|\b(strong enough|safe enough|pass (the )?(iso|lab|tests?))\b|^(results|how did it do|how'?s it look(ing)?|verdict)\??$/.test(q)) {
      const s = ctx.App.summary(); if (!s) return "The analysis hasn't run yet — give it a second and ask again.";
      return `**How it's doing**: fatigue life ${s.life}, lab (ISO) tests ${s.iso}, flat-landing limit ${s.landing}, tubes ${s.mass}.\n_${/fail/.test(s.iso) ? "Some ISO tests fail: switch on Design + Engineering (`engineering mode`) to see which, then try thicker walls on the tube that's red." : "All lab tests pass at the chosen severity."}_`;
    }
    // "stack and reach?", "reach, stack and head angle?"
    if (isQ(raw, q) && /\band\b|,/.test(q) && !/\d/.test(q)) {
      const parts = q.replace(/^(what('s| is| are)?|whats|show me|tell me|give me)\s+/, "").split(/\s*(?:,|\band\b)\s*/).filter(Boolean);
      if (parts.length > 1) {
        const ans = []; for (const p of parts) { const r = ctx.one("what is the " + p.replace(/\?/g, "")); if (!/^\*\*/.test(r)) return null; ans.push(r.split("\n")[0]); }
        return out(ans.join("\n"));
      }
    }
    if (/\bstack (to|\/|over) reach\b|\bs ?\/ ?r ratio\b|\bstack reach ratio\b/.test(q) && !/\d/.test(q)) return `**Stack-to-reach**: ${(g.stack / g.reach).toFixed(2)} (${g.stack} ÷ ${g.reach}). Around 1.35 is racy, 1.45–1.55 relaxed.`;
    if (inches && isQ(raw, q)) { const r = ctx.one(q || "what's the reach"); return out(r); }
    if (/^(what|which|show|list)( are| is)?( my| the| all)? (designs|bikes|saved designs|saved bikes)|^(my|saved) (designs|bikes)\??$|^what (designs|bikes) (do i have|are there|can i open)/.test(q))
      return "**Designs**: " + ctx.App.allDesigns().map(x => x.name).join(" · ") + "\nSay `open <name>` or `compare with <name>`.";
    return null;
  });

  // --- height / inseam (not settings: point at what is) ------------------------
  on((raw, t, ctx) => {
    let m;
    if ((m = t.match(/\b(?:my )?inseam(?: is)?(?: of)? (\d+(?:\.\d+)?)\s*(cm|mm|in)?\b/))) {
      let v = +m[1]; const u = m[2] || (v < 45 ? "in" : v < 120 ? "cm" : "mm"); v = u === "in" ? v * 25.4 : u === "cm" ? v * 10 : v;
      const sh = Math.round(v * 0.883);
      ctx.state.pendingNext = null; ctx.state.pending = { kind: "field", options: ["geometry.saddleHeight"], raw: "saddle height " + sh }; ctx.state.keepPending = true;
      return `An inseam of ${Math.round(v)} mm usually means a saddle height of about **${sh} mm** (BB centre to saddle top, inseam × 0.883). Say \`yes\` to use that, or \`fit me a 32er\` for a full fit.`;
    }
    if (/\b(i'?m|i am|my height( is)?|height|tall)\b/.test(t) && (/\d\s*(ft|foot|feet)\b|\d\s*(cm|m)\s*tall\b|\btall\b|\bheight\b/.test(t)) && !/\b(stack|head tube|seat tube|tyre|tire|bar|bars|stem|spacer|saddle|seat|bb|bottom bracket|drop|axle|toe|box|bridge|standover|post|fender|mudguard)\b/.test(t))
      return "Your height isn't a setting here — frames are sized from **reach**, **stack** and **saddle height**. If you know your inseam, say `my inseam is 86 cm`. `fit me a 32er` does a full fit from your current bike.";
    return null;
  });

  // --- views, parts shown and buttons -------------------------------------------
  const click = sel => { const b = document.querySelector(sel); if (b) { b.click(); return true; } return false; };
  on((raw, t, ctx) => {
    if (/\b(overlay|ghost|overlaid)\b/.test(t)) return null;          // overlay.js handles these
    let m;
    const VIEW = [["side", /\b(side|profile|drive ?side|right side)\b/], ["nds", /\b(other side|non ?drive ?side|nds|left side)\b/], ["top", /\b(top|above|bird'?s eye|overhead|plan)\b/],
      ["rear", /\b(rear|behind|back|from the back)\b/], ["three", /\b(3 ?\/ ?4|three ?quarter|0\.75|3 4|angled|perspective|iso(metric)?)\b/]];
    if ((/\bview\b|^(look|rotate|turn|spin)( at)?( it| the bike)?\b|^(show|see)( me)? (it|the bike|the frame) from\b|\b(look|seen|view(ed)?) from\b/.test(t) || /^(side|top|rear|front|other side|non drive side|3 ?\/ ?4|0\.75|three quarter)( on)?$/.test(t)) && !/\b(realistic|analysis|engineering|design mode|full ?screen|overlay)\b/.test(t)) {
      for (const [k, re] of [VIEW[1], VIEW[2], VIEW[4], VIEW[3], VIEW[0]]) if (re.test(t)) { click(`[data-view="${k}"]`); return `Showing the ${{ side: "side", nds: "non-drive side", top: "top", rear: "rear", three: "3/4" }[k]} view.`; }
      if (/\b(reset|default|normal|home)\b/.test(t)) { click('[data-view="side"]'); return "View reset to the side."; }
    }
    if (/^(line drawing|wireframe|line view|simple view|stick drawing|stress view|stress colou?rs)$|^(show|switch to) (the )?(line drawing|wireframe|stress view)/.test(t)) { ctx.App.setReal(false); return "Showing the line drawing / analysis view."; }
    if (/^(photo ?realistic|realistic|real|rendered|render|pretty|nice) (view|mode|bike)$|^(show|switch to) (the )?(photo ?realistic|rendered|finished) (view|bike)/.test(t)) { ctx.App.setReal(true); return "Showing the realistic view."; }
    if (/\b(full ?screen|maximi[sz]e|bigger view|fill the screen)\b/.test(t)) { click("#btnFull"); return "Full screen toggled (Esc to leave)."; }
    if (/\b(screenshot|screen shot|save (a |the )?(picture|image|photo|png)|take (a )?(picture|photo|snap)|export (a |the )?(picture|image|png))\b/.test(t)) { click("#btnShot"); return "Saving a picture of the current view."; }
    // parts shown in the 3D view
    const PART = [["wheels", /\b(wheels?|tyres?|tires?)\b/], ["rotors", /\b(rotors?|discs?)\b/], ["fork", /\bfork\b/], ["cockpit", /\b(stem|bars?|handlebars?|cockpit)\b/], ["post", /\b(seat ?post|dropper|saddle|post)\b/], ["drive", /\b(cranks?|chain|drivetrain|chainring)\b/]];
    if (/^(just|only) (the )?frame$|^frame only$|^(hide|remove) (all )?(the )?parts$|^(show )?(the )?(bare|naked) frame$/.test(t)) { click("#partsNone"); return "Showing the frame only. `show everything` puts the parts back."; }
    if (/^(show|display) (all|every(thing)?|all (the )?parts|the whole bike|whole bike|complete bike)$|^(all|every) parts( on)?$|^whole bike$/.test(t)) { click("#partsAll"); return "Showing all parts."; }
    if ((m = t.match(/^(hide|remove|turn off|switch off|show|display|turn on|switch on|add back|bring back)\s+(?:the\s+)?(.+?)(?:\s+(?:in the )?(?:3d|view|drawing))?$/))) {
      const hide = /^(hide|remove|turn off|switch off)/.test(m[1]); const hits = PART.filter(([, re]) => re.test(m[2]));
      if (hits.length && !/\d/.test(t) && !/\b(geometry|tubes?|size|width|pressure|clearance|diameter|weight|length|stack|reach|travel|offset|rise|spacing|line|gap)\b/.test(m[2])) {
        for (const [k] of hits) { const box = document.querySelector(`#partToggles input[data-part="${k}"]`); if (box && box.checked === hide) { box.checked = !hide; box.dispatchEvent(new Event("change")); } }
        return `${hide ? "Hiding" : "Showing"} ${hits.map(h => h[0]).join(", ")} in the 3D view.`;
      }
    }
    // load cases and animations (engineering view)
    const cs = document.querySelector("#caseSelect");
    if (cs && /\b(worst( case)?|show (the )?(worst|highest stress))\b/.test(t) && !/\d/.test(t) && t.split(" ").length <= 5) { cs.value = "worst"; cs.dispatchEvent(new Event("change")); return "Showing the worst of all riding loads (stress colours in the analysis view)."; }
    if (cs && /\b(load|loads|case|test|stress|colou?r)\b/.test(t) && (m = t.match(/^(?:show|display|view|colou?r by|stress (?:for|from|in))(?: me)?(?: the)? (.+?)(?: load| case| test| load case)?$/))) {
      const want = ctx.words(m[1]).filter(w => w.length > 2 && !/^(load|case|test|the|stress|colours?)$/.test(w));
      if (want.length) {
        let best = null, bs = 0; for (const o of cs.options) { const ow = ctx.words(o.textContent); const s = want.filter(w => ow.some(x => x.startsWith(w) || w.startsWith(x))).length / want.length; if (s > bs) { bs = s; best = o; } }
        if (best && bs >= 0.5) { if (ctx.App.isReal()) ctx.App.setReal(false); cs.value = best.value; cs.dispatchEvent(new Event("change")); return `Showing **${best.textContent.trim()}** in the analysis view.`; }
      }
    }
    const an = document.querySelector("#animSel");
    if (an && /\b(animat(e|ion)|play|watch)\b/.test(t) && !/\bstop\b/.test(t)) {
      const want = ctx.words(t).filter(w => w.length > 3 && !/^(animate|animation|play|watch|show|the|test)$/.test(w));
      let best = null, bs = 0; for (const o of an.options) { const ow = ctx.words(o.textContent); const s = want.filter(w => ow.some(x => x.startsWith(w.slice(0, 5)))).length; if (s > bs) { bs = s; best = o; } }
      if (best) { an.value = best.value; an.dispatchEvent(new Event("change")); }
      else if (want.length) return `There's no “${want.join(" ")}” animation. Animations: ${[...an.options].map(o => o.textContent.trim()).join(" · ")} (e.g. \`animate the huck\`). For a load case as a still picture: \`show the sprint load\`.`;
      if (ctx.App.uiMode && ctx.App.uiMode() !== "eng") ctx.App.setUiMode("eng");
      if (ctx.App.isReal()) ctx.App.setReal(false);
      click("#animPlay"); return `Playing the ${best ? "“" + best.textContent.trim() + "”" : ""} animation. \`stop animation\` stops it.`;
    }
    if (/^stop( the)?( animation| animating| playing| it)?$/.test(t)) { click("#animStop"); return "Stopped."; }
    // files and other buttons
    if (/^(export|download|backup|back up|save (it )?(to|as) (a )?file|save a copy|export (the )?(design|file|json))\b/.test(t)) { click("#btnExport"); return "Exporting the design as a file (check your downloads)."; }
    if (/^(import|load|open) (a |the )?(file|json|design file)\b|^import\b/.test(t)) { click("#btnImport"); return "Pick the file to import."; }
    if (/\b(scan|read|import|upload|load) (a |the |my )?((?:waltly|my builder|the builder|your builder|builder) )?(drawing|pdf|frame drawing|picture of the drawing)\b/.test(t)) { if (root.FrameScanUI) root.FrameScanUI.open(); return "Opening the drawing scanner: drop in your builder's PDF or a photo of the drawing."; }
    if (/^delete( this| the)?( design| bike| saved)?$/.test(t)) { try { root.FrameJourney && root.FrameJourney.open("w-bikes"); } catch (e) {} return "Opened **Your bikes**: under **Saved bikes** each bike has a **Delete** button (click twice), or tick several and press **Delete ticked**. You can also say `delete bike <name>` or `delete this bike`, and `undo delete` brings it back."; }
    if (/^(stop|no|turn off|don'?t|hide( the)?|clear( the)?) ?compar(e|ing|ison)\b|^compare (to |with )?(nothing|none|off)$/.test(t)) { ctx.App.compareWith(""); return "Not comparing with anything now."; }
    if (/\b(run|start|do) (the )?(calculix|ccx|fe|finite element)( check)?\b/.test(t)) { click("#btnCcx"); return "Running the CalculiX check (results show in the engineering panel)."; }
    if (/\b(run|start|do) (the )?(3d )?weld (models?|check)\b/.test(t)) { click("#btnJoints"); return "Running the 3D weld models (this takes a while; there's a Stop button)."; }
    if (/\b(find|search for|optimi[sz]e|run the optimi[sz]er)\b.*\b(plush|comfort|best|safe|optimal)/.test(t)) { if (ctx.App.uiMode && ctx.App.uiMode() !== "eng") ctx.App.setUiMode("eng"); click("#btnOpt"); return "Searching for the plushest safe frame (engineering panel)."; }
    if (/^(save( it| this| changes)?|keep( it| this| changes)?|save my (changes|edits|work))[.!]*$/.test(t)) return ctx.App.saveChanges();
    return null;
  });

  // --- targets for worked-out numbers: trail, wheelbase, BB height, ETT, front centre, stack/reach ---
  const TARGET = [
    { key: "trail", re: /\btrail\b/, lever: "geometry.headAngle", alt: [[/\boffset|rake\b/, "geometry.forkOffset"], [/\bhead ?angle|hta\b/, "geometry.headAngle"], [/\ba2c|axle to crown|fork length\b/, "geometry.forkA2C"]], step: 5, name: "Trail" },
    { key: "wheelbase", re: /\bwheel ?base\b/, lever: "geometry.chainstay", alt: [[/\breach\b/, "geometry.reach"], [/\bhead ?angle|hta\b/, "geometry.headAngle"], [/\bchain ?stays?\b|\bcs\b/, "geometry.chainstay"], [/\boffset\b/, "geometry.forkOffset"]], step: 10, name: "Wheelbase", range: { "geometry.chainstay": [380, 520] } },
    { key: "bbHeight", re: /\b(bb|bottom bracket) height\b/, lever: "geometry.bbDrop", alt: [], step: 5, name: "BB height" },
    { key: "effectiveTopTube", re: /\b(ett|effective top tube|effective tt|virtual top tube|horizontal top tube)\b/, lever: "geometry.reach", alt: [[/\bseat ?angle|sta\b/, "geometry.seatAngle"]], step: 10, name: "Effective top tube" },
    { key: "frontCentre", re: /\bfront cent(er|re)\b|\bfc\b/, lever: "geometry.reach", alt: [[/\bhead ?angle|hta\b/, "geometry.headAngle"], [/\boffset\b/, "geometry.forkOffset"]], step: 10, name: "Front centre" }
  ];
  function solve(ctx, leverId, key, target) {
    const f = ctx.fld(leverId); if (!f) return null;
    const A = ctx.App, snap = JSON.parse(JSON.stringify(A.design()));
    const y = x => { f.set(x); const i = A.geometryInfo(); return i ? i[key] : NaN; };
    let x = +f.get(), fx = y(x) - target, h = f.unit === "°" ? 0.2 : 2, ok = isFinite(fx);
    for (let k = 0; k < 25 && ok && Math.abs(fx) > 0.02; k++) {
      const d = (y(x + h) - target - fx) / h; if (!isFinite(d) || Math.abs(d) < 1e-6) { ok = false; break; }
      let nx = x - fx / d; if (Math.abs(nx - x) > (f.unit === "°" ? 6 : 150)) nx = x + Math.sign(nx - x) * (f.unit === "°" ? 6 : 150);
      x = nx; fx = y(x) - target; if (!isFinite(fx)) ok = false;
    }
    A.restore(snap);
    if (!ok || Math.abs(fx) > 3) return { fail: true };
    return { f, v: f.unit === "°" ? r1(x) : Math.round(x) };
  }
  on((raw, t, ctx) => {
    const T = TARGET.find(x => x.re.test(t)); if (!T) return null;
    if (isQ(raw, t) && !/\b(make|set|change|want|need|get)\b/.test(t)) {
      const v = geo(ctx)[T.key]; return isFinite(v) ? `**${T.name}**: ${mm(v, 1)} (worked out from the geometry)${/\binch|imperial\b/.test(t) ? ` = ${toIn(v)} in` : ""}.` : null;
    }
    const ns = ctx.numbersIn(t.replace(/\b(\d+(\.\d+)?)\s*(°|deg)\b.*$/, ""));
    const cur = geo(ctx)[T.key]; if (!isFinite(cur)) return null;
    let target;
    const n = ns[ns.length - 1];
    const dir = ctx.relDir(t.replace(T.re, " "), n, !n);
    if (n) { const v = lenMM(n); target = dir ? cur + dir * (n.unit === "%" ? cur * n.v / 100 : v) : v; }
    else if (dir) target = cur + dir * T.step * ctx.sizeWord(t);
    else if (/\b(less|reduce|lower|shorter|smaller|decrease)\b/.test(t)) target = cur - T.step * ctx.sizeWord(t);
    else if (/\b(more|add|increase|longer|bigger|higher)\b/.test(t)) target = cur + T.step * ctx.sizeWord(t);
    else return null;
    let lever = T.lever; for (const [re, id] of T.alt) if (re.test(t.replace(T.re, " "))) lever = id;
    const s = solve(ctx, lever, T.key, target);
    if (!s || s.fail) return `I couldn't reach a ${T.name.toLowerCase()} of ${mm(target)} by changing the ${(ctx.fld(lever) || {}).label || lever}. Try another way, e.g. “${T.name.toLowerCase()} ${Math.round(target)} using the ${T.alt.length ? T.alt[0][1].split(".").pop().replace(/([A-Z])/g, " $1").toLowerCase() : "reach"}”.`;
    const rg = T.range && T.range[lever]; if (rg && (s.v < rg[0] || s.v > rg[1])) return `That would need a ${s.f.label.toLowerCase()} of ${s.v} mm, which is outside a sensible ${rg[0]}–${rg[1]} mm. Try “${T.name.toLowerCase()} ${Math.round(target)} using the reach”.`;
    const r = setMany(ctx, [[s.f.id, s.v]], "target " + T.key);
    const after = geo(ctx)[T.key];
    return r + `\n_${T.name} ${mm(cur, 1)} → ${mm(after, 1)} (changed the ${s.f.label.toLowerCase()}${lever === T.lever && T.alt.length ? `; say “using the ${T.alt[0][1].split(".").pop().replace(/([A-Z])/g, " $1").toLowerCase()}” to change that instead` : ""})._`;
  });
  // stack-to-reach ratio target
  on((raw, t, ctx) => {
    let m; if (!(m = t.match(/\bstack (?:to |\/ ?|over )?reach(?: ratio)?(?: of| to)? (\d(?:\.\d+)?)\b|\bs ?\/ ?r(?: ratio)? (\d(?:\.\d+)?)\b/))) return null;
    const v = +(m[1] || m[2]); if (!(v > 0.9 && v < 2.2)) return null; const g = D(ctx).geometry;
    return /\b(using|keep|keeping|by changing|with) (the )?stack\b/.test(t) ? setMany(ctx, [["geometry.reach", Math.round(g.stack / v)]], "ratio") : setMany(ctx, [["geometry.stack", Math.round(g.reach * v)]], "ratio", "Kept the reach and changed the stack; say “… keeping the stack” to change the reach instead.");
  });
  // "stack/reach 650/460", "reach and stack 460 and 650", "reach & stack: 460, 650"
  on((raw, t0, ctx) => {
    let m; const t = slashText(raw, t0);
    if ((m = t.match(/^(?:set |make |change )?(?:the )?([a-z ]+?)\s*(?:\/|and|&)\s*([a-z ]+?)\s*(?:to |of |at |are |is |:)?\s*([\d.]+)\s*(?:mm|°)?\s*(?:\/|and|&|,)\s*([\d.]+)\s*(?:mm|°)?(?: respectively)?$/))) {
      const f1 = topField(ctx, m[1]), f2 = topField(ctx, m[2]); if (!f1 || !f2 || f1 === f2) return null;
      return setMany(ctx, [[f1.id, +m[3]], [f2.id, +m[4]]], "pair");
    }
    return null;
  });

  // --- BB height words: "lower the BB" means MORE drop ----------------------------
  on((raw, t, ctx) => {
    if (!/\b(bb|bottom bracket)\b/.test(t) || /\b(bb|bottom bracket) (drop|height|shell|width)\b|\bshell\b/.test(t)) return null;
    const down = /\b(lower|lowered|drop|dropped|down|decrease|reduce|less high)\b/.test(t), up = /\b(raise|raised|higher|up|increase|lift|more clearance)\b/.test(t);
    if (down === up) return null;
    const n = ctx.numbersIn(t)[0], step = n ? lenMM(n) : 5 * ctx.sizeWord(t);
    const g = D(ctx).geometry;
    return setMany(ctx, [["geometry.bbDrop", +(g.bbDrop + (down ? step : -step)).toFixed(1)]], "bb", `${down ? "Lower" : "Higher"} BB = ${down ? "more" : "less"} BB drop.`);
  });

  // --- tyres and wheels ----------------------------------------------------------
  const WHEEL_RE = "(26|27\\.5|275|29|32|650 ?b|700 ?c?|584|622|559|686)";
  const bsdFromWord = w => { w = String(w).replace(/\s/g, ""); return /^(26|559)$/.test(w) ? 559 : /^(27\.5|275|650b|584)$/.test(w) ? 584 : /^(29|700c?|622)$/.test(w) ? 622 : /^(32|686)$/.test(w) ? 686 : null; };
  const widthMM = (v, u) => (u === "in" || (!u && +v < 6)) ? Math.round(+v * 25.4) : Math.round(+v);
  function tyreChanges(ctx, which, bsd, width) {
    const g = D(ctx).geometry, out = [];
    const rearB = bsd && which !== "front" ? bsd : (+g.rimBSD || bsdOf(g.tireDiameter, g.tireWidth));
    const w = width || g.tireWidth;
    if (which === "front") {
      const fb = bsd || +g.rimBSDFront || rearB;
      out.push(["geometry.rimBSDFront", fb], ["geometry.tireDiameterFront", tyreOD(fb, w)]);
      if (w > g.tireWidth) out.push(["geometry.tireWidth", w]);
      return out;
    }
    out.push(["geometry.rimBSD", rearB], ["geometry.tireWidth", w], ["geometry.tireDiameter", tyreOD(rearB, w)], ["parts.tyreWidth", w]);
    if (which === "both") {
      const fb = +g.rimBSDFront, fOD = +g.tireDiameterFront;
      if (bsd) out.push(["geometry.rimBSDFront", ""], ["geometry.tireDiameterFront", ""]);       // same wheel front and rear
      else if (fb || fOD) out.push(["geometry.tireDiameterFront", tyreOD(fb || bsdOf(fOD, g.tireWidth), w)]);
    }
    return out;
  }
  on((raw, t, ctx) => {
    let m;
    const which = /\bfront\b/.test(t) && !/\brear\b/.test(t) ? "front" : /\b(rear|back)\b/.test(t) && !/\bfront\b/.test(t) ? "rear" : "both";
    if (/\b(fork|stem|bar|rotor|offset|travel|chainring|cog|ring|crank|gear|gears|gearing|ratio|singlespeed|teeth|tooth|sprocket)\b/.test(t)) return null;
    // mullet / full 29 / 650b everywhere
    if (/\bmullet\b/.test(t) && !/\b(no|not|un|remove|undo)\b/.test(t)) {
      const g = D(ctx).geometry, w = g.tireWidth;
      return setMany(ctx, [["geometry.rimBSD", 584], ["geometry.tireDiameter", tyreOD(584, w)], ["geometry.rimBSDFront", 622], ["geometry.tireDiameterFront", tyreOD(622, w)]], "mullet", "29 in front, 27.5 in rear.");
    }
    if (/\b(full 29(er)?|29er|29 ?(in|inch)? (front and rear|both ends|all round)|no mullet|un ?mullet)\b/.test(t) && !/\d+\s*x/.test(t)) return setMany(ctx, tyreChanges(ctx, "both", 622, null), "wheels");
    // "29 x 2.4", "700x45", "650b x 2.1", "27.5 x 2.8 tires", "front tyre 29x2.6"
    if ((m = t.match(new RegExp("\\b" + WHEEL_RE + "\\s*(?:in|inch|er)?\\s*(?:x|by)\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|in|c)?\\b")))) {
      const bsd = bsdFromWord(m[1]); if (!bsd) return null;
      const w = widthMM(m[2], m[3] === "in" ? "in" : m[3] === "mm" ? "mm" : null);
      if (!(w >= 18 && w <= 130)) return null;
      return setMany(ctx, tyreChanges(ctx, which, bsd, w), "tyre", `${BSD[bsd]} × ${w} mm → about Ø${tyreOD(bsd, w)} mm outside.`);
    }
    // "700c 40mm tyres"
    if ((m = t.match(new RegExp("\\b" + WHEEL_RE + "\\s*(?:in|inch)?\\s+(?:wheels? (?:with |and )?)?(\\d+(?:\\.\\d+)?)\\s*(mm|in)\\s*(?:wide )?(?:tires?|rubber)\\b")))) {
      const bsd = bsdFromWord(m[1]), w = widthMM(m[2], m[3]); if (!bsd || !(w >= 18 && w <= 130)) return null;
      return setMany(ctx, tyreChanges(ctx, which, bsd, w), "tyre");
    }
    // wheel size only: "make it 650b", "27.5 wheels", "29 inch wheels", "26in wheels"
    if ((m = t.match(new RegExp("^(?:make it |go |switch to |change to |use |fit |run )?(?:a |an )?" + WHEEL_RE + "\\s*(?:in|inch|er)?\\s*(?:wheels?|rims?|bike|wheeled|wheel size)?(?: front and rear| both ends| all round| please)?$|\\b" + WHEEL_RE + "\\s*(?:in|inch)?\\s*(?:wheels|rims|wheel size)\\b")))) {
      const bsd = bsdFromWord(m[1] || m[2]); if (!bsd) return null;
      if (/\bwheel size\b/.test(t) && which !== "both") return null;    // "front wheel size 29" is a plain setting
      return setMany(ctx, tyreChanges(ctx, which, bsd, null), "wheels", `${BSD[bsd]} wheels with the same ${D(ctx).geometry.tireWidth} mm tyres → about Ø${tyreOD(bsd, D(ctx).geometry.tireWidth)} mm.`);
    }
    // tyre width only: "2.4 inch tyres", "45mm tires", "fit 2.6 tires", "tyres 50mm wide", "wider tyres"
    if ((m = t.match(/\b(\d+(?:\.\d+)?)\s*(mm|in)?\s*(?:wide\s+)?(?:tires?|rubber)\b|\b(?:tires?)\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(mm|in)?(?:\s+wide)?$/)) && !/\b(width|pressure|psi|diameter|od|clearance|drawn)\b/.test(t)) {
      const v = m[1] || m[3], u = m[2] || m[4]; const w = widthMM(v, u === "in" ? "in" : u === "mm" ? "mm" : null);
      if (!(w >= 18 && w <= 130)) return null;
      return setMany(ctx, tyreChanges(ctx, which, null, w), "tyre", `Tyre outside diameter recalculated for the same rim.`);
    }
    if (/\b(wider|fatter|bigger|chunkier|narrower|skinnier|thinner|smaller)\s+(tires?|rubber)\b/.test(t) && !/\d/.test(t)) {
      const g = D(ctx).geometry, up = /\b(wider|fatter|bigger|chunkier)\b/.test(t), w = g.tireWidth + (up ? 1 : -1) * 5 * ctx.sizeWord(t);
      return setMany(ctx, tyreChanges(ctx, which, null, Math.round(w)), "tyre");
    }
    // clearance
    if (/\bclearance\b/.test(t) && /\b(tire|mud|wheel|stays?)\b|^clearance\b/.test(t) && !/\b(mudguard|fender|pedal|toe|heel)\b/.test(t)) {
      const g = D(ctx).geometry, n = ctx.numbersIn(t)[0];
      const only = /\bchain ?stays?|yoke\b/.test(t) ? ["geometry.csClearance"] : /\bseat ?stays?\b/.test(t) ? ["geometry.ssClearance"] : ["geometry.csClearance", "geometry.ssClearance"];
      const dir = /\b(more|extra|increase|bigger|add|loads of|lots of)\b/.test(t) ? 1 : /\b(less|reduce|tighter|smaller|decrease)\b/.test(t) ? -1 : 0;
      if (!n && !dir) return isQ(raw, t) ? `**Tyre clearance**: chainstays/yoke ${g.csClearance} mm, seat stays ${g.ssClearance} mm.` : null;
      return setMany(ctx, only.map(id => [id, n ? (dir ? +(ctx.fld(id).get()) + dir * lenMM(n) : lenMM(n)) : +(ctx.fld(id).get()) + dir * 2 * ctx.sizeWord(t)]), "clearance");
    }
    return null;
  });

  // --- gearing --------------------------------------------------------------------
  on((raw, t0, ctx) => {
    let m; const g = D(ctx).geometry, t = slashText(raw, t0);
    if ((m = t.match(/^(?:gearing |gear |gears |run |use |set (?:the )?gearing (?:to )?|singlespeed |ss )?(\d{2})\s*(?:\/|x|by|:|t? ?(?:x|by|\/))\s*(\d{1,2})\s*t?(?: gearing| gear| ratio| singlespeed| ss)?$|\b(?:gearing|gear|gears|singlespeed|ss)\b.*?\b(\d{2})\s*(?:\/|x|by|:)\s*(\d{1,2})\b|\b(\d{2})\s*(?:t\s*)?(?:\/|x|by|:)\s*(\d{1,2})\s*t?\s+(?:gearing|gear|gears)\b/))) {
      const a = +(m[1] || m[3] || m[5]), b = +(m[2] || m[4] || m[6]);
      if (a >= 20 && a <= 60 && b >= 9 && b <= 52 && a !== b) return setMany(ctx, [["geometry.chainring", a], ["geometry.cog", b]], "gearing", `Ratio ${(a / b).toFixed(2)}.`);
    }
    if ((m = t.match(/\bgear(?:ing)? ratio(?: of| to)? (\d(?:\.\d+)?)\b|\bratio (\d(?:\.\d+)?)\b/))) {
      const r = +(m[1] || m[2]); if (!(r > 0.8 && r < 5)) return null;
      return setMany(ctx, [["geometry.cog", Math.max(9, Math.round(g.chainring / r))]], "ratio", `Kept the ${g.chainring}T ring; ratio now ${(g.chainring / Math.max(9, Math.round(g.chainring / r))).toFixed(2)}.`);
    }
    if ((m = t.match(/\b(\d{2})\s*(?:t|tooth|teeth)?\s*(?:chain ?ring|front ring|ring|front)\b|\b(?:chain ?ring|front ring)\s*(?:to\s*)?(\d{2})\s*(?:t|tooth|teeth)?\b/))) {
      const v = +(m[1] || m[2]); if (v >= 20 && v <= 60 && !/\bline\b/.test(t)) return setMany(ctx, [["geometry.chainring", v]], "ring");
    }
    if ((m = t.match(/\b(\d{1,2})\s*(?:t|tooth|teeth)?\s*(?:cog|sprocket|rear cog|rear sprocket)\b|\b(?:cog|sprocket)\s*(?:to\s*)?(\d{1,2})\s*(?:t|tooth|teeth)?\b/))) {
      const v = +(m[1] || m[2]); if (v >= 9 && v <= 52) return setMany(ctx, [["geometry.cog", v]], "cog");
    }
    if (/\b(easier|lower|spinnier|lighter|smaller) gear(ing|s)?\b|\bgear(ing)? (easier|lower|lighter)\b|\bspin more\b|\bclimbing gear\b/.test(t)) return setMany(ctx, [["geometry.cog", g.cog + (ctx.sizeWord(t) > 1 ? 2 : 1)]], "gear", "Bigger cog = easier gear.");
    if (/\b(harder|higher|taller|bigger|faster|heavier) gear(ing|s)?\b|\bgear(ing)? (harder|higher|taller)\b/.test(t)) return setMany(ctx, [["geometry.cog", Math.max(9, g.cog - (ctx.sizeWord(t) > 1 ? 2 : 1))]], "gear", "Smaller cog = harder gear.");
    return null;
  });

  // --- cockpit: stem, bars, spacers, rotors, brake mounts ---------------------------
  on((raw, t, ctx) => {
    let m; const g = D(ctx).geometry;
    // the numbers as drawn: with a library cockpit/fork part picked, the chat fields read that part (+ this bike's adjustments)
    const P = new Proxy(D(ctx).parts || {}, { get: (o, k) => { const f = typeof k === "string" && ctx.fld("parts." + k); return f ? f.get() : o[k]; } });
    if (/\bslam(med)?\b/.test(t) && /\b(stem|spacers?|cockpit|front)\b/.test(t)) return setMany(ctx, [["parts.spacers", 0]], "slam", "No spacers under the stem.");
    if (/\bflip(ped)?\b/.test(t) && /\bstem\b/.test(t)) return setMany(ctx, [["parts.stemRise", -(+P.stemRise || 0)]], "flip", +P.stemRise ? null : "A 0° stem looks the same either way up.");
    if (/\bstem\b/.test(t) && !/\b(steerer|stack)\b/.test(t)) {
      const ns = ctx.numbersIn(t);
      const angle = /°|\bdeg|\brise|\bangle\b|\bdrop\b|negative|\bminus\b/.test(t) && !/\bmm\b.*\blong|length\b/.test(t);
      if (ns.length || /\b(longer|shorter|more|less)\b/.test(t)) {
        if (angle) { const n = ns[0]; let v = n ? n.v : null; if (v == null) return null; if (/\bnegative|\bminus|\bdrop\b/.test(t) && v > 0) v = -v; const rel = /\b(by|more|less|add|increase|decrease|up|down)\b/.test(t) ? (/\b(less|decrease|down)\b/.test(t) ? -1 : 1) : 0; return setMany(ctx, [["parts.stemRise", rel ? (+P.stemRise || 0) + rel * Math.abs(v) : v]], "stem rise"); }
        const n = ns[0], dir = ctx.relDir(t.replace(/\bstem\b/, "x"), n, !n);
        if (!n) { if (!dir) return null; return setMany(ctx, [["parts.stemLength", (+P.stemLength || 50) + dir * 10 * ctx.sizeWord(t)]], "stem"); }
        const v = lenMM(n); if (!dir && !(v >= 20 && v <= 150)) return null;
        return setMany(ctx, [["parts.stemLength", dir ? (+P.stemLength || 50) + dir * v : v]], "stem");
      }
    }
    if (/\b(bars?|handlebars?|bar width)\b/.test(t) && !/\b(rise|riser|backsweep|sweep|tape|psi|pressure)\b/.test(t)) {
      const n = ctx.numbersIn(t)[0];
      if (/\b(raise|lower|higher|up|down|taller|drop)\b/.test(t) && !/\b(wide|wider|narrower|width|cut)\b/.test(t)) {
        const up = /\b(raise|higher|up|taller)\b/.test(t), v = n ? lenMM(n) : 5 * ctx.sizeWord(t);
        return setMany(ctx, [["parts.spacers", Math.max(0, (+P.spacers || 0) + (up ? v : -v))]], "bar height", `Bars ${up ? "up" : "down"} with headset spacers (the frame's stack stays ${g.stack}).`);
      }
      if (n && lenMM(n) >= 300 && lenMM(n) <= 900) { const dir = ctx.relDir(t, n); return setMany(ctx, [["parts.barWidth", dir ? (+P.barWidth || 760) + dir * lenMM(n) : lenMM(n)]], "bar width"); }
      if (n && /\b(wider|narrower|cut|trim)\b/.test(t)) { const dir = /\bwider\b/.test(t) ? 1 : -1; return setMany(ctx, [["parts.barWidth", (+P.barWidth || 760) + dir * lenMM(n)]], "bar width"); }
      if (!n && /\b(wider|narrower)\b/.test(t)) return setMany(ctx, [["parts.barWidth", (+P.barWidth || 760) + (/\bwider\b/.test(t) ? 20 : -20) * ctx.sizeWord(t)]], "bar width");
    }
    if ((m = t.match(/\b(\d+(?:\.\d+)?)\s*(mm)?\s*(?:of\s+)?rise\s*bars?\b|\b(?:riser|rise) bars?\s*(\d+(?:\.\d+)?)/))) return setMany(ctx, [["parts.barRise", +(m[1] || m[3])]], "bar rise");
    if ((m = t.match(/\b(\d+(?:\.\d+)?)\s*(mm)?\s*(?:of\s+)?(?:headset\s+)?spacers?\b|\bspacers?\s*(?:to\s*)?(\d+(?:\.\d+)?)/))) { const v = +(m[1] || m[3]), dir = ctx.relDir(t, ctx.numbersIn(t)[0]); return setMany(ctx, [["parts.spacers", dir ? Math.max(0, (+P.spacers || 0) + dir * v) : v]], "spacers"); }
    if (/\b(more|add|extra) spacers?\b|\bspacers? (up|more)\b/.test(t) && !/\d/.test(t)) return setMany(ctx, [["parts.spacers", (+P.spacers || 0) + 5]], "spacers");
    if (/\b(less|fewer|remove( a)?|take out( a)?) spacers?\b/.test(t) && !/\d/.test(t)) return setMany(ctx, [["parts.spacers", Math.max(0, (+P.spacers || 0) - 5)]], "spacers");
    // rotors
    if ((m = t.match(/\b(\d{3})\s*(?:mm)?\s*(rotors|discs|rotors? (?:front and rear|both ends|all round))\b|\brotors\s*(?:to\s*)?(\d{3})\b|\b(\d{3})\s*(?:mm)?\s*rotor\b/))) {
      const v = +(m[1] || m[3] || m[4]); if (!(v >= 120 && v <= 230)) return null;
      const front = /\bfront\b/.test(t), rear = /\b(rear|back)\b/.test(t);
      const out = []; if (!rear || front) out.push(["parts.rotorF", v]); if (!front || rear) out.push(["geometry.rearRotor", v], ["parts.rotorR", v]);
      return setMany(ctx, out, "rotors");
    }
    if (/\bflat ?mount\b/.test(t)) return setMany(ctx, [["geometry.brakeMount", "chainstay"]], "brake", "Rear caliper on the chainstay.");
    if (/\b(post ?mount|caliper|brake)\b.*\bseat ?stays?\b|\bseat ?stay (brake|mount|caliper)\b/.test(t)) return setMany(ctx, [["geometry.brakeMount", "seatstay"]], "brake");
    if (/\b(brake|caliper)\b.*\b(on the )?(slider|sliding dropout)\b/.test(t)) return setMany(ctx, [["geometry.brakeMount", "slider"]], "brake");
    return null;
  });

  // --- fork -----------------------------------------------------------------------
  on((raw, t, ctx) => {
    let m;
    if (/\b(offset|rake)\b/.test(t)) {
      const ns = ctx.numbersIn(t), n = ns[0]; if (!n || isQ(raw, t) || ns.length > 1) return null;   // "a2c 551, offset 51": let the splitter take it
      const dir = ctx.relDir(t, n); const cur = +D(ctx).geometry.forkOffset;
      return setMany(ctx, [["geometry.forkOffset", dir ? cur + dir * n.v : n.v]], "offset");
    }
    if (/\b(rigid|no suspension|no sus|non suspension|fully rigid|solid) fork\b|\bno (suspension )?fork travel\b|^rigid$|\bgo rigid\b|\bmake it rigid\b/.test(t)) return setMany(ctx, [["use.forkTravel", 0]], "fork", "The fork length was adjusted for no travel (sag) — check the axle-to-crown matches the rigid fork you'll buy.");
    if ((m = t.match(/\b(\d{2,3})\s*(?:mm)?\s*(?:of\s+)?(?:travel|fork|suspension fork|sus fork|squish)\b|\b(?:fork|travel)\s*(?:to\s*)?(\d{2,3})\s*(?:mm)?(?:\s*travel)?$/)) && !/\b(a2c|axle|crown|length|offset)\b/.test(t)) {
      const v = +(m[1] || m[2]); if (!(v >= 60 && v <= 200)) return null;
      const f = ctx.fld("use.forkTravel"), o = f.options.reduce((a, b) => Math.abs(b[0] - v) < Math.abs(a[0] - v) ? b : a);
      return setMany(ctx, [["use.forkTravel", o[0]]], "fork", o[0] !== v ? `Nearest option is ${o[1]}.` : null);
    }
    if (/\b(more|longer|bigger|extra) (fork )?travel\b|\b(longer|bigger) (suspension )?fork\b/.test(t) && !/\d/.test(t)) { const f = ctx.fld("use.forkTravel"), cur = +f.get(), o = f.options.map(x => x[0]).filter(x => x > cur)[0]; return o != null ? setMany(ctx, [["use.forkTravel", o]], "fork") : `The fork is already at the longest option (${cur} mm).`; }
    if (/\b(less|shorter|smaller) (fork )?travel\b|\bshorter (suspension )?fork\b/.test(t) && !/\d/.test(t)) { const f = ctx.fld("use.forkTravel"), cur = +f.get(), o = f.options.map(x => x[0]).filter(x => x < cur && x > 0).pop(); return o != null ? setMany(ctx, [["use.forkTravel", o]], "fork") : null; }
    return null;
  });

  // --- seatpost -------------------------------------------------------------------
  on((raw, t, ctx) => {
    if (!/\b(post|seatpost|seat post|dropper)\b/.test(t) || /\b(length|insertion|clamp|seatpost length|post length)\b/.test(t) || /\b(mount)\b/.test(t)) return null;
    if (isQ(raw, t) && !/\b(use|fit|want|switch|change|make)\b/.test(t)) return null;
    const cur = String((D(ctx).tubes.seatpost || {}).type || ""), dia = /30\.9/.test(t) ? "309" : /31\.6/.test(t) ? "316" : /27\.2/.test(t) ? "272" : null;
    let id = null;
    if (/\bdropper\b/.test(t) && !/\b(no|remove|without|rigid)\b/.test(t)) id = dia === "309" ? "dropper309" : "dropper316";
    else if (/\b(leaf|split ?head|ergon|cf3|vcls)\b/.test(t)) id = "leaf272";
    else if (/\b(hi ?flex|syntace|flexy|flex|thin ?wall|compliant|comfy|comfort)\b/.test(t)) id = "hiflex272";
    else if (/\b(ti|titanium)\b/.test(t)) id = "ti272";
    else if (/\b(carbon)\b/.test(t)) id = dia === "316" ? "carbon316" : "carbon272";
    else if (/\b(alloy|aluminium|aluminum|alu|rigid|no dropper|normal)\b/.test(t)) id = dia === "316" || (!dia && /316|309/.test(cur)) ? "alloy316" : "alloy272";
    if (!id) return null;
    return setMany(ctx, [["tubes.seatpost.type", id]], "post");
  });

  // --- frame features: yoke, bridge words the generic parser misses -------------------
  on((raw, t, ctx) => {
    if (/\byoke\b/.test(t) && !/\d/.test(t) && !/\b(plate|spacing|height|thickness|wall)\b/.test(t)) {
      if (/\b(no|remove|without|drop|delete|ditch|lose|skip|get rid of|off)\b/.test(t)) return setMany(ctx, [["geometry.csYokeLength", 0]], "yoke", "Plain chainstays from the BB (check the tyre and chainring clearance numbers).");
      if (/\b(add|with|use|fit|put|want|on|include|give)\b/.test(t)) { const base = baselineDesign(ctx), b = base && +base.geometry.csYokeLength; return setMany(ctx, [["geometry.csYokeLength", b > 0 ? b : 95]], "yoke"); }
    }
    if (/\b(bridge|brace)\b/.test(t) && /\b(drop|ditch|lose|skip|get rid of|delete)\b/.test(t)) return setMany(ctx, [["geometry.ssBridge", false]], "bridge");
    if (/\b(bent|curved|kinked|s ?bend|bowed)\b.*\bseat ?stays?\b|\bseat ?stays?\b.*\b(bent|curved|kinked)\b/.test(t)) return setMany(ctx, [["geometry.ssShape", "curved"]], "stays");
    return null;
  });

  // --- tubes ------------------------------------------------------------------------
  const MAIN = ["topTube", "downTube", "seatTube"];
  const TN = { topTube: "top tube", downTube: "down tube", seatTube: "seat tube", headTube: "head tube", chainstay: "chainstays", seatStay: "seat stays", bbShell: "BB shell" };
  on((raw, t, ctx) => {
    let m; const d = D(ctx), T = d.tubes, tube = ctx.findTube(t), ts = slashText(raw, t);
    // all main tubes at once: "all walls 1.0", "main tubes 0.9 wall", "all tubes 0.9mm"
    if ((m = t.match(/\b(?:all|main|every|the main|front triangle)(?: the)?(?: main)? (?:tubes?|walls?)(?: walls?)?(?: to| at| of)? (\d(?:\.\d+)?)\s*(?:mm)?(?: walls?| thick| wall thickness)?$|\b(?:all|main)(?: the)? tubes (?:to |at )?(\d(?:\.\d+)?)\s*(?:mm)? wall/))) {
      const v = +(m[1] || m[2]); if (!(v >= 0.4 && v <= 3)) return null;
      return setMany(ctx, MAIN.map(k => ["tubes." + k + ".wall", v]), "walls", "Top, down and seat tube walls (stays unchanged).");
    }
    // whole-frame lighter / stiffer / stronger
    if (/\b(frame|whole bike|tubes|tubeset|it)\b/.test(t) && !tube && !/\d/.test(t)) {
      const lighter = /\b(lighter|lighten|less weight|save weight|shed weight|thinner|lose weight|weight weenie)\b/.test(t), stronger = /\b(stronger|stiffer|tougher|beefier|beef (it )?up|burlier|heavier duty|more robust|thicker)\b/.test(t);
      if (lighter !== stronger) {
        const step = 0.1 * ctx.sizeWord(t) * (lighter ? -1 : 1), out = [];
        for (const k of MAIN) { const w = +T[k].wall; const v = r2(Math.max(0.7, Math.min(2.0, w + step))); if (v !== w) out.push(["tubes." + k + ".wall", v]); if (T[k].buttWall > 0) out.push(["tubes." + k + ".buttWall", r2(Math.max(v, +T[k].buttWall + step))]); }
        if (!out.length) return `The main tube walls are already at the ${lighter ? "thinnest" : "thickest"} I'd go from the chat (${lighter ? "0.7" : "2.0"} mm).`;
        return setMany(ctx, out, lighter ? "lighter" : "stronger", lighter ? "Thinner main-tube walls. Check the fatigue life and ISO results after the re-run." : "Thicker main-tube walls. For stiffness, a bigger OD does more per gram — e.g. “bigger down tube”.");
      }
    }
    if (!tube || !/^(topTube|downTube|seatTube|headTube|chainstay|seatStay|bbShell)$/.test(tube.k)) return null;
    const tk = tube.k, cur = T[tk] || {};
    if (/\b(length|long|longer|shorter|taller|angle)\b/.test(t)) return null;     // geometry, not tube size
    // butted spec: "butted down tube 1.2/0.9/1.2", "down tube 1.2/0.9"
    if ((m = ts.match(/(\d(?:\.\d+)?)\s*\/\s*(\d(?:\.\d+)?)(?:\s*\/\s*(\d(?:\.\d+)?))?\s*(?:mm)?/)) && (/\bbutt/.test(t) || +m[1] > +m[2]) && MAIN.includes(tk)) {
      const end = +m[1], mid = +m[2]; if (!(end > mid && mid >= 0.4 && end <= 3)) return null;
      const len = +cur.buttLength > 0 ? +cur.buttLength : 150;
      return setMany(ctx, [["tubes." + tk + ".wall", mid], ["tubes." + tk + ".buttWall", end], ["tubes." + tk + ".buttLength", len]], "butted", +cur.buttLength > 0 ? null : `Butted ends set to ${len} mm long; change with “${TN[tk]} butted end length 120”.`);
    }
    if (/\b(straight|plain|single|un) ?(gauge|butted)\b|\bno butt(ing|s)?\b|\bnot butted\b/.test(t) && MAIN.includes(tk)) return setMany(ctx, [["tubes." + tk + ".buttWall", ""], ["tubes." + tk + ".buttLength", ""]], "plain gauge");
    // your builder list shapes: "teardrop down tube", "44 biaxial down tube", "oval chainstays"
    const catF = ctx.fld("catalog." + tk + ".preset");
    if (catF && /\b(teardrop|tear drop|biaxial|biax|ovali[sz]ed|oval|diamond|hydroformed)\b/.test(t)) {
      const shape = (t.match(/\b(teardrop|tear drop|biaxial|biax|ovali[sz]ed|oval|diamond|hydroformed)\b/) || [])[1].replace(/tear drop/, "teardrop").replace(/biax$/, "biaxial").replace(/ovali[sz]ed/, "ovali");
      const n = ctx.numbersIn(t).map(x => x.v);
      const cands = catF.options.filter(o => new RegExp(shape.slice(0, 5), "i").test(o[1]) || (shape === "oval" && /oval/i.test(o[1])));
      if (!cands.length) return `The your builder list has no ${shape} ${TN[tk]}. Options: ${catF.options.map(o => o[1]).join(" · ")}`;
      const sc = o => n.length ? Math.min(...n.map(v => Math.min(...(o[1].match(/\d+(\.\d+)?/g) || ["999"]).map(x => Math.abs(+x - v))))) : Math.abs(((o[1].match(/\d+(\.\d+)?/) || [999])[0]) - (cur.od || 40));
      const pick = cands.sort((a, b) => sc(a) - sc(b))[0];
      return setMany(ctx, [[catF.id, pick[0]]], "shape", `From your builder's tube list: ${pick[1]}.`);
    }
    // imperial OD: "1 3/8 top tube" (rewritten to 1.375 in), "top tube 1.5 inch"
    const ns = ctx.numbersIn(t);
    if (ns.length === 1 && /^(in|inch|inches)$/.test(ns[0].unit) && ns[0].v <= 2.5 && !/\bwall|thick/.test(t)) return setMany(ctx, [["tubes." + tk + ".od", r1(ns[0].v * 25.4)]], "od", `${ns[0].v} in = ${r1(ns[0].v * 25.4)} mm.`);
    // "1.2mm down tube wall"
    if (ns.length === 1 && /\b(wall|walls|thick|thickness|gauge)\b/.test(t) && ns[0].v < 4 && !ctx.relDir(t, ns[0])) return setMany(ctx, [["tubes." + tk + ".wall", ns[0].v]], "wall");
    if (ns.length) return null;
    // no numbers: beef up / lighter / bigger / smaller
    const wallUp = /\b(beef(y|ier)?( it)? up|beef|stronger|strengthen|thicker|tougher|burlier|heavier( duty)?|reinforce)\b/.test(t), wallDown = /\b(lighter|lighten|thinner|weaker|skinnier wall|thin (it )?out)\b/.test(t);
    const odUp = /\b(bigger|oversi[sz]ed?|fatter|larger|wider|stiffer|chunkier)\b/.test(t), odDown = /\b(smaller|skinnier|narrower|undersi[sz]ed?|slimmer|more compliant|more flex|flexier|softer)\b/.test(t);
    const wallTalk = /\bwalls?\b|\bgauge\b/.test(t);
    if ((wallUp || wallDown) && (wallTalk || !(odUp || odDown))) {
      const step = 0.1 * ctx.sizeWord(t) * (wallUp ? 1 : -1), v = r2(Math.max(0.5, +cur.wall + step));
      return setMany(ctx, [["tubes." + tk + ".wall", v]], "wall");
    }
    if (odUp || odDown) {
      if (cur.h && cur.w) return `The ${TN[tk]} is a shaped tube (${cur.h}×${cur.w}); pick another from the your builder list, e.g. “${tk === "downTube" ? "44 teardrop down tube" : "oval chainstays"}”.`;
      const list = tk === "headTube" ? HT_OD : STD_OD, o = +cur.od;
      const next = odUp ? list.find(x => x > o + 0.05) : list.slice().reverse().find(x => x < o - 0.05);
      if (!next) return `The ${TN[tk]} is already the ${odUp ? "biggest" : "smallest"} size I know (Ø${o}).`;
      const out = [["tubes." + tk + ".od", next]]; if (+cur.wall >= next / 2 - 0.2) out.push(["tubes." + tk + ".wall", r2(next / 10)]);
      return setMany(ctx, out, "od", `Next ${odUp ? "bigger" : "smaller"} common tube size.`);
    }
    return null;
  });

  // --- rider and riding -------------------------------------------------------------
  const TERRAIN = [[5, /\b(downhill|dh|freeride|bike ?park|park laps|dirt ?jump(s|ing)?|dj|huge jumps|lift access|shuttles?)\b/],
    [3, /\b(xc|cross ?country|single ?track|singletrack|rough trails|mtb racing|xco|marathon|down ?country)\b/], [4, /\b(enduro|all ?mountain|trail riding|trails|technical|rocky|chunky|steep trails)\b/], [2, /\b(gravel|dirt roads?|fire ?roads?|bikepacking|bike ?packing|touring|adventure|unpaved|forest roads?|cyclocross|cx)\b/],
    [1, /\b(road|roads|paved|tarmac|asphalt|pavement|commut(e|ing)|city|town|endurance road|sportive|fondo)\b/]];
  on((raw, t, ctx) => {
    let m; const n0 = ctx.numbersIn(t)[0];
    // weights
    if (/\b(my bike|bike|it|the bike) (weighs|weight|is)\b|\bbike weighs\b/.test(t) && n0 && /\b(weigh|weight|kg|lb)\b/.test(t)) { const kg = /^(lb|lbs|pound|pounds)$/.test(n0.unit) ? n0.v * 0.453592 : n0.v; return setMany(ctx, [["rider.bikeKg", r1(kg)]], "bike kg"); }
    if ((/\bi (weigh|am|'m)\b|\bi'm\b|\bim\b|\bmy weight\b|\bme\b/.test(t) || /^(rider|weight)\b/.test(t)) && n0 && (/^(kg|lb|lbs|pound|pounds)$/.test(n0.unit) || /\bweigh/.test(t)) && !/\b(tall|ft|height|inseam|bike)\b/.test(t)) {
      const kg = /^(lb|lbs|pound|pounds)$/.test(n0.unit) || (!n0.unit && n0.v > 150) ? n0.v * 0.453592 : n0.v;
      if (!(kg > 25 && kg < 250)) return null;
      return setMany(ctx, [["rider.riderKg", r1(kg)]], "rider kg", /^(lb|lbs|pound|pounds)$/.test(n0.unit) ? `${n0.v} lb = ${r1(kg)} kg.` : null);
    }
    // drop height
    if (/\b(huck|hucks|hucking|drops?|jumps?|landing|to flat|send)\b/.test(t) && n0 && !/\b(bb|bottom bracket|stack|bars?|saddle|seat)\b/.test(t)) {
      let v = n0.unit === "m" || !n0.unit ? n0.v : n0.unit === "mm" ? n0.v / 1000 : n0.unit === "cm" ? n0.v / 100 : n0.unit === "in" ? n0.v * 0.0254 : n0.v;
      if (!n0.unit && v > 5) v = v / 100;       // "drop 80" → 80 cm
      if (!(v > 0 && v <= 5)) return null;
      return setMany(ctx, [["use.dropHeight", r2(v)]], "drop");
    }
    if ((m = t.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|h)\s*(?:a|per|each|every|\/)\s*week\b|\b(?:ride|riding)\s*(\d+(?:\.\d+)?)\s*(?:hours?|h)\b/))) return setMany(ctx, [["use.hoursPerWeek", +(m[1] || m[2])]], "hours");
    if ((m = t.match(/\b(?:ftp|threshold|average power|avg power|cruising power|typical power)\b[^\d]*(\d{2,4})|(\d{2,4})\s*w?\s*(?:ftp|average|avg|threshold)\b/))) return setMany(ctx, [["use.avgWatts", +(m[1] || m[2])]], "avg watts");
    if ((m = t.match(/\bsprint(?:s|ing)?\b[^\d]*(\d{3,4})|(\d{3,4})\s*w?\s*sprint/)) && /\b(w|watts?|sprint)\b/.test(t)) return setMany(ctx, [["use.sprintWatts", +(m[1] || m[2])]], "sprint");
    if ((m = t.match(/\bcadence\b[^\d]*(\d{2,3})|(\d{2,3})\s*rpm\b/))) return setMany(ctx, [[/\bsprint/.test(t) ? "use.sprintCadence" : "use.avgCadence", +(m[1] || m[2])]], "cadence");
    if (/\d/.test(t)) return null;
    // riding style
    if (/\b(i|i'm|im|rider|ride|riding|riding style|style)\b/.test(t) && !/\b(position|geometry|fit|bike feel|feel)\b/.test(t)) {
      const a = /\b(savage|send it|sender|full send|brutal|abuse|smash|huge)\b/.test(t) ? 1.5 : /\b(hard|aggressive(ly)?|rough|heavy(?! bike)|heavy handed|clumsy|fast)\b/.test(t) ? 1.25 : /\b(smooth|gentle|light on|casual|easy ?going|careful|relaxed|chill|slow)\b/.test(t) ? 0.8 : /\b(normal|average|typical|regular)\b/.test(t) ? 1 : null;
      if (a != null && !/\b(position|upright)\b/.test(t)) { const r = setMany(ctx, [["use.aggression", a]], "style"); if (!TERRAIN.some(([, re]) => re.test(t))) return r; }
    }
    // terrain
    if (/\b(i ride|ride|riding|use it for|it's for|its for|for|mostly|terrain|condition|built for|purpose|going to ride|ridden on|racing|race)\b/.test(t) || t.split(" ").length <= 5) {
      for (const [c, re] of TERRAIN) if (re.test(t) && !/\b(tyres?|tires?|bars?|position|geometry like|gearing|wheels?)\b/.test(t)) {
        if (c === 4 && /\btrail\b/.test(t) && !/\b(riding|trails|ride|enduro)\b/.test(t)) continue;
        return setMany(ctx, [["use.condition", c]], "terrain", "This sets how hard the riding loads are; geometry is up to you.");
      }
    }
    return null;
  });

  // --- double / halve / triple -----------------------------------------------------
  on((raw, t, ctx) => {
    const m = t.match(/^(?:please )?(double|halve|half|triple|quadruple)(?: the| my)? (.+)$/); if (!m) return null;
    const f = topField(ctx, m[2]) || (ctx.state.lastField && /^(it|that|this)$/.test(m[2]) ? ctx.fld(ctx.state.lastField) : null); if (!f || f.kind !== "num") return null;
    const k = { double: 2, halve: 0.5, half: 0.5, triple: 3, quadruple: 4 }[m[1]];
    return setMany(ctx, [[f.id, r2(+f.get() * k)]], m[1]);
  });

  // --- how it feels / fits: plain-language goals ---------------------------------------
  const GOALS = [
    { re: /\b(more stable|stabler|calmer|less twitchy|less nervous|more planted|more confidence|descend better|better (at )?descending|better downhill|steadier|more confident at speed|slacker front( end)?)\b/, ch: [["geometry.headAngle", -1]], note: "1° slacker head angle: calmer at speed and on steep ground, slower to turn." },
    { re: /\b(quicker|faster|sharper|lighter|livelier|more responsive|more agile|nimbler|more nimble|twitchier|snappier) (steering|handling|turn ?in|front( end)?)\b|\bsteer(s|ing)? (quicker|faster|sharper)\b|\bmore (nimble|agile|flickable)\b|\bless (sluggish|floppy|lazy)\b/, ch: [["geometry.headAngle", 1]], note: "1° steeper head angle: quicker steering, less stable at speed." },
    { re: /\b(more upright|less aggressive|more relaxed|more comfortable (position|fit|riding position)|comfier position|sit up more|less (low|stretched)|endurance (fit|position)|back (hurts|pain)|neck (hurts|pain)|easier on my back|less racy)\b/, ch: [["geometry.stack", 10], ["geometry.reach", -10]], note: "Taller and shorter front: stack +10, reach −10." },
    { re: /\b(more aggressive|racier|more race|lower and longer|longer and lower|more aero|lower position|race (fit|position)|get lower)\b/, ch: [["geometry.stack", -10], ["geometry.reach", 10]], note: "Lower and longer: stack −10, reach +10." },
    { re: /\b(cramped|too short|too small|more room|more space|stretch (me )?out|more stretched|need more reach|feel(s)? short|knees hit)\b/, ch: [["geometry.reach", 10]], note: "Reach +10 mm. (A longer stem does the same without changing the frame.)" },
    { re: /\b(too (stretched|long|far)( out)?|too much reach|reaching too far|over ?stretched|less reach|shorter cockpit|feels (long|big))\b/, ch: [["geometry.reach", -10]], note: "Reach −10 mm. (A shorter stem does the same without changing the frame.)" },
    { re: /\b(better climb(ing|er)?|climb(s)? better|better at climbing|seated climbing|steep climbs|front (wheel )?(lifts|wanders|wheelies)( on climbs)?)\b/, ch: [["geometry.seatAngle", 1]], note: "1° steeper seat angle puts you over the cranks. Longer chainstays also help: “chainstays 5 longer”." },
    { re: /\b(snappier|more playful|poppier|livelier|easier to manual|manuals? (easier|better)|easier to wheelie|easier to lift the front|more lively|flickier) (rear|back|bike|ride)?|\bshorter rear( end)?\b|\btighter rear end\b/, ch: [["geometry.chainstay", -5]], note: "Chainstay −5 mm: livelier, easier to lift the front." },
    { re: /\b(more traction|more grip on climbs|calmer rear|longer rear( end)?|more stable rear|balanced|more planted rear)\b/, ch: [["geometry.chainstay", 5]], note: "Chainstay +5 mm: more planted, more climbing traction." },
    { re: /^size (it )?up$|\b(one size (up|bigger)|bigger frame|larger frame|bigger size|next size up|go up a size)\b/, ch: [["geometry.reach", 10], ["geometry.stack", 20], ["geometry.headTube", 20], ["geometry.seatTube", 30]], note: "One size up (roughly: reach +10, stack and head tube +20, seat tube +30)." },
    { re: /^size (it )?down$|\b(one size (down|smaller)|smaller frame|smaller size|next size down|go down a size)\b/, ch: [["geometry.reach", -10], ["geometry.stack", -20], ["geometry.headTube", -20], ["geometry.seatTube", -30]], note: "One size down (roughly: reach −10, stack and head tube −20, seat tube −30)." },
    { re: /\b(lower|drop) (the )?front( end)?\b|\bfront( end)? (lower|down|too high)\b|\bbars? too high\b/, ch: [["geometry.stack", -10]], note: "Stack −10. (Taking out a 10 mm spacer does the same without changing the frame: “spacers 0”.)" },
    { re: /\b(raise|higher|lift) (the )?front( end)?\b|\bfront( end)? (higher|up|too low)\b|\bbars? too low\b/, ch: [["geometry.stack", 10]], note: "Stack +10. (Spacers or a riser bar do the same without changing the frame.)" },
    { re: /\b(more pedal clearance|pedal strikes?|clip(ping)? pedals|hitting pedals|strike (my )?pedals)\b/, ch: [["geometry.bbDrop", -5]], note: "BB 5 mm higher (less BB drop). Shorter cranks also help: “165 cranks”." },
    { re: /\b(lower (centre|center) of gravity|more in the bike|sit in the bike|lower bb feel)\b/, ch: [["geometry.bbDrop", 5]], note: "BB 5 mm lower (more BB drop)." }
  ];
  on((raw, t, ctx) => {
    if (/\d/.test(t) && !/^size/.test(t)) return null;
    if (isQ(raw, t) && !/\b(make|want|need|be|feel|get)\b/.test(t)) return null;
    const hits = GOALS.filter(gl => gl.re.test(t)); if (!hits.length) return null;
    const k = ctx.sizeWord(t), sum = {};
    for (const gl of hits) for (const [id, dv] of gl.ch) sum[id] = (sum[id] || 0) + dv * k;
    const pairs = Object.entries(sum).map(([id, dv]) => { const f = ctx.fld(id); return [id, +(+f.get() + dv).toFixed(2)]; });
    return setMany(ctx, pairs, "goal", hits.map(h => h.note).join(" "));
  });
  // vaguer wishes: give concrete things to try rather than guessing
  on((raw, t, ctx) => {
    if (/\b(more comfortable|comfier|plusher|smoother( ride)?|less harsh|softer ride|more compliant|more comfort|less buzz|vibration|numb hands|harsh)\b/.test(t))
      return "Ways to make the ride plusher, roughly in order of effect:\n• `lower tyre pressure by 2` or `wider tyres` — biggest effect\n• `carbon leaf spring post` or `hi-flex seatpost`\n• `thinner seat stays` / `19 mm seat stays` → `seat stays 16 mm`\n• `no bridge` (a little more rear flex)\n• `more upright position`\nIn Design + Engineering mode, **Find plushest safe frame** searches tube sizes for you (`find the plushest safe frame`).";
    if (/\b(less|reduce|avoid|stop|fix|no|get rid of) (the )?toe (overlap|strike|rub)\b|\btoe (overlap|strike) (fix|problem)\b|\btoes? (hit|hits|touch|touches|rub) (the )?(tyre|tire|wheel|front)\b/.test(t))
      return "To reduce toe overlap:\n• `reach 10 longer` or `head angle 1 slacker` (moves the front wheel forward)\n• `fork offset 5 more` (less trail, though)\n• `165 cranks`\n• `midfoot cleats`\n• `narrower tyres` / `no mudguards`\nType `toe overlap?` to re-check after each change.";
    if (/\b(cheaper|save money|budget|less expensive|cost less)\b/.test(t)) return "Cyclic Labs doesn't price frames. With your builder, extras (yokes, biaxial or teardrop tubes, internal routing, machined parts) usually cost more than plain round tubes — ask them for the price of each option.";
    if (/\b(weld|welds|welding|weld quality)\b/.test(t) && isQ(raw, t)) return "Weld fatigue is set by **Weld fatigue swing @2M cycles** and **Weld fatigue method** (Material section). `run the 3D weld models` checks the joints in more detail.";
    return null;
  });

  // --- material: Cyclic Labs is a titanium tool --------------------------------------
  on((raw, t, ctx) => {
    if (!/\b(steel|chromoly|cromo|4130|reynolds|columbus|aluminium|aluminum|alloy frame|alu frame|carbon frame|carbon fibre|carbon fiber|magnesium|bamboo|wood)\b/.test(t)) return null;
    if (/\b(post|seatpost|seat post|bars?|stem|rim|wheel|crank)\b/.test(t)) return null;
    return "Cyclic Labs is set up for **titanium 3Al-2.5V**, which is what your builder builds in — the weld fatigue numbers, densities and checks are tuned for it, so I won't switch the frame to another material from the chat. (You can still edit the Material numbers by hand in Design + Engineering mode if you know what you're doing.)";
  });

  // ---------------------------------------------------------------- 3. typo fixing (only after nothing matched)
  const COMMON = new Set(("the and for with from that this what when then than make made change set put use want need like feel feels more less much very bit lot little please thanks could would should can will just also into onto over under about back front rear side left right top bottom down long short tall high low wide narrow thick thin big small bigger smaller longer shorter higher lower wider narrower thicker thinner same again still keep give take show tell list help undo redo save open load compare overlay view mode design bike frame tube tubes wall walls size sizes type shape bent straight curved round oval yes no not none add remove without only both each every all some any other another first second last mine your mm cm inch inches degree degrees angle angles length height width weight rider riding ride trail road gravel enduro mountain steel titanium carbon alloy post seat seatpost stem bars bar spacers rotor rotors brake brakes fork travel tyre tyres tire tires wheel wheels rim rims gear gears gearing chain chainring cog crank cranks pedal pedals shoe shoes cleat cleats toe mudguard fender bridge yoke wishbone dropper stack reach drop slacker steeper").split(" "));
  function damerau(a, b) {
    const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
    const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0))); for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  let vocab = null;
  function buildVocab(ctx) {
    const v = new Set(COMMON);
    const add = s => ctx.words(String(s)).forEach(w => { if (/^[a-z]{3,}$/.test(w)) v.add(w); });
    for (const f of ctx.fields()) { add(f.label); add(f.key.replace(/([A-Z])/g, " $1")); if (f.options) f.options.forEach(o => add(o[1])); }
    for (const l of Object.values(FC.SYNONYMS || {})) l.forEach(add);
    for (const l of Object.values(FC.TUBE_NAMES || {})) l.forEach(add);
    ["wheelbase", "trail", "offset", "chainstays", "seatstays", "headtube", "downtube", "toptube", "geometry", "mullet", "teardrop", "biaxial", "butted", "slam", "flip", "spacer", "handlebar", "handlebars", "inseam", "sprint", "cadence", "terrain", "landing", "huck", "clearance", "pressure", "realistic", "drawing", "summary", "builder", "effective", "centre", "center"].forEach(w => v.add(w));
    return v;
  }
  function typofix(raw, ctx) {
    vocab = vocab || buildVocab(ctx);
    const list = [...vocab];
    let changed = false;
    const out = String(raw).split(/(\s+)/).map(tok => {
      const w = tok.toLowerCase(); if (!/^[a-z]{3,}$/.test(w) || vocab.has(w)) return tok;
      const lim = w.length <= 4 ? 1 : 2;
      let best = null, bd = 9, tie = false;
      for (const c of list) { if (Math.abs(c.length - w.length) > lim) continue; const dd = damerau(w, c); if (dd < bd) { bd = dd; best = c; tie = false; } else if (dd === bd && c !== best) tie = true; }
      if (best && bd <= lim && !(tie && bd > 1)) { changed = true; return best; }
      return tok;
    }).join("");
    return changed ? out : null;
  }

  // ---------------------------------------------------------------- hook into chat.js
  FC.rewrite = rewrite;
  FC.intents = (FC.intents || []).concat(I);
  FC.typofix = typofix;
  FC.early = (FC.early || []).concat([(raw0) => {
    // names keep their capitals: "rename this to My Ti Hardtail", "call it Bob"
    const m = raw0.match(/^\s*(?:rename|name|call)\s+(?:this|it|the design|this design|the bike|this bike)?\s*(?:to|as)?\s*[:\-]?\s*["“']?(.+?)["”']?\s*$/i);
    if (!m || !m[1] || /^(it|this)$/i.test(m[1])) return null;
    const el = document.querySelector("#designName"); if (!el) return null;
    el.value = m[1].trim(); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    return `Renamed to **${el.value}**. Say \`save changes\` (or \`save as ${el.value}\`) to keep it.`;
  }]);
  FC.GLOSSARY = GLOSSARY; FC._rewrite = rewrite; FC._wordsToNumbers = wordsToNumbers;
  // helpers for the second phrasebook file (chatmore.js)
  FC._plus = { setMany, topField, solve, baselineDesign, getPath, isQ, slashText, lenMM, geo, D, r1, r2, mm, toIn, tyreChanges, tyreOD, bsdOf, BSD, STD_OD, HT_OD, orderSummary, geometrySummary, tubesSummary, define, GLOSSARY };
})(typeof window !== "undefined" ? window : globalThis);
