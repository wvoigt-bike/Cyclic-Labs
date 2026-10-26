// ============================================================================
//  THE GARAGE (garage.js) — the bikes you own, modelled once, kept for reference
//  A page outside the five build steps (header button "🏠 Garage", FrameJourney.go("garage")).
//  Each garage bike is an ordinary saved design (so it opens in 3D, can be overlaid, compared, edited
//  by chat, exported) with a "garage" record next to it in frameBench.saved.v1:
//    { brand, model, year, size, kind, status: own | sold | rode, ref (my reference bike), photo (small JPEG),
//      like, change, parts, notes, fit: { reach, drop } (measured saddle → bars), added }
//  Useful even when you aren't building anything: a record of your bikes with their geometry side by side.
//  When you are: "Start a new design from it", "Overlay it on my design" and the numbers table
//  (your design vs the bikes you know) are the point.
//  Hooks: page.html App.garageMeta / setGarageMeta / addGarage / deleteSaved (+ optgroups in the selects,
//  garage record in Export/Import), journey.js (the page, Start card, Design banner), newbike.js
//  (opts.garage → addBuilt), overlay.js (setOverlay, quick bikes), chat.js (FrameChat.extra), tour.js.
// ============================================================================
(function (root) {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const A = () => root.CyclicLabsApp, J = () => root.FrameJourney, FEA = () => root.FrameFEA, OV = () => root.FrameOverlay;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const STATUS = [["own", "In the garage"], ["sold", "Sold or retired"], ["rode", "Rode it (test ride, a friend's)"]];
  const STATUS_SHORT = { own: "In the garage", sold: "Sold / retired", rode: "Rode it" };
  const KINDS = [["", "—"], ["road", "Road"], ["gravel", "Gravel"], ["mtb", "Mountain"], ["other", "Other"]];

  // small per-browser settings: which bikes are ticked for the numbers table, the last design you worked on
  const LS = "frameBench.garage.v1";
  const ui = { sel: [], lastDesign: "", showSold: true, base: "" };      // base: the table column the others are compared to
  try { const v = JSON.parse(localStorage.getItem(LS) || "{}"); if (v && typeof v === "object") Object.assign(ui, v); } catch (e) {}
  const saveUi = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch (e) {} };

  const bikes = () => (A() ? A().allDesigns().filter(d => d.garage) : []);
  const isGarage = id => { const d = A() && A().find(id); return !!(d && d.garage); };
  // the design you're building = the open one, or the last non-garage bike you had open
  function myDesign() {
    const a = A(); if (!a) return null;
    const cur = a.find(a.currentId());
    if (cur && !cur.garage) { if (ui.lastDesign !== cur.id) { ui.lastDesign = cur.id; saveUi(); } return Object.assign({}, cur, { design: a.design(), open: true }); }
    const last = ui.lastDesign && a.find(ui.lastDesign);
    return last && !last.garage ? last : null;
  }

  // ---------------------------------------------------------------- a side-view drawing from the geometry
  function sideSvg(design, cls) {
    let g; try { g = FEA().buildGeometry(design.geometry, design.tubes); } catch (e) { return `<div class="gnosvg">No drawing: ${esc(e.message)}</div>`; }
    const P = g.P, I = g.info, Rr = I.rearTyreR, Rf = I.frontTyreR;
    const pt = k => P[k] ? [P[k][0], -P[k][1]] : null;
    const ln = (a, b, c) => { const p = pt(a), q = pt(b); return p && q ? `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" class="${c}"/>` : ""; };
    const ar = pt("AxleR"), af = pt("AxleF"), sad = pt("Sit") || pt("Saddle"), ht = pt("HTtop"), hb = pt("HTbot");
    // stem + bars: up the steerer by the spacers, then forward (only a sketch: the 3D view draws the real parts)
    const parts = design.parts || {}, u = [ht[0] - hb[0], ht[1] - hb[1]], ul = Math.hypot(u[0], u[1]) || 1, uu = [u[0] / ul, u[1] / ul];
    const s0 = [ht[0] + uu[0] * ((+parts.spacers || 10) + 20), ht[1] + uu[1] * ((+parts.spacers || 10) + 20)];
    const fw = [-uu[1], uu[0]], rise = (+parts.stemRise || 0) * Math.PI / 180, sl = +parts.stemLength || 60;
    const fx = fw[0] * Math.cos(rise) + fw[1] * Math.sin(rise), fy = -fw[0] * Math.sin(rise) + fw[1] * Math.cos(rise);
    const bar = [s0[0] + fx * sl, s0[1] + fy * sl - (+parts.barRise || 0)];
    const xmin = ar[0] - Rr - 30, xmax = af[0] + Rf + 30, top = Math.min(sad[1], bar[1]) - 60, bottom = Math.max(ar[1] + Rr, af[1] + Rf) + 20;
    const crank = +design.geometry.crankLength || 170, ca = 0.7;
    return `<svg class="gsvg ${cls || ""}" viewBox="${xmin.toFixed(0)} ${top.toFixed(0)} ${(xmax - xmin).toFixed(0)} ${(bottom - top).toFixed(0)}" role="img" aria-label="Side view drawing" preserveAspectRatio="xMidYMid meet">
      <line x1="${xmin}" y1="${(Math.max(ar[1] + Rr, af[1] + Rf)).toFixed(1)}" x2="${xmax}" y2="${(Math.max(ar[1] + Rr, af[1] + Rf)).toFixed(1)}" class="gfl"/>
      <circle cx="${ar[0].toFixed(1)}" cy="${ar[1].toFixed(1)}" r="${(Rr - 9).toFixed(1)}" class="gwh"/><circle cx="${af[0].toFixed(1)}" cy="${af[1].toFixed(1)}" r="${(Rf - 9).toFixed(1)}" class="gwh"/>
      <circle cx="${ar[0].toFixed(1)}" cy="${ar[1].toFixed(1)}" r="${(Rr * 0.8).toFixed(1)}" class="grim"/><circle cx="${af[0].toFixed(1)}" cy="${af[1].toFixed(1)}" r="${(Rf * 0.8).toFixed(1)}" class="grim"/>
      ${ln("BB", "AxleR", "gst")}${ln("SSst", "AxleR", "gst")}${ln("Crown", "AxleF", "gfk")}
      <line x1="${ht[0].toFixed(1)}" y1="${ht[1].toFixed(1)}" x2="${s0[0].toFixed(1)}" y2="${s0[1].toFixed(1)}" class="gck"/><line x1="${s0[0].toFixed(1)}" y1="${s0[1].toFixed(1)}" x2="${bar[0].toFixed(1)}" y2="${bar[1].toFixed(1)}" class="gck"/>
      ${ln("STtop", "Sit", "gck")}
      <line x1="${(sad[0] - 120).toFixed(1)}" y1="${sad[1].toFixed(1)}" x2="${(sad[0] + 150).toFixed(1)}" y2="${sad[1].toFixed(1)}" class="gsd"/>
      ${ln("BB", "STtop", "gtb")}${ln("TTst", "TTht", "gtb")}${ln("BB", "DTht", "gtb")}${ln("HTtop", "HTbot", "ght")}
      <line x1="0" y1="0" x2="${(crank * Math.cos(ca)).toFixed(1)}" y2="${(crank * Math.sin(ca)).toFixed(1)}" class="gcr"/><circle cx="0" cy="0" r="24" class="gbb"/>
    </svg>`;
  }

  // ---------------------------------------------------------------- numbers for the table
  const WHEEL = { 559: "26″", 584: "27.5″", 622: "29″ / 700c", 686: "32″" };
  function nums(d) {
    const D = d.design, g = D.geometry || {}, m = d.garage || {}, fit = m.fit || {};
    let I = {}; try { I = FEA().buildGeometry(g, D.tubes).info || {}; } catch (e) {}
    return {
      reach: g.reach, stack: g.stack, sr: g.reach ? g.stack / g.reach : null, headAngle: g.headAngle, seatAngle: g.seatAngle,
      chainstay: g.chainstay, bbDrop: g.bbDrop, wheelbase: I.wheelbase, frontCentre: I.frontCentre, trail: I.trail, ett: I.effectiveTopTube,
      headTube: g.headTube, seatTube: g.seatTube, forkA2C: g.forkA2C, forkOffset: g.forkOffset,
      wheel: g.rimBSD ? WHEEL[g.rimBSD] || g.rimBSD : I.rearTyreR ? `≈${Math.round(I.rearTyreR * 2)} mm tyre` : null, tireWidth: g.tireWidth,
      saddleHeight: g.saddleHeight, crankLength: g.crankLength, fitReach: fit.reach, fitDrop: fit.drop
    };
  }
  const ROWS = [
    ["Frame", [["reach", "Reach", "mm", 0], ["stack", "Stack", "mm", 0], ["sr", "Stack ÷ reach", "", 2], ["headAngle", "Head angle", "°", 1], ["seatAngle", "Seat angle", "°", 1],
      ["chainstay", "Chainstay", "mm", 0], ["bbDrop", "BB drop", "mm", 0], ["headTube", "Head tube", "mm", 0], ["seatTube", "Seat tube", "mm", 0], ["ett", "Effective top tube", "mm", 0]]],
    ["Handling", [["wheelbase", "Wheelbase", "mm", 0], ["frontCentre", "Front centre", "mm", 0], ["trail", "Trail", "mm", 0], ["forkA2C", "Fork axle-to-crown", "mm", 0], ["forkOffset", "Fork offset", "mm", 0],
      ["wheel", "Wheels", "", null], ["tireWidth", "Tyre width", "mm", 0]]],
    ["Fit", [["saddleHeight", "Saddle height (from BB)", "mm", 0], ["crankLength", "Crank length", "mm", 1], ["fitReach", "Saddle to bars, reach (measured)", "mm", 0], ["fitDrop", "Saddle to bars, drop (measured)", "mm", 0]]]
  ];
  const fmt = (v, dec) => v == null || v === "" || (typeof v === "number" && !isFinite(v)) ? "—" : typeof v === "number" ? (dec == null ? String(v) : v.toFixed(dec).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1")) : esc(v);

  // ---------------------------------------------------------------- the page
  function cardSub(m, d) {
    const k = (KINDS.find(x => x[0] === m.kind) || [, ""])[1];
    return [[m.year, m.brand, m.model].filter(Boolean).join(" "), m.size ? "size " + m.size : "", k && k !== "—" ? k : ""].filter(Boolean).join(" · ");
  }
  function cardHtml(d) {
    const m = d.garage || {}, n = nums(d), on = ui.sel.includes(d.id), st = m.status || "own";
    const keyNums = [["Reach", n.reach, 0], ["Stack", n.stack, 0], ["HA", n.headAngle, 1, "°"], ["WB", n.wheelbase, 0]].filter(x => x[1] != null).map(([l, v, dec, u]) => `<span><i>${l}</i> ${fmt(v, dec)}${u || ""}</span>`).join("");
    const pic = m.photo || m.render;
    return `<article class="gcard${st !== "own" ? " gpast" : ""}${SH.id === d.id ? " gon" : ""}" data-id="${esc(d.id)}">
      <button type="button" class="gpic" data-g="show" title="Show it in the 3D showroom">${pic ? `<img src="${pic}" alt="${m.photo ? "Photo" : "3D picture"} of ${esc(d.name)}">` : sideSvg(d.design)}</button>
      <div class="gtx">
        <div class="gtitle"><b>${m.ref ? `<span class="gref" title="My reference bike">★</span> ` : ""}${esc(d.name)}</b>${st !== "own" ? `<span class="gchip">${esc(STATUS_SHORT[st] || st)}</span>` : ""}</div>
        ${cardSub(m, d) ? `<span class="gsub">${esc(cardSub(m, d))}</span>` : ""}
        <span class="gnums">${keyNums}</span>
        ${m.like ? `<span class="glike">👍 ${esc(m.like.length > 110 ? m.like.slice(0, 108) + "…" : m.like)}</span>` : ""}
        ${m.change ? `<span class="glike">✎ ${esc(m.change.length > 110 ? m.change.slice(0, 108) + "…" : m.change)}</span>` : ""}
      </div>
      <div class="gact">
        <button type="button" data-g="show">Show in 3D</button>
        <button type="button" data-g="details">Details</button>
        <button type="button" data-g="overlay" title="Draw it as a see-through ghost over the bike you're designing">Overlay on my design</button>
        <button type="button" data-g="newfrom" title="Copy its geometry into a new design to make your own">New design from it</button>
        <label class="chk gsel"><input type="checkbox" data-g="sel" ${on ? "checked" : ""}> In the table</label>
      </div>
    </article>`;
  }
  // The columns of the numbers table: your design (if any) then the ticked garage bikes. One column is the BASELINE
  // (like Geometry Geeks): click a bike's name or any of its numbers and every other column's small numbers become
  // "this bike minus the baseline". ui.base remembers it; "" or a bike no longer in the table = the first column.
  function tableCols(list) {
    const mine = myDesign();
    return (mine ? [Object.assign({}, mine, { _mine: true })] : []).concat((list || bikes()).filter(d => ui.sel.includes(d.id)));
  }
  const baseIndex = cols => Math.max(0, cols.findIndex(c => c.id === ui.base));
  // the baseline bike, for the showroom (null when the table has nothing to compare)
  function baseCol() { const cols = tableCols(); return cols.length > 1 ? cols[baseIndex(cols)] : null; }
  const diffHtml = (v, b, dec) => {
    if (typeof v !== "number" || typeof b !== "number" || dec == null || !isFinite(v) || !isFinite(b)) return "";
    const x = v - b; if (Math.abs(x) < Math.pow(10, -dec) / 2) return ` <small class="gdf gdf0">=</small>`;
    return ` <small class="gdf ${x > 0 ? "gup" : "gdn"}">${x > 0 ? "+" : "−"}${fmt(Math.abs(x), dec)}</small>`;
  };
  function tableHtml(list) {
    const mine = myDesign(), cols = tableCols(list);
    if (!cols.length || cols.length === (mine ? 1 : 0)) return `<p class="hint">Tick “In the table” on a bike to see its numbers here${mine ? ` beside the design you're working on (“${esc(mine.name)}”)` : ""}.</p>`;
    const N = cols.map(nums), bi = baseIndex(cols), base = cols.length > 1 ? N[bi] : null, cls = i => base && i === bi ? ` class="gbase"` : "";
    const head = cols.map((c, i) => `<th scope="col"${cls(i)}><button type="button" class="gcolbtn" data-base="${esc(c.id)}" aria-pressed="${i === bi && !!base}" title="${i === bi ? "Everything is compared to this bike" : `Compare everything to ${esc(c.name)}`}">${i === bi && base ? `<span class="gbaselab">Compared to</span>` : ""}${c._mine ? `<span class="gmine">Your design</span>` : ""}${esc(c.name)}</button></th>`).join("");
    const body = ROWS.map(([grp, rows]) => `<tr class="ggrp"><th colspan="${cols.length + 1}">${grp}</th></tr>` + rows.map(([k, lab, unit, dec]) => {
      if (N.every(n => n[k] == null || n[k] === "")) return "";
      return `<tr><th scope="row">${esc(lab)}${unit ? ` <small>${unit}</small>` : ""}</th>${N.map((n, i) =>
        `<td data-col="${i}"${cls(i)}>${fmt(n[k], dec)}${base && i !== bi ? diffHtml(n[k], base[k], dec) : ""}</td>`).join("")}</tr>`; }).join("")).join("");
    return `<div class="gtablewrap"><table class="gtable${base ? " gpick" : ""}"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <p class="hint">${base ? `Small numbers are each bike minus <b>${esc(cols[bi].name)}</b>. Click another bike's name (or any of its numbers) to compare everything to that one instead. ` : ""}Wheelbase, front centre, trail and effective top tube are worked out from each bike's numbers. Measured saddle-to-bar numbers come from each bike's Details.</p>`;
  }
  // redraw just the table (not the whole page, so the turning bikes in the strip keep going)
  function renderTable() {
    const host = $("#gnumbers"); if (!host) return render();
    host.innerHTML = tableHtml(bikes()); bindTable(host);
  }
  function setBase(id) {
    const cols = tableCols(), i = cols.findIndex(c => c.id === id); if (i < 0) return;
    ui.base = id; saveUi(); renderTable();
    const b = $(`#gnumbers [data-base="${CSS.escape(id)}"]`); if (b && document.activeElement && document.activeElement.closest && document.activeElement.closest("#gnumbers")) b.focus();
  }
  function bindTable(host) {
    host.querySelectorAll("[data-base]").forEach(b => b.onclick = () => setBase(b.dataset.base));
    const t = host.querySelector(".gtable"); if (!t) return;
    t.onclick = e => { const td = e.target.closest && e.target.closest("td[data-col]"); if (!td) return;
      const cols = tableCols(), c = cols[+td.dataset.col]; if (c) setBase(c.id); };
  }
  function render() {
    const host = $("#garageBody"); if (!host || !A()) return;
    const all = bikes(), list = all.filter(d => ui.showSold || (d.garage.status || "own") === "own"), past = all.length - all.filter(d => (d.garage.status || "own") === "own").length;
    ui.sel = ui.sel.filter(id => all.some(d => d.id === id));
    if (!ui.sel.length) { const r = all.find(d => d.garage.ref); if (r) ui.sel = [r.id]; }      // the reference bike starts ticked
    const mine = myDesign(), quick = (OV() && OV()._S && OV()._S.bikes) || [];
    host.innerHTML = `
      <div class="sh"><span class="eyebrow">🏠 Your garage</span><h2>The bikes you ride</h2></div>
      ${all.length ? stripHtml(list) : ""}
      <div class="sh"><p>${all.length ? "Click a bike to see it big, in 3D, with its geometry. " : ""}Model the bikes you own (or have ridden) once, from their geometry charts. Then keep them as a reference: compare their numbers, see one as a see-through ghost over your new design in 3D, or start a new design from the one that fits best. You don't need to be building anything to keep a garage.</p></div>
      <div class="gbar">
        <button type="button" class="primary" data-g="add">＋ Add a bike</button>
        ${all.length ? `<button type="button" data-g="export" title="Every garage bike in one file, to keep or move to another computer">Export garage</button>` : ""}
        <button type="button" data-g="import">Import</button>
        ${past ? `<label class="chk"><input type="checkbox" data-g="showSold" ${ui.showSold ? "checked" : ""}> Show sold / ridden (${past})</label>` : ""}
        <span class="grow"></span>
        ${mine ? `<button type="button" data-g="mine">← Back to “${esc(mine.name)}”</button>` : ""}
      </div>
      ${all.length ? `<div class="gcards">${list.map(cardHtml).join("")}</div>` : `
        <div class="gempty">
          <div class="gempty-art">${sideSvg(A().find("example-purple-ti-29er-ss") ? A().find("example-purple-ti-29er-ss").design : A().allDesigns()[0].design, "ghostsvg")}</div>
          <div><h3>Your garage is empty</h3>
            <p>Start with the bike you ride most. Most brands put a geometry chart on the bike's web page: copy it, paste it in, pick your size. Two minutes, and you have it in 3D.</p>
            <button type="button" class="primary" data-g="add">＋ Add my first bike</button></div>
        </div>`}
      ${all.length ? `<div class="jsec"><h3>Numbers side by side</h3><div id="gnumbers">${tableHtml(all)}</div></div>` : ""}
      ${quick.length ? `<div class="jsec"><h3>Bikes typed in for the overlay <small>quick geometry-only bikes from “⧉ Overlay a bike”</small></h3>
        <div class="gquick">${quick.map(b => `<div><b>${esc(b.name)}</b><button type="button" data-quick="${esc(b.id)}">Move to my garage</button></div>`).join("")}</div></div>` : ""}
      <p class="hint">Garage bikes are kept in this browser with your saved designs (they're also under “Bike ▾”, in their own group). Export garage to keep a copy.</p>`;
    bind(host);
    const gn = host.querySelector("#gnumbers"); if (gn) bindTable(gn);
    if (all.length) bindStrip(host);
  }
  function bind(host) {
    host.querySelectorAll("[data-g]").forEach(el => {
      const k = el.dataset.g, card = el.closest(".gcard"), id = card && card.dataset.id;
      if (k === "sel") { el.onchange = () => { ui.sel = ui.sel.filter(x => x !== id); if (el.checked) ui.sel.push(id); saveUi(); render(); }; return; }
      if (k === "showSold") { el.onchange = () => { ui.showSold = el.checked; saveUi(); render(); }; return; }
      el.onclick = () => action(k, id);
    });
    host.querySelectorAll("[data-quick]").forEach(b => b.onclick = () => moveQuick(b.dataset.quick));
  }
  function action(k, id) {
    switch (k) {
      case "add": return openAdd();
      case "view": return view(id);
      case "show": openShow(id); return;
      case "details": return openDetails(id);
      case "overlay": return overlay(id);
      case "newfrom": return newFrom(id);
      case "export": return exportGarage();
      case "import": return importFile();
      case "mine": { const m = myDesign(); if (m && !m.open) A().openDesign(m.id); return J().go((J()._store().projects[m.id] || {}).stage || "design"); }
      case "back": return J().go("garage");
      case "addCurrent": return addCurrent();
    }
  }

  // ---------------------------------------------------------------- actions
  function view(id) { const a = A(); if (a.currentId() !== id) a.openDesign(id); J().go("design"); }
  function newFrom(id) {
    const a = A(), d = a.find(id); if (!d) return;
    const name = `My custom ${d.garage && d.garage.kind && d.garage.kind !== "other" ? (KINDS.find(x => x[0] === d.garage.kind) || [, ""])[1].toLowerCase() + " " : ""}bike (from ${d.name})`;
    const design = JSON.parse(JSON.stringify(a.currentId() === id ? a.design() : d.design));
    a.createDesign(name, `Started from “${d.name}”, a bike in my garage. Same geometry to begin with; it stays in “Compare with” so you can see what you change.`, design);
    a.compareWith(id);
    a.toast(`New design started from “${d.name}” (it's under Compare with)`);
  }
  function overlay(id) {
    const a = A(), mine = myDesign();
    if (!mine) { a.toast("Open or start the bike you're designing first, then overlay this one on it."); return; }
    if (!mine.open) a.openDesign(mine.id);
    a.compareWith(id);
    J().go("design");
    setTimeout(() => { try { if (OV()) OV().setOverlay(id); else a.setReal(true); } catch (e) { console.error(e); } }, 60);
  }
  function addBuilt(name, notes, d, meta, quiet) {
    const a = A(), m = Object.assign({ status: "own", added: today() }, meta || {});
    if (m.type && !m.kind) m.kind = m.type; delete m.type;
    const id = a.addGarage(name, notes, d, m);
    if (!id) { a.toast("This browser's storage is full, so the bike couldn't be added. Export something and remove old designs or photos."); return null; }
    ui.sel = ui.sel.filter(x => x !== id).concat(id); saveUi();
    J().go("garage");
    a.toast(`“${name}” is in your garage`);
    if (!quiet) setTimeout(() => openDetails(id, true), 150);      // not from the chat: a modal window would block its input
    return id;
  }
  function addCurrent(fromChat) {
    const a = A(), cur = a.find(a.currentId());
    if (!cur) return "No bike is open.";
    if (cur.garage) { J().go("garage"); return `“${cur.name}” is already in your garage.`; }
    const name = a.designName();
    try { a.validate(); } catch (e) { a.toast("Fix this first: " + e.message); return "Fix this first: " + e.message; }
    closeWin("w-garage-add");
    const id = addBuilt(name, cur.notes || "", a.design(), {}, fromChat);
    return id ? `Copied **${name}** into your garage. The design itself is unchanged.${fromChat ? " Add its brand, a photo and how it fits you under **Details** on its card." : ""}` : "Couldn't add it: this browser's storage is full.";
  }
  function moveQuick(qid) {
    const O = OV(), b = O && O._S.bikes.find(x => x.id === qid); if (!b) return;
    const d = FEA().deepMerge(root.FRAME_DEFAULTS, b.design);
    const id = addBuilt(b.name, b.notes || "Typed in from a geometry chart (overlay).", d, {});
    if (id) { try { O.removeQuick(qid); } catch (e) {} render(); }
  }


  // ---------------------------------------------------------------- the 3D showroom
  // Two parts, both drawn with bike3d.js's buildBike (it only needs a renderer, the analysis result and the design):
  //  • the STRIP at the top of the garage page: one tile per bike, each slowly turning. Each bike is rendered once from
  //    N angles into a picture strip ("sprite") by a small hidden renderer, so a whole row can turn without a 3D
  //    context per tile. Kept in memory for this visit only (rebuilt when the bike or the theme changes).
  //  • the SHOWROOM: click a tile and the bike takes over most of the screen as a live 3D model (own canvas and renderer,
  //    turntable on, drag / zoom / views) with its geometry beside it. ← → flip through the garage, Esc closes.
  // The Design step's 3D view is never touched.
  const SH = { dlg: null, cv: null, R: null, msg: null, side: null, id: "", key: "", built: null, cam: null, raf: 0, acc: 0, done: false, spin: true,
    qframes: null, cache: new Map(), lost: false, capture: false, ok: null, lastT: 0 };
  const SP = { R: null, cv: null, n: 36, period: 16, cache: new Map(), queue: [], busy: false, raf: 0, job: 0, ok: null };
  const B3 = () => root.FrameBike3D, GL = () => root.Bike3DGL;
  const SVIEWS = [["three", "3/4"], ["side", "Side"], ["nds", "Other side"], ["front", "Front"], ["top", "Top"]];
  const camFor = v => { const a = v === "front" ? [-Math.PI / 2, 0.05] : (B3() && B3().VIEWS && B3().VIEWS[v]) || [0.62, 0.38]; return { yaw: a[0], pitch: a[1], zoom: 0.92, panX: 0, panY: 0, view: v }; };
  const can3d = () => { if (SP.ok == null) SP.ok = !!(B3() && B3().buildBike && GL() && B3().supported()); return SP.ok; };
  const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
  function analysed(d) {
    const k = JSON.stringify(d.design), hit = SH.cache.get(d.id);
    if (hit && hit.k === k) return hit.r;
    const r = FEA().analyze(d.design); SH.cache.set(d.id, { k, r }); return r;
  }
  const buildOn = (R, d) => { R.clear(); const b = B3().buildBike(R, { result: analysed(d), design: d.design, shown: null, partShow: null, flex: false, mode: "paint" }, B3().isDark()); R.shadowDirty = true; return b; };
  // camera, lights and studio for one view (the same set-up as bike3d.js)
  function sceneFor(b, c, w, h, acc, dark) {
    const G = GL(), V = G.V, M4 = G.M4, asp = w / h, fov = 30 * Math.PI / 180;
    const bb = b.bbox, cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, hx = (bb.x1 - bb.x0) / 2, hy = (bb.y1 - bb.y0) / 2;
    const dist = (Math.max(hx / asp, hy) / Math.tan(fov / 2) * 1.1 + bb.z) / c.zoom;
    const dir = [-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)];
    const upv = [Math.sin(c.yaw) * Math.sin(c.pitch), Math.cos(c.pitch), -Math.cos(c.yaw) * Math.sin(c.pitch)];
    const right = V.norm(V.cross(upv, dir));
    const tgt = V.add(V.add([cx, cy, 0], V.mul(right, c.panX * dist)), V.mul(upv, c.panY * dist));
    const eye = V.madd(tgt, dir, dist);
    let VP = M4.mul(M4.persp(fov, asp, Math.max(20, dist - 3000), dist + 4000), M4.lookAt(eye, tgt, upv));
    if (acc > 0) { const jx = (halton(acc, 2) - 0.5) * 2 / w, jy = (halton(acc, 3) - 0.5) * 2 / h; VP = M4.mul(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, jx, jy, 0, 1]), VP); }
    let keyDir = V.norm([0.3, 1, 0.42]); const ltgt = [cx, cy, 0];
    if (acc > 0) { const a = 2 * Math.PI * halton(acc, 5), rr = 0.05 * Math.sqrt(halton(acc, 7)); keyDir = V.norm(V.add(keyDir, [rr * Math.cos(a), 0, rr * Math.sin(a)])); }
    const LVP = M4.mul(M4.ortho(-1300, 1300, -1300, 1300, 1500, 7000), M4.lookAt(V.madd(ltgt, keyDir, 4000), ltgt, [0, 0, -1]));
    return { model: M4.rotZ(-b.tilt, b.pivot[0], b.pivot[1]), VP, cam: eye, LVP, bg: dark ? [0.135, 0.15, 0.175] : [0.905, 0.915, 0.93], exposure: dark ? 1.0 : 1.05, frame: acc,
      groundY: b.groundY, floorRefl: 0.07, vignette: dark ? 0.16 : 0.1,
      env: dark ? { top: [0.55, 0.57, 0.62], hor: [0.16, 0.17, 0.19], gnd: [0.05, 0.05, 0.055], int: 1.0 } : { top: [0.85, 0.86, 0.9], hor: [0.42, 0.43, 0.45], gnd: [0.16, 0.16, 0.17], int: 1.0 },
      key: { dir: keyDir, col: [2.7, 2.62, 2.5] }, fill: { dir: V.norm([-0.7, 0.35, -0.6]), col: [0.55, 0.6, 0.72] }, contacts: b.contacts };
  }
  const draw = (R, scene, prog) => { if (prog && R._prog !== false) { try { R.renderProgressive(scene); R._prog = true; return; } catch (e) { R._prog = false; } } R.render(scene); };

  // ---- the strip of turning bikes
  function stripHtml(all) {
    return `<div class="gstrip" role="list" aria-label="Your bikes, turning">${all.map(d => { const m = d.garage || {}, pic = m.render || m.photo;
      return `<button type="button" class="gtile${(m.status || "own") !== "own" ? " gpast" : ""}" role="listitem" data-tile="${esc(d.id)}" title="Open ${esc(d.name)} in the showroom">
        <span class="gtile-pic">${pic ? `<img src="${pic}" alt="">` : sideSvg(d.design)}<canvas class="gtile-cv" aria-hidden="true"></canvas></span>
        <span class="gtile-t">${m.ref ? `<span class="gref">★</span> ` : ""}${esc(d.name)}</span><span class="gtile-s">${esc(cardSub(m, d) || STATUS_SHORT[m.status || "own"])}</span></button>`; }).join("")}
      <button type="button" class="gtile gtile-add" data-g="add"><span class="gtile-pic"><span class="gplus">＋</span></span><span class="gtile-t">Add a bike</span><span class="gtile-s">from its geometry chart</span></button></div>`;
  }
  function bindStrip(host) {
    host.querySelectorAll("[data-tile]").forEach(t => t.onclick = () => openShow(t.dataset.tile));
    if (!can3d()) return;
    const want = [...host.querySelectorAll("[data-tile]")].map(t => t.dataset.tile);
    SP.queue = want.filter(id => !spriteFresh(id));
    want.forEach(id => { if (spriteFresh(id)) tileReady(id); });
    pump(); spinTiles();
  }
  const spriteKey = d => JSON.stringify([d.design, B3().isDark(), SP.n]);
  const spriteFresh = id => { const d = A().find(id), c = SP.cache.get(id); return !!(d && c && c.key === spriteKey(d)); };
  // between chunks of baking, give the page real idle time (not just the next animation frame): a page that never idles
  // delays the browser's background save of localStorage, and a reload or closed tab right then could lose recent edits
  const later = f => { if (window.requestIdleCallback) requestIdleCallback(() => f(), { timeout: 250 }); else setTimeout(f, 16); };
  // one bike at a time, a few angles per chunk, so the page stays responsive while the strip fills in
  function pump() {
    if (SP.busy || !SP.queue.length) return;
    const id = SP.queue.shift(), d = A().find(id); if (!d || !d.garage) return pump();
    const tile = document.querySelector(`#garageBody [data-tile="${CSS.escape(id)}"] .gtile-pic`); if (!tile) return pump();
    if (!SP.R) {
      SP.cv = document.createElement("canvas"); SP.cv.className = "gsprite-cv"; SP.cv.setAttribute("aria-hidden", "true"); document.body.appendChild(SP.cv);
      try { SP.R = new (GL().Renderer)(SP.cv); } catch (e) { SP.ok = false; SP.cv.remove(); return; }
      SP.cv.addEventListener("webglcontextlost", e => { e.preventDefault(); SP.R = null; SP.busy = false; SP.cv.remove(); SP.cache.clear(); });
    }
    const dpr = Math.min(1.5, window.devicePixelRatio || 1), r = tile.getBoundingClientRect();   // each bike keeps n pictures in memory: ~15 MB at 1.5×
    const w = Math.max(80, Math.round((r.width || 220) * dpr)), h = Math.max(50, Math.round((r.height || 140) * dpr));
    SP.cv.width = w; SP.cv.height = h;
    let built; try { built = buildOn(SP.R, d); } catch (e) { if (window.console) console.warn("garage strip:", e.message); return pump(); }
    const n = SP.n, sheet = document.createElement("canvas"); sheet.width = w * n; sheet.height = h;
    const sx = sheet.getContext("2d"), dark = B3().isDark(), job = ++SP.job; let i = 0;
    SP.busy = true;
    const step = () => {
      if (job !== SP.job || !SP.R) { SP.busy = false; return; }
      const t0 = performance.now();
      while (i < n && performance.now() - t0 < 12) {
        const cam = { yaw: 0.62 + i * 2 * Math.PI / n, pitch: 0.22, zoom: 1.22, panX: 0, panY: 0 };
        draw(SP.R, sceneFor(built, cam, w, h, 0, dark), true);
        sx.drawImage(SP.cv, i * w, 0);               // same task as the draw: the picture is still in the canvas
        i++;
      }
      if (i < n) { later(step); return; }
      SP.cache.set(id, { key: spriteKey(d), sheet, w, h, n });
      if (!d.garage.photo && !d.garage.render) stripPic(id, sheet, w, h);
      SP.busy = false; tileReady(id); pump();
    };
    later(step);
  }
  // a bike with no photo and no 3D picture yet: its card gets the strip's first angle
  function stripPic(id, sheet, w, h) {
    try { const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(sheet, 0, 0, w, h, 0, 0, w, h);
      const url = c.toDataURL("image/jpeg", 0.8), a = A(), m = a.garageMeta(id); if (!m || url.length < 2000) return;
      m.render = url; if (!a.setGarageMeta(id, m)) return;
      const img = document.querySelector(`#garageBody .gcard[data-id="${CSS.escape(id)}"] .gpic`); if (img) img.innerHTML = `<img src="${url}" alt="3D picture of ${esc(a.find(id).name)}">`;
    } catch (e) {}
  }
  function tileReady(id) { const t = document.querySelector(`#garageBody [data-tile="${CSS.escape(id)}"]`); if (t) t.classList.add("live"); drawTiles(performance.now(), true); }
  function drawTiles(now, force) {
    const still = reduced();
    document.querySelectorAll("#garageBody .gtile.live").forEach(t => {
      const c = SP.cache.get(t.dataset.tile), cv = t.querySelector("canvas"); if (!c || !cv) return;
      if (cv.width !== c.w || cv.height !== c.h) { cv.width = c.w; cv.height = c.h; }
      const x = cv.getContext("2d");
      // each tile starts at its own angle; hovering one turns it a little faster
      const off = (parseInt(t.dataset.tile.slice(-4), 36) || 0) % c.n, speed = t.matches(":hover") ? 2.2 : 1;
      if (still && !force && !t.matches(":hover")) return;
      const pos = still && !t.matches(":hover") ? 0 : ((now / 1000) * speed * c.n / SP.period + off) % c.n, f0 = Math.floor(pos), a = pos - f0, f1 = (f0 + 1) % c.n;
      x.globalAlpha = 1; x.drawImage(c.sheet, f0 * c.w, 0, c.w, c.h, 0, 0, c.w, c.h);
      if (a > 0.02) { x.globalAlpha = a; x.drawImage(c.sheet, f1 * c.w, 0, c.w, c.h, 0, 0, c.w, c.h); x.globalAlpha = 1; }   // cross-fade between angles: smooth at a slow turn
    });
  }
  function spinTiles() {
    if (SP.raf) return;
    let last = 0;
    const tick = now => {
      SP.raf = 0;
      const stage = document.getElementById("stage-garage");
      if (!stage || stage.hidden || !document.querySelector("#garageBody .gtile")) return;   // left the garage: stop
      if (!(SH.dlg && SH.dlg.open) && now - last > 45) { last = now; drawTiles(now); }       // ~22 fps is plenty for a slow turn; paused under the showroom
      SP.raf = requestAnimationFrame(tick);
    };
    SP.raf = requestAnimationFrame(tick);
  }

  // ---- the showroom (takes over most of the screen)
  function showroomEl() {
    if (SH.dlg) return SH.dlg;
    const d = document.createElement("dialog"); d.className = "gtake"; d.setAttribute("aria-label", "3D showroom");
    d.innerHTML = `<div class="gtake-view"><canvas class="gshow-cv" aria-label="Interactive 3D model of the bike: drag to turn, scroll to zoom"></canvas>
        <div class="gshow-msg" hidden></div>
        <button type="button" class="gtake-nav prev" data-nav="-1" aria-label="Previous bike">‹</button><button type="button" class="gtake-nav next" data-nav="1" aria-label="Next bike">›</button>
        <div class="gshow-hint">Drag to turn · scroll or pinch to zoom · right-drag to move · double-click to reset · ← → next bike</div></div>
      <div class="gshow-side"></div><button type="button" class="gtake-x" data-close aria-label="Close the showroom">✕</button>`;
    document.body.appendChild(d);
    SH.dlg = d; SH.cv = d.querySelector("canvas"); SH.msg = d.querySelector(".gshow-msg"); SH.side = d.querySelector(".gshow-side");
    SH.cam = camFor(ui.view || "three");
    SH.ok = can3d();
    if (SH.ok) { try { SH.R = new (GL().Renderer)(SH.cv); } catch (e) { SH.ok = false; } }
    if (!SH.ok) { SH.cv.hidden = true; d.querySelector(".gshow-hint").hidden = true; }
    else {
      showControls(SH.cv);
      SH.cv.addEventListener("webglcontextlost", e => { e.preventDefault(); SH.lost = true; if (SH.raf) cancelAnimationFrame(SH.raf); SH.raf = 0; msg("The graphics card was reset. The model will come back by itself in a moment."); });
      SH.cv.addEventListener("webglcontextrestored", () => { try { SH.R = new (GL().Renderer)(SH.cv); SH.lost = false; SH.key = ""; const id = SH.id; SH.id = ""; showBike(id); } catch (e) { msg("The 3D model couldn't restart. Reload the page to see it again."); } });
      new ResizeObserver(() => request()).observe(d.querySelector(".gtake-view"));
    }
    d.addEventListener("click", e => { if (e.target.closest("[data-close]")) d.close(); const nv = e.target.closest("[data-nav]"); if (nv) flip(+nv.dataset.nav); });
    d.addEventListener("keydown", e => { if (e.target.closest("input, textarea, select")) return; if (e.key === "ArrowRight") { flip(1); e.preventDefault(); } else if (e.key === "ArrowLeft") { flip(-1); e.preventDefault(); } });
    d.addEventListener("close", () => { stopShow(); SH.spinBefore = SH.spin; });
    return d;
  }
  const msg = t => { if (!SH.msg) return; SH.msg.hidden = !t; SH.msg.textContent = t || ""; };
  function openShow(id) {
    const d = showroomEl();
    SH.spin = !reduced();                                    // it's for looking at: start turning (drag to stop)
    if (!d.open) d.showModal();
    showBike(id);
    try { d.querySelector(".gtake-x").focus({ preventScroll: true }); } catch (e) {}
  }
  function flip(k) {
    const list = bikes(); if (list.length < 2) return;
    const i = list.findIndex(x => x.id === SH.id), nx = list[(i + k + list.length) % list.length];
    showBike(nx.id);
  }
  function showBike(id) {
    const a = A(), d = a && a.find(id); if (!d || !d.garage || !SH.dlg) return;
    const changed = SH.id !== id;
    SH.id = id; if (ui.show !== id) { ui.show = id; saveUi(); }
    document.querySelectorAll("#garageBody .gcard").forEach(c => c.classList.toggle("gon", c.dataset.id === id));
    SH.dlg.querySelectorAll(".gtake-nav").forEach(b => b.hidden = bikes().length < 2);
    sideHtml(d);
    if (!SH.ok) { SH.dlg.querySelector(".gtake-view").querySelectorAll(".gshow-flat, .gshow-nogl").forEach(x => x.remove());
      SH.dlg.querySelector(".gtake-view").insertAdjacentHTML("afterbegin", `<div class="gshow-flat">${d.garage.photo ? `<img src="${d.garage.photo}" alt="">` : sideSvg(d.design)}</div>
      <p class="hint gshow-nogl">This browser can't draw the realistic 3D model (WebGL 2 is off or not supported), so here's the line drawing.</p>`); return; }
    const key = JSON.stringify([d.design, B3().isDark()]);
    if (!changed && key === SH.key && SH.built) { request(); return; }
    if (changed) { const keep = SH.cam && SH.cam.view; SH.cam = camFor(keep || ui.view || "three"); }
    msg("Building the 3D model…");
    const job = SH.job = (SH.job || 0) + 1;
    setTimeout(() => {                       // let the page paint first: the analysis takes a moment
      if (job !== SH.job || SH.lost) return;
      try {
        SH.built = buildOn(SH.R, d); SH.key = key; msg("");
        if (!d.garage.photo && !d.garage.render) SH.capture = true;   // its card gets a 3D picture from the first finished view
      } catch (e) { SH.built = null; msg("Couldn't build the 3D model: " + e.message); if (window.console) console.error(e); }
      request();
    }, 30);
  }
  function sideHtml(d) {
    const m = d.garage || {}, n = nums(d), list = bikes(), idx = list.findIndex(x => x.id === d.id);
    const bc = baseCol(), bn = bc && bc.id !== d.id ? nums(bc) : null;      // the table's baseline bike, as small differences
    const geo = ROWS.map(([grp, rows]) => { const r = rows.filter(([k]) => n[k] != null && n[k] !== ""); return r.length ? `<div class="gshow-grp">${grp}</div><dl class="gshow-nums">${r.map(([k, lab, unit, dec]) =>
      `<div><dt>${esc(lab.replace(/ \(measured\)| \(from BB\)/, ""))}</dt><dd>${fmt(n[k], dec)}${unit ? (unit === "°" ? "°" : " " + unit) : ""}${bn ? diffHtml(n[k], bn[k], dec) : ""}</dd></div>`).join("")}</dl>` : ""; }).join("")
      + (bn ? `<p class="hint gshow-vs">Small numbers: this bike minus <b>${esc(bc.name)}</b> (pick another in “Numbers side by side”).</p>` : "");
    SH.side.innerHTML = `
      <div class="gshow-t"><span class="eyebrow">🏠 Showroom${list.length > 1 ? ` · ${idx + 1} of ${list.length}` : ""}</span><h3>${m.ref ? `<span class="gref">★</span> ` : ""}${esc(d.name)}</h3>${cardSub(m, d) ? `<span class="gsub">${esc(cardSub(m, d))}</span>` : ""}</div>
      ${SH.ok ? `<div class="seg gshow-views" role="group" aria-label="View">${SVIEWS.map(([k, l]) => `<button type="button" data-sv="${k}" aria-pressed="false">${l}</button>`).join("")}</div>
      <div class="btnrow"><button type="button" data-ss="spin" aria-pressed="${SH.spin}">⟳ Turntable</button><button type="button" data-ss="pic" title="Use what you see now as the picture on its card">📷 Use as card picture</button></div>` : ""}
      ${m.like ? `<p class="glike">👍 ${esc(m.like)}</p>` : ""}${m.change ? `<p class="glike">✎ ${esc(m.change)}</p>` : ""}
      <div class="gshow-geo">${geo}</div>
      ${m.parts ? `<p class="glike"><b>Build:</b> ${esc(m.parts)}</p>` : ""}
      <div class="btnrow gshow-act"><button type="button" class="primary" data-ss="edit" title="Open it in step 2 to change its geometry, parts and paint">Edit in Design →</button><button type="button" data-ss="details">Details</button><button type="button" data-ss="overlay">Overlay on my design</button></div>`;
    SH.side.querySelectorAll("[data-sv]").forEach(b => b.onclick = () => { SH.cam = camFor(b.dataset.sv); ui.view = b.dataset.sv; saveUi(); SH.spin = false; syncSide(); request(); });
    SH.side.querySelectorAll("[data-ss]").forEach(b => b.onclick = () => {
      const k = b.dataset.ss;
      if (k === "spin") { SH.spin = !SH.spin; syncSide(); request(); }
      else if (k === "pic") { SH.spin = false; syncSide(); SH.capture = "manual"; request(); }
      else if (k === "edit") { SH.dlg.close(); view(d.id); }
      else if (k === "details") { SH.dlg.close(); openDetails(d.id); }
      else if (k === "overlay") { SH.dlg.close(); overlay(d.id); }
    });
    syncSide();
  }
  function syncSide() {
    if (!SH.side) return;
    SH.side.querySelectorAll("[data-sv]").forEach(b => b.setAttribute("aria-pressed", String(!SH.spin && SH.cam && SH.cam.view === b.dataset.sv)));
    const sp = SH.side.querySelector('[data-ss="spin"]'); if (sp) sp.setAttribute("aria-pressed", String(SH.spin));
  }
  function stopShow() { if (SH.raf) cancelAnimationFrame(SH.raf); SH.raf = 0; }
  function request() { SH.acc = 0; SH.done = false; if (!SH.raf) SH.raf = requestAnimationFrame(frame); }
  function frame() {
    SH.raf = 0;
    if (!SH.R || !SH.built || SH.lost || !SH.dlg || !SH.dlg.open) return;
    const cv = SH.cv, r = cv.parentNode.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const now = performance.now();
    if (SH.spin) { SH.cam.yaw += Math.min(0.1, ((now - (SH.lastT || now)) / 1000) * 0.4); SH.acc = 0; }   // ≈ one turn in 16 s, whatever the frame rate
    SH.lastT = now;
    if (SH.acc > 0 || SH.lastAcc > 0) SH.R.shadowDirty = true;
    draw(SH.R, sceneFor(SH.built, SH.cam, w, h, SH.acc, B3().isDark()), true);
    SH.lastAcc = SH.acc;
    if (SH.capture === true) { SH.capture = false; capturePic(false); }   // first view of a bike with no picture → its card/tile picture
    if (SH.spin) { SH.raf = requestAnimationFrame(frame); return; }
    const Q = SH.qframes == null ? 24 : SH.qframes;
    if (SH.acc < Q) { SH.acc++; SH.raf = requestAnimationFrame(frame); return; }
    SH.done = true;
    if (SH.capture) { const manual = SH.capture === "manual"; SH.capture = false; capturePic(manual); }   // same frame: the drawing is still in the canvas
  }
  // the finished view → a small JPEG for the bike's card and tile (kept with the bike; a photo you add wins on the card)
  function capturePic(manual) {
    const a = A(), id = SH.id, m = a.garageMeta(id); if (!m) return;
    try {
      const k = Math.min(1, 640 / SH.cv.width), c = document.createElement("canvas");
      c.width = Math.round(SH.cv.width * k); c.height = Math.round(SH.cv.height * k);
      c.getContext("2d").drawImage(SH.cv, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.78); if (url.length < 2000) return;    // blank canvas
      m.render = url;
      if (!a.setGarageMeta(id, m)) { if (manual) a.toast("This browser's storage is full, so the picture wasn't kept."); return; }
      const img = document.querySelector(`#garageBody .gcard[data-id="${CSS.escape(id)}"] .gpic`);
      if (img && !m.photo) img.innerHTML = `<img src="${url}" alt="3D picture of ${esc(a.find(id).name)}">`;
      if (manual) a.toast(m.photo ? "Saved. The card keeps showing your photo; remove the photo in Details to use this picture." : "Card picture updated");
    } catch (e) { if (manual) a.toast("Couldn't take the picture: " + e.message); }
  }
  function showControls(cv) {
    const ptrs = new Map(); let start = null;
    const snap = () => Object.assign({}, SH.cam, { pts: [...ptrs.values()].map(p => Object.assign({}, p)) });
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), k0 = 2 * Math.tan(15 * Math.PI / 180);
    const manual = () => { SH.spin = false; if (SH.cam.view) SH.cam.view = ""; syncSide(); };
    cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); start = snap(); start.pan = e.button === 2 || e.shiftKey; cv.classList.add("drag"); });
    cv.addEventListener("pointermove", e => {
      if (!ptrs.has(e.pointerId) || !start) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const k = k0 / (cv.clientHeight || 1), pts = [...ptrs.values()];
      if (pts.length >= 2 && start.pts.length >= 2) {
        const d0 = Math.hypot(start.pts[0].x - start.pts[1].x, start.pts[0].y - start.pts[1].y) || 1, d1 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        SH.cam.zoom = clamp(start.zoom * d1 / d0, 0.4, 8);
      } else {
        const p0 = start.pts[0] || pts[0], dx = e.clientX - p0.x, dy = e.clientY - p0.y;
        if (start.pan) { SH.cam.panX = start.panX - dx * k; SH.cam.panY = start.panY + dy * k; }
        else { SH.cam.yaw = start.yaw + dx * 0.008; SH.cam.pitch = clamp(start.pitch + dy * 0.008, -1.55, 1.55); }
      }
      manual(); request();
    });
    const end = e => { ptrs.delete(e.pointerId); start = ptrs.size ? snap() : null; if (!ptrs.size) cv.classList.remove("drag"); };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    cv.addEventListener("contextmenu", e => e.preventDefault());
    cv.addEventListener("wheel", e => { e.preventDefault(); SH.cam.zoom = clamp(SH.cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.4, 8); manual(); request(); }, { passive: false });
    cv.addEventListener("dblclick", () => { SH.cam = camFor(ui.view || "three"); syncSide(); request(); });
  }

  // ---------------------------------------------------------------- windows (built with the journey's window styles)
  function win(id, title, sub) {
    let d = document.getElementById(id);
    if (!d) {
      d = document.createElement("dialog"); d.className = "win mid gw"; d.id = id; d.setAttribute("aria-labelledby", id + "-t");
      d.innerHTML = `<div class="win-head"><div class="win-titles"><h2 id="${id}-t"></h2><p class="hint"></p></div><button type="button" class="win-x" data-close aria-label="Close">✕</button></div><div class="win-body"></div><div class="win-foot"></div>`;
      document.body.appendChild(d);
      d.addEventListener("click", e => { if (e.target.closest("[data-close]") && e.target.closest("dialog") === d) d.close(); });
      d.addEventListener("mousedown", e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } });
      d.addEventListener("close", () => { if (J() && J().stage && J().stage() === "garage") render(); });
    }
    d.querySelector("h2").innerHTML = title;
    const h = d.querySelector(".win-titles .hint"); h.hidden = !sub; h.innerHTML = sub || "";
    return { dlg: d, body: d.querySelector(".win-body"), foot: d.querySelector(".win-foot") };
  }
  const closeWin = id => { const d = document.getElementById(id); if (d && d.open) d.close(); };
  function openAdd() {
    const a = A(), cur = a.find(a.currentId()), w = win("w-garage-add", "Add a bike to your garage", "Pick how you'll get its numbers. You can fine-tune everything later in 3D.");
    w.body.innerHTML = `<div class="jcards">
        <button type="button" class="jcard" data-add="chart"><span class="ic">📋</span><b>From its geometry chart</b><span class="s">Copy the table from the brand's web page (all sizes is fine), paste it in, pick your size. The quickest way.</span></button>
        <button type="button" class="jcard" data-add="type"><span class="ic">⌨️</span><b>Type in the numbers</b><span class="s">Reach, stack, angles… from a spec sheet or a builder's drawing.</span></button>
        <button type="button" class="jcard" data-add="bcad"><span class="ic">📐</span><b>A BikeCAD file</b><span class="s">If you (or your builder) drew it in BikeCAD.</span></button>
        <button type="button" class="jcard" data-add="size"><span class="ic">📏</span><b>Close enough: a typical size</b><span class="s">No chart? Pick road, gravel or mountain and S–XL, then adjust what you can measure.</span></button>
        ${cur && !cur.garage ? `<button type="button" class="jcard" data-add="current"><span class="ic">🚲</span><b>The bike that's open now</b><span class="s">Copy “${esc(a.designName())}” into the garage${cur.preset ? " (handy for a bike that's already built)" : ""}. The design stays as it is.</span></button>` : ""}
        <button type="button" class="jcard" data-add="file"><span class="ic">📥</span><b>A Cyclic Labs file</b><span class="s">A bike or a whole garage someone exported.</span></button>
      </div>
      <p class="hint">Tip: after it's in, measure your saddle height and the saddle-to-bar reach and drop on the real bike and put them in its Details. Those are the numbers that matter most when you design the next one.</p>`;
    w.foot.innerHTML = `<span class="grow"></span><button type="button" data-close>Cancel</button>`;
    w.body.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
      const k = b.dataset.add, NB = root.FrameNewBike;
      if (k === "current") return addCurrent();
      if (k === "file") { closeWin("w-garage-add"); return importFile(); }
      closeWin("w-garage-add");
      if (k === "bcad") return NB.open({ step: "type", source: "bcad", garage: true });
      NB.open({ step: "type", source: k, garage: true });
    });
    if (!w.dlg.open) w.dlg.showModal();
  }

  // a picture → small JPEG (same as the journal: everything lives in this browser, so keep it light)
  function shrinkImage(file, max) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, (max || 720) / Math.max(im.width, im.height)); const c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.72)); }; im.onerror = rej; im.src = fr.result; };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  function openDetails(id, fresh) {
    const a = A(), d = a.find(id); if (!d || !d.garage) return;
    const m = Object.assign({ status: "own" }, d.garage), fit = Object.assign({}, m.fit || {});
    let photo = m.photo || "";
    const w = win("w-garage-bike", `🏠 ${esc(d.name)}`, fresh ? "It's in your garage. Add what you know about it: all optional, and handy when you design the next one." : "What it is, what you like about it, and how it fits you.");
    const sel = (opts, v) => opts.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v || "") ? " selected" : ""}>${esc(l)}</option>`).join("");
    w.body.innerHTML = `
      <div class="gdet">
        <div class="gdet-pic"><div class="gdet-img">${photo ? `<img src="${photo}" alt="">` : sideSvg(d.design)}</div>
          <div class="btnrow"><label class="filebtn">📷 ${photo ? "Change photo" : "Add a photo"}<input type="file" accept="image/*" id="gdPhoto" hidden></label>${photo ? `<button type="button" id="gdNoPhoto">Remove photo</button>` : ""}</div></div>
        <div class="fields gdet-f">
          <label>Name<input id="gdName" value="${esc(d.name)}"></label>
          <label>Brand<input id="gdBrand" value="${esc(m.brand || "")}" placeholder="e.g. Specialized"></label>
          <label>Model<input id="gdModel" value="${esc(m.model || "")}" placeholder="e.g. Stumpjumper"></label>
          <label>Year<input id="gdYear" value="${esc(m.year || "")}" inputmode="numeric" placeholder="e.g. 2021"></label>
          <label>Size (as on the bike)<input id="gdSize" value="${esc(m.size || "")}" placeholder="e.g. M, 56, S3"></label>
          <label>Kind<select id="gdKind">${sel(KINDS, m.kind)}</select></label>
          <label>Status<select id="gdStatus">${sel(STATUS, m.status)}</select></label>
          <label class="chk"><input type="checkbox" id="gdRef" ${m.ref ? "checked" : ""}> My reference bike <span class="hint">(the one that fits best: ★, ticked in the table first)</span></label>
        </div>
      </div>
      <div class="fields gdet-t">
        <label>What I like about it<textarea id="gdLike" rows="2" placeholder="e.g. Climbs well, I never touch my toes, the bars feel just right">${esc(m.like || "")}</textarea></label>
        <label>What I'd change<textarea id="gdChange" rows="2" placeholder="e.g. A bit long in the front; I'd like room for 2.4 tyres">${esc(m.change || "")}</textarea></label>
        <label>Parts / build<textarea id="gdParts" rows="2" placeholder="e.g. Fox 34 130 mm, 50 mm stem, 780 bars, 172.5 cranks">${esc(m.parts || "")}</textarea></label>
      </div>
      <div class="jsec"><h3>How it fits you <small>measured on the real bike, in mm</small></h3>
        <div class="fields gdet-fit">
          <label>Saddle height <span class="hint">(BB centre to top of saddle, along the seat tube)</span><input id="gdSaddle" type="number" step="1" value="${esc(d.design.geometry.saddleHeight || "")}"></label>
          <label>Saddle to bars, reach <span class="hint">(saddle nose to bar centre, level)</span><input id="gdFitR" type="number" step="1" value="${esc(fit.reach == null ? "" : fit.reach)}"></label>
          <label>Saddle to bars, drop <span class="hint">(top of saddle down to top of bar; negative if the bars are higher)</span><input id="gdFitD" type="number" step="1" value="${esc(fit.drop == null ? "" : fit.drop)}"></label>
        </div>
        <p class="hint">Saddle height changes the 3D model. Stem, bars, spacers and the other parts: open it in 3D and use the Parts box. Geometry: the Geometry box.</p>
      </div>
      <label>Notes<textarea id="gdNotes" rows="2">${esc(d.notes || "")}</textarea></label>
      <div class="btnrow gdanger"><button type="button" id="gdUngarage" title="Keep it in Your bikes as an ordinary design">Move out of the garage</button><button type="button" id="gdDelete">Delete this bike</button></div>`;
    w.foot.innerHTML = `<button type="button" data-v>View in 3D</button><button type="button" data-n>New design from it</button><span class="grow"></span><button type="button" data-close>Cancel</button><button type="button" class="primary" data-save>Save</button>`;
    const B = w.body, val = s => B.querySelector(s).value.trim(), numOrNull = s => { const v = val(s); return v === "" || !isFinite(+v) ? null : +v; };
    B.querySelector("#gdPhoto").onchange = async e => { const f = e.target.files[0]; if (!f) return; try { photo = await shrinkImage(f, 720); B.querySelector(".gdet-img").innerHTML = `<img src="${photo}" alt="">`; } catch (err) { a.toast("Couldn't read that picture."); } };
    const np = B.querySelector("#gdNoPhoto"); if (np) np.onclick = () => { photo = ""; B.querySelector(".gdet-img").innerHTML = sideSvg(d.design); np.remove(); };
    const save = () => {
      const name = val("#gdName") || d.name;
      const meta = Object.assign({}, m, { brand: val("#gdBrand"), model: val("#gdModel"), year: val("#gdYear"), size: val("#gdSize"), kind: val("#gdKind"), status: val("#gdStatus"),
        ref: B.querySelector("#gdRef").checked, like: val("#gdLike"), change: val("#gdChange"), parts: val("#gdParts"), photo, fit: { reach: numOrNull("#gdFitR"), drop: numOrNull("#gdFitD") } });
      if (!meta.photo) delete meta.photo;
      // only one reference bike
      if (meta.ref) for (const o of bikes()) if (o.id !== id && o.garage.ref) a.setGarageMeta(o.id, Object.assign({}, o.garage, { ref: false }));
      if (!a.setGarageMeta(id, meta)) { a.toast("This browser's storage is full: try a smaller photo, or export and remove old designs."); return false; }
      if (name !== d.name) a.rename(id, name);
      const sh = numOrNull("#gdSaddle"), notes = val("#gdNotes");
      if (notes !== (d.notes || "")) a.setNotes(id, notes);
      if (sh != null && sh !== d.design.geometry.saddleHeight) {
        const nd = JSON.parse(JSON.stringify(a.savedDesign(id) || d.design)); if (sh != null) nd.geometry.saddleHeight = sh;
        a.updateSaved(id, nd);
        if (a.currentId() === id) { if (!a.isEdited()) a.openDesign(id); else { a.design().geometry.saddleHeight = sh; a.refresh(); } }
      }
      if (meta.ref && !ui.sel.includes(id)) { ui.sel.unshift(id); saveUi(); }
      return true;
    };
    w.foot.querySelector("[data-save]").onclick = () => { if (save()) { w.dlg.close(); a.toast("Saved"); } };
    w.foot.querySelector("[data-v]").onclick = () => { if (save()) { w.dlg.close(); view(id); } };
    w.foot.querySelector("[data-n]").onclick = () => { if (save()) { w.dlg.close(); newFrom(id); } };
    let armed = false;
    B.querySelector("#gdDelete").onclick = e => {
      if (!armed) { armed = true; e.target.textContent = "Click again to delete it"; setTimeout(() => { armed = false; if (e.target.isConnected) e.target.textContent = "Delete this bike"; }, 3000); return; }
      w.dlg.close(); a.deleteSaved(id); ui.sel = ui.sel.filter(x => x !== id); saveUi(); a.toast(`Deleted “${d.name}”`); J().go("garage");
    };
    B.querySelector("#gdUngarage").onclick = () => { w.dlg.close(); a.setGarageMeta(id, null); a.toast(`“${d.name}” is an ordinary design now (under Bike ▾)`); render(); };
    if (!w.dlg.open) w.dlg.showModal();
  }
  // ---------------------------------------------------------------- export / import the whole garage
  function exportGarage() {
    const a = A(), list = bikes().map(d => ({ name: d.name, notes: d.notes || "", design: a.savedDesign(d.id) || d.design, garage: a.garageMeta(d.id) }));
    const blob = new Blob([JSON.stringify({ frameBenchGarage: 1, exported: today(), bikes: list }, null, 2)], { type: "application/json" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `Cyclic-Labs-garage-${today()}.json`;
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 1000);
  }
  function importFile() {
    let inp = document.getElementById("garageFileIn");
    if (!inp) { inp = document.createElement("input"); inp.type = "file"; inp.id = "garageFileIn"; inp.accept = ".json,application/json"; inp.hidden = true; document.body.appendChild(inp);
      inp.addEventListener("change", () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader();
        rd.onload = () => { try { const j = JSON.parse(rd.result); if (j && j.frameBenchGarage) importGarage(j); else importOne(j, f.name); } catch (e) { A().toast("That file isn't a Cyclic Labs file."); } inp.value = ""; };
        rd.readAsText(f); }); }
    inp.click();
  }
  function importOne(j, fileName) {
    const a = A(), F = FEA(), design = j && (j.design || j);
    try { F.validate(F.deepMerge(root.FRAME_DEFAULTS, design)); } catch (e) { a.toast(e && e.all ? "That bike has a problem: " + e.message : "That file isn't a Cyclic Labs design."); return; }
    const full = F.deepMerge(root.FRAME_DEFAULTS, design);
    addBuilt(j.name || String(fileName || "Imported bike").replace(/\.json$/i, ""), j.notes || "Imported", full, Object.assign({}, j.garage && typeof j.garage === "object" ? j.garage : {}));
  }
  function importGarage(j) {
    const a = A(), F = FEA(); let n = 0, bad = 0;
    for (const b of (j.bikes || [])) {
      try { const full = F.deepMerge(root.FRAME_DEFAULTS, b.design || {}); F.validate(full);
        if (a.addGarage(b.name || "Garage bike", b.notes || "", full, Object.assign({ status: "own" }, b.garage || {}))) n++; else bad++; } catch (e) { bad++; }
    }
    J().go("garage"); render();
    a.toast(`${n} bike${n === 1 ? "" : "s"} added to your garage${bad ? ` (${bad} couldn't be read${a.allDesigns().length ? "" : ""})` : ""}`);
  }

  // ---------------------------------------------------------------- the banner on the Design step for a garage bike
  function designBanner(id) {
    const a = A(), d = a && a.find(id);
    if (!d || !d.garage) { myDesign(); return ""; }
    const mine = myDesign();
    return `<div class="gbanner" role="note"><span>🏠 <b>A bike in your garage.</b> You're looking at a bike you own, kept for reference; saving changes here updates the garage copy.</span>
      <span class="btnrow"><button type="button" data-g="back">← Garage</button><button type="button" data-g="details" data-id="${esc(id)}">Details</button><button type="button" data-g="newfrom" data-id="${esc(id)}">New design from it</button>${mine ? `<button type="button" data-g="mine">Back to “${esc(mine.name)}”</button>` : ""}</span></div>`;
  }
  function bindBanner(host) { host.querySelectorAll(".gbanner [data-g]").forEach(b => b.onclick = () => action(b.dataset.g, b.dataset.id || A().currentId())); }

  // ---------------------------------------------------------------- design chat ("open my garage", "add this bike to my garage")
  function chat(raw, text) {
    const t = String(text || raw).toLowerCase().trim();
    if (!/\bgarage\b/.test(t)) return null;
    if (/\b(add|put|save|copy|move|park)\b.*\b(this|it|current|open|the bike|my bike)\b.*\bgarage\b|\bto (my |the )?garage\b/.test(t)) return addCurrent(true);
    if (/\b(export|back ?up|download)\b/.test(t)) { exportGarage(); return "Exported your garage as one file."; }
    J().go("garage");
    const n = bikes().length;
    return n ? `Opened your garage (${n} bike${n === 1 ? "" : "s"}).` : "Opened your garage. It's empty: press **＋ Add a bike** and paste a geometry chart.";
  }

  // ---------------------------------------------------------------- styles + start
  const css = `
  .garagebtn { white-space: nowrap; }
  #garageBody .gbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  #garageBody .gbar .grow { flex: 1; }
  .gcards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
  .gcard { display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; min-width: 0; }
  .gcard.gpast { opacity: .78; }
  .gcard.gon { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .gstrip { display: flex; gap: 12px; overflow-x: auto; padding: 4px 2px 10px; scroll-snap-type: x proximity; overscroll-behavior-x: contain; }
  .gtile { flex: 0 0 auto; width: 270px; display: flex; flex-direction: column; gap: 2px; padding: 0 0 10px; text-align: left; border-radius: 12px; overflow: hidden;
    background: var(--panel); border: 1px solid var(--line); scroll-snap-align: start; cursor: pointer; transition: transform .15s, box-shadow .15s, border-color .15s; }
  .gtile:hover, .gtile:focus-visible { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0,0,0,.14); }
  .gtile.gpast { opacity: .8; }
  .gtile-pic { position: relative; display: block; width: 100%; aspect-ratio: 16 / 10; background: var(--bg); border-bottom: 1px solid var(--line); overflow: hidden; }
  .gtile-pic img, .gtile-pic .gsvg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .gtile-pic .gsvg { padding: 8px; }
  .gtile-cv { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .5s; }
  .gtile.live .gtile-cv { opacity: 1; }
  .gtile-t { padding: 8px 12px 0; font: 600 15px var(--font-display); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gtile-s { padding: 0 12px; font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gtile-add { border-style: dashed; } .gtile-add .gtile-pic { display: grid; place-items: center; background: none; border-bottom-style: dashed; }
  .gplus { font-size: 34px; color: var(--accent); }
  .gsprite-cv { position: fixed; left: -10000px; top: 0; width: 8px; height: 8px; pointer-events: none; }
  dialog.gtake { position: fixed; inset: 0; margin: auto; width: min(1600px, 96vw); height: 94dvh; max-width: none; max-height: none; padding: 0; border: 1px solid var(--line);
    border-radius: 14px; background: var(--panel); color: var(--ink); overflow: hidden; display: none; }
  dialog.gtake[open] { display: grid; grid-template-columns: minmax(0, 1fr) 330px; }
  dialog.gtake::backdrop { background: rgba(8, 10, 14, .72); backdrop-filter: blur(3px); }
  .gtake-view { position: relative; min-height: 0; background: var(--bg); }
  .gshow-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
  .gshow-cv.drag { cursor: grabbing; }
  .gshow-msg { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 14px; font-size: 13.5px; color: var(--muted); max-width: 80%; text-align: center; }
  .gshow-hint { position: absolute; left: 14px; bottom: 12px; font-size: 12px; color: var(--muted); background: color-mix(in srgb, var(--panel) 75%, transparent); padding: 3px 8px; border-radius: 6px; pointer-events: none; }
  .gtake-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 42px; height: 64px; font-size: 30px; line-height: 1; border-radius: 10px; padding: 0;
    background: color-mix(in srgb, var(--panel) 80%, transparent); border: 1px solid var(--line); color: var(--ink); z-index: 2; }
  .gtake-nav.prev { left: 12px; } .gtake-nav.next { right: 12px; } .gtake-nav:hover { border-color: var(--accent); color: var(--accent); }
  .gtake-x { position: absolute; top: 10px; right: 10px; z-index: 3; border: 0; background: none; font-size: 20px; padding: 6px 9px; color: var(--muted); }
  .gtake-x:hover { color: var(--ink); }
  .gshow-flat { position: absolute; inset: 0; padding: 30px; } .gshow-flat img { width: 100%; height: 100%; object-fit: contain; }
  .gshow-nogl { position: absolute; left: 12px; bottom: 8px; margin: 0; }
  .gshow-side { display: flex; flex-direction: column; gap: 12px; padding: 18px 18px 16px; border-left: 1px solid var(--line); min-width: 0; overflow-y: auto; }
  .gshow-t { padding-right: 30px; }
  .gshow-t h3 { font-size: 22px; margin-top: 2px; overflow-wrap: anywhere; }
  .gshow-t .gsub { display: block; margin-top: 2px; }
  .gshow-views { display: flex; flex-wrap: wrap; } .gshow-views button { font-size: 12.5px; padding: 5px 8px; }
  .gshow-side .btnrow { display: flex; gap: 6px; flex-wrap: wrap; } .gshow-side .btnrow button { font-size: 12.5px; padding: 5px 9px; }
  .gshow-side [data-ss="spin"][aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .gshow-grp { font: 600 11px var(--font-body); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 6px 0 4px; }
  .gshow-nums { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; margin: 0; }
  .gshow-nums div { display: flex; flex-direction: column; min-width: 0; } .gshow-nums dt { font-size: 11.5px; color: var(--muted); } .gshow-nums dd { margin: 0; font: 500 14px var(--font-data); }
  .gshow-side .glike { margin: 0; }
  .gshow-act { margin-top: auto; padding-top: 4px; }
  @media (max-width: 900px) { dialog.gtake { width: 100vw; height: 100dvh; border-radius: 0; border: 0; } dialog.gtake[open] { grid-template-columns: 1fr; grid-template-rows: minmax(260px, 56dvh) minmax(0, 1fr); }
    .gshow-side { border-left: 0; border-top: 1px solid var(--line); } .gshow-hint { display: none; } .gtile { width: 210px; } }
  .gpic { display: block; padding: 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: var(--bg); aspect-ratio: 16 / 9; width: 100%; cursor: pointer; overflow: hidden; }
  .gpic img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gpic:hover { background: var(--accent-soft); }
  .gtx { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px 4px; min-width: 0; }
  .gtitle { display: flex; gap: 8px; align-items: baseline; justify-content: space-between; min-width: 0; }
  .gtitle b { font: 600 17px var(--font-display); overflow: hidden; text-overflow: ellipsis; }
  .gref { color: var(--accent); }
  .gchip { flex: none; font-size: 11.5px; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--line); color: var(--muted); }
  .gsub { font-size: 13px; color: var(--muted); }
  .gnums { display: flex; flex-wrap: wrap; gap: 4px 12px; font: 500 13px var(--font-data); }
  .gnums i { font-style: normal; color: var(--muted); font-family: var(--font-body); font-size: 12px; }
  .glike { font-size: 13px; color: var(--muted); line-height: 1.35; overflow-wrap: anywhere; }
  .gact { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px 14px; align-items: center; margin-top: auto; }
  .gact button { font-size: 12.5px; padding: 5px 9px; }
  .gact .gsel { font-size: 12.5px; margin-left: auto; }
  .gsvg { width: 100%; height: 100%; display: block; }
  .gsvg line, .gsvg circle { fill: none; stroke-linecap: round; }
  .gsvg .gtb { stroke: var(--accent); stroke-width: 30; } .gsvg .ght { stroke: var(--accent); stroke-width: 42; }
  .gsvg .gst { stroke: var(--accent); stroke-width: 20; } .gsvg .gfk { stroke: var(--ink); stroke-width: 26; opacity: .75; }
  .gsvg .gwh { stroke: var(--ink); stroke-width: 18; opacity: .8; } .gsvg .grim { stroke: var(--muted); stroke-width: 7; opacity: .7; }
  .gsvg .gck { stroke: var(--ink); stroke-width: 20; opacity: .75; } .gsvg .gsd { stroke: var(--ink); stroke-width: 30; }
  .gsvg .gcr { stroke: var(--muted); stroke-width: 16; } .gsvg .gbb { fill: var(--panel); stroke: var(--accent); stroke-width: 12; }
  .gsvg .gfl { stroke: var(--line); stroke-width: 6; }
  .ghostsvg { opacity: .35; }
  .gnosvg { padding: 20px; font-size: 13px; color: var(--muted); }
  .gempty { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 20px; align-items: center; background: var(--panel); border: 1px dashed var(--line); border-radius: 12px; padding: 20px; }
  .gempty h3 { font-size: 20px; margin-bottom: 6px; } .gempty p { color: var(--muted); margin: 0 0 12px; max-width: 60ch; }
  .gempty-art { aspect-ratio: 16 / 9; }
  @media (max-width: 640px) { .gempty { grid-template-columns: 1fr; } }
  .gtablewrap { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
  .gtable { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  .gtable th, .gtable td { padding: 7px 12px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
  .gtable thead th { vertical-align: bottom; font: 600 13.5px var(--font-display); white-space: normal; min-width: 110px; }
  .gtable th[scope=row] { text-align: left; font-weight: 500; color: var(--ink); }
  .gtable th[scope=row] small { color: var(--muted); font-weight: 400; }
  .gtable td { font-family: var(--font-data); }
  .gtable tr.ggrp th { text-align: left; font: 600 11.5px var(--font-body); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); background: var(--bg); }
  .gmine { display: block; font: 600 11px var(--font-body); text-transform: uppercase; letter-spacing: .08em; color: var(--accent); }
  .gdf { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .gdf.gup { color: var(--accent); } .gdf.gdn { color: var(--ink); opacity: .72; } .gdf.gdf0 { opacity: .5; }
  .gtable .gcolbtn { all: unset; display: block; cursor: pointer; text-align: right; width: 100%; border-radius: 6px; padding: 2px 4px; margin: -2px -4px; }
  .gtable .gcolbtn:hover { background: var(--accent-soft); } .gtable .gcolbtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .gtable.gpick td[data-col] { cursor: pointer; } .gtable.gpick td[data-col]:not(.gbase):hover { background: color-mix(in srgb, var(--accent-soft) 45%, transparent); }
  .gtable .gbase { background: var(--accent-soft); } .gtable thead th.gbase { box-shadow: inset 0 3px 0 var(--accent); }
  .gbaselab { display: block; font: 600 10.5px var(--font-body); text-transform: uppercase; letter-spacing: .08em; color: var(--accent); }
  .gshow-vs { margin-top: 6px; }
  .gquick { display: flex; flex-direction: column; gap: 6px; } .gquick > div { display: flex; gap: 10px; align-items: center; justify-content: space-between; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; }
  .gbanner { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 10px;
    background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); font-size: 14px; }
  .gbanner .btnrow { display: flex; gap: 6px; flex-wrap: wrap; }
  .gbanner button { font-size: 12.5px; padding: 5px 9px; }
  dialog.gw .gdet { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 16px; }
  @media (max-width: 640px) { dialog.gw .gdet { grid-template-columns: 1fr; } }
  dialog.gw .gdet-img { aspect-ratio: 16 / 9; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  dialog.gw .gdet-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  dialog.gw .gdet-pic { display: flex; flex-direction: column; gap: 8px; }
  dialog.gw .fields label { display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
  dialog.gw .fields label.chk { flex-direction: row; align-items: center; gap: 6px; flex-wrap: wrap; }
  dialog.gw .gdet-f { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
  dialog.gw .gdet-f label:first-child, dialog.gw .gdet-f label.chk { grid-column: 1 / -1; }
  dialog.gw .gdet-fit { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 12px; align-items: end; }
  @media (max-width: 640px) { dialog.gw .gdet-f, dialog.gw .gdet-fit { grid-template-columns: 1fr; } }
  dialog.gw textarea { width: 100%; resize: vertical; font: inherit; }
  dialog.gw .gdet-t { display: flex; flex-direction: column; gap: 10px; }
  dialog.gw > .win-body > label { display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
  dialog.gw .filebtn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); cursor: pointer; font-size: 13px; }
  dialog.gw .gdanger { justify-content: flex-end; } dialog.gw .gdanger button { font-size: 12.5px; color: var(--muted); }
  dialog.gw .win-foot .grow { flex: 1; }
  @media (max-width: 860px) { .garagebtn .gl { display: none; } }`;
  // theme change: the 3D studio and materials are built for light or dark, so redraw the strip and the showroom
  let themeT = 0, lastDark = null;
  function rethemed() {
    clearTimeout(themeT); themeT = setTimeout(() => {
      const dk = B3() && B3().isDark ? B3().isDark() : null; if (dk === lastDark) return; lastDark = dk;
      SP.job++; SP.busy = false; SP.cache.clear();
      if (SH.dlg && SH.dlg.open && SH.id) { SH.key = ""; showBike(SH.id); }
      if (J() && J().stage && J().stage() === "garage") render();
    }, 80);
  }
  function init() {
    const a = A(); if (!a || !J()) return;
    try { lastDark = B3() && B3().isDark ? B3().isDark() : null; } catch (e) {}
    window.addEventListener("cycliclabs:theme", rethemed);
    new MutationObserver(rethemed).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    // header button, right after "Bike ▾"
    const b = document.createElement("button"); b.type = "button"; b.id = "btnGarage"; b.className = "garagebtn"; b.title = "Your garage: the bikes you own, modelled for reference";
    b.innerHTML = `🏠<span class="gl"> Garage</span>`;
    b.onclick = () => J().go(J().stage && J().stage() === "garage" ? (J()._store().projects[a.currentId()] || {}).stage || "design" : "garage");
    const bike = document.getElementById("btnBike"); bike.parentNode.insertBefore(b, bike.nextSibling);
    // "Your bikes" panel: a way in from there too
    const nb = document.getElementById("btnNew"); if (nb) { const g = document.createElement("button"); g.type = "button"; g.id = "btnToGarage"; g.textContent = "🏠 Add to my garage"; g.title = "Copy this bike into your garage (the bikes you own)"; g.onclick = () => { const r = addCurrent(); if (r && /already/.test(r)) a.toast(r); }; nb.parentNode.appendChild(g); }
    myDesign();
    // design chat + guided tour
    if (root.FrameChat && Array.isArray(root.FrameChat.extra)) root.FrameChat.extra.push(chat);
    try { const T = root.FrameTour && root.FrameTour.TOURS && root.FrameTour.TOURS.basics;
      if (T) { const step = { sel: "#btnGarage", title: "Your garage", text: "The bikes you own (or have ridden), modelled once from their geometry charts and kept for reference: their numbers side by side with your design, one as a see-through ghost over your new bike, or a new design started from the one that fits best. Worth it even if you aren't building anything yet." };
        const i = T.findIndex(x => x.sel === "#btnJournal"); T.splice(i >= 0 ? i + 1 : T.length - 1, 0, step); } } catch (e) {}
  }
  root.FrameGarage = { openShow, showBike, _show: SH, _sprite: SP, render, bikes, isGarage, addBuilt, addCurrent, openAdd, openDetails, newFrom, overlay, view, exportGarage, importGarage, designBanner, bindBanner, sideSvg, nums, chat, _ui: ui };
  init();
})(window);
