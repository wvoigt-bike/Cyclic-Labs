// ============================================================================
//  DRAWING CHECKLIST (review.js)
//  A running checklist for going through a builder's drawing (any builder
//  drawings especially). Opens by itself after "Scan a drawing" (optional
//  tick box), or any time from the "Drawing checklist" button.
//
//  Each item gets one of:  ✓ Looks right · ? Ask · ✎ Change  plus a note,
//  and number items take a "change to" value. "Export change request" turns
//  every Ask / Change into a plain email you can copy, open in your mail app
//  or download, to send back to the builder.
//
//  What the list is made of:
//   1. Numbers the scanner read off the drawing (flagged when they differ
//      from the design you scanned it against, i.e. what you asked for)
//   2. Numbers the scanner didn't find (look for them / ask)
//   3. "Does the drawing add up?" (wheelbase, ETT, front centre, axle height
//      worked out from the drawing's own numbers vs the printed ones)
//   4. Changes you have made in Cyclic Labs since the scan (auto "Change")
//   5. Cyclic Labs builder checks that warn or fail (checks.js)
//   6. Things to confirm with the builder (standards, mounts, routing...)
//   7. Before you approve (weld photos, revision, small parts)
//   8. Your own items
//  Storage: one checklist per design, in this browser
//  (localStorage "frameBench.review.<design id>"); "Save checklist file"
//  keeps a copy. Nothing here changes the design itself.
//  Needs: page.html's window.CyclicLabsApp, fea.js, checks.js, drawscan.js.
// ============================================================================
(function (root) {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const get = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
  const clone = o => JSON.parse(JSON.stringify(o));
  // rider set-up and parts, not something to ask the builder to change on the frame
  const NOT_FRAME = /forkBaseA2C$|\.(saddleHeight|saddleSetback|saddleStack|seatpostLength|cog|crankLength|footOffset|lowerCupStack)$/;
  const KEY = id => "frameBench.review." + id;
  const App = () => root.CyclicLabsApp;
  const num = v => v !== undefined && v !== null && v !== "" && isFinite(+v);
  const same = (a, b) => num(a) && num(b) ? Math.abs(+a - +b) < 0.05 : String(a) === String(b);
  const fmtN = v => num(v) ? String(+(+v).toFixed(2)) : v == null || v === "" ? "—" : String(v);

  // ---------------------------------------------------------------- storage
  function load(id) { try { const r = JSON.parse(localStorage.getItem(KEY(id)) || "null"); return r && r.v === 1 ? r : null; } catch (e) { return null; } }
  function save(rev) { try { localStorage.setItem(KEY(rev.designId), JSON.stringify(rev)); return true; } catch (e) { return false; } }
  function listAll() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("frameBench.review.")) { const r = load(k.slice(18)); if (r) out.push(r); } } } catch (e) {}
    return out;
  }
  function fresh(designId, designName, design) {
    return { v: 1, designId, designName, created: new Date().toISOString(), drawing: { file: "", model: "" }, who: "", drawn: null, snapshot: clone(design), items: {}, custom: [], includeOk: false };
  }

  // A design value in the drawing's terms (the drawing gives the top-tube joint below the seat-tube top, the post as a size)
  function inDrawingTerms(d, p) {
    if (!d) return null;
    if (p === "geometry.ttAtSeatTube") { const g = d.geometry; return g && num(g.seatTube) && num(g.ttAtSeatTube) ? +(g.seatTube - g.ttAtSeatTube).toFixed(1) : null; }
    if (p === "tubes.seatpost.fit") { const sp = d.tubes && d.tubes.seatpost, FEA = root.FrameFEA; const pre = sp && FEA && FEA.SEATPOSTS && FEA.SEATPOSTS[sp.type]; return pre && pre.fit ? pre.fit : sp ? sp.od : null; }
    const v = get(d, p); return v === undefined ? null : v;
  }

  // analysis of the design as it is now (the app's own result can lag ~0.2 s behind an edit or a design switch)
  let rCache = { key: null, r: null };
  function resultFor(d) {
    const key = JSON.stringify(d);
    if (rCache.key !== key) { let r = null; try { r = root.FrameFEA.analyze(d); } catch (e) { r = null; } rCache = { key, r }; }
    return rCache.r;
  }

  // ---------------------------------------------------------------- the list
  // item: { id, title, detail, value, unit, numeric, flag: "warn"|"bad"|null, suggest: { state, want }, src }
  function sections(rev) {
    const A = App(), d = A.design(), FEA = root.FrameFEA, DS = root.DrawScan;
    const out = [];
    const g = d.geometry || {}, t = d.tubes || {};

    // 1 + 2. numbers on the drawing / not found
    if (rev.drawn) {
      const found = [], missing = [];
      for (const [p, e] of Object.entries(rev.drawn.fields)) {
        if (p.startsWith("check.")) continue;
        if (e.value == null) {
          missing.push({ id: "miss:" + p, title: e.label, detail: `The scanner didn't read this. Look for it on the drawing; if it isn't there, ask.${e.asked != null ? ` Your design has ${fmtN(e.asked)} ${e.unit}.` : ""}`, unit: e.unit, numeric: true, value: null });
          continue;
        }
        const differs = e.asked != null && !same(e.asked, e.value);
        const conf = e.conf === "warn" ? " The scanner wasn't sure about this one, so compare it with the drawing." : e.conf === "man" ? " You set this by hand on the scan screen." : "";
        found.push({ id: "num:" + p, title: e.label, value: e.value, unit: e.unit, numeric: true,
          flag: differs ? "warn" : e.conf === "warn" ? "warn" : null,
          badge: differs ? `you had ${fmtN(e.asked)}` : e.conf === "warn" ? "check the reading" : null,
          detail: (differs ? `Differs from “${rev.drawn.baseName}”, the design you scanned it against, which had ${fmtN(e.asked)} ${e.unit}. Was this deliberate?` : e.asked != null ? `Same as your design “${rev.drawn.baseName}”.` : "Compare it with the drawing.") + conf,
          suggestWant: differs ? e.asked : null });
      }
      found.sort((a, b) => (b.flag ? 1 : 0) - (a.flag ? 1 : 0));
      out.push({ id: "drawn", title: "Numbers on the drawing", intro: `Read from ${esc(rev.drawing.file || "the drawing")}. Compare each with the drawing and with what you asked for. Flagged ones differ from the design you scanned against or were hard to read.`, items: found });
      if (missing.length) out.push({ id: "missing", title: "Not read from the drawing", collapsed: true, intro: "The scanner didn't find these. Many builders' drawings leave out stay and chainstay sizes, so it's worth asking for them.", items: missing });

      // 3. does it add up
      const add = [];
      try {
        const sd = rev.snapshot, info = FEA.buildGeometry(FEA.deepMerge(root.FRAME_DEFAULTS.geometry, sd.geometry), sd.tubes).info;
        const cmp = (key, label, mine) => {
          const drawn = rev.drawn.fields[key] && rev.drawn.fields[key].value;
          if (!num(drawn)) return;
          const dl = mine - drawn, ok = Math.abs(dl) <= 4;
          add.push({ id: "sum:" + key, title: `${label} adds up`, value: `${fmtN(drawn)} printed`, unit: "", flag: ok ? null : "bad", badge: ok ? null : `${dl >= 0 ? "+" : ""}${dl.toFixed(1)} mm`,
            detail: `Worked out from the drawing's other numbers: ${mine.toFixed(1)} mm; printed on the drawing: ${fmtN(drawn)} mm (${dl >= 0 ? "+" : ""}${dl.toFixed(1)}).${ok ? "" : " One of the angles or lengths may be drawn or read wrong. Ask which number is right."}` });
        };
        cmp("check.wheelbase", "Wheelbase", info.wheelbase);
        cmp("check.frontCentre", "Front centre", info.frontCentre);
        cmp("check.ett", "Effective top tube", info.effectiveTopTube);
        const fa = info.frontAxleHeight - sd.geometry.bbDrop, ok = Math.abs(fa) <= 4;
        add.push({ id: "sum:axle", title: "Front and rear axles at the same height", value: ok ? "level" : `${Math.abs(fa).toFixed(1)} mm ${fa > 0 ? "high" : "low"}`, unit: "", flag: ok ? null : "bad",
          detail: ok ? "Stack, head tube, fork length and angles fit together." : "With these numbers the front axle doesn't sit level with the rear. Stack, head tube length, fork length or one of the angles is probably off." });
      } catch (e) { add.push({ id: "sum:err", title: "Couldn't check the drawing's numbers", detail: String(e.message || e), flag: "warn" }); }
      out.push({ id: "adds", title: "Does the drawing add up?", intro: "Numbers worked out from the drawing compared with the ones printed on it. A mismatch usually means a drafting slip.", items: add });
    }

    // 4. changes made in Cyclic Labs since the scan / since the checklist started
    {
      const sd = rev.snapshot, items = [], seen = new Set();
      const drawnFields = rev.drawn ? rev.drawn.fields : {};
      for (const [p, e] of Object.entries(drawnFields)) {
        if (p.startsWith("check.")) continue;
        seen.add(p);
        const was = e.value != null ? e.value : inDrawingTerms(sd, p), now = inDrawingTerms(d, p);
        if (now == null || same(was, now)) continue;
        items.push({ id: "chg:" + p, title: e.label, value: `${fmtN(was)} → ${fmtN(now)}`, unit: e.unit, numeric: true, autoChange: true, suggestWant: now,
          detail: `${e.value != null ? "On the drawing" : "Before"}: ${fmtN(was)} ${e.unit}. In your Cyclic Labs design now: ${fmtN(now)} ${e.unit}.` });
      }
      let F = []; try { F = A.chatFields(); } catch (e) {}
      for (const f of F) {
        if (!/^(geometry|tubes)\./.test(f.id) || seen.has(f.id) || NOT_FRAME.test(f.id)) continue;
        const was = get(sd, f.id), now = get(d, f.id);
        if (was === undefined && now === undefined) continue;
        if (same(was, now)) continue;
        const show = v => f.kind === "select" ? ((f.options || []).find(o => String(o[0]) === String(v)) || [, v])[1] : fmtN(v);
        items.push({ id: "chg:" + f.id, title: f.label, value: `${show(was)} → ${show(now)}`, unit: f.unit || "", numeric: f.kind !== "select", autoChange: true, suggestWant: f.kind === "select" ? show(now) : now,
          detail: `Before: ${show(was)} ${f.unit || ""}. Now: ${show(now)} ${f.unit || ""}.` });
      }
      out.push({ id: "changes", title: rev.drawn ? "Changes you've made since the scan" : "Changes you've made since starting this checklist",
        intro: items.length ? "Edits to the design in Cyclic Labs. They're marked ✎ Change so they go into the change request; set one to ✓ if you don't want to ask for it." : "None yet. Edit the design in Cyclic Labs (or with the design chat) and the changes show up here, ready to send.", items });
    }

    // 5. Cyclic Labs checks
    {
      const res = resultFor(d), items = [];
      let passed = 0, note = "";
      if (res && root.FrameChecks) {
        try {
          const rows = root.FrameChecks.run(d, res);
          rows.forEach((r, i) => {
            if (r.status === "ok") { passed++; return; }
            if (r.status !== "fail" && r.status !== "warn") return;
            items.push({ id: "chk:" + r.group + ":" + r.item, title: r.item, value: r.value, unit: "", flag: r.status === "fail" ? "bad" : "warn", badge: r.status === "fail" ? "fails" : "check",
              detail: `Target: ${r.target}. ${r.note || ""}`, src: r.src });
          });
          items.sort((a, b) => (a.flag === "bad" ? 0 : 1) - (b.flag === "bad" ? 0 : 1));
        } catch (e) { note = "The builder checks couldn't run: " + (e.message || e); }
      } else note = "The builder checks run once the design analyses without errors.";
      out.push({ id: "checks", title: "Cyclic Labs checks", intro: (note ? esc(note) + " " : "") + (res ? `${passed} checks pass (full list in the Builder checklist card). These ones need a look:` : ""), items });
    }

    // 6. confirm with the builder
    {
      const hub = num(g.stayWidthAtDropout) ? +g.stayWidthAtDropout + 16 : null;
      const post = inDrawingTerms(d, "tubes.seatpost.fit");
      const ht = t.headTube || {};
      const tyre = num(g.tireWidth) ? `${fmtN(g.tireWidth)} mm wide` : "";
      const items = [
        ["bb", "Bottom bracket standard", `Shell drawn ${num(g.bbShellWidth) ? fmtN(g.bbShellWidth) + " mm wide" : "(width not set)"}. Is it T47, BSA threaded or press-fit, and does it suit your crank?`],
        ["rear", "Rear spacing and axle", `${hub ? `Your design is set for a ${fmtN(hub)} mm hub. ` : ""}Check the drawing says the hub you have (e.g. 148×12 Boost, 142×12, 135 QR) and the thru-axle thread.`],
        ["hanger", "Derailleur hanger / dropouts", "UDH (needed for SRAM Transmission), a frame-specific hanger, or sliders / an eccentric BB for singlespeed. Ask for a spare hanger."],
        ["brake", "Rear brake mount", "Post mount or flat mount, the rotor size it's set for, and the biggest rotor it allows."],
        ["fork", "Fork length and offset match your fork", `Drawn for ${num(g.forkA2C) ? fmtN(g.forkA2C) + " mm axle-to-crown" : "an axle-to-crown you should check"}${num(g.forkOffset) ? ` and ${fmtN(g.forkOffset)} mm offset` : ""}. Compare with your fork's spec sheet at the travel you'll run.`],
        ["headset", "Head tube and headset", `${num(ht.od) ? `Head tube about Ø${fmtN(ht.od)} mm. ` : ""}Which headset does it take (e.g. ZS44/ZS56 tapered, 44 mm straight, EC)? Is the headset included?`],
        ["post", "Seatpost size and collar", `${post ? `Seatpost ${fmtN(post)} mm in your design. ` : ""}Confirm the post size, the collar size, and where the stealth-dropper port goes.`],
        ["routing", "Cable and hose routing", "Internal or external for the rear brake, shifter and dropper; where the ports are; full-length housing guides."],
        ["tyre", "Tyre and chainring clearance", `${tyre ? `You plan ${tyre} tyres. ` : ""}Ask them to state the biggest tyre and chainring that fit (with mud room).`],
        ["mounts", "Bottle and accessory mounts", "How many, where (down tube, seat tube, under the down tube, top-tube bag), welded bosses or rivnuts."],
        ["rack", "Rack, mudguard and bag mounts", "If you want them: rack eyelets, mudguard mounts, a kickstand plate, frame-bag bosses."],
        ["finish", "Finish and logos", "Brushed, blasted or polished; how the logos are done and where; head badge; any colour (Cerakote, anodising)."],
        ["extras", "What's included", "Headset, seat collar, thru-axle, spare hanger, frame protection, bolts."]
      ];
      // bent tubes: a side-view drawing shows them only as curves, so ask for positions and radii (drawmatch.js wording)
      const bt = root.FrameDrawMatch && root.FrameDrawMatch.bendsText ? root.FrameDrawMatch.bendsText(d) : [];
      if (bt.length) items.splice(5, 0, ["bends", "Tube bends match your design", bt.join(" ") + " Ask for the position and radius of each bend on the drawing."]);
      const askItems = items.map(([id, title, detail]) => ({ id: "ask:" + id, title, detail }));
      out.push({ id: "confirm", title: "Confirm with the builder", intro: "Things a drawing often doesn't say clearly. Tick ✓ when you've found them on the drawing, or mark ? Ask.", items: askItems });
    }

    // 7. before you approve
    {
      const items = [
        { id: "ok:rev", title: "Drawing number and revision", detail: `Is this the latest revision, and does it show every change you've asked for so far?${rev.drawing.model ? ` (${rev.drawing.model})` : ""}` },
        { id: "ok:fit", title: "Fit numbers match what you wanted", detail: "Stack, reach, saddle height room and bar height against your current bike (use Compare or Overlay in Cyclic Labs)." }
      ];
      try {
        const res = resultFor(d);
        if (res && root.FrameChecks) root.FrameChecks.run(d, res).filter(r => r.status === "info" && /Small parts|Build quality/.test(r.group))
          .forEach(r => items.push({ id: "ok:" + r.item, title: r.item, value: r.target, detail: r.note, src: r.src }));
      } catch (e) {}
      items.push({ id: "ok:photos", title: "Photos before it ships", detail: "Ask for close-ups of every weld, the dropouts and the head tube before the frame is packed." });
      out.push({ id: "approve", title: "Before you approve", intro: "Ask for these in writing before you sign off the drawing.", items });
    }

    // 8. own items
    out.push({ id: "own", title: "Your own items", intro: "Anything else you want to ask or change.", items: rev.custom.map(c => ({ id: c.id, title: c.title, detail: "", numeric: false, custom: true })) });
    return out;
  }

  // effective state of an item (saved choice, else the suggestion)
  function stateOf(rev, it) {
    const s = rev.items[it.id] || {};
    const state = s.state !== undefined ? s.state : it.autoChange ? "change" : "";
    const want = s.want !== undefined && s.want !== "" ? s.want : it.suggestWant != null && state === "change" ? it.suggestWant : "";
    return { state, note: s.note || "", want };
  }

  // ---------------------------------------------------------------- the change request
  function requestText(rev) {
    const secs = sections(rev), changes = [], asks = [], oks = [];
    for (const sec of secs) for (const it of sec.items) {
      const s = stateOf(rev, it);
      const head = it.title + (it.value != null && it.value !== "" && !String(it.value).includes("→") ? `: drawn ${fmtN(it.value)}${it.unit && num(it.value) ? " " + it.unit : ""}` : "");
      if (s.state === "change") {
        let line = it.title;
        if (s.want !== "" && s.want != null) {
          const from = sec.id === "changes" ? String(it.value).split("→")[0].trim() : it.value;
          line += from != null && from !== "" && from !== "—" ? `: ${fmtN(from)} → ${fmtN(s.want)}${it.unit ? " " + it.unit : ""}` : `: please make it ${fmtN(s.want)}${it.unit ? " " + it.unit : ""}`;
        } else if (it.value != null && it.value !== "") line = head;
        changes.push(line + (s.note ? `\n   ${s.note.replace(/\n/g, "\n   ")}` : ""));
      } else if (s.state === "ask") {
        asks.push(head + (s.note ? `\n   ${s.note.replace(/\n/g, "\n   ")}` : sec.id === "confirm" ? `\n   ${it.detail}` : ""));
      } else if (s.state === "ok" && rev.includeOk) oks.push(head);
    }
    const ref = rev.drawing.model || rev.drawing.file || rev.designName;
    const subject = `Frame drawing ${ref}: ${changes.length ? changes.length + " change" + (changes.length > 1 ? "s" : "") : ""}${changes.length && asks.length ? " and " : ""}${asks.length ? asks.length + " question" + (asks.length > 1 ? "s" : "") : ""}${!changes.length && !asks.length ? "approved" : ""}`;
    const L = [];
    L.push("Hi,", "");
    L.push(`Thanks for the drawing${rev.drawing.model ? " " + rev.drawing.model : ""}${rev.drawing.file && !(rev.drawing.model && rev.drawing.file.includes(rev.drawing.model)) ? ` (${rev.drawing.file})` : ""}. I've gone through it${changes.length || asks.length ? " and have the following:" : " and it all looks right to me."}`);
    const list = (title, arr) => { if (!arr.length) return; L.push("", title, ""); arr.forEach((x, i) => L.push(`${i + 1}. ${x}`)); };
    list("CHANGES, PLEASE", changes);
    list("QUESTIONS", asks);
    list("CHECKED AND OK", oks);
    L.push("");
    if (changes.length || asks.length) L.push(changes.length ? "Could you send an updated drawing with these changes? Everything else looks right to me." : "Everything else looks right to me.");
    else L.push("Please go ahead.");
    L.push("", "Thanks,", rev.who || "");
    return { subject, body: L.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", changes: changes.length, asks: asks.length };
  }

  // ---------------------------------------------------------------- UI
  const css = `
  dialog.rv { width: min(1040px, calc(100vw - 24px)); max-width: none; height: min(920px, calc(100vh - 24px)); max-height: none; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--ink); }
  dialog.rv::backdrop { background: rgba(10, 12, 16, .55); }
  .rv-wrap { display: flex; flex-direction: column; height: 100%; }
  .rv-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .rv-head h2 { font-size: 20px; flex: 1 1 260px; margin: 0; }
  .rv-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; padding: 10px 16px; border-bottom: 1px solid var(--line); font-size: 13.5px; align-items: center; }
  .rv-meta label { display: flex; gap: 6px; align-items: center; }
  .rv-meta input { width: 200px; max-width: 100%; }
  .rv-prog { flex: 1 1 220px; display: flex; flex-direction: column; gap: 4px; }
  .rv-prog .track { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
  .rv-prog .fill { height: 100%; background: var(--accent); width: 0; transition: width .2s; }
  .rv-prog .t { color: var(--muted); font-size: 12.5px; }
  .rv-filter { display: flex; gap: 4px; }
  .rv-filter button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); }
  .rv-body { flex: 1; min-height: 0; overflow: auto; padding: 4px 16px 16px; }
  .rv-sec { margin-top: 14px; }
  .rv-sec > summary { list-style: none; cursor: pointer; display: flex; align-items: baseline; gap: 10px; padding: 6px 0; }
  .rv-sec > summary::-webkit-details-marker { display: none; }
  .rv-sec > summary h3 { margin: 0; font: 600 17px var(--font-display); }
  .rv-sec > summary::before { content: "▸"; color: var(--muted); transition: transform .15s; display: inline-block; }
  .rv-sec[open] > summary::before { transform: rotate(90deg); }
  .rv-sec > summary .n { color: var(--muted); font-size: 12.5px; }
  .rv-sec .intro { color: var(--muted); font-size: 13.5px; margin: 0 0 6px; }
  .rv-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; padding: 9px 10px; border: 1px solid var(--line); border-left: 3px solid var(--line); border-radius: 8px; margin: 6px 0; }
  .rv-item.flag-warn { border-left-color: var(--warn); } .rv-item.flag-bad { border-left-color: var(--bad); }
  .rv-item.st-ok { background: color-mix(in srgb, var(--ok) 6%, transparent); }
  .rv-item.st-change { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .rv-item.st-ask { background: color-mix(in srgb, var(--warn) 7%, transparent); }
  .rv-t { font-weight: 600; font-size: 14.5px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
  .rv-t .val { font: 500 13px var(--font-data); color: var(--ink); }
  .rv-d { color: var(--muted); font-size: 13px; margin-top: 2px; line-height: 1.4; }
  .rv-d a { color: var(--accent); }
  .rv-st { display: flex; gap: 4px; align-self: start; }
  .rv-st button { padding: 4px 9px; font-size: 13px; white-space: nowrap; }
  .rv-st button[data-s="ok"][aria-pressed="true"] { background: var(--ok); color: #fff; border-color: var(--ok); }
  .rv-st button[data-s="ask"][aria-pressed="true"] { background: var(--warn); color: #fff; border-color: var(--warn); }
  .rv-st button[data-s="change"][aria-pressed="true"] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .rv-x[hidden] { display: none; }
  .rv-x { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
  .rv-x .want { display: flex; gap: 6px; align-items: center; font-size: 13px; }
  .rv-x .want input { width: 110px; font-family: var(--font-data); }
  .rv-x textarea { flex: 1 1 300px; min-height: 38px; resize: vertical; font: inherit; font-size: 13.5px; padding: 6px 8px; }
  .rv-x .del { margin-left: auto; }
  .rv-add { display: flex; gap: 8px; margin-top: 8px; } .rv-add input { flex: 1; }
  .rv-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--line); }
  .rv-foot .sp { flex: 1; }
  .rv-out { display: flex; flex-direction: column; gap: 10px; height: 100%; }
  .rv-out input.subj { width: 100%; font-weight: 600; }
  .rv-out textarea { flex: 1; min-height: 260px; width: 100%; font: 13.5px/1.5 var(--font-data); padding: 10px; resize: none; }
  .rv-empty { padding: 30px 16px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center; }
  @media (max-width: 700px) {
    .rv-item { grid-template-columns: minmax(0, 1fr); }
    .rv-st { justify-self: start; }
    .rv-meta input { width: 100%; }
  }`;
  let dlg = null, rev = null, filter = "all", mode = "list";
  function ensureDialog() {
    if (dlg) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    dlg = document.createElement("dialog"); dlg.className = "rv"; dlg.setAttribute("aria-label", "Drawing checklist");
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => { if (rev) save(rev); });
  }

  function open(designId) {
    const A = App(); ensureDialog();
    const id = designId || A.currentId();
    rev = load(id);
    mode = "list";
    if (!rev) { renderStart(id); }
    else { rev.designName = A.designName(); render(); }
    if (!dlg.open) dlg.showModal();
  }

  function renderStart(id) {
    const A = App(), others = listAll().filter(r => r.designId !== id);
    dlg.innerHTML = `<div class="rv-wrap"><div class="rv-head"><h2>Drawing checklist</h2><button type="button" data-x>Close</button></div>
      <div class="rv-body"><div class="rv-empty">
        <p style="max-width:60ch">Go through your builder's drawing one item at a time: tick what's right, mark what to ask or change, add notes. When you're done, export it as an email to send back.</p>
        <p class="hint" style="max-width:60ch">Best started from <b>Scan a drawing</b>, which fills in every number on the drawing and flags the ones that differ from what you asked for. You can also start one for “${esc(A.designName())}” now: it lists the things to confirm and any changes you make from here on.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <button type="button" class="primary" data-scan>Scan a drawing…</button>
          <button type="button" data-plain>Start a checklist for this design</button>
        </div>
        ${others.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center"><label for="rvFrom" class="hint">Or carry on with the checklist from</label>
          <select id="rvFrom">${others.map(r => `<option value="${esc(r.designId)}">${esc(r.designName)}${r.drawing.model ? " · " + esc(r.drawing.model) : ""}</option>`).join("")}</select><button type="button" data-copy>Use it here</button></div>` : ""}
        <div><button type="button" data-load>Load a checklist file…</button><input type="file" accept=".json,application/json" hidden></div>
      </div></div></div>`;
    dlg.querySelector("[data-x]").onclick = () => dlg.close();
    dlg.querySelector("[data-scan]").onclick = () => { dlg.close(); root.FrameScanUI && root.FrameScanUI.open(); };
    dlg.querySelector("[data-plain]").onclick = () => { rev = fresh(id, A.designName(), A.design()); save(rev); render(); };
    const cp = dlg.querySelector("[data-copy]");
    if (cp) cp.onclick = () => { const src = load(dlg.querySelector("#rvFrom").value); if (!src) return; rev = Object.assign(clone(src), { designId: id, designName: A.designName() }); save(rev); render(); };
    wireLoad(id);
  }
  function wireLoad(id) {
    const b = dlg.querySelector("[data-load]"), fi = b && b.nextElementSibling; if (!b) return;
    b.onclick = () => fi.click();
    fi.onchange = async () => {
      const f = fi.files[0]; if (!f) return;
      try { const r = JSON.parse(await f.text()); if (!r || r.v !== 1 || !r.items) throw new Error("not a Cyclic Labs checklist file"); rev = Object.assign(r, { designId: id || App().currentId(), designName: App().designName() }); save(rev); mode = "list"; render(); }
      catch (e) { App().toast("Couldn't load that file: " + (e.message || e)); }
    };
  }

  function counts(secs) {
    let total = 0, done = 0, ch = 0, ask = 0;
    for (const s of secs) for (const it of s.items) { total++; const st = stateOf(rev, it).state; if (st) done++; if (st === "change") ch++; if (st === "ask") ask++; }
    return { total, done, ch, ask };
  }

  function render() {
    if (mode === "export") return renderExport();
    const secs = sections(rev), c = counts(secs);
    const openState = rev.openSecs || {};
    dlg.innerHTML = `<div class="rv-wrap">
      <div class="rv-head"><h2>Drawing checklist · ${esc(rev.designName)}</h2>
        <div class="rv-filter" role="group" aria-label="Show">
          <button type="button" data-f="all" aria-pressed="${filter === "all"}">All</button>
          <button type="button" data-f="todo" aria-pressed="${filter === "todo"}">Not done</button>
          <button type="button" data-f="send" aria-pressed="${filter === "send"}">To send</button>
        </div>
        <button type="button" data-x>Close</button></div>
      <div class="rv-meta">
        <label>Drawing no. <input id="rvModel" value="${esc(rev.drawing.model)}" placeholder="e.g. LV700-123456M"></label>
        <label>Your name <input id="rvWho" value="${esc(rev.who)}" placeholder="for the email sign-off"></label>
        <div class="rv-prog"><div class="track"><div class="fill" style="width:${c.total ? (c.done / c.total * 100).toFixed(1) : 0}%"></div></div>
          <div class="t" id="rvCount">${c.done} of ${c.total} gone through · ${c.ch} to change · ${c.ask} to ask</div></div>
      </div>
      <div class="rv-body" id="rvBody">${secs.map(s => secHtml(s, openState)).join("")}</div>
      <div class="rv-foot">
        <button type="button" data-save>Save checklist file</button>
        <button type="button" data-load>Load…</button><input type="file" accept=".json,application/json" hidden>
        <button type="button" data-reset title="Clear every tick and note in this checklist">Start over</button>
        <span class="sp"></span>
        <button type="button" class="primary" data-export>Export change request (${c.ch + c.ask})</button>
      </div></div>`;
    wire(secs);
  }

  function secHtml(s, openState) {
    const vis = s.items.filter(it => { const st = stateOf(rev, it).state; return filter === "all" || (filter === "todo" ? !st : st === "change" || st === "ask"); });
    if (!vis.length && filter !== "all") return "";
    const isOpen = openState[s.id] !== undefined ? openState[s.id] : !s.collapsed;
    const done = s.items.filter(it => stateOf(rev, it).state).length;
    return `<details class="rv-sec" data-sec="${s.id}"${isOpen ? " open" : ""}><summary><h3>${esc(s.title)}</h3><span class="n">${s.items.length ? `${done}/${s.items.length}` : ""}</span></summary>
      <p class="intro">${s.intro || ""}</p>
      ${vis.map(itemHtml).join("")}
      ${s.id === "own" ? `<div class="rv-add"><input id="rvNew" placeholder="Add an item, e.g. “Add a third bottle mount under the down tube”" aria-label="New item"><button type="button" data-add>Add</button></div>` : ""}
    </details>`;
  }

  function itemHtml(it) {
    const s = stateOf(rev, it);
    const showX = s.state === "ask" || s.state === "change" || s.note || it.custom;
    const val = it.value != null && it.value !== "" ? `<span class="val">${esc(fmtN(it.value))}${it.unit && num(it.value) ? " " + esc(it.unit) : ""}</span>` : "";
    const badge = it.badge ? `<span class="pill ${it.flag === "bad" ? "bad" : "warn"}">${esc(it.badge)}</span>` : "";
    const ph = s.state === "change" ? "What should change, and why (optional)" : s.state === "ask" ? "Your question for the builder" : "Note (optional)";
    return `<div class="rv-item${it.flag ? " flag-" + it.flag : ""}${s.state ? " st-" + s.state : ""}" data-id="${esc(it.id)}">
      <div><div class="rv-t">${esc(it.title)} ${val} ${badge}</div>${it.detail ? `<div class="rv-d">${esc(it.detail)}${it.src ? ` <a href="${esc(it.src)}" target="_blank" rel="noopener">source</a>` : ""}</div>` : ""}</div>
      <div class="rv-st" role="group" aria-label="${esc(it.title)}">
        <button type="button" data-s="ok" aria-pressed="${s.state === "ok"}" title="Looks right">✓<span class="lbl"> OK</span></button>
        <button type="button" data-s="ask" aria-pressed="${s.state === "ask"}" title="Ask the builder">?<span class="lbl"> Ask</span></button>
        <button type="button" data-s="change" aria-pressed="${s.state === "change"}" title="Ask for a change">✎<span class="lbl"> Change</span></button>
      </div>
      <div class="rv-x"${showX ? "" : " hidden"}>
        ${s.state === "change" && it.numeric ? `<label class="want">Change to <input type="text" inputmode="decimal" data-want value="${esc(s.want)}" placeholder="${it.suggestWant != null ? esc(fmtN(it.suggestWant)) : "value"}">${esc(it.unit || "")}</label>` : ""}
        <textarea data-note rows="1" placeholder="${ph}" aria-label="Note for ${esc(it.title)}">${esc(s.note)}</textarea>
        ${it.custom ? `<button type="button" class="del" data-del title="Remove this item">Remove</button>` : ""}
      </div>
    </div>`;
  }

  function setItem(id, patch) { rev.items[id] = Object.assign({}, rev.items[id] || {}, patch); rev.updated = new Date().toISOString(); save(rev); }
  function updateCount() {
    const c = counts(sections(rev)), t = dlg.querySelector("#rvCount"), f = dlg.querySelector(".rv-prog .fill"), b = dlg.querySelector("[data-export]");
    if (t) t.textContent = `${c.done} of ${c.total} gone through · ${c.ch} to change · ${c.ask} to ask`;
    if (f) f.style.width = (c.total ? c.done / c.total * 100 : 0).toFixed(1) + "%";
    if (b) b.textContent = `Export change request (${c.ch + c.ask})`;
  }

  function wire(secs) {
    const byId = new Map(); secs.forEach(s => s.items.forEach(it => byId.set(it.id, it)));
    dlg.querySelector("[data-x]").onclick = () => dlg.close();
    dlg.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { filter = b.dataset.f; render(); });
    dlg.querySelector("#rvModel").oninput = e => { rev.drawing.model = e.target.value.trim(); save(rev); };
    dlg.querySelector("#rvWho").oninput = e => { rev.who = e.target.value; save(rev); };
    dlg.querySelectorAll(".rv-sec").forEach(d => d.addEventListener("toggle", () => { rev.openSecs = rev.openSecs || {}; rev.openSecs[d.dataset.sec] = d.open; save(rev); }));
    dlg.querySelectorAll(".rv-item").forEach(row => {
      const id = row.dataset.id, it = byId.get(id); if (!it) return;
      row.querySelectorAll("[data-s]").forEach(b => b.onclick = () => {
        const cur = stateOf(rev, it).state, next = cur === b.dataset.s ? "" : b.dataset.s;
        setItem(id, { state: next });
        if (filter !== "all") { render(); return; }
        const tmp = document.createElement("div"); tmp.innerHTML = itemHtml(it); const nr = tmp.firstElementChild;
        row.replaceWith(nr); wireOne(nr, it); updateCount();
        if (next === "ask" || next === "change") { const f = nr.querySelector("[data-want]") || nr.querySelector("[data-note]"); if (f) f.focus(); }
      });
      wireOne(row, it, true);
    });
    const add = dlg.querySelector("[data-add]"), inp = dlg.querySelector("#rvNew");
    if (add) { const go = () => { const v = inp.value.trim(); if (!v) return; const id = "own:" + Date.now().toString(36); rev.custom.push({ id, title: v }); setItem(id, { state: "change" }); render(); const n = dlg.querySelector(`.rv-item[data-id="${id}"] textarea`); if (n) n.focus(); };
      add.onclick = go; inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); go(); } }; }
    dlg.querySelector("[data-save]").onclick = () => download(fileBase() + " checklist.json", JSON.stringify(rev, null, 1), "application/json");
    wireLoad(rev.designId);
    dlg.querySelector("[data-reset]").onclick = () => {
      const b = dlg.querySelector("[data-reset]");
      if (b.dataset.armed) { rev.items = {}; rev.custom = []; save(rev); render(); return; }
      b.dataset.armed = "1"; b.textContent = "Click again to clear everything"; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Start over"; } }, 3000);
    };
    dlg.querySelector("[data-export]").onclick = () => { mode = "export"; render(); };
  }
  function wireOne(row, it, skipButtons) {
    const id = it.id;
    if (!skipButtons) row.querySelectorAll("[data-s]").forEach(b => b.onclick = () => {
      const cur = stateOf(rev, it).state, next = cur === b.dataset.s ? "" : b.dataset.s;
      setItem(id, { state: next });
      const tmp = document.createElement("div"); tmp.innerHTML = itemHtml(it); const nr = tmp.firstElementChild;
      row.replaceWith(nr); wireOne(nr, it); updateCount();
      if (next === "ask" || next === "change") { const f = nr.querySelector("[data-want]") || nr.querySelector("[data-note]"); if (f) f.focus(); }
    });
    const n = row.querySelector("[data-note]"); if (n) n.oninput = () => setItem(id, { note: n.value });
    const w = row.querySelector("[data-want]"); if (w) w.oninput = () => setItem(id, { want: w.value.trim() });
    const del = row.querySelector("[data-del]"); if (del) del.onclick = () => { rev.custom = rev.custom.filter(c => c.id !== id); delete rev.items[id]; save(rev); render(); };
  }

  function fileBase() { return (rev.drawing.model || rev.designName || "frame").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60); }
  function download(name, text, type) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function renderExport() {
    const r = requestText(rev);
    dlg.innerHTML = `<div class="rv-wrap">
      <div class="rv-head"><h2>Change request · ${esc(rev.designName)}</h2><button type="button" data-back>← Back to the checklist</button><button type="button" data-x>Close</button></div>
      <div class="rv-body" style="padding-top:12px"><div class="rv-out">
        <p class="hint" style="margin:0">${r.changes} change${r.changes === 1 ? "" : "s"} and ${r.asks} question${r.asks === 1 ? "" : "s"}. You can edit the text here before you send it. Edits here aren't saved back to the checklist.</p>
        <label class="hint" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="rvOk"${rev.includeOk ? " checked" : ""}> Also list the items I ticked as OK</label>
        <input class="subj" id="rvSubj" value="${esc(r.subject)}" aria-label="Subject">
        <textarea id="rvText" aria-label="Email text">${esc(r.body)}</textarea>
      </div></div>
      <div class="rv-foot">
        <button type="button" data-txt>Download .txt</button>
        <span class="sp"></span>
        <button type="button" data-mail title="Opens your email app with this text (long requests are copied instead)">Open in email</button>
        <button type="button" class="primary" data-copy>Copy text</button>
      </div></div>`;
    const subj = dlg.querySelector("#rvSubj"), txt = dlg.querySelector("#rvText");
    dlg.querySelector("[data-x]").onclick = () => dlg.close();
    dlg.querySelector("[data-back]").onclick = () => { mode = "list"; render(); };
    dlg.querySelector("#rvOk").onchange = e => { rev.includeOk = e.target.checked; save(rev); renderExport(); };
    const copy = async () => {
      const all = `Subject: ${subj.value}\n\n${txt.value}`;
      try { await navigator.clipboard.writeText(all); return true; }
      catch (e) { txt.focus(); txt.select(); try { return document.execCommand("copy"); } catch (e2) { return false; } }
    };
    dlg.querySelector("[data-copy]").onclick = async () => App().toast(await copy() ? "Copied. Paste it into your email to the builder." : "Couldn't copy here: select the text and copy it.");
    dlg.querySelector("[data-txt]").onclick = () => download(fileBase() + " change request.txt", `Subject: ${subj.value}\n\n${txt.value}`);
    dlg.querySelector("[data-mail]").onclick = async () => {
      const url = `mailto:?subject=${encodeURIComponent(subj.value)}&body=${encodeURIComponent(txt.value)}`;
      if (url.length > 1900) { const ok = await copy(); App().toast(ok ? "Too long for an email link, so it's copied: start a new email and paste." : "Too long for an email link: copy the text instead."); return; }
      location.href = url;
    };
  }

  // ---------------------------------------------------------------- from the scanner
  // info: { designId, designName, file, model, baseName, fields: { path: { label, unit, value, conf, asked } }, snapshot }
  function startFromScan(info) {
    const rv = fresh(info.designId, info.designName, info.snapshot);
    rv.drawing = { file: info.file || "", model: info.model || "" };
    rv.drawn = { baseName: info.baseName || "", fields: info.fields };
    const old = load(info.designId); if (old && old.who) rv.who = old.who;
    try { const any = listAll().find(r => r.who); if (any && !rv.who) rv.who = any.who; } catch (e) {}
    save(rv);
    open(info.designId);
  }

  // ---------------------------------------------------------------- chat: "open the checklist"
  function chat(raw, text) {
    const t = String(text || raw).toLowerCase();
    if (/\b(drawing )?(check ?list|review)\b/.test(t) && /\b(open|show|start|drawing|review|change request)\b/.test(t) && !/builder checklist/.test(t)) { setTimeout(() => open(), 0); return "Opening the **drawing checklist**."; }
    return null;
  }
  if (root.FrameChat && Array.isArray(root.FrameChat.extra)) root.FrameChat.extra.push(chat);

  // tour stop, right after the scan button in the basics tour
  try {
    const L = root.FrameTour && root.FrameTour.TOURS && root.FrameTour.TOURS.basics;
    if (L && !L.some(s => s.sel === "#btnReview")) {
      const i = L.findIndex(s => s.sel === "#btnScan");
      L.splice(i >= 0 ? i + 1 : L.length, 0, { sel: "#btnReview", title: "Drawing checklist", text: "Going through your builder's drawing? The checklist lists every number it shows (flagging ones that differ from what you asked for), the things to confirm, and Cyclic Labs' checks. Tick each one ✓, ? Ask or ✎ Change, add notes, then export it as an email to send back." });
    }
  } catch (e) {}

  root.FrameReview = { open, startFromScan, requestText, sections, load, _rev: () => rev };
})(typeof window !== "undefined" ? window : globalThis);
