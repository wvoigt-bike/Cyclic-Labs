// ============================================================================
//  FORK SAG (sag.js) — what a hardtail's geometry really is once you sit on it.
//  window.FrameSag.
//
//  The frame numbers you type (stack, reach, head and seat angle, BB drop) are "as drawn": the frame level, the fork
//  at its full axle-to-crown. When you sit on a hardtail the fork sinks into its sag (usually 15–30 % of its travel)
//  while the rear only squashes the tyre, so the whole bike tips forward around the rear wheel: the head and seat
//  angles get steeper, the BB drops, trail shrinks, and the bars come down relative to the saddle.
//
//  How it is worked out (plain geometry, no guesses):
//   1. the fork gets shorter by sag % × travel along the steering axis (the front axle moves up toward the crown);
//   2. the bike is stood on flat ground: the ground line is the line touching the bottom of both tyres;
//   3. every point is turned by the angle between that line and the frame's own horizontal (the "pitch").
//   Head angle and seat angle simply grow by the pitch; stack, reach, BB height, trail, wheelbase and the saddle/bar
//   positions are measured again against the new ground. "Static" (0 % sag) is the bike standing with no rider: it
//   equals "as drawn" when the fork length matches the frame's level stance (Geometry numbers → "Front axle height
//   vs level" = 0).
//
//  Setting: design.use.forkSag (% of fork travel, default 25). Travel = design.use.forkTravel (0 = rigid: no sag).
//
//  compute(design, sagPct)  → { ok, rigid, travel, sagPct, sagMm, a2c, pitch, headAngle, seatAngle, stack, reach,
//                               bbHeight, trail, wheelbase, frontCentre, saddleGround, handDrop, saddleToHands, lines }
//  table(design, sagPct)    → rows for the window / checklist / chat: [{ k, label, unit, drawn, static, sag, dp }]
//  sweep(design, list)      → compute() for several sag values (default 0, 10, 15, 20, 25, 30, 35, 40)
//  svg(design, sagPct)      → side view: the bike standing still (grey) and at sag (colour) on the same ground
//  advice(travel)           → the usual sag ranges for a hardtail fork
//  chat                     → design-chat handler (FrameChat.early): "fork sag 25%", "head angle at 30% sag",
//                             "compare sag", "how much sag should I run", "open sag", "show at sag", "show it level"
// ============================================================================
(function (root) {
  "use strict";
  const D2R = Math.PI / 180;
  const num = (v, d) => (v === "" || v == null || !isFinite(+v)) ? d : +v;
  const r0 = v => Math.round(v), r1 = v => Math.round(v * 10) / 10;
  const DEFAULT_SAG = 25;
  const SWEEP = [0, 10, 15, 20, 25, 30, 35, 40];
  const RANGES = [
    { name: "XC / racing", lo: 15, hi: 20, note: "firm, efficient, steering stays sharp" },
    { name: "Trail", lo: 20, hi: 25, note: "the usual hardtail setting" },
    { name: "Aggressive / enduro hardtail", lo: 25, hi: 30, note: "plusher, slacker-feeling front, more pedal strikes" }
  ];
  function advice(travel) {
    return RANGES.map(r => ({ ...r, mmLo: travel ? r1(travel * r.lo / 100) : 0, mmHi: travel ? r1(travel * r.hi / 100) : 0 }));
  }

  // rotate a frame-coordinate point [x, y] by −a (radians): makes a line at angle a horizontal
  const rot = (p, a) => [p[0] * Math.cos(a) + p[1] * Math.sin(a), -p[0] * Math.sin(a) + p[1] * Math.cos(a)];

  // the bike standing on flat ground with the fork `shorten` mm shorter than designed
  function stance(design, shorten) {
    const FEA = root.FrameFEA, g = Object.assign({}, design.geometry);
    g.forkA2C = num(g.forkA2C, 0) - shorten;
    const G = FEA.buildGeometry(g, design.tubes || {}), P = G.P, I = G.info;
    const Ar = [P.AxleR[0], P.AxleR[1]], Af = [P.AxleF[0], P.AxleF[1]], R = I.rearTyreR, Rf = I.frontTyreR;
    const dx = Af[0] - Ar[0], dy = Af[1] - Ar[1], d = Math.hypot(dx, dy);
    // ground = the line under both tyres: its angle in frame coordinates
    const a = Math.atan2(dy, dx) - Math.asin(Math.max(-1, Math.min(1, (Rf - R) / d)));
    const groundY = rot(Ar, a)[1] - R;
    // T: frame point → [x along the ground (BB = 0), height above the ground]
    const T = p => { const q = rot([p[0], p[1]], a); return [q[0], q[1] - groundY]; };
    return { g, G, P, I, a, groundY, T, R, Rf };
  }

  // saddle top and hands (where fit is measured) in frame coordinates
  function riderPoints(design) {
    const g = design.geometry, sa = num(g.seatAngle, 74) * D2R, SH = num(g.saddleHeight, 740);
    const saddle = [-Math.cos(sa) * SH, Math.sin(sa) * SH];
    let hands = null;
    const F = root.FrameFit32;
    if (F && F.points && F.cockpitOf) {
      try {
        const ck = F.cockpitOf(design);
        const pts = F.points({ reach: +g.reach, stack: +g.stack, headAngle: +g.headAngle, ...ck });
        hands = { hand: pts.hand, clamp: pts.clamp, stemC: pts.stemC, stemTop: pts.stemTop, base: pts.base, barType: ck.barType };
      } catch (e) { hands = null; }
    }
    return { saddle, hands };
  }

  function compute(design, sagPct) {
    const use = design.use || {}, g = design.geometry;
    const travel = Math.max(0, num(use.forkTravel, 0)), rigid = travel < 1;
    const pct = rigid ? 0 : Math.max(0, Math.min(60, num(sagPct, num(use.forkSag, DEFAULT_SAG))));
    const sagMm = travel * pct / 100;
    let S;
    try { S = stance(design, sagMm); } catch (e) { return { ok: false, error: e.message, rigid, travel, sagPct: pct, sagMm }; }
    const { P, I, a, T, Rf } = S;
    const ha = num(g.headAngle, 65) + a / D2R, sa = num(g.seatAngle, 74) + a / D2R;
    const H = T(P.HTtop), Af = T(P.AxleF), Ar = T(P.AxleR), BB = T([0, 0]);
    const off = num(g.forkOffset, 44);
    const trail = (Rf * Math.cos(ha * D2R) - off) / Math.sin(ha * D2R);
    const rp = riderPoints(design), Sd = T(rp.saddle), Hd = rp.hands ? T(rp.hands.hand) : null;
    return {
      ok: true, rigid, travel, sagPct: pct, sagMm, a2c: num(g.forkA2C, 0) - sagMm,
      pitch: a / D2R,                          // + = frame tipped nose-down compared with "as drawn"
      headAngle: ha, seatAngle: sa,
      stack: H[1] - BB[1], reach: H[0] - BB[0],
      bbHeight: BB[1], trail, wheelbase: Af[0] - Ar[0], frontCentre: Af[0] - BB[0],
      saddleGround: Sd[1], handDrop: Hd ? Sd[1] - Hd[1] : NaN, saddleToHands: Hd ? Hd[0] - Sd[0] : NaN,
      frontAxle: Af, rearAxle: Ar, S, rp
    };
  }

  function sweep(design, list) { return (list || SWEEP).map(p => compute(design, p)); }

  // rows: as drawn (frame level, the numbers you typed) · static (standing, no rider) · at sag
  function table(design, sagPct) {
    const g = design.geometry, st = compute(design, 0), sg = compute(design, sagPct);
    if (!st.ok || !sg.ok) return { st, sg, rows: [] };
    let drawnInfo = null; try { drawnInfo = root.FrameFEA.buildGeometry(g, design.tubes || {}).info; } catch (e) {}
    const rp = st.rp, drawnHands = rp.hands ? rp.hands.hand : null;
    const rows = [
      { k: "headAngle", label: "Head angle", unit: "°", dp: 1, drawn: +g.headAngle, static: st.headAngle, sag: sg.headAngle },
      { k: "seatAngle", label: "Seat angle (effective)", unit: "°", dp: 1, drawn: +g.seatAngle, static: st.seatAngle, sag: sg.seatAngle },
      { k: "stack", label: "Stack", unit: "mm", dp: 0, drawn: +g.stack, static: st.stack, sag: sg.stack },
      { k: "reach", label: "Reach", unit: "mm", dp: 0, drawn: +g.reach, static: st.reach, sag: sg.reach },
      { k: "bbHeight", label: "BB height", unit: "mm", dp: 0, drawn: drawnInfo ? drawnInfo.bbHeight : NaN, static: st.bbHeight, sag: sg.bbHeight },
      { k: "trail", label: "Trail", unit: "mm", dp: 0, drawn: drawnInfo ? drawnInfo.trail : NaN, static: st.trail, sag: sg.trail },
      { k: "wheelbase", label: "Wheelbase", unit: "mm", dp: 0, drawn: drawnInfo ? drawnInfo.wheelbase : NaN, static: st.wheelbase, sag: sg.wheelbase },
      { k: "frontCentre", label: "Front centre", unit: "mm", dp: 0, drawn: drawnInfo ? drawnInfo.frontCentre : NaN, static: st.frontCentre, sag: sg.frontCentre },
      { k: "handDrop", label: "Saddle above the hands", unit: "mm", dp: 0, drawn: drawnHands ? rp.saddle[1] - drawnHands[1] : NaN, static: st.handDrop, sag: sg.handDrop },
      { k: "a2c", label: "Fork axle-to-crown", unit: "mm", dp: 0, drawn: +g.forkA2C, static: st.a2c, sag: sg.a2c }
    ].filter(r => isFinite(r.sag));
    return { st, sg, rows };
  }

  // ---------------------------------------------------------------- picture
  function svg(design, sagPct) {
    const st = compute(design, 0), sg = compute(design, sagPct);
    if (!st.ok || !sg.ok) return "";
    const pts = [];
    const draw = (c, cls) => {
      const { S } = c, P = S.P, G = S.G, T = S.T;
      const toS = p => { const q = T(p); pts.push(q); return [q[0], -q[1]]; };
      const line = (arr, k) => `<polyline class="${k}" points="${arr.map(p => toS(p).map(v => v.toFixed(1)).join(",")).join(" ")}"/>`;
      let s = "";
      const ax = T(P.AxleR), af = T(P.AxleF);
      s += `<circle class="sg-wheel" cx="${ax[0].toFixed(1)}" cy="${(-ax[1]).toFixed(1)}" r="${S.R.toFixed(1)}"/>`;
      s += `<circle class="sg-wheel" cx="${af[0].toFixed(1)}" cy="${(-af[1]).toFixed(1)}" r="${S.Rf.toFixed(1)}"/>`;
      pts.push([ax[0] - S.R, 0], [af[0] + S.Rf, 0], [ax[0], ax[1] + S.R], [af[0], af[1] + S.Rf]);
      s += line(G.seatTubeLine, "sg-tube") + line(G.downTubeLine, "sg-tube") + line([P.TTst, P.TTht], "sg-tube") + line([P.HTtop, P.HTbot], "sg-tube sg-ht");
      s += line(G.chainstayLine, "sg-stay") + line(G.seatStayLine, "sg-stay");
      s += line([P.Crown, P.AxleF], "sg-fork");
      const rp = c.rp;
      s += line([P.STtop, rp.saddle], "sg-post");
      const sd = toS(rp.saddle); s += `<line class="sg-saddle" x1="${(sd[0] - 70).toFixed(1)}" y1="${sd[1].toFixed(1)}" x2="${(sd[0] + 75).toFixed(1)}" y2="${sd[1].toFixed(1)}" transform="rotate(${(-c.pitch).toFixed(2)} ${sd[0].toFixed(1)} ${sd[1].toFixed(1)})"/>`;
      if (rp.hands) { s += line([P.HTtop, rp.hands.stemC, rp.hands.clamp], "sg-post"); const h = toS(rp.hands.hand); s += `<circle class="sg-hand" cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="9"/>`; }
      const bb = toS([0, 0]); s += `<circle class="sg-bb" cx="${bb[0].toFixed(1)}" cy="${bb[1].toFixed(1)}" r="12"/>`;
      return `<g class="${cls}">${s}</g>`;
    };
    // both drawn on the same ground with the rear axle in the same place
    const shift = c => c.S.T(c.S.P.AxleR)[0];
    const sx = shift(st) - shift(sg);
    let body = draw(st, "sg-static");
    body += `<g transform="translate(${sx.toFixed(1)} 0)">${draw(sg, "sg-sag")}</g>`;
    const xs = pts.map(p => p[0]), ys = pts.map(p => -p[1]);
    const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30 + Math.abs(sx), y0 = Math.min(...ys) - 30, y1 = 40;
    body = `<line class="sg-ground" x1="${x0.toFixed(0)}" y1="0" x2="${x1.toFixed(0)}" y2="0"/>` + body;
    return `<svg class="sg-svg" viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}" role="img" aria-label="Side view of the bike standing still and at sag">${body}</svg>`;
  }

  // ---------------------------------------------------------------- design chat (FrameChat.early)
  // Runs early so "head angle at 30% sag" is not read as "head angle 30". Only sentences with the word sag.
  const fmt = (v, u, dp) => (dp ? r1(v).toFixed(1) : String(r0(v))) + (u === "°" ? "°" : " " + u);
  function summaryLines(design, pct) {
    const T = table(design, pct);
    if (!T.rows.length) return "";
    const pick = ["headAngle", "seatAngle", "bbHeight", "trail", "stack", "reach", "handDrop"];
    return T.rows.filter(r => pick.includes(r.k)).map(r => `• ${r.label}: ${fmt(r.static, r.unit, r.dp)} standing → **${fmt(r.sag, r.unit, r.dp)}** at sag`).join("\n");
  }
  function chat(raw0, t0, ctx) {
    const t = String(t0 || "").toLowerCase().trim();
    if (!ctx || !ctx.App) return null;
    // the main view: tipped to the sag, or back to level ("as drawn")
    const A = ctx.App;
    if (A.showAtSag && /^(show|view|draw|put)( me)?( the bike| it| the view)?( back)? (level|as drawn|static|standing( still)?|unsagged)( again)?$|^(level|static|as drawn) view$|^(stop showing|hide|turn off|switch off)( the)? sag( view)?$|^sag view off$/.test(t)) {
      if (!A.showAtSag()) return "The main view already shows the bike level (as drawn).";
      A.showAtSag(false); return "The main view shows the bike level again (as drawn). `show at sag` tips it forward.";
    }
    if (A.showAtSag && /^(show|view|draw|tip|put)( me)?( the bike| it| the view)? (at|in|to|with)( its| my| the)? (fork )?sag( view)?$|^(sag|sagged) view( on)?$|^tip (the bike|it) (forward|to (the )?sag)$|^(turn on|switch on|show)( the)? sag view$/.test(t)) {
      const d0 = A.design(); if (!(+(d0.use || {}).forkTravel > 0)) return "This bike has a **rigid fork**, so there's no sag to show.";
      A.showAtSag(true); const c = compute(d0); const c0 = compute(d0, 0);
      return `The main view now shows the bike **at ${r1(c.sagPct)} % sag**: fork ${r0(c.sagMm)} mm shorter, tipped ${r1(c.pitch - c0.pitch).toFixed(1)}° forward (both the analysis and realistic views). \`show it level\` puts it back; the strength results don't change.`;
    }
    if (!/\bsag(ged|s)?\b/.test(t)) return null;
    if (/\b(ask|question|builder|note)\b/.test(t)) return null;
    const d = ctx.App.design && ctx.App.design(); if (!d) return null;
    const use = d.use || {}, travel = Math.max(0, num(use.forkTravel, 0));
    const openWin = () => setTimeout(() => { try { root.FrameJourney && root.FrameJourney.go && root.FrameJourney.go("design"); root.FrameJourney && root.FrameJourney.open && root.FrameJourney.open("w-sag"); } catch (e) {} }, 30);
    if (travel < 1) return "This bike has a **rigid fork**, so there's no fork sag to model (only the tyres squash). Pick a suspension fork first, e.g. `120 mm fork`, then try `fork sag 25%`.";
    const cur = num(use.forkSag, DEFAULT_SAG);
    // advice
    if (/\b(how much|what|recommended|should i|ideal|right|normal|typical)\b.*\bsag\b/.test(t) && !/\d/.test(t)) {
      const a = advice(travel);
      return `Usual hardtail sag for a ${travel} mm fork:\n` + a.map(r => `• ${r.name}: ${r.lo}–${r.hi} % (${r.mmLo}–${r.mmHi} mm), ${r.note}`).join("\n") +
        `\nYour fork maker's setup chart has the final word. You're modelling **${cur} %** now; \`fork sag 20%\` changes it, \`compare sag\` shows every setting.`;
    }
    // sweep
    if (/\b(compare|sweep|range|table|every|all|different|each)\b/.test(t) && !/\d/.test(t)) {
      const L = sweep(d);
      openWin();
      return `**Geometry at different fork sag** (${travel} mm fork):\n` + L.map(c => `• ${c.sagPct} % (${r0(c.sagMm)} mm): head ${r1(c.headAngle).toFixed(1)}°, seat ${r1(c.seatAngle).toFixed(1)}°, BB ${r0(c.bbHeight)} mm, trail ${r0(c.trail)} mm`).join("\n") +
        "\n_Opened **Fork sag** to see it drawn._";
    }
    // a number: "25%", "25 %", "30 mm of sag"
    let pct = null, m;
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(%|percent|pc\b)/))) pct = +m[1];
    else if ((m = t.match(/(\d+(?:\.\d+)?)\s*mm\b/))) pct = +m[1] / travel * 100;
    else if ((m = t.match(/\bsag\b\D{0,12}(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\D{0,6}\bsag\b/))) pct = +(m[1] || m[2]);
    if (pct != null && !(pct >= 0 && pct <= 60)) return `Sag is a share of the fork's travel: something between 0 and about 40 %. (${r0(pct)} % doesn't make sense for a ${travel} mm fork.)`;
    const isQuestion = /\?$|^(what|how|show|whats|what's|tell me|give me|list)\b|\b(at|with|on)\s+\d+(\.\d+)?\s*(%|percent|mm)/.test(t) && !/^(set|make|change|use|run|put)\b/.test(t);
    if (pct != null && !isQuestion) {
      const f = ctx.fld ? ctx.fld("use.forkSag") : (ctx.fields ? ctx.fields().find(x => x.id === "use.forkSag") : null);
      if (!f || !ctx.apply) return null;
      const out = ctx.apply([{ f, v: r1(pct) }], "fork sag");
      return out + "\n" + summaryLines(ctx.App.design(), r1(pct)) + "\n_Open **Fork sag** to see the bike tip forward; `compare sag` lists every setting._";
    }
    const p = pct != null ? pct : cur;
    if (/^(open|show|go to|bring up)?\s*(the |my )?(fork )?sag( window| geometry| numbers)?$|^(sagged|sag) geometry$|^geometry (at|with) sag$/.test(t) || pct != null || /\bat sag\b|\bsagged\b|\bwith sag\b|\bunder sag\b/.test(t)) {
      openWin();
      const c = compute(d, p);
      return `**At ${r1(p)} % sag** (${r0(c.sagMm)} mm of your ${travel} mm fork) the bike tips **${r1(c.pitch - compute(d, 0).pitch).toFixed(1)}°** forward:\n` + summaryLines(d, p) +
        (pct != null && Math.abs(pct - cur) > 0.05 ? `\n_Shown for ${r1(pct)} %; you're modelling ${cur} %. \`set fork sag to ${r1(pct)}%\` makes it the setting._` : "\n_Opened **Fork sag**. `fork sag 20%` changes it; `compare sag` lists 0–40 %._");
    }
    return null;
  }
  function hook() { const FC = root.FrameChat; if (FC && !FC._sagHooked) { FC.early = (FC.early || []).concat([chat]); FC._sagHooked = true; } }
  if (root.FrameChat) hook();
  else if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", hook);

  root.FrameSag = { compute, table, sweep, svg, advice, chat, DEFAULT_SAG, SWEEP, RANGES };
  if (typeof module !== "undefined" && module.exports) module.exports = root.FrameSag;
})(typeof window !== "undefined" ? window : globalThis);
