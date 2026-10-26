// ============================================================================
//  "SCAN A DRAWING" SCREEN (scanui.js)
//  Upload a frame drawing (PDF, PNG, JPG, phone photo) → the scanner reads it
//  → a review screen shows every value next to where it was found on the
//  drawing → the user confirms / fixes → "Create design" saves a new design.
//  Needs: drawscan.js, ocr.js and the app's window.CyclicLabsApp hooks.
// ============================================================================
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = `
  dialog.scan { width: min(1400px, calc(100vw - 24px)); max-width: none; height: min(920px, calc(100vh - 24px)); max-height: none; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--ink); }
  dialog.scan::backdrop { background: rgba(10, 12, 16, .55); }
  .scan-wrap { display: flex; flex-direction: column; height: 100%; }
  .scan-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .scan-head h2 { font-size: 20px; flex: 1; }
  .scan-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(330px, 1fr); }
  .scan-body.single { grid-template-columns: minmax(0, 1fr); }
  @media (max-width: 860px) { .scan-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(260px, 45%) minmax(0, 1fr); } }
  .scan-drop { margin: auto; width: min(640px, 100%); padding: 36px 24px; border: 2px dashed var(--line); border-radius: 12px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center; }
  .scan-drop.over { border-color: var(--accent); background: var(--accent-soft); }
  .scan-drop .big { font: 600 20px var(--font-display); }
  .scan-start { display: flex; flex-direction: column; padding: 24px; gap: 16px; overflow: auto; }
  .scan-start .row { display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; font-size: 14px; }
  .scan-start select { width: auto; max-width: 100%; }
  .scan-prog { margin: auto; width: min(520px, 100%); display: flex; flex-direction: column; gap: 10px; text-align: center; padding: 24px; }
  .scan-prog .track { height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
  .scan-prog .fill { height: 100%; width: 0; background: var(--accent); }
  .scan-view { position: relative; overflow: hidden; background: #fff; border-right: 1px solid var(--line); touch-action: none; min-height: 0; }
  .scan-view canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; }
  .scan-view canvas.picking { cursor: crosshair; }
  .scan-view .vbar { position: absolute; left: 8px; top: 8px; display: flex; gap: 6px; z-index: 2; flex-wrap: wrap; }
  .scan-view .vbar button { box-shadow: 0 1px 4px rgba(0,0,0,.15); }
  .scan-view .pickmsg { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); background: var(--accent); color: var(--on-accent); padding: 6px 12px; border-radius: 6px; font-size: 13.5px; z-index: 2; box-shadow: 0 2px 8px rgba(0,0,0,.2); max-width: calc(100% - 20px); }
  .scan-side { display: flex; flex-direction: column; min-height: 0; }
  .scan-list { flex: 1; overflow: auto; padding: 4px 0 8px; }
  .scan-list h4 { font: 600 12px var(--font-body); color: var(--muted); text-transform: uppercase; letter-spacing: .07em; margin: 12px 16px 4px; }
  .srow { display: grid; grid-template-columns: 10px minmax(0, 1fr) 84px 28px 26px; gap: 6px; align-items: center; padding: 4px 12px 4px 16px; font-size: 14px; border-left: 3px solid transparent; }
  .srow:hover { background: color-mix(in srgb, var(--accent) 5%, transparent); }
  .srow.sel { background: var(--accent-soft); border-left-color: var(--accent); }
  .srow .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--line); }
  .srow .dot.ok { background: var(--ok); } .srow .dot.warn { background: var(--warn); } .srow .dot.man { background: var(--accent); }
  .srow .lab { min-width: 0; cursor: pointer; }
  .srow .lab small { display: block; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .srow input { font-family: var(--font-data); font-size: 13px; text-align: right; width: 100%; padding: 4px 6px; }
  .srow .u { color: var(--muted); font: 12px var(--font-data); }
  .srow button { padding: 3px 0; font-size: 13px; }
  .scan-checks { padding: 8px 16px; border-top: 1px solid var(--line); font-size: 13.5px; display: flex; flex-direction: column; gap: 4px; max-height: 30%; overflow: auto; }
  .scan-checks .ck { display: flex; gap: 8px; align-items: baseline; }
  .scan-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--line); }
  .scan-foot input { flex: 1 1 220px; }
  .scan-legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12.5px; color: var(--muted); padding: 8px 16px 0; }
  .scan-legend span::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; background: var(--c); }
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const GROUPS = [
    ["Geometry", p => p.startsWith("geometry.")],
    ["Tubes", p => p.startsWith("tubes.")],
    ["From the drawing, for checking only", p => p.startsWith("check.")]
  ];
  const get = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

  let dlg = null, S = null;   // S = scan session state
  const scReviewPref = () => { try { return localStorage.getItem("frameBench.scanReview") !== "0"; } catch (e) { return true; } };

  // open({ base: { id, name, design } }): start from a design that isn't saved yet (the New-bike walkthrough's clean template)
  let extraBase = null;
  function open(opts) {
    const App = window.CyclicLabsApp;
    extraBase = opts && opts.base ? opts.base : null;
    if (!dlg) {
      dlg = document.createElement("dialog"); dlg.className = "scan"; dlg.setAttribute("aria-label", "Scan a frame drawing");
      document.body.appendChild(dlg);
      dlg.addEventListener("close", () => { S = null; });
    }
    const list = (extraBase ? [extraBase] : []).concat(App.allDesigns());
    const selId = extraBase ? extraBase.id : App.currentId();
    dlg.innerHTML = `<div class="scan-wrap">
      <div class="scan-head"><h2>Scan a frame drawing</h2><button type="button" data-x>Close</button></div>
      <div class="scan-body single"><div class="scan-start">
        <div class="scan-drop" id="scDrop">
          <div class="big">Drop the drawing here</div>
          <p class="hint" style="max-width:46ch">The PDF your builder sent works best. A screenshot or a straight-on photo of the sheet works too. Everything stays on this computer.</p>
          <button type="button" class="primary" id="scPick">Choose a file…</button>
          <input type="file" id="scFile" accept=".pdf,application/pdf,image/*" hidden>
        </div>
        <div class="row"><label for="scBase">Start from</label><select id="scBase">${list.map(d => `<option value="${esc(d.id)}"${d.id === selId ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>
        <p class="hint" style="text-align:center">Numbers found on the drawing replace that design's numbers. Everything the drawing doesn't show (rider, parts, riding, materials, stay shapes) is kept from the design you start from.</p>
        ${window.FrameDrawMatch ? `<p class="hint" style="text-align:center">Blurry photo, or would rather type? <button type="button" id="scType">Type the numbers in instead</button></p>` : ""}
      </div></div></div>`;
    dlg.querySelector("[data-x]").onclick = () => dlg.close();
    const typeIt = () => { const id = dlg.querySelector("#scBase") ? dlg.querySelector("#scBase").value : null, base = extraBase && extraBase.id === id ? extraBase : null; dlg.close(); window.FrameDrawMatch.open(base ? { base } : undefined); };
    if (dlg.querySelector("#scType")) dlg.querySelector("#scType").onclick = typeIt;
    const drop = dlg.querySelector("#scDrop"), fi = dlg.querySelector("#scFile");
    dlg.querySelector("#scPick").onclick = () => fi.click();
    fi.onchange = () => { if (fi.files[0]) start(fi.files[0]); };
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) start(f); });
    if (!dlg.open) dlg.showModal();
  }

  async function start(file) {
    const App = window.CyclicLabsApp;
    const baseId = dlg.querySelector("#scBase").value;
    const baseD = (extraBase && extraBase.id === baseId ? extraBase : null) || App.allDesigns().find(d => d.id === baseId) || App.allDesigns()[0];
    const body = dlg.querySelector(".scan-body");
    body.innerHTML = `<div class="scan-prog"><div class="big" style="font:600 18px var(--font-display)">Reading ${esc(file.name)}</div>
      <div class="track"><div class="fill" id="scFill"></div></div><div class="hint" id="scMsg">Starting…</div>
      <p class="hint">Takes about 20–40 seconds. The first scan also loads the text reader.</p></div>`;
    const fill = body.querySelector("#scFill"), msg = body.querySelector("#scMsg");
    const runId = {}; S = { runId };
    try {
      const r = await window.FrameOCR.scanFile(file, (t, f) => { if (S && S.runId === runId) { msg.textContent = t; if (f != null) fill.style.width = Math.round(f * 100) + "%"; } });
      if (!S || S.runId !== runId) return;
      S = Object.assign(S, r, { file, base: baseD, values: {}, src: {}, sel: null, picking: null, view: null });
      for (const [p, k] of Object.entries(r.picks)) { S.values[p] = k.value; S.src[p] = k.score >= 0.6 ? "ok" : "warn"; }
      review();
    } catch (e) {
      console.error(e);
      body.innerHTML = `<div class="scan-prog"><div class="big" style="font:600 18px var(--font-display)">That didn't work</div><p>${esc(e.message || e)}</p><div><button type="button" id="scAgain">Try another file</button>${window.FrameDrawMatch ? ` <button type="button" id="scType2">Type the numbers in instead</button>` : ""}</div></div>`;
      body.querySelector("#scAgain").onclick = open;
      if (body.querySelector("#scType2")) body.querySelector("#scType2").onclick = () => { const b = extraBase; dlg.close(); window.FrameDrawMatch.open(b ? { base: b } : undefined); };
    }
  }

  // ---------------------------------------------------------------- review
  function fieldList() {
    const DS = window.DrawScan, out = DS.FIELDS.slice();
    for (const t of ["topTube", "downTube", "seatTube"]) if (S.picks[`tubes.${t}.buttWall`]) {
      const i = out.findIndex(f => f[0] === `tubes.${t}.wall`);
      out.splice(i + 1, 0, [`tubes.${t}.buttWall`, out[i][1].replace("wall", "wall at the ends (butted)"), "mm"], [`tubes.${t}.buttLength`, out[i][1].replace("wall", "thick-end length"), "mm"]);
      out[i] = [out[i][0], out[i][1] + " (middle)", "mm"];
    }
    return out;
  }

  function review() {
    const App = window.CyclicLabsApp;
    const body = dlg.querySelector(".scan-body"); body.classList.remove("single");
    const found = Object.keys(S.picks).filter(p => !p.startsWith("check.")).length;
    const name = (S.info.model || S.file.name.replace(/\.[^.]+$/, "")) + " (scanned)";
    body.innerHTML = `
      <div class="scan-view" id="scView"><canvas id="scCan"></canvas>
        <div class="vbar"><button type="button" data-z="1.4">＋</button><button type="button" data-z="0.7">－</button><button type="button" data-fit>Fit</button></div>
        <div class="pickmsg" id="scPickMsg" hidden></div></div>
      <div class="scan-side">
        <p class="hint" style="padding:10px 16px 0">Found ${found} values. <b>Check each one against the drawing</b>: click a row to see where it came from. Fix a number by typing, or press ◎ and click the right number on the drawing.</p>
        <div class="scan-legend"><span style="--c:var(--ok)">read clearly</span><span style="--c:var(--warn)">please check</span><span style="--c:var(--accent)">set by you</span><span style="--c:var(--line)">not found (keeps the start design's value)</span></div>
        <div class="scan-list" id="scList"></div>
        <div class="scan-checks" id="scChecks"></div>
        <div class="scan-foot">
          <input id="scName" aria-label="New design name" value="${esc(name)}">
          <label class="hint" style="display:flex;gap:6px;align-items:center;flex:1 1 100%" title="A list to go through the drawing item by item and send changes back to the builder"><input type="checkbox" id="scReview"${scReviewPref() ? " checked" : ""}> Open the drawing checklist next (tick, note and email changes back)</label>
          <button type="button" id="scBack">Scan another</button>
          <button type="button" class="primary" id="scCreate">Create design</button>
        </div>
      </div>`;
    body.querySelector("#scBack").onclick = open;
    body.querySelector("#scCreate").onclick = create;
    renderList(); setupView(); renderChecks();
  }

  function renderList() {
    const list = dlg.querySelector("#scList"), base = S.base.design;
    const fields = fieldList();
    let html = "";
    for (const [title, test] of GROUPS) {
      const fs = fields.filter(f => test(f[0])); if (!fs.length) continue;
      html += `<h4>${title}</h4>`;
      for (const [p, label, unit] of fs) {
        const v = S.values[p], has = v !== undefined && v !== null && v !== "";
        const cls = !has ? "" : S.src[p] === "man" ? "man" : S.src[p] === "ok" ? "ok" : "warn";
        const bv = p.startsWith("check.") ? null : baseShown(p, base);
        const pk = S.picks[p];
        const sub = has ? (pk && pk.word != null && S.src[p] !== "man" ? `read “${esc(S.words[pk.word].text)}”` : "typed") + (bv != null && +bv !== +v ? ` · was ${esc(bv)}` : "")
                        : (bv != null ? `not on the drawing · keeps ${esc(bv)}` : "not on the drawing");
        html += `<div class="srow${S.sel === p ? " sel" : ""}" data-p="${p}">
          <span class="dot ${cls}" title="${cls === "ok" ? "Read clearly" : cls === "warn" ? "Please check" : cls === "man" ? "Set by you" : "Not found"}"></span>
          <span class="lab" tabindex="0">${esc(label)}<small>${sub}${pk && pk.note ? " · " + esc(pk.note) : ""}</small></span>
          <input type="number" step="any" value="${has ? esc(v) : ""}" placeholder="${bv != null ? esc(bv) : "—"}" aria-label="${esc(label)}">
          <span class="u">${esc(unit)}</span>
          <button type="button" title="Pick this value on the drawing" aria-label="Pick ${esc(label)} on the drawing">◎</button>
        </div>`;
      }
    }
    list.innerHTML = html;
    list.querySelectorAll(".srow").forEach(row => {
      const p = row.dataset.p;
      row.querySelector(".lab").onclick = () => select(p);
      row.querySelector(".lab").onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(p); } };
      const inp = row.querySelector("input");
      inp.onfocus = () => select(p, true);
      inp.oninput = () => {
        const x = parseFloat(inp.value);
        if (inp.value.trim() === "") { delete S.values[p]; delete S.src[p]; } else if (isFinite(x)) { S.values[p] = x; S.src[p] = "man"; }
        const dot = row.querySelector(".dot"); dot.className = "dot " + (S.values[p] === undefined ? "" : "man");
        renderChecks();
      };
      row.querySelector("button").onclick = () => startPick(p);
    });
  }
  function baseShown(p, base) {
    if (p === "geometry.ttAtSeatTube") { const g = base.geometry; return g ? +(g.seatTube - g.ttAtSeatTube).toFixed(1) : null; }
    if (p === "tubes.seatpost.fit") { const sp = base.tubes && base.tubes.seatpost; const pre = sp && window.FrameFEA.SEATPOSTS[sp.type]; return pre && pre.fit ? pre.fit : sp ? sp.od : null; }
    if (p === "geometry.stayWidthAtDropout") return base.geometry ? base.geometry.stayWidthAtDropout : null;
    const v = get(base, p); return v === undefined ? null : v;
  }

  function select(p, noScroll) {
    S.sel = p;
    dlg.querySelectorAll(".srow").forEach(r => r.classList.toggle("sel", r.dataset.p === p));
    const pk = S.picks[p];
    if (pk && pk.word != null && S.src[p] !== "man") focusWord(pk.words || [pk.word]);
    draw();
  }

  // ---------------------------------------------------------------- picking on the drawing
  function startPick(p) {
    S.picking = p; select(p, true);
    const m = dlg.querySelector("#scPickMsg"); m.hidden = false;
    const label = (fieldList().find(f => f[0] === p) || [, p])[1];
    m.textContent = `Click the number for “${label}” on the drawing (Esc to cancel)`;
    dlg.querySelector("#scCan").classList.add("picking");
  }
  function endPick() { S.picking = null; const m = dlg.querySelector("#scPickMsg"); if (m) m.hidden = true; const c = dlg.querySelector("#scCan"); if (c) c.classList.remove("picking"); }
  function valueFor(p, w) {
    const t = w.tok, alt = t.alt;
    const dia = t.kind === "dia" ? t.value : alt && alt.kind === "dia" ? alt.value : null;
    if (p.endsWith(".od") && t.kind === "tube") return t.od;
    if (p.endsWith(".wall") && t.kind === "tube") return t.wall;
    if (p === "tubes.chainstay.ovalH" && t.oval) return t.oval.h;
    if (p === "tubes.chainstay.ovalW" && t.oval) return t.oval.w;
    if (p === "tubes.chainstay.taperOD" && t.kind === "taper") return t.od;
    if (p === "tubes.chainstay.taperLength" && t.kind === "taper") return t.length;
    if ((p === "geometry.tireDiameter" || p === "tubes.headTube.od" || p === "tubes.seatpost.fit") && dia != null) return dia;
    if (p === "geometry.stayWidthAtDropout" && t.value) return t.value > 140 ? t.value - 16 : t.value;
    if (t.value != null && isFinite(t.value)) return t.value;
    if (t.kind === "tube") return t.od;
    return null;
  }
  function pickWord(i) {
    const p = S.picking, w = S.words[i]; if (!p || !w) return;
    const v = valueFor(p, w);
    if (v == null) { flash(`Couldn't read a number there (“${w.text}”). Type it in instead.`); return; }
    S.values[p] = v; S.src[p] = "man"; S.picks[p] = Object.assign({}, S.picks[p] || {}, { word: i, value: v });
    // a tube callout carries both numbers
    const m = p.match(/^tubes\.(\w+)\.(od|wall)$/);
    if (m && w.tok.kind === "tube") { const other = `tubes.${m[1]}.${m[2] === "od" ? "wall" : "od"}`; S.values[other] = m[2] === "od" ? w.tok.wall : w.tok.od; S.src[other] = "man"; S.picks[other] = { word: i, value: S.values[other] }; }
    endPick(); renderList(); renderChecks(); draw();
  }
  function flash(t) { const m = dlg.querySelector("#scPickMsg"); m.hidden = false; m.textContent = t; clearTimeout(flash.h); flash.h = setTimeout(() => { if (!S || !S.picking) m.hidden = true; else startPick(S.picking); }, 2600); }

  // ---------------------------------------------------------------- drawing view (zoom & pan)
  function setupView() {
    const wrap = dlg.querySelector("#scView"), can = dlg.querySelector("#scCan");
    S.view = { k: 1, x: 0, y: 0 };
    const fit = () => { const r = wrap.getBoundingClientRect(); const k = Math.min(r.width / S.canvas.width, r.height / S.canvas.height); S.view = { k, x: (r.width - S.canvas.width * k) / 2, y: (r.height - S.canvas.height * k) / 2 }; draw(); };
    S.fit = fit;
    new ResizeObserver(() => { if (S && S.view) { if (!S.fitted) { S.fitted = true; fit(); } else draw(); } }).observe(wrap);
    wrap.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { const r = wrap.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, +b.dataset.z); });
    wrap.querySelector("[data-fit]").onclick = fit;
    can.addEventListener("wheel", e => { e.preventDefault(); const r = can.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    let drag = null, moved = 0;
    can.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, vx: S.view.x, vy: S.view.y }; moved = 0; can.setPointerCapture(e.pointerId); });
    can.addEventListener("pointermove", e => {
      if (!drag) { hover(e); return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved = Math.max(moved, Math.hypot(dx, dy));
      if (moved > 4) { S.view.x = drag.vx + dx; S.view.y = drag.vy + dy; draw(); }
    });
    can.addEventListener("pointerup", e => {
      const was = drag; drag = null; if (!was || moved > 4) return;
      const r = can.getBoundingClientRect(), i = hit(e.clientX - r.left, e.clientY - r.top);
      if (S.picking) { if (i >= 0) pickWord(i); return; }
      if (i >= 0) {
        // clicking a number: show which field uses it
        const p = Object.keys(S.picks).find(q => S.picks[q].word === i && S.src[q] !== "man");
        if (p) { select(p); const row = dlg.querySelector(`.srow[data-p="${p}"]`); if (row) row.scrollIntoView({ block: "nearest" }); }
      }
    });
    dlg.addEventListener("keydown", e => { if (e.key === "Escape" && S && S.picking) { e.preventDefault(); endPick(); } });
  }
  function zoomAt(px, py, f) { const v = S.view, k2 = Math.max(0.05, Math.min(6, v.k * f)); v.x = px - (px - v.x) * k2 / v.k; v.y = py - (py - v.y) * k2 / v.k; v.k = k2; draw(); }
  function hit(px, py) {
    const v = S.view, x = (px - v.x) / v.k, y = (py - v.y) / v.k, pad = 6 / v.k;
    let best = -1, bd = 1e9;
    S.words.forEach((w, i) => {
      const b = w.box; if (x < b[0] - pad || x > b[2] + pad || y < b[1] - pad || y > b[3] + pad) return;
      const d = Math.hypot(x - (b[0] + b[2]) / 2, y - (b[1] + b[3]) / 2); if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function hover(e) { const can = dlg.querySelector("#scCan"), r = can.getBoundingClientRect(), i = hit(e.clientX - r.left, e.clientY - r.top); if (i !== S.hover) { S.hover = i; draw(); } can.title = i >= 0 ? `Read: “${S.words[i].text}”` : ""; }
  function focusWord(ids) {
    const wrap = dlg.querySelector("#scView"), r = wrap.getBoundingClientRect();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const i of ids) { const b = S.words[i].box; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    const k = Math.min(1.6, Math.max(S.view.k, Math.min(r.width / (x1 - x0 + 900), r.height / (y1 - y0 + 650))));
    S.view = { k, x: r.width / 2 - (x0 + x1) / 2 * k, y: r.height / 2 - (y0 + y1) / 2 * k };
  }
  function draw() {
    const can = dlg && dlg.querySelector("#scCan"); if (!can || !S || !S.view) return;
    const dpr = window.devicePixelRatio || 1, r = can.getBoundingClientRect();
    can.width = Math.round(r.width * dpr); can.height = Math.round(r.height * dpr);
    const ctx = can.getContext("2d"), v = S.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, r.width, r.height);
    ctx.save(); ctx.translate(v.x, v.y); ctx.scale(v.k, v.k);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(S.canvas, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue("--accent").trim() || "#6a3fb5", ok = "#2f7d5b", warn = "#b7791f";
    const used = new Map();
    for (const [p, k] of Object.entries(S.picks)) if (k.word != null && S.values[p] !== undefined) for (const i of (k.words || [k.word])) used.set(i, (used.get(i) || []).concat(p));
    const labelOf = p => (fieldList().find(f => f[0] === p) || [, p])[1];
    S.words.forEach((w, i) => {
      const b = w.box, u = used.get(i), isSel = u && u.includes(S.sel), isHover = i === S.hover;
      const readable = w.tok && w.tok.kind !== "junk";
      if (!u && !isHover && !(S.picking && readable)) return;
      const pad = 4;
      ctx.lineWidth = (isSel ? 4 : 2) / Math.min(1, v.k) * 0.6;
      ctx.strokeStyle = isSel ? accent : u ? (u.some(p => S.src[p] === "man") ? accent : u.every(p => S.src[p] === "ok") ? ok : warn) : isHover ? accent : "rgba(106,63,181,.35)";
      ctx.fillStyle = isSel ? "rgba(106,63,181,.12)" : "rgba(0,0,0,0)";
      ctx.fillRect(b[0] - pad, b[1] - pad, b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad);
      ctx.strokeRect(b[0] - pad, b[1] - pad, b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad);
      if (u && (isSel || v.k > 0.28)) {
        const t = u.map(labelOf).join(" · "), fs = Math.max(13, 13 / v.k * 0.9);
        ctx.font = `600 ${fs}px system-ui, sans-serif`;
        const tw = ctx.measureText(t).width;
        ctx.fillStyle = isSel ? accent : "rgba(27,35,48,.82)";
        ctx.fillRect(b[0] - pad, b[1] - pad - fs * 1.35, tw + fs * 0.6, fs * 1.35);
        ctx.fillStyle = "#fff"; ctx.fillText(t, b[0] - pad + fs * 0.3, b[1] - pad - fs * 0.35);
      }
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- the new design + cross-checks
  function buildDesign() {
    const App = window.CyclicLabsApp, DS = window.DrawScan, FEA = window.FrameFEA;
    const picks = {};
    for (const [p, v] of Object.entries(S.values)) if (v !== undefined && v !== null && isFinite(+v)) picks[p] = { value: +v };
    const ch = DS.toChanges(picks, S.base.design);
    const d = FEA.deepMerge(S.base.design, ch);
    // a butted tube needs both the end wall and a length
    for (const t of ["topTube", "downTube", "seatTube"]) { const tb = d.tubes[t]; if (tb && tb.buttWall && !(tb.buttLength > 0)) tb.buttLength = 120; if (tb && tb.buttWall && tb.buttWall <= tb.wall) { delete tb.buttWall; delete tb.buttLength; } }
    return { d, ch };
  }
  function renderChecks() {
    const box = dlg.querySelector("#scChecks"); if (!box) return;
    const FEA = window.FrameFEA; let html = "";
    try {
      const { d } = buildDesign();
      const geo = FEA.buildGeometry(FEA.deepMerge(window.FRAME_DEFAULTS.geometry, d.geometry), d.tubes);
      const info = geo.info, rows = [];
      const cmp = (label, mine, drawn, tol) => {
        if (drawn == null || !isFinite(drawn)) { rows.push(`<div class="ck"><span class="pill">${esc(label)}</span><span>${mine.toFixed(1)} mm from these numbers</span></div>`); return; }
        const dlt = mine - drawn, okk = Math.abs(dlt) <= tol;
        rows.push(`<div class="ck"><span class="pill ${okk ? "ok" : "warn"}">${okk ? "✓" : "check"} ${esc(label)}</span><span>${mine.toFixed(1)} from these numbers vs ${drawn} on the drawing (${dlt >= 0 ? "+" : ""}${dlt.toFixed(1)})</span></div>`);
      };
      cmp("Wheelbase", info.wheelbase, S.values["check.wheelbase"], 4);
      if (S.values["check.frontCentre"] != null) cmp("Front centre", info.frontCentre, S.values["check.frontCentre"], 4);
      if (S.values["check.ett"] != null) cmp("Effective top tube", info.effectiveTopTube, S.values["check.ett"], 4);
      const fa = info.frontAxleHeight - d.geometry.bbDrop;
      rows.push(`<div class="ck"><span class="pill ${Math.abs(fa) <= 4 ? "ok" : "warn"}">${Math.abs(fa) <= 4 ? "✓" : "check"} Front axle height</span><span>${Math.abs(fa) <= 4 ? "level with the rear axle" : `${fa > 0 ? fa.toFixed(1) + " mm above" : (-fa).toFixed(1) + " mm below"} the rear axle — stack, head tube, fork length or angles may be off`}</span></div>`);
      try { FEA.validate(d); rows.push(`<div class="ck"><span class="pill ok">✓ Valid</span><span>Cyclic Labs can analyse this design.</span></div>`); }
      catch (e) { rows.push(`<div class="ck"><span class="pill bad">Fix</span><span>${esc(e.message)}</span></div>`); }
      html = rows.join("");
    } catch (e) { html = `<div class="ck"><span class="pill bad">Fix</span><span>${esc(e.message || e)}</span></div>`; }
    box.innerHTML = `<div class="sub-h" style="margin:0">Does it add up?</div>` + html;
  }
  function create() {
    const App = window.CyclicLabsApp, FEA = window.FrameFEA;
    const { d } = buildDesign();
    try { FEA.validate(d); } catch (e) { flash("Fix this first: " + e.message); return; }
    const name = (dlg.querySelector("#scName").value || "Scanned drawing").trim();
    const found = Object.keys(S.values).filter(p => !p.startsWith("check."));
    const notes = `Scanned from ${S.file.name}${S.info.model ? " (" + S.info.model + ")" : ""} on ${new Date().toISOString().slice(0, 10)}, starting from “${S.base.name}”. ${found.length} values from the drawing (${found.filter(p => S.src[p] === "man").length} set by hand); everything else kept from the start design.`;
    const box = dlg.querySelector("#scReview"), wantReview = !!(box && box.checked && window.FrameReview);
    try { localStorage.setItem("frameBench.scanReview", box && box.checked ? "1" : "0"); } catch (e) {}
    // what the drawing says, in the drawing's own terms, plus what the start design (what you asked for) had
    let review = null;
    if (wantReview) {
      const fields = {};
      for (const [p, label, unit] of fieldList()) {
        const v = S.values[p], has = v !== undefined && v !== null && v !== "" && isFinite(+v);
        fields[p] = { label, unit, value: has ? +v : null, conf: has ? S.src[p] : null, asked: p.startsWith("check.") ? null : baseShown(p, S.base.design) };
      }
      review = { designName: name, file: S.file.name, model: S.info.model || "", baseName: S.base.name, fields, snapshot: d };
    }
    const id = App.createDesign(name, notes, d);
    dlg.close();
    if (review) window.FrameReview.startFromScan(Object.assign(review, { designId: id }));
  }

  window.FrameScanUI = { open };
})();
