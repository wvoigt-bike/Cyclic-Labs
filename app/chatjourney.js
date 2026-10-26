// ============================================================================
//  DESIGN CHAT PHRASEBOOK, PART 3 (chatjourney.js) — offline, no AI model
//  The v10 build journey from the chat box. Load after chat.js, chatplus.js,
//  chatmore.js and journey.js. What it adds:
//   • steps         "go to step 3", "next step", "back to design", "where am I", "what's next"
//   • windows       "open the tubes panel", "show toe overlap", "lab tests", "close this"
//   • spec sheet    "Your builder carbon fork", "wireless shifting", "flat mount 160/180",
//                   "brushed and blasted", "T47" … fill the spec sheet; your builder notes from
//                   part 2 (boost, UDH, routing, mounts, finish, logos) are mirrored onto it;
//                   "spec fork: Columbus Futura", "what's missing before I send it"
//   • order steps   "I paid the deposit", "got the first drawing", "frame shipped yesterday",
//                   "it arrived!", "untick the deposit", "have I sent the request?"
//   • journal       "journal: called the builder about the yoke", "Your builder said 44 mm is fine",
//                   "I sent your builder my changes", "show my journal", "delete my last journal entry"
//   • questions     "ask your builder whether they do Ti cages", "add question: …", "suggest questions",
//                   "question 2 answered", "show my questions"
//   • builder FAQ    lead times, deposit/PayPal, shipping/customs, prices from past orders,
//                   fork facts, "can I change it after I approve"
//   • look          theme presets ("raw titanium theme"), "accent colour orange",
//                   "background #101418", "toggle theme"
//   • housekeeping  "rename this bike to Gravel Dream", "list my bikes", "duplicate this",
//                   "is it saved?", "design is done", "the fit is right" (Check step ticks), tours
//  Design edits still go through chat.js apply() (validated, reported old → new, undoable).
//  Journey state (spec, order steps, questions, journal) goes through FrameJourney.api.
// ============================================================================
(function (root) {
  "use strict";
  const FC = root.FrameChat; if (!FC || !FC._plus) return;
  const P = FC._plus;
  const { setMany, isQ } = P;
  const J = () => root.FrameJourney && root.FrameJourney.api;
  const FJ = () => root.FrameJourney;
  const I = []; const on = fn => I.push(fn);
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const later = fn => setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, 30);
  const has = (re, t) => re.test(t);
  const NOJ = "The build journey (steps, spec sheet, journal) isn't loaded on this page.";

  // ---------------------------------------------------------------- dates: "yesterday", "on the 3rd of October", "2026-10-02", "3 days ago"
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function dateIn(t) {
    const now = new Date(); let m, d = null;
    if ((m = t.match(/\b(20\d\d)[-\/ .](\d{1,2})[-\/ .](\d{1,2})\b/))) d = new Date(+m[1], +m[2] - 1, +m[3]);
    else if (/\byesterday\b/.test(t)) { d = new Date(now); d.setDate(d.getDate() - 1); }
    else if (/\b(today|this morning|this afternoon|tonight|just now)\b/.test(t)) d = new Date(now);
    else if ((m = t.match(/\b(\d+|a|an) (day|week)s? ago\b/))) { const n = /^an?$/.test(m[1]) ? 1 : +m[1]; d = new Date(now); d.setDate(d.getDate() - n * (m[2] === "week" ? 7 : 1)); }
    else if (/\blast week\b/.test(t)) { d = new Date(now); d.setDate(d.getDate() - 7); }
    else if ((m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)? (?:of )?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\b/)) || (m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?\b/))) {
      const day = /^\d/.test(m[1]) ? +m[1] : +m[2], mon = MON[/^\d/.test(m[1]) ? m[2] : m[1]];
      d = new Date(now.getFullYear(), mon, day); if (d - now > 86400000) d.setFullYear(d.getFullYear() - 1);
    }
    return d && !isNaN(d) ? ymd(d) : null;
  }
  const stripDate = s => s.replace(/\s*\b(on )?(20\d\d[-\/ .]\d{1,2}[-\/ .]\d{1,2}|yesterday|today|this morning|this afternoon|tonight|just now|(\d+|a|an) (day|week)s? ago|last week|(the )?\d{1,2}(st|nd|rd|th)? (of )?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*|(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]* \d{1,2}(st|nd|rd|th)?)\b/gi, "").trim();
  const fmtDay = s => { if (!s) return ""; const d = new Date(s + "T12:00:00"); return isNaN(d) ? s : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); };

  // ---------------------------------------------------------------- 0. add-ons that own their words: the garage (garage.js) and
  //   Match a your builder drawing (drawmatch.js) hook into FrameChat.extra, which runs after the phrasebook; ask them first
  on((raw, t, ctx) => {
    if (!/\bgarage\b|\bmatch\b.*\b((?:waltly|my builder|the builder|your builder|builder)|drawing)\b|\b(?:waltly|my builder|the builder|your builder|builder) (drawing|numbers)\b|\bnumbers for (my )?(order|(?:waltly|my builder|the builder|your builder|builder))\b|\bcheck (the|my|a) drawing\b/.test(t)) return null;
    for (const h of FC.extra || []) { try { const r = h(raw, t, ctx); if (r) return r; } catch (e) { console.error(e); } }
    return null;
  });

  // ---------------------------------------------------------------- 1. steps
  const STEP_RE = [
    ["start", /^(start|the start|beginning|the beginning|home|welcome|step 1|step one|first step|1st step|start page|start screen|home page|front page)$/],
    ["design", /^(design|designing|the design|editor|the editor|3d|the bike|step 2|step two|second step|2nd step|design page|design screen)$/],
    ["check", /^(check|checks|checking|the checks|review|step 3|step three|third step|3rd step|check page|checks page|check it)$/],
    ["builder", /^((?:waltly|my builder|the builder|your builder|builder)|the (?:waltly|my builder|the builder|your builder|builder)|ordering|order|the order|my order|builder|the builder|step 4|step four|fourth step|4th step|(?:waltly|my builder|the builder|your builder|builder) page|order page|send|sending|request)$/],
    ["final", /^(final|the final|finish line|approve|approval|sign off|sign ?off|step 5|step five|fifth step|5th step|last step|the last step|final page|final check|after approval|tracking)$/]
  ];
  function stepOf(s) {
    s = s.replace(/^(the|my)\s+/, "").replace(/\s+(step|page|stage|screen|tab|section|part)$/, "").trim();
    for (const [k, re] of STEP_RE) if (re.test(s) || re.test(s + " step")) return k;
    return null;
  }
  const NEXT_HINT = {
    start: "Pick a starting point: `new bike`, `help me figure out what I want`, or `open` one of your bikes.",
    design: "Shape it: change numbers by typing (`reach 460`), or `open the geometry panel`. When it looks right: `design is done`.",
    check: "Go through the checks: `open the builder checklist`, `toe overlap`, then tick the manual ones (`the fit is right`, `tyres are set`…).",
    builder: "Fill the spec sheet (`what's missing on the spec`), then `write my request` and send it in one email. Each drawing they send: `scan a drawing`.",
    final: "Re-read the drawing, then press Approve on the Final page. Afterwards tick each step as it happens (`production started`, `frame shipped`)."
  };
  function goStep(k, ctx) {
    const F = FJ(); if (!F) return NOJ;
    F.go(k);
    const A = J(), nm = A ? A.stageName[k] : k, n = A ? A.stages.indexOf(k) + 1 : "";
    return `**Step ${n} · ${nm}**. ${NEXT_HINT[k]}`;
  }
  on((raw, t, ctx) => {
    if (!FJ()) return null;
    let m;
    const st = FJ().stage() || "design", order = (J() || {}).stages || ["start", "design", "check", "builder", "final"];
    if (/^(next|next step|go to the next step|go forward|forward|continue|carry on|keep going|onward|on to the next( step)?|move on|proceed|what'?s the next step\??)$/.test(t)) {
      const i = order.indexOf(st); if (i >= order.length - 1) return "You're on the last step (Final). " + NEXT_HINT.final;
      return goStep(order[i + 1], ctx);
    }
    if (/^(previous|previous step|prev|back (a|1|one) step|step back|(1|one) step back|go back (a|1|one) step|back (a|1|one) page|go back (a|1|one) page)$/.test(t)) {
      const i = order.indexOf(st); if (i <= 0) return "You're on the first step (Start).";
      return goStep(order[i - 1], ctx);
    }
    if ((m = t.match(/^(?:go|take me|jump|skip|move|switch|head|bring me|show me|show|open|back|go back|return|get me|let'?s go|i want to go)?\s*(?:back |over |forward |ahead |straight )?(?:to |into |on to |onto )?(?:the |my )?(.+?)$/))) {
      const tgt = m[1];
      // "step 3", "the check step", "waltly page" … but never a design called that
      const isStepWord = /\b(step|page|stage|screen|tab)\b/.test(tgt) || /^(start|home|design|designing|check|checks|(?:waltly|my builder|the builder|your builder|builder)|builder|final|approval|sign off|ordering)$/.test(tgt) && /^(go|take|jump|skip|move|switch|head|bring|back|return|get|let|i want)/.test(t);
      if (isStepWord) { const k = stepOf(tgt); if (k) return goStep(k, ctx); }
    }
    if ((m = t.match(/^step ([1-5])$/))) return goStep(order[+m[1] - 1], ctx);
    if (/^(where am i|what step am i (on|at)|which step( am i on)?|what page is this|where are we|where'?s this at)\??$/.test(t)) {
      const A = J(), s = A ? A.stepStatus() : null;
      return `You're on **step ${order.indexOf(st) + 1} · ${(A ? A.stageName : {})[st] || st}**.` + (s ? "\n" + order.map((k, i) => `${s[k].done ? "✓" : i === order.indexOf(st) ? "▸" : "·"} ${i + 1} ${A.stageName[k]} — ${s[k].small}`).join("\n") : "");
    }
    return null;
  });

  // "what's next", "what do I do now", "status", "how far along am I"
  function status(ctx) {
    const A = J(); if (!A) return NOJ;
    const s = A.stepStatus(), order = A.stages, pj = A.project(), sp = A.specProgress(), cp = A.checkProgress();
    const L = order.map((k, i) => `${s[k].done ? "✓" : "·"} ${i + 1} ${A.stageName[k]} — ${s[k].small}`);
    let next;
    if (!s.design.done) next = "Finish shaping the design, then say `design is done` (or press “Looks right, check it”).";
    else if (!cp.all) next = `Check step: ${cp.total - cp.done} of ${cp.total} checks still to tick (\`go to step 3\`).`;
    else if (!pj.process.request) next = sp.mustMissing.length ? `Spec sheet: your builder still needs ${sp.mustMissing.map(f => f.label.toLowerCase()).join(", ")} (\`open the spec sheet\`). Then \`write my request\`.` : "Send your request: `write my request`, copy it into one email to your builder, then say `I sent the request`.";
    else if (!pj.process.quote) next = "Waiting on your builder's questions and quote. When you pay the 50% deposit, say `I paid the deposit`.";
    else if (!pj.rounds.length) next = "The first drawing usually comes 3–4 days after the deposit. When it arrives: `scan a drawing` (it opens the drawing checklist).";
    else if (!pj.final.approved) { const r = A.latestRound(); next = r && r.stats && (r.stats.ch || r.stats.ask) ? `Drawing R${r.n}: ${r.stats.ch} change(s) and ${r.stats.ask} question(s) marked. Export the change request and send it in one reply.` : r && r.stats && r.stats.undecided ? `Drawing R${r.n}: ${r.stats.undecided} flagged number(s) not looked at yet (\`open the drawing checklist\`).` : "Drawing looks settled: `go to the final step` and approve it when every number is right."; }
    else { const nx = A.AFTER.find(x => !(pj.after || {})[x.k]); next = nx ? `Approved. Next to tick: ${nx.t.split(" (")[0].toLowerCase()} (e.g. \`${({ build: "production started", proof: "got the finish proof", photos: "paid the balance", ship: "frame shipped", arrived: "frame arrived" })[nx.k]}\`).` : "The frame has arrived. Enjoy the build! 🎉"; }
    return "**Where this bike is**:\n" + L.join("\n") + "\n**Next**: " + next;
  }
  on((raw, t, ctx) => {
    if (/^(what'?s next|what now|now what|what do i do( now| next)?|what should i do( now| next)?|next steps?\??|what'?s left( to do)?|status|progress|how far (along )?am i|how am i doing|where are we at|where do i stand|what'?s my status|show (my )?progress|overview)\??$/.test(t)) return status(ctx);
    return null;
  });

  // ---------------------------------------------------------------- 2. windows
  const WIN = [
    ["w-bikes", /^(bikes?|my bikes|your bikes|saved (bikes|designs)|designs|my designs|garage|bike list|design list|projects|my projects)$/],
    ["w-geometry", /^(geometry|geo|frame geometry|numbers|angles|angles and lengths|sizing|geometry numbers?)$/],
    ["w-wheels", /^(wheels (and|&) (tyres|tires)|gearing|wheels joints (and|&) drivetrain|joints (and|&) drivetrain|chainline)$/],
    ["w-wheels", /^(wheels?|tyres|tires|drivetrain)$/, true],
    ["w-tubes", /^(tubes|tubing|tube sizes|tube set|tubeset|tube list|walls|diameters)$/],
    ["w-bends", /^(bends|bent tubes|tube bends|bending|bent tube|tube shapes|bends (and|&) shapes)$/],
    ["w-sag", /^(fork sag|sag|sag geometry|sagged geometry|riding geometry|geometry at sag|dynamic geometry|fork sag \(riding geometry\))$/],
    ["w-bottles", /^(bottles|bottles (and|&) cages|bottle cages?|bottle bosses|bottle fit|bottle positions?|bottle cage positions?|water bottles)$/],
    ["w-bottles", /^(bottle|cages?|bosses|water bottle)$/, true],
    ["w-stays", /^(stays|chain ?stays|seat ?stays|rear end|rear triangle|stays (and|&) tyre room|tyre room|tire clearance|tyre clearance|clearance)$/],
    ["w-post", /^(seatpost saddle (and|&) tyres|seatpost (and|&) saddle)$/],
    ["w-post", /^(seat ?post|post|dropper|saddle)$/, true],
    ["w-parts", /^(parts|components|build kit|parts (and|&) paint|paint|colou?rs of the bike|groupset|build)$/],
    ["w-riding", /^(riding|how it gets ridden|how i ride|riding style|use|usage|terrain)$/],
    ["w-rider", /^(rider|rider loads (and|&) material|loads|material)$/],
    ["w-checklist", /^(builder checklist|builders? checks?|check ?list|checks table|clearance checks|frame checks)$/],
    ["w-toe", /^(toe|toe overlap|toe clip|toe strike|shoe overlap|foot overlap)$/],
    ["w-geocheck", /^(geometry check|geo check|geometry numbers check|handling numbers|handling check|worked out numbers|derived numbers)$/],
    ["w-abuse", /^(strength|fatigue|fatigue life|strength (and|&) fatigue( life)?|abuse|rock hits?|landings|crash|impacts?)$/],
    ["w-iso", /^(iso|iso tests?|iso 4210|lab tests?|lab|safety tests?|standard tests?|test results)$/],
    ["w-comfort", /^(comfort|seated comfort|compliance|ride comfort)$/],
    ["w-explorer", /^(explorer|comfort explorer|optimi[sz]er|optimi[sz]ation|comfort explorer (and|&) optimi[sz]er|sweeps?)$/],
    ["w-joints", /^(joints|welds?|weld joints|weld models?|3d welds?)$/],
    ["w-stress", /^(stress|stresses|stress table|stress by tube|tube stress)$/],
    ["w-ccx", /^(calculix|ccx|fe check|finite element|calculix check)$/],
    ["w-howto", /^(how to read (it|this|the results|the engineering results)|how it works|how this works|engineering help|method|explainer)$/],
    ["w-journal", /^(journal|my journal|build journal|diary|log|logbook|build log|notes from the build)$/],
    ["spec", /^(spec|spec sheet|specs|specification|options sheet|order options|the options)$/],
    ["request", /^(request|my request|request email|email to (?:waltly|my builder|the builder|your builder|builder)|the email|order email|first email)$/],
    ["summary", /^(build summary|summary sheet|summary|printable summary|print summary)$/],
    ["review", /^(drawing checklist|drawing review|review sheet|change request)$/]
  ];
  // "show the tubes" / "show me the geometry" answer with a summary (part 1); "open the tubes" opens the panel
  const SUMMARY = /^(geometry|geo|numbers|angles|tubes|tubing|tube sizes|tube list|tube set|tubeset|walls|diameters|parts|components|rider)$/;
  const ENG_WIN = new Set(["w-riding", "w-rider", "w-geocheck", "w-abuse", "w-iso", "w-comfort", "w-explorer", "w-joints", "w-stress", "w-ccx", "w-howto"]);
  function openWin(id, ctx) {
    const F = FJ(), A = J();
    if (id === "spec") { if (!A) return NOJ; A.openSpec(); const sp = A.specProgress(); return `Opened the **spec sheet**: ${sp.filled} of ${sp.total} decided${sp.mustMissing.length ? `; your builder still needs ${sp.mustMissing.map(f => f.label.toLowerCase()).join(", ")}` : ""}. You can fill it here too (\`builder's carbon fork\`, \`T47\`, \`wireless shifting\`…).`; }
    if (id === "request") { if (!A) return NOJ; A.openRequest(); return "Opened **your request to your builder** (built from your geometry, tubes, spec sheet, notes and questions). Edit it, press Copy, paste it into one email. Then say `I sent the request`."; }
    if (id === "summary") { if (!A) return NOJ; A.openSummary(); return "Opened the **build summary** (printable)."; }
    if (id === "review") { if (root.FrameReview) { later(() => root.FrameReview.open()); return "Opening the **drawing checklist**."; } return null; }
    if (!F) return NOJ;
    const d = document.getElementById(id); if (!d) return null;
    if (ENG_WIN.has(id) && ctx.App.uiMode && ctx.App.uiMode() !== "eng") ctx.App.setUiMode("eng");
    if (F.stage() !== "design" && d.classList.contains("drawer") && !/^w-(journal|bikes)$/.test(id)) F.go("design");
    F.open(id);
    const title = (d.querySelector(".win-titles h2") || {}).textContent || id;
    return `Opened **${title.trim()}**.${ENG_WIN.has(id) ? " _(engineering results switched on)_" : ""}`;
  }
  on((raw, t, ctx) => {
    let m;
    let sfx = false, verb = "";
    if ((m = t.match(/^(show me|let me see|let me edit|bring up|pull up|go to|take me to|jump to|i want to (?:see|edit|change)|where(?:'s| is| are| do i find| can i find)|open|show|display|view|see|edit)\s+(?:up\s+)?(?:the |my |your )?(.+?)(\s+(?:window|panel|box|page|section|tab|card|settings|drawer|sheet|screen))?\??$/))) { verb = m[1]; sfx = !!m[3]; m = [m[0], m[2]]; }
    else if ((m = t.match(/^(?:the |my )?(.+?)\s+(?:window|panel|box|drawer)$/))) sfx = true;
    if (m) {
      const what = m[1].trim(), strong = sfx || /^(open|bring up|pull up|go to|take me to|jump to|let me edit|edit|i want to edit|where)/.test(verb);
      for (const [id, re, amb] of WIN) if (re.test(what) && (!amb || strong) && !((id === "w-journal" || id === "spec" || SUMMARY.test(what)) && !strong && !sfx)) { const r = openWin(id, ctx); if (r) return r; }
      // "go to my gravel bike", "open the comfort hardtail": a saved design
      if (/^(open|go to|take me to|jump to|let me see)$/.test(verb) && !sfx) {
        const d = ctx.matchDesign(what.replace(/\b(bike|design|frame|one)\b/g, " ").trim());
        if (d && d.id !== ctx.App.currentId() && !/garage/.test(what)) { ctx.App.openDesign(d.id); ctx.hist.length = 0; ctx.redo.length = 0; return `Opened **${d.name}**.`; }
      }
    }
    // a window's full name on its own: "toe overlap", "lab tests", "comfort explorer" (one-word names are left to the other commands)
    if (/\s/.test(t) && t.split(" ").length <= 4) for (const [id, re, amb] of WIN) if (!amb && re.test(t) && !/^(my |the )?(bikes|designs|projects|journal|request|summary)$/.test(t) && !/^(wheels|seat ?post|chain ?stays|seat ?stays|tyre room|rear end)/.test(t)) { const r = openWin(id, ctx); if (r) return r; }
    if (/^(close|hide|shut|dismiss)( this| that| it| the)?( window| panel| drawer| box| windows| panels| everything| all( windows| panels)?)?$/.test(t) || /^close (all|every) ?(the )?(windows|panels)$/.test(t)) {
      const open = [...document.querySelectorAll("dialog.win[open]")]; open.forEach(d => d.close());
      return open.length ? `Closed ${open.length === 1 ? "the window" : open.length + " windows"}.` : "No windows are open.";
    }
    if ((m = t.match(/^(?:close|shut)\s+(?:the |my )?(.+?)(?:\s+(?:window|panel|box|drawer|sheet))?$/))) {
      for (const [id, re] of WIN) if (re.test(m[1]) && /^w-/.test(id)) { const d = document.getElementById(id); if (d && d.open) { d.close(); return "Closed it."; } if (d) return "That window isn't open."; }
    }
    if (/^(help me (figure out|work out|decide|choose|pick)( what i want| what to get| a bike| a size)?|i don'?t know what i want|i'?m not sure what i want|what (bike|frame|size) should i get|what should i get|which (bike|size) (do i need|should i get)|help me choose|help me pick)\??$/.test(t)) {
      const A = J(); if (!A) return null; FJ().go("start"); later(() => A.act("discover"));
      return "Opening **Help me figure out what I want**: where you ride, how it should feel, your height and weight → a kind of bike, wheel size and frame size, with reasons.";
    }
    if (/^(tours?|guided tours?|show (me )?(the )?tours|list (the )?tours|which tours)$/.test(t) && root.FrameTour) { later(() => root.FrameTour.menu()); return "Opening the list of guided tours."; }
    if (/^(engineering|eng) tour$|^tour (of )?the engineering( side)?$|^show me the engineering( side)?$/.test(t) && root.FrameTour) { if (ctx.App.setUiMode) ctx.App.setUiMode("eng"); later(() => root.FrameTour.start("eng")); return "Starting the engineering tour."; }
    return null;
  });

  // ---------------------------------------------------------------- 3. spec sheet
  const specField = k => (J() ? J().SPEC.find(f => f.k === k) : null);
  const optOf = (k, re) => { const f = specField(k); return f && f.opts ? f.opts.find(o => re.test(o)) : null; };
  function setSpec(k, v) {
    const A = J(); if (!A || !v) return null;
    const f = specField(k), was = A.project().spec[k] || "";
    if (was === v) return { f, v, same: true };
    A.setSpec(k, v); return { f, v, was };
  }
  const short = v => String(v).replace(/\s*\((?:e\.g\.|about|must|up to|threaded|wide|ask)[^)]*\)/g, "").replace(/:.*$/, "").trim();
  const specLine = r => !r ? "" : r.same ? `**${r.f.label}** on the spec sheet is already ${short(r.v)}.` : `**Spec sheet · ${r.f.label}**: ${r.was ? short(r.was) + " → " : ""}${short(r.v)}`;
  const SPEC_HINT = "\n_`open the spec sheet` shows it all; `what's missing on the spec` lists what your builder still needs._";

  // phrases that fill one spec item (the design itself isn't changed by these, unless said)
  const SPECS = [
    // fork
    { k: "fork", re: /\b((?:waltly|my builder|the builder|your builder|builder)|their|a|the|use (a|the|their)|get (a|the|their)|order (a|the|their)|want (a|the|their))? ?carbon fork\b/, not: /\b(offset|rake|a2c|axle|length|travel|crown)\b|\d/, v: () => optOf("fork", /carbon/i), tip: "Your builder's carbon fork: 47 or 52 mm rake (no 55), tapered steerer, up to 700C × 55 mm tyres. Set the rake with `fork offset 47`." },
    { k: "fork", re: /\b(ti|titanium) fork\b/, not: /\b(offset|rake|a2c|axle|length|travel|crown)\b|\d/, v: () => optOf("fork", /Ti fork/), tip: "A Ti fork must be designed with the frame (it's longer than a carbon fork), so ask for it in the first request." },
    { k: "fork", re: /\b(my own|own|existing|my current|i have a|i'?ll (bring|use|supply) (my|a)|bringing my( own)?) (suspension )?fork\b|\b(rockshox|fox|manitou|marzocchi|dt swiss|enve|columbus|whisky|lauf|mrp|cane creek|ohlins|suntour|x ?fusion)\b.*\bfork\b/, not: /\d+\s*mm|\btravel\b|\b(offset|rake|a2c|axle to crown|length)\b \d/, v: () => optOf("fork", /My own fork/), tip: "Put the model, axle-to-crown and offset in the spec notes (`spec notes: Fox 34 SC, 120 mm, A2C 531, offset 44`) and set them here: `fork a2c 531`, `fork offset 44`." },
    // headset supplier and stack
    { k: "headsetFrom", re: /\b((?:waltly|my builder|the builder|your builder|builder)|they|them|builder)\b.*\b(supply|supplies|provide|provides|include|includes|fit|fits|send|sends|source)\b.*\bheadset\b|\bheadset\b.*\bfrom (?:waltly|the builder|my builder|your builder)\b|\bwaltly (headset|to supply the headset)\b/, not: /\?$/, v: () => optOf("headsetFrom", /^The builder/) },
    { k: "headsetFrom", re: /\b(my own|own|i'?ll (buy|get|supply|bring|source) (my own|the|a)|i (buy|supply|get) (my own|the)) headset\b|\bheadset\b.*\b(myself|i'?ll buy|my own)\b/, v: () => optOf("headsetFrom", /my own/i), tip: "Put the headset model in the spec notes so your builder can confirm it fits." },
    { k: "stackIncl", re: /\bstack\b.*\b(includes?|including|with)\b.*\b(cup|headset)\b/, not: /\b(not|doesn'?t|does not|without|excludes?|excluding)\b/, v: () => "Yes" },
    { k: "stackIncl", re: /\bstack\b.*\b(not|doesn'?t|does not|without|excludes?|excluding)\b.*\b(cup|headset)\b/, v: () => "No" },
    // tubing
    { k: "tubing", re: /\bstraight[ -]?gauge\b|\bplain gauge\b|\bnot butted\b|\bno butting\b/, not: /\b(top|down|seat|head) tubes?\b|\bchain ?stays?\b|\bseat ?stays?\b|\d/, v: () => optOf("tubing", /Straight/) },
    { k: "tubing", re: /\b(double[ -]?|triple[ -]?)?butted (tubes|tubing|tube ?set|frame)\b|\bbutting\b|\b(go|want|get) butted\b|^butted$/, not: /\b(no|not|without)\b|\b(top|down|seat|head) tubes?\b|\bchain ?stays?\b|\bseat ?stays?\b|\d/, v: () => optOf("tubing", /butted/i), tip: "Butted tubes cost about $100 extra in past orders. The 3D model uses one wall per tube; set the thin middle with e.g. `down tube wall 0.9`." },
    // loads and kind of frame
    { k: "loads", re: /\b(rack (and|&|\+) panniers|panniers|touring loads?|heavy touring|loaded touring|fully loaded)\b/, not: /\d|\b(no|not|without|never)\b/, v: () => optOf("loads", /Rack/) },
    { k: "loads", re: /\bbikepacking (bags|loads?|setup|kit)\b|\b(carry|carrying|with|use|run|running) (frame |seat |saddle )?bags\b/, not: /\d|\b(no|not|without|never)\b/, v: () => optOf("loads", /Bikepacking/) },
    { k: "loads", re: /\b(no|not carrying|without|never carry) (heavy )?(loads?|bags|luggage|panniers|bikepacking)\b|\bno heavy loads\b/, v: () => "No" },
    { k: "type", re: /^(?:the )?(?:frame type|kind of frame|type of frame|frame kind|it'?s an?|this is an?|spec type)\s*:?\s*(hardtail|mtb|mountain bike|gravel|road|bikepacking|touring)( bike| frame)?$/, v: t => optOf("type", /hardtail|mtb|mountain/.test(t) ? /Hardtail/ : /gravel/.test(t) ? /^Gravel/ : /road/.test(t) ? /^Road/ : /Bikepacking/) },
    // drivetrain
    { k: "shifting", re: /\b(wireless|axs|di ?2 wireless|etap|wireless (shifting|groupset|gears))\b/, not: /\b(no|not)\b/, v: () => optOf("shifting", /Wireless/), tip: "Wireless means only brake hoses need routing." },
    { k: "shifting", re: /\b(wired di ?2|di ?2|electronic (shifting|wired|groupset)|eps|wired electronic)\b/, not: /\bwireless\b|\b(no|not)\b|\brout/, v: () => optOf("shifting", /wired/) },
    { k: "shifting", re: /\b(mechanical|cable(d)?) (shifting|gears|groupset|derailleurs?)\b|\bmechanical\b$/, v: () => optOf("shifting", /Mechanical/) },
    { k: "shifting", re: /\b(single ?speed|fixie|fixed gear|one gear)\b( (bike|frame|setup|drivetrain))?$/, v: () => optOf("shifting", /Singlespeed/), tip: "A singlespeed needs chain tension: sliding dropouts or an eccentric BB (`eccentric bb`)." },
    // rear end
    { k: "yoke", re: /\b(3d|three d)[ -]?printed yoke\b|\bprinted yoke\b/, v: () => optOf("yoke", /3D-printed/), tip: "In past orders the printed yoke cost about $100, and in one design it didn't clear the chainring (about 3 mm). Check `chainring clearance`." },
    { k: "yoke", re: /\b(plate|standard|normal|regular) yoke\b/, v: () => optOf("yoke", /plate/) },
    // brakes
    { k: "brake", re: /\b(140|160|180|203|220) (?:and |\/ ?|front and |rear and )?(140|160|180|203|220)\b(?! mm (bar|stem|crank))/, ctx: /\b(rotors?|brakes?|flat ?mount|discs?)\b/, v: t => { const ns = t.match(/\b(140|160|180|203|220) (?:and |\/ ?|front and |rear and )?(140|160|180|203|220)\b/).slice(1, 3).map(Number), lo = Math.min(...ns), hi = Math.max(...ns);
        return optOf("brake", new RegExp(lo + " rear \\/ " + hi + " front")) || `Flat mount, ${lo} rear / ${hi} front`; } },
    { k: "brake", re: /\b160 (front and rear|both ends|all round|both)\b/, ctx: /./, v: () => optOf("brake", /160 rear \/ 160 front/) },
    { k: "brake", re: /\bpost ?mount\b.*\b(slider|sliding)\b|\b(slider|sliding dropouts?)\b.*\bpost ?mount\b/, v: () => optOf("brake", /sliding/) },
    { k: "brake", re: /\bpost ?mount( brakes?)?\b/, not: /\bflat\b/, v: () => optOf("brake", /^Post mount \(MTB\)/) },
    { k: "brake", re: /\brim brakes?\b|\bcantis?\b|\bcantilevers?\b|\bv ?brakes?\b|\bcaliper brakes?\b/, v: () => optOf("brake", /Rim/) },
    // finish mixes part 2 doesn't cover
    { k: "finish", re: /\b(brushed|polished)\b.*\b(and|&|\+|with|plus)\b.*\b(bead ?blast(ed)?|blast(ed)?|sand ?blast(ed)?)\b|\b(bead ?blast(ed)?|blast(ed)?)\b.*\b(and|&|\+|with|plus)\b.*\b(brushed|polished)\b|\b(two|2)[ -]?tone (finish|ti|frame)?\b|\bmixed finish\b/, v: () => optOf("finish", /\+ blasted/), tip: "Send your builder a reference picture; they send a proof of where the two finishes meet." },
    // logos
    { k: "logos", re: /\b(head ?tube|headtube) (engraving|badge|logo)\b|\bengrav(e|ed|ing) (the )?(head ?tube|my (own )?(logo|image|design))\b/, v: () => optOf("logos", /engraving/), tip: "About $80 in past orders; send them a JPEG of the artwork." },
    // ti bottle cages
    { k: null, re: /\b(ti|titanium) (bottle )?cages?\b/, not: /\?$|^(how|what)/, note: "Ti bottle cages (about $35 each in past orders): how many?" }
  ];
  on((raw, t, ctx) => {
    if (!J()) return null;
    if (isQ(raw, t) && !/\b(i want|i'?d like|i need|use|make|give|fit|add|go with|spec)\b/.test(t)) return null;
    for (const S of SPECS) {
      if (!S.re.test(t) || (S.not && S.not.test(t)) || (S.ctx && !S.ctx.test(t))) continue;
      if (!S.k) { const A = J(), pj = A.project(), cur = pj.spec.notes || ""; if (!cur.includes(S.note)) A.setSpec("notes", (cur ? cur + "\n" : "") + S.note); return `**Spec sheet · Anything else**: + ${S.note}` + SPEC_HINT; }
      const v = S.v(t); if (!v) continue;
      const r = setSpec(S.k, v); if (!r) return null;
      let extra = "";
      // the yoke and the fork also change the design where that's what was meant
 if (S.k === "brake") { const ns = (t.match(/\b(140|160|180|203|220)\b/g) || []).map(Number); if (ns.length >= 2 || /\b160 (front and rear|both ends|all round)\b|\b160 ?(\/ ?160|and 160|both)\b/.test(t)) { const lo = Math.min(...ns), hi = Math.max(...ns); const pr = []; if (ctx.fld("geometry.rearRotor")) pr.push(["geometry.rearRotor", lo]); if (ctx.fld("parts.rotorF")) pr.push(["parts.rotorF", hi]); if (pr.length) { const y = setMany(ctx, pr, "rotors"); if (/^\*\*/.test(y) || /→/.test(y)) extra = "\n" + y; } } }
      if (S.k === "yoke" && !(+ctx.fld("geometry.csYokeLength").get() > 0)) { const y = setMany(ctx, [["geometry.csYokeLength", 95]], "yoke"); if (/^\*\*/.test(y)) extra = "\n" + y; }
      return specLine(r) + (S.tip ? `\n_${S.tip}_` : "") + extra + SPEC_HINT;
    }
    return null;
  });

  // generic: "spec fork: my own", "set the spec bottom bracket to T47 inboard", "spec notes: deadline March"
  function bestSpecField(q) {
    const A = J(); if (!A) return null;
    const w = ctx0 => ctx0.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(x => x.length > 1 && !/^(the|my|a|an|of|on|for|to|is|and|your|you)$/.test(x));
    const ALIAS = { bb: "bb", "bottom bracket": "bb", cranks: "crank", crank: "crank", crankset: "crank", spindle: "crank", chainrings: "rings", rings: "rings", chainring: "rings", "front derailleur": "fd", fd: "fd", gears: "shifting", shifting: "shifting", groupset: "shifting",
      axle: "axle", "rear axle": "axle", hub: "axle", hanger: "hanger", udh: "hanger", tyre: "tyre", tire: "tyre", tyres: "tyre", tires: "tyre", yoke: "yoke", brakes: "brake", brake: "brake", rotors: "brake", routing: "routing", cables: "routing",
      dropper: "dropper", post: "post", seatpost: "post", "seat post": "post", bottles: "bottles", "bottle cages": "bottles", cages: "bottles", rack: "rack", fenders: "rack", mudguards: "rack", mounts: "mounts", "other mounts": "mounts", finish: "finish",
      logos: "logos", logo: "logos", decals: "logos", engraving: "logos", notes: "notes", "anything else": "notes", other: "notes", extras: "notes", fork: "fork", headset: "headset", "head tube": "headset", "headset supplier": "headsetFrom",
      tubing: "tubing", loads: "loads", luggage: "loads", type: "type", "frame type": "type", "kind of frame": "type", "who supplies the headset": "headsetFrom", "stack includes cup": "stackIncl" };
    const ql = q.toLowerCase().trim();
    if (ALIAS[ql]) return specField(ALIAS[ql]);
    const qw = w(q); let best = null, bs = 0;
    for (const f of A.SPEC) { const fw = w(f.label + " " + f.k); const s = qw.filter(x => fw.some(y => y.startsWith(x) || x.startsWith(y))).length / Math.max(1, qw.length); if (s > bs) { bs = s; best = f; } }
    return bs >= 0.5 ? best : null;
  }
  function pickOpt(f, val) {
    if (!f.opts) return /^(ask|ask ((?:waltly|my builder|the builder|your builder|builder)|them|the builder)|not sure|unsure)$/i.test(val.trim()) ? "Ask my builder to recommend" : val;
    const vw = val.toLowerCase().replace(/[^a-z0-9.× ]/g, " ").split(/\s+/).filter(Boolean);
    if (/^(ask|ask ((?:waltly|my builder|the builder|your builder|builder)|them|the builder)|not sure|unsure|dunno|don'?t know|recommend|you decide|whatever (they|(?:waltly|my builder|the builder|your builder|builder)) (suggest|recommend)s?|(?:waltly|my builder|the builder|your builder|builder) (decides|to recommend))$/i.test(val.trim())) { const a = f.opts.find(o => /^Ask|\(ask\)/i.test(o)); return a || "Ask my builder to recommend"; }
    let best = null, bs = 0;
    for (const o of f.opts) { const ow = o.toLowerCase().replace(/[^a-z0-9.× ]/g, " ").split(/\s+/); const s = vw.filter(x => ow.some(y => y === x || (x.length > 2 && y.startsWith(x)))).length / vw.length; if (s > bs) { bs = s; best = o; } }
    return bs >= 0.6 ? best : val;            // no good match: keep what they typed (the sheet shows it as its own choice)
  }
  const SPEC_EARLY = (raw0) => {
    if (!J()) return null;
    const m = String(raw0).match(/^\s*(?:set\s+)?(?:the\s+)?spec\b(?:\s*sheet)?(?:\s+item)?\s*[:\-–]?\s*(.+?)\s*(?:[:=]|\bto\b|\bis\b|\bas\b)\s*(.+?)\s*$/i)
      || String(raw0).match(/^\s*(crank(?:set)?|cranks|chain ?rings?|exact chain ?rings?|bottle (?:cage )?(?:bolts|mounts|cages)|other mounts|anything else|spec notes|frame notes)\s*[:=]\s*(.+?)\s*$/i);
    if (!m) return null;
    const f = bestSpecField(m[1].replace(/^(spec )/i, "")); if (!f) return null;
    const v = pickOpt(f, m[2].replace(/^["“']|["”']$/g, ""));
    const r = setSpec(f.k, f.free && f.k === "notes" ? ((J().project().spec.notes || "") ? J().project().spec.notes + "\n" : "") + v : v);
    return specLine(r) + SPEC_HINT;
  };
  on((raw, t, ctx) => {
    const A = J(); if (!A) return null;
    if (/^(show|open|see|view|read|list)( me)?( my| the)? spec( sheet)?$|^(my )?spec( sheet)?\??$|^what'?s on (my|the) spec( sheet)?\??$/.test(t)) {
      const s = A.project().spec, rows = A.SPEC.filter(f => s[f.k]);
      later(() => A.openSpec());
      return rows.length ? "**Spec sheet so far**:\n" + rows.map(f => `• ${f.label}: ${short(s[f.k])}`).join("\n") + missingLine(A) : "The spec sheet is empty so far. Opening it." + missingLine(A);
    }
    if (/\b(what'?s|what is|anything|what do i|what does (?:waltly|my builder|the builder|your builder|builder)|what else does (?:waltly|my builder|the builder|your builder|builder)|what will (?:waltly|my builder|the builder|your builder|builder))\b.*\b(missing|left|still need|need to (decide|answer|fill)|not decided|to decide|undecided)\b|^(missing|undecided)( spec| items)?\??$|\bspec\b.*\b(missing|left|done|complete|finished)\b|\bready to send\b|\bcan i send (it|my request)\b/.test(t) && !/\b(drawing|checks?)\b/.test(t)) {
      const sp = A.specProgress(), s = A.project().spec, open = A.SPEC.filter(f => f.k !== "notes" && !s[f.k]);
      return `**Spec sheet**: ${sp.filled} of ${sp.total} decided${sp.ask ? `, ${sp.ask} to ask your builder` : ""}.` + (sp.mustMissing.length ? `\n**Your builder needs these before drawing** (●): ${sp.mustMissing.map(f => f.label).join(", ")}.` : "\nEvery ● item your builder needs is answered.") +
        (open.length ? `\nNot decided yet: ${open.map(f => f.label.toLowerCase()).join(", ")}.` : "") + "\n_Type e.g. `T47`, `builder's carbon fork`, `internal routing`, `3 bottle mounts`, `brushed finish`, or `spec tyre: 700C × 45`. `write my request` when ready._";
    }
    if (/^(clear|reset|empty|wipe)( the| my)? spec( sheet)?$/.test(t)) return "I won't wipe the whole spec sheet from the chat. Open it (`open the spec sheet`) and change items there, or set one: `spec fork: not decided`.";
    let mm;
    if ((mm = t.match(/^(?:undecide|clear|unset|remove|reset)\s+(?:the\s+)?spec\s+(.+)$/))) {
      const f = bestSpecField(mm[1]); if (!f) return null; A.setSpec(f.k, ""); return `**Spec sheet · ${f.label}**: back to not decided.`;
    }
    return null;
  });
  const missingLine = A => { const sp = A.specProgress(); return sp.mustMissing.length ? `\n_Your builder still needs: ${sp.mustMissing.map(f => f.label.toLowerCase()).join(", ")}._` : "\n_Every ● item your builder needs is answered._"; };

  // request email and summary
  on((raw, t, ctx) => {
    const A = J(); if (!A) return null;
    if (/^(write|draft|make|create|prepare|compose|generate|build|do|start)( me)?( up)? (my |the |an? )?(request|order|first email|inquiry|enquiry|email|message|mail|quote request)( (to|for) (waltly|the builder|my builder|your builder))?$|^(write|draft|email|message) (to )?(waltly|the builder|my builder|your builder)$|^(request|order) (email|message)$|^(what do i|how do i) (write|email|send) (to )?(waltly|the builder|my builder|your builder)\??$/.test(t)) return openWin("request", ctx);
    if (/^(build summary|summary sheet|print (the |my )?(build )?summary|(show|open|make) (the |my )?(build )?summary|print (it|the build|everything))$/.test(t)) return openWin("summary", ctx);
    return null;
  });

  // ---------------------------------------------------------------- 4. order progress (Your builder step + after approval)
  const PROC = [
    { k: "request", re: /\b(sent|emailed|submitted|mailed|fired off|sent off|posted)\b.*\b(request|inquiry|enquiry|order|first email|spec sheet|quote request|design)\b|\b(request|inquiry|enquiry|order) (is |was |has been |got )?(sent|submitted)\b|\bcontacted (?:waltly|my builder|the builder|your builder|builder)\b/, said: "Request sent" },
    { k: "quote", re: /\b(paid|sent|made|done|transferred)\b.*\bdeposit\b|\bdeposit\b.*\b(paid|sent|done|gone through|cleared)\b|\b(got|received|have|accepted|agreed)\b.*\bquote\b|\bquote\b.*\b(arrived|received|came|accepted)\b|\binvoice\b.*\b(paid|arrived|came)\b|\b(got|received) (the |an? )?invoice\b/, said: "Quote and deposit" },
    { k: "r1", re: /\b(got|received|have)\b.*\b(first|1st|initial) (cad |frame )?drawing\b|\b(first|1st|initial) (cad |frame )?drawing\b.*\b(arrived|came|is here|is in|landed)\b|\b(the )?drawing (arrived|came in|came|is here|landed)\b|\bgot (the |a |my )?(cad|drawing|frame drawing)\b/, said: "First drawing" },
    { k: "revise", re: /\b(revisions?|the drawing|drawings?)\b.*\b(done|finished|settled|sorted|right now|correct now|all good|final now)\b|\bno more (changes|revisions)\b|\b(revisions|changes) (are )?(done|finished|complete)\b/, said: "Revisions done" }
  ];
  const AFT = [
    { k: "build", re: /\b(production|they|(?:waltly|my builder|the builder|your builder|builder))\b.*\b(started|begun|began|underway|building|is building|making)\b|\bin production\b|\bproduction (has )?start/, said: "Production started" },
    { k: "proof", re: /\b(finish )?proofs?\b.*\b(got|received|approved|ok|okay|arrived|came|fine|good|accepted)\b|\b(got|received|approved|accepted|okayed)\b.*\bproofs?\b/, said: "Finish proof" },
    { k: "photos", re: /\b(got|received|seen)\b.*\b(finished |frame )?photos\b|\bphotos\b.*\b(arrived|came|look good)\b|\bpaid\b.*\bbalance\b|\bbalance\b.*\b(paid|sent|done)\b|\bpaid (the )?(rest|second half|remaining 50|other half)\b/, said: "Photos / balance" },
    { k: "ship", re: /\b(shipped|on its way|in the post|dispatched|in transit|sent out)\b|\b(got|have|received) (a |the )?tracking\b|\btracking (number|code|link)? ?(came|arrived|is here|works)\b/, said: "Shipped" },
    { k: "arrived", re: /\b(frame|it|bike|box|package|parcel|order)\b.*\b(arrived|is here|came today|was delivered|delivered|landed|showed up|turned up)\b|\bgot (my|the) frame\b|\breceived (my|the) frame\b|\bit'?s here\b/, said: "Arrived" }
  ];
  on((raw, t, ctx) => {
    const A = J(); if (!A) return null;
    if (/\b(drawing|design|it)\b/.test(t) && /\b(approved|confirmed|signed off|sign off|approve|confirm)\b/.test(t) && /\b(i|i'?ve|we|have|approve|confirm)\b/.test(t) && !/^(how|what|when|should|can|do|does)\b/.test(t) && !/\b(drawing checklist)\b/.test(t) && !/\b(saved|kept|downloaded|filed|copy|pdf)\b/.test(t)) {
      FJ().go("final");
      return "Approval is done on the **Final** page (opened): it shows what's still open (checks, spec ● items, the latest drawing, questions), asks for the drawing number, then logs it. _Once you confirm a drawing, your builder won't change it._";
    }
    const neg = /\b(un ?tick|uncheck|un ?mark|untick|not yet|haven'?t|hasn'?t|didn'?t|isn'?t|wasn'?t|undo|scratch that|mistake)\b/.test(t);
    if (neg) {
      const KW = [["builder", "request", /\b(request|inquiry|enquiry)\b/], ["builder", "quote", /\b(deposit|quote|invoice)\b/], ["builder", "r1", /\bfirst drawing\b|\bdrawing (arrived|came)\b/], ["builder", "revise", /\brevisions?\b/],
        ["final", "build", /\bproduction\b/], ["final", "proof", /\bproofs?\b/], ["final", "photos", /\b(photos|balance)\b/], ["final", "ship", /\b(shipped|shipping|tracking)\b/], ["final", "arrived", /\barriv/]];
      const hit = KW.find(([, , re]) => re.test(t));
      if (hit && !/^(have|has|did|was|is)\b/.test(t)) { const set = hit[0] === "builder" ? "setProcess" : "setAfter"; A[set](hit[1], false); const st = (hit[0] === "builder" ? A.PROCESS : A.AFTER).find(x => x.k === hit[1]); return `Unticked **${st.t.split(" (")[0].replace(/:.*$/, "")}**.`; }
    }
    const asking = /^(have|has|did|was|is|am|are)\b/.test(t);
    if (!asking && (isQ(raw, t) || /^(how|when|what|why|which|where|can|could|should|will|would)\b/.test(t))) return null;
    for (const [list, set, where] of [[PROC, "setProcess", "builder"], [AFT, "setAfter", "final"]]) {
      for (const S of list) {
        if (!S.re.test(t)) continue;
        const pj = A.project(), done = (where === "builder" ? pj.process : pj.after || {})[S.k];
        const step = (where === "builder" ? A.PROCESS : A.AFTER).find(x => x.k === S.k);
        const nm = step.t.split(" (")[0].replace(/:.*$/, "");
        if (asking && !neg) return done ? `Yes: **${nm}** ticked ${fmtDay(done)}.` : `Not ticked yet: **${nm}**.`;
        if (asking) continue;
        if (neg) { A[set](S.k, false); return `Unticked **${nm}**.`; }
        if (done && !dateIn(t)) return `**${nm}** was already ticked (${fmtDay(done)}).` + (S.k === "r1" ? " For a new drawing: `scan a drawing` (it becomes the next round)." : "");
        const d = dateIn(t);
        A[set](S.k, true, d || undefined);
        let tail = "";
        if (S.k === "request") tail = "\n_The first drawing usually comes 3–4 days after the deposit. Log what your builder says: `the builder said …`._";
        if (S.k === "quote") tail = "\n_Past orders: 50% deposit by PayPal Goods & Services (about 4.75% fee added), invoice after. First drawing about 3–4 days later._";
        if (S.k === "r1") tail = "\n_Next: `scan a drawing` reads it into a design and opens the drawing checklist (every number that differs from what you asked for is flagged)._";
        if (S.k === "build") tail = "\n_Past orders took 6.5–7 weeks (quoted ~5), longer around Chinese holidays._";
        if (S.k === "photos") tail = "\n_Before paying the balance: check welds, finish and mounts in the photos, and ask what's included (axles, hanger, seat clamp, headset)._";
        if (S.k === "ship") tail = "\n_Tracking can take 1–6 days to appear (it comes through a shipping agent)._";
        if (S.k === "arrived") tail = "\n🎉 _Check it against the approved drawing before you build it up. Add a photo to the journal!_";
        if (where === "final" && !pj.final.approved) tail += "\n_(The drawing isn't marked approved yet: do that on the Final page so the dates line up.)_";
        return `✅ **${nm}**: ticked${d ? " for " + fmtDay(d) : ""} and logged in your journal.` + tail;
      }
    }
    if (/^(order|my order|order progress|order status|(?:waltly|my builder|the builder|your builder|builder) progress|where'?s my (order|frame))\??$|^(show|what'?s) (my |the )?order (progress|status)\??$/.test(t)) {
      const pj = A.project();
      return "**Order progress**:\n" + A.PROCESS.map(s => `${pj.process[s.k] ? "✓ " + fmtDay(pj.process[s.k]) + " ·" : "·"} ${s.t.split(" (")[0].replace(/:.*$/, "")}`).join("\n") + (pj.final.approved || Object.values(pj.after || {}).some(Boolean) ? "\n" + A.AFTER.map(s => `${(pj.after || {})[s.k] ? "✓ " + fmtDay(pj.after[s.k]) + " ·" : "·"} ${s.t.split(" (")[0]}`).join("\n") : "");
    }
    return null;
  });

  // ---------------------------------------------------------------- 5. journal (free text keeps its capitals, so these run before the sentence is tidied)
  function journalAdd(kind, text, raw0) {
    const A = J(); if (!A) return null;
    if (jOff()) return kind === "to" ? "" : JOFF_MSG;
    const d = dateIn(String(raw0).toLowerCase());
    const body = (d ? stripDate(text) : text).replace(/^[\s:,\-–]+|[\s]+$/g, "");
    if (!body) return null;
    const ok = A.addEntry(kind, cap(body), d ? { at: new Date(d + "T12:00:00").toISOString() } : null);
    if (!ok) return "Couldn't save that: this browser's storage is full. Export the project file, or remove some journal photos.";
    const lbl = { note: "📝 Journal", from: "📨 Journal · builder said", to: "📤 Journal · I sent" }[kind];
    return `**${lbl}**${d ? ` (${fmtDay(d)})` : ""}: ${cap(body)}\n_\`show my journal\` lists it; \`delete my last journal entry\` takes it out._`;
  }
  const WHO = "(?:waltly|the builder|my builder|builder|sales|the sales rep|the rep|the designer|designer|the factory|they)";
  // the Help-menu setting: "turn off the journal", "I don't want the journal", "journal on" …
  const JOFF_MSG = "The build journal is turned **off**, so I didn't log that. Say `turn the journal on` (or Help → Build journal → On) to use it again; nothing was deleted.";
  const jOff = () => { const A = J(); return !!(A && A.journalOn && !A.journalOn()); };
  const JW = "(?:the |my |build |the build |my build )*(?:journal|diary|log ?book|build log)(?: stuff| feature| thing| bits?)?";
  const JOURNAL_TOGGLE = raw0 => {
    const t = String(raw0).toLowerCase().replace(/[.!?]+$/, "").trim(), A = J(); if (!A || !A.setJournal) return null;
    const off = new RegExp(`^(?:please |can you |could you )?(?:turn off|switch off|disable|hide|remove|get rid of|stop showing|i don'?t (?:want|need|use|like)|no more) ${JW}$|^${JW} (?:off|disabled|hidden)$|^(?:turn|switch) ${JW} off$|^no ${JW}$`);
    const onn = new RegExp(`^(?:please |can you |could you )?(?:turn on|switch on|enable|bring back|i want) ${JW}(?: back)?$|^${JW} (?:on|enabled|back)$|^(?:turn|switch) ${JW} (?:back )?on$`);
    if (off.test(t)) { if (jOff()) return "The build journal is already **off**. `turn the journal on` brings it back."; A.setJournal(false); return "**Build journal off.** The 📓 Journal button, the note boxes on each step and the journal in the build summary are hidden. Nothing was deleted: `turn the journal on` (or Help → Build journal) brings it all back."; }
    if (onn.test(t)) { if (!jOff()) return "The build journal is already **on**: 📓 Journal at the top."; A.setJournal(true); return "**Build journal on.** 📓 Journal is back at the top, with the note boxes on each step."; }
    // journal off: anything that is clearly about the journal gets one plain answer instead of being logged or opened
    if (jOff() && /\b(journal|diary|log ?book|build log)\b/.test(t) && !/\b(help|commands)\b/.test(t)) return JOFF_MSG;
    return null;
  };
  const JOURNAL_EARLY = [
    JOURNAL_TOGGLE,
    raw0 => { const m = String(raw0).match(/^\s*(?:journal|diary|log(?:book)?|jot(?: down)?|dear diary|journal (?:entry|note)|note to self|add (?:this |that )?to (?:my |the )?(?:journal|diary|log)|write (?:in|to|this in) (?:my |the )?(?:journal|diary)|log (?:this|that|it))\s*[:\-–,]?\s+(.{2,})$/i); return m ? journalAdd("note", m[1], raw0) : null; },
    raw0 => { const m = String(raw0).match(new RegExp("^\\s*" + WHO + "\\s+(?:said|says|replied|wrote|told me|emailed(?: me)?|answered|confirmed|messaged(?: me)?|sent me|got back(?: to me)?|came back|responded|recommended|suggested|asked(?: me)?)(?:\\s+(?:that|to say|with|back))?\\s*[:\\-–,]?\\s*(.{2,})$", "i"))
        || String(raw0).match(new RegExp("^\\s*(?:email|message|reply|answer|mail|note) from " + WHO + "\\s*[:\\-–,]\\s*(.{2,})$", "i")); return m ? journalAdd("from", m[1], raw0) : null; },
    raw0 => {
      const m = String(raw0).match(new RegExp("^\\s*(?:i\\s+|i've\\s+|i have\\s+|just\\s+)?(?:sent|emailed|told|wrote to|replied to|messaged|asked|answered|mailed)\\s+" + WHO.replace("|they", "|them") + "(?:\\s+(?:that|about|for|to say|back))?\\s*[:\\-–,]?\\s*(.*)$", "i"));
      if (!m) return null;
      const A = J(); if (!A) return null;
      const txt = m[1] && m[1].trim().length > 1 ? m[1] : "Sent a message";
      const lt = String(raw0).toLowerCase();
      const r = journalAdd("to", txt, raw0);
      if (r === "") { if (/\b(request|inquiry|enquiry|order|spec sheet|quote request)\b/.test(lt) && !A.project().process.request) { A.setProcess("request", true, dateIn(lt) || undefined); return "✅ Ticked **Send your request** in the order progress."; } return JOFF_MSG; }
      // "I sent your builder my request" also ticks the order step
      if (/\b(request|inquiry|enquiry|order|spec sheet|quote request)\b/.test(lt) && !A.project().process.request) { A.setProcess("request", true, dateIn(lt) || undefined); return r + "\n✅ _Ticked **Send your request** in the order progress._"; }
      if (/\b(changes|change request|comments|corrections|revisions?)\b/.test(lt)) { const rr = A.latestRound(); return r + (rr ? `\n_Drawing R${rr.n}: when the next drawing comes, \`scan a drawing\` again._` : ""); }
      return r;
    }
  ];
  on((raw, t, ctx) => {
    const A = J(); if (!A) return null;
    let m;
    if (/^(show|open|read|see|view|list)( me)?( my| the)?( build)? (journal|diary|log|logbook)( entries)?$|^(my )?(journal|diary)\??$|^what'?s in (my|the) journal\??$|^(last|latest|recent) (journal )?entries$/.test(t)) {
      const j = A.project().journal; later(() => FJ().open("w-journal"));
      if (!j.length) return "Your journal is empty. Add to it with `journal: …`, `the builder said: …`, or `I sent the builder …`.";
      const K = { milestone: "🏁", auto: "•", note: "📝", from: "📨", to: "📤", photo: "📷" };
      return `**Journal** (${j.length} entr${j.length === 1 ? "y" : "ies"}, latest 6):\n` + j.slice(-6).map(e => `${K[e.kind] || "•"} ${fmtDay(String(e.at).slice(0, 10))} · ${e.text}`).join("\n");
    }
    if (/^(delete|remove|undo|scrap|drop|erase)( my| the)? (last|latest|previous) (journal |diary )?(entry|note|log)$|^undo (that|the) journal( entry)?$/.test(t)) {
      const e = A.removeLastEntry(["note", "from", "to", "photo"]); return e ? `Removed the journal entry “${e.text}”.` : "There's nothing of yours in the journal to remove (automatic entries stay).";
    }
    if (/^(copy|export|download|print)( my| the)? (journal|diary)( as text)?$/.test(t)) { later(() => FJ().open("w-journal")); return "Opened the journal: **Copy as text** at the top copies the whole thing (it's in the build summary and the project export too)."; }
    if (/\b(add|attach|upload|put)\b.*\b(photo|picture|pic|image)\b.*\b(journal|diary|log)\b|^(journal|add a) (photo|picture)$/.test(t)) { later(() => FJ().open("w-journal")); return "Opened the journal: pick **📷 Photo** in the composer, choose the picture, add a caption, then Add. (Photos are shrunk to keep the browser's storage light.)"; }
    if ((m = t.match(/^(?:show|filter|only)(?: me)?(?: the| my)? (milestones|messages|my entries)(?: in the journal)?$/))) { later(() => FJ().open("w-journal")); return `Opened the journal: use the **${/milestone/.test(m[1]) ? "Milestones" : /message/.test(m[1]) ? "Messages" : "Mine"}** filter at the top.`; }
    return null;
  });

  // ---------------------------------------------------------------- 6. questions for your builder
  const youify = s => s.replace(/\bthey'?re\b/gi, "you're").replace(/\bthey'?ve\b/gi, "you've").replace(/\bthey\b/gi, "you").replace(/\btheir\b/gi, "your").replace(/\bthem\b/gi, "you").replace(/\bwaltly\b/gi, "you").replace(/\byou does\b/g, "you do").replace(/\byou has\b/g, "you have").replace(/\byou is\b/g, "you are");
  function asQuestion(rest) {
    let q = rest.trim().replace(/[.!\s]+$/, "");
    if (/^(whether|if)\s+/i.test(q)) q = "Could you tell me " + q.replace(/^(whether|if)\s+/i, "whether ");
    else if (/^about\s+/i.test(q)) q = "Could you advise on " + q.replace(/^about\s+/i, "");
    else if (/^(for|to recommend)\s+(a |an |the )?(recommendation|advice)\s+(on|about|for)\s+/i.test(q)) q = "What do you recommend for " + q.replace(/^.*?\b(on|about|for)\s+/i, "");
    q = youify(q);
    q = cap(q);
    return /\?$/.test(q) ? q : q + "?";
  }
  const QUESTION_EARLY = raw0 => {
    const s = String(raw0);
    let m = s.match(/^\s*(?:add (?:a |this |the )?question(?: for (?:waltly|the builder|my builder|your builder))?|question(?: for (?:waltly|the builder|my builder|your builder))?|new question|q|add to (?:my |the )?questions(?: list)?|put (?:this |that )?on (?:my |the )?questions?(?: list)?)\s*[:\-–,]\s*(.{3,})$/i)
      || s.match(/^\s*(?:i (?:want|need|have) to ask (?:waltly|the builder|my builder|your builder)|remember to ask(?: (?:waltly|my builder|the builder|your builder|builder)| the builder| my builder| your builder)?|remind me to ask(?: (?:waltly|my builder|the builder|your builder|builder)| the builder| my builder| your builder)?|(?:please )?ask (?:waltly|the builder|my builder|your builder)|i(?:'d| would) like to ask (?:waltly|the builder|my builder|your builder))\s*[:\-–,]?\s+((?:whether|if|about|what|how|why|when|which|who|where|can|could|do|does|is|are|will|would|should)\b.{2,})$/i);
    if (!m) return null;
    const A = J(); if (!A) return null;
    const q = asQuestion(m[1]); const r = A.addQuestion(q);
    if (r === "dup") return `That question is already on the list: “${q}”.`;
    return `**Question for your builder** (added to the list in step 4): ${q}\n_It goes into your request email. \`show my questions\` lists them; \`question 1 answered\` ticks one off._`;
  };
  on((raw, t, ctx) => {
    const A = J(); if (!A) return null;
    let m;
    if (/^(show|list|see|read|view|what are)( me)?( all)?( my| the)?( open)? questions( for (?:waltly|my builder|the builder|your builder|builder)| to ask)?\??$|^(my )?questions\??$|^what (do i|did i want to|should i) ask\??$/.test(t) && !/should/.test(t)) {
      const qs = A.project().questions; if (!qs.length) return "No questions yet. Add one with `ask my builder whether …` or `question: …`; `suggest questions` gives ideas.";
      return "**Questions for your builder**:\n" + qs.map((q, i) => `${i + 1}. ${q.done ? "~~" + q.t + "~~ ✓" : q.t}`).join("\n") + "\n_`question 2 answered`, `remove question 3`._";
    }
    if (/^(suggest|recommend|give me|any)( some)? questions\??$|^what (questions )?should i ask( (?:waltly|my builder|the builder|your builder|builder)| the builder| my builder| your builder)?\??$|^(question|questions) ideas$/.test(t)) {
      const have = A.project().questions.map(q => q.t), sg = A.suggestions().filter(s => !have.includes(s));
      return sg.length ? "**Questions worth asking** (from your design and spec sheet):\n" + sg.map((s, i) => `${i + 1}. ${s}`).join("\n") + "\n_`add suggestion 2`, or `add all the suggestions`._" : "I've no more suggestions: your list already has them.";
    }
    if ((m = t.match(/^add (?:all )?(?:the )?suggest(?:ed|ion|ions)(?: questions)?(?: (\d+(?:\s*(?:,|and)\s*\d+)*))?$/))) {
      const have = A.project().questions.map(q => q.t), sg = A.suggestions().filter(s => !have.includes(s));
      const pick = m[1] ? m[1].split(/\s*(?:,|and)\s*/).map(x => sg[+x - 1]).filter(Boolean) : sg;
      if (!pick.length) return "Nothing to add (`suggest questions` lists them, numbered).";
      pick.forEach(q => A.addQuestion(q)); return `Added ${pick.length} question${pick.length === 1 ? "" : "s"} to the list for your builder.`;
    }
    if ((m = t.match(/^(?:question |q ?)(\d+) (?:is |was |has been |got )?(answered|done|sorted|resolved|closed|ticked)$|^(?:mark|tick)(?: off)?(?: question| q)? ?(\d+)(?: as)? (?:answered|done)?$|^(?:answered|tick off)(?: question| q) ?(\d+)$/))) {
      const i = +(m[1] || m[3] || m[4]) - 1; return A.answerQuestion(i, true) ? `Ticked question ${i + 1} as answered (and logged it).` : "There's no question with that number (`show my questions`).";
    }
    if ((m = t.match(/^(?:question |q ?)(\d+) (?:is |was )?(?:not answered|open again|unanswered)$|^(?:untick|reopen|unmark)(?: question| q) ?(\d+)$/))) {
      const i = +(m[1] || m[2]) - 1; return A.answerQuestion(i, false) ? `Question ${i + 1} is open again.` : "There's no question with that number.";
    }
    if ((m = t.match(/^(?:remove|delete|drop|scrap|cross out)(?: the)? question (\d+)$/))) {
      const i = +m[1] - 1, q = A.project().questions[i]; return A.removeQuestion(i) ? `Removed “${q.t}”.` : "There's no question with that number.";
    }
    return null;
  });

  // ---------------------------------------------------------------- 7. builder FAQ (from real order threads, 2024–25)
  const PAST = "_From two real orders with a Ti builder (2024–25); ask your builder for a current quote._";
  const FAQ = [
    { re: /\b(how long|how many (days|weeks)|when|lead time|turn ?around|wait)\b.*\b(first )?(cad |frame )?drawing\b|\bdrawing\b.*\b(how long|take|when)\b/, a: "The **first drawing** came about **3–4 days after the deposit** (CAD with every number and the tube list). Revisions follow each time you send comments; send all changes in **one** reply so nothing gets dropped." },
    { re: /\b(how long|how many (weeks|days|months)|when|lead time|turn ?around|wait|timeline|time ?frame)\b.*\b(production|build|make|made|built|welded|frame (to be )?(ready|done|made)|(be )?ready|get (it|my frame)|deliver|arrive)\b|\bproduction (time|takes|take)\b/, a: `**Production** was quoted as "about 1.5 months, maybe 5 weeks"; the two real orders took about **6.5 and 7 weeks** (the second ran into the Chinese holiday). Then a finish proof, photos of the finished frame, the balance, and shipping (FedEx or UPS, tracking shows up 1–6 days later).\n${"_From two real orders (2024–25)._"}` },
    { re: /\b(pay|payment|paying|deposit|paypal|balance|invoice|50 ?%|half up front|friends (and|&) family|goods (and|&) services)\b/, a: `**Paying**: 50% deposit, 50% balance, both by **PayPal Goods & Services** (about a **4.75%** fee is added; with Friends & Family you're expected to cover it anyway). The invoice comes after the deposit; the balance is due after you've seen photos of the finished frame, along with your shipping address and phone number.\n${PAST}` },
    { re: /\b(ship|shipping|shipped|postage|customs|tariffs?|duty|duties|import (tax|fees?)|vat|fedex|ups|dhl|tracking|courier)\b/, a: `**Shipping**: FedEx (2024) or UPS (2025) through a shipping agent, so tracking can take **1–6 days** to appear. Shipping to the US with customs included was about **$300**, and US buyers reported it worked with tariffs. Outside the US, ask about import duty in your country.\n${PAST}` },
    { re: /\b(change|changes|modify|edit|fix|alter)\b.*\b(after|once)\b.*\b(approv|confirm|sign|production)|\btoo late\b|\bcan i (still )?change\b.*\b(production|approved|confirmed)\b/, a: "**No.** Once you confirm the drawing, production starts and changes are refused (\"Sorry it is too late to change now\"). One real order found a reach error only after that. Read every number on the final drawing, including the tube list, before you say yes. Step 5 has a read-through list." },
    { re: /\b(what'?s|what is|is anything|are (axles|the axles)|does it)\b.*\b(included|come with|in the box|part of the price)\b|\bincluded\b.*\?/, a: "In past orders the **thru-axles were included**. Ask before you pay the balance what else comes with the frame: derailleur hanger, seat clamp, headset (if you ordered one), and the fork's steerer spec (length, top cap, expander)." },
    { re: /\b(how do i order|how does (ordering|the order|it) work|order(ing)? process|steps to order|how to order|what'?s the process|how does (?:waltly|my builder|the builder|your builder|builder) work|how to buy)\b/, a: "**How a custom frame order goes**:\n1. Email your request: geometry, rider weight, use, and every option, **in one email** (`write my request` builds it).\n2. They ask about anything missing, then quote. **50% deposit** by PayPal.\n3. **First drawing** about 3–4 days later. Comment, they revise (one reply per round).\n4. **Confirm** the drawing; no changes after this.\n5. Production (~6.5–7 weeks), finish proof, photos, **balance**, shipping.\nThe five steps across the top of Cyclic Labs follow this." },
    { re: /\b(why|do i need to|should i) (send|put) (it )?(all|everything) in one (email|mail|message)\b|\bone email\b/, a: "Your builder's sales rep asks for **everything in one mail** because the designers are busy and drawings are queued: piecemeal replies slow it down and items get dropped (one buyer had to resend his finish request). `write my request` puts it all together." },
    { re: /\bcarbon fork\b/, a: `**Your builder's carbon fork**: about **$160**, tapered 1-1/8"→1-1/2" steerer, **47 or 52 mm rake (no 55)**, up to **700C × 55 mm** tyres; they want a 160 mm rotor minimum (leaning to 180). One buyer's expander plug kept slipping. \`builder's carbon fork\` puts it on your spec sheet.\n${PAST}` },
    { re: /\b(ti|titanium) fork\b/, a: `**Your builder's Ti fork**: about **$350**, unicrown or segmented crown. It's longer than a carbon fork, so it **must be designed with the frame**; adding one later breaks the geometry. \`Ti fork\` puts it on your spec sheet.\n${PAST}` },
    { re: /\b(cost|price|prices|how much|expensive|cheap|budget|\$|usd|dollars?)\b/, not: /\b(weigh|weight|heavy|stiff|travel|reach|stack|drop|longer|shorter|slacker|steeper|clearance|room|trail|offset)\b/, a: `**Prices in a 2025 gravel order** (USD): custom-geometry frame **900** · carbon fork **160** (Ti fork 350) · FSA headset **50** (52 mm ACR-style 55) · finish **50** · head-tube engraving **80** · 3D-printed yoke **100** · Ti bottle cage **35** each · butted tubing about **+100** · shipping to the US incl. customs **300** · PayPal fee **4.75%**.\n${PAST}` },
    { re: /\b(rider weight|my weight|weigh)\b.*\b(why|matter|need|ask)\b|\bwhy (do|does) (they|(?:waltly|my builder|the builder|your builder|builder)) (need|want|ask)\b/, a: "Your builder always asks your **weight** (with kit) and whether you'll **carry heavy loads**: it sets the tube diameters and walls (e.g. a 44.5 × 1.0 × 1.3 down tube, 16 vs 19 mm seat stays). Set it with `rider weight 82 kg`." },
    { re: /\b(copy|clone|same as)\b.*\b(geometry|my (current|old|other) bike)\b.*\b((?:waltly|my builder|the builder|your builder|builder)|can they|possible)\b|\bcan (?:waltly|my builder|the builder|your builder|builder) copy\b/, a: "Yes: Your builder said \"we can copy the geometry\" of a bike you own; send them its geometry table. Here: `new bike` → copy a chart, or the overlay to compare in 3D." },
    { re: /\b(t ?47|bb standard|bottom bracket standard)\b.*\b(why|default|which|best|recommend)\b|\bwhy t ?47\b/, a: "Your builder's default is a **T47** threaded shell (outboard 68/73): big enough for internal brake routing through the BB area, and threaded so no creaks. For T47, **inboard vs outboard** must match the BB you buy. `T47` sets it here." },
    { re: /\b(which|what) headset\b|\bheadset (options|choices)\b/, a: "Headsets your builder offered: **44 mm straight** head tube with FSA No.13 (ZS44 top / EC44 bottom; the external lower cup adds ~10–15 mm stack), or **52 mm** with an FSA ACR No.55-style integrated headset (~$55) for routing through the headset; a Chris King Aeroset fits the 52. Say `44 straight head tube` or `52/52 head tube`." },
    { re: /\b(rotor|rotors|brake)\b.*\b(which|what size|recommend|should)\b/, a: "Flat mount, with **140/160 or 160/180** rotor pairs in past orders. The carbon fork wants **160 mm minimum** up front and your builder leaned toward **180** front. `flat mount 160/180` puts it on the spec sheet." },
    { re: /\b(tyre|tire) (clearance|room)\b.*\b(how much|max|biggest|(?:waltly|my builder|the builder|your builder|builder))\b|\bwhat (tyre|tire) (can|will) (it|i) fit\b/, a: "From real orders: a **420 mm chainstay** fit about a **30 mm** tyre on a fully integrated road frame; a **57 mm** gravel tyre needed a **yoke**. Set your biggest tyre (`tyre 50`) and the Builder checklist shows the clearance." }
  ];
  const ORDERISH = /\b(ship|ships|fedex|ups|dhl|ready|arrive|delivery|deliver|delivered|(?:waltly|my builder|the builder|your builder|builder)|builder|order|ordering|deposit|paypal|production|drawing|shipping|shipped|customs|tariffs?|duty|import|tracking|quote|invoice|balance|pay|payment|ti fork|titanium fork|carbon fork|approv\w*|confirm\w*|sign off|too late|price|prices|cost|costs|how much|lead time|included|come with|headset|rotors?|t ?47|tyre clearance|tire clearance|rider weight|weigh|one email|process)\b/;
  on((raw, t, ctx) => {
    if (!ORDERISH.test(t)) return null;
    const q = isQ(raw, t) || /^(why|when|how|what|which|do|does|did|can|could|should|is|are|will|would)\b/.test(t) || /\?$/.test(raw);
    if (!q) return null;
    // a question about a number on this design is for the main chat ("how long is the chainstay?")
    if (/\b(reach|stack|chain ?stay|wheelbase|trail|head angle|seat angle|bb drop|wall|od)\b/.test(t) && !/\b((?:waltly|my builder|the builder|your builder|builder)|clearance|rotor)\b/.test(t)) return null;
    for (const F of FAQ) if (F.re.test(t) && !(F.not && F.not.test(t))) return F.a;
    return null;
  });

  // ---------------------------------------------------------------- 8. look: theme presets and colours
  const NAMED = { red: "#d33b3b", crimson: "#c2183c", orange: "#e0893a", amber: "#e3a21a", yellow: "#e8c547", gold: "#c9a227", lime: "#7cb518", green: "#3f8f5a", "dark green": "#24563a", teal: "#1f8a8a", cyan: "#4fc3d9", turquoise: "#2bb3b1",
    blue: "#1f6fd1", "light blue": "#6aa9e9", navy: "#1b2a4a", "dark blue": "#173a6b", indigo: "#4b3fb5", purple: "#6a3fb5", violet: "#8a4fd1", magenta: "#c23a9e", pink: "#e0609a", "hot pink": "#ff4f9a", brown: "#8a5a3c", copper: "#b8693d", bronze: "#9c7a3c",
    titanium: "#8a8f96", silver: "#c0c4c8", grey: "#8a8f96", gray: "#8a8f96", "light grey": "#e7e5e1", "light gray": "#e7e5e1", "dark grey": "#2a2d33", "dark gray": "#2a2d33", charcoal: "#22252a", black: "#0d1117", white: "#ffffff", cream: "#f7f3e8", beige: "#eee6d8", sand: "#e6dcc8", mint: "#e6f4ec", lavender: "#eee8f8" };
  const colourIn = s => { const m = s.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i); if (m) return m[0]; const k = Object.keys(NAMED).sort((a, b) => b.length - a.length).find(k => new RegExp("\\b" + k + "\\b").test(s)); return k ? NAMED[k] : null; };
  on((raw, t, ctx) => {
    const T = root.FrameTheme; if (!T) return null;
    let m;
    const themey = /\b(theme|colou?r scheme|colou?rs|skin|look of the app|app colou?rs?|palette|mode)\b/;
    for (const p of T.presets) {
      const nm = p.name.toLowerCase(), ali = { cerakote: "cerakote( purple)?|purple", rawti: "raw ti(tanium)?", anodised: "anodi[sz]ed( blue)?", burnt: "burnt ti(tanium)?", forest: "forest( gravel)?", night: "night ride" }[p.id];
      const named = new RegExp("\\b(" + nm + "|" + ali + ")\\b").test(t);
      // "raw titanium" or "purple" alone is about the frame, so those need "theme"/"colours"; "forest gravel look" is clear enough
      const bare = new RegExp("^(?:use |switch to |try |apply |go with )?(?:the )?(?:" + nm + "|" + ali + ")(?: look| preset)$").test(t);
      if (named && (themey.test(t) || bare)) { T.setCustom({ accent: p.accent, bg: p.bg, panel: p.panel, ink: p.ink }); return `Theme: **${p.name}**. \`light mode\`, \`night mode\` or \`auto theme\` go back to the standard looks.`; }
    }
    if (/^(themes|theme presets|list (the )?themes|what themes( are there)?|which themes|show (me )?(the )?themes)\??$/.test(t)) return "Themes: `light mode` · `night mode` · `auto theme` · `custom colours`, and presets: " + T.presets.map(p => `\`${p.name.toLowerCase()} theme\``).join(" · ") + ". Or set one colour: `accent colour orange`, `background #101418`.";
    if (/^(toggle|switch|flip|swap|change)( the)? (theme|mode|light ?\/? ?dark|dark ?\/? ?light)$|^(toggle|switch) (dark|night|light) mode$/.test(t)) { T.toggle(); return T.isDark() ? "Night mode on." : "Light mode on."; }
    if (/^(what|which)( theme| mode)( is (this|it|on)| am i (on|using))?\??$|^is (night|dark) mode on\??$/.test(t)) { const g = T.get(); return `Theme: **${({ auto: "Auto (follows your computer)", light: "Light", dark: "Night", custom: "Custom colours" })[g.mode]}**${g.dark ? " (dark)" : ""}.`; }
    if (/^(reset|default|normal|original|standard)( the)? (colou?rs?|theme|look)$|^(colou?rs?|theme) (back to )?(normal|default)$/.test(t)) { T.set("auto"); return "Colours back to the standard look (following your computer's light/dark setting)."; }
    if ((m = t.match(/^(?:make |set |change |use )?(?:the |an? )?(accent|highlight|button|brand|background|bg|page|panel|card|box|text|font|ink)(?: colou?r)?(?:s)? (?:to |as |=|:)?\s*(.+)$|^(?:make |set |change )?(?:the )?(?:app|page|everything|it) (.+)$/))) {
      const which = m[1] || "accent", c = colourIn(m[2] || m[3] || "");
      if (!c || (!m[1] && !/\b(colou?r|theme|purple|blue|green|red|orange|pink|teal|yellow)\b/.test(t))) return null;
      if (/\b(seat|post|bar|bars|stem|tyre|tire|wheel|rim|frame|bike|paint|tube|fork|saddle|logo|decal|finish)\b/.test(t)) return null;
      const key = /^(background|bg|page)$/.test(which) ? "bg" : /^(panel|card|box)$/.test(which) ? "panel" : /^(text|font|ink)$/.test(which) ? "ink" : "accent";
      T.setCustom({ [key]: c });
      return `Custom colours: **${({ bg: "background", panel: "panels", ink: "text", accent: "accent" })[key]}** ${c}. ${key === "bg" ? "Text and panels keep their colours; set them too if they're hard to read (`text colour white`, `panel colour #161b22`)." : ""}`.trim();
    }
    return null;
  });

  // ---------------------------------------------------------------- 9. housekeeping: rename, list, duplicate, saved?, design done, Check-step ticks
  const RENAME_EARLY = (raw0, n0, ctx) => {
    const m = String(raw0).match(/^\s*(?:re-?name|rename)\s+(?:this|the|my|it)?\s*(?:bike|design|project|frame|one)?\s*(?:to|as|:)?\s*["“']?(.+?)["”']?\s*$/i)
      || String(raw0).match(/^\s*(?:call|name)\s+(?:this|it|the|my)\s*(?:bike|design|project|frame|one)?\s+["“']?(.+?)["”']?\s*$/i)
      || String(raw0).match(/^\s*(?:change|set)\s+(?:the |this |my )?(?:bike'?s |design'?s )?name\s+(?:to|as)\s+["“']?(.+?)["”']?\s*$/i);
    if (!m || !ctx) return null;
    const name = m[1].trim(); if (!name || name.length > 80) return null;
    const A = ctx.App, id = A.currentId(), d = A.find ? A.find(id) : null;
    if (d && d.preset) { const r = A.saveNew(name); return `This one is a built-in example, so I saved it as your own bike called **${name}**. ${typeof r === "string" ? r : ""}`.trim(); }
    if (A.rename && A.rename(id, name)) return `Renamed this bike to **${name}**.`;
    return `I couldn't rename it. \`save as ${name}\` keeps a copy under that name.`;
  };
  on((raw, t, ctx) => {
    const A = ctx.App; let m;
    if (/^(list|show|what are|which are|what)( me)?( all)?( my| the)? (bikes|designs|saved (bikes|designs)|projects)( do i have| are there| have i got)?\??$|^(what|which) (bikes|designs) (do i have|have i got|are saved)\??$/.test(t)) {
      const all = A.allDesigns(), cur = A.currentId();
      return "**Bikes**:\n" + all.map(d => `${d.id === cur ? "▸" : "·"} ${d.name}`).join("\n") + "\n_`open <name>` switches; `compare with <name>` draws one behind this; `rename this bike to …`._";
    }
    if (/^(duplicate|clone|copy)( this| the| my)?( bike| design| one| it)?$|^make a copy( of (this|it))?$/.test(t)) {
      const nm = (A.designName ? A.designName() : "Bike") + " (copy)"; return A.saveNew(nm);
    }
    if (/^(is (it|this|my (bike|design)) saved|have i saved( it)?|are there (any )?unsaved (changes|edits)|any unsaved (changes|edits)|did i save( it)?)\??$/.test(t)) {
      return A.isEdited && A.isEdited() ? "There are **unsaved changes**. Say `save` to keep them (or `what changed` to see them first)." : "Everything is saved.";
    }
    if (/^(design (is )?(done|finished|ready)|i'?m (done|happy) with the design|looks right(,? check it)?|ready to check|mark (the )?design (as )?(done|ready))[.!]*$/.test(t) && J()) {
      J().setDesignDone(true); FJ().go("check"); return "Design marked ready. **Step 3 · Check** (opened): go through the automatic checks, then tick the manual ones.";
    }
    // Check step manual items
    const MAN = [["fit", /\bfit\b|\bposition\b|\bsizing\b/], ["tyres", /\b(tyres?|tires?)\b/], ["fork", /\bfork\b/], ["drive", /\b(drivetrain|drive ?train|chainring|gearing|chainline)\b/], ["cockpit", /\b(bar height|bars|cockpit|stem|handlebars?)\b/], ["post", /\b(seat ?post|post|dropper)\b/]];
    if (J() && (m = t.match(/^(?:(?:tick|check|mark|confirm)(?: off)?(?: that)? )?(?:the |my )?(.+?) (?:is |are )?(?:fits|fit|works|work|checks out|is sorted|are sorted)$|^(?:(?:tick|check|mark|confirm)(?: off)?(?: that)? )?(?:the |my )?(.+?) (?:is|are|works?|fits?|looks?) (?:right|good|ok|okay|fine|correct|set|chosen|done|confirmed|sorted|what i want)$|^(?:tick|check off|confirm|mark)(?: the)? (.+?)(?: check| item)?(?: as)?(?: done| ok| checked| confirmed| reviewed)?$/))) {
      const what = m[1] || m[2] || m[3]; if (/\d/.test(what) || what.split(" ").length > 4) return null;
      const hit = MAN.find(([, re]) => re.test(what));
      if (hit) { J().setReviewed(hit[0], true); const it = J().MANUAL.find(x => x.key === hit[0]); const cp = J().checkProgress(); return `✓ **${it.title}** ticked on the Check step (${cp.done} of ${cp.total}).`; }
    }
    return null;
  });

  // drawing rounds and the Final read-through
  const FIN = [["numbers", /\b(every|all the|the) numbers?\b.*\b(right|correct|checked|what i want|good)\b|\bre-?read (the|every) (drawing|number)/], ["standards", /\bstandards?\b.*\b(right|correct|ok|good|checked)\b/],
    ["extras", /\b(mounts|routing|finish|logos|extras)\b.*\b(confirmed|agreed|right|ok|in writing)\b/], ["fork", /\bfork\b.*\bheadset\b.*\b(work|fit|ok|good|together)\b|\bheadset\b.*\bfork\b.*\b(work|fit|ok|good|together)\b/],
    ["money", /\b(price|money|payment|shipping|customs|timing|costs?)\b.*\b(clear|sorted|agreed|ok|understood)\b/], ["kept", /\b(saved|kept|have|downloaded|filed) (the |a copy of the )?(approved |final )?(drawing|pdf)\b/]];
  on((raw, t, ctx) => {
    const A = J(); if (!A) return null;
    if (/^(scan|add|load|import|upload) ((?:waltly|my builder|the builder|your builder|builder)'?s |the |a |my )?(new |next |revised |second |latest |updated )?(drawing|round|cad)( r ?\d+)?( round)?$|^(new|next|add a) (drawing )?round$|^((?:waltly|my builder|the builder|your builder|builder)|they|the builder|my builder|your builder) sent (a |the )?(new|revised|second|updated|next) drawing$|^(revised|new|second|updated) drawing (arrived|came|is here)$/.test(t) && !/^(scan|add|load|import|upload) (a |the |my )?drawing$/.test(t)) {
      FJ().go("builder"); later(() => A.act("scanRound")); return "Opening the scanner for your builder's next drawing: it becomes the next round, compared with what you asked for last, and its drawing checklist opens after.";
    }
    if (/^(type|enter|key) (in )?(the |(?:waltly|my builder|the builder|your builder|builder)'?s )?(drawing'?s? )?(numbers|values)( in)?( from the drawing)?( by hand)?( in)?$|^type (the )?drawing in$/.test(t)) { FJ().go("builder"); later(() => A.act("typeRound")); return "Opening the next drawing round to type its numbers in, as your builder prints them. Save it as the round, then go through its drawing checklist in step 4."; }
    if (/^(latest|last|current) (drawing|round)\??$|^(how'?s|what about|status of) the (latest |last )?(drawing|round)\??$/.test(t)) {
      const r = A.latestRound(); if (!r) return "No drawing rounds yet. When your builder's drawing comes: `scan a drawing`.";
      const s2 = r.stats || {}; return `**Drawing R${r.n}** (${fmtDay(r.date)}): ${s2.none ? "checklist not started" : `${s2.ch || 0} change(s), ${s2.ask || 0} question(s), ${s2.ok || 0} OK${s2.undecided ? `, ${s2.undecided} flagged number(s) not looked at` : ""}`}. \`open the drawing checklist\` to go through it.`;
    }
    if (!isQ(raw, t) || /^(i'?ve|i have)\b/.test(t)) {
      const hit = FIN.find(([, re]) => re.test(t));
      if (hit && /\b(i'?ve|i have|is|are|all|every|confirmed|checked|clear|saved|kept|agreed|right|ok|work|works|fit|fits|together)\b/.test(t) && !/\b(what|how|why)\b/.test(t)) {
        A.setFinalTick(hit[0], true); const it = A.FINAL.find(([k]) => k === hit[0]); return `✓ Final read-through: **${it[1]}**.`;
      }
    }
    return null;
  });

  // seatpost by diameter: "27.2 seatpost", "set the seatpost to 31.6", "30.9 dropper"
  on((raw, t, ctx) => {
    let m = t.match(/\b(27\.2|30\.9|31\.6|34\.9)\b/); if (!m || !/\b(seat ?post|post|dropper)\b/.test(t) || /\b(od|wall|length|insertion|clamp|collar|seat tube)\b/.test(t)) return null;
    if (isQ(raw, t) && !/\b(want|use|make|set|fit|give|change)\b/.test(t)) return null;
    const f = ctx.fld("tubes.seatpost.type"); if (!f || f.kind !== "select") return null;
    const dia = m[1], cur = String(f.get()), curLbl = ((f.options.find(o => o[0] === cur) || [])[1] || "").toLowerCase();
    const want = /\bdropper\b/.test(t) ? "dropper" : /\b(ti|titanium)\b/.test(t) ? "titanium" : /\b(alu|alloy|aluminium|aluminum)\b/.test(t) ? "alloy" : /\b(flex|thin wall|hi ?flex)\b/.test(t) ? "thin-wall" : /\b(leaf|split|cf3|vcls)\b/.test(t) ? "leaf" : /\bcarbon\b/.test(t) ? "carbon" : (curLbl.match(/^(dropper|titanium|alloy|carbon)/) || [])[1] || "carbon";
    const opts = f.options.filter(o => o[1].includes(dia));
    if (!opts.length) return `There's no ${dia} mm seatpost in the list. Pick “Custom” in the Seatpost panel and type its diameter, or ask your builder for a ${dia} seat tube.`;
    const pick = opts.find(o => o[1].toLowerCase().startsWith(want) && (want !== "carbon" || /standard|^carbon \d/i.test(o[1]))) || opts.find(o => o[1].toLowerCase().includes(want)) || opts[0];
    const POSTV = { "27.2": "27.2 mm", "30.9": "30.9 mm", "31.6": "31.6 mm", "34.9": "34.9 mm" };
    let sp = ""; if (J() && J().project().spec.post !== POSTV[dia]) { J().setSpec("post", POSTV[dia]); sp = `\n_Also on the spec sheet: Seatpost diameter → ${POSTV[dia]}._`; }
    return setMany(ctx, [[f.id, pick[0]]], "seatpost") + sp + (want === "dropper" && !/dropper/i.test(pick[1]) ? `\n_No ${dia} dropper in the list, so I picked ${pick[1]}._` : "");
  });

  // ---------------------------------------------------------------- 10. help
  const HELP3 = ["**The build journey from the chat**:",
    "• **Steps**: `go to step 3` · `next step` · `back a step` · `where am I` · `what's next`",
    "• **Windows**: `open the tubes panel` · `show toe overlap` · `lab tests` · `my bikes` · `close this`",
    "• **Spec sheet**: `builder's carbon fork` · `wireless shifting` · `flat mount 160/180` · `brushed and blasted` · `T47` · `spec crank: SRAM Force DUB` · `what's missing on the spec`",
    "• **Request**: `write my request` · `build summary`",
    "• **Drawings**: `scan a drawing` · `the builder sent a revised drawing` · `type the drawing numbers in` · `latest drawing` · `open the drawing checklist` · `I've saved the approved drawing` · `every number is right`",
    "• **Order progress**: `I sent the request` · `paid the deposit yesterday` · `got the first drawing` · `production started` · `frame shipped` · `it arrived!` · `untick the deposit` · `order progress`",
    "• **Journal**: `journal: called the builder about the yoke` · `the builder said 44 mm straight is fine` · `I sent the builder my changes` · `show my journal` · `delete my last journal entry` · `turn off the journal` / `turn the journal on`",
    "• **Questions**: `ask my builder whether they do Ti cages` · `question: what wall for the down tube?` · `suggest questions` · `question 2 answered`",
    "• **Ask me**: `how long does production take?` · `how do I pay?` · `shipping and customs?` · `how much is a Ti fork?` · `can I change it after I approve?` · `what's included?`",
    "• **Look**: `night mode` · `raw titanium theme` · `accent colour orange` · `toggle theme` · `themes`",
    "• **Garage**: `open my garage` · `add this bike to my garage` · `export my garage` · **Bends**: `open the bent tubes panel` · `match a frame drawing`",
    "• **Bikes**: `rename this bike to Gravel Dream` · `list my bikes` · `duplicate this` · `is it saved?` · `design is done` · `the fit is right` · `tours`"];
  on((raw, t) => /^(order|journey|step|steps|journal|spec|(?:waltly|my builder|the builder|your builder|builder)|build) (help|commands)$|^help (with )?(the )?(order|journey|steps|journal|spec sheet|(?:waltly|my builder|the builder|your builder|builder))$/.test(t) ? HELP3.join("\n") : null);

  // ---------------------------------------------------------------- 11. after every reply: mirror your builder notes (part 2) and design changes onto the spec sheet
  function notesToSpec(notes, d) {
    const out = {}, by = k => notes.filter(n => n.k === k || n.k.startsWith(k + ":"));
    const hub = by("hub")[0];
    if (hub) out.axle = /157/.test(hub.text) ? optOf("axle", /157/) : /148/.test(hub.text) ? optOf("axle", /148/) : /142/.test(hub.text) ? optOf("axle", /142/) : /quick release|135/.test(hub.text) ? optOf("axle", /135/) : null;
    const udh = by("udh")[0]; if (udh) out.hanger = /UDH/.test(udh.text) ? optOf("hanger", /UDH/) : optOf("hanger", /replaceable/);
    const rt = notes.filter(n => /^routing(:brake|:gear)?$/.test(n.k)).pop();
    if (rt) out.routing = /through the headset/i.test(rt.text) ? optOf("routing", /headset/) : /^External/.test(rt.text) ? optOf("routing", /^External/) : optOf("routing", /frame ports/);
    if (by("routing:dropper").length) { out.dropper = optOf("dropper", /Internal/); if (!rt) out.routing = optOf("routing", /Dropper only/); }
    const bt = by("bottles")[0]; if (bt) out.bottles = bt.text;
    const rack = notes.some(n => /^rack/.test(n.k) && !/^No /.test(n.text)), mg = notes.some(n => n.k === "mudguard" && !/^No /.test(n.text)), said = notes.some(n => /^(rack|mudguard)/.test(n.k));
    if (said) out.rack = optOf("rack", rack && mg ? /Rack \+ fenders/ : rack ? /^Rack$/ : mg ? /^Fenders$/ : /^None$/);
    const mt = notes.filter(n => /^(ttbag|forkcage|iscg|kickstand|pump)$/.test(n.k)); if (mt.length) out.mounts = mt.map(n => n.text).join("; ");
    const fd = by("fd")[0]; if (fd) out.fd = /1×|no front/i.test(fd.text) ? optOf("fd", /None/) : optOf("fd", /Braze/);
    const fin = by("finish")[0];
    if (fin) out.finish = /Brushed/i.test(fin.text) ? optOf("finish", /^Brushed$/) : /blast|satin|matt?e/i.test(fin.text) ? optOf("finish", /^Bead/) : /Polish|Mirror/i.test(fin.text) ? optOf("finish", /^Polished/) : /Paint|Cerakote|Anodi/i.test(fin.text) ? optOf("finish", /Painted/) : null;
    const lg = by("logo")[0];
    if (lg) out.logos = /^No logos/.test(lg.text) ? optOf("logos", /^None/) : /Engraved|etched/i.test(lg.text) ? optOf("logos", /engraving/) : /Custom|own/i.test(lg.text) ? optOf("logos", /own decals/) : optOf("logos", /logo/);
    const hs = by("headset")[0];
    if (hs) out.headset = /ZS56/.test(hs.text) ? optOf("headset", /^44\/56/) : /IS42/.test(hs.text) ? optOf("headset", /^42\/52/) : /IS52 \/ IS52/.test(hs.text) ? optOf("headset", /^52 mm/) : /EC44/.test(hs.text) ? optOf("headset", /^44 mm/) : hs.text.replace(/^Headset:\s*/, "");
    const bb = by("bb")[0];
    if (bb) out.bb = /T47 inboard/.test(bb.text) ? optOf("bb", /inboard/) : /T47/.test(bb.text) ? optOf("bb", /T47 outboard/) : /BSA/.test(bb.text) ? optOf("bb", /\b68\b/.test(bb.text) ? /BSA threaded 68/ : /BSA threaded 73/) : /PF30|BB30/.test(bb.text) ? optOf("bb", /PF30/) : /86|92/.test(bb.text) ? optOf("bb", /BB86/) : null;
    return out;
  }
  const POSTS = { 27.2: "27.2 mm", 30.9: "30.9 mm", 31.6: "31.6 mm", 34.9: "34.9 mm" };
  FC.after = (FC.after || []).concat([{
    before: ctx => { const d = ctx.App.design(); return { notes: JSON.stringify(d.orderNotes || []), post: d.tubes && d.tubes.seatpost && d.tubes.seatpost.od, yoke: +(d.geometry && d.geometry.csYokeLength) || 0 }; },
    after: (raw0, r, ctx, b) => {
      const A = J(); if (!A || !b) return null;
      const d = ctx.App.design(), notes = d.orderNotes || [], spec = A.project().spec, lines = [];
      if (JSON.stringify(notes) !== b.notes) {
        const old = JSON.parse(b.notes), want = notesToSpec(notes, d), had = notesToSpec(old, d);
        for (const [k, v] of Object.entries(want)) if (v && v !== had[k] && spec[k] !== v) { A.setSpec(k, v); lines.push(`${specField(k).label} → ${short(v)}`); }
      }
      const post = d.tubes && d.tubes.seatpost && d.tubes.seatpost.od;
      if (post !== b.post && POSTS[post] && spec.post !== POSTS[post]) { A.setSpec("post", POSTS[post]); lines.push(`Seatpost diameter → ${POSTS[post]}`); }
      const yk = +(d.geometry && d.geometry.csYokeLength) || 0;
      if (yk !== b.yoke && !/spec sheet · chainstay yoke/i.test(String(r))) {
        const v = yk > 0 ? (spec.yoke && !/^No yoke/.test(spec.yoke) ? null : optOf("yoke", /plate/)) : optOf("yoke", /^No yoke/);
        if (v && spec.yoke !== v) { A.setSpec("yoke", v); lines.push(`Chainstay yoke → ${short(v)}`); }
      }
      return lines.length ? `_Also on the spec sheet: ${lines.join(" · ")}._` : null;
    }
  }]);

  // ---------------------------------------------------------------- hook in: free text first, then these before parts 1 and 2
  FC.early = [RENAME_EARLY, SPEC_EARLY, QUESTION_EARLY].concat(JOURNAL_EARLY, FC.early || []);
  FC.intents = I.concat(FC.intents || []);
  FC._journey = { dateIn, notesToSpec, HELP3, WIN, FAQ };
})(typeof window !== "undefined" ? window : globalThis);
