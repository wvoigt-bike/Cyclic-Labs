// ============================================================================
//  THE JOURNEY (journey.js) — v10 layout
//  The header shows five steps, left to right, and the page shows one at a time:
//    1 Start   – welcome; "help me figure out what I want" (a few plain questions →
//                bike type, wheels, size), start from a size / a bike you like /
//                BikeCAD / a drawing, continue a saved bike, two short explainers.
//    2 Design  – the 3D bike with a column of boxes; a box opens its panel beside
//                the bike (the panels are the old left-rail sections, same ids).
//    3 Check   – a checklist: automatic checks (each opens its window), the spec
//                sheet (the options the builder asks about) and things to confirm.
//    4 Builder – order progress, "write my request", drawing rounds R1, R2 …
//                (mine-vs-drawing table with OK / ask to change / use theirs,
//                then "write my reply"), questions for your builder.
//    5 Final   – sign-off checklist, approve, printable build summary.
//  Plus the JOURNAL: a dated log per bike. Cyclic Labs adds entries when things
//  happen; you add your own notes. Opened from the header.
//
//  Everything here is kept per bike ("project" = the design you're ordering; a
//  drawing round's design belongs to its project) in localStorage under
//  frameBench.journey.v1, and travels inside Export file / Import file.
//  Windows: <dialog class="win drawer|wide|mid"> — drawers open beside the bike
//  without blocking it, wide/mid ones are modal. FrameJourney.open(id) opens one.
//  Needs: page.html (CyclicLabsApp hooks), and uses FrameNewBike, FrameScanUI,
//  FrameTemplates, FrameToe, FrameOverlay, FrameTour when present.
// ============================================================================
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const A = () => window.CyclicLabsApp;
  // local calendar dates (an ISO date alone would be read as UTC midnight and show as the day before in the Americas)
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const asDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v); };
  const nowIso = () => new Date().toISOString();
  const fmtDate = iso => { try { return asDate(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return iso; } };
  const fmtTime = iso => { try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } };
  const STAGES = ["start", "design", "check", "builder", "final"];
  const STAGE_NAME = { start: "Start", design: "Design", check: "Check", builder: "Builder", final: "Final" };

  // ---------------------------------------------------------------- storage
  const LS = "frameBench.journey.v1";
  let store = (() => { try { const v = JSON.parse(localStorage.getItem(LS) || "null"); if (v && v.projects) return v; } catch (e) {} return { projects: {}, roundOf: {}, lastStage: null }; })();
  let fullWarned = false;
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(store)); return true; } catch (e) {
    if (!fullWarned && A()) { fullWarned = true; A().toast("This browser's storage is full: export the project file to keep everything, or remove some journal photos."); } return false; } };
  const blank = () => ({ stage: null, designDone: false, reviewed: {}, ticks: {}, spec: {}, process: {}, rounds: [], questions: [], final: { ticks: {} }, after: {}, journal: [] });
  const curId = () => (A() && A().currentId()) || "";
  const pid = () => store.roundOf[curId()] || curId();
  function P(id) {
    id = id || pid();
    let p = store.projects[id];
    if (!p) { p = store.projects[id] = blank(); }
    for (const [k, v] of Object.entries(blank())) if (p[k] == null) p[k] = v;
    return p;
  }
  const hasProject = id => !!store.projects[id];

  // ---------------------------------------------------------------- the journal on/off setting (Help menu → Build journal)
  // Off hides every bit of the journal: the header button, the note boxes on each step, the journal cards, its line in
  // "Continue", its box in step 2 and its section in the build summary. Nothing is deleted: Cyclic Labs keeps adding the
  // automatic milestones quietly, so switching it back on shows the whole story. Kept per browser in frameBench.journalOff.
  const JOFF = "frameBench.journalOff";
  let journalOff = (() => { try { return localStorage.getItem(JOFF) === "1"; } catch (e) { return false; } })();
  const jOn = () => !journalOff;
  function setJournal(on, quiet) {
    journalOff = !on;
    try { if (journalOff) localStorage.setItem(JOFF, "1"); else localStorage.removeItem(JOFF); } catch (e) {}
    document.documentElement.toggleAttribute("data-no-journal", journalOff);
    const jb = document.getElementById("btnJournal"); if (jb) jb.hidden = journalOff;
    document.querySelectorAll("[data-journal]").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.journal === "on") === on)));
    if (journalOff && winOpen("w-journal")) close("w-journal");
    if (currentStage === "design") renderDesign(); else if (currentStage && currentStage !== "garage") renderStage(currentStage);
    if (!quiet && A()) A().toast(on ? "Build journal on: the 📓 Journal button and note boxes are back." : "Build journal off. Nothing was deleted: turn it back on any time from Help.");
    return on;
  }

  // ---------------------------------------------------------------- journal
  // Entry: { at (ISO), kind, text, stage, body? (a pasted message), img? (small JPEG data URL) }
  //   kind: "milestone" (a step of the build), "auto" (something Cyclic Labs noticed), "note" (yours),
  //         "from" (what your builder said), "to" (what you sent), "photo" (a picture with a caption)
  const JK = {
    milestone: ["🏁", "Milestone"], auto: ["•", "Cyclic Labs"], note: ["📝", "Note"], from: ["📨", "Builder said"], to: ["📤", "I sent"], photo: ["📷", "Photo"]
  };
  function log(text, kind, id) {
    const p = P(id); const last = p.journal[p.journal.length - 1];
    // don't repeat the same automatic entry within a minute
    if ((kind === "auto" || kind === "milestone") && last && last.text === text && Date.now() - new Date(last.at).getTime() < 60000) return;
    p.journal.push({ at: nowIso(), kind: kind || "auto", text, stage: currentStage });
    save(); refreshJournalViews();
  }
  function addEntry(e) {
    const p = P(); p.journal.push(Object.assign({ stage: currentStage }, e));
    p.journal.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (!save()) { p.journal.splice(p.journal.indexOf(e), 1); return false; }
    refreshJournalViews(); return true;
  }
  function refreshJournalViews() {
    if (winOpen("w-journal")) { const t = document.getElementById("jText"); if (!t || !t.value) renderJournal(); }
    document.querySelectorAll(".jq-feed").forEach(f => { f.innerHTML = feedHtml(+f.dataset.n || 3, f.dataset.kinds); });
  }
  // a picture → small JPEG (journal photos live in this browser, so keep them light)
  function shrinkImage(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const im = new Image(); im.onload = () => {
        const k = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.72)); }; im.onerror = rej; im.src = fr.result; };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  function entryHtml(j, idx, full) {
    const [ic, lab] = JK[j.kind] || JK.auto, mine = j.kind !== "auto" && j.kind !== "milestone";
    return `<div class="jent ${esc(j.kind)}"><span class="jic" aria-hidden="true">${ic}</span>
      <div class="jtx"><span class="hint">${esc(full ? fmtTime(j.at) : fmtDate(j.at))} · ${esc(lab)}${j.stage && full ? " · " + esc(STAGE_NAME[j.stage] || "") : ""}</span>
        <div>${esc(j.text)}</div>${j.body ? `<details><summary>Message</summary><pre class="jbody">${esc(j.body)}</pre></details>` : ""}${j.img ? `<img class="jimg" src="${j.img}" alt="${esc(j.text || "Journal photo")}" loading="lazy">` : ""}</div>
      ${full && mine ? `<button type="button" class="win-x" data-jdel="${idx}" aria-label="Delete this entry">✕</button>` : ""}</div>`;
  }
  function feedHtml(n, kinds) {
    const p = P(), ks = kinds ? kinds.split(",") : null;
    const list = p.journal.map((j, i) => [j, i]).filter(([j]) => !ks || ks.includes(j.kind)).slice(-n).reverse();
    return list.length ? list.map(([j, i]) => entryHtml(j, i, false)).join("") : `<p class="hint">Nothing here yet.</p>`;
  }
  // the composer: one box, a few kinds ("Builder said", "I sent", note, photo), a date for things that happened earlier
  const PH = { note: "What happened, what you decided, what you're unsure about…", from: "Paste or sum up what your builder said (e.g. “44 mm head tube is standard; T47 is fine”)…", to: "What you sent them…", photo: "Caption, e.g. “Finish proof: brushed/blasted line”" };
  function composerHtml(kinds, pre) {
    return `<div class="jcomp" data-pre="${pre}">
      <div class="seg jkinds" role="group" aria-label="Kind of entry">${kinds.map((k, i) => `<button type="button" data-jk="${k}" aria-pressed="${i === 0}">${JK[k][0]} ${JK[k][1]}</button>`).join("")}</div>
      <textarea id="${pre}Text" rows="3" placeholder="${esc(PH[kinds[0]])}"></textarea>
      <div class="jrow"><label class="hint">Date <input type="date" id="${pre}Date" value="${today()}"></label>
        <label class="jfile"><input type="file" id="${pre}Img" accept="image/*" hidden><span class="btnlike">📎 Add a photo</span><span class="hint" id="${pre}ImgName"></span></label>
        <span style="flex:1"></span><button type="button" class="primary" id="${pre}Add">Add to journal</button></div></div>`;
  }
  function bindComposer(root, pre, after) {
    const c = root.querySelector(`.jcomp[data-pre="${pre}"]`); if (!c) return;
    let kind = c.querySelector("[data-jk]").dataset.jk, img = null;
    const ta = c.querySelector(`#${pre}Text`), ph = PH;
    c.querySelectorAll("[data-jk]").forEach(b => b.onclick = () => { kind = b.dataset.jk; c.querySelectorAll("[data-jk]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); ta.placeholder = ph[kind] || ""; if (kind === "photo") c.querySelector(`#${pre}Img`).click(); });
    c.querySelector(`#${pre}Img`).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { img = await shrinkImage(f); c.querySelector(`#${pre}ImgName`).textContent = f.name; } catch (err) { A().toast("Couldn't read that picture."); } };
    c.querySelector(`#${pre}Add`).onclick = () => {
      const text = ta.value.trim(); if (!text && !img) { ta.focus(); return; }
      const dv = c.querySelector(`#${pre}Date`).value, now = new Date();
      // a backdated entry keeps today's clock time so entries on one day stay in order
      const at = dv && dv !== today() ? new Date(`${dv}T${now.toTimeString().slice(0, 8)}`).toISOString() : nowIso();
      const long = text.length > 220 && (kind === "from" || kind === "to");
      const e = { at, kind: img && kind !== "from" && kind !== "to" ? "photo" : kind, text: long ? text.slice(0, 200).replace(/\s+\S*$/, "") + " …" : text || "Photo", body: long ? text : undefined, img: img || undefined };
      if (!addEntry(e)) return;
      ta.value = ""; img = null; c.querySelector(`#${pre}ImgName`).textContent = "";
      A().toast("Added to your journal"); after && after();
    };
  }
  // the journal box on each step page: composer + the latest few entries
  function journalQuick(kinds, n) {
    if (!jOn()) return "";
    return `<div class="jquick">${composerHtml(kinds, "jq")}<div class="jlog jq-feed" data-n="${n || 3}">${feedHtml(n || 3)}</div>
      <button type="button" data-act="journal" class="linkbtn">Open the whole journal (${P().journal.length})</button></div>`;
  }
  function bindJournalQuick(root) { bindComposer(root, "jq", () => { const b = root.querySelector(".jquick .linkbtn"); if (b) b.textContent = `Open the whole journal (${P().journal.length})`; }); }

  // ---------------------------------------------------------------- windows
  const winOpen = id => { const d = document.getElementById(id); return !!(d && d.open); };
  function makeWin(id, title, kind, sub) {
    let d = document.getElementById(id);
    if (!d) {
      d = document.createElement("dialog"); d.className = "win " + (kind || "mid"); d.id = id; d.setAttribute("aria-labelledby", id + "-t");
      d.innerHTML = `<div class="win-head"><div class="win-titles"><h2 id="${id}-t"></h2><p class="hint" ${sub ? "" : "hidden"}></p></div><button type="button" class="win-x" data-close aria-label="Close">✕</button></div><div class="win-body"></div><div class="win-foot" hidden></div>`;
      document.body.appendChild(d); wireWin(d);
    }
    d.querySelector(".win-titles h2").innerHTML = title;
    const h = d.querySelector(".win-titles .hint"); h.hidden = !sub; h.innerHTML = sub || "";
    return { dlg: d, body: d.querySelector(".win-body"), foot: d.querySelector(".win-foot") };
  }
  function wireWin(d) {
    if (d._wired) return; d._wired = true;
    d.addEventListener("click", e => { if (e.target.closest("[data-close]") && e.target.closest("dialog") === d) d.close(); });
    // click on the backdrop of a modal window closes it
    d.addEventListener("mousedown", e => { if (e.target === d && !d.classList.contains("drawer")) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } });
    d.addEventListener("close", () => { syncDrawerState(); onClose(d.id); });
  }
  function syncDrawerState() {
    const any = [...document.querySelectorAll("dialog.win.drawer")].some(x => x.open);
    document.body.classList.toggle("drawer-open", any);
    document.querySelectorAll("[data-win]").forEach(b => { if (b.classList.contains("box")) b.setAttribute("aria-expanded", String(winOpen(b.dataset.win))); });
  }
  function open(id) {
    if (id === "w-journal" && !jOn()) { if (A()) A().toast("The build journal is turned off. Turn it on under Help → Build journal."); return; }
    const d = document.getElementById(id); if (!d) return;
    wireWin(d);
    onOpen(id);
    if (d.classList.contains("drawer")) {
      document.querySelectorAll("dialog.win.drawer[open]").forEach(x => { if (x !== d) x.close(); });
      if (!d.open) d.show();
      d.scrollTop = 0;
      // phones: the panel is a bottom sheet, so bring the bike into view above it
      if (innerWidth <= 700 && currentStage === "design") { const v = document.getElementById("cwrap"); if (v) v.scrollIntoView({ block: "start" }); }
    } else if (!d.open) d.showModal();
    syncDrawerState();
    const f = d.querySelector(".win-body input, .win-body select, .win-body textarea, .win-body button");
    if (d.classList.contains("drawer") && f) setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
  }
  const close = id => { const d = document.getElementById(id); if (d && d.open) d.close(); };
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (document.querySelector("dialog[open]:modal")) return;      // the browser closes modal ones itself
    const dr = document.querySelector("dialog.win.drawer[open]"); if (dr) { dr.close(); e.preventDefault(); }
  });
  function onOpen(id) {
    if (id === "w-toe") { moveToe(); setTimeout(() => { try { window.FrameToe && FrameToe.render(); } catch (e) {} }, 0); }
    if (id === "w-parts") { const a = A(); if (a && !a.isReal()) a.setReal(true); setTimeout(syncParts, 50); }
    if (id === "w-journal") renderJournal();
  }
  function onClose(id) { if (id === "w-spec" || id === "w-round") update(); }

  // the realistic-view parts panel and the toe card are built by their own modules; move them into their windows
  function syncParts() {
    const rp = document.getElementById("realPanel"), host = document.getElementById("partsHost");
    if (!rp || !host) return;
    if (rp.parentNode !== host) host.appendChild(rp);
    rp.open = true;
    const w = document.getElementById("partsWait"); if (w) w.hidden = !rp.hidden;
    if (w && rp.hidden) w.textContent = "Switching to the realistic 3D view…";
  }
  function moveToe() { const c = document.getElementById("toeCard"), h = document.getElementById("toeHost"); if (c && h && c.parentNode !== h) h.appendChild(c); }

  // ---------------------------------------------------------------- stages
  let currentStage = null;
  function go(stage, opts) {
    // "garage" (garage.js) is a page outside the five steps: the bikes you own, kept for reference
    const garagePage = stage === "garage" && !!window.FrameGarage;
    if (!STAGES.includes(stage) && !garagePage) stage = "design";
    const changedStage = stage !== currentStage;
    currentStage = stage;
    document.querySelectorAll(".stage").forEach(s => s.hidden = s.dataset.stage !== stage);
    if (stage !== "design") document.querySelectorAll("dialog.win.drawer[open]").forEach(x => { if (x.id !== "w-journal" && x.id !== "w-bikes") x.close(); });
    if (!garagePage) { store.lastStage = stage; if (A() && curId()) { P().stage = stage; } }
    save();
    renderStage(stage);
    renderStepper();
    if (changedStage && !(opts && opts.keepScroll)) window.scrollTo({ top: 0 });
    if (stage === "design") setTimeout(() => window.dispatchEvent(new Event("resize")), 30);
  }
  function renderStage(stage) {
    try {
      if (stage === "start") renderStart();
      else if (stage === "design") renderDesign();
      else if (stage === "check") renderCheck();
      else if (stage === "builder") renderBuilder();
      else if (stage === "final") renderFinal();
      else if (stage === "garage") window.FrameGarage.render();
    } catch (e) { console.error(e); }
  }

  // ---------------------------------------------------------------- status of each step (stepper + pages)
  const isPreset = () => { const a = A(), d = a && a.find(curId()); return !!(d && d.preset); };
  function autoChecks() {
    const a = A(), r = a && a.result(); const eng = a && a.uiMode() === "eng";
    const rows = a ? a.checks() : [];
    const n = k => rows.filter(x => x.status === k).length;
    const toePill = document.querySelector("#toeSummary .pill");
    const toeTxt = document.querySelector("#toeSummary");
    const items = [
      { key: "checklist", win: "w-checklist", title: "Builder checklist", text: "Pedal and toe room, tyre and chainring clearance, seatpost fit and insertion, tube sizes: the checks framebuilders run on a drawing.",
        st: !rows.length ? ["", "—"] : n("fail") ? ["bad", `${n("fail")} fail · ${n("warn")} to check`] : n("warn") ? ["warn", `${n("warn")} to check`] : ["ok", `all ${n("ok")} ok`] },
      { key: "toe", win: "w-toe", title: "Toe overlap", text: "Will your shoe touch the front tyre when you turn the bars? Set your shoe size and cleat position.",
        st: toePill ? [toePill.classList.contains("bad") ? "bad" : toePill.classList.contains("warn") ? "warn" : "ok", toePill.textContent.trim()] : ["", toeTxt ? toeTxt.textContent.trim().slice(0, 40) : "open to check"] },
      { key: "geocheck", win: "w-geocheck", title: "Geometry numbers", text: "Wheelbase, trail, front centre, BB height, standover: sanity-check them against a bike you know.",
        st: r ? ["", `wheelbase ${Math.round(r.info.wheelbase)} · trail ${Math.round(r.info.trail)} mm`] : ["", "—"] }
    ];
    const engItems = !r ? [] : [
      { key: "abuse", win: "w-abuse", title: "Strength & fatigue life", text: "How long the frame should last for the riding you set, and how hard each hit, landing or sprint works it.",
        st: (() => { const y = r.fatigue.lifeYears; return [y < 5 ? "bad" : y < 15 ? "warn" : "ok", isFinite(y) ? `${y >= 100 ? "100+" : y >= 10 ? Math.round(y) : y.toFixed(1)} years` : "no limit"]; })() },
      { key: "iso", win: "w-iso", title: "Lab tests (ISO 4210)", text: "The frame tests bike brands certify to, estimated for this frame.",
        st: (() => { const f = r.isoTests.filter(t => !t.pass).length; return f ? ["bad", `${f} of ${r.isoTests.length} fail`] : ["ok", `all ${r.isoTests.length} pass`]; })() },
      { key: "comfort", win: "w-comfort", title: "Seated comfort", text: "How much the saddle gives over bumps, and where the flex comes from.",
        st: [r.comfort.rating.score >= 3 ? "ok" : r.comfort.rating.score === 2 ? "warn" : "bad", `${Math.round(r.comfort.k)} N/mm · ${r.comfort.rating.label.toLowerCase()}`] },
      { key: "joints", win: "w-joints", title: "Weld joints", text: "Which welds concentrate stress the most.", st: ["", "for the curious"], optional: true },
      { key: "stress", win: "w-stress", title: "Stress by tube", text: "Peak stress in each tube for each load.", st: ["", "for the curious"], optional: true },
      { key: "explorer", win: "w-explorer", title: "Comfort explorer & optimiser", text: "Try changes one at a time, or search for the plushest frame that still passes every check.", st: ["", "optional tool"], optional: true },
      { key: "ccx", win: "w-ccx", title: "CalculiX check", text: "A second opinion from a full finite-element solver (needs Cyclic Labs started with “Start Cyclic Labs”).", st: ["", "optional"], optional: true }
    ];
    return { items, engItems: eng ? engItems : [], eng, engAvailable: engItems.length };
  }
  const MANUAL = [
    { key: "fit", title: "The fit is what you want", text: "Compare with a bike that fits you: overlay it in 3D, or pick it under “Compare with” to see the differences.", act: [["Overlay a bike", "overlay"]] },
    { key: "tyres", title: "Your biggest tyre is set", text: "The widest tyre you'll ever want to run. Tyre room is checked against it.", act: [["Wheels & tyres", "w-wheels"]] },
    { key: "fork", title: "Fork chosen, with its real numbers", text: "Axle-to-crown and offset from the fork maker's chart (suspension: the sag-corrected length is used for handling).", act: [["Geometry", "w-geometry"], ["Parts", "w-parts"]] },
    { key: "drive", title: "Drivetrain fits", text: "Chainring size and chainline clear the stays; BB shell standard and rear axle match your parts.", act: [["Drivetrain", "w-wheels"]] },
    { key: "cockpit", title: "Bar height works", text: "Stack plus headset, spacers and stem puts the bars where you want them.", act: [["Parts", "w-parts"]] },
    { key: "post", title: "Seatpost fits", text: "Diameter, dropper length and insertion depth work with your saddle height.", act: [["Seatpost", "w-post"]] }
  ];
  function checkProgress() {
    const p = P(), ac = autoChecks();
    const keys = ac.items.map(i => i.key).concat(ac.engItems.filter(i => !i.optional).map(i => i.key), MANUAL.map(m => m.key));
    const done = keys.filter(k => p.reviewed[k]).length;
    return { done, total: keys.length, all: done === keys.length };
  }

  // ---------------------------------------------------------------- spec sheet (the options the builder asks about)
  // The options builders asked about in real orders, grouped. "must" = they won't draw it without an answer.
  const ASK = "Ask my builder to recommend";
  const SPEC = [
    { g: "Rider & use", k: "type", label: "Kind of frame", opts: ["Hardtail mountain bike", "Gravel", "Road", "Bikepacking / touring", "Other"], must: true },
    { g: "Rider & use", k: "loads", label: "Heavy loads?", opts: ["No", "Bikepacking bags", "Rack + panniers / touring"], hint: "With your weight, this sets the tube sizes (e.g. a 44.5 × 1.0 × 1.3 down tube, 16 vs 19 mm seat stays)." },
    { g: "Rider & use", k: "tubing", label: "Tubing", opts: ["Straight gauge", "Double-butted (lighter, about $100 extra)", ASK] },
    { g: "Front end", k: "headset", label: "Head tube / headset", must: true, opts: ["44 mm straight, ZS44 top / EC44 bottom (e.g. FSA No.13): classic, easy to service; the external lower cup adds ~10–15 mm stack", "52 mm straight, IS52/IS52 (e.g. FSA ACR No.55 / Chris King Aeroset): cables through the headset", "42/52 tapered, IS42/IS52 (FSA No.42/ACB): integrated road standard", "44/56 tapered, ZS44/ZS56: suspension forks (ask your builder)", ASK],
      hint: "Must suit your fork's steerer (almost all are tapered 1-1/8\"→1-1/2\"). The builder confirms fit by headset model name." },
    { g: "Front end", k: "headsetFrom", label: "Who supplies the headset", opts: ["The builder (about $50–55)", "I'll buy my own (model in notes)"] },
    { g: "Front end", k: "fork", label: "Fork", must: true, opts: ["Builder's carbon fork (about $160; 47 or 52 mm rake, no 55; up to 700C × 55 mm)", "Builder's Ti fork (about $350; must be designed with the frame)", "My own fork (model, axle-to-crown and offset in notes)"],
      hint: "A Ti fork is longer than a carbon one, so adding it later breaks the geometry." },
    { g: "Front end", k: "stackIncl", label: "Does your stack include the headset's lower cup?", opts: ["Yes", "No", "Not sure (ask)"] },
    { g: "Drivetrain", k: "bb", label: "Bottom bracket", must: true, opts: ["T47 outboard 68/73 (threaded; the usual default; room for internal routing)", "T47 inboard 86 (wide road shell)", "BSA threaded 68 (road)", "BSA threaded 73 (MTB / gravel)", "PF30 press-fit", "BB86 / PF86 press-fit", "Eccentric BB / sliders / gearbox (ask)", ASK],
      from: d => d.geometry.bbShellWidth ? `Your design: ${d.geometry.bbShellWidth} mm shell` : "", hint: "For T47, inboard vs outboard must match the BB you buy." },
    { g: "Drivetrain", k: "crank", label: "Crankset & spindle", free: true, ph: "e.g. SRAM Force DUB / Shimano GRX 24 mm" },
    { g: "Drivetrain", k: "rings", label: "Exact chainrings", free: true, must: true, ph: "e.g. 40T (room for 44T), or 50/37T", hint: "Sets chainring-to-chainstay clearance and the front-derailleur mount height.", from: d => d.geometry.chainring ? `Your design: ${d.geometry.chainring}T` : "" },
    { g: "Drivetrain", k: "fd", label: "Front derailleur", opts: ["None (1×)", "Braze-on mount"] },
    { g: "Drivetrain", k: "shifting", label: "Shifting", opts: ["Wireless (brake hoses only)", "Electronic, wired", "Mechanical cables", "Singlespeed"] },
    { g: "Rear end", k: "axle", label: "Rear axle", opts: ["12 × 142 thru-axle", "12 × 148 Boost thru-axle", "12 × 157 Super Boost", "135 mm quick release", "Sliding / rocker dropouts (singlespeed)", ASK] },
    { g: "Rear end", k: "hanger", label: "Derailleur hanger", opts: ["UDH (SRAM universal hanger)", "Standard replaceable hanger", "None (singlespeed)"] },
    { g: "Rear end", k: "tyre", label: "Biggest tyre", free: true, must: true, ph: "e.g. 700C × 50 mm", from: d => d.geometry.tireWidth ? `Your design: ${d.geometry.tireWidth} mm` : "", hint: "Big tyres with short chainstays may need a yoke." },
    { g: "Rear end", k: "yoke", label: "Chainstay yoke", opts: ["No yoke", "Standard plate yoke", "3D-printed yoke (about $100; allows shorter stays; check chainring clearance)", ASK], from: d => d.geometry.csYokeLength > 0 ? `Your design has a ${d.geometry.csYokeLength} mm yoke` : "" },
    { g: "Rear end", k: "brake", label: "Brakes & rotors", opts: ["Flat mount, 140 rear / 160 front", "Flat mount, 160 rear / 160 front", "Flat mount, 160 rear / 180 front", "Post mount (MTB)", "Post mount on sliding dropout", "Rim brakes"],
      from: d => `Your design: ${({ slider: "post mount on the slider", chainstay: "chainstay mount", seatstay: "seat stay mount" })[d.geometry.brakeMount] || d.geometry.brakeMount || "?"}, ${d.geometry.rearRotor || "?"} mm rear rotor`, hint: "A carbon fork wants 160 mm minimum up front." },
    { g: "Cables & seatpost", k: "routing", label: "Cable routing", must: true, opts: ["External", "Internal through frame ports", "Fully internal through the headset", "Dropper only internal"], hint: "Say which line exits where (e.g. rear brake out of the chainstay)." },
    { g: "Cables & seatpost", k: "dropper", label: "Dropper post", opts: ["None", "Internal routing (stealth)", "External routing"] },
    { g: "Cables & seatpost", k: "post", label: "Seatpost diameter", opts: ["27.2 mm", "30.9 mm", "31.6 mm", "34.9 mm"], from: d => d.tubes && d.tubes.seatpost ? `Your design: ${d.tubes.seatpost.od} mm post` : "" },
    { g: "Mounts", k: "bottles", label: "Bottle cage bolts", free: true, ph: "e.g. 2 in the main triangle + 1 under the down tube", hint: "The builder asks for a marked-up picture of where." },
    { g: "Mounts", k: "rack", label: "Rack & fender mounts", opts: ["None", "Rack", "Fenders", "Rack + fenders"] },
    { g: "Mounts", k: "mounts", label: "Other mounts", free: true, ph: "e.g. top-tube bag bolts, fork cargo mounts, none" },
    { g: "Finish", k: "finish", label: "Finish", opts: ["Brushed", "Bead blasted", "Brushed + blasted (send a reference picture)", "Polished", "Painted / Cerakote"], hint: "They send a proof of where two finishes meet." },
    { g: "Finish", k: "logos", label: "Logos & engraving", opts: ["None", "Builder's logo", "Head-tube engraving from my own image (about $80)", "My own decals (describe)"] },
    { g: "Finish", k: "notes", label: "Anything else", free: true, area: true, ph: "Ti bottle cages, special requests, deadline…", full: true }
  ];
  const isAsk = v => /^Ask|\(ask\)/i.test(v || "");
  function specProgress(id) {
    const s = P(id).spec, need = SPEC.filter(f => f.k !== "notes");
    const filled = need.filter(f => s[f.k] && !isAsk(s[f.k])).length, ask = need.filter(f => isAsk(s[f.k])).length;
    const mustMissing = SPEC.filter(f => f.must && !s[f.k]);
    return { filled, ask, total: need.length, mustMissing };
  }
  function openSpec() {
    const w = makeWin("w-spec", "Spec sheet", "mid", "The choices the builder needs besides the geometry. Pick what you know; “Ask my builder” is fine. These go into your request message and the build summary.");
    const s = P().spec, d = A().design();
    const groups = [...new Set(SPEC.map(f => f.g))];
    w.body.innerHTML = `<p class="hint" style="margin:0"><b class="need">●</b> = The builder needs this answered before they can draw the frame.</p>` + groups.map(g => `<div class="sub-h">${esc(g)}</div><div class="spec">${SPEC.filter(f => f.g === g).map(f => {
      const from = f.from ? f.from(d) : "", v = s[f.k] || "";
      const ctl = f.free ? (f.area ? `<textarea data-k="${f.k}" rows="3" placeholder="${esc(f.ph || "")}">${esc(v)}</textarea>` : `<input type="text" data-k="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph || "")}">`)
        : `<select data-k="${f.k}"><option value="">— not decided —</option>${f.opts.map(o => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}${v && !f.opts.includes(v) ? `<option selected>${esc(v)}</option>` : ""}</select>`;
      return `<label class="${f.full ? "full" : ""}"><span>${esc(f.label)}${f.must ? ` <b class="need" title="The builder needs this">●</b>` : ""}</span>${ctl}${from || f.hint ? `<small>${esc([from, f.hint].filter(Boolean).join(" · "))}</small>` : ""}</label>`;
    }).join("")}</div>`).join("");
    w.foot.hidden = false;
    w.foot.innerHTML = `<span class="hint" id="specProg"></span><span style="flex:1"></span><button type="button" data-close class="primary">Done</button>`;
    const prog = () => { const p = specProgress(); w.foot.querySelector("#specProg").textContent = `${p.filled} of ${p.total} decided${p.ask ? ` · ${p.ask} to ask your builder` : ""}`; };
    w.body.querySelectorAll("[data-k]").forEach(el => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => { P().spec[el.dataset.k] = el.value; save(); prog(); }));
    prog(); open("w-spec");
  }

  // ---------------------------------------------------------------- stepper
  function stepStatus() {
    const p = P(), cp = checkProgress(), r = latestRound(), st = r ? roundStats(r) : null;
    const after = AFTER.filter(x => p.after && p.after[x.k]).length;
    return {
      start: { done: !isPreset() || hasProject(pid()) && p.journal.length > 0, small: isPreset() ? "pick a bike" : "bike chosen" },
      design: { done: p.designDone, small: p.designDone ? "ready" : A() && A().isEdited() ? "unsaved edits" : "shape it" },
      check: { done: cp.all, small: `${cp.done}/${cp.total} checked` },
      builder: { done: !!p.final.approved || !!p.process.approve, small: r ? `R${r.n}${st && !st.none ? (st.ch || st.ask ? ` · ${st.ch + st.ask} to send` : st.undecided ? ` · ${st.undecided} to look at` : " · settled") : " · to check"}` : p.process.request ? "request sent" : "not sent yet" },
      final: { done: !!p.final.approved, small: p.after && p.after.arrived ? "frame arrived 🎉" : p.final.approved ? (after ? AFTER.filter(x => p.after[x.k]).slice(-1)[0].t.split(" (")[0].toLowerCase() : "approved") : "sign off" }
    };
  }
  function renderStepper() {
    if (!A()) return;
    const st = stepStatus();
    document.querySelectorAll("#stepper [data-stage]").forEach(b => {
      const k = b.dataset.stage;
      b.setAttribute("aria-current", k === currentStage ? "step" : "false");
      b.classList.toggle("done", !!st[k].done && k !== currentStage);
      const sm = b.querySelector("small"); if (sm) sm.textContent = st[k].small;
    });
  }

  // ---------------------------------------------------------------- 1 · START
  function renderStart() {
    const a = A(), list = a.allDesigns(), mine = list.filter(d => !d.preset && !d.garage).slice(-6).reverse(), cur = a.find(curId()), nGarage = list.filter(d => d.garage).length;
    $("#startBody").innerHTML = `
      <div class="sh"><span class="eyebrow">Step 1 of 5</span><h2>Let's get your custom frame started</h2>
        <p>Cyclic Labs takes you from “I'd like a custom titanium bike” to a drawing you're happy to approve: shape the bike, check it, send it to your builder, compare their drawings with what you asked for, and sign off. Everything stays on this computer.</p></div>
      <div class="road">${[["1", "Start", "Pick a starting point"], ["2", "Design", "Shape it in 3D"], ["3", "Check", "Fit, clearances, strength, spec sheet"], ["4", "Builder", "Request, drawings, revisions"], ["5", "Final", "Sign off and keep a summary"]]
        .map(([n, b, s]) => `<div><span class="n">${n}</span><b>${b}</b><span>${s}</span></div>`).join("")}</div>
      <div class="jsec"><h3>How do you want to start?</h3>
        <div class="jcards">
          <button type="button" class="jcard hero" data-act="discover"><span class="ic">🧭</span><b>Help me figure out what I want</b><span class="s">New to this, or not sure yet? Answer four quick questions (where you ride, how it should feel, your height) and get a suggested kind of bike, wheel size and frame size, with the reasons in plain words.</span></button>
          <button type="button" class="jcard" data-act="size"><span class="ic">📏</span><b>Start from a typical size</b><span class="s">Road, gravel or mountain; pick the wheels and S–XL. Change any number later.</span></button>
          <button type="button" class="jcard" data-act="fit"><span class="ic">🎯</span><b>Start from my bike fit</b><span class="s">Had a Retül (or other) bike fit? Upload the PDF report: your saddle and handlebar position become the new frame's geometry.</span></button>
          <button type="button" class="jcard" data-act="copy"><span class="ic">📋</span><b>Copy a bike I like</b><span class="s">Paste the geometry chart from a brand's website, then make it yours.</span></button>
          <button type="button" class="jcard" data-act="numbers"><span class="ic">⌨️</span><b>I know my numbers</b><span class="s">Type in reach, stack and angles, or load a BikeCAD (.bcad) file.</span></button>
          <button type="button" class="jcard" data-act="scan"><span class="ic">📄</span><b>I already have a builder's drawing</b><span class="s">Scan the PDF or a photo of it into a design, then check it.</span></button>
          ${window.FrameDrawMatch ? `<button type="button" class="jcard" data-act="drawmatch"><span class="ic">✍️</span><b>Type the numbers off a frame drawing</b><span class="s">Each number as the builder prints it, with a numbered picture. The drawing's own totals (wheelbase, front centre, top tube) are cross-checked so typos and drawing mistakes stand out.</span></button>` : ""}
          ${window.FrameGarage ? `<button type="button" class="jcard" data-act="garage"><span class="ic">🏠</span><b>Start from a bike I own</b><span class="s">${nGarage ? `Your garage has ${nGarage} bike${nGarage === 1 ? "" : "s"}. Start a new design from one, or keep it beside your design to compare.` : "Put the bikes you ride in your garage once (from their geometry charts), then design against the one you know best."}</span></button>` : ""}
        </div></div>
      <div class="jsec"><h3>Continue${mine.length ? "" : " <small>your saved bikes will show here</small>"}</h3>
        <div class="jcards">
          ${cur ? `<button type="button" class="jcard" data-open="${esc(cur.id)}"><span class="ic">${cur.garage ? "🏠" : "▶"}</span><b>${esc(cur.name)}</b><span class="s">Open now${cur.preset ? " (built-in example)" : cur.garage ? " (a bike in your garage)" : ` · ${esc(stepNameFor(cur.id))}`}</span></button>` : ""}
          ${mine.filter(d => !cur || d.id !== cur.id).map(d => `<button type="button" class="jcard" data-open="${esc(d.id)}"><b>${esc(d.name)}</b><span class="s">${esc(stepNameFor(d.id))}</span></button>`).join("")}
          <button type="button" class="jcard" data-act="import"><span class="ic">📥</span><b>Open a file</b><span class="s">A Cyclic Labs file someone sent you (it brings its checklist${jOn() ? " and journal" : ""} too), or a BikeCAD file.</span></button>
          <button type="button" class="jcard" data-act="bikes"><span class="ic">🚲</span><b>All bikes &amp; examples</b><span class="s">Built-in examples and everything saved in this browser. Delete old bikes here too.</span></button>
        </div></div>
      <div class="jsec"><h3>Good to know first</h3>
        <div class="jcards">
          <button type="button" class="jcard" data-learn="geo"><b>Geometry in plain words</b><span class="s">Reach, stack, trail, BB drop and the rest: what each one changes in how the bike feels.</span></button>
          ${jOn() ? `<button type="button" class="jcard" data-act="journal"><b>Your build journal</b><span class="s">A dated log of every step and your own notes, for each bike.</span></button>` : ""}
        </div></div>`;
    bindActs($("#startBody"));
  }
  function stepNameFor(id) {
    const p = store.projects[id]; if (!p) return "not started";
    const last = jOn() ? (p.journal || []).filter(j => j.kind !== "auto").slice(-1)[0] : null;
    const at = p.after && p.after.arrived ? "frame arrived 🎉" : p.final && p.final.approved ? "approved ✓" : `at step: ${STAGE_NAME[p.stage] || "Design"}`;
    return at + (last ? ` · last: ${fmtDate(last.at)}, ${last.text.length > 70 ? last.text.slice(0, 68) + "…" : last.text}` : "");
  }
  function bindActs(root) {
    root.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act, b));
    root.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { A().openDesign(b.dataset.open); go(P().stage && P().stage !== "start" ? P().stage : "design"); });
    root.querySelectorAll("[data-learn]").forEach(b => b.onclick = () => learn(b.dataset.learn));
    root.querySelectorAll("[data-win]").forEach(b => { if (!b.classList.contains("box")) b.onclick = () => open(b.dataset.win); });
    root.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  }
  function act(k) {
    const NB = window.FrameNewBike;
    switch (k) {
      case "discover": return discover();
      case "size": return NB.open({ step: "type", source: "size" });
      case "copy": return NB.open({ step: "type", source: "chart" });
      case "fit": return NB.open({ step: "type", source: "fit" });
      case "numbers": return NB.open({ step: "type", source: "type" });
      case "scan": return window.FrameScanUI.open();
      case "drawmatch": return window.FrameDrawMatch && FrameDrawMatch.open();
      case "import": return $("#btnImport").click();
      case "bikes": return open("w-bikes");
      case "journal": return open("w-journal");
      case "garage": return go("garage");
      case "spec": return openSpec();
      case "overlay": go("design"); setTimeout(() => { const a = A(); if (!a.isReal()) a.setReal(true); setTimeout(() => { const b = document.getElementById("btnOverlay"); if (b && b.getAttribute("aria-pressed") !== "true") b.click(); }, 400); }, 50); return;
      case "eng": A().setUiMode("eng"); renderStage(currentStage); return;
      case "request": return openRequest();
      case "scanRound": return addRound(true);
      case "typeRound": return addRound(false);
      case "summary": return openSummary();
      case "tour": return window.FrameTour && FrameTour.menu();
    }
  }

  // ---------------------------------------------------------------- "help me figure out what I want"
  const RIDE = [
    ["road", "Paved roads", "Fast group rides, long road days."],
    ["allroad", "Roads + some gravel", "Mostly tarmac, happy on a dirt road too."],
    ["gravel", "Gravel & dirt roads", "Back roads, forest tracks, bikepacking."],
    ["trail", "Singletrack trails", "Mountain-bike trails: roots, rocks, climbs."],
    ["rough", "Steep, rough trails & jumps", "Hard riding, drops, bike parks."]
  ];
  const FEEL = [
    ["fast", "Fast & sporty", "Lower, stretched out, quick to respond."],
    ["comfy", "Comfortable all day", "More upright, smooth over bumps."],
    ["stable", "Calm & confident", "Steady at speed and on rough ground."],
    ["playful", "Playful & lively", "Easy to flick around and pop off things."]
  ];
  let DQ = null;
  function discover() {
    DQ = DQ || { step: 0, ride: null, feel: null, cm: "", ft: "", inch: "", unit: "cm", kg: "", fits: null };
    const w = makeWin("w-discover", "Help me figure out what I want", "mid", "Four quick questions. Nothing is final: you can change everything afterwards.");
    renderDiscover(w); open("w-discover");
  }
  function heightCm() { if (DQ.unit === "cm") return +DQ.cm || 0; const f = +DQ.ft || 0, i = +DQ.inch || 0; return f || i ? Math.round((f * 12 + i) * 2.54) : 0; }
  function recommend() {
    const h = heightCm() || 175, T = window.FrameTemplates;
    let type, wheel, tyre = null, why = [];
    switch (DQ.ride) {
      case "road": type = "road"; wheel = h < 160 ? "650b" : "700c"; why.push("Paved roads → a road bike: drop bars, a rigid fork and skinny fast tyres."); break;
      case "allroad": type = "gravel"; wheel = h < 160 ? "650b" : "700c"; tyre = h < 160 ? 50 : 40; why.push("Mostly roads with some dirt → a gravel bike on 40 mm tyres: nearly as quick as a road bike, but with room for bumpy surfaces."); break;
      case "gravel": type = "gravel"; wheel = h < 165 ? "650b" : "700c"; tyre = h < 165 ? 50 : DQ.feel === "comfy" || DQ.feel === "stable" ? 45 : 40; why.push("Gravel and dirt roads → a gravel bike: drop bars, wide tyres and a stable, comfortable shape."); break;
      case "trail": type = "mtb"; wheel = h < 160 ? "27.5" : DQ.feel === "playful" ? "mullet" : "29"; why.push("Singletrack → a hardtail mountain bike: suspension fork, wide bars, big tyres."); break;
      default: type = "mtb"; wheel = h < 160 ? "27.5" : DQ.feel === "playful" || DQ.feel === "stable" ? "mullet" : "29"; why.push("Steep, rough riding → a tough hardtail with a longer fork; the strength checks will use harder riding.");
    }
    if (wheel === "650b" || wheel === "27.5") why.push(`Smaller wheels (${wheel === "27.5" ? "27.5 in" : "650b"}) suit your height: they keep the toe clear of the front tyre and the frame in proportion.`);
    else if (wheel === "mullet") why.push("29\" front, 27.5\" rear (a “mullet”): the big front wheel rolls over things, the small rear one gives more room behind you on steep ground and feels livelier.");
    else if (type === "mtb") why.push("29\" wheels: the usual choice for a hardtail; they roll over roots and rocks easily.");
    const size = h < 170 ? "S" : h < 178 ? "M" : h < 186 ? "L" : "XL";
    why.push(`Size ${size} is the usual size for about ${heightCm() ? h + " cm" : "your height"} (S under 170, M 170–178, L 178–186, XL over 186 cm). The fit is fine-tuned with reach and stack later.`);
    const feelWhy = { fast: "For a fast, sporty feel, look at a slightly longer reach and lower stack once it's built (Design → Geometry).", comfy: "For all-day comfort, a taller stack (or more spacers) and wider tyres help; step 3 shows a comfort rating.", stable: "For a calm feel, a slacker head angle, longer wheelbase and more trail help; the Geometry window shows trail as you change it.", playful: "For a lively feel, shorter chainstays and a shorter wheelbase help, as long as the tyre still clears (step 3 checks it)." }[DQ.feel];
    if (feelWhy) why.push(feelWhy);
    const cond = { road: 1, allroad: 2, gravel: 2, trail: 3, rough: 4 }[DQ.ride];
    if (!tyre) tyre = (T.tyreOptions(type, wheel) || {}).typical || null;
    const wl = (T.TYPES[type].wheels[wheel] || {}).label || wheel;
    return { type, wheel, tyre, size, why, cond, typeLabel: T.TYPES[type].label, wheelLabel: tyre ? `${wl}, tyres up to ${T.tyreLabel(type, tyre, wheel)}` : wl };
  }
  function renderDiscover(w) {
    const pickRow = (list, key) => `<div class="pickgrid">${list.map(([k, b, s]) => `<button type="button" class="pick" data-${key}="${k}" aria-pressed="${DQ[key] === k}"><b>${esc(b)}</b><small>${esc(s)}</small></button>`).join("")}</div>`;
    const steps = ["Where you ride", "How it should feel", "About you", "Your current bike", "Suggestion"];
    const head = `<div class="nb-steps" style="margin-bottom:6px">${steps.map((s, i) => `<span class="${i === DQ.step ? "on" : i < DQ.step ? "done" : ""}">${i + 1}. ${s}</span>`).join("")}</div>`;
    let body = "", foot = "";
    if (DQ.step === 0) { body = `<h3>Where will you ride it most?</h3>${pickRow(RIDE, "ride")}`; }
    else if (DQ.step === 1) { body = `<h3>What should it feel like?</h3>${pickRow(FEEL, "feel")}`; }
    else if (DQ.step === 2) {
      body = `<h3>About you</h3><p class="hint">Height picks a starting size. Weight is used for the strength checks (optional).</p>
        <div class="spec" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
          <label><span>Height</span><span style="display:flex;gap:6px;align-items:center">${DQ.unit === "cm" ? `<input type="number" id="dqCm" value="${esc(DQ.cm)}" placeholder="175" style="width:90px"> cm` : `<input type="number" id="dqFt" value="${esc(DQ.ft)}" placeholder="5" style="width:60px"> ft <input type="number" id="dqIn" value="${esc(DQ.inch)}" placeholder="9" style="width:60px"> in`}
            <button type="button" id="dqUnit">${DQ.unit === "cm" ? "use ft/in" : "use cm"}</button></span></label>
          <label><span>Weight with riding kit <small>(optional)</small></span><span style="display:flex;gap:6px;align-items:center"><input type="number" id="dqKg" value="${esc(DQ.kg)}" placeholder="${DQ.unit === "cm" ? "75" : "165"}" style="width:90px"> ${DQ.unit === "cm" ? "kg" : "lb"}</span></label>
        </div>`;
    } else if (DQ.step === 3) {
      body = `<h3>Do you have a bike that fits you well now?</h3>${pickRow([["chart", "Yes, and I can find its geometry", "Copy its geometry chart from the brand's website and start from that."], ["yes", "Yes, but I don't know its numbers", "Start from the suggestion; later you can overlay it in 3D if you find its chart."], ["no", "No / not really", "Start from the suggested size and adjust."]], "fits")}`;
    } else {
      const r = recommend();
      body = `<h3>Here's a good place to start</h3>
        <div class="rec"><div><div class="k">Kind of bike</div><div class="v">${esc(r.typeLabel)}</div></div><div><div class="k">Wheels</div><div class="v" style="font-size:18px">${esc(r.wheelLabel)}</div></div><div><div class="k">Size</div><div class="v">${r.size}</div></div></div>
        <ul class="nb-list">${r.why.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
        <p class="callout">This only sets the starting point. Every number can be changed in step 2, and step 3 checks the fit, tyre room and toe overlap for you.</p>`;
      foot = `<button type="button" data-dq="back">Back</button><span style="flex:1"></span>${DQ.fits === "chart" ? `<button type="button" data-dq="copy">Copy my bike's chart instead</button>` : ""}<button type="button" class="primary" data-dq="build">Build this starting bike</button>`;
    }
    const canNext = DQ.step === 0 ? !!DQ.ride : DQ.step === 1 ? !!DQ.feel : DQ.step === 3 ? !!DQ.fits : true;
    if (!foot) foot = `${DQ.step ? `<button type="button" data-dq="back">Back</button>` : ""}<span style="flex:1"></span><button type="button" class="primary" data-dq="next" ${canNext ? "" : "disabled"}>Next</button>`;
    w.body.innerHTML = head + body; w.foot.hidden = false; w.foot.innerHTML = foot;
    const rer = () => renderDiscover(w);
    w.body.querySelectorAll("[data-ride]").forEach(b => b.onclick = () => { DQ.ride = b.dataset.ride; DQ.step = 1; rer(); });
    w.body.querySelectorAll("[data-feel]").forEach(b => b.onclick = () => { DQ.feel = b.dataset.feel; DQ.step = 2; rer(); });
    w.body.querySelectorAll("[data-fits]").forEach(b => b.onclick = () => { DQ.fits = b.dataset.fits; DQ.step = 4; rer(); });
    const bind = (id, k) => { const el = w.body.querySelector(id); if (el) el.oninput = () => DQ[k] = el.value; };
    bind("#dqCm", "cm"); bind("#dqFt", "ft"); bind("#dqIn", "inch"); bind("#dqKg", "kg");
    const u = w.body.querySelector("#dqUnit"); if (u) u.onclick = () => { const h = heightCm(); DQ.unit = DQ.unit === "cm" ? "imp" : "cm"; if (h) { if (DQ.unit === "cm") DQ.cm = String(h); else { const t = h / 2.54; DQ.ft = String(Math.floor(t / 12)); DQ.inch = String(Math.round(t % 12)); } } rer(); };
    w.foot.querySelectorAll("[data-dq]").forEach(b => b.onclick = () => {
      const k = b.dataset.dq;
      if (k === "back") { DQ.step = Math.max(0, DQ.step - 1); rer(); }
      else if (k === "next") { DQ.step++; rer(); }
      else {
        const r = recommend(), kg = +DQ.kg ? (DQ.unit === "cm" ? +DQ.kg : +DQ.kg * 0.4536) : null;
        close("w-discover");
        const opts = { type: r.type, wheel: r.wheel, tyre: r.tyre, size: r.size, condition: r.cond, kg, discovered: `${r.typeLabel}, ${r.wheelLabel}, size ${r.size}` };
        if (k === "copy") window.FrameNewBike.open(Object.assign(opts, { step: "chart", source: "chart" }));
        else window.FrameNewBike.open(Object.assign(opts, { step: "you", source: "size" }));
      }
    });
  }

  // ---------------------------------------------------------------- explainers
  function learn(k) {
    const det = document.getElementById("helpMenu"); if (det) det.open = false;
    const w = makeWin("w-learn-geo", "Geometry in plain words", "mid", "The numbers on a frame drawing, and what changing each one does to the ride.");
    w.body.innerHTML = `<div class="gloss">${GLOSS.map(([t, d]) => `<div><b>${esc(t)}</b>${esc(d)}</div>`).join("")}</div>
      <p class="callout">The easiest way to learn: open a bike in step 2, change one number and watch the 3D bike and the headline numbers (wheelbase, trail, BB height) change.</p>`;
    w.foot.hidden = true; open("w-learn-geo");
  }
  // The usual custom-frame order, from two complete customer email threads (2024 road, 2025 gravel). Before approval the
  // steps live in step 4 (Builder); after approval in step 5 (Final). Each tick is dated and goes into the journal.
  const PROCESS = [
    { k: "request", t: "Send your request: everything in one email", long: "Geometry, rider weight, use, and every option (head tube, fork, BB, chainrings, routing, mounts, finish). The builder asks to have it all in one mail because the designers are busy and drawings are queued.", fb: "Spec sheet + “Write my request”" },
    { k: "quote", t: "Questions, quote, then a 50% deposit", long: "The sales rep asks about anything missing, then quotes. You pay half up front by PayPal (Goods & Services; about 4.75% fee added). The invoice follows.", fb: "Questions list, journal" },
    { k: "r1", t: "First drawing (about 3–4 days after the deposit)", long: "A CAD drawing with every number and the tube list.", fb: "Scan it as round R1 + drawing checklist" },
    { k: "revise", t: "Revisions until it's right", long: "Send all your comments in one reply; they send a revised drawing.", fb: "Drawing checklist → change request" },
    { k: "approve", t: "Confirm the final drawing", long: "Production starts and changes are refused after this (“too late to change now”). Read every number again before you say yes.", fb: "Step 5 sign-off" }
  ];
  const AFTER = [
    { k: "build", t: "Production (quoted ~5 weeks; real orders took 6.5–7)", long: "Longer around Chinese holidays.", fb: "" },
    { k: "proof", t: "Finish proof", long: "A photo or mock-up of where brushed and blasted finishes meet, and the head-tube logo, for you to approve.", fb: "" },
    { k: "photos", t: "Finished-frame photos, then the balance", long: "Check the photos (welds, finish, mounts) before you pay the other 50% and send your address and phone number. Ask what's included (axles, hanger, clamp, headset).", fb: "" },
    { k: "ship", t: "Shipped", long: "FedEx or UPS through a shipping agent; tracking can take 1–6 days to appear.", fb: "" },
    { k: "arrived", t: "Frame arrived", long: "Check it against the approved drawing, then build it up.", fb: "" }
  ];
  const GLOSS = [
    ["Reach", "Straight forward from the bottom bracket to the top of the head tube. Longer = more stretched out and more stable."],
    ["Stack", "Straight up from the bottom bracket to the top of the head tube. Higher = more upright and more comfortable for your back."],
    ["Head angle", "How steep the fork is. Slacker (lower number) = calmer on steep, rough ground; steeper = quicker steering."],
    ["Seat angle", "How steep the seat tube is. Steeper puts you over the pedals, which helps climbing."],
    ["Trail", "Worked out from head angle, wheel size and fork offset. More trail = steadier steering, less = quicker."],
    ["Chainstay", "Bottom bracket to rear axle. Shorter = livelier and easier to lift the front; longer = more stable, more tyre room."],
    ["Wheelbase", "Axle to axle. Longer = calmer at speed; shorter = nimbler in tight turns."],
    ["BB drop / BB height", "How low the cranks sit. Lower = planted and stable; higher = fewer pedal strikes on rocks."],
    ["Fork axle-to-crown & offset", "Your fork's length and how far forward the axle sits. They come from the fork maker's chart and change trail and stack."],
    ["Head tube length", "Taller lifts the bars without a pile of spacers."],
    ["Toe overlap", "When your shoe can touch the front tyre while turning slowly. Common on small road and gravel bikes; step 3 checks it."],
    ["Tube diameter & wall", "Bigger and thicker = stiffer and stronger but heavier and harsher. The builder's drawing lists each as Ø × wall (e.g. Ø44.5 × 1.0)."]
  ];

  // ---------------------------------------------------------------- 2 · DESIGN
  const BOXES = [
    ["Shape", [
      ["w-geometry", "Geometry", d => `reach ${d.geometry.reach} · stack ${d.geometry.stack} · HA ${d.geometry.headAngle}°`],
      ["w-wheels", "Wheels, joints & drivetrain", d => `${d.geometry.tireWidth || "?"} mm tyres · ${d.geometry.chainring || "?"}T ring · ${d.geometry.crankLength || "?"} cranks`],
      ["w-stays", "Stays & tyre room", d => `${({ straight: "straight", curved: "bent", wishbone: "wishbone" })[d.geometry.ssShape] || d.geometry.ssShape || "?"} seat stays · ${d.geometry.csYokeLength > 0 ? "yoke" : "no yoke"}`],
      ["w-bends", "Bent tubes", d => bendSummary(d)],
      ["w-tubes", "Tubes", d => `down tube Ø${d.tubes.downTube.od}×${d.tubes.downTube.wall} · top Ø${d.tubes.topTube.od}`],
      ["w-sag", "Fork sag (riding geometry)", d => sagSummary(d)],
      ["w-bottles", "Bottles & cages", d => bottleSummary(d)],
      ["@fit32", "Match my 29er fit", () => "copy the fit of a bike you ride now", false, d => !!(window.FrameFit32 && FrameFit32.is32(d))],
      ["w-post", "Seatpost, saddle & tyres", d => { const p = window.FrameFEA && FrameFEA.SEATPOSTS && FrameFEA.SEATPOSTS[d.tubes.seatpost.type]; return p ? p.label : `Ø${d.tubes.seatpost.od} post`; }]
    ]],
    ["Look", [
      ["w-parts", "Parts & paint", () => "fork, wheels, cockpit, finish"],
      ["@overlay", "Overlay another bike", () => "see your current bike over this one"]
    ]],
    ["Riding (engineering)", [
      ["w-riding", "How it gets ridden", d => { const c = window.FrameFEA && FrameFEA.CONDITIONS[d.use.condition]; return c ? c.short || c.name : "terrain, style, power"; }, true],
      ["w-rider", "Rider, loads & material", d => `${d.rider.riderKg} kg rider`, true]
    ]],
    ["Your bike", [
      ["w-bikes", "Open, save, export", () => "switch bikes, save a copy, send a file"],
      ["@chat", "Type a change", () => "“make the reach 460”, “undo”"],
      ["@journal", "Build journal", () => { const l = P().journal.slice(-1)[0]; return l ? `last: ${l.text}` : "notes, messages, photos"; }]
    ]]
  ];
  function sagSummary(d) {
    const u = d.use || {}, tr = +u.forkTravel || 0; if (tr < 1) return "rigid fork: no sag";
    const p = isFinite(+u.forkSag) && u.forkSag !== "" ? +u.forkSag : 25;
    let c = null; try { c = window.FrameSag && FrameSag.compute(d, p); } catch (e) {}
    return `${p} % of ${tr} mm` + (c && c.ok ? ` · HA ${c.headAngle.toFixed(1)}° · BB ${Math.round(c.bbHeight)}` : "");
  }
  function bottleSummary(d) {
    const g = d.geometry, B = window.FrameBottles; if (!(+g.dtBoss > 0) && !(+g.stBoss > 0)) return "bosses not placed yet";
    let r = null; try { r = B && B.analyse(d); } catch (e) {}
    const name = k => (B && B.BOTTLES[g[k]] ? B.BOTTLES[g[k]].name.replace(/ \(.*\)$/, "") : "bottle");
    const parts = []; if (+g.dtBoss > 0) parts.push(`DT ${g.dtBoss}: ${name("dtBottle")}`); if (+g.stBoss > 0) parts.push(`ST ${g.stBoss}`);
    return parts.join(" · ") + (r && r.rows.length ? (r.ok ? " · fits" : " · doesn't fit") : "");
  }
  function bendSummary(d) {
    const g = d.geometry, out = [];
    if (+g.stBendOffset > 0) out.push("seat tube");
    if (Math.abs(+g.dtBendAngle || 0) > 0) out.push("down tube");
    if (g.ssBendStyle && g.ssBendStyle !== "none") out.push("seat stays");
    if (g.csBendStyle && g.csBendStyle !== "none") out.push("chainstays");
    return out.length ? "bent: " + out.join(", ") : "all straight (seat tube, down tube, stays)";
  }
  function renderDesign() {
    const a = A(), d = a.design(), eng = a.uiMode() === "eng";
    $("#designHead").innerHTML = `<span class="eyebrow">Step 2 of 5 · Shape your bike</span><span class="hint">Drag the bike to turn it. Pick a box to change that part: it opens beside the bike so you can watch it change.</span>`
      + (window.FrameGarage ? FrameGarage.designBanner(curId()) : "");
    if (window.FrameGarage) FrameGarage.bindBanner($("#designHead"));
    $("#designBoxes").innerHTML = BOXES.map(([g, items]) => {
      const vis = items.filter(it => (!it[3] || eng) && (it[0] !== "@journal" || jOn()) && (!it[4] || it[4](d))); if (!vis.length) return "";
      return `<div class="grp">${esc(g)}</div>` + vis.map(([id, t, sum]) => { let s = ""; try { s = sum(d); } catch (e) {}
        return `<button type="button" class="box" ${id[0] === "@" ? `data-do="${id.slice(1)}"` : `data-win="${id}" aria-expanded="${winOpen(id)}"`}><b>${esc(t)}</b><span class="s">${esc(s)}</span><span class="go">›</span></button>`; }).join("");
    }).join("") + (eng ? "" : `<p class="hint" style="margin:6px 2px 0">Riding and load settings for the strength checks are under Help → Engineering results.</p>`);
    $("#designBoxes").querySelectorAll("[data-win]").forEach(b => b.onclick = () => winOpen(b.dataset.win) ? close(b.dataset.win) : open(b.dataset.win));
    $("#designBoxes").querySelectorAll("[data-do]").forEach(b => b.onclick = () => { if (b.dataset.do === "chat") $("#btnChat").click(); else if (b.dataset.do === "journal") open("w-journal"); else if (b.dataset.do === "fit32") window.FrameFit32 && FrameFit32.open(); else act(b.dataset.do); });
    const p = P();
    $("#designFoot").innerHTML = `<button type="button" data-go="start">← Start</button>
      <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${a.isEdited() ? `<span class="hint">You have unsaved changes.</span><button type="button" data-save>${isPreset() ? "Save as my bike" : "Save changes"}</button>` : ""}
      <button type="button" class="primary nextbtn" data-next>${p.designDone ? "Go to the checks →" : "Looks right, check it →"}</button></span>`;
    bindActs($("#designFoot"));
    const sv = $("#designFoot [data-save]"); if (sv) sv.onclick = () => a.quickSave();
    $("#designFoot [data-next]").onclick = () => { if (!p.designDone) { p.designDone = true; log("✏️ Design ready: on to the checks", "milestone"); } go("check"); };
  }

  // ---------------------------------------------------------------- 3 · CHECK
  function citem(it, p, extra) {
    const st = it.st || ["", ""];
    return `<div class="citem${p.reviewed[it.key] ? " ticked" : ""}">
      <input type="checkbox" data-rev="${it.key}" ${p.reviewed[it.key] ? "checked" : ""} aria-label="Reviewed: ${esc(it.title)}">
      <div class="tx"><b>${esc(it.title)}</b><span>${esc(it.text)}</span></div>
      <div class="act">${st[1] ? `<span class="pill ${st[0]}">${esc(st[1])}</span>` : ""}${it.win ? `<button type="button" data-win="${it.win}">Open</button>` : ""}${extra || ""}</div></div>`;
  }
  function renderCheck() {
    const a = A(), p = P(), ac = autoChecks(), cp = checkProgress(), sp = specProgress();
    const optional = ac.engItems.filter(i => i.optional), mainEng = ac.engItems.filter(i => !i.optional);
    $("#checkBody").innerHTML = `
      <div class="sh"><span class="eyebrow">Step 3 of 5</span><h2>Check everything before you send it</h2>
        <p>Go down the list. Open each check, read it, and tick it once you're happy (or once you've noted a question for your builder). Change the design any time and the checks update.</p></div>
      <div class="progress"><span class="track"><span class="fill" style="width:${(cp.done / cp.total * 100).toFixed(0)}%"></span></span><span>${cp.done} of ${cp.total} checked</span></div>
      <div class="jsec"><h3>Automatic checks <small>worked out from your design</small></h3>
        <div class="clist">${ac.items.map(i => citem(i, p)).join("")}</div></div>
      <div class="jsec"><h3>Strength &amp; engineering <small>${ac.eng ? "estimates from Cyclic Labs' frame model" : "optional"}</small></h3>
        ${ac.eng ? `<div class="engtiles tiles" id="engTiles"></div><div class="clist">${mainEng.map(i => citem(i, p)).join("")}</div>
          <details><summary>More engineering tools (${optional.length})</summary><div class="clist" style="margin-top:8px">${optional.map(i => `<div class="citem"><span></span><div class="tx"><b>${esc(i.title)}</b><span>${esc(i.text)}</span></div><div class="act"><button type="button" data-win="${i.win}">Open</button></div></div>`).join("")}
            <div class="citem"><span></span><div class="tx"><b>How to read these</b><span>What the model does and doesn't include.</span></div><div class="act"><button type="button" data-win="w-howto">Open</button></div></div></div></details>`
        : `<div class="callout">Cyclic Labs can also estimate fatigue life, ISO lab tests and comfort for this frame. They're hidden to keep things simple. <button type="button" data-act="eng" style="margin-left:6px">Show engineering checks</button></div>`}</div>
      <div class="jsec"><h3>Your spec sheet <small>the choices the builder asks about</small></h3>
        <div class="clist"><div class="citem"><span class="pill ${sp.filled === sp.total ? "ok" : sp.filled ? "warn" : ""}" style="justify-self:start">${sp.filled}/${sp.total}</span>
          <div class="tx"><b>BB, headset, axle, brakes, routing, mounts, finish…</b><span>${sp.filled ? Object.entries(p.spec).filter(([k, v]) => v && k !== "notes").slice(0, 4).map(([, v]) => v).join(" · ") + (sp.filled > 4 ? " …" : "") : "Pick what you know; “Ask my builder” is fine for the rest."}</span></div>
          <div class="act"><button type="button" class="primary" data-act="spec">${sp.filled ? "Edit spec sheet" : "Fill in the spec sheet"}</button></div></div></div></div>
      <div class="jsec"><h3>Things only you can confirm</h3>
        <div class="clist">${MANUAL.map(m => citem(m, p, m.act.map(([l, w]) => w[0] === "w" ? `<button type="button" data-win="${w}">${esc(l)}</button>` : `<button type="button" data-act="${w}">${esc(l)}</button>`).join(""))).join("")}</div></div>
      ${jOn() ? `<div class="jsec"><h3>Notes while you check <small>they go into your journal</small></h3>${journalQuick(["note", "photo"], 2)}</div>` : ""}
      <div class="stagefoot" style="margin:0"><button type="button" data-go="design">← Design</button>
        <button type="button" class="primary nextbtn" data-go="builder">${cp.all ? "All checked, on to your builder →" : "On to your builder →"}</button></div>`;
    bindActs($("#checkBody")); bindJournalQuick($("#checkBody"));
    $("#checkBody").querySelectorAll("[data-rev]").forEach(cb => cb.onchange = () => {
      const k = cb.dataset.rev; P().reviewed[k] = cb.checked; save();
      const it = ac.items.concat(ac.engItems, MANUAL).find(x => x.key === k);
      if (cb.checked) log(`Checked: ${it ? it.title : k}${it && it.st && it.st[1] ? ` (${it.st[1]})` : ""}`, "auto");
      if (cb.checked && checkProgress().all) log("✅ Every check ticked", "milestone");
      const pos = window.scrollY; renderCheck(); renderStepper(); window.scrollTo({ top: pos });
    });
    // engineering headline tiles live here now
    try { if (ac.eng && a.result() && a.renderTiles) a.renderTiles(); } catch (e) { console.error(e); }
  }

  // ---------------------------------------------------------------- 4 · BUILDER
  // A drawing round is a design made from the builder's drawing (scanned, or typed in). Its review is the drawing
  // checklist (review.js, keyed by the round's design id): OK / Ask / Change per item, then a change-request email.
  // Edits you make to a round's design are your change requests; the next round is scanned against that design,
  // so "what you asked for" always means the latest request.
  const latestRound = id => { const r = P(id).rounds; return r.length ? r[r.length - 1] : null; };
  const roundOfId = id => { const sp = store.roundOf[id]; return sp ? (P(sp).rounds.find(r => r.id === id) || null) : null; };
  // what the checklist says so far (saved choices; flagged numbers nobody has looked at yet)
  function roundStats(r) {
    const R = window.FrameReview, rev = R && R.load(r.id);
    if (!rev) return { none: true, ch: 0, ask: 0, ok: 0, undecided: 0, model: "" };
    let ch = 0, ask = 0, ok = 0;
    for (const v of Object.values(rev.items || {})) { if (v.state === "change") ch++; else if (v.state === "ask") ask++; else if (v.state === "ok") ok++; }
    let undecided = 0;
    if (rev.drawn) for (const [p, e] of Object.entries(rev.drawn.fields || {})) {
      if (p.startsWith("check.") || e.value == null || e.asked == null) continue;
      if (Math.abs(+e.asked - +e.value) > 0.05 && !(rev.items["num:" + p] && rev.items["num:" + p].state)) undecided++;
    }
    return { none: false, ch, ask, ok, undecided, model: (rev.drawing && rev.drawing.model) || "" };
  }
  function addRound(scan) {
    const a = A(), specId = pid(), p = P(specId), last = latestRound(specId);
    const n = p.rounds.length + 1, baseId = last ? last.id : specId;
    if (isPreset() && specId === curId()) a.toast(`Tip: save your design first (“Save as my bike”) so its ${jOn() ? "journal and " : ""}rounds stay with it.`);
    if (curId() !== baseId) a.openDesign(baseId);       // the scan compares the drawing with what you asked for last
    if (scan) { pendingRound = { specId, n }; window.FrameScanUI.open(); return; }
    pendingRound = { specId, n, typed: true };
    if (window.FrameDrawMatch) {          // type the drawing's numbers in the builder's own terms; "Save as new design" makes the round
      pendingRound.wm = true;
      FrameDrawMatch.open({ base: { id: a.currentId(), name: a.designName(), design: a.design() }, name: `${(a.find(specId) || {}).name || a.designName()} – drawing R${n}`, saveLabel: `Save as drawing R${n}` });
      return;
    }
    a.createDesign(`${(a.find(specId) || {}).name || a.designName()} – drawing R${n}`, `Typed in from the builder's drawing R${n}, ${today()}. Started as a copy of ${last ? "R" + last.n : "my design"}.`, a.design(), true);
  }
  let pendingRound = null;
  function registerRound(specId, id, n, how) {
    const p = P(specId);
    p.rounds.push({ n, id, date: today(), how, replied: null });
    store.roundOf[id] = specId;
    if (!p.process.r1) p.process.r1 = today();
    if (n > 1 && !p.process.revise) p.process.revise = null;
    save();
    log(`📐 Drawing R${n} arrived (${how})`, "milestone", specId);
  }
  function openRoundChecklist(id) {
    const a = A(); if (curId() !== id) a.openDesign(id);
    setTimeout(() => { if (window.FrameReview) FrameReview.open(id); }, 60);
  }
  function renderBuilder() {
    const a = A(), p = P(), rounds = p.rounds, sp = specProgress();
    const stepNow = PROCESS.findIndex(s => !p.process[s.k]);
    const onRound = roundOfId(curId());
    $("#builderBody").innerHTML = `
      <div class="sh"><span class="eyebrow">Step 4 of 5</span><h2>Work it out with your builder</h2>
        <p>Send your request, then go through each drawing your builder sends. Cyclic Labs writes the messages; you paste them into your email.${jOn() ? " Log what they say in your journal so the whole back-and-forth is in one place." : ""}</p></div>
      ${onRound ? `<div class="callout">You're on <b>the builder's drawing R${onRound.n}</b>. To ask for a change, change the number here (step 2 or Chat): the drawing checklist turns it into a change request. <button type="button" data-rcheck="${esc(onRound.id)}" style="margin-left:6px">Drawing checklist</button> <button type="button" data-open="${esc(pid())}">Back to my original design</button></div>` : ""}
      <div class="jsec" style="order:${rounds.length ? 4 : 1}"><h3>Order progress</h3>
        <div class="timeline">${PROCESS.map((s, i) => `<div class="tstep${i === stepNow ? " now" : ""}"><input type="checkbox" data-proc="${s.k}" ${p.process[s.k] ? "checked" : ""} aria-label="${esc(s.t)} done">
          <div class="tx"><b>${esc(s.t)}</b><span>${esc(s.long)}</span></div>
          <span class="btnrow">${s.k === "request" ? `<button type="button" class="${p.process.request ? "" : "primary"}" data-act="request">Write my request</button>` : ""}${s.k === "r1" && !rounds.length ? `<button type="button" data-act="scanRound">Add it</button>` : ""}${s.k === "approve" ? `<button type="button" data-go="final">Final step →</button>` : ""}${p.process[s.k] ? `<span class="hint">${esc(fmtDate(p.process[s.k]))}</span>` : ""}</span></div>`).join("")}</div>
        ${!p.process.request && sp.mustMissing.length ? `<p class="callout warn">Before you send it: the spec sheet still needs ${esc(sp.mustMissing.map(f => f.label.toLowerCase()).join(", "))}. The builder will ask for these anyway, and one complete email gets you a drawing sooner. <button type="button" data-act="spec">Spec sheet</button></p>` : ""}</div>
      <div class="jsec" style="order:2"><h3>Drawing rounds <small>${rounds.length ? `${rounds.length} so far` : "add each drawing your builder sends"}</small></h3>
        <div class="rounds">${rounds.slice().reverse().map(r => { const st = roundStats(r), d = a.find(r.id);
          const summary = !d ? "design deleted" : st.none ? "checklist not started" : `${st.ch} change${st.ch === 1 ? "" : "s"} · ${st.ask} question${st.ask === 1 ? "" : "s"} · ${st.ok} OK${st.undecided ? ` · <b style="color:var(--warn)">${st.undecided} flagged number${st.undecided === 1 ? "" : "s"} to look at</b>` : ""}`;
          return `<div class="round"><span class="rn">R${r.n}</span><div class="tx"><b>${esc(d ? d.name : "Drawing R" + r.n)}</b>
            <span>${esc(fmtDate(r.date))} · ${esc(r.how)}${st.model ? ` · ${esc(st.model)}` : ""} · ${summary}${r.replied ? ` · change request sent ${esc(fmtDate(r.replied))}` : ""}</span></div>
            <div class="act btnrow">${d ? `<button type="button" class="${st.none || st.undecided ? "primary" : ""}" data-rcheck="${esc(r.id)}">${st.none ? "Go through it" : "Drawing checklist"}</button><button type="button" data-view3d="${esc(r.id)}">Compare in 3D</button>` : ""}</div></div>`; }).join("")}
          <div class="btnrow"><button type="button" class="${rounds.length || !p.process.request ? "" : "primary"}" data-act="scanRound">＋ Scan the builder's drawing R${rounds.length + 1}</button><button type="button" data-act="typeRound">＋ Type its numbers in instead</button></div>
          <p class="hint">The scanner reads the PDF (or a photo) and the drawing checklist flags every number that differs from what you asked for. For each one: OK, Ask, or Change. Then “Export change request” writes the email. Send all changes in one reply.</p></div></div>
      <div class="jsec" style="order:3"><h3>Questions for your builder</h3>${questionsHtml()}</div>
      ${jOn() ? `<div class="jsec" style="order:3"><h3>Messages <small>log what you send and what your builder says</small></h3>${journalQuick(["from", "to", "note"])}</div>` : ""}
      <div class="stagefoot" style="margin:0;order:9"><button type="button" data-go="check">← Check</button><button type="button" class="primary nextbtn" data-go="final">Ready to approve →</button></div>`;
    bindActs($("#builderBody")); bindQuestions($("#builderBody")); bindJournalQuick($("#builderBody"));
    $("#builderBody").querySelectorAll("[data-rcheck]").forEach(b => b.onclick = () => openRoundChecklist(b.dataset.rcheck));
    $("#builderBody").querySelectorAll("[data-view3d]").forEach(b => b.onclick = () => {
      const r = roundOfId(b.dataset.view3d), prev = r && r.n > 1 ? P().rounds.find(x => x.n === r.n - 1) : null;
      a.openDesign(b.dataset.view3d); a.compareWith(prev ? prev.id : pid()); go("design");
      a.toast(`Showing drawing R${r ? r.n : ""}, compared with ${prev ? "R" + prev.n : "your original design"}. Overlay a bike (realistic view) draws both.`); });
    $("#builderBody").querySelectorAll("[data-proc]").forEach(cb => cb.onchange = () => { const s = PROCESS.find(x => x.k === cb.dataset.proc); P().process[cb.dataset.proc] = cb.checked ? today() : null; save(); if (cb.checked) log(`✅ ${s.t.replace(/ \(.*\)$/, "").replace(/:.*$/, "")}`, "milestone"); renderBuilder(); renderStepper(); });
  }
  function questionsHtml() {
    const p = P(), sugg = suggestions().filter(s => !p.questions.some(q => q.t === s));
    return `<div class="qlist">${p.questions.map((q, i) => `<div class="qrow"><input type="checkbox" data-qdone="${i}" ${q.done ? "checked" : ""} aria-label="Answered"><input type="text" data-q="${i}" value="${esc(q.t)}" ${q.done ? 'style="text-decoration:line-through;color:var(--muted)"' : ""}><button type="button" class="win-x" data-qdel="${i}" aria-label="Remove">✕</button></div>`).join("")}
      <div class="qrow"><span></span><input type="text" id="qNew" placeholder="Add a question, e.g. “What wall thickness do you use for the down tube?”"><button type="button" id="qAdd">Add</button></div></div>
      ${sugg.length ? `<div class="hint" style="margin-top:4px">Suggestions: ${sugg.map((s, i) => `<button type="button" data-sugg="${i}" style="margin:3px 4px 0 0;font-weight:500">＋ ${esc(s)}</button>`).join("")}</div>` : ""}`;
  }
  function suggestions() {
    const a = A(), out = [], rows = a.checks(), s = P().spec;
    rows.filter(r => r.status === "fail" || r.status === "warn").slice(0, 3).forEach(r => out.push(`${r.item}: my design shows ${r.value} (target ${r.target}). What do you recommend?`));
    for (const f of SPEC) if (isAsk(s[f.k])) out.push(`${f.label}: what do you recommend?`);
    out.push("What tube sizes and wall thicknesses will you use for my weight?", "What comes with the frame (axles, hanger, seat clamp, headset)?", "What's the steerer spec of the fork (length, top cap, expander)?");
    if (/carbon/i.test(s.fork || "")) out.push("Which rake is the carbon fork: 47 or 52 mm? What's its axle-to-crown?");
    return out.slice(0, 7);
  }
  function bindQuestions(root) {
    const p = P(), rer = () => { const pos = window.scrollY; renderStage(currentStage); window.scrollTo({ top: pos }); };
    root.querySelectorAll("[data-q]").forEach(el => el.onchange = () => { p.questions[+el.dataset.q].t = el.value; save(); });
    root.querySelectorAll("[data-qdone]").forEach(el => el.onchange = () => { const q = p.questions[+el.dataset.qdone]; q.done = el.checked; save(); if (el.checked) log(`Answered: ${q.t}`, "auto"); rer(); });
    root.querySelectorAll("[data-qdel]").forEach(el => el.onclick = () => { p.questions.splice(+el.dataset.qdel, 1); save(); rer(); });
    const add = t => { t = (t || "").trim(); if (!t) return; p.questions.push({ t, done: false, at: today() }); save(); rer(); };
    const nq = root.querySelector("#qNew"); if (nq) { root.querySelector("#qAdd").onclick = () => add(nq.value); nq.onkeydown = e => { if (e.key === "Enter") add(nq.value); }; }
    const sugg = suggestions().filter(s => !p.questions.some(q => q.t === s));
    root.querySelectorAll("[data-sugg]").forEach(b => b.onclick = () => add(sugg[+b.dataset.sugg]));
  }
  function msgWin(id, title, sub, text, onCopy) {
    const w = makeWin(id, title, "mid", sub);
    w.body.innerHTML = `<textarea class="msg" spellcheck="true">${esc(text)}</textarea>`;
    w.foot.hidden = false;
    w.foot.innerHTML = `<span class="hint">Edit it as you like, then copy it into your email to your builder.</span><span style="flex:1"></span><button type="button" data-dl>Download design file</button><button type="button" class="primary" data-copy>Copy message</button>`;
    w.foot.querySelector("[data-dl]").onclick = () => $("#btnExport").click();
    w.foot.querySelector("[data-copy]").onclick = async () => {
      const t = w.body.querySelector("textarea").value;
      try { await navigator.clipboard.writeText(t); } catch (e) { const ta = w.body.querySelector("textarea"); ta.select(); try { document.execCommand("copy"); } catch (e2) {} }
      A().toast("Copied. Paste it into your message to your builder."); onCopy && onCopy(t);
    };
    open(id);
  }
  function geoLines(d) {
    let info = null; try { info = FrameFEA.buildGeometry(FrameFEA.deepMerge(FRAME_DEFAULTS.geometry, d.geometry), d.tubes).info; } catch (e) {}
    const g = d.geometry, L = [
      `Stack ${g.stack} mm`, `Reach ${g.reach} mm`, `Head tube length ${g.headTube} mm`, `Seat tube length (centre to top) ${g.seatTube} mm`,
      `Head angle ${g.headAngle}°`, `Seat angle ${g.seatAngle}°`, `BB drop ${g.bbDrop} mm`, `Chainstay ${g.chainstay} mm`,
      `Fork axle-to-crown ${g.forkA2C} mm, offset ${g.forkOffset} mm`];
    if (info) L.push(`(Works out to: effective top tube ${Math.round(info.effectiveTopTube)} mm, wheelbase ${Math.round(info.wheelbase)} mm, front centre ${Math.round(info.frontCentre)} mm, trail ${Math.round(info.trail)} mm, BB height ${Math.round(info.bbHeight)} mm)`);
    L.push(`Tyres: up to ${g.tireWidth} mm wide${g.rimBSD ? ` on ${({ 559: "26\"", 584: "27.5\"/650b", 622: "29\"/700c", 686: "32\"" })[g.rimBSD] || g.rimBSD} rims` : ""}`);
    return L;
  }
  // stay shapes and bends: the builder's side view only draws these as curved lines, so they go in the email in words
  function shapeLines(d) {
    const g = d.geometry, L = [];
    const ss = ({ straight: "straight", curved: "bent out sideways just enough to clear the tyre", wishbone: "wishbone (one tube from the seat tube, splitting into two legs)" })[g.ssShape];
    if (ss) L.push(`Seat stays: ${ss}`);
    if (g.csShape) L.push(`Chainstays: ${({ spline: "S-bend (as in my design file)", auto: "bent just enough to clear the tyre and chainrings" })[g.csShape] || g.csShape}${+g.csYokeLength > 0 ? `, with a yoke (${g.csYokeLength} mm long)` : ""}`);
    let bends = []; try { bends = window.FrameDrawMatch ? FrameDrawMatch.bendsText(d) : []; } catch (e) {}
    L.push(...bends);
    return L.length ? [`SHAPES AND BENDS`, ...L.map(x => `- ${x}`), ``] : [];
  }
  function openRequest() {
    const a = A(), d = a.design(), p = P(), s = p.spec, sp = specProgress();
    const T = d.tubes, tubes = [["Top tube", T.topTube], ["Down tube", T.downTube], ["Seat tube", T.seatTube], ["Head tube", T.headTube], ["Chainstays", T.chainstay], ["Seat stays", T.seatStay]];
    const groups = [...new Set(SPEC.map(f => f.g))].filter(g => g !== "Rider & use");
    const specL = groups.flatMap(g => { const rows = SPEC.filter(f => f.g === g && s[f.k] && f.k !== "notes"); return rows.length ? [`${g.toUpperCase()}`, ...rows.map(f => `- ${f.label}: ${s[f.k]}`), ``] : []; });
    const qs = p.questions.filter(q => !q.done).map(q => `- ${q.t}`);
    const kg = d.rider && d.rider.riderKg;
    const text = [`Hello,`, ``, `I'd like a quote for a custom titanium ${s.type ? s.type.toLowerCase() : ""} frame. I've tried to put everything in this one email.`, ``,
      `ABOUT ME`, `- Rider weight: ${kg ? `${kg} kg (${Math.round(kg / 0.4536)} lb) with kit` : "?"}`, `- Use: ${s.type || "?"}${s.loads && s.loads !== "No" ? `, ${s.loads.toLowerCase()}` : ""}`, ...(s.tubing ? [`- Tubing: ${s.tubing}`] : []), ``,
      `GEOMETRY`, ...geoLines(d).map(x => `- ${x}`), ``,
      `TUBES (my starting point; I'm happy to take your recommendation)`, ...tubes.map(([n, t]) => `- ${n}: Ø${t.od} × ${t.wall} mm`), ``,
      ...shapeLines(d),
      ...specL, ...(s.notes ? [`OTHER`, s.notes, ``] : []),
      ...(d.orderNotes && d.orderNotes.length ? [`NOTES`, ...d.orderNotes.map(n => `- ${n.text}`), ``] : []),
      ...(qs.length ? [`QUESTIONS`, ...qs, ``] : []),
      `I've attached my design file. Could you send a quote, and a drawing after the deposit?`, ``, `Thank you!`].join("\n");
    msgWin("w-request", "Your request to your builder", sp.mustMissing.length ? `<b style="color:var(--warn)">Still missing: ${esc(sp.mustMissing.map(f => f.label.toLowerCase()).join(", "))}.</b> Fill them in on the spec sheet, or the builder will ask.` : "Built from your geometry, tubes, spec sheet and open questions.", text, t => {
      if (!p.process.request) { p.process.request = today(); }
      p.journal.push({ at: nowIso(), kind: "to", text: "Sent my request (geometry, tubes, spec sheet" + (qs.length ? `, ${qs.length} question${qs.length === 1 ? "" : "s"}` : "") + ")", stage: currentStage, body: t });
      save(); if (winOpen("w-journal")) renderJournal(); if (currentStage === "builder") renderBuilder(); renderStepper();
    });
  }

  // ---------------------------------------------------------------- 5 · FINAL
  const FINAL = [
    ["numbers", "Every number on the latest drawing is what you want", "Re-read the whole sheet, including the tube list and anything Cyclic Labs doesn't compare."],
    ["standards", "The standards on the drawing are right", "BB shell, head tube / headset, rear axle spacing, brake mount and rotor, seatpost size."],
    ["extras", "Mounts, routing, finish and logos are confirmed", "On the drawing, or agreed in writing in your messages."],
    ["fork", "Fork and headset will work together", "Steerer type and length, crown race, top cap, axle-to-crown matches the drawing."],
    ["money", "Price, shipping, customs and timing are clear", "Deposit, balance, shipping method, import duty in your country, expected dates."],
    ["kept", "You've saved the approved drawing", "Keep the PDF (and its drawing number) with your messages."]
  ];
  function renderFinal() {
    const p = P(), cp = checkProgress(), sp = specProgress(), lr = latestRound(), st = lr ? roundStats(lr) : null, oq = p.questions.filter(q => !q.done).length;
    p.after = p.after || {};
    const gate = (ok, t, s, btn) => `<div class="citem${ok ? " ticked" : ""}"><span class="pill ${ok ? "ok" : "warn"}" style="justify-self:start">${ok ? "✓" : "!"}</span><div class="tx"><b>${t}</b><span>${s}</span></div><div class="act">${btn || ""}</div></div>`;
    const fdone = FINAL.filter(([k]) => p.final.ticks[k]).length;
    const rOk = !!lr && st && !st.none && !st.ch && !st.ask && !st.undecided;
    const defNo = p.final.drawingNo || (st && st.model) || "";
    $("#finalBody").innerHTML = `
      <div class="sh"><span class="eyebrow">Step 5 of 5</span><h2>${p.final.approved ? "Approved: follow it home" : "Final check, then approve"}</h2>
        <p>${p.final.approved ? "Production has started, so no more changes. Tick each step as it happens" + (jOn() ? "; it all goes into your journal." : ".") : "Once you confirm a drawing, production starts and the builder can't change it any more. Make sure everything below is green before you say yes."}</p></div>
      ${p.final.approved ? `<div class="callout"><b>Approved ${esc(fmtDate(p.final.approved))}</b>${p.final.drawingNo ? ` · drawing ${esc(p.final.drawingNo)}` : ""}. <button type="button" data-unapprove style="margin-left:8px">Undo approval</button></div>
        <div class="jsec"><h3>After you approve</h3><div class="timeline">${AFTER.map((s2, i) => { const now = i === AFTER.findIndex(x => !p.after[x.k]);
          return `<div class="tstep${now ? " now" : ""}"><input type="checkbox" data-after="${s2.k}" ${p.after[s2.k] ? "checked" : ""} aria-label="${esc(s2.t)}"><div class="tx"><b>${esc(s2.t)}</b><span>${esc(s2.long)}</span></div><span class="hint">${p.after[s2.k] ? esc(fmtDate(p.after[s2.k])) : ""}</span></div>`; }).join("")}</div>
          ${jOn() ? `<p class="hint">Got photos from your builder (finish proof, finished frame)? Add them to the journal below so they stay with this bike.</p>` : ""}</div>` : ""}
      ${p.final.approved ? "" : `<div class="jsec"><h3>Where things stand</h3><div class="clist">
        ${gate(cp.all, "Checks reviewed", `${cp.done} of ${cp.total} ticked in step 3.`, `<button type="button" data-go="check">Step 3</button>`)}
        ${gate(!sp.mustMissing.length && !sp.ask, "Spec sheet decided", sp.mustMissing.length ? `Still needed: ${esc(sp.mustMissing.map(f => f.label.toLowerCase()).join(", "))}.` : `${sp.filled} of ${sp.total} decided${sp.ask ? `, ${sp.ask} still “ask my builder”` : ""}.`, `<button type="button" data-act="spec">Spec sheet</button>`)}
        ${gate(rOk, lr ? `Latest drawing (R${lr.n}) settled` : "No drawing yet", !lr ? "Add the builder's drawing in step 4." : st.none ? "Go through it with the drawing checklist." : st.undecided ? `${st.undecided} flagged numbers not looked at yet.` : st.ch || st.ask ? `${st.ch} change${st.ch === 1 ? "" : "s"} and ${st.ask} question${st.ask === 1 ? "" : "s"} marked: send them and wait for the next drawing.` : "Everything on the checklist is OK.", lr ? `<button type="button" data-rcheck="${esc(lr.id)}">Drawing checklist</button>` : `<button type="button" data-go="builder">Step 4</button>`)}
        ${gate(!oq, "Questions answered", oq ? `${oq} open question${oq === 1 ? "" : "s"} for your builder.` : "No open questions.", `<button type="button" data-go="builder">Questions</button>`)}
      </div></div>
      <div class="jsec"><h3>Your final read-through <small>${fdone}/${FINAL.length}</small></h3><div class="clist">
        ${FINAL.map(([k, t, s2]) => `<div class="citem${p.final.ticks[k] ? " ticked" : ""}"><input type="checkbox" data-fin="${k}" ${p.final.ticks[k] ? "checked" : ""} aria-label="${esc(t)}"><div class="tx"><b>${esc(t)}</b><span>${esc(s2)}</span></div><span></span></div>`).join("")}
      </div></div>
      <div class="jsec"><h3>Approve</h3><div class="clist"><div class="citem"><span></span><div class="tx"><b>Drawing number you're approving</b><span>From the drawing's title block.</span>
        <input type="text" id="finNo" value="${esc(defNo)}" placeholder="drawing number" style="max-width:280px;margin-top:6px"></div>
        <div class="act"><button type="button" class="primary" id="finApprove">Mark as approved</button></div></div></div></div>`}
      <div class="jsec"><h3>Keep a record</h3><div class="jcards">
        <button type="button" class="jcard" data-act="summary"><span class="ic">🧾</span><b>Build summary</b><span class="s">Geometry, tubes, spec sheet, drawing rounds${jOn() ? " and your journal" : ""} on one printable page.</span></button>
        ${jOn() ? `<button type="button" class="jcard" data-act="journal"><span class="ic">📓</span><b>Build journal</b><span class="s">${p.journal.length} entr${p.journal.length === 1 ? "y" : "ies"} so far.</span></button>` : ""}
        <button type="button" class="jcard" id="finExport"><span class="ic">💾</span><b>Export the project file</b><span class="s">The design plus its checklist, spec sheet${jOn() ? " and journal" : ""}, to keep or share.</span></button>
      </div></div>
      ${jOn() ? `<div class="jsec"><h3>Journal</h3>${journalQuick(p.final.approved ? ["note", "from", "photo"] : ["note", "from", "to"])}</div>` : ""}
      <div class="stagefoot" style="margin:0"><button type="button" data-go="builder">← Builder</button></div>`;
    bindActs($("#finalBody")); bindJournalQuick($("#finalBody"));
    $("#finalBody").querySelectorAll("[data-rcheck]").forEach(b => b.onclick = () => openRoundChecklist(b.dataset.rcheck));
    $("#finalBody").querySelectorAll("[data-fin]").forEach(cb => cb.onchange = () => { p.final.ticks[cb.dataset.fin] = cb.checked; save(); const pos = window.scrollY; renderFinal(); window.scrollTo({ top: pos }); });
    $("#finalBody").querySelectorAll("[data-after]").forEach(cb => cb.onchange = () => { const s2 = AFTER.find(x => x.k === cb.dataset.after); p.after[s2.k] = cb.checked ? today() : null; save();
      if (cb.checked) log(s2.k === "arrived" ? "🎉 The frame arrived!" : `✅ ${s2.t.split(" (")[0]}`, "milestone"); const pos = window.scrollY; renderFinal(); renderStepper(); window.scrollTo({ top: pos }); });
    const fn = $("#finNo"); if (fn) fn.onchange = e => { p.final.drawingNo = e.target.value.trim(); save(); };
    const fa = $("#finApprove"); if (fa) fa.onclick = () => {
      const missing = (cp.all ? 0 : 1) + (fdone === FINAL.length ? 0 : 1) + (rOk ? 0 : 1);
      if (missing && !confirmArm(fa, "Some items aren't green: click again to approve anyway")) return;
      p.final.drawingNo = fn.value.trim(); p.final.approved = today(); p.process.approve = today(); save();
      log(`🏁 Approved the final drawing${p.final.drawingNo ? " " + p.final.drawingNo : ""}. Production starts.`, "milestone"); window.scrollTo({ top: 0 }); renderFinal(); renderStepper();
    };
    const un = $("#finalBody [data-unapprove]"); if (un) un.onclick = () => { if (!confirmArm(un, "Click again to undo the approval")) return; p.final.approved = null; p.process.approve = null; save(); log("Approval undone", "auto"); renderFinal(); renderStepper(); };
    $("#finExport").onclick = () => $("#btnExport").click();
  }
  function confirmArm(btn, msg) {
    if (btn._armed) { btn._armed = false; return true; }
    btn._armed = true; const t = btn.textContent; btn.textContent = msg; setTimeout(() => { btn._armed = false; btn.textContent = t; }, 3500); return false;
  }
  function openSummary() {
    const a = A(), d = a.design(), p = P(), name = a.designName();
    const w = makeWin("w-summary", `Build summary: ${esc(name)}`, "mid printme", `Made with Cyclic Labs on ${fmtDate(nowIso())}.`);
    const T = d.tubes, sp = SPEC.filter(f => p.spec[f.k]);
    const sec = (t, h) => `<div class="jsec"><h3>${t}</h3>${h}</div>`;
    const kv = rows => `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
    w.body.innerHTML = [
      p.final.approved ? `<p class="callout">Approved ${esc(fmtDate(p.final.approved))}${p.final.drawingNo ? ` · drawing ${esc(p.final.drawingNo)}` : ""}</p>` : "",
      sec("Geometry", `<ul class="nb-list">${geoLines(d).map(x => `<li>${esc(x)}</li>`).join("")}</ul>`),
      sec("Tubes", kv([["Top tube", T.topTube], ["Down tube", T.downTube], ["Seat tube", T.seatTube], ["Head tube", T.headTube], ["Chainstays", T.chainstay], ["Seat stays", T.seatStay], ["Seatpost", T.seatpost]].map(([n, t]) => [n, `Ø${t.od} × ${t.wall} mm`]))),
      sec("Spec sheet", sp.length ? kv(sp.map(f => [f.label, p.spec[f.k]])) : `<p class="hint">Not filled in.</p>`),
      sec("Drawing rounds", p.rounds.length ? `<ul class="nb-list">${p.rounds.map(r => { const st = roundStats(r), d = a.find(r.id); return `<li><b>R${r.n}</b> (${esc(fmtDate(r.date))}, ${esc(r.how)}${st.model ? ", " + esc(st.model) : ""}): ${st.none ? "not checked" : `${st.ch} change${st.ch === 1 ? "" : "s"}, ${st.ask} question${st.ask === 1 ? "" : "s"}, ${st.ok} OK`}${r.replied ? `; change request sent ${esc(fmtDate(r.replied))}` : ""}${d ? "" : " (design deleted)"}</li>`; }).join("")}</ul>` : `<p class="hint">None yet.</p>`),
      sec("Questions", p.questions.length ? `<ul class="nb-list">${p.questions.map(q => `<li>${q.done ? "✓ " : ""}${esc(q.t)}</li>`).join("")}</ul>` : `<p class="hint">None.</p>`),
      !jOn() ? "" : sec("Journal", p.journal.length ? `<ul class="nb-list">${p.journal.map(j => `<li><span class="hint">${esc(fmtDate(j.at))}</span> ${j.kind === "note" ? "<b>Note:</b> " : ""}${esc(j.text)}</li>`).join("")}</ul>` : `<p class="hint">Empty.</p>`)
    ].join("");
    w.foot.hidden = false;
    w.foot.innerHTML = `<span style="flex:1"></span><button type="button" data-copy>Copy as text</button><button type="button" class="primary" data-print>Print / save as PDF</button>`;
    w.foot.querySelector("[data-print]").onclick = () => window.print();
    w.foot.querySelector("[data-copy]").onclick = async () => { try { await navigator.clipboard.writeText(w.body.innerText); a.toast("Copied"); } catch (e) { a.toast("Couldn't copy here: use Print instead."); } };
    open("w-summary");
  }

  // ---------------------------------------------------------------- JOURNAL (the window)
  let jFilter = "all";
  const JF = { all: null, milestone: ["milestone"], msg: ["from", "to"], mine: ["note", "photo", "from", "to"] };
  function renderJournal() {
    const name = (A().find(pid()) || {}).name || A().designName(), p = P();
    const w = makeWin("w-journal", "Build journal", "drawer", `${esc(name)}: the story of this build. Cyclic Labs adds the milestones; add notes, messages and photos as you go.`);
    const ks = JF[jFilter], list = p.journal.map((j, i) => [j, i]).filter(([j]) => !ks || ks.includes(j.kind)).reverse();
    const first = p.journal[0], days = first ? Math.max(0, Math.round((Date.now() - new Date(first.at).getTime()) / 864e5)) : 0;
    let lastDay = "";
    w.body.innerHTML = `${composerHtml(["note", "from", "to", "photo"], "jw")}
      <div class="jstats hint">${p.journal.length ? `${p.journal.length} entr${p.journal.length === 1 ? "y" : "ies"} · started ${esc(fmtDate(first.at))}${days ? ` (${days} day${days === 1 ? "" : "s"} ago)` : ""}` : ""}</div>
      <div class="seg jfilter" role="group" aria-label="Show">${[["all", "Everything"], ["milestone", "Milestones"], ["msg", "Messages"], ["mine", "Mine"]].map(([k, l]) => `<button type="button" data-jf="${k}" aria-pressed="${jFilter === k}">${l}</button>`).join("")}</div>
      <div class="jlog">${list.length ? list.map(([j, i]) => { const day = fmtDate(j.at), hd = day !== lastDay ? `<div class="sub-h jday">${esc(day)}</div>` : ""; lastDay = day; return hd + entryHtml(j, i, true); }).join("")
        : `<p class="hint" style="margin-top:12px">${p.journal.length ? "Nothing of this kind yet." : "Nothing yet. Milestones appear as you design, check and work with your builder. Add your own notes any time."}</p>`}</div>`;
    bindComposer(w.body, "jw", renderJournal);
    w.body.querySelectorAll("[data-jf]").forEach(b => b.onclick = () => { jFilter = b.dataset.jf; renderJournal(); });
    w.body.querySelectorAll("[data-jdel]").forEach(b => b.onclick = () => { if (!confirmArm(b, "✓?")) return; p.journal.splice(+b.dataset.jdel, 1); save(); renderJournal(); refreshJournalViews(); });
    w.foot.hidden = false;
    w.foot.innerHTML = `<button type="button" data-jexp>Copy as text</button><span style="flex:1"></span><span class="hint">Kept with this bike and in its exported file.</span>`;
    w.foot.querySelector("[data-jexp]").onclick = async () => {
      const t = `${name}: build journal\n\n` + p.journal.map(j => `${fmtDate(j.at)} ${fmtTime(j.at)}  [${(JK[j.kind] || JK.auto)[1]}] ${j.text}${j.body ? "\n" + j.body.replace(/^/gm, "    ") : ""}`).join("\n");
      try { await navigator.clipboard.writeText(t); A().toast("Journal copied"); } catch (e) { A().toast("Couldn't copy here."); }
    };
  }

  // ---------------------------------------------------------------- update (called after every run / header refresh)
  let lastSeenId = null, upTimer = null;
  function update() {
    clearTimeout(upTimer);
    upTimer = setTimeout(() => {
      if (!A()) return;
      const id = curId();
      if (id !== lastSeenId) { onDesignChanged(lastSeenId, id); lastSeenId = id; }
      renderStepper();
      if (currentStage === "design") refreshBoxes();
      else if (currentStage === "garage") { if (!typingIn($("#stage-garage")) && !document.querySelector("dialog.gw[open]")) window.FrameGarage.render(); }
      else if (currentStage === "check" || currentStage === "final" || currentStage === "start" || currentStage === "builder") {
        if (!typingIn($("#stage-" + currentStage))) { const pos = window.scrollY; renderStage(currentStage); window.scrollTo({ top: pos }); } }
      if (winOpen("w-journal")) { const t = document.getElementById("jNote"); if (!t || !t.value) renderJournal(); }
      moveToe();
    }, 60);
  }
  const typingIn = root => { const el = document.activeElement; return !!(el && root.contains(el) && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.tagName === "INPUT" && !/^(checkbox|radio|button)$/.test(el.type))); };
  function refreshBoxes() {
    const a = A(), d = a.design();
    $("#designBoxes").querySelectorAll(".box[data-win]").forEach(b => {
      const def = BOXES.flatMap(g => g[1]).find(x => x[0] === b.dataset.win); if (!def) return;
      let s = ""; try { s = def[2](d); } catch (e) {}
      const el = b.querySelector(".s"); if (el && el.textContent !== s) el.textContent = s;
    });
    const foot = $("#designFoot [data-save]"); if (!!foot !== a.isEdited()) renderDesign();
    else if (window.FrameFit32 && !!$("#designBoxes [data-do=fit32]") !== FrameFit32.is32(d)) renderDesign();   // wheels changed to / from 32"
  }
  function onDesignChanged(prev, id) {
    // a bike that was just saved as a copy inherits the journey of the one it came from
    if (prev && id && prev !== id && savingFrom === prev && store.projects[prev] && !store.projects[id]) {
      store.projects[id] = JSON.parse(JSON.stringify(store.projects[prev]));
      save(); log(`Saved as “${A().designName()}”`, "auto", id);
    }
    savingFrom = null;
    // a drawing round's design just got created (scanned, or a copy to type into)
    if (pendingRound && id && !store.roundOf[id] && id !== pendingRound.specId && !P(pendingRound.specId).rounds.some(r => r.id === id) && !A().find(id).preset) {
      const pr = pendingRound; pendingRound = null;
      registerRound(pr.specId, id, pr.n, pr.typed ? "typed in" : "scanned");
      if (pr.wm) setTimeout(() => { go("builder"); A().toast(`Drawing R${pr.n} added. Open its drawing checklist to go through it against what you asked for.`); }, 50);
      else if (pr.typed) {
        setTimeout(() => { go("design"); open("w-geometry"); A().toast(`Type the numbers from the builder's drawing R${pr.n} here (Geometry, Tubes, Wheels…). Then open its drawing checklist in step 4.`); }, 50);
      } else setTimeout(() => go("builder"), 50);          // the scanner opens the drawing checklist itself
      return;
    }
    if (currentStage && currentStage !== "start" && currentStage !== "garage" && id) {
      const st = store.projects[store.roundOf[id] || id] && store.projects[store.roundOf[id] || id].stage;
      if (st && st !== currentStage) go(st, { keepScroll: true });
      else renderStage(currentStage);
    }
  }
  let savingFrom = null;

  // ---------------------------------------------------------------- hooks into the rest of the app
  function init() {
    const a = A(); if (!a) return;
    document.querySelectorAll("dialog.win").forEach(wireWin);
    document.querySelectorAll("#stepper [data-stage]").forEach(b => b.addEventListener("click", () => go(b.dataset.stage)));
    $("#btnBike").addEventListener("click", () => winOpen("w-bikes") ? close("w-bikes") : open("w-bikes"));
    document.querySelectorAll("[data-learn]").forEach(b => b.addEventListener("click", () => learn(b.dataset.learn)));
    // the header button for the journal
    const jb = document.createElement("button"); jb.type = "button"; jb.id = "btnJournal"; jb.textContent = "📓 Journal"; jb.title = "Your build journal: a dated log of this bike";
    jb.onclick = () => winOpen("w-journal") ? close("w-journal") : open("w-journal");
    $("#btnChat").parentNode.insertBefore(jb, $("#btnChat"));
    makeWin("w-journal", "Build journal", "drawer");
    // Help menu → Build journal On / Off
    document.querySelectorAll("[data-journal]").forEach(b => b.addEventListener("click", () => setJournal(b.dataset.journal === "on")));
    setJournal(jOn(), true);
    // close the help menu when clicking elsewhere
    document.addEventListener("click", e => { const h = $("#helpMenu"); if (h && h.open && !h.contains(e.target)) h.open = false; });
    $("#btnTour").addEventListener("click", () => { const h = $("#helpMenu"); if (h) h.open = false; });
    // journal entries for saving / creating
    $("#btnSave").addEventListener("click", () => { savingFrom = curId(); }, true);
    $("#btnUpdate").addEventListener("click", () => setTimeout(() => log("Changes saved", "auto"), 0));
    const create = a.createDesign;
    a.createDesign = function (name, notes, d, keep) {
      const id = create.apply(this, arguments);
      if (pendingRound) return id;                        // handled in onDesignChanged
      const p = P(id); if (!p.journal.length) { p.journal.push({ at: nowIso(), kind: "milestone", text: `🚲 Started “${name}”${notes ? `: ${String(notes).split(/(?<=\.)\s/)[0].slice(0, 160)}` : ""}`, stage: "start" }); save(); }
      setTimeout(() => go("design"), 0);
      return id;
    };
    // the drawing checklist closed: its counts feed the round cards, the stepper and the Final step
    document.addEventListener("close", e => { if (e.target && e.target.classList && e.target.classList.contains("rv")) setTimeout(() => { renderStepper(); if (currentStage) { const pos = window.scrollY; renderStage(currentStage); window.scrollTo({ top: pos }); } }, 50); }, true);
    // Match a frame drawing closed without saving: forget the pending round
    document.addEventListener("close", e => { if (e.target && e.target.classList && e.target.classList.contains("wm")) setTimeout(() => { if (pendingRound && pendingRound.wm) pendingRound = null; }, 200); }, true);
    // scanner closed without creating a design: forget the pending round
    document.addEventListener("close", e => { if (e.target && e.target.classList && e.target.classList.contains("scan")) setTimeout(() => { if (pendingRound && curId() === pendingRound.specId) pendingRound = null; }, 200); }, true);
    document.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("dialog.rv [data-copy], dialog.rv [data-mail], dialog.rv [data-txt]"); if (!b) return;
      const R = window.FrameReview, rev = R && R._rev(); if (!rev) return;
      const r = roundOfId(rev.designId), sp = store.roundOf[rev.designId] || pid();
      let n = { changes: 0, asks: 0 }, body = ""; try { const t = R.requestText(rev); n = t; body = `Subject: ${t.subject}\n\n${t.body}`; } catch (err) {}
      if (r) { r.replied = today(); if (r.n >= 1 && !P(sp).process.revise && n.changes) P(sp).process.revise = null; }
      const pj = P(sp), last = pj.journal[pj.journal.length - 1];
      const text = `Change request${r ? ` for drawing R${r.n}` : ""}: ${n.changes} change${n.changes === 1 ? "" : "s"}, ${n.asks} question${n.asks === 1 ? "" : "s"}`;
      if (!(last && last.text === text && Date.now() - new Date(last.at).getTime() < 120000)) pj.journal.push({ at: nowIso(), kind: "to", text, stage: currentStage, body });
      save(); refreshJournalViews(); renderStepper();
    }, true);
    // the drawing checklist's tour stop (added by review.js) points at its button, which lives in the "Your bikes" panel now
    try { const T = window.FrameTour && FrameTour.TOURS && FrameTour.TOURS.basics; const st = T && T.find(x => x.sel === "#btnReview");
      if (st) { T.splice(T.indexOf(st), 1); const i = T.findIndex(x => x.sel && x.sel.includes("#builderBody")); T.splice(i >= 0 ? i + 1 : T.length - 1, 0, Object.assign(st, { sel: "#builderBody .rounds", before: () => go("builder"), text: "Each drawing your builder sends opens with its drawing checklist: every number that differs from what you asked for is flagged; mark each OK, Ask or Change, then export the change request as one email." })); } } catch (e) {}
    syncParts();
    // drawers open below the header: keep its height in a CSS variable
    const hdr = $("header.top"), setH = () => document.documentElement.style.setProperty("--hdr", hdr.getBoundingClientRect().height + "px");
    setH(); if (window.ResizeObserver) new ResizeObserver(setH).observe(hdr);
    lastSeenId = curId();
    // page.html already sent a brand-new visitor to Start; everyone else carries on where this bike was left
    if (!currentStage) go((store.projects[pid()] && store.projects[pid()].stage) || store.lastStage || "design");
    else { renderStage(currentStage); renderStepper(); }
  }

  window.FrameJourney = {
    go, open, close, update, log, init, stage: () => currentStage,
    exportState: id => { const p = store.projects[store.roundOf[id] || id]; return p ? JSON.parse(JSON.stringify(p)) : null; },
    importState: (id, st) => { if (st && typeof st === "object") { store.projects[id] = Object.assign(blank(), st, { rounds: [] }); if (st.rounds && st.rounds.length) store.projects[id].journal.push({ at: nowIso(), kind: "auto", text: `Imported (its ${st.rounds.length} drawing round${st.rounds.length === 1 ? "" : "s"} weren't in the file: add the drawings again to compare)` }); save(); } },
    _store: () => store,
    // for the design chat (chatjourney.js): read and fill the same lists the pages show
    api: {
      stages: STAGES, stageName: STAGE_NAME, SPEC, PROCESS, AFTER, FINAL, MANUAL, GLOSS,
      project: () => JSON.parse(JSON.stringify(P())),
      specProgress: () => specProgress(), checkProgress: () => checkProgress(), stepStatus: () => stepStatus(),
      setSpec(k, v) { const f = SPEC.find(x => x.k === k); if (!f) return false; P().spec[k] = v == null ? "" : String(v); save(); if (winOpen("w-spec")) openSpec(); if (currentStage) renderStage(currentStage); renderStepper(); return true; },
      setProcess(k, on, date) { const s = PROCESS.find(x => x.k === k); if (!s) return false; const p = P(); const was = !!p.process[k]; p.process[k] = on ? (date || p.process[k] || today()) : null; save();
        if (on && !was) log(`✅ ${s.t.replace(/ \(.*\)$/, "").replace(/:.*$/, "")}`, "milestone"); if (currentStage) renderStage(currentStage); renderStepper(); return true; },
      setAfter(k, on, date) { const s = AFTER.find(x => x.k === k); if (!s) return false; const p = P(); p.after = p.after || {}; const was = !!p.after[k]; p.after[k] = on ? (date || p.after[k] || today()) : null; save();
        if (on && !was) log(k === "arrived" ? "🎉 The frame arrived!" : `✅ ${s.t.split(" (")[0]}`, "milestone"); if (currentStage) renderStage(currentStage); renderStepper(); return true; },
      setFinalTick(k, on) { if (!FINAL.some(([x]) => x === k)) return false; P().final.ticks[k] = !!on; save(); if (currentStage === "final") renderFinal(); return true; },
      setReviewed(k, on) { P().reviewed[k] = !!on; save(); if (currentStage) renderStage(currentStage); renderStepper(); return true; },
      setDesignDone(on) { const p = P(); const was = p.designDone; p.designDone = !!on; save(); if (on && !was) log("✏️ Design ready: on to the checks", "milestone"); renderStepper(); if (currentStage) renderStage(currentStage); return true; },
      addQuestion(t) { t = String(t || "").trim(); if (!t) return false; const p = P(); if (p.questions.some(q => q.t.toLowerCase() === t.toLowerCase())) return "dup"; p.questions.push({ t, done: false, at: today() }); save(); if (currentStage) renderStage(currentStage); return true; },
      answerQuestion(i, on) { const p = P(), q = p.questions[i]; if (!q) return false; q.done = on !== false; save(); if (q.done) log(`Answered: ${q.t}`, "auto"); if (currentStage) renderStage(currentStage); return true; },
      removeQuestion(i) { const p = P(); if (!p.questions[i]) return false; p.questions.splice(i, 1); save(); if (currentStage) renderStage(currentStage); return true; },
      suggestions: () => suggestions(),
      addEntry(kind, text, extra) { return addEntry(Object.assign({ at: nowIso(), kind: kind || "note", text: String(text || "") }, extra || {})); },
      journalOn: () => jOn(), setJournal: on => setJournal(!!on),
      removeLastEntry(kinds) { const p = P(); for (let i = p.journal.length - 1; i >= 0; i--) if (!kinds || kinds.includes(p.journal[i].kind)) { const e = p.journal.splice(i, 1)[0]; save(); refreshJournalViews(); return e; } return null; },
      openSpec: () => openSpec(), openRequest: () => openRequest(), openSummary: () => openSummary(), act: k => act(k),
      latestRound: () => { const r = latestRound(); return r ? Object.assign({}, r, { stats: roundStats(r) }) : null; },
      openRound: id => openRoundChecklist(id),
      isOpen: id => winOpen(id)
    }
  };
  // page.html's script runs after this file: start once it has set up CyclicLabsApp
  const boot = () => { if (window.CyclicLabsApp && window.CyclicLabsApp.result) init(); else setTimeout(boot, 30); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else setTimeout(boot, 0);
})();
