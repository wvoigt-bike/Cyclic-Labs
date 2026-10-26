// ============================================================================
//  GUIDED TOURS (tour.js)
//  Step-by-step tips that point at the real controls (the rest of the page is
//  dimmed). Tours:
//    "basics" – a first look around the whole app
//    "refine" – after a new bike is built: how to make it yours
//               (parts, wheels, tubes, stays, seatpost, checks, saving)
//    "eng"    – the engineering side (stress, fatigue, lab tests)
//  A step: { sel: CSS selector of what to point at (none = centred card),
//            title, text, mode: "simple" | "eng" (only shown in that mode),
//            before: function run first (open a panel, switch the view) }
//  To add a tip, add a step to TOURS below. Steps whose control isn't on the
//  page (hidden in this mode) are skipped automatically.
// ============================================================================
(function () {
  "use strict";
  const css = `
  .tour-hole { position: fixed; z-index: 9998; border-radius: 10px; box-shadow: 0 0 0 9999px rgba(10, 12, 16, .55); outline: 2px solid var(--accent); pointer-events: none; transition: all .18s ease; }
  .tour-block { position: fixed; inset: 0; z-index: 9997; }
  .tour-pop { position: fixed; z-index: 9999; width: min(360px, calc(100vw - 32px)); background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; box-shadow: 0 12px 36px rgba(0,0,0,.28); display: flex; flex-direction: column; gap: 8px; font-size: 14.5px; }
  .tour-pop h4 { margin: 0; font: 600 18px var(--font-display); }
  .tour-pop p { margin: 0; line-height: 1.45; }
  .tour-pop .row { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
  .tour-pop .row .n { color: var(--muted); font-size: 12.5px; flex: 1; }
  .tour-menu { display: flex; flex-direction: column; gap: 8px; }
  .tour-menu button { text-align: left; padding: 10px 12px; }
  .tour-menu button small { display: block; font-weight: 400; color: var(--muted); }
  @media (prefers-reduced-motion: reduce) { .tour-hole { transition: none; } }
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const App = () => window.CyclicLabsApp;
  const sectionOf = sel => () => { const e = document.querySelector(sel); return e ? e.closest("section") || e : null; };
  const openDetails = sel => () => { const e = document.querySelector(sel); const d = e && e.closest("details"); if (d) d.open = true; };
  const real = on => () => { try { if (App().isReal() !== on) App().setReal(on); } catch (e) {} };

  // v10 layout: the page shows one step at a time and the settings live in panels ("windows"), so a tour step
  // first goes to the right step / opens the right panel (helpers below), then points at it.
  const J = () => window.FrameJourney;
  const stage = k => () => { const j = J(); if (j) { j.go(k); } };
  const drawer = id => () => { const j = J(); if (j) { j.go("design"); j.open(id); } };
  const shut = () => { document.querySelectorAll("dialog.win[open]").forEach(d => d.close()); };
  const TOURS = {
    basics: [
      { before: () => { shut(); stage("design")(); }, title: "Welcome to Cyclic Labs", text: "Cyclic Labs walks you through your custom titanium frame, from a first idea to a builder's drawing you're happy to approve. Here's a quick look around." },
      { sel: "#stepper", title: "Five steps, left to right", text: "<b>Start</b> (pick a starting point) → <b>Design</b> (shape it in 3D) → <b>Check</b> (tick off every check and fill in the spec sheet) → <b>Builder</b> (request, drawings, revisions) → <b>Final</b> (sign off). Click any step to go there; the small text shows how far along you are." },
      { sel: "#btnBike", title: "Your bike", text: "The bike you're working on. Click it to switch bikes, save, save a copy, export a file to keep or send, or start a new bike." },
      { sel: ".jcard.hero", before: stage("start"), title: "Not sure what you want yet?", text: "“Help me figure out what I want” asks where you ride, how it should feel and your height, then suggests a kind of bike, wheel size and frame size, with reasons." },
      { sel: ".modeseg", before: stage("design"), title: "Look at the bike", text: "Realistic shows the finished bike with its parts and paint; Line drawing is a quick sketch. Drag to turn it, scroll or pinch to zoom, and use Side / Top / Rear for straight-on views." },
      { sel: "#designBoxes", title: "Change one part at a time", text: "Each box is one part of the design: geometry, wheels and drivetrain, tubes, stays, seatpost, parts and paint. Click one and its panel opens beside the bike." },
      { sel: "#w-geometry", before: drawer("w-geometry"), title: "Panels open beside the bike", text: "Type a number and the 3D bike and the headline numbers update right away, so you can see what each change does. Close the panel with ✕ or Esc." },
      { sel: "#tiles", before: () => { shut(); stage("design")(); }, title: "The headline numbers", text: "Wheelbase, reach and stack, trail, BB height, effective top tube and tube weight, all updated as you type. Pick another bike under “Compare with” to see the differences." },
      { sel: "#btnChat", title: "Just type it", text: "Chat changes the bike from plain sentences: “make the reach 460”, “use a 140 mm fork”, “what's the trail?”, “undo”. It works offline; no AI model." },
      { sel: "#checkBody .clist", before: stage("check"), title: "Check it, one tick at a time", text: "Each automatic check opens in its own window. Read it, then tick it. The spec sheet (BB, headset, axle, brakes, routing, mounts, finish) and a few things only you can confirm are below." },
      { sel: "#builderBody .rounds, #builderBody .timeline", before: stage("builder"), title: "Work it out with your builder", text: "Cyclic Labs writes your request from the geometry and spec sheet. When a drawing arrives, scan it (or type its numbers) and get a mine-vs-drawing table; mark each difference OK or “ask to change” and it writes your reply." },
      { sel: "#btnJournal", title: "Your build journal", text: "The story of this bike, from first idea to the frame at your door. Cyclic Labs adds the milestones (bike started, request sent, drawing R1 arrived, approved, shipped…); you add notes, what your builder said, what you sent, and photos (finish proof, finished frame). Every step page has a quick box for it, and it all goes into the build summary and the exported file." },
      { sel: "#helpMenu", before: stage("design"), title: "Help any time", text: "Tours, the geometry explainer (geometry in plain words) and the switch for the strength simulation (fatigue life, lab tests, stress colours; also the Strength (FEA) tab in Design) and its disclaimer are here." }
    ],
    refine: [
      { before: () => { shut(); stage("design")(); }, title: "Make it yours", text: "Your bike starts with plain generic parts and ordinary titanium tubes. The order that works well: look → parts → geometry → wheels & tyres → tubes → stays → seatpost → check → save." },
      { sel: ".modeseg", before: real(true), title: "1 · Look at it", text: "This is the finished bike in 3D. Drag to turn it; the Close-up buttons zoom in on the fork, cockpit, drivetrain, rear wheel and saddle." },
      { sel: "#realPanel", before: () => { real(true)(); drawer("w-parts")(); const p = document.querySelector("#realPanel"); if (p) p.open = true; }, title: "2 · Parts & paint", text: "Pick the fork, cranks, wheels, tyres, brakes, cockpit and seatpost from the library, and the finish. Picking a fork sets its length and offset." },
      { sel: "#w-geometry", before: drawer("w-geometry"), title: "3 · Geometry", text: "Fine-tune reach, stack, angles and stays. Watch the 3D bike and the headline numbers change as you type." },
      { sel: "#w-wheels", before: drawer("w-wheels"), title: "4 · Wheels, tyres & drivetrain", text: "Tyre size and width, front and rear wheel size (for a 29/27.5 mullet), chainring, chainline, cranks, BB shell, rotor and brake mount." },
      { sel: "#w-tubes", before: drawer("w-tubes"), title: "5 · Tube sizes", text: "Each tube's outside diameter and wall. Bigger or thicker = stiffer and stronger but heavier. Ask your builder which sizes they stock." },
      { sel: "#w-stays", before: drawer("w-stays"), title: "6 · Stays & tyre room", text: "Seat stay shape (straight, bent, wishbone), the bridge, chainstay shape and yoke, and how much gap the tyre gets." },
      { sel: "#w-bends", before: drawer("w-bends"), title: "6b · Bent tubes", text: "Optional. A seat tube bent forward for tyre room on short chainstays, a down tube bent for fork-crown room, and seat stay or chainstay bends seen from the side. Your fit stays the same; the checks show the bend radius and seatpost insertion." },
      { sel: "#w-post", before: drawer("w-post"), title: "7 · Seatpost & saddle", text: "Seatpost type (rigid, carbon, dropper), saddle position and post length. These drive the seatpost-fit and insertion checks." },
      { sel: "#checkBody .clist", before: () => { shut(); stage("check")(); }, title: "8 · Check it", text: "Go down the list. Amber or red tells you what to change (more tyre room, a longer post, a different ring …) or what to ask your builder." },
      { sel: "#btnChat", title: "Faster: type it", text: "Any of the above can be typed into Chat, e.g. “seat stays 19 mm”, “wishbone seat stays”, “tyre width 61”." },
      { sel: "#btnSave", before: () => { stage("design")(); J() && J().open("w-bikes"); }, title: "9 · Save", text: "Save changes keeps this bike in this browser; Save as new makes a copy so you can compare versions. Export file keeps a copy on your computer (with its checklist and journal) or sends it to someone. A Save button also appears at the top whenever you have unsaved changes." }
    ],
    eng: [
      { before: () => { shut(); App().setUiMode("eng"); stage("check")(); }, sel: "#engTiles", title: "Engineering results", text: "Pedalling and steering stiffness, seated comfort, tube weight, fatigue life and the flat-landing height where a weld would start to yield. They're estimates from Cyclic Labs' frame model: best for comparing designs." },
      { sel: "button[data-win=w-abuse]", title: "Strength & fatigue", text: "How long the frame should last for the riding you set, and how hard each rock hit, landing or sprint works it. Lab tests (ISO 4210) and seated comfort are the next rows. These are model estimates for comparing designs: your builder runs its own analysis and has the final say." },
      { sel: "#w-riding", before: drawer("w-riding"), title: "How it gets ridden", text: "Terrain, riding style, power and the biggest drop. These set the loads the frame is checked against. Rider weight, load sizes and the titanium's properties are in the next box." },
      { sel: ".modeseg", before: () => { shut(); stage("design")(); real(false)(); }, title: "Stress colours", text: "In the Analysis view the frame is coloured by how hard each part works: grey/blue easy, amber working, red worth raising with the builder. Pick a load case and press Play to animate it." }
    ]
  };

  let cur = null;
  function visible(el) { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; }
  function stepsFor(name) {
    const mode = App() && App().uiMode ? App().uiMode() : "eng";
    return (TOURS[name] || []).filter(s => !s.mode || s.mode === mode);
  }
  function start(name) {
    end();
    const steps = stepsFor(name); if (!steps.length) return;
    cur = { name, steps, i: 0, hole: document.createElement("div"), pop: document.createElement("div"), block: document.createElement("div") };
    cur.hole.className = "tour-hole"; cur.pop.className = "tour-pop"; cur.block.className = "tour-block";
    cur.pop.setAttribute("role", "dialog"); cur.pop.setAttribute("aria-live", "polite");
    document.body.append(cur.block, cur.hole, cur.pop);
    cur.block.addEventListener("click", () => next(1));
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey, true);
    show();
  }
  function onKey(e) {
    if (!cur) return;
    if (e.key === "Escape") { e.preventDefault(); end(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); next(-1); }
  }
  function target(s) { if (s.el) return s.el(); if (!s.sel) return null; for (const q of s.sel.split(/,\s*/)) { const e = document.querySelector(q); if (visible(e)) return e; } return document.querySelector(s.sel); }
  function show(dir) {
    if (!cur) return;
    const s = cur.steps[cur.i];
    try { if (s.before) s.before(); } catch (e) {}
    const el = target(s);
    if ((s.sel || s.el) && !visible(el)) { return next(dir || 1, true); }      // control not on the page in this mode: skip
    if (el) el.scrollIntoView({ block: "center" });
    const n = cur.steps.length, last = cur.i === n - 1;
    cur.pop.innerHTML = `<h4>${s.title}</h4><p>${s.text}</p><div class="row"><span class="n">${cur.i + 1} of ${n}</span>
      ${cur.i > 0 ? `<button type="button" data-b>Back</button>` : `<button type="button" data-e>Skip</button>`}<button type="button" class="primary" data-n>${last ? "Done" : "Next"}</button></div>`;
    cur.pop.querySelector("[data-n]").onclick = () => next(1);
    const b = cur.pop.querySelector("[data-b]"); if (b) b.onclick = () => next(-1);
    const sk = cur.pop.querySelector("[data-e]"); if (sk) sk.onclick = end;
    setTimeout(place, 30); place();
    cur.pop.querySelector("[data-n]").focus({ preventScroll: true });
  }
  function place() {
    if (!cur) return;
    const s = cur.steps[cur.i], el = target(s), pop = cur.pop, hole = cur.hole, vw = innerWidth, vh = innerHeight;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    if (!el) { hole.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`; pop.style.left = (vw - pw) / 2 + "px"; pop.style.top = Math.max(16, (vh - ph) / 2) + "px"; return; }
    const r = el.getBoundingClientRect(), pad = 6;
    const top = Math.max(4, r.top - pad), bottom = Math.min(vh - 4, r.bottom + pad);
    hole.style.cssText = `left:${r.left - pad}px;top:${top}px;width:${r.width + 2 * pad}px;height:${Math.max(0, bottom - top)}px`;
    let y = bottom + 10, x = Math.min(Math.max(8, r.left), vw - pw - 8);
    if (y + ph > vh - 8) y = top - ph - 10;
    if (y < 8) {
      // tall target: beside it if there's room, otherwise in the bottom corner so its top stays readable
      if (r.right + pw + 20 < vw) { x = r.right + 12; y = Math.max(8, Math.min(vh - ph - 8, r.top)); }
      else if (r.left - pw - 20 > 0) { x = r.left - pw - 12; y = Math.max(8, Math.min(vh - ph - 8, r.top)); }
      else { y = vh - ph - 12; x = Math.min(vw - pw - 12, Math.max(8, r.right - pw - 12)); }
    }
    pop.style.left = x + "px"; pop.style.top = y + "px";
  }
  function next(d, skipping) {
    if (!cur) return;
    cur.i += d;
    if (cur.i >= cur.steps.length) { const nm = cur.name; end(); try { localStorage.setItem("frameBench.tour." + nm, "done"); } catch (e) {} return; }
    if (cur.i < 0) { cur.i = 0; if (skipping) return next(1, true); }
    show(d);
  }
  function end() {
    if (!cur) return;
    cur.hole.remove(); cur.pop.remove(); cur.block.remove();
    window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey, true);
    cur = null;
  }
  // Tutorial button: choose a tour
  let menuDlg = null;
  function menu() {
    if (!menuDlg) { menuDlg = document.createElement("dialog"); menuDlg.className = "nb"; menuDlg.style.width = "min(460px, calc(100vw - 24px))"; document.body.appendChild(menuDlg); }
    menuDlg.innerHTML = `<div class="nb-wrap"><div class="nb-head"><h2>Guided tours</h2><button type="button" data-x>Close</button></div><div class="nb-body tour-menu">
      <button type="button" data-t="basics"><b>Show me around</b><small>The five steps and where everything is (2 minutes).</small></button>
      <button type="button" data-t="new"><b>Start a new bike</b><small>The click-through set-up: kind of bike, wheels, geometry. (Not sure what you want? Use “Help me figure out what I want” in step 1.)</small></button>
      <button type="button" data-t="refine"><b>How to refine a bike</b><small>Parts, wheels, tubes, stays, seatpost, checks and saving, in order.</small></button>
      <button type="button" data-t="eng"><b>The engineering side</b><small>Stress, fatigue life, comfort and lab tests (switches the engineering results on).</small></button></div></div>`;
    menuDlg.querySelector("[data-x]").onclick = () => menuDlg.close();
    menuDlg.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { menuDlg.close(); if (b.dataset.t === "new") window.FrameNewBike.open(); else start(b.dataset.t); });
    menuDlg.showModal();
  }
  window.FrameTour = { start, end, menu, TOURS, _cur: () => cur };
})();
